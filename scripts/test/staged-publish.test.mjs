import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { pathToFileURL } from 'node:url';

import { cleanupStagingTags } from '../cleanup-staging-tags.mjs';
import { reconcileAlphaTags } from '../reconcile-alpha-tag.mjs';
import { artifactFromBytes } from '../release-artifacts.mjs';
import { STUDIO_RELEASE_PACKAGES } from '../release-family.mjs';
import {
  inspectStagingTags,
  publishMissingApprovedArtifacts,
  reconcileStagingTags,
  stagingTagForVersion,
} from '../staged-publish.mjs';

describe('non-channel staged publication', () => {
  it('derives a bounded tag that is never an official release channel', () => {
    for (const version of ['0.1.0-alpha.9', '0.1.0-rc.1', '0.1.0']) {
      const tag = stagingTagForVersion(version);
      assert.match(tag, /^studio-stage-/u);
      assert.ok(!['alpha', 'rc', 'latest'].includes(tag));
    }
    assert.throws(() => stagingTagForVersion('0.1.0-beta.1'), /Cannot derive/u);
  });

  it('rejects changed retained bytes before making any registry call', async (t) => {
    const fixture = await createArtifacts(t);
    await writeFile(
      join(fixture.rootPath, fixture.approved.packages[STUDIO_RELEASE_PACKAGES[0].name].path),
      'changed',
    );
    const calls = [];
    await assert.rejects(
      publishMissingApprovedArtifacts(fixture.record, fixture.approved, fixture.coordinates, {
        publishTarball: async (input) => calls.push(input),
        root: fixture.root,
      }),
      /changed after local approval/u,
    );
    assert.deepEqual(calls, []);
  });

  it('keeps partial and retry publication on the staging tag only', async (t) => {
    const fixture = await createArtifacts(t);
    const firstAttempt = [];
    await assert.rejects(
      publishMissingApprovedArtifacts(fixture.record, fixture.approved, fixture.coordinates, {
        publishTarball: async (input) => {
          firstAttempt.push(input);
          if (firstAttempt.length === 3) {
            throw new Error('simulated registry interruption');
          }
        },
        root: fixture.root,
      }),
      /simulated registry interruption/u,
    );
    assert.equal(firstAttempt.length, 3);
    assert.ok(firstAttempt.every((call) => call.stagingTag === fixture.stagingTag));

    const retry = [];
    await publishMissingApprovedArtifacts(
      fixture.record,
      fixture.approved,
      fixture.coordinates.slice(2),
      {
        publishTarball: async (input) => retry.push(input),
        root: fixture.root,
      },
    );
    assert.equal(retry.length, 6);
    assert.ok(retry.every((call) => !['alpha', 'rc', 'latest'].includes(call.stagingTag)));
  });

  it('rechecks each retained tarball immediately before its upload', async (t) => {
    const fixture = await createArtifacts(t);
    const second = fixture.approved.packages[STUDIO_RELEASE_PACKAGES[1].name];
    const calls = [];
    await assert.rejects(
      publishMissingApprovedArtifacts(fixture.record, fixture.approved, fixture.coordinates, {
        publishTarball: async (input) => {
          calls.push(input);
          if (calls.length === 1) {
            await writeFile(join(fixture.rootPath, second.path), 'changed-after-first-upload');
          }
        },
        root: fixture.root,
      }),
      /changed after local approval/u,
    );
    assert.equal(calls.length, 1);
  });

  it('recovers missing coordinate-scoped staging tags without overwriting conflicts', async () => {
    const version = '0.1.0-rc.1';
    const record = releaseRecord(version);
    const existing = new Map();
    const added = [];
    const result = await reconcileStagingTags(record, {
      addTag: async (name, nextVersion, tag) => {
        added.push([name, nextVersion, tag]);
        existing.set(name, nextVersion);
      },
      npmValue: async (arguments_) => existing.get(arguments_[1]),
    });
    assert.equal(added.length, STUDIO_RELEASE_PACKAGES.length);
    assert.equal(result.stagingTag, stagingTagForVersion(version));

    const retry = await reconcileStagingTags(record, {
      addTag: async () => assert.fail('an exact retry must not mutate registry tags'),
      npmValue: async (arguments_) => existing.get(arguments_[1]),
    });
    assert.deepEqual(retry.added, []);

    existing.set(STUDIO_RELEASE_PACKAGES[0].name, '0.1.0-rc.2');
    const preflight = await inspectStagingTags(record, {
      npmValue: async (arguments_) => existing.get(arguments_[1]),
    });
    assert.equal(preflight.failures.length, 1);
    await assert.rejects(
      reconcileStagingTags(record, {
        addTag: async () => assert.fail('a conflicting staging tag must not be overwritten'),
        npmValue: async (arguments_) => existing.get(arguments_[1]),
      }),
      /refusing to overwrite/u,
    );
  });

  it('cleans only this coordinate staging tag after success', async () => {
    const version = '0.1.0-alpha.9';
    const record = releaseRecord(version);
    const removed = [];
    const result = await cleanupStagingTags(record, {
      npmValue: async (name) => (name === STUDIO_RELEASE_PACKAGES[0].name ? version : undefined),
      removeTag: async (...args) => removed.push(args),
    });
    assert.equal(result.removed.length, 1);
    assert.deepEqual(removed, [[STUDIO_RELEASE_PACKAGES[0].name, result.stagingTag]]);

    await assert.rejects(
      cleanupStagingTags(record, {
        npmValue: async () => '9.9.9',
        removeTag: async () => assert.fail('conflicting staging tag must not be removed'),
      }),
      /points to 9\.9\.9/u,
    );
  });
});

describe('alpha channel recovery', () => {
  it('removes prerelease latest drift but preserves a stable latest', async () => {
    const version = '0.1.0-alpha.9';
    const packages = STUDIO_RELEASE_PACKAGES.slice(0, 2).map(({ name }) => ({ name, version }));
    const removed = [];
    const added = [];
    const removedLatest = new Set();
    const result = await reconcileAlphaTags(packages, {
      addTag: async (...args) => added.push(args),
      npmValue: async (arguments_) => {
        if (arguments_[2] === 'version') return version;
        if (arguments_[2] === 'dist-tags.alpha') return '0.1.0-alpha.8';
        if (arguments_[1] === packages[0].name) {
          return removedLatest.has(packages[0].name) ? undefined : '0.1.0-alpha-feature.8+legacy.1';
        }
        return '0.0.9';
      },
      removeTag: async (...args) => {
        removed.push(args);
        removedLatest.add(args[0]);
      },
    });
    assert.deepEqual(removed, [[packages[0].name, 'latest']]);
    assert.equal(result.latestRemoved.length, 1);
    assert.equal(added.length, 2);
  });
});

async function createArtifacts(t) {
  const rootPath = await mkdtemp(join(tmpdir(), 'studio-staged-publish-'));
  t.after(() => rm(rootPath, { force: true, recursive: true }));
  const root = pathToFileURL(`${rootPath}/`);
  const version = '0.1.0-alpha.9';
  const record = releaseRecord(version);
  const packages = {};
  for (const { directory, name } of STUDIO_RELEASE_PACKAGES) {
    const path = `.release-artifacts/packages/${directory}.tgz`;
    const bytes = Buffer.from(`approved:${name}@${version}`);
    await mkdir(join(rootPath, path, '..'), { recursive: true });
    await writeFile(join(rootPath, path), bytes);
    packages[name] = { ...artifactFromBytes(bytes, version), path };
  }
  return {
    approved: { kind: 'studio-approved-package-artifacts', packages, release: version },
    coordinates: STUDIO_RELEASE_PACKAGES.map(({ name }) => `${name}@${version}`),
    record,
    root,
    rootPath,
    stagingTag: stagingTagForVersion(version),
  };
}

function releaseRecord(version) {
  return {
    packages: Object.fromEntries(STUDIO_RELEASE_PACKAGES.map(({ name }) => [name, version])),
    release: version,
  };
}
