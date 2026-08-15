import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Ajv2020 } from 'ajv/dist/2020.js';
import {
  protocolSchemas,
  schemaProfileSchema,
  type BlockDefinition,
  type JsonSchema,
} from '@kumwe/studio-protocol';
import { assertStudioPropertySchema, STUDIO_SCHEMA_PROFILE_LIMITS } from '../src/index.js';

const ajv = new Ajv2020({ allErrors: true, strict: true });
for (const schema of protocolSchemas) {
  ajv.addSchema(schema);
}
const validateProfile = ajv.getSchema(
  'https://schemas.kumwe.org/studio/v1/schema-profile.schema.json',
);

async function fixturePropertySchema(name: string): Promise<JsonSchema> {
  const fixture = JSON.parse(
    await readFile(join(process.cwd(), 'packages/testkit/fixtures', name), 'utf8'),
  ) as BlockDefinition;
  return fixture.propertySchema;
}

describe('schema profile meta-schema parity', () => {
  it('publishes the same complexity limits the runtime enforces', () => {
    const limits = (schemaProfileSchema as { $defs?: { limits?: { const?: unknown } } }).$defs
      ?.limits?.const;
    expect(limits).toStrictEqual({ ...STUDIO_SCHEMA_PROFILE_LIMITS });
  });

  it('accepts every canonical block property schema the runtime accepts', async () => {
    const corpus: JsonSchema[] = [
      await fixturePropertySchema('block.grid.example.json'),
      await fixturePropertySchema('block.price.example.json'),
      { additionalProperties: false, type: 'object' },
      {
        additionalProperties: false,
        properties: {
          tone: { enum: ['calm', 'bold'] },
          width: { maximum: 12, minimum: 1, type: 'integer' },
        },
        required: ['tone'],
        type: 'object',
      },
    ];
    expect(validateProfile).toBeDefined();
    for (const schema of corpus) {
      expect(() => assertStudioPropertySchema(schema)).not.toThrow();
      expect(validateProfile?.(schema), ajv.errorsText(validateProfile?.errors)).toBe(true);
    }
  });

  it('rejects prohibited keywords and unsafe shapes in both layers', () => {
    const corpus: JsonSchema[] = [
      { pattern: 'a+', type: 'string' },
      { patternProperties: { '^x': { type: 'string' } }, type: 'object' },
      { format: 'email', type: 'string' },
      { $ref: 'https://untrusted.example/schema.json' },
      JSON.parse('{"properties": {"__proto__": {"type": "object"}}}') as JsonSchema,
      { contentSchema: { type: 'string' } },
    ];
    for (const schema of corpus) {
      expect(() => assertStudioPropertySchema(schema)).toThrow();
      expect(validateProfile?.(schema)).toBe(false);
    }
  });
});
