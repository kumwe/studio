import { createHash } from 'node:crypto';
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { buildSchemaManifest, serializeSchemaManifest } from './lib/schema-manifest.mjs';

const sourceDirectory = new URL('../schemas/', import.meta.url);
const targetDirectory = new URL('../packages/protocol/schemas/', import.meta.url);
const exampleDirectory = new URL('../schemas/examples/', import.meta.url);
const fixtureDirectory = new URL('../packages/testkit/fixtures/', import.meta.url);
const englishMessageCatalog = new URL(
  '../schemas/examples/authoring-message-catalog.en.json',
  import.meta.url,
);
const studioCatalogDirectory = new URL('../packages/studio-lit/src/catalogs/', import.meta.url);
const vectorDirectory = new URL('../schemas/vectors/command/', import.meta.url);
const vectorTargetDirectory = new URL('../packages/testkit/vectors/command/', import.meta.url);
const bindingProjectionVectorDirectory = new URL(
  '../schemas/vectors/binding-projection/',
  import.meta.url,
);
const bindingProjectionVectorTargetDirectory = new URL(
  '../packages/testkit/vectors/binding-projection/',
  import.meta.url,
);
const mediaVectorDirectory = new URL('../schemas/vectors/media/', import.meta.url);
const mediaVectorTargetDirectory = new URL('../packages/testkit/vectors/media/', import.meta.url);
const canonicalVectorDirectory = new URL('../schemas/vectors/canonical/', import.meta.url);
const canonicalVectorTargetDirectory = new URL(
  '../packages/testkit/vectors/canonical/',
  import.meta.url,
);
const hostVectorDirectory = new URL('../schemas/vectors/host/', import.meta.url);
const hostVectorTargetDirectory = new URL('../packages/testkit/vectors/host/', import.meta.url);
const hostSequenceVectorDirectory = new URL('../schemas/vectors/host-sequence/', import.meta.url);
const hostSequenceVectorTargetDirectory = new URL(
  '../packages/testkit/vectors/host-sequence/',
  import.meta.url,
);
const authoringHttpVectorDirectory = new URL('../schemas/vectors/authoring-http/', import.meta.url);
const authoringHttpVectorTargetDirectory = new URL(
  '../packages/testkit/vectors/authoring-http/',
  import.meta.url,
);
const previewVectorDirectory = new URL('../schemas/vectors/preview/', import.meta.url);
const previewVectorTargetDirectory = new URL(
  '../packages/testkit/vectors/preview/',
  import.meta.url,
);
const schemaProfileVectorDirectory = new URL('../schemas/vectors/schema-profile/', import.meta.url);
const schemaProfileVectorTargetDirectory = new URL(
  '../packages/testkit/vectors/schema-profile/',
  import.meta.url,
);
const invalidDirectory = new URL('../schemas/invalid/', import.meta.url);
const invalidTargetDirectory = new URL('../packages/testkit/invalid/', import.meta.url);
const conformanceDirectory = new URL('../schemas/conformance/rich-text/', import.meta.url);
const conformanceTargetDirectory = new URL(
  '../packages/testkit/conformance/rich-text/',
  import.meta.url,
);
const authoringWebConformanceDirectory = new URL(
  '../schemas/conformance/authoring-web/',
  import.meta.url,
);
const authoringWebConformanceTargetDirectory = new URL(
  '../packages/testkit/conformance/authoring-web/',
  import.meta.url,
);
const rendererWebConformanceDirectory = new URL(
  '../schemas/conformance/renderer-web/',
  import.meta.url,
);
const rendererWebConformanceTargetDirectory = new URL(
  '../packages/testkit/conformance/renderer-web/',
  import.meta.url,
);

await rm(targetDirectory, { force: true, recursive: true });
await mkdir(targetDirectory, { recursive: true });
await rm(fixtureDirectory, { force: true, recursive: true });
await mkdir(fixtureDirectory, { recursive: true });
await mkdir(studioCatalogDirectory, { recursive: true });
await rm(new URL('../packages/testkit/vectors/', import.meta.url), {
  force: true,
  recursive: true,
});
await mkdir(vectorTargetDirectory, { recursive: true });
await mkdir(bindingProjectionVectorTargetDirectory, { recursive: true });
await mkdir(mediaVectorTargetDirectory, { recursive: true });
await mkdir(hostVectorTargetDirectory, { recursive: true });
await mkdir(hostSequenceVectorTargetDirectory, { recursive: true });
await mkdir(authoringHttpVectorTargetDirectory, { recursive: true });
await mkdir(previewVectorTargetDirectory, { recursive: true });
await mkdir(schemaProfileVectorTargetDirectory, { recursive: true });
await mkdir(canonicalVectorTargetDirectory, { recursive: true });
await rm(invalidTargetDirectory, { force: true, recursive: true });
await mkdir(invalidTargetDirectory, { recursive: true });
await rm(new URL('../packages/testkit/conformance/', import.meta.url), {
  force: true,
  recursive: true,
});
await mkdir(conformanceTargetDirectory, { recursive: true });
await mkdir(authoringWebConformanceTargetDirectory, { recursive: true });
await mkdir(rendererWebConformanceTargetDirectory, { recursive: true });

for (const entry of await readdir(sourceDirectory, { withFileTypes: true })) {
  if (entry.isFile() && entry.name.endsWith('.schema.json')) {
    await cp(new URL(entry.name, sourceDirectory), new URL(entry.name, targetDirectory));
  }
}

for (const entry of await readdir(exampleDirectory, { withFileTypes: true })) {
  if (entry.isFile() && entry.name.endsWith('.json')) {
    await cp(new URL(entry.name, exampleDirectory), new URL(entry.name, fixtureDirectory));
  }
}

await cp(englishMessageCatalog, new URL('en.json', studioCatalogDirectory));

for (const entry of await readdir(vectorDirectory, { withFileTypes: true })) {
  if (entry.isFile() && entry.name.endsWith('.json')) {
    await cp(new URL(entry.name, vectorDirectory), new URL(entry.name, vectorTargetDirectory));
  }
}

for (const entry of await readdir(bindingProjectionVectorDirectory, { withFileTypes: true })) {
  if (entry.isFile() && entry.name.endsWith('.json')) {
    await cp(
      new URL(entry.name, bindingProjectionVectorDirectory),
      new URL(entry.name, bindingProjectionVectorTargetDirectory),
    );
  }
}

for (const entry of await readdir(mediaVectorDirectory, { withFileTypes: true })) {
  if (entry.isFile() && entry.name.endsWith('.json')) {
    await cp(
      new URL(entry.name, mediaVectorDirectory),
      new URL(entry.name, mediaVectorTargetDirectory),
    );
  }
}

for (const entry of await readdir(hostVectorDirectory, { withFileTypes: true })) {
  if (entry.isFile() && entry.name.endsWith('.json')) {
    await cp(
      new URL(entry.name, hostVectorDirectory),
      new URL(entry.name, hostVectorTargetDirectory),
    );
  }
}

for (const entry of await readdir(hostSequenceVectorDirectory, { withFileTypes: true })) {
  if (entry.isFile() && entry.name.endsWith('.json')) {
    await cp(
      new URL(entry.name, hostSequenceVectorDirectory),
      new URL(entry.name, hostSequenceVectorTargetDirectory),
    );
  }
}

for (const entry of await readdir(authoringHttpVectorDirectory, { withFileTypes: true })) {
  if (entry.isFile() && entry.name.endsWith('.json')) {
    await cp(
      new URL(entry.name, authoringHttpVectorDirectory),
      new URL(entry.name, authoringHttpVectorTargetDirectory),
    );
  }
}

for (const entry of await readdir(previewVectorDirectory, { withFileTypes: true })) {
  if (entry.isFile() && entry.name.endsWith('.json')) {
    await cp(
      new URL(entry.name, previewVectorDirectory),
      new URL(entry.name, previewVectorTargetDirectory),
    );
  }
}

for (const entry of await readdir(schemaProfileVectorDirectory, { withFileTypes: true })) {
  if (entry.isFile() && entry.name.endsWith('.json')) {
    await cp(
      new URL(entry.name, schemaProfileVectorDirectory),
      new URL(entry.name, schemaProfileVectorTargetDirectory),
    );
  }
}

for (const entry of await readdir(canonicalVectorDirectory, { withFileTypes: true })) {
  if (entry.isFile() && entry.name.endsWith('.json')) {
    await cp(
      new URL(entry.name, canonicalVectorDirectory),
      new URL(entry.name, canonicalVectorTargetDirectory),
    );
  }
}

for (const entry of await readdir(invalidDirectory, { withFileTypes: true })) {
  if (entry.isFile() && entry.name.endsWith('.json')) {
    await cp(new URL(entry.name, invalidDirectory), new URL(entry.name, invalidTargetDirectory));
  }
}

for (const entry of await readdir(conformanceDirectory, { withFileTypes: true })) {
  if (entry.isFile() && entry.name.endsWith('.json')) {
    await cp(
      new URL(entry.name, conformanceDirectory),
      new URL(entry.name, conformanceTargetDirectory),
    );
  }
}

for (const entry of await readdir(authoringWebConformanceDirectory, { withFileTypes: true })) {
  if (entry.isFile() && entry.name.endsWith('.json')) {
    await cp(
      new URL(entry.name, authoringWebConformanceDirectory),
      new URL(entry.name, authoringWebConformanceTargetDirectory),
    );
  }
}
for (const entry of await readdir(rendererWebConformanceDirectory, { withFileTypes: true })) {
  if (entry.isFile() && entry.name.endsWith('.json')) {
    await cp(
      new URL(entry.name, rendererWebConformanceDirectory),
      new URL(entry.name, rendererWebConformanceTargetDirectory),
    );
  }
}

const copied = (await readdir(targetDirectory)).filter((name) => name.endsWith('.schema.json'));
if (copied.length === 0) {
  throw new Error(`No schemas were copied to ${join(targetDirectory.pathname)}.`);
}

const fixtures = (await readdir(fixtureDirectory)).filter((name) => name.endsWith('.json'));
if (fixtures.length === 0) {
  throw new Error(`No fixtures were copied to ${join(fixtureDirectory.pathname)}.`);
}

const vectors = (await readdir(vectorTargetDirectory)).filter((name) => name.endsWith('.json'));
if (vectors.length === 0) {
  throw new Error(`No command vectors were copied to ${join(vectorTargetDirectory.pathname)}.`);
}

const bindingProjectionVectors = (await readdir(bindingProjectionVectorTargetDirectory)).filter(
  (name) => name.endsWith('.json'),
);
if (bindingProjectionVectors.length === 0) {
  throw new Error(
    `No binding projection vectors were copied to ${join(bindingProjectionVectorTargetDirectory.pathname)}.`,
  );
}

const mediaVectors = (await readdir(mediaVectorTargetDirectory)).filter((name) =>
  name.endsWith('.json'),
);
if (mediaVectors.length === 0) {
  throw new Error(`No media vectors were copied to ${join(mediaVectorTargetDirectory.pathname)}.`);
}

const hostVectors = (await readdir(hostVectorTargetDirectory)).filter((name) =>
  name.endsWith('.json'),
);
if (hostVectors.length === 0) {
  throw new Error(`No host vectors were copied to ${join(hostVectorTargetDirectory.pathname)}.`);
}

const hostSequenceVectors = (await readdir(hostSequenceVectorTargetDirectory)).filter((name) =>
  name.endsWith('.json'),
);
if (hostSequenceVectors.length === 0) {
  throw new Error(
    `No host sequence vectors were copied to ${join(hostSequenceVectorTargetDirectory.pathname)}.`,
  );
}

const authoringHttpVectors = (await readdir(authoringHttpVectorTargetDirectory)).filter((name) =>
  name.endsWith('.json'),
);
if (authoringHttpVectors.length === 0) {
  throw new Error(
    `No authoring HTTP vectors were copied to ${join(authoringHttpVectorTargetDirectory.pathname)}.`,
  );
}

const previewVectors = (await readdir(previewVectorTargetDirectory)).filter((name) =>
  name.endsWith('.json'),
);
if (previewVectors.length === 0) {
  throw new Error(
    `No preview identity vectors were copied to ${join(previewVectorTargetDirectory.pathname)}.`,
  );
}

const schemaProfileVectors = (await readdir(schemaProfileVectorTargetDirectory)).filter((name) =>
  name.endsWith('.json'),
);
if (schemaProfileVectors.length === 0) {
  throw new Error(
    `No schema-profile vectors were copied to ${join(schemaProfileVectorTargetDirectory.pathname)}.`,
  );
}

const canonicalVectors = (await readdir(canonicalVectorTargetDirectory)).filter((name) =>
  name.endsWith('.json'),
);
if (canonicalVectors.length === 0) {
  throw new Error(
    `No canonical vectors were copied to ${join(canonicalVectorTargetDirectory.pathname)}.`,
  );
}

const invalid = (await readdir(invalidTargetDirectory)).filter((name) => name.endsWith('.json'));
if (invalid.length === 0) {
  throw new Error(`No negative fixtures were copied to ${join(invalidTargetDirectory.pathname)}.`);
}

const conformance = (await readdir(conformanceTargetDirectory)).filter((name) =>
  name.endsWith('.json'),
);
if (conformance.length === 0) {
  throw new Error(
    `No renderer-conformance fixtures were copied to ${join(conformanceTargetDirectory.pathname)}.`,
  );
}
const authoringWebConformance = (await readdir(authoringWebConformanceTargetDirectory)).filter(
  (name) => name.endsWith('.json'),
);
if (authoringWebConformance.length === 0) {
  throw new Error(
    `No authoring-web conformance vectors were copied to ${join(authoringWebConformanceTargetDirectory.pathname)}.`,
  );
}

const rendererWebConformance = (await readdir(rendererWebConformanceTargetDirectory)).filter(
  (name) => name.endsWith('.json'),
);
if (rendererWebConformance.length === 0) {
  throw new Error(
    `No renderer-web conformance vectors were copied to ${join(rendererWebConformanceTargetDirectory.pathname)}.`,
  );
}

const manifestEntries = [];
for (const name of copied.sort()) {
  const bytes = await readFile(new URL(name, sourceDirectory));
  const schema = JSON.parse(bytes.toString('utf8'));
  manifestEntries.push({ bytes, file: name, schema });
}
const manifest = buildSchemaManifest(manifestEntries);
await writeFile(new URL('manifest.json', targetDirectory), serializeSchemaManifest(manifest));

// The corpus manifest lets a host verify a vendored copy of the whole corpus,
// not only the schemas: a digest that differs by one byte is the difference
// between replaying the contract and replaying a stale fork of it.
const corpusGroups = [
  { directory: fixtureDirectory, name: 'fixtures', path: 'fixtures' },
  {
    directory: bindingProjectionVectorTargetDirectory,
    name: 'binding-projection-vectors',
    path: 'vectors/binding-projection',
  },
  { directory: vectorTargetDirectory, name: 'command-vectors', path: 'vectors/command' },
  { directory: mediaVectorTargetDirectory, name: 'media-vectors', path: 'vectors/media' },
  { directory: hostVectorTargetDirectory, name: 'host-vectors', path: 'vectors/host' },
  {
    directory: hostSequenceVectorTargetDirectory,
    name: 'host-sequence-vectors',
    path: 'vectors/host-sequence',
  },
  {
    directory: authoringHttpVectorTargetDirectory,
    name: 'authoring-http-vectors',
    path: 'vectors/authoring-http',
  },
  {
    directory: previewVectorTargetDirectory,
    name: 'preview-vectors',
    path: 'vectors/preview',
  },
  {
    directory: schemaProfileVectorTargetDirectory,
    name: 'schema-profile-vectors',
    path: 'vectors/schema-profile',
  },
  {
    directory: canonicalVectorTargetDirectory,
    name: 'canonical-vectors',
    path: 'vectors/canonical',
  },
  { directory: invalidTargetDirectory, name: 'invalid-fixtures', path: 'invalid' },
  {
    directory: conformanceTargetDirectory,
    name: 'rich-text-conformance',
    path: 'conformance/rich-text',
  },
  {
    directory: authoringWebConformanceTargetDirectory,
    name: 'authoring-web-conformance',
    path: 'conformance/authoring-web',
  },
  {
    directory: rendererWebConformanceTargetDirectory,
    name: 'renderer-web-conformance',
    path: 'conformance/renderer-web',
  },
];
const corpusEntries = [];
for (const group of corpusGroups) {
  const names = (await readdir(group.directory)).filter((name) => name.endsWith('.json')).sort();
  const files = [];
  for (const name of names) {
    const bytes = await readFile(new URL(name, group.directory));
    files.push({
      digest: `sha256-${createHash('sha256').update(bytes).digest('base64')}`,
      file: name,
    });
  }
  corpusEntries.push({ files, group: group.name, path: group.path });
}
await writeFile(
  new URL('corpus-manifest.json', new URL('../packages/testkit/', import.meta.url)),
  `${JSON.stringify(
    {
      contractVersion: '0.1-draft',
      groups: corpusEntries,
      kind: 'corpus-manifest',
    },
    null,
    2,
  )}\n`,
);
