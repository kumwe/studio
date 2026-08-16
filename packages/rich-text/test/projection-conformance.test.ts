import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  parseRichTextDocument,
  projectRichText,
  type RichTextBlockProjection,
  type StudioRichTextDocument,
} from '../src/index.js';

interface RendererConformanceFixture {
  description: string;
  document: StudioRichTextDocument;
  projection: RichTextBlockProjection[];
}

const fixtureDirectory = join(process.cwd(), 'packages/testkit/conformance/rich-text');
const fixtureFiles = (await readdir(fixtureDirectory))
  .filter((name) => name.endsWith('.json'))
  .sort();

const fixtures: [string, RendererConformanceFixture][] = await Promise.all(
  fixtureFiles.map(async (file): Promise<[string, RendererConformanceFixture]> => {
    const fixture = JSON.parse(
      await readFile(join(fixtureDirectory, file), 'utf8'),
    ) as RendererConformanceFixture;
    return [file, fixture];
  }),
);

describe('renderer-conformance corpus', () => {
  it('has a non-empty corpus', () => {
    expect(fixtures.length).toBeGreaterThan(0);
  });

  describe.each(fixtures)('%s', (file, fixture) => {
    it('replays to the canonical projection without mutating its input', () => {
      const pristine = structuredClone(fixture.document);
      expect(projectRichText(fixture.document)).toStrictEqual(fixture.projection);
      expect(fixture.document).toStrictEqual(pristine);
    });

    it('stays within the portable rich-text profile', () => {
      expect(() => parseRichTextDocument(fixture.document)).not.toThrow();
    });
  });
});
