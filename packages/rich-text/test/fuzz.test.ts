import { describe, expect, it } from 'vitest';
import {
  parseRichTextDocument,
  projectRichText,
  type RichTextBlockProjection,
  type StudioRichTextDocument,
} from '../src/index.js';

/**
 * Deterministic seeded fuzz lane for the rich-text parser and projection
 * (TH-014). Structural mutations must be rejected with the package's
 * deliberate typed diagnostics — never an uncontrolled engine fault — and
 * projections of valid documents must satisfy the projection invariants.
 * Every failure message names the seed and iteration needed to replay it.
 */

const SEEDS = [11, 47, 2026] as const;
const VALID_ITERATIONS_PER_SEED = 120;
const MUTATION_ITERATIONS_PER_SEED = 120;

const MARK_TYPES = ['bold', 'italic', 'strike'] as const;
const TEXT_POOL = [
  'plain body copy',
  '<script>alert(1)</script>',
  '<img src=x onerror="alert(1)">',
  'javascript:alert(1)',
  '"quotes" & <b>markup</b> stay inert',
  'unicode ☃ é 🚀🚀 done',
  'line separator and \\ backslash',
] as const;

type RawNode = Record<string, unknown>;

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

function describeError(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : JSON.stringify(error);
}

/**
 * The parser's failure contract: a deliberate TypeError or RangeError whose
 * message is one of its own diagnostics (a `$`-rooted path or a document-level
 * limit). Engine faults — `Maximum call stack size exceeded`, `Cannot read
 * properties of …` — never match this shape.
 */
function isDeliberateParserError(error: unknown): boolean {
  return (
    (error instanceof TypeError || error instanceof RangeError) &&
    /^(?:\$|Rich-text |Attribute value |maximum|headingLevels)/u.test(error.message)
  );
}

// --- valid document generation -------------------------------------------

function makeMarks(rng: Rng): RawNode[] {
  const roll = rng();
  if (roll < 0.55) {
    return [];
  }
  if (roll < 0.65) {
    return [{ type: 'code' }];
  }
  const count = 1 + integer(rng, MARK_TYPES.length);
  return shuffle(rng, MARK_TYPES)
    .slice(0, count)
    .map((type) => ({ type }));
}

function makeTextNode(rng: Rng): RawNode {
  const node: RawNode = { text: pick(rng, TEXT_POOL), type: 'text' };
  const marks = makeMarks(rng);
  if (marks.length > 0 || rng() < 0.15) {
    node.marks = marks;
  }
  return node;
}

function makeInlineRun(rng: Rng, minimum: number): RawNode[] {
  const count = minimum + integer(rng, 4);
  return Array.from({ length: count }, () =>
    rng() < 0.15 ? { type: 'hardBreak' } : makeTextNode(rng),
  );
}

function makeParagraph(rng: Rng): RawNode {
  const node: RawNode = { type: 'paragraph' };
  const content = makeInlineRun(rng, 0);
  if (content.length > 0 || rng() < 0.5) {
    node.content = content;
  }
  return node;
}

function makeHeading(rng: Rng): RawNode {
  return {
    attrs: { level: pick(rng, [2, 3, 4]) },
    content: makeInlineRun(rng, 0),
    type: 'heading',
  };
}

function makeListItem(rng: Rng, depth: number): RawNode {
  const content: RawNode[] = [makeParagraph(rng)];
  if (depth < 3 && rng() < 0.3) {
    content.push(makeBlock(rng, depth + 1));
  }
  return { content, type: 'listItem' };
}

function makeList(rng: Rng, depth: number): RawNode {
  const ordered = rng() < 0.5;
  const node: RawNode = {
    content: Array.from({ length: 1 + integer(rng, 3) }, () => makeListItem(rng, depth)),
    type: ordered ? 'orderedList' : 'bulletList',
  };
  if (ordered && rng() < 0.4) {
    node.attrs = { start: 1 + integer(rng, 6) };
  }
  return node;
}

function makeBlockquote(rng: Rng, depth: number): RawNode {
  return {
    content: Array.from({ length: 1 + integer(rng, 2) }, () => makeBlock(rng, depth + 1)),
    type: 'blockquote',
  };
}

function makeBlock(rng: Rng, depth: number): RawNode {
  const roll = rng();
  if (depth >= 3 || roll < 0.4) {
    return makeParagraph(rng);
  }
  if (roll < 0.6) {
    return makeHeading(rng);
  }
  if (roll < 0.7) {
    return { type: 'horizontalRule' };
  }
  if (roll < 0.85) {
    return makeList(rng, depth);
  }
  return makeBlockquote(rng, depth);
}

function makeRawDocument(rng: Rng): RawNode {
  const first: RawNode = {
    content: [makeTextNode(rng), ...makeInlineRun(rng, 0)],
    type: 'paragraph',
  };
  const content: RawNode[] = [first];
  for (let count = integer(rng, 3); count > 0; count -= 1) {
    content.push(makeBlock(rng, 1));
  }
  return { content: shuffle(rng, content), type: 'doc' };
}

// --- oracles -------------------------------------------------------------

function isRawNode(value: unknown): value is RawNode {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function contentOf(node: RawNode): unknown[] {
  return Array.isArray(node.content) ? node.content : [];
}

interface ExpectedLeaf {
  text: string;
  type: string;
}

/** Mirrors the projection's block walk over the raw (pre-parse) document. */
function expectedLeaves(node: RawNode): ExpectedLeaf[] {
  const type = typeof node.type === 'string' ? node.type : '';
  if (type === 'paragraph' || type === 'heading') {
    let text = '';
    for (const inline of contentOf(node)) {
      if (isRawNode(inline) && inline.type === 'text' && typeof inline.text === 'string') {
        text += inline.text;
      }
    }
    return [{ text, type }];
  }
  if (type === 'horizontalRule') {
    return [{ text: '', type }];
  }
  const leaves: ExpectedLeaf[] = [];
  for (const child of contentOf(node)) {
    if (isRawNode(child)) {
      leaves.push(...expectedLeaves(child));
    }
  }
  return leaves;
}

function expectedLeavesOfDocument(raw: RawNode): ExpectedLeaf[] {
  const leaves: ExpectedLeaf[] = [];
  for (const child of contentOf(raw)) {
    if (isRawNode(child)) {
      leaves.push(...expectedLeaves(child));
    }
  }
  return leaves;
}

function codePoints(text: string): number {
  // Array.from iterates the string by Unicode code point, matching the
  // projection contract's offset unit.
  return Array.from(text).length;
}

function collectProjectionViolations(projections: readonly RichTextBlockProjection[]): string[] {
  const violations: string[] = [];
  projections.forEach((block, blockIndex) => {
    const where = `block[${blockIndex}]`;
    const length = codePoints(block.text);
    let previousEnd = 0;
    let previousKey: string | undefined;
    block.spans.forEach((span, spanIndex) => {
      const at = `${where}.spans[${spanIndex}]`;
      if (!Number.isInteger(span.start) || !Number.isInteger(span.end)) {
        violations.push(`${at} has non-integer offsets ${span.start}..${span.end}`);
      }
      if (span.start < 0 || span.end > length) {
        violations.push(`${at} range ${span.start}..${span.end} escapes text length ${length}`);
      }
      if (span.end <= span.start) {
        violations.push(`${at} is empty or inverted (${span.start}..${span.end})`);
      }
      if (span.start < previousEnd) {
        violations.push(`${at} overlaps the previous span (starts at ${span.start})`);
      }
      if (span.marks.length === 0) {
        violations.push(`${at} carries no marks`);
      }
      const sorted = [...span.marks].sort();
      if (
        span.marks.some((mark, index) => mark !== sorted[index]) ||
        new Set(span.marks).size !== span.marks.length
      ) {
        violations.push(`${at} marks are not sorted and unique: ${span.marks.join(',')}`);
      }
      const key = span.marks.join(' ');
      if (span.start === previousEnd && previousKey === key && spanIndex > 0) {
        violations.push(`${at} should have merged with the identical adjacent span`);
      }
      previousEnd = span.end;
      previousKey = key;
    });
    let previousEmbedIndex = 0;
    block.embeds.forEach((embed, embedIndex) => {
      const at = `${where}.embeds[${embedIndex}]`;
      if (!Number.isInteger(embed.index) || embed.index < 0 || embed.index > length) {
        violations.push(`${at} index ${embed.index} escapes text length ${length}`);
      }
      if (embed.index < previousEmbedIndex) {
        violations.push(`${at} index ${embed.index} decreases below ${previousEmbedIndex}`);
      }
      if (typeof embed.kind !== 'string' || embed.kind.length === 0) {
        violations.push(`${at} kind is not a non-empty string`);
      }
      previousEmbedIndex = embed.index;
    });
  });
  return violations;
}

// --- structural mutation -------------------------------------------------

interface MutationOutcome {
  mustReject: boolean;
  name: string;
}

interface MutationCandidate extends MutationOutcome {
  mutate: () => void;
}

function collectRawNodes(
  root: RawNode,
): { container?: unknown[]; index?: number; node: RawNode }[] {
  const nodes: { container?: unknown[]; index?: number; node: RawNode }[] = [{ node: root }];
  const visit = (node: RawNode): void => {
    const content = Array.isArray(node.content) ? node.content : undefined;
    if (content === undefined) {
      return;
    }
    content.forEach((child, index) => {
      if (isRawNode(child)) {
        nodes.push({ container: content, index, node: child });
        visit(child);
      }
    });
  };
  visit(root);
  return nodes;
}

function definePollutingMember(target: object, rng: Rng): void {
  Object.defineProperty(target, pick(rng, ['__proto__', 'constructor', 'prototype']), {
    configurable: true,
    enumerable: true,
    value: JSON.parse('{"polluted":true}') as unknown,
    writable: true,
  });
}

function mutateDocument(raw: RawNode, rng: Rng): MutationOutcome {
  const refs = collectRawNodes(raw);
  const nodes = refs.map((ref) => ref.node);
  const ofType = (type: string): RawNode[] => nodes.filter((node) => node.type === type);
  const textNodes = ofType('text');
  const paragraphs = ofType('paragraph');
  const headings = ofType('heading');
  const orderedLists = ofType('orderedList');
  const hardBreaks = ofType('hardBreak');
  const containers = nodes.filter(
    (node) =>
      typeof node.type === 'string' &&
      ['blockquote', 'bulletList', 'listItem', 'orderedList'].includes(node.type),
  );
  const parented = refs.filter((ref) => ref.container !== undefined && ref.index !== undefined);
  const withContentArray = nodes.filter((node) => Array.isArray(node.content));

  const candidates: MutationCandidate[] = [
    {
      mustReject: true,
      mutate: () => {
        delete pick(rng, nodes).type;
      },
      name: 'drop-required-type',
    },
    {
      mustReject: true,
      mutate: () => {
        pick(rng, nodes).type = pick(rng, [42, null, true, {}, ['paragraph']] as const);
      },
      name: 'retype-type-member',
    },
    {
      mustReject: true,
      mutate: () => {
        pick(rng, nodes).type = pick(rng, ['image', 'iframe', 'codeBlock', 'span']);
      },
      name: 'unknown-node-kind',
    },
    {
      mustReject: true,
      mutate: () => {
        pick(rng, nodes).unexpected = pick(rng, [true, 'x', 1] as const);
      },
      name: 'inject-unknown-node-member',
    },
    {
      mustReject: true,
      mutate: () => {
        definePollutingMember(pick(rng, nodes), rng);
      },
      name: 'inject-prototype-polluting-node-member',
    },
    {
      mustReject: true,
      mutate: () => {
        raw.content = [];
      },
      name: 'truncate-document-content',
    },
  ];
  if (textNodes.length > 0) {
    candidates.push(
      {
        mustReject: true,
        mutate: () => {
          delete pick(rng, textNodes).text;
        },
        name: 'drop-required-text',
      },
      {
        mustReject: true,
        mutate: () => {
          pick(rng, textNodes).text = '';
        },
        name: 'empty-text',
      },
      {
        mustReject: true,
        mutate: () => {
          pick(rng, textNodes).text = pick(rng, [7, null, {}, ['x'], true] as const);
        },
        name: 'retype-text-member',
      },
      {
        mustReject: true,
        mutate: () => {
          pick(rng, textNodes).marks = 'bold';
        },
        name: 'retype-marks-member',
      },
      {
        mustReject: true,
        mutate: () => {
          pick(rng, textNodes).marks = ['bold'];
        },
        name: 'mark-entry-not-an-object',
      },
      {
        mustReject: true,
        mutate: () => {
          pick(rng, textNodes).marks = [{ type: pick(rng, ['link', 'underline', 'font']) }];
        },
        name: 'disallowed-mark-kind',
      },
      {
        mustReject: true,
        mutate: () => {
          pick(rng, textNodes).marks = [{ type: 'bold' }, { type: 'bold' }];
        },
        name: 'duplicate-marks',
      },
      {
        mustReject: true,
        mutate: () => {
          pick(rng, textNodes).marks = [{ type: 'code' }, { type: pick(rng, MARK_TYPES) }];
        },
        name: 'code-mark-combination',
      },
      {
        mustReject: true,
        mutate: () => {
          pick(rng, textNodes).marks = [{ href: 'https://example.test', type: 'bold' }];
        },
        name: 'inject-unknown-mark-member',
      },
      {
        mustReject: true,
        mutate: () => {
          pick(rng, textNodes).marks = [
            { type: 'bold' },
            { type: 'italic' },
            { type: 'strike' },
            { type: 'code' },
            { type: 'bold' },
          ];
        },
        name: 'excess-marks-per-node',
      },
      {
        mustReject: true,
        mutate: () => {
          pick(rng, textNodes).type = 'paragraph';
        },
        name: 'swap-text-to-paragraph',
      },
    );
  }
  if (paragraphs.length > 0) {
    candidates.push(
      {
        mustReject: true,
        mutate: () => {
          pick(rng, paragraphs).type = 'heading';
        },
        name: 'swap-paragraph-to-heading',
      },
      {
        mustReject: true,
        mutate: () => {
          pick(rng, paragraphs).type = 'text';
        },
        name: 'swap-paragraph-to-text',
      },
      {
        mustReject: true,
        mutate: () => {
          pick(rng, paragraphs).attrs = { level: 2 };
        },
        name: 'attrs-on-paragraph',
      },
      {
        mustReject: true,
        mutate: () => {
          pick(rng, paragraphs).marks = [{ type: 'bold' }];
        },
        name: 'marks-on-paragraph',
      },
    );
    const truncatable = paragraphs.filter(
      (node) => Array.isArray(node.content) && node.content.length > 0,
    );
    if (truncatable.length > 0) {
      candidates.push({
        mustReject: false,
        mutate: () => {
          pick(rng, truncatable).content = [];
        },
        name: 'truncate-paragraph-content',
      });
    }
  }
  if (headings.length > 0) {
    candidates.push(
      {
        mustReject: true,
        mutate: () => {
          pick(rng, headings).type = 'paragraph';
        },
        name: 'swap-heading-to-paragraph',
      },
      {
        mustReject: true,
        mutate: () => {
          pick(rng, headings).attrs = { level: 2, onclick: 'alert(1)' };
        },
        name: 'inject-unknown-attribute',
      },
      {
        mustReject: true,
        mutate: () => {
          pick(rng, headings).attrs = { level: pick(rng, [1, 5, 6, 2.5, '3', null] as const) };
        },
        name: 'out-of-profile-heading-level',
      },
      {
        mustReject: true,
        mutate: () => {
          const heading = pick(rng, headings);
          const attrs = isRawNode(heading.attrs) ? heading.attrs : {};
          heading.attrs = attrs;
          definePollutingMember(attrs, rng);
        },
        name: 'inject-prototype-polluting-attribute',
      },
    );
  }
  if (orderedLists.length > 0) {
    candidates.push({
      mustReject: true,
      mutate: () => {
        pick(rng, orderedLists).attrs = { start: pick(rng, [0, -1, 1.5, '2'] as const) };
      },
      name: 'invalid-ordered-list-start',
    });
  }
  if (hardBreaks.length > 0) {
    candidates.push({
      mustReject: true,
      mutate: () => {
        pick(rng, hardBreaks).type = 'text';
      },
      name: 'swap-hard-break-to-text',
    });
  }
  if (containers.length > 0) {
    candidates.push({
      mustReject: true,
      mutate: () => {
        pick(rng, containers).content = [];
      },
      name: 'truncate-container-content',
    });
    const listItems = ofType('listItem');
    if (listItems.length > 0) {
      candidates.push({
        mustReject: true,
        mutate: () => {
          pick(rng, listItems).type = 'paragraph';
        },
        name: 'swap-list-item-to-paragraph',
      });
    }
  }
  if (parented.length > 0) {
    candidates.push({
      mustReject: true,
      mutate: () => {
        const ref = pick(rng, parented);
        if (ref.container !== undefined && ref.index !== undefined) {
          ref.container[ref.index] = pick(rng, [null, 42, 'node', [], true] as const);
        }
      },
      name: 'replace-node-with-non-record',
    });
  }
  if (withContentArray.length > 0) {
    candidates.push(
      {
        mustReject: true,
        mutate: () => {
          const content = pick(rng, withContentArray).content as unknown[];
          content[content.length + 1] = { type: 'paragraph' };
        },
        name: 'sparse-content-array',
      },
      {
        mustReject: true,
        mutate: () => {
          const content = pick(rng, withContentArray).content as unknown[];
          Object.defineProperty(content, 'extra', {
            configurable: true,
            enumerable: true,
            value: 1,
            writable: true,
          });
        },
        name: 'content-array-extra-member',
      },
      {
        mustReject: true,
        mutate: () => {
          pick(rng, withContentArray).content = pick(rng, ['nope', 42, {}] as const);
        },
        name: 'retype-content-member',
      },
    );
  }
  const candidate = pick(rng, candidates);
  candidate.mutate();
  return { mustReject: candidate.mustReject, name: candidate.name };
}

// --- suites --------------------------------------------------------------

describe('rich-text fuzzing (TH-014)', () => {
  it.each([...SEEDS])(
    'projects %d-seeded valid documents within the projection invariants',
    (seed) => {
      const rng = createRng(seed);
      for (let iteration = 0; iteration < VALID_ITERATIONS_PER_SEED; iteration += 1) {
        const raw = makeRawDocument(rng);
        const context = `seed=${seed} iteration=${iteration}`;
        const expected = expectedLeavesOfDocument(raw);

        let parsed: StudioRichTextDocument | undefined;
        try {
          parsed = parseRichTextDocument(raw);
        } catch (error) {
          expect.fail(
            `${context}: the parser rejected a generator-valid document: ${describeError(error)}`,
          );
        }
        if (parsed === undefined) {
          return;
        }
        deepFreeze(parsed);
        expect(
          parseRichTextDocument(parsed),
          `${context}: parsing is not idempotent`,
        ).toStrictEqual(parsed);

        let projections: RichTextBlockProjection[] | undefined;
        try {
          projections = projectRichText(parsed);
        } catch (error) {
          expect.fail(
            `${context}: projectRichText threw on a valid document: ${describeError(error)}`,
          );
        }
        if (projections === undefined) {
          return;
        }
        expect(
          projections.length,
          `${context}: projection emitted ${projections.length} blocks, expected ${expected.length}`,
        ).toBe(expected.length);
        projections.forEach((projection, index) => {
          const leaf = expected[index];
          if (leaf === undefined) {
            return;
          }
          expect(projection.type, `${context}: block[${index}] projected the wrong type`).toBe(
            leaf.type,
          );
          expect(
            projection.text,
            `${context}: block[${index}] text was altered (markup must pass through inert)`,
          ).toBe(leaf.text);
        });
        expect(
          collectProjectionViolations(projections),
          `${context}: the projection violated its invariants`,
        ).toStrictEqual([]);
      }
    },
  );

  it.each([...SEEDS])(
    'rejects %d-seeded structural mutations with deliberate typed diagnostics',
    (seed) => {
      const rng = createRng(seed);
      let rejected = 0;
      for (let iteration = 0; iteration < MUTATION_ITERATIONS_PER_SEED; iteration += 1) {
        const raw = makeRawDocument(rng);
        const mutation = mutateDocument(raw, rng);
        const context = `seed=${seed} iteration=${iteration} mutation=${mutation.name}`;

        let parsed: StudioRichTextDocument | undefined;
        let failure: unknown;
        let threw = false;
        try {
          parsed = parseRichTextDocument(raw);
        } catch (error) {
          failure = error;
          threw = true;
        }
        expect(
          ({} as { polluted?: unknown }).polluted,
          `${context}: prototype pollution escaped the parser`,
        ).toBeUndefined();

        if (threw) {
          rejected += 1;
          expect(
            isDeliberateParserError(failure),
            `${context}: the parser escaped with ${describeError(failure)}`,
          ).toBe(true);
          continue;
        }
        expect(
          mutation.mustReject,
          `${context}: the parser accepted a document that violates the closed shape`,
        ).toBe(false);
        if (parsed === undefined) {
          continue;
        }
        expect(
          parseRichTextDocument(parsed),
          `${context}: parsing is not idempotent after an accepted mutation`,
        ).toStrictEqual(parsed);
        let projections: RichTextBlockProjection[] | undefined;
        try {
          projections = projectRichText(parsed);
        } catch (error) {
          expect.fail(
            `${context}: projectRichText threw on an accepted document: ${describeError(error)}`,
          );
        }
        if (projections !== undefined) {
          expect(
            collectProjectionViolations(projections),
            `${context}: the projection violated its invariants`,
          ).toStrictEqual([]);
        }
      }
      // Guard against silent generator degeneration: the overwhelming
      // majority of mutations are guaranteed schema violations.
      expect(rejected, `seed=${seed}: too few rejected mutations`).toBeGreaterThan(
        Math.floor(MUTATION_ITERATIONS_PER_SEED * 0.8),
      );
    },
  );

  it('generates an identical document stream for a fixed seed', () => {
    const generate = (): string[] => {
      const rng = createRng(SEEDS[0]);
      return Array.from({ length: 10 }, () => JSON.stringify(makeRawDocument(rng)));
    };
    expect(generate()).toStrictEqual(generate());
  });

  it('passes embedded markup through the projection as inert, unevaluated text', () => {
    const payloads = [
      '<script>alert(1)</script>',
      '<img src=x onerror="alert(1)">',
      '</textarea><svg onload=alert(1)>',
      'javascript:alert(1)',
    ];
    const parsed = parseRichTextDocument({
      content: payloads.map((text) => ({
        content: [{ text, type: 'text' }],
        type: 'paragraph',
      })),
      type: 'doc',
    });
    const projections = projectRichText(parsed);
    expect(projections.map((projection) => projection.text)).toStrictEqual(payloads);
    expect(collectProjectionViolations(projections)).toStrictEqual([]);
  });

  it('rejects pathological nesting with the deliberate depth diagnostic, not a stack overflow', () => {
    let node: RawNode = { content: [{ text: 'x', type: 'text' }], type: 'paragraph' };
    for (let depth = 0; depth < 5_000; depth += 1) {
      node = { content: [node], type: 'blockquote' };
    }
    let failure: unknown;
    try {
      parseRichTextDocument({ content: [node], type: 'doc' });
      expect.fail('a 5000-deep document must not parse');
    } catch (error) {
      failure = error;
    }
    expect(isDeliberateParserError(failure), describeError(failure)).toBe(true);
    expect(describeError(failure)).toMatch(/depth limit/u);
  });
});
