import { lstat, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'vite';

import {
  assertReleaseRuntimeAsset,
  contentHashedAssetName,
  minifyReleaseJavaScript,
  releaseRuntimeAssetRecord,
} from './release-asset-policy.mjs';

export const STUDIO_PUBLIC_ENHANCEMENT_FAMILIES = Object.freeze([
  'countdown',
  'dialog',
  'lightbox',
  'navigation',
  'notice',
  'popover',
  'slideshow',
  'tabs',
]);

export const STUDIO_PUBLIC_ENHANCEMENT_CSP =
  "default-src 'none'; script-src 'self'; require-trusted-types-for 'script'; trusted-types 'none'";

export async function buildStudioEnhancementRuntimeAssets(
  root = new URL('../', import.meta.url),
  outputDirectory,
) {
  const rootPath = fileURLToPath(root);
  const destination =
    outputDirectory ?? join(rootPath, 'packages', 'renderer-web', 'dist', 'browser');
  const temporary = await mkdtemp(join(tmpdir(), 'studio-enhancement-build-'));
  const emittedName = 'studio-enhancements.js';

  try {
    await build({
      build: {
        emptyOutDir: true,
        lib: {
          entry: join(rootPath, 'packages', 'renderer-web', 'src', 'enhancement-runtime-entry.ts'),
          fileName: () => emittedName,
          formats: ['iife'],
          name: 'KumweStudioEnhancements',
        },
        minify: false,
        outDir: temporary,
        rolldownOptions: { output: { codeSplitting: false } },
        sourcemap: false,
        target: 'es2022',
      },
      configFile: false,
      logLevel: 'warn',
      root: rootPath,
    });
    const emitted = await readFile(join(temporary, emittedName), 'utf8');
    const minified = await minifyReleaseJavaScript(emitted, {
      fileName: emittedName,
      format: 'iife',
    });
    const bytes = Buffer.from(minified);
    assertSelfContainedEnhancementRuntime(minified);
    const assetName = contentHashedAssetName('studio-enhancements', bytes, '.js');
    const entryPoint = `assets/${assetName}`;
    const asset = releaseRuntimeAssetRecord({
      bytes,
      mediaType: 'text/javascript',
      path: entryPoint,
      policy: 'enhancement-runtime',
      role: 'enhancement-runtime',
    });
    await assertReleaseRuntimeAsset(asset, bytes, {
      format: 'iife',
      policy: 'enhancement-runtime',
    });

    await rm(destination, { force: true, recursive: true });
    await mkdir(join(destination, 'assets'), { recursive: true });
    await writeFile(join(destination, entryPoint), bytes);
    return {
      asset,
      bytes,
      directory: destination,
      entryPoint,
    };
  } finally {
    await rm(temporary, { force: true, recursive: true });
  }
}

export function enhancementRuntimeManifest(entryPoint) {
  return {
    activation: 'renderer-data-attributes',
    contentSecurityPolicy: STUDIO_PUBLIC_ENHANCEMENT_CSP,
    enhancements: [...STUDIO_PUBLIC_ENHANCEMENT_FAMILIES],
    entryPoint,
    format: 'iife',
    loading: 'defer',
    needSignal: {
      rule: 'closed-family-intersection-non-empty',
      source: 'renderer-web.enhancements',
    },
    noJavaScriptFallback: 'semantic-renderer-output',
    safeToIncludeUnconditionally: true,
  };
}

export function assertSelfContainedEnhancementRuntime(source) {
  if (source.length < 1_000) {
    throw new Error('Studio public enhancement runtime is unexpectedly incomplete.');
  }
  if (
    /\b(?:import|export)\s+(?:[^"'();]*?\sfrom\s*)?["']/u.test(source) ||
    /\bimport\s*\(/u.test(source) ||
    /\brequire\s*\(/u.test(source) ||
    /sourceMappingURL/u.test(source)
  ) {
    throw new Error('Studio public enhancement runtime is not one self-contained browser file.');
  }
  if (/\beval\s*\(|\bnew\s+Function\b|\.innerHTML\s*=|insertAdjacentHTML\s*\(/u.test(source)) {
    throw new Error('Studio public enhancement runtime contains a forbidden executable sink.');
  }
}

/** Verify the exact renderer-web browser payload before npm packs it. */
export async function assertPackagedStudioEnhancementRuntime(
  root = new URL('../', import.meta.url),
  expectedAsset,
) {
  const rootPath = fileURLToPath(root);
  const directory = join(rootPath, 'packages', 'renderer-web', 'dist', 'browser');
  const files = await releaseFilesUnder(directory);
  const paths = files.map((path) => relative(directory, path).split(sep).join('/'));
  if (paths.some((path) => path.endsWith('.map'))) {
    throw new Error('Renderer-web enhancement distribution contains a forbidden source map.');
  }
  const runtimePaths = paths.filter((path) =>
    /^assets\/studio-enhancements-[a-f0-9]{16}\.min\.js$/u.test(path),
  );
  if (runtimePaths.length !== 1 || paths.length !== 1) {
    throw new Error(
      `Renderer-web enhancement distribution must contain exactly one runtime; found ${paths.length} file(s).`,
    );
  }
  const path = runtimePaths[0];
  const bytes = await readFile(join(directory, path));
  if (expectedAsset === undefined) {
    throw new Error('Renderer-web enhancement verification requires the archive manifest asset.');
  }
  const asset = expectedAsset;
  if (asset.path !== path || asset.role !== 'enhancement-runtime') {
    throw new Error(
      'Renderer-web enhancement runtime does not match the release manifest path/role.',
    );
  }
  await assertReleaseRuntimeAsset(asset, bytes, {
    format: 'iife',
    policy: 'enhancement-runtime',
  });
  assertSelfContainedEnhancementRuntime(bytes.toString('utf8'));
  return { asset: { ...asset }, bytes, directory, entryPoint: path };
}

async function releaseFilesUnder(directory) {
  const result = [];
  for (const name of (await readdir(directory)).sort((left, right) => left.localeCompare(right))) {
    const path = resolve(directory, name);
    const information = await lstat(path);
    if (information.isSymbolicLink()) {
      throw new Error(`Renderer-web enhancement distribution contains symbolic link ${path}.`);
    }
    if (information.isDirectory()) result.push(...(await releaseFilesUnder(path)));
    else if (information.isFile()) result.push(path);
    else throw new Error(`Renderer-web enhancement distribution contains non-file ${path}.`);
  }
  return result;
}
