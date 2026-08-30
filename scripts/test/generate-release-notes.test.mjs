import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { STUDIO_RELEASE_PACKAGE_NAMES } from '../release-family.mjs';
import { buildReleaseNotes } from '../generate-release-notes.mjs';

function release(version, claimedProfiles = []) {
  return {
    claimedProfiles,
    corpusManifestDigest: 'sha256-fixture',
    packages: Object.fromEntries(STUDIO_RELEASE_PACKAGE_NAMES.map((name) => [name, version])),
    protocolVersion: '0.1.0-draft.2',
    release: version,
  };
}

describe('immutable release notes', () => {
  it('describes beta as incomplete and binds it to the verified publication source', () => {
    const source = 'a'.repeat(40);
    const notes = buildReleaseNotes(release('0.1.0-beta.2'), {
      candidateSha: source,
      channel: 'beta',
    });
    assert.match(notes, /Coordinated beta development release/u);
    assert.ok(notes.includes(`Publication source: \`${source}\``));
    assert.match(notes, /None; beta carries no conformance claim/u);
    assert.match(notes, /not Gate A\/B evidence or an RC claim/u);
    assert.doesNotMatch(notes, /Gate\/evidence record/u);
  });

  it('still requires an exact gate record for official RC notes', () => {
    assert.throws(
      () =>
        buildReleaseNotes(release('0.1.0-rc.2', ['studio.profile/authoring-web']), {
          candidateSha: 'a'.repeat(40),
          channel: 'rc',
        }),
      /immutable commits/u,
    );
  });
});
