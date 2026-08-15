import type { JsonValue } from '@kumwe/studio-protocol';

export interface CanonicalSerializationOptions {
  maximumDepth?: number;
}

const DEFAULT_MAXIMUM_DEPTH = 64;

/**
 * Serialize a bounded JSON value into the canonical cross-language form the
 * portability contract defines for checksums: UTF-8 JSON, object members
 * sorted by Unicode code unit, arrays in semantic order, minimal ECMA-404
 * string escaping, and finite numbers only. Every conforming runtime MUST
 * produce byte-identical output for the same value.
 */
export function canonicalStringify(
  value: JsonValue,
  options: Readonly<CanonicalSerializationOptions> = {},
): string {
  const maximumDepth = options.maximumDepth ?? DEFAULT_MAXIMUM_DEPTH;
  if (!Number.isInteger(maximumDepth) || maximumDepth < 1) {
    throw new RangeError('Canonical serialization depth must be a positive integer.');
  }
  return serialize(value, maximumDepth, 0);
}

/**
 * The canonical UTF-8 bytes of a value; checksums in Studio contracts are
 * computed over exactly these bytes with the algorithm the referencing
 * contract names (SRI-style sha256 unless stated otherwise). Encoding is
 * implemented locally so the core stays free of DOM and platform globals.
 */
export function canonicalUtf8Bytes(
  value: JsonValue,
  options: Readonly<CanonicalSerializationOptions> = {},
): Uint8Array {
  const text = canonicalStringify(value, options);
  const bytes: number[] = [];
  for (const character of text) {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined) {
      break;
    }
    if (codePoint <= 0x7f) {
      bytes.push(codePoint);
    } else if (codePoint <= 0x7ff) {
      bytes.push(0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f));
    } else if (codePoint <= 0xffff) {
      bytes.push(
        0xe0 | (codePoint >> 12),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f),
      );
    } else {
      bytes.push(
        0xf0 | (codePoint >> 18),
        0x80 | ((codePoint >> 12) & 0x3f),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f),
      );
    }
  }
  return Uint8Array.from(bytes);
}

function serialize(value: JsonValue, maximumDepth: number, depth: number): string {
  if (value === null) {
    return 'null';
  }
  switch (typeof value) {
    case 'boolean':
      return value ? 'true' : 'false';
    case 'number': {
      if (!Number.isFinite(value)) {
        throw new TypeError('Canonical JSON cannot represent a non-finite number.');
      }
      // JSON.stringify implements the deterministic ECMAScript number
      // grammar; Object.is separates -0, which canonicalizes to 0.
      return JSON.stringify(Object.is(value, -0) ? 0 : value);
    }
    case 'string':
      return JSON.stringify(value);
    case 'object':
      break;
    default:
      throw new TypeError(`Canonical JSON cannot represent a ${typeof value} value.`);
  }

  if (depth >= maximumDepth) {
    throw new RangeError(`Canonical serialization exceeds the depth limit of ${maximumDepth}.`);
  }

  if (Array.isArray(value)) {
    const items = value.map((item) => {
      if (item === undefined) {
        throw new TypeError('Canonical JSON arrays cannot contain undefined entries.');
      }
      return serialize(item, maximumDepth, depth + 1);
    });
    return `[${items.join(',')}]`;
  }

  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError('Canonical JSON only serializes plain objects and arrays.');
  }

  const members = Object.keys(value).sort(compareCodeUnits);
  const parts: string[] = [];
  for (const member of members) {
    if (member === '__proto__' || member === 'prototype' || member === 'constructor') {
      throw new TypeError(`Canonical JSON forbids the object member name ${member}.`);
    }
    const memberValue = value[member];
    if (memberValue === undefined) {
      continue;
    }
    parts.push(`${JSON.stringify(member)}:${serialize(memberValue, maximumDepth, depth + 1)}`);
  }
  return `{${parts.join(',')}}`;
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
