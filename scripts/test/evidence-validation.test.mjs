import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import {
  buildCriterionIndex,
  buildEnvironmentAssertionIndex,
  buildProofAssertionIndex,
  buildProfileAssertionIndex,
  checksumFile,
  commandForEvidenceLane,
  collectBundleFailures,
  collectChecksumMapFailures,
  collectGateRecordFailures,
  criterionProofKey,
  inspectBundleEvidence,
  REQUIRED_EVIDENCE_INPUTS,
  REQUIRED_EVIDENCE_LANES,
} from '../evidence-validation.mjs';
import {
  buildExternalSubjectAssertionIndex,
  collectExternalSubjectFailures,
} from '../external-evidence.mjs';
import {
  buildManualProcedureIndex,
  collectManualRecordFailures,
  manualProcedureChecksum,
} from '../manual-evidence.mjs';
import {
  completablePendingProofsForLane,
  planCriterionProofs,
  planCriterionScope,
} from '../evidence-plan.mjs';
import {
  assertReviewerAuthorityReleaseTrust,
  assertReviewerAuthorityStructuralPin,
  buildReviewerAuthorityIndex,
  REVIEW_SIGNATURE_NAMESPACE,
  reviewerAuthorityRegistryChecksum,
} from '../review-authentication.mjs';
import { assertStatusGatePass, loadGateRecord } from '../verify-release-gate.mjs';

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
const registry = JSON.parse(
  await readFile(`${repositoryRoot}/evidence/gate-criteria.json`, 'utf8'),
);
const criterionIndex = buildCriterionIndex(registry);
const profileAssertionRegistry = JSON.parse(
  await readFile(`${repositoryRoot}/evidence/profile-assertions.json`, 'utf8'),
);
const profileAssertionIndex = buildProfileAssertionIndex(
  profileAssertionRegistry,
  criterionIndex.allowedProfiles,
);
const environmentMatrix = JSON.parse(
  await readFile(`${repositoryRoot}/evidence/environment-matrix.json`, 'utf8'),
);
const environmentAssertionRegistry = JSON.parse(
  await readFile(`${repositoryRoot}/evidence/environment-assertions.json`, 'utf8'),
);
const manualProcedureRegistry = JSON.parse(
  await readFile(`${repositoryRoot}/evidence/manual-procedures.json`, 'utf8'),
);
const manualProcedureIndex = buildManualProcedureIndex(
  manualProcedureRegistry,
  criterionIndex.criteriaById,
);
const externalSubjectAssertionRegistry = JSON.parse(
  await readFile(`${repositoryRoot}/evidence/external-subject-assertions.json`, 'utf8'),
);
const externalSubjectAssertionIndex = buildExternalSubjectAssertionIndex(
  externalSubjectAssertionRegistry,
);
const proofAssertionRegistry = JSON.parse(
  await readFile(`${repositoryRoot}/evidence/proof-assertions.json`, 'utf8'),
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
const manualRecordSchema = JSON.parse(
  await readFile(`${repositoryRoot}/evidence/schema/manual-record.schema.json`, 'utf8'),
);
const externalSubjectSchema = JSON.parse(
  await readFile(`${repositoryRoot}/evidence/schema/external-subject.schema.json`, 'utf8'),
);
const externalReportSchema = JSON.parse(
  await readFile(`${repositoryRoot}/evidence/schema/external-report.schema.json`, 'utf8'),
);
const externalAttestationSchema = JSON.parse(
  await readFile(`${repositoryRoot}/evidence/schema/external-attestation.schema.json`, 'utf8'),
);
const validateManualRecord = new Ajv2020({ allErrors: true, strict: true }).compile(
  manualRecordSchema,
);
const validateExternalSubject = new Ajv2020({ allErrors: true, strict: true }).compile(
  externalSubjectSchema,
);
const validateExternalReport = new Ajv2020({ allErrors: true, strict: true }).compile(
  externalReportSchema,
);
const validateExternalAttestation = new Ajv2020({ allErrors: true, strict: true }).compile(
  externalAttestationSchema,
);
const SOURCE_COMMIT = 'a'.repeat(40);
const SOURCE_TREE = 'b'.repeat(40);
const NOW = Date.parse('2026-08-24T12:00:00Z');
const ALL_GATE_A_PROOF_KEYS = new Set(
  registry.gates.A.flatMap((criterion) =>
    criterion.evidenceClasses.map((evidenceClass) =>
      criterionProofKey(criterion.id, evidenceClass),
    ),
  ),
);

test('criterion registry is schema-valid, stable, unique, and matches roadmap order', async () => {
  const schema = JSON.parse(
    await readFile(`${repositoryRoot}/evidence/schema/gate-criteria.schema.json`, 'utf8'),
  );
  const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema);
  assert.equal(validate(registry), true, JSON.stringify(validate.errors));
  assert.deepEqual(criterionIndex.failures, []);
  assert.equal(registry.gates.A.length, 14);
  assert.equal(registry.gates.B.length, 18);
  assert.equal(criterionIndex.criteriaById.size, 32);
  assert.deepEqual(profileAssertionIndex.failures, []);
  assert.equal(profileAssertionIndex.profilesById.size, 9);
  assert.equal(
    profileAssertionIndex.profilesById.get('studio.profile/authoring-web').status,
    'target',
  );
  assert.deepEqual(manualProcedureIndex.failures, []);
  assert.deepEqual(externalSubjectAssertionIndex.failures, []);
  assert.deepEqual(proofAssertionIndex.failures, []);
  assert.equal(proofAssertionIndex.assertionsByKey.size, 60);
  const gateBAssertions = proofAssertionRegistry.assertions.filter(({ criterionId }) =>
    criterionId.startsWith('gate-b/'),
  );
  assert.equal(gateBAssertions.length, 32);
  assert.ok(gateBAssertions.every(({ availability }) => availability === 'target'));
  assert.deepEqual(
    proofAssertionIndex.profileTargetsById.get('studio.profile/authoring-web'),
    proofAssertionRegistry.profileTargets[0],
  );

  const roadmap = await readFile(`${repositoryRoot}/docs/roadmap/README.md`, 'utf8');
  const roadmapIds = [...roadmap.matchAll(/\*\*`(gate-[ab]\/[^`]+)`\*\*/gu)].map(
    (match) => match[1],
  );
  assert.deepEqual(
    roadmapIds,
    [...registry.gates.A, ...registry.gates.B].map((criterion) => criterion.id),
  );
});

test('profile assertion registry fails closed on malformed assertion arrays', () => {
  const malformed = structuredClone(profileAssertionRegistry);
  malformed.profiles[0].requiredInputs = null;
  malformed.profiles[0].requiredRuns = 'profile/engine-core';
  const index = buildProfileAssertionIndex(malformed, criterionIndex.allowedProfiles);
  assert.ok(index.failures.some((failure) => failure.includes('invalid requiredInputs')));
  assert.ok(index.failures.some((failure) => failure.includes('invalid requiredRuns')));
});

test('reviewer authority registry cannot alias one signing key to two identities', () => {
  const sharedKey = `ssh-ed25519 ${'A'.repeat(68)}`;
  const index = buildReviewerAuthorityIndex({
    authorities: [
      {
        identity: 'github/1001/domain-reviewer',
        independent: true,
        publicKeys: [sharedKey],
        roles: ['security'],
      },
      {
        identity: 'github/1002/general-reviewer',
        independent: false,
        publicKeys: [sharedKey],
        roles: ['general'],
      },
    ],
    contractVersion: '0.1-draft',
    kind: 'reviewer-authority-registry',
    status: 'active',
  });
  assert.ok(index.failures.some((failure) => failure.includes('shared by authorities')));
});

test('a repository-controlled authority checksum is structural, not release authorization', () => {
  const attackerRegistryBytes = Buffer.from(
    `${JSON.stringify({
      authorities: [
        {
          identity: 'github/9001/repository-attacker',
          independent: true,
          publicKeys: [`ssh-ed25519 ${'A'.repeat(68)}`],
          roles: ['general'],
        },
        {
          identity: 'github/9002/repository-accomplice',
          independent: true,
          publicKeys: [`ssh-ed25519 ${'B'.repeat(68)}`],
          roles: ['security'],
        },
      ],
      contractVersion: '0.1-draft',
      kind: 'reviewer-authority-registry',
      status: 'active',
    })}\n`,
  );
  const checkedInChecksumBytes = Buffer.from(
    `${reviewerAuthorityRegistryChecksum(attackerRegistryBytes)}\n`,
  );
  assert.doesNotThrow(() =>
    assertReviewerAuthorityStructuralPin(attackerRegistryBytes, checkedInChecksumBytes),
  );
  assert.throws(
    () =>
      assertReviewerAuthorityReleaseTrust(attackerRegistryBytes, checkedInChecksumBytes, undefined),
    /STUDIO_REVIEWER_AUTHORITY_SHA256/u,
  );
  assert.throws(
    () =>
      assertReviewerAuthorityReleaseTrust(
        attackerRegistryBytes,
        checkedInChecksumBytes,
        reviewerAuthorityRegistryChecksum(Buffer.from('protected registry\n')),
      ),
    /does not equal evidence\/reviewer-authorities\.sha256/u,
  );
});

test('proof registry is closed and keeps authoring-web external qualification target-bound', () => {
  const missing = structuredClone(proofAssertionRegistry);
  missing.assertions.pop();
  assert.ok(
    buildProofAssertionIndex(missing, criterionIndex.criteriaById, {
      externalSubjects: externalSubjectAssertionIndex.subjectsById,
      manualProcedures: manualProcedureIndex.proceduresById,
      profileAssertions: profileAssertionIndex.profilesById,
    }).failures.some((failure) => failure.includes('every Gate A and Gate B criterion/class')),
  );

  const promotedByLabel = structuredClone(proofAssertionRegistry);
  promotedByLabel.assertions.find(
    (assertion) => assertion.class === 'integration' && assertion.availability === 'external-input',
  ).availability = 'executable';
  assert.ok(
    buildProofAssertionIndex(promotedByLabel, criterionIndex.criteriaById, {
      externalSubjects: externalSubjectAssertionIndex.subjectsById,
      manualProcedures: manualProcedureIndex.proceduresById,
      profileAssertions: profileAssertionIndex.profilesById,
    }).failures.some((failure) => failure.includes('contains a non-executable lane')),
  );

  const detachedAuthoring = structuredClone(proofAssertionRegistry);
  detachedAuthoring.profileTargets[0].requiredSubjectIds = [];
  detachedAuthoring.profileTargets[0].requiredRuns = ['accessibility/manual-interactions-v1'];
  assert.ok(
    buildProofAssertionIndex(detachedAuthoring, criterionIndex.criteriaById, {
      externalSubjects: externalSubjectAssertionIndex.subjectsById,
      manualProcedures: manualProcedureIndex.proceduresById,
      profileAssertions: profileAssertionIndex.profilesById,
    }).failures.some((failure) =>
      failure.includes('exact Kumwe App real-shell and manual accessibility proof'),
    ),
  );
});

test('generator planning runs class-scoped internal producers and retains manual/external gaps', () => {
  const executable = planCriterionProofs(
    ['gate-a/02-protocol-schemas'],
    criterionIndex.criteriaById,
    proofAssertionIndex.assertionsByKey,
  );
  assert.deepEqual(
    executable.map(({ assertion }) => assertion.class),
    ['contract', 'security'],
  );
  assert.deepEqual(
    planCriterionProofs(
      ['gate-a/04-extension-theme-lifecycle'],
      criterionIndex.criteriaById,
      proofAssertionIndex.assertionsByKey,
    ).map(({ assertion }) => assertion.class),
    ['contract', 'lifecycle'],
  );
  const externalScope = planCriterionScope(
    ['gate-a/05-host-ports-negotiation'],
    criterionIndex.criteriaById,
    proofAssertionIndex.assertionsByKey,
  );
  assert.deepEqual(
    externalScope.proofs.map(({ class: evidenceClass, status }) => [evidenceClass, status]),
    [
      ['contract', 'generated'],
      ['integration', 'external-input'],
    ],
  );
  assert.ok(externalScope.executableRunIds.includes('integration/reference-host-http-v1'));
  assert.ok(!externalScope.executableRunIds.includes('integration/kumwe-app-v1'));
  const manualScope = planCriterionScope(
    ['gate-a/12-accessible-interactions'],
    criterionIndex.criteriaById,
    proofAssertionIndex.assertionsByKey,
  );
  assert.equal(
    manualScope.proofs.find(({ class: evidenceClass }) => evidenceClass === 'accessibility').status,
    'manual-input',
  );
  assert.ok(manualScope.executableRunIds.includes('accessibility/web'));
});

test('one authenticated shared App lane completes every matching scoped integration proof', () => {
  const scope = planCriterionScope(
    [
      'gate-a/05-host-ports-negotiation',
      'gate-a/06-media-rich-text-boundaries',
      'gate-a/10-host-playbooks',
    ],
    criterionIndex.criteriaById,
    proofAssertionIndex.assertionsByKey,
  );
  const runsById = new Map(
    [...scope.executableRunIds, 'integration/kumwe-app-v1'].map((testId) => [testId, {}]),
  );
  const completed = completablePendingProofsForLane(
    scope.proofs,
    'integration/kumwe-app-v1',
    proofAssertionIndex.assertionsByKey,
    runsById,
    new Set(['kumwe/app']),
    new Set(
      scope.claims.map(({ assertion, criterionId }) => `${criterionId}\u0000${assertion.class}`),
    ),
  );
  assert.deepEqual(
    completed.map(({ proof }) => `${proof.criterionId}/${proof.class}`),
    [
      'gate-a/05-host-ports-negotiation/integration',
      'gate-a/06-media-rich-text-boundaries/integration',
      'gate-a/10-host-playbooks/integration',
    ],
  );
});

test('environment assertions cover the matrix and keep unsupported variants non-executable', async () => {
  const schema = JSON.parse(
    await readFile(`${repositoryRoot}/evidence/schema/environment-assertions.schema.json`, 'utf8'),
  );
  const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema);
  assert.equal(validate(environmentAssertionRegistry), true, JSON.stringify(validate.errors));
  const index = buildEnvironmentAssertionIndex(environmentAssertionRegistry, environmentMatrix);
  assert.deepEqual(index.failures, []);
  assert.equal(index.assertionsById.size, environmentMatrix.environments.length);
  assert.equal(index.assertionsById.get('ios-safari').status, 'target');
  assert.equal(index.assertionsById.get('kumwe-app-host').variants.length, 3);
  assert.deepEqual(index.assertionsById.get('generic-reference-host').variants[0].environment, {
    browser: 'Chromium-141.0.7390.37',
    host: 'generic-reference-host',
    nodeMajor: 24,
    npm: '11.9.0',
    os: 'linux-x64',
  });
});

test('a profile label cannot substitute for its registered executable assertions', async (t) => {
  const fixture = await createBundleFixture(t);
  const manifest = structuredClone(fixture.manifest);
  manifest.profiles = ['studio.profile/renderer-web'];
  const failures = await collectBundleFailures(manifest, {
    ...fixture.context,
    profileAssertions: profileAssertionIndex.profilesById,
  });
  assert.ok(failures.some((failure) => failure.includes('renderer-web is missing required')));
});

test('mandatory lane labels cannot substitute for their exact registered commands', async (t) => {
  const fixture = await createBundleFixture(t);
  const manifest = structuredClone(fixture.manifest);
  manifest.runs.find((run) => run.testId === 'accessibility/web').command = 'true';
  const failures = await collectBundleFailures(manifest, fixture.context);
  assert.ok(failures.includes('run accessibility/web did not run its registered command'));

  const unknown = structuredClone(fixture.manifest);
  unknown.runs.push({
    ...unknown.runs[0],
    testId: 'unregistered/label-only-lane',
  });
  const unknownFailures = await collectBundleFailures(unknown, fixture.context);
  assert.ok(
    unknownFailures.includes(
      'run unregistered/label-only-lane is outside the closed evidence command registry',
    ),
  );
});

test('criterion labels authenticate only through exact run, producer, role, and artifact refs', async (t) => {
  const fixture = await createBundleFixture(t);
  const inspection = await inspectBundleEvidence(fixture.manifest, fixture.context);
  assert.deepEqual(inspection.failures, []);
  assert.deepEqual(
    [...inspection.authenticatedProofKeys],
    [
      criterionProofKey('gate-a/02-protocol-schemas', 'contract'),
      criterionProofKey('gate-a/02-protocol-schemas', 'security'),
    ],
  );

  const wrongRuns = structuredClone(fixture.manifest);
  wrongRuns.criteria[0].proof.runIds = ['contract/canonical-corpus'];
  assert.ok(
    (await collectBundleFailures(wrongRuns, fixture.context)).some((failure) =>
      failure.includes('does not bind its exact required runs'),
    ),
  );

  const wrongProducer = structuredClone(fixture.manifest);
  const boundPath = wrongProducer.criteria[0].proof.artifactPaths[0];
  wrongProducer.artifacts.find((artifact) => artifact.path === boundPath).producerTestId =
    'quality/lint';
  assert.ok(
    (await collectBundleFailures(wrongProducer, fixture.context)).some((failure) =>
      failure.includes('not linking run'),
    ),
  );

  const wrongRole = structuredClone(fixture.manifest);
  wrongRole.artifacts.find((artifact) => artifact.path === boundPath).role =
    'integration/kumwe-app-report-v1';
  const roleFailures = await collectBundleFailures(wrongRole, fixture.context);
  assert.ok(roleFailures.some((failure) => failure.includes('cannot produce artifact role')));

  const relabelled = structuredClone(fixture.manifest);
  relabelled.criteria[0].class = 'security';
  assert.ok(
    (await collectBundleFailures(relabelled, fixture.context)).some((failure) =>
      failure.includes('does not bind its exact required runs'),
    ),
  );
});

test('structured release producers remain reachable without bypassing manual reproduction', () => {
  const assertion = proofAssertionIndex.assertionsByKey.get(
    criterionProofKey('gate-a/13-reproducible-evidence', 'release'),
  );
  assert.equal(assertion.availability, 'executable');
  const scope = planCriterionScope(
    ['gate-a/13-reproducible-evidence'],
    criterionIndex.criteriaById,
    proofAssertionIndex.assertionsByKey,
  );
  assert.equal(scope.claims.length, 1);
  assert.equal(
    scope.proofs.find(({ class: evidenceClass }) => evidenceClass === 'manual-decision').status,
    'manual-input',
  );
  assert.equal(
    commandForEvidenceLane('release/staged-registry-install'),
    'node scripts/evidence/verify-staged-registry.mjs',
  );
});

test('manual proof rejects self-asserted review and binds each step to distinct artifact bytes', async () => {
  const procedure = manualProcedureIndex.proceduresById.get('accessibility/gate-a-interactions-v1');
  const checksum = `sha256-${'A'.repeat(43)}=`;
  const observationPaths = procedure.requiredSteps.map(
    (_stepId, index) =>
      `evidence/bundles/bundle-one/artifacts/manual-observation-${String(index + 1).padStart(2, '0')}.txt`,
  );
  const record = {
    authentication: {
      attestationPath: 'evidence/bundles/bundle-one/artifacts/manual-accessibility.review.json',
      signaturePath: 'evidence/bundles/bundle-one/artifacts/manual-accessibility.review.json.sig',
    },
    bundleId: 'bundle-one',
    candidateCommit: SOURCE_COMMIT,
    candidateTree: 'b'.repeat(40),
    contractVersion: '0.1-draft',
    criterionId: procedure.criterionId,
    evidenceClass: procedure.evidenceClass,
    execution: {
      attempt: 1,
      id: 'fixture/execution',
      runId: 'fixture/execution/run-016',
      runner: 'ci/runner',
    },
    kind: 'manual-evidence-record',
    observations: procedure.requiredSteps.map((stepId, index) => ({
      artifactChecksums: { [observationPaths[index]]: checksum },
      artifactPaths: [observationPaths[index]],
      artifactRole: 'manual/observation-v1',
      observed: `Observed ${stepId}.`,
      outcome: 'pass',
      stepId,
    })),
    outcome: 'accepted',
    performedAt: '2026-08-24T10:00:00Z',
    procedureChecksum: manualProcedureChecksum(procedure),
    procedureId: procedure.id,
    reviewer: {
      identity: 'github/1001/accessibility-reviewer',
      independent: true,
      kind: 'human',
      roles: ['accessibility'],
    },
    workPackage: 'M2-01',
  };
  const artifactsByPath = new Map(
    observationPaths.map((path) => [
      path,
      {
        checksum,
        path,
        producerTestId: procedure.laneId,
        role: 'manual/observation-v1',
      },
    ]),
  );
  artifactsByPath.set(record.authentication.attestationPath, {
    checksum,
    path: record.authentication.attestationPath,
    producerTestId: procedure.laneId,
    role: 'review/attestation-v1',
  });
  artifactsByPath.set(record.authentication.signaturePath, {
    checksum,
    path: record.authentication.signaturePath,
    producerTestId: procedure.laneId,
    role: 'review/signature-v1',
  });
  const context = {
    artifactsByPath,
    artifactPaths: new Set(artifactsByPath.keys()),
    bundleId: 'bundle-one',
    candidateCommit: SOURCE_COMMIT,
    candidateTree: 'b'.repeat(40),
    execution: record.execution,
    now: NOW,
    procedure,
    reviewerAuthorityStructuralPinVerified: false,
    runStartedAt: '2026-08-24T11:00:00Z',
    runnerIdentities: new Set(['ci/runner']),
    sourceCommitTime: Date.parse('2026-08-24T08:00:00Z'),
    subjectBytes: Buffer.from(`${JSON.stringify(record, null, 2)}\n`),
    validateSchema: validateManualRecord,
    verificationStartedAt: Date.parse('2026-08-24T11:00:00Z'),
    workPackage: 'M2-01',
  };
  assert.ok(
    (await collectManualRecordFailures(record, context)).some((failure) =>
      failure.includes('checksum-pinned reviewer authority registry'),
    ),
  );

  const nonIndependent = structuredClone(record);
  nonIndependent.reviewer.independent = false;
  assert.ok(
    (await collectManualRecordFailures(nonIndependent, context)).some((failure) =>
      failure.includes('trusted independent authority'),
    ),
  );

  const missingStep = structuredClone(record);
  missingStep.observations.pop();
  assert.ok(
    (await collectManualRecordFailures(missingStep, context)).some((failure) =>
      failure.includes('every registered procedure step'),
    ),
  );
  const sharedArtifact = structuredClone(record);
  sharedArtifact.observations[1].artifactPaths = [observationPaths[0]];
  sharedArtifact.observations[1].artifactChecksums = { [observationPaths[0]]: checksum };
  assert.ok(
    (await collectManualRecordFailures(sharedArtifact, context)).some((failure) =>
      failure.includes('reused across steps'),
    ),
  );
  const wrongProcedure = structuredClone(record);
  wrongProcedure.procedureChecksum = `sha256-${'A'.repeat(43)}=`;
  assert.ok(
    (await collectManualRecordFailures(wrongProcedure, context)).some((failure) =>
      failure.includes('exact registered procedure'),
    ),
  );
  const postdated = structuredClone(record);
  postdated.performedAt = '2026-08-24T11:30:00Z';
  assert.ok(
    (await collectManualRecordFailures(postdated, context)).some((failure) =>
      failure.includes('verifier run window'),
    ),
  );
  const relabelled = structuredClone(record);
  relabelled.observations[0].artifactRole = 'manual/decision-record-v1';
  assert.ok(
    (await collectManualRecordFailures(relabelled, context)).some((failure) =>
      failure.includes('closed schema'),
    ),
  );
  const substitutedProducer = { ...context };
  substitutedProducer.artifactsByPath = new Map(artifactsByPath);
  substitutedProducer.artifactsByPath.set(observationPaths[0], {
    checksum,
    producerTestId: 'quality/lint',
    role: 'manual/observation-v1',
  });
  assert.ok(
    (await collectManualRecordFailures(record, substitutedProducer)).some((failure) =>
      failure.includes('exact verifier producer and role'),
    ),
  );
});

test('Kumwe App evidence remains target-only and rejects repository, commit, and candidate replay', async () => {
  const assertion = externalSubjectAssertionIndex.subjectsById.get('kumwe/app');
  const artifactPaths = new Set([
    'evidence/bundles/bundle-one/artifacts/kumwe-app-subject.json',
    'evidence/bundles/bundle-one/artifacts/kumwe-app-report.json',
    'evidence/bundles/bundle-one/artifacts/kumwe-app-attestation.json',
    'evidence/bundles/bundle-one/artifacts/kumwe-app-review.json',
    'evidence/bundles/bundle-one/artifacts/kumwe-app-review.json.sig',
  ]);
  const packages = [
    '@kumwe/studio',
    '@kumwe/studio-core',
    '@kumwe/studio-media',
    '@kumwe/studio-preview',
    '@kumwe/studio-protocol',
    '@kumwe/studio-renderer-web',
    '@kumwe/studio-rich-text',
    '@kumwe/studio-testkit',
  ];
  const integrity = `sha512-${'A'.repeat(86)}==`;
  const checksum = `sha256-${'A'.repeat(43)}=`;
  const subject = {
    authentication: {
      attestationPath: 'evidence/bundles/bundle-one/artifacts/kumwe-app-review.json',
      signaturePath: 'evidence/bundles/bundle-one/artifacts/kumwe-app-review.json.sig',
    },
    attestationArtifactPath: 'evidence/bundles/bundle-one/artifacts/kumwe-app-attestation.json',
    attestationChecksum: checksum,
    commit: 'b'.repeat(40),
    id: 'kumwe/app',
    kind: 'git-workflow-evidence',
    lockfileChecksums: {
      'composer.lock': checksum,
      'package-lock.json': checksum,
    },
    ref: 'refs/pull/114/head',
    recordArtifactPath: 'evidence/bundles/bundle-one/artifacts/kumwe-app-subject.json',
    reportArtifactPath: 'evidence/bundles/bundle-one/artifacts/kumwe-app-report.json',
    reportChecksum: checksum,
    repository: 'https://github.com/kumwe/app',
    freshnessExpiresAt: '2026-09-24T10:00:00Z',
    reviewedAt: '2026-08-24T10:00:00Z',
    runStartedAt: '2026-08-24T11:00:00Z',
    reviewer: {
      identity: 'github/1001/compatibility-reviewer',
      independent: true,
      kind: 'human',
      roles: ['compatibility'],
    },
    sourceChecksums: Object.fromEntries(
      assertion.requiredSourcePaths.map((path) => [path, checksum]),
    ),
    studioBinding: {
      bundleId: 'bundle-one',
      candidateCommit: SOURCE_COMMIT,
      candidateTree: 'd'.repeat(40),
      corpusManifestChecksum: checksum,
      execution: {
        attempt: 1,
        id: 'fixture/execution',
        runId: 'fixture/execution/run-017',
        runner: 'ci/runner',
      },
      packageIntegrities: Object.fromEntries(packages.map((name) => [name, integrity])),
      releaseRecordChecksum: checksum,
      workPackage: 'M2-01',
    },
    tree: 'c'.repeat(40),
    workflow: {
      command: assertion.requiredCommand,
      commit: 'b'.repeat(40),
      digest: checksum,
      path: assertion.workflowPath,
      repository: assertion.repository,
      runAttempt: 1,
      runId: 114,
    },
  };
  const boundDocument = {
    commit: subject.commit,
    contractVersion: '0.1-draft',
    ref: subject.ref,
    repository: subject.repository,
    sourceChecksums: subject.sourceChecksums,
    studioBinding: subject.studioBinding,
    tree: subject.tree,
    workflow: subject.workflow,
  };
  const report = {
    ...boundDocument,
    kind: 'kumwe-app-evidence-report',
    outcome: 'passed',
  };
  const attestation = {
    ...boundDocument,
    issuedAt: '2026-08-24T10:00:00Z',
    issuer: 'https://token.actions.githubusercontent.com',
    kind: 'kumwe-app-workflow-attestation',
    reportChecksum: subject.reportChecksum,
  };
  const context = {
    artifactPaths,
    assertion,
    attestation,
    bundleId: 'bundle-one',
    candidateCommit: SOURCE_COMMIT,
    candidateTree: 'd'.repeat(40),
    execution: subject.studioBinding.execution,
    now: NOW,
    report,
    runnerIdentities: new Set(['ci/runner']),
    sourceCommitTime: Date.parse('2026-08-24T08:00:00Z'),
    subjectBytes: Buffer.from(`${JSON.stringify(subject, null, 2)}\n`),
    validateAttestationSchema: validateExternalAttestation,
    validateReportSchema: validateExternalReport,
    validateSchema: validateExternalSubject,
    runStartedAt: '2026-08-24T11:00:00Z',
    workPackage: 'M2-01',
  };
  const targetFailures = await collectExternalSubjectFailures(subject, context);
  assert.ok(targetFailures.some((failure) => failure.includes('target-only')));

  const executableAssertion = { ...assertion, status: 'executable' };
  const unauthenticated = await collectExternalSubjectFailures(subject, {
    ...context,
    assertion: executableAssertion,
  });
  assert.ok(
    unauthenticated.some((failure) =>
      failure.includes('checksum-pinned reviewer authority registry'),
    ),
  );

  const replayed = structuredClone(subject);
  replayed.repository = 'https://github.com/example/fork';
  replayed.workflow.commit = 'd'.repeat(40);
  replayed.studioBinding.candidateCommit = 'e'.repeat(40);
  const replayFailures = await collectExternalSubjectFailures(replayed, context);
  assert.ok(replayFailures.some((failure) => failure.includes('registered repository')));
  assert.ok(replayFailures.some((failure) => failure.includes('workflow commit')));
  assert.ok(replayFailures.some((failure) => failure.includes('another Studio bundle execution')));

  const refReplay = structuredClone(subject);
  refReplay.ref = 'refs/pull/999/head';
  const refFailures = await collectExternalSubjectFailures(refReplay, {
    ...context,
    assertion: executableAssertion,
  });
  assert.ok(refFailures.some((failure) => failure.includes('report does not bind exact ref')));

  const tamperedReport = structuredClone(report);
  tamperedReport.workflow.runAttempt = 2;
  assert.ok(
    (
      await collectExternalSubjectFailures(subject, {
        ...context,
        report: tamperedReport,
      })
    ).some((failure) => failure.includes('exact workflow run')),
  );

  const replayedWindow = structuredClone(subject);
  replayedWindow.runStartedAt = '2026-08-24T11:00:01Z';
  assert.ok(
    (await collectExternalSubjectFailures(replayedWindow, context)).some((failure) =>
      failure.includes('verifier window'),
    ),
  );

  const expired = structuredClone(subject);
  expired.freshnessExpiresAt = '2026-08-24T11:30:00Z';
  assert.ok(
    (await collectExternalSubjectFailures(expired, context)).some((failure) =>
      failure.includes('freshness window'),
    ),
  );
});

test('retained RC evidence authenticates source inputs and versions at its own commit', async (t) => {
  const fixture = await createBundleFixture(t);
  for (const currentVersion of ['0.1.0-rc.2', '0.1.0']) {
    const failures = await collectBundleFailures(fixture.manifest, {
      ...fixture.context,
      getPackageVersionsForCommit: async () => ({ '@kumwe/studio-core': '1.0.0' }),
      getSourceFileChecksum: async (_commit, path) => ({
        checksum: fixture.manifest.inputFixtureChecksums[path],
        mode: '100644',
      }),
      packageVersions: { '@kumwe/studio-core': currentVersion },
    });
    assert.deepEqual(failures, [], `retained evidence failed at current ${currentVersion}`);
  }
  const nonRegularSource = await collectBundleFailures(fixture.manifest, {
    ...fixture.context,
    getSourceFileChecksum: async (_commit, path) => ({
      checksum: fixture.manifest.inputFixtureChecksums[path],
      mode: '120000',
    }),
  });
  assert.ok(
    nonRegularSource.some((failure) => failure.includes('not a regular tracked source file')),
  );
});

test('bundle keeps generator and later intake execution identities distinct and exact', async (t) => {
  const fixture = await createBundleFixture(t);
  const manifest = structuredClone(fixture.manifest);
  const intakeExecution = {
    attempt: 2,
    id: 'intake/execution',
    runner: 'intake/runner',
  };
  manifest.intakeExecutions.push(intakeExecution);
  const intakeRun = manifest.runs.at(-1);
  intakeRun.executionAttempt = intakeExecution.attempt;
  intakeRun.executionId = intakeExecution.id;
  intakeRun.runId = `${intakeExecution.id}/run-001`;
  intakeRun.runner = intakeExecution.runner;
  const context = {
    ...fixture.context,
    manifestBytes: Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`),
  };
  assert.deepEqual(await collectBundleFailures(manifest, context), []);
  intakeRun.runner = manifest.execution.runner;
  context.manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
  assert.ok(
    (await collectBundleFailures(manifest, context)).some((failure) =>
      failure.includes('does not bind a retained execution identity'),
    ),
  );
});

test('a complete pending bundle is authentic but categorically cannot support a gate', async (t) => {
  const fixture = await createBundleFixture(t);
  assert.deepEqual(await collectBundleFailures(fixture.manifest, fixture.context), []);

  const pendingBundle = await createGateBundle(fixture, 'pending');
  const gate = await createPassingGate(fixture, pendingBundle);
  const failures = await collectGateRecordFailures(gate, 'gate-a.json', {
    ...fixture.context,
    authenticatedProofsByBundleId: new Map([['bundle-one', new Set(ALL_GATE_A_PROOF_KEYS)]]),
    bundlesById: new Map([['bundle-one', pendingBundle]]),
    registry,
  });
  assert.ok(failures.includes('bundle bundle-one has not been independently reproduced'));
});

test('bundle authenticity rejects retries, artifact-map drift, and stale review', async (t) => {
  const fixture = await createBundleFixture(t);
  const manifest = structuredClone(fixture.manifest);
  manifest.runs[0].retryCount = 1;
  manifest.artifactChecksums[manifest.artifacts[0].path] = `sha256-${'A'.repeat(43)}=`;
  manifest.review = {
    freshnessExpiresAt: '2026-08-24T11:00:00Z',
    reviewedAt: '2026-08-24T10:00:00Z',
    reviewer: { identity: 'human/reviewer', kind: 'human' },
    status: 'reproduced',
  };
  const failures = await collectBundleFailures(manifest, fixture.context);
  assert.ok(failures.some((failure) => failure.includes('flaky evidence is failing evidence')));
  assert.ok(failures.some((failure) => failure.includes('does not match artifactChecksums')));
  assert.ok(failures.includes('reviewed evidence has expired'));
});

test('checksum validation rejects repository escape, symlinks, and byte drift', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'studio-evidence-paths-'));
  t.after(() => rm(root, { force: true, recursive: true }));
  const outside = await mkdtemp(join(tmpdir(), 'studio-evidence-outside-'));
  t.after(() => rm(outside, { force: true, recursive: true }));
  await writeFile(join(root, 'inside.txt'), 'inside');
  await writeFile(join(outside, 'outside.txt'), 'outside');
  await symlink(join(outside, 'outside.txt'), join(root, 'linked.txt'));
  const failures = [];
  await collectChecksumMapFailures(
    failures,
    'testChecksums',
    {
      '../outside.txt': await checksumFile(join(outside, 'outside.txt')),
      'inside.txt': `sha256-${'A'.repeat(43)}=`,
      'linked.txt': await checksumFile(join(outside, 'outside.txt')),
    },
    root,
  );
  assert.ok(failures.some((failure) => failure.includes('escapes the repository')));
  assert.ok(failures.some((failure) => failure.includes('not sha256-')));
  assert.ok(failures.some((failure) => failure.includes('non-symlink file')));
});

test('fabricated and incomplete gate records fail with stable diagnostics', async (t) => {
  const fixture = await createBundleFixture(t);
  const bundle = await createGateBundle(fixture, 'reproduced');
  const gate = await createPassingGate(fixture, bundle);
  gate.sourceCommit = '0'.repeat(40);
  gate.criteria[0].evidenceBundleIds = ['does-not-exist'];
  gate.evidenceBundleIds = ['does-not-exist'];
  const failures = await collectGateRecordFailures(gate, 'gate-a.json', {
    ...fixture.context,
    authenticatedProofsByBundleId: new Map(),
    bundlesById: new Map(),
    recordBytes: gateRecordBytes(gate),
    registry,
  });
  assert.ok(failures.some((failure) => failure.includes('is not reachable')));
  assert.ok(failures.some((failure) => failure.includes('links nonexistent bundle')));
  assert.ok(failures.some((failure) => failure.includes('lacks contract evidence')));
});

test('gate validation rejects samples, source mismatch, stale review, missing classes, and high defects', async (t) => {
  const fixture = await createBundleFixture(t);
  const bundle = await createGateBundle(fixture, 'reproduced');
  const gate = await createPassingGate(fixture, bundle);
  bundle.source.commit = 'b'.repeat(40);
  bundle.review.freshnessExpiresAt = '2026-08-24T11:00:00Z';
  bundle.criteria = bundle.criteria.filter(
    (item) =>
      !(
        item.criterionId === registry.gates.A[0].id &&
        item.class === registry.gates.A[0].evidenceClasses[0]
      ),
  );
  gate.criteria[0].evidenceBundleIds = ['SAMPLE-forbidden', 'bundle-one'];
  gate.evidenceBundleIds = ['SAMPLE-forbidden', 'bundle-one'];
  gate.unresolvedDefects.push({
    id: 'DEFECT-1',
    rationale: 'Unresolved contract contradiction.',
    severity: 'high',
  });
  const incompleteProofs = new Set(ALL_GATE_A_PROOF_KEYS);
  incompleteProofs.delete(
    criterionProofKey(registry.gates.A[0].id, registry.gates.A[0].evidenceClasses[0]),
  );
  const failures = await collectGateRecordFailures(gate, 'gate-a.json', {
    ...fixture.context,
    authenticatedProofsByBundleId: new Map([['bundle-one', incompleteProofs]]),
    bundlesById: new Map([['bundle-one', bundle]]),
    recordBytes: gateRecordBytes(gate),
    registry,
  });
  assert.ok(failures.some((failure) => failure.includes('forbidden sample bundle')));
  assert.ok(failures.some((failure) => failure.includes('does not describe gate sourceCommit')));
  assert.ok(failures.some((failure) => failure.includes('outside its freshness window')));
  assert.ok(failures.some((failure) => failure.includes('lacks contract evidence')));
  assert.ok(failures.some((failure) => failure.includes('unresolved critical or high defect')));
});

test('a semantically complete Gate A record cannot self-assert reviewer authority', async (t) => {
  const fixture = await createBundleFixture(t);
  const bundle = await createGateBundle(fixture, 'reproduced');
  const gate = await createPassingGate(fixture, bundle);
  const failures = await collectGateRecordFailures(gate, 'gate-a.json', {
    ...fixture.context,
    authenticatedProofsByBundleId: new Map([['bundle-one', new Set(ALL_GATE_A_PROOF_KEYS)]]),
    bundlesById: new Map([['bundle-one', bundle]]),
    recordBytes: gateRecordBytes(gate),
    registry,
  });
  assert.ok(
    failures.some((failure) =>
      failure.includes('lacks a checksum-pinned reviewer authority registry'),
    ),
  );
});

test('gate artifact closure rejects omitted, extra, substituted, and mutated bytes', async (t) => {
  const fixture = await createBundleFixture(t);
  const bundle = await createGateBundle(fixture, 'reproduced');
  const gate = await createPassingGate(fixture, bundle);
  const baseContext = {
    ...fixture.context,
    authenticatedProofsByBundleId: new Map([['bundle-one', new Set(ALL_GATE_A_PROOF_KEYS)]]),
    bundlesById: new Map([['bundle-one', bundle]]),
    registry,
  };

  const omitted = structuredClone(gate);
  Reflect.deleteProperty(omitted.artifactHashes, bundle.artifacts[0].path);
  assert.ok(
    (
      await collectGateRecordFailures(omitted, 'gate-a.json', {
        ...baseContext,
        recordBytes: gateRecordBytes(omitted),
      })
    ).some((failure) => failure.includes('exactly equal every linked')),
  );

  const extra = structuredClone(gate);
  extra.artifactHashes['evidence/bundles/bundle-one/artifacts/extra.log'] =
    bundle.artifacts[0].checksum;
  assert.ok(
    (
      await collectGateRecordFailures(extra, 'gate-a.json', {
        ...baseContext,
        recordBytes: gateRecordBytes(extra),
      })
    ).some((failure) => failure.includes('exactly equal every linked')),
  );

  const substituted = structuredClone(gate);
  substituted.artifactHashes[bundle.artifacts[0].path] = `sha256-${'A'.repeat(43)}=`;
  assert.ok(
    (
      await collectGateRecordFailures(substituted, 'gate-a.json', {
        ...baseContext,
        recordBytes: gateRecordBytes(substituted),
      })
    ).some((failure) => failure.includes('declared checksum')),
  );

  await writeFile(join(fixture.root, bundle.artifacts[0].path), 'mutated bytes\n');
  assert.ok(
    (
      await collectGateRecordFailures(gate, 'gate-a.json', {
        ...baseContext,
        recordBytes: gateRecordBytes(gate),
      })
    ).some((failure) => failure.includes('has checksum')),
  );
});

test('release gate loader accepts a real bundle only through authenticated proof bindings', async (t) => {
  const fixture = await createReleaseGateFixture(t);
  const loaded = await loadGateRecord(fixture.options);
  assert.equal(loaded.record.decision, 'pass');
  assert.equal(loaded.bundlesById.get('authenticated-bundle').bundleId, 'authenticated-bundle');
});

test('signed release review rejects an unpinned authority or changed subject bytes', async (t) => {
  const fixture = await createReleaseGateFixture(t);
  await assert.rejects(
    loadGateRecord({
      ...fixture.options,
      reviewerAuthorityChecksum: undefined,
    }),
    /STUDIO_REVIEWER_AUTHORITY_SHA256/u,
  );
  await assert.rejects(
    loadGateRecord({
      ...fixture.options,
      reviewerAuthorityChecksum: `sha256-${'A'.repeat(43)}=`,
    }),
    /does not equal evidence\/reviewer-authorities\.sha256/u,
  );

  const originalGateBytes = await readFile(fixture.gatePath);
  await writeFile(fixture.gatePath, Buffer.concat([originalGateBytes, Buffer.from('\n')]));
  await assert.rejects(
    loadGateRecord(fixture.options),
    /review attestation does not bind the exact subject bytes and review context/u,
  );
  await writeFile(fixture.gatePath, originalGateBytes);

  const elevatedRoleGate = JSON.parse(originalGateBytes.toString('utf8'));
  elevatedRoleGate.reviewers[1].roles = ['general', 'security'];
  await writeFile(fixture.gatePath, gateRecordBytes(elevatedRoleGate));
  await assert.rejects(
    loadGateRecord(fixture.options),
    /claims roles or independence outside its authority/u,
  );
  await writeFile(fixture.gatePath, originalGateBytes);

  const domainSignaturePath = join(
    fixture.options.evidenceRoot,
    'evidence/gates/reviews/gate-a/domain.json.sig',
  );
  const [domainSignatureBytes, generalSignatureBytes] = await Promise.all([
    readFile(domainSignaturePath),
    readFile(join(fixture.options.evidenceRoot, 'evidence/gates/reviews/gate-a/general.json.sig')),
  ]);
  await writeFile(domainSignaturePath, generalSignatureBytes);
  await assert.rejects(
    loadGateRecord(fixture.options),
    /review attestation signature is not valid for github\/1001\/domain-reviewer/u,
  );
  await writeFile(domainSignaturePath, domainSignatureBytes);

  const originalManifestBytes = await readFile(fixture.bundleManifestPath);
  await writeFile(
    fixture.bundleManifestPath,
    Buffer.concat([originalManifestBytes, Buffer.from('\n')]),
  );
  await assert.rejects(
    loadGateRecord(fixture.options),
    /review attestation does not bind the exact subject bytes and review context/u,
  );
});

test('workflow evidence boundaries remain immutable and input-safe', async () => {
  for (const workflowName of ['evidence-bundle.yml', 'release.yml']) {
    const workflow = await readFile(`${repositoryRoot}/.github/workflows/${workflowName}`, 'utf8');
    for (const match of workflow.matchAll(/^\s*uses:\s*([^\s]+)$/gmu)) {
      assert.ok(
        match[1] === './.github/actions/setup-studio' ||
          match[1] === './.release-controller/.github/actions/setup-studio' ||
          /@[a-f0-9]{40}$/u.test(match[1]),
        `${workflowName}: ${match[1]} is neither local nor pinned`,
      );
    }
    assert.match(workflow, /persist-credentials: false/u);
    assert.match(workflow, /timeout-minutes:/u);
    assertNoInputExpressionInRunBlocks(workflowName, workflow);
  }
  const evidenceWorkflow = await readFile(
    `${repositoryRoot}/.github/workflows/evidence-bundle.yml`,
    'utf8',
  );
  assert.match(evidenceWorkflow, /uses: \.\/\.github\/actions\/setup-studio/u);
  assert.match(evidenceWorkflow, /install-playwright: 'true'/u);
  assert.match(evidenceWorkflow, /path: \$\{\{ steps\.bundle\.outputs\.bundle_path \}\}/u);
  assert.doesNotMatch(evidenceWorkflow, /^\s+bundle_id:/mu);
  assert.doesNotMatch(evidenceWorkflow, /path: evidence\/bundles\/$/mu);

  const releaseWorkflow = await readFile(`${repositoryRoot}/.github/workflows/release.yml`, 'utf8');
  assert.match(releaseWorkflow, /ref: \$\{\{ inputs\.gate_record_sha \}\}/u);
  assert.match(releaseWorkflow, /path: \.release-evidence/u);
  assert.match(releaseWorkflow, /path: \.release-controller/u);
  assert.match(releaseWorkflow, /working-directory: \.release-controller/u);
  assert.match(releaseWorkflow, /STUDIO_PUBLISH_ROOT: \.\./u);
  const publishJob = releaseWorkflow.split('\n  publish:')[1];
  assert.ok(
    publishJob.indexOf('name: Revalidate RC with the exact current-main controller') <
      publishJob.indexOf('name: Verify npm authentication'),
    'current-main controller must run before registry authentication',
  );
  const publication = publishJob.split(
    'name: Publish missing approved tarballs to a non-channel staging tag',
  )[1];
  assert.match(publication, /STUDIO_REVIEWER_AUTHORITY_SHA256:/u);
  assert.doesNotMatch(releaseWorkflow, /sparse-checkout:/u);
  assert.match(releaseWorkflow, /environment: studio-\$\{\{ inputs\.channel \}\}/u);
  assert.match(releaseWorkflow, /NPM_CONFIG_PROVENANCE: 'true'/u);
  assert.doesNotMatch(
    releaseWorkflow.split('\n  stage:')[0],
    /NPM_TOKEN|NODE_AUTH_TOKEN/u,
    'plan and preparation must never receive npm credentials',
  );
  const stageJob = releaseWorkflow.split('\n  stage:')[1].split('\n  publish:')[0];
  assert.match(stageJob, /environment: studio-rc/u);
  assert.match(stageJob, /npm run release:publish-stage/u);
  assert.match(stageJob, /npm run release:verify-stage/u);
  assert.doesNotMatch(stageJob, /release:reconcile-tag|release:cleanup-staging|gh release/u);

  const setupAction = await readFile(
    `${repositoryRoot}/.github/actions/setup-studio/action.yml`,
    'utf8',
  );
  assert.match(setupAction, /actions\/setup-node@[a-f0-9]{40}/u);
  assert.match(setupAction, /npm install --global npm@11\.9\.0/u);
  assert.match(setupAction, /npm ci/u);
  assert.match(setupAction, /working-directory: \$\{\{ inputs\.working-directory \}\}/u);
  assert.match(setupAction, /playwright install --with-deps chromium/u);
  const gitignore = await readFile(`${repositoryRoot}/.gitignore`, 'utf8');
  assert.match(gitignore, /^\.release-controller\/$/mu);
});

test('structural evidence validation never rewrites authoritative Gate A or Gate B status', async () => {
  const statusPath = `${repositoryRoot}/docs/roadmap/STATUS.md`;
  const before = await readFile(statusPath);
  const output = execFileSync(process.execPath, ['scripts/check-evidence.mjs'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  });
  const after = await readFile(statusPath);
  assert.deepEqual(after, before);
  assert.match(output, /has no accepted gate record/u);
  assert.match(output, /does not replace the authoritative docs\/roadmap\/STATUS\.md state/u);
  const status = before.toString('utf8');
  assert.throws(() => assertStatusGatePass(status, 'A'), /not-assessed/u);
  assert.throws(() => assertStatusGatePass(status, 'B'), /blocked/u);
});

async function createBundleFixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'studio-evidence-bundle-'));
  t.after(() => rm(root, { force: true, recursive: true }));
  for (const path of REQUIRED_EVIDENCE_INPUTS) {
    await mkdir(join(root, path, '..'), { recursive: true });
    await writeFile(join(root, path), `${path}\n`);
  }
  await writeFile(
    join(root, 'packages/testkit/corpus-manifest.json'),
    await readFile(join(repositoryRoot, 'packages/testkit/corpus-manifest.json')),
  );
  const inputFixtureChecksums = Object.fromEntries(
    await Promise.all(
      REQUIRED_EVIDENCE_INPUTS.map(async (path) => [path, await checksumFile(join(root, path))]),
    ),
  );
  const assertion = proofAssertionIndex.assertionsByKey.get(
    criterionProofKey('gate-a/02-protocol-schemas', 'contract'),
  );
  const securityAssertion = proofAssertionIndex.assertionsByKey.get(
    criterionProofKey('gate-a/02-protocol-schemas', 'security'),
  );
  const laneIds = [
    ...new Set([
      ...REQUIRED_EVIDENCE_LANES,
      ...assertion.requiredRuns,
      ...securityAssertion.requiredRuns,
    ]),
  ];
  const execution = { attempt: 1, id: 'fixture/execution', runner: 'ci/runner' };
  const artifacts = [];
  const runs = [];
  for (const [index, testId] of laneIds.entries()) {
    const artifactPath =
      `evidence/bundles/bundle-one/artifacts/` +
      `${String(index + 1).padStart(2, '0')}-${testId.replaceAll('/', '-')}.log`;
    await mkdir(join(root, artifactPath, '..'), { recursive: true });
    await writeFile(join(root, artifactPath), `green ${testId}\n`);
    const checksum = await checksumFile(join(root, artifactPath));
    artifacts.push({
      checksum,
      mediaType: 'text/plain',
      path: artifactPath,
      producerTestId: testId,
      role: 'run/log',
    });
    runs.push({
      artifactPaths: [artifactPath],
      command: commandForEvidenceLane(testId),
      endedAt: `2026-08-24T09:${String(index).padStart(2, '0')}:01Z`,
      executionAttempt: execution.attempt,
      executionId: execution.id,
      exitStatus: 0,
      retryCount: 0,
      runId: `${execution.id}/run-${String(index + 1).padStart(3, '0')}`,
      runner: 'ci/runner',
      startedAt: `2026-08-24T09:${String(index).padStart(2, '0')}:00Z`,
      testId,
    });
  }
  const artifactsByProducer = new Map(
    artifacts.map((artifact) => [artifact.producerTestId, artifact.path]),
  );
  const proofArtifactPaths = assertion.requiredRuns.map((testId) =>
    artifactsByProducer.get(testId),
  );
  const securityProofArtifactPaths = securityAssertion.requiredRuns.map((testId) =>
    artifactsByProducer.get(testId),
  );
  const artifactChecksum = artifacts[0].checksum;
  const artifactPath = artifacts[0].path;
  const manifest = {
    artifactChecksums: Object.fromEntries(
      artifacts.map((artifact) => [artifact.path, artifact.checksum]),
    ),
    artifacts,
    bundleId: 'bundle-one',
    criteria: [
      {
        class: 'contract',
        criterionId: 'gate-a/02-protocol-schemas',
        outcome: 'positive',
        proof: {
          artifactPaths: proofArtifactPaths,
          runIds: assertion.requiredRuns,
          subjectIds: [],
        },
      },
      {
        class: 'security',
        criterionId: 'gate-a/02-protocol-schemas',
        outcome: 'positive',
        proof: {
          artifactPaths: securityProofArtifactPaths,
          runIds: securityAssertion.requiredRuns,
          subjectIds: [],
        },
      },
    ],
    execution,
    environment: {
      browser: 'Chromium-141.0.0.0',
      node: '24.6.0',
      npm: '11.9.0',
      os: 'linux-x64',
      packageVersions: { '@kumwe/studio-core': '1.0.0' },
    },
    evidenceSchemaVersion: '0.1-draft',
    inputFixtureChecksums,
    intakeExecutions: [],
    profiles: [],
    redaction: { declared: true, statement: 'No secrets.' },
    review: { status: 'pending' },
    runs,
    scope: {
      proofs: [assertion, securityAssertion].map((proofAssertion) => ({
        availableRunIds: [...proofAssertion.requiredRuns],
        class: proofAssertion.class,
        criterionId: proofAssertion.criterionId,
        manualProcedureId: proofAssertion.manualProcedureId,
        missingRunIds: [],
        requiredRunIds: [...proofAssertion.requiredRuns],
        requiredSubjectIds: [...proofAssertion.requiredSubjectIds],
        status: 'generated',
      })),
      requestedCriteria: ['gate-a/02-protocol-schemas'],
    },
    source: {
      commit: SOURCE_COMMIT,
      lockfileChecksums: { 'package-lock.json': inputFixtureChecksums['package-lock.json'] },
      repository: 'https://github.com/kumwe/studio',
      tree: SOURCE_TREE,
      workingTreeState: 'clean',
    },
    subjects: [],
    workPackage: 'M2-01',
  };
  const context = {
    ...criterionIndex,
    externalSubjectAssertions: externalSubjectAssertionIndex.subjectsById,
    getCommitTime: () => Date.parse('2026-08-24T08:00:00Z'),
    getCommitTree: () => SOURCE_TREE,
    isCommitReachable: (commit) => commit === SOURCE_COMMIT,
    manualProcedures: manualProcedureIndex.proceduresById,
    manifestBytes: Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`),
    now: NOW,
    packageVersions: { '@kumwe/studio-core': '1.0.0' },
    proofAssertions: proofAssertionIndex.assertionsByKey,
    repositoryRoot: root,
    validateExternalAttestationSchema: validateExternalAttestation,
    validateExternalReportSchema: validateExternalReport,
    validateExternalSubjectSchema: validateExternalSubject,
    validateManualRecordSchema: validateManualRecord,
  };
  return { artifactChecksum, artifactPath, context, manifest, root };
}

async function createReleaseGateFixture(t) {
  const candidateRoot = await mkdtemp(join(tmpdir(), 'studio-gate-candidate-'));
  const evidenceRoot = await mkdtemp(join(tmpdir(), 'studio-gate-record-'));
  const signingRoot = await mkdtemp(join(tmpdir(), 'studio-gate-signing-'));
  t.after(() => rm(candidateRoot, { force: true, recursive: true }));
  t.after(() => rm(evidenceRoot, { force: true, recursive: true }));
  t.after(() => rm(signingRoot, { force: true, recursive: true }));
  for (const path of REQUIRED_EVIDENCE_INPUTS) {
    await mkdir(join(candidateRoot, path, '..'), { recursive: true });
    await writeFile(join(candidateRoot, path), await readFile(join(repositoryRoot, path)));
  }
  const domainAuthority = await createSigningAuthority(signingRoot, {
    identity: 'github/1001/domain-reviewer',
    independent: true,
    roles: ['accessibility', 'compatibility', 'data-integrity', 'security'],
  });
  const generalAuthority = await createSigningAuthority(signingRoot, {
    identity: 'github/1002/general-reviewer',
    independent: false,
    roles: ['general'],
  });
  const reviewerAuthorityRegistry = {
    authorities: [domainAuthority.authority, generalAuthority.authority],
    contractVersion: '0.1-draft',
    kind: 'reviewer-authority-registry',
    status: 'active',
  };
  const reviewerAuthorityRegistryBytes = Buffer.from(
    `${JSON.stringify(reviewerAuthorityRegistry, null, 2)}\n`,
  );
  const reviewerAuthorityChecksumBytes = Buffer.from(
    `${reviewerAuthorityRegistryChecksum(reviewerAuthorityRegistryBytes)}\n`,
  );
  await writeFile(
    join(candidateRoot, 'evidence/reviewer-authorities.json'),
    reviewerAuthorityRegistryBytes,
  );
  await writeFile(
    join(candidateRoot, 'evidence/reviewer-authorities.sha256'),
    reviewerAuthorityChecksumBytes,
  );
  await mkdir(join(evidenceRoot, 'evidence'), { recursive: true });
  await writeFile(
    join(evidenceRoot, 'evidence/reviewer-authorities.json'),
    reviewerAuthorityRegistryBytes,
  );
  await writeFile(
    join(evidenceRoot, 'evidence/reviewer-authorities.sha256'),
    reviewerAuthorityChecksumBytes,
  );
  const fixtureProofAssertionRegistry = structuredClone(proofAssertionRegistry);
  for (const assertion of fixtureProofAssertionRegistry.assertions) {
    if (assertion.criterionId.startsWith('gate-a/')) {
      assertion.artifactRoles = ['run/log'];
      assertion.availability = 'executable';
      assertion.manualProcedureId = null;
      assertion.requiredRuns = ['quality/lint'];
      assertion.requiredSubjectIds = [];
    }
  }
  await writeFile(
    join(candidateRoot, 'evidence/proof-assertions.json'),
    `${JSON.stringify(fixtureProofAssertionRegistry, null, 2)}\n`,
  );
  gitFixture(candidateRoot, ['init', '--quiet']);
  gitFixture(candidateRoot, ['config', 'user.email', 'evidence@example.invalid']);
  gitFixture(candidateRoot, ['config', 'user.name', 'Evidence Fixture']);
  gitFixture(candidateRoot, ['add', '.']);
  gitFixture(candidateRoot, ['commit', '--quiet', '-m', 'candidate']);
  const candidateSha = gitFixture(candidateRoot, ['rev-parse', 'HEAD']);
  const candidateTree = gitFixture(candidateRoot, ['rev-parse', 'HEAD^{tree}']);
  const commitTime = new Date(
    gitFixture(candidateRoot, ['show', '--no-patch', '--format=%cI', candidateSha]),
  ).toISOString();
  const fixtureProofAssertionIndex = buildProofAssertionIndex(
    fixtureProofAssertionRegistry,
    criterionIndex.criteriaById,
    {
      externalSubjects: externalSubjectAssertionIndex.subjectsById,
      manualProcedures: manualProcedureIndex.proceduresById,
      profileAssertions: profileAssertionIndex.profilesById,
    },
  );
  assert.deepEqual(fixtureProofAssertionIndex.failures, []);
  const assertions = fixtureProofAssertionRegistry.assertions.filter(({ criterionId }) =>
    criterionId.startsWith('gate-a/'),
  );
  const laneIds = [
    ...new Set([
      ...REQUIRED_EVIDENCE_LANES,
      ...assertions.flatMap((assertion) => assertion.requiredRuns),
    ]),
  ];
  const bundleId = 'authenticated-bundle';
  const execution = {
    attempt: 1,
    id: 'fixture/authenticated-execution',
    runner: 'ci/authenticated-runner',
  };
  const artifacts = [];
  const runs = [];
  for (const [index, testId] of laneIds.entries()) {
    const path =
      `evidence/bundles/${bundleId}/artifacts/` +
      `${String(index + 1).padStart(2, '0')}-${testId.replaceAll('/', '-')}.log`;
    await mkdir(join(evidenceRoot, path, '..'), { recursive: true });
    await writeFile(join(evidenceRoot, path), `authenticated ${testId}\n`);
    const checksum = await checksumFile(join(evidenceRoot, path));
    artifacts.push({
      checksum,
      mediaType: 'text/plain',
      path,
      producerTestId: testId,
      role: 'run/log',
    });
    runs.push({
      artifactPaths: [path],
      command: commandForEvidenceLane(testId),
      endedAt: commitTime,
      executionAttempt: execution.attempt,
      executionId: execution.id,
      exitStatus: 0,
      retryCount: 0,
      runId: `${execution.id}/run-${String(index + 1).padStart(3, '0')}`,
      runner: 'ci/authenticated-runner',
      startedAt: commitTime,
      testId,
    });
  }
  const artifactPathByRun = new Map(
    artifacts.map((artifact) => [artifact.producerTestId, artifact.path]),
  );
  const inputFixtureChecksums = Object.fromEntries(
    await Promise.all(
      REQUIRED_EVIDENCE_INPUTS.map(async (path) => [
        path,
        await checksumFile(join(candidateRoot, path)),
      ]),
    ),
  );
  const packageVersions = JSON.parse(
    await readFile(join(candidateRoot, 'studio-release.json'), 'utf8'),
  ).packages;
  const bundleReviewAuthentication = reviewAuthenticationPaths(
    `evidence/bundles/${bundleId}/review/domain.json`,
  );
  const manifest = {
    artifactChecksums: Object.fromEntries(
      artifacts.map((artifact) => [artifact.path, artifact.checksum]),
    ),
    artifacts,
    bundleId,
    criteria: assertions.map((assertion) => ({
      class: assertion.class,
      criterionId: assertion.criterionId,
      outcome: 'positive',
      proof: {
        artifactPaths: assertion.requiredRuns.map((testId) => artifactPathByRun.get(testId)),
        runIds: assertion.requiredRuns,
        subjectIds: [],
      },
    })),
    execution,
    environment: {
      browser: 'Chromium-141.0.0.0',
      node: '24.6.0',
      npm: '11.9.0',
      os: 'linux-x64',
      packageVersions,
    },
    evidenceSchemaVersion: '0.1-draft',
    inputFixtureChecksums,
    intakeExecutions: [],
    profiles: [],
    redaction: { declared: true, statement: 'No secrets.' },
    review: {
      authentication: bundleReviewAuthentication,
      freshnessExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      reviewedAt: commitTime,
      reviewer: trustedReviewer(domainAuthority.authority),
      status: 'reproduced',
    },
    runs,
    scope: {
      proofs: assertions.map((assertion) => ({
        availableRunIds: [...assertion.requiredRuns],
        class: assertion.class,
        criterionId: assertion.criterionId,
        manualProcedureId: assertion.manualProcedureId,
        missingRunIds: [],
        requiredRunIds: [...assertion.requiredRuns],
        requiredSubjectIds: [...assertion.requiredSubjectIds],
        status: 'generated',
      })),
      requestedCriteria: [...new Set(assertions.map(({ criterionId }) => criterionId))],
    },
    source: {
      commit: candidateSha,
      lockfileChecksums: { 'package-lock.json': inputFixtureChecksums['package-lock.json'] },
      repository: 'https://github.com/kumwe/studio',
      tree: candidateTree,
      workingTreeState: 'clean',
    },
    subjects: [],
    workPackage: 'M2-01',
  };
  const manifestPath = `evidence/bundles/${bundleId}/manifest.json`;
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(join(evidenceRoot, manifestPath), manifestBytes);
  await writeSignedReview({
    authentication: bundleReviewAuthentication,
    evidenceRoot,
    issuedAt: commitTime,
    privateKeyPath: domainAuthority.privateKeyPath,
    reviewer: domainAuthority.authority,
    subject: {
      bundleId,
      candidateCommit: candidateSha,
      candidateTree,
      decision: 'reproduced',
      execution,
      freshnessExpiresAt: manifest.review.freshnessExpiresAt,
      intakeExecutions: [],
      kind: 'bundle-review',
      reviewedAt: commitTime,
      workPackage: 'M2-01',
    },
    subjectBytes: manifestBytes,
  });
  const domainGateAuthentication = reviewAuthenticationPaths(
    'evidence/gates/reviews/gate-a/domain.json',
  );
  const generalGateAuthentication = reviewAuthenticationPaths(
    'evidence/gates/reviews/gate-a/general.json',
  );
  const gate = {
    artifactHashes: Object.fromEntries([
      [manifestPath, await checksumFile(join(evidenceRoot, manifestPath))],
      ...artifacts.map((artifact) => [artifact.path, artifact.checksum]),
      [
        bundleReviewAuthentication.attestationPath,
        await checksumFile(join(evidenceRoot, bundleReviewAuthentication.attestationPath)),
      ],
      [
        bundleReviewAuthentication.signaturePath,
        await checksumFile(join(evidenceRoot, bundleReviewAuthentication.signaturePath)),
      ],
    ]),
    compatibilityStatement: 'No compatibility claim is waived.',
    criteria: registry.gates.A.map(({ id }) => ({
      criterionId: id,
      evidenceBundleIds: [bundleId],
      outcome: 'met',
    })),
    decidedAt: commitTime,
    decision: 'pass',
    evidenceBundleIds: [bundleId],
    evidenceSchemaVersion: '0.1-draft',
    excludedProfiles: [...criterionIndex.allowedProfiles],
    gate: 'A',
    reviewers: [
      {
        authentication: domainGateAuthentication,
        ...trustedReviewer(domainAuthority.authority),
      },
      {
        authentication: generalGateAuthentication,
        ...trustedReviewer(generalAuthority.authority),
      },
    ],
    signOff: {
      accessibility: domainAuthority.authority.identity,
      compatibility: domainAuthority.authority.identity,
      dataIntegrity: domainAuthority.authority.identity,
      security: domainAuthority.authority.identity,
    },
    sourceCommit: candidateSha,
    supportedProfiles: [],
    unresolvedDefects: [],
  };
  const gatePath = join(evidenceRoot, 'evidence/gates/gate-a.json');
  await mkdir(join(gatePath, '..'), { recursive: true });
  const gateBytes = Buffer.from(`${JSON.stringify(gate, null, 2)}\n`);
  await writeFile(gatePath, gateBytes);
  for (const { authentication, authority, privateKeyPath } of [
    {
      authentication: domainGateAuthentication,
      authority: domainAuthority.authority,
      privateKeyPath: domainAuthority.privateKeyPath,
    },
    {
      authentication: generalGateAuthentication,
      authority: generalAuthority.authority,
      privateKeyPath: generalAuthority.privateKeyPath,
    },
  ]) {
    await writeSignedReview({
      authentication,
      evidenceRoot,
      issuedAt: commitTime,
      privateKeyPath,
      reviewer: authority,
      subject: {
        candidateCommit: candidateSha,
        decidedAt: commitTime,
        decision: 'pass',
        gate: 'A',
        kind: 'gate-review',
      },
      subjectBytes: gateBytes,
    });
  }

  return {
    options: {
      candidateRoot,
      candidateSha,
      evidenceRoot,
      executionRoot: candidateRoot,
      gate: 'A',
      packageVersions,
      reviewerAuthorityChecksum: reviewerAuthorityRegistryChecksum(reviewerAuthorityRegistryBytes),
    },
    bundleManifestPath: join(evidenceRoot, manifestPath),
    gatePath,
  };
}

function gitFixture(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function gateRecordBytes(record) {
  return Buffer.from(`${JSON.stringify(record, null, 2)}\n`);
}

async function createSigningAuthority(signingRoot, reviewer) {
  const privateKeyPath = join(signingRoot, reviewer.identity.replaceAll('/', '-'));
  execFileSync('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-f', privateKeyPath]);
  const [algorithm, key] = (await readFile(`${privateKeyPath}.pub`, 'utf8')).trim().split(/\s+/u);
  return {
    authority: {
      identity: reviewer.identity,
      independent: reviewer.independent,
      publicKeys: [`${algorithm} ${key}`],
      roles: reviewer.roles,
    },
    privateKeyPath,
  };
}

function reviewAuthenticationPaths(attestationPath) {
  return { attestationPath, signaturePath: `${attestationPath}.sig` };
}

function trustedReviewer(authority) {
  return {
    identity: authority.identity,
    independent: authority.independent,
    kind: 'human',
    roles: authority.roles,
  };
}

async function writeSignedReview({
  authentication,
  evidenceRoot,
  issuedAt,
  privateKeyPath,
  reviewer,
  subject,
  subjectBytes,
}) {
  const attestation = {
    contractVersion: '0.1-draft',
    issuedAt,
    kind: 'signed-review-attestation',
    reviewer: {
      identity: reviewer.identity,
      independent: reviewer.independent,
      roles: reviewer.roles,
    },
    subject: {
      ...subject,
      subjectChecksum: reviewerAuthorityRegistryChecksum(subjectBytes),
    },
  };
  const attestationPath = join(evidenceRoot, authentication.attestationPath);
  await mkdir(join(attestationPath, '..'), { recursive: true });
  await writeFile(attestationPath, `${JSON.stringify(attestation, null, 2)}\n`, { mode: 0o644 });
  execFileSync(
    'ssh-keygen',
    ['-Y', 'sign', '-f', privateKeyPath, '-n', REVIEW_SIGNATURE_NAMESPACE, attestationPath],
    { stdio: 'ignore' },
  );
}

async function createGateBundle(fixture, reviewStatus) {
  const supportedProfiles = registry.profileVocabulary.filter(
    (profile) => profile !== 'studio.profile/authoring-web',
  );
  const bundle = structuredClone(fixture.manifest);
  bundle.profiles = supportedProfiles;
  bundle.review =
    reviewStatus === 'pending'
      ? { status: 'pending' }
      : {
          freshnessExpiresAt: '2026-09-24T10:00:00Z',
          reviewedAt: '2026-08-24T10:00:00Z',
          reviewer: { identity: 'human/bundle-reviewer', kind: 'human' },
          status: 'reproduced',
        };
  const manifestPath = join(fixture.root, 'evidence/bundles/bundle-one/manifest.json');
  await mkdir(join(manifestPath, '..'), { recursive: true });
  await writeFile(manifestPath, `${JSON.stringify(bundle, null, 2)}\n`);
  return bundle;
}

async function createPassingGate(fixture, bundle) {
  const supportedProfiles = registry.profileVocabulary.filter(
    (profile) => profile !== 'studio.profile/authoring-web',
  );
  const manifestPath = 'evidence/bundles/bundle-one/manifest.json';
  return {
    artifactHashes: Object.fromEntries([
      [manifestPath, await checksumFile(join(fixture.root, manifestPath))],
      ...bundle.artifacts.map((artifact) => [artifact.path, artifact.checksum]),
    ]),
    compatibilityStatement: 'No compatibility claim is waived.',
    criteria: registry.gates.A.map((criterion) => ({
      criterionId: criterion.id,
      evidenceBundleIds: ['bundle-one'],
      outcome: 'met',
    })),
    decidedAt: '2026-08-24T11:00:00Z',
    decision: 'pass',
    evidenceSchemaVersion: '0.1-draft',
    evidenceBundleIds: ['bundle-one'],
    excludedProfiles: ['studio.profile/authoring-web'],
    gate: 'A',
    reviewers: [
      {
        identity: 'human/domain-reviewer',
        independent: true,
        kind: 'human',
        roles: ['accessibility', 'compatibility', 'data-integrity', 'security'],
      },
      {
        identity: 'human/general-reviewer',
        independent: false,
        kind: 'human',
        roles: ['general'],
      },
    ],
    signOff: {
      accessibility: 'human/domain-reviewer',
      compatibility: 'human/domain-reviewer',
      dataIntegrity: 'human/domain-reviewer',
      security: 'human/domain-reviewer',
    },
    sourceCommit: SOURCE_COMMIT,
    supportedProfiles,
    unresolvedDefects: [],
  };
}

function assertNoInputExpressionInRunBlocks(workflowName, workflow) {
  const lines = workflow.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^(\s*)run:\s*(.*)$/u.exec(lines[index]);
    if (match === null) {
      continue;
    }
    assert.doesNotMatch(match[2], /\$\{\{\s*inputs\./u, workflowName);
    const indentation = match[1].length;
    for (index += 1; index < lines.length; index += 1) {
      const line = lines[index];
      if (line.trim().length > 0 && line.search(/\S/u) <= indentation) {
        index -= 1;
        break;
      }
      assert.doesNotMatch(line, /\$\{\{\s*inputs\./u, workflowName);
    }
  }
}
