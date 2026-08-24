import { execFileSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import {
  buildCriterionIndex,
  collectBundleFailures,
  collectGateRecordFailures,
} from './evidence-validation.mjs';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const schemaDirectory = new URL('../evidence/schema/', import.meta.url);
const bundleDirectory = new URL('../evidence/bundles/', import.meta.url);
const gateDirectory = new URL('../evidence/gates/', import.meta.url);

const schemaFiles = [
  'environment-matrix.schema.json',
  'evidence-bundle.schema.json',
  'gate-criteria.schema.json',
  'gate-record.schema.json',
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
const validateBundle = getValidator('evidence-bundle.schema.json');
const validateGateCriteria = getValidator('gate-criteria.schema.json');
const validateGateRecord = getValidator('gate-record.schema.json');
const validateEnvironmentMatrix = getValidator('environment-matrix.schema.json');

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
  getCommitTime,
  isCommitReachable,
  now: Date.now(),
  packageVersions: releaseRecord.packages,
  repositoryRoot,
};

const bundleNames = (await readdir(bundleDirectory, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

let sampleCount = 0;
const bundlesById = new Map();
for (const name of bundleNames) {
  let manifest;
  try {
    manifest = JSON.parse(
      await readFile(new URL(`${name}/manifest.json`, bundleDirectory), 'utf8'),
    );
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
  const failures = await collectBundleFailures(manifest, validationContext);
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
  const record = JSON.parse(await readFile(new URL(name, gateDirectory), 'utf8'));
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
    bundlesById,
    registry,
  });
  if (failures.length > 0) {
    throw new Error(`Gate record ${name} failed authenticity checks:\n- ${failures.join('\n- ')}`);
  }
}

for (const gate of ['A', 'B']) {
  if (gatesSeen.has(gate)) {
    continue;
  }
  const uncovered = registry.gates[gate].map((criterion) => criterion.id);
  console.log(
    `Gate ${gate} remains unassessed; uncovered criteria (${uncovered.length}): ${uncovered.join(', ')}`,
  );
}

console.log(
  `${schemaFiles.length} evidence schemas, ${registry.gates.A.length + registry.gates.B.length} ` +
    `registered gate criteria, ${bundleNames.length} bundle manifests ` +
    `(${sampleCount} sample bundles rejected as required), ${gateFiles.length} gate records, and ` +
    `${environmentMatrix.environments.length} environment-matrix entries verified.`,
);

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
