import { describe, expect, it } from 'vitest';
import { STUDIO_CONTRACT_VERSION, type MediaReference } from '@kumwe/studio-protocol';
import { validateMediaReference } from '../src/index.js';

function reference(cropIntent?: MediaReference['cropIntent']): MediaReference {
  return {
    accessibility: { altText: 'A green backpack', mode: 'informative' },
    assetId: 'media/backpack',
    contractVersion: STUDIO_CONTRACT_VERSION,
    kind: 'media-reference',
    usage: 'org.example/product-hero',
    ...(cropIntent === undefined ? {} : { cropIntent }),
  };
}

describe('validateMediaReference', () => {
  it('accepts references without crops, aspect-ratio crops, and in-bounds rectangles', () => {
    expect(validateMediaReference(reference())).toEqual([]);
    expect(
      validateMediaReference(reference({ height: 9, mode: 'aspect-ratio', width: 16 })),
    ).toEqual([]);
    expect(
      validateMediaReference(
        reference({ height: 0.5, mode: 'rectangle', width: 0.5, x: 0.5, y: 0.5 }),
      ),
    ).toEqual([]);
  });

  it('rejects rectangles that escape the source bounds on either axis', () => {
    for (const crop of [
      { height: 0.2, mode: 'rectangle', width: 0.6, x: 0.5, y: 0 },
      { height: 0.6, mode: 'rectangle', width: 0.2, x: 0, y: 0.5 },
    ] as const) {
      const diagnostics = validateMediaReference(reference(crop));
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]?.code).toBe('studio.media/crop-out-of-bounds');
      expect(diagnostics[0]?.severity).toBe('error');
    }
  });
});
