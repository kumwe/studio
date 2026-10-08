import type {
  BlockDefinition,
  BlueprintNode,
  CommandDestination,
  NodeId,
  PreviewMarkerRect,
} from '@kumwe/studio-protocol';
import { CORE_LAYOUT_BLOCK_TYPES } from '@kumwe/studio-core';
import { findOutlineLocation } from './outline.js';

/**
 * Pure destination helpers for the explicit add controls. Every add control
 * names the exact collection and position a new block goes to; these helpers
 * compute those destinations, the derived column positions and the empty
 * containers the page offers, and know nothing about the DOM, the session's
 * permissions or the message catalog. The shell validates every destination
 * against its single insertion rule before it offers or uses one.
 */

/** The slot of a core columns block whose stack children read as its columns. */
const COLUMNS_SLOT = 'items';

/** The end of the document roots. */
export function pageEndDestination(roots: readonly BlueprintNode[]): CommandDestination {
  return { position: roots.length };
}

/** The end of a node's slot (an absent slot counts as empty). */
export function slotEndDestination(node: BlueprintNode, slot: string): CommandDestination {
  return { parentNodeId: node.id, position: node.slots[slot]?.length ?? 0, slot };
}

/** The position of a listed node itself in its own collection (insert before it); undefined when absent. */
export function beforeDestination(
  roots: readonly BlueprintNode[],
  nodeId: NodeId,
): CommandDestination | undefined {
  return siblingDestination(roots, nodeId, 0);
}

/** The position directly after a listed node in its own collection; undefined when the node is absent. */
export function afterDestination(
  roots: readonly BlueprintNode[],
  nodeId: NodeId,
): CommandDestination | undefined {
  return siblingDestination(roots, nodeId, 1);
}

/** Whether the destination still names an existing collection and a position within 0..length. */
export function isDestinationCurrent(
  roots: readonly BlueprintNode[],
  destination: CommandDestination,
): boolean {
  const { parentNodeId, position, slot } = destination;
  if (!Number.isInteger(position) || position < 0) {
    return false;
  }
  if (parentNodeId === undefined) {
    return slot === undefined && position <= roots.length;
  }
  if (slot === undefined) {
    return false;
  }
  const parent = findOutlineLocation(roots, parentNodeId)?.node;
  return parent !== undefined && position <= (parent.slots[slot]?.length ?? 0);
}

/**
 * The identifiers the collection a destination names lists, in order;
 * undefined when that collection no longer exists. A pending destination
 * keeps its meaning only while these stay exactly as they were when it was
 * chosen: a move, an undo or a removal in that collection would otherwise
 * leave the same position pointing somewhere the `+` never named.
 */
export function destinationEntries(
  roots: readonly BlueprintNode[],
  destination: CommandDestination,
): readonly NodeId[] | undefined {
  const { parentNodeId, slot } = destination;
  if (parentNodeId === undefined) {
    return slot === undefined ? roots.map((node) => node.id) : undefined;
  }
  if (slot === undefined) {
    return undefined;
  }
  const parent = findOutlineLocation(roots, parentNodeId)?.node;
  return parent === undefined ? undefined : (parent.slots[slot] ?? []).map((node) => node.id);
}

/**
 * The nodes a host inserted into a document that held `before`: every node
 * outside `before` whose parent is inside it (or that is a root), in
 * depth-first order. A new node's own descendants are part of it, so a
 * column card reports only its columns block.
 */
export function insertedRootIds(
  before: ReadonlySet<NodeId>,
  roots: readonly BlueprintNode[],
): readonly NodeId[] {
  const found: NodeId[] = [];
  const visit = (nodes: readonly BlueprintNode[]): void => {
    for (const node of nodes) {
      if (!before.has(node.id)) {
        found.push(node.id);
        continue;
      }
      for (const children of Object.values(node.slots)) {
        visit(children);
      }
    }
  };
  visit(roots);
  return found;
}

/** `{ count, position }` (1-based) for a stack listed in the `items` slot of a columns block; undefined otherwise. */
export function columnPosition(
  roots: readonly BlueprintNode[],
  nodeId: NodeId,
): { count: number; position: number } | undefined {
  const location = findOutlineLocation(roots, nodeId);
  if (
    location?.node.type !== CORE_LAYOUT_BLOCK_TYPES.stack ||
    location.parentNodeId === undefined ||
    location.slot !== COLUMNS_SLOT
  ) {
    return undefined;
  }
  const parent = findOutlineLocation(roots, location.parentNodeId)?.node;
  if (parent?.type !== CORE_LAYOUT_BLOCK_TYPES.columns) {
    return undefined;
  }
  return { count: location.collection.length, position: location.index + 1 };
}

/** The slots an opened level lists: declared slots in declaration order (empty included), then undeclared non-empty ones. */
export function levelSlots(
  node: BlueprintNode,
  definition: BlockDefinition | undefined,
): readonly { children: readonly BlueprintNode[]; slot: string }[] {
  const declared = definition?.slots.map((slot) => slot.id) ?? [];
  const listed: { children: readonly BlueprintNode[]; slot: string }[] = declared.map((slot) => ({
    children: node.slots[slot] ?? [],
    slot,
  }));
  for (const [slot, children] of Object.entries(node.slots)) {
    if (!declared.includes(slot) && children.length > 0) {
      listed.push({ children, slot });
    }
  }
  return listed;
}

/**
 * Every empty declared slot of every node in depth-first document order
 * (pre-order; each node's slots, and the descent into them, in declaration
 * order, then its undeclared non-empty slots, as an opened level lists them),
 * as `{ node, slot }` pairs; the shell filters by insertability.
 */
export function emptySlots(
  roots: readonly BlueprintNode[],
  definitionOf: (node: BlueprintNode) => BlockDefinition | undefined,
): readonly { node: BlueprintNode; slot: string }[] {
  const found: { node: BlueprintNode; slot: string }[] = [];
  const visit = (nodes: readonly BlueprintNode[]): void => {
    for (const node of nodes) {
      const definition = definitionOf(node);
      for (const slot of definition?.slots ?? []) {
        if ((node.slots[slot.id] ?? []).length === 0) {
          found.push({ node, slot: slot.id });
        }
      }
      for (const { children } of levelSlots(node, definition)) {
        visit(children);
      }
    }
  };
  visit(roots);
  return found;
}

/** The dashed band of the `index`-th of `count` empty slots inside a measured parent (the drop-target formula). */
export function emptySlotBand(
  parentRect: PreviewMarkerRect,
  index: number,
  count: number,
): PreviewMarkerRect {
  const bandHeight = parentRect.height / Math.max(1, count);
  return {
    height: Math.max(4, bandHeight - 8),
    width: Math.max(4, parentRect.width - 8),
    x: parentRect.x + 4,
    y: parentRect.y + index * bandHeight + 4,
  };
}

function siblingDestination(
  roots: readonly BlueprintNode[],
  nodeId: NodeId,
  offset: 0 | 1,
): CommandDestination | undefined {
  const location = findOutlineLocation(roots, nodeId);
  if (location === undefined) {
    return undefined;
  }
  const position = location.index + offset;
  return location.parentNodeId === undefined || location.slot === undefined
    ? { position }
    : { parentNodeId: location.parentNodeId, position, slot: location.slot };
}
