import { readFile, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const schemaDirectory = new URL('../evidence/schema/', import.meta.url);
const bundleDirectory = new URL('../evidence/bundles/', import.meta.url);
const gateDirectory = new URL('../evidence/gates/', import.meta.url);

const schemaFiles = ['evidence-bundle.schema.json', 'gate-record.schema.json'];
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
const validateGateRecord = getValidator('gate-record.schema.json');

const checkedOutCommit = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: repositoryRoot,
  encoding: 'utf8',
}).trim();
const checkedOutCommitTime = Date.parse(
  execFileSync('git', ['show', '--no-patch', '--format=%cI', 'HEAD'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  }).trim(),
);
if (!/^[a-f0-9]{40}$/u.test(checkedOutCommit) || Number.isNaN(checkedOutCommitTime)) {
  throw new Error('The checked-out commit identity is unavailable; evidence cannot be verified.');
}

const bundleNames = (await readdir(bundleDirectory, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

let sampleCount = 0;
for (const name of bundleNames) {
  const manifest = JSON.parse(
    await readFile(new URL(`${name}/manifest.json`, bundleDirectory), 'utf8'),
  );
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
  const failures = await collectAuthenticityFailures(manifest);
  if (name.startsWith('SAMPLE-')) {
    sampleCount += 1;
    if (failures.length === 0) {
      throw new Error(
        `Sample bundle ${name} passed strict authenticity checks; ` +
          'the validator must reject stale or missing evidence.',
      );
    }
  } else if (failures.length > 0) {
    throw new Error(`Bundle ${name} failed authenticity checks:\n- ${failures.join('\n- ')}`);
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
if (gateFiles.length === 0) {
  console.log('No gate records exist; Gates A and B remain unassessed.');
}
for (const name of gateFiles) {
  const record = JSON.parse(await readFile(new URL(name, gateDirectory), 'utf8'));
  if (!validateGateRecord(record)) {
    throw new Error(
      `Gate record ${name} violates the gate record schema: ${ajv.errorsText(validateGateRecord.errors)}`,
    );
  }
}

console.log(
  `${schemaFiles.length} evidence schemas, ${bundleNames.length} bundle manifests ` +
    `(${sampleCount} sample bundles rejected as required), and ${gateFiles.length} gate records verified.`,
);

async function collectAuthenticityFailures(manifest) {
  const failures = [];
  if (manifest.source.commit !== checkedOutCommit) {
    failures.push(
      `source.commit ${manifest.source.commit} is not the checked-out commit ${checkedOutCommit}`,
    );
  }
  if (manifest.source.workingTreeState !== 'clean') {
    failures.push('source.workingTreeState must be "clean" for acceptable evidence');
  }
  for (const [member, checksums] of [
    ['inputFixtureChecksums', manifest.inputFixtureChecksums],
    ['artifactChecksums', manifest.artifactChecksums],
  ]) {
    for (const [path, expected] of Object.entries(checksums)) {
      const resolved = resolve(repositoryRoot, path);
      const relativePath = relative(repositoryRoot, resolved);
      if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
        failures.push(`${member} path ${path} escapes the repository`);
        continue;
      }
      let content;
      try {
        content = await readFile(resolved);
      } catch {
        failures.push(`${member} path ${path} does not exist in the repository`);
        continue;
      }
      const actual = `sha256-${createHash('sha256').update(content).digest('base64')}`;
      if (actual !== expected) {
        failures.push(
          `${member} path ${path} has checksum ${actual}, not the recorded ${expected}`,
        );
      }
    }
  }
  const freshnessExpiresAt = manifest.review?.freshnessExpiresAt;
  if (freshnessExpiresAt !== undefined) {
    const expiry = Date.parse(freshnessExpiresAt);
    if (Number.isNaN(expiry)) {
      failures.push(`review.freshnessExpiresAt ${freshnessExpiresAt} is not a parseable timestamp`);
    } else if (expiry < checkedOutCommitTime) {
      failures.push(
        `review.freshnessExpiresAt ${freshnessExpiresAt} precedes the checked-out commit time`,
      );
    }
  }
  return failures;
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
