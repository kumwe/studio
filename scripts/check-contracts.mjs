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
const rootBindingProjectionVectorDirectory = new URL(
  '../schemas/vectors/binding-projection/',
  import.meta.url,
);
const packageBindingProjectionVectorDirectory = new URL(
  '../packages/testkit/vectors/binding-projection/',
  import.meta.url,
);
const rootMediaVectorDirectory = new URL('../schemas/vectors/media/', import.meta.url);
const packageMediaVectorDirectory = new URL('../packages/testkit/vectors/media/', import.meta.url);
const rootCanonicalVectorDirectory = new URL('../schemas/vectors/canonical/', import.meta.url);
const packageCanonicalVectorDirectory = new URL(
  '../packages/testkit/vectors/canonical/',
  import.meta.url,
);
const rootHostVectorDirectory = new URL('../schemas/vectors/host/', import.meta.url);
const packageHostVectorDirectory = new URL('../packages/testkit/vectors/host/', import.meta.url);
const rootHostSequenceVectorDirectory = new URL(
  '../schemas/vectors/host-sequence/',
  import.meta.url,
);
const packageHostSequenceVectorDirectory = new URL(
  '../packages/testkit/vectors/host-sequence/',
  import.meta.url,
);
const rootPreviewVectorDirectory = new URL('../schemas/vectors/preview/', import.meta.url);
const packagePreviewVectorDirectory = new URL(
  '../packages/testkit/vectors/preview/',
  import.meta.url,
);
const rootSchemaProfileVectorDirectory = new URL(
  '../schemas/vectors/schema-profile/',
  import.meta.url,
);
const packageSchemaProfileVectorDirectory = new URL(
  '../packages/testkit/vectors/schema-profile/',
  import.meta.url,
);
const rootInvalidDirectory = new URL('../schemas/invalid/', import.meta.url);
const packageInvalidDirectory = new URL('../packages/testkit/invalid/', import.meta.url);
const rootConformanceDirectory = new URL('../schemas/conformance/rich-text/', import.meta.url);
const packageConformanceDirectory = new URL(
  '../packages/testkit/conformance/rich-text/',
  import.meta.url,
);
const rootAuthoringWebConformanceDirectory = new URL(
  '../schemas/conformance/authoring-web/',
  import.meta.url,
);
const packageAuthoringWebConformanceDirectory = new URL(
  '../packages/testkit/conformance/authoring-web/',
  import.meta.url,
);
const rootRendererWebConformanceDirectory = new URL(
  '../schemas/conformance/renderer-web/',
  import.meta.url,
);
const packageRendererWebConformanceDirectory = new URL(
  '../packages/testkit/conformance/renderer-web/',
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

const bindingProjectionVectorFiles = (await readdir(rootBindingProjectionVectorDirectory))
  .filter((name) => name.endsWith('.json'))
  .sort();
const packageBindingProjectionVectorFiles = (await readdir(packageBindingProjectionVectorDirectory))
  .filter((name) => name.endsWith('.json'))
  .sort();

assertSameNames(
  'testkit binding-projection-vector copies',
  bindingProjectionVectorFiles,
  packageBindingProjectionVectorFiles,
);
await assertCopies(
  rootBindingProjectionVectorDirectory,
  packageBindingProjectionVectorDirectory,
  bindingProjectionVectorFiles,
);

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

const hostSequenceVectorFiles = (await readdir(rootHostSequenceVectorDirectory))
  .filter((name) => name.endsWith('.json'))
  .sort();
const packageHostSequenceVectorFiles = (await readdir(packageHostSequenceVectorDirectory))
  .filter((name) => name.endsWith('.json'))
  .sort();

assertSameNames(
  'testkit host-sequence-vector copies',
  hostSequenceVectorFiles,
  packageHostSequenceVectorFiles,
);
await assertCopies(
  rootHostSequenceVectorDirectory,
  packageHostSequenceVectorDirectory,
  hostSequenceVectorFiles,
);

const previewVectorFiles = (await readdir(rootPreviewVectorDirectory))
  .filter((name) => name.endsWith('.json'))
  .sort();
const packagePreviewVectorFiles = (await readdir(packagePreviewVectorDirectory))
  .filter((name) => name.endsWith('.json'))
  .sort();

assertSameNames('testkit preview-vector copies', previewVectorFiles, packagePreviewVectorFiles);
await assertCopies(rootPreviewVectorDirectory, packagePreviewVectorDirectory, previewVectorFiles);

const schemaProfileVectorFiles = (await readdir(rootSchemaProfileVectorDirectory))
  .filter((name) => name.endsWith('.json'))
  .sort();
const packageSchemaProfileVectorFiles = (await readdir(packageSchemaProfileVectorDirectory))
  .filter((name) => name.endsWith('.json'))
  .sort();

assertSameNames(
  'testkit schema-profile-vector copies',
  schemaProfileVectorFiles,
  packageSchemaProfileVectorFiles,
);
await assertCopies(
  rootSchemaProfileVectorDirectory,
  packageSchemaProfileVectorDirectory,
  schemaProfileVectorFiles,
);

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

const authoringWebConformanceFiles = (await readdir(rootAuthoringWebConformanceDirectory))
  .filter((name) => name.endsWith('.json'))
  .sort();
const packageAuthoringWebConformanceFiles = (await readdir(packageAuthoringWebConformanceDirectory))
  .filter((name) => name.endsWith('.json'))
  .sort();

assertSameNames(
  'testkit authoring-web conformance copies',
  authoringWebConformanceFiles,
  packageAuthoringWebConformanceFiles,
);
await assertCopies(
  rootAuthoringWebConformanceDirectory,
  packageAuthoringWebConformanceDirectory,
  authoringWebConformanceFiles,
);

const rendererWebConformanceFiles = (await readdir(rootRendererWebConformanceDirectory))
  .filter((name) => name.endsWith('.json'))
  .sort();
const packageRendererWebConformanceFiles = (await readdir(packageRendererWebConformanceDirectory))
  .filter((name) => name.endsWith('.json'))
  .sort();
assertSameNames(
  'testkit renderer-web conformance copies',
  rendererWebConformanceFiles,
  packageRendererWebConformanceFiles,
);
await assertCopies(
  rootRendererWebConformanceDirectory,
  packageRendererWebConformanceDirectory,
  rendererWebConformanceFiles,
);

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
  ['binding-projection-vectors', packageBindingProjectionVectorDirectory],
  ['authoring-web-conformance', packageAuthoringWebConformanceDirectory],
  ['canonical-vectors', packageCanonicalVectorDirectory],
  ['command-vectors', packageVectorDirectory],
  ['fixtures', packageFixtureDirectory],
  ['host-vectors', packageHostVectorDirectory],
  ['host-sequence-vectors', packageHostSequenceVectorDirectory],
  ['invalid-fixtures', packageInvalidDirectory],
  ['media-vectors', packageMediaVectorDirectory],
  ['preview-vectors', packagePreviewVectorDirectory],
  ['rich-text-conformance', packageConformanceDirectory],
  ['renderer-web-conformance', packageRendererWebConformanceDirectory],
  ['schema-profile-vectors', packageSchemaProfileVectorDirectory],
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

const validateRendererWebVector = getCanonicalValidator('renderer-web-vector.schema.json');
if (rendererWebConformanceFiles.length === 0) {
  throw new Error('The canonical renderer-web conformance corpus is empty.');
}
const expectedRendererWebBlockTypes = [
  'studio.core/accordion',
  'studio.core/accordion-item',
  'studio.core/article',
  'studio.core/attachment',
  'studio.core/audio',
  'studio.core/badge',
  'studio.core/call-to-action',
  'studio.core/callout',
  'studio.core/card',
  'studio.core/chart',
  'studio.core/code',
  'studio.core/columns',
  'studio.core/content-collection',
  'studio.core/content-reference',
  'studio.core/countdown',
  'studio.core/cover',
  'studio.core/description-item',
  'studio.core/description-list',
  'studio.core/diagram',
  'studio.core/dialog',
  'studio.core/divider',
  'studio.core/drawing',
  'studio.core/embed',
  'studio.core/gallery',
  'studio.core/grid',
  'studio.core/heading',
  'studio.core/icon',
  'studio.core/image',
  'studio.core/label',
  'studio.core/math',
  'studio.core/money',
  'studio.core/navigation',
  'studio.core/navigation-item',
  'studio.core/notice',
  'studio.core/popover',
  'studio.core/progress',
  'studio.core/rich-text',
  'studio.core/search',
  'studio.core/section',
  'studio.core/spinner',
  'studio.core/stack',
  'studio.core/tab',
  'studio.core/table',
  'studio.core/tabs',
  'studio.core/video',
];
const expectedRendererWebBehaviors = [
  'accordion-native',
  'countdown',
  'dialog',
  'lightbox',
  'navigation-disclosure',
  'notice-dismiss',
  'popover',
  'slideshow',
  'tabs',
];
const expectedRendererWebPresentation = [
  'alignment',
  'inverse',
  'markers',
  'motion',
  'position',
  'print',
  'responsive-visibility',
  'scrolling',
  'sizing',
  'spacing',
];
const expectedRendererWebSecurity = [
  'active-media-deny',
  'blob-default-deny',
  'escaped-text',
  'safe-url-deny',
  'typed-data-fallback',
];
const rendererWebVectorIdentifiers = new Set();
const coveredRendererWebBlockTypes = new Set();
const coveredRendererWebBehaviors = new Set();
const coveredRendererWebPresentation = new Set();
const coveredRendererWebSecurity = new Set();
for (const vectorFile of rendererWebConformanceFiles) {
  const vector = JSON.parse(
    await readFile(new URL(vectorFile, rootRendererWebConformanceDirectory), 'utf8'),
  );
  if (!validateRendererWebVector(vector)) {
    throw new Error(
      `${vectorFile} violates renderer-web-vector.schema.json: ` +
        ajv.errorsText(validateRendererWebVector.errors),
    );
  }
  if (rendererWebVectorIdentifiers.has(vector.id)) {
    throw new Error(`Renderer-web vector identifier ${vector.id} is duplicated.`);
  }
  rendererWebVectorIdentifiers.add(vector.id);
  const nodeTypes = new Set();
  const visitNode = (node) => {
    nodeTypes.add(node.type);
    for (const slot of Object.values(node.slots)) for (const child of slot) visitNode(child);
  };
  for (const root of vector.roots) visitNode(root);
  for (const type of vector.coverage.blockTypes) {
    if (!nodeTypes.has(type)) {
      throw new Error(`${vectorFile} claims coverage for absent block type ${type}.`);
    }
    coveredRendererWebBlockTypes.add(type);
  }
  for (const behavior of vector.coverage.behaviors) coveredRendererWebBehaviors.add(behavior);
  for (const capability of vector.coverage.presentation)
    coveredRendererWebPresentation.add(capability);
  for (const fallback of vector.coverage.security) coveredRendererWebSecurity.add(fallback);
}
assertExactSet(
  'Renderer-web block coverage',
  expectedRendererWebBlockTypes,
  coveredRendererWebBlockTypes,
);
assertExactSet(
  'Renderer-web behavior coverage',
  expectedRendererWebBehaviors,
  coveredRendererWebBehaviors,
);
assertExactSet(
  'Renderer-web presentation coverage',
  expectedRendererWebPresentation,
  coveredRendererWebPresentation,
);
assertExactSet(
  'Renderer-web security coverage',
  expectedRendererWebSecurity,
  coveredRendererWebSecurity,
);

const schemaByExample = new Map([
  ['authoring-message-catalog.en.json', 'authoring-message-catalog.schema.json'],
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

const validateBindingProjectionVector = getCanonicalValidator(
  'binding-projection-vector.schema.json',
);
if (bindingProjectionVectorFiles.length === 0) {
  throw new Error('The canonical binding projection vector corpus is empty.');
}
const bindingProjectionVectorIdentifiers = new Set();
for (const vectorFile of bindingProjectionVectorFiles) {
  const vector = JSON.parse(
    await readFile(new URL(vectorFile, rootBindingProjectionVectorDirectory), 'utf8'),
  );
  if (!validateBindingProjectionVector(vector)) {
    throw new Error(
      `${vectorFile} violates binding-projection-vector.schema.json: ` +
        ajv.errorsText(validateBindingProjectionVector.errors),
    );
  }
  if (bindingProjectionVectorIdentifiers.has(vector.id)) {
    throw new Error(`Binding projection vector identifier ${vector.id} is duplicated.`);
  }
  bindingProjectionVectorIdentifiers.add(vector.id);
  if (
    vector.blueprint.model.id !== vector.expect.model.id ||
    vector.blueprint.model.version !== vector.expect.model.version ||
    vector.blueprint.model.revision !== vector.expect.model.revision
  ) {
    throw new Error(`${vectorFile} must preserve the Blueprint's exact locked model coordinate.`);
  }
  const expectedNodeIds = vector.expect.nodes.map((node) => node.nodeId);
  if (new Set(expectedNodeIds).size !== expectedNodeIds.length) {
    throw new Error(`${vectorFile} duplicates an expected node projection.`);
  }
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

const validateSchemaProfileVector = getCanonicalValidator('schema-profile-vector.schema.json');
if (schemaProfileVectorFiles.length === 0) {
  throw new Error('The canonical schema-profile vector corpus is empty.');
}
const schemaProfileMetaSchema = schemas.find(
  (candidate) => basename(new URL(candidate.$id).pathname) === 'schema-profile.schema.json',
);
const schemaProfileLimits = schemaProfileMetaSchema?.$defs?.limits?.const;
if (schemaProfileLimits === undefined || schemaProfileLimits === null) {
  throw new Error('The Studio Schema Profile does not publish its complexity limits.');
}
const schemaProfileVectorIdentifiers = new Set();
const schemaProfileLimitBoundaries = new Map();
for (const schemaProfileVectorFile of schemaProfileVectorFiles) {
  const vector = JSON.parse(
    await readFile(new URL(schemaProfileVectorFile, rootSchemaProfileVectorDirectory), 'utf8'),
  );
  if (!validateSchemaProfileVector(vector)) {
    throw new Error(
      `${schemaProfileVectorFile} violates schema-profile-vector.schema.json: ` +
        ajv.errorsText(validateSchemaProfileVector.errors),
    );
  }
  if (schemaProfileVectorIdentifiers.has(vector.id)) {
    throw new Error(`Schema-profile vector identifier ${vector.id} is duplicated.`);
  }
  schemaProfileVectorIdentifiers.add(vector.id);
  if (vector.profile !== 'studio.profile/schema-property') {
    throw new Error(`${schemaProfileVectorFile} declares an unknown schema profile.`);
  }
  if (vector.boundary !== undefined) {
    const expectedLimit = schemaProfileLimits[vector.boundary.limit];
    if (!Number.isInteger(expectedLimit)) {
      throw new Error(
        `${schemaProfileVectorFile} names unpublished limit ${vector.boundary.limit}.`,
      );
    }
    const expectedValue =
      vector.boundary.position === 'at-limit' ? expectedLimit : expectedLimit + 1;
    if (vector.boundary.value !== expectedValue) {
      throw new Error(
        `${schemaProfileVectorFile} declares ${vector.boundary.value} for ` +
          `${vector.boundary.limit} ${vector.boundary.position}; expected ${expectedValue}.`,
      );
    }
    const measuredValue = measureSchemaProfileBoundary(vector.boundary.limit, vector.schema);
    if (measuredValue !== vector.boundary.value) {
      throw new Error(
        `${schemaProfileVectorFile} measures ${measuredValue} for ` +
          `${vector.boundary.limit}; declared ${vector.boundary.value}.`,
      );
    }
    const expectedOutcome = vector.boundary.position === 'at-limit' ? 'accepted' : 'rejected';
    if (vector.expect.outcome !== expectedOutcome) {
      throw new Error(
        `${schemaProfileVectorFile} ${vector.boundary.position} must be ${expectedOutcome}.`,
      );
    }
    const positions = schemaProfileLimitBoundaries.get(vector.boundary.limit) ?? new Set();
    if (positions.has(vector.boundary.position)) {
      throw new Error(
        `Schema-profile limit ${vector.boundary.limit} has duplicate ` +
          `${vector.boundary.position} vectors.`,
      );
    }
    positions.add(vector.boundary.position);
    schemaProfileLimitBoundaries.set(vector.boundary.limit, positions);
  }
}
for (const requiredIdentifier of [
  'schema-profile/forward-reference-path-precedence',
  'schema-profile/reference-vs-keyword-precedence',
  'schema-profile/root-vs-reference-precedence',
  'schema-profile/semantic-recursion-precedence',
  'schema-profile/semantic-reference-precedence',
]) {
  if (!schemaProfileVectorIdentifiers.has(requiredIdentifier)) {
    throw new Error(`Schema-profile corpus is missing ${requiredIdentifier}.`);
  }
}
for (const limit of Object.keys(schemaProfileLimits).sort()) {
  const positions = schemaProfileLimitBoundaries.get(limit);
  if (
    positions === undefined ||
    !positions.has('at-limit') ||
    !positions.has('over-limit') ||
    positions.size !== 2
  ) {
    throw new Error(
      `Schema-profile limit ${limit} requires exactly one at-limit and one over-limit vector.`,
    );
  }
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

if (authoringWebConformanceFiles.length === 0) {
  throw new Error('The authoring-web conformance corpus is empty.');
}
const validateAuthoringWebVector = getCanonicalValidator('authoring-web-vector.schema.json');
const authoringWebVectorIdentifiers = new Set();
for (const vectorFile of authoringWebConformanceFiles) {
  const vector = JSON.parse(
    await readFile(new URL(vectorFile, rootAuthoringWebConformanceDirectory), 'utf8'),
  );
  if (!validateAuthoringWebVector(vector)) {
    throw new Error(
      `${vectorFile} violates authoring-web-vector.schema.json: ` +
        ajv.errorsText(validateAuthoringWebVector.errors),
    );
  }
  if (authoringWebVectorIdentifiers.has(vector.id)) {
    throw new Error(`Authoring-web vector identifier ${vector.id} is duplicated.`);
  }
  authoringWebVectorIdentifiers.add(vector.id);
  const laneNames = new Set();
  for (const lane of vector.lanes) {
    if (laneNames.has(lane.name)) {
      throw new Error(`${vectorFile} duplicates lane ${lane.name}.`);
    }
    laneNames.add(lane.name);
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
  '0.1.0-draft.2',
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

if (previewVectorFiles.length === 0) {
  throw new Error('The canonical preview identity vector corpus is empty.');
}
const validatePreviewVector = getCanonicalValidator('preview-vector.schema.json');
const previewVectorIdentifiers = new Set();
const previewRenderRequestIdentifiers = new Set();
for (const previewVectorFile of previewVectorFiles) {
  const vector = JSON.parse(
    await readFile(new URL(previewVectorFile, rootPreviewVectorDirectory), 'utf8'),
  );
  if (!validatePreviewVector(vector)) {
    throw new Error(
      `${previewVectorFile} violates preview-vector.schema.json: ` +
        ajv.errorsText(validatePreviewVector.errors),
    );
  }
  if (previewVectorIdentifiers.has(vector.id)) {
    throw new Error(`Preview vector identifier ${vector.id} is duplicated.`);
  }
  previewVectorIdentifiers.add(vector.id);
  if (previewRenderRequestIdentifiers.has(vector.render.requestId)) {
    throw new Error(
      `${previewVectorFile} reuses preview render request ${vector.render.requestId}.`,
    );
  }
  previewRenderRequestIdentifiers.add(vector.render.requestId);

  const actualDigest = createHash('sha256')
    .update(canonicalJson(vector.draft), 'utf8')
    .digest('hex');
  if (actualDigest !== vector.expect.draftDigest) {
    throw new Error(
      `${previewVectorFile} expects digest ${vector.expect.draftDigest}, received ${actualDigest}.`,
    );
  }
  if (
    vector.render.artifactId !== vector.draft.id ||
    vector.render.draftRevision !== vector.draft.revision ||
    vector.render.draftDigest !== actualDigest
  ) {
    throw new Error(`${previewVectorFile} does not bind the exact render identity tuple.`);
  }
  const nodeIds = previewNodeIds(vector.draft);
  const expectedMarkers = nodeIds.map(
    (_nodeId, ordinal) => `studio.preview/node/${actualDigest}/${ordinal}`,
  );
  if (JSON.stringify(vector.expect.markers) !== JSON.stringify(expectedMarkers)) {
    throw new Error(`${previewVectorFile} does not declare canonical marker preorder.`);
  }
  const markerEntries = Object.entries(vector.expect.markerMap);
  if (
    markerEntries.length !== expectedMarkers.length ||
    expectedMarkers.some((marker, ordinal) => vector.expect.markerMap[marker] !== nodeIds[ordinal])
  ) {
    throw new Error(`${previewVectorFile} marker map is not an exact one-to-one inventory.`);
  }
}

if (hostVectorFiles.length === 0) {
  throw new Error('The canonical host conformance vector corpus is empty.');
}
const hostOperationRegistry = JSON.parse(
  await readFile(new URL('host-operations.example.json', rootExampleDirectory), 'utf8'),
);
const operationCapabilities = new Map(
  hostOperationRegistry.operations.map((entry) => [
    `${entry.port}.${entry.operation}`,
    entry.capability,
  ]),
);
function requiredOperationCapability(port, operation) {
  const capability = operationCapabilities.get(`${port}.${operation}`);
  if (capability === undefined) {
    throw new Error(`No host operation registry entry exists for ${port}.${operation}.`);
  }
  return capability;
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
  const expectedOperationId = requiredOperationCapability(vector.port, vector.operation);
  if (vector.context.operationId !== expectedOperationId) {
    throw new Error(
      `${hostVectorFile} carries ${vector.context.operationId}; expected ${expectedOperationId}.`,
    );
  }
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

if (hostSequenceVectorFiles.length === 0) {
  throw new Error('The canonical host sequence conformance corpus is empty.');
}
const validateHostSequenceVector = getCanonicalValidator('host-sequence-vector.schema.json');
const previewMessageSchema = schemas.find(
  (candidate) => basename(new URL(candidate.$id).pathname) === 'preview-message.schema.json',
);
if (previewMessageSchema === undefined) {
  throw new Error('The preview message schema is unavailable.');
}
const validatePreviewRenderPayload = ajv.compile({
  $ref: `${previewMessageSchema.$id}#/$defs/render`,
});
const hostSequenceIdentifiers = new Set();
const requiredSequenceAssertions = new Set([
  'operation-id-mismatch-refusal',
  'idempotent-in-flight-coalescing',
  'idempotent-completed-replay',
  'idempotency-changed-argument-refusal',
  'idempotency-changed-context-refusal',
  'idempotency-resource-scope-separation',
  'canonical-number-equivalence',
  'failed-attempt-retry',
  'fixed-window-rate-limit',
  'fixed-window-reset',
  'in-flight-preview-cancellation',
  'cross-context-cancellation-isolation',
  'late-preview-result-discard',
]);
const hostSequenceVectors = [];
for (const hostSequenceVectorFile of hostSequenceVectorFiles) {
  const vector = JSON.parse(
    await readFile(new URL(hostSequenceVectorFile, rootHostSequenceVectorDirectory), 'utf8'),
  );
  if (!validateHostSequenceVector(vector)) {
    throw new Error(
      `${hostSequenceVectorFile} violates host-sequence-vector.schema.json: ` +
        ajv.errorsText(validateHostSequenceVector.errors),
    );
  }
  if (hostSequenceIdentifiers.has(vector.id)) {
    throw new Error(`Host sequence vector identifier ${vector.id} is duplicated.`);
  }
  hostSequenceIdentifiers.add(vector.id);
  validateHostSequenceSemantics(vector, hostSequenceVectorFile);
  hostSequenceVectors.push([hostSequenceVectorFile, vector]);
  for (const assertion of vector.assertions) {
    requiredSequenceAssertions.delete(assertion);
  }
}
if (requiredSequenceAssertions.size > 0) {
  throw new Error(
    `Host sequence corpus is missing assertions: ${[...requiredSequenceAssertions].join(', ')}.`,
  );
}

runHostSequenceSemanticNegativeDrills(hostSequenceVectors);
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
    `${bindingProjectionVectorFiles.length} binding projection vectors, ` +
    `${hostVectorFiles.length} host conformance vectors, ` +
    `${hostSequenceVectorFiles.length} host sequence vectors, ` +
    `${previewVectorFiles.length} preview identity vectors, ` +
    `${schemaProfileVectorFiles.length} schema-profile vectors, ` +
    `${canonicalVectorFiles.length} canonical serialization vectors, ` +
    `${invalidFiles.length} negative fixtures, and ` +
    `${conformanceFiles.length} rich-text renderer fixtures, ` +
    `${authoringWebConformanceFiles.length} authoring-web vectors, and ` +
    `${rendererWebConformanceFiles.length} renderer-web vectors verified.`,
);

function validateHostSequenceSemantics(vector, file) {
  const artifactIdentifiers = new Set();
  for (const artifact of vector.given.artifacts) {
    if (artifactIdentifiers.has(artifact.id)) {
      throw new Error(`${file} duplicates artifact seed ${artifact.id}.`);
    }
    artifactIdentifiers.add(artifact.id);
  }

  const rateLimitOperations = new Set();
  for (const rateLimit of vector.given.rateLimits ?? []) {
    if (rateLimitOperations.has(rateLimit.operationId)) {
      throw new Error(`${file} duplicates rate-limit operation ${rateLimit.operationId}.`);
    }
    rateLimitOperations.add(rateLimit.operationId);
    if (rateLimit.retryAfterMilliseconds !== rateLimit.windowMilliseconds) {
      throw new Error(`${file} initial fixed-window retry delay must equal its window.`);
    }
  }

  const stepIdentifiers = new Set();
  const invocations = new Map();
  const settledExpectations = new Map();
  const releasedRenders = new Set();
  let operationMismatchCount = 0;
  for (const step of vector.steps) {
    if (stepIdentifiers.has(step.id)) {
      throw new Error(`${file} duplicates step identifier ${step.id}.`);
    }
    stepIdentifiers.add(step.id);

    if (step.action === 'invoke') {
      const expectedOperationId = requiredOperationCapability(step.port, step.operation);
      const operationKey = `${step.port}.${step.operation}`;
      if (step.context.operationId !== expectedOperationId) {
        operationMismatchCount += 1;
        const intentionallyRefused =
          step.completion === 'settled' &&
          step.expect?.outcome === 'error' &&
          step.expect.category === 'invalid-request';
        if (!intentionallyRefused) {
          throw new Error(
            `${file} step ${step.id} carries ${step.context.operationId}; ` +
              `expected ${expectedOperationId} or an explicit invalid-request refusal.`,
          );
        }
      }
      if (operationKey === 'preview.render' && !validatePreviewRenderPayload(step.argument)) {
        throw new Error(
          `${file} step ${step.id} violates the preview render payload contract: ` +
            ajv.errorsText(validatePreviewRenderPayload.errors),
        );
      }
      assertPriorSequenceComparison(file, step.id, step.expect, settledExpectations);
      const state = step.completion === 'settled' ? 'settled' : 'pending';
      invocations.set(step.id, {
        argument: step.argument,
        operationKey,
        state,
      });
      if (step.completion === 'settled') {
        settledExpectations.set(step.id, step.expect);
      }
      continue;
    }

    if (step.action === 'settle') {
      const invocation = invocations.get(step.invocation);
      if (invocation === undefined) {
        throw new Error(`${file} settles unknown invocation ${step.invocation}.`);
      }
      if (invocation.state !== 'pending') {
        throw new Error(`${file} settles already-settled invocation ${step.invocation}.`);
      }
      assertPriorSequenceComparison(file, step.id, step.expect, settledExpectations);
      invocation.state = 'settled';
      settledExpectations.set(step.invocation, step.expect);
      settledExpectations.set(step.id, step.expect);
      continue;
    }

    if (step.action === 'release-preview-render') {
      const invocation = invocations.get(step.invocation);
      if (invocation === undefined || invocation.operationKey !== 'preview.render') {
        throw new Error(`${file} releases unknown non-preview invocation ${step.invocation}.`);
      }
      if (invocation.state !== 'pending') {
        throw new Error(`${file} releases already-settled preview invocation ${step.invocation}.`);
      }
      if (releasedRenders.has(step.invocation)) {
        throw new Error(`${file} releases preview invocation ${step.invocation} more than once.`);
      }
      if (invocation.argument?.draftDigest !== step.value.draftDigest) {
        throw new Error(`${file} releases a renderer payload for the wrong draft digest.`);
      }
      if (invocation.argument?.requestId !== step.value.requestId) {
        throw new Error(`${file} releases a renderer payload for the wrong render request.`);
      }
      releasedRenders.add(step.invocation);
    }
  }

  const pending = [...invocations.entries()]
    .filter(([, invocation]) => invocation.state === 'pending')
    .map(([id]) => id);
  if (pending.length > 0) {
    throw new Error(`${file} leaves pending invocations unsettled: ${pending.join(', ')}.`);
  }

  const claimsMismatchRefusal = vector.assertions.includes('operation-id-mismatch-refusal');
  if (operationMismatchCount > 0 !== claimsMismatchRefusal) {
    throw new Error(`${file} operation-id mismatch steps and assertion tag disagree.`);
  }
  if (
    vector.assertions.includes('fixed-window-reset') &&
    !vector.steps.some((step) => step.action === 'advance-clock')
  ) {
    throw new Error(`${file} claims a fixed-window reset without advancing the logical clock.`);
  }
  if (
    vector.assertions.includes('late-preview-result-discard') &&
    !vector.steps.some((step) => step.action === 'release-preview-render')
  ) {
    throw new Error(`${file} claims late-result discard without releasing renderer work.`);
  }

  const finalArtifactIdentifiers = new Set();
  for (const artifact of vector.expectFinal.artifacts ?? []) {
    if (finalArtifactIdentifiers.has(artifact.id)) {
      throw new Error(`${file} duplicates final artifact assertion ${artifact.id}.`);
    }
    finalArtifactIdentifiers.add(artifact.id);
    if (!artifactIdentifiers.has(artifact.id)) {
      throw new Error(`${file} asserts final state for unseeded artifact ${artifact.id}.`);
    }
    const expectation = settledExpectations.get(artifact.revisionFrom);
    if (expectation === undefined) {
      throw new Error(
        `${file} final artifact references unknown outcome ${artifact.revisionFrom}.`,
      );
    }
    if (expectation.outcome !== 'result') {
      throw new Error(
        `${file} final artifact revision references non-result outcome ${artifact.revisionFrom}.`,
      );
    }
  }
}

function assertPriorSequenceComparison(file, stepId, expectation, settledExpectations) {
  if (expectation?.sameAs !== undefined && !settledExpectations.has(expectation.sameAs)) {
    throw new Error(
      `${file} step ${stepId} compares against non-prior settled outcome ${expectation.sameAs}.`,
    );
  }
}

function runHostSequenceSemanticNegativeDrills(entries) {
  const byAssertion = (assertion) => {
    const entry = entries.find(([, vector]) => vector.assertions.includes(assertion));
    if (entry === undefined) {
      throw new Error(`No host sequence vector is available for semantic drill ${assertion}.`);
    }
    return JSON.parse(JSON.stringify(entry[1]));
  };

  const duplicateArtifact = byAssertion('idempotency-changed-argument-refusal');
  duplicateArtifact.given.artifacts.push({
    ...duplicateArtifact.given.artifacts[0],
    revision: 'duplicate-seed-r2',
  });
  assertHostSequenceSemanticRejection(
    'duplicate artifact seed',
    duplicateArtifact,
    'duplicates artifact seed',
  );

  const duplicateRateLimit = byAssertion('fixed-window-rate-limit');
  duplicateRateLimit.given.rateLimits.push({
    ...duplicateRateLimit.given.rateLimits[0],
    maximumRequests: 2,
  });
  assertHostSequenceSemanticRejection(
    'duplicate rate-limit operation',
    duplicateRateLimit,
    'duplicates rate-limit operation',
  );

  const alreadySettled = byAssertion('operation-id-mismatch-refusal');
  alreadySettled.steps.push({
    action: 'settle',
    expect: { outcome: 'result', value: 'null' },
    id: 'duplicate-settlement',
    invocation: 'store-exact-operation',
  });
  assertHostSequenceSemanticRejection(
    'already-settled invocation',
    alreadySettled,
    'settles already-settled invocation',
  );

  const unknownSettlement = byAssertion('operation-id-mismatch-refusal');
  unknownSettlement.steps.push({
    action: 'settle',
    expect: { outcome: 'result', value: 'null' },
    id: 'unknown-settlement',
    invocation: 'invocations/unknown',
  });
  assertHostSequenceSemanticRejection(
    'unknown invocation settlement',
    unknownSettlement,
    'settles unknown invocation',
  );

  const pendingInvocation = byAssertion('operation-id-mismatch-refusal');
  const pendingStep = pendingInvocation.steps.find(
    (step) => step.action === 'invoke' && step.id === 'store-exact-operation',
  );
  pendingStep.completion = 'pending';
  delete pendingStep.expect;
  assertHostSequenceSemanticRejection(
    'unsettled pending invocation',
    pendingInvocation,
    'leaves pending invocations unsettled',
  );

  const unknownFinalReference = byAssertion('idempotency-changed-argument-refusal');
  unknownFinalReference.expectFinal.artifacts[0].revisionFrom = 'invocations/unknown';
  assertHostSequenceSemanticRejection(
    'unknown final-state reference',
    unknownFinalReference,
    'final artifact references unknown outcome',
  );

  const errorFinalReference = byAssertion('idempotency-changed-argument-refusal');
  errorFinalReference.expectFinal.artifacts[0].revisionFrom = 'publish-changed-intent';
  assertHostSequenceSemanticRejection(
    'error final-state reference',
    errorFinalReference,
    'final artifact revision references non-result outcome',
  );

  const invalidRenderArgument = byAssertion('cross-context-cancellation-isolation');
  const renderStep = invalidRenderArgument.steps.find(
    (step) => step.action === 'invoke' && `${step.port}.${step.operation}` === 'preview.render',
  );
  delete renderStep.argument.requestId;
  assertHostSequenceSemanticRejection(
    'invalid preview render argument',
    invalidRenderArgument,
    'violates the preview render payload contract',
  );

  const wrongRenderRelease = byAssertion('cross-context-cancellation-isolation');
  const releaseStep = wrongRenderRelease.steps.find(
    (step) => step.action === 'release-preview-render',
  );
  releaseStep.value.requestId = 'renders/wrong-request';
  assertHostSequenceSemanticRejection(
    'wrong preview release request',
    wrongRenderRelease,
    'releases a renderer payload for the wrong render request',
  );
}

function assertHostSequenceSemanticRejection(label, vector, expectedMessage) {
  try {
    validateHostSequenceSemantics(vector, `semantic-negative/${label}`);
  } catch (error) {
    if (error instanceof Error && error.message.includes(expectedMessage)) {
      return;
    }
    throw error;
  }
  throw new Error(`Host sequence semantic negative drill ${label} was accepted.`);
}

function assertSameNames(label, expected, actual) {
  if (JSON.stringify(expected) !== JSON.stringify(actual)) {
    throw new Error(
      `${label} differ: expected ${expected.join(', ')}, received ${actual.join(', ')}`,
    );
  }
}

function assertExactSet(label, expected, actual) {
  const expectedValues = [...new Set(expected)].sort();
  const actualValues = [...actual].sort();
  if (JSON.stringify(expectedValues) !== JSON.stringify(actualValues)) {
    throw new Error(
      `${label} differs: expected ${expectedValues.join(', ')}, received ${actualValues.join(', ')}`,
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

function canonicalJson(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(',')}]`;
  }
  const members = Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`);
  return `{${members.join(',')}}`;
}

function measureSchemaProfileBoundary(limit, schema) {
  const measurements = {
    maxAlternatives: 0,
    maxDescriptionLength: 0,
    maxEnumMembers: 0,
    maxExamples: 0,
    maxJsonDepth: 0,
    maxJsonItems: 0,
    maxJsonProperties: 0,
    maxObjectKeyLength: 0,
    maxPropertyNames: 0,
    maxReferenceLength: 0,
    maxReferences: 0,
    maxSchemaBytes: Buffer.byteLength(canonicalJson(schema), 'utf8'),
    maxSchemaDepth: 0,
    maxSchemaMapProperties: 0,
    maxSchemaNodes: 0,
    maxTitleLength: 0,
  };
  const measureName = (name) => {
    measurements.maxObjectKeyLength = Math.max(measurements.maxObjectKeyLength, [...name].length);
  };
  const visitJson = (value, depth) => {
    if (value === null || typeof value !== 'object') {
      return;
    }
    measurements.maxJsonDepth = Math.max(measurements.maxJsonDepth, depth);
    if (Array.isArray(value)) {
      measurements.maxJsonItems = Math.max(measurements.maxJsonItems, value.length);
      for (const member of value) {
        visitJson(member, depth + 1);
      }
      return;
    }
    const entries = Object.entries(value);
    measurements.maxJsonProperties = Math.max(measurements.maxJsonProperties, entries.length);
    for (const [name, member] of entries) {
      measureName(name);
      visitJson(member, depth + 1);
    }
  };
  const visitSchema = (candidate, depth) => {
    measurements.maxSchemaDepth = Math.max(measurements.maxSchemaDepth, depth);
    measurements.maxSchemaNodes += 1;
    if (typeof candidate === 'boolean') {
      return;
    }
    for (const [keyword, operand] of Object.entries(candidate)) {
      measureName(keyword);
      switch (keyword) {
        case '$defs':
        case 'properties': {
          const entries = Object.entries(operand);
          measurements.maxSchemaMapProperties = Math.max(
            measurements.maxSchemaMapProperties,
            entries.length,
          );
          for (const [name, member] of entries) {
            measureName(name);
            visitSchema(member, depth + 1);
          }
          break;
        }
        case 'additionalProperties':
        case 'else':
        case 'if':
        case 'items':
        case 'not':
        case 'propertyNames':
        case 'then':
          visitSchema(operand, depth + 1);
          break;
        case 'allOf':
        case 'anyOf':
        case 'oneOf':
        case 'prefixItems':
          measurements.maxAlternatives = Math.max(measurements.maxAlternatives, operand.length);
          for (const member of operand) {
            visitSchema(member, depth + 1);
          }
          break;
        case '$ref':
          measurements.maxReferences += 1;
          measurements.maxReferenceLength = Math.max(
            measurements.maxReferenceLength,
            [...operand].length,
          );
          break;
        case 'description':
          measurements.maxDescriptionLength = Math.max(
            measurements.maxDescriptionLength,
            [...operand].length,
          );
          break;
        case 'title':
          measurements.maxTitleLength = Math.max(measurements.maxTitleLength, [...operand].length);
          break;
        case 'enum':
          measurements.maxEnumMembers = Math.max(measurements.maxEnumMembers, operand.length);
          for (const member of operand) {
            visitJson(member, 1);
          }
          break;
        case 'examples':
          measurements.maxExamples = Math.max(measurements.maxExamples, operand.length);
          for (const member of operand) {
            visitJson(member, 1);
          }
          break;
        case 'const':
        case 'default':
          visitJson(operand, 1);
          break;
        case 'dependentRequired': {
          const entries = Object.entries(operand);
          measurements.maxSchemaMapProperties = Math.max(
            measurements.maxSchemaMapProperties,
            entries.length,
          );
          for (const [name, names] of entries) {
            measureName(name);
            measurements.maxPropertyNames = Math.max(measurements.maxPropertyNames, names.length);
            for (const member of names) {
              measureName(member);
            }
          }
          break;
        }
        case 'required':
          measurements.maxPropertyNames = Math.max(measurements.maxPropertyNames, operand.length);
          for (const member of operand) {
            measureName(member);
          }
          break;
      }
    }
  };
  visitSchema(schema, 1);
  return measurements[limit];
}

function previewNodeIds(draft) {
  const ids = [];
  const seen = new Set();
  const visit = (node) => {
    if (seen.has(node.id)) {
      throw new Error(`Preview vector draft contains duplicate node id ${node.id}.`);
    }
    seen.add(node.id);
    ids.push(node.id);
    for (const slot of Object.keys(node.slots).sort()) {
      for (const child of node.slots[slot]) {
        visit(child);
      }
    }
  };
  for (const root of draft.roots) {
    visit(root);
  }
  return ids;
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
