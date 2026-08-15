import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { basename } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';

const rootSchemaDirectory = new URL('../schemas/', import.meta.url);
const packageSchemaDirectory = new URL('../packages/protocol/schemas/', import.meta.url);
const rootExampleDirectory = new URL('../schemas/examples/', import.meta.url);
const packageFixtureDirectory = new URL('../packages/testkit/fixtures/', import.meta.url);
const rootVectorDirectory = new URL('../schemas/vectors/command/', import.meta.url);
const packageVectorDirectory = new URL('../packages/testkit/vectors/command/', import.meta.url);
const rootInvalidDirectory = new URL('../schemas/invalid/', import.meta.url);
const packageInvalidDirectory = new URL('../packages/testkit/invalid/', import.meta.url);

const schemaFiles = (await readdir(rootSchemaDirectory))
  .filter((name) => name.endsWith('.schema.json'))
  .sort();
const packageSchemaFiles = (await readdir(packageSchemaDirectory))
  .filter((name) => name.endsWith('.schema.json'))
  .sort();

assertSameNames('protocol schema copies', schemaFiles, packageSchemaFiles);
await assertCopies(rootSchemaDirectory, packageSchemaDirectory, schemaFiles);

const exampleFiles = (await readdir(rootExampleDirectory))
  .filter((name) => name.endsWith('.json'))
  .sort();
const fixtureFiles = (await readdir(packageFixtureDirectory))
  .filter((name) => name.endsWith('.json'))
  .sort();

assertSameNames('testkit fixture copies', exampleFiles, fixtureFiles);
await assertCopies(rootExampleDirectory, packageFixtureDirectory, exampleFiles);

const vectorFiles = (await readdir(rootVectorDirectory))
  .filter((name) => name.endsWith('.json'))
  .sort();
const packageVectorFiles = (await readdir(packageVectorDirectory))
  .filter((name) => name.endsWith('.json'))
  .sort();

assertSameNames('testkit command-vector copies', vectorFiles, packageVectorFiles);
await assertCopies(rootVectorDirectory, packageVectorDirectory, vectorFiles);

const invalidFiles = (await readdir(rootInvalidDirectory))
  .filter((name) => name.endsWith('.json'))
  .sort();
const packageInvalidFiles = (await readdir(packageInvalidDirectory))
  .filter((name) => name.endsWith('.json'))
  .sort();

assertSameNames('testkit negative-fixture copies', invalidFiles, packageInvalidFiles);
await assertCopies(rootInvalidDirectory, packageInvalidDirectory, invalidFiles);

const schemas = await Promise.all(
  schemaFiles.map(async (name) =>
    JSON.parse(await readFile(new URL(name, rootSchemaDirectory), 'utf8')),
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

const schemaByExample = new Map([
  ['block.grid.example.json', 'block-definition.schema.json'],
  ['block.price.example.json', 'block-definition.schema.json'],
  ['blueprint.product.example.json', 'blueprint.schema.json'],
  ['command.move-node.example.json', 'command.schema.json'],
  ['content-model.product.example.json', 'content-model.schema.json'],
  ['entry.product.example.json', 'entry.schema.json'],
  ['host-capabilities.example.json', 'host-capabilities.schema.json'],
  ['media-asset.example.json', 'media-asset.schema.json'],
  ['media-asset.processing.example.json', 'media-asset.schema.json'],
  ['media-reference.example.json', 'media-reference.schema.json'],
  ['plugin.example.json', 'plugin-manifest.schema.json'],
  ['preview.render.example.json', 'preview-message.schema.json'],
  ['studio-config.example.json', 'studio-config.schema.json'],
  ['theme.example.json', 'theme.schema.json'],
]);

for (const exampleFile of exampleFiles) {
  const schemaFile = schemaByExample.get(exampleFile);
  if (schemaFile === undefined) {
    throw new Error(`No schema mapping is declared for ${exampleFile}.`);
  }
  const schema = schemas.find(
    (candidate) => basename(new URL(candidate.$id).pathname) === schemaFile,
  );
  if (schema === undefined) {
    throw new Error(`Schema ${schemaFile} is unavailable for ${exampleFile}.`);
  }
  const example = JSON.parse(await readFile(new URL(exampleFile, rootExampleDirectory), 'utf8'));
  const validate = ajv.getSchema(schema.$id);
  if (validate === undefined || !validate(example)) {
    throw new Error(`${exampleFile} violates ${schemaFile}: ${ajv.errorsText(validate?.errors)}`);
  }
}

const validateCommandVector = getCanonicalValidator('command-vector.schema.json');
if (vectorFiles.length === 0) {
  throw new Error('The canonical command-vector corpus is empty.');
}
const vectorIdentifiers = new Set();
for (const vectorFile of vectorFiles) {
  const vector = JSON.parse(await readFile(new URL(vectorFile, rootVectorDirectory), 'utf8'));
  if (!validateCommandVector(vector)) {
    throw new Error(
      `${vectorFile} violates command-vector.schema.json: ${ajv.errorsText(validateCommandVector.errors)}`,
    );
  }
  if (vectorIdentifiers.has(vector.id)) {
    throw new Error(`Command vector identifier ${vector.id} is duplicated.`);
  }
  vectorIdentifiers.add(vector.id);
  if (vector.command.artifactId !== vector.initial.id) {
    throw new Error(`${vectorFile} command does not target its initial document.`);
  }
  if (vector.inverse !== undefined && vector.expect.document === undefined) {
    throw new Error(`${vectorFile} declares an inverse for a failing command.`);
  }
}

if (invalidFiles.length === 0) {
  throw new Error('The negative-fixture corpus is empty.');
}
for (const invalidFile of invalidFiles) {
  const fixture = JSON.parse(await readFile(new URL(invalidFile, rootInvalidDirectory), 'utf8'));
  if (
    typeof fixture.schema !== 'string' ||
    typeof fixture.description !== 'string' ||
    fixture.description.length === 0 ||
    fixture.value === undefined
  ) {
    throw new Error(`${invalidFile} must declare schema, description, and value members.`);
  }
  const validate = getCanonicalValidator(fixture.schema);
  if (validate(fixture.value)) {
    throw new Error(`${invalidFile} must be rejected by ${fixture.schema}: ${fixture.description}`);
  }
}

const common = schemas.find(
  (schema) => basename(new URL(schema.$id).pathname) === 'common.schema.json',
);
if (common?.$defs?.contractVersion?.const !== '0.1-draft') {
  throw new Error('Canonical contractVersion must remain explicitly draft before Gate A.');
}

if (common === undefined) {
  throw new Error('The common schema is unavailable.');
}

const validateJsonValue = ajv.compile({ $ref: `${common.$id}#/$defs/jsonValue` });
for (const unsafeName of ['__proto__', 'prototype', 'constructor']) {
  assertRejected(
    `jsonValue member ${unsafeName}`,
    validateJsonValue,
    JSON.parse(`{"${unsafeName}":{"polluted":true}}`),
  );
  assertRejected(`nested jsonValue member ${unsafeName}`, validateJsonValue, {
    safe: JSON.parse(`{"${unsafeName}":true}`),
  });
}
assertRejected('overlong jsonValue member', validateJsonValue, { ['x'.repeat(201)]: true });
assertRejected('control-character jsonValue member', validateJsonValue, {
  'line\nbreak': true,
});

const validateSemanticVersion = ajv.compile({
  $ref: `${common.$id}#/$defs/semanticVersion`,
});
for (const value of [
  '0.0.0',
  '1.2.3',
  '1.0.0-alpha',
  '1.0.0-alpha.1',
  '1.0.0-0.3.7',
  '1.0.0-x.7.z.92',
  '1.0.0-x-y-z.--',
  '1.0.0+20130313144700',
  '1.0.0-beta+exp.sha.5114f85',
  '0.1.0-draft.1',
]) {
  assertAccepted(`semantic version ${value}`, validateSemanticVersion, value);
}
for (const value of [
  '01.0.0',
  '1.01.0',
  '1.0.01',
  '1.0.0-01',
  '1.0.0-alpha.01',
  '1.0',
  'v1.0.0',
  '1.0.0-',
  '1.0.0+',
  '1.0.0-alpha..1',
  '1.0.0+meta..x',
  '1.0.0-alpha_1',
  '1.0.0\n',
]) {
  assertRejected(`semantic version ${value}`, validateSemanticVersion, value);
}

const validateIntegrity = ajv.compile({ $ref: `${common.$id}#/$defs/integrity` });
for (const algorithm of ['sha256', 'sha384', 'sha512']) {
  const value = `${algorithm}-${createHash(algorithm).update(`studio-${algorithm}`).digest('base64')}`;
  assertAccepted(`${algorithm} integrity`, validateIntegrity, value);
}
assertAccepted(
  'documented sha256 integrity',
  validateIntegrity,
  'sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=',
);
for (const value of [
  'sha256-YWJj',
  `sha256-${'A'.repeat(42)}B=`,
  `sha256-${'A'.repeat(43)}`,
  `sha384-${'A'.repeat(63)}=`,
  `sha512-${'A'.repeat(85)}B==`,
  `sha512-${'A'.repeat(86)}=`,
  `sha256-${'A'.repeat(42)}_=`,
  `sha1-${'A'.repeat(27)}=`,
  `sha256-${'A'.repeat(42)}A=\n`,
]) {
  assertRejected(`integrity ${JSON.stringify(value)}`, validateIntegrity, value);
}

const commandExample = JSON.parse(
  await readFile(new URL('command.move-node.example.json', rootExampleDirectory), 'utf8'),
);
const validateCommand = getCanonicalValidator('command.schema.json');
assertRejected('generic command unsafe payload', validateCommand, {
  ...commandExample,
  type: 'org.example.command/custom',
  payload: JSON.parse('{"constructor":{"prototype":{"polluted":true}}}'),
});

const previewExample = JSON.parse(
  await readFile(new URL('preview.render.example.json', rootExampleDirectory), 'utf8'),
);
const validatePreview = getCanonicalValidator('preview-message.schema.json');
assertRejected('generic preview unsafe payload', validatePreview, {
  ...previewExample,
  type: 'org.example.preview/custom',
  payload: JSON.parse('{"__proto__":{"polluted":true}}'),
});

const blockExample = JSON.parse(
  await readFile(new URL('block.grid.example.json', rootExampleDirectory), 'utf8'),
);
const validateBlock = getCanonicalValidator('block-definition.schema.json');
assertRejected('block property schema unsafe member', validateBlock, {
  ...blockExample,
  propertySchema: JSON.parse('{"prototype":{}}'),
});
assertRejected('block symbol with arbitrary text', validateBlock, {
  ...blockExample,
  icon: { kind: 'symbol', value: '<svg onload=alert(1)>' },
});
assertRejected('block icon asset path traversal', validateBlock, {
  ...blockExample,
  icon: {
    integrity: 'sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=',
    kind: 'asset',
    path: '../icons/grid.svg',
  },
});
assertRejected('block icon asset URL', validateBlock, {
  ...blockExample,
  icon: {
    integrity: 'sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=',
    kind: 'asset',
    path: 'https://untrusted.example/icon.svg',
  },
});
assertRejected('slot acceptance using an undeclared capability producer', validateBlock, {
  ...blockExample,
  slots: blockExample.slots.map((slot, index) =>
    index === 0 ? { ...slot, accepts: { capabilities: ['studio.capability/grid-item'] } } : slot,
  ),
});

const pluginExample = JSON.parse(
  await readFile(new URL('plugin.example.json', rootExampleDirectory), 'utf8'),
);
assertRejected(
  'ambiguous plugin Studio version range',
  getCanonicalValidator('plugin-manifest.schema.json'),
  {
    ...pluginExample,
    studioVersions: '^0.1.0',
  },
);

const mediaReferenceExample = JSON.parse(
  await readFile(new URL('media-reference.example.json', rootExampleDirectory), 'utf8'),
);
assertRejected(
  'media reference generic extension data',
  getCanonicalValidator('media-reference.schema.json'),
  {
    ...mediaReferenceExample,
    extensions: { 'org.example.presentation/unsafe': { url: 'https://untrusted.example' } },
  },
);

const studioConfigExample = JSON.parse(
  await readFile(new URL('studio-config.example.json', rootExampleDirectory), 'utf8'),
);
const validateStudioConfig = getCanonicalValidator('studio-config.schema.json');
assertRejected('zero history limit', validateStudioConfig, {
  ...studioConfigExample,
  limits: { ...studioConfigExample.limits, maxHistoryEntries: 0 },
});
assertRejected('semantic version on an entry reference', validateStudioConfig, {
  ...studioConfigExample,
  artifacts: {
    ...studioConfigExample.artifacts,
    entry: { ...studioConfigExample.artifacts.entry, version: '1.0.0' },
  },
});

const contentModelExample = JSON.parse(
  await readFile(new URL('content-model.product.example.json', rootExampleDirectory), 'utf8'),
);
const validateContentModel = getCanonicalValidator('content-model.schema.json');
assertAccepted('empty content model draft', validateContentModel, {
  ...contentModelExample,
  fields: [],
  relationships: [],
  status: 'draft',
});
assertRejected('empty published content model', validateContentModel, {
  ...contentModelExample,
  fields: [],
  relationships: [],
  status: 'published',
});

console.log(
  `${schemaFiles.length} schemas, ${exampleFiles.length} canonical fixtures, ` +
    `${vectorFiles.length} command vectors, and ${invalidFiles.length} negative fixtures verified.`,
);

function assertSameNames(label, expected, actual) {
  if (JSON.stringify(expected) !== JSON.stringify(actual)) {
    throw new Error(
      `${label} differ: expected ${expected.join(', ')}, received ${actual.join(', ')}`,
    );
  }
}

async function assertCopies(sourceDirectory, targetDirectory, names) {
  for (const name of names) {
    const source = await readFile(new URL(name, sourceDirectory));
    const target = await readFile(new URL(name, targetDirectory));
    if (!source.equals(target)) {
      throw new Error(`${name} is not a byte-identical generated copy.`);
    }
  }
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

function getCanonicalValidator(schemaFile) {
  const schema = schemas.find(
    (candidate) => basename(new URL(candidate.$id).pathname) === schemaFile,
  );
  const validate = schema === undefined ? undefined : ajv.getSchema(schema.$id);
  if (validate === undefined) {
    throw new Error(`Validator ${schemaFile} is unavailable.`);
  }
  return validate;
}

function assertAccepted(label, validate, value) {
  if (!validate(value)) {
    throw new Error(`${label} should be accepted: ${ajv.errorsText(validate.errors)}`);
  }
}

function assertRejected(label, validate, value) {
  if (validate(value)) {
    throw new Error(`${label} should be rejected.`);
  }
}
