import { execFile } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { STUDIO_RELEASE_PACKAGES } from './release-family.mjs';
import { assertCoordinatedRelease } from './release-record.mjs';
import { isPromotionVersionTransition } from './release-policy.mjs';

const execFileAsync = promisify(execFile);
const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const changesetDirectory = new URL('../.changeset/', import.meta.url);
const dependencyFields = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
];
const releasePackageNames = new Set(STUDIO_RELEASE_PACKAGES.map(({ name }) => name));

const unconsumedChangesets = await listUnconsumedChangesets();
const baseRef = await resolveBaseRef();

if (baseRef === undefined) {
  console.log(
    'Changeset check skipped: no release base is available ' +
      '(no origin/main and no CHANGESETS_BASE_REF).',
  );
} else if (await consumesChangesets(baseRef)) {
  // The version pull request produced by the release train deletes the
  // changesets it applies while bumping the manifests it covers; that diff is
  // the one legitimate publishable change with no unconsumed changeset left.
  console.log(
    'Changeset check skipped: this change consumes changesets, which is the release train itself.',
  );
} else {
  const changedPaths = await listChangedPaths(baseRef);
  const publishablePaths = changedPaths.filter((path) => isPublishablePath(path)).sort();
  if (publishablePaths.length === 0) {
    console.log(`Changeset check passed: no publishable changes relative to ${baseRef}.`);
  } else if (await isGovernedPromotion(baseRef, publishablePaths)) {
    console.log(
      `Changeset check passed: the fixed eight-package family is undergoing a generated governed promotion relative to ${baseRef}.`,
    );
  } else if (unconsumedChangesets.length > 0) {
    console.log(
      `Changeset check passed: ${publishablePaths.length} publishable path(s) changed relative ` +
        `to ${baseRef} and ${unconsumedChangesets.length} unconsumed changeset(s) cover them.`,
    );
  } else {
    throw new Error(
      `Publishable paths changed relative to ${baseRef} without an unconsumed changeset:\n` +
        `${publishablePaths.map((path) => `  ${path}`).join('\n')}\n` +
        'Add one with: npx changeset',
    );
  }
}

async function isGovernedPromotion(base, publishablePaths) {
  const expectedPaths = STUDIO_RELEASE_PACKAGES.map(
    ({ directory }) => `packages/${directory}/package.json`,
  ).sort();
  if (publishablePaths.join('\n') !== expectedPaths.join('\n')) {
    return false;
  }
  try {
    const source = JSON.parse(await git(['show', `${base}:studio-release.json`]));
    const target = JSON.parse(await readFile(new URL('../studio-release.json', import.meta.url)));
    assertCoordinatedRelease(source);
    assertCoordinatedRelease(target);
    if (!isPromotionVersionTransition(source.release, target.release)) {
      return false;
    }
    for (const { directory } of STUDIO_RELEASE_PACKAGES) {
      const path = `packages/${directory}/package.json`;
      const before = JSON.parse(await git(['show', `${base}:${path}`]));
      const after = JSON.parse(await readFile(new URL(`../${path}`, import.meta.url)));
      after.version = source.release;
      for (const field of dependencyFields) {
        for (const name of Object.keys(after[field] ?? {})) {
          if (releasePackageNames.has(name) && after[field][name] === target.release) {
            after[field][name] = source.release;
          }
        }
      }
      if (JSON.stringify(after) !== JSON.stringify(before)) {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

async function git(args) {
  const { stdout } = await execFileAsync('git', args, {
    cwd: repositoryRoot,
    maxBuffer: 10 * 1_024 * 1_024,
  });
  return stdout;
}

async function tryResolveCommit(ref) {
  try {
    return (await git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`])).trim();
  } catch {
    return undefined;
  }
}

async function resolveBaseRef() {
  const configured = process.env.CHANGESETS_BASE_REF;
  if (configured !== undefined && configured.length > 0) {
    if ((await tryResolveCommit(configured)) === undefined) {
      throw new Error(
        `CHANGESETS_BASE_REF "${configured}" does not resolve to a commit in this repository.`,
      );
    }
    return configured;
  }
  if ((await tryResolveCommit('origin/main')) !== undefined) {
    return 'origin/main';
  }
  return undefined;
}

async function listChangedPaths(base) {
  const paths = new Set();
  const head = (await git(['rev-parse', 'HEAD'])).trim();
  if ((await tryResolveCommit(base)) !== head) {
    let mergeBase;
    try {
      mergeBase = (await git(['merge-base', base, 'HEAD'])).trim();
    } catch {
      throw new Error(
        `Unable to compute the merge base of ${base} and HEAD; fetch the full history ` +
          '(for example checkout with fetch-depth: 0) or set CHANGESETS_BASE_REF.',
      );
    }
    for (const line of (await git(['diff', '--name-only', `${mergeBase}..HEAD`])).split('\n')) {
      if (line.length > 0) {
        paths.add(line);
      }
    }
  }
  for (const line of (await git(['status', '--porcelain'])).split('\n')) {
    if (line.length < 4) {
      continue;
    }
    let path = line.slice(3);
    const renameSeparator = path.indexOf(' -> ');
    if (renameSeparator >= 0) {
      path = path.slice(renameSeparator + 4);
    }
    if (path.startsWith('"') && path.endsWith('"')) {
      path = path.slice(1, -1);
    }
    paths.add(path);
  }
  return [...paths];
}

async function consumesChangesets(base) {
  const head = (await git(['rev-parse', 'HEAD'])).trim();
  if ((await tryResolveCommit(base)) === head) {
    return false;
  }
  let nameStatus;
  try {
    const mergeBase = (await git(['merge-base', base, 'HEAD'])).trim();
    nameStatus = await git(['diff', '--name-status', `${mergeBase}..HEAD`]);
  } catch {
    return false;
  }
  // A version commit deletes the changesets it applies, except in pre mode,
  // where it moves them into .changeset/pre/ instead; both count as consumed.
  return nameStatus.split('\n').some((line) => {
    const [status, source] = line.split('\t');
    if (status === undefined || source === undefined) {
      return false;
    }
    if (status !== 'D' && !/^R\d*$/u.test(status)) {
      return false;
    }
    return /^\.changeset\/[^/]+\.md$/u.test(source) && !source.endsWith('/README.md');
  });
}

async function listUnconsumedChangesets() {
  try {
    return (await readdir(changesetDirectory)).filter(
      (name) => name.endsWith('.md') && name !== 'README.md',
    );
  } catch {
    return [];
  }
}

function isPublishablePath(path) {
  if (path.startsWith('schemas/')) {
    return true;
  }
  const packageMatch = /^packages\/[^/]+\/(.+)$/u.exec(path);
  if (packageMatch === null) {
    return false;
  }
  return packageMatch[1] === 'package.json' || packageMatch[1].startsWith('src/');
}
