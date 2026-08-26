import { execFileSync, spawnSync } from 'node:child_process';
import {
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';

import {
  buildCriterionIndex,
  buildProofAssertionIndex,
  buildProfileAssertionIndex,
  checksumFile,
  inspectBundleEvidence,
} from './evidence-validation.mjs';
import { commandForEvidenceLane, evidenceLane } from './evidence-lanes.mjs';
import { completablePendingProofsForLane } from './evidence-plan.mjs';
import { buildExternalSubjectAssertionIndex } from './external-evidence.mjs';
import { buildManualProcedureIndex } from './manual-evidence.mjs';
import { buildProducerContractIndex } from './producer-evidence.mjs';
import {
  assertReviewerAuthorityStructuralPin,
  buildReviewerAuthorityIndex,
} from './review-authentication.mjs';
import { isCredentialBearingUrl, scanSecretText } from './lib/secret-detector.mjs';
import {
  assertContainedRegularDirectory,
  assertSafeAbsentTarget,
  addEvidenceArtifactSize,
  evidenceBundleLockPath,
  finalizeEvidenceBundleNoReplace,
} from './lib/evidence-filesystem.mjs';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const bundleRoot = join(repositoryRoot, 'evidence', 'bundles');
const maximumArtifactBytes = 10 * 1_024 * 1_024;

const { intakePath, pendingPath } = parseArguments(process.argv.slice(2));
const [resolvedPending, resolvedIntake] = await Promise.all([
  resolveRegularDirectory(pendingPath),
  resolveRegularFile(intakePath),
]);
const intakeRoot = dirname(resolvedIntake);
const [pendingManifestBytes, intakeBytes] = await Promise.all([
  readFile(join(resolvedPending, 'manifest.json')),
  readFile(resolvedIntake),
]);
const manifest = JSON.parse(pendingManifestBytes);
const intake = JSON.parse(intakeBytes);
const validation = await loadValidation();
if (!validation.validateBundle(manifest)) {
  throw new Error('Pending bundle violates the closed evidence bundle schema.');
}
if (!validation.validateIntake(intake)) {
  throw new Error('Evidence intake violates the closed version 1 intake schema.');
}
assertIdentity(manifest, intake);
if (manifest.review.status !== 'pending') {
  throw new Error('Only an immutable pending bundle can receive authenticated intake.');
}
const targetDirectory = join(bundleRoot, manifest.bundleId);
await assertSafeAbsentTarget(
  targetDirectory,
  bundleRoot,
  repositoryRoot,
  'Assembled evidence bundle',
);
if ((await realpath(resolvedPending)) === resolve(targetDirectory)) {
  throw new Error('Pending input and assembled output must be distinct immutable locations.');
}

const stagingParent = join(repositoryRoot, '.cache');
await assertContainedRegularDirectory(
  stagingParent,
  repositoryRoot,
  'Evidence intake staging parent',
  {
    create: true,
  },
);
const stagingRoot = await mkdtemp(join(stagingParent, 'evidence-intake-'));
const stagingBundle = join(stagingRoot, 'evidence', 'bundles', manifest.bundleId);
const stagingArtifacts = join(stagingBundle, 'artifacts');
await mkdir(stagingArtifacts, { recursive: true });
await Promise.all(
  ['home', 'tmp', 'xdg-cache', 'xdg-config'].map((directory) =>
    mkdir(join(stagingRoot, directory)),
  ),
);

try {
  let totalArtifactBytes = await copyPendingArtifacts(manifest, resolvedPending, stagingRoot);
  assertCleanCheckout();
  if (
    [manifest.execution, ...manifest.intakeExecutions].some(
      (execution) => execution.id === intake.execution.id,
    )
  ) {
    throw new Error(
      'Intake verifier execution identity must be distinct from retained executions.',
    );
  }
  manifest.intakeExecutions.push(intake.execution);
  const artifactPaths = new Set(manifest.artifacts.map(({ path }) => path));
  const claimKeys = new Set(
    manifest.criteria.map(
      ({ class: evidenceClass, criterionId }) => `${criterionId}\0${evidenceClass}`,
    ),
  );
  for (const entry of intake.entries) {
    const key = `${entry.criterionId}\0${entry.class}`;
    const assertion = validation.proofAssertionIndex.assertionsByKey.get(key);
    if (
      assertion === undefined ||
      assertion.availability === 'target' ||
      !assertion.requiredRuns.includes(entry.laneId) ||
      !['manual-input', 'external-input'].includes(assertion.availability)
    ) {
      throw new Error(`Intake entry ${entry.criterionId}/${entry.class} is not open for input.`);
    }
    if (claimKeys.has(key)) {
      throw new Error(`Intake entry ${entry.criterionId}/${entry.class} is already generated.`);
    }
    if (manifest.runs.some(({ testId }) => testId === entry.laneId)) {
      throw new Error(`Intake lane ${entry.laneId} already has a retained verifier run.`);
    }
    const lane = evidenceLane(entry.laneId);
    if (lane?.availability !== assertion.availability) {
      throw new Error(`Intake entry ${entry.criterionId}/${entry.class} substituted its lane.`);
    }
    const scope = manifest.scope.proofs.find(
      (proof) => proof.criterionId === entry.criterionId && proof.class === entry.class,
    );
    if (scope === undefined || scope.status !== assertion.availability) {
      throw new Error(`Intake entry ${entry.criterionId}/${entry.class} is outside pending scope.`);
    }
    const startedAt = Date.parse(entry.verificationStartedAt);
    if (!Number.isFinite(startedAt) || startedAt > Date.now()) {
      throw new Error('Intake verification start must be a current or past RFC 3339 timestamp.');
    }
    if (
      entry.runId.startsWith(`${intake.execution.id}/run-`) === false ||
      manifest.runs.some(({ runId }) => runId === entry.runId)
    ) {
      throw new Error(`Intake run identity ${entry.runId} is invalid or reused.`);
    }
    const retained = [];
    for (const descriptor of entry.artifacts) {
      const expectedPrefix = `evidence/bundles/${manifest.bundleId}/artifacts/`;
      if (
        !descriptor.targetPath.startsWith(expectedPrefix) ||
        artifactPaths.has(descriptor.targetPath)
      ) {
        throw new Error(
          `Intake artifact target ${descriptor.targetPath} is outside its bundle or reused.`,
        );
      }
      if (descriptor.role === 'run/log' || !lane.artifactRoles.includes(descriptor.role)) {
        throw new Error(`Intake artifact role ${descriptor.role} is outside lane ${entry.laneId}.`);
      }
      const source = await resolveContainedRegularFile(intakeRoot, descriptor.sourcePath);
      const sourceStat = await lstat(source);
      totalArtifactBytes = addEvidenceArtifactSize(
        totalArtifactBytes,
        sourceStat.size,
        `Intake artifact ${descriptor.sourcePath}`,
      );
      const bytes = await readFile(source);
      assertSafeBytes(bytes, descriptor.sourcePath);
      const sourceChecksum = await checksumFile(source);
      if (sourceChecksum !== descriptor.checksum) {
        throw new Error(
          `Intake artifact ${descriptor.sourcePath} differs from its declared checksum.`,
        );
      }
      const target = join(stagingRoot, descriptor.targetPath);
      await mkdir(dirname(target), { recursive: true });
      await copyFile(source, target, 0);
      if ((await lstat(target)).size !== sourceStat.size) {
        throw new Error(`Intake artifact ${descriptor.sourcePath} changed while it was copied.`);
      }
      const artifact = {
        checksum: sourceChecksum,
        mediaType: descriptor.mediaType,
        path: descriptor.targetPath,
        producerTestId: entry.laneId,
        role: descriptor.role,
      };
      manifest.artifacts.push(artifact);
      manifest.artifactChecksums[artifact.path] = artifact.checksum;
      artifactPaths.add(artifact.path);
      retained.push(artifact);
    }
    assertIntakeRoles(entry, retained, lane, validation.manualProcedureIndex.proceduresById);
    const runIndex = manifest.runs.length;
    const logPath = `evidence/bundles/${manifest.bundleId}/artifacts/${String(runIndex + 1).padStart(2, '0')}-${entry.laneId.replaceAll('/', '-')}.log`;
    const run = {
      artifactPaths: retained.map(({ path }) => path),
      command: commandForEvidenceLane(entry.laneId),
      endedAt: new Date().toISOString(),
      executionAttempt: intake.execution.attempt,
      executionId: intake.execution.id,
      exitStatus: 1,
      retryCount: 0,
      runId: entry.runId,
      runner: intake.execution.runner,
      startedAt: entry.verificationStartedAt,
      testId: entry.laneId,
    };
    manifest.runs.push(run);
    const verifierManifestPath = join(stagingBundle, 'intake-manifest.json');
    await writeFile(verifierManifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
    const verifierEnvironment = buildVerifierEnvironment(stagingRoot, manifest, entry, retained);
    const result = spawnSync(lane.command, lane.args, {
      cwd: repositoryRoot,
      encoding: 'utf8',
      env: verifierEnvironment,
      maxBuffer: maximumArtifactBytes,
    });
    await rm(verifierManifestPath, { force: true });
    run.endedAt = new Date().toISOString();
    run.exitStatus = typeof result.status === 'number' ? result.status : 1;
    const logBytes = Buffer.from(
      `command: ${run.command}\nstartedAt: ${run.startedAt}\nendedAt: ${run.endedAt}\n` +
        `exitStatus: ${run.exitStatus}\nretryCount: 0\n\nstdout:\n${result.stdout ?? ''}` +
        `\n\nstderr:\n${result.stderr ?? ''}`,
    );
    assertSafeBytes(logBytes, entry.laneId);
    totalArtifactBytes = addEvidenceArtifactSize(
      totalArtifactBytes,
      logBytes.byteLength,
      `Verifier log ${entry.laneId}`,
    );
    if (result.error !== undefined || run.exitStatus !== 0) {
      throw new Error(
        `Authenticated intake verifier ${run.command} exited ${run.exitStatus}.\n${logBytes.toString('utf8').slice(-4_000)}`,
        { cause: result.error },
      );
    }
    const logTarget = join(stagingRoot, logPath);
    await writeFile(logTarget, logBytes, { flag: 'wx' });
    const logArtifact = {
      checksum: await checksumFile(logTarget),
      mediaType: 'text/plain',
      path: logPath,
      producerTestId: entry.laneId,
      role: 'run/log',
    };
    manifest.artifacts.push(logArtifact);
    manifest.artifactChecksums[logPath] = logArtifact.checksum;
    run.artifactPaths.unshift(logPath);
    if (entry.kind === 'external') {
      const subjectArtifact = retained.find(
        ({ role }) => role === 'integration/external-subject-v1',
      );
      manifest.subjects.push(
        JSON.parse(await readFile(join(stagingRoot, subjectArtifact.path), 'utf8')),
      );
    }
    const runsById = new Map(manifest.runs.map((item) => [item.testId, item]));
    const subjectIds = new Set(manifest.subjects.map(({ id }) => id));
    const completed = completablePendingProofsForLane(
      manifest.scope.proofs,
      entry.laneId,
      validation.proofAssertionIndex.assertionsByKey,
      runsById,
      subjectIds,
      claimKeys,
    );
    if (!completed.some(({ key: completedKey }) => completedKey === key)) {
      const missing = assertion.requiredRuns.filter((testId) => !runsById.has(testId));
      throw new Error(
        `Intake for ${entry.criterionId}/${entry.class} remains incomplete${
          missing.length > 0 ? `; missing ${missing.join(', ')}` : ''
        }.`,
      );
    }
    for (const completedProof of completed) {
      completedProof.proof.availableRunIds = [...completedProof.assertion.requiredRuns];
      completedProof.proof.missingRunIds = [];
      completedProof.proof.status = 'generated';
      manifest.criteria.push({
        class: completedProof.proof.class,
        criterionId: completedProof.proof.criterionId,
        outcome: entry.kind === 'manual' ? 'manual' : 'positive',
        proof: {
          artifactPaths: completedProof.assertion.requiredRuns.flatMap(
            (testId) => runsById.get(testId).artifactPaths,
          ),
          runIds: [...completedProof.assertion.requiredRuns],
          subjectIds: [...completedProof.assertion.requiredSubjectIds],
        },
      });
      claimKeys.add(completedProof.key);
    }
  }
  assertExactCandidateCheckout(manifest);
  assertCleanCheckout();
  manifest.redaction.statement =
    'This pending bundle combines generator-owned internal output with checksum-bound, signed ' +
    'manual or external intake. Intake validation does not fabricate a human observation, ' +
    'external workflow result, bundle reproduction, or gate decision.';
  if (!validation.validateBundle(manifest)) {
    throw new Error('Assembled manifest violates the closed evidence bundle schema.');
  }
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
  const packageVersions = await readPackageVersions();
  const inspection = await inspectBundleEvidence(manifest, {
    ...validation.criterionIndex,
    evidenceRoot: stagingRoot,
    externalSubjectAssertions: validation.externalSubjectIndex.subjectsById,
    getCommitTime: () =>
      Date.parse(git(['show', '--no-patch', '--format=%cI', manifest.source.commit])),
    getCommitTree: () => git(['rev-parse', `${manifest.source.commit}^{tree}`]),
    isCommitReachable: (commit) => commit === git(['rev-parse', 'HEAD']),
    manualProcedures: validation.manualProcedureIndex.proceduresById,
    manifestBytes,
    now: Date.now(),
    packageLock: JSON.parse(await readFile(join(repositoryRoot, 'package-lock.json'), 'utf8')),
    packageVersions,
    producerContractIndex: validation.producerContractIndex,
    profileAssertions: validation.profileAssertionIndex.profilesById,
    proofAssertions: validation.proofAssertionIndex.assertionsByKey,
    reviewerAuthorities: validation.reviewerAuthorityIndex.authoritiesByIdentity,
    reviewerAuthorityStructuralPinVerified: true,
    repositoryRoot,
    temporaryRoot: join(stagingRoot, 'tmp'),
    validateExternalAttestationSchema: validation.validateExternalAttestation,
    validateExternalReportSchema: validation.validateExternalReport,
    validateExternalSubjectSchema: validation.validateExternalSubject,
    validateManualRecordSchema: validation.validateManualRecord,
    validateProducerSchema: validation.validateProducerSchema,
    validateReviewAttestationSchema: validation.validateReviewAttestation,
  });
  if (inspection.failures.length > 0) {
    throw new Error(
      `Authenticated intake failed closed inspection:\n- ${inspection.failures.join('\n- ')}`,
    );
  }
  await writeFile(join(stagingBundle, 'manifest.json'), manifestBytes, { flag: 'wx' });
  const lockPath = evidenceBundleLockPath(stagingParent, manifest.bundleId);
  let lock;
  try {
    lock = await open(lockPath, 'wx');
    await assertContainedRegularDirectory(
      stagingParent,
      repositoryRoot,
      'Evidence intake staging parent',
    );
    assertExactCandidateCheckout(manifest);
    assertCleanCheckout();
    await finalizeEvidenceBundleNoReplace(
      stagingBundle,
      targetDirectory,
      bundleRoot,
      repositoryRoot,
      'Assembled evidence bundle',
    );
  } finally {
    if (lock !== undefined) {
      await lock.close();
      await rm(lockPath, { force: true });
    }
  }
  await rm(stagingRoot, { force: true, recursive: true });
  process.stdout.write(
    `Assembled pending bundle evidence/bundles/${manifest.bundleId}; independent bundle review and gate acceptance remain required.\n`,
  );
} catch (error) {
  await rm(stagingRoot, { force: true, recursive: true });
  throw error;
}

function buildVerifierEnvironment(stagingRoot, manifest, entry, retained) {
  const passthroughKeys = [
    'COMSPEC',
    'LANG',
    'LC_ALL',
    'PATH',
    'PATHEXT',
    'SSL_CERT_DIR',
    'SSL_CERT_FILE',
    'SYSTEMROOT',
    'TZ',
  ];
  const proxyKeys = [
    'ALL_PROXY',
    'HTTPS_PROXY',
    'HTTP_PROXY',
    'NO_PROXY',
    'all_proxy',
    'https_proxy',
    'http_proxy',
    'no_proxy',
  ];
  const environment = Object.fromEntries(
    [...passthroughKeys, ...proxyKeys]
      .filter(
        (name) =>
          process.env[name] !== undefined &&
          (!proxyKeys.includes(name) || !isCredentialBearingUrl(process.env[name])),
      )
      .map((name) => [name, process.env[name]]),
  );
  const verifierManifestPath = `evidence/bundles/${manifest.bundleId}/intake-manifest.json`;
  const record = retained.find(({ role }) =>
    entry.kind === 'manual'
      ? ['accessibility/manual-interaction-report-v1', 'manual/decision-record-v1'].includes(role)
      : role === 'integration/external-subject-v1',
  );
  if (record === undefined) {
    throw new Error(`Intake lane ${entry.laneId} lacks its verifier subject record.`);
  }
  return {
    ...environment,
    CI: '1',
    HOME: join(stagingRoot, 'home'),
    STUDIO_EVIDENCE_ROOT: relative(repositoryRoot, stagingRoot),
    TEMP: join(stagingRoot, 'tmp'),
    TMP: join(stagingRoot, 'tmp'),
    TMPDIR: join(stagingRoot, 'tmp'),
    USERPROFILE: join(stagingRoot, 'home'),
    XDG_CACHE_HOME: join(stagingRoot, 'xdg-cache'),
    XDG_CONFIG_HOME: join(stagingRoot, 'xdg-config'),
    ...(entry.kind === 'manual'
      ? {
          STUDIO_MANUAL_BUNDLE_MANIFEST_PATH: verifierManifestPath,
          STUDIO_MANUAL_EVIDENCE_PATH: record.path,
        }
      : {
          STUDIO_EXTERNAL_BUNDLE_MANIFEST_PATH: verifierManifestPath,
          STUDIO_EXTERNAL_SUBJECT_PATH: record.path,
        }),
  };
}

function assertIdentity(manifest, intake) {
  if (
    intake.bundleId !== manifest.bundleId ||
    intake.candidateCommit !== manifest.source.commit ||
    intake.candidateTree !== manifest.source.tree ||
    intake.workPackage !== manifest.workPackage ||
    JSON.stringify(intake.pendingExecution) !== JSON.stringify(manifest.execution)
  ) {
    throw new Error('Intake, pending bundle, and checked-out candidate identities differ.');
  }
  assertExactCandidateCheckout(manifest);
}

function assertExactCandidateCheckout(manifest) {
  if (
    git(['rev-parse', 'HEAD']) !== manifest.source.commit ||
    git(['rev-parse', 'HEAD^{tree}']) !== manifest.source.tree
  ) {
    throw new Error('The checked-out commit or tree changed during authenticated intake.');
  }
}

function assertCleanCheckout() {
  if (git(['status', '--porcelain', '--untracked-files=all']) !== '') {
    throw new Error(
      'The working tree is dirty. Authenticated intake requires the exact clean candidate checkout.',
    );
  }
}

function assertIntakeRoles(entry, artifacts, lane, procedures) {
  const roles = artifacts.map(({ role }) => role);
  const expected = lane.artifactRoles.filter((role) => role !== 'run/log');
  for (const role of expected) {
    if (!roles.includes(role)) throw new Error(`Intake lane ${entry.laneId} lacks role ${role}.`);
  }
  if (roles.some((role) => !expected.includes(role))) {
    throw new Error(`Intake lane ${entry.laneId} contains an unregistered artifact role.`);
  }
  const uniqueRoles = roles.filter((role) => role !== 'manual/observation-v1');
  if (new Set(uniqueRoles).size !== uniqueRoles.length) {
    throw new Error(`Intake lane ${entry.laneId} duplicates a singleton artifact role.`);
  }
  if (entry.kind === 'manual') {
    const procedure = [...procedures.values()].find(({ laneId }) => laneId === entry.laneId);
    if (procedure === undefined || entry.class !== procedure.evidenceClass) {
      throw new Error(`Manual intake lane ${entry.laneId} has no exact registered procedure.`);
    }
  } else if (entry.class !== 'integration') {
    throw new Error('External intake is restricted to the registered integration class.');
  }
}

async function copyPendingArtifacts(manifest, pending, stagingRoot) {
  const entries = await readdir(pending, { withFileTypes: true });
  if (
    entries.some(
      (entry) =>
        !['artifacts', 'manifest.json'].includes(entry.name) ||
        entry.isSymbolicLink() ||
        (entry.name === 'artifacts' ? !entry.isDirectory() : !entry.isFile()),
    )
  ) {
    throw new Error(
      'Pending bundle must contain only manifest.json and its regular artifacts directory.',
    );
  }
  const bundlePrefix = `evidence/bundles/${manifest.bundleId}/artifacts/`;
  const expectedFiles = new Set();
  let totalArtifactBytes = 0;
  for (const artifact of manifest.artifacts) {
    if (!artifact.path.startsWith(bundlePrefix)) {
      throw new Error(`Pending artifact ${artifact.path} is outside ${bundlePrefix}.`);
    }
    const artifactSuffix = artifact.path.slice(bundlePrefix.length);
    const source = resolve(pending, 'artifacts', artifactSuffix);
    if (artifactSuffix.length === 0 || !isContained(pending, source)) {
      throw new Error(`Pending artifact ${artifact.path} has an invalid retained path.`);
    }
    expectedFiles.add(artifactSuffix);
    const sourceStat = await lstat(source);
    if (
      !sourceStat.isFile() ||
      sourceStat.isSymbolicLink() ||
      !isContained(await realpath(join(pending, 'artifacts')), await realpath(source))
    ) {
      throw new Error(`Pending artifact ${artifact.path} is not a regular file.`);
    }
    totalArtifactBytes = addEvidenceArtifactSize(
      totalArtifactBytes,
      sourceStat.size,
      `Pending artifact ${artifact.path}`,
    );
    if ((await checksumFile(source)) !== artifact.checksum) {
      throw new Error(`Pending artifact ${artifact.path} changed after generation.`);
    }
    const target = join(stagingRoot, artifact.path);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(source, target, 0);
    if ((await lstat(target)).size !== sourceStat.size) {
      throw new Error(`Pending artifact ${artifact.path} changed while it was copied.`);
    }
  }
  const actualFiles = new Set(await listRegularFiles(join(pending, 'artifacts')));
  if (
    actualFiles.size !== expectedFiles.size ||
    [...actualFiles].some((path) => !expectedFiles.has(path))
  ) {
    throw new Error('Pending artifact directory differs from the checksum-bound manifest set.');
  }
  return totalArtifactBytes;
}

async function listRegularFiles(root, directory = root) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink() || (!entry.isFile() && !entry.isDirectory())) {
      throw new Error('Pending artifacts must be regular files under regular directories.');
    }
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listRegularFiles(root, path)));
    } else {
      files.push(relative(root, path));
    }
  }
  return files;
}

async function loadValidation() {
  const schemaNames = [
    'cyclonedx-sbom-v1.schema.json',
    'evidence-bundle.schema.json',
    'evidence-intake-v1.schema.json',
    'external-attestation.schema.json',
    'external-report.schema.json',
    'external-subject.schema.json',
    'manual-record.schema.json',
    'producer-contracts.schema.json',
    'producer-output-v1.schema.json',
    'review-attestation.schema.json',
  ];
  const schemas = await Promise.all(
    schemaNames.map((name) =>
      readFile(join(repositoryRoot, 'evidence/schema', name), 'utf8').then(JSON.parse),
    ),
  );
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  for (const schema of schemas) ajv.addSchema(schema);
  const validator = (name) => ajv.getSchema(schemas[schemaNames.indexOf(name)].$id);
  const gateRegistry = JSON.parse(
    await readFile(join(repositoryRoot, 'evidence/gate-criteria.json'), 'utf8'),
  );
  const criterionIndex = buildCriterionIndex(gateRegistry);
  const profileRegistry = JSON.parse(
    await readFile(join(repositoryRoot, 'evidence/profile-assertions.json'), 'utf8'),
  );
  const profileAssertionIndex = buildProfileAssertionIndex(
    profileRegistry,
    criterionIndex.allowedProfiles,
  );
  const manualRegistry = JSON.parse(
    await readFile(join(repositoryRoot, 'evidence/manual-procedures.json'), 'utf8'),
  );
  const manualProcedureIndex = buildManualProcedureIndex(
    manualRegistry,
    criterionIndex.criteriaById,
  );
  const externalRegistry = JSON.parse(
    await readFile(join(repositoryRoot, 'evidence/external-subject-assertions.json'), 'utf8'),
  );
  const externalSubjectIndex = buildExternalSubjectAssertionIndex(externalRegistry);
  const proofRegistry = JSON.parse(
    await readFile(join(repositoryRoot, 'evidence/proof-assertions.json'), 'utf8'),
  );
  const proofAssertionIndex = buildProofAssertionIndex(proofRegistry, criterionIndex.criteriaById, {
    externalSubjects: externalSubjectIndex.subjectsById,
    manualProcedures: manualProcedureIndex.proceduresById,
    profileAssertions: profileAssertionIndex.profilesById,
  });
  const producerRegistry = JSON.parse(
    await readFile(join(repositoryRoot, 'evidence/producer-contracts.json'), 'utf8'),
  );
  const producerSchemaIds = new Set([
    validator('cyclonedx-sbom-v1.schema.json').schema.$id,
    validator('producer-output-v1.schema.json').schema.$id,
  ]);
  const producerContractIndex = buildProducerContractIndex(producerRegistry, {
    schemaIds: producerSchemaIds,
  });
  const authorityBytes = await readFile(join(repositoryRoot, 'evidence/reviewer-authorities.json'));
  const authorityChecksum = await readFile(
    join(repositoryRoot, 'evidence/reviewer-authorities.sha256'),
  );
  assertReviewerAuthorityStructuralPin(authorityBytes, authorityChecksum);
  const reviewerAuthorityIndex = buildReviewerAuthorityIndex(JSON.parse(authorityBytes));
  const failures = [
    ...criterionIndex.failures,
    ...profileAssertionIndex.failures,
    ...manualProcedureIndex.failures,
    ...externalSubjectIndex.failures,
    ...proofAssertionIndex.failures,
    ...producerContractIndex.failures,
    ...reviewerAuthorityIndex.failures,
  ];
  if (failures.length > 0)
    throw new Error(`Evidence registries are invalid:\n- ${failures.join('\n- ')}`);
  return {
    criterionIndex,
    externalSubjectIndex,
    manualProcedureIndex,
    producerContractIndex,
    profileAssertionIndex,
    proofAssertionIndex,
    reviewerAuthorityIndex,
    validateBundle: validator('evidence-bundle.schema.json'),
    validateExternalAttestation: validator('external-attestation.schema.json'),
    validateExternalReport: validator('external-report.schema.json'),
    validateExternalSubject: validator('external-subject.schema.json'),
    validateIntake: validator('evidence-intake-v1.schema.json'),
    validateManualRecord: validator('manual-record.schema.json'),
    validateProducerSchema(schemaId, document) {
      const validate = producerSchemaIds.has(schemaId) ? ajv.getSchema(schemaId) : undefined;
      return validate !== undefined && validate(document);
    },
    validateReviewAttestation: validator('review-attestation.schema.json'),
  };
}

async function readPackageVersions() {
  const record = JSON.parse(await readFile(join(repositoryRoot, 'studio-release.json'), 'utf8'));
  const versions = { ...record.packages };
  for (const name of ['ajv', '@playwright/test']) {
    versions[name] = JSON.parse(
      await readFile(join(repositoryRoot, 'node_modules', name, 'package.json'), 'utf8'),
    ).version;
  }
  return versions;
}

function assertSafeBytes(bytes, label) {
  if (bytes.byteLength > maximumArtifactBytes)
    throw new Error(`Intake artifact ${label} exceeds 10 MiB.`);
  const findings = scanSecretText(bytes.toString('utf8'));
  if (findings.length > 0)
    throw new Error(`Intake artifact ${label} resembles a ${findings[0].detector} credential.`);
}

async function resolveRegularDirectory(path) {
  const candidate = await resolveContainedPath(path);
  const stat = await lstat(candidate);
  if (!stat.isDirectory() || stat.isSymbolicLink())
    throw new Error(`${path} must be a regular directory.`);
  return candidate;
}

async function resolveRegularFile(path) {
  const candidate = await resolveContainedPath(path);
  const stat = await lstat(candidate);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`${path} must be a regular file.`);
  return candidate;
}

async function resolveContainedRegularFile(root, path) {
  const candidate = resolve(root, path);
  if (!isContained(root, candidate)) throw new Error(`Intake source ${path} escapes its root.`);
  const stat = await lstat(candidate);
  if (!stat.isFile() || stat.isSymbolicLink())
    throw new Error(`Intake source ${path} is not a regular file.`);
  if (!isContained(await realpath(root), await realpath(candidate)))
    throw new Error(`Intake source ${path} resolves outside its root.`);
  return candidate;
}

async function resolveContainedPath(path) {
  if (typeof path !== 'string' || path.length === 0 || isAbsolute(path) || path.includes('\0')) {
    throw new Error('Evidence intake paths must be repository-relative.');
  }
  const candidate = resolve(repositoryRoot, path);
  if (
    !isContained(repositoryRoot, candidate) ||
    !isContained(await realpath(repositoryRoot), await realpath(candidate))
  ) {
    throw new Error(`Evidence intake path ${path} resolves outside the repository.`);
  }
  return candidate;
}

function isContained(root, candidate) {
  const path = relative(root, candidate);
  return path === '' || (!isAbsolute(path) && path !== '..' && !path.startsWith(`..${sep}`));
}

function parseArguments(argv) {
  if (argv.length !== 4 || argv[0] !== '--pending' || argv[2] !== '--intake') {
    throw new Error(
      'Usage: node scripts/assemble-evidence-bundle.mjs --pending <bundle-dir> --intake <intake.json>',
    );
  }
  return { pendingPath: argv[1], intakePath: argv[3] };
}

function git(args) {
  return execFileSync('git', args, { cwd: repositoryRoot, encoding: 'utf8' }).trim();
}
