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

async function main() {
  if (process.argv.length !== 2) {
    throw new Error('Usage: node scripts/reconcile-release-tag.mjs');
  }
  const channel = process.env.PROMOTION_CHANNEL;
  const tag = tagForChannel(channel);
  const expectedVersion = process.env.STUDIO_EXPECTED_RELEASE_VERSION;
  if (expectedVersion === undefined || expectedVersion.length === 0) {
    throw new Error('STUDIO_EXPECTED_RELEASE_VERSION is required.');
  }
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

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
