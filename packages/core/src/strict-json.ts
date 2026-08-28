/**
 * Parse untrusted JSON while rejecting duplicate object member names.
 * Native `JSON.parse` silently keeps the final duplicate; configuration must
 * fail closed instead so routing/authentication cannot be visually shadowed.
 */
export function parseJsonRejectingDuplicateMembers(source: string, maximumDepth = 16): unknown {
  const reader = new StrictJsonReader(source, maximumDepth);
  reader.assertValid();
  return JSON.parse(source) as unknown;
}

class StrictJsonReader {
  #cursor = 0;
  readonly #maximumDepth: number;
  readonly #numberPattern = /-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/uy;
  readonly #source: string;

  public constructor(source: string, maximumDepth: number) {
    if (!Number.isSafeInteger(maximumDepth) || maximumDepth < 1) {
      throw new RangeError('Maximum JSON depth must be a positive safe integer.');
    }
    this.#source = source;
    this.#maximumDepth = maximumDepth;
  }

  public assertValid(): void {
    this.#parseValue('', 1);
    this.#skipWhitespace();
    if (this.#cursor !== this.#source.length) {
      this.#fail('unexpected trailing content');
    }
  }

  #escapePointer(value: string): string {
    return value.replaceAll('~', '~0').replaceAll('/', '~1');
  }

  #expect(value: string): void {
    if (this.#source[this.#cursor] !== value) {
      this.#fail(`expected ${JSON.stringify(value)}`);
    }
    this.#cursor += 1;
  }

  #fail(message: string): never {
    throw new SyntaxError(`Invalid JSON: ${message} at offset ${this.#cursor}.`);
  }

  #parseArray(path: string, depth: number): void {
    this.#expect('[');
    this.#skipWhitespace();
    if (this.#source[this.#cursor] === ']') {
      this.#cursor += 1;
      return;
    }
    let index = 0;
    while (true) {
      this.#parseValue(`${path}/${index}`, depth + 1);
      index += 1;
      this.#skipWhitespace();
      if (this.#source[this.#cursor] === ']') {
        this.#cursor += 1;
        return;
      }
      this.#expect(',');
      this.#skipWhitespace();
    }
  }

  #parseLiteral(literal: string): void {
    if (this.#source.slice(this.#cursor, this.#cursor + literal.length) !== literal) {
      this.#fail('invalid token');
    }
    this.#cursor += literal.length;
  }

  #parseNumber(): void {
    this.#numberPattern.lastIndex = this.#cursor;
    const match = this.#numberPattern.exec(this.#source);
    if (match?.index !== this.#cursor) {
      this.#fail('invalid number');
    }
    this.#cursor = this.#numberPattern.lastIndex;
  }

  #parseObject(path: string, depth: number): void {
    this.#expect('{');
    this.#skipWhitespace();
    if (this.#source[this.#cursor] === '}') {
      this.#cursor += 1;
      return;
    }
    const names = new Set<string>();
    while (true) {
      if (this.#source[this.#cursor] !== '"') {
        this.#fail('object member name must be a string');
      }
      const name = this.#parseString();
      if (names.has(name)) {
        throw new SyntaxError(
          `Invalid JSON: duplicate member ${JSON.stringify(name)} at ${path || '/'}.`,
        );
      }
      names.add(name);
      this.#skipWhitespace();
      this.#expect(':');
      this.#parseValue(`${path}/${this.#escapePointer(name)}`, depth + 1);
      this.#skipWhitespace();
      if (this.#source[this.#cursor] === '}') {
        this.#cursor += 1;
        return;
      }
      this.#expect(',');
      this.#skipWhitespace();
    }
  }

  #parseString(): string {
    const start = this.#cursor;
    this.#expect('"');
    while (this.#cursor < this.#source.length) {
      const character = this.#source[this.#cursor];
      if (character === '"') {
        this.#cursor += 1;
        return JSON.parse(this.#source.slice(start, this.#cursor)) as string;
      }
      if (character === '\\') {
        this.#cursor += 1;
        const escape = this.#source[this.#cursor];
        if (escape === 'u') {
          if (!/^[0-9A-Fa-f]{4}$/u.test(this.#source.slice(this.#cursor + 1, this.#cursor + 5))) {
            this.#fail('invalid Unicode escape');
          }
          this.#cursor += 5;
          continue;
        }
        if (!'"\\/bfnrt'.includes(escape ?? '')) {
          this.#fail('invalid string escape');
        }
        this.#cursor += 1;
        continue;
      }
      if (character === undefined || character.charCodeAt(0) < 0x20) {
        this.#fail('invalid string character');
      }
      this.#cursor += 1;
    }
    this.#fail('unterminated string');
  }

  #parseValue(path: string, depth: number): void {
    this.#skipWhitespace();
    switch (this.#source[this.#cursor]) {
      case '{':
        this.#assertContainerDepth(depth);
        this.#parseObject(path, depth);
        return;
      case '[':
        this.#assertContainerDepth(depth);
        this.#parseArray(path, depth);
        return;
      case '"':
        this.#parseString();
        return;
      case 't':
        this.#parseLiteral('true');
        return;
      case 'f':
        this.#parseLiteral('false');
        return;
      case 'n':
        this.#parseLiteral('null');
        return;
      default:
        this.#parseNumber();
    }
  }

  #assertContainerDepth(depth: number): void {
    if (depth > this.#maximumDepth) {
      throw new SyntaxError(
        `Invalid JSON: document exceeds maximum depth ${String(this.#maximumDepth)}.`,
      );
    }
  }

  #skipWhitespace(): void {
    while (true) {
      const character = this.#source[this.#cursor];
      if (character !== ' ' && character !== '\t' && character !== '\n' && character !== '\r') {
        return;
      }
      this.#cursor += 1;
    }
  }
}
