import { spawnSync, execFileSync } from 'node:child_process';
import {
  appendFile,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import { chromium } from '@playwright/test';
import { parseEvidenceArguments } from './evidence-generator-input.mjs';
import { planCriterionScope } from './evidence-plan.mjs';
import {
  buildCriterionIndex,
  buildProofAssertionIndex,
  buildProfileAssertionIndex,
  checksumFile,
  inspectBundleEvidence,
  REQUIRED_EVIDENCE_INPUTS,
} from './evidence-validation.mjs';
import {
  EVIDENCE_LANES,
  GENERIC_EVIDENCE_LANES,
  renderEvidenceCommand,
} from './evidence-lanes.mjs';
import { buildExternalSubjectAssertionIndex } from './external-evidence.mjs';
import { buildManualProcedureIndex } from './manual-evidence.mjs';
import {
  assertProducerDirectory,
  buildProducerContractIndex,
  structuredArtifactName,
} from './producer-evidence.mjs';
import { isCredentialBearingUrl, scanSecretText } from './lib/secret-detector.mjs';
import { collectOfficialCycloneDxFailures } from './lib/cyclonedx-validation.mjs';
import {
  assertContainedRegularDirectory,
  assertSafeAbsentTarget,
  evidenceBundleLockPath,
  finalizeEvidenceBundleNoReplace,
} from './lib/evidence-filesystem.mjs';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const evidenceBundlesRoot = join(repositoryRoot, 'evidence', 'bundles');
const MAX_LANE_OUTPUT_BYTES = 10 * 1_024 * 1_024;
const MAX_TOTAL_ARTIFACT_BYTES = 150 * 1_024 * 1_024;

const options = parseEvidenceArguments(process.argv.slice(2));
const commit = git(['rev-parse', 'HEAD']);
const candidateTree = git(['rev-parse', 'HEAD^{tree}']);
if (options.candidate !== undefined && options.candidate !== commit) {
  throw new Error(
    `The checked-out commit ${commit} is not requested candidate ${options.candidate}.`,
  );
}
assertCleanCheckout();

const validators = await loadEvidenceValidators();
const producerContractRegistry = JSON.parse(
  await readFile(join(repositoryRoot, 'evidence/producer-contracts.json'), 'utf8'),
);
if (!validators.validateProducerContracts(producerContractRegistry)) {
  throw new Error('Producer contract registry violates its closed schema.');
}
const producerContractIndex = buildProducerContractIndex(producerContractRegistry, {
  schemaIds: validators.producerSchemaIds,
});
if (producerContractIndex.failures.length > 0) {
  throw new Error(
    `Producer contract registry is invalid:\n- ${producerContractIndex.failures.join('\n- ')}`,
  );
}

const registry = JSON.parse(
  await readFile(join(repositoryRoot, 'evidence/gate-criteria.json'), 'utf8'),
);
const criterionIndex = buildCriterionIndex(registry);
if (criterionIndex.failures.length > 0) {
  throw new Error(`Criterion registry is invalid:\n- ${criterionIndex.failures.join('\n- ')}`);
}
const profileAssertionRegistry = JSON.parse(
  await readFile(join(repositoryRoot, 'evidence/profile-assertions.json'), 'utf8'),
);
const profileAssertionIndex = buildProfileAssertionIndex(
  profileAssertionRegistry,
  criterionIndex.allowedProfiles,
);
if (profileAssertionIndex.failures.length > 0) {
  throw new Error(
    `Profile assertion registry is invalid:\n- ${profileAssertionIndex.failures.join('\n- ')}`,
  );
}
const manualProcedureRegistry = JSON.parse(
  await readFile(join(repositoryRoot, 'evidence/manual-procedures.json'), 'utf8'),
);
const manualProcedureIndex = buildManualProcedureIndex(
  manualProcedureRegistry,
  criterionIndex.criteriaById,
);
if (manualProcedureIndex.failures.length > 0) {
  throw new Error(
    `Manual procedure registry is invalid:\n- ${manualProcedureIndex.failures.join('\n- ')}`,
  );
}
const externalSubjectAssertionRegistry = JSON.parse(
  await readFile(join(repositoryRoot, 'evidence/external-subject-assertions.json'), 'utf8'),
);
const externalSubjectAssertionIndex = buildExternalSubjectAssertionIndex(
  externalSubjectAssertionRegistry,
);
if (externalSubjectAssertionIndex.failures.length > 0) {
  throw new Error(
    `External subject registry is invalid:\n- ${externalSubjectAssertionIndex.failures.join('\n- ')}`,
  );
}
const proofAssertionRegistry = JSON.parse(
  await readFile(join(repositoryRoot, 'evidence/proof-assertions.json'), 'utf8'),
);
const proofAssertionIndex = buildProofAssertionIndex(
  proofAssertionRegistry,
  criterionIndex.criteriaById,
  {
    externalSubjects: externalSubjectAssertionIndex.subjectsById,
    manualProcedures: manualProcedureIndex.proceduresById,
    profileAssertions: profileAssertionIndex.profilesById,
  },
);
if (proofAssertionIndex.failures.length > 0) {
  throw new Error(
    `Proof assertion registry is invalid:\n- ${proofAssertionIndex.failures.join('\n- ')}`,
  );
}
for (const profile of options.profiles) {
  if (!criterionIndex.allowedProfiles.has(profile)) {
    throw new Error(`Profile ${profile} is not in evidence/gate-criteria.json.`);
  }
  if (profileAssertionIndex.profilesById.get(profile)?.status !== 'executable') {
    throw new Error(`Profile ${profile} has no executable evidence assertion mapping.`);
  }
}
const selectedAssertions = options.profiles.map((profile) =>
  profileAssertionIndex.profilesById.get(profile),
);
const profileLaneIds = [
  ...new Set(selectedAssertions.flatMap((assertion) => assertion.requiredRuns)),
].sort();
const evidenceInputPaths = [
  ...new Set([
    ...REQUIRED_EVIDENCE_INPUTS,
    ...selectedAssertions.flatMap((assertion) => assertion.requiredInputs),
  ]),
].sort();

const criterionScope = planCriterionScope(
  options.criteria,
  criterionIndex.criteriaById,
  proofAssertionIndex.assertionsByKey,
);
const laneIds = [
  ...new Set([
    ...Object.keys(GENERIC_EVIDENCE_LANES),
    ...profileLaneIds,
    ...criterionScope.executableRunIds,
  ]),
];
const lanes = laneIds.map((testId) => {
  const definition = EVIDENCE_LANES[testId];
  if (definition?.availability !== 'executable') {
    throw new Error(`Evidence lane ${testId} is not executable and cannot be auto-generated.`);
  }
  return { ...definition, testId };
});

const bundleId =
  options.id ??
  `${options.package}-${commit.slice(0, 12)}-${new Date().toISOString().replace(/\D/gu, '')}`;
if (bundleId.startsWith('SAMPLE-') || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/u.test(bundleId)) {
  throw new Error(`Derived bundle identifier ${bundleId} is invalid or reserved.`);
}
const execution = {
  attempt: options.executionAttempt ?? 1,
  id: options.executionId ?? `local/${bundleId}`,
  runner: options.runner ?? 'local',
};
const targetDirectory = join(evidenceBundlesRoot, bundleId);
const stagingParent = join(repositoryRoot, '.cache');
await assertSafeAbsentTarget(
  targetDirectory,
  evidenceBundlesRoot,
  repositoryRoot,
  'Evidence bundle',
);
await assertContainedRegularDirectory(stagingParent, repositoryRoot, 'Evidence staging parent', {
  create: true,
});
const stagingRoot = await mkdtemp(join(stagingParent, 'evidence-staging-'));
const stagingDirectory = join(stagingRoot, 'evidence', 'bundles', bundleId);
const artifactDirectory = join(stagingDirectory, 'artifacts');
await mkdir(artifactDirectory, { recursive: true });
await Promise.all(
  ['home', 'tmp', 'xdg-cache', 'xdg-config'].map((directory) =>
    mkdir(join(stagingRoot, directory)),
  ),
);
const producerOutputRoot = join(stagingRoot, 'producer-outputs');
await mkdir(producerOutputRoot);
const emptyUserConfig = join(stagingRoot, 'empty-user.npmrc');
const emptyGlobalConfig = join(stagingRoot, 'empty-global.npmrc');
await Promise.all([
  writeFile(emptyUserConfig, '', { flag: 'wx' }),
  writeFile(emptyGlobalConfig, '', { flag: 'wx' }),
]);

try {
  const runs = [];
  const artifacts = [];
  let cleanConsumerLockPath;
  let totalArtifactBytes = 0;
  for (const [index, step] of lanes.entries()) {
    const runId = `${execution.id}/run-${String(index + 1).padStart(3, '0')}`;
    const structuredContracts = producerContractIndex.contractsByLane.get(step.testId) ?? [];
    const producerOutputDirectory = join(producerOutputRoot, String(index + 1).padStart(2, '0'));
    const startedAt = new Date().toISOString();
    const result = spawnSync(step.command, step.args, {
      cwd: repositoryRoot,
      encoding: 'utf8',
      env: buildEvidenceEnvironment(stagingRoot, emptyGlobalConfig, emptyUserConfig, {
        candidateCommit: commit,
        candidateTree,
        cleanConsumerLockPath,
        bundleId,
        execution,
        outputDirectory: producerOutputDirectory,
        runId,
        testId: step.testId,
        workPackage: options.package,
      }),
      maxBuffer: MAX_LANE_OUTPUT_BYTES,
    });
    const endedAt = new Date().toISOString();
    const exitStatus = typeof result.status === 'number' ? result.status : 1;
    const command = renderEvidenceCommand(step.command, step.args);
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
      producerTestId: step.testId,
      role: 'run/log',
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
    const runArtifactPaths = [artifactPath];
    if (structuredContracts.length > 0) {
      const entries = (await readdir(producerOutputDirectory, { withFileTypes: true })).sort(
        (left, right) => left.name.localeCompare(right.name, 'en'),
      );
      const expectedFiles = structuredContracts.map(({ outputFile }) => outputFile).sort();
      const actualFiles = entries.map(({ name }) => name);
      if (
        entries.some((entry) => !entry.isFile() || entry.isSymbolicLink()) ||
        JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)
      ) {
        throw new Error(
          `Producer ${step.testId} must emit exactly ${expectedFiles.join(', ')} as regular files.`,
        );
      }
      await assertProducerDirectory(producerOutputDirectory, expectedFiles);
      for (const contract of structuredContracts) {
        const sourcePath = join(producerOutputDirectory, contract.outputFile);
        const bytes = await readFile(sourcePath);
        assertSafeArtifact(bytes, step.testId);
        let document;
        try {
          document = JSON.parse(bytes.toString('utf8'));
        } catch (error) {
          throw new Error(`Producer ${step.testId} emitted invalid JSON.`, { cause: error });
        }
        const canonicalBytes = Buffer.from(`${JSON.stringify(document, null, 2)}\n`);
        if (!bytes.equals(canonicalBytes)) {
          throw new Error(`Producer ${step.testId} output ${contract.outputFile} is noncanonical.`);
        }
        if (!validators.validateProducerSchema(contract.schemaId, document)) {
          throw new Error(
            `Producer ${step.testId} output ${contract.outputFile} violates ${contract.schemaId}.`,
          );
        }
        if (contract.role === 'release/cyclonedx-sbom-v1') {
          const officialFailures = await collectOfficialCycloneDxFailures(document);
          if (officialFailures.length > 0) {
            throw new Error(officialFailures.join('\n'));
          }
        }
        totalArtifactBytes += bytes.byteLength;
        if (totalArtifactBytes > MAX_TOTAL_ARTIFACT_BYTES) {
          throw new Error('Evidence lane artifacts exceed the 150 MiB repository bundle limit.');
        }
        const structuredName = structuredArtifactName(index, step.testId, contract.outputFile);
        if (contract.role === 'release/clean-consumer-lock-v1') {
          cleanConsumerLockPath = sourcePath;
        }
        const retainedPath = join(artifactDirectory, structuredName);
        await writeFile(retainedPath, bytes, { flag: 'wx' });
        const structuredPath = `evidence/bundles/${bundleId}/artifacts/${structuredName}`;
        artifacts.push({
          checksum: await checksumFile(retainedPath),
          mediaType: contract.mediaType,
          path: structuredPath,
          producerTestId: step.testId,
          role: contract.role,
        });
        runArtifactPaths.push(structuredPath);
      }
    }
    runs.push({
      artifactPaths: runArtifactPaths,
      command,
      endedAt,
      exitStatus,
      retryCount: 0,
      executionAttempt: execution.attempt,
      executionId: execution.id,
      runId,
      runner: execution.runner,
      startedAt,
      testId: step.testId,
    });
  }

  if (git(['rev-parse', 'HEAD']) !== commit) {
    throw new Error('The checked-out commit changed while the evidence lane was running.');
  }
  assertCleanCheckout();

  const packageVersions = await readPackageVersions();
  const runsById = new Map(runs.map((run) => [run.testId, run]));
  const criteria = criterionScope.claims.map(({ assertion, criterionId }) => ({
    class: assertion.class,
    criterionId,
    outcome: 'positive',
    proof: {
      artifactPaths: assertion.requiredRuns.flatMap(
        (testId) => runsById.get(testId)?.artifactPaths ?? [],
      ),
      runIds: assertion.requiredRuns,
      subjectIds: assertion.requiredSubjectIds,
    },
  }));
  const manifest = {
    artifactChecksums: Object.fromEntries(
      artifacts.map((artifact) => [artifact.path, artifact.checksum]),
    ),
    artifacts,
    bundleId,
    execution,
    criteria,
    environment: {
      browser: readBrowserVersion(),
      ...(options.profiles.some((profile) =>
        ['studio.profile/host-baseline', 'studio.profile/host-baseline-v2'].includes(profile),
      )
        ? { host: 'generic-reference-host' }
        : {}),
      node: process.versions.node,
      npm: execFileSync('npm', ['--version'], { encoding: 'utf8' }).trim(),
      os: `${process.platform}-${process.arch}`,
      packageVersions,
    },
    evidenceSchemaVersion: '0.1-draft',
    inputFixtureChecksums: Object.fromEntries(
      await Promise.all(
        evidenceInputPaths.map(async (path) => [
          path,
          await checksumFile(join(repositoryRoot, path)),
        ]),
      ),
    ),
    intakeExecutions: [],
    profiles: options.profiles,
    scope: {
      proofs: criterionScope.proofs,
      requestedCriteria: [...options.criteria],
    },
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
      tree: candidateTree,
      workingTreeState: 'clean',
    },
    subjects: [],
    workPackage: options.package,
  };

  if (!validators.validateBundle(manifest)) {
    throw new Error('Generated manifest violates its closed candidate schema.');
  }
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
  const inspection = await inspectBundleEvidence(manifest, {
    ...criterionIndex,
    evidenceRoot: stagingRoot,
    externalSubjectAssertions: externalSubjectAssertionIndex.subjectsById,
    getCommitTime(candidateCommit) {
      return candidateCommit === commit
        ? Date.parse(git(['show', '--no-patch', '--format=%cI', candidateCommit]))
        : Number.NaN;
    },
    getCommitTree(candidateCommit) {
      return candidateCommit === commit ? candidateTree : undefined;
    },
    isCommitReachable: (candidateCommit) => candidateCommit === commit,
    manualProcedures: manualProcedureIndex.proceduresById,
    manifestBytes,
    now: Date.now(),
    packageVersions,
    packageLock: JSON.parse(await readFile(join(repositoryRoot, 'package-lock.json'), 'utf8')),
    producerContractIndex,
    profileAssertions: profileAssertionIndex.profilesById,
    proofAssertions: proofAssertionIndex.assertionsByKey,
    repositoryRoot,
    validateExternalAttestationSchema: validators.validateExternalAttestation,
    validateExternalReportSchema: validators.validateExternalReport,
    validateExternalSubjectSchema: validators.validateExternalSubject,
    validateManualRecordSchema: validators.validateManualRecord,
    validateProducerSchema: validators.validateProducerSchema,
    validateReviewAttestationSchema: validators.validateReviewAttestation,
  });
  if (inspection.failures.length > 0) {
    throw new Error(
      `Generated bundle failed full semantic inspection before finalization:\n- ${inspection.failures.join('\n- ')}`,
    );
  }
  await writeFile(join(stagingDirectory, 'manifest.json'), manifestBytes, {
    flag: 'wx',
  });
  // Generators coordinate on an ignored exclusive lock. The second target
  // check closes the normal race between the initial fast failure and rename.
  const lockPath = evidenceBundleLockPath(stagingParent, bundleId);
  let lock;
  try {
    lock = await open(lockPath, 'wx');
    await assertContainedRegularDirectory(stagingParent, repositoryRoot, 'Evidence staging parent');
    await finalizeEvidenceBundleNoReplace(
      stagingDirectory,
      targetDirectory,
      evidenceBundlesRoot,
      repositoryRoot,
      'Evidence bundle',
    );
    await rm(stagingRoot, { force: true, recursive: true });
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
  await rm(stagingRoot, { force: true, recursive: true });
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

function assertSafeArtifact(bytes, testId) {
  if (bytes.byteLength > MAX_LANE_OUTPUT_BYTES) {
    throw new Error(`Lane ${testId} output exceeds the 10 MiB per-artifact limit.`);
  }
  const findings = scanSecretText(bytes.toString('utf8'));
  if (findings.length > 0) {
    throw new Error(
      `Lane ${testId} output resembles a ${findings[0].detector} credential and cannot enter evidence.`,
    );
  }
}

async function loadEvidenceValidators() {
  const schemaNames = [
    'cyclonedx-sbom-v1.schema.json',
    'evidence-bundle.schema.json',
    'external-attestation.schema.json',
    'external-report.schema.json',
    'external-subject.schema.json',
    'manual-record.schema.json',
    'producer-contracts.schema.json',
    'producer-output-v1.schema.json',
    'review-attestation.schema.json',
  ];
  const schemas = await Promise.all(
    schemaNames.map(async (name) =>
      JSON.parse(await readFile(join(repositoryRoot, 'evidence/schema', name), 'utf8')),
    ),
  );
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  for (const schema of schemas) {
    ajv.addSchema(schema);
  }
  const validator = (name) => ajv.getSchema(schemas[schemaNames.indexOf(name)].$id);
  const producerSchemaIds = new Set([
    schemas[schemaNames.indexOf('cyclonedx-sbom-v1.schema.json')].$id,
    schemas[schemaNames.indexOf('producer-output-v1.schema.json')].$id,
  ]);
  return {
    validateBundle: validator('evidence-bundle.schema.json'),
    validateExternalAttestation: validator('external-attestation.schema.json'),
    validateExternalReport: validator('external-report.schema.json'),
    validateExternalSubject: validator('external-subject.schema.json'),
    validateManualRecord: validator('manual-record.schema.json'),
    validateProducerContracts: validator('producer-contracts.schema.json'),
    validateProducerSchema(schemaId, document) {
      const validate = producerSchemaIds.has(schemaId) ? ajv.getSchema(schemaId) : undefined;
      return validate !== undefined && validate(document);
    },
    validateReviewAttestation: validator('review-attestation.schema.json'),
    producerSchemaIds,
  };
}

function buildEvidenceEnvironment(
  stagingRoot,
  globalConfig,
  userConfig,
  {
    bundleId,
    candidateCommit,
    candidateTree,
    cleanConsumerLockPath,
    execution,
    outputDirectory,
    runId,
    testId,
    workPackage,
  },
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
    'PLAYWRIGHT_BROWSERS_PATH',
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
      .filter((key) => process.env[key] !== undefined && !isCredentialBearingUrl(process.env[key]))
      .map((key) => [key, process.env[key]]),
  );
  return {
    ...environment,
    CI: '1',
    HOME: join(stagingRoot, 'home'),
    NPM_CONFIG_CACHE: join(stagingRoot, 'npm-cache'),
    NPM_CONFIG_GLOBALCONFIG: globalConfig,
    NPM_CONFIG_REGISTRY: 'https://registry.npmjs.org/',
    NPM_CONFIG_USERCONFIG: userConfig,
    TEMP: join(stagingRoot, 'tmp'),
    TMP: join(stagingRoot, 'tmp'),
    TMPDIR: join(stagingRoot, 'tmp'),
    USERPROFILE: join(stagingRoot, 'home'),
    XDG_CACHE_HOME: join(stagingRoot, 'xdg-cache'),
    XDG_CONFIG_HOME: join(stagingRoot, 'xdg-config'),
    STUDIO_EVIDENCE_CANDIDATE_SHA: candidateCommit,
    STUDIO_EVIDENCE_CANDIDATE_TREE: candidateTree,
    STUDIO_EVIDENCE_BUNDLE_ID: bundleId,
    STUDIO_EVIDENCE_EXECUTION_ATTEMPT: String(execution.attempt),
    STUDIO_EVIDENCE_EXECUTION_ID: execution.id,
    STUDIO_EVIDENCE_RUN_ID: runId,
    STUDIO_EVIDENCE_RUNNER: execution.runner,
    ...(cleanConsumerLockPath === undefined
      ? {}
      : { STUDIO_EVIDENCE_CLEAN_CONSUMER_LOCK_PATH: cleanConsumerLockPath }),
    STUDIO_EVIDENCE_OUTPUT_DIR: outputDirectory,
    STUDIO_EVIDENCE_PRODUCER_TEST_ID: testId,
    STUDIO_EVIDENCE_RUN: '1',
    STUDIO_EVIDENCE_WORK_PACKAGE: workPackage,
  };
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
