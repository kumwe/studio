import type { BlueprintNode, NodeId } from '@kumwe/studio-protocol';

/** Where a node sits inside its owning ordered collection. */
export interface OutlineLocation {
  collection: readonly BlueprintNode[];
  index: number;
  node: BlueprintNode;
  parentNodeId?: NodeId;
  slot?: string;
}

export function findOutlineLocation(
  roots: readonly BlueprintNode[],
  nodeId: NodeId,
): OutlineLocation | undefined {
  return findWithin(roots, nodeId, undefined, undefined);
}

/**
 * Returns the chain of nodes from a document root down to `nodeId`
 * (root first, the node itself last), or an empty array when the
 * identifier does not occur in the tree.
 */
export function findAncestry(roots: readonly BlueprintNode[], nodeId: NodeId): BlueprintNode[] {
  for (const node of roots) {
    if (node.id === nodeId) {
      return [node];
    }
    for (const children of Object.values(node.slots)) {
      const nested = findAncestry(children, nodeId);
      if (nested.length > 0) {
        return [node, ...nested];
      }
    }
  }
  return [];
}

export function collectDocumentIds(roots: readonly BlueprintNode[]): Set<NodeId> {
  const identifiers = new Set<NodeId>();
  const stack = [...roots];
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

/**
 * Allocates a deterministic, collision-free identifier map covering the whole
 * subtree of `source`. Every identifier becomes `${id}-copy-${n}` where `n`
 * is the lowest positive integer not already taken by the document or by an
 * earlier allocation in the same map.
 */
export function allocateDuplicateIdMap(
  roots: readonly BlueprintNode[],
  source: BlueprintNode,
): Record<NodeId, NodeId> {
  const taken = collectDocumentIds(roots);
  const idMap: Record<NodeId, NodeId> = {};
  const queue: BlueprintNode[] = [source];
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) {
      break;
    }
    let counter = 1;
    let candidate = `${current.id}-copy-${counter}`;
    while (taken.has(candidate)) {
      counter += 1;
      candidate = `${current.id}-copy-${counter}`;
    }
    taken.add(candidate);
    // Canonical documents use plain JSON objects; own-property definition
    // keeps author-controlled identifiers from touching the prototype.
    Object.defineProperty(idMap, current.id, {
      configurable: true,
      enumerable: true,
      value: candidate,
      writable: true,
    });
    for (const children of Object.values(current.slots)) {
      queue.push(...children);
    }
  }
  return idMap;
}

function findWithin(
  collection: readonly BlueprintNode[],
  nodeId: NodeId,
  parentNodeId: NodeId | undefined,
  slot: string | undefined,
): OutlineLocation | undefined {
  for (const [index, node] of collection.entries()) {
    if (node.id === nodeId) {
      const location: OutlineLocation = { collection, index, node };
      if (parentNodeId !== undefined && slot !== undefined) {
        location.parentNodeId = parentNodeId;
        location.slot = slot;
      }
      return location;
    }
    for (const [slotName, children] of Object.entries(node.slots)) {
      const nested = findWithin(children, nodeId, node.id, slotName);
      if (nested !== undefined) {
        return nested;
      }
    }
  }
  return undefined;
}
