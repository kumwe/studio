/**
 * Validate raw JSON syntax while rejecting duplicate object member names.
 * `JSON.parse` silently keeps the final duplicate, which is unsafe for
 * canonical contract sources because reviewers may reason about a different
 * member than runtimes consume.
 */
export function assertNoDuplicateJsonMembers(source, label = 'JSON document', maximumDepth = 256) {
  if (typeof source !== 'string') {
    throw new TypeError('JSON source must be a string.');
  }
  if (!Number.isSafeInteger(maximumDepth) || maximumDepth < 1) {
    throw new RangeError('Maximum JSON depth must be a positive safe integer.');
  }
  let cursor = 0;

  function fail(message) {
    throw new SyntaxError(`${label}: ${message} at byte ${cursor}.`);
  }

  function skipWhitespace() {
    while (/\s/u.test(source[cursor] ?? '')) {
      cursor += 1;
    }
  }

  function expect(value) {
    if (source[cursor] !== value) {
      fail(`expected ${JSON.stringify(value)}`);
    }
    cursor += 1;
  }

  function parseString() {
    const start = cursor;
    expect('"');
    while (cursor < source.length) {
      const character = source[cursor];
      if (character === '"') {
        cursor += 1;
        return JSON.parse(source.slice(start, cursor));
      }
      if (character === '\\') {
        cursor += 1;
        const escape = source[cursor];
        if (escape === 'u') {
          if (!/^[0-9A-Fa-f]{4}$/u.test(source.slice(cursor + 1, cursor + 5))) {
            fail('invalid Unicode escape');
          }
          cursor += 5;
          continue;
        }
        if (!'"\\/bfnrt'.includes(escape ?? '')) {
          fail('invalid string escape');
        }
        cursor += 1;
        continue;
      }
      if (character === undefined || character.charCodeAt(0) < 0x20) {
        fail('invalid string character');
      }
      cursor += 1;
    }
    fail('unterminated string');
  }

  function parseObject(path, depth) {
    expect('{');
    skipWhitespace();
    if (source[cursor] === '}') {
      cursor += 1;
      return;
    }
    const names = new Set();
    while (true) {
      if (source[cursor] !== '"') {
        fail('object member name must be a string');
      }
      const name = parseString();
      if (names.has(name)) {
        throw new SyntaxError(
          `${label}: duplicate member ${JSON.stringify(name)} at ${path || '/'}.`,
        );
      }
      names.add(name);
      skipWhitespace();
      expect(':');
      parseValue(`${path}/${escapePointer(name)}`, depth + 1);
      skipWhitespace();
      if (source[cursor] === '}') {
        cursor += 1;
        return;
      }
      expect(',');
      skipWhitespace();
    }
  }

  function parseArray(path, depth) {
    expect('[');
    skipWhitespace();
    if (source[cursor] === ']') {
      cursor += 1;
      return;
    }
    let index = 0;
    while (true) {
      parseValue(`${path}/${index}`, depth + 1);
      index += 1;
      skipWhitespace();
      if (source[cursor] === ']') {
        cursor += 1;
        return;
      }
      expect(',');
      skipWhitespace();
    }
  }

  function parseLiteral(literal) {
    if (source.slice(cursor, cursor + literal.length) !== literal) {
      fail(`invalid token`);
    }
    cursor += literal.length;
  }

  function parseNumber() {
    const match = source
      .slice(cursor)
      .match(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/u);
    if (match === null) {
      fail('invalid number');
    }
    cursor += match[0].length;
  }

  function parseValue(path, depth) {
    skipWhitespace();
    switch (source[cursor]) {
      case '{':
        assertContainerDepth(depth);
        parseObject(path, depth);
        return;
      case '[':
        assertContainerDepth(depth);
        parseArray(path, depth);
        return;
      case '"':
        parseString();
        return;
      case 't':
        parseLiteral('true');
        return;
      case 'f':
        parseLiteral('false');
        return;
      case 'n':
        parseLiteral('null');
        return;
      default:
        parseNumber();
    }
  }

  function assertContainerDepth(depth) {
    if (depth > maximumDepth) {
      throw new SyntaxError(`${label}: document exceeds maximum depth ${String(maximumDepth)}.`);
    }
  }

  parseValue('', 1);
  skipWhitespace();
  if (cursor !== source.length) {
    fail('unexpected trailing content');
  }
}

function escapePointer(value) {
  return value.replaceAll('~', '~0').replaceAll('/', '~1');
}
