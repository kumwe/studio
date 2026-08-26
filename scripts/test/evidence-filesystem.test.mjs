import assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  assertContainedRegularDirectory,
  assertSafeAbsentTarget,
  addEvidenceArtifactSize,
  evidenceBundleLockPath,
  finalizeEvidenceBundleNoReplace,
} from '../lib/evidence-filesystem.mjs';

test('evidence staging and destination ancestors reject symlink substitution', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'studio-evidence-fs-'));
  const outside = await mkdtemp(join(tmpdir(), 'studio-evidence-fs-outside-'));
  t.after(() => rm(root, { force: true, recursive: true }));
  t.after(() => rm(outside, { force: true, recursive: true }));
  await mkdir(join(root, 'safe', 'bundles'), { recursive: true });
  await assert.doesNotReject(
    assertContainedRegularDirectory(join(root, 'safe', 'bundles'), root, 'bundle root'),
  );
  await symlink(outside, join(root, 'staging'));
  await assert.rejects(
    assertContainedRegularDirectory(join(root, 'staging'), root, 'staging parent'),
    /non-symlink/u,
  );
  await symlink(outside, join(root, 'linked-parent'));
  await assert.rejects(
    assertSafeAbsentTarget(
      join(root, 'linked-parent', 'candidate'),
      join(root, 'linked-parent'),
      root,
      'bundle',
    ),
    /non-symlink/u,
  );
});

test('artifact budgets reject oversized files and aggregate exhaustion before reads', () => {
  const mib = 1_024 * 1_024;
  assert.equal(addEvidenceArtifactSize(0, 10 * mib, 'artifact'), 10 * mib);
  assert.throws(() => addEvidenceArtifactSize(0, 10 * mib + 1, 'artifact'), /10 MiB/u);
  assert.throws(() => addEvidenceArtifactSize(145 * mib, 6 * mib, 'artifact'), /150 MiB/u);
});

test('evidence target validation rejects an existing target and a substituted parent', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'studio-evidence-target-'));
  t.after(() => rm(root, { force: true, recursive: true }));
  const bundles = join(root, 'evidence', 'bundles');
  await mkdir(bundles, { recursive: true });
  const target = join(bundles, 'candidate');
  await writeFile(target, 'occupied');
  await assert.rejects(
    assertSafeAbsentTarget(target, bundles, root, 'bundle'),
    /already exists and is immutable/u,
  );
  await assert.rejects(
    assertSafeAbsentTarget(join(root, 'other', 'candidate'), bundles, root, 'bundle'),
    /direct child/u,
  );
});

test('generator and intake share one lock and no-replace finalization admits one winner', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'studio-evidence-finalize-'));
  t.after(() => rm(root, { force: true, recursive: true }));
  const stagingParent = join(root, 'staging');
  const bundles = join(root, 'evidence', 'bundles');
  await mkdir(stagingParent, { recursive: true });
  await mkdir(bundles, { recursive: true });
  assert.equal(
    evidenceBundleLockPath(stagingParent, 'candidate'),
    join(stagingParent, 'evidence-candidate.lock'),
  );
  const staging = await Promise.all(
    ['first', 'second'].map(async (identity) => {
      const directory = join(stagingParent, identity);
      await mkdir(join(directory, 'artifacts'), { recursive: true });
      await writeFile(join(directory, 'artifacts', 'identity.txt'), `${identity}\n`);
      await writeFile(join(directory, 'manifest.json'), `${identity}\n`);
      return directory;
    }),
  );
  const target = join(bundles, 'candidate');
  const results = await Promise.allSettled(
    staging.map((directory) =>
      finalizeEvidenceBundleNoReplace(directory, target, bundles, root, 'Evidence bundle'),
    ),
  );
  assert.equal(results.filter(({ status }) => status === 'fulfilled').length, 1);
  assert.equal(results.filter(({ status }) => status === 'rejected').length, 1);
  const manifest = await readFile(join(target, 'manifest.json'), 'utf8');
  const artifact = await readFile(join(target, 'artifacts', 'identity.txt'), 'utf8');
  assert.equal(artifact, manifest, 'one publisher must own both retained bytes');
});

test('failed publication rolls back its reservation and the same bundle can retry', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'studio-evidence-finalize-retry-'));
  t.after(() => rm(root, { force: true, recursive: true }));
  const staging = join(root, 'staging', 'candidate');
  const bundles = join(root, 'evidence', 'bundles');
  const target = join(bundles, 'candidate');
  await mkdir(join(staging, 'artifacts'), { recursive: true });
  await mkdir(bundles, { recursive: true });
  await writeFile(join(staging, 'artifacts', 'identity.txt'), 'retry\n');
  await writeFile(join(staging, 'manifest.json'), 'retry\n');
  let copies = 0;
  await assert.rejects(
    finalizeEvidenceBundleNoReplace(staging, target, bundles, root, 'Evidence bundle', {
      copyFileImplementation: async (...arguments_) => {
        copies += 1;
        if (copies === 1) throw new Error('injected copy failure');
        return copyFile(...arguments_);
      },
    }),
    /injected copy failure/u,
  );
  await assert.rejects(readFile(join(target, 'manifest.json')), /ENOENT/u);
  await finalizeEvidenceBundleNoReplace(staging, target, bundles, root, 'Evidence bundle');
  assert.equal(await readFile(join(target, 'manifest.json'), 'utf8'), 'retry\n');
  assert.equal(await readFile(join(target, 'artifacts', 'identity.txt'), 'utf8'), 'retry\n');
});
