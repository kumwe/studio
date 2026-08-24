import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const changesetsCli = fileURLToPath(
  new URL('../node_modules/@changesets/cli/bin.js', import.meta.url),
);
const syncReleaseRecord = fileURLToPath(new URL('./sync-release-record.mjs', import.meta.url));
const checkReleaseRecord = fileURLToPath(new URL('./check-release-record.mjs', import.meta.url));

run(process.execPath, [changesetsCli, 'version']);
run('npm', ['install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund']);
run(process.execPath, [syncReleaseRecord]);
run(process.execPath, [checkReleaseRecord, '--require-coordinated']);

function run(command, arguments_) {
  execFileSync(command, arguments_, { cwd: repositoryRoot, stdio: 'inherit' });
}
