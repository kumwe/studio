import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { STUDIO_RELEASE_PACKAGE_NAMES } from '../release-family.mjs';
import { VERSION_TWO_RELEASE_PROFILES } from '../release-policy.mjs';
import { assertStagedCandidateState } from '../publish-staged-candidate.mjs';

const sha = 'a'.repeat(40);

describe('RC quarantine publication guard', () => {
  it('accepts only the exact coordinated RC source with no pending Changesets', () => {
    assert.doesNotThrow(() =>
      assertStagedCandidateState({
        actualSha: sha,
        channel: 'rc',
        expectedSha: sha,
        expectedVersion: '0.1.0-rc.1',
        pendingChangesets: [],
        preState: { mode: 'pre', tag: 'rc' },
        releaseRecord: record('0.1.0-rc.1'),
        workingTreeState: '',
      }),
    );
  });

  it('rejects stale commits, official stable staging, and pending corrections', () => {
    const input = {
      actualSha: sha,
      channel: 'rc',
      expectedSha: sha,
      expectedVersion: '0.1.0-rc.1',
      pendingChangesets: [],
      preState: { mode: 'pre', tag: 'rc' },
      releaseRecord: record('0.1.0-rc.1'),
      workingTreeState: '',
    };
    assert.throws(
      () => assertStagedCandidateState({ ...input, expectedSha: 'b'.repeat(40) }),
      /exact checked-out/u,
    );
    assert.throws(
      () => assertStagedCandidateState({ ...input, channel: 'stable' }),
      /only for the governed RC/u,
    );
    assert.throws(
      () => assertStagedCandidateState({ ...input, pendingChangesets: ['fix.md'] }),
      /consumed first/u,
    );
    assert.throws(
      () => assertStagedCandidateState({ ...input, workingTreeState: ' M package.json' }),
      /clean exact-source/u,
    );
  });
});

function record(version) {
  return {
    claimedProfiles: [...VERSION_TWO_RELEASE_PROFILES],
    packages: Object.fromEntries(STUDIO_RELEASE_PACKAGE_NAMES.map((name) => [name, version])),
    release: version,
  };
}
