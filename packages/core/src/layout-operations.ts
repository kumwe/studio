import type {
  BatchCommand,
  BlueprintBatchOperation,
  BlueprintNode,
  CommandDestination,
  NodeId,
  SemanticVersion,
} from '@kumwe/studio-protocol';
import { CORE_LAYOUT_BLOCK_TYPES, coreLayoutInitialProperties } from './layout.js';

/** The `columns` property bound declared by the core columns block schema. */
const MAX_COLUMNS = 12;

/** The core layout family version carried by every definition of `createCoreLayoutBlockDefinitions`. */
const CORE_LAYOUT_VERSION: SemanticVersion = '1.0.0';

/** Options for planning a columns block with its stack children as one batch. */
export interface ColumnsInsertionOptions {
  /** Allocates a document-unique id for the given base (`'columns'` once, then `'stack'` once per column). */
  allocateId: (base: 'columns' | 'stack') => NodeId;
  /** The number of columns, an integer between 1 and 12. */
  count: number;
  /** Where the columns block itself is inserted. */
  destination: CommandDestination;
  /** The stack children's version when it differs from `version`, so each node names a held definition. */
  stackVersion?: SemanticVersion;
  /** The core layout family version; every definition from `createCoreLayoutBlockDefinitions` carries `'1.0.0'`. */
  version?: SemanticVersion;
}

/** The planned batch and the identifiers it allocates. */
export interface ColumnsInsertionPlan {
  /** The id of the inserted columns block. */
  columnsNodeId: NodeId;
  /** One `studio.command/batch` payload and type; the caller supplies the command envelope. */
  command: Pick<BatchCommand, 'payload' | 'type'>;
  /** The ids of the stack children, in column order. */
  stackNodeIds: NodeId[];
}

/**
 * Plans the insertion of a `studio.core/columns` block holding `count`
 * `studio.core/stack` children as a single `studio.command/batch` of
 * `insert-node` operations, so the whole structure is one command and one undo
 * step. Only the two existing core layout types are emitted; the columns node
 * carries `{ collapse: 'stack', columns: count }` and each stack carries the
 * initial stack properties with an empty `items` slot.
 */
export function planColumnsInsertion(
  options: Readonly<ColumnsInsertionOptions>,
): ColumnsInsertionPlan {
  const { count, destination } = options;
  if (!Number.isInteger(count) || count < 1 || count > MAX_COLUMNS) {
    throw new RangeError(`Columns count must be an integer 1..${MAX_COLUMNS}, not ${count}.`);
  }
  if (!Number.isInteger(destination.position) || destination.position < 0) {
    throw new RangeError(
      `Columns position must be a non-negative integer, not ${destination.position}.`,
    );
  }
  const version = options.version ?? CORE_LAYOUT_VERSION;
  const allocated = new Set<NodeId>();
  const operations: BlueprintBatchOperation[] = [];
  // One insert-node operation for a fresh structural layout node with an empty `items` slot.
  const insert = (
    type: (typeof CORE_LAYOUT_BLOCK_TYPES)['columns' | 'stack'],
    at: CommandDestination,
    nodeVersion: SemanticVersion,
    properties: BlueprintNode['properties'] = coreLayoutInitialProperties(type),
  ): NodeId => {
    const id = options.allocateId(type === CORE_LAYOUT_BLOCK_TYPES.columns ? 'columns' : 'stack');
    if (allocated.has(id)) {
      throw new RangeError(`Columns id ${id} was allocated twice.`);
    }
    allocated.add(id);
    operations.push({
      payload: {
        destination: { ...at },
        node: {
          authoring: { mode: 'structural' },
          bindings: {},
          id,
          properties,
          slots: { items: [] },
          type,
          version: nodeVersion,
        },
      },
      type: 'studio.command/insert-node',
    });
    return id;
  };

  const columnsNodeId = insert(CORE_LAYOUT_BLOCK_TYPES.columns, destination, version, {
    ...coreLayoutInitialProperties(CORE_LAYOUT_BLOCK_TYPES.columns),
    columns: count,
  });
  const stackNodeIds: NodeId[] = [];
  for (let index = 0; index < count; index += 1) {
    stackNodeIds.push(
      insert(
        CORE_LAYOUT_BLOCK_TYPES.stack,
        { parentNodeId: columnsNodeId, position: index, slot: 'items' },
        options.stackVersion ?? version,
      ),
    );
  }

  return {
    columnsNodeId,
    command: { payload: { operations }, type: 'studio.command/batch' },
    stackNodeIds,
  };
}
