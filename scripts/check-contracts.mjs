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
const rootMediaVectorDirectory = new URL('../schemas/vectors/media/', import.meta.url);
const packageMediaVectorDirectory = new URL('../packages/testkit/vectors/media/', import.meta.url);
const rootCanonicalVectorDirectory = new URL('../schemas/vectors/canonical/', import.meta.url);
const packageCanonicalVectorDirectory = new URL(
  '../packages/testkit/vectors/canonical/',
  import.meta.url,
);
const rootHostVectorDirectory = new URL('../schemas/vectors/host/', import.meta.url);
const packageHostVectorDirectory = new URL('../packages/testkit/vectors/host/', import.meta.url);
const rootInvalidDirectory = new URL('../schemas/invalid/', import.meta.url);
const packageInvalidDirectory = new URL('../packages/testkit/invalid/', import.meta.url);
const rootConformanceDirectory = new URL('../schemas/conformance/rich-text/', import.meta.url);
const packageConformanceDirectory = new URL(
  '../packages/testkit/conformance/rich-text/',
  import.meta.url,
);

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

const mediaVectorFiles = (await readdir(rootMediaVectorDirectory))
  .filter((name) => name.endsWith('.json'))
  .sort();
const packageMediaVectorFiles = (await readdir(packageMediaVectorDirectory))
  .filter((name) => name.endsWith('.json'))
  .sort();

assertSameNames('testkit media-vector copies', mediaVectorFiles, packageMediaVectorFiles);
await assertCopies(rootMediaVectorDirectory, packageMediaVectorDirectory, mediaVectorFiles);

const hostVectorFiles = (await readdir(rootHostVectorDirectory))
  .filter((name) => name.endsWith('.json'))
  .sort();
const packageHostVectorFiles = (await readdir(packageHostVectorDirectory))
  .filter((name) => name.endsWith('.json'))
  .sort();

assertSameNames('testkit host-vector copies', hostVectorFiles, packageHostVectorFiles);
await assertCopies(rootHostVectorDirectory, packageHostVectorDirectory, hostVectorFiles);

const canonicalVectorFiles = (await readdir(rootCanonicalVectorDirectory))
  .filter((name) => name.endsWith('.json'))
  .sort();
const packageCanonicalVectorFiles = (await readdir(packageCanonicalVectorDirectory))
  .filter((name) => name.endsWith('.json'))
  .sort();

assertSameNames(
  'testkit canonical-vector copies',
  canonicalVectorFiles,
  packageCanonicalVectorFiles,
);
await assertCopies(
  rootCanonicalVectorDirectory,
  packageCanonicalVectorDirectory,
  canonicalVectorFiles,
);

const invalidFiles = (await readdir(rootInvalidDirectory))
  .filter((name) => name.endsWith('.json'))
  .sort();
const packageInvalidFiles = (await readdir(packageInvalidDirectory))
  .filter((name) => name.endsWith('.json'))
  .sort();

assertSameNames('testkit negative-fixture copies', invalidFiles, packageInvalidFiles);
await assertCopies(rootInvalidDirectory, packageInvalidDirectory, invalidFiles);

const conformanceFiles = (await readdir(rootConformanceDirectory))
  .filter((name) => name.endsWith('.json'))
  .sort();
const packageConformanceFiles = (await readdir(packageConformanceDirectory))
  .filter((name) => name.endsWith('.json'))
  .sort();

assertSameNames('testkit renderer-conformance copies', conformanceFiles, packageConformanceFiles);
await assertCopies(rootConformanceDirectory, packageConformanceDirectory, conformanceFiles);

const manifest = JSON.parse(
  await readFile(new URL('manifest.json', packageSchemaDirectory), 'utf8'),
);
if (
  manifest.kind !== 'schema-manifest' ||
  manifest.epoch !== 'https://schemas.kumwe.org/studio/v1/' ||
  !Array.isArray(manifest.schemas)
) {
  throw new Error('The published schema manifest is malformed.');
}
assertSameNames(
  'schema manifest entries',
  schemaFiles,
  manifest.schemas.map((entry) => entry.file),
);
for (const entry of manifest.schemas) {
  const bytes = await readFile(new URL(entry.file, rootSchemaDirectory));
  const digest = `sha256-${createHash('sha256').update(bytes).digest('base64')}`;
  if (entry.digest !== digest) {
    throw new Error(`Schema manifest digest for ${entry.file} is stale; run contracts:sync.`);
  }
  if (entry.id !== JSON.parse(bytes.toString('utf8')).$id) {
    throw new Error(`Schema manifest identifier for ${entry.file} is stale; run contracts:sync.`);
  }
}

// The corpus manifest must describe the corpus as it actually ships, or a
// host verifying its vendored copy would verify against a fiction.
const corpusManifest = JSON.parse(
  await readFile(new URL('../packages/testkit/corpus-manifest.json', import.meta.url), 'utf8'),
);
if (corpusManifest.kind !== 'corpus-manifest' || !Array.isArray(corpusManifest.groups)) {
  throw new Error('The published corpus manifest is malformed.');
}
const corpusDirectories = new Map([
  ['canonical-vectors', packageCanonicalVectorDirectory],
  ['command-vectors', packageVectorDirectory],
  ['fixtures', packageFixtureDirectory],
  ['host-vectors', packageHostVectorDirectory],
  ['invalid-fixtures', packageInvalidDirectory],
  ['media-vectors', packageMediaVectorDirectory],
  ['rich-text-conformance', packageConformanceDirectory],
]);
assertSameNames(
  'corpus manifest groups',
  [...corpusDirectories.keys()].sort(),
  corpusManifest.groups.map((group) => group.group).sort(),
);
for (const group of corpusManifest.groups) {
  const directory = corpusDirectories.get(group.group);
  if (directory === undefined) {
    throw new Error(`The corpus manifest names an unknown group ${group.group}.`);
  }
  const present = (await readdir(directory)).filter((name) => name.endsWith('.json')).sort();
  assertSameNames(
    `corpus manifest entries for ${group.group}`,
    present,
    group.files.map((entry) => entry.file),
  );
  for (const entry of group.files) {
    const bytes = await readFile(new URL(entry.file, directory));
    const digest = `sha256-${createHash('sha256').update(bytes).digest('base64')}`;
    if (entry.digest !== digest) {
      throw new Error(
        `Corpus manifest digest for ${group.path}/${entry.file} is stale; run contracts:sync.`,
      );
    }
  }
}

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
  ['design-vocabulary.example.json', 'design-vocabulary.schema.json'],
  ['entry.product.example.json', 'entry.schema.json'],
  ['field-adapter.example.json', 'field-adapter.schema.json'],
  ['host-capabilities.example.json', 'host-capabilities.schema.json'],
  ['host-error.conflict.example.json', 'host-error.schema.json'],
  ['host-operations.example.json', 'host-operations.schema.json'],
  ['inspector.example.json', 'inspector.schema.json'],
  ['media-asset.example.json', 'media-asset.schema.json'],
  ['media-asset.processing.example.json', 'media-asset.schema.json'],
  ['media-reference.example.json', 'media-reference.schema.json'],
  ['media-upload-grant.example.json', 'media-upload-grant.schema.json'],
  ['media-upload-session.transferring.example.json', 'media-upload-session.schema.json'],
  ['migration.example.json', 'migration.schema.json'],
  ['pattern.example.json', 'pattern.schema.json'],
  ['plugin.example.json', 'plugin-manifest.schema.json'],
  ['preview.render.example.json', 'preview-message.schema.json'],
  ['provenance.example.json', 'provenance.schema.json'],
  ['rich-text.example.json', 'rich-text.schema.json'],
  ['studio-config.example.json', 'studio-config.schema.json'],
  ['theme.example.json', 'theme.schema.json'],
  ['unresolved-contribution.example.json', 'unresolved-contribution.schema.json'],
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

const validateMediaVector = getCanonicalValidator('media-vector.schema.json');
if (mediaVectorFiles.length === 0) {
  throw new Error('The canonical media policy vector corpus is empty.');
}
const mediaUploadSessionSchema = schemas.find(
  (candidate) => basename(new URL(candidate.$id).pathname) === 'media-upload-session.schema.json',
);
if (mediaUploadSessionSchema === undefined) {
  throw new Error('The media-upload-session schema is unavailable.');
}
const validateCanonicalUploadRequest = ajv.compile({
  $ref: `${mediaUploadSessionSchema.$id}#/properties/request`,
});
const mediaVectorIdentifiers = new Set();
for (const mediaVectorFile of mediaVectorFiles) {
  const vector = JSON.parse(
    await readFile(new URL(mediaVectorFile, rootMediaVectorDirectory), 'utf8'),
  );
  if (!validateMediaVector(vector)) {
    throw new Error(
      `${mediaVectorFile} violates media-vector.schema.json: ${ajv.errorsText(validateMediaVector.errors)}`,
    );
  }
  if (mediaVectorIdentifiers.has(vector.id)) {
    throw new Error(`Media vector identifier ${vector.id} is duplicated.`);
  }
  mediaVectorIdentifiers.add(vector.id);
  if (vector.expect.outcome === 'accepted') {
    if (!validateCanonicalUploadRequest(vector.request)) {
      throw new Error(
        `${mediaVectorFile} accepts a request the canonical upload request shape refuses: ` +
          ajv.errorsText(validateCanonicalUploadRequest.errors),
      );
    }
    const plan = vector.expect.plan;
    if (
      plan.maximumBytes !== vector.policy.maximumBytes ||
      plan.resumable !== vector.policy.resumable ||
      plan.chunkBytes !== vector.policy.chunkBytes
    ) {
      throw new Error(`${mediaVectorFile} expects a plan that is not derived from its policy.`);
    }
    if (vector.request.byteSize > vector.policy.maximumBytes) {
      throw new Error(`${mediaVectorFile} accepts a request larger than the policy maximum.`);
    }
    if (!vector.policy.acceptedMediaTypes.includes(vector.request.mediaType)) {
      throw new Error(`${mediaVectorFile} accepts a media type the policy does not accept.`);
    }
  }
  if (vector.cancel !== undefined) {
    if (vector.expect.outcome !== 'accepted') {
      throw new Error(`${mediaVectorFile} cancels an upload the policy never accepts.`);
    }
    const expectedFinalState = vector.cancel.during === 'complete' ? 'complete' : 'cancelled';
    if (vector.cancel.finalState !== expectedFinalState) {
      throw new Error(`${mediaVectorFile} declares an impossible cancellation outcome.`);
    }
  }
  if (vector.retry !== undefined && vector.expect.outcome !== 'rejected') {
    throw new Error(`${mediaVectorFile} declares a retry for an upload that never fails.`);
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

if (conformanceFiles.length === 0) {
  throw new Error('The renderer-conformance corpus is empty.');
}
const validateProjectionFixture = getCanonicalValidator('rich-text-projection.schema.json');
const validateRichTextDocument = getCanonicalValidator('rich-text.schema.json');
for (const conformanceFile of conformanceFiles) {
  const fixture = JSON.parse(
    await readFile(new URL(conformanceFile, rootConformanceDirectory), 'utf8'),
  );
  if (!validateProjectionFixture(fixture)) {
    throw new Error(
      `${conformanceFile} violates rich-text-projection.schema.json: ` +
        ajv.errorsText(validateProjectionFixture.errors),
    );
  }
  if (!validateRichTextDocument(fixture.document)) {
    throw new Error(
      `${conformanceFile} document violates rich-text.schema.json: ` +
        ajv.errorsText(validateRichTextDocument.errors),
    );
  }
  for (const [blockIndex, block] of fixture.projection.entries()) {
    let previousSpan;
    for (const span of block.spans) {
      if (span.end <= span.start) {
        throw new Error(
          `${conformanceFile} projection[${blockIndex}] contains a zero-length or inverted span.`,
        );
      }
      if (span.marks.join(' ') !== [...span.marks].sort().join(' ')) {
        throw new Error(
          `${conformanceFile} projection[${blockIndex}] span mark names are not sorted.`,
        );
      }
      if (previousSpan !== undefined && compareProjectionSpans(previousSpan, span) >= 0) {
        throw new Error(
          `${conformanceFile} projection[${blockIndex}] spans are not sorted by (start, end, marks).`,
        );
      }
      previousSpan = span;
    }
    let previousEmbedIndex = -1;
    for (const embed of block.embeds) {
      if (embed.index < previousEmbedIndex) {
        throw new Error(
          `${conformanceFile} projection[${blockIndex}] embeds are not sorted by index.`,
        );
      }
      previousEmbedIndex = embed.index;
    }
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

const validateCanonicalDecimal = ajv.compile({ $ref: `${common.$id}#/$defs/canonicalDecimal` });
for (const value of ['0', '-1', '10.50', '1499.00', '-0.001', '123456789.123456789']) {
  assertAccepted(`canonical decimal ${value}`, validateCanonicalDecimal, value);
}
for (const value of ['00', '01.5', '.5', '1.', '+1', '1e3', 'NaN', '-', '1,5', '1.5\n', '-0']) {
  assertRejected(`canonical decimal ${JSON.stringify(value)}`, validateCanonicalDecimal, value);
}

const validateMoney = ajv.compile({ $ref: `${common.$id}#/$defs/moneyValue` });
assertAccepted('money value', validateMoney, { amount: '1499.00', currency: 'NAD' });
assertRejected('money with float amount', validateMoney, { amount: 1499, currency: 'NAD' });
assertRejected('money with lowercase currency', validateMoney, {
  amount: '1499.00',
  currency: 'nad',
});
assertRejected('money with extra member', validateMoney, {
  amount: '1499.00',
  currency: 'NAD',
  formatted: 'N$1,499.00',
});

const validateInstant = ajv.compile({ $ref: `${common.$id}#/$defs/rfc3339Instant` });
for (const value of [
  '2026-08-15T09:30:00Z',
  '2026-12-31T23:59:60Z',
  '2026-08-15T09:30:00.123456789+02:00',
]) {
  assertAccepted(`instant ${value}`, validateInstant, value);
}
for (const value of [
  '2026-08-15 09:30:00Z',
  '2026-08-15T09:30:00',
  '2026-13-01T00:00:00Z',
  '2026-08-15T24:00:00Z',
  '2026-08-15T09:30:00+2:00',
]) {
  assertRejected(`instant ${value}`, validateInstant, value);
}

const validateDate = ajv.compile({ $ref: `${common.$id}#/$defs/rfc3339Date` });
assertAccepted('date 2026-08-15', validateDate, '2026-08-15');
for (const value of ['2026-8-15', '2026-08-32', '2026-00-15', '20260815']) {
  assertRejected(`date ${value}`, validateDate, value);
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

if (canonicalVectorFiles.length === 0) {
  throw new Error('The canonical serialization vector corpus is empty.');
}
const validateCanonicalVector = getCanonicalValidator('canonical-vector.schema.json');
const canonicalVectorIdentifiers = new Set();
for (const canonicalVectorFile of canonicalVectorFiles) {
  const vector = JSON.parse(
    await readFile(new URL(canonicalVectorFile, rootCanonicalVectorDirectory), 'utf8'),
  );
  if (!validateCanonicalVector(vector)) {
    throw new Error(
      `${canonicalVectorFile} violates canonical-vector.schema.json: ${ajv.errorsText(validateCanonicalVector.errors)}`,
    );
  }
  if (canonicalVectorIdentifiers.has(vector.id)) {
    throw new Error(`Canonical vector identifier ${vector.id} is duplicated.`);
  }
  canonicalVectorIdentifiers.add(vector.id);
}

if (hostVectorFiles.length === 0) {
  throw new Error('The canonical host conformance vector corpus is empty.');
}
const validateHostVector = getCanonicalValidator('host-vector.schema.json');
const hostVectorIdentifiers = new Set();
const hostVectorPorts = new Set();
for (const hostVectorFile of hostVectorFiles) {
  const vector = JSON.parse(
    await readFile(new URL(hostVectorFile, rootHostVectorDirectory), 'utf8'),
  );
  if (!validateHostVector(vector)) {
    throw new Error(
      `${hostVectorFile} violates host-vector.schema.json: ${ajv.errorsText(validateHostVector.errors)}`,
    );
  }
  if (hostVectorIdentifiers.has(vector.id)) {
    throw new Error(`Host vector identifier ${vector.id} is duplicated.`);
  }
  hostVectorIdentifiers.add(vector.id);
  hostVectorPorts.add(vector.port);
  // A conflict is only resolvable without a second read when it carries the
  // safe current revision, so the corpus may never record one without it.
  if (vector.expect.outcome === 'error' && vector.expect.category === 'conflict') {
    if (vector.expect.revision === undefined) {
      throw new Error(`${hostVectorFile} expects a conflict without the safe current revision.`);
    }
  }
  // A vector that names an artifact it operates on must seed that artifact,
  // otherwise the precondition is not reproducible by another implementation.
  if (vector.expect.outcome === 'result' && vector.expect.revision !== undefined) {
    const seeded = vector.given.artifacts.some(
      (artifact) => artifact.revision === vector.expect.revision,
    );
    if (!seeded) {
      throw new Error(
        `${hostVectorFile} expects revision ${vector.expect.revision}, which its given state never seeds.`,
      );
    }
  }
  // Non-disclosure assertions must name a value the vector actually sends.
  for (const forbidden of vector.expect.messageMustNotContain ?? []) {
    const sent = JSON.stringify({ argument: vector.argument ?? null, context: vector.context });
    if (!sent.includes(forbidden)) {
      throw new Error(
        `${hostVectorFile} forbids disclosing ${forbidden}, which the request never carries.`,
      );
    }
  }
}
// The baseline profile is meaningless unless it reaches the ports a host must
// implement before any editing session can open.
for (const required of ['artifact', 'permission']) {
  if (!hostVectorPorts.has(required)) {
    throw new Error(`The host conformance corpus covers no ${required}-port exchange.`);
  }
}

console.log(
  `${schemaFiles.length} schemas, ${exampleFiles.length} canonical fixtures, ` +
    `${vectorFiles.length} command vectors, ${mediaVectorFiles.length} media policy vectors, ` +
    `${hostVectorFiles.length} host conformance vectors, ` +
    `${canonicalVectorFiles.length} canonical serialization vectors, ` +
    `${invalidFiles.length} negative fixtures, and ` +
    `${conformanceFiles.length} renderer-conformance fixtures verified.`,
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

function compareProjectionSpans(left, right) {
  if (left.start !== right.start) {
    return left.start - right.start;
  }
  if (left.end !== right.end) {
    return left.end - right.end;
  }
  const leftMarks = left.marks.join(' ');
  const rightMarks = right.marks.join(' ');
  if (leftMarks === rightMarks) {
    return 0;
  }
  return leftMarks < rightMarks ? -1 : 1;
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
