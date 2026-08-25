import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { STUDIO_RELEASE_PACKAGE_NAMES } from '../release-family.mjs';
import {
  assertCoordinatedRelease,
  buildStudioReleaseRecord,
  parseProtocolConstants,
  serializeStudioReleaseRecord,
  sha256Integrity,
} from '../release-record.mjs';

function inputs(version = '0.1.0-alpha.9') {
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
    assert.equal(record.release, '0.1.0-alpha.9');
    assert.deepEqual(Object.keys(record.packages), STUDIO_RELEASE_PACKAGE_NAMES);
    assert.match(serializeStudioReleaseRecord(record), /\n$/u);
    assert.doesNotThrow(() => assertCoordinatedRelease(record));
  });

  it('rejects missing and unexpected packages', () => {
    const missing = inputs();
    delete missing.packages['@kumwe/studio-media'];
    assert.throws(() => buildStudioReleaseRecord(missing), /fixed eight-package family/u);

    const unexpected = inputs();
    unexpected.packages['@kumwe/studio-extra'] = '0.1.0-alpha.9';
    assert.throws(() => buildStudioReleaseRecord(unexpected), /fixed eight-package family/u);
  });

  it('fails the publication guard on a staggered package version', () => {
    const record = buildStudioReleaseRecord(inputs());
    record.packages['@kumwe/studio-protocol'] = '0.1.0-alpha.8';

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
