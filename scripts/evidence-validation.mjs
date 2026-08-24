import { createHash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';

export const CANONICAL_REPOSITORY = 'https://github.com/kumwe/studio';

export const REQUIRED_EVIDENCE_INPUTS = Object.freeze([
  'evidence/gate-criteria.json',
  'package-lock.json',
  'packages/protocol/schemas/manifest.json',
  'packages/testkit/corpus-manifest.json',
  'studio-release.json',
]);

export const REQUIRED_EVIDENCE_LANES = Object.freeze([
  'quality/format',
  'quality/lint',
  'quality/typecheck',
  'build/workspace',
  'contract/package-boundaries',
  'contract/canonical-corpus',
  'contract/release-record',
  'release/package-tarballs',
  'evidence/authenticity',
  'security/secret-scan',
  'contract/requirement-registry',
  'security/threat-registry',
  'release/changeset',
  'unit/workspace',
  'accessibility/web',
]);

export const GENERIC_LANE_EVIDENCE_CLASSES = Object.freeze(
  new Set(['accessibility', 'contract', 'property-fuzz', 'release', 'security', 'unit']),
);

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

export async function collectBundleFailures(manifest, context) {
  const failures = [];
  const bundleId = manifest.bundleId;
  const bundlePrefix = `evidence/bundles/${bundleId}/artifacts/`;

  if (manifest.source.repository !== CANONICAL_REPOSITORY) {
    failures.push(`source.repository must be ${CANONICAL_REPOSITORY}`);
  }
  if (!(await context.isCommitReachable(manifest.source.commit))) {
    failures.push(
      `source.commit ${manifest.source.commit} is not the checked-out commit or a reachable ancestor`,
    );
  }
  if (manifest.source.workingTreeState !== 'clean') {
    failures.push('source.workingTreeState must be "clean"');
  }

  const sourceCommitTime = await context.getCommitTime(manifest.source.commit);
  if (!Number.isFinite(sourceCommitTime)) {
    failures.push(`source.commit ${manifest.source.commit} does not have a resolvable commit time`);
  }

  const lockfilePaths = Object.keys(manifest.source.lockfileChecksums).sort();
  if (!sameMembers(lockfilePaths, ['package-lock.json'])) {
    failures.push('source.lockfileChecksums must contain exactly package-lock.json');
  }
  await collectChecksumMapFailures(
    failures,
    'source.lockfileChecksums',
    manifest.source.lockfileChecksums,
    context.repositoryRoot,
  );

  for (const path of REQUIRED_EVIDENCE_INPUTS) {
    if (manifest.inputFixtureChecksums[path] === undefined) {
      failures.push(`inputFixtureChecksums is missing required source input ${path}`);
    }
  }
  await collectChecksumMapFailures(
    failures,
    'inputFixtureChecksums',
    manifest.inputFixtureChecksums,
    context.repositoryRoot,
  );
  if (
    manifest.source.lockfileChecksums['package-lock.json'] !==
    manifest.inputFixtureChecksums['package-lock.json']
  ) {
    failures.push('the package-lock.json source and input checksums must be identical');
  }

  const artifactPaths = [];
  const artifactChecksums = new Map();
  for (const artifact of manifest.artifacts) {
    if (artifactChecksums.has(artifact.path)) {
      failures.push(`artifact ${artifact.path} is duplicated`);
      continue;
    }
    artifactPaths.push(artifact.path);
    artifactChecksums.set(artifact.path, artifact.checksum);
    if (!artifact.path.startsWith(bundlePrefix)) {
      failures.push(`artifact ${artifact.path} is outside ${bundlePrefix}`);
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
    const key = `${criterion.criterionId}\u0000${criterion.class}`;
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
  for (const [name, version] of Object.entries(context.packageVersions)) {
    if (manifest.environment.packageVersions?.[name] !== version) {
      failures.push(`environment.packageVersions must record ${name}@${version}`);
    }
  }
  if (manifest.environment.browser === undefined) {
    failures.push('environment.browser is required because the accessibility lane is mandatory');
  }

  const runIds = new Set();
  let latestRunTime = Number.NEGATIVE_INFINITY;
  for (const run of manifest.runs) {
    if (runIds.has(run.testId)) {
      failures.push(`run testId ${run.testId} is duplicated`);
    }
    runIds.add(run.testId);
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
  }
  for (const requiredLane of REQUIRED_EVIDENCE_LANES) {
    if (!runIds.has(requiredLane)) {
      failures.push(`runs is missing mandatory lane ${requiredLane}`);
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
    if (manifest.runs.some((run) => run.runner === review.reviewer?.identity)) {
      failures.push('the reviewer must be independent of every recorded runner identity');
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

  return failures;
}

export async function collectGateRecordFailures(record, fileName, context) {
  const failures = [];
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
      for (const evidence of bundle.criteria) {
        if (evidence.criterionId === criterion.criterionId) {
          coveredClasses.add(evidence.class);
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
