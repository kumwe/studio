import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { assertDevelopmentPublication } from '../publish-beta.mjs';
import { STUDIO_RELEASE_PACKAGE_NAMES } from '../release-family.mjs';

describe('beta development publication guard', () => {
  it('accepts one coordinated numeric beta release after versioning', () => {
    assert.doesNotThrow(() => assertDevelopmentPublication(record(), publishPlan()));
  });

  it('rejects alpha, release-candidate, and stable versions', () => {
    for (const version of ['0.1.0-alpha.1', '0.1.0-rc.1', '0.1.0']) {
      assert.throws(
        () => assertDevelopmentPublication(record(version), publishPlan()),
        /accepts only numeric beta versions/u,
      );
    }
  });

  it('rejects a staggered package family', () => {
    const release = record();
    release.packages['@kumwe/studio-protocol'] = '0.1.0-beta.8';

    assert.throws(() => assertDevelopmentPublication(release, publishPlan()), /version drift/u);
  });

  it('rejects the wrong channel or an unconsumed version plan', () => {
    assert.throws(
      () => assertDevelopmentPublication(record(), { ...publishPlan(), channel: 'rc' }),
      /restricted to Changesets beta pre mode/u,
    );
    assert.throws(
      () =>
        assertDevelopmentPublication(record(), {
          ...publishPlan(),
          hasPendingChangesets: true,
          operation: 'version',
        }),
      /no pending changesets/u,
    );
  });
});

function record(version = '0.1.0-beta.9') {
  return {
    release: version,
    packages: Object.fromEntries(STUDIO_RELEASE_PACKAGE_NAMES.map((name) => [name, version])),
  };
}

function publishPlan() {
  return {
    channel: 'beta',
    hasPendingChangesets: false,
    operation: 'publish',
    pendingChangesets: [],
    preMode: 'pre',
  };
}
