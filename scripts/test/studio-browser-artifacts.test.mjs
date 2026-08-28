import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, posix } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import Ajv2020 from 'ajv/dist/2020.js';

import {
  assertBrowserDistributionReferences,
  assertSelfContainedBrowserModule,
  buildStudioBrowserReleaseArtifact,
} from '../studio-browser-artifacts.mjs';

const repositoryRoot = new URL('../../', import.meta.url);
const repositoryPath = fileURLToPath(repositoryRoot);

describe('governed Studio browser distribution', () => {
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
    const schema = JSON.parse(
      entries.get(`${prefix}/studio-browser-assets.schema.json`).toString('utf8'),
    );
    const validate = new Ajv2020({ strict: true }).compile(schema);
    assert.equal(validate(manifest), true, JSON.stringify(validate.errors));
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
    assert.match(manifest.module.entryPoint, /^assets\/studio-browser-[a-f0-9]{16}\.js$/u);
    assert.equal(manifest.productionRuntime.requires.length, 0);
    assert.deepEqual(manifest.productionRuntime.forbidden, [
      'node',
      'npm',
      'npx',
      'vite',
      'server-side-javascript',
    ]);
    for (const asset of manifest.assets) {
      const bytes = entries.get(`${prefix}/${asset.path}`);
      assert.ok(bytes, `manifest references absent asset ${asset.path}`);
      assert.equal(asset.bytes, bytes.byteLength);
      assert.equal(
        asset.integrity,
        `sha256-${createHash('sha256').update(bytes).digest('base64')}`,
      );
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
