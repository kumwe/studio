import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { STUDIO_RELEASE_PACKAGES } from './release-family.mjs';
import { assertCoordinatedRelease } from './release-record.mjs';
import { stagingTagForVersion } from './staged-publish.mjs';

const execFileAsync = promisify(execFile);
const repositoryRoot = new URL('../', import.meta.url);

export async function cleanupStagingTags(
  record,
  { npmValue = readNpmValue, removeTag = removeNpmTag } = {},
) {
  assertCoordinatedRelease(record);
  const stagingTag = stagingTagForVersion(record.release);
  const failures = [];
  const removed = [];
  for (const { name } of STUDIO_RELEASE_PACKAGES) {
    const current = await npmValue(name, stagingTag);
    if (current === undefined) {
      continue;
    }
    if (current !== record.packages[name]) {
      failures.push(
        `${name} staging tag ${stagingTag} points to ${current}, not ${record.packages[name]}`,
      );
      continue;
    }
    try {
      await removeTag(name, stagingTag);
      removed.push(`${name}@${current}`);
    } catch (error) {
      failures.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (failures.length > 0) {
    throw new Error(`Could not safely clean the staging tag:\n- ${failures.join('\n- ')}`);
  }
  return { removed, stagingTag };
}

async function readNpmValue(name, tag) {
  const { stdout } = await execFileAsync('npm', ['view', name, `dist-tags.${tag}`], {
    maxBuffer: 1_024 * 1_024,
  });
  const value = stdout.trim();
  return value.length > 0 ? value : undefined;
}

async function removeNpmTag(name, tag) {
  await execFileAsync('npm', ['dist-tag', 'rm', name, tag], {
    maxBuffer: 1_024 * 1_024,
  });
}

async function main() {
  if (process.argv.length !== 2) {
    throw new Error('Usage: node scripts/cleanup-staging-tags.mjs');
  }
  const record = JSON.parse(await readFile(new URL('studio-release.json', repositoryRoot), 'utf8'));
  const result = await cleanupStagingTags(record);
  console.log(
    `Staging tag ${result.stagingTag} cleanup complete: ${result.removed.length} package tag(s) removed.`,
  );
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
