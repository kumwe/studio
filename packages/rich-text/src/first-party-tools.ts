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
    return this.renderInline('Quotation', editableBlockContent(this.node.content ?? []));
  }

  public save(): { node: StudioRichTextNode } {
    const node = structuredClone(this.node);
    node.content = mergeEditableBlockContent(node.content ?? [], this.saveInline());
    return { node };
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
      this.renderInline('Callout text', editableBlockContent(this.node.content ?? [])),
    );
    return group;
  }

  public save(): { node: StudioRichTextNode } {
    const node = structuredClone(this.node);
    node.attrs = { tone: this.#tone?.value ?? 'info' };
    node.content = mergeEditableBlockContent(node.content ?? [], this.saveInline());
    return { node };
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
  blocks: StudioRichTextNode[];
  containerStart?: number;
  containerType: 'bulletList' | 'orderedList';
  depth: number;
  editableBlockIndex: number;
  syntheticEditable: boolean;
}

export class StudioListTool {
  public static readonly isReadOnlySupported: boolean = true;
  public static readonly toolbox = { icon: '•', title: 'List' } as const;
  readonly #readOnly: boolean;
  readonly #node: StudioRichTextNode;
  readonly #initialOrdered: boolean;
  readonly #initialRows: ListRow[];
  readonly #initialStart: number;
  #ordered: boolean;
  #rows: ListRow[];
  #root?: HTMLElement;
  #start: number;
  #structureChanged = false;

  public constructor(options: ToolOptions) {
    const node = structuredClone(
      options.data?.node ?? {
        content: [{ content: [{ type: 'paragraph' }], type: 'listItem' }],
        type: 'bulletList',
      },
    );
    this.#node = node;
    this.#readOnly = options.readOnly === true;
    this.#ordered = node.type === 'orderedList';
    this.#start = Number(node.attrs?.start ?? 1);
    this.#rows = flattenList(node);
    this.#initialOrdered = this.#ordered;
    this.#initialStart = this.#start;
    this.#initialRows = structuredClone(this.#rows);
  }

  public render(): HTMLElement {
    this.#root = editorGroup('List');
    this.#renderRows();
    return this.#root;
  }

  public save(): { node: StudioRichTextNode } {
    this.#syncRows();
    if (
      this.#ordered === this.#initialOrdered &&
      this.#start === this.#initialStart &&
      sameCanonical(this.#rows, this.#initialRows)
    ) {
      return { node: structuredClone(this.#node) };
    }
    if (!this.#structureChanged) {
      return { node: mergeListEdits(this.#node, this.#rows, this.#ordered, this.#start) };
    }
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
      this.#syncRows();
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
      item.dataset.studioDepth = String(row.depth);
      item.setAttribute('aria-level', String(row.depth + 1));
      const field = inlineField(
        `List item ${index + 1}`,
        row.blocks[row.editableBlockIndex]?.content ?? [],
        this.#readOnly,
      );
      field.dataset.listText = String(index);
      item.append(field);
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
    for (const field of this.#root?.querySelectorAll<HTMLElement>('[data-list-text]') ?? []) {
      const index = Number(field.dataset.listText);
      const row = this.#rows[index];
      const block = row?.blocks[row.editableBlockIndex];
      if (block !== undefined) block.content = readInline(field);
    }
  }

  #add(): void {
    this.#syncRows();
    if (this.#rows.length < 500)
      this.#rows.push({
        blocks: [{ type: 'paragraph' }],
        containerType: this.#ordered ? 'orderedList' : 'bulletList',
        depth: 0,
        editableBlockIndex: 0,
        syntheticEditable: false,
      });
    this.#structureChanged = true;
    this.#renderRows();
  }

  #indent(index: number, delta: number): void {
    this.#syncRows();
    const row = this.#rows[index];
    if (row !== undefined) {
      const depth = Math.max(0, Math.min(4, row.depth + delta));
      if (depth !== row.depth) this.#structureChanged = true;
      row.depth = depth;
    }
    this.#renderRows();
  }

  #move(index: number, delta: number): void {
    this.#syncRows();
    const target = index + delta;
    if (target >= 0 && target < this.#rows.length) {
      const [row] = this.#rows.splice(index, 1);
      if (row !== undefined) this.#rows.splice(target, 0, row);
      this.#structureChanged = true;
    }
    this.#renderRows();
  }

  #remove(index: number): void {
    this.#syncRows();
    if (this.#rows.length > 1) {
      this.#rows.splice(index, 1);
      this.#structureChanged = true;
    }
    this.#renderRows();
  }
}

interface CheckRow {
  checked: boolean;
  content: StudioRichTextNode[];
  contentPresent: boolean;
  depth: number;
}

export class StudioChecklistTool {
  public static readonly isReadOnlySupported: boolean = true;
  public static readonly toolbox = { icon: '☑', title: 'Checklist' } as const;
  readonly #readOnly: boolean;
  readonly #initialRows: CheckRow[];
  readonly #node: StudioRichTextNode;
  #root?: HTMLElement;
  #rows: CheckRow[];

  public constructor(options: ToolOptions) {
    this.#readOnly = options.readOnly === true;
    this.#node = structuredClone(
      options.data?.node ?? {
        content: [{ attrs: { checked: false, level: 0 }, type: 'checklistItem' }],
        type: 'checklist',
      },
    );
    const content = this.#node.content ?? [];
    this.#rows =
      content.length > 0
        ? content.map((item) => ({
            checked: item.attrs?.checked === true,
            content: structuredClone(item.content ?? []),
            contentPresent: item.content !== undefined,
            depth: Number(item.attrs?.level ?? 0),
          }))
        : [
            {
              checked: false,
              content: [],
              contentPresent: false,
              depth: 0,
            },
          ];
    this.#initialRows = structuredClone(this.#rows);
  }

  public render(): HTMLElement {
    this.#root = editorGroup('Checklist');
    this.#renderRows();
    return this.#root;
  }

  public save(): { node: StudioRichTextNode } {
    this.#syncRows();
    if (sameCanonical(this.#rows, this.#initialRows)) {
      return { node: structuredClone(this.#node) };
    }
    return {
      node: {
        content: this.#rows.map((row) => ({
          attrs: { checked: row.checked, level: row.depth },
          ...(row.contentPresent || row.content.length > 0
            ? { content: structuredClone(row.content) }
            : {}),
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
      group.dataset.studioDepth = String(row.depth);
      group.setAttribute('aria-level', String(row.depth + 1));
      const checked = document.createElement('input');
      checked.type = 'checkbox';
      checked.checked = row.checked;
      checked.disabled = this.#readOnly;
      checked.dataset.checkState = String(index);
      checked.setAttribute('aria-label', `Checklist item ${index + 1} complete`);
      const field = inlineField(`Checklist item ${index + 1}`, row.content, this.#readOnly);
      field.dataset.checkText = String(index);
      field.addEventListener('input', () => {
        row.contentPresent = true;
      });
      group.append(checked, field);
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
    for (const field of this.#root?.querySelectorAll<HTMLElement>('[data-check-text]') ?? []) {
      const row = this.#rows[Number(field.dataset.checkText)];
      if (row !== undefined) row.content = readInline(field);
    }
    for (const input of this.#root?.querySelectorAll<HTMLInputElement>('[data-check-state]') ??
      []) {
      const row = this.#rows[Number(input.dataset.checkState)];
      if (row !== undefined) row.checked = input.checked;
    }
  }

  #add(): void {
    this.#syncRows();
    if (this.#rows.length < 500)
      this.#rows.push({
        checked: false,
        content: [],
        contentPresent: false,
        depth: 0,
      });
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
  readonly #initialCells: TableCellModel[][];
  readonly #initialHeader: boolean;
  readonly #node: StudioRichTextNode;
  #cells: TableCellModel[][];
  #header: boolean;
  #root?: HTMLElement;

  public constructor(options: ToolOptions) {
    this.#readOnly = options.readOnly === true;
    this.#node = structuredClone(
      options.data?.node ?? {
        attrs: { header: false },
        content: [
          {
            content: [{ type: 'tableCell' }, { type: 'tableCell' }],
            type: 'tableRow',
          },
          {
            content: [{ type: 'tableCell' }, { type: 'tableCell' }],
            type: 'tableRow',
          },
        ],
        type: 'table',
      },
    );
    this.#header = this.#node.attrs?.header === true;
    this.#cells = (this.#node.content ?? []).map((row) =>
      (row.content ?? []).map((cell) => ({
        content: structuredClone(cell.content ?? []),
        contentPresent: cell.content !== undefined,
      })),
    );
    this.#initialHeader = this.#header;
    this.#initialCells = structuredClone(this.#cells);
  }

  public render(): HTMLElement {
    this.#root = editorGroup('Table');
    this.#renderTable();
    return this.#root;
  }

  public save(): { node: StudioRichTextNode } {
    this.#syncCells();
    if (this.#header === this.#initialHeader && sameCanonical(this.#cells, this.#initialCells)) {
      return { node: structuredClone(this.#node) };
    }
    return {
      node: {
        attrs: { header: this.#header },
        content: this.#cells.map((row) => ({
          content: row.map((cell) => ({
            ...(cell.contentPresent || cell.content.length > 0
              ? { content: structuredClone(cell.content) }
              : {}),
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
        const field = inlineField(
          `Row ${rowIndex + 1}, column ${columnIndex + 1}`,
          value.content,
          this.#readOnly,
        );
        field.dataset.tableCell = `${rowIndex}:${columnIndex}`;
        field.addEventListener('input', () => {
          value.contentPresent = true;
        });
        cell.append(field);
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
      this.#cells.push(
        Array.from({ length: this.#cells[0]?.length ?? 1 }, () => ({
          content: [],
          contentPresent: false,
        })),
      );
    if (rows < 0 && this.#cells.length > 1) this.#cells.pop();
    if (columns > 0 && (this.#cells[0]?.length ?? 0) < 50)
      for (const row of this.#cells) row.push({ content: [], contentPresent: false });
    if (columns < 0 && (this.#cells[0]?.length ?? 0) > 1) for (const row of this.#cells) row.pop();
    this.#renderTable();
  }

  #syncCells(): void {
    for (const field of this.#root?.querySelectorAll<HTMLElement>('[data-table-cell]') ?? []) {
      const [row, column] = (field.dataset.tableCell ?? '').split(':').map(Number);
      const targetRow = row === undefined ? undefined : this.#cells[row];
      const targetCell = column === undefined ? undefined : targetRow?.[column];
      if (targetCell !== undefined) {
        targetCell.content = readInline(field);
      }
    }
  }
}

interface TableCellModel {
  content: StudioRichTextNode[];
  contentPresent: boolean;
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
  for (const mark of [...(node.marks ?? [])].reverse()) {
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
    const blocks = structuredClone(
      (item.content ?? []).filter(
        (block) => block.type !== 'bulletList' && block.type !== 'orderedList',
      ),
    );
    let editableBlockIndex = blocks.findIndex(
      (block) => block.type === 'paragraph' || block.type === 'heading',
    );
    const syntheticEditable = editableBlockIndex < 0;
    if (editableBlockIndex < 0) {
      blocks.unshift({ type: 'paragraph' });
      editableBlockIndex = 0;
    }
    rows.push({
      blocks,
      ...(node.type === 'orderedList' && node.attrs?.start !== undefined
        ? { containerStart: Number(node.attrs.start) }
        : {}),
      containerType: node.type === 'orderedList' ? 'orderedList' : 'bulletList',
      depth,
      editableBlockIndex,
      syntheticEditable,
    });
    for (const nested of item.content ?? []) {
      if (nested.type === 'bulletList' || nested.type === 'orderedList')
        rows.push(...flattenList(nested, Math.min(4, depth + 1)));
    }
  }
  return rows.length > 0
    ? rows
    : [
        {
          blocks: [{ type: 'paragraph' }],
          containerType: node.type === 'orderedList' ? 'orderedList' : 'bulletList',
          depth: 0,
          editableBlockIndex: 0,
          syntheticEditable: true,
        },
      ];
}

function mergeListEdits(
  original: StudioRichTextNode,
  rows: readonly ListRow[],
  ordered: boolean,
  start: number,
): StudioRichTextNode {
  const node = structuredClone(original);
  let rowIndex = 0;
  const visit = (list: StudioRichTextNode): void => {
    for (const item of list.content ?? []) {
      const row = rows[rowIndex];
      rowIndex += 1;
      if (row === undefined) continue;
      const replacements = row.blocks.slice(row.syntheticEditable ? 1 : 0);
      let replacementIndex = 0;
      const content: StudioRichTextNode[] = [];
      const synthetic = row.syntheticEditable ? row.blocks[0] : undefined;
      if (synthetic !== undefined && (synthetic.content?.length ?? 0) > 0) {
        content.push(structuredClone(synthetic));
      }
      for (const block of item.content ?? []) {
        if (block.type === 'bulletList' || block.type === 'orderedList') {
          visit(block);
          content.push(block);
          continue;
        }
        content.push(structuredClone(replacements[replacementIndex] ?? block));
        replacementIndex += 1;
      }
      item.content = content;
    }
  };
  visit(node);
  if (
    ordered === (original.type === 'orderedList') &&
    start === Number(original.attrs?.start ?? 1)
  ) {
    return node;
  }
  node.type = ordered ? 'orderedList' : 'bulletList';
  if (ordered && start !== 1) node.attrs = { start: Math.max(1, Math.min(1_000_000, start)) };
  else delete node.attrs;
  return node;
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
      const nestedRow = row;
      const nested: StudioRichTextNode = {
        ...(nestedRow.containerType === 'orderedList' && nestedRow.containerStart !== undefined
          ? { attrs: { start: nestedRow.containerStart } }
          : {}),
        content: [],
        type: nestedRow.containerType,
      };
      parentItem.content = [...(parentItem.content ?? []), nested];
      lists.push(nested);
    }
    lists.at(-1)?.content?.push({
      content: structuredClone(row.blocks),
      type: 'listItem',
    });
  }
  return root;
}

function editableBlockContent(blocks: readonly StudioRichTextNode[]): StudioRichTextNode[] {
  return (
    blocks.find((block) => block.type === 'paragraph' || block.type === 'heading')?.content ?? []
  );
}

function mergeEditableBlockContent(
  blocks: readonly StudioRichTextNode[],
  content: readonly StudioRichTextNode[],
): StudioRichTextNode[] {
  const result = structuredClone([...blocks]);
  const index = result.findIndex((block) => block.type === 'paragraph' || block.type === 'heading');
  if (index < 0) {
    if (content.length > 0)
      result.unshift({ content: structuredClone([...content]), type: 'paragraph' });
    return result;
  }
  const block = result[index];
  if (block !== undefined && !sameCanonical(block.content ?? [], content)) {
    block.content = structuredClone([...content]);
  }
  return result;
}

function inlineField(
  label: string,
  content: readonly StudioRichTextNode[],
  readOnly: boolean,
): HTMLDivElement {
  const field = document.createElement('div');
  field.className = 'studio-rich-text-field';
  field.contentEditable = readOnly ? 'false' : 'true';
  field.setAttribute('aria-label', label);
  field.setAttribute('aria-multiline', 'true');
  field.setAttribute('role', 'textbox');
  field.spellcheck = true;
  for (const inline of content) appendInline(field, inline);
  field.addEventListener('paste', pastePlainText);
  return field;
}

function sameCanonical(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => sameCanonical(value, right[index]))
    );
  }
  if (!isRecord(left) || !isRecord(right)) return false;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every((key, index) => key === rightKeys[index] && sameCanonical(left[key], right[key]))
  );
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
  select.value = selected;
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
