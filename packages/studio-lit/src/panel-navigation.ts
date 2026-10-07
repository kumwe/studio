import type { BlueprintNode, NodeId } from '@kumwe/studio-protocol';
import { findAncestry, findOutlineLocation } from './outline.js';

/**
 * Pure structure helpers for the layered structure panel. The shell keeps two
 * facts about the left column: which layer it shows (structure or details) and
 * which container, if any, the structure layer is opened into (the scope). A
 * scope of `undefined` is the page level, which lists the whole tree. These
 * helpers answer which rows a scope lists and how scopes relate; they know
 * nothing about the DOM or about message catalogs.
 */

/** One non-empty slot of a scope node with its direct children. */
export interface ScopeSlot {
  readonly children: readonly BlueprintNode[];
  readonly slot: string;
}

/** Slots of the scope node, in declaration order, with their direct children; empty slots omitted. */
export function scopeChildren(
  roots: readonly BlueprintNode[],
  scopeId: NodeId,
): readonly ScopeSlot[] {
  const node = findOutlineLocation(roots, scopeId)?.node;
  if (node === undefined) {
    return [];
  }
  return Object.entries(node.slots)
    .filter(([, children]) => children.length > 0)
    .map(([slot, children]) => ({ children, slot }));
}

/** True when the node has at least one non-empty slot (it can be opened as a scope). */
export function hasListedChildren(node: BlueprintNode): boolean {
  return Object.values(node.slots).some((children) => children.length > 0);
}

/** The scope that lists `scopeId` as a row: its parent's id, or undefined for the page level. */
export function parentScopeOf(
  roots: readonly BlueprintNode[],
  scopeId: NodeId,
): NodeId | undefined {
  return findOutlineLocation(roots, scopeId)?.parentNodeId;
}

/** The scope that lists `nodeId`: its parent's id, or undefined when it is a root (or absent). */
export function listingScopeFor(
  roots: readonly BlueprintNode[],
  nodeId: NodeId,
): NodeId | undefined {
  return findOutlineLocation(roots, nodeId)?.parentNodeId;
}

/** Whether the structure view with this scope renders a row for `nodeId` (whole tree lists every node). */
export function isNodeListed(
  roots: readonly BlueprintNode[],
  scopeId: NodeId | undefined,
  nodeId: NodeId,
): boolean {
  const location = findOutlineLocation(roots, nodeId);
  if (location === undefined) {
    return false;
  }
  return scopeId === undefined || location.parentNodeId === scopeId;
}

/** The listed row that stands for `nodeId` in this scope: itself when listed, else its nearest listed ancestor. */
export function listedAncestorOf(
  roots: readonly BlueprintNode[],
  scopeId: NodeId | undefined,
  nodeId: NodeId,
): NodeId | undefined {
  const ancestry = findAncestry(roots, nodeId);
  if (ancestry.length === 0) {
    return undefined;
  }
  if (scopeId === undefined) {
    return nodeId;
  }
  const scopeIndex = ancestry.findIndex((node) => node.id === scopeId);
  if (scopeIndex === -1 || scopeIndex === ancestry.length - 1) {
    return undefined;
  }
  return ancestry[scopeIndex + 1]?.id;
}
