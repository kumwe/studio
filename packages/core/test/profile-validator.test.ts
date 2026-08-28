import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Ajv2020 } from 'ajv/dist/2020.js';
import {
  protocolSchemas,
  type BlockDefinition,
  type JsonSchema,
  type JsonValue,
} from '@kumwe/studio-protocol';
import { compileProfileSchema } from '../src/profile-validator.js';

/**
 * The agreement suite for the eval-free interpreting validator. Ajv is the
 * dev-only reference implementation: every schema in the repository corpus
 * that the runtime interprets — the canonical protocol schemas and every
 * profile-conforming block property schema — is compiled by both engines and
 * their verdicts must agree on the repository fixtures and on a seeded,
 * generated instance set. Ajv itself must never re-enter runtime code; the
 * first test pins that boundary at the source level.
 */

const SCHEMA_BASE = 'https://schemas.kumwe.org/studio/v1/';

function readJson(path: string): Promise<JsonValue> {
  return readFile(join(process.cwd(), path), 'utf8').then((text) => JSON.parse(text) as JsonValue);
}

// ---------------------------------------------------------------------------
// Seeded deterministic generation (mulberry32).
// ---------------------------------------------------------------------------

type Random = () => number;

function mulberry32(seed: number): Random {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(random: Random, values: readonly T[]): T {
  const value = values[Math.floor(random() * values.length)];
  if (value === undefined) {
    throw new Error('pick requires a non-empty list');
  }
  return value;
}

function randomJson(random: Random, depth: number): unknown {
  const roll = random();
  if (depth <= 0 || roll < 0.55) {
    return pick(random, [
      null,
      true,
      false,
      0,
      1,
      -1,
      1.5,
      12,
      4096,
      '',
      'a',
      'calm',
      'preserve',
      'not-a-real-value',
      '0.1-draft',
      'org.example/kit',
      '1.0.0',
      '\u{1f9ea}\u{1f9ea}',
    ]);
  }
  if (roll < 0.75) {
    const length = Math.floor(random() * 4);
    return Array.from({ length }, () => randomJson(random, depth - 1));
  }
  const entries = Math.floor(random() * 4);
  const result: Record<string, unknown> = {};
  for (let index = 0; index < entries; index += 1) {
    result[pick(random, ['id', 'kind', 'type', 'value', 'width', 'tone', 'x'])] = randomJson(
      random,
      depth - 1,
    );
  }
  return result;
}

/**
 * Generates an instance that leans toward satisfying the schema so the
 * agreement set explores the accept path as well as the reject path. The
 * generator follows local and registry references, honors bounds loosely,
 * and intentionally derails with `randomJson` noise at a fixed rate.
 */
function generateInstance(
  schema: unknown,
  root: JsonSchema,
  registry: ReadonlyMap<string, JsonSchema>,
  random: Random,
  depth: number,
): unknown {
  if (typeof schema === 'boolean' || depth <= 0 || random() < 0.12) {
    return randomJson(random, depth);
  }
  const node = schema as Record<string, unknown>;
  if (typeof node.$ref === 'string' && random() < 0.9) {
    const resolved = resolveForGeneration(node.$ref, root, registry);
    if (resolved !== undefined) {
      return generateInstance(resolved.schema, resolved.root, registry, random, depth - 1);
    }
  }
  if (Object.hasOwn(node, 'const') && random() < 0.85) {
    return node.const;
  }
  if (Array.isArray(node.enum) && node.enum.length > 0 && random() < 0.85) {
    return pick(random, node.enum);
  }
  for (const combinator of ['allOf', 'anyOf', 'oneOf'] as const) {
    const branches = node[combinator];
    if (Array.isArray(branches) && branches.length > 0 && random() < 0.9) {
      return generateInstance(pick(random, branches), root, registry, random, depth - 1);
    }
  }
  const declaredType = Array.isArray(node.type)
    ? pick(random, node.type as unknown[])
    : (node.type ?? pick(random, ['string', 'number', 'object', 'array', 'boolean', 'null']));
  switch (declaredType) {
    case 'null':
      return null;
    case 'boolean':
      return random() < 0.5;
    case 'integer':
    case 'number': {
      const minimum = typeof node.minimum === 'number' ? node.minimum : 0;
      const maximum = typeof node.maximum === 'number' ? node.maximum : minimum + 20;
      const value = minimum + random() * Math.max(maximum - minimum, 1);
      return declaredType === 'integer' && random() < 0.8 ? Math.round(value) : value;
    }
    case 'string': {
      const sample = pick(random, [
        'a',
        'draft',
        'org.example/kit',
        '1.0.0',
        'section',
        'https://example.test/x',
        '\u{1f9ea}',
        '',
      ]);
      if (typeof node.pattern === 'string' && random() < 0.4) {
        return sample;
      }
      const minLength = typeof node.minLength === 'number' ? node.minLength : 0;
      return sample.length >= minLength ? sample : sample.padEnd(minLength, 'x');
    }
    case 'array': {
      const prefixItems = Array.isArray(node.prefixItems) ? node.prefixItems : [];
      const minItems = typeof node.minItems === 'number' ? node.minItems : 0;
      const length = Math.max(prefixItems.length, minItems, Math.floor(random() * 3));
      return Array.from({ length }, (_, index) =>
        generateInstance(
          prefixItems[index] ?? node.items ?? true,
          root,
          registry,
          random,
          depth - 1,
        ),
      );
    }
    default: {
      const result: Record<string, unknown> = {};
      const properties =
        typeof node.properties === 'object' && node.properties !== null
          ? (node.properties as Record<string, unknown>)
          : {};
      const required = Array.isArray(node.required) ? node.required : [];
      for (const [name, subschema] of Object.entries(properties)) {
        if (required.includes(name) || random() < 0.6) {
          result[name] = generateInstance(subschema, root, registry, random, depth - 1);
        }
      }
      for (const name of required) {
        if (typeof name === 'string' && !Object.hasOwn(result, name)) {
          result[name] = randomJson(random, depth - 1);
        }
      }
      if (node.additionalProperties !== false && random() < 0.25) {
        result[pick(random, ['extra', 'x-noise', 'zz'])] = randomJson(random, depth - 1);
      }
      return result;
    }
  }
}

function resolveForGeneration(
  reference: string,
  root: JsonSchema,
  registry: ReadonlyMap<string, JsonSchema>,
): { root: JsonSchema; schema: unknown } | undefined {
  const hashIndex = reference.indexOf('#');
  const uriPart = hashIndex === -1 ? reference : reference.slice(0, hashIndex);
  const fragment = hashIndex === -1 ? '' : reference.slice(hashIndex + 1);
  const targetRoot =
    uriPart === ''
      ? root
      : registry.get(/^[a-z][a-z0-9+.-]*:/iu.test(uriPart) ? uriPart : SCHEMA_BASE + uriPart);
  if (targetRoot === undefined) {
    return undefined;
  }
  let current: unknown = targetRoot;
  for (const token of fragment === '' ? [] : fragment.slice(1).split('/')) {
    const key = token.replaceAll('~1', '/').replaceAll('~0', '~');
    if (Array.isArray(current)) {
      current = current[Number(key)];
    } else if (typeof current === 'object' && current !== null) {
      current = (current as Record<string, unknown>)[key];
    } else {
      return undefined;
    }
  }
  return current === undefined ? undefined : { root: targetRoot, schema: current };
}

function mutate(value: JsonValue, random: Random): unknown {
  const clone = structuredClone(value) as unknown;
  const containers: (Record<string, unknown> | unknown[])[] = [];
  const collect = (candidate: unknown): void => {
    if (Array.isArray(candidate)) {
      containers.push(candidate);
      candidate.forEach(collect);
    } else if (typeof candidate === 'object' && candidate !== null) {
      containers.push(candidate as Record<string, unknown>);
      Object.values(candidate).forEach(collect);
    }
  };
  collect(clone);
  if (containers.length === 0) {
    return randomJson(random, 2);
  }
  const target = pick(random, containers);
  if (Array.isArray(target)) {
    if (random() < 0.5 && target.length > 0) {
      target.splice(Math.floor(random() * target.length), 1);
    } else {
      target.push(randomJson(random, 2));
    }
  } else {
    const keys = Object.keys(target);
    if (random() < 0.4 && keys.length > 0) {
      Reflect.deleteProperty(target, pick(random, keys));
    } else if (random() < 0.7 && keys.length > 0) {
      target[pick(random, keys)] = randomJson(random, 2);
    } else {
      target[pick(random, ['unexpected', 'kind', 'extra'])] = randomJson(random, 2);
    }
  }
  return clone;
}

// ---------------------------------------------------------------------------
// The suites.
// ---------------------------------------------------------------------------

describe('runtime source hygiene', () => {
  it('keeps ajv (and any other code-generating validator) out of core src', async () => {
    const sourceDirectory = join(process.cwd(), 'packages/core/src');
    for (const entry of await readdir(sourceDirectory)) {
      const source = await readFile(join(sourceDirectory, entry), 'utf8');
      expect(source, `${entry} must not import ajv`).not.toMatch(
        /from\s+['"]ajv|require\(\s*['"]ajv/u,
      );
      expect(source, `${entry} must not compile strings to code`).not.toMatch(
        /\beval\s*\(|new\s+Function\s*\(/u,
      );
    }
  });
});

describe('canonical schema agreement with the reference validator', () => {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  for (const schema of protocolSchemas) {
    ajv.addSchema(schema);
  }
  const registryByUri = new Map(
    protocolSchemas.map((schema) => [String(schema.$id), schema] as const),
  );

  const fixtures: { name: string; value: JsonValue }[] = [];
  const loadFixtures = (async () => {
    for (const directory of ['schemas/examples', 'schemas/invalid']) {
      for (const entry of (await readdir(join(process.cwd(), directory))).sort()) {
        if (entry.endsWith('.json')) {
          fixtures.push({
            name: `${directory}/${entry}`,
            value: await readJson(`${directory}/${entry}`),
          });
        }
      }
    }
  })();

  it('agrees with Ajv on every repository fixture across every canonical schema', async () => {
    await loadFixtures;
    expect(fixtures.length).toBeGreaterThan(40);
    let comparisons = 0;
    for (const schema of protocolSchemas) {
      const reference = ajv.getSchema(String(schema.$id));
      expect(reference).toBeDefined();
      const interpreter = compileProfileSchema(schema, {
        schemas: protocolSchemas.filter((other) => other !== schema),
      });
      for (const fixture of fixtures) {
        const expected = reference?.(fixture.value) === true;
        const actual = interpreter.validate(fixture.value);
        expect(
          actual,
          `${schema.$id} disagreed with Ajv on ${fixture.name} (ajv: ${expected})`,
        ).toBe(expected);
        comparisons += 1;
      }
    }
    expect(comparisons).toBe(protocolSchemas.length * fixtures.length);
  });

  it('agrees with Ajv on seeded generated and mutated instances', async () => {
    await loadFixtures;
    let comparisons = 0;
    for (const [schemaIndex, schema] of protocolSchemas.entries()) {
      const reference = ajv.getSchema(String(schema.$id));
      const interpreter = compileProfileSchema(schema, {
        schemas: protocolSchemas.filter((other) => other !== schema),
      });
      const random = mulberry32(0xc0ffee + schemaIndex);
      const instances: unknown[] = [];
      for (let round = 0; round < 40; round += 1) {
        instances.push(generateInstance(schema, schema, registryByUri, random, 6));
      }
      for (let round = 0; round < 20; round += 1) {
        instances.push(mutate(pick(random, fixtures).value, random));
      }
      for (const [index, instance] of instances.entries()) {
        const expected = reference?.(instance) === true;
        const actual = interpreter.validate(instance);
        expect(
          actual,
          `${schema.$id} disagreed with Ajv on generated instance #${index}: ${JSON.stringify(instance)?.slice(0, 300)}`,
        ).toBe(expected);
        comparisons += 1;
      }
    }
    expect(comparisons).toBe(protocolSchemas.length * 60);
  });
});

describe('profile corpus agreement with the reference validator', () => {
  // The relaxations below only lift Ajv strict mode's authoring nits (type
  // arrays, type-specific keywords without a `type` declaration, open tuple
  // shapes, and `required` names outside `properties`) — all of which the
  // published profile meta-schema explicitly admits — and change no
  // validation verdict.
  const ajv = new Ajv2020({
    allErrors: true,
    allowUnionTypes: true,
    strict: true,
    strictRequired: false,
    strictTuples: false,
    strictTypes: false,
  });
  const validateProfile = (() => {
    const metaAjv = new Ajv2020({ allErrors: true, strict: true });
    for (const schema of protocolSchemas) {
      metaAjv.addSchema(schema);
    }
    return metaAjv.getSchema(`${SCHEMA_BASE}schema-profile.schema.json`);
  })();

  /**
   * Every profile keyword appears at least once in this corpus, so the
   * agreement run exercises the interpreter's whole keyword surface: types
   * and union types, enum/const, object keywords (required/properties/
   * additionalProperties/propertyNames/dependentRequired and bounds), array
   * keywords (items/prefixItems/uniqueItems and bounds), string and number
   * bounds with multipleOf, composition (allOf/anyOf/oneOf/not/if/then/else),
   * local $defs/$ref, and the annotations.
   */
  const handwrittenCorpus: JsonSchema[] = [
    { additionalProperties: false, type: 'object' },
    {
      additionalProperties: false,
      properties: {
        tone: { enum: ['calm', 'bold'] },
        width: { maximum: 12, minimum: 1, type: 'integer' },
      },
      required: ['tone'],
      type: 'object',
    },
    {
      additionalProperties: false,
      properties: {
        count: { exclusiveMaximum: 100, exclusiveMinimum: 0, multipleOf: 0.5, type: 'number' },
        label: { maxLength: 12, minLength: 2, type: 'string' },
        mode: { const: 'grid' },
        tags: {
          items: { maxLength: 8, type: 'string' },
          maxItems: 4,
          minItems: 1,
          type: 'array',
          uniqueItems: true,
        },
      },
      type: 'object',
    },
    {
      additionalProperties: false,
      description: 'union types with dependent members',
      properties: {
        size: { type: ['integer', 'string'] },
        unit: { enum: ['px', 'rem'] },
      },
      dependentRequired: { size: ['unit'] },
      maxProperties: 4,
      minProperties: 1,
      propertyNames: { maxLength: 10, type: 'string' },
      title: 'Sizing',
      type: 'object',
    },
    {
      additionalProperties: false,
      else: { required: ['fallback'] },
      if: { properties: { kind: { const: 'image' } }, required: ['kind'] },
      properties: {
        alt: { type: 'string' },
        fallback: { type: 'string' },
        kind: { enum: ['image', 'text'] },
      },
      then: { required: ['alt'] },
      type: 'object',
    },
    {
      additionalProperties: false,
      allOf: [{ required: ['a'] }, { properties: { a: { minimum: 0, type: 'number' } } }],
      anyOf: [{ required: ['a'] }, { required: ['b'] }],
      not: { required: ['forbidden'] },
      oneOf: [{ required: ['a'] }, { required: ['c'] }],
      type: 'object',
    },
    {
      $defs: {
        entry: {
          additionalProperties: false,
          properties: { value: { type: ['number', 'null'] } },
          required: ['value'],
          type: 'object',
        },
      },
      additionalProperties: false,
      properties: {
        first: { $ref: '#/$defs/entry' },
        rest: { items: { $ref: '#/$defs/entry' }, type: 'array' },
      },
      readOnly: false,
      type: 'object',
      writeOnly: false,
    },
    {
      additionalProperties: false,
      default: { rows: [] },
      examples: [{ rows: [[1, 2]] }],
      properties: {
        rows: {
          items: { items: { type: 'integer' }, prefixItems: [{ type: 'integer' }], type: 'array' },
          type: 'array',
        },
      },
      type: 'object',
    },
  ];

  async function propertySchemaCorpus(): Promise<{ name: string; schema: JsonSchema }[]> {
    const corpus: { name: string; schema: JsonSchema }[] = [];
    for (const directory of ['packages/testkit/fixtures', 'schemas/examples']) {
      for (const entry of (await readdir(join(process.cwd(), directory))).sort()) {
        if (!entry.startsWith('block.') || !entry.endsWith('.json')) {
          continue;
        }
        const definition = (await readJson(join(directory, entry))) as unknown as BlockDefinition;
        corpus.push({ name: `${directory}/${entry}`, schema: definition.propertySchema });
      }
    }
    for (const [index, schema] of handwrittenCorpus.entries()) {
      corpus.push({ name: `handwritten #${index}`, schema });
    }
    return corpus;
  }

  it('agrees with Ajv on every profile-conforming schema over a seeded instance set', async () => {
    const corpus = await propertySchemaCorpus();
    expect(corpus.length).toBeGreaterThanOrEqual(10);
    expect(validateProfile).toBeDefined();
    let comparisons = 0;
    for (const [schemaIndex, { name, schema }] of corpus.entries()) {
      expect(validateProfile?.(schema), `${name} must conform to the profile meta-schema`).toBe(
        true,
      );
      const reference = ajv.compile(structuredClone(schema));
      const interpreter = compileProfileSchema(schema);
      const random = mulberry32(0x5eed + schemaIndex);
      const empty = new Map<string, JsonSchema>();
      for (let round = 0; round < 200; round += 1) {
        const instance =
          round % 3 === 2
            ? randomJson(random, 4)
            : generateInstance(schema, schema, empty, random, 6);
        const expected = reference(instance);
        const actual = interpreter.validate(instance);
        expect(
          actual,
          `${name} disagreed with Ajv on instance #${round}: ${JSON.stringify(instance)?.slice(0, 300)}`,
        ).toBe(expected);
        comparisons += 1;
      }
    }
    expect(comparisons).toBe(corpus.length * 200);
  });

  it('agrees with Ajv on directed keyword edge cases', () => {
    const cases: { instances: unknown[]; schema: JsonSchema }[] = [
      // Integer-valued floats and non-finite numbers.
      { instances: [1, 1.0, 1.5, -0, 2 ** 53, 0.1 + 0.2], schema: { type: 'integer' } },
      // Code-point string lengths (astral characters).
      {
        instances: ['\u{1f9ea}\u{1f9ea}', 'ab', 'abc', '\ud83e'],
        schema: { maxLength: 2, type: 'string' },
      },
      // Unanchored patterns match substrings; profile-visible via canonical schemas only.
      { instances: ['abc', 'xabcx', 'ABC'], schema: { pattern: 'abc', type: 'string' } },
      // Deep, order-insensitive uniqueItems equality.
      {
        instances: [
          [
            { a: 1, b: 2 },
            { b: 2, a: 1 },
          ],
          [{ a: 1 }, { a: 2 }],
          [
            [1, 2],
            [1, 2],
          ],
          [1, '1'],
          [0, -0],
        ],
        schema: { type: 'array', uniqueItems: true },
      },
      // prefixItems with items: false refuses extra members.
      {
        instances: [[1], [1, 'x'], []],
        schema: { items: false, prefixItems: [{ type: 'integer' }], type: 'array' },
      },
      // contains applies exact cardinality bounds without projecting member diagnostics.
      {
        instances: [[], ['required'], ['required', 'other'], ['required', 'required']],
        schema: {
          contains: { const: 'required' },
          maxContains: 1,
          minContains: 1,
          type: 'array',
        },
      },
      // A $ref with adjacent keywords applies both (draft 2020-12).
      {
        instances: [5, 15, 'x'],
        schema: { $defs: { base: { type: 'integer' } }, $ref: '#/$defs/base', maximum: 10 },
      },
      // Boolean property schemas inside the interpreter's canonical surface.
      {
        instances: [{ open: 1 }, { closed: 1 }, {}],
        schema: { properties: { closed: false, open: true }, type: 'object' },
      },
      // oneOf with overlapping branches must reject double matches.
      {
        instances: [{ a: 1 }, { a: 1, b: 2 }, {}],
        schema: { oneOf: [{ required: ['a'] }, { required: ['b'] }], type: 'object' },
      },
      // enum deep equality against objects and arrays.
      {
        instances: [{ x: [1] }, { x: [1, 2] }, [1], 'x'],
        schema: { enum: [{ x: [1] }, [1], 'y'] },
      },
    ];
    for (const [index, { instances, schema }] of cases.entries()) {
      const reference = ajv.compile(structuredClone(schema));
      const interpreter = compileProfileSchema(schema);
      for (const instance of instances) {
        expect(
          interpreter.validate(instance),
          `case #${index} disagreed on ${JSON.stringify(instance)}`,
        ).toBe(reference(instance));
      }
    }
  });

  it('evaluates decimal multipleOf with exact canonical base-10 arithmetic', () => {
    const cents = compileProfileSchema({ multipleOf: 0.01, type: 'number' });
    for (const value of [0, 4.02, -4.02, 1_000]) {
      expect(cents.validate(value), String(value)).toBe(true);
    }
    for (const value of [4.021, -4.021]) {
      expect(cents.validate(value), String(value)).toBe(false);
      expect(cents.errors?.[0]).toMatchObject({ instancePath: '', keyword: 'multipleOf' });
    }

    const tenths = compileProfileSchema({ multipleOf: 0.1, type: 'number' });
    expect(tenths.validate(0.3)).toBe(true);
    expect(tenths.validate(0.30000000000000004)).toBe(false);
  });

  it('memoizes acyclic reference fan-out by schema, location, and instance', () => {
    const definitions: Record<string, JsonSchema> = {
      d63: { const: true },
    };
    for (let index = 62; index >= 0; index -= 1) {
      const name = `d${String(index).padStart(2, '0')}`;
      const next = `d${String(index + 1).padStart(2, '0')}`;
      definitions[name] = {
        allOf: [{ $ref: `#/$defs/${next}` }, { $ref: `#/$defs/${next}` }],
      };
    }
    const validator = compileProfileSchema({
      $defs: definitions,
      $ref: '#/$defs/d00',
    });

    expect(validator.validate(true)).toBe(true);
    expect(validator.errors).toBeNull();
    expect(validator.validate(false)).toBe(false);
    expect(validator.errors?.[0]).toMatchObject({ instancePath: '', keyword: 'const' });
  });

  it('does not reuse property-name verdicts for different values at one instance path', () => {
    const validator = compileProfileSchema({
      propertyNames: { enum: ['allowed'] },
      type: 'object',
    });

    expect(validator.validate({ allowed: true, denied: true })).toBe(false);
    expect(validator.errors?.[0]).toMatchObject({ instancePath: '', keyword: 'propertyNames' });
  });

  it('replays every diagnostic when a speculative failure is reused non-speculatively', () => {
    const validator = compileProfileSchema({
      $defs: { failing: { enum: ['accepted'], type: 'string' } },
      anyOf: [{ $ref: '#/$defs/failing' }, true],
      if: true,
      then: { $ref: '#/$defs/failing' },
    });

    expect(validator.validate(42)).toBe(false);
    expect(validator.errors).not.toBeNull();
    expect(
      validator.errors?.map(({ instancePath, keyword }) => ({ instancePath, keyword })),
    ).toEqual([
      { instancePath: '', keyword: 'type' },
      { instancePath: '', keyword: 'enum' },
      { instancePath: '', keyword: 'if' },
    ]);
  });

  it('publishes the same distinct diagnostics for shared and inlined failures', () => {
    const failing: JsonSchema = {
      allOf: [
        { enum: ['accepted'], type: 'string' },
        { enum: ['accepted'], type: 'string' },
      ],
    };
    const shared = compileProfileSchema({
      $defs: { failing },
      allOf: [{ $ref: '#/$defs/failing' }, { $ref: '#/$defs/failing' }],
    });
    const inlined = compileProfileSchema({
      allOf: [structuredClone(failing), structuredClone(failing)],
    });

    expect(shared.validate(42)).toBe(false);
    expect(inlined.validate(42)).toBe(false);
    expect(shared.errors).toEqual(inlined.errors);
    expect(shared.errors?.map(({ instancePath, keyword }) => ({ instancePath, keyword }))).toEqual([
      { instancePath: '', keyword: 'type' },
      { instancePath: '', keyword: 'enum' },
      { instancePath: '', keyword: 'allOf' },
    ]);
  });

  it('orders object instance diagnostics independently of member insertion order', () => {
    const validator = compileProfileSchema({
      additionalProperties: false,
      properties: {
        z: { type: 'string' },
        a: { type: 'string' },
      },
      required: ['z', 'a'],
      type: 'object',
    });

    expect(validator.validate({ z: 1, extra: true, a: 2 })).toBe(false);
    expect(
      validator.errors?.map(({ instancePath, keyword }) => ({ instancePath, keyword })),
    ).toEqual([
      { instancePath: '/a', keyword: 'type' },
      { instancePath: '/z', keyword: 'type' },
      { instancePath: '', keyword: 'additionalProperties' },
    ]);

    expect(validator.validate({})).toBe(false);
    expect(validator.errors?.map(({ message }) => message)).toEqual([
      "must have required property 'a'",
      "must have required property 'z'",
    ]);
  });

  it('reports diagnostics with Ajv-shaped instance paths and keywords', () => {
    const interpreter = compileProfileSchema({
      additionalProperties: false,
      properties: {
        'odd/name': { type: 'string' },
        width: { minimum: 1, type: 'integer' },
      },
      required: ['width'],
      type: 'object',
    });
    expect(interpreter.validate({ 'odd/name': 4, extra: true })).toBe(false);
    const errors = interpreter.errors ?? [];
    expect(errors.map((error) => [error.keyword, error.instancePath])).toEqual(
      expect.arrayContaining([
        ['type', '/odd~1name'],
        ['required', ''],
        ['additionalProperties', ''],
      ]),
    );
    expect(interpreter.validate({ width: 4 })).toBe(true);
    expect(interpreter.errors).toBeNull();
  });

  it('rejects schemas outside the interpretable surface at compile time', () => {
    const rejected: JsonSchema[] = [
      { patternProperties: { '^x': { type: 'string' } }, type: 'object' },
      { format: 'email', type: 'string' },
      { contentSchema: { type: 'string' }, type: 'string' },
      { $ref: 'https://untrusted.example/schema.json' },
      { $ref: '#/nowhere' },
      { pattern: 'a'.repeat(501), type: 'string' },
      { pattern: '(', type: 'string' },
      { type: 'strange' },
      { allOf: [], type: 'object' },
      { required: ['a', 'a'], type: 'object' },
      { minLength: -1, type: 'string' },
      { multipleOf: 0, type: 'number' },
    ];
    for (const schema of rejected) {
      expect(() => compileProfileSchema(schema), JSON.stringify(schema).slice(0, 80)).toThrow();
    }
  });
});
