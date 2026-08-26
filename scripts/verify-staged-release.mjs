import { execFile, execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isDeepStrictEqual, promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

import { STUDIO_RELEASE_PACKAGES } from './release-family.mjs';
import {
  assertApprovedReleaseArtifactFiles,
  writeApprovedReleaseArtifacts,
} from './release-artifacts.mjs';
import { assertCoordinatedRelease } from './release-record.mjs';
import { classifyReleaseVersion } from './release-policy.mjs';
import { stagingTagForVersion } from './staged-publish.mjs';
import {
  REGISTRY_PROPAGATION_WINDOW_MS,
  collectRegistryFailures,
} from './verify-published-release.mjs';
import { isCredentialBearingUrl } from './lib/secret-detector.mjs';

const execFileAsync = promisify(execFile);
const repositoryRoot = new URL('../', import.meta.url);

export function assertStagedVerificationSource(
  record,
  actualSha,
  expectedVersion,
  workingTreeState = '',
) {
  assertCoordinatedRelease(record);
  if (!/^[a-f0-9]{40}$/u.test(actualSha)) {
    throw new Error('Staged RC verification requires an exact lowercase source commit.');
  }
  if (classifyReleaseVersion(record.release) !== 'rc') {
    throw new Error(`Staged evidence requires an RC coordinate, not ${String(record.release)}.`);
  }
  if (workingTreeState !== '') {
    throw new Error('Staged RC verification requires a clean exact-source working tree.');
  }
  if (expectedVersion !== undefined && record.release !== expectedVersion) {
    throw new Error(
      `Staged verification source ${record.release} does not match ${String(expectedVersion)}.`,
    );
  }
}

export async function assertInstalledReleaseFamily(
  record,
  consumerRoot,
  expectedReleaseRecordSource,
) {
  assertCoordinatedRelease(record);
  for (const { name } of STUDIO_RELEASE_PACKAGES) {
    const packageRoot = join(consumerRoot, 'node_modules', ...name.split('/'));
    const manifest = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'));
    if (manifest.name !== name || manifest.version !== record.packages[name]) {
      throw new Error(
        `Clean consumer resolved ${String(manifest.name)}@${String(manifest.version)}, expected ` +
          `${name}@${record.packages[name]}.`,
      );
    }
    if (name === '@kumwe/studio-protocol' || name === '@kumwe/studio-testkit') {
      const installedRecord = await readFile(join(packageRoot, 'studio-release.json'), 'utf8');
      if (installedRecord !== expectedReleaseRecordSource) {
        throw new Error(`${name} did not install the exact candidate release record.`);
      }
    }
  }
}

export async function proveCleanRegistryInstall(
  record,
  expectedReleaseRecordSource,
  { captureEvidence = false, processEnvironment = process.env, runNpm = runNpmCommand } = {},
) {
  assertCoordinatedRelease(record);
  const consumerRoot = await mkdtemp(join(tmpdir(), 'studio-rc-clean-consumer-'));
  try {
    const dependencies = Object.fromEntries(
      STUDIO_RELEASE_PACKAGES.map(({ name }) => [name, record.packages[name]]),
    );
    await writeFile(
      join(consumerRoot, 'package.json'),
      `${JSON.stringify({ name: 'studio-rc-clean-consumer', private: true, type: 'module', dependencies }, null, 2)}\n`,
    );
    const projectConfig = join(consumerRoot, '.npmrc');
    const userConfig = join(consumerRoot, 'user.npmrc');
    const globalConfig = join(consumerRoot, 'global.npmrc');
    await Promise.all(
      ['home', 'tmp', 'xdg-cache', 'xdg-config'].map((directory) =>
        mkdir(join(consumerRoot, directory)),
      ),
    );
    await Promise.all([
      writeFile(projectConfig, 'registry=https://registry.npmjs.org/\n'),
      writeFile(userConfig, ''),
      writeFile(globalConfig, ''),
    ]);
    const environment = buildCleanNpmEnvironment(consumerRoot, processEnvironment, {
      globalConfig,
      userConfig,
    });
    await runNpm(
      [
        'install',
        '--ignore-scripts',
        '--package-lock=true',
        '--no-audit',
        '--no-fund',
        '--registry=https://registry.npmjs.org/',
        `--userconfig=${userConfig}`,
        `--globalconfig=${globalConfig}`,
        '--workspaces=false',
      ],
      { cwd: consumerRoot, env: environment },
    );
    await assertInstalledReleaseFamily(record, consumerRoot, expectedReleaseRecordSource);
    let lockEvidence;
    if (captureEvidence) {
      lockEvidence = buildCleanConsumerLockEvidence(
        JSON.parse(await readFile(join(consumerRoot, 'package-lock.json'), 'utf8')),
        record,
      );
    }
    await runNpm(
      [
        'audit',
        'signatures',
        '--omit=dev',
        '--registry=https://registry.npmjs.org/',
        `--userconfig=${userConfig}`,
        `--globalconfig=${globalConfig}`,
      ],
      {
        cwd: consumerRoot,
        env: environment,
      },
    );
    return lockEvidence;
  } finally {
    await rm(consumerRoot, { force: true, recursive: true });
  }
}

export function buildCleanConsumerLockEvidence(lockfile, record) {
  assertCoordinatedRelease(record);
  if (
    lockfile?.lockfileVersion !== 3 ||
    lockfile?.packages?.['']?.dependencies === undefined ||
    !isDeepStrictEqual(lockfile.packages[''].dependencies, record.packages)
  ) {
    throw new Error('Clean consumer lockfile does not bind the exact candidate family roots.');
  }
  const packages = STUDIO_RELEASE_PACKAGES.map(({ name }) => {
    const entry = lockfile.packages[`node_modules/${name}`];
    if (
      entry?.version !== record.packages[name] ||
      typeof entry?.integrity !== 'string' ||
      typeof entry?.resolved !== 'string'
    ) {
      throw new Error(`Clean consumer lockfile lacks exact registry metadata for ${name}.`);
    }
    return {
      integrity: entry.integrity,
      name,
      resolved: entry.resolved,
      version: entry.version,
    };
  }).sort((left, right) => left.name.localeCompare(right.name, 'en'));
  const lockEntries = new Map(Object.entries(lockfile.packages));
  const componentsByPurl = new Map();
  const dependenciesByPurl = new Map();
  for (const [path, entry] of [...lockEntries].sort(([left], [right]) =>
    left.localeCompare(right, 'en'),
  )) {
    if (path === '' || entry?.dev === true || typeof entry?.version !== 'string') continue;
    const name = packageNameFromLockPath(path, entry);
    if (
      name === undefined ||
      typeof entry.integrity !== 'string' ||
      typeof entry.resolved !== 'string'
    ) {
      throw new Error(`Clean consumer lock entry ${path} lacks exact registry identity.`);
    }
    const purl = npmPackageUrl(name, entry.version);
    const component = {
      integrity: entry.integrity,
      name,
      optional: entry.optional === true,
      purl,
      resolved: entry.resolved,
      version: entry.version,
    };
    const previous = componentsByPurl.get(purl);
    if (previous !== undefined && !isDeepStrictEqual(previous, component)) {
      throw new Error(`Clean consumer lock contains inconsistent duplicate ${purl}.`);
    }
    componentsByPurl.set(purl, component);
    const requiredDependencies = Object.keys(entry.dependencies ?? {});
    const optionalDependencies = Object.keys(entry.optionalDependencies ?? {});
    const peerDependencies = Object.keys(entry.peerDependencies ?? {});
    const optionalPeerDependencies = peerDependencies.filter(
      (name) => entry.peerDependenciesMeta?.[name]?.optional === true,
    );
    const requiredPeerDependencies = peerDependencies.filter(
      (name) => !optionalPeerDependencies.includes(name),
    );
    const dependsOn = [];
    for (const dependencyName of [
      ...new Set([
        ...requiredDependencies,
        ...optionalDependencies,
        ...requiredPeerDependencies,
        ...optionalPeerDependencies,
      ]),
    ]) {
      const dependencyPath = resolveLockDependencyPath(path, dependencyName, lockEntries);
      if (dependencyPath === undefined) {
        if (
          optionalDependencies.includes(dependencyName) ||
          optionalPeerDependencies.includes(dependencyName)
        ) {
          continue;
        }
        throw new Error(`Clean consumer lock cannot resolve ${dependencyName} from ${path}.`);
      }
      const dependency = lockEntries.get(dependencyPath);
      dependsOn.push(npmPackageUrl(dependencyName, dependency.version));
    }
    const normalizedDependencies = [...new Set(dependsOn)].sort((left, right) =>
      left.localeCompare(right, 'en'),
    );
    const priorDependencies = dependenciesByPurl.get(purl);
    if (
      priorDependencies !== undefined &&
      !isDeepStrictEqual(priorDependencies, normalizedDependencies)
    ) {
      throw new Error(
        `Clean consumer lock duplicate ${purl} has location-dependent dependency topology.`,
      );
    }
    dependenciesByPurl.set(purl, normalizedDependencies);
  }
  const components = [...componentsByPurl.values()].sort((left, right) =>
    left.purl.localeCompare(right.purl, 'en'),
  );
  const dependencies = [...dependenciesByPurl]
    .map(([ref, dependsOn]) => ({ dependsOn, ref }))
    .sort((left, right) => left.ref.localeCompare(right.ref, 'en'));
  return {
    components,
    dependencies,
    lockfileVersion: 3,
    packages,
    rootDependencies: Object.fromEntries(
      Object.entries(record.packages).sort(([left], [right]) => left.localeCompare(right, 'en')),
    ),
  };
}

function packageNameFromLockPath(path, entry) {
  if (typeof entry?.name === 'string') return entry.name;
  const marker = path.lastIndexOf('node_modules/');
  if (marker < 0) return undefined;
  return path.slice(marker + 'node_modules/'.length);
}

function npmPackageUrl(name, version) {
  const encodedName = name.startsWith('@') ? `%40${name.slice(1)}` : name;
  return `pkg:npm/${encodedName}@${version}`;
}

function resolveLockDependencyPath(parentPath, dependencyName, entries) {
  let cursor = parentPath;
  while (true) {
    const candidate = `${cursor.length === 0 ? '' : `${cursor}/`}node_modules/${dependencyName}`;
    if (entries.has(candidate)) return candidate;
    const marker = cursor.lastIndexOf('/node_modules/');
    if (marker >= 0) {
      cursor = cursor.slice(0, marker);
      continue;
    }
    if (cursor.startsWith('node_modules/')) {
      cursor = '';
      continue;
    }
    return undefined;
  }
}

export function buildCleanNpmEnvironment(
  consumerRoot,
  processEnvironment,
  { globalConfig, userConfig },
) {
  const passthroughKeys = [
    'ALL_PROXY',
    'COMSPEC',
    'HTTPS_PROXY',
    'HTTP_PROXY',
    'LANG',
    'LC_ALL',
    'NO_PROXY',
    'PATH',
    'PATHEXT',
    'SSL_CERT_DIR',
    'SSL_CERT_FILE',
    'SYSTEMROOT',
    'TZ',
    'all_proxy',
    'https_proxy',
    'http_proxy',
    'no_proxy',
  ];
  const environment = Object.fromEntries(
    passthroughKeys
      .filter(
        (key) =>
          processEnvironment[key] !== undefined && !isCredentialBearingUrl(processEnvironment[key]),
      )
      .map((key) => [key, processEnvironment[key]]),
  );
  return {
    ...environment,
    HOME: join(consumerRoot, 'home'),
    NPM_CONFIG_CACHE: join(consumerRoot, 'npm-cache'),
    NPM_CONFIG_GLOBALCONFIG: globalConfig,
    NPM_CONFIG_REGISTRY: 'https://registry.npmjs.org/',
    NPM_CONFIG_USERCONFIG: userConfig,
    TEMP: join(consumerRoot, 'tmp'),
    TMP: join(consumerRoot, 'tmp'),
    TMPDIR: join(consumerRoot, 'tmp'),
    USERPROFILE: join(consumerRoot, 'home'),
    XDG_CACHE_HOME: join(consumerRoot, 'xdg-cache'),
    XDG_CONFIG_HOME: join(consumerRoot, 'xdg-config'),
  };
}

async function runNpmCommand(arguments_, options) {
  const { stderr, stdout } = await execFileAsync('npm', arguments_, {
    ...options,
    maxBuffer: 10 * 1_024 * 1_024,
  });
  if (stdout.length > 0) process.stdout.write(stdout);
  if (stderr.length > 0) process.stderr.write(stderr);
}

export async function buildFreshApprovedArtifacts(
  record,
  {
    root = repositoryRoot,
    verifyArtifactFiles = assertApprovedReleaseArtifactFiles,
    writeArtifacts = writeApprovedReleaseArtifacts,
  } = {},
) {
  const document = await writeArtifacts(root);
  await verifyArtifactFiles(document, record, root);
  return document;
}

async function main() {
  if (process.argv.length !== 2) {
    throw new Error('Usage: node scripts/verify-staged-release.mjs');
  }
  const releaseRecordSource = await readFile(
    new URL('studio-release.json', repositoryRoot),
    'utf8',
  );
  const record = JSON.parse(releaseRecordSource);
  const actualSha = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  }).trim();
  const workingTreeState = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  }).trim();
  assertStagedVerificationSource(
    record,
    actualSha,
    process.env.RELEASE_EXPECTED_VERSION,
    workingTreeState,
  );
  const approvedArtifacts = await buildFreshApprovedArtifacts(record);
  const failures = await collectRegistryFailures(record, {
    approvedArtifacts,
    distTag: stagingTagForVersion(record.release),
    propagationWindowMs: REGISTRY_PROPAGATION_WINDOW_MS,
    provenanceCommit: actualSha,
    requireProvenance: true,
  });
  if (failures.length > 0) {
    throw new Error(
      `The quarantined RC cannot support release evidence:\n- ${failures.join('\n- ')}`,
    );
  }
  await proveCleanRegistryInstall(record, releaseRecordSource);
  console.log(
    `Quarantined RC ${record.release} verified from exact source ${actualSha} across ` +
      `${STUDIO_RELEASE_PACKAGES.length} registry packages and a clean unauthenticated consumer.`,
  );
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
