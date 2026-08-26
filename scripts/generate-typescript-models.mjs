import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';

import {
  buildSchemaManifest,
  DOCUMENT_CONTRACT_REVISION,
  SCHEMA_EPOCH,
  serializeSchemaManifest,
  sha256Digest,
} from './lib/schema-manifest.mjs';
import { generateTypeScriptModels } from './lib/typescript-model-generator.mjs';
import { parseProtocolConstants } from './release-record.mjs';

const schemaDirectory = new URL('../schemas/', import.meta.url);
const outputFile = new URL('../packages/protocol/src/generated/schema-models.ts', import.meta.url);
const check = process.argv.includes('--check');
const unexpectedArguments = process.argv.slice(2).filter((argument) => argument !== '--check');
if (unexpectedArguments.length > 0) {
  throw new Error(`Unknown TypeScript model generator argument ${unexpectedArguments[0]}.`);
}

const schemaSources = await Promise.all(
  (await readdir(schemaDirectory))
    .filter((file) => file.endsWith('.schema.json'))
    .sort()
    .map(async (file) => {
      const bytes = await readFile(new URL(file, schemaDirectory));
      return { bytes, file, schema: JSON.parse(bytes.toString('utf8')) };
    }),
);
const protocolSource = await readFile(
  new URL('../packages/protocol/src/types.ts', import.meta.url),
  'utf8',
);
const { contractVersion, protocolVersion } = parseProtocolConstants(protocolSource);
if (contractVersion !== DOCUMENT_CONTRACT_REVISION) {
  throw new Error(
    `Protocol contract revision ${contractVersion} does not match schema manifest revision ${DOCUMENT_CONTRACT_REVISION}.`,
  );
}
const manifest = buildSchemaManifest(schemaSources);
const manifestBytes = serializeSchemaManifest(manifest);
const generated = await generateTypeScriptModels({
  contractVersion: DOCUMENT_CONTRACT_REVISION,
  epoch: SCHEMA_EPOCH,
  manifestDigest: sha256Digest(manifestBytes),
  schemaSources,
  supportedWireProtocolRange: protocolVersion,
});

if (check) {
  let actual;
  try {
    actual = await readFile(outputFile, 'utf8');
  } catch (error) {
    throw new Error(
      'Generated TypeScript models are missing; run npm run protocol:models:generate.',
      {
        cause: error,
      },
    );
  }
  if (actual !== generated) {
    throw new Error('Generated TypeScript models are stale; run npm run protocol:models:generate.');
  }
  console.log(`${schemaSources.length} generated TypeScript schema models are current.`);
} else {
  await mkdir(new URL('../packages/protocol/src/generated/', import.meta.url), { recursive: true });
  await writeFile(outputFile, generated);
  console.log(
    `${schemaSources.length} TypeScript schema models generated at ${outputFile.pathname}.`,
  );
}
