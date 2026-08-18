import { describe, expect, it } from 'vitest';
import type { JsonValue } from '@kumwe/studio-protocol';
import { canonicalStringify, canonicalUtf8Bytes } from '../src/index.js';

/**
 * Deterministic seeded fuzz lane for canonical serialization (M3-01),
 * widening the narrow LCG lane in canonical.test.ts to adversarial values:
 * surrogate pairs and lone surrogates, control characters, long strings,
 * structures approaching the depth limit, edge numbers, and hostile member
 * names. Any failure message names the seed and iteration to replay it.
 */

const SEEDS = [3, 61, 4_099] as const;
const ITERATIONS_PER_SEED = 150;
const DEPTH_ITERATIONS_PER_SEED = 40;
const DEFAULT_MAXIMUM_DEPTH = 64;

const encoder = new TextEncoder();

/**
 * String fragments chosen to stress escaping and encoding: ASCII, control
 * characters, minimal-escape candidates, BMP and astral code points, and
 * lone surrogates (raw '\uD800'/'\uDC00' units that never pair up).
 */
const STRING_FRAGMENTS = [
  'plain',
  'Zebra 042',
  '"quoted"',
  'back\\slash',
  'solidus/forward',
  '\u0000\u0001\u001f',
  '\b\u000b\f',
  'line\nbreak\r\ttab',
  'é ß ☃',
  'é combining',
  '😀🚀',
  '\u{10FFFF}\u{1F600}',
  '\ud800',
  '\udc00',
  'x\ud83dx',
  '\udfff tail',
] as const;

/**
 * Member names that stress code-unit ordering without being array indices:
 * the empty string, whitespace, case pairs, non-ASCII, escapes, and lone
 * surrogates. Array-index-like names are covered by an explicit vector test
 * because JavaScript object key enumeration reorders them.
 */
const MEMBER_NAMES = [
  '',
  ' leading space',
  'A',
  'Z~',
  '_underscore',
  'a',
  'aA',
  'member.with.dots',
  'quote"inside',
  'back\\slash',
  'ctrl\u0001',
  'x10',
  'ß',
  'é',
  '☃',
  '😀',
  '\ud800lone',
] as const;

const EDGE_NUMBERS = [
  0,
  -0,
  1,
  -1,
  0.1,
  -2.5,
  Number.MAX_SAFE_INTEGER,
  Number.MIN_SAFE_INTEGER,
  Number.MAX_VALUE,
  Number.MIN_VALUE,
  Number.EPSILON,
  1e21,
  1e-7,
  -1e308,
  123_456.789,
] as const;

const FORBIDDEN_MEMBER_NAMES = ['__proto__', 'constructor', 'prototype'] as const;

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

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

// --- value generation ----------------------------------------------------

function makeString(rng: Rng): string {
  if (rng() < 0.1) {
    // A long string near the practical bounds: thousands of code units of
    // one multi-byte, escape-heavy fragment.
    return pick(rng, STRING_FRAGMENTS).repeat(200 + integer(rng, 800));
  }
  return Array.from({ length: 1 + integer(rng, 4) }, () => pick(rng, STRING_FRAGMENTS)).join('');
}

function makeValue(rng: Rng, depth: number): JsonValue {
  const choice = integer(rng, depth > 3 ? 6 : 8);
  switch (choice) {
    case 0:
      return null;
    case 1:
      return rng() < 0.5;
    case 2:
      return pick(rng, EDGE_NUMBERS);
    case 3:
      return integer(rng, 2_000_000) - 1_000_000;
    case 4:
    case 5:
      return makeString(rng);
    case 6:
      return Array.from({ length: 1 + integer(rng, 3) }, () => makeValue(rng, depth + 1));
    default: {
      const object: Record<string, JsonValue> = {};
      for (let count = 1 + integer(rng, 3); count > 0; count -= 1) {
        object[pick(rng, MEMBER_NAMES)] = makeValue(rng, depth + 1);
      }
      return object;
    }
  }
}

/** A single-child container chain of exactly the given depth, plus a leaf. */
function makeChain(rng: Rng, containers: number): JsonValue {
  let value: JsonValue = pick(rng, [null, true, pick(rng, EDGE_NUMBERS), makeString(rng)]);
  for (let level = 0; level < containers; level += 1) {
    value = rng() < 0.5 ? [value] : { [pick(rng, MEMBER_NAMES)]: value };
  }
  return value;
}

/** Rebuilds the identical value graph with a shuffled member insertion order. */
function rebuildShuffled(rng: Rng, value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return value.map((item) => rebuildShuffled(rng, item));
  }
  if (typeof value === 'object' && value !== null) {
    const source = value as Record<string, JsonValue | undefined>;
    const rebuilt: Record<string, JsonValue> = {};
    for (const member of shuffle(rng, Object.keys(source))) {
      const memberValue = source[member];
      if (memberValue !== undefined) {
        rebuilt[member] = rebuildShuffled(rng, memberValue);
      }
    }
    return rebuilt;
  }
  return value;
}

function assertSortedRecursively(value: JsonValue, context: string): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      assertSortedRecursively(item, context);
    }
    return;
  }
  if (typeof value === 'object' && value !== null) {
    const members = Object.keys(value);
    expect(members, `${context}: member order is not code-unit sorted`).toStrictEqual(
      [...members].sort(compareCodeUnits),
    );
    for (const member of members) {
      const memberValue = (value as Record<string, JsonValue | undefined>)[member];
      if (memberValue !== undefined) {
        assertSortedRecursively(memberValue, context);
      }
    }
  }
}

// --- poisoned value generation -------------------------------------------

const POISON_KINDS = [
  'forbidden-member',
  'non-finite-number',
  'non-plain-object',
  'undefined-array-entry',
  'unrepresentable-scalar',
] as const;

type PoisonKind = (typeof POISON_KINDS)[number];

function makePoison(rng: Rng, kind: PoisonKind): unknown {
  switch (kind) {
    case 'forbidden-member':
      return JSON.parse(`{"${pick(rng, FORBIDDEN_MEMBER_NAMES)}":1}`);
    case 'non-finite-number':
      return pick(rng, [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]);
    case 'non-plain-object':
      return pick(rng, [new Date(0), new Map(), new Set(), /generated/u]);
    case 'undefined-array-entry':
      return [pick(rng, EDGE_NUMBERS), undefined];
    default:
      // No bare undefined here: an undefined OBJECT member is dropped by
      // design, so only scalars that always throw belong in this pool.
      return pick(rng, [10n, Symbol('poison'), () => 'call']);
  }
}

/** Buries the poison under 0-3 layers of otherwise-clean containers. */
function wrapPoison(rng: Rng, poison: unknown): unknown {
  let value = poison;
  for (let layers = integer(rng, 4); layers > 0; layers -= 1) {
    value = rng() < 0.5 ? [pick(rng, STRING_FRAGMENTS), value] : { safe: true, unsafe: value };
  }
  return value;
}

// --- the lanes -----------------------------------------------------------

describe('canonical serialization fuzzing (M3-01)', () => {
  it.each([...SEEDS])(
    'round-trips %d-seeded adversarial values byte-stably with UTF-8 agreement',
    (seed) => {
      const rng = createRng(seed);
      let escaped = 0;
      let surrogateEscaped = 0;
      for (let iteration = 0; iteration < ITERATIONS_PER_SEED; iteration += 1) {
        const context = `seed=${seed} iteration=${iteration}`;
        const value = deepFreeze(makeValue(rng, 0));
        const canonical = canonicalStringify(value);
        if (canonical.includes('\\')) {
          escaped += 1;
        }
        if (canonical.includes('\\ud')) {
          surrogateEscaped += 1;
        }

        // canonicalStringify -> JSON.parse -> canonicalStringify is
        // byte-stable.
        const reparsed = JSON.parse(canonical) as JsonValue;
        expect(canonicalStringify(reparsed), `${context}: reserialization is not byte-stable`).toBe(
          canonical,
        );

        // canonicalUtf8Bytes agrees with the UTF-8 encoding of the
        // canonical string, for the original and the reparsed value alike.
        expect(
          canonicalUtf8Bytes(value),
          `${context}: canonicalUtf8Bytes disagrees with the UTF-8 encoding`,
        ).toStrictEqual(encoder.encode(canonical));
        expect(
          canonicalUtf8Bytes(reparsed),
          `${context}: reparsed canonicalUtf8Bytes disagrees with the UTF-8 encoding`,
        ).toStrictEqual(encoder.encode(canonical));

        // Member order is code-unit sorted at every depth of the canonical
        // text (the generator avoids array-index-like member names, which
        // JavaScript key enumeration would reorder on the reparse).
        assertSortedRecursively(reparsed, context);

        // The canonical form is independent of member insertion order.
        expect(
          canonicalStringify(rebuildShuffled(rng, reparsed)),
          `${context}: member insertion order leaked into the canonical form`,
        ).toBe(canonical);
      }
      // Guard against silent generator degeneration: escaped strings in
      // general and lone-surrogate escapes in particular must stay well
      // represented.
      expect(escaped, `seed=${seed}: too few escape-carrying values`).toBeGreaterThan(25);
      expect(
        surrogateEscaped,
        `seed=${seed}: too few lone-surrogate-escaping values`,
      ).toBeGreaterThan(15);
    },
  );

  it.each([...SEEDS])(
    'accepts %d-seeded structures up to the depth limit and refuses deeper ones',
    (seed) => {
      const rng = createRng(seed);
      for (let iteration = 0; iteration < DEPTH_ITERATIONS_PER_SEED; iteration += 1) {
        const context = `seed=${seed} iteration=${iteration}`;
        const within = 1 + integer(rng, DEFAULT_MAXIMUM_DEPTH);
        const deepValue = deepFreeze(makeChain(rng, within));
        const canonical = canonicalStringify(deepValue);
        expect(
          canonicalStringify(JSON.parse(canonical) as JsonValue),
          `${context}: a ${within}-deep chain is not byte-stable`,
        ).toBe(canonical);
        expect(
          canonicalUtf8Bytes(deepValue),
          `${context}: a ${within}-deep chain loses UTF-8 agreement`,
        ).toStrictEqual(encoder.encode(canonical));

        const beyond = DEFAULT_MAXIMUM_DEPTH + 1 + integer(rng, 16);
        const tooDeep = makeChain(rng, beyond);
        expect(
          () => canonicalStringify(tooDeep),
          `${context}: a ${beyond}-deep chain must exceed the depth limit`,
        ).toThrow(RangeError);
      }
    },
  );

  it.each([...SEEDS])('rejects %d-seeded poisoned values wherever the poison is buried', (seed) => {
    const rng = createRng(seed);
    const observed: Partial<Record<PoisonKind, number>> = {};
    for (let iteration = 0; iteration < ITERATIONS_PER_SEED; iteration += 1) {
      const context = `seed=${seed} iteration=${iteration}`;
      const kind = pick(rng, POISON_KINDS);
      const poisoned = wrapPoison(rng, makePoison(rng, kind)) as JsonValue;
      expect(
        () => canonicalStringify(poisoned),
        `${context}: ${kind} must always be rejected`,
      ).toThrow(TypeError);
      expect(
        () => canonicalUtf8Bytes(poisoned),
        `${context}: ${kind} must always be rejected at the byte boundary`,
      ).toThrow(TypeError);
      observed[kind] = (observed[kind] ?? 0) + 1;
    }
    // Guard against silent generator degeneration: every poison family
    // must stay well represented.
    for (const kind of POISON_KINDS) {
      expect(
        observed[kind] ?? 0,
        `seed=${seed}: poison kind ${kind} was never exercised`,
      ).toBeGreaterThan(10);
    }
  });

  it('produces an identical canonical stream for a fixed seed', () => {
    const generate = (): string[] => {
      const rng = createRng(SEEDS[0]);
      return Array.from({ length: 25 }, () => canonicalStringify(makeValue(rng, 0)));
    };
    expect(generate()).toStrictEqual(generate());
  });

  it('sorts member names by code unit, including array-index-like names', () => {
    // Built through JSON.parse so integer-like keys cannot be silently
    // reordered by object-literal evaluation before the serializer runs.
    const value = JSON.parse('{"2":2,"10":1,"":3,"Z":4,"a":5,"é":6,"☃":7,"😀":8}') as JsonValue;
    expect(canonicalStringify(value)).toBe('{"":3,"10":1,"2":2,"Z":4,"a":5,"é":6,"☃":7,"😀":8}');
  });

  it('escapes lone surrogates and keeps valid surrogate pairs raw', () => {
    expect(canonicalStringify({ s: '\ud800' })).toBe('{"s":"\\ud800"}');
    expect(canonicalStringify({ s: '\udfff' })).toBe('{"s":"\\udfff"}');
    expect(canonicalStringify('😀')).toBe('"😀"');
    expect(Array.from(canonicalUtf8Bytes('😀'))).toStrictEqual([
      0x22, 0xf0, 0x9f, 0x98, 0x80, 0x22,
    ]);
    // A lone high surrogate directly followed by a low surrogate fuses into
    // one astral code point and stays raw through the round trip.
    const fused = '\ud83d' + '\ude00';
    const canonical = canonicalStringify(fused);
    expect(canonical).toBe('"😀"');
    expect(canonicalStringify(JSON.parse(canonical) as JsonValue)).toBe(canonical);
  });

  it('canonicalizes negative zero to zero at every position', () => {
    expect(canonicalStringify([-0, { z: -0 }, [-0]])).toBe('[0,{"z":0},[0]]');
  });

  it('keeps edge numbers byte-stable through the round trip', () => {
    for (const value of EDGE_NUMBERS) {
      const canonical = canonicalStringify(value);
      expect(canonicalStringify(JSON.parse(canonical) as JsonValue), `${value}`).toBe(canonical);
    }
    expect(canonicalStringify(Number.MAX_SAFE_INTEGER)).toBe('9007199254740991');
    expect(canonicalStringify(Number.MIN_VALUE)).toBe('5e-324');
  });

  it('accepts exactly 64 nested containers by default and refuses 65', () => {
    expect(() => canonicalStringify(makeChain(createRng(1), DEFAULT_MAXIMUM_DEPTH))).not.toThrow();
    expect(() => canonicalStringify(makeChain(createRng(1), DEFAULT_MAXIMUM_DEPTH + 1))).toThrow(
      RangeError,
    );
  });
});
