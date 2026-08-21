import type { JsonSchema, JsonValue } from '@kumwe/studio-protocol';
import { canonicalStringify } from './canonical.js';
import { compileProfileSchema, type SchemaValidationError } from './profile-validator.js';

const DRAFT_2020_12 = 'https://json-schema.org/draft/2020-12/schema';
const MAX_ALTERNATIVES = 64;
const MAX_DESCRIPTION_LENGTH = 10_000;
const MAX_ENUM_MEMBERS = 1_024;
const MAX_EXAMPLES = 100;
const MAX_JSON_DEPTH = 64;
const MAX_JSON_ITEMS = 10_000;
const MAX_JSON_PROPERTIES = 1_000;
const MAX_REFERENCES = 128;
const MAX_REFERENCE_LENGTH = 500;
const MAX_SCHEMA_BYTES = 262_144;
const MAX_SCHEMA_DEPTH = 32;
const MAX_SCHEMA_MAP_PROPERTIES = 512;
const MAX_SCHEMA_NODES = 1_024;
const MAX_OBJECT_KEY_LENGTH = 200;
const MAX_PROPERTY_NAMES = 512;
const MAX_TITLE_LENGTH = 1_000;

/** Published complexity limits, pinned to `$defs/limits` in the meta-schema. */
export const STUDIO_SCHEMA_PROFILE_LIMITS: Readonly<Record<string, number>> = Object.freeze({
  maxAlternatives: MAX_ALTERNATIVES,
  maxDescriptionLength: MAX_DESCRIPTION_LENGTH,
  maxEnumMembers: MAX_ENUM_MEMBERS,
  maxExamples: MAX_EXAMPLES,
  maxJsonDepth: MAX_JSON_DEPTH,
  maxJsonItems: MAX_JSON_ITEMS,
  maxJsonProperties: MAX_JSON_PROPERTIES,
  maxObjectKeyLength: MAX_OBJECT_KEY_LENGTH,
  maxPropertyNames: MAX_PROPERTY_NAMES,
  maxReferenceLength: MAX_REFERENCE_LENGTH,
  maxReferences: MAX_REFERENCES,
  maxSchemaBytes: MAX_SCHEMA_BYTES,
  maxSchemaDepth: MAX_SCHEMA_DEPTH,
  maxSchemaMapProperties: MAX_SCHEMA_MAP_PROPERTIES,
  maxSchemaNodes: MAX_SCHEMA_NODES,
  maxTitleLength: MAX_TITLE_LENGTH,
});

export type StudioSchemaProfileErrorCode =
  | 'invalid-root'
  | 'unsupported-keyword'
  | 'invalid-keyword-value'
  | 'unsafe-member'
  | 'limit-exceeded'
  | 'invalid-reference'
  | 'recursive-schema';

export const STUDIO_SCHEMA_PROFILE_ERROR_CODES: readonly StudioSchemaProfileErrorCode[] =
  Object.freeze([
    'invalid-root',
    'unsupported-keyword',
    'invalid-keyword-value',
    'unsafe-member',
    'limit-exceeded',
    'invalid-reference',
    'recursive-schema',
  ]);

/** A deterministic admission failure suitable for cross-runtime corpus comparison. */
export class StudioSchemaProfileError extends TypeError {
  public readonly code: StudioSchemaProfileErrorCode;
  /** JSON Pointer to the rejected schema location; the empty string is the root. */
  public readonly schemaPath: string;

  public constructor(
    code: StudioSchemaProfileErrorCode,
    schemaPath: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'StudioSchemaProfileError';
    this.code = code;
    this.schemaPath = schemaPath;
  }
}

/** Public, implementation-neutral shape returned by a compiled property schema. */
export interface StudioPropertySchemaValidator {
  readonly errors: SchemaValidationError[] | null;
  validate(instance: unknown): boolean;
}

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

const typeNames = new Set(['array', 'boolean', 'integer', 'null', 'number', 'object', 'string']);

class SchemaByteLimitError extends RangeError {}
class SchemaBytePreflightDeferred extends TypeError {}

interface ProfileState {
  references: number;
  schemaNodes: number;
  seen: WeakSet<object>;
}

/**
 * Admit and compile one contributed block property schema. The alpha profile
 * is deliberately object-rooted, closed, local-reference-only, non-recursive,
 * and format-free. The returned interpreter performs no code generation.
 */
export function compileStudioPropertySchema(schema: unknown): StudioPropertySchemaValidator {
  if (!isRecord(schema)) {
    reject('invalid-root', '', 'Studio property schema root must be a JSON Schema object.');
  }

  // Measure before sorting or recursively interpreting attacker-controlled
  // maps. Canonical member order does not affect encoded length, so this
  // bounded, iterative pass can fail oversized inputs without first
  // allocating the canonical document or doing O(n log n) work.
  try {
    assertCanonicalSchemaByteBudget(schema);
  } catch (error) {
    if (error instanceof SchemaByteLimitError) {
      reject(
        'limit-exceeded',
        '',
        `Studio property schema exceeds ${MAX_SCHEMA_BYTES} canonical UTF-8 bytes.`,
      );
    }
    if (error instanceof SchemaBytePreflightDeferred) {
      // Precise structural admission below owns diagnostics for JavaScript
      // values that cannot have come from decoded JSON (cycles, aliases,
      // sparse arrays, undefined, or exotic prototypes).
    } else {
      reject(
        'invalid-root',
        '',
        'Studio property schema must be a bounded canonical JSON document.',
        error,
      );
    }
  }

  const state: ProfileState = {
    references: 0,
    schemaNodes: 0,
    seen: new WeakSet<object>(),
  };
  const admissionFailures: StudioSchemaProfileError[] = [];
  captureAdmissionFailure(() => visitSchema(schema, '', 1, state), admissionFailures);
  captureAdmissionFailure(() => assertNonRecursiveSchema(schema), admissionFailures);
  captureAdmissionFailure(() => assertClosedObjectRoot(schema), admissionFailures);
  const admissionFailure = firstAdmissionFailure(schema, admissionFailures);
  if (admissionFailure !== undefined) {
    throw admissionFailure;
  }

  try {
    return compileProfileSchema(schema as JsonSchema);
  } catch (error) {
    // All public operand checks run above. Reaching this branch means the
    // interpreter found an inconsistency, so fail closed without exposing an
    // implementation-specific error taxonomy.
    reject(
      'invalid-keyword-value',
      '',
      'Studio property schema does not compile under the strict profile.',
      error,
    );
  }
}

/** Assert that a value is an admitted Studio property schema. */
export function assertStudioPropertySchema(schema: unknown): asserts schema is JsonSchema {
  compileStudioPropertySchema(schema);
}

function visitSchema(value: unknown, path: string, depth: number, state: ProfileState): void {
  if (!isRecord(value)) {
    reject('invalid-keyword-value', path, `${displayPath(path)} must be a JSON Schema object.`);
  }
  trackObject(value, path, state);
  trackSchemaNode(path, depth, state);

  for (const [keyword, operand] of boundedSchemaEntries(value)) {
    const keywordPath = appendPointer(path, keyword);
    assertSafeObjectKey(keyword, path);
    if (!allowedKeywords.has(keyword)) {
      reject(
        'unsupported-keyword',
        keywordPath,
        `${displayPath(keywordPath)} uses keyword ${JSON.stringify(keyword)}, which is not allowed by the Studio Schema Profile.`,
      );
    }

    switch (keyword) {
      case '$defs':
      case 'properties':
        visitSchemaMap(operand, keywordPath, depth + 1, state);
        break;
      case 'additionalProperties':
      case 'else':
      case 'if':
      case 'items':
      case 'not':
      case 'propertyNames':
      case 'then':
        visitSubschema(operand, keywordPath, depth + 1, state);
        break;
      case 'allOf':
      case 'anyOf':
      case 'oneOf':
      case 'prefixItems':
        visitSchemaArray(operand, keywordPath, depth + 1, state);
        break;
      case '$ref':
        visitReference(operand, keywordPath, state);
        break;
      case '$schema':
        if (operand !== DRAFT_2020_12) {
          reject(
            'invalid-keyword-value',
            keywordPath,
            `${displayPath(keywordPath)} must declare JSON Schema Draft 2020-12.`,
          );
        }
        break;
      case 'enum':
        visitEnum(operand, keywordPath, 1, state);
        break;
      case 'examples':
        visitExamples(operand, keywordPath, 1, state);
        break;
      case 'dependentRequired':
        visitDependentRequired(operand, keywordPath, state);
        break;
      case 'required':
        visitNameArray(operand, keywordPath, MAX_PROPERTY_NAMES, state);
        break;
      case 'type':
        visitType(operand, keywordPath, state);
        break;
      case 'description':
        visitBoundedString(operand, keywordPath, MAX_DESCRIPTION_LENGTH);
        break;
      case 'title':
        visitBoundedString(operand, keywordPath, MAX_TITLE_LENGTH);
        break;
      case 'maxItems':
      case 'maxLength':
      case 'maxProperties':
      case 'minItems':
      case 'minLength':
      case 'minProperties':
        visitNonNegativeInteger(operand, keywordPath);
        break;
      case 'exclusiveMaximum':
      case 'exclusiveMinimum':
      case 'maximum':
      case 'minimum':
        visitFiniteNumber(operand, keywordPath);
        break;
      case 'multipleOf':
        visitFiniteNumber(operand, keywordPath);
        if ((operand as number) <= 0) {
          reject(
            'invalid-keyword-value',
            keywordPath,
            `${displayPath(keywordPath)} must be greater than zero.`,
          );
        }
        break;
      case 'readOnly':
      case 'uniqueItems':
      case 'writeOnly':
        if (typeof operand !== 'boolean') {
          reject(
            'invalid-keyword-value',
            keywordPath,
            `${displayPath(keywordPath)} must be a boolean.`,
          );
        }
        break;
      case 'const':
      case 'default':
        visitJsonValue(operand, keywordPath, 1, state);
        break;
    }
  }
}

function visitSchemaMap(value: unknown, path: string, depth: number, state: ProfileState): void {
  if (!isRecord(value)) {
    reject('invalid-keyword-value', path, `${displayPath(path)} must be an object of schemas.`);
  }
  trackObject(value, path, state);
  const keys = Object.keys(value);
  if (keys.length > MAX_SCHEMA_MAP_PROPERTIES) {
    reject(
      'limit-exceeded',
      path,
      `${displayPath(path)} exceeds ${MAX_SCHEMA_MAP_PROPERTIES} schema entries.`,
    );
  }
  for (const name of keys.sort(compareCodeUnits)) {
    assertSafeObjectKey(name, path);
    visitSchema(value[name], appendPointer(path, name), depth, state);
  }
}

function visitSchemaArray(value: unknown, path: string, depth: number, state: ProfileState): void {
  if (!Array.isArray(value) || !isDenseArray(value)) {
    reject(
      'invalid-keyword-value',
      path,
      `${displayPath(path)} must be a dense JSON array of schemas.`,
    );
  }
  if (value.length === 0) {
    reject('invalid-keyword-value', path, `${displayPath(path)} must contain at least one schema.`);
  }
  if (value.length > MAX_ALTERNATIVES) {
    reject(
      'limit-exceeded',
      path,
      `${displayPath(path)} must contain at most ${MAX_ALTERNATIVES} schemas.`,
    );
  }
  trackObject(value, path, state);
  for (const [index, schema] of value.entries()) {
    visitSubschema(schema, appendPointer(path, String(index)), depth, state);
  }
}

function visitSubschema(value: unknown, path: string, depth: number, state: ProfileState): void {
  if (typeof value === 'boolean') {
    trackSchemaNode(path, depth, state);
    return;
  }
  visitSchema(value, path, depth, state);
}

function trackSchemaNode(path: string, depth: number, state: ProfileState): void {
  if (depth > MAX_SCHEMA_DEPTH) {
    reject(
      'limit-exceeded',
      path,
      `${displayPath(path)} exceeds the Studio Schema Profile depth limit.`,
    );
  }
  state.schemaNodes += 1;
  if (state.schemaNodes > MAX_SCHEMA_NODES) {
    reject(
      'limit-exceeded',
      path,
      `Studio property schema exceeds ${MAX_SCHEMA_NODES} schema nodes.`,
    );
  }
}

function visitReference(value: unknown, path: string, state: ProfileState): void {
  if (!isPortableLocalReference(value)) {
    reject(
      'invalid-reference',
      path,
      `${displayPath(path)} must be a bounded local JSON Pointer reference.`,
    );
  }
  state.references += 1;
  if (state.references > MAX_REFERENCES) {
    reject('limit-exceeded', path, `Studio property schema exceeds ${MAX_REFERENCES} references.`);
  }
}

function visitEnum(value: unknown, path: string, depth: number, state: ProfileState): void {
  if (!Array.isArray(value) || !isDenseArray(value)) {
    reject('invalid-keyword-value', path, `${displayPath(path)} must be a dense JSON array.`);
  }
  if (value.length === 0) {
    reject('invalid-keyword-value', path, `${displayPath(path)} must contain at least one value.`);
  }
  if (value.length > MAX_ENUM_MEMBERS) {
    reject('limit-exceeded', path, `${displayPath(path)} exceeds ${MAX_ENUM_MEMBERS} members.`);
  }
  trackObject(value, path, state);
  const members = new Set<string>();
  for (const [index, member] of value.entries()) {
    visitJsonValue(member, appendPointer(path, String(index)), depth, state);
    const canonical = canonicalStringify(member as JsonValue, {
      maximumDepth: MAX_JSON_DEPTH + 1,
    });
    if (members.has(canonical)) {
      reject(
        'invalid-keyword-value',
        appendPointer(path, String(index)),
        `${displayPath(path)} must contain unique JSON values.`,
      );
    }
    members.add(canonical);
  }
}

function visitExamples(value: unknown, path: string, depth: number, state: ProfileState): void {
  if (!Array.isArray(value) || !isDenseArray(value)) {
    reject('invalid-keyword-value', path, `${displayPath(path)} must be a dense JSON array.`);
  }
  if (value.length > MAX_EXAMPLES) {
    reject('limit-exceeded', path, `${displayPath(path)} exceeds ${MAX_EXAMPLES} examples.`);
  }
  trackObject(value, path, state);
  for (const [index, example] of value.entries()) {
    visitJsonValue(example, appendPointer(path, String(index)), depth, state);
  }
}

function visitDependentRequired(value: unknown, path: string, state: ProfileState): void {
  if (!isRecord(value)) {
    reject(
      'invalid-keyword-value',
      path,
      `${displayPath(path)} must be an object of property-name arrays.`,
    );
  }
  trackObject(value, path, state);
  const keys = Object.keys(value);
  if (keys.length > MAX_SCHEMA_MAP_PROPERTIES) {
    reject(
      'limit-exceeded',
      path,
      `${displayPath(path)} exceeds ${MAX_SCHEMA_MAP_PROPERTIES} dependency entries.`,
    );
  }
  for (const name of keys.sort(compareCodeUnits)) {
    assertSafeObjectKey(name, path);
    visitNameArray(value[name], appendPointer(path, name), MAX_PROPERTY_NAMES, state);
  }
}

function visitNameArray(value: unknown, path: string, maximum: number, state: ProfileState): void {
  if (!Array.isArray(value) || !isDenseArray(value)) {
    reject(
      'invalid-keyword-value',
      path,
      `${displayPath(path)} must be a dense array of property names.`,
    );
  }
  if (value.length > maximum) {
    reject('limit-exceeded', path, `${displayPath(path)} exceeds ${maximum} property names.`);
  }
  trackObject(value, path, state);
  const names = new Set<string>();
  for (const [index, name] of value.entries()) {
    if (typeof name !== 'string') {
      reject(
        'invalid-keyword-value',
        appendPointer(path, String(index)),
        `${displayPath(path)} must contain only property-name strings.`,
      );
    }
    assertSafeObjectKey(name, path, appendPointer(path, String(index)));
    if (names.has(name)) {
      reject(
        'invalid-keyword-value',
        appendPointer(path, String(index)),
        `${displayPath(path)} must list unique property names.`,
      );
    }
    names.add(name);
  }
}

function visitType(value: unknown, path: string, state: ProfileState): void {
  if (typeof value === 'string') {
    if (!typeNames.has(value)) {
      reject(
        'invalid-keyword-value',
        path,
        `${displayPath(path)} names an unknown JSON Schema type.`,
      );
    }
    return;
  }
  if (!Array.isArray(value) || !isDenseArray(value) || value.length === 0 || value.length > 7) {
    reject(
      'invalid-keyword-value',
      path,
      `${displayPath(path)} must be a type name or a non-empty array of at most seven names.`,
    );
  }
  trackObject(value, path, state);
  const names = new Set<string>();
  for (const [index, name] of value.entries()) {
    if (typeof name !== 'string' || !typeNames.has(name) || names.has(name)) {
      reject(
        'invalid-keyword-value',
        appendPointer(path, String(index)),
        `${displayPath(path)} must list unique, known JSON Schema type names.`,
      );
    }
    names.add(name);
  }
}

function visitBoundedString(value: unknown, path: string, maximum: number): void {
  if (typeof value !== 'string') {
    reject('invalid-keyword-value', path, `${displayPath(path)} must be a string.`);
  }
  if (codePointLength(value) > maximum) {
    reject('limit-exceeded', path, `${displayPath(path)} exceeds ${maximum} characters.`);
  }
}

function visitNonNegativeInteger(value: unknown, path: string): void {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    reject('invalid-keyword-value', path, `${displayPath(path)} must be a non-negative integer.`);
  }
}

function visitFiniteNumber(value: unknown, path: string): void {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    reject('invalid-keyword-value', path, `${displayPath(path)} must be a finite number.`);
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
    reject(
      'limit-exceeded',
      path,
      `${displayPath(path)} exceeds the Studio Schema Profile JSON depth limit.`,
    );
  }
  if (Array.isArray(value)) {
    if (!isDenseArray(value)) {
      reject('invalid-keyword-value', path, `${displayPath(path)} must be a dense JSON array.`);
    }
    trackObject(value, path, state);
    if (value.length > MAX_JSON_ITEMS) {
      reject('limit-exceeded', path, `${displayPath(path)} exceeds ${MAX_JSON_ITEMS} JSON items.`);
    }
    for (const [index, entry] of value.entries()) {
      visitJsonValue(entry, appendPointer(path, String(index)), depth + 1, state);
    }
    return;
  }
  if (isRecord(value)) {
    trackObject(value, path, state);
    const keys = Object.keys(value);
    if (keys.length > MAX_JSON_PROPERTIES) {
      reject(
        'limit-exceeded',
        path,
        `${displayPath(path)} exceeds ${MAX_JSON_PROPERTIES} JSON properties.`,
      );
    }
    for (const key of keys.sort(compareCodeUnits)) {
      assertSafeObjectKey(key, path);
      visitJsonValue(value[key], appendPointer(path, key), depth + 1, state);
    }
    return;
  }
  reject('invalid-keyword-value', path, `${displayPath(path)} is not JSON-compatible.`);
}

function assertClosedObjectRoot(schema: Record<string, unknown>): void {
  // Root invariants follow the same UTF-16 member precedence as the general
  // admission walk: additionalProperties sorts before type.
  if (schema.additionalProperties !== false) {
    reject(
      'invalid-root',
      '/additionalProperties',
      'Studio property schema root must declare additionalProperties: false.',
    );
  }
  if (schema.type !== 'object') {
    reject(
      'invalid-root',
      '/type',
      'Studio property schema root must declare exactly type "object".',
    );
  }
}

function captureAdmissionFailure(action: () => void, failures: StudioSchemaProfileError[]): void {
  try {
    action();
  } catch (error) {
    if (error instanceof StudioSchemaProfileError) {
      failures.push(error);
      return;
    }
    throw error;
  }
}

function firstAdmissionFailure(
  root: Record<string, unknown>,
  failures: readonly StudioSchemaProfileError[],
): StudioSchemaProfileError | undefined {
  let first: StudioSchemaProfileError | undefined;
  for (const failure of failures) {
    if (
      first === undefined ||
      compareAdmissionPaths(root, failure.schemaPath, first.schemaPath) < 0
    ) {
      first = failure;
    }
  }
  return first;
}

/**
 * Compare two diagnostic locations in the same order the admission grammar
 * visits them: object members by UTF-16 code unit, array members by numeric
 * index, and a container before any descendant. Missing root invariants are
 * virtual object members, so they participate without a special-case pass
 * precedence.
 */
function compareAdmissionPaths(root: Record<string, unknown>, left: string, right: string): number {
  const leftTokens = pointerTokens(left);
  const rightTokens = pointerTokens(right);
  let parent: unknown = root;
  const sharedLength = Math.min(leftTokens.length, rightTokens.length);
  for (let index = 0; index < sharedLength; index += 1) {
    const leftToken = leftTokens[index];
    const rightToken = rightTokens[index];
    if (leftToken === undefined || rightToken === undefined) {
      break;
    }
    if (leftToken !== rightToken) {
      if (Array.isArray(parent)) {
        const leftIndex = Number(leftToken);
        const rightIndex = Number(rightToken);
        if (Number.isSafeInteger(leftIndex) && Number.isSafeInteger(rightIndex)) {
          return leftIndex - rightIndex;
        }
      }
      return compareCodeUnits(leftToken, rightToken);
    }
    if ((isRecord(parent) || Array.isArray(parent)) && Object.hasOwn(parent, leftToken)) {
      parent = (parent as Record<string, unknown>)[leftToken];
    } else {
      parent = undefined;
    }
  }
  return leftTokens.length - rightTokens.length;
}

function pointerTokens(pointer: string): string[] {
  if (pointer === '') {
    return [];
  }
  return pointer
    .slice(1)
    .split('/')
    .map((token) => token.replaceAll('~1', '/').replaceAll('~0', '~'));
}

function assertSafeObjectKey(
  key: string,
  path: string,
  rejectionPath = appendPointer(path, key),
): void {
  if (codePointLength(key) > MAX_OBJECT_KEY_LENGTH) {
    reject(
      'limit-exceeded',
      rejectionPath,
      `${displayPath(path)} contains an object member name longer than ${MAX_OBJECT_KEY_LENGTH} characters.`,
    );
  }
  if (
    key.length === 0 ||
    key === '__proto__' ||
    key === 'constructor' ||
    key === 'prototype' ||
    containsControlCharacter(key)
  ) {
    reject(
      'unsafe-member',
      rejectionPath,
      `${displayPath(path)} contains forbidden object member name ${JSON.stringify(key)}.`,
    );
  }
}

function assertNonRecursiveSchema(root: Record<string, unknown>): void {
  interface GraphPath {
    parent: GraphPath | undefined;
    token: string;
  }
  interface SchemaFrame {
    depth: number;
    diagnosticsEligible: boolean;
    node: Record<string, unknown>;
    path: GraphPath | undefined;
  }
  interface ReferenceSite {
    path: string;
    source: number;
    target: number;
  }

  const failures: StudioSchemaProfileError[] = [];
  const indexes = new Map<Record<string, unknown>, number>();
  const adjacency: number[][] = [];
  const reverseAdjacency: number[][] = [];
  const referenceSites: ReferenceSite[] = [];
  const expanded = new WeakSet<object>();
  let eligibleReferences = 0;
  const appendGraphPath = (parent: GraphPath | undefined, token: string): GraphPath => ({
    parent,
    token,
  });
  const graphPathPointer = (path: GraphPath): string => {
    const tokens: string[] = [];
    let current: GraphPath | undefined = path;
    while (current !== undefined) {
      tokens.push(current.token);
      current = current.parent;
    }
    let pointer = '';
    for (let index = tokens.length - 1; index >= 0; index -= 1) {
      const token = tokens[index];
      if (token !== undefined) {
        pointer = appendPointer(pointer, token);
      }
    }
    return pointer;
  };
  const ensureNode = (node: Record<string, unknown>): number => {
    const existing = indexes.get(node);
    if (existing !== undefined) {
      return existing;
    }
    const index = adjacency.length;
    indexes.set(node, index);
    adjacency.push([]);
    reverseAdjacency.push([]);
    return index;
  };
  const connect = (source: number, target: number): void => {
    adjacency[source]?.push(target);
    reverseAdjacency[target]?.push(source);
  };
  ensureNode(root);
  const stack: SchemaFrame[] = [
    { depth: 1, diagnosticsEligible: true, node: root, path: undefined },
  ];

  while (stack.length > 0) {
    const frame = stack.pop();
    if (frame === undefined || expanded.has(frame.node)) {
      continue;
    }
    expanded.add(frame.node);
    const source = ensureNode(frame.node);
    const children: SchemaFrame[] = [];
    const addChild = (
      value: unknown,
      path: GraphPath,
      diagnosticsEligible = frame.diagnosticsEligible,
    ): void => {
      if (!isRecord(value)) {
        return;
      }
      const target = ensureNode(value);
      connect(source, target);
      const depth = frame.depth + 1;
      children.push({
        depth,
        diagnosticsEligible: diagnosticsEligible && depth <= MAX_SCHEMA_DEPTH,
        node: value,
        path,
      });
    };

    for (const [keyword, operand] of boundedSchemaEntries(frame.node)) {
      const keywordPath = appendGraphPath(frame.path, keyword);
      switch (keyword) {
        case '$defs':
        case 'properties':
          if (isRecord(operand)) {
            const names = Object.keys(operand);
            const childrenEligible = names.length <= MAX_SCHEMA_MAP_PROPERTIES;
            if (childrenEligible) {
              names.sort(compareCodeUnits);
            }
            for (const name of names) {
              addChild(
                operand[name],
                appendGraphPath(keywordPath, name),
                frame.diagnosticsEligible && childrenEligible,
              );
            }
          }
          break;
        case '$ref':
          if (isPortableLocalReference(operand)) {
            const reportsDiagnostic =
              frame.diagnosticsEligible && (eligibleReferences += 1) <= MAX_REFERENCES;
            const referencePath = reportsDiagnostic ? graphPathPointer(keywordPath) : '';
            try {
              const target = resolveLocalReference(root, operand, referencePath);
              if (!target.schemaPosition) {
                if (reportsDiagnostic) {
                  failures.push(
                    new StudioSchemaProfileError(
                      'invalid-reference',
                      referencePath,
                      `Local schema reference ${operand} does not resolve to a schema position.`,
                    ),
                  );
                }
              } else if (isRecord(target.value)) {
                const targetIndex = ensureNode(target.value);
                connect(source, targetIndex);
                if (reportsDiagnostic) {
                  referenceSites.push({ path: referencePath, source, target: targetIndex });
                }
              }
            } catch (error) {
              if (error instanceof StudioSchemaProfileError) {
                if (reportsDiagnostic) {
                  failures.push(error);
                }
              } else {
                throw error;
              }
            }
          }
          break;
        case 'additionalProperties':
        case 'else':
        case 'if':
        case 'items':
        case 'not':
        case 'propertyNames':
        case 'then':
          addChild(operand, keywordPath);
          break;
        case 'allOf':
        case 'anyOf':
        case 'oneOf':
        case 'prefixItems':
          if (Array.isArray(operand)) {
            const childrenEligible =
              operand.length > 0 && operand.length <= MAX_ALTERNATIVES && isDenseArray(operand);
            for (let index = 0; index < operand.length; index += 1) {
              if (Object.hasOwn(operand, index)) {
                addChild(
                  operand[index],
                  appendGraphPath(keywordPath, String(index)),
                  frame.diagnosticsEligible && childrenEligible,
                );
              }
            }
          }
          break;
      }
    }
    for (let index = children.length - 1; index >= 0; index -= 1) {
      const child = children[index];
      if (child !== undefined) {
        stack.push(child);
      }
    }
  }

  const components = stronglyConnectedComponents(adjacency, reverseAdjacency);
  for (const site of referenceSites) {
    if (components[site.source] === components[site.target]) {
      failures.push(
        new StudioSchemaProfileError(
          'recursive-schema',
          site.path,
          'Recursive contributed schemas are not admitted by the alpha profile.',
        ),
      );
    }
  }

  const failure = firstAdmissionFailure(root, failures);
  if (failure !== undefined) {
    throw failure;
  }
}

function stronglyConnectedComponents(
  adjacency: readonly (readonly number[])[],
  reverseAdjacency: readonly (readonly number[])[],
): Int32Array {
  interface FinishFrame {
    edge: number;
    node: number;
  }

  const visited = new Uint8Array(adjacency.length);
  const finishOrder: number[] = [];
  for (let start = 0; start < adjacency.length; start += 1) {
    if (visited[start] !== 0) {
      continue;
    }
    visited[start] = 1;
    const stack: FinishFrame[] = [{ edge: 0, node: start }];
    while (stack.length > 0) {
      const frame = stack[stack.length - 1];
      if (frame === undefined) {
        break;
      }
      const edges = adjacency[frame.node] ?? [];
      const target = edges[frame.edge];
      if (target !== undefined) {
        frame.edge += 1;
        if (visited[target] === 0) {
          visited[target] = 1;
          stack.push({ edge: 0, node: target });
        }
      } else {
        finishOrder.push(frame.node);
        stack.pop();
      }
    }
  }

  const components = new Int32Array(adjacency.length);
  components.fill(-1);
  let component = 0;
  for (let order = finishOrder.length - 1; order >= 0; order -= 1) {
    const start = finishOrder[order];
    if (start === undefined || components[start] !== -1) {
      continue;
    }
    components[start] = component;
    const stack = [start];
    while (stack.length > 0) {
      const node = stack.pop();
      if (node === undefined) {
        continue;
      }
      for (const source of reverseAdjacency[node] ?? []) {
        if (components[source] === -1) {
          components[source] = component;
          stack.push(source);
        }
      }
    }
    component += 1;
  }
  return components;
}

function resolveLocalReference(
  root: Record<string, unknown>,
  reference: string,
  path: string,
): { schemaPosition: boolean; value: unknown } {
  type ReferencePosition = 'other' | 'schema' | 'schema-array' | 'schema-map';

  if (reference === '#') {
    return { schemaPosition: true, value: root };
  }
  let current: unknown = root;
  let position: ReferencePosition = 'schema';
  for (const encodedToken of reference.slice(2).split('/')) {
    const token = encodedToken.replaceAll('~1', '/').replaceAll('~0', '~');
    let nextPosition: ReferencePosition = 'other';
    if (position === 'schema' && isRecord(current)) {
      switch (token) {
        case '$defs':
        case 'properties':
          nextPosition = 'schema-map';
          break;
        case 'additionalProperties':
        case 'else':
        case 'if':
        case 'items':
        case 'not':
        case 'propertyNames':
        case 'then':
          nextPosition = 'schema';
          break;
        case 'allOf':
        case 'anyOf':
        case 'oneOf':
        case 'prefixItems':
          nextPosition = 'schema-array';
          break;
      }
    } else if (position === 'schema-map' && isRecord(current)) {
      nextPosition = 'schema';
    } else if (position === 'schema-array' && Array.isArray(current)) {
      nextPosition = 'schema';
    }
    if (!isRecord(current) && !Array.isArray(current)) {
      reject(
        'invalid-reference',
        path,
        `Local schema reference ${reference} does not resolve to a schema.`,
      );
    }
    if (!Object.hasOwn(current, token)) {
      reject(
        'invalid-reference',
        path,
        `Local schema reference ${reference} does not resolve to a schema.`,
      );
    }
    current = (current as Record<string, unknown>)[token];
    position = nextPosition;
  }
  if (typeof current !== 'boolean' && !isRecord(current)) {
    reject(
      'invalid-reference',
      path,
      `Local schema reference ${reference} does not resolve to a schema.`,
    );
  }
  return { schemaPosition: position === 'schema', value: current };
}

function reject(
  code: StudioSchemaProfileErrorCode,
  schemaPath: string,
  message: string,
  cause?: unknown,
): never {
  throw new StudioSchemaProfileError(
    code,
    schemaPath,
    message,
    cause === undefined ? undefined : { cause },
  );
}

function appendPointer(pointer: string, token: string): string {
  return `${pointer}/${token.replaceAll('~', '~0').replaceAll('/', '~1')}`;
}

function displayPath(path: string): string {
  return path === '' ? 'schema root' : path;
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

function isPortableLocalReference(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    codePointLength(value) <= MAX_REFERENCE_LENGTH &&
    !containsControlCharacter(value) &&
    /^#(?:\/(?:[A-Za-z0-9._!$&'()*+,;=:@-]|~[01])*)*$/u.test(value)
  );
}

function codePointLength(value: string): number {
  let length = 0;
  for (let index = 0; index < value.length; index += 1) {
    length += 1;
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length) {
      const next = value.charCodeAt(index + 1);
      if ((next & 0xfc00) === 0xdc00) {
        index += 1;
      }
    }
  }
  return length;
}

/**
 * Enforce the canonical byte ceiling without materialising or sorting the
 * canonical document. Object order cannot change encoded length. This pass
 * is iterative so an over-deep untrusted value cannot exhaust the JavaScript
 * call stack before the published schema/JSON depth checks run.
 */
function assertCanonicalSchemaByteBudget(root: Record<string, unknown>): void {
  const stack: unknown[] = [root];
  const seen = new WeakSet<object>();
  let bytes = 0;
  const consume = (amount: number): void => {
    bytes += amount;
    if (bytes > MAX_SCHEMA_BYTES) {
      throw new SchemaByteLimitError();
    }
  };

  while (stack.length > 0) {
    const value = stack.pop();
    if (value === null) {
      consume(4);
      continue;
    }
    switch (typeof value) {
      case 'boolean':
        consume(value ? 4 : 5);
        continue;
      case 'number': {
        if (!Number.isFinite(value)) {
          throw new SchemaBytePreflightDeferred();
        }
        const encoded = JSON.stringify(Object.is(value, -0) ? 0 : value);
        consume(encoded.length);
        continue;
      }
      case 'string':
        consumeCanonicalJsonString(value, consume);
        continue;
      case 'object':
        break;
      default:
        throw new SchemaBytePreflightDeferred();
    }

    if (seen.has(value)) {
      throw new SchemaBytePreflightDeferred();
    }
    seen.add(value);

    if (Array.isArray(value)) {
      const members = value as unknown[];
      // Length alone accounts for brackets and separators. Reject an
      // obviously oversized array before Object.keys allocates an entry for
      // every member while checking density.
      consume(2 + Math.max(0, members.length - 1));
      if (!isDenseArray(members)) {
        throw new SchemaBytePreflightDeferred();
      }
      for (let index = members.length - 1; index >= 0; index -= 1) {
        const member = members[index];
        if (member === undefined) {
          throw new SchemaBytePreflightDeferred();
        }
        stack.push(member);
      }
      continue;
    }

    if (!isRecord(value)) {
      throw new SchemaBytePreflightDeferred();
    }
    const keys = Object.keys(value);
    consume(2 + Math.max(0, keys.length - 1));
    for (let index = keys.length - 1; index >= 0; index -= 1) {
      const key = keys[index];
      if (key === undefined) {
        continue;
      }
      const member = value[key];
      if (member === undefined) {
        throw new SchemaBytePreflightDeferred();
      }
      consumeCanonicalJsonString(key, consume);
      consume(1);
      stack.push(member);
    }
  }
}

function consumeCanonicalJsonString(value: string, consume: (amount: number) => void): void {
  consume(2); // opening and closing quotes
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (
      code === 0x22 ||
      code === 0x5c ||
      code === 0x08 ||
      code === 0x09 ||
      code === 0x0a ||
      code === 0x0c ||
      code === 0x0d
    ) {
      consume(2);
    } else if (code <= 0x1f) {
      consume(6);
    } else if (code <= 0x7f) {
      consume(1);
    } else if (code <= 0x7ff) {
      consume(2);
    } else if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (index + 1 < value.length && (next & 0xfc00) === 0xdc00) {
        consume(4);
        index += 1;
      } else {
        consume(6);
      }
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      consume(6);
    } else {
      consume(3);
    }
  }
}

/**
 * Sort at most the closed keyword set plus the first invalid member. This
 * preserves deterministic first-error precedence without sorting an
 * arbitrarily large attacker-controlled schema object.
 */
function boundedSchemaEntries(value: Record<string, unknown>): [string, unknown][] {
  const keys = Object.keys(value);
  if (keys.length <= allowedKeywords.size) {
    return keys.sort(compareCodeUnits).map((key) => [key, value[key]] as [string, unknown]);
  }

  const candidates: string[] = [];
  let firstInvalid: string | undefined;
  for (const key of keys) {
    if (allowedKeywords.has(key)) {
      candidates.push(key);
    } else if (firstInvalid === undefined || compareCodeUnits(key, firstInvalid) < 0) {
      firstInvalid = key;
    }
  }
  if (firstInvalid !== undefined) {
    candidates.push(firstInvalid);
  }
  return candidates.sort(compareCodeUnits).map((key) => [key, value[key]] as [string, unknown]);
}

function isDenseArray(value: unknown[]): boolean {
  const keys = Object.keys(value);
  return keys.length === value.length && keys.every((key, index) => key === String(index));
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function trackObject(value: object, path: string, state: ProfileState): void {
  if (state.seen.has(value)) {
    reject('invalid-root', path, `${displayPath(path)} reuses or cycles a JSON object.`);
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
