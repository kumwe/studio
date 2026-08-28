import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { pathToFileURL } from 'node:url';

import {
  assertPublishedPackageDistMinified,
  minifyPublishedPackageDist,
} from '../minify-package-dist.mjs';
import {
  assertCanonicalPublicRendererCss,
  assertReleaseRuntimeAsset,
  contentHashedAssetName,
  minifyReleaseCss,
  minifyReleaseJavaScript,
  releaseRuntimeAssetRecord,
} from '../release-asset-policy.mjs';

describe('deterministic release asset policy', () => {
  it('minifies package ESM twice to identical importable bytes and removes invalid maps', async (t) => {
    const temporary = await mkdtemp(join(tmpdir(), 'studio-package-minify-'));
    t.after(async () => rm(temporary, { force: true, recursive: true }));
    const dist = join(temporary, 'dist');
    await mkdir(dist);
    await Promise.all([
      writeFile(join(temporary, 'package.json'), '{"type":"module"}\n'),
      writeFile(
        join(dist, 'index.js'),
        `import { increment } from './value.js';\nexport const answer = increment(41);\nexport default answer;\n//# sourceMappingURL=index.js.map\n`,
      ),
      writeFile(
        join(dist, 'value.js'),
        `export function increment(value) {\n  return value + 1;\n}\n//# sourceMappingURL=value.js.map\n`,
      ),
      writeFile(join(dist, 'index.js.map'), '{}\n'),
      writeFile(join(dist, 'value.js.map'), '{}\n'),
    ]);

    await assert.rejects(
      assertPublishedPackageDistMinified(temporary),
      /invalidated JavaScript source map|not deterministically minified/u,
    );
    await minifyPublishedPackageDist(temporary);
    const first = await Promise.all([
      readFile(join(dist, 'index.js')),
      readFile(join(dist, 'value.js')),
    ]);
    await minifyPublishedPackageDist(temporary);
    const second = await Promise.all([
      readFile(join(dist, 'index.js')),
      readFile(join(dist, 'value.js')),
    ]);
    assert.deepEqual(second, first);
    assert.equal(
      first.some((bytes) => bytes.includes('sourceMappingURL')),
      false,
    );
    await assertPublishedPackageDistMinified(temporary);

    const module = await import(`${pathToFileURL(join(dist, 'index.js')).href}?minified`);
    assert.equal(module.answer, 42);
    assert.equal(module.default, 42);
  });

  it('rejects unminified browser scripts, styles, and maps in package output', async (t) => {
    const temporary = await mkdtemp(join(tmpdir(), 'studio-browser-package-minify-'));
    t.after(async () => rm(temporary, { force: true, recursive: true }));
    const browser = join(temporary, 'dist', 'browser');
    await mkdir(browser, { recursive: true });
    await Promise.all([
      writeFile(join(temporary, 'package.json'), '{"type":"module"}\n'),
      writeFile(join(temporary, 'dist', 'index.js'), 'export{};'),
      writeFile(join(browser, 'unminified.js'), 'export function value () { return 1; }\n'),
      writeFile(join(browser, 'unminified.mjs'), 'export function value () { return 2; }\n'),
      writeFile(join(browser, 'unminified.cjs'), 'exports.value = function () { return 3; };\n'),
      writeFile(join(browser, 'unminified.css'), '[data-studio-block] { color: red; }\n'),
      writeFile(join(browser, 'unminified.js.map'), '{}\n'),
      writeFile(join(browser, 'unminified.mjs.map'), '{}\n'),
      writeFile(join(browser, 'unminified.cjs.map'), '{}\n'),
    ]);

    await assert.rejects(
      assertPublishedPackageDistMinified(temporary),
      /source map|not deterministically minified/u,
    );
    await minifyPublishedPackageDist(temporary);
    await assertPublishedPackageDistMinified(temporary);
    await assert.rejects(readFile(join(browser, 'unminified.js.map')), /ENOENT/u);
    await assert.rejects(readFile(join(browser, 'unminified.mjs.map')), /ENOENT/u);
    await assert.rejects(readFile(join(browser, 'unminified.cjs.map')), /ENOENT/u);
  });

  it('closes hash, SRI, minification and budget metadata for JS and generated CSS', async () => {
    const javascript = Buffer.from(
      await minifyReleaseJavaScript('globalThis.__studioReleaseGate = true;', {
        fileName: 'enhancement.js',
        format: 'iife',
      }),
    );
    const javascriptPath = `assets/${contentHashedAssetName(
      'studio-enhancements',
      javascript,
      '.js',
    )}`;
    const javascriptAsset = releaseRuntimeAssetRecord({
      bytes: javascript,
      mediaType: 'text/javascript',
      path: javascriptPath,
      policy: 'enhancement-runtime',
      role: 'enhancement-runtime',
    });
    await assertReleaseRuntimeAsset(javascriptAsset, javascript, {
      format: 'iife',
      policy: 'enhancement-runtime',
    });

    const css = minifyReleaseCss('[data-studio-block] { box-sizing: border-box; }');
    assert.deepEqual(assertCanonicalPublicRendererCss(css), css);
    assert.throws(
      () => assertCanonicalPublicRendererCss('[data-studio-block] { color: red; }'),
      /canonical compact grammar/u,
    );
    const cssPath = `assets/${contentHashedAssetName('studio-public', css, '.css')}`;
    const cssAsset = releaseRuntimeAssetRecord({
      bytes: css,
      mediaType: 'text/css',
      path: cssPath,
      policy: 'public-style',
      role: 'public-style',
    });
    await assertReleaseRuntimeAsset(cssAsset, css, { policy: 'public-style' });

    await assert.rejects(
      assertReleaseRuntimeAsset(
        { ...javascriptAsset, path: 'assets/studio-enhancements-stale.min.js' },
        javascript,
        { format: 'iife', policy: 'enhancement-runtime' },
      ),
      /not named with its exact content hash/u,
    );
    await assert.rejects(
      assertReleaseRuntimeAsset(
        { ...javascriptAsset, budgetBytes: javascriptAsset.budgetBytes + 1 },
        javascript,
        { format: 'iife', policy: 'enhancement-runtime' },
      ),
      /does not carry the governed/u,
    );
    const oversized = Buffer.alloc(65_537, 0x61);
    const oversizedAsset = releaseRuntimeAssetRecord({
      bytes: oversized,
      mediaType: 'text/javascript',
      path: `assets/${contentHashedAssetName('studio-enhancements', oversized, '.js')}`,
      policy: 'enhancement-runtime',
      role: 'enhancement-runtime',
    });
    await assert.rejects(
      assertReleaseRuntimeAsset(oversizedAsset, oversized, {
        format: 'iife',
        policy: 'enhancement-runtime',
      }),
      /exceeds its 65536-byte budget/u,
    );
    await assert.rejects(
      assertReleaseRuntimeAsset(javascriptAsset, Buffer.from('function open () { return true; }'), {
        format: 'iife',
        policy: 'enhancement-runtime',
      }),
      /incorrect (?:bytes|contentHash|integrity)/u,
    );
  });
});
