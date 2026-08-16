import type {
  ApplyPatternPayload,
  BlueprintBatchOperation,
  BlueprintCommand,
  BlueprintDocument,
  BlueprintNode,
  CommandDestination,
  JsonValue,
  NodeId,
  ReorderChildrenPayload,
  StableId,
} from '@kumwe/studio-protocol';
import { cloneContractValue } from './clone.js';

export type StudioCommandErrorCode =
  | 'artifact-not-draft'
  | 'binding-not-found'
  | 'duplicate-field'
  | 'duplicate-node'
  | 'illegal-move'
  | 'invalid-batch'
  | 'invalid-id-map'
  | 'invalid-index'
  | 'invalid-order'
  | 'locale-mismatch'
  | 'node-not-found'
  | 'parent-not-found'
  | 'property-not-found'
  | 'read-only-session'
  | 'stale-generation'
  | 'stale-state'
  | 'unsupported-command';

export class StudioCommandError extends Error {
  public readonly code: StudioCommandErrorCode;

  public constructor(code: StudioCommandErrorCode, message: string) {
    super(message);
    this.name = 'StudioCommandError';
    this.code = code;
  }
}

export interface InverseCommandOptions {
  id: StableId;
}

interface NodeLocation {
  collection: BlueprintNode[];
  index: number;
  node: BlueprintNode;
  parentNodeId?: NodeId;
  slot?: string;
}

export function applyCommand(
  document: BlueprintDocument,
  command: BlueprintCommand,
): BlueprintDocument {
  if (command.artifactId !== document.id) {
    throw new StudioCommandError(
      'node-not-found',
      `Command targets ${command.artifactId}, not Blueprint ${document.id}.`,
    );
  }

  const next = cloneContractValue(document);
  if (command.type === 'studio.command/batch') {
    for (const operation of assertBatchOperations(command.payload.operations)) {
      applyOperation(next, operation);
    }
  } else if (command.type === 'studio.command/apply-pattern') {
    applyPattern(next, command.payload);
  } else {
    applyOperation(next, command);
  }
  return next;
}

export function invertCommand(
  document: BlueprintDocument,
  command: BlueprintCommand,
  options: Readonly<InverseCommandOptions>,
): BlueprintCommand {
  if (command.artifactId !== document.id) {
    throw new StudioCommandError(
      'node-not-found',
      `Command targets ${command.artifactId}, not Blueprint ${document.id}.`,
    );
  }

  let inverse: BlueprintBatchOperation | { operations: BlueprintBatchOperation[] };
  if (command.type === 'studio.command/batch') {
    const working = cloneContractValue(document);
    const operations: BlueprintBatchOperation[] = [];
    for (const operation of assertBatchOperations(command.payload.operations)) {
      operations.unshift(invertOperation(working, operation));
      applyOperation(working, operation);
    }
    inverse = { operations };
  } else if (command.type === 'studio.command/apply-pattern') {
    const removals = command.payload.nodes.map((node): BlueprintBatchOperation => {
      const mapped = ownMapValue(command.payload.idMap, node.id);
      if (mapped === undefined) {
        throw incompleteIdMap();
      }
      return { payload: { nodeId: mapped }, type: 'studio.command/remove-node' };
    });
    const [single] = removals;
    inverse = removals.length === 1 && single !== undefined ? single : { operations: removals };
  } else {
    inverse = invertOperation(document, command);
  }

  const envelope = {
    artifactId: command.artifactId,
    baseStateVersion: command.baseStateVersion + 1,
    contractVersion: command.contractVersion,
    id: options.id,
    kind: 'command',
    sessionGeneration: command.sessionGeneration,
  } as const;
  const grouped = command.groupId === undefined ? {} : { groupId: command.groupId };

  if ('operations' in inverse) {
    return {
      ...envelope,
      ...grouped,
      payload: inverse,
      type: 'studio.command/batch',
    };
  }
  return {
    ...envelope,
    ...grouped,
    payload: inverse.payload,
    type: inverse.type,
  } as BlueprintCommand;
}

function assertBatchOperations(
  operations: readonly BlueprintBatchOperation[],
): readonly BlueprintBatchOperation[] {
  if (operations.length === 0 || operations.length > 100) {
    throw new StudioCommandError(
      'invalid-batch',
      `A batch must contain between 1 and 100 operations, not ${operations.length}.`,
    );
  }
  for (const operation of operations) {
    const type = operation.type as string;
    if (type === 'studio.command/batch' || type === 'studio.command/apply-pattern') {
      throw new StudioCommandError(
        'invalid-batch',
        `A batch cannot contain a ${type.slice(type.indexOf('/') + 1)} operation.`,
      );
    }
  }
  return operations;
}

function applyOperation(document: BlueprintDocument, operation: BlueprintBatchOperation): void {
  switch (operation.type) {
    case 'studio.command/insert-node': {
      if (findNode(document.roots, operation.payload.node.id) !== undefined) {
        throw new StudioCommandError(
          'duplicate-node',
          `Node identifier ${operation.payload.node.id} is already present.`,
        );
      }
      const collection = resolveTargetCollection(document, operation.payload.destination);
      insertAt(
        collection,
        operation.payload.destination.position,
        cloneContractValue(operation.payload.node),
      );
      break;
    }
    case 'studio.command/remove-node': {
      const location = findNode(document.roots, operation.payload.nodeId);
      if (location === undefined) {
        throw nodeNotFound(operation.payload.nodeId);
      }
      location.collection.splice(location.index, 1);
      dropEmptySlotCollection(document, location);
      break;
    }
    case 'studio.command/move-node': {
      const source = findNode(document.roots, operation.payload.nodeId);
      if (source === undefined) {
        throw nodeNotFound(operation.payload.nodeId);
      }
      const parentNodeId = operation.payload.destination.parentNodeId;
      if (
        parentNodeId === operation.payload.nodeId ||
        (parentNodeId !== undefined && findNode([source.node], parentNodeId) !== undefined)
      ) {
        throw new StudioCommandError('illegal-move', 'A node cannot be moved into itself.');
      }

      const [moving] = source.collection.splice(source.index, 1);
      if (moving === undefined) {
        throw nodeNotFound(operation.payload.nodeId);
      }
      dropEmptySlotCollection(document, source);
      const collection = resolveTargetCollection(document, operation.payload.destination);
      insertAt(collection, operation.payload.destination.position, moving);
      break;
    }
    case 'studio.command/duplicate-node': {
      const source = findNode(document.roots, operation.payload.nodeId);
      if (source === undefined) {
        throw nodeNotFound(operation.payload.nodeId);
      }
      const idMap = assertCompleteIdMap(document, source.node, operation.payload.idMap);
      const copy = remapSubtree(cloneContractValue(source.node), idMap);
      if (operation.payload.destination === undefined) {
        insertAt(source.collection, source.index + 1, copy);
      } else {
        const collection = resolveTargetCollection(document, operation.payload.destination);
        insertAt(collection, operation.payload.destination.position, copy);
      }
      break;
    }
    case 'studio.command/reorder-children': {
      const collection = resolveExistingCollection(
        document,
        operation.payload.parentNodeId,
        operation.payload.slot,
      );
      const currentIds = collection.map((node) => node.id);
      if (!isPermutation(currentIds, operation.payload.order)) {
        throw new StudioCommandError(
          'invalid-order',
          'The requested order is not a permutation of the current children.',
        );
      }
      const byId = new Map(collection.map((node) => [node.id, node]));
      const reordered = operation.payload.order.map((nodeId) => {
        const node = byId.get(nodeId);
        if (node === undefined) {
          throw new StudioCommandError(
            'invalid-order',
            'The requested order is not a permutation of the current children.',
          );
        }
        return node;
      });
      collection.splice(0, collection.length, ...reordered);
      break;
    }
    case 'studio.command/set-property': {
      const location = findNode(document.roots, operation.payload.nodeId);
      if (location === undefined) {
        throw nodeNotFound(operation.payload.nodeId);
      }
      if (operation.payload.viewport === undefined) {
        setOwnMapValue(
          location.node.properties,
          operation.payload.property,
          cloneContractValue(operation.payload.value),
        );
      } else {
        // Canonical documents use plain JSON objects; member-name safety is
        // enforced by the schemas and by own-property map access.
        const responsive = (location.node.responsive ??= {});
        let values = ownMapValue(responsive, operation.payload.property);
        if (values === undefined) {
          values = {};
          setOwnMapValue(responsive, operation.payload.property, values);
        }
        setOwnMapValue(
          values,
          operation.payload.viewport,
          cloneContractValue(operation.payload.value),
        );
      }
      break;
    }
    case 'studio.command/unset-property': {
      const location = findNode(document.roots, operation.payload.nodeId);
      if (location === undefined) {
        throw nodeNotFound(operation.payload.nodeId);
      }
      if (operation.payload.viewport === undefined) {
        if (ownMapValue(location.node.properties, operation.payload.property) === undefined) {
          throw propertyNotFound(operation.payload.nodeId, operation.payload.property);
        }
        deleteOwnMapValue(location.node.properties, operation.payload.property);
      } else {
        const responsive = location.node.responsive;
        const values =
          responsive === undefined
            ? undefined
            : ownMapValue(responsive, operation.payload.property);
        if (
          responsive === undefined ||
          values === undefined ||
          ownMapValue(values, operation.payload.viewport) === undefined
        ) {
          throw propertyNotFound(
            operation.payload.nodeId,
            operation.payload.property,
            operation.payload.viewport,
          );
        }
        deleteOwnMapValue(values, operation.payload.viewport);
        if (Object.keys(values).length === 0) {
          deleteOwnMapValue(responsive, operation.payload.property);
        }
        if (Object.keys(responsive).length === 0) {
          delete location.node.responsive;
        }
      }
      break;
    }
    case 'studio.command/set-binding': {
      const location = findNode(document.roots, operation.payload.nodeId);
      if (location === undefined) {
        throw nodeNotFound(operation.payload.nodeId);
      }
      setOwnMapValue(
        location.node.bindings,
        operation.payload.port,
        cloneContractValue(operation.payload.binding),
      );
      break;
    }
    case 'studio.command/remove-binding': {
      const location = findNode(document.roots, operation.payload.nodeId);
      if (location === undefined) {
        throw nodeNotFound(operation.payload.nodeId);
      }
      if (ownMapValue(location.node.bindings, operation.payload.port) === undefined) {
        throw bindingNotFound(operation.payload.nodeId, operation.payload.port);
      }
      deleteOwnMapValue(location.node.bindings, operation.payload.port);
      break;
    }
    default:
      assertNever(operation);
  }
}

function invertOperation(
  document: BlueprintDocument,
  operation: BlueprintBatchOperation,
): BlueprintBatchOperation {
  switch (operation.type) {
    case 'studio.command/insert-node': {
      return {
        payload: { nodeId: operation.payload.node.id },
        type: 'studio.command/remove-node',
      };
    }
    case 'studio.command/remove-node': {
      const location = findNode(document.roots, operation.payload.nodeId);
      if (location === undefined) {
        throw nodeNotFound(operation.payload.nodeId);
      }
      return {
        payload: {
          destination: destinationOf(location),
          node: cloneContractValue(location.node),
        },
        type: 'studio.command/insert-node',
      };
    }
    case 'studio.command/move-node': {
      const location = findNode(document.roots, operation.payload.nodeId);
      if (location === undefined) {
        throw nodeNotFound(operation.payload.nodeId);
      }
      return {
        payload: {
          destination: destinationOf(location),
          nodeId: operation.payload.nodeId,
        },
        type: 'studio.command/move-node',
      };
    }
    case 'studio.command/duplicate-node': {
      const duplicateRootId = ownMapValue(operation.payload.idMap, operation.payload.nodeId);
      if (duplicateRootId === undefined) {
        throw new StudioCommandError(
          'invalid-id-map',
          `The identifier map does not remap the duplicated root ${operation.payload.nodeId}.`,
        );
      }
      return {
        payload: { nodeId: duplicateRootId },
        type: 'studio.command/remove-node',
      };
    }
    case 'studio.command/reorder-children': {
      const collection = resolveExistingCollection(
        document,
        operation.payload.parentNodeId,
        operation.payload.slot,
      );
      const payload: ReorderChildrenPayload = { order: collection.map((node) => node.id) };
      if (operation.payload.parentNodeId !== undefined && operation.payload.slot !== undefined) {
        payload.parentNodeId = operation.payload.parentNodeId;
        payload.slot = operation.payload.slot;
      }
      return { payload, type: 'studio.command/reorder-children' };
    }
    case 'studio.command/set-property': {
      const location = findNode(document.roots, operation.payload.nodeId);
      if (location === undefined) {
        throw nodeNotFound(operation.payload.nodeId);
      }
      const previous = previousPropertyValue(
        location.node,
        operation.payload.property,
        operation.payload.viewport,
      );
      if (previous === undefined) {
        const payload: { nodeId: NodeId; property: string; viewport?: string } = {
          nodeId: operation.payload.nodeId,
          property: operation.payload.property,
        };
        if (operation.payload.viewport !== undefined) {
          payload.viewport = operation.payload.viewport;
        }
        return { payload, type: 'studio.command/unset-property' };
      }
      return {
        payload: restorePropertyPayload(operation.payload, previous),
        type: 'studio.command/set-property',
      };
    }
    case 'studio.command/unset-property': {
      const location = findNode(document.roots, operation.payload.nodeId);
      if (location === undefined) {
        throw nodeNotFound(operation.payload.nodeId);
      }
      const previous = previousPropertyValue(
        location.node,
        operation.payload.property,
        operation.payload.viewport,
      );
      if (previous === undefined) {
        throw propertyNotFound(
          operation.payload.nodeId,
          operation.payload.property,
          operation.payload.viewport,
        );
      }
      return {
        payload: restorePropertyPayload(operation.payload, previous),
        type: 'studio.command/set-property',
      };
    }
    case 'studio.command/set-binding': {
      const location = findNode(document.roots, operation.payload.nodeId);
      if (location === undefined) {
        throw nodeNotFound(operation.payload.nodeId);
      }
      const previous = ownMapValue(location.node.bindings, operation.payload.port);
      if (previous === undefined) {
        return {
          payload: { nodeId: operation.payload.nodeId, port: operation.payload.port },
          type: 'studio.command/remove-binding',
        };
      }
      return {
        payload: {
          binding: cloneContractValue(previous),
          nodeId: operation.payload.nodeId,
          port: operation.payload.port,
        },
        type: 'studio.command/set-binding',
      };
    }
    case 'studio.command/remove-binding': {
      const location = findNode(document.roots, operation.payload.nodeId);
      if (location === undefined) {
        throw nodeNotFound(operation.payload.nodeId);
      }
      const previous = ownMapValue(location.node.bindings, operation.payload.port);
      if (previous === undefined) {
        throw bindingNotFound(operation.payload.nodeId, operation.payload.port);
      }
      return {
        payload: {
          binding: cloneContractValue(previous),
          nodeId: operation.payload.nodeId,
          port: operation.payload.port,
        },
        type: 'studio.command/set-binding',
      };
    }
    default:
      return assertNever(operation);
  }
}

function restorePropertyPayload(
  payload: { nodeId: NodeId; property: string; viewport?: string },
  value: JsonValue,
): { nodeId: NodeId; property: string; value: JsonValue; viewport?: string } {
  const restored: { nodeId: NodeId; property: string; value: JsonValue; viewport?: string } = {
    nodeId: payload.nodeId,
    property: payload.property,
    value: cloneContractValue(value),
  };
  if (payload.viewport !== undefined) {
    restored.viewport = payload.viewport;
  }
  return restored;
}

function previousPropertyValue(
  node: BlueprintNode,
  property: string,
  viewport: string | undefined,
): JsonValue | undefined {
  if (viewport === undefined) {
    return ownMapValue(node.properties, property);
  }
  const values = node.responsive === undefined ? undefined : ownMapValue(node.responsive, property);
  return values === undefined ? undefined : ownMapValue(values, viewport);
}

function destinationOf(location: NodeLocation): CommandDestination {
  if (location.parentNodeId !== undefined && location.slot !== undefined) {
    return {
      parentNodeId: location.parentNodeId,
      position: location.index,
      slot: location.slot,
    };
  }
  return { position: location.index };
}

function assertCompleteIdMap(
  document: BlueprintDocument,
  source: BlueprintNode,
  idMap: Readonly<Record<NodeId, NodeId>>,
): ReadonlyMap<NodeId, NodeId> {
  const subtreeIds = collectSubtreeIds(source);
  const provided = new Map<NodeId, NodeId>();
  for (const [from, to] of Object.entries(idMap)) {
    provided.set(from, to);
  }

  if (provided.size !== subtreeIds.size) {
    throw incompleteIdMap();
  }
  const assigned = new Set<NodeId>();
  for (const from of subtreeIds) {
    const to = provided.get(from);
    if (to === undefined) {
      throw incompleteIdMap();
    }
    if (assigned.has(to)) {
      throw new StudioCommandError(
        'invalid-id-map',
        `The identifier map assigns ${to} more than once.`,
      );
    }
    assigned.add(to);
    if (findNode(document.roots, to) !== undefined) {
      throw new StudioCommandError('duplicate-node', `Node identifier ${to} is already present.`);
    }
  }
  return provided;
}

function incompleteIdMap(): StudioCommandError {
  return new StudioCommandError(
    'invalid-id-map',
    'The identifier map must remap every node of the duplicated subtree exactly once.',
  );
}

function collectSubtreeIds(node: BlueprintNode): ReadonlySet<NodeId> {
  const identifiers = new Set<NodeId>();
  const stack: BlueprintNode[] = [node];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined) {
      break;
    }
    identifiers.add(current.id);
    for (const children of Object.values(current.slots)) {
      stack.push(...children);
    }
  }
  return identifiers;
}

function remapSubtree(node: BlueprintNode, idMap: ReadonlyMap<NodeId, NodeId>): BlueprintNode {
  const stack: BlueprintNode[] = [node];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined) {
      break;
    }
    const mapped = idMap.get(current.id);
    if (mapped === undefined) {
      throw incompleteIdMap();
    }
    current.id = mapped;
    for (const children of Object.values(current.slots)) {
      stack.push(...children);
    }
  }
  return node;
}

function applyPattern(document: BlueprintDocument, payload: Readonly<ApplyPatternPayload>): void {
  const subtreeIds = new Set<NodeId>();
  for (const node of payload.nodes) {
    for (const nodeId of collectSubtreeIds(node)) {
      subtreeIds.add(nodeId);
    }
  }
  const provided = new Map<NodeId, NodeId>();
  for (const [from, to] of Object.entries(payload.idMap)) {
    provided.set(from, to);
  }
  if (provided.size !== subtreeIds.size) {
    throw incompleteIdMap();
  }
  const assigned = new Set<NodeId>();
  for (const from of subtreeIds) {
    const to = provided.get(from);
    if (to === undefined) {
      throw incompleteIdMap();
    }
    if (assigned.has(to)) {
      throw new StudioCommandError(
        'invalid-id-map',
        `The identifier map assigns ${to} more than once.`,
      );
    }
    assigned.add(to);
    if (findNode(document.roots, to) !== undefined) {
      throw new StudioCommandError('duplicate-node', `Node identifier ${to} is already present.`);
    }
  }

  const collection = resolveTargetCollection(document, payload.destination);
  for (const [index, node] of payload.nodes.entries()) {
    const copy = remapSubtree(cloneContractValue(node), provided);
    const extensions = (copy.extensions ??= {});
    setOwnMapValue(extensions, 'studio.pattern/source', {
      id: payload.pattern.id,
      revision: payload.pattern.revision,
      version: payload.pattern.version,
    });
    insertAt(collection, payload.destination.position + index, copy);
  }
}

function dropEmptySlotCollection(document: BlueprintDocument, location: NodeLocation): void {
  if (
    location.collection.length > 0 ||
    location.parentNodeId === undefined ||
    location.slot === undefined
  ) {
    return;
  }
  const parent = findNode(document.roots, location.parentNodeId)?.node;
  if (parent !== undefined && ownMapValue(parent.slots, location.slot) === location.collection) {
    deleteOwnMapValue(parent.slots, location.slot);
  }
}

function isPermutation(current: readonly NodeId[], requested: readonly NodeId[]): boolean {
  if (current.length !== requested.length) {
    return false;
  }
  const remaining = new Map<NodeId, number>();
  for (const nodeId of current) {
    remaining.set(nodeId, (remaining.get(nodeId) ?? 0) + 1);
  }
  for (const nodeId of requested) {
    const count = remaining.get(nodeId);
    if (count === undefined || count === 0) {
      return false;
    }
    remaining.set(nodeId, count - 1);
  }
  return true;
}

function resolveExistingCollection(
  document: BlueprintDocument,
  parentNodeId: NodeId | undefined,
  slot: string | undefined,
): BlueprintNode[] {
  if (parentNodeId === undefined) {
    return document.roots;
  }
  if (slot === undefined) {
    throw new StudioCommandError('parent-not-found', 'A parent destination requires a named slot.');
  }
  const parent = findNode(document.roots, parentNodeId)?.node;
  if (parent === undefined) {
    throw new StudioCommandError('parent-not-found', `Parent node ${parentNodeId} was not found.`);
  }
  const collection = ownMapValue(parent.slots, slot);
  if (collection === undefined) {
    throw new StudioCommandError(
      'invalid-order',
      `Slot ${slot} on node ${parentNodeId} has no children to reorder.`,
    );
  }
  return collection;
}

function assertNever(value: never): never {
  const commandType = safeCommandType(value);
  throw new StudioCommandError(
    'unsupported-command',
    `Unsupported Blueprint command type: ${commandType}.`,
  );
}

function safeCommandType(value: unknown): string {
  if (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    typeof value.type === 'string' &&
    value.type.length <= 160 &&
    /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*\/[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/u.test(value.type)
  ) {
    return value.type;
  }
  return 'unknown';
}

function resolveTargetCollection(
  document: BlueprintDocument,
  destination: CommandDestination,
): BlueprintNode[] {
  if (destination.parentNodeId === undefined) {
    return document.roots;
  }
  if (destination.slot === undefined) {
    throw new StudioCommandError('parent-not-found', 'A parent destination requires a named slot.');
  }

  const parent = findNode(document.roots, destination.parentNodeId)?.node;
  if (parent === undefined) {
    throw new StudioCommandError(
      'parent-not-found',
      `Parent node ${destination.parentNodeId} was not found.`,
    );
  }

  let collection = ownMapValue(parent.slots, destination.slot);
  if (collection === undefined) {
    collection = [];
    setOwnMapValue(parent.slots, destination.slot, collection);
  }
  return collection;
}

function ownMapValue<T>(map: Record<string, T>, key: string): T | undefined {
  return Object.hasOwn(map, key) ? map[key] : undefined;
}

function setOwnMapValue<T>(map: Record<string, T>, key: string, value: T): void {
  Object.defineProperty(map, key, {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  });
}

function deleteOwnMapValue<T>(map: Record<string, T>, key: string): void {
  if (Object.hasOwn(map, key)) {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete map[key];
  }
}

function insertAt(collection: BlueprintNode[], index: number, node: BlueprintNode): void {
  if (!Number.isInteger(index) || index < 0 || index > collection.length) {
    throw new StudioCommandError('invalid-index', `Insertion index ${index} is outside the slot.`);
  }
  collection.splice(index, 0, node);
}

function findNode(
  nodes: BlueprintNode[],
  nodeId: NodeId,
  parentNodeId?: NodeId,
  slot?: string,
): NodeLocation | undefined {
  for (const [index, node] of nodes.entries()) {
    if (node.id === nodeId) {
      const location: NodeLocation = { collection: nodes, index, node };
      if (parentNodeId !== undefined && slot !== undefined) {
        location.parentNodeId = parentNodeId;
        location.slot = slot;
      }
      return location;
    }
    for (const [slotName, children] of Object.entries(node.slots)) {
      const nested = findNode(children, nodeId, node.id, slotName);
      if (nested !== undefined) {
        return nested;
      }
    }
  }
  return undefined;
}

function nodeNotFound(nodeId: NodeId): StudioCommandError {
  return new StudioCommandError('node-not-found', `Node ${nodeId} was not found.`);
}

function propertyNotFound(nodeId: NodeId, property: string, viewport?: string): StudioCommandError {
  const target = viewport === undefined ? property : `${property} for viewport ${viewport}`;
  return new StudioCommandError(
    'property-not-found',
    `Property ${target} is not set on node ${nodeId}.`,
  );
}

function bindingNotFound(nodeId: NodeId, port: string): StudioCommandError {
  return new StudioCommandError(
    'binding-not-found',
    `Binding ${port} is not present on node ${nodeId}.`,
  );
}
