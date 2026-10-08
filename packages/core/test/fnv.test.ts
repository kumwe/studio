import { describe, expect, it } from 'vitest';
import { fnv1a64Hex } from '../src/fnv.js';

const ascii = (text: string): Uint8Array => new TextEncoder().encode(text);

describe('FNV-1a 64-bit equality key', () => {
  it('matches the published FNV-1a 64-bit reference vectors', () => {
    expect(fnv1a64Hex(new Uint8Array())).toBe('cbf29ce484222325');
    expect(fnv1a64Hex(ascii('a'))).toBe('af63dc4c8601ec8c');
    expect(fnv1a64Hex(ascii('foobar'))).toBe('85944171f73967e8');
  });

  it('always yields 16 lowercase hex digits and distinguishes long inputs', () => {
    const long = new Uint8Array(300).map((_, index) => index % 256);
    const changed = long.slice();
    changed[299] = 0;
    expect(fnv1a64Hex(long)).toMatch(/^[0-9a-f]{16}$/u);
    expect(fnv1a64Hex(long)).toBe(fnv1a64Hex(long.slice()));
    expect(fnv1a64Hex(changed)).not.toBe(fnv1a64Hex(long));
  });
});
