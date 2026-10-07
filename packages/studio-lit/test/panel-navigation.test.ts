import { describe, expect, it } from 'vitest';
import type { BlockType, BlueprintNode } from '@kumwe/studio-protocol';
import {
  hasListedChildren,
  isNodeListed,
  listedAncestorOf,
  listingScopeFor,
  parentScopeOf,
  scopeChildren,
} from '../src/panel-navigation.js';

function node(id: string, slots: Record<string, BlueprintNode[]> = {}): BlueprintNode {
  return {
    authoring: { mode: 'content' },
    bindings: {},
    id,
    properties: {},
    slots,
    type: `studio.test/${id}` as BlockType,
    version: '1.0.0',
  };
}

/**
 * page > [hero, section(content: [text-1, columns(items: [stack-a(content: [text-3]), stack-b])])]
 * `stack-b` has no slots; `shell` declares slots that are all empty.
 */
function fixtureRoots(): BlueprintNode[] {
  return [
    node('hero'),
    node('section', {
      content: [
        node('text-1'),
        node('columns', {
          items: [node('stack-a', { content: [node('text-3')] }), node('stack-b')],
        }),
      ],
    }),
    node('shell', { aside: [], content: [] }),
  ];
}

function ids(nodes: readonly BlueprintNode[]): string[] {
  return nodes.map((entry) => entry.id);
}

describe('scopeChildren', () => {
  it('lists the non-empty slots of a scope in declaration order with their direct children', () => {
    const roots = fixtureRoots();
    expect(
      scopeChildren(roots, 'section').map(({ slot, children }) => [slot, ids(children)]),
    ).toEqual([['content', ['text-1', 'columns']]]);
    expect(
      scopeChildren(roots, 'columns').map(({ slot, children }) => [slot, ids(children)]),
    ).toEqual([['items', ['stack-a', 'stack-b']]]);
  });

  it('omits empty slots and keeps the declared order of the remaining ones', () => {
    const roots = [node('multi', { aside: [], main: [node('m-1')], footer: [node('f-1')] })];
    expect(scopeChildren(roots, 'multi').map(({ slot }) => slot)).toEqual(['main', 'footer']);
    expect(scopeChildren(fixtureRoots(), 'shell')).toEqual([]);
  });

  it('returns nothing for a block without slots or an unknown identifier', () => {
    const roots = fixtureRoots();
    expect(scopeChildren(roots, 'stack-b')).toEqual([]);
    expect(scopeChildren(roots, 'text-3')).toEqual([]);
    expect(scopeChildren(roots, 'missing')).toEqual([]);
  });
});

describe('hasListedChildren', () => {
  it('is true only for a node with at least one non-empty slot', () => {
    const roots = fixtureRoots();
    const section = roots[1];
    const shell = roots[2];
    if (section === undefined || shell === undefined) throw new Error('fixture roots missing');
    expect(hasListedChildren(section)).toBe(true);
    expect(hasListedChildren(node('columns', { items: [node('x')] }))).toBe(true);
    expect(hasListedChildren(shell)).toBe(false);
    expect(hasListedChildren(node('leaf'))).toBe(false);
    expect(hasListedChildren(node('container', { content: [] }))).toBe(false);
  });
});

describe('parentScopeOf and listingScopeFor', () => {
  it('names the parent container, or the page level for a root', () => {
    const roots = fixtureRoots();
    expect(parentScopeOf(roots, 'section')).toBeUndefined();
    expect(parentScopeOf(roots, 'columns')).toBe('section');
    expect(parentScopeOf(roots, 'stack-a')).toBe('columns');
    expect(parentScopeOf(roots, 'missing')).toBeUndefined();

    expect(listingScopeFor(roots, 'hero')).toBeUndefined();
    expect(listingScopeFor(roots, 'text-1')).toBe('section');
    expect(listingScopeFor(roots, 'text-3')).toBe('stack-a');
    expect(listingScopeFor(roots, 'missing')).toBeUndefined();
  });
});

describe('isNodeListed', () => {
  it('lists every node at the page level', () => {
    const roots = fixtureRoots();
    for (const id of ['hero', 'section', 'text-1', 'columns', 'stack-a', 'stack-b', 'text-3']) {
      expect(isNodeListed(roots, undefined, id)).toBe(true);
    }
    expect(isNodeListed(roots, undefined, 'missing')).toBe(false);
  });

  it('lists only the direct children of an opened container', () => {
    const roots = fixtureRoots();
    expect(isNodeListed(roots, 'section', 'text-1')).toBe(true);
    expect(isNodeListed(roots, 'section', 'columns')).toBe(true);
    expect(isNodeListed(roots, 'section', 'section')).toBe(false);
    expect(isNodeListed(roots, 'section', 'stack-a')).toBe(false);
    expect(isNodeListed(roots, 'section', 'text-3')).toBe(false);
    expect(isNodeListed(roots, 'section', 'hero')).toBe(false);
    expect(isNodeListed(roots, 'stack-a', 'text-3')).toBe(true);
    expect(isNodeListed(roots, 'missing', 'text-1')).toBe(false);
  });
});

describe('listedAncestorOf', () => {
  it('stands a deeper node in for its nearest listed ancestor', () => {
    const roots = fixtureRoots();
    expect(listedAncestorOf(roots, 'section', 'text-3')).toBe('columns');
    expect(listedAncestorOf(roots, 'columns', 'text-3')).toBe('stack-a');
    expect(listedAncestorOf(roots, 'stack-a', 'text-3')).toBe('text-3');
    expect(listedAncestorOf(roots, 'section', 'text-1')).toBe('text-1');
  });

  it('is the node itself at the page level and nothing for nodes outside the scope', () => {
    const roots = fixtureRoots();
    expect(listedAncestorOf(roots, undefined, 'text-3')).toBe('text-3');
    expect(listedAncestorOf(roots, undefined, 'hero')).toBe('hero');
    expect(listedAncestorOf(roots, 'section', 'hero')).toBeUndefined();
    expect(listedAncestorOf(roots, 'section', 'section')).toBeUndefined();
    expect(listedAncestorOf(roots, 'columns', 'text-1')).toBeUndefined();
    expect(listedAncestorOf(roots, 'section', 'missing')).toBeUndefined();
    expect(listedAncestorOf(roots, undefined, 'missing')).toBeUndefined();
  });
});
