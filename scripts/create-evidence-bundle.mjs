import { spawnSync, execFileSync } from 'node:child_process';
import {
  appendFile,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import { chromium } from '@playwright/test';
import { parseEvidenceArguments } from './evidence-generator-input.mjs';
import {
  checksumFile,
  GENERIC_LANE_EVIDENCE_CLASSES,
  REQUIRED_EVIDENCE_INPUTS,
} from './evidence-validation.mjs';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const evidenceBundlesRoot = join(repositoryRoot, 'evidence', 'bundles');
const MAX_LANE_OUTPUT_BYTES = 10 * 1_024 * 1_024;
const MAX_TOTAL_ARTIFACT_BYTES = 150 * 1_024 * 1_024;
const SECRET_PATTERNS = [
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/u,
  /\bnpm_[A-Za-z0-9]{20,}\b/u,
  /\bAKIA[A-Z0-9]{16}\b/u,
  /\bAuthorization:\s*Bearer\s+\S+/iu,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u,
];

const LANES = Object.freeze([
  { args: ['run', 'format:check'], command: 'npm', testId: 'quality/format' },
  { args: ['run', 'lint'], command: 'npm', testId: 'quality/lint' },
  { args: ['run', 'typecheck'], command: 'npm', testId: 'quality/typecheck' },
  { args: ['run', 'build'], command: 'npm', testId: 'build/workspace' },
  {
    args: ['scripts/check-boundaries.mjs'],
    command: 'node',
    testId: 'contract/package-boundaries',
  },
  {
    args: ['scripts/check-contracts.mjs'],
    command: 'node',
    testId: 'contract/canonical-corpus',
  },
  {
    args: ['scripts/check-release-record.mjs'],
    command: 'node',
    testId: 'contract/release-record',
  },
  {
    args: ['scripts/check-packages.mjs'],
    command: 'node',
    testId: 'release/package-tarballs',
  },
  {
    args: ['scripts/check-evidence.mjs'],
    command: 'node',
    testId: 'evidence/authenticity',
  },
  {
    args: ['scripts/check-secrets.mjs'],
    command: 'node',
    testId: 'security/secret-scan',
  },
  {
    args: ['scripts/check-requirements.mjs'],
    command: 'node',
    testId: 'contract/requirement-registry',
  },
  {
    args: ['scripts/check-threats.mjs'],
    command: 'node',
    testId: 'security/threat-registry',
  },
  {
    args: ['scripts/check-changesets.mjs'],
    command: 'node',
    testId: 'release/changeset',
  },
  { args: ['run', 'test'], command: 'npm', testId: 'unit/workspace' },
  {
    args: ['run', 'check:a11y', '--', '--retries=0'],
    command: 'npm',
    testId: 'accessibility/web',
  },
]);

const options = parseEvidenceArguments(process.argv.slice(2));
const commit = git(['rev-parse', 'HEAD']);
if (options.candidate !== undefined && options.candidate !== commit) {
  throw new Error(
    `The checked-out commit ${commit} is not requested candidate ${options.candidate}.`,
  );
}
assertCleanCheckout();

const registry = JSON.parse(
  await readFile(join(repositoryRoot, 'evidence/gate-criteria.json'), 'utf8'),
);
const criterionById = new Map(
  [...registry.gates.A, ...registry.gates.B].map((criterion) => [criterion.id, criterion]),
);
const allowedProfiles = new Set(registry.profileVocabulary);
for (const profile of options.profiles) {
  if (!allowedProfiles.has(profile)) {
    throw new Error(`Profile ${profile} is not in evidence/gate-criteria.json.`);
  }
}

const criteria = [];
for (const criterionId of options.criteria) {
  const criterion = criterionById.get(criterionId);
  if (criterion === undefined) {
    throw new Error(`Criterion ${criterionId} is not in evidence/gate-criteria.json.`);
  }
  const capturedClasses = criterion.evidenceClasses.filter((evidenceClass) =>
    GENERIC_LANE_EVIDENCE_CLASSES.has(evidenceClass),
  );
  if (capturedClasses.length === 0) {
    throw new Error(
      `Criterion ${criterionId} requires specialized or manual evidence; ` +
        'the generic lane cannot claim an evidence class for it.',
    );
  }
  for (const evidenceClass of capturedClasses) {
    criteria.push({ class: evidenceClass, criterionId, outcome: 'positive' });
  }
}

const bundleId =
  options.id ??
  `${options.package}-${commit.slice(0, 12)}-${new Date().toISOString().replace(/\D/gu, '')}`;
if (bundleId.startsWith('SAMPLE-') || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/u.test(bundleId)) {
  throw new Error(`Derived bundle identifier ${bundleId} is invalid or reserved.`);
}
const targetDirectory = join(evidenceBundlesRoot, bundleId);
const stagingParent = join(repositoryRoot, '.cache');
await assertTargetAbsent();
await mkdir(stagingParent, { recursive: true });
const stagingDirectory = await mkdtemp(join(stagingParent, 'evidence-staging-'));
const artifactDirectory = join(stagingDirectory, 'artifacts');
await mkdir(artifactDirectory);

try {
  const runs = [];
  const artifacts = [];
  let totalArtifactBytes = 0;
  for (const [index, step] of LANES.entries()) {
    const startedAt = new Date().toISOString();
    const result = spawnSync(step.command, step.args, {
      cwd: repositoryRoot,
      encoding: 'utf8',
      env: { ...process.env, CI: '1', STUDIO_EVIDENCE_RUN: '1' },
      maxBuffer: MAX_LANE_OUTPUT_BYTES,
    });
    const endedAt = new Date().toISOString();
    const exitStatus = typeof result.status === 'number' ? result.status : 1;
    const command = renderCommand(step.command, step.args);
    const log =
      `command: ${command}\nstartedAt: ${startedAt}\nendedAt: ${endedAt}\n` +
      `exitStatus: ${exitStatus}\nretryCount: 0\n\nstdout:\n${result.stdout ?? ''}` +
      `\n\nstderr:\n${result.stderr ?? ''}`;
    const logBytes = Buffer.from(log);
    assertSafeArtifact(logBytes, step.testId);
    totalArtifactBytes += logBytes.byteLength;
    if (totalArtifactBytes > MAX_TOTAL_ARTIFACT_BYTES) {
      throw new Error('Evidence lane artifacts exceed the 150 MiB repository bundle limit.');
    }
    const artifactName = `${String(index + 1).padStart(2, '0')}-${step.testId.replaceAll('/', '-')}.log`;
    await writeFile(join(artifactDirectory, artifactName), logBytes, { flag: 'wx' });
    const artifactPath = `evidence/bundles/${bundleId}/artifacts/${artifactName}`;
    artifacts.push({
      checksum: await checksumFile(join(artifactDirectory, artifactName)),
      mediaType: 'text/plain',
      path: artifactPath,
    });
    runs.push({
      command,
      endedAt,
      exitStatus,
      retryCount: 0,
      runner: options.runner ?? 'local',
      startedAt,
      testId: step.testId,
    });
    if (result.error !== undefined || exitStatus !== 0) {
      const tail = log.slice(-4_000);
      throw new Error(
        `${command} exited ${exitStatus}. Failing evidence is not recorded.\n${tail}`,
        {
          cause: result.error,
        },
      );
    }
  }

  if (git(['rev-parse', 'HEAD']) !== commit) {
    throw new Error('The checked-out commit changed while the evidence lane was running.');
  }
  assertCleanCheckout();

  const packageVersions = await readPackageVersions();
  const manifest = {
    artifactChecksums: Object.fromEntries(
      artifacts.map((artifact) => [artifact.path, artifact.checksum]),
    ),
    artifacts,
    bundleId,
    criteria,
    environment: {
      browser: readBrowserVersion(),
      node: process.versions.node,
      npm: execFileSync('npm', ['--version'], { encoding: 'utf8' }).trim(),
      os: `${process.platform}-${process.arch}`,
      packageVersions,
    },
    evidenceSchemaVersion: '0.1-draft',
    inputFixtureChecksums: Object.fromEntries(
      await Promise.all(
        REQUIRED_EVIDENCE_INPUTS.map(async (path) => [
          path,
          await checksumFile(join(repositoryRoot, path)),
        ]),
      ),
    ),
    profiles: options.profiles,
    redaction: {
      declared: true,
      statement:
        'This pending bundle contains fixed repository quality-lane logs and checksums only. ' +
        'The generator scanned every captured log for common credential forms; a human must still ' +
        'inspect the bundle before recording reproduction.',
    },
    review: { status: 'pending' },
    runs,
    source: {
      commit,
      lockfileChecksums: {
        'package-lock.json': await checksumFile(join(repositoryRoot, 'package-lock.json')),
      },
      repository: 'https://github.com/kumwe/studio',
      workingTreeState: 'clean',
    },
  };

  await assertManifestSchema(manifest);
  await writeFile(
    join(stagingDirectory, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    {
      flag: 'wx',
    },
  );
  // Generators coordinate on an ignored exclusive lock. The second target
  // check closes the normal race between the initial fast failure and rename.
  const lockPath = join(stagingParent, `evidence-${bundleId}.lock`);
  let lock;
  try {
    lock = await open(lockPath, 'wx');
    await assertTargetAbsent();
    await rename(stagingDirectory, targetDirectory);
  } finally {
    if (lock !== undefined) {
      await lock.close();
      await rm(lockPath, { force: true });
    }
  }

  if (process.env.GITHUB_OUTPUT !== undefined) {
    await appendFile(process.env.GITHUB_OUTPUT, `bundle_path=evidence/bundles/${bundleId}\n`);
  }
  process.stdout.write(
    `Wrote evidence/bundles/${bundleId}/manifest.json for ${commit}.\n` +
      'The bundle is pending. A human reviewer must reproduce it and no gate outcome was recorded.\n',
  );
} catch (error) {
  await rm(stagingDirectory, { force: true, recursive: true });
  if (error?.code === 'EEXIST' || error?.code === 'ENOTEMPTY') {
    throw new Error(`Evidence bundle ${bundleId} already exists and is immutable.`, {
      cause: error,
    });
  }
  throw error;
}

function assertCleanCheckout() {
  if (git(['status', '--porcelain', '--untracked-files=all']) !== '') {
    throw new Error(
      'The working tree is dirty. Evidence is produced from a clean checkout of the reviewed commit.',
    );
  }
}

async function assertTargetAbsent() {
  try {
    await lstat(targetDirectory);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return;
    }
    throw error;
  }
  const error = new Error(`Evidence bundle ${bundleId} already exists and is immutable.`);
  error.code = 'EEXIST';
  throw error;
}

function assertSafeArtifact(bytes, testId) {
  if (bytes.byteLength > MAX_LANE_OUTPUT_BYTES) {
    throw new Error(`Lane ${testId} output exceeds the 10 MiB per-artifact limit.`);
  }
  const text = bytes.toString('utf8');
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(text)) {
      throw new Error(`Lane ${testId} output resembles a credential and cannot enter evidence.`);
    }
  }
}

async function assertManifestSchema(manifest) {
  const schema = JSON.parse(
    await readFile(join(repositoryRoot, 'evidence/schema/evidence-bundle.schema.json'), 'utf8'),
  );
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const validate = ajv.compile(schema);
  if (!validate(manifest)) {
    throw new Error(`Generated manifest violates its schema: ${ajv.errorsText(validate.errors)}`);
  }
}

function git(args) {
  return execFileSync('git', args, { cwd: repositoryRoot, encoding: 'utf8' }).trim();
}

function readBrowserVersion() {
  const version = execFileSync(chromium.executablePath(), ['--version'], {
    encoding: 'utf8',
  }).trim();
  return version.replaceAll(/[^A-Za-z0-9._+-]+/gu, '-').replace(/-+$/u, '');
}

async function readPackageVersions() {
  const releaseRecord = JSON.parse(
    await readFile(join(repositoryRoot, 'studio-release.json'), 'utf8'),
  );
  const packageVersions = { ...releaseRecord.packages };
  for (const packageName of ['ajv', '@playwright/test']) {
    const packageManifest = JSON.parse(
      await readFile(join(repositoryRoot, 'node_modules', packageName, 'package.json'), 'utf8'),
    );
    packageVersions[packageName] = packageManifest.version;
  }
  return packageVersions;
}

function renderCommand(command, args) {
  return [command, ...args]
    .map((part) => (/^[A-Za-z0-9_./:@+-]+$/u.test(part) ? part : JSON.stringify(part)))
    .join(' ');
}
