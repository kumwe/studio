import type {
  BlueprintBatchOperation,
  BlueprintCommand,
  BlueprintDocument,
  BlueprintNode,
  CommandDestination,
  NodeId,
  StudioCommand,
  StudioConfiguration,
  StudioSessionMode,
} from '@kumwe/studio-protocol';
import { applyOperation, StudioCommandError } from './commands.js';

/**
 * Every session mode, in stable sorted order. The permitted-command table is
 * total over exactly this set.
 */
export const STUDIO_SESSION_MODES: readonly StudioSessionMode[] = Object.freeze([
  'blueprint',
  'content',
  'hybrid',
  'model',
  'read-only',
]);

/** Every canonical command type addressable by the mode table. */
export type StudioCommandType = StudioCommand['type'];

const BLUEPRINT_STRUCTURE_COMMAND_TYPES: readonly StudioCommandType[] = [
  'studio.command/apply-pattern',
  'studio.command/batch',
  'studio.command/duplicate-node',
  'studio.command/insert-node',
  'studio.command/move-node',
  'studio.command/remove-binding',
  'studio.command/remove-node',
  'studio.command/reorder-children',
  'studio.command/reset-inherited-property',
  'studio.command/restore-node',
  'studio.command/set-binding',
  'studio.command/set-property',
  'studio.command/set-size-role',
  'studio.command/unset-property',
  'studio.command/unset-size-role',
];

/**
 * The structure commands hybrid composition may dispatch when every affected
 * collection stays inside a structural authoring region. Property, binding,
 * size-role, inheritance-reset, and pattern commands remain Blueprint-mode
 * vocabulary.
 */
const HYBRID_STRUCTURE_OPERATION_TYPES: readonly StudioCommandType[] = [
  'studio.command/duplicate-node',
  'studio.command/insert-node',
  'studio.command/move-node',
  'studio.command/remove-node',
  'studio.command/reorder-children',
  'studio.command/restore-node',
];

const PERMITTED_COMMAND_TYPES: Readonly<Record<StudioSessionMode, ReadonlySet<StudioCommandType>>> =
  Object.freeze({
    blueprint: immutableCommandTypeSet(BLUEPRINT_STRUCTURE_COMMAND_TYPES),
    content: immutableCommandTypeSet(['studio.command/set-field-value']),
    hybrid: immutableCommandTypeSet([
      'studio.command/batch',
      ...HYBRID_STRUCTURE_OPERATION_TYPES,
      'studio.command/set-field-value',
    ]),
    model: immutableCommandTypeSet(['studio.command/add-model-field']),
    'read-only': immutableCommandTypeSet([]),
  });

const HYBRID_BATCHABLE_OPERATION_TYPES: ReadonlySet<StudioCommandType> = immutableCommandTypeSet(
  HYBRID_STRUCTURE_OPERATION_TYPES,
);

/**
 * The deterministic mode-to-permitted-command table: one immutable set per
 * session mode, shared across calls, so UIs derive disabled affordances from
 * the same source the session enforces. The table is type-level only; the
 * hybrid entries additionally require every affected collection to stay
 * inside a structural authoring region, which the session enforces per
 * command target.
 */
export function permittedCommandTypes(mode: StudioSessionMode): ReadonlySet<StudioCommandType> {
  return PERMITTED_COMMAND_TYPES[mode];
}

/**
 * Flattens a configuration's editing mode, composite, and session state into
 * the single session mode fixed at session creation: a read-only session
 * state always flattens to `read-only`, the hybrid composite flattens to
 * `hybrid`, and every other session keeps its authoring mode. The hybrid
 * composite is invalid with Model mode, mirroring the configuration schema.
 */
export function resolveSessionMode(
  configuration: Pick<StudioConfiguration, 'composite' | 'mode' | 'sessionState'>,
): StudioSessionMode {
  if (configuration.sessionState === 'read-only') {
    return 'read-only';
  }
  if (configuration.composite === 'hybrid') {
    if (configuration.mode === 'model') {
      throw new RangeError('The hybrid composite is invalid with the model editing mode.');
    }
    return 'hybrid';
  }
  return configuration.mode;
}

/**
 * Fails closed with the stable `mode-forbidden` code when the command type is
 * outside the active mode's permitted set.
 */
export function assertModePermitsCommandType(
  mode: StudioSessionMode,
  type: StudioCommandType,
): void {
  if (!PERMITTED_COMMAND_TYPES[mode].has(type)) {
    throw new StudioCommandError(
      'mode-forbidden',
      `Command type ${type} is not permitted in ${mode} mode.`,
    );
  }
}

/**
 * Enforces the bounded-composition rule for one hybrid structure command:
 * every collection the command inserts into, removes from, moves across, or
 * reorders must be a named slot of a node whose authoring policy mode is
 * `structural`; inserted block types must satisfy the structural node's
 * `allowedBlocks` when declared; subtrees containing a `locked` node are
 * never inserted, removed, moved, or duplicated; and document roots are
 * never in bounds. Batch operations are evaluated sequentially against a
 * trial state so later operations may compose nodes earlier operations
 * introduced. A violation fails closed with `mode-forbidden`; a reference
 * the gate cannot resolve is left for the reducer's canonical failure code.
 *
 * The passed document is consumed as trial scratch state and may be mutated;
 * callers pass a clone.
 */
export function assertHybridCommandInBounds(
  document: BlueprintDocument,
  command: BlueprintCommand,
): void {
  switch (command.type) {
    case 'studio.command/batch': {
      for (const operation of command.payload.operations) {
        const type = operation.type as string;
        if (
          type === 'studio.command/batch' ||
          type === 'studio.command/apply-pattern' ||
          type === 'studio.command/reset-inherited-property'
        ) {
          // Never legal inside a batch; the reducer's canonical
          // invalid-batch rejection resurfaces when the command executes.
          return;
        }
        if (!HYBRID_BATCHABLE_OPERATION_TYPES.has(operation.type)) {
          throw new StudioCommandError(
            'mode-forbidden',
            `Batch operation type ${operation.type} is not permitted in hybrid mode.`,
          );
        }
        assertHybridOperationInBounds(document, operation);
        try {
          applyOperation(document, operation);
        } catch {
          // The trial cannot advance past this operation; the reducer's
          // canonical failure code resurfaces when the command executes.
          return;
        }
      }
      return;
    }
    case 'studio.command/apply-pattern':
    case 'studio.command/reset-inherited-property':
      // Unreachable behind the type gate; kept for fail-closed defence.
      throw new StudioCommandError(
        'mode-forbidden',
        `Command type ${command.type} is not permitted in hybrid mode.`,
      );
    default:
      assertHybridOperationInBounds(document, command);
  }
}

function assertHybridOperationInBounds(
  document: BlueprintDocument,
  operation: BlueprintBatchOperation,
): void {
  switch (operation.type) {
    case 'studio.command/insert-node':
    case 'studio.command/restore-node': {
      assertSubtreeUnlocked(operation.payload.node);
      assertComposableDestination(document, operation.payload.destination, operation.payload.node);
      return;
    }
    case 'studio.command/remove-node': {
      const location = locateNode(document.roots, operation.payload.nodeId);
      if (location === undefined) {
        return;
      }
      assertSubtreeUnlocked(location.node);
      assertComposableParent(location.parent);
      return;
    }
    case 'studio.command/move-node': {
      const location = locateNode(document.roots, operation.payload.nodeId);
      if (location === undefined) {
        return;
      }
      assertSubtreeUnlocked(location.node);
      assertComposableParent(location.parent);
      assertComposableDestination(document, operation.payload.destination, location.node);
      return;
    }
    case 'studio.command/duplicate-node': {
      const location = locateNode(document.roots, operation.payload.nodeId);
      if (location === undefined) {
        return;
      }
      assertSubtreeUnlocked(location.node);
      if (operation.payload.destination === undefined) {
        assertComposableParent(location.parent);
        if (location.parent !== undefined) {
          assertAllowedBlock(location.parent, location.node);
        }
      } else {
        assertComposableDestination(document, operation.payload.destination, location.node);
      }
      return;
    }
    case 'studio.command/reorder-children': {
      if (operation.payload.parentNodeId === undefined) {
        throw rootsOutOfBounds();
      }
      assertComposableParent(locateNode(document.roots, operation.payload.parentNodeId)?.node);
      return;
    }
    default:
      // Unreachable behind the type gate; kept for fail-closed defence.
      throw new StudioCommandError(
        'mode-forbidden',
        `Batch operation type ${operation.type} is not permitted in hybrid mode.`,
      );
  }
}

interface HybridNodeLocation {
  node: BlueprintNode;
  parent?: BlueprintNode;
}

function locateNode(
  nodes: readonly BlueprintNode[],
  nodeId: NodeId,
  parent?: BlueprintNode,
): HybridNodeLocation | undefined {
  for (const node of nodes) {
    if (node.id === nodeId) {
      return parent === undefined ? { node } : { node, parent };
    }
    for (const children of Object.values(node.slots)) {
      const nested = locateNode(children, nodeId, node);
      if (nested !== undefined) {
        return nested;
      }
    }
  }
  return undefined;
}

function assertComposableDestination(
  document: BlueprintDocument,
  destination: CommandDestination,
  node: BlueprintNode,
): void {
  if (destination.parentNodeId === undefined) {
    throw rootsOutOfBounds();
  }
  const parent = locateNode(document.roots, destination.parentNodeId)?.node;
  if (parent === undefined) {
    // The reducer's canonical parent-not-found rejection resurfaces.
    return;
  }
  assertComposableParent(parent);
  assertAllowedBlock(parent, node);
}

function assertComposableParent(parent: BlueprintNode | undefined): void {
  if (parent === undefined) {
    throw rootsOutOfBounds();
  }
  if (parent.authoring.mode !== 'structural') {
    throw new StudioCommandError(
      'mode-forbidden',
      `Hybrid composition is bounded to structural slots; node ${parent.id} does not declare structural authoring.`,
    );
  }
}

function assertAllowedBlock(parent: BlueprintNode, node: BlueprintNode): void {
  const allowedBlocks = parent.authoring.allowedBlocks;
  if (allowedBlocks !== undefined && !allowedBlocks.includes(node.type)) {
    throw new StudioCommandError(
      'mode-forbidden',
      `Block type ${node.type} is not an allowed block inside structural node ${parent.id}.`,
    );
  }
}

function assertSubtreeUnlocked(node: BlueprintNode): void {
  const stack: BlueprintNode[] = [node];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined) {
      break;
    }
    if (current.authoring.mode === 'locked') {
      throw new StudioCommandError(
        'mode-forbidden',
        `Node ${current.id} is locked and never changes through hybrid composition.`,
      );
    }
    for (const children of Object.values(current.slots)) {
      stack.push(...children);
    }
  }
}

function rootsOutOfBounds(): StudioCommandError {
  return new StudioCommandError(
    'mode-forbidden',
    'Hybrid composition is bounded to structural slots; the document roots are out of bounds.',
  );
}

function immutableCommandTypeSet(
  types: readonly StudioCommandType[],
): ReadonlySet<StudioCommandType> {
  const set = new Set(types);
  const forbidMutation = (): never => {
    throw new TypeError('The permitted command-type table is immutable.');
  };
  return Object.freeze(
    Object.assign(set, { add: forbidMutation, clear: forbidMutation, delete: forbidMutation }),
  );
}
