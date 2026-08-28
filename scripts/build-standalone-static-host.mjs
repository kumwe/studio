import { createHash } from 'node:crypto';
import { copyFile, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderStudioWeb } from '@kumwe/studio-renderer-web';
import { build } from 'vite';
import { buildStudioBrowserAssets } from './studio-browser-artifacts.mjs';
import {
  assertReleaseRuntimeAsset,
  contentHashedAssetName,
  minifyReleaseCss,
  minifyReleaseJavaScript,
  releaseAssetIdentity,
  releaseRuntimeAssetRecord,
} from './release-asset-policy.mjs';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const exampleRoot = join(repositoryRoot, 'examples', 'standalone-static-host');
const outputArgument = argumentValue('--out-dir');
const outputDirectory =
  outputArgument === undefined ? join(exampleRoot, 'dist') : resolve(outputArgument);
const browserDistribution = await buildStudioBrowserAssets(new URL('../', import.meta.url));
const browserModulePath = join(browserDistribution.directory, browserDistribution.entryPoint);
const browserModuleName = browserDistribution.entryPoint;
const session = JSON.parse(
  await readFile(
    join(repositoryRoot, 'schemas', 'examples', 'authoring-session.example.json'),
    'utf8',
  ),
);

await rm(outputDirectory, { force: true, recursive: true });
await build({
  base: './',
  build: {
    chunkSizeWarningLimit: 600,
    emptyOutDir: true,
    manifest: 'build-manifest.json',
    minify: true,
    outDir: outputDirectory,
    rolldownOptions: {
      external: ['@kumwe/studio-internal/browser-entry'],
      output: {
        assetFileNames: 'assets/studio-[name]-[hash][extname]',
        chunkFileNames: 'assets/studio-[name]-[hash].js',
        entryFileNames: 'assets/studio-[name]-[hash].js',
        paths: {
          '@kumwe/studio-internal/browser-entry': `./${basename(browserModuleName)}`,
        },
      },
    },
    sourcemap: false,
  },
  configFile: false,
  define: {
    __STUDIO_STATIC_SESSION__: JSON.stringify(session),
  },
  logLevel: 'warn',
  root: exampleRoot,
});
await copyFile(browserModulePath, join(outputDirectory, browserModuleName));

const bundlerManifestPath = join(outputDirectory, 'build-manifest.json');
const bundlerManifest = JSON.parse(await readFile(bundlerManifestPath, 'utf8'));
let entry = Object.values(bundlerManifest).find((candidate) => candidate.isEntry === true);
if (entry === undefined || typeof entry.file !== 'string') {
  throw new Error('The standalone build did not emit one browser entry point.');
}
entry = await normalizeViteRuntimeAssets(outputDirectory, bundlerManifest, entry);

const rendered = await renderStudioWeb(
  {
    roots: [
      {
        authoring: { mode: 'content' },
        bindings: {
          content: {
            onError: 'error',
            onNull: 'empty',
            source: { fieldPath: ['name'], kind: 'entry-field' },
            transforms: [],
          },
        },
        id: 'static-public-content',
        properties: {},
        slots: {},
        type: 'studio.core/rich-text',
        version: '1.0.0',
      },
    ],
  },
  {
    resolveBinding: () => ({
      content: [
        {
          content: [{ text: String(session.state.entry.values.name), type: 'text' }],
          type: 'paragraph',
        },
      ],
      type: 'doc',
    }),
  },
);
const publicCss = Buffer.from(rendered.css, 'utf8');
const publicStyleSheet = `assets/${contentHashedAssetName('studio-public', publicCss, '.css')}`;
const publicStyleIdentity = releaseAssetIdentity(publicCss);
await writeFile(join(outputDirectory, publicStyleSheet), publicCss);
await writeFile(
  join(outputDirectory, 'public.html'),
  `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="description" content="Public Studio content rendered before deployment">
    <link rel="stylesheet" crossorigin="anonymous" integrity="${publicStyleIdentity.integrity}" href="./${publicStyleSheet}">
    <title>Pre-rendered Studio content</title>
  </head>
  <body>
    <main>${rendered.html}</main>
    <noscript>This content is complete and operable without browser JavaScript.</noscript>
  </body>
</html>
`,
  'utf8',
);

await injectSubresourceIntegrity(outputDirectory, entry, browserModuleName);
const release = JSON.parse(await readFile(join(repositoryRoot, 'studio-release.json'), 'utf8'));
const assetPaths = (await filesUnder(outputDirectory))
  .map((path) => relative(outputDirectory, path).split(sep).join('/'))
  .filter((path) => path !== 'studio-assets.json')
  .sort((left, right) => left.localeCompare(right));
const assets = await Promise.all(
  assetPaths.map(async (path) => {
    const content = await readFile(join(outputDirectory, path));
    return {
      ...(await staticAssetRecord(content, path, entry.file, {
        browserModuleName,
        publicStyleSheet,
      })),
    };
  }),
);
const deploymentManifest = {
  assets,
  authoring: {
    document: 'index.html',
    entryPoint: entry.file,
  },
  kind: 'studio-static-assets',
  productionRuntime: {
    forbidden: ['node', 'npm', 'npx', 'vite', 'server-side-javascript'],
    requires: [],
    servingModel: 'static-files',
  },
  publicRenderer: {
    document: 'public.html',
    requiresJavaScript: false,
    styleSheet: publicStyleSheet,
  },
  release: {
    corpusManifestDigest: release.corpusManifestDigest,
    version: release.release,
  },
  schemaVersion: 1,
};
await writeFile(
  join(outputDirectory, 'studio-assets.json'),
  `${JSON.stringify(deploymentManifest, null, 2)}\n`,
  'utf8',
);

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  const value = process.argv[index + 1];
  if (value === undefined || value.startsWith('--')) {
    throw new TypeError(`${name} requires a directory.`);
  }
  return value;
}

async function filesUnder(directory) {
  const result = [];
  for (const name of await readdir(directory)) {
    const path = join(directory, name);
    const information = await stat(path);
    if (information.isDirectory()) result.push(...(await filesUnder(path)));
    else if (information.isFile()) result.push(path);
  }
  return result;
}

function assetRole(path, entryPoint, { browserModuleName, publicStyleSheet }) {
  if (path === browserModuleName) return 'browser-module';
  if (path === entryPoint) return 'authoring-entry';
  if (path === 'index.html') return 'authoring-document';
  if (path === 'public.html') return 'public-document';
  if (path === publicStyleSheet) return 'public-style';
  if (path === 'build-manifest.json') return 'build-map';
  if (extname(path) === '.css') return 'authoring-style';
  if (extname(path) === '.js') {
    throw new Error(`Unclassified static deployment JavaScript asset ${path}.`);
  }
  return 'browser-asset';
}

async function staticAssetRecord(content, path, entryPoint, context) {
  const role = assetRole(path, entryPoint, context);
  const policies = {
    'authoring-entry': { format: 'esm', policy: 'authoring-entry' },
    'authoring-style': { policy: 'authoring-style' },
    'browser-module': { format: 'esm', policy: 'authoring-browser-module' },
    'public-style': { policy: 'public-style' },
  };
  const runtime = policies[role];
  if (runtime !== undefined) {
    const asset = releaseRuntimeAssetRecord({
      bytes: content,
      mediaType: mediaType(path),
      path,
      policy: runtime.policy,
      role,
    });
    await assertReleaseRuntimeAsset(asset, content, {
      format: runtime.format,
      policy: runtime.policy,
    });
    return asset;
  }
  return {
    bytes: content.byteLength,
    integrity: `sha256-${createHash('sha256').update(content).digest('base64')}`,
    mediaType: mediaType(path),
    path,
    role,
  };
}

function mediaType(path) {
  switch (extname(path)) {
    case '.css':
      return 'text/css';
    case '.html':
      return 'text/html';
    case '.js':
      return 'text/javascript';
    case '.json':
      return 'application/json';
    default:
      return 'application/octet-stream';
  }
}

async function injectSubresourceIntegrity(directory, entry, externalModuleName) {
  const indexPath = join(directory, 'index.html');
  let html = await readFile(indexPath, 'utf8');
  const integrityFor = async (path) =>
    `sha256-${createHash('sha256')
      .update(await readFile(join(directory, path)))
      .digest('base64')}`;
  const entryIntegrity = await integrityFor(entry.file);
  html = html.replace(/<script type="module" crossorigin src="([^"]+)"><\/script>/u, (tag) =>
    tag.replace('crossorigin', `crossorigin="anonymous" integrity="${entryIntegrity}"`),
  );
  for (const stylePath of entry.css ?? []) {
    const styleIntegrity = await integrityFor(stylePath);
    html = html.replace(
      new RegExp(
        `<link rel="stylesheet" crossorigin href="(?:\\./)?${escapeRegExp(stylePath)}">`,
        'u',
      ),
      `<link rel="stylesheet" crossorigin="anonymous" integrity="${styleIntegrity}" href="./${stylePath}">`,
    );
  }
  const externalPath = externalModuleName;
  const externalIntegrity = await integrityFor(externalPath);
  const preload = `    <link rel="modulepreload" crossorigin="anonymous" integrity="${externalIntegrity}" href="./${externalPath}">\n`;
  html = html.replace('    <script type="module"', `${preload}    <script type="module"`);
  if (
    !html.includes(`integrity="${entryIntegrity}"`) ||
    !html.includes(`integrity="${externalIntegrity}"`)
  ) {
    throw new Error('The standalone HTML did not receive complete subresource integrity metadata.');
  }
  await writeFile(indexPath, html, 'utf8');
}

async function normalizeViteRuntimeAssets(directory, manifest, entry) {
  const indexPath = join(directory, 'index.html');
  let html = await readFile(indexPath, 'utf8');

  const originalEntry = entry.file;
  const entrySource = await readFile(join(directory, originalEntry), 'utf8');
  const entryBytes = Buffer.from(
    await minifyReleaseJavaScript(entrySource, {
      fileName: originalEntry,
      format: 'esm',
    }),
  );
  const entryPath = `assets/${contentHashedAssetName('studio-authoring', entryBytes, '.js')}`;
  await writeFile(join(directory, entryPath), entryBytes);
  if (entryPath !== originalEntry) await rm(join(directory, originalEntry));
  html = html.replaceAll(originalEntry, entryPath);
  entry.file = entryPath;

  const styles = [];
  for (const originalStyle of entry.css ?? []) {
    const styleBytes = minifyReleaseCss(await readFile(join(directory, originalStyle)), {
      fileName: originalStyle,
    });
    const stylePath = `assets/${contentHashedAssetName(
      'studio-authoring-style',
      styleBytes,
      '.css',
    )}`;
    await writeFile(join(directory, stylePath), styleBytes);
    if (stylePath !== originalStyle) await rm(join(directory, originalStyle));
    html = html.replaceAll(originalStyle, stylePath);
    styles.push(stylePath);
  }
  entry.css = styles;
  await writeFile(indexPath, html, 'utf8');
  await writeFile(
    join(directory, 'build-manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );
  return entry;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}
