import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const EXACT_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const LICENSE_NAMES = ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'LICENCE', 'LICENCE.md', 'COPYING'];

const normalizeText = (value) => `${value.replaceAll('\r\n', '\n').trimEnd()}\n`;

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'));

const dependencyEntries = (manifest) =>
  Object.entries(manifest.dependencies ?? {}).sort(([left], [right]) => left.localeCompare(right));

const lockPathFor = (dependencyName, fromLockPath, lockPackages) => {
  let parent = fromLockPath;
  while (true) {
    const candidate =
      parent.length === 0
        ? `node_modules/${dependencyName}`
        : `${parent}/node_modules/${dependencyName}`;
    if (lockPackages[candidate] !== undefined) {
      return candidate;
    }
    const marker = parent.lastIndexOf('/node_modules/');
    if (marker === -1) {
      if (parent.startsWith('node_modules/')) {
        parent = '';
        continue;
      }
      return undefined;
    }
    parent = parent.slice(0, marker);
  }
};

const packageNameFromLockPath = (lockPath) => {
  const marker = lockPath.lastIndexOf('/node_modules/');
  return lockPath.slice(marker === -1 ? 'node_modules/'.length : marker + '/node_modules/'.length);
};

const includedPeers = (lockEntry) => {
  const optional = lockEntry.peerDependenciesMeta ?? {};
  return Object.entries(lockEntry.peerDependencies ?? {}).filter(
    ([name]) => optional[name]?.optional !== true,
  );
};

const assertExactDirectPin = (packageName, dependencyName, declaredVersion) => {
  if (!EXACT_VERSION.test(declaredVersion)) {
    throw new Error(
      `${packageName} production dependency ${dependencyName} must use an exact version; received ${declaredVersion}.`,
    );
  }
};

const findLicenseFile = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const byLowerCase = new Map(
    entries
      .filter((entry) => entry.isFile())
      .map((entry) => [entry.name.toLowerCase(), entry.name]),
  );
  for (const candidate of LICENSE_NAMES) {
    const actual = byLowerCase.get(candidate.toLowerCase());
    if (actual !== undefined) {
      return path.join(directory, actual);
    }
  }
  return undefined;
};

const safeEvidenceName = (name, version) =>
  `${name
    .replace(/^@/, '')
    .replaceAll('/', '__')
    .replaceAll(/[^0-9A-Za-z_.-]/g, '_')}-${version}.txt`;

const tableCell = (value) => String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');

export const loadWorkspace = async (rootDirectory) => {
  const packagesDirectory = path.join(rootDirectory, 'packages');
  const lock = await readJson(path.join(rootDirectory, 'package-lock.json'));
  if (lock.lockfileVersion !== 3 || typeof lock.packages !== 'object' || lock.packages === null) {
    throw new Error(
      'Third-party notice generation requires an npm lockfileVersion 3 package lock.',
    );
  }
  let licenseOverrides = {};
  try {
    licenseOverrides = await readJson(
      path.join(rootDirectory, 'evidence', 'third-party-license-overrides.json'),
    );
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error;
    }
  }

  const directories = (await readdir(packagesDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(packagesDirectory, entry.name))
    .sort();
  const packages = [];
  for (const directory of directories) {
    const manifest = await readJson(path.join(directory, 'package.json'));
    if (manifest.private === true) {
      continue;
    }
    packages.push({ directory, manifest });
  }
  const internalByName = new Map(packages.map((entry) => [entry.manifest.name, entry]));
  return { internalByName, licenseOverrides, lockPackages: lock.packages, packages };
};

export const resolveRuntimeClosure = ({ internalByName, lockPackages }, packageEntry) => {
  const resolved = new Map();
  const visitedInternal = new Set();
  const visitedLockPaths = new Set();

  const visitExternal = (dependencyName, declaredVersion, fromLockPath = '') => {
    const lockPath = lockPathFor(dependencyName, fromLockPath, lockPackages);
    if (lockPath === undefined) {
      throw new Error(
        `${packageEntry.manifest.name} cannot resolve production dependency ${dependencyName} from package-lock.json.`,
      );
    }
    const lockEntry = lockPackages[lockPath];
    if (fromLockPath === '' && lockEntry.version !== declaredVersion) {
      throw new Error(
        `${packageEntry.manifest.name} pins ${dependencyName} ${declaredVersion}, but the lockfile resolves ${lockEntry.version}.`,
      );
    }
    if (visitedLockPaths.has(lockPath)) {
      return;
    }
    visitedLockPaths.add(lockPath);

    const name = packageNameFromLockPath(lockPath);
    if (typeof lockEntry.version !== 'string' || typeof lockEntry.license !== 'string') {
      throw new Error(`${lockPath} must declare a version and license in package-lock.json.`);
    }
    if (lockEntry.dev === true && lockEntry.devOptional !== true) {
      throw new Error(
        `${lockPath} is reachable at runtime but is marked dev-only in package-lock.json.`,
      );
    }
    if (typeof lockEntry.integrity !== 'string' || lockEntry.integrity.length === 0) {
      throw new Error(`${lockPath} must carry registry integrity evidence.`);
    }
    const identity = `${name}@${lockEntry.version}`;
    const prior = resolved.get(identity);
    if (prior !== undefined && prior.lockPath !== lockPath) {
      if (prior.license !== lockEntry.license || prior.integrity !== lockEntry.integrity) {
        throw new Error(`${identity} resolves to contradictory lockfile evidence.`);
      }
    } else {
      resolved.set(identity, {
        identity,
        integrity: lockEntry.integrity,
        license: lockEntry.license,
        lockPath,
        name,
        version: lockEntry.version,
      });
    }

    const edges = [
      ...Object.entries(lockEntry.dependencies ?? {}),
      ...Object.entries(lockEntry.optionalDependencies ?? {}),
      ...includedPeers(lockEntry),
    ].sort(([left], [right]) => left.localeCompare(right));
    for (const [childName, childRange] of edges) {
      const childLockPath = lockPathFor(childName, lockPath, lockPackages);
      if (childLockPath === undefined) {
        if (lockEntry.optionalDependencies?.[childName] !== undefined) {
          continue;
        }
        throw new Error(`${lockPath} cannot resolve runtime edge ${childName}@${childRange}.`);
      }
      visitExternal(childName, undefined, lockPath);
    }
  };

  const visitInternal = (entry) => {
    if (visitedInternal.has(entry.manifest.name)) {
      return;
    }
    visitedInternal.add(entry.manifest.name);
    for (const [dependencyName, declaredVersion] of dependencyEntries(entry.manifest)) {
      assertExactDirectPin(entry.manifest.name, dependencyName, declaredVersion);
      const internal = internalByName.get(dependencyName);
      if (internal !== undefined) {
        if (internal.manifest.version !== declaredVersion) {
          throw new Error(
            `${entry.manifest.name} pins ${dependencyName} ${declaredVersion}, but the workspace contains ${internal.manifest.version}.`,
          );
        }
        visitInternal(internal);
      } else {
        visitExternal(dependencyName, declaredVersion);
      }
    }
  };

  visitInternal(packageEntry);
  return [...resolved.values()].sort(
    (left, right) =>
      left.identity.localeCompare(right.identity) || left.lockPath.localeCompare(right.lockPath),
  );
};

export const createPackageEvidence = async (rootDirectory, workspace, packageEntry) => {
  const dependencies = resolveRuntimeClosure(workspace, packageEntry);
  const licenses = new Map();

  for (const dependency of dependencies) {
    const override = workspace.licenseOverrides[dependency.identity];
    let text;
    if (override === undefined) {
      const directory = path.join(rootDirectory, dependency.lockPath);
      let directoryStat;
      try {
        directoryStat = await stat(directory);
      } catch {
        throw new Error(
          `${dependency.identity} is not installed at ${dependency.lockPath}; run npm ci.`,
        );
      }
      if (!directoryStat.isDirectory()) {
        throw new Error(`${dependency.lockPath} is not an installed package directory.`);
      }
      const licenseFile = await findLicenseFile(directory);
      if (licenseFile === undefined) {
        throw new Error(`${dependency.identity} does not provide a recognized license text.`);
      }
      text = normalizeText(await readFile(licenseFile, 'utf8'));
      dependency.evidenceSource = 'installed package archive';
    } else {
      if (
        override.declaredLicense !== dependency.license ||
        typeof override.file !== 'string' ||
        typeof override.sha256 !== 'string' ||
        typeof override.source !== 'string'
      ) {
        throw new Error(`${dependency.identity} has invalid curated license evidence.`);
      }
      const evidenceRoot = path.resolve(rootDirectory, 'evidence');
      const overrideFile = path.resolve(evidenceRoot, override.file);
      if (!overrideFile.startsWith(`${evidenceRoot}${path.sep}`)) {
        throw new Error(`${dependency.identity} license evidence escapes evidence/.`);
      }
      text = normalizeText(await readFile(overrideFile, 'utf8'));
      if (sha256(text) !== override.sha256) {
        throw new Error(`${dependency.identity} curated license evidence digest does not match.`);
      }
      dependency.evidenceSource = override.source;
    }
    const file = safeEvidenceName(dependency.name, dependency.version);
    const prior = licenses.get(file);
    if (prior !== undefined && prior !== text) {
      throw new Error(`${dependency.identity} maps to a contradictory license evidence filename.`);
    }
    licenses.set(file, text);
    dependency.licenseFile = file;
    dependency.licenseSha256 = sha256(text);
  }

  const closureJson = JSON.stringify(
    dependencies.map(({ identity, integrity, license, licenseSha256 }) => ({
      identity,
      integrity,
      license,
      licenseSha256,
    })),
  );
  const lines = [
    '# Third-party notices',
    '',
    '<!-- Generated by scripts/generate-third-party-notices.mjs. Do not edit by hand. -->',
    '',
    `Package: \`${packageEntry.manifest.name}\``,
    '',
    `Production closure SHA-256: \`${sha256(closureJson)}\``,
    '',
  ];
  if (dependencies.length === 0) {
    lines.push('This package has no third-party runtime dependencies.', '');
  } else {
    lines.push(
      "The following packages are present in this package's lock-derived production dependency closure.",
      'They retain their own copyright and license terms.',
      '',
      '| Package | Version | Declared license | License text SHA-256 | Evidence source |',
      '| --- | --- | --- | --- | --- |',
    );
    for (const dependency of dependencies) {
      lines.push(
        `| ${tableCell(dependency.name)} | ${tableCell(dependency.version)} | ${tableCell(dependency.license)} | [\`${dependency.licenseSha256}\`](third-party-licenses/${dependency.licenseFile}) | ${dependency.evidenceSource === 'installed package archive' ? dependency.evidenceSource : `[curated upstream source](${dependency.evidenceSource})`} |`,
      );
    }
    lines.push('');
  }

  return {
    dependencies,
    licenses,
    notice: lines.join('\n'),
  };
};

export const collectWorkspaceEvidence = async (rootDirectory) => {
  const workspace = await loadWorkspace(rootDirectory);
  const evidence = [];
  for (const packageEntry of workspace.packages) {
    evidence.push({
      packageEntry,
      evidence: await createPackageEvidence(rootDirectory, workspace, packageEntry),
    });
  }
  return evidence;
};
