import {
  parseStudioChartSpec,
  parseStudioDrawingDocument,
  parseStudioMoneyValue,
  parseStudioTableDocument,
} from '@kumwe/studio-core';
import type {
  FieldBinding,
  QualifiedName,
  StudioChartSpec,
  StudioDrawingDocument,
  StudioDrawingPoint,
  StudioDrawingStroke,
  StudioMoneyValue,
  StudioTableDocument,
} from '@kumwe/studio-protocol';
import {
  compileStudioScopedStyleSheet,
  type StudioScopedStyleRule,
  type StudioScopedStyleSheet,
} from '@kumwe/studio-renderer-web';
import {
  StudioRichTextEditorFactory,
  StudioStrictCspRichTextSurfaceAdapter,
  type StudioRichTextDocument,
} from '@kumwe/studio-rich-text';
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
  table: 'studio.control/table';
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
  table: 'studio.control/table',
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
  /**
   * Active, host-resolved extension controls. The host supplies only adapters
   * admitted by the immutable contribution generation for this session.
   */
  extensionControls?: readonly StudioExtensionAuthoringControl[];
  media?: StudioMediaAuthoringServices;
  richTextFactory?: StudioRichTextEditorFactory;
  sourcePreview?: StudioSourcePreviewAdapter;
  /** Use Studio's sink-free rich-text surface under strict style CSP and Trusted Types. */
  strictContentSecurityPolicy?: boolean;
}

/** Browser implementation paired with one admitted field-adapter control id. */
export interface StudioExtensionAuthoringControl {
  control: QualifiedName;
  mount(
    options: StudioAuthoringControlOptions,
  ): Promise<StudioAuthoringControlHandle> | StudioAuthoringControlHandle;
}

/**
 * Studio-owned registry for first-party page controls. Hosts see stable
 * control identifiers and canonical values, never Editor.js/CodeMirror/chart
 * library configuration.
 */
export class StudioAuthoringControlRegistry {
  readonly #codeField: StudioCodeFieldAdapter;
  readonly #extensionControls: ReadonlyMap<QualifiedName, StudioExtensionAuthoringControl>;
  readonly #media: StudioMediaAuthoringServices | undefined;
  readonly #richTextFactory: StudioRichTextEditorFactory;
  readonly #sourcePreview: StudioSourcePreviewAdapter | undefined;

  public constructor(services: StudioAuthoringControlServices = {}) {
    this.#codeField = services.codeField ?? new TextareaCodeFieldAdapter();
    this.#media = services.media;
    this.#richTextFactory =
      services.richTextFactory ??
      new StudioRichTextEditorFactory(
        services.strictContentSecurityPolicy === true
          ? new StudioStrictCspRichTextSurfaceAdapter()
          : undefined,
      );
    this.#sourcePreview = services.sourcePreview;
    const extensionControls = new Map<QualifiedName, StudioExtensionAuthoringControl>();
    for (const extension of services.extensionControls ?? []) {
      if (isStudioAuthoringControlId(extension.control)) {
        throw new TypeError(
          `Extension control ${extension.control} cannot replace a first-party Studio control.`,
        );
      }
      if (extensionControls.has(extension.control)) {
        throw new TypeError(`Extension control ${extension.control} is registered more than once.`);
      }
      extensionControls.set(extension.control, extension);
    }
    this.#extensionControls = extensionControls;
  }

  /** True only for first-party controls or adapters admitted to this registry. */
  public supports(control: QualifiedName): boolean {
    return isStudioAuthoringControlId(control) || this.#extensionControls.has(control);
  }

  /**
   * Create a registry view containing first-party controls plus only the
   * precompiled extension controls admitted for one resolved target. Control
   * implementations are retained from this registry; declaration JSON never
   * becomes executable code.
   */
  public forAdmittedExtensionControls(
    controls: readonly QualifiedName[],
  ): StudioAuthoringControlRegistry {
    const admitted = new Set(controls);
    return new StudioAuthoringControlRegistry({
      codeField: this.#codeField,
      extensionControls: [...this.#extensionControls.values()].filter((entry) =>
        admitted.has(entry.control),
      ),
      ...(this.#media === undefined ? {} : { media: this.#media }),
      richTextFactory: this.#richTextFactory,
      ...(this.#sourcePreview === undefined ? {} : { sourcePreview: this.#sourcePreview }),
    });
  }

  /**
   * Bind one resolved host media service without replacing the host's
   * precompiled field controls, rich-text engine, or trusted preview seams.
   */
  public withMediaServices(media: StudioMediaAuthoringServices): StudioAuthoringControlRegistry {
    return new StudioAuthoringControlRegistry({
      codeField: this.#codeField,
      extensionControls: [...this.#extensionControls.values()],
      media,
      richTextFactory: this.#richTextFactory,
      ...(this.#sourcePreview === undefined ? {} : { sourcePreview: this.#sourcePreview }),
    });
  }

  public async mount(
    control: QualifiedName,
    options: StudioAuthoringControlOptions,
  ): Promise<StudioAuthoringControlHandle> {
    const extension = this.#extensionControls.get(control);
    if (extension !== undefined) return extension.mount(options);
    switch (control) {
      case 'studio.control/rich-text':
        return this.#mountRichText(options);
      case 'studio.control/source':
        return new StudioSourceControl(options, this.#codeField, this.#sourcePreview);
      case 'studio.control/chart':
        return new StudioChartControl(options);
      case 'studio.control/drawing':
        return new StudioDrawingControl(options);
      case 'studio.control/media-reference':
        return mountStudioMediaReferenceControl(options, this.#requireMedia());
      case 'studio.control/media-collection':
        return mountStudioMediaCollectionControl(options, this.#requireMedia());
      case 'studio.control/money':
        return new StudioMoneyControl(options);
      case 'studio.control/scoped-css':
        return new StudioScopedCssControl(options);
      case 'studio.control/table':
        return new StudioTableControl(options);
      default:
        throw new Error(`Unknown Studio authoring control ${control}.`);
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

function isStudioAuthoringControlId(control: string): control is StudioAuthoringControlId {
  return Object.values(STUDIO_AUTHORING_CONTROL_IDS).some((candidate) => candidate === control);
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

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

/**
 * Native, dependency-free vector authoring over Studio's bounded drawing value.
 * The SVG is a view only: only detached points, color tokens, and widths cross
 * the control boundary.
 */
class StudioDrawingControl implements StudioAuthoringControlHandle<StudioDrawingDocument> {
  readonly #alt: HTMLTextAreaElement;
  readonly #color: HTMLInputElement;
  readonly #commitStroke: HTMLButtonElement;
  readonly #height: HTMLInputElement;
  readonly #holder: HTMLElement;
  readonly #onChange: StudioAuthoringControlOptions['onChange'];
  readonly #pointX: HTMLInputElement;
  readonly #pointY: HTMLInputElement;
  readonly #status: HTMLElement;
  readonly #strokeWidth: HTMLInputElement;
  readonly #svg: SVGSVGElement;
  readonly #width: HTMLInputElement;
  public readonly readOnly: boolean;
  #activePointerId: number | undefined;
  #lastValid: StudioDrawingDocument;
  #pendingPoints: StudioDrawingPoint[] = [];
  #working: StudioDrawingDocument;

  public constructor(options: StudioAuthoringControlOptions) {
    parseCanonicalControlProfile(options.profile, 'studio.drawing/canonical', 'drawing');
    this.readOnly = isReadOnly(options);
    this.#lastValid = parseStudioDrawingDocument(options.value);
    this.#working = structuredClone(this.#lastValid);
    this.#onChange = options.onChange;
    this.#holder = controlGroup(options.holder, 'Drawing editor');

    const help = document.createElement('p');
    help.textContent = this.readOnly
      ? 'Drawing is read-only.'
      : 'Draw with a pointer, or enter a point and use Add point. Arrow keys move the point; Space adds it and Enter commits the stroke.';

    this.#alt = document.createElement('textarea');
    this.#alt.setAttribute('aria-label', 'Drawing alternative text');
    this.#alt.disabled = this.readOnly;
    this.#alt.maxLength = 5_000;
    this.#alt.rows = 3;
    this.#alt.value = this.#lastValid.alt;
    this.#alt.addEventListener('input', () => {
      this.#working.alt = this.#alt.value;
      this.#commitWorking();
    });

    this.#width = numberInput('Drawing width', this.#lastValid.width, this.readOnly, 1, 4_096, 1);
    this.#height = numberInput(
      'Drawing height',
      this.#lastValid.height,
      this.readOnly,
      1,
      4_096,
      1,
    );
    this.#width.addEventListener('input', () => this.#changeDimensions());
    this.#height.addEventListener('input', () => this.#changeDimensions());

    this.#color = textInput('Drawing color token', '#000000', this.readOnly);
    this.#color.maxLength = 127;
    this.#color.spellcheck = false;
    this.#color.addEventListener('input', () => this.#validateStrokeSettings());
    this.#strokeWidth = numberInput('Drawing stroke width', 2, this.readOnly, 0.25, 64, 0.25);
    this.#strokeWidth.addEventListener('input', () => this.#validateStrokeSettings());

    this.#svg = document.createElementNS(SVG_NAMESPACE, 'svg');
    this.#svg.classList.add('studio-drawing-canvas');
    this.#svg.setAttribute('role', 'img');
    this.#svg.setAttribute('aria-label', this.#lastValid.alt);
    this.#svg.setAttribute(
      'aria-description',
      'Arrow keys move the drawing point. Space adds a point. Enter commits and Escape discards the current stroke.',
    );
    this.#svg.setAttribute(
      'aria-keyshortcuts',
      'ArrowUp ArrowDown ArrowLeft ArrowRight Space Enter Escape',
    );
    this.#svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    this.#svg.tabIndex = this.readOnly ? -1 : 0;
    this.#svg.addEventListener('pointerdown', (event) => this.#beginPointerStroke(event));
    this.#svg.addEventListener('pointermove', (event) => this.#continuePointerStroke(event));
    this.#svg.addEventListener('pointerup', (event) => this.#finishPointerStroke(event));
    this.#svg.addEventListener('pointercancel', (event) => this.#cancelPointerStroke(event));
    this.#svg.addEventListener('keydown', (event) => this.#handleCanvasKey(event));

    this.#pointX = numberInput('Drawing point x', 0, this.readOnly, 0, this.#lastValid.width, 1);
    this.#pointY = numberInput('Drawing point y', 0, this.readOnly, 0, this.#lastValid.height, 1);
    const addPoint = actionButton('Add drawing point', () => this.#addKeyboardPoint());
    this.#commitStroke = actionButton('Commit drawing stroke', () => this.#completeStroke(), true);
    const discardStroke = actionButton('Discard current drawing stroke', () => {
      this.#pendingPoints = [];
      this.#renderDrawing();
    });
    const removeStroke = actionButton(
      'Remove last drawing stroke',
      () => this.#removeLastStroke(),
      this.#lastValid.strokes.length === 0,
    );
    for (const button of [addPoint, this.#commitStroke, discardStroke, removeStroke]) {
      button.hidden = this.readOnly;
    }

    this.#status = document.createElement('p');
    this.#status.setAttribute('aria-live', 'polite');
    this.#status.className = 'studio-authoring-status';

    this.#holder.append(
      help,
      this.#alt,
      this.#width,
      this.#height,
      this.#color,
      this.#strokeWidth,
      this.#svg,
      this.#pointX,
      this.#pointY,
      addPoint,
      this.#commitStroke,
      discardStroke,
      removeStroke,
      this.#status,
    );
    this.#renderDrawing();
  }

  public destroy(): void {
    this.#holder.remove();
  }

  public focus(): void {
    this.#svg.focus();
  }

  public value(): StudioDrawingDocument {
    return structuredClone(this.#lastValid);
  }

  #addKeyboardPoint(): void {
    if (this.readOnly) return;
    const point = {
      x: Number(this.#pointX.value),
      y: Number(this.#pointY.value),
    };
    if (!this.#validPoint(point)) {
      this.#invalid();
      return;
    }
    this.#appendPoint(point);
    this.#renderDrawing();
  }

  #appendPoint(point: StudioDrawingPoint): void {
    if (this.#pendingPoints.length >= 10_000) {
      this.#status.textContent = 'A drawing stroke can contain at most 10000 points.';
      return;
    }
    const previous = this.#pendingPoints.at(-1);
    if (previous?.x === point.x && previous.y === point.y) return;
    this.#pendingPoints.push(point);
  }

  #beginPointerStroke(event: PointerEvent): void {
    if (this.readOnly || event.button !== 0) return;
    event.preventDefault();
    this.#activePointerId = event.pointerId;
    this.#pendingPoints = [this.#pointFromPointer(event)];
    try {
      this.#svg.setPointerCapture(event.pointerId);
    } catch {
      // A detached/testing SVG can lack pointer capture; in-document pointer
      // events still retain the same canonical completion path.
    }
    this.#renderDrawing();
  }

  #cancelPointerStroke(event: PointerEvent): void {
    if (event.pointerId !== this.#activePointerId) return;
    this.#activePointerId = undefined;
    this.#pendingPoints = [];
    this.#renderDrawing();
  }

  #changeDimensions(): void {
    if (this.readOnly) return;
    this.#working.width = Number(this.#width.value);
    this.#working.height = Number(this.#height.value);
    if (this.#commitWorking()) {
      this.#pointX.max = String(this.#lastValid.width);
      this.#pointY.max = String(this.#lastValid.height);
      this.#pointX.value = String(clamp(Number(this.#pointX.value), 0, this.#lastValid.width));
      this.#pointY.value = String(clamp(Number(this.#pointY.value), 0, this.#lastValid.height));
      this.#renderDrawing();
    }
  }

  #commitWorking(): boolean {
    if (this.readOnly) return false;
    try {
      this.#lastValid = parseStudioDrawingDocument(this.#working);
      this.#working = structuredClone(this.#lastValid);
      this.#onChange?.({ valid: true, value: this.value() });
      this.#svg.setAttribute('aria-label', this.#lastValid.alt);
      return true;
    } catch {
      this.#invalid();
      return false;
    }
  }

  #completeStroke(): void {
    if (this.readOnly || this.#pendingPoints.length === 0) return;
    try {
      const stroke = this.#parseStroke(this.#pendingPoints);
      this.#working.strokes = [...this.#lastValid.strokes, stroke];
      if (!this.#commitWorking()) return;
      this.#pendingPoints = [];
      this.#renderDrawing();
    } catch {
      this.#invalid();
    }
  }

  #continuePointerStroke(event: PointerEvent): void {
    if (event.pointerId !== this.#activePointerId) return;
    event.preventDefault();
    this.#appendPoint(this.#pointFromPointer(event));
    this.#renderDrawing();
  }

  #finishPointerStroke(event: PointerEvent): void {
    if (event.pointerId !== this.#activePointerId) return;
    event.preventDefault();
    this.#appendPoint(this.#pointFromPointer(event));
    this.#activePointerId = undefined;
    this.#completeStroke();
  }

  #handleCanvasKey(event: KeyboardEvent): void {
    if (this.readOnly) return;
    const step = event.shiftKey ? 10 : 1;
    let x = Number(this.#pointX.value);
    let y = Number(this.#pointY.value);
    switch (event.key) {
      case 'ArrowLeft':
        x -= step;
        break;
      case 'ArrowRight':
        x += step;
        break;
      case 'ArrowUp':
        y -= step;
        break;
      case 'ArrowDown':
        y += step;
        break;
      case ' ':
        event.preventDefault();
        this.#addKeyboardPoint();
        return;
      case 'Enter':
        event.preventDefault();
        this.#completeStroke();
        return;
      case 'Escape':
        event.preventDefault();
        this.#pendingPoints = [];
        this.#renderDrawing();
        return;
      default:
        return;
    }
    event.preventDefault();
    this.#pointX.value = String(clamp(x, 0, this.#lastValid.width));
    this.#pointY.value = String(clamp(y, 0, this.#lastValid.height));
  }

  #invalid(): void {
    this.#onChange?.({ valid: false, value: this.value() });
  }

  #parseStroke(points: readonly StudioDrawingPoint[]): StudioDrawingStroke {
    const candidate = parseStudioDrawingDocument({
      alt: this.#lastValid.alt,
      height: this.#lastValid.height,
      strokes: [
        {
          color: this.#color.value,
          points: structuredClone(points),
          width: Number(this.#strokeWidth.value),
        },
      ],
      width: this.#lastValid.width,
    }).strokes[0];
    if (candidate === undefined) throw new TypeError('Drawing stroke is unavailable.');
    return candidate;
  }

  #pointFromPointer(event: PointerEvent): StudioDrawingPoint {
    const bounds = this.#svg.getBoundingClientRect();
    const x =
      bounds.width > 0
        ? ((event.clientX - bounds.left) / bounds.width) * this.#lastValid.width
        : event.offsetX;
    const y =
      bounds.height > 0
        ? ((event.clientY - bounds.top) / bounds.height) * this.#lastValid.height
        : event.offsetY;
    return {
      x: clamp(Number.isFinite(x) ? x : 0, 0, this.#lastValid.width),
      y: clamp(Number.isFinite(y) ? y : 0, 0, this.#lastValid.height),
    };
  }

  #removeLastStroke(): void {
    if (this.readOnly || this.#lastValid.strokes.length === 0) return;
    this.#working = structuredClone(this.#lastValid);
    this.#working.strokes.pop();
    if (this.#commitWorking()) this.#renderDrawing();
  }

  #renderDrawing(): void {
    this.#svg.setAttribute(
      'viewBox',
      `0 0 ${String(this.#lastValid.width)} ${String(this.#lastValid.height)}`,
    );
    this.#svg.replaceChildren();
    for (const stroke of this.#lastValid.strokes) this.#svg.append(this.#strokeElement(stroke));
    if (this.#pendingPoints.length > 0) {
      try {
        this.#svg.append(this.#strokeElement(this.#parseStroke(this.#pendingPoints)));
      } catch {
        // Invalid transient tool settings do not replace canonical output.
      }
    }
    this.#commitStroke.disabled = this.#pendingPoints.length === 0;
    this.#status.textContent = `${String(this.#lastValid.strokes.length)} committed strokes; ${String(this.#pendingPoints.length)} points in the current stroke.`;
    const remove = this.#holder.querySelector<HTMLButtonElement>(
      '[aria-label="Remove last drawing stroke"]',
    );
    if (remove !== null) remove.disabled = this.#lastValid.strokes.length === 0;
  }

  #strokeElement(stroke: StudioDrawingStroke): SVGPolylineElement {
    const polyline = document.createElementNS(SVG_NAMESPACE, 'polyline');
    polyline.setAttribute('fill', 'none');
    polyline.setAttribute(
      'points',
      stroke.points.map((point) => `${point.x},${point.y}`).join(' '),
    );
    polyline.setAttribute('stroke', stroke.color.startsWith('#') ? stroke.color : 'currentColor');
    polyline.setAttribute('stroke-linecap', 'round');
    polyline.setAttribute('stroke-linejoin', 'round');
    polyline.setAttribute('stroke-width', String(stroke.width));
    return polyline;
  }

  #validPoint(point: StudioDrawingPoint): boolean {
    try {
      this.#parseStroke([point]);
      return true;
    } catch {
      return false;
    }
  }

  #validateStrokeSettings(): void {
    if (this.readOnly) return;
    try {
      this.#parseStroke(this.#pendingPoints.length === 0 ? [{ x: 0, y: 0 }] : this.#pendingPoints);
    } catch {
      this.#invalid();
    }
    this.#renderDrawing();
  }
}

/** Text-only canonical table editor; DOM table markup is never the value. */
class StudioTableControl implements StudioAuthoringControlHandle<StudioTableDocument> {
  readonly #holder: HTMLElement;
  readonly #onChange: StudioAuthoringControlOptions['onChange'];
  public readonly readOnly: boolean;
  #lastValid: StudioTableDocument;
  #working: StudioTableDocument;

  public constructor(options: StudioAuthoringControlOptions) {
    parseCanonicalControlProfile(options.profile, 'studio.table/canonical', 'table');
    this.readOnly = isReadOnly(options);
    this.#lastValid = parseStudioTableDocument(options.value);
    this.#working = structuredClone(this.#lastValid);
    this.#onChange = options.onChange;
    this.#holder = controlGroup(options.holder, 'Table editor');
    this.#render();
  }

  public destroy(): void {
    this.#holder.remove();
  }

  public focus(): void {
    this.#holder.querySelector<HTMLElement>('input,textarea,button')?.focus();
  }

  public value(): StudioTableDocument {
    return structuredClone(this.#lastValid);
  }

  #addColumn(): void {
    if (this.readOnly || this.#lastValid.columns.length >= 50) return;
    this.#working = structuredClone(this.#lastValid);
    this.#working.columns.push(`Column ${String(this.#working.columns.length + 1)}`);
    for (const row of this.#working.rows) row.push('');
    if (this.#commit()) this.#render();
  }

  #addRow(): void {
    if (this.readOnly || this.#lastValid.rows.length >= 1_000) return;
    this.#working = structuredClone(this.#lastValid);
    this.#working.rows.push(this.#working.columns.map(() => ''));
    if (this.#commit()) this.#render();
  }

  #commit(): boolean {
    if (this.readOnly) return false;
    try {
      this.#lastValid = parseStudioTableDocument(this.#working);
      this.#working = structuredClone(this.#lastValid);
      this.#onChange?.({ valid: true, value: this.value() });
      return true;
    } catch {
      this.#onChange?.({ valid: false, value: this.value() });
      return false;
    }
  }

  #removeColumn(): void {
    if (this.readOnly || this.#lastValid.columns.length <= 1) return;
    this.#working = structuredClone(this.#lastValid);
    this.#working.columns.pop();
    for (const row of this.#working.rows) row.pop();
    if (this.#commit()) this.#render();
  }

  #removeRow(): void {
    if (this.readOnly || this.#lastValid.rows.length === 0) return;
    this.#working = structuredClone(this.#lastValid);
    this.#working.rows.pop();
    if (this.#commit()) this.#render();
  }

  #render(): void {
    this.#holder.replaceChildren();
    const help = document.createElement('p');
    help.textContent = 'Table cells are text. HTML and executable content are not interpreted.';
    const caption = textInput('Table caption', this.#working.caption ?? '', this.readOnly);
    caption.maxLength = 500;
    caption.addEventListener('input', () => {
      if (caption.value.length === 0) delete this.#working.caption;
      else this.#working.caption = caption.value;
      this.#commit();
    });
    this.#holder.append(help, caption);

    const table = document.createElement('table');
    table.setAttribute('aria-label', 'Table data');
    const head = document.createElement('thead');
    const headerRow = document.createElement('tr');
    headerRow.append(tableHeader('Row'));
    for (const [columnIndex, columnValue] of this.#working.columns.entries()) {
      const header = tableHeader(`Column ${String(columnIndex + 1)}`);
      const input = textInput(
        `Table column ${String(columnIndex + 1)} heading`,
        columnValue,
        this.readOnly,
      );
      input.maxLength = 500;
      input.addEventListener('input', () => {
        this.#working.columns[columnIndex] = input.value;
        this.#commit();
      });
      header.replaceChildren(input);
      headerRow.append(header);
    }
    head.append(headerRow);
    table.append(head);

    const body = document.createElement('tbody');
    for (const [rowIndex, rowValue] of this.#working.rows.entries()) {
      const row = document.createElement('tr');
      const rowHeader = document.createElement('th');
      rowHeader.scope = 'row';
      rowHeader.textContent = String(rowIndex + 1);
      row.append(rowHeader);
      for (const [columnIndex, cellValue] of rowValue.entries()) {
        const cell = document.createElement('td');
        const input = document.createElement('textarea');
        input.setAttribute(
          'aria-label',
          `Table row ${String(rowIndex + 1)}, column ${String(columnIndex + 1)}`,
        );
        input.disabled = this.readOnly;
        input.maxLength = 5_000;
        input.rows = 2;
        input.value = cellValue;
        input.addEventListener('input', () => {
          const targetRow = this.#working.rows[rowIndex];
          if (targetRow === undefined) return;
          targetRow[columnIndex] = input.value;
          this.#commit();
        });
        cell.append(input);
        row.append(cell);
      }
      body.append(row);
    }
    table.append(body);
    this.#holder.append(table);

    if (!this.readOnly) {
      const actions = document.createElement('div');
      actions.className = 'studio-authoring-actions';
      actions.append(
        actionButton('Add table row', () => this.#addRow(), this.#working.rows.length >= 1_000),
        actionButton(
          'Remove last table row',
          () => this.#removeRow(),
          this.#working.rows.length === 0,
        ),
        actionButton(
          'Add table column',
          () => this.#addColumn(),
          this.#working.columns.length >= 50,
        ),
        actionButton(
          'Remove last table column',
          () => this.#removeColumn(),
          this.#working.columns.length <= 1,
        ),
      );
      this.#holder.append(actions);
    }
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

function parseCanonicalControlProfile(
  value: string | undefined,
  expected: string,
  name: string,
): void {
  if (value !== undefined && value !== expected) {
    throw new TypeError(`Unknown Studio ${name} profile "${value}".`);
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

function numberInput(
  label: string,
  value: number,
  readOnly: boolean,
  minimum: number,
  maximum: number,
  step: number,
): HTMLInputElement {
  const input = document.createElement('input');
  input.type = 'number';
  input.setAttribute('aria-label', label);
  input.disabled = readOnly;
  input.max = String(maximum);
  input.min = String(minimum);
  input.step = String(step);
  input.value = String(value);
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

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
