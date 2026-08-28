import type {
  BlueprintBatchOperation,
  BlueprintCommand,
  BlueprintDocument,
  BlueprintNode,
  ContentModelDocument,
  EntryDocument,
  JsonObject,
  JsonValue,
  QualifiedName,
  StudioLimits,
} from '@kumwe/studio-protocol';
import { cloneContractValue } from './clone.js';
import { applyOperation, StudioCommandError } from './commands.js';

export type StudioCommandPolicyLimits = Pick<
  StudioLimits,
  | 'maxChildrenPerSlot'
  | 'maxCommandBatch'
  | 'maxDepth'
  | 'maxExtensionBytes'
  | 'maxNodes'
  | 'maxPropertyBytes'
  | 'maxRichTextBytes'
  | 'maxRichTextDepth'
  | 'maxSlotsPerNode'
>;

export interface StudioSessionPolicyOptions {
  limits?: Readonly<Partial<StudioCommandPolicyLimits>>;
  permissions?: readonly QualifiedName[];
}

export interface ResolvedStudioSessionPolicy {
  limits: Readonly<StudioCommandPolicyLimits>;
  permissions: ReadonlySet<QualifiedName>;
}

/** Immutable protocol ceilings used when a low-level session has no host configuration. */
export const STUDIO_PROTOCOL_MAXIMUM_COMMAND_POLICY_LIMITS: Readonly<StudioCommandPolicyLimits> =
  Object.freeze({
    maxChildrenPerSlot: 10_000,
    maxCommandBatch: 10_000,
    maxDepth: 128,
    maxExtensionBytes: 10_485_760,
    maxNodes: 100_000,
    maxPropertyBytes: 10_485_760,
    maxRichTextBytes: 10_485_760,
    maxRichTextDepth: 128,
    maxSlotsPerNode: 100,
  });

const LIMIT_MINIMUMS: Readonly<Record<keyof StudioCommandPolicyLimits, number>> = Object.freeze({
  maxChildrenPerSlot: 0,
  maxCommandBatch: 1,
  maxDepth: 1,
  maxExtensionBytes: 0,
  maxNodes: 1,
  maxPropertyBytes: 0,
  maxRichTextBytes: 1,
  maxRichTextDepth: 1,
  maxSlotsPerNode: 0,
});

interface LocatedNode {
  node: BlueprintNode;
  parent?: BlueprintNode;
}

interface NodeFrame {
  depth: number;
  node: BlueprintNode;
}

interface RichTextFrame {
  depth: number;
  node: JsonObject;
}

export function resolveStudioSessionPolicy(
  options: Readonly<StudioSessionPolicyOptions> = {},
): ResolvedStudioSessionPolicy {
  const supplied = options.limits ?? {};
  const limits: StudioCommandPolicyLimits = {
    maxChildrenPerSlot: resolveLimit('maxChildrenPerSlot', supplied.maxChildrenPerSlot),
    maxCommandBatch: resolveLimit('maxCommandBatch', supplied.maxCommandBatch),
    maxDepth: resolveLimit('maxDepth', supplied.maxDepth),
    maxExtensionBytes: resolveLimit('maxExtensionBytes', supplied.maxExtensionBytes),
    maxNodes: resolveLimit('maxNodes', supplied.maxNodes),
    maxPropertyBytes: resolveLimit('maxPropertyBytes', supplied.maxPropertyBytes),
    maxRichTextBytes: resolveLimit('maxRichTextBytes', supplied.maxRichTextBytes),
    maxRichTextDepth: resolveLimit('maxRichTextDepth', supplied.maxRichTextDepth),
    maxSlotsPerNode: resolveLimit('maxSlotsPerNode', supplied.maxSlotsPerNode),
  };
  return Object.freeze({
    limits: Object.freeze(limits),
    permissions: new Set(options.permissions ?? []),
  });
}

/**
 * Checks the complete projected Blueprint before history commits it. The
 * reducer has already accepted the command, so this function may inspect both
 * sides of a valid transition without changing either one.
 */
export function assertBlueprintCommandPolicy(
  before: BlueprintDocument,
  command: BlueprintCommand,
  after: BlueprintDocument,
  policy: Readonly<ResolvedStudioSessionPolicy>,
): void {
  if (
    command.type === 'studio.command/batch' &&
    command.payload.operations.length > policy.limits.maxCommandBatch
  ) {
    throw resourceLimit(
      'maxCommandBatch',
      command.payload.operations.length,
      policy.limits.maxCommandBatch,
    );
  }
  assertCommandPermissions(before, command, policy.permissions);
  assertBlueprintWithinSessionPolicy(after, policy.limits);
}

export function assertBlueprintWithinSessionPolicy(
  document: BlueprintDocument,
  limits: Readonly<StudioCommandPolicyLimits>,
): void {
  let extensionBytes = extensionMapBytes(document.extensions);
  if (extensionBytes > limits.maxExtensionBytes) {
    throw resourceLimit('maxExtensionBytes', extensionBytes, limits.maxExtensionBytes);
  }
  let nodeCount = 0;
  let propertyBytes = 0;
  const stack: NodeFrame[] = document.roots.map((node) => ({ depth: 1, node }));
  while (stack.length > 0) {
    const frame = stack.pop();
    if (frame === undefined) break;
    nodeCount += 1;
    if (nodeCount > limits.maxNodes) {
      throw resourceLimit('maxNodes', nodeCount, limits.maxNodes);
    }
    if (frame.depth > limits.maxDepth) {
      throw resourceLimit('maxDepth', frame.depth, limits.maxDepth);
    }
    const slotEntries = Object.entries(frame.node.slots);
    if (slotEntries.length > limits.maxSlotsPerNode) {
      throw resourceLimit('maxSlotsPerNode', slotEntries.length, limits.maxSlotsPerNode);
    }
    propertyBytes += jsonMapPayloadBytes(frame.node.properties);
    propertyBytes += jsonMapPayloadBytes(frame.node.responsive);
    if (propertyBytes > limits.maxPropertyBytes) {
      throw resourceLimit('maxPropertyBytes', propertyBytes, limits.maxPropertyBytes);
    }
    extensionBytes += extensionMapBytes(frame.node.extensions);
    if (extensionBytes > limits.maxExtensionBytes) {
      throw resourceLimit('maxExtensionBytes', extensionBytes, limits.maxExtensionBytes);
    }
    for (const [, children] of slotEntries) {
      if (children.length > limits.maxChildrenPerSlot) {
        throw resourceLimit('maxChildrenPerSlot', children.length, limits.maxChildrenPerSlot);
      }
      for (const child of children) stack.push({ depth: frame.depth + 1, node: child });
    }
  }
  assertRichTextLimits(document as unknown as JsonValue, limits);
}

export function assertEntryWithinSessionPolicy(
  entry: EntryDocument,
  limits: Readonly<StudioCommandPolicyLimits>,
): void {
  const extensionBytes = extensionMapBytes(entry.extensions);
  if (extensionBytes > limits.maxExtensionBytes) {
    throw resourceLimit('maxExtensionBytes', extensionBytes, limits.maxExtensionBytes);
  }
  assertRichTextLimits(entry as unknown as JsonValue, limits);
}

export function assertModelWithinSessionPolicy(
  model: ContentModelDocument,
  limits: Readonly<StudioCommandPolicyLimits>,
): void {
  let extensionBytes = extensionMapBytes(model.extensions);
  for (const relationship of model.relationships) {
    extensionBytes += extensionMapBytes(relationship.extensions);
  }
  const fields = [...model.fields];
  while (fields.length > 0) {
    const field = fields.pop();
    if (field === undefined) break;
    extensionBytes += extensionMapBytes(field.extensions);
    fields.push(...(field.fields ?? []));
  }
  if (extensionBytes > limits.maxExtensionBytes) {
    throw resourceLimit('maxExtensionBytes', extensionBytes, limits.maxExtensionBytes);
  }
  assertRichTextLimits(model as unknown as JsonValue, limits);
}

function resolveLimit<TKey extends keyof StudioCommandPolicyLimits>(
  key: TKey,
  supplied: StudioCommandPolicyLimits[TKey] | undefined,
): StudioCommandPolicyLimits[TKey] {
  const maximum = STUDIO_PROTOCOL_MAXIMUM_COMMAND_POLICY_LIMITS[key];
  const value = supplied ?? maximum;
  if (!Number.isSafeInteger(value) || value < LIMIT_MINIMUMS[key] || value > maximum) {
    throw new RangeError(
      `${key} must be an integer between ${String(LIMIT_MINIMUMS[key])} and ${String(maximum)}.`,
    );
  }
  return value;
}

function assertCommandPermissions(
  document: BlueprintDocument,
  command: BlueprintCommand,
  permissions: ReadonlySet<QualifiedName>,
): void {
  if (command.type === 'studio.command/batch') {
    const trial = cloneContractValue(document);
    for (const operation of command.payload.operations) {
      assertOperationPermissions(trial, operation, permissions);
      applyOperation(trial, operation);
    }
    return;
  }
  if (command.type === 'studio.command/apply-pattern') {
    assertDestinationPermission(document, command.payload.destination.parentNodeId, permissions);
    for (const node of command.payload.nodes) assertSubtreePermission(node, permissions);
    return;
  }
  if (command.type === 'studio.command/reset-inherited-property') {
    assertLocatedNodePermission(document, command.payload.nodeId, permissions);
    return;
  }
  assertOperationPermissions(document, command, permissions);
}

function assertOperationPermissions(
  document: BlueprintDocument,
  operation: BlueprintBatchOperation,
  permissions: ReadonlySet<QualifiedName>,
): void {
  switch (operation.type) {
    case 'studio.command/insert-node':
    case 'studio.command/restore-node':
      assertDestinationPermission(
        document,
        operation.payload.destination.parentNodeId,
        permissions,
      );
      assertSubtreePermission(operation.payload.node, permissions);
      return;
    case 'studio.command/remove-node': {
      const location = requireLocatedNode(document, operation.payload.nodeId);
      assertNodePermission(location.parent, permissions);
      assertSubtreePermission(location.node, permissions);
      return;
    }
    case 'studio.command/move-node': {
      const location = requireLocatedNode(document, operation.payload.nodeId);
      assertNodePermission(location.parent, permissions);
      assertSubtreePermission(location.node, permissions);
      assertDestinationPermission(
        document,
        operation.payload.destination.parentNodeId,
        permissions,
      );
      return;
    }
    case 'studio.command/duplicate-node': {
      const location = requireLocatedNode(document, operation.payload.nodeId);
      assertNodePermission(location.parent, permissions);
      assertSubtreePermission(location.node, permissions);
      assertDestinationPermission(
        document,
        operation.payload.destination?.parentNodeId,
        permissions,
      );
      return;
    }
    case 'studio.command/reorder-children':
      assertDestinationPermission(document, operation.payload.parentNodeId, permissions);
      for (const nodeId of operation.payload.order) {
        assertLocatedNodePermission(document, nodeId, permissions);
      }
      return;
    case 'studio.command/remove-binding':
    case 'studio.command/set-binding':
    case 'studio.command/set-property':
    case 'studio.command/set-size-role':
    case 'studio.command/unset-property':
    case 'studio.command/unset-size-role':
      assertLocatedNodePermission(document, operation.payload.nodeId, permissions);
      return;
  }
}

function assertDestinationPermission(
  document: BlueprintDocument,
  parentNodeId: string | undefined,
  permissions: ReadonlySet<QualifiedName>,
): void {
  if (parentNodeId !== undefined) assertLocatedNodePermission(document, parentNodeId, permissions);
}

function assertLocatedNodePermission(
  document: BlueprintDocument,
  nodeId: string,
  permissions: ReadonlySet<QualifiedName>,
): void {
  assertNodePermission(requireLocatedNode(document, nodeId).node, permissions);
}

function assertSubtreePermission(
  root: BlueprintNode,
  permissions: ReadonlySet<QualifiedName>,
): void {
  const stack = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node === undefined) break;
    assertNodePermission(node, permissions);
    for (const children of Object.values(node.slots)) stack.push(...children);
  }
}

function assertNodePermission(
  node: BlueprintNode | undefined,
  permissions: ReadonlySet<QualifiedName>,
): void {
  const required = node?.authoring.requiredPermission;
  if (required !== undefined && !permissions.has(required)) {
    throw new StudioCommandError(
      'permission-forbidden',
      `Node ${String(node?.id)} requires the ${required} permission for this command.`,
    );
  }
}

function requireLocatedNode(document: BlueprintDocument, nodeId: string): LocatedNode {
  const located = findLocatedNode(document.roots, nodeId);
  if (located === undefined) {
    throw new StudioCommandError('node-not-found', `Node ${nodeId} does not exist.`);
  }
  return located;
}

function findLocatedNode(
  nodes: readonly BlueprintNode[],
  nodeId: string,
  parent?: BlueprintNode,
): LocatedNode | undefined {
  for (const node of nodes) {
    if (node.id === nodeId) return parent === undefined ? { node } : { node, parent };
    for (const children of Object.values(node.slots)) {
      const found = findLocatedNode(children, nodeId, node);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

function assertRichTextLimits(root: JsonValue, limits: Readonly<StudioCommandPolicyLimits>): void {
  const stack: JsonValue[] = [root];
  while (stack.length > 0) {
    const value = stack.pop();
    if (value === undefined || value === null || typeof value !== 'object') continue;
    if (Array.isArray(value)) {
      stack.push(...value);
      continue;
    }
    if (value.type === 'doc' && Array.isArray(value.content)) {
      const bytes = jsonBytes(value);
      if (bytes > limits.maxRichTextBytes) {
        throw resourceLimit('maxRichTextBytes', bytes, limits.maxRichTextBytes);
      }
      const depth = richTextDepth(value);
      if (depth > limits.maxRichTextDepth) {
        throw resourceLimit('maxRichTextDepth', depth, limits.maxRichTextDepth);
      }
      continue;
    }
    for (const child of Object.values(value)) stack.push(child);
  }
}

function richTextDepth(document: JsonObject): number {
  let maximum = 1;
  const stack: RichTextFrame[] = [{ depth: 1, node: document }];
  while (stack.length > 0) {
    const frame = stack.pop();
    if (frame === undefined) break;
    maximum = Math.max(maximum, frame.depth);
    const content = frame.node.content;
    if (!Array.isArray(content)) continue;
    for (const child of content) {
      if (isJsonObject(child)) stack.push({ depth: frame.depth + 1, node: child });
    }
  }
  return maximum;
}

function extensionMapBytes(value: Record<QualifiedName, JsonValue> | undefined): number {
  return jsonMapPayloadBytes(value);
}

function jsonMapPayloadBytes(value: JsonObject | undefined): number {
  if (value === undefined || Object.keys(value).length === 0) return 0;
  return Math.max(0, jsonBytes(value) - 2);
}

function jsonBytes(value: JsonValue): number {
  let serialized: string;
  try {
    const candidate = JSON.stringify(value);
    if (candidate === undefined) throw new TypeError('The value is not JSON serializable.');
    serialized = candidate;
  } catch {
    throw new StudioCommandError(
      'resource-limit',
      'The command value cannot be measured within the finite JSON resource boundary.',
    );
  }
  return utf8ByteLength(serialized);
}

function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x7f) bytes += 1;
    else if (code <= 0x7ff) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        index += 1;
      } else bytes += 3;
    } else bytes += 3;
  }
  return bytes;
}

function isJsonObject(value: JsonValue): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function resourceLimit(
  name: keyof StudioCommandPolicyLimits,
  actual: number,
  maximum: number,
): StudioCommandError {
  return new StudioCommandError(
    'resource-limit',
    `${name} permits at most ${String(maximum)}, but the projected command requires ${String(actual)}.`,
  );
}
