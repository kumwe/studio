import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  artifactFromBytes,
  buildApprovedReleaseArtifacts,
  inspectExistingRegistryArtifacts,
} from '../release-artifacts.mjs';
import { browserArtifactFromBytes } from '../studio-browser-artifacts.mjs';

const repositoryRoot = new URL('../../', import.meta.url);

describe('approved npm package artifacts', () => {
  it('builds one deterministic digest record for the fixed eight-package family', async () => {
    const approved = await buildApprovedReleaseArtifacts(repositoryRoot, {
      buildBrowserArtifact: fakeBrowserBuilder,
      packPackage: async ({ name, version }) =>
        artifactFromBytes(Buffer.from(`${name}@${version}`), version),
    });
    assert.equal(Object.keys(approved.packages).length, 8);
    assert.ok(
      Object.values(approved.packages).every(
        (artifact) => artifact.integrity.startsWith('sha512-') && artifact.shasum.length === 40,
      ),
    );
    assert.match(approved.browser.integrity, /^sha512-/u);
  });

  it('allows only missing packages or byte-identical provenance-bearing recovery', async () => {
    const record = JSON.parse(
      await import('node:fs/promises').then(({ readFile }) =>
        readFile(new URL('studio-release.json', repositoryRoot), 'utf8'),
      ),
    );
    const approved = await buildApprovedReleaseArtifacts(repositoryRoot, {
      buildBrowserArtifact: fakeBrowserBuilder,
      packPackage: async ({ name, version }) =>
        artifactFromBytes(Buffer.from(`${name}@${version}`), version),
    });
    const names = Object.keys(approved.packages);
    const exact = await inspectExistingRegistryArtifacts(record, approved, {
      npmManifest: async (name, version) => ({
        dist: {
          attestations: { url: 'https://registry.npmjs.org/-/npm/v1/attestations/test' },
          integrity: approved.packages[name].integrity,
          shasum: approved.packages[name].shasum,
        },
        version,
      }),
    });
    assert.deepEqual(exact, { failures: [], missing: [] });

    const adversarial = await inspectExistingRegistryArtifacts(record, approved, {
      npmManifest: async (name, version) =>
        name === names[0]
          ? undefined
          : {
              dist: {
                attestations: {
                  url: 'https://registry.npmjs.org/-/npm/v1/attestations/test',
                },
                integrity: 'sha512-b2s=',
                shasum: '0'.repeat(40),
              },
              version,
            },
    });
    assert.deepEqual(adversarial.missing, [`${names[0]}@${record.release}`]);
    assert.equal(adversarial.failures.length, 14);
  });
});

async function fakeBrowserBuilder(root) {
  const record = JSON.parse(await readFile(new URL('studio-release.json', root), 'utf8'));
  return browserArtifactFromBytes(Buffer.from(`studio-browser@${record.release}`), record.release);
}

async function readFile(...arguments_) {
  return import('node:fs/promises').then((module) => module.readFile(...arguments_));
}
