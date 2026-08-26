import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  assertPromotionEvidencePolicy,
  nextRcVersion,
  parseProfileInput,
  promotionTargetVersion,
} from '../release-policy.mjs';

const profile = 'studio.profile/engine-core';

describe('governed release policy', () => {
  it('resets the prerelease counter for alpha.9 -> rc.1', () => {
    assert.equal(promotionTargetVersion('rc', '0.1.0-alpha.9'), '0.1.0-rc.1');
    assert.notEqual(promotionTargetVersion('rc', '0.1.0-alpha.9'), '0.1.0-rc.10');
  });

  it('advances corrections and removes the RC suffix for stable', () => {
    assert.equal(nextRcVersion('0.1.0-rc.1'), '0.1.0-rc.2');
    assert.equal(promotionTargetVersion('stable', '0.1.0-rc.2'), '0.1.0');
  });

  it('accepts only declared executable Version 2 profile claims', () => {
    assert.deepEqual(parseProfileInput(profile, { requireNonEmpty: true }), [profile]);
    assert.throws(
      () => parseProfileInput('studio.profile/authoring-web', { requireNonEmpty: true }),
      /currently executable/u,
    );
    assert.throws(() => parseProfileInput('', { requireNonEmpty: true }), /at least one/u);
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
          supportedProfiles: [profile],
        },
        releaseRecord: { claimedProfiles: [profile], release: '0.1.0-rc.1' },
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
            supportedProfiles: [profile],
          },
          releaseRecord: { claimedProfiles: [profile], release: '0.1.0-rc.1' },
        }),
      /Gate B/u,
    );
  });
});
