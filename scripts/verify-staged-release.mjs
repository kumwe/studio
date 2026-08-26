import { execFile, execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

import { STUDIO_RELEASE_PACKAGES } from './release-family.mjs';
import {
  assertApprovedReleaseArtifactFiles,
  writeApprovedReleaseArtifacts,
} from './release-artifacts.mjs';
import { assertCoordinatedRelease } from './release-record.mjs';
import { classifyReleaseVersion } from './release-policy.mjs';
import { stagingTagForVersion } from './staged-publish.mjs';
import { collectRegistryFailures } from './verify-published-release.mjs';

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
  { processEnvironment = process.env, runNpm = runNpmCommand } = {},
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
  } finally {
    await rm(consumerRoot, { force: true, recursive: true });
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
    'TEMP',
    'TMP',
    'TMPDIR',
    'TZ',
    'all_proxy',
    'https_proxy',
    'http_proxy',
    'no_proxy',
  ];
  const environment = Object.fromEntries(
    passthroughKeys
      .filter((key) => processEnvironment[key] !== undefined)
      .map((key) => [key, processEnvironment[key]]),
  );
  return {
    ...environment,
    NPM_CONFIG_CACHE: join(consumerRoot, 'npm-cache'),
    NPM_CONFIG_GLOBALCONFIG: globalConfig,
    NPM_CONFIG_REGISTRY: 'https://registry.npmjs.org/',
    NPM_CONFIG_USERCONFIG: userConfig,
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
