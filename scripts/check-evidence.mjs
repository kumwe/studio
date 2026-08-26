import { execFileSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import {
  buildCriterionIndex,
  buildEnvironmentAssertionIndex,
  buildProofAssertionIndex,
  buildProfileAssertionIndex,
  checksumIntegrity,
  collectGateRecordFailures,
  EVIDENCE_ARTIFACT_ROLES,
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
import { buildProducerContractIndex } from './producer-evidence.mjs';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const schemaDirectory = new URL('../evidence/schema/', import.meta.url);
const bundleDirectory = new URL('../evidence/bundles/', import.meta.url);
const gateDirectory = new URL('../evidence/gates/', import.meta.url);

const schemaFiles = [
  'cyclonedx-sbom-v1.schema.json',
  'environment-assertions.schema.json',
  'environment-matrix.schema.json',
  'external-attestation.schema.json',
  'external-report.schema.json',
  'external-subject-assertions.schema.json',
  'external-subject.schema.json',
  'evidence-bundle.schema.json',
  'evidence-intake-v1.schema.json',
  'gate-criteria.schema.json',
  'gate-record.schema.json',
  'manual-procedures.schema.json',
  'manual-record.schema.json',
  'proof-assertions.schema.json',
  'producer-contracts.schema.json',
  'producer-output-v1.schema.json',
  'review-attestation.schema.json',
  'reviewer-authorities.schema.json',
];
const schemas = await Promise.all(
  schemaFiles.map(async (name) =>
    JSON.parse(await readFile(new URL(name, schemaDirectory), 'utf8')),
  ),
);
for (const [index, schema] of schemas.entries()) {
  assertOpenObjectsConstrainMemberNames(schemaFiles[index], schema);
}
const ajv = new Ajv2020({ allErrors: true, strict: true });
for (const schema of schemas) {
  if (!ajv.validateSchema(schema)) {
    throw new Error(`Invalid schema ${schema.$id}: ${ajv.errorsText(ajv.errors)}`);
  }
  ajv.addSchema(schema);
}
for (const schemaFile of ['evidence-bundle.schema.json', 'proof-assertions.schema.json']) {
  const roleVocabulary = schemas.find((schema) => schema.$id.endsWith(`/${schemaFile}`))?.$defs
    ?.artifactRole?.enum;
  if (
    !Array.isArray(roleVocabulary) ||
    JSON.stringify([...roleVocabulary].sort()) !==
      JSON.stringify([...EVIDENCE_ARTIFACT_ROLES].sort())
  ) {
    throw new Error(`${schemaFile} artifact roles drifted from scripts/evidence-lanes.mjs.`);
  }
}
const validateBundle = getValidator('evidence-bundle.schema.json');
const validateEnvironmentAssertions = getValidator('environment-assertions.schema.json');
const validateGateCriteria = getValidator('gate-criteria.schema.json');
const validateGateRecord = getValidator('gate-record.schema.json');
const validateEnvironmentMatrix = getValidator('environment-matrix.schema.json');
const validateExternalAttestation = getValidator('external-attestation.schema.json');
const validateExternalReport = getValidator('external-report.schema.json');
const validateExternalSubjectAssertions = getValidator('external-subject-assertions.schema.json');
const validateExternalSubject = getValidator('external-subject.schema.json');
const validateManualProcedures = getValidator('manual-procedures.schema.json');
const validateManualRecord = getValidator('manual-record.schema.json');
const validateProofAssertions = getValidator('proof-assertions.schema.json');
const validateProducerContracts = getValidator('producer-contracts.schema.json');
const validateReviewAttestation = getValidator('review-attestation.schema.json');
const validateReviewerAuthorities = getValidator('reviewer-authorities.schema.json');

const environmentMatrix = JSON.parse(
  await readFile(new URL('../evidence/environment-matrix.json', import.meta.url), 'utf8'),
);
if (!validateEnvironmentMatrix(environmentMatrix)) {
  throw new Error(
    `The environment matrix violates its schema: ${ajv.errorsText(validateEnvironmentMatrix.errors)}`,
  );
}
const environmentIds = new Set();
for (const environment of environmentMatrix.environments) {
  if (environmentIds.has(environment.id)) {
    throw new Error(`Environment matrix entry ${environment.id} is duplicated.`);
  }
  environmentIds.add(environment.id);
  if (environment.status === 'qualified' && environment.coveredBy.length === 0) {
    throw new Error(
      `Environment ${environment.id} claims qualified status without any covering evidence lane.`,
    );
  }
}
const environmentAssertionRegistry = JSON.parse(
  await readFile(new URL('../evidence/environment-assertions.json', import.meta.url), 'utf8'),
);
if (!validateEnvironmentAssertions(environmentAssertionRegistry)) {
  throw new Error(
    `The environment assertion registry violates its schema: ${ajv.errorsText(
      validateEnvironmentAssertions.errors,
    )}`,
  );
}
const environmentAssertionIndex = buildEnvironmentAssertionIndex(
  environmentAssertionRegistry,
  environmentMatrix,
);
if (environmentAssertionIndex.failures.length > 0) {
  throw new Error(
    `The environment assertion registry is invalid:\n- ${environmentAssertionIndex.failures.join('\n- ')}`,
  );
}

const registry = JSON.parse(
  await readFile(new URL('../evidence/gate-criteria.json', import.meta.url), 'utf8'),
);
if (!validateGateCriteria(registry)) {
  throw new Error(
    `The gate criterion registry violates its schema: ${ajv.errorsText(validateGateCriteria.errors)}`,
  );
}
const criterionIndex = buildCriterionIndex(registry);
if (criterionIndex.failures.length > 0) {
  throw new Error(
    `The gate criterion registry is invalid:\n- ${criterionIndex.failures.join('\n- ')}`,
  );
}
const profileAssertionRegistry = JSON.parse(
  await readFile(new URL('../evidence/profile-assertions.json', import.meta.url), 'utf8'),
);
const profileAssertionIndex = buildProfileAssertionIndex(
  profileAssertionRegistry,
  criterionIndex.allowedProfiles,
);
if (profileAssertionIndex.failures.length > 0) {
  throw new Error(
    `The profile assertion registry is invalid:\n- ${profileAssertionIndex.failures.join('\n- ')}`,
  );
}
const manualProcedureRegistry = JSON.parse(
  await readFile(new URL('../evidence/manual-procedures.json', import.meta.url), 'utf8'),
);
if (!validateManualProcedures(manualProcedureRegistry)) {
  throw new Error(
    `The manual procedure registry violates its schema: ${ajv.errorsText(
      validateManualProcedures.errors,
    )}`,
  );
}
const manualProcedureIndex = buildManualProcedureIndex(
  manualProcedureRegistry,
  criterionIndex.criteriaById,
);
if (manualProcedureIndex.failures.length > 0) {
  throw new Error(
    `The manual procedure registry is invalid:\n- ${manualProcedureIndex.failures.join('\n- ')}`,
  );
}
const externalSubjectAssertionRegistry = JSON.parse(
  await readFile(new URL('../evidence/external-subject-assertions.json', import.meta.url), 'utf8'),
);
if (!validateExternalSubjectAssertions(externalSubjectAssertionRegistry)) {
  throw new Error(
    `The external subject assertion registry violates its schema: ${ajv.errorsText(
      validateExternalSubjectAssertions.errors,
    )}`,
  );
}
const externalSubjectAssertionIndex = buildExternalSubjectAssertionIndex(
  externalSubjectAssertionRegistry,
);
if (externalSubjectAssertionIndex.failures.length > 0) {
  throw new Error(
    `The external subject assertion registry is invalid:\n- ${externalSubjectAssertionIndex.failures.join('\n- ')}`,
  );
}
const proofAssertionRegistry = JSON.parse(
  await readFile(new URL('../evidence/proof-assertions.json', import.meta.url), 'utf8'),
);
if (!validateProofAssertions(proofAssertionRegistry)) {
  throw new Error(
    `The proof assertion registry violates its schema: ${ajv.errorsText(
      validateProofAssertions.errors,
    )}`,
  );
}
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
    `The proof assertion registry is invalid:\n- ${proofAssertionIndex.failures.join('\n- ')}`,
  );
}
const producerContractRegistry = JSON.parse(
  await readFile(new URL('../evidence/producer-contracts.json', import.meta.url), 'utf8'),
);
if (!validateProducerContracts(producerContractRegistry)) {
  throw new Error(
    `The producer contract registry violates its schema: ${ajv.errorsText(
      validateProducerContracts.errors,
    )}`,
  );
}
const producerSchemaIds = new Set([
  schemas.find((schema) => schema.$id.endsWith('/cyclonedx-sbom-v1.schema.json')).$id,
  schemas.find((schema) => schema.$id.endsWith('/producer-output-v1.schema.json')).$id,
]);
const producerContractIndex = buildProducerContractIndex(producerContractRegistry, {
  schemaIds: producerSchemaIds,
});
if (producerContractIndex.failures.length > 0) {
  throw new Error(
    `The producer contract registry is invalid:\n- ${producerContractIndex.failures.join('\n- ')}`,
  );
}
const reviewerAuthorityRegistryBytes = await readFile(
  new URL('../evidence/reviewer-authorities.json', import.meta.url),
);
const reviewerAuthorityChecksumBytes = await readFile(
  new URL('../evidence/reviewer-authorities.sha256', import.meta.url),
);
const reviewerAuthorityRegistry = JSON.parse(reviewerAuthorityRegistryBytes.toString('utf8'));
if (!validateReviewerAuthorities(reviewerAuthorityRegistry)) {
  throw new Error(
    `The reviewer authority registry violates its schema: ${ajv.errorsText(
      validateReviewerAuthorities.errors,
    )}`,
  );
}
const reviewerAuthorityIndex = buildReviewerAuthorityIndex(reviewerAuthorityRegistry);
if (reviewerAuthorityIndex.failures.length > 0) {
  throw new Error(
    `The reviewer authority registry is invalid:\n- ${reviewerAuthorityIndex.failures.join('\n- ')}`,
  );
}
assertReviewerAuthorityStructuralPin(
  reviewerAuthorityRegistryBytes,
  reviewerAuthorityChecksumBytes,
);
let reviewerAuthorityReleaseTrustVerified = false;
if (process.env.STUDIO_REVIEWER_AUTHORITY_SHA256 !== undefined) {
  assertReviewerAuthorityReleaseTrust(
    reviewerAuthorityRegistryBytes,
    reviewerAuthorityChecksumBytes,
    process.env.STUDIO_REVIEWER_AUTHORITY_SHA256,
  );
  reviewerAuthorityReleaseTrustVerified = true;
}
const roadmap = await readFile(new URL('../docs/roadmap/README.md', import.meta.url), 'utf8');
const roadmapCriterionIds = [...roadmap.matchAll(/\*\*`(gate-[ab]\/[^`]+)`\*\*/gu)].map(
  (match) => match[1],
);
const registryCriterionIds = [...registry.gates.A, ...registry.gates.B].map(
  (criterion) => criterion.id,
);
if (JSON.stringify(roadmapCriterionIds) !== JSON.stringify(registryCriterionIds)) {
  throw new Error(
    'The stable gate criterion identifiers in docs/roadmap/README.md drifted from ' +
      'evidence/gate-criteria.json.',
  );
}

const releaseRecord = JSON.parse(
  await readFile(new URL('../studio-release.json', import.meta.url), 'utf8'),
);
const checkedOutCommit = git(['rev-parse', 'HEAD']);
if (!/^[a-f0-9]{40}$/u.test(checkedOutCommit)) {
  throw new Error('The checked-out commit identity is unavailable; evidence cannot be verified.');
}

const validationContext = {
  ...criterionIndex,
  externalSubjectAssertions: externalSubjectAssertionIndex.subjectsById,
  getCommitTree,
  getCommitTime,
  getPackageVersionsForCommit,
  getProfileAssertionsForCommit,
  getProofContextForCommit,
  getSourceFileBytes,
  getSourceFileChecksum,
  isCommitReachable,
  manualProcedures: manualProcedureIndex.proceduresById,
  now: Date.now(),
  packageVersions: releaseRecord.packages,
  packageLock: JSON.parse(await readFile(new URL('../package-lock.json', import.meta.url), 'utf8')),
  profileAssertions: profileAssertionIndex.profilesById,
  proofAssertions: proofAssertionIndex.assertionsByKey,
  producerContractIndex,
  reviewerAuthorities: reviewerAuthorityIndex.authoritiesByIdentity,
  reviewerAuthorityStructuralPinVerified: true,
  reviewerAuthorityReleaseTrustVerified,
  repositoryRoot,
  validateExternalSubjectSchema: validateExternalSubject,
  validateExternalAttestationSchema: validateExternalAttestation,
  validateExternalReportSchema: validateExternalReport,
  validateManualRecordSchema: validateManualRecord,
  validateProducerSchema(schemaId, document) {
    const validate = producerSchemaIds.has(schemaId) ? ajv.getSchema(schemaId) : undefined;
    return validate !== undefined && validate(document);
  },
  validateReviewAttestationSchema: validateReviewAttestation,
};

const bundleNames = (await readdir(bundleDirectory, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

let sampleCount = 0;
const bundlesById = new Map();
const authenticatedProofsByBundleId = new Map();
for (const name of bundleNames) {
  let manifest;
  let manifestBytes;
  try {
    manifestBytes = await readFile(new URL(`${name}/manifest.json`, bundleDirectory));
    manifest = JSON.parse(manifestBytes.toString('utf8'));
  } catch (error) {
    throw new Error(`Bundle ${name} has no parseable manifest.json.`, { cause: error });
  }
  if (!validateBundle(manifest)) {
    throw new Error(
      `Bundle ${name} violates the manifest schema: ${ajv.errorsText(validateBundle.errors)}`,
    );
  }
  if (manifest.bundleId !== name) {
    throw new Error(
      `Bundle directory ${name} must be named after its bundleId ${manifest.bundleId}.`,
    );
  }
  const inspection = await inspectBundleEvidence(manifest, {
    ...validationContext,
    manifestBytes,
  });
  const failures = inspection.failures;
  if (name.startsWith('SAMPLE-')) {
    sampleCount += 1;
    if (failures.length === 0) {
      throw new Error(
        `Sample bundle ${name} passed strict authenticity checks; ` +
          'the validator must reject stale or missing evidence.',
      );
    }
  } else {
    if (failures.length > 0) {
      throw new Error(`Bundle ${name} failed authenticity checks:\n- ${failures.join('\n- ')}`);
    }
    bundlesById.set(name, manifest);
    authenticatedProofsByBundleId.set(name, inspection.authenticatedProofKeys);
  }
}
if (sampleCount === 0) {
  throw new Error(
    'At least one SAMPLE- bundle must exist to prove stale or missing evidence is rejected.',
  );
}

let gateFiles = [];
try {
  gateFiles = (await readdir(gateDirectory)).filter((name) => name.endsWith('.json')).sort();
} catch (error) {
  if (error?.code !== 'ENOENT') {
    throw error;
  }
}
const gatesSeen = new Set();
for (const name of gateFiles) {
  const recordBytes = await readFile(new URL(name, gateDirectory));
  const record = JSON.parse(recordBytes.toString('utf8'));
  if (!validateGateRecord(record)) {
    throw new Error(
      `Gate record ${name} violates the gate record schema: ${ajv.errorsText(validateGateRecord.errors)}`,
    );
  }
  if (gatesSeen.has(record.gate)) {
    throw new Error(`Gate ${record.gate} has more than one decision record.`);
  }
  gatesSeen.add(record.gate);
  const failures = await collectGateRecordFailures(record, name, {
    ...validationContext,
    authenticatedProofsByBundleId,
    bundlesById,
    recordBytes,
    registry,
  });
  if (failures.length > 0) {
    throw new Error(`Gate record ${name} failed authenticity checks:\n- ${failures.join('\n- ')}`);
  }
}

for (const gate of ['A', 'B']) {
  if (gatesSeen.has(gate) && reviewerAuthorityReleaseTrustVerified) {
    continue;
  }
  if (gatesSeen.has(gate)) {
    console.log(
      `Gate ${gate} has a structurally verified signed record but remains release-unassessed without the protected external reviewer-authority checksum.`,
    );
    continue;
  }
  const uncovered = registry.gates[gate].map((criterion) => criterion.id);
  console.log(
    `Gate ${gate} has no accepted gate record; structural coverage is absent ` +
      `(${uncovered.length} criteria): ${uncovered.join(', ')}. ` +
      'This validator does not replace the authoritative docs/roadmap/STATUS.md state.',
  );
}

console.log(
  `${schemaFiles.length} evidence schemas, ${environmentAssertionIndex.assertionsById.size} environment assertions, ` +
    `${proofAssertionIndex.assertionsByKey.size} Gate A/B proof assertions, ` +
    `${manualProcedureIndex.proceduresById.size} manual procedures, ` +
    `${externalSubjectAssertionIndex.subjectsById.size} external subject assertions, ` +
    `${producerContractIndex.contractsByRole.size} structured producer contracts, ` +
    `${registry.gates.A.length + registry.gates.B.length} ` +
    `registered gate criteria, ${bundleNames.length} bundle manifests ` +
    `(${sampleCount} sample bundles rejected as required), ${gateFiles.length} gate records, and ` +
    `${environmentMatrix.environments.length} environment-matrix entries structurally verified.`,
);
if (!reviewerAuthorityReleaseTrustVerified) {
  console.log(
    'Reviewer signatures were checked against the repository-pinned registry only; release authorization still requires the protected external checksum.',
  );
}

function git(args) {
  return execFileSync('git', args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
  }).trim();
}

function isCommitReachable(commit) {
  if (!/^[a-f0-9]{40}$/u.test(commit)) {
    return false;
  }
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', commit, checkedOutCommit], {
      cwd: repositoryRoot,
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

function getCommitTime(commit) {
  if (!isCommitReachable(commit)) {
    return Number.NaN;
  }
  try {
    return Date.parse(git(['show', '--no-patch', '--format=%cI', commit]));
  } catch {
    return Number.NaN;
  }
}

function getCommitTree(commit) {
  if (!isCommitReachable(commit)) return undefined;
  return git(['rev-parse', `${commit}^{tree}`]);
}

function getPackageVersionsForCommit(commit) {
  const record = JSON.parse(git(['show', `${commit}:studio-release.json`]));
  assertCoordinatedRelease(record);
  return record.packages;
}

function getProfileAssertionsForCommit(commit) {
  const sourceCriteria = JSON.parse(git(['show', `${commit}:evidence/gate-criteria.json`]));
  const sourceCriterionIndex = buildCriterionIndex(sourceCriteria);
  if (sourceCriterionIndex.failures.length > 0) {
    throw new Error(sourceCriterionIndex.failures.join('; '));
  }
  const source = JSON.parse(git(['show', `${commit}:evidence/profile-assertions.json`]));
  const index = buildProfileAssertionIndex(source, sourceCriterionIndex.allowedProfiles);
  if (index.failures.length > 0) {
    throw new Error(index.failures.join('; '));
  }
  return index.profilesById;
}

function getProofContextForCommit(commit) {
  const sourceCriteria = JSON.parse(git(['show', `${commit}:evidence/gate-criteria.json`]));
  const sourceCriterionIndex = buildCriterionIndex(sourceCriteria);
  if (sourceCriterionIndex.failures.length > 0) {
    throw new Error(sourceCriterionIndex.failures.join('; '));
  }
  const sourceProfiles = JSON.parse(git(['show', `${commit}:evidence/profile-assertions.json`]));
  const sourceProfileIndex = buildProfileAssertionIndex(
    sourceProfiles,
    sourceCriterionIndex.allowedProfiles,
  );
  if (sourceProfileIndex.failures.length > 0) {
    throw new Error(sourceProfileIndex.failures.join('; '));
  }
  const sourceManual = JSON.parse(git(['show', `${commit}:evidence/manual-procedures.json`]));
  const sourceManualIndex = buildManualProcedureIndex(
    sourceManual,
    sourceCriterionIndex.criteriaById,
  );
  if (sourceManualIndex.failures.length > 0) {
    throw new Error(sourceManualIndex.failures.join('; '));
  }
  const sourceExternal = JSON.parse(
    git(['show', `${commit}:evidence/external-subject-assertions.json`]),
  );
  const sourceExternalIndex = buildExternalSubjectAssertionIndex(sourceExternal);
  if (sourceExternalIndex.failures.length > 0) {
    throw new Error(sourceExternalIndex.failures.join('; '));
  }
  const sourceProof = JSON.parse(git(['show', `${commit}:evidence/proof-assertions.json`]));
  const sourceProofIndex = buildProofAssertionIndex(
    sourceProof,
    sourceCriterionIndex.criteriaById,
    {
      externalSubjects: sourceExternalIndex.subjectsById,
      manualProcedures: sourceManualIndex.proceduresById,
      profileAssertions: sourceProfileIndex.profilesById,
    },
  );
  if (sourceProofIndex.failures.length > 0) {
    throw new Error(sourceProofIndex.failures.join('; '));
  }
  return {
    externalSubjectAssertions: sourceExternalIndex.subjectsById,
    manualProcedures: sourceManualIndex.proceduresById,
    proofAssertions: sourceProofIndex.assertionsByKey,
  };
}

function getSourceFileChecksum(commit, path) {
  const entry = git(['ls-tree', commit, '--', path]);
  const match = /^(100(?:644|755)) blob [a-f0-9]{40}\t/u.exec(entry);
  if (match === null) {
    throw new Error('source path is absent or is not a regular tracked file');
  }
  return {
    checksum: checksumIntegrity(
      execFileSync('git', ['show', `${commit}:${path}`], { cwd: repositoryRoot }),
    ),
    mode: match[1],
  };
}

function getSourceFileBytes(commit, path) {
  const entry = git(['ls-tree', commit, '--', path]);
  if (!/^(100(?:644|755)) blob [a-f0-9]{40}\t/u.test(entry)) {
    throw new Error('source path is absent or is not a regular tracked file');
  }
  return execFileSync('git', ['show', `${commit}:${path}`], { cwd: repositoryRoot });
}

function getValidator(schemaFile) {
  const schema = schemas.find((candidate) => candidate.$id.endsWith(`/${schemaFile}`));
  const validate = schema === undefined ? undefined : ajv.getSchema(schema.$id);
  if (validate === undefined) {
    throw new Error(`Validator ${schemaFile} is unavailable.`);
  }
  return validate;
}

function assertOpenObjectsConstrainMemberNames(file, value, path = '#') {
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      assertOpenObjectsConstrainMemberNames(file, item, `${path}/${index}`);
    }
    return;
  }
  if (value === null || typeof value !== 'object') {
    return;
  }
  if (
    value.type === 'object' &&
    value.additionalProperties !== false &&
    value.propertyNames === undefined
  ) {
    throw new Error(`${file}${path} is an open object without a propertyNames constraint.`);
  }
  for (const [name, item] of Object.entries(value)) {
    assertOpenObjectsConstrainMemberNames(file, item, `${path}/${name}`);
  }
}
