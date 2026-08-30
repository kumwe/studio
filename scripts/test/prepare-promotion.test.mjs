import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFile, cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';

import { checkReleasePins } from '../check-release-pins.mjs';
import { STUDIO_RELEASE_PACKAGES, STUDIO_RELEASE_RECORD_TARGETS } from '../release-family.mjs';
import { STUDIO_PRODUCT_REQUIREMENTS, VERSION_TWO_RELEASE_PROFILES } from '../release-policy.mjs';
import { preparePromotion } from '../prepare-promotion.mjs';
import { inspectReleasePlan } from '../release-plan.mjs';
import { assertStableGeneratedTree } from '../verify-release-gate.mjs';
import { resetReleaseProfileClaims } from '../version-packages.mjs';

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));

test('promotion generation transforms all eight packages beta -> rc.2 -> stable', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'studio-prepare-promotion-'));
  t.after(() => rm(directory, { force: true, recursive: true }));
  const root = pathToFileURL(`${directory}/`);
  const paths = [
    '.changeset/config.json',
    '.changeset/pre.json',
    'docs/roadmap/STATUS.md',
    'evidence/profile-assertions.json',
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
  await writeFile(new URL('docs/roadmap/STATUS.md', root), productStatus());
  await writeFile(
    new URL('evidence/profile-assertions.json', root),
    `${JSON.stringify({
      contractVersion: '0.1-draft',
      kind: 'profile-assertion-registry',
      profiles: VERSION_TWO_RELEASE_PROFILES.map((id) => ({
        id,
        requiredInputs: ['fixture.test.ts'],
        requiredRuns: ['unit/workspace'],
        status: 'executable',
      })),
    })}\n`,
  );
  await normalizeFixtureToBetaPhase(root);

  const rcPlan = await preparePromotion(root, {
    channel: 'rc',
    profiles: [...VERSION_TWO_RELEASE_PROFILES],
  });
  assert.equal(rcPlan.targetVersion, '0.1.0-rc.2');
  assert.deepEqual(await checkReleasePins(root), { packageCount: 8, version: '0.1.0-rc.2' });
  assert.deepEqual(JSON.parse(await readFile(new URL('.changeset/pre.json', root))), {
    mode: 'pre',
    tag: 'rc',
  });
  assert.deepEqual(JSON.parse(await readFile(new URL('release-profile-claims.json', root))), {
    kind: 'studio-release-profile-claims',
    profiles: VERSION_TWO_RELEASE_PROFILES,
  });
  await assertRecordCopies(root, '0.1.0-rc.2');

  await writeFile(
    new URL('.changeset/rc-correction.md', root),
    '---\n"@kumwe/studio-core": patch\n---\n\nCorrect a release-blocking RC defect.\n',
  );
  const correctionPlan = await preparePromotion(root, { channel: 'rc', profiles: [] });
  assert.equal(correctionPlan.operation, 'correct');
  assert.equal(correctionPlan.targetVersion, '0.1.0-rc.3');
  assert.deepEqual(await checkReleasePins(root), { packageCount: 8, version: '0.1.0-rc.3' });
  await assertRecordCopies(root, '0.1.0-rc.3');

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
  assert.equal(stablePlan.sourceVersion, '0.1.0-rc.3');
  assert.equal(stablePlan.targetVersion, '0.1.0');
  assert.deepEqual(await checkReleasePins(root), { packageCount: 8, version: '0.1.0' });
  await assert.rejects(readFile(new URL('.changeset/pre.json', root)), /ENOENT/u);
  await assert.rejects(readFile(new URL('.changeset/pre/rc-correction.md', root)), /ENOENT/u);
  await assertRecordCopies(root, '0.1.0');
  await assertStableGeneratedTree(evidenceDirectory, directory);

  await writeFile(
    new URL('.changeset/next-beta.md', root),
    '---\n"@kumwe/studio-core": patch\n---\n\nOpen the next development train.\n',
  );
  assert.deepEqual(await inspectReleasePlan(root), {
    channel: 'beta',
    hasPendingChangesets: true,
    operation: 'version',
    pendingChangesets: ['next-beta'],
    preMode: 'enter',
  });
  const changesetsCli = join(repositoryRoot, 'node_modules/@changesets/cli/bin.js');
  execFileSync(process.execPath, [changesetsCli, 'pre', 'enter', 'beta'], {
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
    assert.equal(manifest.version, '0.1.1-beta.0');
  }
  assert.deepEqual(JSON.parse(await readFile(new URL('release-profile-claims.json', root))), {
    kind: 'studio-release-profile-claims',
    profiles: [],
  });
});

// The fixture is seeded from the live repository, whose files move through
// beta, rc, and stable phases as promotions merge. The transform under test
// starts from a beta family, so the seeded copies are rewritten to one
// canonical beta coordinate — otherwise this test would only pass while the
// repository itself happens to sit in the beta phase (and the promotion
// workflow re-runs it against the freshly generated rc tree).
async function normalizeFixtureToBetaPhase(root) {
  const record = JSON.parse(await readFile(new URL('studio-release.json', root), 'utf8'));
  const current = record.release;
  const synthetic = `${current.split('-')[0]}-beta.0`;
  const familyNames = new Set(STUDIO_RELEASE_PACKAGES.map(({ name }) => name));
  const dependencyFields = [
    'dependencies',
    'devDependencies',
    'optionalDependencies',
    'peerDependencies',
  ];
  const retargetPins = (manifest) => {
    for (const field of dependencyFields) {
      for (const name of Object.keys(manifest[field] ?? {})) {
        if (familyNames.has(name) && manifest[field][name] === current) {
          manifest[field][name] = synthetic;
        }
      }
    }
  };

  const manifestPaths = [
    'examples/reference-host/package.json',
    'package.json',
    ...STUDIO_RELEASE_PACKAGES.map(({ directory }) => `packages/${directory}/package.json`),
  ];
  for (const path of manifestPaths) {
    const manifest = JSON.parse(await readFile(new URL(path, root), 'utf8'));
    if (familyNames.has(manifest.name) && manifest.version === current) {
      manifest.version = synthetic;
    }
    retargetPins(manifest);
    await writeFile(new URL(path, root), `${JSON.stringify(manifest, null, 2)}\n`);
  }

  const lockfile = JSON.parse(await readFile(new URL('package-lock.json', root), 'utf8'));
  for (const entry of Object.values(lockfile.packages ?? {})) {
    if (familyNames.has(entry.name) && entry.version === current) {
      entry.version = synthetic;
    }
    retargetPins(entry);
  }
  await writeFile(new URL('package-lock.json', root), `${JSON.stringify(lockfile, null, 2)}\n`);

  record.release = synthetic;
  record.packages = Object.fromEntries(
    Object.keys(record.packages).map((name) => [name, synthetic]),
  );
  record.claimedProfiles = [];
  const recordBytes = `${JSON.stringify(record, null, 2)}\n`;
  for (const path of STUDIO_RELEASE_RECORD_TARGETS) {
    await writeFile(new URL(path, root), recordBytes);
  }

  await writeFile(
    new URL('.changeset/pre.json', root),
    `${JSON.stringify({ mode: 'pre', tag: 'beta' }, null, 2)}\n`,
  );
  await writeFile(
    new URL('release-profile-claims.json', root),
    `${JSON.stringify({ kind: 'studio-release-profile-claims', profiles: [] }, null, 2)}\n`,
  );
  for (const { directory, name } of STUDIO_RELEASE_PACKAGES) {
    await writeFile(new URL(`packages/${directory}/CHANGELOG.md`, root), `# ${name}\n\n`);
  }
}

function productStatus() {
  return [
    '<!-- studio-product-implementation:start -->',
    ...STUDIO_PRODUCT_REQUIREMENTS.map(
      (id) => `| \`${id}\` | \`repository-verified\` | fixture proof |`,
    ),
    '<!-- studio-product-implementation:end -->',
  ].join('\n');
}

async function assertRecordCopies(root, expectedVersion) {
  const copies = await Promise.all(
    STUDIO_RELEASE_RECORD_TARGETS.map((path) => readFile(new URL(path, root), 'utf8')),
  );
  assert.equal(new Set(copies).size, 1);
  const record = JSON.parse(copies[0]);
  assert.equal(record.release, expectedVersion);
  assert.deepEqual(record.claimedProfiles, VERSION_TWO_RELEASE_PROFILES);
  assert.ok(Object.values(record.packages).every((version) => version === expectedVersion));
}
