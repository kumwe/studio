import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFile, cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';

import { checkReleasePins } from '../check-release-pins.mjs';
import { STUDIO_RELEASE_PACKAGES, STUDIO_RELEASE_RECORD_TARGETS } from '../release-family.mjs';
import { preparePromotion } from '../prepare-promotion.mjs';
import { inspectReleasePlan } from '../release-plan.mjs';
import { assertStableGeneratedTree } from '../verify-release-gate.mjs';
import { resetReleaseProfileClaims } from '../version-packages.mjs';

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
const profile = 'studio.profile/engine-core';

test('promotion generation transforms all eight packages alpha.9 -> rc.1 -> stable', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'studio-prepare-promotion-'));
  t.after(() => rm(directory, { force: true, recursive: true }));
  const root = pathToFileURL(`${directory}/`);
  const paths = [
    '.changeset/config.json',
    '.changeset/pre.json',
    'examples/reference-host/package.json',
    'package-lock.json',
    'package.json',
    'packages/protocol/src/types.ts',
    'packages/testkit/corpus-manifest.json',
    'release-profile-claims.json',
    ...STUDIO_RELEASE_RECORD_TARGETS,
    ...STUDIO_RELEASE_PACKAGES.flatMap(({ directory: packageDirectory }) => [
      `packages/${packageDirectory}/CHANGELOG.md`,
      `packages/${packageDirectory}/package.json`,
    ]),
  ];
  for (const path of paths) {
    await mkdir(join(directory, dirname(path)), { recursive: true });
    await copyFile(join(repositoryRoot, path), join(directory, path));
  }
  const changesetConfig = JSON.parse(
    await readFile(new URL('.changeset/config.json', root), 'utf8'),
  );
  changesetConfig.changelog = false;
  await writeFile(
    new URL('.changeset/config.json', root),
    `${JSON.stringify(changesetConfig, null, 2)}\n`,
  );

  const rcPlan = await preparePromotion(root, { channel: 'rc', profiles: [profile] });
  assert.equal(rcPlan.targetVersion, '0.1.0-rc.1');
  assert.deepEqual(await checkReleasePins(root), { packageCount: 8, version: '0.1.0-rc.1' });
  assert.deepEqual(JSON.parse(await readFile(new URL('.changeset/pre.json', root))), {
    mode: 'pre',
    tag: 'rc',
  });
  assert.deepEqual(JSON.parse(await readFile(new URL('release-profile-claims.json', root))), {
    kind: 'studio-release-profile-claims',
    profiles: [profile],
  });
  await assertRecordCopies(root, '0.1.0-rc.1');

  await writeFile(
    new URL('.changeset/rc-correction.md', root),
    '---\n"@kumwe/studio-core": patch\n---\n\nCorrect a release-blocking RC defect.\n',
  );
  const correctionPlan = await preparePromotion(root, { channel: 'rc', profiles: [] });
  assert.equal(correctionPlan.operation, 'correct');
  assert.equal(correctionPlan.targetVersion, '0.1.0-rc.2');
  assert.deepEqual(await checkReleasePins(root), { packageCount: 8, version: '0.1.0-rc.2' });
  await assertRecordCopies(root, '0.1.0-rc.2');

  const evidenceDirectory = await mkdtemp(join(tmpdir(), 'studio-prepare-evidence-'));
  t.after(() => rm(evidenceDirectory, { force: true, recursive: true }));
  await cp(directory, evidenceDirectory, { recursive: true });
  const qualifiedRecord = JSON.parse(await readFile(new URL('studio-release.json', root), 'utf8'));

  const stablePlan = await preparePromotion(root, {
    candidateRecord: qualifiedRecord,
    candidateSha: 'a'.repeat(40),
    channel: 'stable',
    evidenceSha: 'b'.repeat(40),
    profiles: [],
  });
  assert.equal(stablePlan.sourceVersion, '0.1.0-rc.2');
  assert.equal(stablePlan.targetVersion, '0.1.0');
  assert.deepEqual(await checkReleasePins(root), { packageCount: 8, version: '0.1.0' });
  await assert.rejects(readFile(new URL('.changeset/pre.json', root)), /ENOENT/u);
  await assert.rejects(readFile(new URL('.changeset/pre/rc-correction.md', root)), /ENOENT/u);
  await assertRecordCopies(root, '0.1.0');
  await assertStableGeneratedTree(evidenceDirectory, directory);

  await writeFile(
    new URL('.changeset/next-alpha.md', root),
    '---\n"@kumwe/studio-core": patch\n---\n\nOpen the next development train.\n',
  );
  assert.deepEqual(await inspectReleasePlan(root), {
    channel: 'alpha',
    hasPendingChangesets: true,
    operation: 'version',
    pendingChangesets: ['next-alpha'],
    preMode: 'enter',
  });
  const changesetsCli = join(repositoryRoot, 'node_modules/@changesets/cli/bin.js');
  execFileSync(process.execPath, [changesetsCli, 'pre', 'enter', 'alpha'], {
    cwd: directory,
    stdio: 'pipe',
  });
  await resetReleaseProfileClaims(root);
  execFileSync(process.execPath, [changesetsCli, 'version'], {
    cwd: directory,
    stdio: 'pipe',
  });
  for (const { directory: packageDirectory } of STUDIO_RELEASE_PACKAGES) {
    const manifest = JSON.parse(
      await readFile(new URL(`packages/${packageDirectory}/package.json`, root), 'utf8'),
    );
    assert.equal(manifest.version, '0.1.1-alpha.0');
  }
  assert.deepEqual(JSON.parse(await readFile(new URL('release-profile-claims.json', root))), {
    kind: 'studio-release-profile-claims',
    profiles: [],
  });
});

async function assertRecordCopies(root, expectedVersion) {
  const copies = await Promise.all(
    STUDIO_RELEASE_RECORD_TARGETS.map((path) => readFile(new URL(path, root), 'utf8')),
  );
  assert.equal(new Set(copies).size, 1);
  const record = JSON.parse(copies[0]);
  assert.equal(record.release, expectedVersion);
  assert.ok(Object.values(record.packages).every((version) => version === expectedVersion));
}
