import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { test } from 'node:test';
import { promisify } from 'node:util';

import {
  buildSchemaManifest,
  serializeSchemaManifest,
  sha256Digest,
} from '../lib/schema-manifest.mjs';
import { generateTypeScriptModels } from '../lib/typescript-model-generator.mjs';

const execFileAsync = promisify(execFile);

const baseSchema = {
  $id: 'https://schemas.kumwe.org/studio/v1/example.schema.json',
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  additionalProperties: false,
  properties: {
    kind: { const: 'example' },
    payload: {
      additionalProperties: { type: 'string' },
      type: 'object',
    },
  },
  required: ['kind', 'payload'],
  title: 'Adversarial example',
  type: 'object',
};

test('TypeScript generation is deterministic, structural, and coordinate-bound', async () => {
  const schemaSources = [schemaSource('example.schema.json', baseSchema)];
  const manifestDigest = sha256Digest(serializeSchemaManifest(buildSchemaManifest(schemaSources)));
  const input = {
    contractVersion: '0.1-draft',
    epoch: 'https://schemas.kumwe.org/studio/v1/',
    manifestDigest,
    schemaSources,
    supportedWireProtocolRange: '0.1.0-draft.2',
  };
  const first = await generateTypeScriptModels(input);
  const second = await generateTypeScriptModels(input);

  assert.equal(first, second);
  assert.match(first, /export type GeneratedExample =/u);
  assert.match(first, /payload: \{ \[key: string\]: string \}/u);
  assert.match(first, new RegExp(escapeRegExp(manifestDigest), 'u'));
  assert.doesNotMatch(first, /\b(?:any|unknown)\b/u);
});

test('schema-byte drift changes both manifest digest and generated output', async () => {
  const originalSources = [schemaSource('example.schema.json', baseSchema)];
  const changedSources = [
    schemaSource('example.schema.json', {
      ...baseSchema,
      properties: { ...baseSchema.properties, revision: { type: 'string' } },
    }),
  ];
  const originalDigest = sha256Digest(
    serializeSchemaManifest(buildSchemaManifest(originalSources)),
  );
  const changedDigest = sha256Digest(serializeSchemaManifest(buildSchemaManifest(changedSources)));
  assert.notEqual(originalDigest, changedDigest);

  const original = await generateTypeScriptModels({
    contractVersion: '0.1-draft',
    epoch: 'https://schemas.kumwe.org/studio/v1/',
    manifestDigest: originalDigest,
    schemaSources: originalSources,
    supportedWireProtocolRange: '0.1.0-draft.2',
  });
  const changed = await generateTypeScriptModels({
    contractVersion: '0.1-draft',
    epoch: 'https://schemas.kumwe.org/studio/v1/',
    manifestDigest: changedDigest,
    schemaSources: changedSources,
    supportedWireProtocolRange: '0.1.0-draft.2',
  });
  assert.notEqual(original, changed);
  assert.match(changed, /revision\?: string/u);
});

test('generator output is byte-identical under English and Turkish process locales', async () => {
  const generatorUrl = new URL('../lib/typescript-model-generator.mjs', import.meta.url).href;
  const manifestUrl = new URL('../lib/schema-manifest.mjs', import.meta.url).href;
  const probe = `
    import { generateTypeScriptModels } from ${JSON.stringify(generatorUrl)};
    import { buildSchemaManifest, serializeSchemaManifest } from ${JSON.stringify(manifestUrl)};
    const schema = {
      $id: 'https://schemas.kumwe.org/studio/v1/locale.schema.json',
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      additionalProperties: false,
      properties: {
        izmir: { type: 'string' },
        'ızmir': { type: 'string' },
      },
      required: ['izmir', 'ızmir'],
      type: 'object',
    };
    const generated = await generateTypeScriptModels({
      contractVersion: '0.1-draft',
      epoch: 'https://schemas.kumwe.org/studio/v1/',
      manifestDigest: 'sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
      schemaSources: [{ bytes: Buffer.from(JSON.stringify(schema)), file: 'locale.schema.json', schema }],
      supportedWireProtocolRange: '0.1.0-draft.2',
    });
    const manifestSources = ['izmir.schema.json', 'ızmir.schema.json'].map((file) => ({
      bytes: Buffer.from(file),
      file,
      schema: { $id: 'https://schemas.kumwe.org/studio/v1/' + file },
    }));
    const manifest = serializeSchemaManifest(buildSchemaManifest(manifestSources));
    process.stdout.write(JSON.stringify({
      locale: Intl.Collator().resolvedOptions().locale,
      generated,
      manifest,
    }));
  `;
  const [english, turkish] = await Promise.all([
    runLocaleProbe(probe, 'en_US.UTF-8'),
    runLocaleProbe(probe, 'tr_TR.UTF-8'),
  ]);

  assert.match(english.locale, /^en/iu);
  assert.match(turkish.locale, /^tr/iu);
  assert.equal(english.generated, turkish.generated);
  assert.equal(english.manifest, turkish.manifest);
});

test('additional object members stay assignable without weakening known properties', async () => {
  const schema = {
    ...baseSchema,
    properties: {
      count: { type: 'number' },
      kind: { const: 'example' },
    },
    required: ['kind'],
    additionalProperties: { type: 'boolean' },
  };
  const generated = await generateFor(schema);

  assert.match(generated, /count\?: number;/u);
  assert.match(generated, /kind: 'example';/u);
  assert.match(generated, /\[key: string\]: boolean \| number \| 'example';/u);
});

test('untyped structural keywords do not falsely exclude scalar instances', async () => {
  const common = {
    $id: baseSchema.$id,
    $schema: baseSchema.$schema,
  };
  const cases = [
    ['properties', { ...common, properties: { kind: { const: 'example' } }, required: ['kind'] }],
    ['additionalProperties', { ...common, additionalProperties: { type: 'string' } }],
    ['prefixItems', { ...common, prefixItems: [{ type: 'string' }] }],
    ['items', { ...common, items: { type: 'string' } }],
  ];

  for (const [keyword, schema] of cases) {
    const generated = await generateFor(schema);
    assert.match(
      generated,
      /export type GeneratedExample = GeneratedJsonValue;/u,
      `${keyword} without type must preserve schema-valid scalars`,
    );
  }
});

test('prefixItems and minItems produce the exact required tuple prefix', async () => {
  const optionalTail = await generateFor({
    ...baseSchema,
    additionalProperties: undefined,
    properties: undefined,
    required: undefined,
    type: 'array',
    prefixItems: [{ type: 'string' }, { type: 'integer' }],
    minItems: 1,
    items: false,
  });
  assert.match(optionalTail, /export type GeneratedExample = \[string, number\?\];/u);

  const requiredRest = await generateFor({
    ...baseSchema,
    additionalProperties: undefined,
    properties: undefined,
    required: undefined,
    type: 'array',
    prefixItems: [{ type: 'string' }],
    minItems: 3,
    items: { type: 'boolean' },
  });
  assert.match(
    requiredRest,
    /export type GeneratedExample = \[string, boolean, boolean, \.\.\.boolean\[\]\];/u,
  );
});

test('generator fails closed on unsupported keywords instead of widening silently', async () => {
  const schema = { ...baseSchema, unevaluatedProperties: false };
  await assert.rejects(
    generateTypeScriptModels({
      contractVersion: '0.1-draft',
      epoch: 'https://schemas.kumwe.org/studio/v1/',
      manifestDigest: 'sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
      schemaSources: [schemaSource('example.schema.json', schema)],
      supportedWireProtocolRange: '0.1.0-draft.2',
    }),
    /Unsupported JSON Schema keyword unevaluatedProperties/u,
  );

  const patterned = {
    ...baseSchema,
    patternProperties: { '^x-': { type: 'string' } },
  };
  await assert.rejects(
    generateFor(patterned),
    /Unsupported JSON Schema keyword patternProperties/u,
  );
});

test('generator fails closed on unresolved references and duplicate schema identifiers', async () => {
  const unresolved = {
    ...baseSchema,
    properties: { payload: { $ref: 'missing.schema.json' } },
    required: ['payload'],
  };
  await assert.rejects(
    generateTypeScriptModels({
      contractVersion: '0.1-draft',
      epoch: 'https://schemas.kumwe.org/studio/v1/',
      manifestDigest: 'sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
      schemaSources: [schemaSource('example.schema.json', unresolved)],
      supportedWireProtocolRange: '0.1.0-draft.2',
    }),
    /Unresolved schema reference missing\.schema\.json/u,
  );

  await assert.rejects(
    generateTypeScriptModels({
      contractVersion: '0.1-draft',
      epoch: 'https://schemas.kumwe.org/studio/v1/',
      manifestDigest: 'sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
      schemaSources: [
        schemaSource('example.schema.json', baseSchema),
        schemaSource('second.schema.json', baseSchema),
      ],
      supportedWireProtocolRange: '0.1.0-draft.2',
    }),
    /Duplicate canonical schema identifier/u,
  );
});

test('generator and manifest reject a schema outside the declared epoch', async () => {
  const schema = { ...baseSchema, $id: 'https://example.invalid/example.schema.json' };
  const sources = [schemaSource('example.schema.json', schema)];
  assert.throws(() => buildSchemaManifest(sources), /outside schema epoch/u);
  await assert.rejects(
    generateTypeScriptModels({
      contractVersion: '0.1-draft',
      epoch: 'https://schemas.kumwe.org/studio/v1/',
      manifestDigest: 'sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
      schemaSources: sources,
      supportedWireProtocolRange: '0.1.0-draft.2',
    }),
    /outside schema epoch/u,
  );
});

function schemaSource(file, schema) {
  return { bytes: Buffer.from(`${JSON.stringify(schema, null, 2)}\n`), file, schema };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

async function generateFor(schema) {
  return generateTypeScriptModels({
    contractVersion: '0.1-draft',
    epoch: 'https://schemas.kumwe.org/studio/v1/',
    manifestDigest: 'sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
    schemaSources: [schemaSource('example.schema.json', schema)],
    supportedWireProtocolRange: '0.1.0-draft.2',
  });
}

async function runLocaleProbe(source, locale) {
  const { stdout } = await execFileAsync(
    process.execPath,
    ['--input-type=module', '--eval', source],
    {
      env: { ...process.env, LANG: locale, LC_ALL: locale },
      maxBuffer: 2 * 1_024 * 1_024,
    },
  );
  return JSON.parse(stdout);
}
