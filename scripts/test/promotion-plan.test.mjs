import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, it } from 'node:test';

import { STUDIO_RELEASE_PACKAGE_NAMES } from '../release-family.mjs';
import { STUDIO_PRODUCT_REQUIREMENTS, VERSION_TWO_RELEASE_PROFILES } from '../release-policy.mjs';
import { inspectPromotionPlan } from '../promotion-plan.mjs';

const subsetProfile = 'studio.profile/engine-core';
const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe('promotion plan', () => {
  it('prepares the first RC from beta with the complete default claims', async () => {
    const root = await fixture('0.1.0-beta.9', { mode: 'pre', tag: 'beta' });
    const plan = await inspectPromotionPlan(root, { channel: 'rc' });
    assert.equal(plan.operation, 'prepare');
    assert.equal(plan.targetVersion, '0.1.0-rc.2');
    assert.deepEqual(plan.profiles, VERSION_TWO_RELEASE_PROFILES);
  });

  it('rejects a subset override while preparing the first RC', async () => {
    const root = await fixture('0.1.0-beta.9', { mode: 'pre', tag: 'beta' });
    await assert.rejects(
      inspectPromotionPlan(root, { channel: 'rc', profiles: subsetProfile }),
      /complete fixed Version 2 set/u,
    );
  });

  it('prepares an RC correction through pending Changesets', async () => {
    const root = await fixture('0.1.0-rc.1', { mode: 'pre', tag: 'rc' }, ['fix.md']);
    const plan = await inspectPromotionPlan(root, { channel: 'rc' });
    assert.equal(plan.operation, 'correct');
    assert.equal(plan.targetVersion, '0.1.0-rc.2');
    assert.deepEqual(plan.profiles, VERSION_TWO_RELEASE_PROFILES);
  });

  it('stages an immutable RC for Gate A evidence without accepting gate inputs', async () => {
    const root = await fixture('0.1.0-rc.1', { mode: 'pre', tag: 'rc' });
    const plan = await inspectPromotionPlan(root, { channel: 'rc' });
    assert.equal(plan.operation, 'stage');
    assert.equal(plan.sourceVersion, '0.1.0-rc.1');
    assert.equal(plan.targetVersion, '0.1.0-rc.1');
    assert.deepEqual(plan.profiles, VERSION_TWO_RELEASE_PROFILES);
  });

  it('rejects profile overrides while staging an immutable RC', async () => {
    const root = await fixture('0.1.0-rc.1', { mode: 'pre', tag: 'rc' });
    await assert.rejects(
      inspectPromotionPlan(root, { channel: 'rc', profiles: subsetProfile }),
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

  it('blocks RC preparation while any product requirement is incomplete', async () => {
    const root = await fixture('0.1.0-beta.9', { mode: 'pre', tag: 'beta' }, [], 'active');
    await assert.rejects(inspectPromotionPlan(root, { channel: 'rc' }), /STUDIO-PROD-001/u);
  });

  it('blocks RC preparation while authoring-web assertions remain target-only', async () => {
    const root = await fixture('0.1.0-beta.9', { mode: 'pre', tag: 'beta' });
    const assertions = profileAssertions();
    assertions.profiles.find(({ id }) => id === 'studio.profile/authoring-web').status = 'target';
    assertions.profiles.find(({ id }) => id === 'studio.profile/authoring-web').requiredInputs = [];
    assertions.profiles.find(({ id }) => id === 'studio.profile/authoring-web').requiredRuns = [];
    await writeFile(
      new URL('evidence/profile-assertions.json', root),
      `${JSON.stringify(assertions)}\n`,
    );

    await assert.rejects(
      inspectPromotionPlan(root, { channel: 'rc' }),
      /studio\.profile\/authoring-web/u,
    );
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
    assert.deepEqual(plan.profiles, VERSION_TWO_RELEASE_PROFILES);
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

async function fixture(version, preState, changesets = [], productState = 'repository-verified') {
  const directory = await mkdtemp(join(tmpdir(), 'studio-promotion-plan-'));
  temporaryDirectories.push(directory);
  const root = pathToFileURL(`${directory}/`);
  await mkdir(new URL('.changeset/', root), { recursive: true });
  await mkdir(new URL('docs/roadmap/', root), { recursive: true });
  await mkdir(new URL('evidence/', root), { recursive: true });
  await writeFile(new URL('docs/roadmap/STATUS.md', root), productStatus(productState));
  await writeFile(
    new URL('evidence/profile-assertions.json', root),
    `${JSON.stringify(profileAssertions())}\n`,
  );
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

function profileAssertions() {
  return {
    contractVersion: '0.1-draft',
    kind: 'profile-assertion-registry',
    profiles: VERSION_TWO_RELEASE_PROFILES.map((id) => ({
      id,
      requiredInputs: ['fixture.test.ts'],
      requiredRuns: ['unit/workspace'],
      status: 'executable',
    })),
  };
}

function release(version) {
  return {
    claimedProfiles: version.includes('-beta.') ? [] : [...VERSION_TWO_RELEASE_PROFILES],
    packages: Object.fromEntries(STUDIO_RELEASE_PACKAGE_NAMES.map((name) => [name, version])),
    release: version,
  };
}

function productStatus(state) {
  return [
    '<!-- studio-product-implementation:start -->',
    ...STUDIO_PRODUCT_REQUIREMENTS.map((id) => `| \`${id}\` | \`${state}\` | fixture proof |`),
    '<!-- studio-product-implementation:end -->',
  ].join('\n');
}
