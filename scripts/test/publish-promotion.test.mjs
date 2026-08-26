import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { changesetsPublishArguments } from '../publish-promotion.mjs';

describe('Changesets v3 promotion invocation', () => {
  it('lets prerelease mode select rc and uses an explicit latest tag only after pre mode exits', () => {
    assert.deepEqual(changesetsPublishArguments('rc'), []);
    assert.deepEqual(changesetsPublishArguments('stable'), ['--tag', 'latest']);
    assert.throws(() => changesetsPublishArguments('beta'), /rc or stable/u);
  });

  it('simulates the installed Changesets prerelease guard against a custom rc tag', async () => {
    const root = await mkdtemp(join(tmpdir(), 'studio-changesets-pre-'));
    try {
      await mkdir(join(root, '.changeset'));
      await Promise.all([
        writeFile(
          join(root, 'package.json'),
          `${JSON.stringify({ name: 'changesets-pre-fixture', version: '0.1.0-rc.1' })}\n`,
        ),
        writeFile(
          join(root, '.changeset', 'pre.json'),
          `${JSON.stringify({
            changesets: [],
            initialVersions: { 'changesets-pre-fixture': '0.1.0-alpha.9' },
            mode: 'pre',
            tag: 'rc',
          })}\n`,
        ),
      ]);
      const cliPackageUrl = import.meta.resolve('@changesets/cli/package.json');
      const { publish } = await import(new URL('dist/publish.mjs', cliPackageUrl));
      await assert.rejects(
        publish({ cwd: root, gitTag: false, tag: 'rc' }),
        /process exited with code: 1/u,
      );
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});
