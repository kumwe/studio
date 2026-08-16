import { describe, expect, it } from 'vitest';
import {
  STUDIO_CONTRACT_VERSION,
  type ApplyPatternPayload,
  type BindingSource,
  type BlueprintBatchOperation,
  type BlueprintCommand,
  type BlueprintDocument,
  type BlueprintNode,
  type CommandDestination,
  type DuplicateNodePayload,
  type FieldBinding,
  type JsonValue,
  type NodeId,
  type ReorderChildrenPayload,
  type SetPropertyPayload,
  type SetSizeRolePayload,
  type UnsetPropertyPayload,
  type UnsetSizeRolePayload,
} from '@kumwe/studio-protocol';
import {
  applyCommand,
  canonicalStringify,
  canonicalUtf8Bytes,
  invertCommand,
  StudioCommandError,
  type StudioCommandErrorCode,
} from '../src/index.js';

/**
 * Deterministic seeded fuzz lane for the Blueprint command reducer (TH-014).
 * Every generated (document, command) pair is derived from a fixed seed list,
 * so any failure message names the seed and iteration needed to replay it.
 */

const SEEDS = [7, 42, 90210] as const;
const ITERATIONS_PER_SEED = 150;

const ARTIFACT_ID = 'fuzz.blueprint';
const BLOCK_TYPES = ['studio.fuzz/media', 'studio.fuzz/section', 'studio.fuzz/text'] as const;
const PROPERTY_NAMES = ['align', 'label', 'spacing', 'text', 'tone'] as const;
const VIEWPORTS = ['desktop', 'mobile', 'tablet'] as const;
const SLOT_NAMES = ['aside', 'items', 'main'] as const;
const SIZE_ROLE_AXES = ['block', 'inline'] as const;
const SIZE_ROLE_NAMES = ['full', 'half', 'third', 'two-thirds'] as const;
const PORT_NAMES = ['media', 'source', 'text'] as const;
const MEMBER_NAMES = ['alpha', 'beta', 'delta', 'gamma'] as const;
const STRING_VALUES = [
  'plain text',
  'quotes "and" a \\ backslash',
  'unicode ☃ é 🚀',
  '<script>alert(1)</script>',
  'line\nbreak\tand tab',
] as const;
const AUTHORING_MODES = ['content', 'designer', 'locked', 'structural', 'variant'] as const;

type Rng = () => number;

/** mulberry32: integer-safe, identical sequence on every platform. */
function createRng(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t = (t ^ (t + Math.imul(t ^ (t >>> 7), t | 61))) >>> 0;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function integer(rng: Rng, maximumExclusive: number): number {
  return Math.floor(rng() * maximumExclusive);
}

function pick<T>(rng: Rng, items: readonly T[]): T {
  const item = items[integer(rng, items.length)];
  if (item === undefined) {
    throw new Error('pick requires a non-empty candidate list.');
  }
  return item;
}

function shuffle<T>(rng: Rng, items: readonly T[]): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = integer(rng, index + 1);
    const left = copy[index];
    const right = copy[swap];
    if (left !== undefined && right !== undefined) {
      copy[index] = right;
      copy[swap] = left;
    }
  }
  return copy;
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const member of Object.values(value)) {
      deepFreeze(member);
    }
  }
  return value;
}

function describeError(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : JSON.stringify(error);
}

function canonicalDocument(document: BlueprintDocument): string {
  return canonicalStringify(document as unknown as JsonValue);
}

function documentBytes(document: BlueprintDocument): Uint8Array {
  return canonicalUtf8Bytes(document as unknown as JsonValue);
}

// --- document generation -------------------------------------------------

function jsonValue(rng: Rng, depth: number): JsonValue {
  const choice = integer(rng, depth > 1 ? 5 : 7);
  switch (choice) {
    case 0:
      return null;
    case 1:
      return rng() < 0.5;
    case 2:
      return integer(rng, 10_000) - 5_000;
    case 3:
      return integer(rng, 1_000) / 8;
    case 4:
      return pick(rng, STRING_VALUES);
    case 5:
      return Array.from({ length: integer(rng, 3) }, () => jsonValue(rng, depth + 1));
    default: {
      const object: Record<string, JsonValue> = {};
      for (let count = integer(rng, 3); count > 0; count -= 1) {
        object[pick(rng, MEMBER_NAMES)] = jsonValue(rng, depth + 1);
      }
      return object;
    }
  }
}

function makeBinding(rng: Rng): FieldBinding {
  const sources: BindingSource[] = [
    { kind: 'static-value', value: jsonValue(rng, 1) },
    { key: 'studio.fuzz/context', kind: 'context-value' },
    { fieldPath: ['entry', pick(rng, PROPERTY_NAMES)], kind: 'entry-field' },
  ];
  const binding: FieldBinding = {
    onError: pick(rng, ['error', 'fallback', 'hide'] as const),
    onNull: pick(rng, ['empty', 'error', 'fallback', 'hide'] as const),
    source: pick(rng, sources),
    transforms: [],
  };
  if (rng() < 0.25) {
    binding.fallback = jsonValue(rng, 1);
  }
  return binding;
}

function makeNode(rng: Rng, allocate: () => NodeId, depth: number): BlueprintNode {
  const node: BlueprintNode = {
    authoring: { mode: pick(rng, AUTHORING_MODES) },
    bindings: {},
    id: allocate(),
    properties: {},
    slots: {},
    type: pick(rng, BLOCK_TYPES),
    version: '1.0.0',
  };
  for (let count = integer(rng, 3); count > 0; count -= 1) {
    node.properties[pick(rng, PROPERTY_NAMES)] = jsonValue(rng, 0);
  }
  for (let count = integer(rng, 2); count > 0; count -= 1) {
    node.bindings[pick(rng, PORT_NAMES)] = makeBinding(rng);
  }
  if (rng() < 0.3) {
    const responsive: Record<string, Record<string, JsonValue>> = {};
    for (let count = 1 + integer(rng, 2); count > 0; count -= 1) {
      const overrides: Record<string, JsonValue> = {};
      for (let inner = 1 + integer(rng, 2); inner > 0; inner -= 1) {
        overrides[pick(rng, VIEWPORTS)] = jsonValue(rng, 1);
      }
      responsive[pick(rng, PROPERTY_NAMES)] = overrides;
    }
    node.responsive = responsive;
  }
  if (rng() < 0.25) {
    const sizeRoles: Record<string, string> = {};
    sizeRoles[pick(rng, SIZE_ROLE_AXES)] = pick(rng, SIZE_ROLE_NAMES);
    node.sizeRoles = sizeRoles;
  }
  if (rng() < 0.2) {
    const overrides: Record<string, string> = {};
    for (let inner = 1 + integer(rng, 2); inner > 0; inner -= 1) {
      overrides[pick(rng, VIEWPORTS)] = pick(rng, SIZE_ROLE_NAMES);
    }
    node.responsiveSizeRoles = { [pick(rng, SIZE_ROLE_AXES)]: overrides };
  }
  if (depth < 2) {
    for (const slot of SLOT_NAMES) {
      if (rng() < (depth === 0 ? 0.4 : 0.25)) {
        node.slots[slot] = Array.from({ length: 1 + integer(rng, 2) }, () =>
          makeNode(rng, allocate, depth + 1),
        );
      }
    }
  }
  return node;
}

interface GeneratedDocument {
  allocate: () => NodeId;
  document: BlueprintDocument;
}

function makeDocument(rng: Rng): GeneratedDocument {
  let counter = 0;
  const allocate = (): NodeId => {
    counter += 1;
    return `node-${counter}`;
  };
  const roots = Array.from({ length: 1 + integer(rng, 3) }, () => makeNode(rng, allocate, 0));
  const document: BlueprintDocument = {
    contractVersion: STUDIO_CONTRACT_VERSION,
    dependencyLock: {
      blocks: BLOCK_TYPES.map((type) => ({ revision: 'block-r1', type, version: '1.0.0' })),
      theme: { id: 'studio.fuzz/theme', revision: 'theme-r1', version: '1.0.0' },
    },
    id: ARTIFACT_ID,
    kind: 'blueprint',
    label: { defaultMessage: 'Fuzz Blueprint', key: 'studio.fuzz/blueprint' },
    model: { id: 'studio.fuzz/model', revision: 'model-r1', version: '1.0.0' },
    owner: { id: 'studio.fuzz/suite', version: '0.1.0-alpha.0' },
    revision: 'blueprint-r1',
    roots,
    status: 'draft',
    version: '1.0.0',
  };
  return { allocate, document };
}

// --- document inspection helpers -----------------------------------------

interface NodeEntry {
  node: BlueprintNode;
  parentNodeId?: NodeId;
  slot?: string;
}

function listNodes(document: BlueprintDocument): NodeEntry[] {
  const entries: NodeEntry[] = [];
  const visit = (nodes: readonly BlueprintNode[], parentNodeId?: NodeId, slot?: string): void => {
    for (const node of nodes) {
      entries.push(
        parentNodeId !== undefined && slot !== undefined ? { node, parentNodeId, slot } : { node },
      );
      for (const [slotName, children] of Object.entries(node.slots)) {
        visit(children, node.id, slotName);
      }
    }
  };
  visit(document.roots);
  return entries;
}

interface CollectionTarget {
  collection: readonly BlueprintNode[];
  parentNodeId?: NodeId;
  slot?: string;
}

function listCollections(document: BlueprintDocument): CollectionTarget[] {
  const targets: CollectionTarget[] = [{ collection: document.roots }];
  for (const entry of listNodes(document)) {
    for (const [slot, children] of Object.entries(entry.node.slots)) {
      targets.push({ collection: children, parentNodeId: entry.node.id, slot });
    }
  }
  return targets;
}

function collectIds(node: BlueprintNode): NodeId[] {
  const identifiers: NodeId[] = [node.id];
  for (const children of Object.values(node.slots)) {
    for (const child of children) {
      identifiers.push(...collectIds(child));
    }
  }
  return identifiers;
}

interface DestinationOptions {
  excludeIds?: ReadonlySet<NodeId>;
  movingId?: NodeId;
}

function chooseDestination(
  document: BlueprintDocument,
  rng: Rng,
  options: DestinationOptions = {},
): CommandDestination {
  const excluded = options.excludeIds ?? new Set<NodeId>();
  const hosts = listNodes(document).filter((entry) => !excluded.has(entry.node.id));
  if (hosts.length > 0 && rng() < 0.2) {
    // Target a slot by name (it may or may not exist yet on the host node).
    const host = pick(rng, hosts);
    const slot = pick(rng, SLOT_NAMES);
    const existing = Object.hasOwn(host.node.slots, slot) ? host.node.slots[slot] : undefined;
    const capacity =
      existing === undefined
        ? 0
        : existing.length -
          (options.movingId !== undefined && existing.some((node) => node.id === options.movingId)
            ? 1
            : 0);
    return { parentNodeId: host.node.id, position: integer(rng, capacity + 1), slot };
  }
  const targets = listCollections(document).filter(
    (target) => target.parentNodeId === undefined || !excluded.has(target.parentNodeId),
  );
  const target = pick(rng, targets);
  const capacity =
    target.collection.length -
    (options.movingId !== undefined &&
    target.collection.some((node) => node.id === options.movingId)
      ? 1
      : 0);
  const position = integer(rng, capacity + 1);
  if (target.parentNodeId !== undefined && target.slot !== undefined) {
    return { parentNodeId: target.parentNodeId, position, slot: target.slot };
  }
  return { position };
}

interface UnsetCandidate {
  payload: UnsetPropertyPayload;
}

function listUnsetCandidates(document: BlueprintDocument): UnsetCandidate[] {
  const candidates: UnsetCandidate[] = [];
  for (const entry of listNodes(document)) {
    for (const property of Object.keys(entry.node.properties)) {
      candidates.push({ payload: { nodeId: entry.node.id, property } });
    }
    if (entry.node.responsive !== undefined) {
      for (const [property, overrides] of Object.entries(entry.node.responsive)) {
        for (const viewport of Object.keys(overrides)) {
          candidates.push({ payload: { nodeId: entry.node.id, property, viewport } });
        }
      }
    }
  }
  return candidates;
}

function listSizeRoleUnsetCandidates(document: BlueprintDocument): UnsetSizeRolePayload[] {
  const candidates: UnsetSizeRolePayload[] = [];
  for (const entry of listNodes(document)) {
    for (const axis of SIZE_ROLE_AXES) {
      if (entry.node.sizeRoles !== undefined && Object.hasOwn(entry.node.sizeRoles, axis)) {
        candidates.push({ axis, nodeId: entry.node.id });
      }
      const overrides =
        entry.node.responsiveSizeRoles !== undefined &&
        Object.hasOwn(entry.node.responsiveSizeRoles, axis)
          ? entry.node.responsiveSizeRoles[axis]
          : undefined;
      for (const viewport of Object.keys(overrides ?? {})) {
        candidates.push({ axis, nodeId: entry.node.id, viewport });
      }
    }
  }
  return candidates;
}

function listBindingCandidates(document: BlueprintDocument): { nodeId: NodeId; port: string }[] {
  const candidates: { nodeId: NodeId; port: string }[] = [];
  for (const entry of listNodes(document)) {
    for (const port of Object.keys(entry.node.bindings)) {
      candidates.push({ nodeId: entry.node.id, port });
    }
  }
  return candidates;
}

// --- command construction ------------------------------------------------

type FuzzCommandSpec =
  | BlueprintBatchOperation
  | { payload: ApplyPatternPayload; type: 'studio.command/apply-pattern' }
  | { payload: { operations: BlueprintBatchOperation[] }; type: 'studio.command/batch' }
  | {
      payload: { nodeId: NodeId; property: string };
      type: 'studio.command/reset-inherited-property';
    };

function buildCommand(
  id: string,
  spec: FuzzCommandSpec,
  artifactId: string = ARTIFACT_ID,
): BlueprintCommand {
  return {
    artifactId,
    baseStateVersion: 0,
    contractVersion: STUDIO_CONTRACT_VERSION,
    id,
    kind: 'command',
    payload: spec.payload,
    sessionGeneration: 'session-r1',
    type: spec.type,
  } as BlueprintCommand;
}

function buildForeignCommand(id: string, type: string, payload: object): BlueprintCommand {
  return {
    artifactId: ARTIFACT_ID,
    baseStateVersion: 0,
    contractVersion: STUDIO_CONTRACT_VERSION,
    id,
    kind: 'command',
    payload,
    sessionGeneration: 'session-r1',
    type,
  } as unknown as BlueprintCommand;
}

/** One applicable batch-legal operation against the current document state. */
function generateOperation(
  document: BlueprintDocument,
  rng: Rng,
  allocate: () => NodeId,
): BlueprintBatchOperation {
  const entries = listNodes(document);
  const factories: (() => BlueprintBatchOperation)[] = [
    () => ({
      payload: { destination: chooseDestination(document, rng), node: makeNode(rng, allocate, 1) },
      type: 'studio.command/insert-node',
    }),
    () => ({
      payload: { destination: chooseDestination(document, rng), node: makeNode(rng, allocate, 1) },
      type: 'studio.command/restore-node',
    }),
  ];
  if (entries.length > 0) {
    factories.push(
      () => ({
        payload: { nodeId: pick(rng, entries).node.id },
        type: 'studio.command/remove-node',
      }),
      () => {
        const source = pick(rng, entries);
        const excludeIds = new Set(collectIds(source.node));
        return {
          payload: {
            destination: chooseDestination(document, rng, {
              excludeIds,
              movingId: source.node.id,
            }),
            nodeId: source.node.id,
          },
          type: 'studio.command/move-node',
        };
      },
      () => {
        const source = pick(rng, entries);
        const idMap: Record<NodeId, NodeId> = {};
        for (const id of collectIds(source.node)) {
          idMap[id] = allocate();
        }
        const payload: DuplicateNodePayload =
          rng() < 0.6
            ? { idMap, nodeId: source.node.id }
            : { destination: chooseDestination(document, rng), idMap, nodeId: source.node.id };
        return { payload, type: 'studio.command/duplicate-node' };
      },
      () => {
        const target = pick(rng, entries);
        const payload: SetPropertyPayload = {
          nodeId: target.node.id,
          property: pick(rng, PROPERTY_NAMES),
          value: jsonValue(rng, 0),
        };
        if (rng() < 0.35) {
          payload.viewport = pick(rng, VIEWPORTS);
        }
        return { payload, type: 'studio.command/set-property' };
      },
      () => ({
        payload: {
          binding: makeBinding(rng),
          nodeId: pick(rng, entries).node.id,
          port: pick(rng, PORT_NAMES),
        },
        type: 'studio.command/set-binding',
      }),
      () => {
        const payload: SetSizeRolePayload = {
          axis: pick(rng, SIZE_ROLE_AXES),
          nodeId: pick(rng, entries).node.id,
          role: pick(rng, SIZE_ROLE_NAMES),
        };
        if (rng() < 0.35) {
          payload.viewport = pick(rng, VIEWPORTS);
        }
        return { payload, type: 'studio.command/set-size-role' };
      },
    );
  }
  const reorderable = listCollections(document).filter((target) => target.collection.length >= 2);
  if (reorderable.length > 0) {
    factories.push(() => {
      const target = pick(rng, reorderable);
      const order = shuffle(
        rng,
        target.collection.map((node) => node.id),
      );
      const payload: ReorderChildrenPayload =
        target.parentNodeId !== undefined && target.slot !== undefined
          ? { order, parentNodeId: target.parentNodeId, slot: target.slot }
          : { order };
      return { payload, type: 'studio.command/reorder-children' };
    });
  }
  const unsettable = listUnsetCandidates(document);
  if (unsettable.length > 0) {
    factories.push(() => ({
      payload: structuredClone(pick(rng, unsettable).payload),
      type: 'studio.command/unset-property',
    }));
  }
  const unsettableSizeRoles = listSizeRoleUnsetCandidates(document);
  if (unsettableSizeRoles.length > 0) {
    factories.push(() => ({
      payload: structuredClone(pick(rng, unsettableSizeRoles)),
      type: 'studio.command/unset-size-role',
    }));
  }
  const removableBindings = listBindingCandidates(document);
  if (removableBindings.length > 0) {
    factories.push(() => {
      const candidate = pick(rng, removableBindings);
      return {
        payload: { nodeId: candidate.nodeId, port: candidate.port },
        type: 'studio.command/remove-binding',
      };
    });
  }
  return pick(rng, factories)();
}

function generateApplyPatternPayload(
  document: BlueprintDocument,
  rng: Rng,
  allocate: () => NodeId,
): ApplyPatternPayload {
  let fragmentCounter = 0;
  const fragmentAllocate = (): NodeId => {
    fragmentCounter += 1;
    return `fragment-${fragmentCounter}`;
  };
  const nodes = Array.from({ length: 1 + integer(rng, 2) }, () =>
    makeNode(rng, fragmentAllocate, 1),
  );
  const idMap: Record<NodeId, NodeId> = {};
  for (const root of nodes) {
    for (const id of collectIds(root)) {
      idMap[id] = allocate();
    }
  }
  return {
    destination: chooseDestination(document, rng),
    idMap,
    nodes,
    pattern: { id: 'fuzz.pattern', revision: 'pattern-r1', version: '1.0.0' },
  };
}

interface GeneratedCommand {
  command: BlueprintCommand;
  description: string;
  expectedCodes?: readonly StudioCommandErrorCode[];
}

function generateWellFormedCommand(
  document: BlueprintDocument,
  rng: Rng,
  allocate: () => NodeId,
  commandId: string,
): GeneratedCommand {
  const roll = rng();
  if (roll < 0.14) {
    let working = structuredClone(document);
    const operations: BlueprintBatchOperation[] = [];
    for (let count = 1 + integer(rng, 4); count > 0; count -= 1) {
      const operation = generateOperation(working, rng, allocate);
      operations.push(operation);
      working = applyCommand(working, buildCommand(`${commandId}.staging`, operation));
    }
    return {
      command: buildCommand(commandId, { payload: { operations }, type: 'studio.command/batch' }),
      description: 'well-formed batch',
    };
  }
  if (roll < 0.24) {
    return {
      command: buildCommand(commandId, {
        payload: generateApplyPatternPayload(document, rng, allocate),
        type: 'studio.command/apply-pattern',
      }),
      description: 'well-formed apply-pattern',
    };
  }
  if (roll < 0.34) {
    const candidates = listNodes(document).filter(
      (entry) =>
        entry.node.responsive !== undefined && Object.keys(entry.node.responsive).length > 0,
    );
    if (candidates.length > 0) {
      const target = pick(rng, candidates);
      const property = pick(rng, Object.keys(target.node.responsive ?? {}));
      return {
        command: buildCommand(commandId, {
          payload: { nodeId: target.node.id, property },
          type: 'studio.command/reset-inherited-property',
        }),
        description: 'well-formed reset-inherited-property',
      };
    }
  }
  const operation = generateOperation(document, rng, allocate);
  return {
    command: buildCommand(commandId, operation),
    description: `well-formed ${operation.type}`,
  };
}

function generateBrokenCommand(
  document: BlueprintDocument,
  rng: Rng,
  allocate: () => NodeId,
  commandId: string,
): GeneratedCommand {
  const entries = listNodes(document);
  const recipes: (() => GeneratedCommand)[] = [
    () => ({
      command: buildCommand(
        commandId,
        generateOperation(document, rng, allocate),
        'other.blueprint',
      ),
      description: 'broken wrong-artifact-id',
      expectedCodes: ['node-not-found'],
    }),
    () => ({
      command: buildCommand(commandId, {
        payload: { nodeId: 'ghost-node' },
        type: 'studio.command/remove-node',
      }),
      description: 'broken remove-missing-node',
      expectedCodes: ['node-not-found'],
    }),
    () => ({
      command: buildCommand(commandId, {
        payload: {
          destination: { parentNodeId: 'ghost-parent', position: 0, slot: 'main' },
          node: makeNode(rng, allocate, 2),
        },
        type: 'studio.command/insert-node',
      }),
      description: 'broken insert-missing-parent',
      expectedCodes: ['parent-not-found'],
    }),
    () => ({
      command: buildCommand(commandId, {
        payload: {
          destination: {
            position: document.roots.length + 1 + integer(rng, 4),
          },
          node: makeNode(rng, allocate, 2),
        },
        type: 'studio.command/insert-node',
      }),
      description: 'broken insert-index-beyond-slot',
      expectedCodes: ['invalid-index'],
    }),
    () => ({
      command: buildCommand(commandId, {
        payload: {
          destination: { position: pick(rng, [-1, -3, 0.5, Number.NaN]) },
          node: makeNode(rng, allocate, 2),
        },
        type: 'studio.command/restore-node',
      }),
      description: 'broken restore-non-integral-index',
      expectedCodes: ['invalid-index'],
    }),
    () => ({
      command: buildCommand(commandId, {
        payload: { destination: { position: 0 }, nodeId: 'ghost-node' },
        type: 'studio.command/move-node',
      }),
      description: 'broken move-missing-node',
      expectedCodes: ['node-not-found'],
    }),
    () => ({
      command: buildCommand(commandId, {
        payload: { operations: [] },
        type: 'studio.command/batch',
      }),
      description: 'broken batch-empty',
      expectedCodes: ['invalid-batch'],
    }),
    () => ({
      command: buildCommand(commandId, {
        payload: {
          operations: Array.from({ length: 101 }, (): BlueprintBatchOperation => ({
            payload: { nodeId: 'ghost-node' },
            type: 'studio.command/remove-node',
          })),
        },
        type: 'studio.command/batch',
      }),
      description: 'broken batch-oversized',
      expectedCodes: ['invalid-batch'],
    }),
    () => {
      const illegalMember = pick(rng, [
        { payload: { operations: [] }, type: 'studio.command/batch' },
        {
          payload: generateApplyPatternPayload(document, rng, allocate),
          type: 'studio.command/apply-pattern',
        },
        {
          payload: { nodeId: 'ghost-node', property: 'ghost-property' },
          type: 'studio.command/reset-inherited-property',
        },
      ]) as unknown as BlueprintBatchOperation;
      return {
        command: buildCommand(commandId, {
          payload: { operations: [illegalMember] },
          type: 'studio.command/batch',
        }),
        description: 'broken batch-illegal-member',
        expectedCodes: ['invalid-batch'],
      };
    },
    () => ({
      command: buildCommand(commandId, {
        payload: {
          destination: { position: 0 },
          idMap: {},
          nodes: [makeNode(rng, allocate, 2)],
          pattern: { id: 'fuzz.pattern', revision: 'pattern-r1', version: '1.0.0' },
        },
        type: 'studio.command/apply-pattern',
      }),
      description: 'broken apply-pattern-incomplete-id-map',
      expectedCodes: ['invalid-id-map'],
    }),
    () => ({
      command: buildForeignCommand(
        commandId,
        pick(rng, [
          'studio.command/set-field-value',
          'studio.command/add-model-field',
          'studio.command/💥',
        ]),
        { fieldPath: ['title'], value: 'unsupported' },
      ),
      description: 'broken unsupported-command-type',
      expectedCodes: ['unsupported-command'],
    }),
    () => ({
      command: buildCommand(commandId, {
        payload: {
          destination: {
            parentNodeId: entries.length > 0 ? pick(rng, entries).node.id : 'ghost',
            position: 0,
          },
          node: makeNode(rng, allocate, 2),
        },
        type: 'studio.command/insert-node',
      }),
      description: 'broken destination-parent-without-slot',
      expectedCodes: ['parent-not-found'],
    }),
    () => {
      const order = shuffle(
        rng,
        document.roots.map((node) => node.id),
      );
      const corruption = integer(rng, 3);
      if (corruption === 0) {
        order.push('ghost-node');
      } else if (corruption === 1 && order.length > 0) {
        order.pop();
        order.push(...order.slice(0, 1));
        order.push('ghost-node');
      } else {
        order.push(...order);
        order.push('ghost-node');
      }
      return {
        command: buildCommand(commandId, {
          payload: { order },
          type: 'studio.command/reorder-children',
        }),
        description: 'broken reorder-not-a-permutation',
        expectedCodes: ['invalid-order'],
      };
    },
  ];
  if (entries.length > 0) {
    recipes.push(
      () => {
        const clash = pick(rng, entries).node.id;
        const node = makeNode(rng, allocate, 1);
        node.id = clash;
        return {
          command: buildCommand(commandId, {
            payload: { destination: { position: 0 }, node },
            type: 'studio.command/insert-node',
          }),
          description: 'broken insert-duplicate-root-id',
          expectedCodes: ['duplicate-node'],
        };
      },
      () => {
        const parent = makeNode(rng, allocate, 2);
        const child = makeNode(rng, allocate, 2);
        child.id = pick(rng, entries).node.id;
        parent.slots.items = [child];
        return {
          command: buildCommand(commandId, {
            payload: { destination: { position: 0 }, node: parent },
            type: 'studio.command/restore-node',
          }),
          description: 'broken restore-duplicate-inner-id',
          expectedCodes: ['duplicate-node'],
        };
      },
      () => {
        const source = pick(rng, entries);
        const parentNodeId = pick(rng, collectIds(source.node));
        return {
          command: buildCommand(commandId, {
            payload: {
              destination: { parentNodeId, position: 0, slot: pick(rng, SLOT_NAMES) },
              nodeId: source.node.id,
            },
            type: 'studio.command/move-node',
          }),
          description: 'broken move-into-own-subtree',
          expectedCodes: ['illegal-move'],
        };
      },
      () => {
        const source = pick(rng, entries);
        const identifiers = collectIds(source.node);
        const idMap: Record<NodeId, NodeId> = {};
        for (const id of identifiers) {
          idMap[id] = allocate();
        }
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete idMap[pick(rng, identifiers)];
        return {
          command: buildCommand(commandId, {
            payload: { idMap, nodeId: source.node.id },
            type: 'studio.command/duplicate-node',
          }),
          description: 'broken duplicate-incomplete-id-map',
          expectedCodes: ['invalid-id-map'],
        };
      },
      () => {
        const source = pick(rng, entries);
        const identifiers = collectIds(source.node);
        const idMap: Record<NodeId, NodeId> = {};
        for (const id of identifiers) {
          idMap[id] = allocate();
        }
        idMap[pick(rng, identifiers)] = pick(rng, entries).node.id;
        return {
          command: buildCommand(commandId, {
            payload: { idMap, nodeId: source.node.id },
            type: 'studio.command/duplicate-node',
          }),
          description: 'broken duplicate-colliding-id-map-target',
          expectedCodes: ['duplicate-node'],
        };
      },
      () => ({
        command: buildCommand(commandId, {
          payload: { nodeId: pick(rng, entries).node.id, property: 'ghost-property' },
          type: 'studio.command/unset-property',
        }),
        description: 'broken unset-missing-property',
        expectedCodes: ['property-not-found'],
      }),
      () => ({
        command: buildCommand(commandId, {
          payload: {
            nodeId: pick(rng, entries).node.id,
            property: 'ghost-property',
            viewport: pick(rng, VIEWPORTS),
          },
          type: 'studio.command/unset-property',
        }),
        description: 'broken unset-missing-viewport-override',
        expectedCodes: ['property-not-found'],
      }),
      () => ({
        command: buildCommand(commandId, {
          payload: { nodeId: pick(rng, entries).node.id, port: 'ghost-port' },
          type: 'studio.command/remove-binding',
        }),
        description: 'broken remove-missing-binding',
        expectedCodes: ['binding-not-found'],
      }),
      () => ({
        command: buildCommand(commandId, {
          payload: {
            axis: pick(rng, SIZE_ROLE_AXES),
            nodeId: pick(rng, entries).node.id,
            viewport: 'ghost-viewport',
          },
          type: 'studio.command/unset-size-role',
        }),
        description: 'broken unset-missing-size-role-override',
        expectedCodes: ['property-not-found'],
      }),
      () => ({
        command: buildCommand(commandId, {
          payload: { nodeId: pick(rng, entries).node.id, property: 'ghost-property' },
          type: 'studio.command/reset-inherited-property',
        }),
        description: 'broken reset-without-overrides',
        expectedCodes: ['property-not-found'],
      }),
      () => ({
        command: buildCommand(commandId, {
          payload: {
            order: [],
            parentNodeId: pick(rng, entries).node.id,
            slot: 'ghost-slot',
          },
          type: 'studio.command/reorder-children',
        }),
        description: 'broken reorder-missing-slot',
        expectedCodes: ['invalid-order'],
      }),
      () => {
        const first = generateOperation(document, rng, allocate);
        return {
          command: buildCommand(commandId, {
            payload: {
              operations: [
                first,
                { payload: { nodeId: 'ghost-node' }, type: 'studio.command/remove-node' },
              ],
            },
            type: 'studio.command/batch',
          }),
          description: 'broken batch-atomic-failure',
          expectedCodes: ['node-not-found'],
        };
      },
      () => {
        const payload = generateApplyPatternPayload(document, rng, allocate);
        const keys = Object.keys(payload.idMap);
        payload.idMap[pick(rng, keys)] = pick(rng, entries).node.id;
        return {
          command: buildCommand(commandId, {
            payload,
            type: 'studio.command/apply-pattern',
          }),
          description: 'broken apply-pattern-colliding-target',
          expectedCodes: ['duplicate-node'],
        };
      },
    );
  }
  return pick(rng, recipes)();
}

// --- invariants ----------------------------------------------------------

function collectMinimalFormViolations(document: BlueprintDocument): string[] {
  const violations: string[] = [];
  const seen = new Set<NodeId>();
  const visit = (node: BlueprintNode, path: string): void => {
    if (seen.has(node.id)) {
      violations.push(`${path} duplicates node identifier ${node.id}`);
    }
    seen.add(node.id);
    if (node.responsive !== undefined) {
      const properties = Object.keys(node.responsive);
      if (properties.length === 0) {
        violations.push(`${path}.responsive is an empty record`);
      }
      for (const property of properties) {
        const overrides = node.responsive[property];
        if (overrides === undefined || Object.keys(overrides).length === 0) {
          violations.push(`${path}.responsive.${property} is an empty record`);
        }
      }
    }
    if (node.sizeRoles !== undefined && Object.keys(node.sizeRoles).length === 0) {
      violations.push(`${path}.sizeRoles is an empty record`);
    }
    if (node.responsiveSizeRoles !== undefined) {
      const axes = Object.keys(node.responsiveSizeRoles);
      if (axes.length === 0) {
        violations.push(`${path}.responsiveSizeRoles is an empty record`);
      }
      for (const axis of axes) {
        const overrides = node.responsiveSizeRoles[axis];
        if (overrides === undefined || Object.keys(overrides).length === 0) {
          violations.push(`${path}.responsiveSizeRoles.${axis} is an empty record`);
        }
      }
    }
    if (node.extensions !== undefined && Object.keys(node.extensions).length === 0) {
      violations.push(`${path}.extensions is an empty record`);
    }
    for (const [slot, children] of Object.entries(node.slots)) {
      if (children.length === 0) {
        violations.push(`${path}.slots.${slot} is an empty collection`);
      }
      children.forEach((child, index) => {
        visit(child, `${path}.slots.${slot}[${index}]`);
      });
    }
  };
  document.roots.forEach((node, index) => {
    visit(node, `roots[${index}]`);
  });
  return violations;
}

function runFuzzCase(seed: number, iteration: number, rng: Rng): 'applied' | 'rejected' {
  const { allocate, document } = makeDocument(rng);
  const commandId = `fuzz.command.${seed}.${iteration}`;
  const generated =
    rng() < 0.45
      ? generateBrokenCommand(document, rng, allocate, commandId)
      : generateWellFormedCommand(document, rng, allocate, commandId);
  const context = `seed=${seed} iteration=${iteration} scenario=${generated.description}`;

  deepFreeze(document);
  deepFreeze(generated.command);
  const before = canonicalDocument(document);

  // Invariant: invertCommand never escapes with anything but StudioCommandError.
  let inverse: BlueprintCommand | undefined;
  let inverseFailure: unknown;
  try {
    inverse = invertCommand(document, generated.command, { id: `${commandId}.inverse` });
  } catch (error) {
    inverseFailure = error;
    expect(
      error instanceof StudioCommandError,
      `${context}: invertCommand escaped with ${describeError(error)}`,
    ).toBe(true);
  }

  // Invariant 1: applyCommand either succeeds or throws StudioCommandError.
  let result: BlueprintDocument | undefined;
  let failure: StudioCommandError | undefined;
  try {
    result = applyCommand(document, generated.command);
  } catch (error) {
    expect(
      error instanceof StudioCommandError,
      `${context}: applyCommand escaped with ${describeError(error)}`,
    ).toBe(true);
    if (error instanceof StudioCommandError) {
      failure = error;
    } else {
      return 'rejected';
    }
  }

  // Invariant 2: the input document is never mutated, on success or failure.
  expect(canonicalDocument(document), `${context}: the input document was mutated`).toBe(before);

  if (generated.expectedCodes !== undefined) {
    expect(
      failure,
      `${context}: expected StudioCommandError(${generated.expectedCodes.join('|')}) but the command applied`,
    ).toBeDefined();
    if (failure !== undefined) {
      expect(
        generated.expectedCodes.includes(failure.code),
        `${context}: expected code ${generated.expectedCodes.join('|')} but received ${failure.code}`,
      ).toBe(true);
    }
    return 'rejected';
  }

  expect(
    failure,
    `${context}: a well-formed command was rejected with ${failure?.code ?? 'unknown'} (${failure?.message ?? ''})`,
  ).toBeUndefined();
  if (result === undefined) {
    return 'rejected';
  }

  // Invariant 3a: the result stays in canonical minimal form.
  expect(
    collectMinimalFormViolations(result),
    `${context}: the result left canonical minimal form`,
  ).toStrictEqual([]);

  // Invariant 4: canonical serialization is round-trip stable.
  const canonicalResult = canonicalDocument(result);
  expect(
    JSON.parse(canonicalResult) as unknown,
    `${context}: canonical serialization is not round-trip stable`,
  ).toStrictEqual(result);

  // Invariant 3b: inverse application restores byte-identical canonical form.
  expect(
    inverse,
    `${context}: invertCommand failed for an applicable command: ${describeError(inverseFailure)}`,
  ).toBeDefined();
  if (inverse === undefined) {
    return 'applied';
  }
  deepFreeze(result);
  let restored: BlueprintDocument | undefined;
  try {
    restored = applyCommand(result, inverse);
  } catch (error) {
    expect.fail(`${context}: applying the inverse escaped with ${describeError(error)}`);
  }
  if (restored === undefined) {
    return 'applied';
  }
  expect(
    canonicalDocument(restored),
    `${context}: the inverse did not restore the original document`,
  ).toBe(before);
  expect(
    documentBytes(restored),
    `${context}: the inverse did not restore byte-identical canonical UTF-8`,
  ).toStrictEqual(documentBytes(document));
  return 'applied';
}

describe('command reducer fuzzing (TH-014)', () => {
  it.each([...SEEDS])(
    'holds the reducer invariants across %d-seeded generative documents and commands',
    (seed) => {
      const rng = createRng(seed);
      const outcomes = { applied: 0, rejected: 0 };
      for (let iteration = 0; iteration < ITERATIONS_PER_SEED; iteration += 1) {
        outcomes[runFuzzCase(seed, iteration, rng)] += 1;
      }
      // Guard against silent generator degeneration: both the success path
      // and the rejection path must stay well represented.
      expect(outcomes.applied + outcomes.rejected).toBe(ITERATIONS_PER_SEED);
      expect(outcomes.applied, `seed=${seed}: too few applicable commands`).toBeGreaterThan(40);
      expect(outcomes.rejected, `seed=${seed}: too few rejected commands`).toBeGreaterThan(40);
    },
  );

  it('generates an identical command stream for a fixed seed', () => {
    const generate = (): string[] => {
      const rng = createRng(SEEDS[0]);
      const stream: string[] = [];
      for (let iteration = 0; iteration < 10; iteration += 1) {
        const { allocate, document } = makeDocument(rng);
        const generated =
          rng() < 0.45
            ? generateBrokenCommand(document, rng, allocate, `determinism.${iteration}`)
            : generateWellFormedCommand(document, rng, allocate, `determinism.${iteration}`);
        // JSON.stringify, not canonicalStringify: broken recipes may carry
        // non-finite positions that canonical serialization refuses.
        stream.push(JSON.stringify(generated.command));
      }
      return stream;
    };
    expect(generate()).toStrictEqual(generate());
  });

  it('keeps adversarial property names on own properties without polluting prototypes', () => {
    const { document } = makeDocument(createRng(SEEDS[0]));
    const [root] = document.roots;
    expect(root).toBeDefined();
    if (root === undefined) {
      return;
    }
    for (const property of ['__proto__', 'constructor', 'prototype']) {
      const command = buildCommand(`fuzz.command.pollution.${property}`, {
        payload: { nodeId: root.id, property, value: { polluted: true } },
        type: 'studio.command/set-property',
      });
      const result = applyCommand(document, command);
      expect(({} as { polluted?: unknown }).polluted).toBeUndefined();
      const [resultRoot] = result.roots;
      expect(resultRoot).toBeDefined();
      if (resultRoot !== undefined) {
        expect(Object.hasOwn(resultRoot.properties, property)).toBe(true);
      }
      // The canonical serialization boundary refuses to persist such members.
      expect(() => canonicalDocument(result)).toThrow(TypeError);
    }
  });
});
