import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { BlueprintDocument } from '@kumwe/studio-protocol';
import {
  canonicalPreviewDraftBytes,
  computePreviewDraftDigest,
  createPreviewMarker,
  createPreviewMarkerInventory,
} from '../src/index.js';

interface PreviewVector {
  draft: BlueprintDocument;
  expect: {
    draftDigest: string;
    markerMap: Record<string, string>;
    markers: string[];
  };
}

async function vector(name: string): Promise<PreviewVector> {
  return JSON.parse(
    await readFile(join(process.cwd(), 'schemas/vectors/preview', name), 'utf8'),
  ) as PreviewVector;
}

describe('portable preview identity', () => {
  it('hashes only canonical UTF-8 bytes of the complete draft', async () => {
    const fixture = await vector('canonical-preorder.json');
    const bytes = canonicalPreviewDraftBytes(fixture.draft);
    const canonical = new TextDecoder().decode(bytes);

    expect(canonical.startsWith('{"contractVersion":"0.1-draft"')).toBe(true);
    expect(canonical.endsWith('}')).toBe(true);
    expect(canonical).not.toContain('draftDigest');
    expect(await computePreviewDraftDigest(fixture.draft)).toBe(fixture.expect.draftDigest);
  });

  it('assigns zero-based markers in roots, sorted slots, and child array order', async () => {
    const fixture = await vector('canonical-preorder.json');
    expect(createPreviewMarkerInventory(fixture.draft, fixture.expect.draftDigest)).toEqual({
      markerMap: fixture.expect.markerMap,
      markers: fixture.expect.markers,
    });
  });

  it('refuses malformed digests, out-of-range ordinals, and duplicate node ids', async () => {
    expect(() => createPreviewMarker('not-a-digest', 0)).toThrow(TypeError);
    expect(() => createPreviewMarker('a'.repeat(64), 100_000)).toThrow(RangeError);

    const fixture = await vector('canonical-preorder.json');
    const duplicate = structuredClone(fixture.draft);
    const firstChild = duplicate.roots[0]?.slots.alpha?.[0];
    if (firstChild === undefined) {
      throw new Error('Preview identity fixture is missing its first child.');
    }
    firstChild.id = duplicate.roots[0]?.id ?? firstChild.id;
    expect(() => createPreviewMarkerInventory(duplicate, fixture.expect.draftDigest)).toThrow(
      /duplicate node id/u,
    );
  });
});
