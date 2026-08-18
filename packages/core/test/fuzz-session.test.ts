import { describe, expect, it } from 'vitest';
import {
  STUDIO_CONTRACT_VERSION,
  type BlueprintCommand,
  type BlueprintDocument,
  type BlueprintNode,
  type CommandDestination,
  type FieldBinding,
  type JsonValue,
  type NodeId,
  type Revision,
} from '@kumwe/studio-protocol';
import {
  applyCommand,
  canonicalStringify,
  StudioCommandError,
  StudioSession,
  type StudioCommandErrorCode,
} from '../src/index.js';

/**
 * Deterministic seeded fuzz lane for StudioSession and StudioHistory (M3-01).
 * Every seed drives one long random sequence of execute, undo, redo, and
 * selection steps — legal and illegal alike — against a live session while a
 * canonical-string model mirrors what the bounded history must hold. Any
 * failure message names the seed and iteration needed to replay it.
 */

const SEEDS = [11, 313, 77_777] as const;
const ITERATIONS_PER_SEED = 120;
const MAXIMUM_HISTORY_ENTRIES = 6;

const ARTIFACT_ID = 'fuzz.session.blueprint';
const LIVE_GENERATION: Revision = 'generation-live';
const STALE_GENERATION: Revision = 'generation-stale';
const BLOCK_TYPES = ['studio.fuzz/media', 'studio.fuzz/section', 'studio.fuzz/text'] as const;
const PROPERTY_NAMES = ['align', 'label', 'text', 'tone'] as const;
const VIEWPORTS = ['desktop', 'mobile', 'tablet'] as const;
const SLOT_NAMES = ['aside', 'items', 'main'] as const;
const PORT_NAMES = ['media', 'source', 'text'] as const;
const SIZE_ROLE_AXES = ['block', 'inline'] as const;
const SIZE_ROLE_NAMES = ['full', 'half', 'third'] as const;
const MEMBER_NAMES = ['alpha', 'beta', 'delta', 'gamma'] as const;
const STRING_VALUES = [
  'plain text',
  'quotes "and" a \\ backslash',
  'unicode ☃ é 🚀',
  'line\nbreak\tand tab',
] as const;

/**
 * The exact-record construction fails to compile when a canonical failure
 * code is missing or invented, so membership checks below cover the closed
 * union completely.
 */
const COMMAND_ERROR_CODES = Object.keys({
  'artifact-not-draft': true,
  'binding-not-found': true,
  'duplicate-field': true,
  'duplicate-node': true,
  'illegal-move': true,
  'invalid-batch': true,
  'invalid-id-map': true,
  'invalid-index': true,
  'invalid-order': true,
  'locale-mismatch': true,
  'mode-forbidden': true,
  'node-not-found': true,
  'parent-not-found': true,
  'property-not-found': true,
  'read-only-session': true,
  'stale-generation': true,
  'stale-state': true,
  'unsupported-command': true,
} satisfies Record<StudioCommandErrorCode, true>) as StudioCommandErrorCode[];

const GUARD_CODES = [
  'mode-forbidden',
  'read-only-session',
  'stale-generation',
  'stale-state',
] as const;

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

// --- document generation -------------------------------------------------

function jsonValue(rng: Rng, depth: number): JsonValue {
  const choice = integer(rng, depth > 1 ? 4 : 6);
  switch (choice) {
    case 0:
      return null;
    case 1:
      return rng() < 0.5;
    case 2:
      return integer(rng, 10_000) - 5_000;
    case 3:
      return pick(rng, STRING_VALUES);
    case 4:
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
  return {
    onError: pick(rng, ['error', 'fallback', 'hide'] as const),
    onNull: pick(rng, ['empty', 'error', 'fallback', 'hide'] as const),
    source:
      rng() < 0.5
        ? { kind: 'static-value', value: jsonValue(rng, 1) }
        : { fieldPath: ['entry', pick(rng, PROPERTY_NAMES)], kind: 'entry-field' },
    transforms: [],
  };
}

function makeNode(rng: Rng, allocate: () => NodeId, depth: number): BlueprintNode {
  const node: BlueprintNode = {
    authoring: { mode: 'designer' },
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
  if (rng() < 0.4) {
    node.bindings[pick(rng, PORT_NAMES)] = makeBinding(rng);
  }
  if (rng() < 0.3) {
    const overrides: Record<string, JsonValue> = {};
    for (let count = 1 + integer(rng, 2); count > 0; count -= 1) {
      overrides[pick(rng, VIEWPORTS)] = jsonValue(rng, 1);
    }
    node.responsive = { [pick(rng, PROPERTY_NAMES)]: overrides };
  }
  if (rng() < 0.25) {
    node.sizeRoles = { [pick(rng, SIZE_ROLE_AXES)]: pick(rng, SIZE_ROLE_NAMES) };
  }
  if (depth < 2) {
    for (const slot of SLOT_NAMES) {
      if (rng() < (depth === 0 ? 0.35 : 0.2)) {
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
  const roots = Array.from({ length: 2 + integer(rng, 2) }, () => makeNode(rng, allocate, 0));
  const document: BlueprintDocument = {
    contractVersion: STUDIO_CONTRACT_VERSION,
    dependencyLock: {
      blocks: BLOCK_TYPES.map((type) => ({ revision: 'block-r1', type, version: '1.0.0' })),
      theme: { id: 'studio.fuzz/theme', revision: 'theme-r1', version: '1.0.0' },
    },
    id: ARTIFACT_ID,
    kind: 'blueprint',
    label: { defaultMessage: 'Fuzz Session Blueprint', key: 'studio.fuzz/session-blueprint' },
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
}

function listNodes(document: BlueprintDocument): NodeEntry[] {
  const entries: NodeEntry[] = [];
  const visit = (nodes: readonly BlueprintNode[]): void => {
    for (const node of nodes) {
      entries.push({ node });
      for (const children of Object.values(node.slots)) {
        visit(children);
      }
    }
  };
  visit(document.roots);
  return entries;
}

function collectDocumentIds(document: BlueprintDocument): Set<NodeId> {
  return new Set(listNodes(document).map((entry) => entry.node.id));
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

// --- command construction ------------------------------------------------

interface CommandSpec {
  payload: object;
  type: string;
}

interface GeneratedStep {
  artifactId?: string;
  description: string;
  expectedCodes?: readonly StudioCommandErrorCode[];
  spec: CommandSpec;
}

interface CommandOverrides {
  artifactId?: string;
  expectedRevision?: Revision;
  sessionGeneration?: Revision;
}

function buildCommand(
  id: string,
  spec: CommandSpec,
  baseStateVersion: number,
  overrides: CommandOverrides = {},
): BlueprintCommand {
  const command: Record<string, unknown> = {
    artifactId: overrides.artifactId ?? ARTIFACT_ID,
    baseStateVersion,
    contractVersion: STUDIO_CONTRACT_VERSION,
    id,
    kind: 'command',
    payload: spec.payload,
    sessionGeneration: overrides.sessionGeneration ?? LIVE_GENERATION,
    type: spec.type,
  };
  if (overrides.expectedRevision !== undefined) {
    command.expectedRevision = overrides.expectedRevision;
  }
  return command as unknown as BlueprintCommand;
}

/** One applicable operation spec against the current document state. */
function generateOperation(
  document: BlueprintDocument,
  rng: Rng,
  allocate: () => NodeId,
): CommandSpec {
  const entries = listNodes(document);
  // Keep the walked document bounded so long lanes stay fast: past a size
  // threshold the generator always removes structure instead of growing it.
  if (entries.length > 60) {
    return { payload: { nodeId: pick(rng, entries).node.id }, type: 'studio.command/remove-node' };
  }
  const factories: (() => CommandSpec)[] = [
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
        return {
          payload:
            rng() < 0.6
              ? { idMap, nodeId: source.node.id }
              : { destination: chooseDestination(document, rng), idMap, nodeId: source.node.id },
          type: 'studio.command/duplicate-node',
        };
      },
      () => {
        const payload: Record<string, JsonValue> = {
          nodeId: pick(rng, entries).node.id,
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
        const payload: Record<string, JsonValue> = {
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
      return {
        payload:
          target.parentNodeId !== undefined && target.slot !== undefined
            ? { order, parentNodeId: target.parentNodeId, slot: target.slot }
            : { order },
        type: 'studio.command/reorder-children',
      };
    });
  }
  const unsettable: { nodeId: NodeId; property: string; viewport?: string }[] = [];
  for (const entry of entries) {
    for (const property of Object.keys(entry.node.properties)) {
      unsettable.push({ nodeId: entry.node.id, property });
    }
    for (const [property, overrides] of Object.entries(entry.node.responsive ?? {})) {
      for (const viewport of Object.keys(overrides)) {
        unsettable.push({ nodeId: entry.node.id, property, viewport });
      }
    }
  }
  if (unsettable.length > 0) {
    factories.push(() => ({
      payload: structuredClone(pick(rng, unsettable)),
      type: 'studio.command/unset-property',
    }));
  }
  const unsettableSizeRoles: { axis: string; nodeId: NodeId }[] = [];
  for (const entry of entries) {
    for (const axis of Object.keys(entry.node.sizeRoles ?? {})) {
      unsettableSizeRoles.push({ axis, nodeId: entry.node.id });
    }
  }
  if (unsettableSizeRoles.length > 0) {
    factories.push(() => ({
      payload: structuredClone(pick(rng, unsettableSizeRoles)),
      type: 'studio.command/unset-size-role',
    }));
  }
  const removableBindings: { nodeId: NodeId; port: string }[] = [];
  for (const entry of entries) {
    for (const port of Object.keys(entry.node.bindings)) {
      removableBindings.push({ nodeId: entry.node.id, port });
    }
  }
  if (removableBindings.length > 0) {
    factories.push(() => ({
      payload: structuredClone(pick(rng, removableBindings)),
      type: 'studio.command/remove-binding',
    }));
  }
  return pick(rng, factories)();
}

/**
 * One well-formed command spec drawn across the Blueprint vocabulary: single
 * operations, batches staged against a working copy, pattern applications,
 * and inheritance resets whenever the document offers a candidate.
 */
function generateApplicableStep(
  document: BlueprintDocument,
  rng: Rng,
  allocate: () => NodeId,
): GeneratedStep {
  const roll = rng();
  if (roll < 0.12) {
    let working = structuredClone(document);
    const operations: CommandSpec[] = [];
    for (let count = 1 + integer(rng, 3); count > 0; count -= 1) {
      const operation = generateOperation(working, rng, allocate);
      operations.push(operation);
      working = applyCommand(working, buildCommand('fuzz.session.staging', operation, 0));
    }
    return {
      description: 'well-formed batch',
      spec: { payload: { operations }, type: 'studio.command/batch' },
    };
  }
  if (roll < 0.2) {
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
      description: 'well-formed apply-pattern',
      spec: {
        payload: {
          destination: chooseDestination(document, rng),
          idMap,
          nodes,
          pattern: { id: 'fuzz.pattern', revision: 'pattern-r1', version: '1.0.0' },
        },
        type: 'studio.command/apply-pattern',
      },
    };
  }
  if (roll < 0.28) {
    const candidates = listNodes(document).filter(
      (entry) =>
        entry.node.responsive !== undefined && Object.keys(entry.node.responsive).length > 0,
    );
    if (candidates.length > 0) {
      const target = pick(rng, candidates);
      return {
        description: 'well-formed reset-inherited-property',
        spec: {
          payload: {
            nodeId: target.node.id,
            property: pick(rng, Object.keys(target.node.responsive ?? {})),
          },
          type: 'studio.command/reset-inherited-property',
        },
      };
    }
  }
  const operation = generateOperation(document, rng, allocate);
  return { description: `well-formed ${operation.type}`, spec: operation };
}

/** One reducer-broken command spec with its expected canonical failure code. */
function generateBrokenStep(
  document: BlueprintDocument,
  rng: Rng,
  allocate: () => NodeId,
): GeneratedStep {
  const entries = listNodes(document);
  const recipes: (() => GeneratedStep)[] = [
    () => ({
      artifactId: 'other.blueprint',
      description: 'broken wrong-artifact-id',
      expectedCodes: ['node-not-found'],
      spec: generateOperation(document, rng, allocate),
    }),
    () => ({
      description: 'broken remove-missing-node',
      expectedCodes: ['node-not-found'],
      spec: { payload: { nodeId: 'ghost-node' }, type: 'studio.command/remove-node' },
    }),
    () => ({
      description: 'broken insert-missing-parent',
      expectedCodes: ['parent-not-found'],
      spec: {
        payload: {
          destination: { parentNodeId: 'ghost-parent', position: 0, slot: 'main' },
          node: makeNode(rng, allocate, 2),
        },
        type: 'studio.command/insert-node',
      },
    }),
    () => ({
      description: 'broken insert-index-beyond-slot',
      expectedCodes: ['invalid-index'],
      spec: {
        payload: {
          destination: { position: document.roots.length + 1 + integer(rng, 4) },
          node: makeNode(rng, allocate, 2),
        },
        type: 'studio.command/insert-node',
      },
    }),
    () => ({
      description: 'broken restore-non-integral-index',
      expectedCodes: ['invalid-index'],
      spec: {
        payload: {
          destination: { position: pick(rng, [-1, -3, 0.5, Number.NaN]) },
          node: makeNode(rng, allocate, 2),
        },
        type: 'studio.command/restore-node',
      },
    }),
    () => ({
      description: 'broken batch-empty',
      expectedCodes: ['invalid-batch'],
      spec: { payload: { operations: [] }, type: 'studio.command/batch' },
    }),
    () => {
      const order = shuffle(
        rng,
        document.roots.map((node) => node.id),
      );
      order.push('ghost-node');
      return {
        description: 'broken reorder-not-a-permutation',
        expectedCodes: ['invalid-order'],
        spec: { payload: { order }, type: 'studio.command/reorder-children' },
      };
    },
  ];
  if (entries.length > 0) {
    recipes.push(
      () => {
        const node = makeNode(rng, allocate, 1);
        node.id = pick(rng, entries).node.id;
        return {
          description: 'broken insert-duplicate-id',
          expectedCodes: ['duplicate-node'],
          spec: {
            payload: { destination: { position: 0 }, node },
            type: 'studio.command/insert-node',
          },
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
          description: 'broken duplicate-incomplete-id-map',
          expectedCodes: ['invalid-id-map'],
          spec: {
            payload: { idMap, nodeId: source.node.id },
            type: 'studio.command/duplicate-node',
          },
        };
      },
      () => {
        const source = pick(rng, entries);
        return {
          description: 'broken move-into-own-subtree',
          expectedCodes: ['illegal-move'],
          spec: {
            payload: {
              destination: {
                parentNodeId: pick(rng, collectIds(source.node)),
                position: 0,
                slot: pick(rng, SLOT_NAMES),
              },
              nodeId: source.node.id,
            },
            type: 'studio.command/move-node',
          },
        };
      },
      () => ({
        description: 'broken unset-missing-property',
        expectedCodes: ['property-not-found'],
        spec: {
          payload: { nodeId: pick(rng, entries).node.id, property: 'ghost-property' },
          type: 'studio.command/unset-property',
        },
      }),
      () => ({
        description: 'broken remove-missing-binding',
        expectedCodes: ['binding-not-found'],
        spec: {
          payload: { nodeId: pick(rng, entries).node.id, port: 'ghost-port' },
          type: 'studio.command/remove-binding',
        },
      }),
      () => ({
        description: 'broken batch-atomic-failure',
        expectedCodes: ['node-not-found'],
        spec: {
          payload: {
            operations: [
              generateOperation(document, rng, allocate),
              { payload: { nodeId: 'ghost-node' }, type: 'studio.command/remove-node' },
            ],
          },
          type: 'studio.command/batch',
        },
      }),
    );
  }
  return pick(rng, recipes)();
}

// --- the lane ------------------------------------------------------------

interface LaneOutcome {
  applied: number;
  guardCodes: Partial<Record<StudioCommandErrorCode, number>>;
  rejected: number;
  trace: string[];
}

function runSessionLane(seed: number): LaneOutcome {
  const rng = createRng(seed);
  const { allocate, document } = makeDocument(rng);
  const initialCanonical = canonicalDocument(document);
  const session = new StudioSession({
    document,
    maximumHistoryEntries: MAXIMUM_HISTORY_ENTRIES,
    mode: 'blueprint',
    sessionGeneration: LIVE_GENERATION,
  });
  const readOnlySession = new StudioSession({
    document,
    mode: 'read-only',
    sessionGeneration: LIVE_GENERATION,
  });
  const outcome: LaneOutcome = { applied: 0, guardCodes: {}, rejected: 0, trace: [] };

  // The model the session must mirror: canonical strings for the bounded
  // undo stack, the redo stack, and the current document, plus the expected
  // state version.
  const pastStack: string[] = [];
  const futureStack: string[] = [];
  let current = canonicalDocument(session.document);
  let expectedVersion = 0;
  expect(current, `seed=${seed}: the session must open on the given document`).toBe(
    initialCanonical,
  );

  const expectRejection = (
    target: StudioSession,
    command: BlueprintCommand,
    expectedCodes: readonly StudioCommandErrorCode[],
    context: string,
  ): StudioCommandErrorCode => {
    const beforeDocument = canonicalDocument(target.document);
    const beforeSelection = [...target.selection];
    const beforeVersion = target.stateVersion;
    const beforeCanUndo = target.canUndo;
    const beforeCanRedo = target.canRedo;
    let failure: unknown;
    try {
      target.execute(command);
    } catch (error) {
      failure = error;
    }
    expect(failure, `${context}: expected a ${expectedCodes.join('|')} rejection`).toBeDefined();
    expect(
      failure instanceof StudioCommandError,
      `${context}: the rejection escaped with ${describeError(failure)}`,
    ).toBe(true);
    if (!(failure instanceof StudioCommandError)) {
      throw new Error(`${context}: unreachable`);
    }
    expect(
      COMMAND_ERROR_CODES.includes(failure.code),
      `${context}: code ${failure.code} left the closed union`,
    ).toBe(true);
    expect(
      expectedCodes.includes(failure.code),
      `${context}: expected ${expectedCodes.join('|')} but received ${failure.code}`,
    ).toBe(true);
    expect(
      canonicalDocument(target.document),
      `${context}: a rejected command changed the document`,
    ).toBe(beforeDocument);
    expect(
      [...target.selection],
      `${context}: a rejected command changed the selection`,
    ).toStrictEqual(beforeSelection);
    expect(target.stateVersion, `${context}: a rejected command bumped the state version`).toBe(
      beforeVersion,
    );
    expect(target.canUndo, `${context}: a rejected command changed the undo depth`).toBe(
      beforeCanUndo,
    );
    expect(target.canRedo, `${context}: a rejected command changed the redo depth`).toBe(
      beforeCanRedo,
    );
    return failure.code;
  };

  for (let iteration = 0; iteration < ITERATIONS_PER_SEED; iteration += 1) {
    const context = `seed=${seed} iteration=${iteration}`;
    const commandId = `fuzz.session.${seed}.${iteration}`;
    const documentBefore = session.document;
    const versionBefore = session.stateVersion;
    const roll = rng();

    if (roll < 0.32) {
      // A well-formed command must apply and advance the state version.
      const generated = generateApplicableStep(documentBefore, rng, allocate);
      const command = buildCommand(commandId, generated.spec, session.stateVersion);
      deepFreeze(command);
      let result: BlueprintDocument | undefined;
      try {
        result = session.execute(command);
      } catch (error) {
        expect.fail(
          `${context} scenario=${generated.description}: a well-formed command was rejected with ${describeError(error)}`,
        );
      }
      if (result === undefined) {
        throw new Error(`${context}: unreachable`);
      }
      expectedVersion += 1;
      pastStack.push(current);
      if (pastStack.length > MAXIMUM_HISTORY_ENTRIES) {
        pastStack.shift();
      }
      futureStack.length = 0;
      current = canonicalDocument(result);
      outcome.applied += 1;
      outcome.trace.push(`${iteration}:applied:${generated.spec.type}`);
    } else if (roll < 0.5) {
      // A reducer-broken command must fail with its canonical code.
      const generated = generateBrokenStep(documentBefore, rng, allocate);
      const overrides: CommandOverrides = {};
      if (generated.artifactId !== undefined) {
        overrides.artifactId = generated.artifactId;
      }
      const command = buildCommand(commandId, generated.spec, session.stateVersion, overrides);
      deepFreeze(command);
      const code = expectRejection(
        session,
        command,
        generated.expectedCodes ?? COMMAND_ERROR_CODES,
        `${context} scenario=${generated.description}`,
      );
      outcome.rejected += 1;
      outcome.trace.push(`${iteration}:rejected:${code}`);
    } else if (roll < 0.68) {
      // A session-guard violation must fail closed before the reducer runs.
      const guardRoll = integer(rng, 5);
      let code: StudioCommandErrorCode;
      if (guardRoll === 0) {
        const generated = generateApplicableStep(readOnlySession.document, rng, allocate);
        const command = buildCommand(commandId, generated.spec, readOnlySession.stateVersion);
        deepFreeze(command);
        code = expectRejection(
          readOnlySession,
          command,
          ['read-only-session'],
          `${context} scenario=read-only-session`,
        );
        expect(readOnlySession.stateVersion, `${context}: the read-only session advanced`).toBe(0);
        expect(
          canonicalDocument(readOnlySession.document),
          `${context}: the read-only session document changed`,
        ).toBe(initialCanonical);
      } else if (guardRoll === 1) {
        const generated = generateApplicableStep(documentBefore, rng, allocate);
        const command = buildCommand(commandId, generated.spec, session.stateVersion, {
          sessionGeneration: STALE_GENERATION,
        });
        deepFreeze(command);
        code = expectRejection(
          session,
          command,
          ['stale-generation'],
          `${context} scenario=stale-generation`,
        );
      } else if (guardRoll === 2) {
        const foreignType = pick(rng, [
          'studio.command/add-model-field',
          'studio.command/set-field-value',
          'studio.command/💥',
        ] as const);
        const command = buildCommand(
          commandId,
          { payload: { fieldPath: ['title'], value: 'forbidden' }, type: foreignType },
          session.stateVersion,
        );
        deepFreeze(command);
        code = expectRejection(
          session,
          command,
          ['mode-forbidden'],
          `${context} scenario=mode-forbidden ${foreignType}`,
        );
      } else if (guardRoll === 3) {
        const generated = generateApplicableStep(documentBefore, rng, allocate);
        const staleBase = session.stateVersion + 1 + integer(rng, 4);
        const command = buildCommand(commandId, generated.spec, staleBase);
        deepFreeze(command);
        code = expectRejection(
          session,
          command,
          ['stale-state'],
          `${context} scenario=stale-base-state-version`,
        );
      } else {
        const generated = generateApplicableStep(documentBefore, rng, allocate);
        const command = buildCommand(commandId, generated.spec, session.stateVersion, {
          expectedRevision: 'blueprint-r999',
        });
        deepFreeze(command);
        code = expectRejection(
          session,
          command,
          ['stale-state'],
          `${context} scenario=stale-expected-revision`,
        );
      }
      outcome.rejected += 1;
      outcome.guardCodes[code] = (outcome.guardCodes[code] ?? 0) + 1;
      outcome.trace.push(`${iteration}:guard:${code}`);
    } else if (roll < 0.78) {
      // Undo walks back through byte-identical prior documents.
      const hadPast = pastStack.length > 0;
      expect(session.canUndo, `${context}: canUndo disagrees with the model`).toBe(hadPast);
      const result = session.undo();
      if (hadPast) {
        expectedVersion += 1;
        futureStack.push(current);
        const previous = pastStack.pop();
        if (previous === undefined) {
          throw new Error(`${context}: unreachable`);
        }
        current = previous;
        expect(
          canonicalDocument(result),
          `${context}: undo did not restore the prior document byte-identically`,
        ).toBe(current);
      } else {
        expect(
          canonicalDocument(result),
          `${context}: undo on an empty history changed the document`,
        ).toBe(current);
      }
      outcome.trace.push(`${iteration}:undo:${session.stateVersion}`);
    } else if (roll < 0.86) {
      // Redo replays forward byte-identically.
      const hadFuture = futureStack.length > 0;
      expect(session.canRedo, `${context}: canRedo disagrees with the model`).toBe(hadFuture);
      const result = session.redo();
      if (hadFuture) {
        expectedVersion += 1;
        pastStack.push(current);
        if (pastStack.length > MAXIMUM_HISTORY_ENTRIES) {
          pastStack.shift();
        }
        const next = futureStack.pop();
        if (next === undefined) {
          throw new Error(`${context}: unreachable`);
        }
        current = next;
        expect(
          canonicalDocument(result),
          `${context}: redo did not replay the next document byte-identically`,
        ).toBe(current);
      } else {
        expect(
          canonicalDocument(result),
          `${context}: redo on an empty future changed the document`,
        ).toBe(current);
      }
      outcome.trace.push(`${iteration}:redo:${session.stateVersion}`);
    } else if (roll < 0.94) {
      // Selection changes: valid picks land, missing nodes fail closed.
      const identifiers = [...collectDocumentIds(documentBefore)];
      if (identifiers.length > 0 && rng() < 0.7) {
        const chosen = shuffle(rng, identifiers).slice(
          0,
          1 + integer(rng, Math.min(3, identifiers.length)),
        );
        const selected = session.select(chosen);
        expect([...selected], `${context}: select did not keep the requested order`).toStrictEqual(
          chosen,
        );
        outcome.trace.push(`${iteration}:select:${chosen.length}`);
      } else {
        const beforeSelection = [...session.selection];
        let failure: unknown;
        try {
          session.select([
            ...(identifiers.length > 0 ? [pick(rng, identifiers)] : []),
            'ghost-selection',
          ]);
        } catch (error) {
          failure = error;
        }
        expect(
          failure instanceof StudioCommandError && failure.code === 'node-not-found',
          `${context}: selecting a missing node must fail with node-not-found, got ${describeError(failure)}`,
        ).toBe(true);
        expect(
          [...session.selection],
          `${context}: a rejected selection changed the selection`,
        ).toStrictEqual(beforeSelection);
        outcome.trace.push(`${iteration}:select-rejected`);
      }
    } else {
      session.clearSelection();
      expect([...session.selection], `${context}: clearSelection left residue`).toStrictEqual([]);
      outcome.trace.push(`${iteration}:clear-selection`);
    }

    // Cross-step invariants, checked after every single step.
    expect(
      session.stateVersion,
      `${context}: the state version regressed below ${versionBefore}`,
    ).toBeGreaterThanOrEqual(versionBefore);
    expect(session.stateVersion, `${context}: the state version drifted from the model`).toBe(
      expectedVersion,
    );
    expect(
      canonicalDocument(session.document),
      `${context}: the session document diverged from the model`,
    ).toBe(current);
    expect(session.canUndo, `${context}: canUndo diverged from the model`).toBe(
      pastStack.length > 0,
    );
    expect(session.canRedo, `${context}: canRedo diverged from the model`).toBe(
      futureStack.length > 0,
    );
    expect(
      pastStack.length <= MAXIMUM_HISTORY_ENTRIES,
      `${context}: the history exceeded its configured bound`,
    ).toBe(true);
    const documentIds = collectDocumentIds(session.document);
    for (const nodeId of session.selection) {
      expect(
        documentIds.has(nodeId),
        `${context}: the selection references ${nodeId}, which is not in the document`,
      ).toBe(true);
    }
  }
  return outcome;
}

describe('session and history fuzzing (M3-01)', () => {
  it.each([...SEEDS])(
    'holds the session invariants across %d-seeded operation sequences',
    (seed) => {
      const outcome = runSessionLane(seed);
      // Guard against silent generator degeneration: both the success path
      // and the rejection path must stay well represented.
      expect(outcome.applied, `seed=${seed}: too few applied commands`).toBeGreaterThan(20);
      expect(outcome.rejected, `seed=${seed}: too few rejected commands`).toBeGreaterThan(20);
      for (const code of GUARD_CODES) {
        expect(
          outcome.guardCodes[code] ?? 0,
          `seed=${seed}: guard code ${code} was never exercised`,
        ).toBeGreaterThan(0);
      }
    },
  );

  it('produces an identical outcome stream for a fixed seed', () => {
    expect(runSessionLane(SEEDS[0]).trace).toStrictEqual(runSessionLane(SEEDS[0]).trace);
  });

  it('walks back and replays byte-identical documents through undo and redo', () => {
    const rng = createRng(SEEDS[1]);
    const { allocate, document } = makeDocument(rng);
    const session = new StudioSession({
      document,
      maximumHistoryEntries: 32,
      mode: 'blueprint',
      sessionGeneration: LIVE_GENERATION,
    });
    const snapshots = [canonicalDocument(session.document)];
    for (let step = 0; step < 8; step += 1) {
      const generated = generateApplicableStep(session.document, rng, allocate);
      const command = buildCommand(
        `fuzz.session.roundtrip.${step}`,
        generated.spec,
        session.stateVersion,
      );
      deepFreeze(command);
      snapshots.push(canonicalDocument(session.execute(command)));
    }
    for (let step = 7; step >= 0; step -= 1) {
      expect(canonicalDocument(session.undo()), `undo to snapshot ${step}`).toBe(snapshots[step]);
    }
    expect(session.canUndo).toBe(false);
    for (let step = 1; step <= 8; step += 1) {
      expect(canonicalDocument(session.redo()), `redo to snapshot ${step}`).toBe(snapshots[step]);
    }
    expect(session.canRedo).toBe(false);
    expect(session.stateVersion).toBe(24);
  });

  it('never retains more undo states than the configured history bound', () => {
    const rng = createRng(SEEDS[2]);
    const { allocate, document } = makeDocument(rng);
    const session = new StudioSession({
      document,
      maximumHistoryEntries: 3,
      mode: 'blueprint',
      sessionGeneration: LIVE_GENERATION,
    });
    const snapshots = [canonicalDocument(session.document)];
    for (let step = 0; step < 7; step += 1) {
      const generated = generateApplicableStep(session.document, rng, allocate);
      const command = buildCommand(
        `fuzz.session.bound.${step}`,
        generated.spec,
        session.stateVersion,
      );
      deepFreeze(command);
      snapshots.push(canonicalDocument(session.execute(command)));
    }
    // Only the last three states stay undoable: 7 executes with a bound of 3
    // walk back to snapshots 6, 5, and 4, and no further.
    for (const step of [6, 5, 4]) {
      expect(session.canUndo).toBe(true);
      expect(canonicalDocument(session.undo()), `undo to snapshot ${step}`).toBe(snapshots[step]);
    }
    expect(session.canUndo).toBe(false);
    const parked = canonicalDocument(session.document);
    expect(canonicalDocument(session.undo()), 'undo past the bound must be a no-op').toBe(parked);
    expect(session.stateVersion).toBe(10);
  });
});
