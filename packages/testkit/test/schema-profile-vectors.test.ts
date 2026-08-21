import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { protocolSchemas } from '@kumwe/studio-protocol';
import { STUDIO_SCHEMA_PROFILE_LIMITS } from '@kumwe/studio-core';
import { runSchemaProfileVector, type SchemaProfileVectorInstance } from '../src/index.js';

interface SchemaProfileVector {
  boundary?: {
    limit: string;
    position: 'at-limit' | 'over-limit';
    value: number;
  };
  expect:
    | {
        instances: (SchemaProfileVectorInstance & {
          diagnostic?: { instancePath: string; keyword: string };
        })[];
        outcome: 'accepted';
      }
    | {
        code: string;
        outcome: 'rejected';
        schemaPath: string;
      };
  id: string;
  profile: string;
  schema: unknown;
}

const directory = join(process.cwd(), 'packages/testkit/vectors/schema-profile');
const files = (await readdir(directory)).filter((name) => name.endsWith('.json')).sort();
const vectors = await Promise.all(
  files.map(async (file) => {
    const vector = JSON.parse(await readFile(join(directory, file), 'utf8')) as SchemaProfileVector;
    return [file, vector] as const;
  }),
);

const ajv = new Ajv2020({ allErrors: true, strict: true });
for (const schema of protocolSchemas) {
  ajv.addSchema(schema);
}
const validateVector = ajv.getSchema(
  'https://schemas.kumwe.org/studio/v1/schema-profile-vector.schema.json',
);
const validateProfile = ajv.getSchema(
  'https://schemas.kumwe.org/studio/v1/schema-profile.schema.json',
);

describe('portable Studio property-schema profile corpus', () => {
  it('is non-empty, schema-valid, uniquely identified, and bound to one profile', () => {
    expect(files.length).toBeGreaterThan(0);
    expect(validateVector).toBeDefined();
    const identifiers = new Set<string>();
    for (const [file, vector] of vectors) {
      expect(validateVector?.(vector), `${file}: ${ajv.errorsText(validateVector?.errors)}`).toBe(
        true,
      );
      expect(identifiers.has(vector.id), `${file}: duplicate vector id ${vector.id}`).toBe(false);
      identifiers.add(vector.id);
    }
    expect(new Set(vectors.map(([, vector]) => vector.profile))).toStrictEqual(
      new Set(['studio.profile/schema-property']),
    );
  });

  it('replays every admission and instance assertion through the public runner', () => {
    for (const [file, vector] of vectors) {
      expect(runSchemaProfileVector(vector), file).toStrictEqual(vector.expect);
    }
  });

  it('pins competing root, reference, and structural diagnostic precedence', () => {
    const byId = new Map(vectors.map(([, vector]) => [vector.id, vector]));
    expect(byId.get('schema-profile/forward-reference-path-precedence')?.expect).toStrictEqual({
      code: 'invalid-reference',
      outcome: 'rejected',
      schemaPath: '/properties/z/$ref',
    });
    expect(byId.get('schema-profile/root-vs-reference-precedence')?.expect).toStrictEqual({
      code: 'invalid-root',
      outcome: 'rejected',
      schemaPath: '/additionalProperties',
    });
    expect(byId.get('schema-profile/reference-vs-keyword-precedence')?.expect).toStrictEqual({
      code: 'invalid-reference',
      outcome: 'rejected',
      schemaPath: '/properties/x/$ref',
    });
    expect(byId.get('schema-profile/semantic-reference-precedence')?.expect).toStrictEqual({
      code: 'invalid-reference',
      outcome: 'rejected',
      schemaPath: '/$defs/b/$ref',
    });
    expect(byId.get('schema-profile/semantic-recursion-precedence')?.expect).toStrictEqual({
      code: 'recursive-schema',
      outcome: 'rejected',
      schemaPath: '/$defs/b/$ref',
    });
  });

  it('pins every published limit at its exact boundary and exact successor', () => {
    const coverage = new Map<string, Set<string>>();
    for (const [file, vector] of vectors) {
      if (vector.boundary === undefined) {
        continue;
      }
      const published = STUDIO_SCHEMA_PROFILE_LIMITS[vector.boundary.limit];
      expect(published, `${file}: unpublished boundary`).toBeDefined();
      if (published === undefined) {
        throw new Error(`${file}: unpublished boundary ${vector.boundary.limit}`);
      }
      expect(vector.boundary.value, file).toBe(
        published + (vector.boundary.position === 'over-limit' ? 1 : 0),
      );
      const positions = coverage.get(vector.boundary.limit) ?? new Set<string>();
      expect(positions.has(vector.boundary.position), `${file}: duplicate boundary`).toBe(false);
      positions.add(vector.boundary.position);
      coverage.set(vector.boundary.limit, positions);
    }
    expect([...coverage.keys()].sort()).toStrictEqual(
      Object.keys(STUDIO_SCHEMA_PROFILE_LIMITS).sort(),
    );
    for (const positions of coverage.values()) {
      expect([...positions].sort()).toStrictEqual(['at-limit', 'over-limit']);
    }
  });

  it('admits every accepted candidate through the machine-readable meta-schema', () => {
    expect(validateProfile).toBeDefined();
    for (const [file, vector] of vectors) {
      if (vector.expect.outcome !== 'accepted') {
        continue;
      }
      expect(
        validateProfile?.(vector.schema),
        `${file}: ${ajv.errorsText(validateProfile?.errors)}`,
      ).toBe(true);
    }
  });
});
