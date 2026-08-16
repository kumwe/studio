import type { JsonSchema } from '@kumwe/studio-protocol';

/**
 * An eval-free interpreting validator for the Studio Schema Profile.
 *
 * The Studio Schema Profile (docs/contracts/schema-profile.md,
 * schemas/schema-profile.schema.json) deliberately bounds schemas to a closed
 * keyword allowlist with complexity limits, which makes the profile small
 * enough to interpret directly. This module walks the raw schema document at
 * validation time instead of generating JavaScript, so validation runs under
 * a Content-Security-Policy that forbids string-to-code compilation
 * (`script-src 'self'` without `unsafe-eval`) and under Trusted Types.
 *
 * Supported keywords are exactly the profile's closed set — types, `enum`,
 * `const`, `required`/`properties`/`additionalProperties`/`propertyNames`/
 * `dependentRequired`, `items`/`prefixItems` and array bounds, string and
 * number bounds, `allOf`/`anyOf`/`oneOf`/`not`/`if`/`then`/`else`,
 * within-registry `$defs`/`$ref`, and the profile's annotations — plus two
 * canonical-schema affordances the profile contract reserves for reviewed
 * Studio schemas: `pattern` (see the ReDoS bound below) and a document-root
 * `$id` so canonical documents can reference each other through the
 * in-memory registry. Formats are not interpreted: the profile publishes no
 * runtime `format` assertions, so the keyword is rejected at compile time
 * exactly like every other keyword outside the allowlist.
 *
 * ReDoS bound: contributed schemas cannot carry `pattern` at all — the
 * profile prohibits the keyword and `assertStudioPropertySchema` rejects it
 * before this module ever sees a contributed document. Every regular
 * expression interpreted here therefore comes from a reviewed lexical
 * pattern in a canonical Studio schema. As defence in depth the compiler
 * still enforces the profile's 500-character bound on lexical source text
 * (the same bound the meta-schema places on `$ref`) and the profile's
 * instance limits bound every string a pattern can be asked to match.
 *
 * The interpreter is pure and deterministic: no DOM, no Node APIs, no
 * `Function` constructor, no shared mutable state beyond the per-validator
 * error buffer that mirrors the previous compiled-validator shape.
 */

const DRAFT_2020_12 = 'https://json-schema.org/draft/2020-12/schema';
const MAX_PATTERN_SOURCE_LENGTH = 500;
const MAX_REFERENCE_LENGTH = 500;

const TYPE_NAMES = new Set(['array', 'boolean', 'integer', 'null', 'number', 'object', 'string']);

const SUPPORTED_KEYWORDS = new Set([
  '$defs',
  '$id',
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
  'pattern',
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

/** One validation failure, in the shape core diagnostics consume. */
export interface SchemaValidationError {
  /** JSON Pointer to the failing instance location (`''` is the root). */
  instancePath: string;
  /** The schema keyword that failed. */
  keyword: string;
  /** A human-readable default message. */
  message: string;
}

export interface CompileSchemaOptions {
  /**
   * Additional schema documents addressable through their root `$id` for
   * cross-document `$ref` targets. This is the in-memory registry the
   * profile contract describes; runtime network retrieval never happens.
   */
  schemas?: readonly JsonSchema[];
}

type SchemaNode = Record<string, unknown>;
type Subschema = SchemaNode | boolean;

interface SchemaDocument {
  baseUri: string | undefined;
  root: SchemaNode;
  /** Escaped JSON Pointers of every position that holds a schema. */
  schemaPointers: Set<string>;
}

interface ReferenceSite {
  document: SchemaDocument;
  node: SchemaNode;
  pointer: string;
  reference: string;
}

interface CompiledProgram {
  patterns: WeakMap<SchemaNode, RegExp>;
  references: WeakMap<SchemaNode, Subschema>;
  root: SchemaNode;
}

/**
 * A compiled (pre-walked, pre-resolved) profile schema. `validate` mirrors
 * the verdict-plus-`errors` shape of the code-generating validator it
 * replaces: `errors` is `null` after a passing run and carries the failures
 * of the most recent failing run otherwise.
 */
export class CompiledSchemaValidator {
  public errors: SchemaValidationError[] | null = null;
  readonly #program: CompiledProgram;

  public constructor(program: CompiledProgram) {
    this.#program = program;
  }

  public validate(instance: unknown): boolean {
    const errors: SchemaValidationError[] = [];
    validateSubschema(this.#program.root, instance, '', errors, this.#program, new Set());
    this.errors = errors.length > 0 ? errors : null;
    return errors.length === 0;
  }
}

/**
 * Compiles a schema for interpretation: validates every keyword against the
 * profile's closed allowlist and operand grammar, compiles bounded lexical
 * patterns, and resolves every `$ref` against the in-memory registry. All
 * structural errors surface here, at compile time, so validation itself is
 * total. Throws `TypeError`/`RangeError` on any schema outside the profile.
 */
export function compileProfileSchema(
  schema: JsonSchema,
  options: CompileSchemaOptions = {},
): CompiledSchemaValidator {
  if (!isSchemaNode(schema)) {
    throw new TypeError('Schema root must be a plain JSON Schema object.');
  }

  const documents: SchemaDocument[] = [];
  const documentsByUri = new Map<string, SchemaDocument>();
  const registerDocument = (root: SchemaNode, requireId: boolean): SchemaDocument => {
    const baseUri = root.$id;
    if (baseUri !== undefined && typeof baseUri !== 'string') {
      throw new TypeError('Schema $id must be a string.');
    }
    if (requireId && baseUri === undefined) {
      throw new TypeError('Registry schema documents must declare a root $id.');
    }
    const document: SchemaDocument = { baseUri, root, schemaPointers: new Set() };
    if (baseUri !== undefined) {
      if (documentsByUri.has(baseUri)) {
        throw new TypeError(`Schema registry declares ${baseUri} more than once.`);
      }
      documentsByUri.set(baseUri, document);
    }
    documents.push(document);
    return document;
  };

  registerDocument(schema, false);
  for (const registered of options.schemas ?? []) {
    if (!isSchemaNode(registered)) {
      throw new TypeError('Registry schema documents must be plain JSON Schema objects.');
    }
    registerDocument(registered, true);
  }

  const patterns = new WeakMap<SchemaNode, RegExp>();
  const references = new WeakMap<SchemaNode, Subschema>();
  const sites: ReferenceSite[] = [];
  for (const document of documents) {
    walkDocument(document, patterns, sites);
  }
  for (const site of sites) {
    references.set(site.node, resolveReferenceSite(site, documentsByUri));
  }

  return new CompiledSchemaValidator({ patterns, references, root: schema });
}

// ---------------------------------------------------------------------------
// Compilation: keyword allowlist, operand grammar, patterns, references.
// ---------------------------------------------------------------------------

function walkDocument(
  document: SchemaDocument,
  patterns: WeakMap<SchemaNode, RegExp>,
  sites: ReferenceSite[],
): void {
  const seen = new WeakSet<object>();

  const walkSchema = (value: unknown, pointer: string): void => {
    const location = describeLocation(document, pointer);
    if (!isSchemaNode(value)) {
      throw new TypeError(`${location} must be a plain JSON Schema object.`);
    }
    if (seen.has(value)) {
      throw new TypeError(`${location} reuses or cycles a schema object.`);
    }
    seen.add(value);
    document.schemaPointers.add(pointer);

    for (const [keyword, operand] of Object.entries(value)) {
      const keywordLocation = describeLocation(document, appendPointer(pointer, keyword));
      if (!SUPPORTED_KEYWORDS.has(keyword)) {
        throw new TypeError(
          `${keywordLocation} uses keyword ${JSON.stringify(keyword)}, which the Studio schema interpreter does not support.`,
        );
      }
      switch (keyword) {
        case '$id':
          if (pointer !== '') {
            throw new TypeError(`${keywordLocation} may only appear at the document root.`);
          }
          break;
        case '$schema':
          if (operand !== DRAFT_2020_12) {
            throw new TypeError(`${keywordLocation} must declare JSON Schema Draft 2020-12.`);
          }
          break;
        case '$ref':
          if (typeof operand !== 'string' || operand.length > MAX_REFERENCE_LENGTH) {
            throw new TypeError(
              `${keywordLocation} must be a string of at most ${MAX_REFERENCE_LENGTH} characters.`,
            );
          }
          sites.push({ document, node: value, pointer, reference: operand });
          break;
        case '$defs':
        case 'properties':
          walkSchemaMap(operand, appendPointer(pointer, keyword));
          break;
        case 'additionalProperties':
        case 'else':
        case 'if':
        case 'items':
        case 'not':
        case 'propertyNames':
        case 'then':
          walkSubschema(operand, appendPointer(pointer, keyword));
          break;
        case 'allOf':
        case 'anyOf':
        case 'oneOf':
        case 'prefixItems':
          walkSchemaArray(operand, appendPointer(pointer, keyword));
          break;
        case 'type':
          assertTypeOperand(operand, keywordLocation);
          break;
        case 'enum':
        case 'examples':
          if (!isDenseArray(operand)) {
            throw new TypeError(`${keywordLocation} must be a dense JSON array.`);
          }
          break;
        case 'const':
        case 'default':
          break;
        case 'required':
          assertNameArray(operand, keywordLocation);
          break;
        case 'dependentRequired':
          if (!isSchemaNode(operand)) {
            throw new TypeError(`${keywordLocation} must be an object of property-name arrays.`);
          }
          for (const [name, dependents] of Object.entries(operand)) {
            assertNameArray(dependents, `${keywordLocation}.${name}`);
          }
          break;
        case 'maxItems':
        case 'maxLength':
        case 'maxProperties':
        case 'minItems':
        case 'minLength':
        case 'minProperties':
          if (typeof operand !== 'number' || !Number.isInteger(operand) || operand < 0) {
            throw new TypeError(`${keywordLocation} must be a non-negative integer.`);
          }
          break;
        case 'exclusiveMaximum':
        case 'exclusiveMinimum':
        case 'maximum':
        case 'minimum':
          if (typeof operand !== 'number' || !Number.isFinite(operand)) {
            throw new TypeError(`${keywordLocation} must be a finite number.`);
          }
          break;
        case 'multipleOf':
          if (typeof operand !== 'number' || !Number.isFinite(operand) || operand <= 0) {
            throw new TypeError(`${keywordLocation} must be a finite number greater than zero.`);
          }
          break;
        case 'pattern':
          patterns.set(value, compilePattern(operand, keywordLocation));
          break;
        case 'readOnly':
        case 'uniqueItems':
        case 'writeOnly':
          if (typeof operand !== 'boolean') {
            throw new TypeError(`${keywordLocation} must be a boolean.`);
          }
          break;
        case 'description':
        case 'title':
          if (typeof operand !== 'string') {
            throw new TypeError(`${keywordLocation} must be a string.`);
          }
          break;
        default:
          throw new TypeError(`${keywordLocation} is not interpretable.`);
      }
    }
  };

  const walkSubschema = (value: unknown, pointer: string): void => {
    if (typeof value === 'boolean') {
      document.schemaPointers.add(pointer);
      return;
    }
    walkSchema(value, pointer);
  };

  const walkSchemaMap = (value: unknown, pointer: string): void => {
    if (!isSchemaNode(value)) {
      throw new TypeError(`${describeLocation(document, pointer)} must be an object of schemas.`);
    }
    for (const [name, member] of Object.entries(value)) {
      walkSubschema(member, appendPointer(pointer, name));
    }
  };

  const walkSchemaArray = (value: unknown, pointer: string): void => {
    if (!isDenseArray(value) || value.length === 0) {
      throw new TypeError(
        `${describeLocation(document, pointer)} must be a dense, non-empty array of schemas.`,
      );
    }
    for (const [index, member] of value.entries()) {
      walkSubschema(member, appendPointer(pointer, String(index)));
    }
  };

  walkSchema(document.root, '');
}

function compilePattern(operand: unknown, location: string): RegExp {
  if (typeof operand !== 'string' || operand.length > MAX_PATTERN_SOURCE_LENGTH) {
    throw new TypeError(
      `${location} must be a lexical pattern of at most ${MAX_PATTERN_SOURCE_LENGTH} characters.`,
    );
  }
  try {
    return new RegExp(operand, 'u');
  } catch (error) {
    throw new TypeError(`${location} is not a valid Unicode regular expression.`, {
      cause: error,
    });
  }
}

function assertTypeOperand(operand: unknown, location: string): void {
  if (typeof operand === 'string') {
    if (!TYPE_NAMES.has(operand)) {
      throw new TypeError(`${location} names an unknown JSON Schema type.`);
    }
    return;
  }
  if (!isDenseArray(operand) || operand.length === 0) {
    throw new TypeError(`${location} must be a type name or a dense, non-empty array of them.`);
  }
  const names = new Set<string>();
  for (const member of operand) {
    if (typeof member !== 'string' || !TYPE_NAMES.has(member) || names.has(member)) {
      throw new TypeError(`${location} must list unique, known JSON Schema type names.`);
    }
    names.add(member);
  }
}

function assertNameArray(operand: unknown, location: string): void {
  if (!isDenseArray(operand)) {
    throw new TypeError(`${location} must be a dense array of property names.`);
  }
  const names = new Set<string>();
  for (const member of operand) {
    if (typeof member !== 'string' || names.has(member)) {
      throw new TypeError(`${location} must list unique property-name strings.`);
    }
    names.add(member);
  }
}

function resolveReferenceSite(
  site: ReferenceSite,
  documentsByUri: ReadonlyMap<string, SchemaDocument>,
): Subschema {
  const location = `${describeLocation(site.document, site.pointer)}/$ref`;
  const hashIndex = site.reference.indexOf('#');
  const uriPart = hashIndex === -1 ? site.reference : site.reference.slice(0, hashIndex);
  const fragment = hashIndex === -1 ? '' : site.reference.slice(hashIndex + 1);

  let target: SchemaDocument;
  if (uriPart === '') {
    target = site.document;
  } else {
    const resolved = resolveDocumentUri(site.document.baseUri, uriPart, location);
    const found = documentsByUri.get(resolved);
    if (found === undefined) {
      throw new TypeError(`${location} references ${resolved}, which is not in the registry.`);
    }
    target = found;
  }

  if (fragment !== '' && !fragment.startsWith('/')) {
    throw new TypeError(`${location} must use a JSON Pointer fragment.`);
  }
  const tokens =
    fragment === ''
      ? []
      : fragment
          .slice(1)
          .split('/')
          .map((token) => unescapeToken(token, location));
  const canonical = tokens.map((token) => `/${escapeToken(token)}`).join('');
  if (canonical !== '' && !target.schemaPointers.has(canonical)) {
    throw new TypeError(`${location} does not reference a schema position.`);
  }

  let current: unknown = target.root;
  for (const token of tokens) {
    if (Array.isArray(current)) {
      const index = Number(token);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) {
        throw new TypeError(`${location} does not resolve to a schema.`);
      }
      current = current[index];
    } else if (isSchemaNode(current) && Object.hasOwn(current, token)) {
      current = current[token];
    } else {
      throw new TypeError(`${location} does not resolve to a schema.`);
    }
  }
  if (typeof current === 'boolean' || isSchemaNode(current)) {
    return current;
  }
  throw new TypeError(`${location} does not resolve to a schema.`);
}

function resolveDocumentUri(base: string | undefined, uriPart: string, location: string): string {
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/u.test(uriPart)) {
    return uriPart;
  }
  if (base === undefined) {
    throw new TypeError(`${location} uses a relative reference without a document base URI.`);
  }
  if (
    uriPart.startsWith('/') ||
    uriPart.split('/').some((segment) => segment === '..' || segment === '.')
  ) {
    throw new TypeError(`${location} must stay within the schema registry root.`);
  }
  return base.slice(0, base.lastIndexOf('/') + 1) + uriPart;
}

// ---------------------------------------------------------------------------
// Interpretation.
// ---------------------------------------------------------------------------

function validateSubschema(
  schema: Subschema,
  instance: unknown,
  path: string,
  errors: SchemaValidationError[],
  program: CompiledProgram,
  active: Set<SchemaNode>,
): boolean {
  if (typeof schema === 'boolean') {
    if (!schema) {
      errors.push({ instancePath: path, keyword: 'false', message: 'boolean schema is false' });
    }
    return schema;
  }
  if (active.has(schema)) {
    // Unreachable for admitted schemas: contributed schemas are checked to be
    // non-recursive, and canonical recursion always descends into a child
    // instance value (which resets this set). Guarded anyway so a
    // hypothetical non-progressing reference cycle fails closed instead of
    // looping.
    throw new RangeError('Schema evaluation cycled without consuming instance input.');
  }
  active.add(schema);
  const valid = validateSchemaNode(schema, instance, path, errors, program, active);
  active.delete(schema);
  return valid;
}

function validateSchemaNode(
  schema: SchemaNode,
  instance: unknown,
  path: string,
  errors: SchemaValidationError[],
  program: CompiledProgram,
  active: Set<SchemaNode>,
): boolean {
  let valid = true;
  const fail = (keyword: string, message: string, at: string = path): void => {
    valid = false;
    errors.push({ instancePath: at, keyword, message });
  };

  if (schema.$ref !== undefined) {
    const target = program.references.get(schema);
    if (target === undefined) {
      throw new TypeError('Schema reference was not resolved at compile time.');
    }
    if (!validateSubschema(target, instance, path, errors, program, active)) {
      valid = false;
    }
  }

  const typeOperand = schema.type;
  if (typeof typeOperand === 'string') {
    if (!matchesType(typeOperand, instance)) {
      fail('type', `must be ${typeOperand}`);
    }
  } else if (Array.isArray(typeOperand)) {
    if (!typeOperand.some((name) => typeof name === 'string' && matchesType(name, instance))) {
      fail('type', `must be ${typeOperand.join(',')}`);
    }
  }

  if (schema.enum !== undefined && Array.isArray(schema.enum)) {
    if (!schema.enum.some((member) => deepEqual(member, instance))) {
      fail('enum', 'must be equal to one of the allowed values');
    }
  }
  if (Object.hasOwn(schema, 'const') && !deepEqual(schema.const, instance)) {
    fail('const', 'must be equal to constant');
  }

  validateCombinators(schema, instance, path, errors, program, active, fail);

  if (typeof instance === 'string') {
    validateStringKeywords(schema, instance, fail, program);
  } else if (typeof instance === 'number' && Number.isFinite(instance)) {
    validateNumberKeywords(schema, instance, fail);
  } else if (Array.isArray(instance)) {
    if (!validateArrayKeywords(schema, instance, path, errors, program, fail)) {
      valid = false;
    }
  } else if (isObjectInstance(instance)) {
    if (!validateObjectKeywords(schema, instance, path, errors, program, fail)) {
      valid = false;
    }
  }

  return valid;
}

type FailReporter = (keyword: string, message: string, at?: string) => void;

function validateCombinators(
  schema: SchemaNode,
  instance: unknown,
  path: string,
  errors: SchemaValidationError[],
  program: CompiledProgram,
  active: Set<SchemaNode>,
  fail: FailReporter,
): void {
  const speculate = (subschema: Subschema): boolean => {
    const scratch: SchemaValidationError[] = [];
    return validateSubschema(subschema, instance, path, scratch, program, active);
  };

  if (Array.isArray(schema.allOf)) {
    for (const member of schema.allOf) {
      if (!validateSubschema(member as Subschema, instance, path, errors, program, active)) {
        fail('allOf', 'must match all schemas in allOf');
      }
    }
  }
  if (Array.isArray(schema.anyOf)) {
    if (!schema.anyOf.some((member) => speculate(member as Subschema))) {
      fail('anyOf', 'must match a schema in anyOf');
    }
  }
  if (Array.isArray(schema.oneOf)) {
    let matches = 0;
    for (const member of schema.oneOf) {
      if (speculate(member as Subschema) && (matches += 1) > 1) {
        break;
      }
    }
    if (matches !== 1) {
      fail('oneOf', 'must match exactly one schema in oneOf');
    }
  }
  if (schema.not !== undefined && speculate(schema.not as Subschema)) {
    fail('not', 'must NOT be valid');
  }
  if (schema.if !== undefined) {
    const branch = speculate(schema.if as Subschema) ? schema.then : schema.else;
    if (
      branch !== undefined &&
      !validateSubschema(branch as Subschema, instance, path, errors, program, active)
    ) {
      fail('if', 'must match the conditional schema');
    }
  }
}

function validateStringKeywords(
  schema: SchemaNode,
  instance: string,
  fail: FailReporter,
  program: CompiledProgram,
): void {
  const minLength = schema.minLength;
  const maxLength = schema.maxLength;
  if (typeof minLength === 'number' || typeof maxLength === 'number') {
    const length = codePointLength(instance);
    if (typeof minLength === 'number' && length < minLength) {
      fail('minLength', `must NOT have fewer than ${minLength} characters`);
    }
    if (typeof maxLength === 'number' && length > maxLength) {
      fail('maxLength', `must NOT have more than ${maxLength} characters`);
    }
  }
  if (typeof schema.pattern === 'string') {
    const pattern = program.patterns.get(schema);
    if (pattern === undefined) {
      throw new TypeError('Schema pattern was not compiled.');
    }
    if (!pattern.test(instance)) {
      fail('pattern', `must match pattern "${schema.pattern}"`);
    }
  }
}

function validateNumberKeywords(schema: SchemaNode, instance: number, fail: FailReporter): void {
  if (typeof schema.minimum === 'number' && instance < schema.minimum) {
    fail('minimum', `must be >= ${schema.minimum}`);
  }
  if (typeof schema.maximum === 'number' && instance > schema.maximum) {
    fail('maximum', `must be <= ${schema.maximum}`);
  }
  if (typeof schema.exclusiveMinimum === 'number' && instance <= schema.exclusiveMinimum) {
    fail('exclusiveMinimum', `must be > ${schema.exclusiveMinimum}`);
  }
  if (typeof schema.exclusiveMaximum === 'number' && instance >= schema.exclusiveMaximum) {
    fail('exclusiveMaximum', `must be < ${schema.exclusiveMaximum}`);
  }
  if (typeof schema.multipleOf === 'number') {
    // Mirrors the reference validator's division semantics exactly, including
    // its precision behavior, so verdicts agree on every representable input.
    const quotient = instance / schema.multipleOf;
    if (quotient !== Number.parseInt(String(quotient), 10)) {
      fail('multipleOf', `must be multiple of ${schema.multipleOf}`);
    }
  }
}

function validateArrayKeywords(
  schema: SchemaNode,
  instance: unknown[],
  path: string,
  errors: SchemaValidationError[],
  program: CompiledProgram,
  fail: FailReporter,
): boolean {
  let valid = true;
  const child = (subschema: Subschema, index: number): void => {
    if (
      !validateSubschema(subschema, instance[index], `${path}/${index}`, errors, program, new Set())
    ) {
      valid = false;
    }
  };

  const prefixItems = Array.isArray(schema.prefixItems) ? schema.prefixItems : undefined;
  const prefixLength = prefixItems?.length ?? 0;
  if (prefixItems !== undefined) {
    for (let index = 0; index < Math.min(prefixLength, instance.length); index += 1) {
      child(prefixItems[index] as Subschema, index);
    }
  }
  const items = schema.items;
  if (items !== undefined && instance.length > prefixLength) {
    if (items === false) {
      fail('items', `must NOT have more than ${prefixLength} items`);
    } else if (items !== true) {
      for (let index = prefixLength; index < instance.length; index += 1) {
        child(items as Subschema, index);
      }
    }
  }

  if (typeof schema.minItems === 'number' && instance.length < schema.minItems) {
    fail('minItems', `must NOT have fewer than ${schema.minItems} items`);
  }
  if (typeof schema.maxItems === 'number' && instance.length > schema.maxItems) {
    fail('maxItems', `must NOT have more than ${schema.maxItems} items`);
  }
  if (schema.uniqueItems === true) {
    const duplicate = findDuplicateIndexes(instance);
    if (duplicate !== undefined) {
      fail(
        'uniqueItems',
        `must NOT have duplicate items (items ## ${duplicate[0]} and ${duplicate[1]} are identical)`,
      );
    }
  }
  return valid;
}

function validateObjectKeywords(
  schema: SchemaNode,
  instance: Record<string, unknown>,
  path: string,
  errors: SchemaValidationError[],
  program: CompiledProgram,
  fail: FailReporter,
): boolean {
  let valid = true;
  // A member whose value is `undefined` is not JSON and is treated as absent,
  // matching how the previous validator saw JSON-decoded instances.
  const memberNames = Object.keys(instance).filter((name) => instance[name] !== undefined);
  const present = (name: string): boolean =>
    Object.hasOwn(instance, name) && instance[name] !== undefined;

  const properties = isSchemaNode(schema.properties) ? schema.properties : undefined;
  if (properties !== undefined) {
    for (const [name, subschema] of Object.entries(properties)) {
      if (
        present(name) &&
        !validateSubschema(
          subschema as Subschema,
          instance[name],
          `${path}/${escapeToken(name)}`,
          errors,
          program,
          new Set(),
        )
      ) {
        valid = false;
      }
    }
  }

  if (Array.isArray(schema.required)) {
    for (const name of schema.required) {
      if (typeof name === 'string' && !present(name)) {
        fail('required', `must have required property '${name}'`);
      }
    }
  }

  const additional = schema.additionalProperties;
  if (additional !== undefined) {
    for (const name of memberNames) {
      if (properties !== undefined && Object.hasOwn(properties, name)) {
        continue;
      }
      if (additional === false) {
        fail('additionalProperties', 'must NOT have additional properties');
      } else if (
        additional !== true &&
        !validateSubschema(
          additional as Subschema,
          instance[name],
          `${path}/${escapeToken(name)}`,
          errors,
          program,
          new Set(),
        )
      ) {
        valid = false;
      }
    }
  }

  const propertyNames = schema.propertyNames;
  if (propertyNames !== undefined) {
    for (const name of memberNames) {
      const scratch: SchemaValidationError[] = [];
      if (!validateSubschema(propertyNames as Subschema, name, path, scratch, program, new Set())) {
        fail('propertyNames', `property name '${name}' is invalid`);
      }
    }
  }

  const dependentRequired = schema.dependentRequired;
  if (isSchemaNode(dependentRequired)) {
    for (const [trigger, dependents] of Object.entries(dependentRequired)) {
      if (!present(trigger) || !Array.isArray(dependents)) {
        continue;
      }
      for (const dependent of dependents) {
        if (typeof dependent === 'string' && !present(dependent)) {
          fail(
            'dependentRequired',
            `must have property ${dependent} when property ${trigger} is present`,
          );
        }
      }
    }
  }

  if (typeof schema.minProperties === 'number' && memberNames.length < schema.minProperties) {
    fail('minProperties', `must NOT have fewer than ${schema.minProperties} properties`);
  }
  if (typeof schema.maxProperties === 'number' && memberNames.length > schema.maxProperties) {
    fail('maxProperties', `must NOT have more than ${schema.maxProperties} properties`);
  }

  return valid;
}

// ---------------------------------------------------------------------------
// Shared helpers.
// ---------------------------------------------------------------------------

function matchesType(name: string, instance: unknown): boolean {
  switch (name) {
    case 'array':
      return Array.isArray(instance);
    case 'boolean':
      return typeof instance === 'boolean';
    case 'integer':
      return typeof instance === 'number' && Number.isFinite(instance) && instance % 1 === 0;
    case 'null':
      return instance === null;
    case 'number':
      return typeof instance === 'number' && Number.isFinite(instance);
    case 'object':
      return isObjectInstance(instance);
    case 'string':
      return typeof instance === 'string';
    default:
      return false;
  }
}

function findDuplicateIndexes(instance: readonly unknown[]): [number, number] | undefined {
  for (let second = 1; second < instance.length; second += 1) {
    for (let first = 0; first < second; first += 1) {
      if (deepEqual(instance[second], instance[first])) {
        return [first, second];
      }
    }
  }
  return undefined;
}

/** JSON-value deep equality (order-insensitive for objects). */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      return false;
    }
    for (let index = 0; index < a.length; index += 1) {
      if (!deepEqual(a[index], b[index])) {
        return false;
      }
    }
    return true;
  }
  if (
    typeof a === 'object' &&
    typeof b === 'object' &&
    a !== null &&
    b !== null &&
    !Array.isArray(a) &&
    !Array.isArray(b)
  ) {
    const aKeys = Object.keys(a);
    const bRecord = b as Record<string, unknown>;
    if (aKeys.length !== Object.keys(b).length) {
      return false;
    }
    for (const key of aKeys) {
      if (!Object.hasOwn(b, key) || !deepEqual((a as Record<string, unknown>)[key], bRecord[key])) {
        return false;
      }
    }
    return true;
  }
  return false;
}

/** String length in Unicode code points, as JSON Schema requires. */
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

function isObjectInstance(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSchemaNode(value: unknown): value is SchemaNode {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isDenseArray(value: unknown): value is unknown[] {
  if (!Array.isArray(value)) {
    return false;
  }
  const keys = Object.keys(value);
  return keys.length === value.length && keys.every((key, index) => key === String(index));
}

function appendPointer(pointer: string, token: string): string {
  return `${pointer}/${escapeToken(token)}`;
}

function escapeToken(token: string): string {
  return token.replaceAll('~', '~0').replaceAll('/', '~1');
}

function unescapeToken(token: string, location: string): string {
  if (/(?:~[^01]|~$)/u.test(token)) {
    throw new TypeError(`${location} is not a valid JSON Pointer reference.`);
  }
  return token.replaceAll('~1', '/').replaceAll('~0', '~');
}

function describeLocation(document: SchemaDocument, pointer: string): string {
  return `${document.baseUri ?? 'schema'}#${pointer}`;
}
