import { createHash } from 'node:crypto';
import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, join, posix, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'vite';

import {
  RELEASE_ARCHIVE_BUDGET_BYTES,
  assertReleaseRuntimeAsset,
  contentHashedAssetName,
  minifyReleaseJavaScript,
  releaseAssetIdentity,
  releaseRuntimeAssetRecord,
} from './release-asset-policy.mjs';
import {
  buildStudioEnhancementRuntimeAssets,
  enhancementRuntimeManifest,
} from './studio-enhancement-artifacts.mjs';

export const BROWSER_ARTIFACT_DIRECTORY = '.release-artifacts/browser';

export const SAME_ORIGIN_BROWSER_CSP = Object.freeze({
  headerTemplate:
    "default-src 'none'; script-src 'self'; require-trusted-types-for 'script'; trusted-types lit-html; style-src 'self' 'nonce-{{STYLE_NONCE}}'; img-src 'self' data:; font-src 'self'; connect-src 'self'; media-src 'self'; worker-src 'none'; frame-src 'none'; manifest-src 'none'; object-src 'none'; frame-ancestors 'self'; base-uri 'none'; form-action 'none'",
  inertConfigurationScript: Object.freeze({
    element: 'script',
    mediaType: 'application/json',
    requiresHash: false,
    requiresNonce: false,
  }),
  profile: 'same-origin-http',
  styleNonce: Object.freeze({
    minimumEntropyBits: 128,
    placeholder: '{{STYLE_NONCE}}',
    scope: 'response',
  }),
});

const MAX_BROWSER_ASSET_COUNT = 500;
const browserSchemaSeeds = Object.freeze([
  'authoring-http.schema.json',
  'studio-browser-assets.schema.json',
  'studio-deployment.schema.json',
]);

const browserDistributionReadme = `# Kumwe Studio prebuilt browser distribution

This directory is the complete, host-neutral Studio browser delivery. Serve it as immutable static files and
load the content-hashed ES module named by \`studio-assets.json\`. The npm package and release archive carry
that same immutable path and exact bytes. A production host does not
install or run Node.js, npm, Vite, or a JavaScript application server.

Start with these archive-local resources:

- [Browser deployment guide](docs/integration/prebuilt-browser-assets.md)
- [Configuration and mounting contract](docs/contracts/studio-deployment.md)
- [Deployment configuration schema](schemas/studio-deployment.schema.json)
- [Authoring HTTP request and response schema](schemas/authoring-http.schema.json)
- [Framework-neutral PHP 8.1+ reference](examples/php-authoring-host/README.md)

The \`schemas/\` directory contains the complete recursive local JSON Schema closure needed by the deployment
and authoring HTTP contracts. The PHP reference is source code and integration documentation, not a server
runtime bundled into Studio. It demonstrates how a PHP host emits one inert configuration per mount and
implements the authoritative request boundary while the same compiled browser module supports standalone,
hosted, and isolated multi-mount operation.

Verify every byte against \`studio-assets.json\` before activation. The detached checksum shipped beside the
release tar verifies the archive itself; the manifest then verifies each extracted file. The manifest's
\`contentSecurityPolicy\` member is the machine-checkable, exact same-origin PHP/HTTP policy template for the
archive and its inert deployment JSON.
`;

const browserExports = Object.freeze([
  'mountStudio',
  'mountStudioFromConfigElement',
  'autoMountStudio',
  'parseStudioDeploymentConfiguration',
  'resolveStudioDeploymentRuntime',
  'createBrowserHttpHostAdapter',
  'createCoreProductionBlockDefinitions',
  'createCoreProductionPatterns',
  'createStudioStandaloneRuntime',
  'defineKumweStudio',
  'defineKumweStudioContextual',
  'defineKumweStudioStandalone',
  'defineStudioBrowserElements',
  'mountStudioHosted',
  'mountStudioStandalone',
  'openContextualStudioSession',
]);

/** Build the host-neutral, self-contained ESM browser distribution. */
export async function buildStudioBrowserAssets(
  root = new URL('../', import.meta.url),
  outputDirectory,
) {
  const rootPath = fileURLToPath(root);
  const destination =
    outputDirectory ?? join(rootPath, 'packages', 'studio-lit', 'dist', 'browser');
  const entry = join(rootPath, 'packages', 'studio-lit', 'src', 'browser-entry.ts');

  await rm(destination, { force: true, recursive: true });
  await build({
    build: {
      emptyOutDir: true,
      lib: {
        entry,
        fileName: () => 'studio-browser.js',
        formats: ['es'],
      },
      minify: true,
      outDir: destination,
      rolldownOptions: {
        output: { codeSplitting: false },
      },
      sourcemap: false,
      target: 'es2022',
    },
    configFile: false,
    logLevel: 'warn',
    root: rootPath,
  });

  const modulePath = join(destination, 'studio-browser.js');
  const emittedModule = await readFile(modulePath, 'utf8');
  const minifiedModule = await minifyReleaseJavaScript(emittedModule, {
    fileName: 'studio-browser.js',
    format: 'esm',
  });
  await writeFile(modulePath, minifiedModule, 'utf8');
  const moduleBytes = Buffer.from(minifiedModule);
  const moduleSource = moduleBytes.toString('utf8');
  assertSelfContainedBrowserModule(moduleSource);
  const entryPoint = `assets/${contentHashedAssetName('studio-browser', moduleBytes, '.js')}`;
  await mkdir(join(destination, 'assets'), { recursive: true });
  await rename(modulePath, join(destination, entryPoint));

  const enhancementBuild = join(destination, '.enhancement-runtime-build');
  try {
    const enhancement = await buildStudioEnhancementRuntimeAssets(root, enhancementBuild);
    await mkdir(join(destination, 'assets'), { recursive: true });
    await cp(
      join(enhancement.directory, enhancement.entryPoint),
      join(destination, enhancement.entryPoint),
    );
  } finally {
    await rm(enhancementBuild, { force: true, recursive: true });
  }

  await copyBrowserDistributionSupport(rootPath, destination);
  await assertBrowserDistributionReferences(destination);

  const release = JSON.parse(await readFile(join(destination, 'studio-release.json'), 'utf8'));
  assertBrowserModuleReleaseIdentity(moduleSource, release);
  await writeBrowserAssetManifest(destination, entryPoint, release);
  return { directory: destination, entryPoint, release: release.release };
}

/** Fail the build if the compiled module and manifest source record can drift. */
export function assertBrowserModuleReleaseIdentity(moduleSource, releaseRecord) {
  if (
    typeof releaseRecord?.release !== 'string' ||
    typeof releaseRecord?.corpusManifestDigest !== 'string' ||
    !moduleSource.includes(releaseRecord.release) ||
    !moduleSource.includes(releaseRecord.corpusManifestDigest)
  ) {
    throw new TypeError(
      'The compiled Studio browser module does not carry its coordinated release identity.',
    );
  }
}

/**
 * Build a deterministic, versioned tar archive and detached SHA-256 file for
 * RC/stable release attachment. The npm package and archive retain the same
 * content-hashed module path and exact bytes.
 */
export async function buildStudioBrowserReleaseArtifact(
  root = new URL('../', import.meta.url),
  { artifactDirectory, packageOutputDirectory } = {},
) {
  const rootPath = fileURLToPath(root);
  const packageDirectory =
    packageOutputDirectory ?? join(rootPath, 'packages', 'studio-lit', 'dist', 'browser');
  const outputDirectory = artifactDirectory ?? join(rootPath, BROWSER_ARTIFACT_DIRECTORY);
  const built = await buildStudioBrowserAssets(root, packageDirectory);
  const prefix = `studio-browser-${built.release}`;
  const stagingParent = await mkdtemp(join(tmpdir(), 'studio-browser-release-'));
  const stagingRoot = join(stagingParent, prefix);

  try {
    await cp(packageDirectory, stagingRoot, { recursive: true });
    const moduleBytes = await readFile(join(stagingRoot, built.entryPoint));
    const fingerprintedEntry = `assets/${contentHashedAssetName(
      'studio-browser',
      moduleBytes,
      '.js',
    )}`;
    if (built.entryPoint !== fingerprintedEntry) {
      throw new Error('Studio npm browser module path is not its exact release content hash.');
    }
    const release = JSON.parse(await readFile(join(stagingRoot, 'studio-release.json'), 'utf8'));
    await writeBrowserAssetManifest(stagingRoot, fingerprintedEntry, release);

    await rm(outputDirectory, { force: true, recursive: true });
    await mkdir(outputDirectory, { recursive: true });
    const archiveBytes = await deterministicTar(stagingRoot, prefix);
    const sha256 = createHash('sha256').update(archiveBytes).digest('hex');
    const archiveName = `${prefix}-${sha256.slice(0, 16)}.tar`;
    const archivePath = join(outputDirectory, archiveName);
    await writeFile(archivePath, archiveBytes);

    const checksumName = `${archiveName}.sha256`;
    const checksumPath = join(outputDirectory, checksumName);
    await writeFile(checksumPath, `${sha256}  ${archiveName}\n`, 'utf8');
    const manifestBytes = await readFile(join(stagingRoot, 'studio-assets.json'));

    if (archiveBytes.byteLength > RELEASE_ARCHIVE_BUDGET_BYTES) {
      throw new Error(
        `Studio browser archive is ${archiveBytes.byteLength} bytes and exceeds its ` +
          `${RELEASE_ARCHIVE_BUDGET_BYTES}-byte publication budget.`,
      );
    }

    return browserArtifactFromBytes(archiveBytes, built.release, {
      assetManifestBytes: manifestBytes,
      checksumPath: repositoryPath(rootPath, checksumPath),
      path: repositoryPath(rootPath, archivePath),
    });
  } finally {
    await rm(stagingParent, { force: true, recursive: true });
  }
}

export function browserArtifactFromBytes(bytes, version, options = {}) {
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const sha512 = createHash('sha512').update(bytes).digest('hex');
  const path =
    options.path ??
    `${BROWSER_ARTIFACT_DIRECTORY}/studio-browser-${version}-${sha256.slice(0, 16)}.tar`;
  const checksumPath = options.checksumPath ?? `${path}.sha256`;
  const assetManifestBytes = options.assetManifestBytes ?? bytes;
  return {
    assetManifestSha256: createHash('sha256').update(assetManifestBytes).digest('hex'),
    budgetBytes: RELEASE_ARCHIVE_BUDGET_BYTES,
    checksumPath,
    integrity: `sha512-${Buffer.from(sha512, 'hex').toString('base64')}`,
    path,
    sha256,
    sha512,
    size: bytes.byteLength,
    version,
  };
}

export function assertApprovedBrowserArtifact(artifact, version) {
  if (
    artifact === null ||
    typeof artifact !== 'object' ||
    Array.isArray(artifact) ||
    artifact.version !== version ||
    !/^[a-f0-9]{64}$/u.test(artifact.sha256) ||
    !/^[a-f0-9]{128}$/u.test(artifact.sha512) ||
    !/^[a-f0-9]{64}$/u.test(artifact.assetManifestSha256) ||
    artifact.integrity !== `sha512-${Buffer.from(artifact.sha512, 'hex').toString('base64')}` ||
    !Number.isSafeInteger(artifact.size) ||
    artifact.size <= 0 ||
    artifact.budgetBytes !== RELEASE_ARCHIVE_BUDGET_BYTES ||
    artifact.size > artifact.budgetBytes ||
    artifact.path !==
      `${BROWSER_ARTIFACT_DIRECTORY}/studio-browser-${version}-${artifact.sha256.slice(0, 16)}.tar` ||
    artifact.checksumPath !== `${artifact.path}.sha256` ||
    Object.keys(artifact).sort().join('\n') !==
      'assetManifestSha256\nbudgetBytes\nchecksumPath\nintegrity\npath\nsha256\nsha512\nsize\nversion'
  ) {
    throw new Error(`Approved Studio browser artifact for ${version} is invalid.`);
  }
  return { ...artifact };
}

export async function assertApprovedBrowserArtifactFiles(artifact, version, root) {
  const normalized = assertApprovedBrowserArtifact(artifact, version);
  const rootPath = fileURLToPath(root);
  const [archive, checksum] = await Promise.all([
    readFile(join(rootPath, normalized.path)),
    readFile(join(rootPath, normalized.checksumPath), 'utf8'),
  ]);
  const sha256 = createHash('sha256').update(archive).digest('hex');
  const sha512 = createHash('sha512').update(archive).digest('hex');
  const assetManifest = tarEntry(archive, `studio-browser-${version}/studio-assets.json`);
  if (
    archive.byteLength !== normalized.size ||
    sha256 !== normalized.sha256 ||
    sha512 !== normalized.sha512 ||
    createHash('sha256').update(assetManifest).digest('hex') !== normalized.assetManifestSha256 ||
    checksum !== `${normalized.sha256}  ${basename(normalized.path)}\n`
  ) {
    throw new Error(`Retained Studio browser artifact for ${version} changed after approval.`);
  }
}

function tarEntry(archive, expectedPath) {
  let found;
  for (let offset = 0; offset + 512 <= archive.byteLength;) {
    const header = archive.subarray(offset, offset + 512);
    if (header.every((value) => value === 0)) break;
    const name = tarText(header.subarray(0, 100));
    const prefix = tarText(header.subarray(345, 500));
    const sizeText = tarText(header.subarray(124, 136)).trim();
    if (!/^[0-7]+$/u.test(sizeText)) {
      throw new Error('Retained Studio browser archive has an invalid tar size.');
    }
    const size = Number.parseInt(sizeText, 8);
    const contentStart = offset + 512;
    const contentEnd = contentStart + size;
    if (!Number.isSafeInteger(size) || contentEnd > archive.byteLength) {
      throw new Error('Retained Studio browser archive has an invalid tar boundary.');
    }
    const path = prefix.length === 0 ? name : `${prefix}/${name}`;
    if (path === expectedPath) {
      if (found !== undefined) {
        throw new Error(`Retained Studio browser archive repeats ${expectedPath}.`);
      }
      found = archive.subarray(contentStart, contentEnd);
    }
    offset = contentStart + Math.ceil(size / 512) * 512;
  }
  if (found === undefined) {
    throw new Error(`Retained Studio browser archive is missing ${expectedPath}.`);
  }
  return found;
}

function tarText(bytes) {
  const terminator = bytes.indexOf(0);
  return bytes.subarray(0, terminator === -1 ? bytes.length : terminator).toString('utf8');
}

async function writeBrowserAssetManifest(directory, entryPoint, release) {
  const files = (await filesUnder(directory))
    .map((path) => repositoryPath(directory, path))
    .filter((path) => path !== 'studio-assets.json')
    .sort((left, right) => left.localeCompare(right));
  if (files.length > MAX_BROWSER_ASSET_COUNT) {
    throw new Error(
      `Studio browser distribution has ${files.length} assets; the maximum is ${MAX_BROWSER_ASSET_COUNT}.`,
    );
  }
  if (!files.includes(entryPoint)) {
    throw new Error(`Studio browser entry ${entryPoint} is absent from its distribution.`);
  }
  const enhancementEntries = files.filter((path) =>
    /^assets\/studio-enhancements-[a-f0-9]{16}\.min\.js$/u.test(path),
  );
  if (enhancementEntries.length !== 1) {
    throw new Error(
      `Studio browser distribution requires one enhancement runtime; found ${enhancementEntries.length}.`,
    );
  }
  const enhancementEntry = enhancementEntries[0];
  const assets = await Promise.all(
    files.map(async (path) => {
      const bytes = await readFile(join(directory, path));
      if (path === entryPoint || path === enhancementEntry) {
        const enhancementRuntime = path === enhancementEntry;
        const asset = releaseRuntimeAssetRecord({
          bytes,
          mediaType: 'text/javascript',
          path,
          policy: enhancementRuntime ? 'enhancement-runtime' : 'authoring-browser-module',
          role: enhancementRuntime ? 'enhancement-runtime' : 'browser-module',
        });
        await assertReleaseRuntimeAsset(asset, bytes, {
          format: enhancementRuntime ? 'iife' : 'esm',
          policy: enhancementRuntime ? 'enhancement-runtime' : 'authoring-browser-module',
          requireHashedName: path.startsWith('assets/'),
        });
        return asset;
      }
      return {
        bytes: bytes.byteLength,
        integrity: `sha256-${createHash('sha256').update(bytes).digest('base64')}`,
        mediaType: browserMediaType(path),
        path,
        role: browserAssetRole(path, entryPoint),
      };
    }),
  );
  const document = {
    assets,
    contentSecurityPolicy: SAME_ORIGIN_BROWSER_CSP,
    enhancementRuntime: enhancementRuntimeManifest(enhancementEntry),
    kind: 'studio-browser-assets',
    module: { entryPoint, exports: [...browserExports], format: 'esm' },
    productionRuntime: {
      forbidden: ['node', 'npm', 'npx', 'vite', 'server-side-javascript'],
      requires: [],
      servingModel: 'static-files',
    },
    publicRenderer: {
      style: {
        budgetBytes: 262_144,
        contentHashAlgorithm: 'sha256',
        fileNameTemplate: 'studio-public-{{CONTENT_HASH_16}}.min.css',
        integrityAlgorithm: 'sha256',
        materialization: 'exact-utf8-bytes',
        mediaType: 'text/css',
        minified: true,
        outputSchema:
          'https://schemas.kumwe.org/studio/v1/studio-browser-assets.schema.json#/$defs/publicStyleAsset',
        source: 'renderer-web.css',
      },
    },
    release: {
      corpusManifestDigest: release.corpusManifestDigest,
      version: release.release,
    },
    schemaVersion: 1,
  };
  assertBrowserAssetManifestSemantics(document);
  await writeFile(join(directory, 'studio-assets.json'), `${JSON.stringify(document, null, 2)}\n`);
}

/**
 * Enforce the cross-member rules JSON Schema cannot express: path uniqueness
 * and exact entry-point binding to the single role-bearing asset.
 */
export function assertBrowserAssetManifestSemantics(document) {
  if (document === null || typeof document !== 'object' || !Array.isArray(document.assets)) {
    throw new TypeError('Studio browser asset manifest has no asset inventory.');
  }
  const paths = document.assets.map((asset) => asset?.path);
  if (paths.some((path) => typeof path !== 'string') || new Set(paths).size !== paths.length) {
    throw new TypeError('Studio browser asset manifest paths must be unique strings.');
  }
  for (const asset of document.assets) {
    if (
      asset?.mediaType === 'text/javascript' &&
      asset.role !== 'browser-module' &&
      asset.role !== 'enhancement-runtime'
    ) {
      throw new TypeError(
        'Studio browser asset manifest cannot disguise executable JavaScript as support material.',
      );
    }
  }
  const bindings = [
    ['browser-module', document.module?.entryPoint],
    ['enhancement-runtime', document.enhancementRuntime?.entryPoint],
  ];
  for (const [role, entryPoint] of bindings) {
    const roleAssets = document.assets.filter((asset) => asset?.role === role);
    if (
      roleAssets.length !== 1 ||
      typeof entryPoint !== 'string' ||
      roleAssets[0]?.path !== entryPoint
    ) {
      throw new TypeError(
        `Studio browser asset manifest must bind ${role} to its one role-bearing asset.`,
      );
    }
  }
  return document;
}

/** Re-verify every manifest-selected byte immediately before packaging or serving it. */
export async function assertBrowserAssetManifestFiles(directory) {
  const document = assertBrowserAssetManifestSemantics(
    JSON.parse(await readFile(join(directory, 'studio-assets.json'), 'utf8')),
  );
  const expectedPaths = document.assets.map((asset) => asset.path).sort();
  const actualPaths = (await filesUnder(directory))
    .map((path) => repositoryPath(directory, path))
    .filter((path) => path !== 'studio-assets.json')
    .sort();
  if (expectedPaths.join('\n') !== actualPaths.join('\n')) {
    throw new Error('Studio browser asset manifest does not exactly inventory its distribution.');
  }
  for (const asset of document.assets) {
    const bytes = await readFile(join(directory, asset.path));
    const identity = releaseAssetIdentity(bytes);
    for (const member of ['bytes', 'integrity']) {
      if (asset[member] !== identity[member]) {
        throw new Error(`Studio browser asset ${asset.path} has incorrect ${member}.`);
      }
    }
    if (asset.role === 'browser-module' || asset.role === 'enhancement-runtime') {
      const enhancement = asset.role === 'enhancement-runtime';
      await assertReleaseRuntimeAsset(asset, bytes, {
        format: enhancement ? 'iife' : 'esm',
        policy: enhancement ? 'enhancement-runtime' : 'authoring-browser-module',
      });
    } else if (asset.mediaType === 'text/javascript' || asset.mediaType === 'text/css') {
      throw new Error(
        `Studio browser asset ${asset.path} is executable/style content without a governed runtime role.`,
      );
    }
  }
  return document;
}

async function copyBrowserDistributionSupport(rootPath, destination) {
  const schemaRoot = join(rootPath, 'schemas');
  const schemaPaths = await localSchemaClosure(schemaRoot, browserSchemaSeeds);

  await Promise.all([
    mkdir(join(destination, 'docs', 'contracts'), { recursive: true }),
    mkdir(join(destination, 'docs', 'integration'), { recursive: true }),
    mkdir(join(destination, 'schemas'), { recursive: true }),
    mkdir(join(destination, 'schemas', 'vectors', 'authoring-http'), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(join(destination, 'README.md'), browserDistributionReadme, 'utf8'),
    cp(join(rootPath, 'LICENSE'), join(destination, 'LICENSE')),
    cp(
      join(rootPath, 'packages', 'studio-lit', 'THIRD_PARTY_NOTICES.md'),
      join(destination, 'THIRD_PARTY_NOTICES.md'),
    ),
    cp(
      join(rootPath, 'packages', 'studio-lit', 'third-party-licenses'),
      join(destination, 'third-party-licenses'),
      { recursive: true },
    ),
    cp(
      join(rootPath, 'docs', 'integration', 'prebuilt-browser-assets.md'),
      join(destination, 'docs', 'integration', 'prebuilt-browser-assets.md'),
    ),
    cp(
      join(rootPath, 'docs', 'contracts', 'studio-deployment.md'),
      join(destination, 'docs', 'contracts', 'studio-deployment.md'),
    ),
    cp(
      join(rootPath, 'examples', 'php-authoring-host'),
      join(destination, 'examples', 'php-authoring-host'),
      { recursive: true },
    ),
    cp(join(rootPath, 'studio-release.json'), join(destination, 'studio-release.json')),
    cp(
      join(rootPath, 'schemas', 'studio-browser-assets.schema.json'),
      join(destination, 'studio-browser-assets.schema.json'),
    ),
    cp(
      join(rootPath, 'schemas', 'vectors', 'authoring-http', 'transport-matrix.json'),
      join(destination, 'schemas', 'vectors', 'authoring-http', 'transport-matrix.json'),
    ),
    ...schemaPaths.map(async (path) => {
      const target = join(destination, 'schemas', path);
      await mkdir(dirname(target), { recursive: true });
      await cp(join(schemaRoot, path), target);
    }),
  ]);
}

async function localSchemaClosure(schemaRoot, seeds) {
  const pending = [...seeds];
  const included = new Set();

  while (pending.length > 0) {
    const schemaPath = normalizeDistributionPath(pending.shift(), 'schema path');
    if (included.has(schemaPath)) continue;
    included.add(schemaPath);

    const sourcePath = resolve(schemaRoot, schemaPath);
    assertPathInside(schemaRoot, sourcePath, `Schema ${schemaPath}`);
    const schema = JSON.parse(await readFile(sourcePath, 'utf8'));
    for (const reference of jsonReferences(schema)) {
      const target = localReferenceTarget(reference, schemaPath);
      if (target !== undefined) pending.push(target);
    }
  }

  return [...included].sort((left, right) => left.localeCompare(right));
}

/** Assert that the portable archive never ships dangling Markdown links or schema references. */
export async function assertBrowserDistributionReferences(directory) {
  const files = await filesUnder(directory);
  const fileSet = new Set(files.map((path) => resolve(path)));

  for (const documentPath of files.filter((path) => path.endsWith('.md'))) {
    const source = await readFile(documentPath, 'utf8');
    for (const match of source.matchAll(/\[[^\]]*\]\(([^)]+)\)/gu)) {
      const destination = markdownDestination(match[1]);
      if (destination.startsWith('#')) continue;
      if (isAbsoluteReference(destination)) {
        assertStableHttpsReference(
          destination,
          `Markdown document ${repositoryPath(directory, documentPath)}`,
        );
        continue;
      }
      const pathText = destination.split('#', 1)[0];
      if (pathText.length === 0) continue;
      const target = resolve(dirname(documentPath), decodeReferencePath(pathText));
      assertPathInside(directory, target, `Markdown link ${destination}`);
      if (!fileSet.has(target)) {
        throw new Error(
          `Markdown document ${repositoryPath(directory, documentPath)} links to absent ${destination}.`,
        );
      }
    }
  }

  for (const schemaPath of files.filter((path) => path.endsWith('.schema.json'))) {
    const schema = JSON.parse(await readFile(schemaPath, 'utf8'));
    for (const reference of jsonReferences(schema)) {
      if (reference.startsWith('#')) continue;
      if (isAbsoluteReference(reference)) {
        assertStableHttpsReference(reference, `schema ${repositoryPath(directory, schemaPath)}`);
        continue;
      }
      const pathText = reference.split('#', 1)[0];
      if (pathText.length === 0) continue;
      const target = resolve(dirname(schemaPath), decodeReferencePath(pathText));
      assertPathInside(directory, target, `Schema reference ${reference}`);
      if (!fileSet.has(target)) {
        throw new Error(
          `Schema ${repositoryPath(directory, schemaPath)} references absent ${reference}.`,
        );
      }
    }
  }
}

function jsonReferences(value) {
  const result = [];
  const visit = (candidate) => {
    if (Array.isArray(candidate)) {
      for (const item of candidate) visit(item);
      return;
    }
    if (candidate === null || typeof candidate !== 'object') return;
    for (const [key, item] of Object.entries(candidate)) {
      if (key === '$ref' && typeof item === 'string') result.push(item);
      visit(item);
    }
  };
  visit(value);
  return result;
}

function localReferenceTarget(reference, sourcePath) {
  if (reference.startsWith('#')) return undefined;
  if (isAbsoluteReference(reference)) {
    assertStableHttpsReference(reference, `schema ${sourcePath}`);
    return undefined;
  }
  const pathText = reference.split('#', 1)[0];
  if (pathText.length === 0) return undefined;
  return normalizeDistributionPath(
    posix.join(posix.dirname(sourcePath), decodeReferencePath(pathText)),
    `reference ${reference}`,
  );
}

function markdownDestination(raw) {
  const trimmed = raw.trim();
  const angleMatch = /^<([^>]+)>/u.exec(trimmed);
  if (angleMatch !== null) return angleMatch[1];
  return trimmed.split(/\s+/u, 1)[0];
}

function decodeReferencePath(path) {
  try {
    return decodeURIComponent(path);
  } catch {
    throw new Error(`Browser distribution reference is not valid URI text: ${path}`);
  }
}

function isAbsoluteReference(reference) {
  return /^[A-Za-z][A-Za-z0-9+.-]*:/u.test(reference) || reference.startsWith('//');
}

function assertStableHttpsReference(reference, owner) {
  let parsed;
  try {
    parsed = new URL(reference);
  } catch {
    throw new Error(`${owner} contains an invalid absolute reference: ${reference}`);
  }
  if (
    parsed.protocol !== 'https:' ||
    parsed.hostname.length === 0 ||
    parsed.username.length > 0 ||
    parsed.password.length > 0
  ) {
    throw new Error(`${owner} contains a non-HTTPS or credentialed reference: ${reference}`);
  }
}

function normalizeDistributionPath(path, label) {
  const normalized = posix.normalize(path.replaceAll('\\', '/'));
  if (
    normalized.length === 0 ||
    normalized === '.' ||
    normalized === '..' ||
    normalized.startsWith('../') ||
    normalized.startsWith('/') ||
    normalized.includes('\0')
  ) {
    throw new Error(`Unsafe browser distribution ${label}: ${path}`);
  }
  return normalized;
}

function assertPathInside(root, path, label) {
  const relation = relative(resolve(root), resolve(path));
  if (relation === '..' || relation.startsWith(`..${sep}`) || resolve(path) === resolve(root)) {
    throw new Error(`${label} escapes the browser distribution.`);
  }
}

async function deterministicTar(sourceDirectory, prefix) {
  const chunks = [];
  for (const path of await filesUnder(sourceDirectory)) {
    const relativePath = repositoryPath(sourceDirectory, path);
    const bytes = await readFile(path);
    const archivePath = `${prefix}/${relativePath}`;
    chunks.push(tarHeader(archivePath, bytes.byteLength), bytes);
    const padding = (512 - (bytes.byteLength % 512)) % 512;
    if (padding > 0) chunks.push(Buffer.alloc(padding));
  }
  chunks.push(Buffer.alloc(1_024));
  return Buffer.concat(chunks);
}

function tarHeader(path, size) {
  const header = Buffer.alloc(512);
  const { name, prefix } = splitTarPath(path);
  writeString(header, 0, 100, name);
  writeOctal(header, 100, 8, 0o644);
  writeOctal(header, 108, 8, 0);
  writeOctal(header, 116, 8, 0);
  writeOctal(header, 124, 12, size);
  writeOctal(header, 136, 12, 0);
  header.fill(0x20, 148, 156);
  header[156] = '0'.charCodeAt(0);
  writeString(header, 257, 6, 'ustar\0');
  writeString(header, 263, 2, '00');
  writeString(header, 265, 32, 'root');
  writeString(header, 297, 32, 'root');
  if (prefix.length > 0) writeString(header, 345, 155, prefix);
  const checksum = header.reduce((sum, value) => sum + value, 0);
  const encoded = checksum.toString(8).padStart(6, '0');
  writeString(header, 148, 6, encoded);
  header[154] = 0;
  header[155] = 0x20;
  return header;
}

function splitTarPath(path) {
  if (Buffer.byteLength(path) <= 100) return { name: path, prefix: '' };
  for (let index = path.lastIndexOf('/'); index > 0; index = path.lastIndexOf('/', index - 1)) {
    const prefix = path.slice(0, index);
    const name = path.slice(index + 1);
    if (Buffer.byteLength(prefix) <= 155 && Buffer.byteLength(name) <= 100) {
      return { name, prefix };
    }
  }
  throw new Error(`Browser distribution path is too long for deterministic ustar: ${path}`);
}

function writeString(buffer, offset, length, value) {
  const bytes = Buffer.from(value, 'utf8');
  if (bytes.byteLength > length) throw new Error(`Tar value exceeds ${length} bytes: ${value}`);
  bytes.copy(buffer, offset);
}

function writeOctal(buffer, offset, length, value) {
  const encoded = value.toString(8).padStart(length - 1, '0');
  if (encoded.length > length - 1) throw new Error(`Tar numeric value exceeds ${length} bytes.`);
  writeString(buffer, offset, length - 1, encoded);
  buffer[offset + length - 1] = 0;
}

async function filesUnder(directory) {
  const result = [];
  for (const name of (await readdir(directory)).sort((left, right) => left.localeCompare(right))) {
    const path = join(directory, name);
    const information = await lstat(path);
    if (information.isSymbolicLink()) {
      throw new Error(`Studio browser distribution cannot contain a symbolic link: ${path}`);
    }
    if (information.isDirectory()) result.push(...(await filesUnder(path)));
    else if (information.isFile()) result.push(path);
    else throw new Error(`Studio browser distribution contains a non-regular entry: ${path}`);
  }
  return result;
}

export function assertSelfContainedBrowserModule(source) {
  if (source.length < 100_000) {
    throw new Error('Studio browser distribution is unexpectedly incomplete.');
  }
  const runtimeImports = [
    ...source.matchAll(/\b(?:import|export)\s+(?:[^"'();]*?\sfrom\s*)?["']([^"']+)["']/gu),
    ...source.matchAll(/\bimport\s*\(\s*["']([^"']+)["']/gu),
  ].map((match) => match[1]);
  if (runtimeImports.length > 0 || /\brequire\s*\(/u.test(source)) {
    throw new Error('Studio browser distribution contains a build-time or bare runtime import.');
  }
}

function browserAssetRole(path, entryPoint) {
  if (path === entryPoint) return 'browser-module';
  if (/^assets\/studio-enhancements-[a-f0-9]{16}\.min\.js$/u.test(path)) {
    return 'enhancement-runtime';
  }
  if (path === 'LICENSE' || path.startsWith('third-party-licenses/')) return 'license';
  if (path === 'THIRD_PARTY_NOTICES.md') return 'notice';
  if (path === 'studio-release.json') return 'release-record';
  if (path.endsWith('.schema.json')) return 'schema';
  return 'documentation';
}

function browserMediaType(path) {
  switch (extname(path)) {
    case '.js':
      return 'text/javascript';
    case '.json':
      return 'application/json';
    case '.md':
      return 'text/markdown';
    default:
      return 'text/plain';
  }
}

function repositoryPath(root, path) {
  return relative(resolve(root), resolve(path)).split(sep).join('/');
}
