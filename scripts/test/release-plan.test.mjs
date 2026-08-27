import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { afterEach, describe, it } from 'node:test';

import { STUDIO_PRODUCT_REQUIREMENTS } from '../release-policy.mjs';
import { formatGitHubOutput, inspectReleasePlan } from '../release-plan.mjs';
import { prereleaseCommandsForPlan } from '../version-packages.mjs';

const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe('release plan inspection', () => {
  it('selects versioning when top-level changesets remain', async () => {
    const root = await fixture({
      changesets: ['zulu.md', 'beta.md', 'README.md'],
      preState: { mode: 'pre', tag: 'beta' },
    });

    assert.deepEqual(await inspectReleasePlan(root), {
      channel: 'beta',
      hasPendingChangesets: true,
      operation: 'version',
      pendingChangesets: ['beta', 'zulu'],
      preMode: 'pre',
    });
  });

  it('selects publication after changesets have moved into pre history', async () => {
    const root = await fixture({
      changesets: ['README.md'],
      preState: { mode: 'pre', tag: 'beta' },
    });
    await mkdir(new URL('.changeset/pre/', root), { recursive: true });
    await writeFile(new URL('.changeset/pre/consumed.md', root), 'already consumed\n');

    const plan = await inspectReleasePlan(root);
    assert.equal(plan.operation, 'publish');
    assert.equal(plan.hasPendingChangesets, false);
    assert.equal(
      formatGitHubOutput(plan),
      'channel=beta\nhas_pending_changesets=false\noperation=publish\npre_mode=pre',
    );
  });

  it('rejects a malformed prerelease state', async () => {
    const root = await fixture({ changesets: [], preState: { mode: 'unknown', tag: 'beta' } });

    await assert.rejects(inspectReleasePlan(root), /mode must be "pre" or "exit"/u);
  });

  it('pauses cleanly while the governed RC train is active', async () => {
    const root = await fixture({
      changesets: ['fix.md'],
      preState: { mode: 'pre', tag: 'rc' },
      productState: 'repository-verified',
    });
    const plan = await inspectReleasePlan(root);
    assert.equal(plan.operation, 'inactive');
    assert.equal(plan.channel, 'rc');
  });

  it('moves an incomplete abandoned RC into beta through generated versioning', async () => {
    const root = await fixture({
      changesets: ['runtime.md'],
      preState: { mode: 'pre', tag: 'rc' },
    });
    const plan = await inspectReleasePlan(root);
    assert.deepEqual(plan, {
      channel: 'beta',
      hasPendingChangesets: true,
      operation: 'version',
      pendingChangesets: ['runtime'],
      preMode: 'reset',
    });
    assert.deepEqual(prereleaseCommandsForPlan(plan), [
      ['pre', 'exit'],
      ['pre', 'enter', 'beta'],
    ]);
  });

  it('opens the next beta train when a post-stable Changeset arrives', async () => {
    const root = await fixture({ changesets: ['next.md'], preState: undefined });
    assert.deepEqual(await inspectReleasePlan(root), {
      channel: 'beta',
      hasPendingChangesets: true,
      operation: 'version',
      pendingChangesets: ['next'],
      preMode: 'enter',
    });
  });

  it('is inactive after stable while there is no release intent', async () => {
    const root = await fixture({ changesets: [], preState: undefined });
    const plan = await inspectReleasePlan(root);
    assert.equal(plan.operation, 'inactive');
    assert.equal(plan.preMode, 'none');
  });
});

async function fixture({ changesets, preState, productState = 'active' }) {
  const directory = await mkdtemp(join(tmpdir(), 'studio-release-plan-'));
  temporaryDirectories.push(directory);
  const root = pathToFileURL(`${directory}/`);
  await mkdir(new URL('.changeset/', root), { recursive: true });
  if (preState !== undefined) {
    await writeFile(new URL('.changeset/pre.json', root), `${JSON.stringify(preState)}\n`);
  }
  if (preState?.tag === 'rc') {
    await mkdir(new URL('docs/roadmap/', root), { recursive: true });
    await writeFile(new URL('docs/roadmap/STATUS.md', root), productStatus(productState));
  }
  await Promise.all(
    changesets.map((name) => writeFile(new URL(`.changeset/${name}`, root), 'fixture\n')),
  );
  return root;
}

function productStatus(state) {
  return [
    '<!-- studio-product-implementation:start -->',
    ...STUDIO_PRODUCT_REQUIREMENTS.map((id) => `| \`${id}\` | \`${state}\` | fixture proof |`),
    '<!-- studio-product-implementation:end -->',
  ].join('\n');
}
