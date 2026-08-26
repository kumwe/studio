import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { STUDIO_RELEASE_PACKAGES, STUDIO_RELEASE_PACKAGE_NAMES } from '../release-family.mjs';
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
    STUDIO_RELEASE_PACKAGES.map(({ directory, name }) => [
      name,
      {
        ...artifactFromBytes(Buffer.from(`approved:${name}@${version}`), version),
        path: `.release-artifacts/packages/${directory}.tgz`,
      },
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

  it('accepts provenance bound to an accepted ancestor commit during re-verification', async () => {
    const publishedCommit = 'b'.repeat(40);
    const failures = await collectRegistryFailures(record, {
      acceptProvenanceCommit: async (commit) =>
        commit === provenanceCommit || commit === publishedCommit,
      approvedArtifacts,
      distTag: 'rc',
      fetchAttestations: async (url) => {
        const name = decodeURIComponent(new URL(url).searchParams.get('name'));
        return provenance(name, approvedArtifacts.packages[name], publishedCommit);
      },
      npmJson: registryManifest,
      provenanceCommit,
      requireProvenance: true,
    });
    assert.deepEqual(failures, []);
  });

  it('still rejects unaccepted commits when an acceptance policy is supplied', async () => {
    const failures = await collectRegistryFailures(record, {
      acceptProvenanceCommit: async (commit) => commit === provenanceCommit,
      approvedArtifacts,
      fetchAttestations: async (url) => {
        const name = decodeURIComponent(new URL(url).searchParams.get('name'));
        return provenance(name, approvedArtifacts.packages[name], 'c'.repeat(40));
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

  it('tolerates registry propagation lag before declaring a package absent', async () => {
    const clock = fakeClock();
    const lagging = STUDIO_RELEASE_PACKAGES[0].name;
    let laggingReads = 0;
    const failures = await collectRegistryFailures(record, {
      approvedArtifacts,
      distTag: 'rc',
      fetchAttestations: async (url) => {
        const name = decodeURIComponent(new URL(url).searchParams.get('name'));
        return provenance(name, approvedArtifacts.packages[name], provenanceCommit);
      },
      now: clock.now,
      npmJson: async (arguments_) => {
        if (arguments_[1] === `${lagging}@${version}` && (laggingReads += 1) <= 3) {
          throw new Error('E404');
        }
        return registryManifest(arguments_);
      },
      propagationWindowMs: 300_000,
      provenanceCommit,
      requireProvenance: true,
      sleep: clock.sleep,
    });
    assert.deepEqual(failures, []);
    assert.equal(laggingReads, 4);
    assert.ok(clock.slept > 0);
  });

  it('waits for a moved dist-tag to propagate before reporting drift', async () => {
    const clock = fakeClock();
    const lagging = STUDIO_RELEASE_PACKAGES[0].name;
    let staleTagReads = 0;
    const failures = await collectRegistryFailures(record, {
      approvedArtifacts,
      distTag: 'rc',
      fetchAttestations: async (url) => {
        const name = decodeURIComponent(new URL(url).searchParams.get('name'));
        return provenance(name, approvedArtifacts.packages[name], provenanceCommit);
      },
      now: clock.now,
      npmJson: async (arguments_) => {
        if (
          arguments_[2] === 'dist-tags' &&
          arguments_[1] === lagging &&
          (staleTagReads += 1) <= 2
        ) {
          return { rc: '0.1.0-rc.0' };
        }
        return registryManifest(arguments_);
      },
      propagationWindowMs: 300_000,
      provenanceCommit,
      requireProvenance: true,
      sleep: clock.sleep,
    });
    assert.deepEqual(failures, []);
    assert.equal(staleTagReads, 3);
    assert.ok(clock.slept > 0);
  });

  it('still reports absence and drift once the propagation window closes', async () => {
    const clock = fakeClock();
    const failures = await collectRegistryFailures(record, {
      distTag: 'rc',
      now: clock.now,
      npmJson: async (arguments_) => {
        if (arguments_[1] === `${STUDIO_RELEASE_PACKAGE_NAMES[0]}@${version}`) {
          throw new Error('E404');
        }
        if (arguments_[2] === 'dist-tags') {
          return { rc: '0.1.0-rc.0' };
        }
        return { dist: { integrity: `sha512-${'A'.repeat(88)}` }, version };
      },
      propagationWindowMs: 60_000,
      sleep: clock.sleep,
    });
    assert.equal(failures.filter((failure) => failure.includes('is absent from npm')).length, 1);
    assert.equal(failures.filter((failure) => failure.includes('dist-tag rc is')).length, 7);
    assert.ok(clock.slept >= 60_000);
  });

  it('does not wait for propagation while preflighting expected absences', async () => {
    const clock = fakeClock();
    const failures = await collectRegistryFailures(record, {
      now: clock.now,
      npmJson: async () => {
        throw new Error('E404');
      },
      propagationWindowMs: 300_000,
      skipMissing: true,
      sleep: clock.sleep,
    });
    assert.deepEqual(failures, []);
    assert.equal(clock.slept, 0);
  });

  it('can preflight existing provenance without treating absent coordinates as verified', async () => {
    const present = STUDIO_RELEASE_PACKAGES[0].name;
    const failures = await collectRegistryFailures(record, {
      approvedArtifacts,
      fetchAttestations: async () =>
        provenance(present, approvedArtifacts.packages[present], 'b'.repeat(40)),
      npmJson: async (arguments_) => {
        const spec = arguments_[1];
        if (spec !== `${present}@${version}`) throw new Error('E404');
        const artifact = approvedArtifacts.packages[present];
        return {
          dist: {
            attestations: {
              url: 'https://registry.npmjs.org/-/npm/v1/attestations/test',
            },
            integrity: artifact.integrity,
            shasum: artifact.shasum,
          },
          version,
        };
      },
      provenanceCommit,
      requireProvenance: true,
      skipMissing: true,
    });
    assert.deepEqual(failures, [
      `${present}@${version} provenance does not bind dispatch commit ${provenanceCommit}`,
    ]);
  });
});

function fakeClock() {
  const clock = {
    now: () => clock.slept,
    slept: 0,
    sleep: async (milliseconds) => {
      clock.slept += milliseconds;
    },
  };
  return clock;
}

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
