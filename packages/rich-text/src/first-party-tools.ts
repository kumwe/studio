import type { StudioRichTextDocument, StudioRichTextMark, StudioRichTextNode } from './index.js';

export type StudioEditorJsToolName =
  | 'callout'
  | 'checklist'
  | 'code'
  | 'delimiter'
  | 'header'
  | 'list'
  | 'paragraph'
  | 'quote'
  | 'table';

export const STUDIO_EDITOR_JS_TOOL_NAMES: readonly StudioEditorJsToolName[] = Object.freeze([
  'callout',
  'checklist',
  'code',
  'delimiter',
  'header',
  'list',
  'paragraph',
  'quote',
  'table',
] as const);

export interface StudioEditorJsBlock {
  data: { node: StudioRichTextNode };
  type: StudioEditorJsToolName;
}

interface ToolOptions {
  data?: { node?: StudioRichTextNode };
  readOnly?: boolean;
}

interface ToolClass {
  new (options: ToolOptions): {
    render(): HTMLElement;
    save(): { node: StudioRichTextNode };
  };
  readonly isReadOnlySupported: boolean;
  readonly toolbox: { icon: string; title: string };
}

export function studioEditorJsTools(): Readonly<Record<StudioEditorJsToolName, ToolClass>> {
  return Object.freeze({
    callout: StudioCalloutTool,
    checklist: StudioChecklistTool,
    code: StudioCodeTool,
    delimiter: StudioDelimiterTool,
    header: StudioHeaderTool,
    list: StudioListTool,
    paragraph: StudioParagraphTool,
    quote: StudioQuoteTool,
    table: StudioTableTool,
  });
}

export function toStudioEditorJsBlocks(document: StudioRichTextDocument): StudioEditorJsBlock[] {
  return document.content.map((node) => ({
    data: { node: structuredClone(node) },
    type: toolName(node),
  }));
}

export function fromStudioEditorJsBlocks(value: unknown): StudioRichTextDocument {
  if (!isRecord(value) || !Array.isArray(value.blocks)) {
    throw new TypeError('Editor surface returned an invalid block collection.');
  }
  const content = value.blocks.map((block, index) => {
    if (
      !isRecord(block) ||
      !STUDIO_EDITOR_JS_TOOL_NAMES.includes(block.type as StudioEditorJsToolName) ||
      !isRecord(block.data) ||
      !isRecord(block.data.node)
    ) {
      throw new TypeError(`Editor block ${index} is not a Studio first-party block.`);
    }
    const node = structuredClone(block.data.node) as unknown as StudioRichTextNode;
    if (toolName(node) !== block.type) {
      throw new TypeError(`Editor block ${index} has a mismatched Studio node type.`);
    }
    return node;
  });
  return { content: content.length > 0 ? content : [{ type: 'paragraph' }], type: 'doc' };
}

function toolName(node: StudioRichTextNode): StudioEditorJsToolName {
  switch (node.type) {
    case 'heading':
      return 'header';
    case 'blockquote':
      return 'quote';
    case 'horizontalRule':
      return 'delimiter';
    case 'bulletList':
    case 'orderedList':
      return 'list';
    case 'checklist':
      return 'checklist';
    case 'table':
      return 'table';
    case 'callout':
      return 'callout';
    case 'codeBlock':
      return 'code';
    case 'paragraph':
      return 'paragraph';
    default:
      throw new TypeError(`Node type "${node.type}" has no first-party Editor.js tool.`);
  }
}

abstract class InlineToolBase {
  public static readonly isReadOnlySupported: boolean = true;
  protected readonly node: StudioRichTextNode;
  protected readonly readOnly: boolean;
  protected field?: HTMLElement;

  public constructor(options: ToolOptions, fallback: StudioRichTextNode) {
    this.node = structuredClone(options.data?.node ?? fallback);
    this.readOnly = options.readOnly === true;
  }

  protected renderInline(label: string, content: readonly StudioRichTextNode[]): HTMLElement {
    const field = document.createElement('div');
    field.className = 'studio-rich-text-field';
    field.contentEditable = this.readOnly ? 'false' : 'true';
    field.setAttribute('aria-label', label);
    field.setAttribute('role', 'textbox');
    field.setAttribute('aria-multiline', 'true');
    field.spellcheck = true;
    for (const inline of content) appendInline(field, inline);
    field.addEventListener('paste', pastePlainText);
    this.field = field;
    return field;
  }

  protected saveInline(): StudioRichTextNode[] {
    return this.field === undefined ? [] : readInline(this.field);
  }

  public abstract render(): HTMLElement;
  public abstract save(): { node: StudioRichTextNode };
}

export class StudioParagraphTool extends InlineToolBase {
  public static override readonly isReadOnlySupported: boolean = true;
  public static readonly toolbox = { icon: '¶', title: 'Paragraph' } as const;

  public constructor(options: ToolOptions) {
    super(options, { type: 'paragraph' });
  }

  public render(): HTMLElement {
    return this.renderInline('Paragraph', this.node.content ?? []);
  }

  public save(): { node: StudioRichTextNode } {
    return { node: { content: this.saveInline(), type: 'paragraph' } };
  }
}

export class StudioHeaderTool extends InlineToolBase {
  public static override readonly isReadOnlySupported: boolean = true;
  public static readonly toolbox = { icon: 'H', title: 'Heading' } as const;
  #level?: HTMLSelectElement;

  public constructor(options: ToolOptions) {
    super(options, { attrs: { level: 2 }, type: 'heading' });
  }

  public render(): HTMLElement {
    const group = editorGroup('Heading');
    const level = document.createElement('select');
    level.setAttribute('aria-label', 'Heading level');
    level.disabled = this.readOnly;
    for (const value of [2, 3, 4]) {
      const option = document.createElement('option');
      option.value = String(value);
      option.textContent = `Heading ${value}`;
      option.selected = this.node.attrs?.level === value;
      level.append(option);
    }
    this.#level = level;
    group.append(level, this.renderInline('Heading text', this.node.content ?? []));
    return group;
  }

  public save(): { node: StudioRichTextNode } {
    return {
      node: {
        attrs: { level: Number(this.#level?.value ?? this.node.attrs?.level ?? 2) },
        content: this.saveInline(),
        type: 'heading',
      },
    };
  }
}

export class StudioQuoteTool extends InlineToolBase {
  public static override readonly isReadOnlySupported: boolean = true;
  public static readonly toolbox = { icon: '“', title: 'Quote' } as const;

  public constructor(options: ToolOptions) {
    super(options, { content: [{ type: 'paragraph' }], type: 'blockquote' });
  }

  public render(): HTMLElement {
    return this.renderInline('Quotation', this.node.content?.[0]?.content ?? []);
  }

  public save(): { node: StudioRichTextNode } {
    return {
      node: { content: [{ content: this.saveInline(), type: 'paragraph' }], type: 'blockquote' },
    };
  }
}

export class StudioDelimiterTool {
  public static readonly isReadOnlySupported: boolean = true;
  public static readonly toolbox = { icon: '—', title: 'Separator' } as const;

  public render(): HTMLElement {
    const separator = document.createElement('hr');
    separator.setAttribute('aria-label', 'Separator');
    return separator;
  }

  public save(): { node: StudioRichTextNode } {
    return { node: { type: 'horizontalRule' } };
  }
}

export class StudioCalloutTool extends InlineToolBase {
  public static override readonly isReadOnlySupported: boolean = true;
  public static readonly toolbox = { icon: '!', title: 'Callout' } as const;
  #tone?: HTMLSelectElement;

  public constructor(options: ToolOptions) {
    super(options, {
      attrs: { tone: 'info' },
      content: [{ type: 'paragraph' }],
      type: 'callout',
    });
  }

  public render(): HTMLElement {
    const group = editorGroup('Callout');
    this.#tone = selectControl(
      'Callout tone',
      ['info', 'success', 'warning', 'danger'],
      stringAttribute(this.node.attrs?.tone, 'info'),
      this.readOnly,
    );
    group.append(
      this.#tone,
      this.renderInline('Callout text', this.node.content?.[0]?.content ?? []),
    );
    return group;
  }

  public save(): { node: StudioRichTextNode } {
    return {
      node: {
        attrs: { tone: this.#tone?.value ?? 'info' },
        content: [{ content: this.saveInline(), type: 'paragraph' }],
        type: 'callout',
      },
    };
  }
}

export class StudioCodeTool {
  public static readonly isReadOnlySupported: boolean = true;
  public static readonly toolbox = { icon: '</>', title: 'Code' } as const;
  readonly #node: StudioRichTextNode;
  readonly #readOnly: boolean;
  #language?: HTMLInputElement;
  #source?: HTMLTextAreaElement;

  public constructor(options: ToolOptions) {
    this.#node = structuredClone(
      options.data?.node ?? { attrs: { language: 'text' }, text: '', type: 'codeBlock' },
    );
    this.#readOnly = options.readOnly === true;
  }

  public render(): HTMLElement {
    const group = editorGroup('Code sample');
    this.#language = textInput(
      'Code language',
      stringAttribute(this.#node.attrs?.language, 'text'),
      this.#readOnly,
    );
    this.#language.pattern = '[A-Za-z0-9][A-Za-z0-9+_.#-]{0,63}';
    this.#language.maxLength = 64;
    this.#source = document.createElement('textarea');
    this.#source.setAttribute('aria-label', 'Inert code source');
    this.#source.disabled = this.#readOnly;
    this.#source.rows = 8;
    this.#source.value = this.#node.text ?? '';
    group.append(this.#language, this.#source);
    return group;
  }

  public save(): { node: StudioRichTextNode } {
    const language = this.#language?.value.trim() ?? 'text';
    return {
      node: {
        attrs: {
          language: /^[A-Za-z0-9][A-Za-z0-9+_.#-]{0,63}$/u.test(language) ? language : 'text',
        },
        text: this.#source?.value ?? '',
        type: 'codeBlock',
      },
    };
  }
}

interface ListRow {
  depth: number;
  text: string;
}

export class StudioListTool {
  public static readonly isReadOnlySupported: boolean = true;
  public static readonly toolbox = { icon: '•', title: 'List' } as const;
  readonly #readOnly: boolean;
  #ordered: boolean;
  #rows: ListRow[];
  #root?: HTMLElement;
  #start: number;

  public constructor(options: ToolOptions) {
    const node = options.data?.node ?? {
      content: [{ content: [{ type: 'paragraph' }], type: 'listItem' }],
      type: 'bulletList',
    };
    this.#readOnly = options.readOnly === true;
    this.#ordered = node.type === 'orderedList';
    this.#start = Number(node.attrs?.start ?? 1);
    this.#rows = flattenList(node);
  }

  public render(): HTMLElement {
    this.#root = editorGroup('List');
    this.#renderRows();
    return this.#root;
  }

  public save(): { node: StudioRichTextNode } {
    this.#syncRows();
    return { node: buildList(this.#rows, this.#ordered, this.#start) };
  }

  #renderRows(): void {
    const root = this.#root;
    if (root === undefined) return;
    root.replaceChildren();
    const style = selectControl(
      'List style',
      ['bullet', 'ordered'],
      this.#ordered ? 'ordered' : 'bullet',
      this.#readOnly,
    );
    style.addEventListener('change', () => {
      this.#ordered = style.value === 'ordered';
      this.#renderRows();
    });
    root.append(style);
    if (this.#ordered) {
      const start = textInput('Ordered list start', String(this.#start), this.#readOnly);
      start.type = 'number';
      start.min = '1';
      start.max = '1000000';
      start.addEventListener('change', () => {
        this.#start = Math.max(1, Math.min(1_000_000, Number(start.value) || 1));
      });
      root.append(start);
    }
    const list = document.createElement('ol');
    list.setAttribute('aria-label', 'List items');
    for (const [index, row] of this.#rows.entries()) {
      const item = document.createElement('li');
      item.dataset.index = String(index);
      item.style.marginInlineStart = `${row.depth * 1.5}rem`;
      const input = textInput(`List item ${index + 1}`, row.text, this.#readOnly);
      input.dataset.listText = String(index);
      item.append(input);
      if (!this.#readOnly) {
        item.append(
          rowButton('Move item up', () => this.#move(index, -1), index === 0),
          rowButton('Move item down', () => this.#move(index, 1), index === this.#rows.length - 1),
          rowButton('Indent item', () => this.#indent(index, 1), row.depth >= 4 || index === 0),
          rowButton('Outdent item', () => this.#indent(index, -1), row.depth === 0),
          rowButton('Remove item', () => this.#remove(index), this.#rows.length === 1),
        );
      }
      list.append(item);
    }
    root.append(list);
    if (!this.#readOnly) root.append(rowButton('Add list item', () => this.#add()));
  }

  #syncRows(): void {
    for (const input of this.#root?.querySelectorAll<HTMLInputElement>('[data-list-text]') ?? []) {
      const index = Number(input.dataset.listText);
      const row = this.#rows[index];
      if (row !== undefined) row.text = input.value.slice(0, 20_000);
    }
  }

  #add(): void {
    this.#syncRows();
    if (this.#rows.length < 500) this.#rows.push({ depth: 0, text: '' });
    this.#renderRows();
  }

  #indent(index: number, delta: number): void {
    this.#syncRows();
    const row = this.#rows[index];
    if (row !== undefined) row.depth = Math.max(0, Math.min(4, row.depth + delta));
    this.#renderRows();
  }

  #move(index: number, delta: number): void {
    this.#syncRows();
    const target = index + delta;
    if (target >= 0 && target < this.#rows.length) {
      const [row] = this.#rows.splice(index, 1);
      if (row !== undefined) this.#rows.splice(target, 0, row);
    }
    this.#renderRows();
  }

  #remove(index: number): void {
    this.#syncRows();
    if (this.#rows.length > 1) this.#rows.splice(index, 1);
    this.#renderRows();
  }
}

interface CheckRow extends ListRow {
  checked: boolean;
}

export class StudioChecklistTool {
  public static readonly isReadOnlySupported: boolean = true;
  public static readonly toolbox = { icon: '☑', title: 'Checklist' } as const;
  readonly #readOnly: boolean;
  #root?: HTMLElement;
  #rows: CheckRow[];

  public constructor(options: ToolOptions) {
    this.#readOnly = options.readOnly === true;
    const content = options.data?.node?.content ?? [];
    this.#rows =
      content.length > 0
        ? content.map((item) => ({
            checked: item.attrs?.checked === true,
            depth: Number(item.attrs?.level ?? 0),
            text: inlineText(item.content ?? []),
          }))
        : [{ checked: false, depth: 0, text: '' }];
  }

  public render(): HTMLElement {
    this.#root = editorGroup('Checklist');
    this.#renderRows();
    return this.#root;
  }

  public save(): { node: StudioRichTextNode } {
    this.#syncRows();
    return {
      node: {
        content: this.#rows.map((row) => ({
          attrs: { checked: row.checked, level: row.depth },
          content: row.text.length > 0 ? [{ text: row.text, type: 'text' }] : [],
          type: 'checklistItem',
        })),
        type: 'checklist',
      },
    };
  }

  #renderRows(): void {
    const root = this.#root;
    if (root === undefined) return;
    root.replaceChildren();
    for (const [index, row] of this.#rows.entries()) {
      const group = editorGroup(`Checklist item ${index + 1}`);
      group.style.marginInlineStart = `${row.depth * 1.5}rem`;
      const checked = document.createElement('input');
      checked.type = 'checkbox';
      checked.checked = row.checked;
      checked.disabled = this.#readOnly;
      checked.dataset.checkState = String(index);
      checked.setAttribute('aria-label', `Checklist item ${index + 1} complete`);
      const text = textInput(`Checklist item ${index + 1}`, row.text, this.#readOnly);
      text.dataset.checkText = String(index);
      group.append(checked, text);
      if (!this.#readOnly) {
        group.append(
          rowButton('Move item up', () => this.#move(index, -1), index === 0),
          rowButton('Move item down', () => this.#move(index, 1), index === this.#rows.length - 1),
          rowButton('Indent item', () => this.#indent(index, 1), row.depth >= 4 || index === 0),
          rowButton('Outdent item', () => this.#indent(index, -1), row.depth === 0),
          rowButton('Remove item', () => this.#remove(index), this.#rows.length === 1),
        );
      }
      root.append(group);
    }
    if (!this.#readOnly) root.append(rowButton('Add checklist item', () => this.#add()));
  }

  #syncRows(): void {
    for (const input of this.#root?.querySelectorAll<HTMLInputElement>('[data-check-text]') ?? []) {
      const row = this.#rows[Number(input.dataset.checkText)];
      if (row !== undefined) row.text = input.value.slice(0, 20_000);
    }
    for (const input of this.#root?.querySelectorAll<HTMLInputElement>('[data-check-state]') ??
      []) {
      const row = this.#rows[Number(input.dataset.checkState)];
      if (row !== undefined) row.checked = input.checked;
    }
  }

  #add(): void {
    this.#syncRows();
    if (this.#rows.length < 500) this.#rows.push({ checked: false, depth: 0, text: '' });
    this.#renderRows();
  }
  #indent(index: number, delta: number): void {
    this.#syncRows();
    const row = this.#rows[index];
    if (row !== undefined) row.depth = Math.max(0, Math.min(4, row.depth + delta));
    this.#renderRows();
  }
  #move(index: number, delta: number): void {
    this.#syncRows();
    const target = index + delta;
    if (target >= 0 && target < this.#rows.length) {
      const [row] = this.#rows.splice(index, 1);
      if (row !== undefined) this.#rows.splice(target, 0, row);
    }
    this.#renderRows();
  }
  #remove(index: number): void {
    this.#syncRows();
    if (this.#rows.length > 1) this.#rows.splice(index, 1);
    this.#renderRows();
  }
}

export class StudioTableTool {
  public static readonly isReadOnlySupported: boolean = true;
  public static readonly toolbox = { icon: '▦', title: 'Table' } as const;
  readonly #readOnly: boolean;
  #cells: string[][];
  #header: boolean;
  #root?: HTMLElement;

  public constructor(options: ToolOptions) {
    this.#readOnly = options.readOnly === true;
    const node = options.data?.node;
    this.#header = node?.attrs?.header === true;
    this.#cells = (node?.content ?? []).map((row) =>
      (row.content ?? []).map((cell) => inlineText(cell.content ?? [])),
    );
    if (this.#cells.length === 0)
      this.#cells = [
        ['', ''],
        ['', ''],
      ];
  }

  public render(): HTMLElement {
    this.#root = editorGroup('Table');
    this.#renderTable();
    return this.#root;
  }

  public save(): { node: StudioRichTextNode } {
    this.#syncCells();
    return {
      node: {
        attrs: { header: this.#header },
        content: this.#cells.map((row) => ({
          content: row.map((text) => ({
            content: text.length > 0 ? [{ text, type: 'text' }] : [],
            type: 'tableCell',
          })),
          type: 'tableRow',
        })),
        type: 'table',
      },
    };
  }

  #renderTable(): void {
    const root = this.#root;
    if (root === undefined) return;
    root.replaceChildren();
    const header = document.createElement('input');
    header.type = 'checkbox';
    header.checked = this.#header;
    header.disabled = this.#readOnly;
    header.setAttribute('aria-label', 'Use first row as table header');
    header.addEventListener('change', () => {
      this.#header = header.checked;
    });
    root.append(header);
    const table = document.createElement('table');
    table.setAttribute('aria-label', 'Table data');
    for (const [rowIndex, row] of this.#cells.entries()) {
      const tr = document.createElement('tr');
      for (const [columnIndex, value] of row.entries()) {
        const cell = document.createElement(rowIndex === 0 && this.#header ? 'th' : 'td');
        const input = textInput(
          `Row ${rowIndex + 1}, column ${columnIndex + 1}`,
          value,
          this.#readOnly,
        );
        input.dataset.tableCell = `${rowIndex}:${columnIndex}`;
        cell.append(input);
        tr.append(cell);
      }
      table.append(tr);
    }
    root.append(table);
    if (!this.#readOnly) {
      root.append(
        rowButton('Add table row', () => this.#resize(1, 0), this.#cells.length >= 200),
        rowButton('Remove table row', () => this.#resize(-1, 0), this.#cells.length <= 1),
        rowButton(
          'Add table column',
          () => this.#resize(0, 1),
          (this.#cells[0]?.length ?? 0) >= 50,
        ),
        rowButton(
          'Remove table column',
          () => this.#resize(0, -1),
          (this.#cells[0]?.length ?? 0) <= 1,
        ),
      );
    }
  }

  #resize(rows: number, columns: number): void {
    this.#syncCells();
    if (rows > 0 && this.#cells.length < 200)
      this.#cells.push(Array(this.#cells[0]?.length ?? 1).fill('') as string[]);
    if (rows < 0 && this.#cells.length > 1) this.#cells.pop();
    if (columns > 0 && (this.#cells[0]?.length ?? 0) < 50)
      for (const row of this.#cells) row.push('');
    if (columns < 0 && (this.#cells[0]?.length ?? 0) > 1) for (const row of this.#cells) row.pop();
    this.#renderTable();
  }

  #syncCells(): void {
    for (const input of this.#root?.querySelectorAll<HTMLInputElement>('[data-table-cell]') ?? []) {
      const [row, column] = (input.dataset.tableCell ?? '').split(':').map(Number);
      const targetRow = row === undefined ? undefined : this.#cells[row];
      if (targetRow !== undefined && column !== undefined && targetRow[column] !== undefined) {
        targetRow[column] = input.value.slice(0, 20_000);
      }
    }
  }
}

/** Editor.js inline tool for a bounded semantic highlight tone. */
export class StudioMarkerTool {
  public static readonly isInline: boolean = true;
  public static readonly sanitize = { mark: { 'data-studio-tone': true } } as const;
  #button?: HTMLButtonElement;
  #tone: HighlightTone = 'accent';

  public checkState(selection: Selection): boolean {
    const mark = closestMark(selection.anchorNode);
    const active = mark !== undefined;
    this.#button?.setAttribute('aria-pressed', String(active));
    return active;
  }

  public render(): HTMLElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Highlight';
    button.setAttribute('aria-label', 'Toggle semantic highlight');
    button.setAttribute('aria-pressed', 'false');
    this.#button = button;
    return button;
  }

  public renderActions(): HTMLElement {
    const select = selectControl(
      'Highlight tone',
      ['accent', 'info', 'success', 'warning', 'danger'],
      this.#tone,
      false,
    );
    select.addEventListener('change', () => {
      this.#tone = select.value as HighlightTone;
    });
    return select;
  }

  public surround(range: Range): void {
    const active = closestMark(range.commonAncestorContainer);
    if (active !== undefined) {
      const parent = active.parentNode;
      while (active.firstChild !== null) parent?.insertBefore(active.firstChild, active);
      active.remove();
      return;
    }
    if (range.collapsed) return;
    const mark = document.createElement('mark');
    mark.dataset.studioTone = this.#tone;
    mark.append(range.extractContents());
    range.insertNode(mark);
  }
}

type HighlightTone = 'accent' | 'danger' | 'info' | 'success' | 'warning';

function appendInline(parent: Node, node: StudioRichTextNode): void {
  if (node.type === 'hardBreak') {
    parent.appendChild(document.createElement('br'));
    return;
  }
  if (node.type !== 'text' || (node.text ?? '').length === 0) return;
  let child: Node = document.createTextNode(node.text ?? '');
  for (const mark of node.marks ?? []) {
    const element = document.createElement(markElement(mark));
    if (mark.type === 'highlight')
      element.dataset.studioTone = stringAttribute(mark.attrs?.tone, 'accent');
    element.append(child);
    child = element;
  }
  parent.appendChild(child);
}

function markElement(mark: StudioRichTextMark): 'code' | 'em' | 'mark' | 's' | 'strong' {
  if (mark.type === 'bold') return 'strong';
  if (mark.type === 'italic') return 'em';
  if (mark.type === 'strike') return 's';
  if (mark.type === 'code') return 'code';
  return 'mark';
}

function readInline(parent: Node): StudioRichTextNode[] {
  const result: StudioRichTextNode[] = [];
  const visit = (node: Node, marks: StudioRichTextMark[]): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.nodeValue ?? '';
      if (text.length > 0)
        result.push({ ...(marks.length > 0 ? { marks } : {}), text, type: 'text' });
      return;
    }
    if (!(node instanceof Element)) return;
    if (node.localName === 'br') {
      result.push({ type: 'hardBreak' });
      return;
    }
    const next = [...marks];
    const mark = canonicalMark(node);
    if (mark !== undefined && !next.some((item) => item.type === mark.type)) {
      if (mark.type === 'code') next.splice(0, next.length, mark);
      else if (!next.some((item) => item.type === 'code')) next.push(mark);
    }
    for (const child of node.childNodes) visit(child, next);
  };
  for (const child of parent.childNodes) visit(child, []);
  return result;
}

function canonicalMark(element: Element): StudioRichTextMark | undefined {
  if (element.localName === 'strong' || element.localName === 'b') return { type: 'bold' };
  if (element.localName === 'em' || element.localName === 'i') return { type: 'italic' };
  if (element.localName === 's' || element.localName === 'del') return { type: 'strike' };
  if (element.localName === 'code') return { type: 'code' };
  if (element.localName === 'mark') {
    const tone = element.getAttribute('data-studio-tone');
    return {
      attrs: {
        tone: ['accent', 'danger', 'info', 'success', 'warning'].includes(tone ?? '')
          ? (tone ?? 'accent')
          : 'accent',
      },
      type: 'highlight',
    };
  }
  return undefined;
}

function pastePlainText(event: ClipboardEvent): void {
  event.preventDefault();
  const text = event.clipboardData?.getData('text/plain') ?? '';
  const selection = globalThis.getSelection();
  if (selection === null || selection.rangeCount === 0) return;
  const range = selection.getRangeAt(0);
  range.deleteContents();
  range.insertNode(document.createTextNode(text.slice(0, 250_000)));
  range.collapse(false);
}

function flattenList(node: StudioRichTextNode, depth = 0): ListRow[] {
  const rows: ListRow[] = [];
  for (const item of node.content ?? []) {
    rows.push({ depth, text: inlineText(item.content?.[0]?.content ?? []) });
    for (const nested of item.content?.slice(1) ?? []) {
      if (nested.type === 'bulletList' || nested.type === 'orderedList')
        rows.push(...flattenList(nested, Math.min(4, depth + 1)));
    }
  }
  return rows.length > 0 ? rows : [{ depth: 0, text: '' }];
}

function buildList(rows: readonly ListRow[], ordered: boolean, start: number): StudioRichTextNode {
  const type = ordered ? 'orderedList' : 'bulletList';
  const root: StudioRichTextNode = { content: [], type };
  if (ordered && start !== 1) root.attrs = { start: Math.max(1, Math.min(1_000_000, start)) };
  const lists: StudioRichTextNode[] = [root];
  for (const [index, row] of rows.entries()) {
    const depth = Math.min(row.depth, index === 0 ? 0 : (rows[index - 1]?.depth ?? 0) + 1);
    while (lists.length > depth + 1) lists.pop();
    while (lists.length < depth + 1) {
      const parent = lists.at(-1);
      const parentItem = parent?.content?.at(-1);
      if (parentItem === undefined) break;
      const nested: StudioRichTextNode = { content: [], type };
      parentItem.content = [...(parentItem.content ?? []), nested];
      lists.push(nested);
    }
    lists.at(-1)?.content?.push({
      content: [
        {
          content: row.text.length > 0 ? [{ text: row.text, type: 'text' }] : [],
          type: 'paragraph',
        },
      ],
      type: 'listItem',
    });
  }
  return root;
}

function inlineText(nodes: readonly StudioRichTextNode[]): string {
  return nodes.map((node) => (node.type === 'hardBreak' ? '\n' : (node.text ?? ''))).join('');
}

function editorGroup(label: string): HTMLDivElement {
  const group = document.createElement('div');
  group.setAttribute('aria-label', label);
  group.setAttribute('role', 'group');
  return group;
}

function textInput(label: string, value: string, readOnly: boolean): HTMLInputElement {
  const input = document.createElement('input');
  input.type = 'text';
  input.setAttribute('aria-label', label);
  input.disabled = readOnly;
  input.value = value;
  return input;
}

function selectControl(
  label: string,
  values: readonly string[],
  selected: string,
  readOnly: boolean,
): HTMLSelectElement {
  const select = document.createElement('select');
  select.setAttribute('aria-label', label);
  select.disabled = readOnly;
  for (const value of values) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    option.selected = value === selected;
    select.append(option);
  }
  return select;
}

function rowButton(label: string, action: () => void, disabled = false): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.setAttribute('aria-label', label);
  button.disabled = disabled;
  button.addEventListener('click', action);
  return button;
}

function closestMark(node: Node | null): HTMLElement | undefined {
  let candidate = node instanceof HTMLElement ? node : node?.parentElement;
  while (candidate !== null && candidate !== undefined) {
    if (candidate.localName === 'mark') return candidate;
    candidate = candidate.parentElement ?? undefined;
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringAttribute(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}
