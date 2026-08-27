import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import {
  assertApprovedReleaseArtifactFile,
  assertApprovedReleaseArtifactFiles,
  assertApprovedReleaseArtifacts,
} from './release-artifacts.mjs';
import { STUDIO_RELEASE_PACKAGES } from './release-family.mjs';
import { assertCoordinatedRelease } from './release-record.mjs';

const execFileAsync = promisify(execFile);
const repositoryRoot = new URL('../', import.meta.url);
const officialTags = new Set(['beta', 'rc', 'latest']);

export function stagingTagForVersion(version) {
  if (
    typeof version !== 'string' ||
    !/^(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)(?:-(?:beta|rc)\.(?:0|[1-9][0-9]*))?$/u.test(
      version,
    )
  ) {
    throw new Error(`Cannot derive a staging tag from release version ${String(version)}.`);
  }
  const tag = `studio-stage-${version.replaceAll('.', '-')}`;
  if (officialTags.has(tag)) {
    throw new Error(`Refusing to use official channel tag ${tag} for staging.`);
  }
  return tag;
}

export async function publishMissingApprovedArtifacts(
  record,
  approved,
  missing,
  {
    assertPublicationStillAuthorized,
    publishTarball = publishTarballWithNpm,
    root = repositoryRoot,
  } = {},
) {
  assertCoordinatedRelease(record);
  assertApprovedReleaseArtifacts(approved, record);
  const expectedCoordinates = new Set(
    STUDIO_RELEASE_PACKAGES.map(({ name }) => `${name}@${record.packages[name]}`),
  );
  if (
    !Array.isArray(missing) ||
    new Set(missing).size !== missing.length ||
    missing.some((coordinate) => !expectedCoordinates.has(coordinate))
  ) {
    throw new Error('Missing-package publication set is outside the coordinated release family.');
  }
  if (typeof assertPublicationStillAuthorized !== 'function') {
    throw new Error('Staged publication requires a live release-authorization callback.');
  }

  // Validate every retained tarball before the first registry mutation. Each
  // selected tarball is checked again immediately before its own upload.
  await assertApprovedReleaseArtifactFiles(approved, record, root);
  const missingSet = new Set(missing);
  const stagingTag = stagingTagForVersion(record.release);
  const published = [];
  for (const { name } of STUDIO_RELEASE_PACKAGES) {
    const version = record.packages[name];
    if (!missingSet.has(`${name}@${version}`)) {
      continue;
    }
    const artifact = approved.packages[name];
    await assertApprovedReleaseArtifactFile(artifact, name, root);
    await assertPublicationStillAuthorized();
    await publishTarball({
      name,
      stagingTag,
      tarballPath: fileURLToPath(new URL(artifact.path, root)),
      version,
    });
    published.push(`${name}@${version}`);
  }
  return { published, stagingTag };
}

export async function reconcileStagingTags(
  record,
  { addTag = addTagWithNpm, npmValue = readNpmValue } = {},
) {
  const preflight = await inspectStagingTags(record, { npmValue });
  if (preflight.failures.length > 0) {
    throw new Error(preflight.failures.join('\n'));
  }
  const added = [];
  for (const { name, version } of preflight.missing) {
    await addTag(name, version, preflight.stagingTag);
    added.push(`${name}@${version}`);
  }
  return { added, stagingTag: preflight.stagingTag };
}

export async function inspectStagingTags(record, { npmValue = readNpmValue } = {}) {
  assertCoordinatedRelease(record);
  const stagingTag = stagingTagForVersion(record.release);
  const failures = [];
  const missing = [];
  for (const { name } of STUDIO_RELEASE_PACKAGES) {
    const version = record.packages[name];
    const current = await npmValue(['view', name, `dist-tags.${stagingTag}`, '--json']);
    if (current === version) {
      continue;
    }
    if (current !== undefined && current !== null && current !== '') {
      failures.push(
        `${name} staging tag ${stagingTag} points to ${String(current)}, not ${version}; refusing to overwrite it.`,
      );
      continue;
    }
    missing.push({ name, version });
  }
  return { failures, missing, stagingTag };
}

async function publishTarballWithNpm({ name, stagingTag, tarballPath, version }) {
  const { stderr, stdout } = await execFileAsync(
    'npm',
    [
      'publish',
      tarballPath,
      '--tag',
      stagingTag,
      '--access',
      'public',
      '--provenance',
      '--ignore-scripts',
      '--workspaces=false',
    ],
    { maxBuffer: 5 * 1_024 * 1_024 },
  );
  if (stdout.length > 0) {
    process.stdout.write(stdout);
  }
  if (stderr.length > 0) {
    process.stderr.write(stderr);
  }
  console.log(`Staged ${name}@${version} on non-channel tag ${stagingTag}.`);
}

async function readNpmValue(arguments_) {
  try {
    const { stdout } = await execFileAsync('npm', arguments_, {
      maxBuffer: 2 * 1_024 * 1_024,
    });
    return stdout.trim().length === 0 ? undefined : JSON.parse(stdout);
  } catch (error) {
    if (/\bE404\b/u.test(`${error?.stderr ?? ''}\n${error?.stdout ?? ''}`)) {
      return undefined;
    }
    throw error;
  }
}

async function addTagWithNpm(name, version, tag) {
  await execFileAsync('npm', ['dist-tag', 'add', `${name}@${version}`, tag, '--workspaces=false'], {
    maxBuffer: 2 * 1_024 * 1_024,
  });
}
