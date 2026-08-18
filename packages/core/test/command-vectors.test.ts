import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type {
  BlueprintCommand,
  BlueprintDocument,
  StudioSessionMode,
} from '@kumwe/studio-protocol';
import {
  applyCommand,
  invertCommand,
  StudioSession,
  type StudioCommandErrorCode,
} from '../src/index.js';

interface CommandVector {
  command: BlueprintCommand;
  description: string;
  expect: { document: BlueprintDocument } | { errorCode: StudioCommandErrorCode };
  id: string;
  initial: BlueprintDocument;
  inverse?: BlueprintCommand;
  mode?: StudioSessionMode;
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

      if (vector.mode === undefined) {
        if ('errorCode' in vector.expect) {
          const failure = vector.expect;
          expect(() => applyCommand(vector.initial, vector.command)).toThrow(
            expect.objectContaining({ code: failure.errorCode }) as Error,
          );
        } else {
          const result = applyCommand(vector.initial, vector.command);
          expect(result).toStrictEqual(vector.expect.document);
        }
      } else {
        // A mode vector replays through the session so the boundary guards
        // run exactly as a host dispatch would encounter them.
        const session = new StudioSession({
          document: vector.initial,
          mode: vector.mode,
          sessionGeneration: vector.command.sessionGeneration,
        });
        if ('errorCode' in vector.expect) {
          const failure = vector.expect;
          expect(() => session.execute(vector.command)).toThrow(
            expect.objectContaining({ code: failure.errorCode }) as Error,
          );
          expect(session.document).toStrictEqual(pristine);
          expect(session.stateVersion).toBe(0);
        } else {
          expect(session.execute(vector.command)).toStrictEqual(vector.expect.document);
          expect(session.stateVersion).toBe(1);
        }
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
