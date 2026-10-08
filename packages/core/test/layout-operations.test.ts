import { describe, expect, it } from 'vitest';
import {
  STUDIO_CONTRACT_VERSION,
  type BatchCommand,
  type BlueprintDocument,
  type BlueprintNode,
  type CommandDestination,
  type NodeId,
} from '@kumwe/studio-protocol';
import { createBlueprintFixture } from '@kumwe/studio-testkit';
import {
  BlockRegistry,
  CORE_LAYOUT_BLOCK_TYPES,
  StudioSession,
  applyCommand,
  createCoreLayoutBlockDefinitions,
  invertCommand,
  planColumnsInsertion,
  validateBlueprint,
  type ColumnsInsertionPlan,
} from '../src/index.js';

const definitions = createCoreLayoutBlockDefinitions();

/** A document locked to the core layout family, so validation resolves every inserted type. */
function layoutDocument(roots: BlueprintNode[] = []): BlueprintDocument {
  return createBlueprintFixture({
    blockLocks: definitions.map((definition) => ({
      revision: definition.revision,
      type: definition.type,
      version: definition.version,
    })),
    roots,
  });
}

function sectionNode(id: string, children: BlueprintNode[] = []): BlueprintNode {
  return {
    authoring: { mode: 'structural' },
    bindings: {},
    id,
    properties: {},
    slots: { content: children },
    type: CORE_LAYOUT_BLOCK_TYPES.section,
    version: '1.0.0',
  };
}

/** A `${base}-${n}` allocator that records the bases it was asked for, in call order. */
function recordingAllocator(): {
  allocateId: (base: 'columns' | 'stack') => NodeId;
  calls: string[];
} {
  const calls: string[] = [];
  const counters = new Map<string, number>();
  return {
    allocateId(base): NodeId {
      calls.push(base);
      const next = (counters.get(base) ?? 0) + 1;
      counters.set(base, next);
      return `${base}-${next}`;
    },
    calls,
  };
}

function plan(
  count: number,
  destination: CommandDestination = { position: 0 },
): ColumnsInsertionPlan {
  return planColumnsInsertion({ allocateId: recordingAllocator().allocateId, count, destination });
}

function batchCommand(document: BlueprintDocument, planned: ColumnsInsertionPlan): BatchCommand {
  return {
    artifactId: document.id,
    baseStateVersion: 0,
    contractVersion: STUDIO_CONTRACT_VERSION,
    id: 'commands/insert-columns',
    kind: 'command',
    sessionGeneration: 'session-r1',
    ...planned.command,
  };
}

function stackNode(id: string): BlueprintNode {
  return {
    authoring: { mode: 'structural' },
    bindings: {},
    id,
    properties: { direction: 'block' },
    slots: { items: [] },
    type: CORE_LAYOUT_BLOCK_TYPES.stack,
    version: '1.0.0',
  };
}

describe('planColumnsInsertion', () => {
  it('plans one batch of insert-node operations: the columns block, then one stack per column', () => {
    const allocator = recordingAllocator();
    const planned = planColumnsInsertion({
      allocateId: allocator.allocateId,
      count: 3,
      destination: { position: 0 },
    });

    expect(allocator.calls).toEqual(['columns', 'stack', 'stack', 'stack']);
    expect(planned.columnsNodeId).toBe('columns-1');
    expect(planned.stackNodeIds).toEqual(['stack-1', 'stack-2', 'stack-3']);
    expect(planned.command.type).toBe('studio.command/batch');
    expect(planned.command.payload.operations).toStrictEqual([
      {
        payload: {
          destination: { position: 0 },
          node: {
            authoring: { mode: 'structural' },
            bindings: {},
            id: 'columns-1',
            properties: { collapse: 'stack', columns: 3 },
            slots: { items: [] },
            type: CORE_LAYOUT_BLOCK_TYPES.columns,
            version: '1.0.0',
          },
        },
        type: 'studio.command/insert-node',
      },
      ...['stack-1', 'stack-2', 'stack-3'].map((id, index) => ({
        payload: {
          destination: { parentNodeId: 'columns-1', position: index, slot: 'items' },
          node: stackNode(id),
        },
        type: 'studio.command/insert-node',
      })),
    ]);
  });

  it('emits only the two existing core layout types and carries the destination unchanged', () => {
    const destination: CommandDestination = {
      parentNodeId: 'section-1',
      position: 2,
      slot: 'content',
    };
    const planned = plan(4, destination);
    const operations = planned.command.payload.operations;

    expect(operations).toHaveLength(5);
    expect(new Set(operations.map((operation) => operation.type))).toEqual(
      new Set(['studio.command/insert-node']),
    );
    const types = operations.map((operation) =>
      operation.type === 'studio.command/insert-node' ? operation.payload.node.type : undefined,
    );
    expect(types).toEqual([
      CORE_LAYOUT_BLOCK_TYPES.columns,
      CORE_LAYOUT_BLOCK_TYPES.stack,
      CORE_LAYOUT_BLOCK_TYPES.stack,
      CORE_LAYOUT_BLOCK_TYPES.stack,
      CORE_LAYOUT_BLOCK_TYPES.stack,
    ]);
    const [first] = operations;
    expect(
      first?.type === 'studio.command/insert-node' ? first.payload.destination : undefined,
    ).toEqual(destination);
    // The plan never aliases the caller's destination object.
    expect(
      first?.type === 'studio.command/insert-node' ? first.payload.destination : undefined,
    ).not.toBe(destination);
  });

  it('writes the version option to every node and defaults to the core layout family version', () => {
    const versions = (planned: ColumnsInsertionPlan): string[] =>
      planned.command.payload.operations.map((operation) =>
        operation.type === 'studio.command/insert-node' ? operation.payload.node.version : '',
      );

    expect(new Set(definitions.map((definition) => definition.version))).toEqual(
      new Set(['1.0.0']),
    );
    expect(versions(plan(2))).toEqual(['1.0.0', '1.0.0', '1.0.0']);
    expect(
      versions(
        planColumnsInsertion({
          allocateId: recordingAllocator().allocateId,
          count: 2,
          destination: { position: 0 },
          version: '1.4.2',
        }),
      ),
    ).toEqual(['1.4.2', '1.4.2', '1.4.2']);
    // A stack definition held at another version names its own version.
    expect(
      versions(
        planColumnsInsertion({
          allocateId: recordingAllocator().allocateId,
          count: 2,
          destination: { position: 0 },
          stackVersion: '2.0.0',
          version: '1.4.2',
        }),
      ),
    ).toEqual(['1.4.2', '2.0.0', '2.0.0']);
  });

  it('applies as one nested, schema-valid tree and inverts to one batch of removals', () => {
    const document = layoutDocument();
    const planned = plan(3);
    const command = batchCommand(document, planned);

    const applied = applyCommand(document, command);
    expect(applied.roots).toStrictEqual([
      {
        authoring: { mode: 'structural' },
        bindings: {},
        id: 'columns-1',
        properties: { collapse: 'stack', columns: 3 },
        slots: { items: [stackNode('stack-1'), stackNode('stack-2'), stackNode('stack-3')] },
        type: CORE_LAYOUT_BLOCK_TYPES.columns,
        version: '1.0.0',
      },
    ]);
    expect(document.roots).toEqual([]);
    expect(validateBlueprint(applied, new BlockRegistry(definitions))).toEqual({
      diagnostics: [],
      valid: true,
    });

    const inverse = invertCommand(document, command, { id: 'commands/insert-columns.inverse' });
    expect(inverse.type).toBe('studio.command/batch');
    if (inverse.type !== 'studio.command/batch') throw new Error('Expected a batch inverse.');
    expect(inverse.payload.operations).toHaveLength(4);
    expect(inverse.payload.operations.map((operation) => operation.type)).toEqual([
      'studio.command/remove-node',
      'studio.command/remove-node',
      'studio.command/remove-node',
      'studio.command/remove-node',
    ]);
    expect(applyCommand(applied, inverse).roots).toEqual([]);
  });

  it('lands inside a slot at the planned position and undoes and redoes in one step', () => {
    const existing = sectionNode('section-1', [stackNode('stack-9')]);
    const document = layoutDocument([existing]);
    const session = new StudioSession({
      document,
      mode: 'blueprint',
      sessionGeneration: 'session-r1',
    });
    const planned = plan(2, { parentNodeId: 'section-1', position: 0, slot: 'content' });

    session.execute(batchCommand(session.document, planned));
    const inserted = session.document;
    expect(session.stateVersion).toBe(1);
    expect(session.canUndo).toBe(true);
    expect(inserted.roots[0]?.slots.content?.map((child) => child.id)).toEqual([
      'columns-1',
      'stack-9',
    ]);
    expect(inserted.roots[0]?.slots.content?.[0]?.slots.items?.map((child) => child.id)).toEqual([
      'stack-1',
      'stack-2',
    ]);

    expect(session.undo().roots).toStrictEqual(document.roots);
    expect(session.canUndo).toBe(false);
    expect(session.redo()).toStrictEqual(inserted);
  });

  it.each([0, 13, 2.5, -1, Number.NaN])('refuses a column count of %s', (count) => {
    expect(() => plan(count)).toThrow(RangeError);
  });

  it('accepts the whole 1..12 column range of the columns schema', () => {
    expect(plan(1).stackNodeIds).toEqual(['stack-1']);
    expect(plan(12).stackNodeIds).toHaveLength(12);
  });

  it.each([-1, 0.5, Number.POSITIVE_INFINITY])(
    'refuses an insertion position of %s',
    (position) => {
      expect(() => plan(2, { position })).toThrow(RangeError);
    },
  );

  it('refuses an allocator that returns the same id twice', () => {
    expect(() =>
      planColumnsInsertion({
        allocateId: (base) => (base === 'columns' ? 'columns-1' : 'stack-1'),
        count: 2,
        destination: { position: 0 },
      }),
    ).toThrow(RangeError);
    expect(() =>
      planColumnsInsertion({
        allocateId: () => 'shared-1',
        count: 1,
        destination: { position: 0 },
      }),
    ).toThrow(RangeError);
  });
});
