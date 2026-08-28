import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { access, mkdtemp, readFile, readdir, realpath, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { get as httpGet, type IncomingHttpHeaders } from 'node:http';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

interface StaticAssetRecord {
  bytes: number;
  integrity: string;
  mediaType: string;
  path: string;
  role: string;
}

interface StaticAssetManifest {
  assets: StaticAssetRecord[];
  authoring: { document: string; entryPoint: string };
  kind: 'studio-static-assets';
  productionRuntime: {
    forbidden: string[];
    requires: string[];
    servingModel: 'static-files';
  };
  publicRenderer: {
    document: string;
    requiresJavaScript: false;
    styleSheet: string;
  };
  release: { corpusManifestDigest: string; version: string };
  schemaVersion: 1;
}

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const exampleRoot = join(repositoryRoot, 'examples', 'standalone-static-host');
let temporaryDirectory: string;
let documentRoot: string;
let outputDirectory: string;
let manifest: StaticAssetManifest;

beforeAll(async () => {
  temporaryDirectory = await mkdtemp(join(tmpdir(), 'studio-static-host-'));
  documentRoot = join(temporaryDirectory, 'document-root');
  outputDirectory = join(documentRoot, 'nested', 'studio');
  const result = spawnSync(
    process.execPath,
    [
      join(repositoryRoot, 'scripts', 'build-standalone-static-host.mjs'),
      '--out-dir',
      outputDirectory,
    ],
    { cwd: repositoryRoot, encoding: 'utf8' },
  );
  if (result.status !== 0) {
    throw new Error(`Static deployment build failed:\n${result.stdout}\n${result.stderr}`);
  }
  manifest = JSON.parse(
    await readFile(join(outputDirectory, 'studio-assets.json'), 'utf8'),
  ) as StaticAssetManifest;
}, 60_000);

afterAll(async () => {
  await rm(temporaryDirectory, { force: true, recursive: true });
});

describe('standalone static deployment', () => {
  it('emits a closed, integrity-pinned deployment with no production runtime requirement', async () => {
    expect(manifest).toMatchObject({
      kind: 'studio-static-assets',
      productionRuntime: {
        forbidden: ['node', 'npm', 'npx', 'vite', 'server-side-javascript'],
        requires: [],
        servingModel: 'static-files',
      },
      publicRenderer: { requiresJavaScript: false },
      schemaVersion: 1,
    });
    const deployedFiles = (await filesUnder(outputDirectory))
      .map((path) =>
        path
          .slice(outputDirectory.length + 1)
          .split(sep)
          .join('/'),
      )
      .filter((path) => path !== 'studio-assets.json')
      .sort((left, right) => left.localeCompare(right));
    expect(manifest.assets.map((asset) => asset.path)).toEqual(deployedFiles);
    for (const asset of manifest.assets) {
      const content = await readFile(join(outputDirectory, asset.path));
      expect(asset.bytes, asset.path).toBe(content.byteLength);
      expect(asset.integrity, asset.path).toBe(
        `sha256-${createHash('sha256').update(content).digest('base64')}`,
      );
    }
  });

  it('loads the host-neutral module without Node, npm, Vite, or bare-package imports', async () => {
    const document = await readFile(join(outputDirectory, manifest.authoring.document), 'utf8');
    const entry = await readFile(join(outputDirectory, manifest.authoring.entryPoint), 'utf8');
    const browserAsset = browserDistributionAsset();
    const browserModule = await readFile(join(outputDirectory, browserAsset.path), 'utf8');
    expect(document).toContain('src="./assets/studio-');
    expect(document).not.toMatch(/(?:href|src)="\/(?!\/)/u);
    expect(document.match(/integrity="sha256-[A-Za-z0-9+/]+={0,2}"/gu)).toHaveLength(3);
    expect(document.match(/crossorigin="anonymous"/gu)).toHaveLength(3);
    expect(entry.length).toBeGreaterThan(10_000);
    expect(entry).toMatch(/from"\.\/studio-browser-[a-f0-9]{16}\.js"/u);
    expect(entry).not.toMatch(/(?:from\s*|import\s*\()['"](?:node:|@kumwe\/|lit(?:\/|['"]))/u);
    expect(browserModule.length).toBeGreaterThan(100_000);
    expect(browserModule).not.toMatch(/\b(?:import|export)\s+(?:[^"'();]*?\sfrom\s*)?["']/u);
    expect(browserModule).not.toMatch(/\bimport\s*\(\s*["']/u);
    expect(browserModule).not.toMatch(/\brequire\s*\(/u);
    expect(browserModule).not.toContain('sessions/product-trail-backpack');
    expect(browserModule).not.toContain('users/static-host-author');
    expect(browserModule).not.toContain('products/trail-backpack');
    expect(entry).not.toContain('/src/');
    expect(entry).not.toContain('vite/client');
    expect(entry).not.toContain('process.versions.node');
    expect(entry).not.toMatch(/\brequire\s*\(/u);
  });

  it('ships public renderer output that remains complete with no browser script', async () => {
    const html = await readFile(join(outputDirectory, manifest.publicRenderer.document), 'utf8');
    const css = await readFile(join(outputDirectory, manifest.publicRenderer.styleSheet), 'utf8');
    expect(html).toContain('Trail Backpack');
    expect(html).toContain('data-studio-block="rich-text"');
    expect(html).toContain('<noscript>');
    expect(html).not.toMatch(/<script(?:\s|>)/iu);
    expect(css).toContain('[data-studio-block]');
  });

  it('serves the complete deployment from a process whose executable path contains no Node tooling', async () => {
    const python = await resolvePython();
    const server = spawn(
      python,
      [join(exampleRoot, 'serve.py'), '--root', documentRoot, '--port', '0', '--assert-zero-node'],
      {
        env: {
          LANG: 'C.UTF-8',
          PATH: join(temporaryDirectory, 'no-production-executables'),
          PYTHONDONTWRITEBYTECODE: '1',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    try {
      const { url } = await readyAddress(server);
      const deploymentUrl = `${url}/nested/studio`;
      const authoring = await request(`${deploymentUrl}/index.html`);
      const entry = await request(`${deploymentUrl}/${manifest.authoring.entryPoint}`);
      const browserAsset = browserDistributionAsset();
      const browserModule = await request(`${deploymentUrl}/${browserAsset.path}`);
      const publicPage = await request(`${deploymentUrl}/public.html`);
      expect(authoring.status).toBe(200);
      expect(authoring.headers['content-security-policy']).toContain("default-src 'self'");
      expect(authoring.body.toString('utf8')).toContain('kumwe-studio-contextual');
      expect(entry.status).toBe(200);
      expect(entry.headers['cache-control']).toContain('immutable');
      expect(entry.body.byteLength).toBeGreaterThan(10_000);
      expect(browserModule.status).toBe(200);
      expect(browserModule.headers['cache-control']).toContain('immutable');
      expect(browserModule.body.byteLength).toBeGreaterThan(100_000);
      expect(publicPage.status).toBe(200);
      expect(publicPage.body.toString('utf8')).toContain('Trail Backpack');
    } finally {
      server.kill('SIGTERM');
      await once(server, 'exit');
    }
  });
});

async function filesUnder(directory: string): Promise<string[]> {
  const result: string[] = [];
  for (const name of await readdir(directory)) {
    const path = join(directory, name);
    const information = await stat(path);
    if (information.isDirectory()) result.push(...(await filesUnder(path)));
    else if (information.isFile()) result.push(path);
  }
  return result;
}

async function readyAddress(server: ChildProcess): Promise<{ ready: true; url: string }> {
  if (server.stdout === null || server.stderr === null) {
    throw new Error('The static validation server requires piped output.');
  }
  const timeout = AbortSignal.timeout(10_000);
  let output = '';
  server.stdout.setEncoding('utf8');
  for await (const untypedChunk of server.stdout) {
    const chunk: unknown = untypedChunk;
    if (typeof chunk !== 'string') throw new TypeError('Expected UTF-8 server output.');
    output += chunk;
    const newline = output.indexOf('\n');
    if (newline !== -1) {
      return JSON.parse(output.slice(0, newline)) as { ready: true; url: string };
    }
    if (timeout.aborted) throw new Error('The static validation server did not become ready.');
  }
  const error = await streamText(server.stderr);
  throw new Error(`The static validation server exited before readiness: ${error}`);
}

async function resolvePython(): Promise<string> {
  const configured = process.env.STUDIO_STATIC_PYTHON;
  if (configured !== undefined) {
    await access(configured);
    return realpath(configured);
  }
  for (const candidate of ['/usr/bin/python3', '/usr/local/bin/python3']) {
    try {
      await access(candidate);
      return await realpath(candidate);
    } catch {
      // Continue to the next conventional absolute path.
    }
  }
  const discovered = spawnSync('python3', ['-c', 'import sys; print(sys.executable)'], {
    encoding: 'utf8',
  });
  if (discovered.status === 0 && discovered.stdout.trim().length > 0) {
    return realpath(discovered.stdout.trim());
  }
  throw new Error('Python 3 is required only for the zero-Node static-server validation lane.');
}

async function streamText(stream: NodeJS.ReadableStream): Promise<string> {
  let output = '';
  for await (const chunk of stream) output += String(chunk);
  return output;
}

function request(
  url: string,
): Promise<{ body: Buffer; headers: IncomingHttpHeaders; status: number | undefined }> {
  return new Promise((resolveRequest, rejectRequest) => {
    const requestHandle = httpGet(url, (response) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('end', () => {
        resolveRequest({
          body: Buffer.concat(chunks),
          headers: response.headers,
          status: response.statusCode,
        });
      });
    });
    requestHandle.on('error', rejectRequest);
  });
}

function browserDistributionAsset(): StaticAssetRecord {
  const asset = manifest.assets.find((candidate) =>
    /^assets\/studio-browser-[a-f0-9]{16}\.js$/u.test(candidate.path),
  );
  if (asset === undefined) {
    throw new Error('The deployment manifest has no fingerprinted Studio browser module.');
  }
  return asset;
}
