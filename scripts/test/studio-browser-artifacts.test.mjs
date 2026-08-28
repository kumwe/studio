import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, posix } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

import Ajv2020 from 'ajv/dist/2020.js';
import { Window } from 'happy-dom';

import {
  SAME_ORIGIN_BROWSER_CSP,
  assertBrowserAssetManifestSemantics,
  assertBrowserDistributionReferences,
  assertSelfContainedBrowserModule,
  buildStudioBrowserReleaseArtifact,
} from '../studio-browser-artifacts.mjs';
import {
  STUDIO_PUBLIC_ENHANCEMENT_CSP,
  STUDIO_PUBLIC_ENHANCEMENT_FAMILIES,
  assertPackagedStudioEnhancementRuntime,
  assertSelfContainedEnhancementRuntime,
  enhancementRuntimeManifest,
} from '../studio-enhancement-artifacts.mjs';
import {
  contentHashedAssetName,
  minifyReleaseJavaScript,
  releaseRuntimeAssetRecord,
} from '../release-asset-policy.mjs';

const repositoryRoot = new URL('../../', import.meta.url);
const repositoryPath = fileURLToPath(repositoryRoot);

describe('governed Studio browser distribution', () => {
  it('rejects stale, tampered, duplicate, or mapped packaged enhancement runtimes', async (t) => {
    const temporary = await mkdtemp(join(tmpdir(), 'studio-enhancement-package-'));
    t.after(async () => rm(temporary, { force: true, recursive: true }));
    const browser = join(temporary, 'packages', 'renderer-web', 'dist', 'browser');
    const assets = join(browser, 'assets');
    await mkdir(assets, { recursive: true });
    const bytes = Buffer.from(
      await minifyReleaseJavaScript(
        `globalThis.__studioEnhancementFixture=${JSON.stringify('x'.repeat(1_100))};`,
        { fileName: 'studio-enhancements.js', format: 'iife' },
      ),
    );
    const path = `assets/${contentHashedAssetName('studio-enhancements', bytes, '.js')}`;
    const expected = releaseRuntimeAssetRecord({
      bytes,
      mediaType: 'text/javascript',
      path,
      policy: 'enhancement-runtime',
      role: 'enhancement-runtime',
    });
    await writeFile(join(browser, path), bytes);
    const root = pathToFileURL(`${temporary}/`);
    await assertPackagedStudioEnhancementRuntime(root, expected);

    const mapPath = join(assets, `${path.split('/').at(-1)}.map`);
    await writeFile(mapPath, '{}');
    await assert.rejects(
      assertPackagedStudioEnhancementRuntime(root, expected),
      /source map|exactly one runtime/u,
    );
    await rm(mapPath);

    const duplicatePath = join(assets, 'studio-enhancements-aaaaaaaaaaaaaaaa.min.js');
    await writeFile(duplicatePath, bytes);
    await assert.rejects(
      assertPackagedStudioEnhancementRuntime(root, expected),
      /exactly one runtime/u,
    );
    await rm(duplicatePath);

    await writeFile(join(browser, path), Buffer.from(`${bytes.toString('utf8')} `));
    await assert.rejects(
      assertPackagedStudioEnhancementRuntime(root, expected),
      /incorrect (?:bytes|contentHash|integrity)/u,
    );

    const replacement = Buffer.from(
      await minifyReleaseJavaScript(
        `globalThis.__studioEnhancementFixture=${JSON.stringify('y'.repeat(1_100))};`,
        { fileName: 'studio-enhancements.js', format: 'iife' },
      ),
    );
    const replacementPath = `assets/${contentHashedAssetName(
      'studio-enhancements',
      replacement,
      '.js',
    )}`;
    await rm(join(browser, path));
    await writeFile(join(browser, replacementPath), replacement);
    await assert.rejects(
      assertPackagedStudioEnhancementRuntime(root, expected),
      /does not match the release manifest path\/role/u,
    );
  });

  it('reproduces the exact self-contained archive across two independent builds', async (t) => {
    const temporary = await mkdtemp(join(tmpdir(), 'studio-browser-repro-'));
    t.after(async () => rm(temporary, { force: true, recursive: true }));
    const first = await build(temporary, 'first');
    const second = await build(temporary, 'second');
    const [firstArchive, secondArchive] = await Promise.all([
      readFile(join(repositoryPath, first.path)),
      readFile(join(repositoryPath, second.path)),
    ]);

    assert.deepEqual(firstArchive, secondArchive);
    assert.equal(first.sha256, second.sha256);
    assert.equal(first.sha512, second.sha512);
    assert.equal(first.integrity, second.integrity);

    const entries = readTar(firstArchive);
    const prefix = `studio-browser-${first.version}`;
    const required = [
      `${prefix}/LICENSE`,
      `${prefix}/README.md`,
      `${prefix}/THIRD_PARTY_NOTICES.md`,
      `${prefix}/docs/contracts/studio-deployment.md`,
      `${prefix}/docs/integration/prebuilt-browser-assets.md`,
      `${prefix}/examples/php-authoring-host/README.md`,
      `${prefix}/examples/php-authoring-host/src/AuthoringResponder.php`,
      `${prefix}/examples/php-authoring-host/src/StudioContentSecurityPolicy.php`,
      `${prefix}/examples/php-authoring-host/src/StudioDeploymentEmitter.php`,
      `${prefix}/examples/php-authoring-host/tests/run.php`,
      `${prefix}/schemas/authoring-http.schema.json`,
      `${prefix}/schemas/studio-browser-assets.schema.json`,
      `${prefix}/schemas/studio-deployment.schema.json`,
      `${prefix}/schemas/vectors/authoring-http/transport-matrix.json`,
      `${prefix}/studio-assets.json`,
      `${prefix}/studio-browser-assets.schema.json`,
      `${prefix}/studio-release.json`,
    ];
    for (const path of required) assert.ok(entries.has(path), `archive is missing ${path}`);
    assert.ok(
      [...entries.keys()].some((path) => path.startsWith(`${prefix}/third-party-licenses/`)),
      'archive is missing dependency license texts',
    );

    const manifest = JSON.parse(entries.get(`${prefix}/studio-assets.json`).toString('utf8'));
    const releaseRecord = JSON.parse(entries.get(`${prefix}/studio-release.json`).toString('utf8'));
    assert.deepEqual(manifest.release, {
      corpusManifestDigest: releaseRecord.corpusManifestDigest,
      version: releaseRecord.release,
    });
    const schema = JSON.parse(
      entries.get(`${prefix}/studio-browser-assets.schema.json`).toString('utf8'),
    );
    const ajv = new Ajv2020({ strict: true });
    const validate = ajv.compile(schema);
    assert.equal(validate(manifest), true, JSON.stringify(validate.errors));
    const malformedReleaseDigest = structuredClone(manifest);
    malformedReleaseDigest.release.corpusManifestDigest = 'sha256-AA==';
    assert.equal(
      validate(malformedReleaseDigest),
      false,
      'asset schema accepted a release identity that is not an exact SHA-256 digest',
    );
    const malformedAssetDigest = structuredClone(manifest);
    malformedAssetDigest.assets[0].integrity = 'sha256-AA==';
    assert.equal(
      validate(malformedAssetDigest),
      false,
      'asset schema accepted an asset integrity that is not an exact SHA-256 digest',
    );
    const disguisedExecutable = structuredClone(manifest);
    const supportAsset = disguisedExecutable.assets.find(({ role }) => role === 'documentation');
    supportAsset.mediaType = 'text/javascript';
    assert.equal(
      validate(disguisedExecutable),
      false,
      'asset schema accepted JavaScript disguised as documentation',
    );
    assert.throws(
      () => assertBrowserAssetManifestSemantics(disguisedExecutable),
      /disguise executable JavaScript/u,
    );
    for (const mutation of [
      (candidate) => {
        candidate.assets = candidate.assets.filter(({ role }) => role !== 'browser-module');
      },
      (candidate) => {
        candidate.assets.push(
          structuredClone(candidate.assets.find(({ role }) => role === 'enhancement-runtime')),
        );
      },
    ]) {
      const alteredInventory = structuredClone(manifest);
      mutation(alteredInventory);
      assert.equal(
        validate(alteredInventory),
        false,
        'asset schema accepted a missing or duplicate runtime role',
      );
    }
    assert.equal(assertBrowserAssetManifestSemantics(manifest), manifest);
    for (const mutation of [
      (candidate) => {
        candidate.module.entryPoint = candidate.enhancementRuntime.entryPoint;
      },
      (candidate) => {
        candidate.enhancementRuntime.entryPoint = candidate.module.entryPoint;
      },
      (candidate) => {
        candidate.assets[1].path = candidate.assets[0].path;
      },
    ]) {
      const alteredBinding = structuredClone(manifest);
      mutation(alteredBinding);
      assert.throws(
        () => assertBrowserAssetManifestSemantics(alteredBinding),
        /paths must be unique|must bind/u,
      );
    }
    assert.ok(manifest.assets.length <= 500, 'asset manifest exceeds its governed 500-file bound');
    assert.equal(
      manifest.assets.length,
      entries.size - 1,
      'asset manifest must cover every archive file except itself',
    );
    for (const requiredExport of [
      'mountStudio',
      'mountStudioFromConfigElement',
      'autoMountStudio',
      'parseStudioDeploymentConfiguration',
      'resolveStudioDeploymentRuntime',
    ]) {
      const missingBootstrap = structuredClone(manifest);
      missingBootstrap.module.exports = missingBootstrap.module.exports.filter(
        (name) => name !== requiredExport,
      );
      assert.equal(
        validate(missingBootstrap),
        false,
        `asset schema accepted a manifest without ${requiredExport}`,
      );
    }
    const backendDependent = structuredClone(manifest);
    backendDependent.productionRuntime.requires = ['backend-network'];
    assert.equal(
      validate(backendDependent),
      false,
      'asset schema accepted a non-self-contained production runtime',
    );
    assert.match(manifest.module.entryPoint, /^assets\/studio-browser-[a-f0-9]{16}\.min\.js$/u);
    assert.match(
      manifest.enhancementRuntime.entryPoint,
      /^assets\/studio-enhancements-[a-f0-9]{16}\.min\.js$/u,
    );
    assert.deepEqual(
      manifest.enhancementRuntime,
      enhancementRuntimeManifest(manifest.enhancementRuntime.entryPoint),
    );
    assert.deepEqual(manifest.enhancementRuntime.enhancements, STUDIO_PUBLIC_ENHANCEMENT_FAMILIES);
    assert.equal(manifest.enhancementRuntime.contentSecurityPolicy, STUDIO_PUBLIC_ENHANCEMENT_CSP);
    const enhancementAssets = manifest.assets.filter(({ role }) => role === 'enhancement-runtime');
    assert.equal(enhancementAssets.length, 1);
    assert.equal(enhancementAssets[0].path, manifest.enhancementRuntime.entryPoint);
    assert.deepEqual(manifest.publicRenderer, {
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
    });
    const validatePublicStyle = ajv.getSchema(
      'https://schemas.kumwe.org/studio/v1/studio-browser-assets.schema.json#/$defs/publicStyleAsset',
    );
    assert.equal(typeof validatePublicStyle, 'function');
    const publicCss = Buffer.from('[data-studio-block]{box-sizing:border-box}');
    const publicStyle = releaseRuntimeAssetRecord({
      bytes: publicCss,
      mediaType: 'text/css',
      path: `assets/${contentHashedAssetName('studio-public', publicCss, '.css')}`,
      policy: 'public-style',
      role: 'public-style',
    });
    assert.equal(
      validatePublicStyle(publicStyle),
      true,
      JSON.stringify(validatePublicStyle.errors),
    );
    assert.equal(
      validatePublicStyle({ ...publicStyle, role: 'host-style' }),
      false,
      'public style output schema accepted an alternate role',
    );
    for (const mutation of [
      (candidate) => {
        delete candidate.enhancementRuntime;
      },
      (candidate) => {
        candidate.enhancementRuntime.enhancements.push('chart');
      },
      (candidate) => {
        candidate.enhancementRuntime.needSignal.source = 'host-private-flag';
      },
      (candidate) => {
        candidate.enhancementRuntime.contentSecurityPolicy = "script-src 'unsafe-inline'";
      },
    ]) {
      const alteredRuntime = structuredClone(manifest);
      mutation(alteredRuntime);
      assert.equal(
        validate(alteredRuntime),
        false,
        'asset schema accepted public enhancement contract drift',
      );
    }
    assert.equal(manifest.productionRuntime.requires.length, 0);
    assert.deepEqual(manifest.productionRuntime.forbidden, [
      'node',
      'npm',
      'npx',
      'vite',
      'server-side-javascript',
    ]);
    assert.deepEqual(manifest.contentSecurityPolicy, SAME_ORIGIN_BROWSER_CSP);
    assert.equal(
      occurrences(
        manifest.contentSecurityPolicy.headerTemplate,
        manifest.contentSecurityPolicy.styleNonce.placeholder,
      ),
      1,
      'the CSP template must have one unambiguous style nonce substitution',
    );
    assert.match(
      manifest.contentSecurityPolicy.headerTemplate,
      /(?:^|; )script-src 'self'(?:; |$)/u,
    );
    assert.match(
      manifest.contentSecurityPolicy.headerTemplate,
      /(?:^|; )style-src 'self' 'nonce-\{\{STYLE_NONCE\}\}'(?:; |$)/u,
    );
    assert.match(
      manifest.contentSecurityPolicy.headerTemplate,
      /(?:^|; )connect-src 'self'(?:; |$)/u,
    );
    assert.doesNotMatch(
      manifest.contentSecurityPolicy.headerTemplate,
      /'unsafe-(?:eval|inline)'|\*/u,
    );
    assert.deepEqual(manifest.contentSecurityPolicy.inertConfigurationScript, {
      element: 'script',
      mediaType: 'application/json',
      requiresHash: false,
      requiresNonce: false,
    });
    for (const mutation of [
      (candidate) => {
        candidate.contentSecurityPolicy.headerTemplate =
          candidate.contentSecurityPolicy.headerTemplate.replace(
            "script-src 'self'",
            'script-src *',
          );
      },
      (candidate) => {
        candidate.contentSecurityPolicy.inertConfigurationScript.requiresNonce = true;
      },
      (candidate) => {
        delete candidate.contentSecurityPolicy;
      },
    ]) {
      const alteredPolicy = structuredClone(manifest);
      mutation(alteredPolicy);
      assert.equal(validate(alteredPolicy), false, 'asset schema accepted CSP contract drift');
    }
    for (const asset of manifest.assets) {
      const bytes = entries.get(`${prefix}/${asset.path}`);
      assert.ok(bytes, `manifest references absent asset ${asset.path}`);
      assert.equal(asset.bytes, bytes.byteLength);
      assert.equal(
        asset.integrity,
        `sha256-${createHash('sha256').update(bytes).digest('base64')}`,
      );
      if (asset.role === 'browser-module' || asset.role === 'enhancement-runtime') {
        const contentHash = createHash('sha256').update(bytes).digest('hex');
        assert.equal(asset.contentHash, contentHash);
        assert.equal(asset.minified, true);
        assert.ok(asset.bytes <= asset.budgetBytes);
        assert.ok(asset.path.includes(contentHash.slice(0, 16)));
      }
    }

    const schemaDocuments = [...entries]
      .filter(([path]) => path.startsWith(`${prefix}/schemas/`) && path.endsWith('.schema.json'))
      .map(([, bytes]) => JSON.parse(bytes.toString('utf8')));
    const schemaIds = new Set(schemaDocuments.map((document) => document.$id));
    const protocolAjv = new Ajv2020({ strict: false, validateFormats: false });
    for (const document of schemaDocuments) protocolAjv.addSchema(document);
    for (const seed of [
      'authoring-http.schema.json',
      'studio-browser-assets.schema.json',
      'studio-deployment.schema.json',
    ]) {
      const document = JSON.parse(entries.get(`${prefix}/schemas/${seed}`).toString('utf8'));
      assert.ok(schemaIds.has(document.$id), `${seed} is absent from the local schema registry`);
      assert.equal(
        typeof protocolAjv.getSchema(document.$id),
        'function',
        `${seed} does not compile`,
      );
    }
    assertLocalSchemaClosure(entries, prefix);

    const browserModule = entries.get(`${prefix}/${manifest.module.entryPoint}`).toString('utf8');
    assertSelfContainedBrowserModule(browserModule);
    const enhancementBytes = entries.get(`${prefix}/${manifest.enhancementRuntime.entryPoint}`);
    const rendererEnhancementBytes = await readFile(
      join(
        repositoryPath,
        'packages',
        'renderer-web',
        'dist',
        'browser',
        manifest.enhancementRuntime.entryPoint,
      ),
    );
    assert.deepEqual(
      enhancementBytes,
      rendererEnhancementBytes,
      'renderer-web and authoring archive enhancement bytes differ',
    );
    assertSelfContainedEnhancementRuntime(enhancementBytes.toString('utf8'));
    assert.ok(
      browserModule.includes(manifest.release.version),
      'browser module does not carry its asset-manifest release version',
    );
    assert.ok(
      browserModule.includes(manifest.release.corpusManifestDigest),
      'browser module does not carry its asset-manifest corpus digest',
    );
    await assertBundledReleaseGuard(browserModule, manifest.release, temporary);
    for (const bakedHostValue of [
      'sessions/product-trail-backpack',
      'users/static-host-author',
      'products/trail-backpack',
    ]) {
      assert.equal(browserModule.includes(bakedHostValue), false, bakedHostValue);
    }

    const firstDistribution = join(temporary, 'first', 'package-browser');
    await assertBrowserDistributionReferences(firstDistribution);
    const readmePath = join(firstDistribution, 'README.md');
    const readme = await readFile(readmePath, 'utf8');
    await writeFile(readmePath, `${readme}\n[Broken](missing-integration.md)\n`, 'utf8');
    await assert.rejects(
      assertBrowserDistributionReferences(firstDistribution),
      /links to absent missing-integration\.md/u,
    );
    await writeFile(readmePath, readme, 'utf8');
    const manifestSchemaPath = join(firstDistribution, 'studio-browser-assets.schema.json');
    const manifestSchema = await readFile(manifestSchemaPath, 'utf8');
    await writeFile(
      manifestSchemaPath,
      '{"$ref":"schemas/missing-contract.schema.json"}\n',
      'utf8',
    );
    await assert.rejects(
      assertBrowserDistributionReferences(firstDistribution),
      /references absent schemas\/missing-contract\.schema\.json/u,
    );
    await writeFile(manifestSchemaPath, manifestSchema, 'utf8');
  });
});

async function assertBundledReleaseGuard(browserModule, release, temporary) {
  const modulePath = join(temporary, 'release-guard-browser-module.mjs');
  await writeFile(modulePath, browserModule, 'utf8');
  const browser = new Window({ url: 'https://host.example.test/' });
  const restoreGlobals = installBrowserGlobals(browser);
  try {
    const bundle = await import(`${pathToFileURL(modulePath).href}?release-guard`);
    const script = browser.document.createElement('script');
    script.type = 'application/json';
    script.textContent = JSON.stringify({
      kind: 'studio-deployment',
      mount: '#studio',
      release: {
        ...release,
        version: release.version === '0.0.0' ? '0.0.1' : '0.0.0',
      },
    });
    assert.throws(
      () => bundle.parseStudioDeploymentConfiguration(script),
      /release does not match the loaded Studio browser asset manifest/u,
    );

    script.textContent = JSON.stringify({
      kind: 'studio-deployment',
      mount: '#studio',
      release,
    });
    assert.deepEqual(bundle.parseStudioDeploymentConfiguration(script).release, release);
  } finally {
    restoreGlobals();
    await browser.close();
  }
}

function installBrowserGlobals(browser) {
  const names = [
    'window',
    'document',
    'customElements',
    'HTMLElement',
    'Element',
    'Node',
    'Document',
    'HTMLScriptElement',
    'Event',
    'CustomEvent',
    'ShadowRoot',
    'MutationObserver',
    'ResizeObserver',
    'CSSStyleSheet',
    'navigator',
  ];
  const originals = new Map(
    names.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]),
  );
  for (const name of names) {
    Object.defineProperty(globalThis, name, {
      configurable: true,
      value: browser[name],
    });
  }
  return () => {
    for (const [name, descriptor] of originals) {
      if (descriptor === undefined) Reflect.deleteProperty(globalThis, name);
      else Object.defineProperty(globalThis, name, descriptor);
    }
  };
}

function occurrences(source, needle) {
  return source.split(needle).length - 1;
}

function assertLocalSchemaClosure(entries, prefix) {
  for (const [archivePath, bytes] of entries) {
    if (!archivePath.startsWith(`${prefix}/schemas/`) || !archivePath.endsWith('.schema.json')) {
      continue;
    }
    const document = JSON.parse(bytes.toString('utf8'));
    for (const reference of referencesIn(document)) {
      if (reference.startsWith('#')) continue;
      if (/^[A-Za-z][A-Za-z0-9+.-]*:/u.test(reference)) {
        assert.match(reference, /^https:\/\//u, `${archivePath} has an unstable external $ref`);
        continue;
      }
      const relativeReference = reference.split('#', 1)[0];
      if (relativeReference.length === 0) continue;
      const target = posix.normalize(
        posix.join(posix.dirname(archivePath), decodeURIComponent(relativeReference)),
      );
      assert.ok(entries.has(target), `${archivePath} references absent ${target}`);
    }
  }
}

function referencesIn(value) {
  const references = [];
  const visit = (candidate) => {
    if (Array.isArray(candidate)) {
      for (const item of candidate) visit(item);
    } else if (candidate !== null && typeof candidate === 'object') {
      for (const [key, item] of Object.entries(candidate)) {
        if (key === '$ref' && typeof item === 'string') references.push(item);
        visit(item);
      }
    }
  };
  visit(value);
  return references;
}

async function build(temporary, name) {
  const root = join(temporary, name);
  return buildStudioBrowserReleaseArtifact(repositoryRoot, {
    artifactDirectory: join(root, '.release-artifacts', 'browser'),
    packageOutputDirectory: join(root, 'package-browser'),
  });
}

function readTar(archive) {
  const entries = new Map();
  for (let offset = 0; offset + 512 <= archive.byteLength;) {
    const header = archive.subarray(offset, offset + 512);
    if (header.every((value) => value === 0)) break;
    const name = text(header.subarray(0, 100));
    const prefix = text(header.subarray(345, 500));
    const size = Number.parseInt(text(header.subarray(124, 136)).trim() || '0', 8);
    assert.ok(Number.isSafeInteger(size) && size >= 0, `invalid tar size for ${name}`);
    const path = prefix.length === 0 ? name : `${prefix}/${name}`;
    const contentStart = offset + 512;
    entries.set(path, archive.subarray(contentStart, contentStart + size));
    offset = contentStart + Math.ceil(size / 512) * 512;
  }
  return entries;
}

function text(bytes) {
  const end = bytes.indexOf(0);
  return bytes.subarray(0, end === -1 ? bytes.length : end).toString('utf8');
}
