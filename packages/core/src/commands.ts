import type {
  BlueprintCommand,
  BlueprintDocument,
  BlueprintNode,
  CommandDestination,
  NodeId,
} from '@kumwe/studio-protocol';
import { cloneContractValue } from './clone.js';

export type StudioCommandErrorCode =
  | 'duplicate-node'
  | 'illegal-move'
  | 'invalid-index'
  | 'node-not-found'
  | 'parent-not-found'
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

interface NodeLocation {
  collection: BlueprintNode[];
  index: number;
  node: BlueprintNode;
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

  switch (command.type) {
    case 'studio.command/insert-node': {
      if (findNode(next.roots, command.payload.node.id) !== undefined) {
        throw new StudioCommandError(
          'duplicate-node',
          `Node identifier ${command.payload.node.id} is already present.`,
        );
      }
      const collection = resolveTargetCollection(next, command.payload.destination);
      insertAt(
        collection,
        command.payload.destination.position,
        cloneContractValue(command.payload.node),
      );
      break;
    }
    case 'studio.command/remove-node': {
      const location = findNode(next.roots, command.payload.nodeId);
      if (location === undefined) {
        throw nodeNotFound(command.payload.nodeId);
      }
      location.collection.splice(location.index, 1);
      break;
    }
    case 'studio.command/move-node': {
      const source = findNode(next.roots, command.payload.nodeId);
      if (source === undefined) {
        throw nodeNotFound(command.payload.nodeId);
      }
      const parentNodeId = command.payload.destination.parentNodeId;
      if (
        parentNodeId === command.payload.nodeId ||
        (parentNodeId !== undefined && findNode([source.node], parentNodeId) !== undefined)
      ) {
        throw new StudioCommandError('illegal-move', 'A node cannot be moved into itself.');
      }

      const [moving] = source.collection.splice(source.index, 1);
      if (moving === undefined) {
        throw nodeNotFound(command.payload.nodeId);
      }
      const collection = resolveTargetCollection(next, command.payload.destination);
      insertAt(collection, command.payload.destination.position, moving);
      break;
    }
    case 'studio.command/set-property': {
      const location = findNode(next.roots, command.payload.nodeId);
      if (location === undefined) {
        throw nodeNotFound(command.payload.nodeId);
      }
      if (command.payload.viewport === undefined) {
        setOwnMapValue(
          location.node.properties,
          command.payload.property,
          cloneContractValue(command.payload.value),
        );
      } else {
        const responsive = (location.node.responsive ??= Object.create(null) as NonNullable<
          BlueprintNode['responsive']
        >);
        let values = ownMapValue(responsive, command.payload.property);
        if (values === undefined) {
          values = Object.create(null) as NonNullable<BlueprintNode['responsive']>[string];
          setOwnMapValue(responsive, command.payload.property, values);
        }
        setOwnMapValue(values, command.payload.viewport, cloneContractValue(command.payload.value));
      }
      break;
    }
    default:
      return assertNever(command);
  }

  return next;
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

function insertAt(collection: BlueprintNode[], index: number, node: BlueprintNode): void {
  if (!Number.isInteger(index) || index < 0 || index > collection.length) {
    throw new StudioCommandError('invalid-index', `Insertion index ${index} is outside the slot.`);
  }
  collection.splice(index, 0, node);
}

function findNode(nodes: BlueprintNode[], nodeId: NodeId): NodeLocation | undefined {
  for (const [index, node] of nodes.entries()) {
    if (node.id === nodeId) {
      return { collection: nodes, index, node };
    }
    for (const children of Object.values(node.slots)) {
      const nested = findNode(children, nodeId);
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
