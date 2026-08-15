import { describe, expect, it } from 'vitest';
import { assertBlueprintConforms, createBlueprintFixture, defineTestBlock } from '../src/index.js';

describe('Studio testkit', () => {
  it('builds and validates a conforming canonical fixture', () => {
    const block = defineTestBlock({ label: 'Text', type: 'studio.core/text' });
    const blueprint = createBlueprintFixture({
      blockLocks: [{ revision: block.revision, type: block.type, version: block.version }],
      roots: [
        {
          authoring: { mode: 'content' },
          bindings: {},
          id: 'text-1',
          properties: {},
          slots: {},
          type: 'studio.core/text',
          version: '1.0.0',
        },
      ],
    });

    expect(() => assertBlueprintConforms(blueprint, [block])).not.toThrow();
  });
});
