import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  assertOfficialRegistryPreflight,
  assertPromotionPublication,
} from '../publish-promotion.mjs';
import { STUDIO_RELEASE_PACKAGE_NAMES } from '../release-family.mjs';

describe('promotion publication guard', () => {
  it('accepts coordinated RC state without invoking Changesets publication', () => {
    assert.doesNotThrow(() =>
      assertPromotionPublication({
        channel: 'rc',
        pendingChangesets: [],
        preState: { mode: 'pre', tag: 'rc' },
        releaseRecord: record('0.1.0-rc.1'),
      }),
    );
  });

  it('requires an RC to exist in quarantine before official channel mutation', () => {
    assert.doesNotThrow(() => assertOfficialRegistryPreflight('rc', { failures: [], missing: [] }));
    assert.throws(
      () =>
        assertOfficialRegistryPreflight('rc', {
          failures: [],
          missing: ['@kumwe/studio-core@0.1.0-rc.1'],
        }),
      /quarantine staging first/u,
    );
    assert.doesNotThrow(() =>
      assertOfficialRegistryPreflight('stable', {
        failures: [],
        missing: ['@kumwe/studio-core@0.1.0'],
      }),
    );
  });

  it('accepts coordinated stable state only after prerelease mode exits', () => {
    assert.doesNotThrow(() =>
      assertPromotionPublication({
        channel: 'stable',
        pendingChangesets: [],
        preState: undefined,
        releaseRecord: record('0.1.0'),
      }),
    );
    assert.throws(
      () =>
        assertPromotionPublication({
          channel: 'stable',
          pendingChangesets: [],
          preState: { mode: 'pre', tag: 'rc' },
          releaseRecord: record('0.1.0'),
        }),
      /fully exited/u,
    );
  });
});

function record(version) {
  return {
    claimedProfiles: ['studio.profile/engine-core'],
    packages: Object.fromEntries(STUDIO_RELEASE_PACKAGE_NAMES.map((name) => [name, version])),
    release: version,
  };
}
