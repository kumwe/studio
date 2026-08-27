import { createHash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

import {
  commandForEvidenceLane,
  EVIDENCE_ARTIFACT_ROLES,
  evidenceLane,
  REQUIRED_EVIDENCE_LANES,
} from './evidence-lanes.mjs';
import { collectExternalSubjectFailures } from './external-evidence.mjs';
import { collectManualRecordFailures } from './manual-evidence.mjs';
import { collectSignedReviewFailures } from './review-authentication.mjs';
import {
  collectProducerArtifactFailures,
  collectProducerClosureFailures,
  structuredArtifactName,
} from './producer-evidence.mjs';

export {
  commandForEvidenceLane,
  EVIDENCE_ARTIFACT_ROLES,
  EVIDENCE_LANES,
  GENERIC_EVIDENCE_LANES,
  PROFILE_EVIDENCE_LANES,
  REQUIRED_EVIDENCE_LANES,
  SPECIALIZED_EVIDENCE_LANES,
} from './evidence-lanes.mjs';

export const CANONICAL_REPOSITORY = 'https://github.com/kumwe/studio';

export const REQUIRED_EVIDENCE_INPUTS = Object.freeze([
  '.github/actions/setup-studio/action.yml',
  '.github/workflows/evidence-bundle.yml',
  'evidence/environment-assertions.json',
  'evidence/environment-matrix.json',
  'evidence/external-subject-assertions.json',
  'evidence/gate-criteria.json',
  'evidence/manual-procedures.json',
  'evidence/profile-assertions.json',
  'evidence/producer-contracts.json',
  'evidence/proof-assertions.json',
  'evidence/reviewer-authorities.json',
  'evidence/reviewer-authorities.sha256',
  'evidence/schema/environment-assertions.schema.json',
  'evidence/schema/environment-matrix.schema.json',
  'evidence/schema/evidence-bundle.schema.json',
  'evidence/schema/evidence-intake-v1.schema.json',
  'evidence/schema/external-attestation.schema.json',
  'evidence/schema/external-report.schema.json',
  'evidence/schema/external-subject-assertions.schema.json',
  'evidence/schema/external-subject.schema.json',
  'evidence/schema/gate-criteria.schema.json',
  'evidence/schema/gate-record.schema.json',
  'evidence/schema/manual-procedures.schema.json',
  'evidence/schema/manual-record.schema.json',
  'evidence/schema/proof-assertions.schema.json',
  'evidence/schema/producer-contracts.schema.json',
  'evidence/schema/producer-output-v1.schema.json',
  'evidence/schema/cyclonedx-sbom-v1.schema.json',
  'evidence/schema/review-attestation.schema.json',
  'evidence/schema/reviewer-authorities.schema.json',
  'package.json',
  'package-lock.json',
  'packages/protocol/schemas/manifest.json',
  'packages/protocol/test/generated-models.test.ts',
  'packages/testkit/corpus-manifest.json',
  'release-profile-claims.json',
  'scripts/check-evidence.mjs',
  'scripts/check-secrets.mjs',
  'scripts/assemble-evidence-bundle.mjs',
  'scripts/create-evidence-bundle.mjs',
  'scripts/evidence-lanes.mjs',
  'scripts/evidence-plan.mjs',
  'scripts/evidence-generator-input.mjs',
  'scripts/evidence-validation.mjs',
  'scripts/external-evidence.mjs',
  'scripts/manual-evidence.mjs',
  'scripts/producer-evidence.mjs',
  'scripts/lib/cyclonedx-validation.mjs',
  'scripts/lib/evidence-filesystem.mjs',
  'scripts/lib/reproducible-environment.mjs',
  'scripts/lib/secret-detector.mjs',
  'scripts/lib/typescript-evidence.mjs',
  'scripts/review-authentication.mjs',
  'scripts/prepare-promotion.mjs',
  'scripts/promotion-plan.mjs',
  'scripts/publish-beta.mjs',
  'scripts/publish-promotion.mjs',
  'scripts/publish-staged-candidate.mjs',
  'scripts/reconcile-release-tag.mjs',
  'scripts/release-policy.mjs',
  'scripts/release-record.mjs',
  'scripts/release-artifacts.mjs',
  'scripts/release-family.mjs',
  'scripts/staged-publish.mjs',
  'scripts/cleanup-staging-tags.mjs',
  'scripts/generate-release-notes.mjs',
  'scripts/verify-github-release.mjs',
  'scripts/verify-kumwe-app-proof.mjs',
  'scripts/verify-manual-evidence.mjs',
  'scripts/verify-published-release.mjs',
  'scripts/verify-release-gate.mjs',
  'scripts/verify-staged-release.mjs',
  'scripts/evidence/create-release-sbom.mjs',
  'scripts/evidence/run-contribution-lifecycle.mjs',
  'scripts/evidence/run-media-rich-text.mjs',
  'scripts/evidence/run-reference-host-http.mjs',
  'scripts/evidence/run-typescript-portability.mjs',
  'scripts/evidence/verify-reproducible-family.mjs',
  'scripts/evidence/verify-staged-registry.mjs',
  'studio-release.json',
]);

export const EVIDENCE_SEMANTIC_INPUTS = Object.freeze([
  '.github/actions/setup-studio/action.yml',
  '.github/workflows/evidence-bundle.yml',
  'package.json',
  'package-lock.json',
  'evidence/environment-assertions.json',
  'evidence/environment-matrix.json',
  'evidence/external-subject-assertions.json',
  'evidence/gate-criteria.json',
  'evidence/manual-procedures.json',
  'evidence/profile-assertions.json',
  'evidence/producer-contracts.json',
  'evidence/proof-assertions.json',
  'evidence/reviewer-authorities.json',
  'evidence/reviewer-authorities.sha256',
  'evidence/schema/environment-assertions.schema.json',
  'evidence/schema/environment-matrix.schema.json',
  'evidence/schema/evidence-bundle.schema.json',
  'evidence/schema/evidence-intake-v1.schema.json',
  'evidence/schema/external-attestation.schema.json',
  'evidence/schema/external-report.schema.json',
  'evidence/schema/external-subject-assertions.schema.json',
  'evidence/schema/external-subject.schema.json',
  'evidence/schema/gate-criteria.schema.json',
  'evidence/schema/gate-record.schema.json',
  'evidence/schema/manual-procedures.schema.json',
  'evidence/schema/manual-record.schema.json',
  'evidence/schema/proof-assertions.schema.json',
  'evidence/schema/producer-contracts.schema.json',
  'evidence/schema/producer-output-v1.schema.json',
  'evidence/schema/cyclonedx-sbom-v1.schema.json',
  'evidence/schema/review-attestation.schema.json',
  'evidence/schema/reviewer-authorities.schema.json',
  'scripts/evidence-lanes.mjs',
  'scripts/evidence-plan.mjs',
  'scripts/evidence-generator-input.mjs',
  'scripts/evidence-validation.mjs',
  'scripts/external-evidence.mjs',
  'scripts/manual-evidence.mjs',
  'scripts/producer-evidence.mjs',
  'scripts/lib/cyclonedx-validation.mjs',
  'scripts/lib/evidence-filesystem.mjs',
  'scripts/lib/reproducible-environment.mjs',
  'scripts/lib/secret-detector.mjs',
  'scripts/lib/typescript-evidence.mjs',
  'scripts/review-authentication.mjs',
  'scripts/check-evidence.mjs',
  'scripts/check-secrets.mjs',
  'scripts/assemble-evidence-bundle.mjs',
  'scripts/create-evidence-bundle.mjs',
  'scripts/verify-kumwe-app-proof.mjs',
  'scripts/verify-manual-evidence.mjs',
  'scripts/verify-release-gate.mjs',
  'scripts/prepare-promotion.mjs',
  'scripts/promotion-plan.mjs',
  'scripts/publish-beta.mjs',
  'scripts/publish-promotion.mjs',
  'scripts/publish-staged-candidate.mjs',
  'scripts/reconcile-release-tag.mjs',
  'scripts/release-artifacts.mjs',
  'scripts/release-family.mjs',
  'scripts/release-policy.mjs',
  'scripts/release-record.mjs',
  'scripts/staged-publish.mjs',
  'scripts/cleanup-staging-tags.mjs',
  'scripts/generate-release-notes.mjs',
  'scripts/verify-github-release.mjs',
  'scripts/verify-published-release.mjs',
  'scripts/verify-staged-release.mjs',
  'scripts/evidence/create-release-sbom.mjs',
  'scripts/evidence/run-contribution-lifecycle.mjs',
  'scripts/evidence/run-media-rich-text.mjs',
  'scripts/evidence/run-reference-host-http.mjs',
  'scripts/evidence/run-typescript-portability.mjs',
  'scripts/evidence/verify-reproducible-family.mjs',
  'scripts/evidence/verify-staged-registry.mjs',
  'packages/protocol/test/generated-models.test.ts',
]);

const REVIEWER_ROLES = Object.freeze([
  'general',
  'accessibility',
  'compatibility',
  'data-integrity',
  'security',
]);

const SIGN_OFF_ROLES = Object.freeze({
  accessibility: 'accessibility',
  compatibility: 'compatibility',
  dataIntegrity: 'data-integrity',
  security: 'security',
});

export function checksumIntegrity(bytes) {
  return `sha256-${createHash('sha256').update(bytes).digest('base64')}`;
}

export async function checksumFile(path) {
  return checksumIntegrity(await readFile(path));
}

export function buildCriterionIndex(registry) {
  const failures = [];
  const criteriaById = new Map();
  for (const gate of ['A', 'B']) {
    const criteria = registry?.gates?.[gate];
    if (!Array.isArray(criteria)) {
      failures.push(`gate ${gate} criteria are unavailable`);
      continue;
    }
    for (const [index, criterion] of criteria.entries()) {
      const expectedPrefix = `gate-${gate.toLowerCase()}/${String(index + 1).padStart(2, '0')}-`;
      if (typeof criterion?.id !== 'string' || !criterion.id.startsWith(expectedPrefix)) {
        failures.push(
          `gate ${gate} criterion ${index + 1} must use the stable prefix ${expectedPrefix}`,
        );
      }
      if (criteriaById.has(criterion?.id)) {
        failures.push(`criterion ${String(criterion?.id)} is duplicated`);
      } else {
        criteriaById.set(criterion?.id, { ...criterion, gate });
      }
    }
  }
  return {
    allowedProfiles: new Set(
      Array.isArray(registry?.profileVocabulary) ? registry.profileVocabulary : [],
    ),
    criteriaById,
    failures,
  };
}

export function criterionProofKey(criterionId, evidenceClass) {
  return `${criterionId}\u0000${evidenceClass}`;
}

export function buildProofAssertionIndex(
  registry,
  criteriaById,
  {
    externalSubjects = new Map(),
    manualProcedures = new Map(),
    profileAssertions = new Map(),
  } = {},
) {
  const assertionsByKey = new Map();
  const failures = [];
  const profileTargetsById = new Map();
  if (
    registry?.contractVersion !== '0.1-draft' ||
    registry?.kind !== 'criterion-proof-assertion-registry' ||
    !Array.isArray(registry?.assertions) ||
    !Array.isArray(registry?.profileTargets) ||
    Object.keys(registry ?? {})
      .sort()
      .join('\n') !== 'assertions\ncontractVersion\nkind\nprofileTargets'
  ) {
    return {
      assertionsByKey,
      failures: ['criterion proof assertion registry has an invalid closed shape'],
      profileTargetsById,
    };
  }
  for (const assertion of registry.assertions) {
    if (
      assertion === null ||
      typeof assertion !== 'object' ||
      Array.isArray(assertion) ||
      Object.keys(assertion).sort().join('\n') !==
        'artifactRoles\navailability\nclass\ncriterionId\nmanualProcedureId\nrequiredRuns\nrequiredSubjectIds'
    ) {
      failures.push('criterion proof assertion entry has an invalid closed shape');
      continue;
    }
    const key = criterionProofKey(assertion.criterionId, assertion.class);
    if (assertionsByKey.has(key)) {
      failures.push(
        `criterion proof assertion ${assertion.criterionId}/${assertion.class} is duplicated`,
      );
      continue;
    }
    const criterion = criteriaById.get(assertion.criterionId);
    if (criterion === undefined || !criterion.evidenceClasses.includes(assertion.class)) {
      failures.push(
        `criterion proof assertion ${assertion.criterionId}/${assertion.class} is outside the stable gate registry`,
      );
    }
    if (
      !Array.isArray(assertion.requiredRuns) ||
      assertion.requiredRuns.length === 0 ||
      new Set(assertion.requiredRuns).size !== assertion.requiredRuns.length
    ) {
      failures.push(
        `criterion proof assertion ${assertion.criterionId}/${assertion.class} has invalid runs`,
      );
    }
    const laneDefinitions = (assertion.requiredRuns ?? []).map((testId) => evidenceLane(testId));
    if (laneDefinitions.some((definition) => definition === undefined)) {
      failures.push(
        `criterion proof assertion ${assertion.criterionId}/${assertion.class} references an unregistered lane`,
      );
    }
    if (
      !Array.isArray(assertion.artifactRoles) ||
      assertion.artifactRoles.length === 0 ||
      new Set(assertion.artifactRoles).size !== assertion.artifactRoles.length ||
      assertion.artifactRoles.some((role) => !EVIDENCE_ARTIFACT_ROLES.includes(role))
    ) {
      failures.push(
        `criterion proof assertion ${assertion.criterionId}/${assertion.class} has invalid artifact roles`,
      );
    }
    const producedRoles = new Set(
      laneDefinitions.flatMap((definition) => definition?.artifactRoles ?? []),
    );
    for (const role of assertion.artifactRoles ?? []) {
      if (!producedRoles.has(role)) {
        failures.push(
          `criterion proof assertion ${assertion.criterionId}/${assertion.class} requires role ${role} from no registered lane`,
        );
      }
    }
    const laneAvailabilities = new Set(
      laneDefinitions.map((definition) => definition?.availability).filter(Boolean),
    );
    if (
      assertion.availability === 'executable' &&
      !sameMembers([...laneAvailabilities], ['executable'])
    ) {
      failures.push(
        `executable proof assertion ${assertion.criterionId}/${assertion.class} contains a non-executable lane`,
      );
    }
    if (assertion.availability === 'manual-input' && !laneAvailabilities.has('manual-input')) {
      failures.push(
        `manual proof assertion ${assertion.criterionId}/${assertion.class} lacks a manual-input lane`,
      );
    }
    if (assertion.availability === 'external-input' && !laneAvailabilities.has('external-input')) {
      failures.push(
        `external proof assertion ${assertion.criterionId}/${assertion.class} lacks an external-input lane`,
      );
    }
    if (assertion.availability === 'target' && !laneAvailabilities.has('target')) {
      failures.push(
        `target proof assertion ${assertion.criterionId}/${assertion.class} lacks a target lane`,
      );
    }
    const procedure =
      assertion.manualProcedureId === null
        ? undefined
        : manualProcedures.get(assertion.manualProcedureId);
    if (assertion.availability === 'manual-input') {
      if (
        procedure === undefined ||
        procedure.criterionId !== assertion.criterionId ||
        procedure.evidenceClass !== assertion.class ||
        !assertion.requiredRuns.includes(procedure.laneId) ||
        !assertion.artifactRoles.includes(procedure.artifactRole)
      ) {
        failures.push(
          `manual proof assertion ${assertion.criterionId}/${assertion.class} is not bound to its exact procedure`,
        );
      }
    } else if (assertion.manualProcedureId !== null) {
      failures.push(
        `non-manual proof assertion ${assertion.criterionId}/${assertion.class} names a procedure`,
      );
    }
    if (
      !Array.isArray(assertion.requiredSubjectIds) ||
      new Set(assertion.requiredSubjectIds).size !== assertion.requiredSubjectIds.length
    ) {
      failures.push(
        `criterion proof assertion ${assertion.criterionId}/${assertion.class} has invalid subjects`,
      );
    }
    for (const subjectId of assertion.requiredSubjectIds ?? []) {
      const subject = externalSubjects.get(subjectId);
      if (subject === undefined || !assertion.requiredRuns.includes(subject.laneId)) {
        failures.push(
          `criterion proof assertion ${assertion.criterionId}/${assertion.class} is not bound to external subject ${subjectId}`,
        );
      }
    }
    assertionsByKey.set(key, assertion);
  }
  const expectedKeys = [...criteriaById.values()].flatMap((criterion) =>
    criterion.evidenceClasses.map((evidenceClass) =>
      criterionProofKey(criterion.id, evidenceClass),
    ),
  );
  if (!sameMembers([...assertionsByKey.keys()], expectedKeys)) {
    failures.push(
      'criterion proof assertions must cover every Gate A and Gate B criterion/class exactly once',
    );
  }

  for (const target of registry.profileTargets) {
    if (
      target === null ||
      typeof target !== 'object' ||
      Array.isArray(target) ||
      Object.keys(target).sort().join('\n') !==
        'artifactRoles\nid\nmanualProcedureId\nrequiredRuns\nrequiredSubjectIds\nstatus'
    ) {
      failures.push('profile proof target has an invalid closed shape');
      continue;
    }
    if (profileTargetsById.has(target.id)) {
      failures.push(`profile proof target ${String(target.id)} is duplicated`);
      continue;
    }
    const profile = profileAssertions.get(target.id);
    const procedure = manualProcedures.get(target.manualProcedureId);
    if (target.id !== 'studio.profile/authoring-web' || profile === undefined) {
      failures.push('the authoring-web qualification target must name a declared profile');
    }
    if (
      target.status !== 'target' ||
      procedure?.id !== 'accessibility/gate-a-interactions-v1' ||
      !sameMembers(target.requiredRuns, [
        'accessibility/manual-interactions-v1',
        'accessibility/web',
        'integration/kumwe-app-v1',
      ]) ||
      !sameMembers(target.requiredSubjectIds, ['kumwe/app']) ||
      !sameMembers(target.artifactRoles, [
        'accessibility/manual-interaction-report-v1',
        'integration/external-attestation-v1',
        'integration/external-subject-v1',
        'integration/kumwe-app-report-v1',
        'review/attestation-v1',
        'review/signature-v1',
        'run/log',
      ]) ||
      externalSubjects.get('kumwe/app')?.status !== 'target'
    ) {
      failures.push(
        'authoring-web qualification must remain bound to exact Kumwe App real-shell and manual accessibility proof',
      );
    }
    profileTargetsById.set(target.id, target);
  }
  if (!sameMembers([...profileTargetsById.keys()], ['studio.profile/authoring-web'])) {
    failures.push('profile proof targets must contain exactly studio.profile/authoring-web');
  }
  return { assertionsByKey, failures, profileTargetsById };
}

export function buildProfileAssertionIndex(registry, allowedProfiles) {
  const failures = [];
  const profilesById = new Map();
  if (
    registry?.contractVersion !== '0.1-draft' ||
    registry?.kind !== 'profile-assertion-registry' ||
    !Array.isArray(registry?.profiles) ||
    Object.keys(registry ?? {})
      .sort()
      .join('\n') !== 'contractVersion\nkind\nprofiles'
  ) {
    return { failures: ['profile assertion registry has an invalid closed shape'], profilesById };
  }
  for (const profile of registry.profiles) {
    if (
      profile === null ||
      typeof profile !== 'object' ||
      Array.isArray(profile) ||
      Object.keys(profile).sort().join('\n') !== 'id\nrequiredInputs\nrequiredRuns\nstatus'
    ) {
      failures.push('profile assertion entry has an invalid closed shape');
      continue;
    }
    if (profilesById.has(profile.id)) {
      failures.push(`profile assertion ${String(profile.id)} is duplicated`);
      continue;
    }
    if (!allowedProfiles.has(profile.id)) {
      failures.push(`profile assertion ${String(profile.id)} is outside the profile vocabulary`);
    }
    if (!['executable', 'target'].includes(profile.status)) {
      failures.push(
        `profile assertion ${String(profile.id)} has invalid status ${String(profile.status)}`,
      );
    }
    const requiredInputs = Array.isArray(profile.requiredInputs) ? profile.requiredInputs : [];
    const requiredRuns = Array.isArray(profile.requiredRuns) ? profile.requiredRuns : [];
    const hasValidInputs =
      Array.isArray(profile.requiredInputs) &&
      new Set(requiredInputs).size === requiredInputs.length &&
      requiredInputs.every((path) => isRepositoryRelativePath(path));
    const hasValidRuns =
      Array.isArray(profile.requiredRuns) &&
      new Set(requiredRuns).size === requiredRuns.length &&
      requiredRuns.every((testId) => commandForEvidenceLane(testId) !== undefined);
    if (!hasValidInputs) {
      failures.push(`profile assertion ${String(profile.id)} has invalid requiredInputs`);
    }
    if (!hasValidRuns) {
      failures.push(`profile assertion ${String(profile.id)} has invalid requiredRuns`);
    }
    if (profile.status === 'target' && (requiredInputs.length > 0 || requiredRuns.length > 0)) {
      failures.push(
        `target profile ${String(profile.id)} must not advertise executable assertions`,
      );
    }
    if (
      profile.status === 'executable' &&
      (requiredInputs.length === 0 || requiredRuns.length === 0)
    ) {
      failures.push(`executable profile ${String(profile.id)} requires inputs and runs`);
    }
    if (typeof profile.id === 'string') {
      profilesById.set(profile.id, profile);
    }
  }
  if ([...allowedProfiles].sort().join('\n') !== [...profilesById.keys()].sort().join('\n')) {
    failures.push('profile assertion registry must cover the complete profile vocabulary');
  }
  return { failures, profilesById };
}

export function buildEnvironmentAssertionIndex(registry, environmentMatrix) {
  const failures = [];
  const assertionsById = new Map();
  if (
    registry?.contractVersion !== '0.1-draft' ||
    registry?.kind !== 'environment-assertion-registry' ||
    !Array.isArray(registry?.environments) ||
    Object.keys(registry ?? {})
      .sort()
      .join('\n') !== 'contractVersion\nenvironments\nkind'
  ) {
    return {
      assertionsById,
      failures: ['environment assertion registry has an invalid closed shape'],
    };
  }
  for (const assertion of registry.environments) {
    if (
      assertion === null ||
      typeof assertion !== 'object' ||
      Array.isArray(assertion) ||
      Object.keys(assertion).sort().join('\n') !== 'id\nstatus\nvariants' ||
      !Array.isArray(assertion.variants)
    ) {
      failures.push('environment assertion entry has an invalid closed shape');
      continue;
    }
    if (assertionsById.has(assertion.id)) {
      failures.push(`environment assertion ${String(assertion.id)} is duplicated`);
      continue;
    }
    if (!['executable', 'target'].includes(assertion.status)) {
      failures.push(
        `environment assertion ${String(assertion.id)} has invalid status ${String(assertion.status)}`,
      );
    }
    const variants = new Set();
    for (const variant of assertion.variants) {
      if (variants.has(variant?.id)) {
        failures.push(
          `environment assertion ${String(assertion.id)} variant ${String(variant?.id)} is duplicated`,
        );
      }
      variants.add(variant?.id);
      const requiredRuns = Array.isArray(variant?.requiredRuns) ? variant.requiredRuns : [];
      if (
        variant?.environment?.browser !== undefined &&
        variant.environment.browserPrefix !== undefined
      ) {
        failures.push(
          `environment assertion ${String(assertion.id)} variant ${String(variant?.id)} cannot combine browser and browserPrefix`,
        );
      }
      if (
        new Set(requiredRuns).size !== requiredRuns.length ||
        requiredRuns.some((testId) => commandForEvidenceLane(testId) === undefined)
      ) {
        failures.push(
          `environment assertion ${String(assertion.id)} variant ${String(variant?.id)} references an unregistered lane`,
        );
      }
      if (assertion.status === 'executable' && requiredRuns.length === 0) {
        failures.push(
          `executable environment ${String(assertion.id)} variant ${String(variant?.id)} requires registered runs`,
        );
      }
      if (assertion.status === 'target' && requiredRuns.length > 0) {
        failures.push(
          `target environment ${String(assertion.id)} cannot advertise executable runs`,
        );
      }
    }
    if (assertion.status === 'executable' && assertion.variants.length === 0) {
      failures.push(`executable environment ${String(assertion.id)} requires variants`);
    }
    if (typeof assertion.id === 'string') {
      assertionsById.set(assertion.id, assertion);
    }
  }
  const matrixIds = Array.isArray(environmentMatrix?.environments)
    ? environmentMatrix.environments.map((environment) => environment.id)
    : [];
  if (
    new Set(matrixIds).size !== matrixIds.length ||
    [...new Set(matrixIds)].sort().join('\n') !== [...assertionsById.keys()].sort().join('\n')
  ) {
    failures.push('environment assertion registry must cover every matrix identity exactly once');
  }
  return { assertionsById, failures };
}

export function environmentMatchesPredicate(environment, predicate) {
  if (
    predicate.browserPrefix !== undefined &&
    !String(environment?.browser ?? '').startsWith(predicate.browserPrefix)
  ) {
    return false;
  }
  for (const member of [
    'browser',
    'database',
    'dart',
    'flutter',
    'host',
    'npm',
    'os',
    'php',
    'variant',
  ]) {
    if (predicate[member] !== undefined && environment?.[member] !== predicate[member]) {
      return false;
    }
  }
  if (predicate.nodeMajor !== undefined) {
    const match = /^v?([0-9]+)(?:\.|$)/u.exec(String(environment?.node ?? ''));
    if (match === null || Number(match[1]) !== predicate.nodeMajor) {
      return false;
    }
  }
  return true;
}

export async function inspectBundleEvidence(manifest, context) {
  const failures = [];
  const authenticatedProofKeys = new Set();
  const bundleId = manifest.bundleId;
  const bundlePrefix = `evidence/bundles/${bundleId}/artifacts/`;
  if (!Buffer.isBuffer(context.manifestBytes)) {
    failures.push('bundle authenticity requires the exact raw manifest bytes');
  } else {
    try {
      if (!isDeepStrictEqual(JSON.parse(context.manifestBytes.toString('utf8')), manifest)) {
        failures.push('parsed bundle manifest differs from the supplied raw manifest bytes');
      }
    } catch {
      failures.push('bundle raw manifest bytes are not valid JSON');
    }
  }

  if (manifest.source.repository !== CANONICAL_REPOSITORY) {
    failures.push(`source.repository must be ${CANONICAL_REPOSITORY}`);
  }
  const sourceCommitReachable = await context.isCommitReachable(manifest.source.commit);
  if (!sourceCommitReachable) {
    failures.push(
      `source.commit ${manifest.source.commit} is not the checked-out commit or a reachable ancestor`,
    );
  }
  if (manifest.source.workingTreeState !== 'clean') {
    failures.push('source.workingTreeState must be "clean"');
  }
  if (context.getCommitTree !== undefined && sourceCommitReachable) {
    const expectedTree = await context.getCommitTree(manifest.source.commit);
    if (manifest.source.tree !== expectedTree) {
      failures.push(`source.tree ${manifest.source.tree} is not the exact candidate tree`);
    }
  }

  const sourceCommitTime = await context.getCommitTime(manifest.source.commit);
  if (!Number.isFinite(sourceCommitTime)) {
    failures.push(`source.commit ${manifest.source.commit} does not have a resolvable commit time`);
  }

  const lockfilePaths = Object.keys(manifest.source.lockfileChecksums).sort();
  if (!sameMembers(lockfilePaths, ['package-lock.json'])) {
    failures.push('source.lockfileChecksums must contain exactly package-lock.json');
  }
  if (sourceCommitReachable) {
    await collectSourceChecksumMapFailures(
      failures,
      'source.lockfileChecksums',
      manifest.source.lockfileChecksums,
      context,
      manifest.source.commit,
    );
  }
  for (const path of EVIDENCE_SEMANTIC_INPUTS) {
    let executingChecksum;
    try {
      executingChecksum = await checksumFile(resolve(context.repositoryRoot, path));
    } catch (error) {
      failures.push(
        `executing evidence semantic ${path} is unavailable: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      continue;
    }
    if (manifest.inputFixtureChecksums[path] !== executingChecksum) {
      failures.push(
        `source evidence semantic ${path} differs from the executing verifier; regenerate the bundle`,
      );
    }
  }

  for (const path of REQUIRED_EVIDENCE_INPUTS) {
    if (manifest.inputFixtureChecksums[path] === undefined) {
      failures.push(`inputFixtureChecksums is missing required source input ${path}`);
    }
  }
  if (sourceCommitReachable) {
    await collectSourceChecksumMapFailures(
      failures,
      'inputFixtureChecksums',
      manifest.inputFixtureChecksums,
      context,
      manifest.source.commit,
    );
  }
  if (
    manifest.source.lockfileChecksums['package-lock.json'] !==
    manifest.inputFixtureChecksums['package-lock.json']
  ) {
    failures.push('the package-lock.json source and input checksums must be identical');
  }

  const artifactPaths = [];
  const artifactsByPath = new Map();
  const artifactChecksums = new Map();
  for (const artifact of manifest.artifacts) {
    if (artifactChecksums.has(artifact.path)) {
      failures.push(`artifact ${artifact.path} is duplicated`);
      continue;
    }
    artifactPaths.push(artifact.path);
    artifactsByPath.set(artifact.path, artifact);
    artifactChecksums.set(artifact.path, artifact.checksum);
    if (!artifact.path.startsWith(bundlePrefix)) {
      failures.push(`artifact ${artifact.path} is outside ${bundlePrefix}`);
    }
    if (!EVIDENCE_ARTIFACT_ROLES.includes(artifact.role)) {
      failures.push(`artifact ${artifact.path} uses unregistered role ${String(artifact.role)}`);
    }
  }
  const checksumPaths = Object.keys(manifest.artifactChecksums);
  if (!sameMembers(artifactPaths, checksumPaths)) {
    failures.push('artifactChecksums keys must exactly match the artifacts array paths');
  }
  for (const [path, checksum] of artifactChecksums) {
    if (manifest.artifactChecksums[path] !== checksum) {
      failures.push(`artifact ${path} checksum does not match artifactChecksums`);
    }
  }
  await collectChecksumMapFailures(
    failures,
    'artifactChecksums',
    manifest.artifactChecksums,
    context.evidenceRoot ?? context.repositoryRoot,
    bundlePrefix,
  );

  const seenCriteria = new Set();
  for (const criterion of manifest.criteria) {
    const key = criterionProofKey(criterion.criterionId, criterion.class);
    if (seenCriteria.has(key)) {
      failures.push(`criterion evidence ${criterion.criterionId}/${criterion.class} is duplicated`);
    }
    seenCriteria.add(key);
    const registered = context.criteriaById.get(criterion.criterionId);
    if (registered === undefined) {
      failures.push(`criterion ${criterion.criterionId} is not in evidence/gate-criteria.json`);
    } else if (!registered.evidenceClasses.includes(criterion.class)) {
      failures.push(
        `criterion ${criterion.criterionId} does not permit evidence class ${criterion.class}`,
      );
    }
  }

  for (const profile of manifest.profiles) {
    if (!context.allowedProfiles.has(profile)) {
      failures.push(`profile ${profile} is not in the Version 2 profile registry`);
    }
  }
  let sourcePackageVersions = context.packageVersions;
  if (sourceCommitReachable && context.getPackageVersionsForCommit !== undefined) {
    try {
      sourcePackageVersions = await context.getPackageVersionsForCommit(manifest.source.commit);
    } catch (error) {
      failures.push(
        `source package versions at ${manifest.source.commit} are unavailable: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      sourcePackageVersions = {};
    }
  }
  for (const [name, version] of Object.entries(sourcePackageVersions)) {
    if (manifest.environment.packageVersions?.[name] !== version) {
      failures.push(`environment.packageVersions must record ${name}@${version}`);
    }
  }
  let sourceCorpusManifest;
  try {
    const corpusBytes =
      sourceCommitReachable && context.getSourceFileBytes !== undefined
        ? await context.getSourceFileBytes(
            manifest.source.commit,
            'packages/testkit/corpus-manifest.json',
          )
        : await readFile(resolve(context.repositoryRoot, 'packages/testkit/corpus-manifest.json'));
    sourceCorpusManifest = JSON.parse(corpusBytes.toString('utf8'));
  } catch (error) {
    failures.push(
      `candidate-source corpus manifest is unavailable: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  if (manifest.environment.browser === undefined) {
    failures.push('environment.browser is required because the accessibility lane is mandatory');
  }

  const executions = [manifest.execution, ...(manifest.intakeExecutions ?? [])];
  const executionsById = new Map(executions.map((execution) => [execution.id, execution]));
  if (executionsById.size !== executions.length) {
    failures.push('bundle execution identities must be unique');
  }
  const runIds = new Set();
  const executionRunIds = new Set();
  const runsById = new Map();
  let latestRunTime = Number.NEGATIVE_INFINITY;
  for (const run of manifest.runs) {
    if (runIds.has(run.testId)) {
      failures.push(`run testId ${run.testId} is duplicated`);
    }
    runIds.add(run.testId);
    if (executionRunIds.has(run.runId)) {
      failures.push(`run identity ${run.runId} is duplicated`);
    }
    executionRunIds.add(run.runId);
    const execution = executionsById.get(run.executionId);
    if (
      execution === undefined ||
      run.executionAttempt !== execution.attempt ||
      run.runner !== execution.runner ||
      !run.runId.startsWith(`${run.executionId}/run-`)
    ) {
      failures.push(`run ${run.testId} does not bind a retained execution identity`);
    }
    runsById.set(run.testId, run);
    const startedAt = Date.parse(run.startedAt);
    const endedAt = Date.parse(run.endedAt);
    if (Number.isNaN(startedAt) || Number.isNaN(endedAt) || endedAt < startedAt) {
      failures.push(`run ${run.testId} has invalid or reversed timestamps`);
    } else {
      latestRunTime = Math.max(latestRunTime, endedAt);
    }
    if (run.exitStatus !== 0) {
      failures.push(`run ${run.testId} has nonzero exitStatus ${run.exitStatus}`);
    }
    if (run.retryCount !== 0) {
      failures.push(`run ${run.testId} was retried; flaky evidence is failing evidence`);
    }
    const laneDefinition = evidenceLane(run.testId);
    const expectedCommand = commandForEvidenceLane(run.testId);
    if (expectedCommand === undefined) {
      failures.push(`run ${run.testId} is outside the closed evidence command registry`);
    } else if (run.command !== expectedCommand) {
      failures.push(`run ${run.testId} did not run its registered command`);
    }
    if (laneDefinition?.availability === 'target') {
      failures.push(`run ${run.testId} remains target-only and cannot authenticate evidence`);
    }
    for (const path of run.artifactPaths ?? []) {
      const artifact = artifactsByPath.get(path);
      if (artifact === undefined) {
        failures.push(`run ${run.testId} links unknown artifact ${path}`);
        continue;
      }
      if (artifact.producerTestId !== run.testId) {
        failures.push(
          `artifact ${path} names producer ${artifact.producerTestId}, not linking run ${run.testId}`,
        );
      }
      if (!laneDefinition?.artifactRoles.includes(artifact.role)) {
        failures.push(`run ${run.testId} cannot produce artifact role ${String(artifact.role)}`);
      }
    }
  }
  for (const execution of executions) {
    if (!manifest.runs.some((run) => run.executionId === execution.id)) {
      failures.push(`retained execution ${execution.id} has no exact run identity`);
    }
  }
  for (const artifact of manifest.artifacts) {
    const producer = runsById.get(artifact.producerTestId);
    if (producer === undefined) {
      failures.push(
        `artifact ${artifact.path} names missing producer run ${artifact.producerTestId}`,
      );
    } else if (!producer.artifactPaths.includes(artifact.path)) {
      failures.push(`artifact ${artifact.path} is not linked by its producer run`);
    }
  }
  const structuredDocumentsByRole = new Map();
  if (context.producerContractIndex !== undefined) {
    for (const [runIndex, run] of manifest.runs.entries()) {
      const contracts = context.producerContractIndex.contractsByLane.get(run.testId) ?? [];
      if (contracts.length === 0) continue;
      const logPath = `${bundlePrefix}${String(runIndex + 1).padStart(2, '0')}-${run.testId.replaceAll('/', '-')}.log`;
      const expectedPaths = [
        logPath,
        ...contracts.map(
          ({ outputFile }) =>
            `${bundlePrefix}${structuredArtifactName(runIndex, run.testId, outputFile)}`,
        ),
      ];
      if (!sameMembers(run.artifactPaths, expectedPaths)) {
        failures.push(`run ${run.testId} does not retain its exact structured output set`);
      }
      for (const contract of contracts) {
        const path = `${bundlePrefix}${structuredArtifactName(
          runIndex,
          run.testId,
          contract.outputFile,
        )}`;
        const artifact = artifactsByPath.get(path);
        if (
          artifact === undefined ||
          artifact.role !== contract.role ||
          artifact.mediaType !== contract.mediaType ||
          artifact.producerTestId !== run.testId
        ) {
          failures.push(
            `run ${run.testId} output ${contract.outputFile} substituted its fixed artifact contract`,
          );
          continue;
        }
        let bytes;
        let document;
        try {
          bytes = await readRetainedArtifactBytes(path, context);
          document = JSON.parse(bytes.toString('utf8'));
          if (!bytes.equals(Buffer.from(`${JSON.stringify(document, null, 2)}\n`))) {
            failures.push(`structured artifact ${path} is not canonical JSON`);
          }
        } catch (error) {
          failures.push(
            `structured artifact ${path} is unavailable or invalid JSON: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
          continue;
        }
        if (structuredDocumentsByRole.has(contract.role)) {
          failures.push(`structured artifact role ${contract.role} is duplicated in the bundle`);
        } else {
          structuredDocumentsByRole.set(contract.role, document);
        }
        if (context.packageLock === undefined || context.validateProducerSchema === undefined) {
          failures.push(`structured artifact ${path} has no active semantic validator context`);
          continue;
        }
        failures.push(
          ...(await collectProducerArtifactFailures(artifact, bytes, {
            bundleId: manifest.bundleId,
            candidateCommit: manifest.source.commit,
            candidateTree: manifest.source.tree,
            corpusManifest: sourceCorpusManifest,
            contractIndex: context.producerContractIndex,
            execution: {
              attempt: run.executionAttempt,
              id: run.executionId,
              runId: run.runId,
              runner: run.runner,
            },
            inputFixtureChecksums: manifest.inputFixtureChecksums,
            packageLock: context.packageLock,
            packageVersions: sourcePackageVersions,
            validateSchema: context.validateProducerSchema,
            workPackage: manifest.workPackage,
          })),
        );
      }
    }
    failures.push(...collectProducerClosureFailures(structuredDocumentsByRole));
  }
  for (const requiredLane of REQUIRED_EVIDENCE_LANES) {
    if (!runIds.has(requiredLane)) {
      failures.push(`runs is missing mandatory lane ${requiredLane}`);
    }
  }
  let profileAssertions = context.profileAssertions;
  if (sourceCommitReachable && context.getProfileAssertionsForCommit !== undefined) {
    try {
      profileAssertions = await context.getProfileAssertionsForCommit(manifest.source.commit);
    } catch (error) {
      failures.push(
        `profile assertions at ${manifest.source.commit} are unavailable: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      profileAssertions = new Map();
    }
  }
  for (const profileId of manifest.profiles) {
    const assertion = profileAssertions?.get(profileId);
    if (assertion === undefined || assertion.status !== 'executable') {
      failures.push(`profile ${profileId} has no executable assertion mapping`);
      continue;
    }
    for (const path of assertion.requiredInputs) {
      if (manifest.inputFixtureChecksums[path] === undefined) {
        failures.push(`profile ${profileId} is missing required source input ${path}`);
      }
    }
    for (const testId of assertion.requiredRuns) {
      const run = manifest.runs.find((candidate) => candidate.testId === testId);
      if (run === undefined) {
        failures.push(`profile ${profileId} is missing required assertion lane ${testId}`);
        continue;
      }
      const expectedCommand = commandForEvidenceLane(testId);
      if (expectedCommand === undefined || run.command !== expectedCommand) {
        failures.push(`profile ${profileId} lane ${testId} did not run its registered command`);
      }
    }
  }

  let proofContext = {
    externalSubjectAssertions: context.externalSubjectAssertions ?? new Map(),
    manualProcedures: context.manualProcedures ?? new Map(),
    proofAssertions: context.proofAssertions ?? new Map(),
  };
  if (sourceCommitReachable && context.getProofContextForCommit !== undefined) {
    try {
      proofContext = await context.getProofContextForCommit(manifest.source.commit);
    } catch (error) {
      failures.push(
        `proof assertions at ${manifest.source.commit} are unavailable: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  collectScopeFailures(failures, manifest, proofContext.proofAssertions, runsById);

  const runnerIdentities = new Set(manifest.runs.map((run) => run.runner));
  const retainedArtifactPaths = new Set(artifactPaths);
  const subjectsById = new Map();
  const subjectFailuresById = new Map();
  for (const subject of manifest.subjects ?? []) {
    if (subjectsById.has(subject.id)) {
      failures.push(`external subject ${subject.id} is duplicated`);
      continue;
    }
    subjectsById.set(subject.id, subject);
    const subjectFailures = [];
    let report;
    let attestation;
    let subjectBytes;
    try {
      subjectBytes = await readRetainedArtifactBytes(subject.recordArtifactPath, context);
      const retainedSubject = JSON.parse(subjectBytes);
      if (!isDeepStrictEqual(retainedSubject, subject)) {
        subjectFailures.push(
          `external subject ${subject.id} does not equal its checksum-bound record artifact`,
        );
      }
    } catch (error) {
      subjectFailures.push(
        `external subject ${subject.id} record artifact is unavailable or invalid JSON: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    try {
      report = await readRetainedJsonArtifact(subject.reportArtifactPath, context);
    } catch (error) {
      subjectFailures.push(
        `external subject ${subject.id} report artifact is unavailable or invalid JSON: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    try {
      attestation = await readRetainedJsonArtifact(subject.attestationArtifactPath, context);
    } catch (error) {
      subjectFailures.push(
        `external subject ${subject.id} attestation artifact is unavailable or invalid JSON: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    subjectFailures.push(
      ...(await collectExternalSubjectFailures(subject, {
        artifactsByPath,
        artifactPaths: retainedArtifactPaths,
        assertion: proofContext.externalSubjectAssertions.get(subject.id),
        attestation,
        bundleId: manifest.bundleId,
        candidateCommit: manifest.source.commit,
        candidateTree: manifest.source.tree,
        execution: {
          attempt: runsById.get(proofContext.externalSubjectAssertions.get(subject.id)?.laneId)
            ?.executionAttempt,
          id: runsById.get(proofContext.externalSubjectAssertions.get(subject.id)?.laneId)
            ?.executionId,
          runId: runsById.get(proofContext.externalSubjectAssertions.get(subject.id)?.laneId)
            ?.runId,
          runner: runsById.get(proofContext.externalSubjectAssertions.get(subject.id)?.laneId)
            ?.runner,
        },
        now: context.now,
        report,
        reviewerAuthorities: context.reviewerAuthorities,
        reviewerAuthorityReleaseTrustVerified: context.reviewerAuthorityReleaseTrustVerified,
        reviewerAuthorityStructuralPinVerified: context.reviewerAuthorityStructuralPinVerified,
        runnerIdentities,
        sourceCommitTime,
        subjectBytes,
        validateAttestationSchema: context.validateExternalAttestationSchema,
        validateReportSchema: context.validateExternalReportSchema,
        validateReviewAttestationSchema: context.validateReviewAttestationSchema,
        validateSchema: context.validateExternalSubjectSchema,
        runStartedAt: runsById.get(proofContext.externalSubjectAssertions.get(subject.id)?.laneId)
          ?.startedAt,
        workPackage: manifest.workPackage,
      })),
    );
    subjectFailuresById.set(subject.id, subjectFailures);
    failures.push(...subjectFailures);
  }

  for (const criterion of manifest.criteria) {
    const proofFailures = [];
    const key = criterionProofKey(criterion.criterionId, criterion.class);
    const assertion = proofContext.proofAssertions.get(key);
    if (assertion === undefined) {
      proofFailures.push(
        `criterion ${criterion.criterionId}/${criterion.class} has no registered proof assertion`,
      );
    } else {
      if (assertion.availability === 'target') {
        proofFailures.push(
          `criterion ${criterion.criterionId}/${criterion.class} remains target-only`,
        );
      }
      if (!sameMembers(criterion.proof.runIds, assertion.requiredRuns)) {
        proofFailures.push(
          `criterion ${criterion.criterionId}/${criterion.class} does not bind its exact required runs`,
        );
      }
      if (!sameMembers(criterion.proof.subjectIds, assertion.requiredSubjectIds)) {
        proofFailures.push(
          `criterion ${criterion.criterionId}/${criterion.class} does not bind its exact required subjects`,
        );
      }

      const proofRuns = criterion.proof.runIds
        .map((testId) => runsById.get(testId))
        .filter(Boolean);
      for (const testId of criterion.proof.runIds) {
        if (!runsById.has(testId)) {
          proofFailures.push(
            `criterion ${criterion.criterionId}/${criterion.class} links missing run ${testId}`,
          );
        }
      }
      const expectedProofArtifactPaths = proofRuns.flatMap((run) => run.artifactPaths);
      if (!sameMembers(criterion.proof.artifactPaths, expectedProofArtifactPaths)) {
        proofFailures.push(
          `criterion ${criterion.criterionId}/${criterion.class} artifact refs must exactly match its bound runs`,
        );
      }
      const proofArtifacts = criterion.proof.artifactPaths
        .map((path) => artifactsByPath.get(path))
        .filter(Boolean);
      for (const path of criterion.proof.artifactPaths) {
        if (!artifactsByPath.has(path)) {
          proofFailures.push(
            `criterion ${criterion.criterionId}/${criterion.class} links unknown artifact ${path}`,
          );
        }
      }
      const proofArtifactRoles = new Set(proofArtifacts.map((artifact) => artifact.role));
      for (const role of assertion.artifactRoles) {
        if (!proofArtifactRoles.has(role)) {
          proofFailures.push(
            `criterion ${criterion.criterionId}/${criterion.class} lacks required artifact role ${role}`,
          );
        }
      }

      for (const subjectId of criterion.proof.subjectIds) {
        if (!subjectsById.has(subjectId)) {
          proofFailures.push(
            `criterion ${criterion.criterionId}/${criterion.class} links missing external subject ${subjectId}`,
          );
        } else if ((subjectFailuresById.get(subjectId) ?? []).length > 0) {
          proofFailures.push(
            `criterion ${criterion.criterionId}/${criterion.class} links unauthenticated external subject ${subjectId}`,
          );
        }
      }

      if (assertion.manualProcedureId !== null) {
        const procedure = proofContext.manualProcedures.get(assertion.manualProcedureId);
        const manualArtifacts = proofArtifacts.filter(
          (artifact) => artifact.role === procedure?.artifactRole,
        );
        if (procedure === undefined || manualArtifacts.length !== 1) {
          proofFailures.push(
            `criterion ${criterion.criterionId}/${criterion.class} must bind exactly one manual record`,
          );
        } else {
          let manualRecord;
          let manualRecordBytes;
          try {
            manualRecordBytes = await readRetainedArtifactBytes(manualArtifacts[0].path, context);
            manualRecord = JSON.parse(manualRecordBytes.toString('utf8'));
          } catch (error) {
            proofFailures.push(
              `manual record ${manualArtifacts[0].path} is unavailable or invalid JSON: ${
                error instanceof Error ? error.message : String(error)
              }`,
            );
          }
          if (manualRecord !== undefined) {
            proofFailures.push(
              ...(await collectManualRecordFailures(manualRecord, {
                ...context,
                artifactsByPath,
                artifactPaths: retainedArtifactPaths,
                bundleId: manifest.bundleId,
                candidateCommit: manifest.source.commit,
                candidateTree: manifest.source.tree,
                execution: {
                  attempt: runsById.get(procedure.laneId)?.executionAttempt,
                  id: runsById.get(procedure.laneId)?.executionId,
                  runId: runsById.get(procedure.laneId)?.runId,
                  runner: runsById.get(procedure.laneId)?.runner,
                },
                now: context.now,
                procedure,
                runStartedAt: runsById.get(procedure.laneId)?.startedAt,
                runnerIdentities,
                sourceCommitTime,
                subjectBytes: manualRecordBytes,
                validateSchema: context.validateManualRecordSchema,
                verificationStartedAt: Date.parse(runsById.get(procedure.laneId)?.startedAt ?? ''),
                workPackage: manifest.workPackage,
              })),
            );
          }
        }
      }
    }
    if (proofFailures.length === 0) {
      authenticatedProofKeys.add(key);
    } else {
      failures.push(...proofFailures);
    }
  }

  const review = manifest.review;
  if (review.status !== 'pending') {
    const reviewedAt = Date.parse(review.reviewedAt);
    if (Number.isNaN(reviewedAt)) {
      failures.push(`review.reviewedAt ${review.reviewedAt} is not a parseable timestamp`);
    } else {
      if (Number.isFinite(sourceCommitTime) && reviewedAt < sourceCommitTime) {
        failures.push('review.reviewedAt precedes the reviewed source commit');
      }
      if (Number.isFinite(latestRunTime) && reviewedAt < latestRunTime) {
        failures.push('review.reviewedAt precedes the recorded run completion');
      }
      if (reviewedAt > context.now) {
        failures.push('review.reviewedAt is in the future');
      }
    }
    if (review.reviewer?.kind !== 'human') {
      failures.push('review.reviewer.kind must be human');
    }
    if (review.reviewer?.independent !== true) {
      failures.push('bundle reproduction reviewer must hold trusted independent authority');
    }
    if (manifest.runs.some((run) => run.runner === review.reviewer?.identity)) {
      failures.push('the reviewer must be independent of every recorded runner identity');
    }
    const expectedReviewPrefix = `evidence/bundles/${bundleId}/review/`;
    if (
      !review.authentication?.attestationPath?.startsWith(expectedReviewPrefix) ||
      !review.authentication?.signaturePath?.startsWith(expectedReviewPrefix)
    ) {
      failures.push(`bundle review authentication must remain under ${expectedReviewPrefix}`);
    }
    if (Buffer.isBuffer(context.manifestBytes)) {
      failures.push(
        ...(await collectSignedReviewFailures({
          authentication: review.authentication,
          context,
          expectedIssuedAt: review.reviewedAt,
          expectedReviewer: {
            identity: review.reviewer?.identity,
            independent: review.reviewer?.independent,
            roles: review.reviewer?.roles,
          },
          expectedSubject: {
            bundleId,
            candidateCommit: manifest.source.commit,
            candidateTree: manifest.source.tree,
            decision: review.status,
            execution: manifest.execution,
            freshnessExpiresAt: review.status === 'reproduced' ? review.freshnessExpiresAt : null,
            intakeExecutions: manifest.intakeExecutions,
            kind: 'bundle-review',
            reviewedAt: review.reviewedAt,
            workPackage: manifest.workPackage,
          },
          subjectBytes: context.manifestBytes,
        })),
      );
    }
  }
  if (review.status === 'reproduced') {
    const reviewedAt = Date.parse(review.reviewedAt);
    const expiry = Date.parse(review.freshnessExpiresAt);
    if (Number.isNaN(expiry)) {
      failures.push(
        `review.freshnessExpiresAt ${review.freshnessExpiresAt} is not a parseable timestamp`,
      );
    } else {
      if (!Number.isNaN(reviewedAt) && expiry <= reviewedAt) {
        failures.push('review.freshnessExpiresAt must be after review.reviewedAt');
      }
      if (expiry <= context.now) {
        failures.push('reviewed evidence has expired');
      }
    }
  }

  return { authenticatedProofKeys, failures };
}

export async function collectBundleFailures(manifest, context) {
  return (await inspectBundleEvidence(manifest, context)).failures;
}

export function collectScopeFailures(failures, manifest, proofAssertions, runsById) {
  const requested = manifest.scope?.requestedCriteria ?? [];
  const proofs = manifest.scope?.proofs ?? [];
  const proofKeys = proofs.map(({ criterionId, class: evidenceClass }) =>
    criterionProofKey(criterionId, evidenceClass),
  );
  if (new Set(proofKeys).size !== proofKeys.length) {
    failures.push('bundle scope contains a duplicate criterion/class proof');
  }
  const expectedKeys = [];
  for (const criterionId of requested) {
    const criterion = manifest.criteria.map(({ criterionId: id }) => id).includes(criterionId);
    const registeredClasses = [...proofAssertions.values()]
      .filter((assertion) => assertion.criterionId === criterionId)
      .map((assertion) => assertion.class);
    if (registeredClasses.length === 0) {
      failures.push(`bundle scope requests unregistered criterion ${criterionId}`);
    }
    for (const evidenceClass of registeredClasses) {
      expectedKeys.push(criterionProofKey(criterionId, evidenceClass));
    }
    if (!criterion && !proofs.some((proof) => proof.criterionId === criterionId)) {
      failures.push(`bundle scope does not retain requested criterion ${criterionId}`);
    }
  }
  if (!sameMembers(proofKeys, expectedKeys)) {
    failures.push('bundle scope must cover every class of every requested criterion exactly once');
  }
  const claimsByKey = new Map(
    manifest.criteria.map((claim) => [criterionProofKey(claim.criterionId, claim.class), claim]),
  );
  for (const proof of proofs) {
    const key = criterionProofKey(proof.criterionId, proof.class);
    const assertion = proofAssertions.get(key);
    if (assertion === undefined) continue;
    if (
      !sameMembers(proof.requiredRunIds, assertion.requiredRuns) ||
      !sameMembers(proof.requiredSubjectIds, assertion.requiredSubjectIds) ||
      proof.manualProcedureId !== assertion.manualProcedureId
    ) {
      failures.push(`bundle scope ${proof.criterionId}/${proof.class} substituted its contract`);
    }
    const available = assertion.requiredRuns.filter((testId) => runsById.has(testId));
    const missing = assertion.requiredRuns.filter((testId) => !runsById.has(testId));
    if (
      !sameMembers(proof.availableRunIds, available) ||
      !sameMembers(proof.missingRunIds, missing)
    ) {
      failures.push(
        `bundle scope ${proof.criterionId}/${proof.class} misstates available or missing runs`,
      );
    }
    const claim = claimsByKey.get(key);
    if (proof.status === 'generated') {
      if (claim === undefined || missing.length > 0) {
        failures.push(`generated scope ${proof.criterionId}/${proof.class} lacks complete proof`);
      }
    } else {
      if (claim !== undefined) {
        failures.push(`pending scope ${proof.criterionId}/${proof.class} cannot claim evidence`);
      }
      if (proof.status !== assertion.availability) {
        failures.push(
          `pending scope ${proof.criterionId}/${proof.class} misstates ${assertion.availability}`,
        );
      }
    }
  }
  for (const key of claimsByKey.keys()) {
    if (!proofKeys.includes(key)) {
      failures.push(`criterion claim ${key.replace('\u0000', '/')} is outside bundle scope`);
    }
  }
}

export async function collectGateRecordFailures(record, fileName, context) {
  const failures = [];
  if (!Buffer.isBuffer(context.recordBytes)) {
    failures.push('gate authenticity requires the exact raw gate-record bytes');
  } else {
    try {
      if (!isDeepStrictEqual(JSON.parse(context.recordBytes.toString('utf8')), record)) {
        failures.push('parsed gate record differs from the supplied raw gate-record bytes');
      }
    } catch {
      failures.push('gate raw record bytes are not valid JSON');
    }
  }
  const expectedFileName = `gate-${record.gate.toLowerCase()}.json`;
  if (fileName !== expectedFileName) {
    failures.push(`gate ${record.gate} record must be named ${expectedFileName}`);
  }
  if (!(await context.isCommitReachable(record.sourceCommit))) {
    failures.push(
      `sourceCommit ${record.sourceCommit} is not reachable from the checked-out commit`,
    );
  }
  const sourceCommitTime = await context.getCommitTime(record.sourceCommit);
  const decidedAt = Date.parse(record.decidedAt);
  if (Number.isNaN(decidedAt)) {
    failures.push(`decidedAt ${record.decidedAt} is not a parseable timestamp`);
  } else {
    if (Number.isFinite(sourceCommitTime) && decidedAt < sourceCommitTime) {
      failures.push('decidedAt precedes sourceCommit');
    }
    if (decidedAt > context.now) {
      failures.push('decidedAt is in the future');
    }
  }

  const expectedCriteria = context.registry.gates[record.gate];
  const expectedIds = expectedCriteria.map((criterion) => criterion.id);
  const recordIds = record.criteria.map((criterion) => criterion.criterionId);
  if (!sameMembers(recordIds, expectedIds) || new Set(recordIds).size !== recordIds.length) {
    failures.push(
      `gate ${record.gate} record must contain every registered criterion exactly once`,
    );
  }

  const linkedBundleIds = new Set();
  for (const criterion of record.criteria) {
    const registered = context.criteriaById.get(criterion.criterionId);
    if (registered === undefined || registered.gate !== record.gate) {
      failures.push(`criterion ${criterion.criterionId} does not belong to gate ${record.gate}`);
      continue;
    }
    if (criterion.outcome === 'not-assessed' && criterion.evidenceBundleIds.length !== 0) {
      failures.push(`not-assessed criterion ${criterion.criterionId} must not link evidence`);
    }
    if (criterion.outcome !== 'not-assessed' && criterion.evidenceBundleIds.length === 0) {
      failures.push(`${criterion.outcome} criterion ${criterion.criterionId} must link evidence`);
    }

    const coveredClasses = new Set();
    for (const bundleId of criterion.evidenceBundleIds) {
      linkedBundleIds.add(bundleId);
      if (bundleId.startsWith('SAMPLE-')) {
        failures.push(
          `criterion ${criterion.criterionId} links forbidden sample bundle ${bundleId}`,
        );
        continue;
      }
      const bundle = context.bundlesById.get(bundleId);
      if (bundle === undefined) {
        failures.push(`criterion ${criterion.criterionId} links nonexistent bundle ${bundleId}`);
        continue;
      }
      if (bundle.source.commit !== record.sourceCommit) {
        failures.push(
          `bundle ${bundleId} does not describe gate sourceCommit ${record.sourceCommit}`,
        );
      }
      if (bundle.review.status !== 'reproduced') {
        failures.push(`bundle ${bundleId} has not been independently reproduced`);
      } else if (Date.parse(bundle.review.freshnessExpiresAt) <= context.now) {
        failures.push(`bundle ${bundleId} is outside its freshness window`);
      }
      if (
        !Number.isNaN(decidedAt) &&
        bundle.review.status === 'reproduced' &&
        Date.parse(bundle.review.reviewedAt) > decidedAt
      ) {
        failures.push(`bundle ${bundleId} was reviewed after the gate decision`);
      }
      const authenticatedProofs = context.authenticatedProofsByBundleId?.get(bundleId);
      for (const evidenceClass of registered.evidenceClasses) {
        if (authenticatedProofs?.has(criterionProofKey(criterion.criterionId, evidenceClass))) {
          coveredClasses.add(evidenceClass);
        }
      }
    }
    if (criterion.outcome === 'met') {
      for (const evidenceClass of registered.evidenceClasses) {
        if (!coveredClasses.has(evidenceClass)) {
          failures.push(`met criterion ${criterion.criterionId} lacks ${evidenceClass} evidence`);
        }
      }
    }
  }

  if (!sameMembers([...linkedBundleIds], record.evidenceBundleIds)) {
    failures.push('evidenceBundleIds must exactly equal the bundles linked by criterion records');
  }
  const expectedGateArtifactPaths = new Set();
  for (const bundleId of record.evidenceBundleIds) {
    expectedGateArtifactPaths.add(`evidence/bundles/${bundleId}/manifest.json`);
    const bundle = context.bundlesById.get(bundleId);
    for (const artifact of bundle?.artifacts ?? []) {
      expectedGateArtifactPaths.add(artifact.path);
      if (record.artifactHashes[artifact.path] !== artifact.checksum) {
        failures.push(
          `artifactHashes must bind bundle ${bundleId} artifact ${artifact.path} to its declared checksum`,
        );
      }
    }
    for (const path of [
      bundle?.review?.authentication?.attestationPath,
      bundle?.review?.authentication?.signaturePath,
    ]) {
      if (typeof path === 'string') {
        expectedGateArtifactPaths.add(path);
      }
    }
  }
  if (!sameMembers(Object.keys(record.artifactHashes), [...expectedGateArtifactPaths])) {
    failures.push(
      'artifactHashes must exactly equal every linked manifest.json and every declared bundle artifact',
    );
  }
  if (record.decision === 'pass' && record.evidenceBundleIds.length === 0) {
    failures.push('a passing gate record must link at least one evidence bundle');
  }
  if (record.decision === 'pass' && record.criteria.some((item) => item.outcome !== 'met')) {
    failures.push('a passing gate requires every criterion outcome to be met');
  }
  if (record.decision === 'fail' && record.criteria.every((item) => item.outcome === 'met')) {
    failures.push('a failing gate must name at least one not-met or not-assessed criterion');
  }

  const allowedProfiles = context.allowedProfiles;
  const supported = new Set(record.supportedProfiles);
  const excluded = new Set(record.excludedProfiles);
  for (const profile of [...supported, ...excluded]) {
    if (!allowedProfiles.has(profile)) {
      failures.push(`profile ${profile} is not in the Version 2 profile registry`);
    }
  }
  for (const profile of supported) {
    if (excluded.has(profile)) {
      failures.push(`profile ${profile} is both supported and excluded`);
    }
  }
  if (!sameMembers([...supported, ...excluded], [...allowedProfiles])) {
    failures.push(
      'supportedProfiles and excludedProfiles must partition the Version 2 profile set',
    );
  }
  for (const profile of supported) {
    const covered = record.evidenceBundleIds.some((id) =>
      context.bundlesById.get(id)?.profiles.includes(profile),
    );
    if (!covered) {
      failures.push(`supported profile ${profile} has no linked evidence bundle`);
    }
  }

  const reviewerByIdentity = new Map();
  const authenticationPaths = new Set();
  for (const reviewer of record.reviewers) {
    if (reviewerByIdentity.has(reviewer.identity)) {
      failures.push(`reviewer identity ${reviewer.identity} is duplicated`);
    }
    reviewerByIdentity.set(reviewer.identity, reviewer);
    for (const role of reviewer.roles) {
      if (!REVIEWER_ROLES.includes(role)) {
        failures.push(`reviewer ${reviewer.identity} has unknown role ${role}`);
      }
    }
    for (const path of [
      reviewer.authentication?.attestationPath,
      reviewer.authentication?.signaturePath,
    ]) {
      if (typeof path !== 'string') continue;
      if (authenticationPaths.has(path)) {
        failures.push(`gate reviewer authentication path ${path} is reused`);
      }
      authenticationPaths.add(path);
    }
    const expectedReviewPrefix = `evidence/gates/reviews/gate-${record.gate.toLowerCase()}/`;
    if (
      !reviewer.authentication?.attestationPath?.startsWith(expectedReviewPrefix) ||
      !reviewer.authentication?.signaturePath?.startsWith(expectedReviewPrefix)
    ) {
      failures.push(`gate reviewer authentication must remain under ${expectedReviewPrefix}`);
    }
    if (Buffer.isBuffer(context.recordBytes)) {
      failures.push(
        ...(await collectSignedReviewFailures({
          authentication: reviewer.authentication,
          context,
          expectedIssuedAt: record.decidedAt,
          expectedReviewer: {
            identity: reviewer.identity,
            independent: reviewer.independent,
            roles: reviewer.roles,
          },
          expectedSubject: {
            candidateCommit: record.sourceCommit,
            decidedAt: record.decidedAt,
            decision: record.decision,
            gate: record.gate,
            kind: 'gate-review',
          },
          subjectBytes: context.recordBytes,
        })),
      );
    }
  }
  if (!record.reviewers.some((reviewer) => reviewer.independent)) {
    failures.push('at least one gate reviewer must be independent of the work-package owners');
  }
  for (const [field, role] of Object.entries(SIGN_OFF_ROLES)) {
    const identity = record.signOff[field];
    const reviewer = reviewerByIdentity.get(identity);
    if (reviewer === undefined) {
      failures.push(`signOff.${field} must name a gate reviewer`);
    } else if (!reviewer.roles.includes(role)) {
      failures.push(`signOff.${field} reviewer ${identity} does not hold the ${role} role`);
    }
  }
  if (
    record.decision === 'pass' &&
    record.unresolvedDefects.some((defect) => ['critical', 'high'].includes(defect.severity))
  ) {
    failures.push('a passing gate cannot carry an unresolved critical or high defect');
  }

  await collectChecksumMapFailures(
    failures,
    'artifactHashes',
    record.artifactHashes,
    context.evidenceRoot ?? context.repositoryRoot,
  );

  return failures;
}

export async function collectChecksumMapFailures(
  failures,
  member,
  checksums,
  repositoryRoot,
  requiredPrefix,
) {
  for (const [path, expected] of Object.entries(checksums)) {
    if (requiredPrefix !== undefined && !path.startsWith(requiredPrefix)) {
      failures.push(`${member} path ${path} is outside ${requiredPrefix}`);
      continue;
    }
    const resolvedPath = resolve(repositoryRoot, path);
    if (!isContained(repositoryRoot, resolvedPath)) {
      failures.push(`${member} path ${path} escapes the repository`);
      continue;
    }
    let fileStat;
    try {
      fileStat = await lstat(resolvedPath);
    } catch {
      failures.push(`${member} path ${path} does not exist in the repository`);
      continue;
    }
    if (!fileStat.isFile() || fileStat.isSymbolicLink()) {
      failures.push(`${member} path ${path} must be a regular, non-symlink file`);
      continue;
    }
    let resolvedRealPath;
    try {
      resolvedRealPath = await realpath(resolvedPath);
    } catch {
      failures.push(`${member} path ${path} cannot be resolved`);
      continue;
    }
    if (!isContained(await realpath(repositoryRoot), resolvedRealPath)) {
      failures.push(`${member} path ${path} resolves outside the repository`);
      continue;
    }
    const actual = await checksumFile(resolvedPath);
    if (actual !== expected) {
      failures.push(`${member} path ${path} has checksum ${actual}, not ${expected}`);
    }
  }
}

async function collectSourceChecksumMapFailures(failures, member, checksums, context, commit) {
  if (context.getSourceFileChecksum === undefined) {
    await collectChecksumMapFailures(failures, member, checksums, context.repositoryRoot);
    return;
  }
  for (const [path, expected] of Object.entries(checksums)) {
    if (!isRepositoryRelativePath(path)) {
      failures.push(`${member} path ${path} is not a bounded repository-relative path`);
      continue;
    }
    let sourceFile;
    try {
      sourceFile = await context.getSourceFileChecksum(commit, path);
    } catch (error) {
      failures.push(
        `${member} path ${path} is unavailable at ${commit}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      continue;
    }
    if (
      sourceFile === null ||
      typeof sourceFile !== 'object' ||
      !['100644', '100755'].includes(sourceFile.mode)
    ) {
      failures.push(`${member} path ${path} is not a regular tracked source file`);
      continue;
    }
    if (sourceFile.checksum !== expected) {
      failures.push(
        `${member} path ${path} has checksum ${String(sourceFile.checksum)}, not ${expected}`,
      );
    }
  }
}

async function readRetainedJsonArtifact(path, context) {
  return JSON.parse(await readRetainedArtifactBytes(path, context));
}

async function readRetainedArtifactBytes(path, context) {
  if (context.readRetainedArtifact !== undefined) {
    return Buffer.from(await context.readRetainedArtifact(path));
  }
  const root = context.evidenceRoot ?? context.repositoryRoot;
  const resolvedPath = resolve(root, path);
  if (!isContained(root, resolvedPath)) {
    throw new Error('artifact path escapes the evidence root');
  }
  const fileStat = await lstat(resolvedPath);
  if (!fileStat.isFile() || fileStat.isSymbolicLink()) {
    throw new Error('artifact is not a regular, non-symlink file');
  }
  return readFile(resolvedPath);
}

function isContained(root, candidate) {
  const relativePath = relative(root, candidate);
  return (
    relativePath === '' ||
    (!relativePath.startsWith(`..${sep}`) && relativePath !== '..' && !isAbsolute(relativePath))
  );
}

function sameMembers(left, right) {
  if (left.length !== right.length) {
    return false;
  }
  const rightMembers = new Set(right);
  return rightMembers.size === right.length && left.every((member) => rightMembers.has(member));
}

function isRepositoryRelativePath(path) {
  return (
    typeof path === 'string' &&
    (['.github/actions/setup-studio/action.yml', '.github/workflows/evidence-bundle.yml'].includes(
      path,
    ) ||
      /^[A-Za-z0-9@][A-Za-z0-9._@-]*(?:\/[A-Za-z0-9@][A-Za-z0-9._@-]*)*$/u.test(path)) &&
    path.length <= 240
  );
}
