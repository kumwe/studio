import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

import { STUDIO_RELEASE_PACKAGES } from './release-family.mjs';
import { classifyReleaseVersion } from './release-policy.mjs';

const execFileAsync = promisify(execFile);
const repositoryRoot = new URL('../', import.meta.url);

export function tagForChannel(channel) {
  if (channel === 'rc') {
    return 'rc';
  }
  if (channel === 'stable') {
    return 'latest';
  }
  throw new Error(`Release tag channel must be rc or stable; received ${String(channel)}.`);
}

export async function assertLiveMain(
  expectedMainSha,
  { readRemoteMain = readLiveRemoteMain } = {},
) {
  if (!/^[a-f0-9]{40}$/u.test(expectedMainSha ?? '')) {
    throw new Error('STUDIO_EXPECTED_MAIN_SHA must be an exact lowercase commit SHA.');
  }
  const remoteMain = await readRemoteMain();
  if (remoteMain !== expectedMainSha) {
    throw new Error('Live origin/main moved before the official release channel mutation.');
  }
}

async function main() {
  if (process.argv.length !== 2) {
    throw new Error('Usage: node scripts/reconcile-release-tag.mjs');
  }
  const channel = process.env.PROMOTION_CHANNEL;
  const tag = tagForChannel(channel);
  const expectedVersion = process.env.STUDIO_EXPECTED_RELEASE_VERSION;
  const expectedMainSha = process.env.STUDIO_EXPECTED_MAIN_SHA;
  if (expectedVersion === undefined || expectedVersion.length === 0) {
    throw new Error('STUDIO_EXPECTED_RELEASE_VERSION is required.');
  }
  await assertLiveMain(expectedMainSha);
  const failures = [];
  const moved = [];
  const unchanged = [];

  for (const { directory, name } of STUDIO_RELEASE_PACKAGES) {
    const manifest = JSON.parse(
      await readFile(new URL(`packages/${directory}/package.json`, repositoryRoot), 'utf8'),
    );
    if (manifest.version !== expectedVersion) {
      throw new Error(
        `${name}@${String(manifest.version)} does not match planned coordinate ${expectedVersion}.`,
      );
    }
    if (classifyReleaseVersion(manifest.version) !== channel) {
      throw new Error(`${name}@${String(manifest.version)} does not belong to ${channel}.`);
    }
    if ((await npmValue(['view', `${name}@${manifest.version}`, 'version'])) !== manifest.version) {
      failures.push(`${name}@${manifest.version} is absent from npm`);
      continue;
    }
    const current = await npmValue(['view', name, `dist-tags.${tag}`]);
    if (current === manifest.version) {
      unchanged.push(`${name}@${manifest.version}`);
      continue;
    }
    try {
      await execFileAsync('npm', ['dist-tag', 'add', `${name}@${manifest.version}`, tag]);
      moved.push(`${name}: ${current ?? 'none'} -> ${manifest.version}`);
    } catch (error) {
      failures.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  for (const line of moved) {
    console.log(`Moved ${tag} ${line}`);
  }
  if (failures.length > 0) {
    throw new Error(`Could not reconcile the ${tag} dist-tag:\n${failures.join('\n')}`);
  }
  console.log(
    `${tag} dist-tag reconciled across eight packages: ${moved.length} moved, ` +
      `${unchanged.length} already correct.`,
  );
}

async function npmValue(arguments_) {
  try {
    const { stdout } = await execFileAsync('npm', arguments_, { maxBuffer: 1_024 * 1_024 });
    const value = stdout.trim();
    return value.length > 0 ? value : undefined;
  } catch {
    return undefined;
  }
}

async function readLiveRemoteMain() {
  const { stdout } = await execFileAsync(
    'git',
    ['ls-remote', '--exit-code', 'origin', 'refs/heads/main'],
    { cwd: repositoryRoot, maxBuffer: 64 * 1024 },
  );
  const match = /^([a-f0-9]{40})\trefs\/heads\/main\n?$/u.exec(stdout);
  if (match === null) {
    throw new Error('The live origin main ref could not be resolved exactly.');
  }
  return match[1];
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
