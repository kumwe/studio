import { Ajv2020 } from 'ajv/dist/2020.js';
import type { JsonSchema } from '@kumwe/studio-protocol';

const DRAFT_2020_12 = 'https://json-schema.org/draft/2020-12/schema';
const MAX_ALTERNATIVES = 64;
const MAX_ENUM_MEMBERS = 1_024;
const MAX_JSON_DEPTH = 64;
const MAX_JSON_ITEMS = 10_000;
const MAX_JSON_PROPERTIES = 1_000;
const MAX_REFERENCES = 128;
const MAX_SCHEMA_BYTES = 262_144;
const MAX_SCHEMA_DEPTH = 32;
const MAX_SCHEMA_MAP_PROPERTIES = 512;
const MAX_SCHEMA_NODES = 1_024;
const MAX_OBJECT_KEY_LENGTH = 200;

/**
 * The published complexity limits of the Studio Schema Profile. The
 * machine-readable meta-schema (`schema-profile.schema.json`) carries the
 * same values; a parity test keeps the two from drifting.
 */
export const STUDIO_SCHEMA_PROFILE_LIMITS: Readonly<Record<string, number>> = Object.freeze({
  maxAlternatives: MAX_ALTERNATIVES,
  maxEnumMembers: MAX_ENUM_MEMBERS,
  maxJsonDepth: MAX_JSON_DEPTH,
  maxJsonItems: MAX_JSON_ITEMS,
  maxJsonProperties: MAX_JSON_PROPERTIES,
  maxObjectKeyLength: MAX_OBJECT_KEY_LENGTH,
  maxReferences: MAX_REFERENCES,
  maxSchemaBytes: MAX_SCHEMA_BYTES,
  maxSchemaDepth: MAX_SCHEMA_DEPTH,
  maxSchemaMapProperties: MAX_SCHEMA_MAP_PROPERTIES,
  maxSchemaNodes: MAX_SCHEMA_NODES,
});

const allowedKeywords = new Set([
  '$defs',
  '$ref',
  '$schema',
  'additionalProperties',
  'allOf',
  'anyOf',
  'const',
  'default',
  'dependentRequired',
  'description',
  'else',
  'enum',
  'examples',
  'exclusiveMaximum',
  'exclusiveMinimum',
  'if',
  'items',
  'maxItems',
  'maxLength',
  'maxProperties',
  'maximum',
  'minItems',
  'minLength',
  'minProperties',
  'minimum',
  'multipleOf',
  'not',
  'oneOf',
  'prefixItems',
  'properties',
  'propertyNames',
  'readOnly',
  'required',
  'then',
  'title',
  'type',
  'uniqueItems',
  'writeOnly',
]);

interface ProfileState {
  references: number;
  schemaNodes: number;
  seen: WeakSet<object>;
}

export function assertStudioPropertySchema(schema: JsonSchema): void {
  const state: ProfileState = { references: 0, schemaNodes: 0, seen: new WeakSet<object>() };
  visitSchema(schema, '$', 1, state);
  assertNonRecursiveSchema(schema);

  let serialized: string;
  try {
    serialized = JSON.stringify(schema);
  } catch (error) {
    throw new TypeError('Studio property schema must be an acyclic JSON document.', {
      cause: error,
    });
  }
  if (utf8ByteLength(serialized) > MAX_SCHEMA_BYTES) {
    throw new RangeError(`Studio property schema exceeds ${MAX_SCHEMA_BYTES} bytes.`);
  }

  try {
    new Ajv2020({ addUsedSchema: false, allErrors: true, strict: true }).compile(schema);
  } catch (error) {
    throw new TypeError('Studio property schema does not compile under the strict profile.', {
      cause: error,
    });
  }
}

function visitSchema(value: unknown, path: string, depth: number, state: ProfileState): void {
  if (!isRecord(value)) {
    throw new TypeError(`${path} must be a JSON Schema object.`);
  }
  trackObject(value, path, state);
  if (depth > MAX_SCHEMA_DEPTH) {
    throw new RangeError(`${path} exceeds the Studio Schema Profile depth limit.`);
  }
  state.schemaNodes += 1;
  if (state.schemaNodes > MAX_SCHEMA_NODES) {
    throw new RangeError(`Studio property schema exceeds ${MAX_SCHEMA_NODES} schema nodes.`);
  }

  for (const [keyword, keywordValue] of Object.entries(value)) {
    assertSafeObjectKey(keyword, path);
    if (!allowedKeywords.has(keyword)) {
      throw new TypeError(`${path}.${keyword} is not allowed by the Studio Schema Profile.`);
    }

    switch (keyword) {
      case '$defs':
      case 'properties':
        visitSchemaMap(keywordValue, `${path}.${keyword}`, depth + 1, state);
        break;
      case 'additionalProperties':
      case 'else':
      case 'if':
      case 'items':
      case 'not':
      case 'propertyNames':
      case 'then':
        visitSubschema(keywordValue, `${path}.${keyword}`, depth + 1, state);
        break;
      case 'allOf':
      case 'anyOf':
      case 'oneOf':
      case 'prefixItems':
        visitSchemaArray(keywordValue, `${path}.${keyword}`, depth + 1, state);
        break;
      case '$ref':
        visitReference(keywordValue, `${path}.${keyword}`, state);
        break;
      case '$schema':
        if (keywordValue !== DRAFT_2020_12) {
          throw new TypeError(`${path} must declare JSON Schema Draft 2020-12.`);
        }
        break;
      case 'enum':
        if (!Array.isArray(keywordValue) || keywordValue.length > MAX_ENUM_MEMBERS) {
          throw new RangeError(`${path}.enum exceeds ${MAX_ENUM_MEMBERS} members.`);
        }
        visitJsonValue(keywordValue, `${path}.enum`, depth + 1, state);
        break;
      default:
        visitJsonValue(keywordValue, `${path}.${keyword}`, depth + 1, state);
    }
  }
}

function visitSchemaMap(value: unknown, path: string, depth: number, state: ProfileState): void {
  if (!isRecord(value)) {
    throw new TypeError(`${path} must be an object of schemas.`);
  }
  trackObject(value, path, state);
  const entries = Object.entries(value);
  if (entries.length > MAX_SCHEMA_MAP_PROPERTIES) {
    throw new RangeError(`${path} exceeds ${MAX_SCHEMA_MAP_PROPERTIES} schema entries.`);
  }
  for (const [name, schema] of entries) {
    assertSafeObjectKey(name, path);
    visitSchema(schema, `${path}.${name}`, depth, state);
  }
}

function visitSchemaArray(value: unknown, path: string, depth: number, state: ProfileState): void {
  if (!Array.isArray(value) || value.length > MAX_ALTERNATIVES) {
    throw new RangeError(`${path} must contain at most ${MAX_ALTERNATIVES} schemas.`);
  }
  trackObject(value, path, state);
  assertDenseArray(value, path);
  for (const [index, schema] of value.entries()) {
    visitSubschema(schema, `${path}[${index}]`, depth, state);
  }
}

function visitSubschema(value: unknown, path: string, depth: number, state: ProfileState): void {
  if (typeof value === 'boolean') {
    return;
  }
  visitSchema(value, path, depth, state);
}

function visitReference(value: unknown, path: string, state: ProfileState): void {
  if (
    typeof value !== 'string' ||
    (value !== '#' && !value.startsWith('#/')) ||
    value.length > 500
  ) {
    throw new TypeError(`${path} must be a bounded local JSON Pointer reference.`);
  }
  state.references += 1;
  if (state.references > MAX_REFERENCES) {
    throw new RangeError(`Studio property schema exceeds ${MAX_REFERENCES} references.`);
  }
}

function visitJsonValue(value: unknown, path: string, depth: number, state: ProfileState): void {
  if (
    value === null ||
    typeof value === 'boolean' ||
    typeof value === 'string' ||
    (typeof value === 'number' && Number.isFinite(value))
  ) {
    return;
  }
  if (depth > MAX_JSON_DEPTH) {
    throw new RangeError(`${path} exceeds the Studio Schema Profile JSON depth limit.`);
  }
  if (Array.isArray(value)) {
    trackObject(value, path, state);
    assertDenseArray(value, path);
    if (value.length > MAX_JSON_ITEMS) {
      throw new RangeError(`${path} exceeds ${MAX_JSON_ITEMS} JSON items.`);
    }
    for (const [index, entry] of value.entries()) {
      visitJsonValue(entry, `${path}[${index}]`, depth + 1, state);
    }
    return;
  }
  if (isRecord(value)) {
    trackObject(value, path, state);
    const entries = Object.entries(value);
    if (entries.length > MAX_JSON_PROPERTIES) {
      throw new RangeError(`${path} exceeds ${MAX_JSON_PROPERTIES} JSON properties.`);
    }
    for (const [key, entry] of entries) {
      assertSafeObjectKey(key, path);
      visitJsonValue(entry, `${path}.${key}`, depth + 1, state);
    }
    return;
  }
  throw new TypeError(`${path} is not JSON-compatible.`);
}

function assertSafeObjectKey(key: string, path: string): void {
  if (
    key.length === 0 ||
    key.length > MAX_OBJECT_KEY_LENGTH ||
    key === '__proto__' ||
    key === 'constructor' ||
    key === 'prototype' ||
    containsControlCharacter(key)
  ) {
    throw new TypeError(`${path} contains forbidden object member name ${JSON.stringify(key)}.`);
  }
}

function assertNonRecursiveSchema(root: JsonSchema): void {
  interface TraversalFrame {
    entered: boolean;
    node: Record<string, unknown>;
  }

  const active = new WeakSet<object>();
  const finished = new WeakSet<object>();
  const stack: TraversalFrame[] = [{ entered: false, node: root }];

  while (stack.length > 0) {
    const frame = stack.pop();
    if (frame === undefined || finished.has(frame.node)) {
      continue;
    }
    if (frame.entered) {
      active.delete(frame.node);
      finished.add(frame.node);
      continue;
    }
    if (active.has(frame.node)) {
      throw new TypeError('Recursive contributed schemas are not admitted by the alpha profile.');
    }

    active.add(frame.node);
    stack.push({ entered: true, node: frame.node });
    const dependencies = schemaDependencies(frame.node, root);
    for (let index = dependencies.length - 1; index >= 0; index -= 1) {
      const dependency = dependencies[index];
      if (dependency === undefined || finished.has(dependency)) {
        continue;
      }
      if (active.has(dependency)) {
        throw new TypeError('Recursive contributed schemas are not admitted by the alpha profile.');
      }
      stack.push({ entered: false, node: dependency });
    }
  }
}

function schemaDependencies(
  schema: Record<string, unknown>,
  root: Record<string, unknown>,
): Record<string, unknown>[] {
  const dependencies: Record<string, unknown>[] = [];
  for (const keyword of [
    'additionalProperties',
    'else',
    'if',
    'items',
    'not',
    'propertyNames',
    'then',
  ]) {
    appendSchemaDependency(dependencies, schema[keyword]);
  }
  for (const keyword of ['allOf', 'anyOf', 'oneOf', 'prefixItems']) {
    const candidates = schema[keyword];
    if (Array.isArray(candidates)) {
      for (const candidate of candidates) {
        appendSchemaDependency(dependencies, candidate);
      }
    }
  }
  for (const keyword of ['$defs', 'properties']) {
    const schemaMap = schema[keyword];
    if (isRecord(schemaMap)) {
      for (const candidate of Object.values(schemaMap)) {
        appendSchemaDependency(dependencies, candidate);
      }
    }
  }
  if (typeof schema.$ref === 'string') {
    appendSchemaDependency(dependencies, resolveLocalReference(root, schema.$ref));
  }
  return dependencies;
}

function appendSchemaDependency(dependencies: Record<string, unknown>[], value: unknown): void {
  if (isRecord(value)) {
    dependencies.push(value);
  }
}

function resolveLocalReference(root: Record<string, unknown>, reference: string): unknown {
  if (reference === '#') {
    return root;
  }
  let current: unknown = root;
  for (const encodedToken of reference.slice(2).split('/')) {
    if (/(?:~[^01]|~$)/u.test(encodedToken)) {
      throw new TypeError(`Local schema reference ${reference} is not a valid JSON Pointer.`);
    }
    const token = encodedToken.replaceAll('~1', '/').replaceAll('~0', '~');
    if (!isRecord(current) && !Array.isArray(current)) {
      throw new TypeError(`Local schema reference ${reference} does not resolve to a schema.`);
    }
    if (!Object.hasOwn(current, token)) {
      throw new TypeError(`Local schema reference ${reference} does not resolve to a schema.`);
    }
    current = (current as Record<string, unknown>)[token];
  }
  if (typeof current !== 'boolean' && !isRecord(current)) {
    throw new TypeError(`Local schema reference ${reference} does not resolve to a schema.`);
  }
  return current;
}

function containsControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f) {
      return true;
    }
  }
  return false;
}

function assertDenseArray(value: unknown[], path: string): void {
  const keys = Object.keys(value);
  if (keys.length !== value.length || keys.some((key, index) => key !== String(index))) {
    throw new TypeError(`${path} must be a dense JSON array without extra properties.`);
  }
}

function trackObject(value: object, path: string, state: ProfileState): void {
  if (state.seen.has(value)) {
    throw new TypeError(`${path} reuses or cycles a JSON object.`);
  }
  state.seen.add(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x7f) {
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
