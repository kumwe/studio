import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { assertAlphaPublication } from '../publish-alpha.mjs';
import { STUDIO_RELEASE_PACKAGE_NAMES } from '../release-family.mjs';

describe('alpha publication guard', () => {
  it('accepts one coordinated numeric alpha release after versioning', () => {
    assert.doesNotThrow(() => assertAlphaPublication(record(), publishPlan()));
  });

  it('rejects beta, release-candidate, and stable versions', () => {
    for (const version of ['0.1.0-beta.1', '0.1.0-rc.1', '0.1.0']) {
      assert.throws(
        () => assertAlphaPublication(record(version), publishPlan()),
        /accepts only numeric alpha versions/u,
      );
    }
  });

  it('rejects a staggered package family', () => {
    const release = record();
    release.packages['@kumwe/studio-protocol'] = '0.1.0-alpha.8';

    assert.throws(() => assertAlphaPublication(release, publishPlan()), /version drift/u);
  });

  it('rejects the wrong channel or an unconsumed version plan', () => {
    assert.throws(
      () => assertAlphaPublication(record(), { ...publishPlan(), channel: 'rc' }),
      /restricted to Changesets alpha pre mode/u,
    );
    assert.throws(
      () =>
        assertAlphaPublication(record(), {
          ...publishPlan(),
          hasPendingChangesets: true,
          operation: 'version',
        }),
      /no pending changesets/u,
    );
  });
});

function record(version = '0.1.0-alpha.9') {
  return {
    release: version,
    packages: Object.fromEntries(STUDIO_RELEASE_PACKAGE_NAMES.map((name) => [name, version])),
  };
}

function publishPlan() {
  return {
    channel: 'alpha',
    hasPendingChangesets: false,
    operation: 'publish',
    pendingChangesets: [],
    preMode: 'pre',
  };
}
