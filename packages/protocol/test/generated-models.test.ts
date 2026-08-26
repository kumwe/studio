import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

import { Ajv2020 } from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';

import {
  GENERATED_PROTOCOL_SCHEMA_FILES,
  GENERATED_TYPESCRIPT_MODEL_METADATA,
  protocolSchemas,
  roundTripGeneratedProtocolModel,
  type GeneratedProtocolModelMap,
  type GeneratedProtocolSchemaFile,
} from '../src/index.js';

const schemaDirectory = join(process.cwd(), 'schemas');
const exampleDirectory = join(schemaDirectory, 'examples');
const testkitDirectory = join(process.cwd(), 'packages/testkit');
const schemaManifestPath = join(process.cwd(), 'packages/protocol/schemas/manifest.json');

const exampleSchemas = new Map<GeneratedProtocolSchemaFile, readonly string[]>([
  ['authoring-message-catalog.schema.json', ['authoring-message-catalog.en.json']],
  ['block-definition.schema.json', ['block.grid.example.json', 'block.price.example.json']],
  ['blueprint.schema.json', ['blueprint.product.example.json']],
  ['command.schema.json', ['command.move-node.example.json']],
  ['content-model.schema.json', ['content-model.product.example.json']],
  ['design-vocabulary.schema.json', ['design-vocabulary.example.json']],
  ['entry.schema.json', ['entry.product.example.json']],
  ['field-adapter.schema.json', ['field-adapter.example.json']],
  ['host-capabilities.schema.json', ['host-capabilities.example.json']],
  ['host-error.schema.json', ['host-error.conflict.example.json']],
  ['host-operations.schema.json', ['host-operations.example.json']],
  ['inspector.schema.json', ['inspector.example.json']],
  ['media-asset.schema.json', ['media-asset.example.json', 'media-asset.processing.example.json']],
  ['media-reference.schema.json', ['media-reference.example.json']],
  ['media-upload-grant.schema.json', ['media-upload-grant.example.json']],
  ['media-upload-session.schema.json', ['media-upload-session.transferring.example.json']],
  ['migration.schema.json', ['migration.example.json']],
  ['pattern.schema.json', ['pattern.example.json']],
  ['plugin-manifest.schema.json', ['plugin.example.json']],
  ['preview-message.schema.json', ['preview.render.example.json']],
  ['provenance.schema.json', ['provenance.example.json']],
  ['rich-text.schema.json', ['rich-text.example.json']],
  ['studio-config.schema.json', ['studio-config.example.json']],
  ['theme.schema.json', ['theme.example.json']],
  ['unresolved-contribution.schema.json', ['unresolved-contribution.example.json']],
]);

const corpusGroups: readonly {
  directory: string;
  schemaFile: GeneratedProtocolSchemaFile;
}[] = [
  {
    directory: join(schemaDirectory, 'vectors/binding-projection'),
    schemaFile: 'binding-projection-vector.schema.json',
  },
  {
    directory: join(schemaDirectory, 'vectors/canonical'),
    schemaFile: 'canonical-vector.schema.json',
  },
  {
    directory: join(schemaDirectory, 'vectors/command'),
    schemaFile: 'command-vector.schema.json',
  },
  {
    directory: join(schemaDirectory, 'vectors/host'),
    schemaFile: 'host-vector.schema.json',
  },
  {
    directory: join(schemaDirectory, 'vectors/host-sequence'),
    schemaFile: 'host-sequence-vector.schema.json',
  },
  {
    directory: join(schemaDirectory, 'vectors/media'),
    schemaFile: 'media-vector.schema.json',
  },
  {
    directory: join(schemaDirectory, 'vectors/preview'),
    schemaFile: 'preview-vector.schema.json',
  },
  {
    directory: join(schemaDirectory, 'vectors/schema-profile'),
    schemaFile: 'schema-profile-vector.schema.json',
  },
  {
    directory: join(schemaDirectory, 'conformance/authoring-web'),
    schemaFile: 'authoring-web-vector.schema.json',
  },
  {
    directory: join(schemaDirectory, 'conformance/renderer-web'),
    schemaFile: 'renderer-web-vector.schema.json',
  },
  {
    directory: join(schemaDirectory, 'conformance/rich-text'),
    schemaFile: 'rich-text-projection.schema.json',
  },
];

const ajv = new Ajv2020({ allErrors: true, strict: true });
for (const schema of protocolSchemas) ajv.addSchema(schema);

describe('generated TypeScript protocol models', () => {
  it('projects every canonical schema and records its reproducible source coordinate', async () => {
    const canonicalFiles = (await readdir(schemaDirectory))
      .filter((file) => file.endsWith('.schema.json'))
      .sort();
    const registeredFiles = protocolSchemas
      .map((schema) => basename(new URL(schema.$id ?? '').pathname))
      .sort();

    expect(GENERATED_PROTOCOL_SCHEMA_FILES).toEqual(canonicalFiles);
    expect(registeredFiles).toEqual(canonicalFiles);
    expect(GENERATED_TYPESCRIPT_MODEL_METADATA).toMatchObject({
      documentContractRevision: '0.1-draft',
      generator: {
        name: '@kumwe/studio/typescript-model-generator',
        version: '1.0.0',
      },
      schemaCount: canonicalFiles.length,
      schemaEpoch: 'https://schemas.kumwe.org/studio/v1/',
      supportedWireProtocolRange: '0.1.0-draft.2',
    });
    const manifestBytes = await readFile(schemaManifestPath);
    const manifest = JSON.parse(manifestBytes.toString('utf8')) as {
      contractVersion: string;
      epoch: string;
      generator: { name: string; version: string };
    };
    expect(GENERATED_TYPESCRIPT_MODEL_METADATA.schemaManifestDigest).toBe(
      `sha256-${createHash('sha256').update(manifestBytes).digest('base64')}`,
    );
    expect(manifest).toMatchObject({
      contractVersion: '0.1-draft',
      epoch: 'https://schemas.kumwe.org/studio/v1/',
      generator: { name: '@kumwe/studio/schema-manifest', version: '1.0.0' },
    });
  });

  it('schema-validates and JSON-round-trips every applicable positive fixture', async () => {
    const exercised: string[] = [];
    const exampleFiles = (await readdir(exampleDirectory))
      .filter((file) => file.endsWith('.json'))
      .sort();
    const mappedExampleFiles = [...exampleSchemas.values()].flat().sort();
    expect(mappedExampleFiles).toEqual(exampleFiles);

    for (const [schemaFile, files] of exampleSchemas) {
      for (const file of files) {
        await assertSchemaRoundTrip(schemaFile, join(exampleDirectory, file));
        exercised.push(`examples/${file}`);
      }
    }
    for (const { directory, schemaFile } of corpusGroups) {
      const files = (await readdir(directory)).filter((file) => file.endsWith('.json')).sort();
      expect(files.length).toBeGreaterThan(0);
      for (const file of files) {
        await assertSchemaRoundTrip(schemaFile, join(directory, file));
        exercised.push(`${schemaFile}:${file}`);
      }
    }
    await assertSchemaRoundTrip(
      'corpus-manifest.schema.json',
      join(testkitDirectory, 'corpus-manifest.json'),
    );
    await assertSchemaRoundTrip(
      'studio-release.schema.json',
      join(process.cwd(), 'studio-release.json'),
    );
    exercised.push('corpus-manifest.json', 'studio-release.json');

    expect(exercised).toHaveLength(236);
  }, 15_000);
});

async function assertSchemaRoundTrip<SchemaFile extends GeneratedProtocolSchemaFile>(
  schemaFile: SchemaFile,
  fixturePath: string,
): Promise<GeneratedProtocolModelMap[SchemaFile]> {
  const value: unknown = JSON.parse(await readFile(fixturePath, 'utf8'));
  const schema = protocolSchemas.find(
    (candidate) => basename(new URL(candidate.$id ?? '').pathname) === schemaFile,
  );
  if (schema?.$id === undefined) {
    throw new Error(`No registered schema is available for ${schemaFile}.`);
  }
  const validate = ajv.getSchema(schema.$id);
  expect(validate, `${schemaFile} has no compiled validator`).toBeDefined();
  expect(validate?.(value), ajv.errorsText(validate?.errors)).toBe(true);

  // Runtime schema validation is the explicit unknown-to-model boundary. The separate synthesized
  // compiler lane proves direct literal assignability to each exact root without this assertion.
  const model = value as GeneratedProtocolModelMap[SchemaFile];
  const roundTripped = roundTripGeneratedProtocolModel(schemaFile, model);
  expect(JSON.stringify(roundTripped)).toBe(JSON.stringify(value));
  return roundTripped;
}
