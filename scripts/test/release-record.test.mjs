import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';

import { STUDIO_RELEASE_PACKAGE_NAMES } from '../release-family.mjs';
import {
  assertCoordinatedRelease,
  browserArtifactLocators,
  buildStudioReleaseRecord,
  parseProtocolConstants,
  serializeStudioReleaseRecord,
  sha256Integrity,
} from '../release-record.mjs';

function inputs(version = '0.1.0-beta.9') {
  return {
    claimedProfiles: [],
    contractVersion: '0.1-draft',
    corpusManifestDigest: sha256Integrity(Buffer.from('corpus')),
    packages: Object.fromEntries(STUDIO_RELEASE_PACKAGE_NAMES.map((name) => [name, version])),
    protocolVersion: '0.1.0-draft.2',
  };
}

describe('Studio release records', () => {
  it('serializes the fixed package family deterministically', () => {
    const record = buildStudioReleaseRecord(inputs());

    assert.equal(record.kind, 'studio-release');
    assert.equal(record.release, '0.1.0-beta.9');
    assert.deepEqual(Object.keys(record.packages), STUDIO_RELEASE_PACKAGE_NAMES);
    assert.deepEqual(record.browserArtifacts, {
      manifest: {
        name: 'studio-assets.json',
        schema: 'https://schemas.kumwe.org/studio/v1/studio-browser-assets.schema.json',
      },
      authoringArchive: {
        archiveStem: 'studio-browser-0.1.0-beta.9',
        assetRole: 'browser-module',
        loading: 'module',
      },
      enhancementRuntime: {
        assetRole: 'enhancement-runtime',
        loading: 'defer',
        package: '@kumwe/studio-renderer-web',
        packageBasePath: 'dist/browser/',
      },
    });
    assert.match(serializeStudioReleaseRecord(record), /\n$/u);
    assert.doesNotThrow(() => assertCoordinatedRelease(record));
  });

  it('derives version-exact browser locators without a digest cycle', () => {
    assert.equal(
      browserArtifactLocators('1.2.3-rc.4').authoringArchive.archiveStem,
      'studio-browser-1.2.3-rc.4',
    );
    assert.throws(() => browserArtifactLocators('latest'), /semantic version/u);
  });

  it('schema-requires the closed browser artifact locator contract', async () => {
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    ajv.addSchema(
      JSON.parse(await readFile(new URL('../../schemas/common.schema.json', import.meta.url))),
    );
    const validate = ajv.compile(
      JSON.parse(
        await readFile(new URL('../../schemas/studio-release.schema.json', import.meta.url)),
      ),
    );
    const record = buildStudioReleaseRecord(inputs());
    assert.equal(validate(record), true, ajv.errorsText(validate.errors));

    const missing = structuredClone(record);
    delete missing.browserArtifacts;
    assert.equal(validate(missing), false);

    const drifted = structuredClone(record);
    drifted.browserArtifacts.enhancementRuntime.assetRole = 'browser-module';
    assert.equal(validate(drifted), false);
  });

  it('rejects missing and unexpected packages', () => {
    const missing = inputs();
    delete missing.packages['@kumwe/studio-media'];
    assert.throws(() => buildStudioReleaseRecord(missing), /fixed eight-package family/u);

    const unexpected = inputs();
    unexpected.packages['@kumwe/studio-extra'] = '0.1.0-beta.9';
    assert.throws(() => buildStudioReleaseRecord(unexpected), /fixed eight-package family/u);
  });

  it('fails the publication guard on a staggered package version', () => {
    const record = buildStudioReleaseRecord(inputs());
    record.packages['@kumwe/studio-protocol'] = '0.1.0-beta.8';

    assert.throws(() => assertCoordinatedRelease(record), /version drift/u);
  });

  it('reads the two independent protocol constants', () => {
    assert.deepEqual(
      parseProtocolConstants(
        "export const STUDIO_CONTRACT_VERSION = '0.1-draft' as const;\n" +
          "export const STUDIO_WIRE_PROTOCOL_VERSION = '0.1.0-draft.2' as const;\n",
      ),
      {
        contractVersion: '0.1-draft',
        protocolVersion: '0.1.0-draft.2',
      },
    );
  });
});
