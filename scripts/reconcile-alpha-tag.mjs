import { execFile } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { promisify } from 'node:util';

/*
 * Keep the alpha distribution tag pointing at what is actually published.
 *
 * A package that has never had a stable release is published to the latest tag
 * whatever prerelease mode says, so the alpha tag stops advancing after the
 * first publish and silently resolves to an old prerelease. This reconciles
 * the tag with each manifest's version instead of tagging one publish, so
 * drift left by an earlier run is repaired on the next run rather than
 * outliving it.
 */

const execFileAsync = promisify(execFile);
const packagesDirectory = new URL('../packages/', import.meta.url);
const failures = [];
const moved = [];
const unchanged = [];
const unpublished = [];

const entries = (await readdir(packagesDirectory, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

for (const entry of entries) {
  const manifest = JSON.parse(
    await readFile(new URL(`${entry}/package.json`, packagesDirectory), 'utf8'),
  );
  const { name, version } = manifest;
  if (manifest.private === true || typeof name !== 'string' || typeof version !== 'string') {
    continue;
  }

  if ((await npmValue(['view', `${name}@${version}`, 'version'])) !== version) {
    unpublished.push(`${name}@${version}`);
    continue;
  }

  const current = await npmValue(['view', name, 'dist-tags.alpha']);
  if (current === version) {
    unchanged.push(`${name}@${version}`);
    continue;
  }

  try {
    await execFileAsync('npm', ['dist-tag', 'add', `${name}@${version}`, 'alpha']);
    moved.push(`${name}: ${current ?? 'none'} -> ${version}`);
  } catch (error) {
    failures.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

for (const line of moved) {
  console.log(`Moved alpha ${line}`);
}
for (const line of unpublished) {
  console.log(`Skipped ${line}: not on the registry yet`);
}

if (failures.length > 0) {
  throw new Error(`Could not reconcile the alpha dist-tag:\n${failures.join('\n')}`);
}

console.log(
  `Alpha dist-tag reconciled: ${moved.length} moved, ${unchanged.length} already correct, ` +
    `${unpublished.length} not published.`,
);

/**
 * Read one npm registry field, treating any failure as an absent value.
 *
 * @param {readonly string[]} args npm arguments producing a single value.
 * @returns {Promise<string | undefined>} The trimmed value, or undefined.
 */
async function npmValue(args) {
  try {
    const { stdout } = await execFileAsync('npm', [...args], { maxBuffer: 1_024 * 1_024 });
    const value = stdout.trim();
    return value.length > 0 ? value : undefined;
  } catch {
    return undefined;
  }
}
