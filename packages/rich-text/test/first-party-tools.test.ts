import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  fromStudioEditorJsBlocks,
  StudioChecklistTool,
  StudioCodeTool,
  StudioListTool,
  StudioMarkerTool,
  StudioTableTool,
  studioEditorJsTools,
  toStudioEditorJsBlocks,
} from '../src/first-party-tools.js';
import {
  parseRichTextDocument,
  projectRichText,
  type StudioRichTextDocument,
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
    for (const value of [ADVANCED, STRUCTURAL_RICH_TEXT]) {
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
