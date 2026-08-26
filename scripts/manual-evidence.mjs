import { createHash } from 'node:crypto';

import { evidenceLane } from './evidence-lanes.mjs';
import { collectSignedReviewFailures } from './review-authentication.mjs';

export function buildManualProcedureIndex(registry, criteriaById) {
  const failures = [];
  const proceduresById = new Map();
  if (
    registry?.contractVersion !== '0.1-draft' ||
    registry?.kind !== 'manual-procedure-registry' ||
    !Array.isArray(registry?.procedures) ||
    Object.keys(registry ?? {})
      .sort()
      .join('\n') !== 'contractVersion\nkind\nprocedures'
  ) {
    return {
      failures: ['manual procedure registry has an invalid closed shape'],
      proceduresById,
    };
  }
  for (const procedure of registry.procedures) {
    if (
      procedure === null ||
      typeof procedure !== 'object' ||
      Array.isArray(procedure) ||
      Object.keys(procedure).sort().join('\n') !==
        'allowSharedObservationArtifacts\nartifactRole\ncriterionId\nevidenceClass\nid\nlaneId\nobservationArtifactRoles\nrequiredReviewerRole\nrequiredSteps\nstatus'
    ) {
      failures.push('manual procedure entry has an invalid closed shape');
      continue;
    }
    if (proceduresById.has(procedure.id)) {
      failures.push(`manual procedure ${String(procedure.id)} is duplicated`);
      continue;
    }
    const criterion = criteriaById.get(procedure.criterionId);
    if (criterion === undefined || criterion.gate !== 'A') {
      failures.push(
        `manual procedure ${String(procedure.id)} references an unknown Gate A criterion`,
      );
    } else if (!criterion.evidenceClasses.includes(procedure.evidenceClass)) {
      failures.push(
        `manual procedure ${String(procedure.id)} uses an unregistered criterion evidence class`,
      );
    }
    const registeredLane = evidenceLane(procedure.laneId);
    if (registeredLane?.availability !== 'manual-input') {
      failures.push(`manual procedure ${String(procedure.id)} requires a manual-input lane`);
    }
    if (!registeredLane?.artifactRoles.includes(procedure.artifactRole)) {
      failures.push(
        `manual procedure ${String(procedure.id)} artifact role is not produced by its lane`,
      );
    }
    if (
      !Array.isArray(procedure.observationArtifactRoles) ||
      procedure.observationArtifactRoles.length === 0 ||
      new Set(procedure.observationArtifactRoles).size !==
        procedure.observationArtifactRoles.length ||
      procedure.observationArtifactRoles.some(
        (role) => !registeredLane?.artifactRoles.includes(role),
      )
    ) {
      failures.push(
        `manual procedure ${String(procedure.id)} has observation roles outside its verifier lane`,
      );
    }
    if (
      typeof procedure.allowSharedObservationArtifacts !== 'boolean' ||
      procedure.status !== 'input-required' ||
      !Array.isArray(procedure.requiredSteps) ||
      procedure.requiredSteps.length === 0 ||
      new Set(procedure.requiredSteps).size !== procedure.requiredSteps.length
    ) {
      failures.push(
        `manual procedure ${String(procedure.id)} has invalid required steps or status`,
      );
    }
    if (typeof procedure.id === 'string') {
      proceduresById.set(procedure.id, procedure);
    }
  }
  return { failures, proceduresById };
}

export function manualProcedureChecksum(procedure) {
  return `sha256-${createHash('sha256').update(JSON.stringify(procedure)).digest('base64')}`;
}

export async function collectManualRecordFailures(record, context) {
  const failures = [];
  if (context.validateSchema !== undefined && !context.validateSchema(record)) {
    failures.push('manual evidence record violates its closed schema');
    return failures;
  }
  const procedure = context.procedure;
  if (procedure === undefined) {
    return ['manual evidence record has no registered procedure'];
  }
  if (
    record.bundleId !== context.bundleId ||
    record.candidateCommit !== context.candidateCommit ||
    record.candidateTree !== context.candidateTree ||
    record.criterionId !== procedure.criterionId ||
    record.evidenceClass !== procedure.evidenceClass ||
    record.procedureId !== procedure.id ||
    record.workPackage !== context.workPackage ||
    !sameExecution(record.execution, context.execution)
  ) {
    failures.push('manual evidence record is not bound to its candidate, criterion, and procedure');
  }
  if (record.procedureChecksum !== manualProcedureChecksum(procedure)) {
    failures.push('manual evidence record does not bind the exact registered procedure');
  }
  const performedAt = Date.parse(record.performedAt);
  if (
    Number.isNaN(performedAt) ||
    performedAt < context.sourceCommitTime ||
    performedAt > context.now ||
    (Number.isFinite(context.verificationStartedAt) && performedAt > context.verificationStartedAt)
  ) {
    failures.push('manual evidence performedAt is outside the candidate and verifier run window');
  }
  if (record.reviewer?.kind !== 'human') {
    failures.push('manual evidence reviewer must be human');
  }
  if (record.reviewer?.independent !== true) {
    failures.push('manual evidence reviewer must hold trusted independent authority');
  }
  if (!record.reviewer?.roles?.includes(procedure.requiredReviewerRole)) {
    failures.push(`manual evidence reviewer lacks required ${procedure.requiredReviewerRole} role`);
  }
  if (context.runnerIdentities.has(record.reviewer?.identity)) {
    failures.push('manual evidence reviewer must be independent of every recorded runner');
  }
  const observations = Array.isArray(record.observations) ? record.observations : [];
  const observedStepIds = observations.map((observation) => observation.stepId);
  if (!sameMembers(observedStepIds, procedure.requiredSteps)) {
    failures.push(
      'manual evidence record must observe every registered procedure step exactly once',
    );
  }
  const usedObservationPaths = new Set();
  for (const observation of observations) {
    if (observation.outcome !== 'pass') {
      failures.push(`manual evidence step ${String(observation.stepId)} did not pass`);
    }
    if (!procedure.observationArtifactRoles.includes(observation.artifactRole)) {
      failures.push(
        `manual evidence step ${String(observation.stepId)} uses unregistered observation role ${String(observation.artifactRole)}`,
      );
    }
    if (!sameMembers(Object.keys(observation.artifactChecksums ?? {}), observation.artifactPaths)) {
      failures.push(
        `manual evidence step ${String(observation.stepId)} checksum keys must exactly match its artifact paths`,
      );
    }
    for (const path of observation.artifactPaths ?? []) {
      if (!procedure.allowSharedObservationArtifacts && usedObservationPaths.has(path)) {
        failures.push(
          `manual evidence artifact ${path} is reused across steps without explicit procedure permission`,
        );
      }
      usedObservationPaths.add(path);
      if (!context.artifactPaths.has(path)) {
        failures.push(
          `manual evidence step ${String(observation.stepId)} links unknown artifact ${path}`,
        );
      }
      const artifact = context.artifactsByPath?.get(path);
      if (
        artifact !== undefined &&
        (artifact.role !== observation.artifactRole || artifact.producerTestId !== procedure.laneId)
      ) {
        failures.push(
          `manual evidence step ${String(observation.stepId)} artifact ${path} does not match its exact verifier producer and role`,
        );
      }
      if (artifact !== undefined && observation.artifactChecksums?.[path] !== artifact.checksum) {
        failures.push(
          `manual evidence step ${String(observation.stepId)} does not bind artifact ${path} to its retained checksum`,
        );
      }
    }
  }
  if (record.outcome !== 'accepted') {
    failures.push('manual evidence record does not carry an accepted outcome');
  }
  const authenticationArtifacts = [
    [record.authentication?.attestationPath, 'review/attestation-v1'],
    [record.authentication?.signaturePath, 'review/signature-v1'],
  ];
  for (const [path, role] of authenticationArtifacts) {
    const artifact = context.artifactsByPath?.get(path);
    if (
      artifact === undefined ||
      artifact.role !== role ||
      artifact.producerTestId !== procedure.laneId
    ) {
      failures.push(
        `manual review authentication ${String(path)} must be a ${role} artifact from ${procedure.laneId}`,
      );
    }
  }
  failures.push(
    ...(await collectSignedReviewFailures({
      authentication: record.authentication,
      context,
      expectedIssuedAt: record.performedAt,
      expectedReviewer: {
        identity: record.reviewer?.identity,
        independent: record.reviewer?.independent,
        roles: record.reviewer?.roles,
      },
      expectedSubject: {
        bundleId: record.bundleId,
        candidateCommit: record.candidateCommit,
        candidateTree: record.candidateTree,
        criterionId: record.criterionId,
        decision: record.outcome,
        evidenceClass: record.evidenceClass,
        execution: record.execution,
        kind: 'manual-review',
        laneId: procedure.laneId,
        procedureChecksum: record.procedureChecksum,
        procedureId: record.procedureId,
        runStartedAt: context.runStartedAt,
        workPackage: record.workPackage,
      },
      requiredRole: procedure.requiredReviewerRole,
      subjectBytes: context.subjectBytes,
    })),
  );
  return failures;
}

function sameExecution(left, right) {
  return (
    left?.attempt === right?.attempt &&
    left?.id === right?.id &&
    left?.runId === right?.runId &&
    left?.runner === right?.runner
  );
}

function sameMembers(left, right) {
  if (left.length !== right.length || new Set(left).size !== left.length) return false;
  const expected = new Set(right);
  return expected.size === right.length && left.every((item) => expected.has(item));
}
