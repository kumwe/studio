import { describe, expect, it } from 'vitest';
import { getSchema } from '@tiptap/core';
import {
  createStudioRichTextExtensions,
  DEFAULT_RICH_TEXT_PROFILE,
  isRichTextDocumentEmpty,
  parseRichTextDocument,
} from '../src/index.js';

describe('Studio rich text', () => {
  it('normalizes a valid portable document', () => {
    const document = parseRichTextDocument({
      content: [{ content: [{ text: 'Hello', type: 'text' }], type: 'paragraph' }],
      type: 'doc',
    });

    expect(document.content[0]?.type).toBe('paragraph');
    expect(isRichTextDocumentEmpty(document)).toBe(false);
  });

  it('rejects non-JSON attributes', () => {
    expect(() =>
      parseRichTextDocument({ attrs: { unsafe: undefined }, content: [], type: 'doc' }),
    ).toThrow(/JSON-compatible/u);
  });

  it('configures StarterKit to match the portable node and mark profile', () => {
    const extensions = createStudioRichTextExtensions();
    const schema = getSchema(extensions);

    expect(extensions).toHaveLength(1);
    expect(extensions[0]?.options).toMatchObject({
      codeBlock: false,
      link: false,
      underline: false,
    });
    expect(Object.keys(schema.nodes).sort()).toEqual([
      'blockquote',
      'bulletList',
      'doc',
      'hardBreak',
      'heading',
      'horizontalRule',
      'listItem',
      'orderedList',
      'paragraph',
      'text',
    ]);
    expect(Object.keys(schema.marks).sort()).toEqual(['bold', 'code', 'italic', 'strike']);
  });

  it('rejects the same empty and conflicting structures as the configured schema', () => {
    const schema = getSchema(createStudioRichTextExtensions());
    const invalidDocuments = [
      { content: [], type: 'doc' },
      {
        content: [{ content: [{ text: '', type: 'text' }], type: 'paragraph' }],
        type: 'doc',
      },
      {
        content: [
          {
            content: [
              { marks: [{ type: 'bold' }, { type: 'bold' }], text: 'duplicate', type: 'text' },
            ],
            type: 'paragraph',
          },
        ],
        type: 'doc',
      },
      {
        content: [
          {
            content: [
              { marks: [{ type: 'code' }, { type: 'italic' }], text: 'conflict', type: 'text' },
            ],
            type: 'paragraph',
          },
        ],
        type: 'doc',
      },
    ];

    for (const document of invalidDocuments) {
      expect(() => parseRichTextDocument(document)).toThrow();
      expect(() => schema.nodeFromJSON(document).check()).toThrow();
    }
  });

  it('rejects node types outside the secure profile', () => {
    expect(() => parseRichTextDocument({ content: [{ type: 'image' }], type: 'doc' })).toThrow(
      /disallowed node/u,
    );
  });

  it('rejects unknown structural keys on nodes and marks', () => {
    expect(() => parseRichTextDocument({ content: [], type: 'doc', unexpected: true })).toThrow(
      /not a recognized rich-text key/u,
    );
    expect(() =>
      parseRichTextDocument({
        content: [
          {
            marks: [{ href: 'https://example.test', type: 'bold' }],
            text: 'Hello',
            type: 'text',
          },
        ],
        type: 'doc',
      }),
    ).toThrow(/not a recognized rich-text key/u);
  });

  it.each([
    {
      expected: /text is not valid on a doc node/u,
      value: { content: [], text: 'bad', type: 'doc' },
    },
    {
      expected: /text is required for a text node/u,
      value: { content: [{ type: 'text' }], type: 'doc' },
    },
    {
      expected: /text is not valid on a paragraph node/u,
      value: { content: [{ text: 'bad', type: 'paragraph' }], type: 'doc' },
    },
    {
      expected: /configured heading level/u,
      value: { content: [{ attrs: { level: 'bad' }, type: 'heading' }], type: 'doc' },
    },
    {
      expected: /marks is not valid on a paragraph node/u,
      value: { content: [{ marks: [], type: 'paragraph' }], type: 'doc' },
    },
    {
      expected: /must begin with a paragraph/u,
      value: {
        content: [
          {
            content: [{ content: [{ type: 'horizontalRule' }], type: 'listItem' }],
            type: 'bulletList',
          },
        ],
        type: 'doc',
      },
    },
    {
      expected: /positive integer/u,
      value: {
        content: [
          {
            attrs: { start: 0 },
            content: [{ content: [{ content: [], type: 'paragraph' }], type: 'listItem' }],
            type: 'orderedList',
          },
        ],
        type: 'doc',
      },
    },
  ])('enforces the portable document grammar: $expected', ({ expected, value }) => {
    expect(() => parseRichTextDocument(value)).toThrow(expected);
  });

  it('enforces profile limits', () => {
    expect(() =>
      parseRichTextDocument(
        { content: [{ text: 'too long', type: 'text' }], type: 'doc' },
        {
          allowedAttributes: {},
          allowedMarks: [],
          allowedNodes: ['doc', 'text'],
          maximumDepth: 2,
          maximumNodes: 2,
          maximumTextLength: 3,
        },
      ),
    ).toThrow(/text-length/u);
  });

  it('rejects prototype-polluting attribute keys', () => {
    const value: unknown = JSON.parse(
      '{"type":"doc","content":[{"type":"heading","attrs":{"level":{"nested":{"__proto__":{"polluted":true}}}}}]}',
    );
    expect(() => parseRichTextDocument(value)).toThrow(/forbidden object key/u);
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });

  it.each([
    {
      attributeLimits: { maximumDepth: 2 },
      expected: /attribute depth limit/u,
      value: { nested: { tooDeep: true } },
    },
    {
      attributeLimits: { maximumPropertiesPerObject: 1 },
      expected: /attribute property limit/u,
      value: { first: true, second: true },
    },
    {
      attributeLimits: { maximumItemsPerArray: 1 },
      expected: /attribute item limit/u,
      value: ['first', 'second'],
    },
    {
      attributeLimits: { maximumStringLength: 5 },
      expected: /attribute string limit/u,
      value: 'longer',
    },
    {
      attributeLimits: { maximumStringLength: 100, maximumTotalBytes: 12 },
      expected: /total-byte limit/u,
      value: 'large-enough',
    },
  ])('bounds nested attribute JSON: $expected', ({ attributeLimits, expected, value }) => {
    expect(() =>
      parseRichTextDocument(
        { content: [{ attrs: { level: value }, type: 'heading' }], type: 'doc' },
        { ...DEFAULT_RICH_TEXT_PROFILE, attributeLimits },
      ),
    ).toThrow(expected);
  });

  it('bounds marks per node and across the document', () => {
    const markedText = (text: string): object => ({
      marks: [{ type: 'bold' }],
      text,
      type: 'text',
    });
    expect(() =>
      parseRichTextDocument(
        {
          content: [
            {
              content: [{ marks: [{ type: 'bold' }, { type: 'italic' }], text: 'x', type: 'text' }],
              type: 'paragraph',
            },
          ],
          type: 'doc',
        },
        { ...DEFAULT_RICH_TEXT_PROFILE, maximumMarks: 10, maximumMarksPerNode: 1 },
      ),
    ).toThrow(/per-node mark limit/u);

    expect(() =>
      parseRichTextDocument(
        {
          content: [{ content: [markedText('first'), markedText('second')], type: 'paragraph' }],
          type: 'doc',
        },
        { ...DEFAULT_RICH_TEXT_PROFILE, maximumMarks: 1, maximumMarksPerNode: 1 },
      ),
    ).toThrow(/aggregate mark limit/u);
  });

  it('enforces a total portable-document byte limit', () => {
    expect(() =>
      parseRichTextDocument(
        {
          content: [{ content: [{ text: 'x'.repeat(100), type: 'text' }], type: 'paragraph' }],
          type: 'doc',
        },
        { ...DEFAULT_RICH_TEXT_PROFILE, maximumDocumentBytes: 64 },
      ),
    ).toThrow(/total-byte limit/u);
  });

  it('rejects attempts to raise recursive safety ceilings before parsing deep input', () => {
    let node: Record<string, unknown> = { type: 'paragraph' };
    for (let depth = 0; depth < 20_000; depth += 1) {
      node = { content: [node], type: 'blockquote' };
    }
    const deeplyNested = { content: [node], type: 'doc' };

    expect(() =>
      parseRichTextDocument(deeplyNested, {
        ...DEFAULT_RICH_TEXT_PROFILE,
        maximumDepth: 50_000,
        maximumNodes: 50_000,
      }),
    ).toThrow(/maximumDepth exceeds the immutable safety ceiling/u);
  });

  it.each([
    { maximumDocumentBytes: 10_485_761 },
    { maximumMarks: 400_001 },
    { maximumMarksPerNode: 5 },
    { maximumNodes: 100_001 },
    { maximumTextLength: 10_485_761 },
  ])('rejects profile values above immutable resource ceilings: %o', (override) => {
    expect(() =>
      parseRichTextDocument(
        { content: [{ type: 'paragraph' }], type: 'doc' },
        { ...DEFAULT_RICH_TEXT_PROFILE, ...override },
      ),
    ).toThrow(/immutable safety ceiling/u);
  });

  it('rejects attribute limits above immutable resource ceilings', () => {
    expect(() =>
      parseRichTextDocument(
        { content: [{ type: 'paragraph' }], type: 'doc' },
        {
          ...DEFAULT_RICH_TEXT_PROFILE,
          attributeLimits: { maximumDepth: 33 },
        },
      ),
    ).toThrow(/maximumDepth exceeds the immutable safety ceiling/u);
  });
});
