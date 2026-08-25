import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CORE_PRODUCTION_BLOCK_TYPES } from '@kumwe/studio-core';
import type { BlueprintNode } from '@kumwe/studio-protocol';
import { describe, expect, it } from 'vitest';
import { runRendererWebVector, type RendererWebVector } from '../src/index.js';

const EXPECTED_BEHAVIORS = [
  'accordion-native',
  'countdown',
  'dialog',
  'lightbox',
  'navigation-disclosure',
  'notice-dismiss',
  'popover',
  'slideshow',
  'tabs',
] as const;

const EXPECTED_PRESENTATION = [
  'alignment',
  'inverse',
  'markers',
  'motion',
  'position',
  'print',
  'responsive-visibility',
  'scrolling',
  'sizing',
  'spacing',
] as const;

const EXPECTED_SECURITY = [
  'active-media-deny',
  'blob-default-deny',
  'escaped-text',
  'safe-url-deny',
  'typed-data-fallback',
] as const;

function collectNodeTypes(nodes: readonly BlueprintNode[]): Set<string> {
  const types = new Set<string>();
  const visit = (node: BlueprintNode): void => {
    types.add(node.type);
    for (const slot of Object.values(node.slots)) for (const child of slot) visit(child);
  };
  for (const node of nodes) visit(node);
  return types;
}

describe('portable renderer-web corpus', () => {
  it('replays every canonical vector and exhaustively covers the production contract', async () => {
    const directory = join(process.cwd(), 'schemas/conformance/renderer-web');
    const files = (await readdir(directory)).filter((name) => name.endsWith('.json')).sort();
    expect(files).toHaveLength(8);
    const coveredBlockTypes = new Set<string>();
    const coveredBehaviors = new Set<string>();
    const coveredPresentation = new Set<string>();
    const coveredSecurity = new Set<string>();
    for (const file of files) {
      const vector = JSON.parse(await readFile(join(directory, file), 'utf8')) as RendererWebVector;
      const nodeTypes = collectNodeTypes(vector.roots);
      for (const type of vector.coverage.blockTypes) {
        expect(nodeTypes.has(type), `${file} claims absent block type ${type}`).toBe(true);
        coveredBlockTypes.add(type);
      }
      for (const behavior of vector.coverage.behaviors) coveredBehaviors.add(behavior);
      for (const capability of vector.coverage.presentation) coveredPresentation.add(capability);
      for (const fallback of vector.coverage.security) coveredSecurity.add(fallback);
      expect(await runRendererWebVector(vector), file).toEqual({
        failures: [],
        id: vector.id,
        passed: true,
      });
    }
    expect([...coveredBlockTypes].sort()).toEqual(
      [...new Set(Object.values(CORE_PRODUCTION_BLOCK_TYPES))].sort(),
    );
    expect([...coveredBehaviors].sort()).toEqual([...EXPECTED_BEHAVIORS]);
    expect([...coveredPresentation].sort()).toEqual([...EXPECTED_PRESENTATION]);
    expect([...coveredSecurity].sort()).toEqual([...EXPECTED_SECURITY]);
  });
});
