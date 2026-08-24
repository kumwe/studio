import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Ajv2020 } from 'ajv/dist/2020.js';
import {
  protocolSchemas,
  type BlockDefinition,
  type BlueprintDocument,
  type ContentModelDocument,
} from '@kumwe/studio-protocol';
import { runBindingProjectionVector, type BindingProjectionVectorRunResult } from '../src/index.js';

interface BindingProjectionVector {
  blockDefinitions: BlockDefinition[];
  blueprint: BlueprintDocument;
  expect: BindingProjectionVectorRunResult;
  model: ContentModelDocument;
  profile: string;
}

const vectorDirectory = join(process.cwd(), 'packages/testkit/vectors/binding-projection');
const vectorFiles = (await readdir(vectorDirectory))
  .filter((name) => name.endsWith('.json'))
  .sort();
const vectors: [string, BindingProjectionVector][] = await Promise.all(
  vectorFiles.map(async (file) => [
    file,
    JSON.parse(await readFile(join(vectorDirectory, file), 'utf8')) as BindingProjectionVector,
  ]),
);

const ajv = new Ajv2020({ allErrors: true, strict: true });
for (const schema of protocolSchemas) {
  ajv.addSchema(schema);
}
const validateVector = ajv.getSchema(
  'https://schemas.kumwe.org/studio/v1/binding-projection-vector.schema.json',
);

describe('canonical binding projection vectors', () => {
  it('publishes one non-empty portable profile with unique model scenarios', () => {
    expect(vectors.length).toBeGreaterThanOrEqual(3);
    expect(new Set(vectors.map(([, vector]) => vector.profile))).toEqual(
      new Set(['studio.profile/binding-projection-v1']),
    );
  });

  describe.each(vectors)('%s', (_file, vector) => {
    it('validates against the canonical vector schema', () => {
      expect(validateVector).toBeDefined();
      expect(validateVector?.(vector), ajv.errorsText(validateVector?.errors)).toBe(true);
    });

    it('reproduces exact candidates, controls, outcomes, and diagnostics', () => {
      const inputsBefore = structuredClone({
        blockDefinitions: vector.blockDefinitions,
        blueprint: vector.blueprint,
        model: vector.model,
      });
      expect(runBindingProjectionVector(vector)).toEqual(vector.expect);
      expect({
        blockDefinitions: vector.blockDefinitions,
        blueprint: vector.blueprint,
        model: vector.model,
      }).toEqual(inputsBefore);
    });
  });
});
