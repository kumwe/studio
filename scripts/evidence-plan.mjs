import { evidenceLane } from './evidence-lanes.mjs';

export function planCriterionProofs(criterionIds, criteriaById, proofAssertions) {
  return planCriterionScope(criterionIds, criteriaById, proofAssertions).claims;
}

export function planCriterionScope(criterionIds, criteriaById, proofAssertions) {
  const claims = [];
  const proofs = [];
  for (const criterionId of criterionIds) {
    const criterion = criteriaById.get(criterionId);
    if (criterion === undefined) {
      throw new Error(`Criterion ${criterionId} is not in evidence/gate-criteria.json.`);
    }
    const assertions = criterion.evidenceClasses.map((evidenceClass) => ({
      assertion: proofAssertions.get(`${criterionId}\u0000${evidenceClass}`),
      evidenceClass,
    }));
    for (const { assertion, evidenceClass } of assertions) {
      if (assertion === undefined) {
        throw new Error(
          `Criterion ${criterionId}/${evidenceClass} has no registered proof assertion.`,
        );
      }
      const availableRunIds = assertion.requiredRuns.filter(
        (testId) => evidenceLane(testId)?.availability === 'executable',
      );
      const missingRunIds = assertion.requiredRuns.filter(
        (testId) => evidenceLane(testId)?.availability !== 'executable',
      );
      const generated =
        assertion.availability === 'executable' &&
        missingRunIds.length === 0 &&
        assertion.requiredSubjectIds.length === 0 &&
        assertion.manualProcedureId === null;
      proofs.push({
        availableRunIds,
        class: assertion.class,
        criterionId,
        manualProcedureId: assertion.manualProcedureId,
        missingRunIds,
        requiredRunIds: assertion.requiredRuns,
        requiredSubjectIds: assertion.requiredSubjectIds,
        status: generated ? 'generated' : assertion.availability,
      });
      if (generated) claims.push({ assertion, criterionId });
    }
  }
  const executableRunIds = [...new Set(proofs.flatMap(({ availableRunIds }) => availableRunIds))];
  if (executableRunIds.length === 0) {
    throw new Error('The requested criterion scope contains no executable producer lane.');
  }
  return { claims, executableRunIds, proofs };
}

export function completablePendingProofsForLane(
  scopeProofs,
  laneId,
  proofAssertions,
  runsById,
  subjectIds,
  claimedKeys,
) {
  return scopeProofs.flatMap((proof) => {
    const key = `${proof.criterionId}\u0000${proof.class}`;
    const assertion = proofAssertions.get(key);
    if (
      proof.status === 'generated' ||
      claimedKeys.has(key) ||
      assertion === undefined ||
      !assertion.requiredRuns.includes(laneId) ||
      assertion.requiredRuns.some((testId) => !runsById.has(testId)) ||
      assertion.requiredSubjectIds.some((subjectId) => !subjectIds.has(subjectId))
    ) {
      return [];
    }
    return [{ assertion, key, proof }];
  });
}
