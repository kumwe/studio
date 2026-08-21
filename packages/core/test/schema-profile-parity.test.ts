import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Ajv2020 } from 'ajv/dist/2020.js';
import {
  protocolSchemas,
  schemaProfileSchema,
  type BlockDefinition,
  type JsonSchema,
  type JsonValue,
} from '@kumwe/studio-protocol';
import {
  assertStudioPropertySchema,
  STUDIO_SCHEMA_PROFILE_LIMITS,
  StudioSchemaProfileError,
} from '../src/index.js';

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

  it('aligns the portable keyword grammar across the meta-schema and runtime', () => {
    const corpus: { code: string; path: string; schema: JsonSchema }[] = [
      {
        code: 'invalid-root',
        path: '/additionalProperties',
        schema: { type: 'object' },
      },
      {
        code: 'invalid-keyword-value',
        path: '/properties/value/enum',
        schema: {
          additionalProperties: false,
          properties: { value: { enum: [] } },
          type: 'object',
        },
      },
      {
        code: 'invalid-keyword-value',
        path: '/properties/value/oneOf',
        schema: {
          additionalProperties: false,
          properties: { value: { oneOf: [] } },
          type: 'object',
        },
      },
      {
        code: 'invalid-keyword-value',
        path: '/required/1',
        schema: {
          additionalProperties: false,
          required: ['value', 'value'],
          type: 'object',
        },
      },
      {
        code: 'invalid-keyword-value',
        path: '/dependentRequired/value/1',
        schema: {
          additionalProperties: false,
          dependentRequired: { value: ['other', 'other'] },
          type: 'object',
        },
      },
      {
        code: 'invalid-reference',
        path: '/properties/value/$ref',
        schema: {
          additionalProperties: false,
          properties: { value: { $ref: '#/$defs/~2value' } },
          type: 'object',
        },
      },
      {
        code: 'unsafe-member',
        path: '/required/0',
        schema: {
          additionalProperties: false,
          required: ['__proto__'],
          type: 'object',
        },
      },
      {
        code: 'unsafe-member',
        path: '/dependentRequired/value/0',
        schema: {
          additionalProperties: false,
          dependentRequired: { value: ['constructor'] },
          type: 'object',
        },
      },
    ];

    for (const entry of corpus) {
      expect(validateProfile?.(entry.schema), ajv.errorsText(validateProfile?.errors)).toBe(false);
      try {
        assertStudioPropertySchema(entry.schema);
        expect.unreachable('schema admission must fail');
      } catch (error) {
        expect(error).toBeInstanceOf(StudioSchemaProfileError);
        expect(error).toMatchObject({ code: entry.code, schemaPath: entry.path });
      }
    }
  });

  it('counts annotation limits in Unicode code points in both layers', () => {
    const accepted: JsonSchema = {
      additionalProperties: false,
      description: 'd'.repeat(10_000),
      examples: Array.from({ length: 100 }, (_, index) => index),
      title: '😀'.repeat(1_000),
      type: 'object',
    };
    expect(validateProfile?.(accepted), ajv.errorsText(validateProfile?.errors)).toBe(true);
    expect(() => assertStudioPropertySchema(accepted)).not.toThrow();

    for (const schema of [
      { ...accepted, description: 'd'.repeat(10_001) },
      { ...accepted, examples: Array.from({ length: 101 }, (_, index) => index) },
      { ...accepted, title: '😀'.repeat(1_001) },
    ]) {
      expect(validateProfile?.(schema), ajv.errorsText(validateProfile?.errors)).toBe(false);
      expect(() => assertStudioPropertySchema(schema)).toThrow(
        expect.objectContaining({ code: 'limit-exceeded' }),
      );
    }
  });

  it('rejects an existing non-schema reference target through the semantic admission pass', () => {
    const schema: JsonSchema = {
      additionalProperties: false,
      properties: { value: { $ref: '#/properties' } },
      type: 'object',
    };
    // Recursive JSON Schema cannot express "the pointer targets a schema
    // position"; this is intentionally a portable semantic-vector rule.
    expect(validateProfile?.(schema), ajv.errorsText(validateProfile?.errors)).toBe(true);
    expect(() => assertStudioPropertySchema(schema)).toThrow(
      expect.objectContaining({
        code: 'invalid-reference',
        schemaPath: '/properties/value/$ref',
      }),
    );
  });

  it('uses code-unit member order for stable admission diagnostics', () => {
    const candidates: JsonSchema[] = [
      {
        type: 'object',
        additionalProperties: false,
        properties: {
          z: { format: 'email', type: 'string' },
          a: { format: 'email', type: 'string' },
        },
      },
      {
        properties: {
          a: { type: 'string', format: 'email' },
          z: { type: 'string', format: 'email' },
        },
        additionalProperties: false,
        type: 'object',
      },
    ];
    for (const schema of candidates) {
      expect(() => assertStudioPropertySchema(schema)).toThrow(
        expect.objectContaining({
          code: 'unsupported-keyword',
          schemaPath: '/properties/a/format',
        }),
      );
    }
  });

  it('uses code-unit precedence for root invariants and recursive dependencies', () => {
    for (const schema of [
      { additionalProperties: true, type: 'string' },
      { type: 'string', additionalProperties: true },
    ]) {
      expect(() => assertStudioPropertySchema(schema)).toThrow(
        expect.objectContaining({ code: 'invalid-root', schemaPath: '/additionalProperties' }),
      );
    }

    const recursiveDefinition = {
      $defs: { a: { $ref: '#/$defs/d' } },
      $ref: '#/$defs/d',
      additionalProperties: { $ref: '#/$defs/d' },
    };
    for (const definition of [
      recursiveDefinition,
      {
        additionalProperties: recursiveDefinition.additionalProperties,
        $defs: recursiveDefinition.$defs,
        $ref: recursiveDefinition.$ref,
      },
    ]) {
      const schema: JsonSchema = {
        additionalProperties: false,
        $defs: { d: definition },
        properties: {},
        type: 'object',
      };
      expect(() => assertStudioPropertySchema(schema)).toThrow(
        expect.objectContaining({
          code: 'recursive-schema',
          schemaPath: '/$defs/d/$defs/a/$ref',
        }),
      );
    }
  });

  it('arbitrates structural, reference, and root failures in one document order', () => {
    for (const schema of [
      {
        additionalProperties: true,
        properties: { x: { $ref: '#/$defs/missing' } },
        type: 'object',
      },
      {
        type: 'object',
        properties: { x: { $ref: '#/$defs/missing' } },
        additionalProperties: true,
      },
    ]) {
      expect(() => assertStudioPropertySchema(schema)).toThrow(
        expect.objectContaining({ code: 'invalid-root', schemaPath: '/additionalProperties' }),
      );
    }

    for (const propertySchema of [
      { $ref: '#/$defs/missing', format: 'email' },
      { format: 'email', $ref: '#/$defs/missing' },
    ]) {
      expect(() =>
        assertStudioPropertySchema({
          additionalProperties: false,
          properties: { x: propertySchema },
          type: 'object',
        }),
      ).toThrow(
        expect.objectContaining({
          code: 'invalid-reference',
          schemaPath: '/properties/x/$ref',
        }),
      );
    }
  });

  it('keeps forward-reference semantics on canonical document paths and order', () => {
    const forwardFailure: JsonSchema = {
      $ref: '#/properties/z',
      additionalProperties: false,
      properties: { z: { $ref: '#/$defs/missing' } },
      type: 'object',
    };
    expect(() => assertStudioPropertySchema(forwardFailure)).toThrow(
      expect.objectContaining({
        code: 'invalid-reference',
        schemaPath: '/properties/z/$ref',
      }),
    );

    for (const definitions of [
      {
        a: { $ref: '#/$defs/z' },
        b: { $ref: '#/$defs/missing-b' },
        z: { $ref: '#/$defs/missing-z' },
      },
      {
        z: { $ref: '#/$defs/missing-z' },
        b: { $ref: '#/$defs/missing-b' },
        a: { $ref: '#/$defs/z' },
      },
    ]) {
      expect(() =>
        assertStudioPropertySchema({
          additionalProperties: false,
          $defs: definitions,
          type: 'object',
        }),
      ).toThrow(
        expect.objectContaining({
          code: 'invalid-reference',
          schemaPath: '/$defs/b/$ref',
        }),
      );
    }

    for (const definitions of [
      {
        a: { $ref: '#/$defs/z' },
        b: { $ref: '#/$defs/b' },
        z: { $ref: '#/$defs/z' },
      },
      {
        z: { $ref: '#/$defs/z' },
        b: { $ref: '#/$defs/b' },
        a: { $ref: '#/$defs/z' },
      },
    ]) {
      expect(() =>
        assertStudioPropertySchema({
          additionalProperties: false,
          $defs: definitions,
          type: 'object',
        }),
      ).toThrow(
        expect.objectContaining({
          code: 'recursive-schema',
          schemaPath: '/$defs/b/$ref',
        }),
      );
    }
  });

  it('composes the published schema and JSON depth ceilings without a hidden limit', () => {
    const maxJsonDepth = STUDIO_SCHEMA_PROFILE_LIMITS.maxJsonDepth;
    const maxSchemaDepth = STUDIO_SCHEMA_PROFILE_LIMITS.maxSchemaDepth;
    if (maxJsonDepth === undefined || maxSchemaDepth === undefined) {
      throw new Error('Published schema depth limits are unavailable.');
    }
    let jsonValue: unknown = 0;
    for (let depth = 0; depth < maxJsonDepth; depth += 1) {
      jsonValue = [jsonValue];
    }
    let leaf: JsonSchema = { const: jsonValue as JsonValue };
    for (let depth = 2; depth < maxSchemaDepth; depth += 1) {
      leaf = { properties: { value: leaf } };
    }
    const schema: JsonSchema = {
      additionalProperties: false,
      properties: { value: leaf },
      type: 'object',
    };

    expect(validateProfile?.(schema), ajv.errorsText(validateProfile?.errors)).toBe(true);
    expect(() => assertStudioPropertySchema(schema)).not.toThrow();
  });

  it('enforces the byte budget before inspecting an oversized array for density', () => {
    const maxSchemaBytes = STUDIO_SCHEMA_PROFILE_LIMITS.maxSchemaBytes;
    if (maxSchemaBytes === undefined) {
      throw new Error('Published schema byte limit is unavailable.');
    }
    const oversizedSparseArray = new Array<unknown>(maxSchemaBytes + 1);

    expect(() =>
      assertStudioPropertySchema({
        additionalProperties: false,
        default: oversizedSparseArray,
        type: 'object',
      }),
    ).toThrow(expect.objectContaining({ code: 'limit-exceeded', schemaPath: '' }));
  });

  it('keeps semantic graph analysis iterative beyond the structural depth cutoff', () => {
    let nested: JsonSchema = {};
    for (let depth = 0; depth < 5_000; depth += 1) {
      nested = { not: nested };
    }

    expect(() =>
      assertStudioPropertySchema({
        additionalProperties: false,
        properties: { value: nested },
        type: 'object',
      }),
    ).toThrow(expect.objectContaining({ code: 'limit-exceeded' }));
  });

  it('aligns the per-object JSON value limit in both layers', () => {
    const schema: JsonSchema = {
      additionalProperties: false,
      properties: {
        value: {
          const: Object.fromEntries(
            Array.from({ length: 1_001 }, (_, index) => [`key-${index}`, index]),
          ),
        },
      },
      type: 'object',
    };
    expect(validateProfile?.(schema), ajv.errorsText(validateProfile?.errors)).toBe(false);
    expect(() => assertStudioPropertySchema(schema)).toThrow(
      expect.objectContaining({ code: 'limit-exceeded', schemaPath: '/properties/value/const' }),
    );
  });
});
