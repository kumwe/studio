import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { BlueprintCommand, BlueprintDocument } from '@kumwe/studio-protocol';
import { applyCommand, invertCommand, type StudioCommandErrorCode } from '../src/index.js';

interface CommandVector {
  command: BlueprintCommand;
  description: string;
  expect: { document: BlueprintDocument } | { errorCode: StudioCommandErrorCode };
  id: string;
  initial: BlueprintDocument;
  inverse?: BlueprintCommand;
}

const vectorDirectory = join(process.cwd(), 'packages/testkit/vectors/command');
const vectorFiles = (await readdir(vectorDirectory))
  .filter((name) => name.endsWith('.json'))
  .sort();

const vectors: [string, CommandVector][] = await Promise.all(
  vectorFiles.map(async (file): Promise<[string, CommandVector]> => {
    const vector = JSON.parse(await readFile(join(vectorDirectory, file), 'utf8')) as CommandVector;
    return [file, vector];
  }),
);

describe('canonical command vectors', () => {
  it('has a non-empty corpus', () => {
    expect(vectors.length).toBeGreaterThan(0);
  });

  describe.each(vectors)('%s', (file, vector) => {
    it('reduces to the canonical result without mutating its input', () => {
      const pristine = structuredClone(vector.initial);

      if ('errorCode' in vector.expect) {
        const failure = vector.expect;
        expect(() => applyCommand(vector.initial, vector.command)).toThrow(
          expect.objectContaining({ code: failure.errorCode }) as Error,
        );
      } else {
        const result = applyCommand(vector.initial, vector.command);
        expect(result).toStrictEqual(vector.expect.document);
      }
      expect(vector.initial).toStrictEqual(pristine);
    });

    it('agrees with the computed inverse command', () => {
      if ('errorCode' in vector.expect) {
        return;
      }

      const computed = invertCommand(vector.initial, vector.command, {
        id: vector.inverse?.id ?? `${vector.id}.inverse`,
      });
      const result = applyCommand(vector.initial, vector.command);
      expect(applyCommand(result, computed)).toStrictEqual(vector.initial);

      if (vector.inverse !== undefined) {
        expect(computed).toStrictEqual(vector.inverse);
        expect(applyCommand(result, vector.inverse)).toStrictEqual(vector.initial);
      }
    });
  });
});
