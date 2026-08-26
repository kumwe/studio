import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  assertPromotionEvidencePolicy,
  nextRcVersion,
  parseProfileInput,
  promotionTargetVersion,
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
  it('resets the prerelease counter for alpha.9 -> rc.1', () => {
    assert.equal(promotionTargetVersion('rc', '0.1.0-alpha.9'), '0.1.0-rc.1');
    assert.notEqual(promotionTargetVersion('rc', '0.1.0-alpha.9'), '0.1.0-rc.10');
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
});
