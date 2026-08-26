import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import Ajv2020 from 'ajv/dist/2020.js';

import {
  buildCriterionIndex,
  buildEnvironmentAssertionIndex,
  buildProofAssertionIndex,
  buildProfileAssertionIndex,
  checksumIntegrity,
  commandForEvidenceLane,
  collectGateRecordFailures,
  EVIDENCE_SEMANTIC_INPUTS,
  environmentMatchesPredicate,
  inspectBundleEvidence,
} from './evidence-validation.mjs';
import { buildExternalSubjectAssertionIndex } from './external-evidence.mjs';
import { buildManualProcedureIndex } from './manual-evidence.mjs';
import {
  assertReviewerAuthorityReleaseTrust,
  assertReviewerAuthorityStructuralPin,
  buildReviewerAuthorityIndex,
} from './review-authentication.mjs';
import { assertCoordinatedRelease } from './release-record.mjs';
import { STUDIO_RELEASE_PACKAGES, STUDIO_RELEASE_RECORD_TARGETS } from './release-family.mjs';
import { preparePromotion } from './prepare-promotion.mjs';
import {
  assertPromotionEvidencePolicy,
  assertSameReleaseCoordinate,
  promotionTargetVersion,
  requiredGateForChannel,
} from './release-policy.mjs';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const shaPattern = /^[a-f0-9]{40}$/u;
const candidateEvidenceSchemaNames = Object.freeze([
  'environment-assertions.schema.json',
  'environment-matrix.schema.json',
  'evidence-bundle.schema.json',
  'external-attestation.schema.json',
  'external-report.schema.json',
  'external-subject-assertions.schema.json',
  'external-subject.schema.json',
  'gate-criteria.schema.json',
  'gate-record.schema.json',
  'manual-procedures.schema.json',
  'manual-record.schema.json',
  'proof-assertions.schema.json',
  'review-attestation.schema.json',
  'reviewer-authorities.schema.json',
]);
export const EVIDENCE_SEMANTIC_PATHS = EVIDENCE_SEMANTIC_INPUTS;
const evidenceDiffAllowlist = Object.freeze([
  /^docs\/roadmap\/(?:STATUS|evidence)\.md$/u,
  /^evidence\/README\.md$/u,
  /^evidence\/bundles\//u,
  /^evidence\/environment-matrix\.json$/u,
  /^evidence\/gates\//u,
]);
const stableDiffAllowlist = Object.freeze([
  /^\.changeset\/pre(?:\.json|\/)/u,
  /^examples\/reference-host\/package\.json$/u,
  /^package-lock\.json$/u,
  /^packages\/(?:core|media|preview|protocol|renderer-web|rich-text|studio-lit|testkit)\/(?:CHANGELOG\.md|package\.json)$/u,
  /^packages\/(?:protocol|testkit)\/studio-release\.json$/u,
  /^release-profile-claims\.json$/u,
  /^studio-release\.json$/u,
]);
const stableGeneratedPaths = Object.freeze([
  '.changeset/pre.json',
  'examples/reference-host/package.json',
  'package-lock.json',
  'release-profile-claims.json',
  ...STUDIO_RELEASE_RECORD_TARGETS,
  ...STUDIO_RELEASE_PACKAGES.flatMap(({ directory }) => [
    `packages/${directory}/CHANGELOG.md`,
    `packages/${directory}/package.json`,
  ]),
]);
const stableGeneratorInputPaths = Object.freeze([
  ...stableGeneratedPaths,
  'packages/protocol/src/types.ts',
  'packages/testkit/corpus-manifest.json',
]);

export function assertStatusGatePass(status, gate) {
  const rows = status
    .split('\n')
    .filter((line) => /^\s*\|/u.test(line))
    .map((line) =>
      line
        .split('|')
        .slice(1, -1)
        .map((cell) => cell.trim()),
    )
    .filter((cells) => statusRowGate(cells[0]) === gate);
  const states = rows.map((cells) => cells.flatMap(classifyGateStates));
  if (
    rows.length === 0 ||
    states.some((rowStates) => rowStates.length !== 1) ||
    states.some(([state]) => state !== 'pass')
  ) {
    const found = [...new Set(states.flat())];
    throw new Error(
      `docs/roadmap/STATUS.md does not unambiguously record Gate ${gate} as Pass` +
        ` across every authoritative row (found: ${found.join(', ') || 'none'}); publication is blocked.`,
    );
  }
}

export function assertStableEnvironmentQualification(
  matrix,
  candidateMatrix = matrix,
  acceptedBundles = new Map(),
  assertionsById = new Map(),
) {
  const candidateById = new Map(
    candidateMatrix.environments.map((environment) => [environment.id, environment]),
  );
  const qualifiedById = new Map(
    matrix.environments.map((environment) => [environment.id, environment]),
  );
  if (
    candidateById.size !== candidateMatrix.environments.length ||
    qualifiedById.size !== matrix.environments.length ||
    [...candidateById.keys()].sort().join('\n') !== [...qualifiedById.keys()].sort().join('\n')
  ) {
    throw new Error(
      'Stable qualification must preserve every candidate environment-matrix identity.',
    );
  }
  const identityDrift = [...candidateById].filter(([id, candidate]) => {
    const qualified = qualifiedById.get(id);
    return qualified.kind !== candidate.kind || qualified.requirement !== candidate.requirement;
  });
  if (identityDrift.length > 0) {
    throw new Error(
      `Stable qualification changed candidate environment requirements: ${identityDrift
        .map(([id]) => id)
        .join(', ')}.`,
    );
  }
  if (
    assertionsById.size !== candidateById.size ||
    [...candidateById.keys()].some((id) => !assertionsById.has(id))
  ) {
    throw new Error('Stable qualification requires a closed assertion for every environment.');
  }
  const targetBlockers = [];
  const incomplete = [];
  for (const id of candidateById.keys()) {
    const environment = qualifiedById.get(id);
    const assertion = assertionsById.get(id);
    if (assertion.status !== 'executable') {
      if (environment.status === 'qualified') {
        throw new Error(
          `Stable environment ${id} is still target-only and cannot claim qualified status.`,
        );
      }
      if (id !== 'dart-flutter') {
        targetBlockers.push(id);
      }
      continue;
    }
    if (
      environment.status !== 'qualified' ||
      !Array.isArray(environment.coveredBy) ||
      environment.coveredBy.length === 0
    ) {
      incomplete.push(id);
      continue;
    }
    const resolvedReferences = environment.coveredBy.map((reference) =>
      resolveEnvironmentReference(id, reference, acceptedBundles),
    );
    for (const resolved of resolvedReferences) {
      const matchingVariant = assertion.variants.find(
        (variant) =>
          variant.requiredRuns.includes(resolved.testId) &&
          environmentMatchesPredicate(resolved.bundle.environment, variant.environment),
      );
      if (matchingVariant === undefined) {
        throw new Error(
          `Stable environment ${id} coverage ${resolved.reference} does not match a governed variant.`,
        );
      }
    }
    for (const variant of assertion.variants) {
      for (const testId of variant.requiredRuns) {
        if (
          !resolvedReferences.some(
            (resolved) =>
              resolved.testId === testId &&
              environmentMatchesPredicate(resolved.bundle.environment, variant.environment),
          )
        ) {
          throw new Error(
            `Stable environment ${id} lacks ${variant.id} coverage for registered lane ${testId}.`,
          );
        }
      }
    }
  }
  if (incomplete.length > 0) {
    throw new Error(
      `Stable publication requires every executable Version 2 environment to be qualified: ${incomplete.join(', ')}.`,
    );
  }
  if (targetBlockers.length > 0) {
    throw new Error(
      `Stable publication is blocked by target-only Version 2 environments: ${targetBlockers.join(', ')}.`,
    );
  }
}

function resolveEnvironmentReference(id, reference, acceptedBundles) {
  const separator = reference.indexOf('#');
  const bundleId = separator > 0 ? reference.slice(0, separator) : '';
  const testId = separator > 0 ? reference.slice(separator + 1) : '';
  const bundle = acceptedBundles.get(bundleId);
  const run = bundle?.runs?.find((candidate) => candidate.testId === testId);
  const expectedCommand = commandForEvidenceLane(testId);
  if (
    bundle === undefined ||
    run === undefined ||
    expectedCommand === undefined ||
    run.command !== expectedCommand ||
    run.exitStatus !== 0 ||
    run.retryCount !== 0
  ) {
    throw new Error(
      `Stable environment ${id} coverage ${reference} does not resolve to an accepted reproduced bundle and registered passing lane.`,
    );
  }
  return { bundle, reference, testId };
}

export function assertCurrentCandidateCoordinate(currentRecord, candidateRecord) {
  assertCoordinatedRelease(currentRecord);
  assertCoordinatedRelease(candidateRecord);
  assertSameReleaseCoordinate(currentRecord, candidateRecord);
}

export function assertLatestGateDecision(suppliedRecordBytes, latestRecordBytes, gate) {
  if (!suppliedRecordBytes.equals(latestRecordBytes)) {
    throw new Error(
      `Current main has superseded or revoked the supplied Gate ${gate} decision record.`,
    );
  }
}

export function assertStablePromotion(qualifiedRecord, stableRecord) {
  assertCoordinatedRelease(qualifiedRecord);
  assertCoordinatedRelease(stableRecord);
  const expected = promotionTargetVersion('stable', qualifiedRecord.release);
  if (stableRecord.release !== expected) {
    throw new Error(
      `Stable publication source must be the deterministic ${qualifiedRecord.release} -> ${expected} transform.`,
    );
  }
  if (
    [...qualifiedRecord.claimedProfiles].sort().join('\n') !==
    [...stableRecord.claimedProfiles].sort().join('\n')
  ) {
    throw new Error('Stable promotion must preserve the qualified RC profile claims exactly.');
  }
}

export function assertStableChangedPaths(paths) {
  const forbidden = paths.filter(
    (path) => !stableDiffAllowlist.some((pattern) => pattern.test(path)),
  );
  if (forbidden.length > 0) {
    throw new Error(
      `Stable promotion changed paths outside generated release metadata:\n${forbidden.join('\n')}`,
    );
  }
}

export function assertEvidenceChangedPaths(paths) {
  const forbidden = paths.filter(
    (path) => !evidenceDiffAllowlist.some((pattern) => pattern.test(path)),
  );
  if (forbidden.length > 0) {
    throw new Error(
      `The candidate-to-gate commit range changed files outside evidence records:\n${forbidden.join('\n')}`,
    );
  }
}

export async function assertEvidenceSemanticEquality(
  candidateRoot,
  executionRoot,
  { allowWorkspaceReleaseVersionDrift = false } = {},
) {
  for (const path of EVIDENCE_SEMANTIC_PATHS) {
    if (path === 'package-lock.json') continue;
    let candidate;
    let executing;
    try {
      [candidate, executing] = await Promise.all([
        readFile(resolve(candidateRoot, path)),
        readFile(resolve(executionRoot, path)),
      ]);
    } catch (error) {
      throw new Error(
        `Candidate and current-main release-controller semantics must both contain ${path}; publication is blocked.`,
        { cause: error },
      );
    }
    if (!candidate.equals(executing)) {
      throw new Error(
        `Candidate evidence semantics ${path} differ from the executing release verifier; publication is blocked.`,
      );
    }
  }
  await assertReleaseControllerDependencyEquality(candidateRoot, executionRoot, {
    allowWorkspaceReleaseVersionDrift,
  });
}

export async function assertReleaseControllerDependencyEquality(
  candidateRoot,
  executionRoot,
  { allowWorkspaceReleaseVersionDrift = false } = {},
) {
  const [candidateBytes, executingBytes] = await Promise.all(
    [candidateRoot, executionRoot].map((root) => readFile(resolve(root, 'package-lock.json'))),
  );
  if (!allowWorkspaceReleaseVersionDrift) {
    if (!candidateBytes.equals(executingBytes)) {
      throw new Error(
        'Candidate package-lock.json differs from the exact current-main release controller; publication is blocked.',
      );
    }
    return;
  }
  const [candidateLock, executingLock] = [candidateBytes, executingBytes].map((bytes) =>
    releaseControllerDependencyView(JSON.parse(bytes.toString('utf8'))),
  );
  if (!isDeepStrictEqual(candidateLock, executingLock)) {
    throw new Error(
      'Candidate external dependency closure differs from the current-main release controller; publication is blocked.',
    );
  }
}

export function releaseControllerDependencyView(lockfile) {
  if (
    lockfile === null ||
    typeof lockfile !== 'object' ||
    lockfile.lockfileVersion !== 3 ||
    lockfile.packages === null ||
    typeof lockfile.packages !== 'object' ||
    Array.isArray(lockfile.packages)
  ) {
    throw new Error('Release-controller dependency comparison requires an npm lockfile v3.');
  }
  const packages = Object.fromEntries(
    Object.entries(lockfile.packages).filter(
      ([path, metadata]) =>
        path === '' ||
        (path.startsWith('node_modules/') &&
          metadata !== null &&
          typeof metadata === 'object' &&
          metadata.link !== true),
    ),
  );
  if (!Object.hasOwn(packages, '')) {
    throw new Error('Release-controller dependency comparison requires the root lockfile package.');
  }
  return { lockfileVersion: lockfile.lockfileVersion, packages };
}

export async function verifyReleaseGate({
  candidateRoot,
  candidateSha,
  channel,
  evidenceCommit,
  evidenceRoot,
  expectedMainSha,
  phase,
  publishRoot,
  publishSourceSha,
  reviewerAuthorityChecksum,
}) {
  for (const [label, value] of Object.entries({
    candidateSha,
    evidenceCommit,
    expectedMainSha,
    publishSourceSha,
  })) {
    if (!shaPattern.test(value)) {
      throw new Error(`${label} must be an exact lowercase 40-character SHA.`);
    }
  }
  if (phase !== 'prepare' && phase !== 'publish') {
    throw new Error('Promotion phase must be prepare or publish.');
  }
  const requiredGate = requiredGateForChannel(channel);
  const checkedOutCandidate = git(candidateRoot, ['rev-parse', 'HEAD']);
  const checkedOutPublishSource = git(publishRoot, ['rev-parse', 'HEAD']);
  const checkedOutEvidenceCommit = git(evidenceRoot, ['rev-parse', 'HEAD']);
  const remoteMain = liveRemoteMain(publishRoot);
  if (checkedOutCandidate !== candidateSha) {
    throw new Error('The qualification checkout is not the exact reviewed RC candidate.');
  }
  if (checkedOutPublishSource !== publishSourceSha) {
    throw new Error('The publication checkout does not match PROMOTION_PUBLISH_SOURCE_SHA.');
  }
  if (checkedOutEvidenceCommit !== evidenceCommit || evidenceCommit === candidateSha) {
    throw new Error('The evidence checkout is not the exact later gate-record commit.');
  }
  if (remoteMain !== expectedMainSha) {
    throw new Error(
      'origin/main moved after the exact-main dispatch guard; publication is blocked.',
    );
  }
  await assertEvidenceSemanticEquality(candidateRoot, repositoryRoot, {
    allowWorkspaceReleaseVersionDrift: channel === 'stable',
  });
  assertAncestor(
    candidateSha,
    evidenceCommit,
    evidenceRoot,
    'gate record does not descend from candidate',
  );
  assertAncestor(
    evidenceCommit,
    expectedMainSha,
    publishRoot,
    'gate record is not on current main',
  );
  assertAncestor(
    candidateSha,
    publishSourceSha,
    publishRoot,
    'publication source does not descend from candidate',
  );
  assertEvidenceChangedPaths(
    git(evidenceRoot, ['diff', '--name-only', `${candidateSha}..${evidenceCommit}`])
      .split('\n')
      .filter(Boolean),
  );

  const candidateRegistryBytes = await readFile(
    resolve(candidateRoot, 'evidence/gate-criteria.json'),
  );
  const evidenceRegistryBytes = await readFile(
    resolve(evidenceRoot, 'evidence/gate-criteria.json'),
  );
  if (!candidateRegistryBytes.equals(evidenceRegistryBytes)) {
    throw new Error('The gate-record commit changed the candidate criterion registry.');
  }
  const registry = JSON.parse(candidateRegistryBytes.toString('utf8'));
  const schemas = new Map(
    await Promise.all(
      candidateEvidenceSchemaNames.map(async (name) => [
        name,
        JSON.parse(await readFile(resolve(candidateRoot, 'evidence', 'schema', name), 'utf8')),
      ]),
    ),
  );
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  for (const schema of schemas.values()) {
    if (!ajv.validateSchema(schema)) {
      throw new Error(`Candidate evidence schema ${schema.$id} is invalid.`);
    }
    ajv.addSchema(schema);
  }
  const validator = (name) => {
    const validate = ajv.getSchema(schemas.get(name).$id);
    if (validate === undefined) throw new Error(`Candidate validator ${name} is unavailable.`);
    return validate;
  };
  const validateGateCriteria = validator('gate-criteria.schema.json');
  if (!validateGateCriteria(registry)) {
    throw new Error('The candidate criterion registry violates its candidate schema.');
  }
  const criterionIndex = buildCriterionIndex(registry);
  if (criterionIndex.failures.length > 0) {
    throw new Error(
      `The candidate criterion registry is invalid:\n- ${criterionIndex.failures.join('\n- ')}`,
    );
  }
  const validateBundle = validator('evidence-bundle.schema.json');
  const validateEnvironmentAssertions = validator('environment-assertions.schema.json');
  const validateExternalAttestation = validator('external-attestation.schema.json');
  const validateExternalReport = validator('external-report.schema.json');
  const validateExternalSubjectAssertions = validator('external-subject-assertions.schema.json');
  const validateExternalSubject = validator('external-subject.schema.json');
  const validateGate = validator('gate-record.schema.json');
  const validateEnvironmentMatrix = validator('environment-matrix.schema.json');
  const validateManualProcedures = validator('manual-procedures.schema.json');
  const validateManualRecord = validator('manual-record.schema.json');
  const validateProofAssertions = validator('proof-assertions.schema.json');
  const validateReviewAttestation = validator('review-attestation.schema.json');
  const validateReviewerAuthorities = validator('reviewer-authorities.schema.json');
  const candidateReleaseRecord = JSON.parse(
    await readFile(resolve(candidateRoot, 'studio-release.json'), 'utf8'),
  );
  assertCoordinatedRelease(candidateReleaseRecord);
  const currentMainReleaseRecord = JSON.parse(
    git(publishRoot, ['show', `${expectedMainSha}:studio-release.json`]),
  );
  if (channel === 'rc' || phase === 'prepare') {
    assertCurrentCandidateCoordinate(currentMainReleaseRecord, candidateReleaseRecord);
  }
  const profileAssertionRegistry = JSON.parse(
    await readFile(resolve(candidateRoot, 'evidence/profile-assertions.json'), 'utf8'),
  );
  const profileAssertionIndex = buildProfileAssertionIndex(
    profileAssertionRegistry,
    criterionIndex.allowedProfiles,
  );
  if (profileAssertionIndex.failures.length > 0) {
    throw new Error(
      `The candidate profile assertion registry is invalid:\n- ${profileAssertionIndex.failures.join('\n- ')}`,
    );
  }
  const manualProcedureRegistry = await readJson(
    resolve(candidateRoot, 'evidence/manual-procedures.json'),
  );
  if (!validateManualProcedures(manualProcedureRegistry)) {
    throw new Error('The candidate manual procedure registry violates its candidate schema.');
  }
  const manualProcedureIndex = buildManualProcedureIndex(
    manualProcedureRegistry,
    criterionIndex.criteriaById,
  );
  if (manualProcedureIndex.failures.length > 0) {
    throw new Error(
      `The candidate manual procedure registry is invalid:\n- ${manualProcedureIndex.failures.join('\n- ')}`,
    );
  }
  const externalSubjectRegistry = await readJson(
    resolve(candidateRoot, 'evidence/external-subject-assertions.json'),
  );
  if (!validateExternalSubjectAssertions(externalSubjectRegistry)) {
    throw new Error('The candidate external subject registry violates its candidate schema.');
  }
  const externalSubjectIndex = buildExternalSubjectAssertionIndex(externalSubjectRegistry);
  if (externalSubjectIndex.failures.length > 0) {
    throw new Error(
      `The candidate external subject registry is invalid:\n- ${externalSubjectIndex.failures.join('\n- ')}`,
    );
  }
  const proofAssertionRegistry = await readJson(
    resolve(candidateRoot, 'evidence/proof-assertions.json'),
  );
  if (!validateProofAssertions(proofAssertionRegistry)) {
    throw new Error('The candidate proof assertion registry violates its candidate schema.');
  }
  const proofAssertionIndex = buildProofAssertionIndex(
    proofAssertionRegistry,
    criterionIndex.criteriaById,
    {
      externalSubjects: externalSubjectIndex.subjectsById,
      manualProcedures: manualProcedureIndex.proceduresById,
      profileAssertions: profileAssertionIndex.profilesById,
    },
  );
  if (proofAssertionIndex.failures.length > 0) {
    throw new Error(
      `The candidate proof assertion registry is invalid:\n- ${proofAssertionIndex.failures.join('\n- ')}`,
    );
  }
  const reviewerAuthorityRegistryBytes = await readFile(
    resolve(candidateRoot, 'evidence/reviewer-authorities.json'),
  );
  const reviewerAuthorityChecksumBytes = await readFile(
    resolve(candidateRoot, 'evidence/reviewer-authorities.sha256'),
  );
  const evidenceReviewerAuthorityBytes = await readFile(
    resolve(evidenceRoot, 'evidence/reviewer-authorities.json'),
  );
  const evidenceReviewerAuthorityChecksumBytes = await readFile(
    resolve(evidenceRoot, 'evidence/reviewer-authorities.sha256'),
  );
  if (
    !reviewerAuthorityRegistryBytes.equals(evidenceReviewerAuthorityBytes) ||
    !reviewerAuthorityChecksumBytes.equals(evidenceReviewerAuthorityChecksumBytes)
  ) {
    throw new Error(
      'The gate-record commit changed the candidate reviewer authority registry or checksum.',
    );
  }
  assertReviewerAuthorityReleaseTrust(
    reviewerAuthorityRegistryBytes,
    reviewerAuthorityChecksumBytes,
    reviewerAuthorityChecksum,
  );
  const reviewerAuthorityRegistry = JSON.parse(reviewerAuthorityRegistryBytes.toString('utf8'));
  if (!validateReviewerAuthorities(reviewerAuthorityRegistry)) {
    throw new Error('The candidate reviewer authority registry violates its candidate schema.');
  }
  const reviewerAuthorityIndex = buildReviewerAuthorityIndex(reviewerAuthorityRegistry);
  if (reviewerAuthorityIndex.failures.length > 0) {
    throw new Error(
      `The candidate reviewer authority registry is invalid:\n- ${reviewerAuthorityIndex.failures.join('\n- ')}`,
    );
  }

  const gates = channel === 'stable' ? ['A', 'B'] : [requiredGate];
  const acceptedBundles = new Map();
  const evidenceStatus = await readFile(resolve(evidenceRoot, 'docs/roadmap/STATUS.md'), 'utf8');
  const currentStatus = git(publishRoot, ['show', `${expectedMainSha}:docs/roadmap/STATUS.md`]);
  for (const gate of gates) {
    const { bundlesById, record, recordBytes } = await loadGateRecord({
      candidateRoot,
      candidateSha,
      criterionIndex,
      evidenceRoot,
      gate,
      packageVersions: candidateReleaseRecord.packages,
      profileAssertions: profileAssertionIndex.profilesById,
      externalSubjectAssertions: externalSubjectIndex.subjectsById,
      manualProcedures: manualProcedureIndex.proceduresById,
      proofAssertions: proofAssertionIndex.assertionsByKey,
      allowWorkspaceReleaseVersionDrift: channel === 'stable',
      reviewerAuthorityChecksum,
      registry,
      validateBundle,
      validateExternalAttestation,
      validateExternalReport,
      validateExternalSubject,
      validateGate,
      validateManualRecord,
      validateReviewAttestation,
      validateReviewerAuthorities,
    });
    assertStatusGatePass(evidenceStatus, gate);
    assertStatusGatePass(currentStatus, gate);
    const latestRecordBytes = gitBytes(publishRoot, [
      'show',
      `${expectedMainSha}:evidence/gates/gate-${gate.toLowerCase()}.json`,
    ]);
    assertLatestGateDecision(recordBytes, latestRecordBytes, gate);
    for (const [id, bundle] of bundlesById) {
      acceptedBundles.set(id, bundle);
    }
    if (gate === requiredGate) {
      assertPromotionEvidencePolicy({
        candidateSha,
        channel,
        gateRecord: record,
        releaseRecord: candidateReleaseRecord,
      });
    }
  }

  if (channel === 'stable') {
    const [candidateEnvironmentMatrix, environmentMatrix, environmentAssertions] =
      await Promise.all([
        readJson(resolve(candidateRoot, 'evidence/environment-matrix.json')),
        readJson(resolve(evidenceRoot, 'evidence/environment-matrix.json')),
        readJson(resolve(candidateRoot, 'evidence/environment-assertions.json')),
      ]);
    if (
      !validateEnvironmentMatrix(candidateEnvironmentMatrix) ||
      !validateEnvironmentMatrix(environmentMatrix) ||
      !validateEnvironmentAssertions(environmentAssertions)
    ) {
      throw new Error(
        'The stable environment qualification records violate the candidate schemas.',
      );
    }
    const environmentAssertionIndex = buildEnvironmentAssertionIndex(
      environmentAssertions,
      candidateEnvironmentMatrix,
    );
    if (environmentAssertionIndex.failures.length > 0) {
      throw new Error(
        `The stable environment assertion registry is invalid:\n- ${environmentAssertionIndex.failures.join('\n- ')}`,
      );
    }
    assertStableEnvironmentQualification(
      environmentMatrix,
      candidateEnvironmentMatrix,
      acceptedBundles,
      environmentAssertionIndex.assertionsById,
    );
    if (phase === 'publish') {
      const stableReleaseRecord = JSON.parse(
        await readFile(resolve(publishRoot, 'studio-release.json'), 'utf8'),
      );
      assertStablePromotion(candidateReleaseRecord, stableReleaseRecord);
      const paths = git(publishRoot, [
        'diff',
        '--name-only',
        `${evidenceCommit}..${publishSourceSha}`,
      ])
        .split('\n')
        .filter(Boolean);
      assertStableChangedPaths(paths);
      await assertStableGeneratedTree(evidenceRoot, publishRoot);
    }
  } else if (publishSourceSha !== candidateSha) {
    throw new Error('RC publication must use the exact qualified candidate commit as its source.');
  }

  console.log(
    `Gate ${requiredGate} at ${evidenceCommit} authorizes ${phase} for ${channel} from ` +
      `${candidateSha}; current main is ${expectedMainSha}.`,
  );
}

export async function assertStableGeneratedTree(evidenceRoot, publishRoot) {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'studio-stable-promotion-'));
  try {
    for (const path of stableGeneratorInputPaths) {
      try {
        await mkdir(dirname(join(temporaryRoot, path)), { recursive: true });
        await copyFile(resolve(evidenceRoot, path), join(temporaryRoot, path));
      } catch (error) {
        if (error?.code !== 'ENOENT' || path !== '.changeset/pre.json') {
          throw error;
        }
      }
    }
    const root = pathToFileURL(`${temporaryRoot}/`);
    const candidateRecord = await readJson(join(temporaryRoot, 'studio-release.json'));
    await preparePromotion(root, {
      candidateRecord,
      candidateSha: 'a'.repeat(40),
      channel: 'stable',
      evidenceSha: 'b'.repeat(40),
      profiles: [],
    });
    for (const path of stableGeneratedPaths) {
      const [expected, actual] = await Promise.all([
        readOptionalFile(join(temporaryRoot, path)),
        readOptionalFile(resolve(publishRoot, path)),
      ]);
      if (expected === undefined || actual === undefined) {
        if (expected !== actual) {
          throw new Error(`Stable promotion deletion drifted for ${path}.`);
        }
      } else if (!expected.equals(actual)) {
        throw new Error(
          `Stable promotion is not the deterministic generated transform at ${path}.`,
        );
      }
    }
    if ((await readOptionalPath(resolve(publishRoot, '.changeset/pre'))) !== undefined) {
      throw new Error('Stable promotion must remove consumed prerelease Changeset history.');
    }
  } finally {
    await rm(temporaryRoot, { force: true, recursive: true });
  }
}

async function readOptionalPath(path) {
  try {
    return await readFile(path);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return undefined;
    }
    if (error?.code === 'EISDIR') {
      return 'directory-present';
    }
    throw error;
  }
}

async function readOptionalFile(path) {
  try {
    return await readFile(path);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
}

async function loadCandidateEvidenceSemantics(candidateRoot) {
  const schemas = new Map(
    await Promise.all(
      candidateEvidenceSchemaNames.map(async (name) => [
        name,
        JSON.parse(await readFile(resolve(candidateRoot, 'evidence', 'schema', name), 'utf8')),
      ]),
    ),
  );
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  for (const schema of schemas.values()) {
    if (!ajv.validateSchema(schema)) {
      throw new Error(`Candidate evidence schema ${String(schema.$id)} is invalid.`);
    }
    ajv.addSchema(schema);
  }
  const validator = (name) => {
    const validate = ajv.getSchema(schemas.get(name).$id);
    if (validate === undefined) {
      throw new Error(`Candidate validator ${name} is unavailable.`);
    }
    return validate;
  };
  const validateGateCriteria = validator('gate-criteria.schema.json');
  const validateManualProcedures = validator('manual-procedures.schema.json');
  const validateExternalSubjectAssertions = validator('external-subject-assertions.schema.json');
  const validateProofAssertions = validator('proof-assertions.schema.json');
  const validateReviewerAuthorities = validator('reviewer-authorities.schema.json');
  const [registry, profileAssertionRegistry, manualProcedureRegistry, externalSubjectRegistry] =
    await Promise.all(
      [
        'gate-criteria.json',
        'profile-assertions.json',
        'manual-procedures.json',
        'external-subject-assertions.json',
      ].map((name) => readJson(resolve(candidateRoot, 'evidence', name))),
    );
  const proofAssertionRegistry = await readJson(
    resolve(candidateRoot, 'evidence/proof-assertions.json'),
  );
  const reviewerAuthorityRegistryBytes = await readFile(
    resolve(candidateRoot, 'evidence/reviewer-authorities.json'),
  );
  const reviewerAuthorityChecksumBytes = await readFile(
    resolve(candidateRoot, 'evidence/reviewer-authorities.sha256'),
  );
  assertReviewerAuthorityStructuralPin(
    reviewerAuthorityRegistryBytes,
    reviewerAuthorityChecksumBytes,
  );
  const reviewerAuthorityRegistry = JSON.parse(reviewerAuthorityRegistryBytes.toString('utf8'));
  for (const [valid, message] of [
    [validateGateCriteria(registry), 'criterion registry'],
    [validateManualProcedures(manualProcedureRegistry), 'manual procedure registry'],
    [validateExternalSubjectAssertions(externalSubjectRegistry), 'external subject registry'],
    [validateProofAssertions(proofAssertionRegistry), 'proof assertion registry'],
    [validateReviewerAuthorities(reviewerAuthorityRegistry), 'reviewer authority registry'],
  ]) {
    if (!valid) {
      throw new Error(`Candidate ${message} violates its candidate schema.`);
    }
  }
  const criterionIndex = buildCriterionIndex(registry);
  const profileAssertionIndex = buildProfileAssertionIndex(
    profileAssertionRegistry,
    criterionIndex.allowedProfiles,
  );
  const manualProcedureIndex = buildManualProcedureIndex(
    manualProcedureRegistry,
    criterionIndex.criteriaById,
  );
  const externalSubjectIndex = buildExternalSubjectAssertionIndex(externalSubjectRegistry);
  const proofAssertionIndex = buildProofAssertionIndex(
    proofAssertionRegistry,
    criterionIndex.criteriaById,
    {
      externalSubjects: externalSubjectIndex.subjectsById,
      manualProcedures: manualProcedureIndex.proceduresById,
      profileAssertions: profileAssertionIndex.profilesById,
    },
  );
  const reviewerAuthorityIndex = buildReviewerAuthorityIndex(reviewerAuthorityRegistry);
  const registryFailures = [
    ...criterionIndex.failures,
    ...profileAssertionIndex.failures,
    ...manualProcedureIndex.failures,
    ...externalSubjectIndex.failures,
    ...proofAssertionIndex.failures,
    ...reviewerAuthorityIndex.failures,
  ];
  if (registryFailures.length > 0) {
    throw new Error(
      `Candidate evidence registries are invalid:\n- ${registryFailures.join('\n- ')}`,
    );
  }
  return {
    criterionIndex,
    externalSubjectAssertions: externalSubjectIndex.subjectsById,
    manualProcedures: manualProcedureIndex.proceduresById,
    profileAssertions: profileAssertionIndex.profilesById,
    proofAssertions: proofAssertionIndex.assertionsByKey,
    registry,
    reviewerAuthorities: reviewerAuthorityIndex.authoritiesByIdentity,
    reviewerAuthorityChecksumBytes,
    reviewerAuthorityRegistryBytes,
    validateBundle: validator('evidence-bundle.schema.json'),
    validateExternalAttestation: validator('external-attestation.schema.json'),
    validateExternalReport: validator('external-report.schema.json'),
    validateExternalSubject: validator('external-subject.schema.json'),
    validateGate: validator('gate-record.schema.json'),
    validateManualRecord: validator('manual-record.schema.json'),
    validateReviewAttestation: validator('review-attestation.schema.json'),
  };
}

export async function loadGateRecord({
  allowWorkspaceReleaseVersionDrift = false,
  candidateRoot,
  candidateSha,
  evidenceRoot,
  executionRoot = repositoryRoot,
  gate,
  packageVersions,
  reviewerAuthorityChecksum,
}) {
  await assertEvidenceSemanticEquality(candidateRoot, executionRoot, {
    allowWorkspaceReleaseVersionDrift,
  });
  const semantics = await loadCandidateEvidenceSemantics(candidateRoot);
  const {
    criterionIndex,
    externalSubjectAssertions,
    manualProcedures,
    profileAssertions,
    proofAssertions,
    registry,
    reviewerAuthorities,
    reviewerAuthorityChecksumBytes,
    reviewerAuthorityRegistryBytes,
    validateBundle,
    validateExternalAttestation,
    validateExternalReport,
    validateExternalSubject,
    validateGate,
    validateManualRecord,
    validateReviewAttestation,
  } = semantics;
  assertReviewerAuthorityReleaseTrust(
    reviewerAuthorityRegistryBytes,
    reviewerAuthorityChecksumBytes,
    reviewerAuthorityChecksum,
  );
  const candidateReleaseRecord = JSON.parse(
    await readFile(resolve(candidateRoot, 'studio-release.json'), 'utf8'),
  );
  assertCoordinatedRelease(candidateReleaseRecord);
  if (!isDeepStrictEqual(candidateReleaseRecord.packages, packageVersions)) {
    throw new Error('Gate package versions do not equal the exact candidate release record.');
  }
  const fileName = `gate-${gate.toLowerCase()}.json`;
  let record;
  let recordBytes;
  try {
    recordBytes = await readFile(resolve(evidenceRoot, 'evidence', 'gates', fileName));
    record = JSON.parse(recordBytes.toString('utf8'));
  } catch (error) {
    throw new Error(`The separate passing Gate ${gate} record is absent; publication is blocked.`, {
      cause: error,
    });
  }
  if (!validateGate(record)) {
    throw new Error(`Gate ${gate} record violates its schema.`);
  }
  if (record.gate !== gate || record.decision !== 'pass' || record.sourceCommit !== candidateSha) {
    throw new Error(`Gate ${gate} does not approve the exact qualified candidate.`);
  }
  const context = {
    ...criterionIndex,
    evidenceRoot,
    externalSubjectAssertions,
    getCommitTime(commit) {
      if (commit !== candidateSha) {
        return Number.NaN;
      }
      return Date.parse(git(candidateRoot, ['show', '--no-patch', '--format=%cI', commit]));
    },
    isCommitReachable(commit) {
      return commit === candidateSha;
    },
    async getSourceFileChecksum(commit, path) {
      if (commit !== candidateSha) {
        throw new Error('source commit differs from the qualified candidate');
      }
      const entry = git(candidateRoot, ['ls-tree', commit, '--', path]);
      const match = /^(100(?:644|755)) blob [a-f0-9]{40}\t/u.exec(entry);
      if (match === null) {
        throw new Error('source path is absent or is not a regular tracked file');
      }
      return {
        checksum: checksumIntegrity(gitBytes(candidateRoot, ['show', `${commit}:${path}`])),
        mode: match[1],
      };
    },
    async getProfileAssertionsForCommit(commit) {
      if (commit !== candidateSha) {
        throw new Error('source commit differs from the qualified candidate');
      }
      return profileAssertions;
    },
    async getProofContextForCommit(commit) {
      if (commit !== candidateSha) {
        throw new Error('source commit differs from the qualified candidate');
      }
      return { externalSubjectAssertions, manualProcedures, proofAssertions };
    },
    manualProcedures,
    now: Date.now(),
    packageVersions,
    profileAssertions,
    proofAssertions,
    reviewerAuthorities,
    reviewerAuthorityReleaseTrustVerified: true,
    reviewerAuthorityStructuralPinVerified: true,
    repositoryRoot: candidateRoot,
    validateExternalAttestationSchema: validateExternalAttestation,
    validateExternalReportSchema: validateExternalReport,
    validateExternalSubjectSchema: validateExternalSubject,
    validateManualRecordSchema: validateManualRecord,
    validateReviewAttestationSchema: validateReviewAttestation,
  };
  const bundlesById = new Map();
  const authenticatedProofsByBundleId = new Map();
  for (const bundleId of record.evidenceBundleIds) {
    if (bundleId.startsWith('SAMPLE-')) {
      throw new Error(`Gate ${gate} links forbidden sample bundle ${bundleId}.`);
    }
    const manifestPath = resolve(evidenceRoot, 'evidence', 'bundles', bundleId, 'manifest.json');
    let manifest;
    let manifestBytes;
    try {
      manifestBytes = await readFile(manifestPath);
      manifest = JSON.parse(manifestBytes.toString('utf8'));
    } catch (error) {
      throw new Error(`Gate ${gate} links missing bundle ${bundleId}.`, { cause: error });
    }
    if (!validateBundle(manifest) || manifest.bundleId !== bundleId) {
      throw new Error(`Bundle ${bundleId} violates its schema or directory identity.`);
    }
    const inspection = await inspectBundleEvidence(manifest, { ...context, manifestBytes });
    if (inspection.failures.length > 0) {
      throw new Error(
        `Bundle ${bundleId} failed authenticity checks:\n- ${inspection.failures.join('\n- ')}`,
      );
    }
    bundlesById.set(bundleId, manifest);
    authenticatedProofsByBundleId.set(bundleId, inspection.authenticatedProofKeys);
  }
  const failures = await collectGateRecordFailures(record, fileName, {
    ...context,
    authenticatedProofsByBundleId,
    bundlesById,
    recordBytes,
    registry,
  });
  if (failures.length > 0) {
    throw new Error(`Gate ${gate} failed authenticity checks:\n- ${failures.join('\n- ')}`);
  }
  return { bundlesById, record, recordBytes };
}

function assertAncestor(ancestor, descendant, cwd, message) {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', ancestor, descendant], {
      cwd,
      stdio: 'ignore',
    });
  } catch {
    throw new Error(message);
  }
}

function git(cwd, arguments_) {
  return execFileSync('git', arguments_, { cwd, encoding: 'utf8' }).trim();
}

function liveRemoteMain(cwd) {
  const output = git(cwd, ['ls-remote', '--exit-code', 'origin', 'refs/heads/main']);
  const match = /^([a-f0-9]{40})\trefs\/heads\/main$/u.exec(output);
  if (match === null) {
    throw new Error('The live origin main ref could not be resolved exactly.');
  }
  return match[1];
}

function gitBytes(cwd, arguments_) {
  return execFileSync('git', arguments_, { cwd });
}

function statusRowGate(cell) {
  const match = /^(?:Gate\s+([AB])|([AB])\s+[—-])/iu.exec(cell);
  return match?.[1]?.toUpperCase() ?? match?.[2]?.toUpperCase();
}

function classifyGateStates(cell) {
  const states = [];
  for (const [state, pattern] of [
    ['not-assessed', /\bNot assessed\b/iu],
    ['blocked', /\bBlocked\b/iu],
    ['failed', /\bFail(?:ed)?\b/iu],
    ['revoked', /\bRevoked\b/iu],
    ['pass', /\bPass(?:ed)?\b/iu],
  ]) {
    if (pattern.test(cell)) {
      states.push(state);
    }
  }
  return states;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

export async function verifyReleaseGateFromEnvironment() {
  if (
    process.env.STUDIO_GATE_EVIDENCE_ROOT === undefined ||
    process.env.STUDIO_GATE_EVIDENCE_ROOT.length === 0
  ) {
    throw new Error('STUDIO_GATE_EVIDENCE_ROOT is required.');
  }
  const candidateRoot = resolve(repositoryRoot, process.env.STUDIO_QUALIFIED_CANDIDATE_ROOT ?? '.');
  const evidenceRoot = resolve(repositoryRoot, process.env.STUDIO_GATE_EVIDENCE_ROOT);
  const publishRoot = resolve(repositoryRoot, process.env.STUDIO_PUBLISH_ROOT ?? '.');
  await verifyReleaseGate({
    candidateRoot,
    candidateSha: process.env.STUDIO_RELEASE_CANDIDATE_SHA,
    channel: process.env.STUDIO_RELEASE_CHANNEL,
    evidenceCommit: process.env.STUDIO_GATE_RECORD_COMMIT,
    evidenceRoot,
    expectedMainSha: process.env.STUDIO_EXPECTED_MAIN_SHA,
    phase: process.env.STUDIO_PROMOTION_PHASE,
    publishRoot,
    publishSourceSha: process.env.STUDIO_PUBLISH_SOURCE_SHA,
    reviewerAuthorityChecksum: process.env.STUDIO_REVIEWER_AUTHORITY_SHA256,
  });
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await verifyReleaseGateFromEnvironment();
}
