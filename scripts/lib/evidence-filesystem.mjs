import { constants } from 'node:fs';
import { copyFile, lstat, mkdir, readdir, realpath, rm } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

export const MAX_EVIDENCE_ARTIFACT_BYTES = 10 * 1_024 * 1_024;
export const MAX_EVIDENCE_TOTAL_BYTES = 150 * 1_024 * 1_024;

export function addEvidenceArtifactSize(currentBytes, artifactBytes, label) {
  if (!Number.isSafeInteger(artifactBytes) || artifactBytes < 0) {
    throw new Error(`${label} has an invalid artifact size.`);
  }
  if (artifactBytes > MAX_EVIDENCE_ARTIFACT_BYTES) {
    throw new Error(`${label} exceeds the 10 MiB per-artifact limit.`);
  }
  const next = currentBytes + artifactBytes;
  if (!Number.isSafeInteger(next) || next > MAX_EVIDENCE_TOTAL_BYTES) {
    throw new Error('Evidence artifacts exceed the 150 MiB bundle limit.');
  }
  return next;
}

export async function assertContainedRegularDirectory(
  directory,
  repositoryRoot,
  label,
  { create = false } = {},
) {
  if (create) {
    try {
      await mkdir(directory, { mode: 0o700 });
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
    }
  }
  const relativeDirectory = relative(resolve(repositoryRoot), resolve(directory));
  if (!isContainedRelative(relativeDirectory) || relativeDirectory === '') {
    throw new Error(`${label} must be a repository-contained child directory.`);
  }
  let current = resolve(repositoryRoot);
  for (const segment of relativeDirectory.split(sep)) {
    current = resolve(current, segment);
    const stat = await lstat(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw new Error(`${label} and every ancestor must be regular, non-symlink directories.`);
    }
  }
  const [resolvedRepository, resolvedDirectory] = await Promise.all([
    realpath(repositoryRoot),
    realpath(directory),
  ]);
  if (!isContainedRelative(relative(resolvedRepository, resolvedDirectory))) {
    throw new Error(`${label} resolves outside the repository.`);
  }
}

export async function assertSafeAbsentTarget(target, expectedParent, repositoryRoot, label) {
  if (resolve(dirname(target)) !== resolve(expectedParent)) {
    throw new Error(`${label} target must be a direct child of its protected parent.`);
  }
  await assertContainedRegularDirectory(expectedParent, repositoryRoot, `${label} parent`);
  try {
    await lstat(target);
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }
  const error = new Error(`${label} target ${target} already exists and is immutable.`);
  error.code = 'EEXIST';
  throw error;
}

export function evidenceBundleLockPath(stagingParent, bundleId) {
  return join(stagingParent, `evidence-${bundleId}.lock`);
}

export async function finalizeEvidenceBundleNoReplace(
  stagingDirectory,
  target,
  expectedParent,
  repositoryRoot,
  label,
  { copyFileImplementation = copyFile } = {},
) {
  await assertContainedRegularDirectory(
    stagingDirectory,
    repositoryRoot,
    `${label} staging directory`,
  );
  await assertSafeAbsentTarget(target, expectedParent, repositoryRoot, label);
  const entries = await readdir(stagingDirectory, { withFileTypes: true });
  if (
    entries.length !== 2 ||
    entries.some(
      (entry) =>
        !['artifacts', 'manifest.json'].includes(entry.name) ||
        entry.isSymbolicLink() ||
        (entry.name === 'artifacts' ? !entry.isDirectory() : !entry.isFile()),
    )
  ) {
    throw new Error(`${label} staging directory has an invalid closed shape.`);
  }

  // mkdir is the no-replace publication reservation. Artifacts are copied with
  // COPYFILE_EXCL and manifest.json is copied last, so readers can never accept
  // a partial bundle and an empty-directory race cannot replace another actor.
  let ownsReservation = false;
  try {
    await mkdir(target, { mode: 0o700 });
    ownsReservation = true;
    await assertContainedRegularDirectory(target, repositoryRoot, label);
    await copyDirectoryNoReplace(
      join(stagingDirectory, 'artifacts'),
      join(target, 'artifacts'),
      repositoryRoot,
      label,
      copyFileImplementation,
    );
    await assertContainedRegularDirectory(target, repositoryRoot, label);
    await copyFileImplementation(
      join(stagingDirectory, 'manifest.json'),
      join(target, 'manifest.json'),
      constants.COPYFILE_EXCL,
    );
    await assertContainedRegularDirectory(target, repositoryRoot, label);
  } catch (error) {
    if (ownsReservation && !(await pathExists(join(target, 'manifest.json')))) {
      // Only the actor whose atomic mkdir succeeded may roll back, and never
      // remove a target whose publication marker (manifest.json) exists.
      await assertContainedRegularDirectory(target, repositoryRoot, label);
      await rm(target, { recursive: true });
    }
    throw error;
  }
}

async function copyDirectoryNoReplace(
  source,
  target,
  repositoryRoot,
  label,
  copyFileImplementation,
) {
  await assertContainedRegularDirectory(source, repositoryRoot, `${label} staging artifacts`);
  await mkdir(target, { mode: 0o700 });
  await assertContainedRegularDirectory(target, repositoryRoot, `${label} target artifacts`);
  const entries = (await readdir(source, { withFileTypes: true })).sort((left, right) =>
    left.name.localeCompare(right.name, 'en'),
  );
  for (const entry of entries) {
    if (entry.isSymbolicLink() || (!entry.isDirectory() && !entry.isFile())) {
      throw new Error(
        `${label} staging artifacts must contain only regular files and directories.`,
      );
    }
    const sourcePath = join(source, entry.name);
    const targetPath = join(target, entry.name);
    if (entry.isDirectory()) {
      await copyDirectoryNoReplace(
        sourcePath,
        targetPath,
        repositoryRoot,
        label,
        copyFileImplementation,
      );
    } else {
      await assertContainedRegularDirectory(dirname(targetPath), repositoryRoot, label);
      await copyFileImplementation(sourcePath, targetPath, constants.COPYFILE_EXCL);
    }
  }
}

async function pathExists(path) {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

function isContainedRelative(path) {
  return !isAbsolute(path) && path !== '..' && !path.startsWith(`..${sep}`);
}
