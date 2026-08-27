import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

import {
  assertProductImplementationReady,
  assertPromotionEvidencePolicy,
  assertReleaseProfilesExecutable,
  nextRcVersion,
  parseProfileInput,
  parseProductImplementationStatus,
  promotionTargetVersion,
  STUDIO_PRODUCT_REQUIREMENTS,
  VERSION_TWO_RELEASE_PROFILES,
} from '../release-policy.mjs';

const completeProfiles = [
  'studio.profile/authoring-web',
  'studio.profile/binding-projection-v1',
  'studio.profile/engine-core',
  'studio.profile/host-baseline',
  'studio.profile/host-baseline-v2',
  'studio.profile/media-policy',
  'studio.profile/preview-identity-v1',
  'studio.profile/renderer-web',
  'studio.profile/schema-property',
];
const subsetProfile = 'studio.profile/engine-core';

describe('governed release policy', () => {
  it('resets the prerelease counter for beta.9 -> rc.1', () => {
    assert.equal(promotionTargetVersion('rc', '0.1.0-beta.9'), '0.1.0-rc.1');
    assert.notEqual(promotionTargetVersion('rc', '0.1.0-beta.9'), '0.1.0-rc.10');
  });

  it('advances corrections and removes the RC suffix for stable', () => {
    assert.equal(nextRcVersion('0.1.0-rc.1'), '0.1.0-rc.2');
    assert.equal(promotionTargetVersion('stable', '0.1.0-rc.2'), '0.1.0');
  });

  it('recognizes the fixed all-nine Version 2 release profile vocabulary', () => {
    assert.deepEqual(VERSION_TWO_RELEASE_PROFILES, completeProfiles);
    assert.deepEqual(
      parseProfileInput(completeProfiles.join(','), {
        requireComplete: true,
        requireNonEmpty: true,
      }),
      completeProfiles,
    );
    assert.throws(
      () => parseProfileInput('studio.profile/engine-dart', { requireNonEmpty: true }),
      /fixed Version 2 release profiles/u,
    );
  });

  it('rejects empty and partial promotion profile claims', () => {
    assert.throws(
      () =>
        parseProfileInput(subsetProfile, {
          requireComplete: true,
          requireNonEmpty: true,
        }),
      /complete fixed Version 2 set/u,
    );
    assert.throws(
      () => parseProfileInput('', { requireComplete: true, requireNonEmpty: true }),
      /fixed Version 2 profile claims/u,
    );
  });

  it('binds publication claims to a passing exact-candidate gate', () => {
    const candidateSha = 'a'.repeat(40);
    assert.doesNotThrow(() =>
      assertPromotionEvidencePolicy({
        candidateSha,
        channel: 'rc',
        gateRecord: {
          decision: 'pass',
          gate: 'A',
          sourceCommit: candidateSha,
          supportedProfiles: completeProfiles,
        },
        releaseRecord: { claimedProfiles: completeProfiles, release: '0.1.0-rc.1' },
      }),
    );
    assert.throws(
      () =>
        assertPromotionEvidencePolicy({
          candidateSha,
          channel: 'stable',
          gateRecord: {
            decision: 'pass',
            gate: 'A',
            sourceCommit: candidateSha,
            supportedProfiles: completeProfiles,
          },
          releaseRecord: { claimedProfiles: completeProfiles, release: '0.1.0-rc.1' },
        }),
      /Gate B/u,
    );
  });

  it('requires the closed 15-row implementation inventory before RC work', () => {
    const complete = productStatus();
    assert.equal(Object.keys(parseProductImplementationStatus(complete)).length, 15);
    assert.doesNotThrow(() => assertProductImplementationReady(complete));
    assert.throws(
      () =>
        assertProductImplementationReady(productStatus(new Map([['STUDIO-PROD-003', 'active']]))),
      /STUDIO-PROD-003/u,
    );
  });

  it('requires executable assertions for the complete fixed profile surface before RC work', () => {
    const complete = profileAssertions();
    assert.equal(Object.keys(assertReleaseProfilesExecutable(complete)).length, 9);

    const targetAuthoring = profileAssertions();
    targetAuthoring.profiles[0] = {
      id: 'studio.profile/authoring-web',
      requiredInputs: [],
      requiredRuns: [],
      status: 'target',
    };
    assert.throws(
      () => assertReleaseProfilesExecutable(targetAuthoring),
      /studio\.profile\/authoring-web/u,
    );

    const missing = profileAssertions();
    missing.profiles.pop();
    assert.throws(() => assertReleaseProfilesExecutable(missing), /missing/u);
  });

  it('parses the repository STATUS table after Markdown formatting pads its cells', async () => {
    const source = await readFile(new URL('../../docs/roadmap/STATUS.md', import.meta.url), 'utf8');
    const status = parseProductImplementationStatus(source);
    assert.deepEqual(Object.keys(status), STUDIO_PRODUCT_REQUIREMENTS);
    assert.ok(STUDIO_PRODUCT_REQUIREMENTS.every((id) => status[id].state === 'active'));
  });

  it('fails closed on missing, duplicate, and unknown implementation rows', () => {
    const complete = productStatus();
    assert.throws(
      () => parseProductImplementationStatus(complete.replace(/^\| `STUDIO-PROD-015`.*\n/mu, '')),
      /missing \[STUDIO-PROD-015\]/u,
    );
    assert.throws(
      () =>
        parseProductImplementationStatus(
          complete.replace(
            '<!-- studio-product-implementation:end -->',
            '| `STUDIO-PROD-001` | `repository-verified` | duplicate proof |\n<!-- studio-product-implementation:end -->',
          ),
        ),
      /repeats product requirement STUDIO-PROD-001/u,
    );
    assert.throws(
      () =>
        parseProductImplementationStatus(
          complete.replace(
            '<!-- studio-product-implementation:end -->',
            '| `STUDIO-PROD-016` | `repository-verified` | unknown proof |\n<!-- studio-product-implementation:end -->',
          ),
        ),
      /unknown \[STUDIO-PROD-016\]/u,
    );
  });
});

function productStatus(overrides = new Map()) {
  const rows = STUDIO_PRODUCT_REQUIREMENTS.map(
    (id) => `| \`${id}\` | \`${overrides.get(id) ?? 'repository-verified'}\` | fixture proof |`,
  );
  return [
    '<!-- studio-product-implementation:start -->',
    ...rows,
    '<!-- studio-product-implementation:end -->',
  ].join('\n');
}

function profileAssertions() {
  return {
    contractVersion: '0.1-draft',
    kind: 'profile-assertion-registry',
    profiles: completeProfiles.map((id) => ({
      id,
      requiredInputs: ['fixture.test.ts'],
      requiredRuns: ['unit/workspace'],
      status: 'executable',
    })),
  };
}
