import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { JsonValue } from '@kumwe/studio-protocol';
import { canonicalStringify, canonicalUtf8Bytes } from '../src/index.js';

/**
 * The canonical serialization corpus, replayed against the reference
 * implementation. The expectations were produced by an independent
 * canonicalizer rather than recorded from this code, so agreement here is a
 * cross-implementation check: any host that reproduces the corpus computes the
 * same digests, which is what makes a vendored-corpus check and a stored
 * document round-trip comparable across languages.
 */

interface CanonicalVector {
  description: string;
  expect: { canonical: string; digest: string } | { rejected: string };
  id: string;
  maximumDepth?: number;
  value: JsonValue;
}

const vectorDirectory = join(process.cwd(), 'packages/testkit/vectors/canonical');
const vectorFiles = (await readdir(vectorDirectory))
  .filter((name) => name.endsWith('.json'))
  .sort();

const vectors: [string, CanonicalVector][] = await Promise.all(
  vectorFiles.map(async (file): Promise<[string, CanonicalVector]> => {
    const vector = JSON.parse(
      await readFile(join(vectorDirectory, file), 'utf8'),
    ) as CanonicalVector;
    return [file, vector];
  }),
);

describe('canonical serialization vectors', () => {
  it('has a non-empty corpus', () => {
    expect(vectors.length).toBeGreaterThan(0);
  });

  describe.each(vectors)('%s', (file, vector) => {
    const options = vector.maximumDepth === undefined ? {} : { maximumDepth: vector.maximumDepth };

    it('serializes to the exact canonical bytes, or refuses for the stated reason', () => {
      if ('rejected' in vector.expect) {
        expect(() => canonicalStringify(vector.value, options)).toThrow();
        return;
      }
      expect(canonicalStringify(vector.value, options)).toBe(vector.expect.canonical);
    });

    it('computes the digest a host recomputes over the same bytes', () => {
      if ('rejected' in vector.expect) {
        return;
      }
      const bytes = canonicalUtf8Bytes(vector.value, options);
      const digest = `sha256-${createHash('sha256').update(bytes).digest('base64')}`;
      expect(digest).toBe(vector.expect.digest);
      // The byte encoding and the string agree, so a host may hash either.
      expect(Buffer.from(bytes).toString('utf8')).toBe(vector.expect.canonical);
    });
  });
});
