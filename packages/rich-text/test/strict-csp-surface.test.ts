import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  parseRichTextDocument,
  StudioRichTextEditorFactory,
  StudioStrictCspRichTextSurfaceAdapter,
  type StudioRichTextDocument,
} from '../src/index.js';

const INITIAL: StudioRichTextDocument = {
  content: [
    {
      content: [{ text: 'Strict content', type: 'text' }],
      type: 'paragraph',
    },
  ],
  type: 'doc',
};

const ADVANCED = parseRichTextDocument(
  (
    JSON.parse(
      readFileSync(
        join(process.cwd(), 'schemas/conformance/rich-text/advanced.first-party.json'),
        'utf8',
      ),
    ) as { document: unknown }
  ).document,
);

const MINIMAL = parseRichTextDocument({
  content: [
    { type: 'paragraph' },
    { attrs: { level: 2 }, type: 'heading' },
    { content: [{ type: 'paragraph' }], type: 'blockquote' },
    {
      content: [{ content: [{ type: 'paragraph' }], type: 'listItem' }],
      type: 'bulletList',
    },
  ],
  type: 'doc',
});

const EXPLICIT_EMPTY_MARKS = parseRichTextDocument({
  content: [
    {
      content: [{ marks: [], text: 'Paragraph', type: 'text' }],
      type: 'paragraph',
    },
    {
      attrs: { level: 2 },
      content: [{ marks: [], text: 'Heading', type: 'text' }],
      type: 'heading',
    },
    {
      content: [
        {
          content: [{ marks: [], text: 'Quote', type: 'text' }],
          type: 'paragraph',
        },
      ],
      type: 'blockquote',
    },
    {
      content: [
        {
          content: [
            {
              content: [{ marks: [], text: 'List', type: 'text' }],
              type: 'paragraph',
            },
          ],
          type: 'listItem',
        },
      ],
      type: 'orderedList',
    },
    {
      content: [
        {
          attrs: { checked: true, level: 0 },
          content: [{ marks: [], text: 'Checklist', type: 'text' }],
          type: 'checklistItem',
        },
      ],
      type: 'checklist',
    },
    {
      attrs: { header: false },
      content: [
        {
          content: [
            {
              content: [{ marks: [], text: 'Table', type: 'text' }],
              type: 'tableCell',
            },
          ],
          type: 'tableRow',
        },
      ],
      type: 'table',
    },
    {
      attrs: { tone: 'warning' },
      content: [
        {
          content: [{ marks: [], text: 'Callout', type: 'text' }],
          type: 'paragraph',
        },
      ],
      type: 'callout',
    },
  ],
  type: 'doc',
});

describe('Studio strict-CSP rich-text surface', () => {
  it('snapshots the advanced first-party corpus without semantic loss', async () => {
    const holder = document.createElement('div');
    document.body.append(holder);
    const editor = await new StudioRichTextEditorFactory(
      new StudioStrictCspRichTextSurfaceAdapter(),
    ).create({ holder, value: ADVANCED });

    expect(await editor.save()).toEqual(ADVANCED);
    expect(holder.querySelector('style,script,[style]')).toBeNull();

    editor.destroy();
    holder.remove();
  });

  it('preserves optional-field absence in a minimal read-only snapshot', async () => {
    const holder = document.createElement('div');
    document.body.append(holder);
    const editor = await new StudioRichTextEditorFactory(
      new StudioStrictCspRichTextSurfaceAdapter(),
    ).create({ holder, readOnly: true, value: MINIMAL });

    expect(await editor.save()).toEqual(MINIMAL);
    expect(holder.querySelector('style,script,[style]')).toBeNull();

    editor.destroy();
    holder.remove();
  });

  it.each([false, true])(
    'preserves explicit-empty inline fields in strict-CSP snapshots (readOnly=%s)',
    async (readOnly) => {
      const holder = document.createElement('div');
      document.body.append(holder);
      const editor = await new StudioRichTextEditorFactory(
        new StudioStrictCspRichTextSurfaceAdapter(),
      ).create({ holder, readOnly, value: EXPLICIT_EMPTY_MARKS });

      expect(await editor.save()).toEqual(EXPLICIT_EMPTY_MARKS);

      editor.destroy();
      holder.remove();
    },
  );

  it('authors every first-party block without creating style or HTML-string sinks', async () => {
    const holder = document.createElement('div');
    document.body.append(holder);
    const styleCount = document.head.querySelectorAll('style').length;
    const changes: StudioRichTextDocument[] = [];
    const editor = await new StudioRichTextEditorFactory(
      new StudioStrictCspRichTextSurfaceAdapter(),
    ).create({
      holder,
      onChange: (change) => {
        if (change.valid) changes.push(change.value);
      },
      value: INITIAL,
    });

    const paragraph = holder.querySelector<HTMLElement>('[aria-label="Paragraph"]');
    const text = paragraph?.firstChild;
    if (paragraph === null || paragraph === undefined || text === null || text === undefined) {
      throw new Error('Missing editable strict rich-text paragraph.');
    }
    const range = document.createRange();
    range.selectNodeContents(text);
    const selection = globalThis.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    holder.querySelector<HTMLButtonElement>('[aria-label="Bold selected text"]')?.click();
    expect((await editor.save()).content[0]?.content?.[0]?.marks).toEqual([{ type: 'bold' }]);

    for (const type of [
      'callout',
      'checklist',
      'code',
      'delimiter',
      'header',
      'list',
      'quote',
      'table',
    ]) {
      const select = holder.querySelector<HTMLSelectElement>('[aria-label="Rich text block type"]');
      const add = holder.querySelector<HTMLButtonElement>('[aria-label="Add rich text block"]');
      if (select === null || add === null) throw new Error('Missing strict rich-text toolbar.');
      select.value = type;
      add.click();
    }

    const value = await editor.save();
    expect(value.content.map((node) => node.type)).toEqual([
      'paragraph',
      'callout',
      'checklist',
      'codeBlock',
      'horizontalRule',
      'heading',
      'bulletList',
      'blockquote',
      'table',
    ]);
    expect(changes).toHaveLength(9);
    expect(holder.querySelector('[data-studio-rich-text-surface="strict-csp"]')).not.toBeNull();
    expect(holder.querySelector('style,script,[style]')).toBeNull();
    expect(document.head.querySelectorAll('style')).toHaveLength(styleCount);

    holder.querySelector<HTMLButtonElement>('[aria-label="Move block down"]')?.click();
    expect((await editor.save()).content.slice(0, 2).map((node) => node.type)).toEqual([
      'callout',
      'paragraph',
    ]);
    holder.querySelector<HTMLButtonElement>('[aria-label="Remove block"]')?.click();
    expect((await editor.save()).content[0]?.type).toBe('paragraph');

    await editor.replace(INITIAL);
    expect(await editor.save()).toEqual(INITIAL);
    editor.focus();
    expect(holder.contains(document.activeElement)).toBe(true);
    editor.destroy();
    expect(holder.childElementCount).toBe(0);
    holder.remove();
  });

  it('keeps host-resolved content inspectable and immutable', async () => {
    const holder = document.createElement('div');
    document.body.append(holder);
    const editor = await new StudioRichTextEditorFactory(
      new StudioStrictCspRichTextSurfaceAdapter(),
    ).create({
      binding: {
        onError: 'error',
        onNull: 'empty',
        source: { key: 'host/current-entry', kind: 'context-value' },
        transforms: [],
      },
      holder,
      value: INITIAL,
    });

    expect(editor.readOnly).toBe(true);
    expect(holder.querySelector('[aria-label="Add rich text block"]')).toBeNull();
    expect(holder.querySelector('[aria-label="Remove block"]')).toBeNull();
    expect(holder.querySelector('[contenteditable="true"]')).toBeNull();
    expect(
      [
        ...holder.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
          'input,select,textarea',
        ),
      ].every((control) => control.disabled),
    ).toBe(true);
    expect(await editor.save()).toEqual(INITIAL);
    editor.destroy();
    holder.remove();
  });
});
