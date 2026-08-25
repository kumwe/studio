import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { afterEach, describe, it } from 'node:test';

import { formatGitHubOutput, inspectReleasePlan } from '../release-plan.mjs';

const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe('release plan inspection', () => {
  it('selects versioning when top-level changesets remain', async () => {
    const root = await fixture({
      changesets: ['zulu.md', 'alpha.md', 'README.md'],
      preState: { mode: 'pre', tag: 'alpha' },
    });

    assert.deepEqual(await inspectReleasePlan(root), {
      channel: 'alpha',
      hasPendingChangesets: true,
      operation: 'version',
      pendingChangesets: ['alpha', 'zulu'],
      preMode: 'pre',
    });
  });

  it('selects publication after changesets have moved into pre history', async () => {
    const root = await fixture({
      changesets: ['README.md'],
      preState: { mode: 'pre', tag: 'alpha' },
    });
    await mkdir(new URL('.changeset/pre/', root), { recursive: true });
    await writeFile(new URL('.changeset/pre/consumed.md', root), 'already consumed\n');

    const plan = await inspectReleasePlan(root);
    assert.equal(plan.operation, 'publish');
    assert.equal(plan.hasPendingChangesets, false);
    assert.equal(
      formatGitHubOutput(plan),
      'channel=alpha\nhas_pending_changesets=false\noperation=publish\npre_mode=pre',
    );
  });

  it('rejects a malformed prerelease state', async () => {
    const root = await fixture({ changesets: [], preState: { mode: 'unknown', tag: 'alpha' } });

    await assert.rejects(inspectReleasePlan(root), /mode must be "pre" or "exit"/u);
  });
});

async function fixture({ changesets, preState }) {
  const directory = await mkdtemp(join(tmpdir(), 'studio-release-plan-'));
  temporaryDirectories.push(directory);
  const root = pathToFileURL(`${directory}/`);
  await mkdir(new URL('.changeset/', root), { recursive: true });
  await writeFile(new URL('.changeset/pre.json', root), `${JSON.stringify(preState)}\n`);
  await Promise.all(
    changesets.map((name) => writeFile(new URL(`.changeset/${name}`, root), 'fixture\n')),
  );
  return root;
}
