import { readFile } from 'node:fs/promises';

const canonicalCatalogUrl = new URL(
  '../schemas/examples/authoring-message-catalog.en.json',
  import.meta.url,
);
const shellCatalogUrl = new URL('../packages/studio-lit/src/catalogs/en.json', import.meta.url);
const testkitCatalogUrl = new URL(
  '../packages/testkit/fixtures/authoring-message-catalog.en.json',
  import.meta.url,
);

const canonicalBytes = await readFile(canonicalCatalogUrl);
for (const [label, url] of [
  ['Studio shell catalog', shellCatalogUrl],
  ['testkit catalog fixture', testkitCatalogUrl],
]) {
  const bytes = await readFile(url);
  if (!canonicalBytes.equals(bytes)) {
    throw new Error(`${label} is stale; run npm run contracts:sync.`);
  }
}

const catalog = JSON.parse(canonicalBytes.toString('utf8'));
if (
  catalog.kind !== 'authoring-message-catalog' ||
  catalog.contractVersion !== '0.1-draft' ||
  catalog.catalogVersion !== '1.7.0' ||
  catalog.locale !== 'en'
) {
  throw new Error('The canonical English authoring catalog has an unexpected identity.');
}

const keys = Object.keys(catalog.messages);
const sortedKeys = [...keys].sort();
if (JSON.stringify(keys) !== JSON.stringify(sortedKeys)) {
  throw new Error('Authoring message keys must be sorted for deterministic publication.');
}

for (const key of keys) {
  const entry = catalog.messages[key];
  const parameters = [
    ...new Set(
      [...entry.defaultMessage.matchAll(/\{([a-z][a-z0-9_-]*)\}/g)].map((match) => match[1]),
    ),
  ].sort();
  if (JSON.stringify(entry.parameters) !== JSON.stringify(parameters)) {
    throw new Error(
      `${key} declares parameters ${JSON.stringify(entry.parameters)} but uses ${JSON.stringify(parameters)}.`,
    );
  }
}

const source = (
  await Promise.all(
    [
      'contextual-authoring.ts',
      'hosted-start.ts',
      'kumwe-studio.ts',
      'outline.ts',
      'standalone-runtime.ts',
    ].map((file) =>
      readFile(new URL(`../packages/studio-lit/src/${file}`, import.meta.url), 'utf8'),
    ),
  )
).join('\n');
const usedKeys = [
  ...new Set(
    [...source.matchAll(/['"](studio\.(?:contextual|shell|standalone)\/[a-z0-9-]+)['"]/g)].map(
      (match) => match[1],
    ),
  ),
].sort();
if (JSON.stringify(usedKeys) !== JSON.stringify(sortedKeys)) {
  const unpublished = usedKeys.filter((key) => !catalog.messages[key]);
  const unused = sortedKeys.filter((key) => !usedKeys.includes(key));
  throw new Error(
    `Shell/catalog drift detected. Unpublished: ${unpublished.join(', ') || 'none'}. ` +
      `Unused: ${unused.join(', ') || 'none'}.`,
  );
}

console.log(`Verified ${keys.length} published authoring messages and their parameters.`);
