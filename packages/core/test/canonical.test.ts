import { describe, expect, it } from 'vitest';
import type { JsonValue } from '@kumwe/studio-protocol';
import { canonicalStringify, canonicalUtf8Bytes } from '../src/index.js';

describe('canonicalStringify', () => {
  it('sorts object members by Unicode code unit at every depth', () => {
    const value: JsonValue = {
      zebra: 1,
      alpha: { c: [true, { b: 1, a: 2 }], B: 'upper sorts before lower', a: null },
    };
    expect(canonicalStringify(value)).toBe(
      '{"alpha":{"B":"upper sorts before lower","a":null,"c":[true,{"a":2,"b":1}]},"zebra":1}',
    );
  });

  it('is independent of member insertion order', () => {
    const first: JsonValue = { a: 1, b: { x: [1, 2], y: 'two' }, c: true };
    const second: JsonValue = JSON.parse('{"c":true,"b":{"y":"two","x":[1,2]},"a":1}') as JsonValue;
    expect(canonicalStringify(first)).toBe(canonicalStringify(second));
  });

  it('round-trips through JSON.parse without loss', () => {
    const value: JsonValue = {
      text: 'unicode é☃ and "quotes" and \\ backslash',
      numbers: [0, -1, 2.5, 1e21, 1e-7],
      nested: { empty: {}, list: [] },
    };
    expect(JSON.parse(canonicalStringify(value))).toStrictEqual(value);
  });

  it('canonicalizes deterministically across generated values', () => {
    let seed = 42;
    const random = (): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const generate = (depth: number): JsonValue => {
      const choice = Math.floor(random() * (depth > 3 ? 4 : 6));
      switch (choice) {
        case 0:
          return null;
        case 1:
          return random() > 0.5;
        case 2:
          return Math.floor(random() * 1_000_000) / 64;
        case 3:
          return `value-${Math.floor(random() * 100_000).toString(36)}`;
        case 4:
          return Array.from({ length: Math.floor(random() * 4) }, () => generate(depth + 1));
        default: {
          const object: Record<string, JsonValue> = {};
          for (let index = Math.floor(random() * 4); index > 0; index -= 1) {
            object[`member-${Math.floor(random() * 100).toString(36)}`] = generate(depth + 1);
          }
          return object;
        }
      }
    };

    for (let iteration = 0; iteration < 250; iteration += 1) {
      const value = generate(0);
      const canonical = canonicalStringify(value);
      const reparsed = JSON.parse(canonical) as JsonValue;
      expect(JSON.parse(canonicalStringify(reparsed))).toStrictEqual(reparsed);
      expect(canonicalStringify(reparsed)).toBe(canonical);
    }
  });

  it('canonicalizes negative zero to zero', () => {
    expect(canonicalStringify({ value: -0 })).toBe('{"value":0}');
  });

  it('drops undefined object members and rejects undefined array entries', () => {
    const withUndefined = { present: 1, absent: undefined } as unknown as JsonValue;
    expect(canonicalStringify(withUndefined)).toBe('{"present":1}');
    expect(() => canonicalStringify([undefined] as unknown as JsonValue)).toThrow(TypeError);
  });

  it('rejects non-finite numbers and non-JSON values', () => {
    expect(() => canonicalStringify(Number.NaN)).toThrow(TypeError);
    expect(() => canonicalStringify(Number.POSITIVE_INFINITY)).toThrow(TypeError);
    expect(() => canonicalStringify(new Date() as unknown as JsonValue)).toThrow();
  });

  it('rejects forbidden member names', () => {
    const polluted = JSON.parse('{"__proto__":{"x":1}}') as JsonValue;
    expect(() => canonicalStringify(polluted)).toThrow(TypeError);
  });

  it('enforces the depth limit before recursion exhausts the stack', () => {
    let value: JsonValue = 'leaf';
    for (let index = 0; index < 100; index += 1) {
      value = { nested: value };
    }
    expect(() => canonicalStringify(value)).toThrow(RangeError);
    expect(() => canonicalStringify(value, { maximumDepth: 200 })).not.toThrow();
  });

  it('produces stable UTF-8 bytes', () => {
    const bytes = canonicalUtf8Bytes({ snowman: '☃' });
    expect(new TextDecoder().decode(bytes)).toBe('{"snowman":"☃"}');
  });
});
