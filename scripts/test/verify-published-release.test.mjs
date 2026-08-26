import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { STUDIO_RELEASE_PACKAGE_NAMES } from '../release-family.mjs';
import { artifactFromBytes } from '../release-artifacts.mjs';
import { collectRegistryFailures } from '../verify-published-release.mjs';

const version = '0.1.0-rc.1';
const provenanceCommit = 'a'.repeat(40);
const record = {
  packages: Object.fromEntries(STUDIO_RELEASE_PACKAGE_NAMES.map((name) => [name, version])),
  release: version,
};
const approvedArtifacts = {
  kind: 'studio-approved-package-artifacts',
  packages: Object.fromEntries(
    STUDIO_RELEASE_PACKAGE_NAMES.map((name) => [
      name,
      artifactFromBytes(Buffer.from(`approved:${name}@${version}`), version),
    ]),
  ),
  release: version,
};

describe('post-publication registry verification', () => {
  it('requires exact approved bits, provenance source, and the requested tag', async () => {
    const failures = await collectRegistryFailures(record, {
      approvedArtifacts,
      distTag: 'rc',
      fetchAttestations: async (url) => {
        const name = decodeURIComponent(new URL(url).searchParams.get('name'));
        return provenance(name, approvedArtifacts.packages[name], provenanceCommit);
      },
      npmJson: registryManifest,
      provenanceCommit,
      requireProvenance: true,
    });
    assert.deepEqual(failures, []);
  });

  it('rejects arbitrary valid-looking integrity during partial-publish recovery', async () => {
    const failures = await collectRegistryFailures(record, {
      approvedArtifacts,
      npmJson: async (arguments_) => {
        if (arguments_[2] === 'dist-tags') {
          return { rc: version };
        }
        return {
          dist: {
            attestations: {
              url: 'https://registry.npmjs.org/-/npm/v1/attestations/test',
            },
            integrity: 'sha512-b2s=',
            shasum: '0'.repeat(40),
          },
          version,
        };
      },
    });
    assert.equal(
      failures.filter((failure) => failure.includes('approved local tarball')).length,
      16,
    );
  });

  it('rejects provenance for another source commit even when the tarball subject matches', async () => {
    const failures = await collectRegistryFailures(record, {
      approvedArtifacts,
      fetchAttestations: async (url) => {
        const name = decodeURIComponent(new URL(url).searchParams.get('name'));
        return provenance(name, approvedArtifacts.packages[name], 'b'.repeat(40));
      },
      npmJson: registryManifest,
      provenanceCommit,
      requireProvenance: true,
    });
    assert.equal(
      failures.filter((failure) => failure.includes('does not bind dispatch commit')).length,
      8,
    );
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

async function registryManifest(arguments_) {
  if (arguments_[2] === 'dist-tags') {
    return { rc: version };
  }
  const spec = arguments_[1];
  const name = spec.slice(0, spec.lastIndexOf('@'));
  const artifact = approvedArtifacts.packages[name];
  return {
    dist: {
      attestations: {
        url: `https://registry.npmjs.org/-/npm/v1/attestations/test?name=${encodeURIComponent(name)}`,
      },
      integrity: artifact.integrity,
      shasum: artifact.shasum,
    },
    version,
  };
}

function provenance(name, artifact, commit) {
  const statement = {
    _type: 'https://in-toto.io/Statement/v1',
    predicate: {
      buildDefinition: {
        externalParameters: {
          workflow: {
            path: '.github/workflows/release.yml',
            ref: 'refs/heads/main',
            repository: 'https://github.com/kumwe/studio',
          },
        },
        resolvedDependencies: [
          {
            digest: { gitCommit: commit },
            uri: 'git+https://github.com/kumwe/studio@refs/heads/main',
          },
        ],
      },
      runDetails: { builder: { id: 'https://github.com/actions/runner/github-hosted' } },
    },
    predicateType: 'https://slsa.dev/provenance/v1',
    subject: [
      {
        digest: { sha512: artifact.sha512 },
        name: `pkg:npm/${name.replace(/^@/u, '%40')}@${version}`,
      },
    ],
  };
  return {
    attestations: [
      {
        bundle: {
          dsseEnvelope: { payload: Buffer.from(JSON.stringify(statement)).toString('base64') },
        },
        predicateType: 'https://slsa.dev/provenance/v1',
      },
    ],
  };
}
