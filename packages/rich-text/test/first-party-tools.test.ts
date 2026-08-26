import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  fromStudioEditorJsBlocks,
  StudioChecklistTool,
  StudioCodeTool,
  StudioHeaderTool,
  StudioListTool,
  StudioMarkerTool,
  StudioParagraphTool,
  StudioTableTool,
  studioEditorJsTools,
  toStudioEditorJsBlocks,
} from '../src/first-party-tools.js';
import {
  parseRichTextDocument,
  projectRichText,
  type StudioRichTextDocument,
  type StudioRichTextNode,
} from '../src/index.js';

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

const STRUCTURAL_RICH_TEXT: StudioRichTextDocument = {
  content: [
    {
      content: [
        {
          content: [
            {
              content: markedInline('List'),
              type: 'paragraph',
            },
            {
              attrs: { start: 3 },
              content: [
                {
                  content: [
                    {
                      content: [
                        { marks: [{ type: 'code' }], text: 'nested', type: 'text' },
                        { type: 'hardBreak' },
                        { text: 'line', type: 'text' },
                      ],
                      type: 'paragraph',
                    },
                  ],
                  type: 'listItem',
                },
              ],
              type: 'orderedList',
            },
            {
              content: [{ text: 'Second list block', type: 'text' }],
              type: 'paragraph',
            },
          ],
          type: 'listItem',
        },
      ],
      type: 'bulletList',
    },
    {
      content: [
        {
          attrs: { checked: true, level: 2 },
          content: markedInline('Checklist'),
          type: 'checklistItem',
        },
      ],
      type: 'checklist',
    },
    {
      attrs: { header: false },
      content: [
        {
          content: [{ content: markedInline('Table'), type: 'tableCell' }],
          type: 'tableRow',
        },
      ],
      type: 'table',
    },
    {
      content: [
        {
          content: [
            { marks: [{ type: 'italic' }], text: 'Quoted', type: 'text' },
            { type: 'hardBreak' },
            { text: 'line', type: 'text' },
          ],
          type: 'paragraph',
        },
        {
          attrs: { tone: 'info' },
          content: [
            {
              content: [{ text: 'Nested callout', type: 'text' }],
              type: 'paragraph',
            },
          ],
          type: 'callout',
        },
        {
          content: [{ text: 'Final quote block', type: 'text' }],
          type: 'paragraph',
        },
      ],
      type: 'blockquote',
    },
    {
      attrs: { tone: 'success' },
      content: [
        {
          content: [
            { marks: [{ type: 'strike' }], text: 'Callout', type: 'text' },
            { type: 'hardBreak' },
            { text: 'line', type: 'text' },
          ],
          type: 'paragraph',
        },
        {
          content: [
            {
              content: [
                {
                  content: [{ text: 'Nested quote', type: 'text' }],
                  type: 'paragraph',
                },
              ],
              type: 'listItem',
            },
          ],
          type: 'bulletList',
        },
      ],
      type: 'callout',
    },
  ],
  type: 'doc',
};

const MINIMAL_RICH_TEXT = parseRichTextDocument({
  content: [
    { type: 'paragraph' },
    { attrs: { level: 2 }, type: 'heading' },
    { content: [{ type: 'paragraph' }], type: 'blockquote' },
    {
      content: [{ content: [{ type: 'paragraph' }], type: 'listItem' }],
      type: 'bulletList',
    },
    {
      content: [{ content: [{ type: 'paragraph' }], type: 'listItem' }],
      type: 'orderedList',
    },
    { type: 'horizontalRule' },
    {
      content: [{ attrs: { checked: false, level: 0 }, type: 'checklistItem' }],
      type: 'checklist',
    },
    {
      attrs: { header: false },
      content: [{ content: [{ type: 'tableCell' }], type: 'tableRow' }],
      type: 'table',
    },
    {
      attrs: { tone: 'info' },
      content: [{ type: 'paragraph' }],
      type: 'callout',
    },
    { attrs: { language: 'text' }, text: '', type: 'codeBlock' },
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
      type: 'bulletList',
    },
    {
      content: [
        {
          attrs: { checked: false, level: 0 },
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
      attrs: { tone: 'info' },
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

const MIXED_NESTED_LIST = parseRichTextDocument({
  content: [
    {
      content: [
        {
          content: [
            { content: [{ text: 'Parent', type: 'text' }], type: 'paragraph' },
            {
              content: [
                {
                  content: [
                    {
                      content: [{ text: 'Bullet child', type: 'text' }],
                      type: 'paragraph',
                    },
                  ],
                  type: 'listItem',
                },
              ],
              type: 'bulletList',
            },
            { content: [{ text: 'Middle', type: 'text' }], type: 'paragraph' },
            {
              attrs: { start: 7 },
              content: [
                {
                  content: [
                    {
                      content: [{ text: 'Ordered child', type: 'text' }],
                      type: 'paragraph',
                    },
                  ],
                  type: 'listItem',
                },
              ],
              type: 'orderedList',
            },
            { content: [{ text: 'After', type: 'text' }], type: 'paragraph' },
          ],
          type: 'listItem',
        },
        {
          content: [{ content: [{ text: 'Sibling', type: 'text' }], type: 'paragraph' }],
          type: 'listItem',
        },
      ],
      type: 'bulletList',
    },
  ],
  type: 'doc',
}).content[0];

function markedInline(prefix: string): StudioRichTextDocument['content'] {
  return [
    { marks: [{ type: 'bold' }], text: `${prefix} bold`, type: 'text' },
    { marks: [{ type: 'italic' }], text: ' italic', type: 'text' },
    { marks: [{ type: 'strike' }], text: ' strike', type: 'text' },
    { marks: [{ type: 'code' }], text: ' code', type: 'text' },
    {
      marks: [{ attrs: { tone: 'warning' }, type: 'highlight' }],
      text: ' highlight',
      type: 'text',
    },
    { type: 'hardBreak' },
    { text: 'line', type: 'text' },
  ];
}

describe('first-party Editor.js tool boundary', () => {
  it('maps every governed node through named tools without editor-native persistence', () => {
    const canonical = parseRichTextDocument(ADVANCED);
    const blocks = toStudioEditorJsBlocks(canonical);

    expect(blocks.map((block) => block.type)).toEqual(['callout', 'checklist', 'table', 'code']);
    expect(fromStudioEditorJsBlocks({ blocks, time: 123, version: 'vendor-state' })).toEqual(
      canonical,
    );
    expect(() => fromStudioEditorJsBlocks({ blocks: [{ data: {}, type: 'raw' }] })).toThrow(
      /first-party/u,
    );
  });

  it('round-trips the advanced corpus and nested first-party nodes through rendered tools', () => {
    const tools = studioEditorJsTools();
    for (const value of [ADVANCED, STRUCTURAL_RICH_TEXT, MINIMAL_RICH_TEXT]) {
      const canonical = parseRichTextDocument(value);
      for (const block of toStudioEditorJsBlocks(canonical)) {
        const Tool = tools[block.type];
        const tool = new Tool({ data: block.data });
        tool.render();
        expect(tool.save().node, `${block.type} must not discard canonical content`).toEqual(
          block.data.node,
        );
      }
    }
  });

  it.each([false, true])(
    'preserves exact explicit-empty marks across every inline-capable tool (readOnly=%s)',
    (readOnly) => {
      const tools = studioEditorJsTools();
      for (const block of toStudioEditorJsBlocks(EXPLICIT_EMPTY_MARKS)) {
        const Tool = tools[block.type];
        const tool = new Tool({ data: block.data, readOnly });
        tool.render();
        expect(tool.save().node, `${block.type} must preserve marks: []`).toEqual(block.data.node);
      }
    },
  );

  it('preserves representation only while the inline projection is unchanged', () => {
    const original: StudioRichTextNode = {
      content: [
        {
          marks: [{ attrs: { tone: 'warning' }, type: 'highlight' }],
          text: 'Original',
          type: 'text',
        },
      ],
      type: 'paragraph',
    };
    const tool = new StudioParagraphTool({ data: { node: original } });
    const field = tool.render();
    const mark = field.querySelector<HTMLElement>('mark');
    if (mark === null) throw new Error('Missing rendered semantic highlight.');
    mark.dataset.studioTone = 'success';

    expect(tool.save().node).toEqual({
      content: [
        {
          marks: [{ attrs: { tone: 'success' }, type: 'highlight' }],
          text: 'Original',
          type: 'text',
        },
      ],
      type: 'paragraph',
    });

    field.replaceChildren(document.createTextNode('Edited'));
    expect(tool.save().node).toEqual({
      content: [{ text: 'Edited', type: 'text' }],
      type: 'paragraph',
    });
  });

  it('keeps real text edits from every inline-capable tool', () => {
    const tools = studioEditorJsTools();
    for (const [index, block] of toStudioEditorJsBlocks(EXPLICIT_EMPTY_MARKS).entries()) {
      const Tool = tools[block.type];
      const tool = new Tool({ data: block.data });
      const root = tool.render();
      const field = root.matches('[contenteditable="true"]')
        ? root
        : root.querySelector<HTMLElement>('[contenteditable="true"]');
      if (field === null) throw new Error(`${block.type} is missing its inline editor.`);
      const edited = `Edited ${String(index)}`;
      field.replaceChildren(document.createTextNode(edited));

      expect(
        projectRichText({ content: [tool.save().node], type: 'doc' }).some(
          (projection) => projection.text === edited,
        ),
        `${block.type} must retain a real text edit`,
      ).toBe(true);
    }
  });

  it('retains a real hard-break edit in the semantic inline projection', () => {
    const tool = new StudioParagraphTool({
      data: {
        node: {
          content: [{ marks: [], text: 'Line one', type: 'text' }],
          type: 'paragraph',
        },
      },
    });
    const field = tool.render();
    field.append(document.createElement('br'), document.createTextNode('Line two'));

    expect(tool.save().node.content).toEqual([
      { text: 'Line one', type: 'text' },
      { type: 'hardBreak' },
      { text: 'Line two', type: 'text' },
    ]);
  });

  it('keeps every nested list boundary intact when adding an unrelated root item', () => {
    if (MIXED_NESTED_LIST === undefined) throw new Error('Missing mixed nested list fixture.');
    const tool = new StudioListTool({ data: { node: MIXED_NESTED_LIST } });
    const root = tool.render();
    root.querySelector<HTMLButtonElement>('[aria-label="Add list item"]')?.click();
    const saved = tool.save().node;

    expect(saved.content?.slice(0, 2)).toEqual(MIXED_NESTED_LIST.content);
    expect(saved.content?.[2]).toEqual({
      content: [{ type: 'paragraph' }],
      type: 'listItem',
    });
  });

  it('moves and removes a list parent together with its complete nested subtree', () => {
    if (MIXED_NESTED_LIST === undefined) throw new Error('Missing mixed nested list fixture.');
    const moving = new StudioListTool({ data: { node: MIXED_NESTED_LIST } });
    const movingRoot = moving.render();
    movingRoot
      .querySelector<HTMLButtonElement>('[data-index="0"] [aria-label="Move item down"]')
      ?.click();
    const moved = moving.save().node;
    expect(moved.content?.[0]).toEqual(MIXED_NESTED_LIST.content?.[1]);
    expect(moved.content?.[1]).toEqual(MIXED_NESTED_LIST.content?.[0]);

    const removing = new StudioListTool({ data: { node: MIXED_NESTED_LIST } });
    const removingRoot = removing.render();
    removingRoot
      .querySelector<HTMLButtonElement>('[data-index="0"] [aria-label="Remove item"]')
      ?.click();
    expect(removing.save().node.content).toEqual([MIXED_NESTED_LIST.content?.[1]]);
  });

  it('indents a root subtree without merging pre-existing nested list boundaries', () => {
    if (MIXED_NESTED_LIST === undefined) throw new Error('Missing mixed nested list fixture.');
    const tool = new StudioListTool({ data: { node: MIXED_NESTED_LIST } });
    const root = tool.render();
    root.querySelector<HTMLButtonElement>('[data-index="3"] [aria-label="Indent item"]')?.click();
    const saved = tool.save().node;
    const originalParent = MIXED_NESTED_LIST.content?.[0];
    const originalSibling = MIXED_NESTED_LIST.content?.[1];

    expect(saved.content).toHaveLength(1);
    expect(saved.content?.[0]?.content?.slice(0, 5)).toEqual(originalParent?.content);
    expect(saved.content?.[0]?.content?.[5]).toEqual({
      content: [originalSibling],
      type: 'bulletList',
    });
  });

  it('outdents an item atomically and keeps trailing siblings in their exact list boundary', () => {
    if (MIXED_NESTED_LIST === undefined) throw new Error('Missing mixed nested list fixture.');
    const source = structuredClone(MIXED_NESTED_LIST);
    const parent = source.content?.[0];
    const ordered = parent?.content?.[3];
    if (ordered?.type !== 'orderedList') throw new Error('Missing nested ordered-list fixture.');
    const trailing: StudioRichTextNode = {
      content: [{ content: [{ text: 'Trailing', type: 'text' }], type: 'paragraph' }],
      type: 'listItem',
    };
    ordered.content = [...(ordered.content ?? []), structuredClone(trailing)];
    const lifted = structuredClone(ordered.content?.[0]);
    if (lifted === undefined) throw new Error('Missing item to outdent.');
    const rootSibling = structuredClone(source.content?.[1]);
    const tool = new StudioListTool({ data: { node: source } });
    const root = tool.render();
    root.querySelector<HTMLButtonElement>('[data-index="2"] [aria-label="Outdent item"]')?.click();
    const saved = tool.save().node;

    expect(saved.content).toHaveLength(3);
    expect(saved.content?.[0]?.content).toEqual([
      parent?.content?.[0],
      parent?.content?.[1],
      parent?.content?.[2],
      parent?.content?.[4],
    ]);
    expect(saved.content?.[1]?.content).toEqual([
      ...(lifted?.content ?? []),
      { attrs: { start: 7 }, content: [trailing], type: 'orderedList' },
    ]);
    expect(saved.content?.[2]).toEqual(rootSibling);
  });

  it('does not materialize optional content during minimal or read-only tool snapshots', () => {
    const paragraph = { type: 'paragraph' } as const;
    const paragraphTool = new StudioParagraphTool({ data: { node: paragraph }, readOnly: true });
    paragraphTool.render();
    expect(paragraphTool.save().node).toEqual(paragraph);

    const heading = { attrs: { level: 2 }, type: 'heading' } as const;
    const headingTool = new StudioHeaderTool({ data: { node: heading }, readOnly: true });
    headingTool.render();
    expect(headingTool.save().node).toEqual(heading);

    const list = MINIMAL_RICH_TEXT.content.find((node) => node.type === 'bulletList');
    if (list === undefined) throw new Error('Missing minimal list fixture.');
    const listTool = new StudioListTool({ data: { node: list }, readOnly: true });
    listTool.render();
    expect(listTool.save().node).toEqual(list);
  });

  it.each([false, true])(
    'preserves every valid heading level in no-op snapshots (readOnly=%s)',
    (readOnly) => {
      for (const level of [2, 3, 4] as const) {
        const heading = { attrs: { level }, type: 'heading' } as const;
        const tool = new StudioHeaderTool({ data: { node: heading }, readOnly });
        const root = tool.render();

        expect(root.querySelector<HTMLSelectElement>('[aria-label="Heading level"]')?.value).toBe(
          String(level),
        );
        expect(tool.save().node).toEqual(heading);
      }
    },
  );

  it('keeps a defensive synthetic list editor outside the persisted node', () => {
    const atomicOnly: StudioRichTextNode = {
      content: [{ content: [{ type: 'horizontalRule' }], type: 'listItem' }],
      type: 'bulletList',
    };
    const tool = new StudioListTool({ data: { node: atomicOnly }, readOnly: true });
    tool.render();

    expect(tool.save().node).toEqual(atomicOnly);
  });

  it('changes list presentation without moving or flattening interleaved canonical blocks', () => {
    const source = STRUCTURAL_RICH_TEXT.content[0];
    if (source === undefined) throw new Error('Missing structural list fixture.');
    const tool = new StudioListTool({ data: { node: source } });
    const root = tool.render();
    const style = root.querySelector<HTMLSelectElement>('[aria-label="List style"]');
    if (style === null) throw new Error('Missing list style control.');
    style.value = 'ordered';
    style.dispatchEvent(new Event('change'));

    const saved = tool.save().node;
    expect(saved.type).toBe('orderedList');
    expect(saved.content?.[0]?.content?.map((block) => block.type)).toEqual([
      'paragraph',
      'orderedList',
      'paragraph',
    ]);
    expect(saved.content?.[0]?.content?.[0]?.content).toEqual(
      source.content?.[0]?.content?.[0]?.content,
    );
  });

  it('projects new semantic leaves deterministically', () => {
    expect(projectRichText(parseRichTextDocument(ADVANCED)).map((block) => block.type)).toEqual([
      'paragraph',
      'checklistItem',
      'checklistItem',
      'tableCell',
      'codeBlock',
    ]);
  });

  it('registers the complete basic toolbox as read-only capable', () => {
    const tools = studioEditorJsTools();
    expect(Object.keys(tools).sort()).toEqual([
      'callout',
      'checklist',
      'code',
      'delimiter',
      'header',
      'list',
      'paragraph',
      'quote',
      'table',
    ]);
    for (const tool of Object.values(tools)) expect(tool.isReadOnlySupported).toBe(true);
  });

  it('provides keyboard-reachable list, checklist, and table structure controls', () => {
    const list = new StudioListTool({});
    const listRoot = list.render();
    listRoot.querySelector<HTMLButtonElement>('[aria-label="Add list item"]')?.click();
    expect(list.save().node.content).toHaveLength(2);
    listRoot.querySelectorAll<HTMLButtonElement>('[aria-label="Indent item"]')[1]?.click();
    expect(list.save().node.content?.[0]?.content?.[1]?.type).toBe('bulletList');
    expect(listRoot.querySelector('[data-studio-depth="1"]')?.getAttribute('aria-level')).toBe('2');
    expect(listRoot.querySelector('[style]')).toBeNull();

    const checklist = new StudioChecklistTool({});
    const checklistRoot = checklist.render();
    checklistRoot.querySelector<HTMLButtonElement>('[aria-label="Add checklist item"]')?.click();
    checklistRoot.querySelectorAll<HTMLButtonElement>('[aria-label="Indent item"]')[1]?.click();
    expect(checklist.save().node.content).toHaveLength(2);
    expect(checklistRoot.querySelector('[data-studio-depth="1"]')?.getAttribute('aria-level')).toBe(
      '2',
    );
    expect(checklistRoot.querySelector('[style]')).toBeNull();

    const table = new StudioTableTool({});
    const tableRoot = table.render();
    tableRoot.querySelector<HTMLButtonElement>('[aria-label="Add table row"]')?.click();
    tableRoot.querySelector<HTMLButtonElement>('[aria-label="Add table column"]')?.click();
    const saved = table.save().node;
    expect(saved.content).toHaveLength(3);
    expect(saved.content?.every((row) => row.content?.length === 3)).toBe(true);
  });

  it('disables all mutable controls in read-only tools', () => {
    const code = new StudioCodeTool({
      data: { node: { attrs: { language: 'php' }, text: '<?php', type: 'codeBlock' } },
      readOnly: true,
    });
    const root = code.render();
    expect(
      [...root.querySelectorAll('input,textarea,button,select')].every(
        (element) => (element as HTMLInputElement).disabled,
      ),
    ).toBe(true);
    expect(code.save().node).toEqual({
      attrs: { language: 'php' },
      text: '<?php',
      type: 'codeBlock',
    });
  });

  it('uses a bounded semantic tone for marker output', () => {
    const marker = new StudioMarkerTool();
    const text = document.createTextNode('highlight');
    const host = document.createElement('p');
    host.append(text);
    const range = document.createRange();
    range.selectNodeContents(text);
    marker.surround(range);

    expect(host.querySelector('mark')?.dataset.studioTone).toBe('accent');
    expect(host.textContent).toBe('highlight');
  });
});
