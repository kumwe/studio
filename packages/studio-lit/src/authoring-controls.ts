import { parseStudioChartSpec, parseStudioMoneyValue } from '@kumwe/studio-core';
import type { FieldBinding, StudioChartSpec, StudioMoneyValue } from '@kumwe/studio-protocol';
import {
  compileStudioScopedStyleSheet,
  type StudioScopedStyleRule,
  type StudioScopedStyleSheet,
} from '@kumwe/studio-renderer-web';
import { StudioRichTextEditorFactory, type StudioRichTextDocument } from '@kumwe/studio-rich-text';
import {
  mountStudioMediaCollectionControl,
  mountStudioMediaReferenceControl,
  type StudioMediaAuthoringServices,
} from './media-authoring-control.js';

export interface StudioAuthoringControlIdMap {
  chart: 'studio.control/chart';
  drawing: 'studio.control/drawing';
  mediaCollection: 'studio.control/media-collection';
  mediaReference: 'studio.control/media-reference';
  money: 'studio.control/money';
  richText: 'studio.control/rich-text';
  scopedCss: 'studio.control/scoped-css';
  source: 'studio.control/source';
}

export const STUDIO_AUTHORING_CONTROL_IDS: Readonly<StudioAuthoringControlIdMap> = Object.freeze({
  chart: 'studio.control/chart',
  drawing: 'studio.control/drawing',
  mediaCollection: 'studio.control/media-collection',
  mediaReference: 'studio.control/media-reference',
  money: 'studio.control/money',
  richText: 'studio.control/rich-text',
  scopedCss: 'studio.control/scoped-css',
  source: 'studio.control/source',
});

export type StudioAuthoringControlId =
  (typeof STUDIO_AUTHORING_CONTROL_IDS)[keyof typeof STUDIO_AUTHORING_CONTROL_IDS];

export interface StudioAuthoringControlChange<TValue = unknown> {
  valid: boolean;
  value: TValue;
}

export interface StudioAuthoringControlHandle<TValue = unknown> {
  destroy(): void;
  focus(): void;
  readonly readOnly: boolean;
  value(): TValue;
}

export interface StudioAuthoringControlOptions<TValue = unknown> {
  binding?: FieldBinding;
  holder: HTMLElement;
  mediaTypes?: readonly string[];
  onChange?: (change: StudioAuthoringControlChange<TValue>) => void;
  profile?: string;
  readOnly?: boolean;
  usage?: `${string}/${string}`;
  value: TValue;
}

export interface StudioSourcePreviewValue {
  language: string;
  source: string;
}

export interface StudioSourcePreviewAdapter {
  render(value: Readonly<StudioSourcePreviewValue>, signal: AbortSignal): Promise<Node>;
}

export interface StudioCodeFieldOptions {
  holder: HTMLElement;
  language: string;
  onChange: (source: string) => void;
  readOnly: boolean;
  source: string;
}

export interface StudioCodeFieldHandle {
  destroy(): void;
  focus(): void;
  source(): string;
}

/** CodeMirror and equivalent integrations implement this Studio-neutral seam. */
export interface StudioCodeFieldAdapter {
  mount(options: StudioCodeFieldOptions): StudioCodeFieldHandle;
}

export interface StudioAuthoringControlServices {
  codeField?: StudioCodeFieldAdapter;
  media?: StudioMediaAuthoringServices;
  richTextFactory?: StudioRichTextEditorFactory;
  sourcePreview?: StudioSourcePreviewAdapter;
}

/**
 * Studio-owned registry for first-party page controls. Hosts see stable
 * control identifiers and canonical values, never Editor.js/CodeMirror/chart
 * library configuration.
 */
export class StudioAuthoringControlRegistry {
  readonly #codeField: StudioCodeFieldAdapter;
  readonly #media: StudioMediaAuthoringServices | undefined;
  readonly #richTextFactory: StudioRichTextEditorFactory;
  readonly #sourcePreview: StudioSourcePreviewAdapter | undefined;

  public constructor(services: StudioAuthoringControlServices = {}) {
    this.#codeField = services.codeField ?? new TextareaCodeFieldAdapter();
    this.#media = services.media;
    this.#richTextFactory = services.richTextFactory ?? new StudioRichTextEditorFactory();
    this.#sourcePreview = services.sourcePreview;
  }

  public async mount(
    control: StudioAuthoringControlId,
    options: StudioAuthoringControlOptions,
  ): Promise<StudioAuthoringControlHandle> {
    switch (control) {
      case 'studio.control/rich-text':
        return this.#mountRichText(options);
      case 'studio.control/source':
        return new StudioSourceControl(options, this.#codeField, this.#sourcePreview);
      case 'studio.control/chart':
        return new StudioChartControl(options);
      case 'studio.control/media-reference':
        return mountStudioMediaReferenceControl(options, this.#requireMedia());
      case 'studio.control/media-collection':
        return mountStudioMediaCollectionControl(options, this.#requireMedia());
      case 'studio.control/money':
        return new StudioMoneyControl(options);
      case 'studio.control/scoped-css':
        return new StudioScopedCssControl(options);
      default:
        throw new Error(`Studio control ${control} requires its dedicated drawing service.`);
    }
  }

  async #mountRichText(
    options: StudioAuthoringControlOptions,
  ): Promise<StudioAuthoringControlHandle<StudioRichTextDocument>> {
    if (!isRecord(options.value) || options.value.type !== 'doc') {
      throw new TypeError('Rich-text control requires a canonical Studio document.');
    }
    const profile = parseRichTextProfile(options.profile);
    let value = structuredClone(options.value) as unknown as StudioRichTextDocument;
    const editor = await this.#richTextFactory.create({
      ...(options.binding === undefined ? {} : { binding: options.binding }),
      holder: options.holder,
      onChange: (change) => {
        value = change.value;
        options.onChange?.({ valid: change.valid, value: change.value });
      },
      ...(profile === undefined ? {} : { profile }),
      readOnly: isReadOnly(options),
      value: options.value as unknown as StudioRichTextDocument,
    });
    value = await editor.save();
    return {
      destroy: (): void => editor.destroy(),
      focus: (): void => editor.focus(),
      readOnly: editor.readOnly,
      value: (): StudioRichTextDocument => structuredClone(value),
    };
  }

  #requireMedia(): StudioMediaAuthoringServices {
    if (this.#media === undefined) {
      throw new Error('Studio media controls require host-injected media services.');
    }
    return this.#media;
  }
}

class TextareaCodeFieldAdapter implements StudioCodeFieldAdapter {
  public mount(options: StudioCodeFieldOptions): StudioCodeFieldHandle {
    const textarea = document.createElement('textarea');
    textarea.className = 'studio-source-editor';
    textarea.setAttribute('aria-label', `${options.language} source`);
    textarea.disabled = options.readOnly;
    textarea.rows = 12;
    textarea.spellcheck = false;
    textarea.value = options.source;
    textarea.addEventListener('input', () => options.onChange(textarea.value));
    options.holder.append(textarea);
    return {
      destroy: (): void => textarea.remove(),
      focus: (): void => textarea.focus(),
      source: (): string => textarea.value,
    };
  }
}

class StudioSourceControl implements StudioAuthoringControlHandle<string> {
  readonly #code: StudioCodeFieldHandle;
  readonly #language: string;
  readonly #onChange: StudioAuthoringControlOptions['onChange'];
  readonly #preview: StudioSourcePreviewAdapter | undefined;
  readonly #previewRegion: HTMLElement;
  public readonly readOnly: boolean;
  #abort?: AbortController;
  #lastValid: string;

  public constructor(
    options: StudioAuthoringControlOptions,
    codeAdapter: StudioCodeFieldAdapter,
    preview: StudioSourcePreviewAdapter | undefined,
  ) {
    this.readOnly = isReadOnly(options);
    this.#onChange = options.onChange;
    this.#preview = preview;
    this.#lastValid = parseSourceText(options.value);
    this.#language = parseSourceProfile(options.profile);
    const group = controlGroup(options.holder, 'Source editor');
    const codeHolder = document.createElement('div');
    const previewButton = actionButton('Preview source', () => void this.#renderPreview());
    previewButton.disabled = preview === undefined;
    this.#previewRegion = document.createElement('div');
    this.#previewRegion.setAttribute('aria-live', 'polite');
    this.#previewRegion.setAttribute('aria-label', 'Trusted source preview');
    group.append(codeHolder, previewButton, this.#previewRegion);
    this.#code = codeAdapter.mount({
      holder: codeHolder,
      language: this.#language,
      onChange: (source) => this.#change(source),
      readOnly: this.readOnly,
      source: this.#lastValid,
    });
  }

  public destroy(): void {
    this.#abort?.abort();
    this.#code.destroy();
  }

  public focus(): void {
    this.#code.focus();
  }

  public value(): string {
    return this.#lastValid;
  }

  #change(source: string): void {
    if (this.readOnly) return;
    try {
      this.#lastValid = parseSourceText(source);
      this.#onChange?.({ valid: true, value: this.value() });
    } catch {
      this.#onChange?.({ valid: false, value: this.value() });
    }
  }

  async #renderPreview(): Promise<void> {
    if (this.#preview === undefined) return;
    this.#abort?.abort();
    const controller = new AbortController();
    this.#abort = controller;
    this.#previewRegion.replaceChildren(document.createTextNode('Rendering preview…'));
    try {
      const node = await this.#preview.render(
        { language: this.#language, source: this.value() },
        controller.signal,
      );
      if (!controller.signal.aborted) this.#previewRegion.replaceChildren(node);
    } catch {
      if (!controller.signal.aborted) {
        this.#previewRegion.replaceChildren(document.createTextNode('Preview is unavailable.'));
      }
    }
  }
}

class StudioChartControl implements StudioAuthoringControlHandle<StudioChartSpec> {
  readonly #holder: HTMLElement;
  readonly #onChange: StudioAuthoringControlOptions['onChange'];
  public readonly readOnly: boolean;
  #lastValid: StudioChartSpec;
  #working: StudioChartSpec;

  public constructor(options: StudioAuthoringControlOptions) {
    this.readOnly = isReadOnly(options);
    this.#holder = controlGroup(options.holder, 'Chart editor');
    this.#onChange = options.onChange;
    this.#lastValid = parseStudioChartSpec(options.value);
    this.#working = structuredClone(this.#lastValid);
    this.#render();
  }

  public destroy(): void {
    this.#holder.remove();
  }

  public focus(): void {
    this.#holder.querySelector<HTMLElement>('input,select,button')?.focus();
  }

  public value(): StudioChartSpec {
    return structuredClone(this.#lastValid);
  }

  #commit(): void {
    if (this.readOnly) return;
    try {
      this.#lastValid = parseStudioChartSpec(this.#working);
      this.#onChange?.({ valid: true, value: this.value() });
    } catch {
      this.#onChange?.({ valid: false, value: this.value() });
    }
  }

  #render(): void {
    this.#holder.replaceChildren();
    const type = selectInput(
      'Chart type',
      ['bar', 'line', 'pie', 'doughnut'],
      this.#working.type,
      this.readOnly,
    );
    type.addEventListener('change', () => {
      this.#working.type = type.value as StudioChartSpec['type'];
      this.#commit();
    });
    const title = textInput('Chart title', this.#working.title ?? '', this.readOnly);
    title.maxLength = 500;
    title.addEventListener('input', () => {
      const value = title.value;
      if (value.length === 0) delete this.#working.title;
      else this.#working.title = value;
      this.#commit();
    });
    this.#holder.append(type, title);

    const table = document.createElement('table');
    table.setAttribute('aria-label', 'Chart data');
    const header = document.createElement('tr');
    header.append(tableHeader('Label'));
    for (const [datasetIndex, dataset] of this.#working.datasets.entries()) {
      const cell = tableHeader(`Dataset ${datasetIndex + 1}`);
      const label = textInput(`Dataset ${datasetIndex + 1} label`, dataset.label, this.readOnly);
      label.addEventListener('input', () => {
        dataset.label = label.value.slice(0, 500);
        this.#commit();
      });
      cell.replaceChildren(label);
      header.append(cell);
    }
    table.append(header);
    for (const [rowIndex, labelValue] of this.#working.labels.entries()) {
      const row = document.createElement('tr');
      const labelCell = document.createElement('td');
      const label = textInput(`Chart label ${rowIndex + 1}`, labelValue, this.readOnly);
      label.addEventListener('input', () => {
        this.#working.labels[rowIndex] = label.value.slice(0, 500);
        this.#commit();
      });
      labelCell.append(label);
      row.append(labelCell);
      for (const [datasetIndex, dataset] of this.#working.datasets.entries()) {
        const cell = document.createElement('td');
        const input = textInput(
          `Value for label ${rowIndex + 1}, dataset ${datasetIndex + 1}`,
          String(dataset.values[rowIndex] ?? 0),
          this.readOnly,
        );
        input.inputMode = 'decimal';
        input.addEventListener('input', () => {
          const value = Number(input.value);
          if (!Number.isFinite(value)) {
            this.#onChange?.({ valid: false, value: this.value() });
            return;
          }
          dataset.values[rowIndex] = value;
          this.#commit();
        });
        cell.append(input);
        row.append(cell);
      }
      table.append(row);
    }
    this.#holder.append(table);
    if (!this.readOnly) {
      this.#holder.append(
        actionButton('Add chart row', () => this.#addRow(), this.#working.labels.length >= 200),
        actionButton('Remove chart row', () => this.#removeRow(), this.#working.labels.length <= 1),
        actionButton(
          'Add chart dataset',
          () => this.#addDataset(),
          this.#working.datasets.length >= 20,
        ),
        actionButton(
          'Remove chart dataset',
          () => this.#removeDataset(),
          this.#working.datasets.length <= 1,
        ),
      );
    }
  }

  #addRow(): void {
    if (this.#working.labels.length >= 200) return;
    this.#working.labels.push(`Label ${this.#working.labels.length + 1}`);
    for (const dataset of this.#working.datasets) dataset.values.push(0);
    this.#commit();
    this.#render();
  }

  #removeRow(): void {
    if (this.#working.labels.length <= 1) return;
    this.#working.labels.pop();
    for (const dataset of this.#working.datasets) dataset.values.pop();
    this.#commit();
    this.#render();
  }

  #addDataset(): void {
    if (this.#working.datasets.length >= 20) return;
    this.#working.datasets.push({
      label: `Dataset ${this.#working.datasets.length + 1}`,
      values: this.#working.labels.map(() => 0),
    });
    this.#commit();
    this.#render();
  }

  #removeDataset(): void {
    if (this.#working.datasets.length <= 1) return;
    this.#working.datasets.pop();
    this.#commit();
    this.#render();
  }
}

class StudioMoneyControl implements StudioAuthoringControlHandle<StudioMoneyValue> {
  readonly #amount: HTMLInputElement;
  readonly #currency: HTMLInputElement;
  readonly #holder: HTMLElement;
  readonly #onChange: StudioAuthoringControlOptions['onChange'];
  public readonly readOnly: boolean;
  #lastValid: StudioMoneyValue;

  public constructor(options: StudioAuthoringControlOptions) {
    this.readOnly = isReadOnly(options);
    this.#lastValid = parseStudioMoneyValue(options.value);
    this.#onChange = options.onChange;
    this.#holder = controlGroup(options.holder, 'Money editor');
    this.#amount = textInput('Exact decimal amount', this.#lastValid.amount, this.readOnly);
    this.#amount.inputMode = 'decimal';
    this.#currency = textInput('Three-letter currency', this.#lastValid.currency, this.readOnly);
    this.#currency.maxLength = 3;
    this.#currency.autocapitalize = 'characters';
    this.#amount.addEventListener('input', () => this.#commit());
    this.#currency.addEventListener('input', () => this.#commit());
    this.#holder.append(this.#amount, this.#currency);
  }

  public destroy(): void {
    this.#holder.remove();
  }

  public focus(): void {
    this.#amount.focus();
  }

  public value(): StudioMoneyValue {
    return structuredClone(this.#lastValid);
  }

  #commit(): void {
    if (this.readOnly) return;
    try {
      this.#lastValid = parseStudioMoneyValue({
        amount: this.#amount.value,
        currency: this.#currency.value.toUpperCase(),
      });
      this.#onChange?.({ valid: true, value: this.value() });
    } catch {
      this.#onChange?.({ valid: false, value: this.value() });
    }
  }
}

class StudioScopedCssControl implements StudioAuthoringControlHandle<StudioScopedStyleSheet> {
  readonly #holder: HTMLElement;
  readonly #onChange: StudioAuthoringControlOptions['onChange'];
  readonly #source: HTMLTextAreaElement;
  public readonly readOnly: boolean;
  #lastValid: StudioScopedStyleSheet;

  public constructor(options: StudioAuthoringControlOptions) {
    this.readOnly = isReadOnly(options);
    this.#lastValid = parseScopedStyleSheet(options.value);
    this.#onChange = options.onChange;
    this.#holder = controlGroup(options.holder, 'Scoped style editor');
    const help = document.createElement('p');
    help.textContent =
      'Use only self, heading, content, media, or action targets and approved properties.';
    this.#source = document.createElement('textarea');
    this.#source.setAttribute('aria-label', 'Scoped CSS source');
    this.#source.disabled = this.readOnly;
    this.#source.rows = 10;
    this.#source.value = serializeScopedCss(this.#lastValid);
    this.#source.addEventListener('input', () => this.#commit());
    this.#holder.append(help, this.#source);
  }

  public destroy(): void {
    this.#holder.remove();
  }

  public focus(): void {
    this.#source.focus();
  }

  public value(): StudioScopedStyleSheet {
    return structuredClone(this.#lastValid);
  }

  #commit(): void {
    if (this.readOnly) return;
    try {
      const parsed = parseScopedCss(this.#source.value);
      compileStudioScopedStyleSheet('authoring-preview', parsed);
      this.#lastValid = parsed;
      this.#onChange?.({ valid: true, value: this.value() });
    } catch {
      this.#onChange?.({ valid: false, value: this.value() });
    }
  }
}

export function parseScopedCss(source: string): StudioScopedStyleSheet {
  if (source.length > 100_000) throw new RangeError('Scoped CSS source exceeds 100000 characters.');
  const rules: StudioScopedStyleRule[] = [];
  const pattern = /\s*(self|heading|content|media|action)\s*\{([^{}]*)\}\s*/guy;
  let cursor = 0;
  while (cursor < source.length) {
    pattern.lastIndex = cursor;
    const match = pattern.exec(source);
    if (match?.index !== cursor) {
      throw new TypeError(`Scoped CSS is invalid near character ${cursor + 1}.`);
    }
    const declarations: Record<string, string> = Object.create(null) as Record<string, string>;
    for (const declaration of (match[2] ?? '').split(';')) {
      if (declaration.trim().length === 0) continue;
      const colon = declaration.indexOf(':');
      if (colon < 1) throw new TypeError('Scoped CSS declaration requires property: value.');
      const property = declaration.slice(0, colon).trim().toLowerCase();
      const value = declaration.slice(colon + 1).trim();
      if (Object.hasOwn(declarations, property)) {
        throw new TypeError(`Scoped CSS property ${property} is declared twice.`);
      }
      declarations[property] = value;
    }
    rules.push({ declarations, target: match[1] as StudioScopedStyleRule['target'] });
    cursor = pattern.lastIndex;
  }
  const sheet = { rules } as const;
  compileStudioScopedStyleSheet('authoring-preview', sheet);
  return sheet;
}

export function serializeScopedCss(sheet: Readonly<StudioScopedStyleSheet>): string {
  return sheet.rules
    .map((rule) => {
      const declarations = Object.entries(rule.declarations)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([property, value]) => `  ${property}: ${value};`)
        .join('\n');
      return `${rule.target} {\n${declarations}\n}`;
    })
    .join('\n\n');
}

function parseScopedStyleSheet(value: unknown): StudioScopedStyleSheet {
  if (!isRecord(value) || !Array.isArray(value.rules)) {
    throw new TypeError('Scoped styles require a structured rule collection.');
  }
  const sheet = structuredClone(value) as unknown as StudioScopedStyleSheet;
  compileStudioScopedStyleSheet('authoring-preview', sheet);
  return sheet;
}

function parseSourceText(value: unknown): string {
  if (typeof value !== 'string' || value.length > 1_000_000) {
    throw new RangeError('Source text exceeds its 1000000-character limit.');
  }
  return value;
}

function parseSourceProfile(profile: string | undefined): string {
  switch (profile) {
    case 'studio.source/code':
      return 'code';
    case 'studio.source/latex':
      return 'latex';
    case 'studio.source/mermaid':
      return 'mermaid';
    default:
      throw new TypeError(`Unknown Studio source profile "${String(profile)}".`);
  }
}

function isReadOnly(options: StudioAuthoringControlOptions): boolean {
  return (
    options.readOnly === true ||
    (options.binding !== undefined && options.binding.source.kind !== 'static-value')
  );
}

function parseRichTextProfile(
  value: string | undefined,
):
  | 'studio.rich-text/documentation'
  | 'studio.rich-text/marketing'
  | 'studio.rich-text/portable'
  | undefined {
  if (value === undefined) return undefined;
  if (
    value === 'studio.rich-text/documentation' ||
    value === 'studio.rich-text/marketing' ||
    value === 'studio.rich-text/portable'
  ) {
    return value;
  }
  throw new TypeError(`Unknown Studio rich-text profile "${value}".`);
}

function controlGroup(holder: HTMLElement, label: string): HTMLElement {
  const group = document.createElement('section');
  group.className = 'studio-authoring-control';
  group.setAttribute('aria-label', label);
  holder.append(group);
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

function selectInput(
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

function tableHeader(text: string): HTMLTableCellElement {
  const header = document.createElement('th');
  header.scope = 'col';
  header.textContent = text;
  return header;
}

function actionButton(label: string, action: () => void, disabled = false): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.setAttribute('aria-label', label);
  button.disabled = disabled;
  button.addEventListener('click', action);
  return button;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
