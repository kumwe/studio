import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { assertLiveMain } from './reconcile-release-tag.mjs';
import { STUDIO_RELEASE_PACKAGES } from './release-family.mjs';

const execFileAsync = promisify(execFile);
const repositoryRoot = new URL('../', import.meta.url);
const prereleaseVersionPattern =
  /^(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u;

export function isErroneousPrereleaseLatest(version) {
  return typeof version === 'string' && prereleaseVersionPattern.test(version);
}

export async function reconcileBetaTags(
  packages,
  { addTag = addNpmTag, npmValue = readNpmValue, removeTag = removeNpmTag } = {},
) {
  const failures = [];
  const latestRemoved = [];
  const latestRetained = [];
  const moved = [];
  const unchanged = [];
  const unpublished = [];

  for (const { name, version } of packages) {
    if ((await npmValue(['view', `${name}@${version}`, 'version'])) !== version) {
      unpublished.push(`${name}@${version}`);
      continue;
    }

    const latest = await npmValue(['view', name, 'dist-tags.latest']);
    if (isErroneousPrereleaseLatest(latest)) {
      try {
        await removeTag(name, 'latest');
        latestRemoved.push(`${name}@${latest}`);
      } catch (error) {
        // The public registry refuses to delete the latest dist-tag outright
        // (403 on DELETE), so an all-prerelease family cannot shed the tag
        // npm assigned on first publish. A refusal that provably left the
        // tag exactly where it was is registry policy, not drift; any other
        // removal failure still blocks reconciliation.
        if ((await npmValue(['view', name, 'dist-tags.latest'])) === latest) {
          latestRetained.push(`${name}@${latest}`);
        } else {
          failures.push(
            `${name} latest: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    }

    const current = await npmValue(['view', name, 'dist-tags.beta']);
    if (current === version) {
      unchanged.push(`${name}@${version}`);
      continue;
    }
    try {
      await addTag(name, version, 'beta');
      moved.push(`${name}: ${current ?? 'none'} -> ${version}`);
    } catch (error) {
      failures.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (failures.length > 0) {
    throw new Error(`Could not reconcile beta registry tags:\n- ${failures.join('\n- ')}`);
  }
  return { latestRemoved, latestRetained, moved, unchanged, unpublished };
}

async function readNpmValue(arguments_) {
  const { stdout } = await execFileAsync('npm', arguments_, { maxBuffer: 1_024 * 1_024 });
  const value = stdout.trim();
  return value.length > 0 ? value : undefined;
}

async function addNpmTag(name, version, tag) {
  await execFileAsync('npm', ['dist-tag', 'add', `${name}@${version}`, tag]);
}

async function removeNpmTag(name, tag) {
  await execFileAsync('npm', ['dist-tag', 'rm', name, tag]);
}

async function main() {
  if (process.argv.length !== 2) {
    throw new Error('Usage: node scripts/reconcile-beta-tag.mjs');
  }
  await assertLiveMain(process.env.STUDIO_EXPECTED_MAIN_SHA);
  const packages = await Promise.all(
    STUDIO_RELEASE_PACKAGES.map(async ({ directory, name }) => {
      const manifest = JSON.parse(
        await readFile(new URL(`packages/${directory}/package.json`, repositoryRoot), 'utf8'),
      );
      if (manifest.name !== name || typeof manifest.version !== 'string') {
        throw new Error(`Package manifest ${directory} does not identify ${name}.`);
      }
      return { name, version: manifest.version };
    }),
  );
  const result = await reconcileBetaTags(packages);
  for (const line of result.latestRemoved) {
    console.log(`Removed erroneous prerelease latest ${line}`);
  }
  for (const line of result.latestRetained) {
    console.warn(`Registry refused to delete prerelease latest ${line}; tag retained`);
  }
  for (const line of result.moved) {
    console.log(`Moved beta ${line}`);
  }
  for (const line of result.unpublished) {
    console.log(`Skipped ${line}: not on the registry yet`);
  }
  console.log(
    `Beta tags reconciled: ${result.moved.length} moved, ${result.unchanged.length} already correct, ` +
      `${result.latestRemoved.length} prerelease latest removed, ` +
      `${result.latestRetained.length} retained by registry policy, ${result.unpublished.length} unpublished.`,
  );
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
