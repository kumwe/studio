import { evidenceLane } from './evidence-lanes.mjs';

export function planCriterionProofs(criterionIds, criteriaById, proofAssertions) {
  const claims = [];
  for (const criterionId of criterionIds) {
    const criterion = criteriaById.get(criterionId);
    if (criterion === undefined) {
      throw new Error(`Criterion ${criterionId} is not in evidence/gate-criteria.json.`);
    }
    const assertions = criterion.evidenceClasses.map((evidenceClass) => ({
      assertion: proofAssertions.get(`${criterionId}\u0000${evidenceClass}`),
      evidenceClass,
    }));
    const unavailable = assertions.filter(
      ({ assertion }) => assertion === undefined || assertion.availability !== 'executable',
    );
    if (unavailable.length > 0) {
      const classes = unavailable.map(({ assertion, evidenceClass }) =>
        assertion === undefined
          ? `${evidenceClass}:unregistered`
          : `${evidenceClass}:${assertion.availability}`,
      );
      throw new Error(
        `Criterion ${criterionId} cannot be partially generated; unavailable proof classes: ${classes.join(', ')}.`,
      );
    }
    for (const { assertion } of assertions) {
      for (const testId of assertion.requiredRuns) {
        if (evidenceLane(testId)?.availability !== 'executable') {
          throw new Error(
            `Criterion ${criterionId}/${assertion.class} requires non-executable lane ${testId}.`,
          );
        }
      }
      if (assertion.requiredSubjectIds.length > 0 || assertion.manualProcedureId !== null) {
        throw new Error(
          `Criterion ${criterionId}/${assertion.class} requires retained input and cannot be auto-generated.`,
        );
      }
      claims.push({ assertion, criterionId });
    }
  }
  return claims;
}
