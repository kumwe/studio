import {
  blueprintSchema,
  commonSchema,
  type BlockDefinition,
  type BlueprintBlockLock,
  type BlueprintDocument,
  type BlueprintNode,
  type JsonObject,
  type QualifiedName,
  type StudioDiagnostic,
} from '@kumwe/studio-protocol';
import {
  compileProfileSchema,
  type CompiledSchemaValidator,
  type SchemaValidationError,
} from './profile-validator.js';
import type { BlockRegistry } from './registry.js';

export interface BlueprintValidationOptions {
  fieldPaths?: ReadonlySet<string>;
  maximumDepth?: number;
  maximumNodes?: number;
}

export interface BlueprintValidationResult {
  diagnostics: StudioDiagnostic[];
  valid: boolean;
}

// The canonical Blueprint schema is interpreted, not code-generated, so
// boot-path validation stays eval-free and runs under a CSP that forbids
// string-to-code compilation (TH-013).
const validateBlueprintSchema: CompiledSchemaValidator = compileProfileSchema(blueprintSchema, {
  schemas: [commonSchema],
});

const propertyValidators = new WeakMap<BlockRegistry, Map<string, CompiledSchemaValidator>>();
const MAX_BLUEPRINT_JSON_BYTES = 16 * 1_024 * 1_024;
const MAX_BLUEPRINT_JSON_DEPTH = 64;
const MAX_BLUEPRINT_JSON_VALUES = 1_000_000;
const MAX_JSON_CONTAINER_ENTRIES = 10_000;

interface NodeFrame {
  depth: number;
  node: BlueprintNode;
}

interface UnknownNodeFrame {
  depth: number;
  value: unknown;
}

interface JsonValueFrame {
  depth: number;
  value: unknown;
}

export function validateBlueprint(
  document: unknown,
  registry: BlockRegistry,
  options: BlueprintValidationOptions = {},
): BlueprintValidationResult {
  const diagnostics: StudioDiagnostic[] = [];
  const maximumDepth = validationLimit(options.maximumDepth, 32, 'maximumDepth');
  const maximumNodes = validationLimit(options.maximumNodes, 5_000, 'maximumNodes');

  const nodePreflightDiagnostics = preflightBlueprintNodes(document, maximumDepth, maximumNodes);
  if (nodePreflightDiagnostics.length > 0) {
    return { diagnostics: nodePreflightDiagnostics, valid: false };
  }
  const valuePreflightDiagnostic = preflightBlueprintJson(document);
  if (valuePreflightDiagnostic !== undefined) {
    return { diagnostics: [valuePreflightDiagnostic], valid: false };
  }

  if (!validateBlueprintSchema.validate(document)) {
    diagnostics.push(...schemaDiagnostics(validateBlueprintSchema.errors));
    return { diagnostics, valid: false };
  }
  const blueprint = document as BlueprintDocument;

  const identifiers = new Set<string>();
  const blockLocks = indexBlockLocks(blueprint.dependencyLock.blocks, diagnostics);
  let nodeCount = 0;
  const stack: NodeFrame[] = blueprint.roots.map((node) => ({ depth: 1, node })).reverse();

  while (stack.length > 0) {
    const frame = stack.pop();
    if (frame === undefined) {
      break;
    }
    const { depth, node } = frame;
    nodeCount += 1;
    if (nodeCount > maximumNodes) {
      break;
    }

    if (depth > maximumDepth) {
      diagnostics.push(
        diagnostic(
          'maximum-depth',
          `Node depth exceeds the configured limit of ${maximumDepth}.`,
          node.id,
        ),
      );
      continue;
    }

    if (identifiers.has(node.id)) {
      diagnostics.push(
        diagnostic('duplicate-node-id', `Node identifier ${node.id} is not unique.`, node.id),
      );
    }
    identifiers.add(node.id);

    const registration = registry.resolveRegistration(node.type, node.version);
    if (registration === undefined) {
      diagnostics.push(
        diagnostic(
          'block-unavailable',
          `Block ${node.type}@${node.version} is not registered.`,
          node.id,
        ),
      );
    } else {
      validateBlockLock(
        node,
        registration.definition,
        registration.verifiedIntegrity,
        blockLocks.get(blockKey(node.type, node.version)),
        diagnostics,
      );
      validateNodeProperties(node, registration.definition, registry, diagnostics);
      validateSlots(node, registration.definition, diagnostics);
    }

    validateBindings(node, options.fieldPaths, diagnostics);

    const childCollections = Object.values(node.slots);
    for (
      let collectionIndex = childCollections.length - 1;
      collectionIndex >= 0;
      collectionIndex -= 1
    ) {
      const children = childCollections[collectionIndex];
      if (children === undefined) {
        continue;
      }
      for (let childIndex = children.length - 1; childIndex >= 0; childIndex -= 1) {
        const child = children[childIndex];
        if (child !== undefined) {
          stack.push({ depth: depth + 1, node: child });
        }
      }
    }
  }

  if (nodeCount > maximumNodes) {
    diagnostics.push(
      diagnostic(
        'maximum-nodes',
        `Blueprint contains more than the configured limit of ${maximumNodes} nodes.`,
      ),
    );
  }

  return {
    diagnostics,
    valid: diagnostics.every(
      (entry) => entry.severity !== 'blocking' && entry.severity !== 'error',
    ),
  };
}

function preflightBlueprintNodes(
  document: unknown,
  maximumDepth: number,
  maximumNodes: number,
): StudioDiagnostic[] {
  if (!isRecord(document) || !Array.isArray(document.roots)) {
    return [];
  }
  const roots: unknown[] = document.roots;
  if (roots.length > maximumNodes) {
    return [
      diagnostic(
        'maximum-nodes',
        `Blueprint contains more than the configured limit of ${maximumNodes} nodes.`,
      ),
    ];
  }

  const seen = new WeakSet<object>();
  let scheduled = roots.length;
  const stack: UnknownNodeFrame[] = roots.map((value) => ({ depth: 1, value })).reverse();

  while (stack.length > 0) {
    const frame = stack.pop();
    if (frame === undefined || !isRecord(frame.value)) {
      continue;
    }
    if (seen.has(frame.value)) {
      return [diagnostic('cyclic-blueprint', 'Blueprint nodes must form an acyclic JSON tree.')];
    }
    seen.add(frame.value);
    if (frame.depth > maximumDepth) {
      return [
        diagnostic(
          'maximum-depth',
          `Node depth exceeds the configured limit of ${maximumDepth}.`,
          typeof frame.value.id === 'string' ? frame.value.id : undefined,
        ),
      ];
    }
    if (!isRecord(frame.value.slots)) {
      continue;
    }

    for (const children of Object.values(frame.value.slots)) {
      if (!Array.isArray(children)) {
        continue;
      }
      scheduled += children.length;
      if (scheduled > maximumNodes) {
        return [
          diagnostic(
            'maximum-nodes',
            `Blueprint contains more than the configured limit of ${maximumNodes} nodes.`,
          ),
        ];
      }
      for (let index = children.length - 1; index >= 0; index -= 1) {
        stack.push({ depth: frame.depth + 1, value: children[index] });
      }
    }
  }
  return [];
}

function preflightBlueprintJson(document: unknown): StudioDiagnostic | undefined {
  const seen = new WeakSet<object>();
  const stack: JsonValueFrame[] = [{ depth: 0, value: document }];
  let approximateBytes = 0;
  let valueCount = 0;

  while (stack.length > 0) {
    const frame = stack.pop();
    if (frame === undefined) {
      break;
    }
    valueCount += 1;
    if (valueCount > MAX_BLUEPRINT_JSON_VALUES) {
      return diagnostic(
        'maximum-json-values',
        `Blueprint exceeds the fixed alpha limit of ${MAX_BLUEPRINT_JSON_VALUES} JSON values.`,
      );
    }
    if (frame.depth > MAX_BLUEPRINT_JSON_DEPTH) {
      return diagnostic(
        'maximum-value-depth',
        `Blueprint JSON value depth exceeds the fixed alpha limit of ${MAX_BLUEPRINT_JSON_DEPTH}.`,
      );
    }

    const { value } = frame;
    if (value === null) {
      approximateBytes += 4;
    } else if (typeof value === 'boolean') {
      approximateBytes += value ? 4 : 5;
    } else if (typeof value === 'number' && Number.isFinite(value)) {
      approximateBytes += String(value).length;
    } else if (typeof value === 'string') {
      approximateBytes += jsonStringByteLength(value);
    } else if (Array.isArray(value)) {
      if (!isDenseJsonArray(value)) {
        return diagnostic('non-json-value', 'Blueprint arrays must be dense JSON arrays.');
      }
      if (value.length > MAX_JSON_CONTAINER_ENTRIES) {
        return diagnostic(
          'maximum-array-items',
          `Blueprint arrays cannot exceed ${MAX_JSON_CONTAINER_ENTRIES} items.`,
        );
      }
      if (seen.has(value)) {
        return diagnostic('cyclic-blueprint', 'Blueprint must be an acyclic JSON document.');
      }
      seen.add(value);
      approximateBytes += value.length + 2;
      for (let index = value.length - 1; index >= 0; index -= 1) {
        stack.push({ depth: frame.depth + 1, value: value[index] });
      }
    } else if (isJsonRecord(value)) {
      if (seen.has(value)) {
        return diagnostic('cyclic-blueprint', 'Blueprint must be an acyclic JSON document.');
      }
      seen.add(value);
      const entries = Object.entries(value);
      if (entries.length > MAX_JSON_CONTAINER_ENTRIES) {
        return diagnostic(
          'maximum-object-properties',
          `Blueprint objects cannot exceed ${MAX_JSON_CONTAINER_ENTRIES} properties.`,
        );
      }
      approximateBytes += entries.length + 2;
      for (let index = entries.length - 1; index >= 0; index -= 1) {
        const entry = entries[index];
        if (entry === undefined) {
          continue;
        }
        const [key, child] = entry;
        if (!isSafeJsonMemberName(key)) {
          return diagnostic(
            'unsafe-json-member',
            'Blueprint contains an unsafe JSON object member name.',
          );
        }
        approximateBytes += jsonStringByteLength(key) + 1;
        stack.push({ depth: frame.depth + 1, value: child });
      }
    } else {
      return diagnostic('non-json-value', 'Blueprint must contain only JSON-compatible values.');
    }

    if (approximateBytes > MAX_BLUEPRINT_JSON_BYTES) {
      return diagnostic(
        'maximum-json-bytes',
        `Blueprint exceeds the fixed alpha limit of ${MAX_BLUEPRINT_JSON_BYTES} encoded bytes.`,
      );
    }
  }
  return undefined;
}

function isDenseJsonArray(value: unknown[]): boolean {
  if (
    Object.getPrototypeOf(value) !== Array.prototype ||
    Object.getOwnPropertySymbols(value).length
  ) {
    return false;
  }
  const ownNames = Object.getOwnPropertyNames(value);
  return (
    ownNames.length === value.length + 1 &&
    ownNames[value.length] === 'length' &&
    ownNames.slice(0, -1).every((name, index) => name === String(index))
  );
}

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value) || Object.getOwnPropertySymbols(value).length > 0) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value) as unknown;
  if (prototype !== Object.prototype && prototype !== null) {
    return false;
  }
  return Object.getOwnPropertyNames(value).length === Object.keys(value).length;
}

function isSafeJsonMemberName(value: string): boolean {
  if (
    value.length === 0 ||
    value.length > 200 ||
    value === '__proto__' ||
    value === 'prototype' ||
    value === 'constructor'
  ) {
    return false;
  }
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f) {
      return false;
    }
  }
  return true;
}

function jsonStringByteLength(value: string): number {
  let bytes = 2;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f) {
      bytes += 6;
    } else if (code === 0x22 || code === 0x5c) {
      bytes += 2;
    } else if (code <= 0x7f) {
      bytes += 1;
    } else if (code <= 0x7ff) {
      bytes += 2;
    } else if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        index += 1;
      } else {
        bytes += 3;
      }
    } else {
      bytes += 3;
    }
  }
  return bytes;
}

function validationLimit(value: number | undefined, fallback: number, name: string): number {
  const result = value ?? fallback;
  if (!Number.isInteger(result) || result < 1) {
    throw new RangeError(`${name} must be a positive integer.`);
  }
  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function schemaDiagnostics(errors: SchemaValidationError[] | null): StudioDiagnostic[] {
  return (errors ?? []).map((error) =>
    diagnostic(`schema-${error.keyword}`, error.message, undefined, error.instancePath),
  );
}

function validateNodeProperties(
  node: BlueprintNode,
  definition: BlockDefinition,
  registry: BlockRegistry,
  diagnostics: StudioDiagnostic[],
): void {
  const key = `${definition.type}@${definition.version}`;
  let cache = propertyValidators.get(registry);
  if (cache === undefined) {
    cache = new Map<string, CompiledSchemaValidator>();
    propertyValidators.set(registry, cache);
  }
  let validator = cache.get(key);
  if (validator === undefined) {
    const compiled = compileProfileSchema(definition.propertySchema);
    cache.set(key, compiled);
    validator = compiled;
  }

  validateEffectiveProperties(node, validator, node.properties, undefined, diagnostics);

  const effective = new Map<string, JsonObject>();
  for (const property of Object.keys(node.responsive ?? {}).sort(compareCodeUnits)) {
    const overrides = node.responsive?.[property];
    if (overrides === undefined) {
      continue;
    }
    for (const viewport of Object.keys(overrides).sort(compareCodeUnits)) {
      const override = overrides[viewport];
      if (override === undefined) {
        continue;
      }
      const properties = effective.get(viewport) ?? { ...node.properties };
      properties[property] = override;
      effective.set(viewport, properties);
    }
  }
  for (const viewport of [...effective.keys()].sort(compareCodeUnits)) {
    const properties = effective.get(viewport);
    if (properties !== undefined) {
      validateEffectiveProperties(node, validator, properties, viewport, diagnostics);
    }
  }
}

function validateEffectiveProperties(
  node: BlueprintNode,
  validator: CompiledSchemaValidator,
  properties: JsonObject,
  viewport: string | undefined,
  diagnostics: StudioDiagnostic[],
): void {
  if (validator.validate(properties)) {
    return;
  }
  diagnostics.push(
    ...schemaDiagnostics(validator.errors).map((entry) => ({
      ...entry,
      code: `studio.validation/block-properties-${entry.code.split('/').at(-1) ?? 'invalid'}` as QualifiedName,
      location: {
        ...entry.location,
        nodeId: node.id,
        ...(viewport === undefined
          ? {}
          : { jsonPointer: responsivePropertyPointer(entry.location?.jsonPointer, viewport) }),
      },
    })),
  );
}

function responsivePropertyPointer(jsonPointer: string | undefined, viewport: string): string {
  const segments = jsonPointer?.split('/').slice(1) ?? [];
  const property = segments.shift();
  if (property === undefined) {
    return `/responsive/${escapePointerToken(viewport)}`;
  }
  return ['', 'responsive', property, escapePointerToken(viewport), ...segments].join('/');
}

function escapePointerToken(value: string): string {
  return value.replaceAll('~', '~0').replaceAll('/', '~1');
}

function indexBlockLocks(
  locks: readonly BlueprintBlockLock[],
  diagnostics: StudioDiagnostic[],
): ReadonlyMap<string, BlueprintBlockLock> {
  const indexed = new Map<string, BlueprintBlockLock>();
  for (const lock of locks) {
    const key = blockKey(lock.type, lock.version);
    if (indexed.has(key)) {
      diagnostics.push(
        diagnostic(
          'block-lock-duplicate',
          `Blueprint dependency lock repeats block ${lock.type}@${lock.version}.`,
        ),
      );
    } else {
      indexed.set(key, lock);
    }
  }
  return indexed;
}

function validateBlockLock(
  node: BlueprintNode,
  definition: BlockDefinition,
  verifiedIntegrity: string | undefined,
  lock: BlueprintBlockLock | undefined,
  diagnostics: StudioDiagnostic[],
): void {
  if (lock === undefined) {
    diagnostics.push(
      diagnostic(
        'block-lock-missing',
        `Block ${node.type}@${node.version} is absent from the Blueprint dependency lock.`,
        node.id,
      ),
    );
    return;
  }
  if (lock.revision !== definition.revision) {
    diagnostics.push(
      diagnostic(
        'block-lock-revision-mismatch',
        `Block ${node.type}@${node.version} resolves to revision ${definition.revision}, not locked revision ${lock.revision}.`,
        node.id,
      ),
    );
  }
  if (lock.integrity !== undefined && verifiedIntegrity === undefined) {
    diagnostics.push(
      diagnostic(
        'block-lock-integrity-unverified',
        `Block ${node.type}@${node.version} has a locked integrity value that the registry cannot verify.`,
        node.id,
      ),
    );
  } else if (lock.integrity !== undefined && lock.integrity !== verifiedIntegrity) {
    diagnostics.push(
      diagnostic(
        'block-lock-integrity-mismatch',
        `Block ${node.type}@${node.version} does not match its locked integrity value.`,
        node.id,
      ),
    );
  }
}

function blockKey(type: string, version: string): string {
  return `${type}@${version}`;
}

function validateSlots(
  node: BlueprintNode,
  definition: BlockDefinition,
  diagnostics: StudioDiagnostic[],
): void {
  const slots = new Map(definition.slots.map((slot) => [slot.id, slot]));

  for (const [slotName, children] of Object.entries(node.slots)) {
    const slot = slots.get(slotName);
    if (slot === undefined) {
      diagnostics.push(
        diagnostic('slot-unknown', `Slot ${slotName} is not declared by ${node.type}.`, node.id),
      );
      continue;
    }

    if (children.length > slot.maximum) {
      diagnostics.push(
        diagnostic(
          'slot-maximum',
          `Slot ${slotName} accepts at most ${slot.maximum} children.`,
          node.id,
        ),
      );
    }

    for (const child of children) {
      if (slot.accepts.types !== undefined && !slot.accepts.types.includes(child.type)) {
        diagnostics.push(
          diagnostic(
            'slot-rejects-type',
            `Slot ${slotName} does not accept ${child.type}.`,
            child.id,
          ),
        );
      }
    }
  }

  for (const slot of slots.values()) {
    const count = Object.hasOwn(node.slots, slot.id) ? (node.slots[slot.id]?.length ?? 0) : 0;
    if (count < slot.minimum) {
      diagnostics.push(
        diagnostic(
          'slot-minimum',
          `Slot ${slot.id} requires at least ${slot.minimum} children.`,
          node.id,
        ),
      );
    }
  }
}

function validateBindings(
  node: BlueprintNode,
  fieldPaths: ReadonlySet<string> | undefined,
  diagnostics: StudioDiagnostic[],
): void {
  if (fieldPaths === undefined) {
    return;
  }

  for (const binding of Object.values(node.bindings)) {
    if (binding.source.kind !== 'entry-field') {
      continue;
    }
    const path = binding.source.fieldPath.join('.');
    if (!fieldPaths.has(path)) {
      diagnostics.push(
        diagnostic(
          'field-unavailable',
          `Field ${path} is not available to this Studio configuration.`,
          node.id,
        ),
      );
    }
  }
}

function diagnostic(
  name: string,
  message: string,
  nodeId?: string,
  jsonPointer?: string,
): StudioDiagnostic {
  const result: StudioDiagnostic = {
    code: `studio.validation/${name}`,
    message: { defaultMessage: message, key: `studio.validation/${name}` },
    severity: 'error',
  };
  if (nodeId !== undefined || jsonPointer !== undefined) {
    result.location = {};
    if (nodeId !== undefined) {
      result.location.nodeId = nodeId;
    }
    if (jsonPointer !== undefined) {
      result.location.jsonPointer = jsonPointer;
    }
  }
  return result;
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
