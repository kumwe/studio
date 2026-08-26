import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, it } from 'node:test';

import { STUDIO_RELEASE_PACKAGE_NAMES } from '../release-family.mjs';
import { inspectPromotionPlan } from '../promotion-plan.mjs';

const profile = 'studio.profile/engine-core';
const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe('promotion plan', () => {
  it('prepares the first RC from alpha with explicit claims', async () => {
    const root = await fixture('0.1.0-alpha.9', { mode: 'pre', tag: 'alpha' });
    const plan = await inspectPromotionPlan(root, { channel: 'rc', profiles: profile });
    assert.equal(plan.operation, 'prepare');
    assert.equal(plan.targetVersion, '0.1.0-rc.1');
    assert.deepEqual(plan.profiles, [profile]);
  });

  it('prepares an RC correction through pending Changesets', async () => {
    const root = await fixture('0.1.0-rc.1', { mode: 'pre', tag: 'rc' }, ['fix.md']);
    const plan = await inspectPromotionPlan(root, { channel: 'rc' });
    assert.equal(plan.operation, 'correct');
    assert.equal(plan.targetVersion, '0.1.0-rc.2');
    assert.deepEqual(plan.profiles, [profile]);
  });

  it('stages an immutable RC for Gate A evidence without accepting gate inputs', async () => {
    const root = await fixture('0.1.0-rc.1', { mode: 'pre', tag: 'rc' });
    const plan = await inspectPromotionPlan(root, { channel: 'rc' });
    assert.equal(plan.operation, 'stage');
    assert.equal(plan.sourceVersion, '0.1.0-rc.1');
    assert.equal(plan.targetVersion, '0.1.0-rc.1');
    assert.deepEqual(plan.profiles, [profile]);
  });

  it('rejects profile overrides while staging an immutable RC', async () => {
    const root = await fixture('0.1.0-rc.1', { mode: 'pre', tag: 'rc' });
    await assert.rejects(
      inspectPromotionPlan(root, { channel: 'rc', profiles: profile }),
      /staging and corrections preserve/u,
    );
  });

  it('rejects feature-sized changes in the immutable RC correction lane', async () => {
    const root = await fixture('0.1.0-rc.1', { mode: 'pre', tag: 'rc' }, ['feature.md']);
    await writeFile(
      new URL('.changeset/feature.md', root),
      '---\n"@kumwe/studio-core": minor\n---\n\nfeature\n',
    );
    await assert.rejects(inspectPromotionPlan(root, { channel: 'rc' }), /patch-only Changesets/u);
  });

  it('publishes an immutable RC only with later evidence', async () => {
    const root = await fixture('0.1.0-rc.1', { mode: 'pre', tag: 'rc' });
    const plan = await inspectPromotionPlan(root, {
      candidateRecord: release('0.1.0-rc.1'),
      candidateSha: 'a'.repeat(40),
      channel: 'rc',
      evidenceSha: 'b'.repeat(40),
    });
    assert.equal(plan.operation, 'publish');
  });

  it('prepares stable only from a qualified RC and preserves claims', async () => {
    const root = await fixture('0.1.0-rc.2', { mode: 'pre', tag: 'rc' });
    const plan = await inspectPromotionPlan(root, {
      candidateRecord: release('0.1.0-rc.2'),
      candidateSha: 'a'.repeat(40),
      channel: 'stable',
      evidenceSha: 'b'.repeat(40),
    });
    assert.equal(plan.operation, 'prepare');
    assert.equal(plan.targetVersion, '0.1.0');
    assert.deepEqual(plan.profiles, [profile]);
  });

  it('rejects publication of an RC superseded by current main', async () => {
    const root = await fixture('0.1.0-rc.2', { mode: 'pre', tag: 'rc' });
    await assert.rejects(
      inspectPromotionPlan(root, {
        candidateRecord: release('0.1.0-rc.1'),
        candidateSha: 'a'.repeat(40),
        channel: 'rc',
        evidenceSha: 'b'.repeat(40),
      }),
      /supersedes or differs/u,
    );
  });
});

async function fixture(version, preState, changesets = []) {
  const directory = await mkdtemp(join(tmpdir(), 'studio-promotion-plan-'));
  temporaryDirectories.push(directory);
  const root = pathToFileURL(`${directory}/`);
  await mkdir(new URL('.changeset/', root), { recursive: true });
  await writeFile(new URL('.changeset/README.md', root), 'fixture\n');
  if (preState !== undefined) {
    await writeFile(new URL('.changeset/pre.json', root), `${JSON.stringify(preState)}\n`);
  }
  await Promise.all(
    changesets.map((name) =>
      writeFile(
        new URL(`.changeset/${name}`, root),
        '---\n"@kumwe/studio-core": patch\n---\n\nfixture\n',
      ),
    ),
  );
  const document = release(version);
  await writeFile(new URL('studio-release.json', root), `${JSON.stringify(document)}\n`);
  return root;
}

function release(version) {
  return {
    claimedProfiles: version.includes('-alpha.') ? [] : [profile],
    packages: Object.fromEntries(STUDIO_RELEASE_PACKAGE_NAMES.map((name) => [name, version])),
    release: version,
  };
}
