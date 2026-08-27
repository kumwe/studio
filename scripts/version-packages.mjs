import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { inspectReleasePlan } from './release-plan.mjs';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const changesetsCli = fileURLToPath(
  new URL('../node_modules/@changesets/cli/bin.js', import.meta.url),
);
const syncReleaseRecord = fileURLToPath(new URL('./sync-release-record.mjs', import.meta.url));
const checkReleaseRecord = fileURLToPath(new URL('./check-release-record.mjs', import.meta.url));

export async function resetReleaseProfileClaims(root = new URL('../', import.meta.url)) {
  await writeFile(
    new URL('release-profile-claims.json', root),
    '{\n  "kind": "studio-release-profile-claims",\n  "profiles": []\n}\n',
  );
}

export function prereleaseCommandsForPlan(plan) {
  if (plan.operation !== 'version' || plan.channel !== 'beta') {
    throw new Error('version-packages may run only for the governed beta development train.');
  }
  if (plan.preMode === 'reset') {
    return [
      ['pre', 'exit'],
      ['pre', 'enter', 'beta'],
    ];
  }
  if (plan.preMode === 'enter') {
    return [['pre', 'enter', 'beta']];
  }
  if (plan.preMode === 'pre') {
    return [];
  }
  throw new Error(`Unsupported beta prerelease mode ${plan.preMode}.`);
}

async function main() {
  const plan = await inspectReleasePlan(new URL('../', import.meta.url));
  const prereleaseCommands = prereleaseCommandsForPlan(plan);
  for (const arguments_ of prereleaseCommands) {
    run(process.execPath, [changesetsCli, ...arguments_]);
  }
  if (prereleaseCommands.length > 0) {
    await resetReleaseProfileClaims();
  }
  run(process.execPath, [changesetsCli, 'version']);
  run('npm', ['install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund']);
  run(process.execPath, [syncReleaseRecord]);
  run(process.execPath, [checkReleaseRecord, '--require-coordinated']);
}

function run(command, arguments_) {
  execFileSync(command, arguments_, { cwd: repositoryRoot, stdio: 'inherit' });
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
