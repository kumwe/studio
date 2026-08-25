import { execFileSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { assertCoordinatedRelease } from './release-record.mjs';
import { assertPromotionPackageState } from './release-policy.mjs';
import { verifyReleaseGateFromEnvironment } from './verify-release-gate.mjs';

const repositoryRoot = new URL('../', import.meta.url);
const ignoredChangesetFiles = new Set(['AGENTS.md', 'CLAUDE.md', 'GEMINI.md', 'README.md']);

export function assertPromotionPublication(input) {
  assertCoordinatedRelease(input.releaseRecord);
  assertPromotionPackageState(input);
}

async function inspectPublicationState(root, channel) {
  const releaseRecord = JSON.parse(await readFile(new URL('studio-release.json', root), 'utf8'));
  const entries = await readdir(new URL('.changeset/', root), { withFileTypes: true });
  const pendingChangesets = entries
    .filter(
      (entry) =>
        entry.isFile() && entry.name.endsWith('.md') && !ignoredChangesetFiles.has(entry.name),
    )
    .map((entry) => entry.name)
    .sort();
  let preState;
  try {
    preState = JSON.parse(await readFile(new URL('.changeset/pre.json', root), 'utf8'));
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error;
    }
  }
  const state = { channel, pendingChangesets, preState, releaseRecord };
  assertPromotionPublication(state);
  return state;
}

async function main() {
  if (process.argv.length !== 2) {
    throw new Error('Usage: node scripts/publish-promotion.mjs');
  }
  await verifyReleaseGateFromEnvironment();
  const channel = process.env.PROMOTION_CHANNEL;
  const state = await inspectPublicationState(repositoryRoot, channel);
  const repositoryPath = fileURLToPath(repositoryRoot);
  const releaseCheck = fileURLToPath(new URL('./check-release-record.mjs', import.meta.url));
  const changesetsCli = fileURLToPath(
    new URL('../node_modules/@changesets/cli/bin.js', import.meta.url),
  );

  execFileSync(process.execPath, [releaseCheck, '--require-coordinated'], {
    cwd: repositoryPath,
    stdio: 'inherit',
  });
  execFileSync(
    process.execPath,
    [changesetsCli, 'publish', '--tag', channel === 'stable' ? 'latest' : 'rc'],
    { cwd: repositoryPath, stdio: 'inherit' },
  );
  console.log(`Publication attempted for ${state.releaseRecord.release} on ${channel}.`);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
