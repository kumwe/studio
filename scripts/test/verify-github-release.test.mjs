import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { collectGithubReleaseFailures } from '../verify-github-release.mjs';

const notes = '# Studio 0.1.0-rc.2\n\nImmutable release notes.\n';

function metadata(overrides = {}) {
  return {
    body: notes,
    isDraft: false,
    isPrerelease: true,
    name: 'Studio 0.1.0-rc.2',
    tagName: 'studio-v0.1.0-rc.2',
    ...overrides,
  };
}

describe('GitHub release recovery guard', () => {
  it('accepts only the exact immutable RC metadata', () => {
    assert.deepEqual(
      collectGithubReleaseFailures(metadata(), notes, {
        channel: 'rc',
        version: '0.1.0-rc.2',
      }),
      [],
    );
  });

  it('rejects a malformed existing release instead of silently reusing it', () => {
    const failures = collectGithubReleaseFailures(
      metadata({
        body: '# unrelated notes',
        isDraft: true,
        isPrerelease: false,
        name: 'Studio latest',
        tagName: 'studio-v0.1.0-rc.1',
      }),
      notes,
      { channel: 'rc', version: '0.1.0-rc.2' },
    );
    assert.equal(failures.length, 5);
    assert.match(failures.join('\n'), /tagName/);
    assert.match(failures.join('\n'), /name is/);
    assert.match(failures.join('\n'), /draft/);
    assert.match(failures.join('\n'), /prerelease/);
    assert.match(failures.join('\n'), /release notes/);
  });

  it('requires stable releases not to be marked prerelease', () => {
    const stableNotes = '# Studio 0.1.0\n';
    const failures = collectGithubReleaseFailures(
      {
        body: stableNotes,
        isDraft: false,
        isPrerelease: true,
        name: 'Studio 0.1.0',
        tagName: 'studio-v0.1.0',
      },
      stableNotes,
      { channel: 'stable', version: '0.1.0' },
    );
    assert.deepEqual(failures, ['prerelease state does not match stable']);
  });

  it('rejects even trailing release-note drift', () => {
    assert.deepEqual(
      collectGithubReleaseFailures(metadata({ body: `${notes} ` }), notes, {
        channel: 'rc',
        version: '0.1.0-rc.2',
      }),
      ['release notes differ from the generated immutable notes'],
    );
  });
});
