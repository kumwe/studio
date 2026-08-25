import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runRendererWebVector, type RendererWebVector } from '../src/index.js';

describe('portable renderer-web corpus', () => {
  it('replays every canonical vector', async () => {
    const directory = join(process.cwd(), 'schemas/conformance/renderer-web');
    const files = (await readdir(directory)).filter((name) => name.endsWith('.json')).sort();
    expect(files).toHaveLength(3);
    for (const file of files) {
      const vector = JSON.parse(await readFile(join(directory, file), 'utf8')) as RendererWebVector;
      expect(await runRendererWebVector(vector), file).toEqual({
        failures: [],
        id: vector.id,
        passed: true,
      });
    }
  });
});
