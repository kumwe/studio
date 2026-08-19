import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

/**
 * Produce one evidence bundle for a work package.
 *
 * Everything a bundle records mechanically — the reviewed commit, the
 * environment, the lane commands with their exit status and timings, and the
 * sha256 checksum of every input fixture and produced artifact — is captured
 * here. Everything the evidence model deliberately reserves for a human is
 * not: `review.reproduced`, the reviewer identity, and the criterion outcomes
 * are left for the reviewer who actually reproduced the run. A generator that
 * filled those in would be self-certifying evidence, which is precisely what
 * the model forbids.
 *
 *   node scripts/create-evidence-bundle.mjs --package M2-01 [--id <bundleId>]
 *
 * The bundle is written to evidence/bundles/<bundleId>/ and left uncommitted
 * so a reviewer can inspect it before recording their attestation.
 */

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));

const LANE = [
  { command: 'node scripts/check-boundaries.mjs', testId: 'contract/package-boundaries' },
  { command: 'node scripts/check-contracts.mjs', testId: 'contract/canonical-corpus' },
  { command: 'node scripts/check-requirements.mjs', testId: 'contract/requirement-registry' },
  { command: 'node scripts/check-threats.mjs', testId: 'contract/threat-registry' },
  {
    command: 'npx vitest run --reporter=json --outputFile=.evidence-tests.json',
    testId: 'unit/workspace',
  },
];

const options = parseArguments(process.argv.slice(2));
if (options.package === undefined) {
  throw new Error(
    'Usage: node scripts/create-evidence-bundle.mjs --package <M2-01> [--id <bundleId>]',
  );
}

const commit = git(['rev-parse', 'HEAD']);
const workingTreeState = git(['status', '--porcelain']) === '' ? 'clean' : 'dirty';
if (workingTreeState !== 'clean') {
  throw new Error(
    'The working tree is dirty. Evidence is produced from a clean checkout of the reviewed commit.',
  );
}

const bundleId = options.id ?? `${options.package}-${commit.slice(0, 12)}`;
const bundleDirectory = new URL(`../evidence/bundles/${bundleId}/`, import.meta.url);
const artifactDirectory = new URL('artifacts/', bundleDirectory);
await mkdir(artifactDirectory, { recursive: true });

const runs = [];
for (const step of LANE) {
  const startedAt = new Date().toISOString();
  let exitStatus = 0;
  try {
    execFileSync('sh', ['-c', step.command], { cwd: repositoryRoot, stdio: 'pipe' });
  } catch (error) {
    exitStatus = typeof error?.status === 'number' ? error.status : 1;
  }
  runs.push({
    command: step.command,
    endedAt: new Date().toISOString(),
    exitStatus,
    retryCount: 0,
    runner: options.runner ?? 'local',
    startedAt,
    testId: step.testId,
  });
  if (exitStatus !== 0) {
    throw new Error(`${step.command} exited ${exitStatus}. Failing evidence is not recorded.`);
  }
}

// The test reporter's output is the produced artifact this bundle carries.
const reportPath = `evidence/bundles/${bundleId}/artifacts/workspace-tests.report.json`;
await writeFile(
  new URL('workspace-tests.report.json', artifactDirectory),
  await readFile(new URL('../.evidence-tests.json', import.meta.url), 'utf8'),
);

const inputFixtures = [
  'package-lock.json',
  'packages/protocol/schemas/manifest.json',
  'packages/testkit/corpus-manifest.json',
];

const manifest = {
  artifactChecksums: { [reportPath]: await checksum(reportPath) },
  artifacts: [
    {
      checksum: await checksum(reportPath),
      mediaType: 'application/json',
      path: reportPath,
    },
  ],
  bundleId,
  // Criterion outcomes are the reviewer's judgement, not the runner's.
  criteria: [],
  environment: {
    node: process.versions.node,
    npm: readNpmVersion(),
    os: `${process.platform}-${process.arch}`,
    packageVersions: await readAjvVersion(),
  },
  evidenceSchemaVersion: '0.1-draft',
  inputFixtureChecksums: Object.fromEntries(
    await Promise.all(inputFixtures.map(async (path) => [path, await checksum(path)])),
  ),
  redaction: {
    declared: true,
    statement:
      'This bundle records lane commands, environment metadata and repository checksums only. It contains no credential, personal data, customer content, or preview token.',
  },
  runs,
  source: {
    commit,
    lockfileChecksums: { 'package-lock.json': await checksum('package-lock.json') },
    repository: 'https://github.com/kumwe/studio',
    workingTreeState,
  },
};

await writeFile(
  new URL('manifest.json', bundleDirectory),
  `${JSON.stringify(manifest, null, 2)}\n`,
);

process.stdout.write(
  `Wrote evidence/bundles/${bundleId}/manifest.json at commit ${commit.slice(0, 12)}.\n` +
    'A reviewer must now add the criterion outcomes and the review block ' +
    '(reproduced, reviewer, reviewedAt, freshnessExpiresAt) before it is evidence.\n',
);

function parseArguments(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag === '--package') {
      parsed.package = value;
    } else if (flag === '--id') {
      parsed.id = value;
    } else if (flag === '--runner') {
      parsed.runner = value;
    }
  }
  return parsed;
}

function git(args) {
  return execFileSync('git', args, { cwd: repositoryRoot, encoding: 'utf8' }).trim();
}

function readNpmVersion() {
  try {
    return execFileSync('npm', ['--version'], { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

async function readAjvVersion() {
  const manifestText = await readFile(new URL('../package.json', import.meta.url), 'utf8');
  const ajv = JSON.parse(manifestText).devDependencies?.ajv;
  return ajv === undefined ? {} : { ajv };
}

async function checksum(path) {
  const bytes = await readFile(new URL(`../${path}`, import.meta.url));
  return `sha256-${createHash('sha256').update(bytes).digest('base64')}`;
}
