import { describe, expect, it } from 'vitest';
import {
  BlockRegistry,
  CORE_PRODUCTION_BLOCK_TYPES,
  createCoreProductionBlockDefinitions,
  validateBlueprint,
} from '@kumwe/studio-core';
import type { BlueprintNode } from '@kumwe/studio-protocol';
import { renderStudioWeb } from '@kumwe/studio-renderer-web';
import { createReferenceBlueprint } from '../src/reference-content.js';
import {
  referenceScopedStyles,
  resolveReferenceBinding,
  resolveReferenceMedia,
} from '../src/reference-resources.js';

describe('production reference page', () => {
  const definitions = createCoreProductionBlockDefinitions();
  const document = createReferenceBlueprint(definitions);

  it('is schema-valid and exercises every registered production block type', () => {
    expect(validateBlueprint(document, new BlockRegistry(definitions))).toEqual({
      diagnostics: [],
      valid: true,
    });
    const exercised = new Set(visit(document.roots).map((node) => node.type));
    const catalog = new Set<string>(Object.values(CORE_PRODUCTION_BLOCK_TYPES));
    expect(definitions).toHaveLength(45);
    expect(exercised).toEqual(catalog);
  });

  it('renders safe markup, host resources, media, scoped CSS, and progressive fallbacks', async () => {
    const result = await renderStudioWeb(document, {
      cspNonce: 'studio-reference-style-v1',
      resolveBinding: resolveReferenceBinding,
      resolveMedia: resolveReferenceMedia,
      scopedStyles: referenceScopedStyles,
    });

    expect(result.html).toContain('Portable pages, owned end to end');
    expect(result.html).toContain('<strong>Studio contract</strong>');
    expect(result.html).toContain('Building a portable page system');
    expect(result.html).toContain('/reference-media/hero.svg');
    expect(result.html).toContain('data-studio-chart-table');
    expect(result.html).toContain('data-studio-diagram-source');
    expect(result.html).toContain('data-studio-math-source');
    expect(result.html).not.toContain('<script');
    expect(result.css).toContain('font-size:3rem');
    expect(result.styleElement).toContain('nonce="studio-reference-style-v1"');
    expect(result.enhancements.map((enhancement) => enhancement.kind)).toEqual(
      expect.arrayContaining(['chart', 'diagram', 'math', 'slideshow', 'tabs']),
    );
  });
});

function visit(roots: readonly BlueprintNode[]): BlueprintNode[] {
  const result: BlueprintNode[] = [];
  const walk = (node: BlueprintNode): void => {
    result.push(node);
    for (const children of Object.values(node.slots)) children.forEach(walk);
  };
  roots.forEach(walk);
  return result;
}
