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

const ADVANCED: StudioRichTextDocument = {
  content: [
    {
      attrs: { tone: 'warning' },
      content: [
        {
          content: [
            {
              marks: [{ attrs: { tone: 'accent' }, type: 'highlight' }],
              text: 'Mind the gap',
              type: 'text',
            },
          ],
          type: 'paragraph',
        },
      ],
      type: 'callout',
    },
    {
      content: [
        {
          attrs: { checked: true, level: 0 },
          content: [{ text: 'Done', type: 'text' }],
          type: 'checklistItem',
        },
        {
          attrs: { checked: false, level: 1 },
          content: [{ text: 'Nested', type: 'text' }],
          type: 'checklistItem',
        },
      ],
      type: 'checklist',
    },
    {
      attrs: { header: true },
      content: [
        {
          content: [{ content: [{ text: 'Name', type: 'text' }], type: 'tableCell' }],
          type: 'tableRow',
        },
      ],
      type: 'table',
    },
    { attrs: { language: 'typescript' }, text: 'const answer = 42;', type: 'codeBlock' },
  ],
  type: 'doc',
};

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

    const checklist = new StudioChecklistTool({});
    const checklistRoot = checklist.render();
    checklistRoot.querySelector<HTMLButtonElement>('[aria-label="Add checklist item"]')?.click();
    checklistRoot.querySelector<HTMLButtonElement>('[aria-label="Indent item"]')?.click();
    expect(checklist.save().node.content).toHaveLength(2);

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
