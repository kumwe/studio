import { describe, expect, it } from 'vitest';
import { CORE_LAYOUT_BLOCK_TYPES } from '@kumwe/studio-core';
import type { BlockDefinition, BlockType, BlueprintNode } from '@kumwe/studio-protocol';
import { defineTestBlock } from '@kumwe/studio-testkit';
import {
  afterDestination,
  beforeDestination,
  columnPosition,
  destinationEntries,
  emptySlotBand,
  emptySlots,
  insertedRootIds,
  isDestinationCurrent,
  levelSlots,
  pageEndDestination,
  slotEndDestination,
} from '../src/insertion-destinations.js';

function blueprintNode(
  id: string,
  type: string,
  slots: Record<string, BlueprintNode[]> = {},
): BlueprintNode {
  return {
    authoring: { mode: 'structural' },
    bindings: {},
    id,
    properties: {},
    slots,
    type: type as BlockType,
    version: '1.0.0',
  };
}

function slot(id: string): BlockDefinition['slots'][number] {
  return {
    accepts: { types: ['studio.core/text'] },
    id,
    label: { defaultMessage: id, key: `studio.test/slot-${id}` },
    maximum: 10,
    minimum: 0,
    ordered: true,
  };
}

const definitions: Record<string, BlockDefinition> = {
  [CORE_LAYOUT_BLOCK_TYPES.columns]: defineTestBlock({
    label: 'Columns',
    slots: [slot('items')],
    type: CORE_LAYOUT_BLOCK_TYPES.columns,
  }),
  [CORE_LAYOUT_BLOCK_TYPES.section]: defineTestBlock({
    label: 'Section',
    slots: [slot('content'), slot('aside')],
    type: CORE_LAYOUT_BLOCK_TYPES.section,
  }),
  [CORE_LAYOUT_BLOCK_TYPES.stack]: defineTestBlock({
    label: 'Stack',
    slots: [slot('items')],
    type: CORE_LAYOUT_BLOCK_TYPES.stack,
  }),
  'studio.core/hero': defineTestBlock({ label: 'Hero', type: 'studio.core/hero' }),
  'studio.core/text': defineTestBlock({ label: 'Text', type: 'studio.core/text' }),
};

function definitionOf(node: BlueprintNode): BlockDefinition | undefined {
  return definitions[node.type];
}

/**
 * page > [
 *   hero,
 *   section(content: [text-1, columns(items: [stack-a(items: []), stack-b(items: [text-2])])]; aside absent),
 *   empty-section (no slot entries at all),
 * ]
 */
function fixtureRoots(): BlueprintNode[] {
  return [
    blueprintNode('hero', 'studio.core/hero'),
    blueprintNode('section', CORE_LAYOUT_BLOCK_TYPES.section, {
      content: [
        blueprintNode('text-1', 'studio.core/text'),
        blueprintNode('columns', CORE_LAYOUT_BLOCK_TYPES.columns, {
          items: [
            blueprintNode('stack-a', CORE_LAYOUT_BLOCK_TYPES.stack, { items: [] }),
            blueprintNode('stack-b', CORE_LAYOUT_BLOCK_TYPES.stack, {
              items: [blueprintNode('text-2', 'studio.core/text')],
            }),
          ],
        }),
      ],
    }),
    blueprintNode('empty-section', CORE_LAYOUT_BLOCK_TYPES.section),
  ];
}

function nodeOf(roots: readonly BlueprintNode[], id: string): BlueprintNode {
  const visit = (nodes: readonly BlueprintNode[]): BlueprintNode | undefined => {
    for (const node of nodes) {
      if (node.id === id) return node;
      for (const children of Object.values(node.slots)) {
        const found = visit(children);
        if (found !== undefined) return found;
      }
    }
    return undefined;
  };
  const found = visit(roots);
  if (found === undefined) throw new Error(`Fixture requires ${id}`);
  return found;
}

describe('insertion destinations', () => {
  it('ends the page and a slot, counting an absent slot as empty', () => {
    const roots = fixtureRoots();

    expect(pageEndDestination(roots)).toStrictEqual({ position: 3 });
    expect(pageEndDestination([])).toStrictEqual({ position: 0 });
    expect(slotEndDestination(nodeOf(roots, 'section'), 'content')).toStrictEqual({
      parentNodeId: 'section',
      position: 2,
      slot: 'content',
    });
    expect(slotEndDestination(nodeOf(roots, 'section'), 'aside')).toStrictEqual({
      parentNodeId: 'section',
      position: 0,
      slot: 'aside',
    });
    expect(slotEndDestination(nodeOf(roots, 'stack-a'), 'items')).toStrictEqual({
      parentNodeId: 'stack-a',
      position: 0,
      slot: 'items',
    });
  });

  it('places before and after a listed node in its own collection', () => {
    const roots = fixtureRoots();

    expect(beforeDestination(roots, 'hero')).toStrictEqual({ position: 0 });
    expect(afterDestination(roots, 'hero')).toStrictEqual({ position: 1 });
    expect(afterDestination(roots, 'empty-section')).toStrictEqual({ position: 3 });
    expect(beforeDestination(roots, 'text-1')).toStrictEqual({
      parentNodeId: 'section',
      position: 0,
      slot: 'content',
    });
    expect(afterDestination(roots, 'text-1')).toStrictEqual({
      parentNodeId: 'section',
      position: 1,
      slot: 'content',
    });
    expect(beforeDestination(roots, 'stack-b')).toStrictEqual({
      parentNodeId: 'columns',
      position: 1,
      slot: 'items',
    });
    expect(afterDestination(roots, 'text-2')).toStrictEqual({
      parentNodeId: 'stack-b',
      position: 1,
      slot: 'items',
    });
    expect(beforeDestination(roots, 'missing')).toBeUndefined();
    expect(afterDestination(roots, 'missing')).toBeUndefined();
  });

  it('keeps a destination current only while its collection exists and the position fits', () => {
    const roots = fixtureRoots();

    expect(isDestinationCurrent(roots, { position: 0 })).toBe(true);
    expect(isDestinationCurrent(roots, { position: 3 })).toBe(true);
    expect(isDestinationCurrent(roots, { position: 4 })).toBe(false);
    expect(isDestinationCurrent(roots, { position: -1 })).toBe(false);
    expect(isDestinationCurrent(roots, { position: 1.5 })).toBe(false);
    // A slot without a parent, or a parent without a slot, names no collection.
    expect(isDestinationCurrent(roots, { position: 0, slot: 'content' })).toBe(false);
    expect(isDestinationCurrent(roots, { parentNodeId: 'section', position: 0 })).toBe(false);
    expect(
      isDestinationCurrent(roots, { parentNodeId: 'section', position: 2, slot: 'content' }),
    ).toBe(true);
    expect(
      isDestinationCurrent(roots, { parentNodeId: 'section', position: 3, slot: 'content' }),
    ).toBe(false);
    expect(
      isDestinationCurrent(roots, { parentNodeId: 'section', position: 0, slot: 'aside' }),
    ).toBe(true);
    expect(
      isDestinationCurrent(roots, { parentNodeId: 'section', position: 1, slot: 'aside' }),
    ).toBe(false);
    expect(
      isDestinationCurrent(roots, { parentNodeId: 'missing', position: 0, slot: 'content' }),
    ).toBe(false);

    // After the parent is removed the destination is stale.
    const pruned = roots.filter((root) => root.id !== 'section');
    expect(
      isDestinationCurrent(pruned, { parentNodeId: 'section', position: 0, slot: 'content' }),
    ).toBe(false);
  });

  it('lists the entries of the collection a destination names', () => {
    const roots = fixtureRoots();

    expect(destinationEntries(roots, { position: 1 })).toEqual([
      'hero',
      'section',
      'empty-section',
    ]);
    expect(
      destinationEntries(roots, { parentNodeId: 'section', position: 0, slot: 'content' }),
    ).toEqual(['text-1', 'columns']);
    expect(
      destinationEntries(roots, { parentNodeId: 'stack-b', position: 1, slot: 'items' }),
    ).toEqual(['text-2']);
    // An absent slot is an empty collection; a missing parent names none.
    expect(
      destinationEntries(roots, { parentNodeId: 'section', position: 0, slot: 'aside' }),
    ).toEqual([]);
    expect(
      destinationEntries(roots, { parentNodeId: 'missing', position: 0, slot: 'content' }),
    ).toBeUndefined();
    expect(destinationEntries(roots, { position: 0, slot: 'content' })).toBeUndefined();
    expect(destinationEntries(roots, { parentNodeId: 'section', position: 0 })).toBeUndefined();
  });

  it('reports only the outermost nodes a host inserted', () => {
    const roots = fixtureRoots();
    const before = new Set(['hero', 'section', 'text-1', 'columns', 'stack-a', 'empty-section']);

    // stack-b and its text-2 are new: only stack-b is reported.
    expect(insertedRootIds(before, roots)).toEqual(['stack-b']);
    expect(insertedRootIds(new Set(['hero']), roots)).toEqual(['section', 'empty-section']);
    expect(
      insertedRootIds(
        new Set([
          'hero',
          'section',
          'text-1',
          'columns',
          'stack-a',
          'stack-b',
          'text-2',
          'empty-section',
        ]),
        roots,
      ),
    ).toEqual([]);
  });

  it('derives the column position only for a stack in the items slot of a columns block', () => {
    const roots = fixtureRoots();

    expect(columnPosition(roots, 'stack-a')).toStrictEqual({ count: 2, position: 1 });
    expect(columnPosition(roots, 'stack-b')).toStrictEqual({ count: 2, position: 2 });
    expect(columnPosition(roots, 'columns')).toBeUndefined();
    expect(columnPosition(roots, 'text-1')).toBeUndefined();
    expect(columnPosition(roots, 'text-2')).toBeUndefined();
    expect(columnPosition(roots, 'missing')).toBeUndefined();

    const elsewhere = [
      blueprintNode('section-x', CORE_LAYOUT_BLOCK_TYPES.section, {
        content: [blueprintNode('stack-under-section', CORE_LAYOUT_BLOCK_TYPES.stack)],
      }),
      blueprintNode('grid-x', CORE_LAYOUT_BLOCK_TYPES.grid, {
        items: [blueprintNode('stack-under-grid', CORE_LAYOUT_BLOCK_TYPES.stack)],
      }),
      blueprintNode('columns-x', CORE_LAYOUT_BLOCK_TYPES.columns, {
        items: [blueprintNode('text-under-columns', 'studio.core/text')],
        other: [blueprintNode('stack-in-other-slot', CORE_LAYOUT_BLOCK_TYPES.stack)],
      }),
      blueprintNode('root-stack', CORE_LAYOUT_BLOCK_TYPES.stack),
    ];
    expect(columnPosition(elsewhere, 'stack-under-section')).toBeUndefined();
    expect(columnPosition(elsewhere, 'stack-under-grid')).toBeUndefined();
    expect(columnPosition(elsewhere, 'text-under-columns')).toBeUndefined();
    expect(columnPosition(elsewhere, 'stack-in-other-slot')).toBeUndefined();
    expect(columnPosition(elsewhere, 'root-stack')).toBeUndefined();
  });

  it('lists an opened level by declared slot, empty ones included, then undeclared non-empty slots', () => {
    const roots = fixtureRoots();
    const section = nodeOf(roots, 'section');

    expect(
      levelSlots(section, definitionOf(section)).map(({ children, slot }) => ({
        ids: children.map((child) => child.id),
        slot,
      })),
    ).toEqual([
      { ids: ['text-1', 'columns'], slot: 'content' },
      { ids: [], slot: 'aside' },
    ]);

    const legacy = blueprintNode('legacy', CORE_LAYOUT_BLOCK_TYPES.section, {
      extra: [],
      former: [blueprintNode('text-9', 'studio.core/text')],
      aside: [blueprintNode('text-8', 'studio.core/text')],
    });
    expect(
      levelSlots(legacy, definitionOf(legacy)).map(({ children, slot }) => ({
        ids: children.map((child) => child.id),
        slot,
      })),
    ).toEqual([
      { ids: [], slot: 'content' },
      { ids: ['text-8'], slot: 'aside' },
      { ids: ['text-9'], slot: 'former' },
    ]);
    // Without a definition only the non-empty slots are listed.
    expect(levelSlots(legacy, undefined).map(({ slot }) => slot)).toEqual(['former', 'aside']);
  });

  it('lists every empty declared slot in depth-first document order', () => {
    const roots = fixtureRoots();

    expect(emptySlots(roots, definitionOf).map(({ node, slot }) => `${node.id}/${slot}`)).toEqual([
      'section/aside',
      'stack-a/items',
      'empty-section/content',
      'empty-section/aside',
    ]);
    // An unresolved parent offers no slot of its own, but its children are still visited.
    const withoutColumns = (node: BlueprintNode): BlockDefinition | undefined =>
      node.type === CORE_LAYOUT_BLOCK_TYPES.columns ? undefined : definitionOf(node);
    expect(
      emptySlots(
        [
          blueprintNode('columns', CORE_LAYOUT_BLOCK_TYPES.columns, {
            items: [blueprintNode('stack-z', CORE_LAYOUT_BLOCK_TYPES.stack)],
          }),
        ],
        withoutColumns,
      ).map(({ node, slot }) => `${node.id}/${slot}`),
    ).toEqual(['stack-z/items']);
    expect(emptySlots([], definitionOf)).toEqual([]);
  });

  it('descends in declaration order whatever order the slots object holds', () => {
    // Hydrated or host-supplied JSON may list `aside` before `content`.
    const reversed = blueprintNode('section', CORE_LAYOUT_BLOCK_TYPES.section, {
      aside: [blueprintNode('stack-aside', CORE_LAYOUT_BLOCK_TYPES.stack, { items: [] })],
      content: [blueprintNode('stack-content', CORE_LAYOUT_BLOCK_TYPES.stack, { items: [] })],
    });
    expect(Object.keys(reversed.slots)).toEqual(['aside', 'content']);
    expect(
      emptySlots([reversed], definitionOf).map(({ node, slot }) => `${node.id}/${slot}`),
    ).toEqual(['stack-content/items', 'stack-aside/items']);
  });

  it('computes the band of an empty slot with the drop-target formula', () => {
    const parent = { height: 120, width: 300, x: 10, y: 10 };

    expect(emptySlotBand(parent, 0, 1)).toStrictEqual({ height: 112, width: 292, x: 14, y: 14 });
    expect(emptySlotBand(parent, 0, 2)).toStrictEqual({ height: 52, width: 292, x: 14, y: 14 });
    expect(emptySlotBand(parent, 1, 2)).toStrictEqual({ height: 52, width: 292, x: 14, y: 74 });
    // A count of zero divides by one, and a collapsed parent keeps a 4px band.
    expect(emptySlotBand(parent, 0, 0)).toStrictEqual(emptySlotBand(parent, 0, 1));
    expect(emptySlotBand({ height: 0, width: 0, x: 5, y: 5 }, 0, 1)).toStrictEqual({
      height: 4,
      width: 4,
      x: 9,
      y: 9,
    });
  });
});
