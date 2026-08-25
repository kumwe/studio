import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { STUDIO_RELEASE_PACKAGE_NAMES } from '../release-family.mjs';
import { collectRegistryFailures } from '../verify-published-release.mjs';

const version = '0.1.0-rc.1';
const record = {
  packages: Object.fromEntries(STUDIO_RELEASE_PACKAGE_NAMES.map((name) => [name, version])),
  release: version,
};

describe('post-publication registry verification', () => {
  it('requires all eight exact versions, integrity, provenance, and the requested tag', async () => {
    const failures = await collectRegistryFailures(record, {
      distTag: 'rc',
      npmJson: async (arguments_) =>
        arguments_[2] === 'dist-tags'
          ? { rc: version }
          : {
              dist: {
                attestations: { url: 'https://registry.example/attestation' },
                integrity: 'sha512-b2s=',
              },
              version,
            },
      requireProvenance: true,
    });
    assert.deepEqual(failures, []);
  });

  it('reports provenance and tag drift without treating a partial release as complete', async () => {
    const failures = await collectRegistryFailures(record, {
      distTag: 'rc',
      npmJson: async (arguments_) =>
        arguments_[2] === 'dist-tags'
          ? { rc: '0.1.0-rc.0' }
          : { dist: { integrity: 'sha512-b2s=' }, version },
      requireProvenance: true,
    });
    assert.equal(failures.length, 16);
  });
});
