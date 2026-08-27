import {
  css,
  html,
  LitElement,
  nothing,
  type CSSResult,
  type PropertyValues,
  type TemplateResult,
} from 'lit';
import { permittedCommandTypes, StudioCommandError, StudioSession } from '@kumwe/studio-core';
import type {
  AddModelFieldCommand,
  AuthoringSaveDraft,
  AuthoringSaveIntent,
  AuthoringSaveOutcome,
  AuthoringSessionSnapshot,
  AuthoringPresentationState,
  BlueprintDocument,
  ContentFieldKind,
  ContentModelDocument,
  EntryDocument,
  ExperimentalShellConfiguration,
  FieldDefinition,
  JsonValue,
  LocalName,
  MessageReference,
  PatternDocument,
  QualifiedName,
  Revision,
  SetFieldValueCommand,
  StableId,
  StudioAuthoringMode,
  StudioDiagnostic,
  ThemeDesignControl,
  ThemeDocument,
  ThemeViewport,
} from '@kumwe/studio-protocol';
import {
  STUDIO_AUTHORING_CONTROL_IDS,
  StudioAuthoringControlRegistry,
  type StudioAuthoringControlHandle,
  type StudioAuthoringControlId,
} from './authoring-controls.js';
import type { KumweStudioElement, StudioDocumentChangeDetail } from './kumwe-studio.js';
import { messageText, type StudioMessageKey, type StudioMessageOverrides } from './messages.js';
import type { StudioPreviewBinding } from './preview-surface.js';
import type { StudioResourceSearchService } from './resource-authoring-control.js';

export const STUDIO_CONTEXTUAL_MODES: readonly StudioAuthoringMode[] = Object.freeze([
  'model',
  'blueprint',
  'content',
] as const satisfies readonly StudioAuthoringMode[]);

export const STUDIO_CONTEXTUAL_PRESENTATIONS: readonly AuthoringPresentationState[] = Object.freeze(
  [
    'inline',
    'minimized',
    'maximized',
    'fullscreen',
  ] as const satisfies readonly AuthoringPresentationState[],
);

export const STUDIO_CONTEXTUAL_SAVE_OUTCOMES: readonly AuthoringSaveOutcome[] = Object.freeze([
  'save-item',
  'save-new-type-version',
  'save-as-new-type',
] as const satisfies readonly AuthoringSaveOutcome[]);

export interface StudioContextualDirtyState {
  blueprint: boolean;
  entry: boolean;
  model: boolean;
}

export interface StudioContextualStateVersions {
  blueprint: number;
  entry: number;
  model: number;
}

export interface StudioContextualChangeDetail {
  artifact: 'blueprint' | 'entry' | 'model';
  command: AddModelFieldCommand | SetFieldValueCommand | StudioDocumentChangeDetail['command'];
  snapshot: AuthoringSessionSnapshot;
  source: 'command' | 'redo' | 'undo';
  stateVersions: StudioContextualStateVersions;
}

export interface StudioContextualModeChangeDetail {
  mode: StudioAuthoringMode;
  previousMode: StudioAuthoringMode;
  snapshot: AuthoringSessionSnapshot;
}

export interface StudioContextualPresentationChangeDetail {
  presentation: AuthoringPresentationState;
  previousPresentation: AuthoringPresentationState;
  snapshot: AuthoringSessionSnapshot;
}

export interface StudioContextualSaveRequestDetail {
  intent: AuthoringSaveIntent;
  snapshot: AuthoringSessionSnapshot;
}

interface MountedEntryControl {
  handle: StudioAuthoringControlHandle;
  holder: HTMLElement;
  signature: string;
}

interface EntryFieldTarget {
  control: StudioAuthoringControlId;
  field: FieldDefinition;
  key: string;
  path: LocalName[];
  readOnly: boolean;
  value: JsonValue;
}

interface DraftState {
  entry: EntryDocument;
  entrySavedVersion: number;
  entryVersion: number;
  model: ContentModelDocument;
  modelSavedVersion: number;
  modelVersion: number;
}

const LOCAL_NAME = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;
const BUILT_IN_FIELD_KINDS = Object.freeze([
  'string',
  'rich-text',
  'boolean',
  'integer',
  'decimal',
  'money',
  'date',
  'date-time',
  'enum',
  'media',
  'resource',
  'object',
  'collection',
] as const satisfies readonly ContentFieldKind[]);
const ADVANCED_CONTROLS: ReadonlySet<string> = new Set(Object.values(STUDIO_AUTHORING_CONTROL_IDS));

/**
 * The composed contextual shell. It keeps the existing Blueprint shell alive
 * as its canvas implementation while Model and Content modes use the same
 * core command guards and one resource/session generation.
 */
export class KumweStudioContextualElement extends LitElement {
  public static override properties = {
    authoringControlRegistry: { attribute: false },
    configuration: { attribute: false },
    designControls: { attribute: false },
    messages: { attribute: false },
    mode: { attribute: false, state: true },
    patterns: { attribute: false },
    presentation: { attribute: false, reflect: true },
    previewBinding: { attribute: false },
    session: { attribute: false },
    resourceSearchService: { attribute: false },
    theme: { attribute: false },
    viewports: { attribute: false },
  };

  public static override styles: CSSResult = css`
    :host {
      --studio-contextual-border: var(--studio-border, #d7dce2);
      --studio-contextual-panel: var(--studio-panel, #f7f8fa);
      --studio-contextual-primary: var(--studio-primary, #3157d5);
      color: #18202a;
      display: block;
      font:
        400 0.9375rem/1.45 system-ui,
        sans-serif;
      min-inline-size: 0;
    }

    :host([presentation='fullscreen']) {
      background: white;
      inset: 0;
      overflow: auto;
      position: fixed;
      z-index: 2147483000;
    }

    .contextual-workspace {
      background: white;
      border: 1px solid var(--studio-contextual-border);
      min-inline-size: 0;
    }

    .contextual-workspace[data-presentation='maximized'] {
      min-block-size: min(90vh, 70rem);
    }

    .contextual-header {
      align-items: flex-start;
      background: var(--studio-contextual-panel);
      border-block-end: 1px solid var(--studio-contextual-border);
      display: grid;
      gap: 0.75rem;
      grid-template-columns: minmax(12rem, 1fr) auto;
      padding: 0.75rem 1rem;
    }

    .contextual-identity h1 {
      font-size: 1rem;
      margin: 0;
    }

    .contextual-identity p,
    .contextual-status p,
    .field-help,
    .empty-state {
      color: #5d6671;
      font-size: 0.8125rem;
      margin: 0.25rem 0 0;
      overflow-wrap: anywhere;
    }

    .contextual-actions,
    .contextual-presentations,
    .contextual-save-actions,
    .contextual-mode-tabs {
      display: flex;
      flex-wrap: wrap;
      gap: 0.375rem;
    }

    button,
    input,
    select,
    textarea {
      font: inherit;
    }

    button {
      background: white;
      border: 1px solid var(--studio-contextual-border);
      border-radius: 0.375rem;
      color: inherit;
      cursor: pointer;
      padding: 0.5rem 0.625rem;
    }

    button:disabled,
    input:disabled,
    select:disabled,
    textarea:disabled {
      cursor: not-allowed;
      opacity: 0.55;
    }

    :is(button, input, select, textarea):focus-visible {
      outline: 0.1875rem solid color-mix(in srgb, var(--studio-contextual-primary), transparent 55%);
      outline-offset: 0.125rem;
    }

    button[aria-selected='true'],
    button[aria-pressed='true'] {
      border-color: var(--studio-contextual-primary);
      box-shadow: inset 0.1875rem 0 0 var(--studio-contextual-primary);
    }

    .contextual-mode-tabs {
      border-block-end: 1px solid var(--studio-contextual-border);
      padding: 0.625rem 1rem;
    }

    .contextual-mode-tabs button {
      min-inline-size: 6rem;
      text-align: center;
    }

    .contextual-panel {
      min-inline-size: 0;
    }

    .contextual-panel[hidden],
    .contextual-body[hidden] {
      display: none;
    }

    .model-panel,
    .content-panel {
      display: grid;
      gap: 1rem;
      grid-template-columns: minmax(15rem, 20rem) minmax(18rem, 1fr);
      padding: 1rem;
    }

    .field-builder,
    .field-values,
    .model-fields {
      border: 1px solid var(--studio-contextual-border);
      border-radius: 0.5rem;
      min-inline-size: 0;
      padding: 1rem;
    }

    h2,
    h3 {
      margin-block-start: 0;
    }

    h2 {
      font-size: 1rem;
    }

    h3 {
      font-size: 0.9375rem;
    }

    .model-field-form,
    .entry-field-list {
      display: grid;
      gap: 0.75rem;
    }

    .form-control,
    .entry-field-control {
      display: grid;
      gap: 0.25rem;
      min-inline-size: 0;
    }

    .form-control > :is(input, select, textarea),
    .entry-field-control > :is(input, select, textarea),
    .entry-advanced-holder {
      border: 1px solid var(--studio-contextual-border);
      border-radius: 0.375rem;
      box-sizing: border-box;
      inline-size: 100%;
      min-inline-size: 0;
      padding: 0.5rem;
    }

    .checkbox-control {
      align-items: center;
      display: flex;
      gap: 0.5rem;
    }

    .checkbox-control input {
      block-size: 1.25rem;
      inline-size: 1.25rem;
    }

    .model-field-list,
    .diagnostic-list {
      display: grid;
      gap: 0.5rem;
      list-style: none;
      margin: 0;
      padding: 0;
    }

    .model-field-list li {
      border-block-end: 1px solid var(--studio-contextual-border);
      display: grid;
      gap: 0.125rem;
      padding-block-end: 0.5rem;
    }

    .field-coordinate {
      color: #5d6671;
      font-size: 0.75rem;
    }

    .contextual-status {
      align-items: start;
      border-block-start: 1px solid var(--studio-contextual-border);
      display: grid;
      gap: 0.5rem;
      grid-template-columns: 1fr auto;
      padding: 0.625rem 1rem;
    }

    .dirty-summary[data-dirty='true'] {
      color: #7c4a03;
    }

    .assistive {
      block-size: 1px;
      clip-path: inset(50%);
      inline-size: 1px;
      margin: -1px;
      overflow: hidden;
      position: absolute;
      white-space: nowrap;
    }

    @media (max-width: 50rem) {
      .contextual-header,
      .model-panel,
      .content-panel {
        grid-template-columns: minmax(0, 1fr);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      :host,
      *,
      *::before,
      *::after {
        animation-duration: 0s !important;
        scroll-behavior: auto !important;
        transition-duration: 0s !important;
      }
    }
  `;

  declare public authoringControlRegistry: StudioAuthoringControlRegistry | undefined;
  declare public configuration: ExperimentalShellConfiguration | undefined;
  declare public designControls: ThemeDesignControl[] | undefined;
  declare public messages: StudioMessageOverrides | undefined;
  declare public patterns: PatternDocument[] | undefined;
  declare public previewBinding: StudioPreviewBinding | undefined;
  /** Exact host-resolved contextual session; it is the sole launch input. */
  declare public session: AuthoringSessionSnapshot | undefined;
  declare public resourceSearchService: StudioResourceSearchService | undefined;
  declare public theme: ThemeDocument | undefined;
  declare public viewports: ThemeViewport[] | undefined;
  declare protected mode: StudioAuthoringMode;
  declare protected presentation: AuthoringPresentationState;

  readonly #defaultAuthoringControlRegistry = new StudioAuthoringControlRegistry();
  readonly #entryControls = new Map<string, MountedEntryControl>();
  #entryControlsReady: Promise<void> = Promise.resolve();
  #blueprintDraft: BlueprintDocument | undefined;
  #blueprintSessionConfiguration: ExperimentalShellConfiguration | undefined;
  #draft: DraftState | undefined;
  #entryExecutor: StudioSession | undefined;
  #initialDirty: ReadonlySet<'blueprint' | 'entry' | 'model'> = new Set();
  #modelExecutor: StudioSession | undefined;
  #resourceDiagnostics: StudioDiagnostic[] = [];
  #resourceGeneration = '';
  #commandSequence = 0;
  #announcement = '';

  public constructor() {
    super();
    this.mode = 'blueprint';
    this.presentation = 'inline';
  }

  public get authoringReady(): Promise<void> {
    return Promise.all([
      this.#entryControlsReady,
      this.blueprintElement?.authoringReady ?? Promise.resolve(),
    ]).then(() => undefined);
  }

  public get blueprintElement(): KumweStudioElement | undefined {
    return this.shadowRoot?.querySelector<KumweStudioElement>('kumwe-studio') ?? undefined;
  }

  public get currentMode(): StudioAuthoringMode {
    return this.mode;
  }

  public get currentPresentation(): AuthoringPresentationState {
    return this.presentation;
  }

  public get dirty(): boolean {
    const dirty = this.dirtyState;
    return dirty.blueprint || dirty.entry || dirty.model;
  }

  public get dirtyState(): StudioContextualDirtyState {
    return {
      blueprint: this.#initialDirty.has('blueprint') || (this.blueprintElement?.dirty ?? false),
      entry:
        this.#draft !== undefined && this.#draft.entryVersion !== this.#draft.entrySavedVersion,
      model:
        this.#draft !== undefined && this.#draft.modelVersion !== this.#draft.modelSavedVersion,
    };
  }

  public get diagnostics(): readonly StudioDiagnostic[] {
    return [
      ...this.#resourceDiagnostics.map((diagnostic) => structuredClone(diagnostic)),
      ...(this.blueprintElement?.diagnostics ?? []),
    ];
  }

  public get snapshot(): AuthoringSessionSnapshot | undefined {
    const session = this.session;
    const draft = this.#draft;
    const blueprint =
      this.#blueprintDraft ?? this.blueprintElement?.document ?? session?.state.blueprint;
    if (session === undefined || draft === undefined || blueprint === undefined) {
      return undefined;
    }
    const dirty = this.dirtyState;
    const snapshot = structuredClone(session);
    snapshot.presentation.current = this.presentation;
    snapshot.state = {
      ...snapshot.state,
      blueprint: structuredClone(blueprint),
      diagnostics: [...this.diagnostics],
      dirty: (['model', 'blueprint', 'entry'] as const).filter((artifact) => dirty[artifact]),
      entry: structuredClone(draft.entry),
      model: structuredClone(draft.model),
    };
    return snapshot;
  }

  /** Add one fully typed field through the core Model command path. */
  public addField(field: FieldDefinition, position?: number): ContentModelDocument {
    const draft = this.#requireDraft();
    const session = this.#requireExecutor(this.#modelExecutor, 'Model');
    const command: AddModelFieldCommand = {
      ...this.#commandEnvelope(draft.model.id, draft.modelVersion),
      payload: { field: structuredClone(field), ...(position === undefined ? {} : { position }) },
      type: 'studio.command/add-model-field',
    };
    try {
      draft.model = session.executeModelCommand(draft.model, command);
    } catch (error) {
      this.#announceCommandFailure(error);
      throw error;
    }
    draft.modelVersion += 1;
    this.#emitChange('model', command, 'command');
    this.requestUpdate();
    return structuredClone(draft.model);
  }

  /** Set one actual Entry value through the core Content command path. */
  public setEntryValue(fieldPath: readonly LocalName[], value: JsonValue): EntryDocument {
    const draft = this.#requireDraft();
    const session = this.#requireExecutor(this.#entryExecutor, 'Content');
    const command: SetFieldValueCommand = {
      ...this.#commandEnvelope(draft.entry.id, draft.entryVersion),
      payload: {
        fieldPath: [...fieldPath],
        ...(draft.entry.locale === undefined ? {} : { locale: draft.entry.locale }),
        value: structuredClone(value),
      },
      type: 'studio.command/set-field-value',
    };
    try {
      draft.entry = session.executeEntryCommand(draft.entry, command);
    } catch (error) {
      this.#announceCommandFailure(error);
      throw error;
    }
    draft.entryVersion += 1;
    this.#emitChange('entry', command, 'command');
    this.requestUpdate();
    return structuredClone(draft.entry);
  }

  public setMode(mode: StudioAuthoringMode): void {
    const session = this.session;
    if (session?.capabilities.modes.includes(mode) !== true) {
      throw new RangeError(`Studio mode ${mode} is not authorized for this resource.`);
    }
    if (mode === this.mode) return;
    const previousMode = this.mode;
    this.mode = mode;
    this.#announcement = this.#text('studio.contextual/announce-mode', {
      mode: this.#modeLabel(mode),
    });
    this.dispatchEvent(
      new CustomEvent<StudioContextualModeChangeDetail>('studio-contextual-mode-change', {
        bubbles: true,
        composed: true,
        detail: { mode, previousMode, snapshot: this.#requireSnapshot() },
      }),
    );
  }

  public setPresentation(presentation: AuthoringPresentationState): void {
    const session = this.session;
    if (session?.capabilities.presentationStates.includes(presentation) !== true) {
      throw new RangeError(
        `Studio presentation ${presentation} is not authorized for this resource.`,
      );
    }
    if (presentation === this.presentation) return;
    const previousPresentation = this.presentation;
    this.presentation = presentation;
    this.#announcement = this.#text('studio.contextual/announce-presentation', {
      presentation: this.#presentationLabel(presentation),
    });
    this.dispatchEvent(
      new CustomEvent<StudioContextualPresentationChangeDetail>(
        'studio-contextual-presentation-change',
        {
          bubbles: true,
          composed: true,
          detail: {
            presentation,
            previousPresentation,
            snapshot: this.#requireSnapshot(),
          },
        },
      ),
    );
  }

  /**
   * Emits intent and a detached exact snapshot. No persistence, revision,
   * authorization, or publication effect occurs in the browser shell.
   */
  public requestSave(outcome: AuthoringSaveOutcome): void {
    const session = this.session;
    const snapshot = this.snapshot;
    if (
      session === undefined ||
      snapshot === undefined ||
      !session.capabilities.saveOutcomes.includes(outcome)
    ) {
      throw new RangeError(`Studio save outcome ${outcome} is not authorized for this resource.`);
    }
    const intent: AuthoringSaveIntent = {
      contractVersion: snapshot.contractVersion,
      draft: saveDraft(outcome, snapshot),
      expected: structuredClone(snapshot.state.coordinates),
      kind: 'authoring-save-intent',
      sessionId: snapshot.sessionId,
    };
    this.dispatchEvent(
      new CustomEvent<StudioContextualSaveRequestDetail>('studio-contextual-save-request', {
        bubbles: true,
        composed: true,
        detail: {
          intent,
          snapshot,
        },
      }),
    );
    this.#announcement = this.#text('studio.contextual/announce-save-requested', {
      outcome: this.#saveOutcomeLabel(outcome),
    });
    this.requestUpdate();
  }

  public override disconnectedCallback(): void {
    this.#destroyEntryControls();
    super.disconnectedCallback();
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('session') || changed.has('configuration')) {
      this.#rebuildDraft();
    }
    if (changed.has('authoringControlRegistry')) {
      this.#destroyEntryControls();
    }
  }

  protected override updated(): void {
    this.#entryControlsReady = this.#entryControlsReady
      .catch(() => undefined)
      .then(() => this.#synchronizeEntryControls());
  }

  protected override render(): TemplateResult {
    const session = this.session;
    const draft = this.#draft;
    if (session === undefined || draft === undefined) {
      return html`<section class="contextual-workspace contextual-unavailable">
        <p class="empty-state">${this.#text('studio.contextual/unavailable')}</p>
      </section>`;
    }
    const minimized = this.presentation === 'minimized';
    const readOnly = this.configuration?.session.sessionState === 'read-only';
    const modes = session.capabilities.modes;

    return html`
      <section
        class="contextual-workspace"
        data-mode=${this.mode}
        data-presentation=${this.presentation}
        data-start=${session.start.kind}
      >
        <header class="contextual-header">
          <div class="contextual-identity">
            <h1>${referenceText(session.target.label)}</h1>
            <p>
              ${session.target.id} · ${this.#startLabel(session)} ·
              ${draft.model.id}@${draft.model.version}#${draft.model.revision}
            </p>
          </div>
          <div class="contextual-actions">
            <div
              class="contextual-presentations"
              role="group"
              aria-label=${this.#text('studio.contextual/workspace-size')}
            >
              ${session.capabilities.presentationStates.map(
                (presentation) => html`
                  <button
                    type="button"
                    class="contextual-presentation-button"
                    data-presentation=${presentation}
                    aria-pressed=${this.presentation === presentation ? 'true' : 'false'}
                    @click=${(): void => this.setPresentation(presentation)}
                  >
                    ${this.#presentationLabel(presentation)}
                  </button>
                `,
              )}
            </div>
            <div
              class="contextual-save-actions"
              role="group"
              aria-label=${this.#text('studio.contextual/save-outcome')}
            >
              ${session.capabilities.saveOutcomes.map((outcome) => {
                return html`
                  <button
                    type="button"
                    class="contextual-save-button"
                    data-outcome=${outcome}
                    title=${this.#text('studio.contextual/save-plan-help')}
                    ?disabled=${readOnly}
                    @click=${(): void => this.requestSave(outcome)}
                  >
                    ${this.#saveOutcomeLabel(outcome)}
                  </button>
                `;
              })}
            </div>
          </div>
        </header>

        <div class="contextual-body" ?hidden=${minimized}>
          <nav
            class="contextual-mode-tabs"
            role="tablist"
            aria-label=${this.#text('studio.contextual/authoring-mode')}
            @keydown=${(event: KeyboardEvent): void => this.#onModeTabKeydown(event)}
          >
            ${modes.map(
              (mode) => html`
                <button
                  type="button"
                  id=${`studio-contextual-tab-${mode}`}
                  class="contextual-mode-tab"
                  role="tab"
                  data-mode=${mode}
                  aria-controls=${`studio-contextual-panel-${mode}`}
                  aria-selected=${this.mode === mode ? 'true' : 'false'}
                  tabindex=${this.mode === mode ? 0 : -1}
                  @click=${(): void => this.setMode(mode)}
                >
                  ${this.#modeLabel(mode)}
                </button>
              `,
            )}
          </nav>

          ${this.#renderModelPanel(draft, readOnly)}
          <section
            id="studio-contextual-panel-blueprint"
            class="contextual-panel blueprint-panel"
            role="tabpanel"
            aria-labelledby="studio-contextual-tab-blueprint"
            ?hidden=${this.mode !== 'blueprint'}
          >
            <kumwe-studio
              .authoringControlRegistry=${this.authoringControlRegistry}
              .configuration=${this.#blueprintSessionConfiguration}
              .contentModel=${draft.model}
              .designControls=${this.designControls}
              .document=${this.#blueprintDraft ?? session.state.blueprint}
              .messages=${this.messages}
              .patterns=${this.patterns}
              .previewBinding=${this.previewBinding}
              .resourceSearchService=${this.resourceSearchService}
              .theme=${this.theme}
              .viewports=${this.viewports}
              @studio-document-change=${(event: CustomEvent<StudioDocumentChangeDetail>): void => {
                this.#onBlueprintChange(event.detail);
              }}
            >
              <slot name="preview" slot="preview"></slot>
            </kumwe-studio>
          </section>
          ${this.#renderContentPanel(draft, readOnly)}
        </div>

        <footer class="contextual-status">
          <div>
            <strong class="dirty-summary" data-dirty=${this.dirty ? 'true' : 'false'}>
              ${
                this.dirty
                  ? this.#text('studio.contextual/unsaved')
                  : this.#text('studio.contextual/all-saved')
              }
            </strong>
            <p>
              ${this.#text('studio.contextual/dirty-artifacts', {
                blueprint: this.#dirtyLabel(this.dirtyState.blueprint),
                entry: this.#dirtyLabel(this.dirtyState.entry),
                model: this.#dirtyLabel(this.dirtyState.model),
              })}
            </p>
          </div>
          <p>
            ${
              this.diagnostics.length === 1
                ? this.#text('studio.contextual/diagnostic-count-one')
                : this.#text('studio.contextual/diagnostic-count', {
                    count: String(this.diagnostics.length),
                  })
            }
          </p>
          <p class="assistive" aria-live="polite">${this.#announcement}</p>
        </footer>
      </section>
    `;
  }

  #renderModelPanel(draft: DraftState, readOnly: boolean): TemplateResult {
    const modeAllowed = permittedCommandTypes('model').has('studio.command/add-model-field');
    const disabled = readOnly || !modeAllowed || draft.model.status !== 'draft';
    return html`
      <section
        id="studio-contextual-panel-model"
        class="contextual-panel model-panel"
        role="tabpanel"
        aria-labelledby="studio-contextual-tab-model"
        ?hidden=${this.mode !== 'model'}
      >
        <section class="field-builder" aria-labelledby="studio-contextual-field-builder-heading">
          <h2 id="studio-contextual-field-builder-heading">
            ${this.#text('studio.contextual/add-typed-field')}
          </h2>
          ${
            draft.model.status === 'draft'
              ? nothing
              : html`<p class="field-help">
                  ${this.#text('studio.contextual/model-status', { status: draft.model.status })}
                </p>`
          }
          <form
            class="model-field-form"
            @submit=${(event: SubmitEvent): void => this.#submitField(event)}
          >
            <label class="form-control">
              ${this.#text('studio.contextual/field-identifier')}
              <input
                name="id"
                required
                pattern="[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*"
                ?disabled=${disabled}
              />
            </label>
            <label class="form-control">
              ${this.#text('studio.contextual/field-label')}
              <input name="label" required maxlength="200" ?disabled=${disabled} />
            </label>
            <label class="form-control">
              ${this.#text('studio.contextual/field-type')}
              <select name="kind" ?disabled=${disabled}>
                ${BUILT_IN_FIELD_KINDS.map(
                  (kind) => html`<option value=${kind}>${this.#fieldKindLabel(kind)}</option>`,
                )}
              </select>
            </label>
            <label class="form-control">
              ${this.#text('studio.contextual/cardinality')}
              <select name="cardinality" ?disabled=${disabled}>
                <option value="one">${this.#text('studio.contextual/cardinality-one')}</option>
                <option value="many">${this.#text('studio.contextual/cardinality-many')}</option>
              </select>
            </label>
            <label class="checkbox-control">
              <input name="required" type="checkbox" ?disabled=${disabled} />
              ${this.#text('studio.contextual/required')}
            </label>
            <label class="checkbox-control">
              <input name="localized" type="checkbox" ?disabled=${disabled} />
              ${this.#text('studio.contextual/localized')}
            </label>
            <label class="form-control">
              ${this.#text('studio.contextual/enum-values')}
              <textarea name="enumValues" rows="3" ?disabled=${disabled}></textarea>
            </label>
            <label class="form-control">
              ${this.#text('studio.contextual/collection-item-type')}
              <select name="itemKind" ?disabled=${disabled}>
                ${BUILT_IN_FIELD_KINDS.filter((kind) => kind !== 'collection').map(
                  (kind) => html`<option value=${kind}>${this.#fieldKindLabel(kind)}</option>`,
                )}
              </select>
            </label>
            <button type="submit" class="model-field-add" ?disabled=${disabled}>
              ${this.#text('studio.contextual/add-field')}
            </button>
          </form>
        </section>
        <section class="model-fields" aria-labelledby="studio-contextual-fields-heading">
          <h2 id="studio-contextual-fields-heading">
            ${this.#text('studio.contextual/model-fields')}
          </h2>
          ${
            draft.model.fields.length === 0
              ? html`<p class="empty-state">${this.#text('studio.contextual/no-fields')}</p>`
              : html`<ul class="model-field-list">
                  ${draft.model.fields.map((field) => this.#renderModelField(field, []))}
                </ul>`
          }
        </section>
      </section>
    `;
  }

  #renderModelField(field: FieldDefinition, parentPath: readonly LocalName[]): TemplateResult {
    const path = [...parentPath, field.id];
    return html`<li data-field-path=${path.join('.')}>
      <strong>${referenceText(field.label) ?? field.id}</strong>
      <span class="field-coordinate">
        ${this.#text('studio.contextual/field-summary', {
          cardinality:
            field.cardinality === 'one'
              ? this.#text('studio.contextual/cardinality-one')
              : this.#text('studio.contextual/cardinality-many'),
          kind: field.kind.includes('/') ? field.kind : this.#fieldKindLabel(field.kind),
          path: path.join('.'),
          requirement: this.#text(
            field.required
              ? 'studio.contextual/field-required'
              : 'studio.contextual/field-optional',
          ),
        })}
      </span>
      ${
        field.fields === undefined || field.fields.length === 0
          ? nothing
          : html`<ul class="model-field-list">
              ${field.fields.map((child) => this.#renderModelField(child, path))}
            </ul>`
      }
    </li>`;
  }

  #renderContentPanel(draft: DraftState, readOnly: boolean): TemplateResult {
    const fields = visibleFields(draft.model.fields);
    return html`
      <section
        id="studio-contextual-panel-content"
        class="contextual-panel content-panel"
        role="tabpanel"
        aria-labelledby="studio-contextual-tab-content"
        ?hidden=${this.mode !== 'content'}
      >
        <section class="field-values" aria-labelledby="studio-contextual-values-heading">
          <h2 id="studio-contextual-values-heading">
            ${this.#text('studio.contextual/values-heading')}
          </h2>
          <p class="field-help">
            ${this.#text('studio.contextual/value-coordinate', {
              entry: `${draft.entry.id}#${draft.entry.revision}`,
            })}
          </p>
          ${
            fields.length === 0
              ? html`<p class="empty-state">
                  ${this.#text('studio.contextual/no-authorable-fields')}
                </p>`
              : html`<div class="entry-field-list">
                  ${fields.map(({ field, path }) =>
                    this.#renderEntryField(
                      field,
                      path,
                      entryValueAtPath(draft.entry, path),
                      readOnly || field.authoring?.readOnly === true,
                    ),
                  )}
                </div>`
          }
        </section>
        <section class="model-fields" aria-labelledby="studio-contextual-binding-heading">
          <h2 id="studio-contextual-binding-heading">
            ${this.#text('studio.contextual/binding-heading')}
          </h2>
          <p class="field-help">${this.#text('studio.contextual/binding-help')}</p>
          <ul class="model-field-list">
            ${fields.map(
              ({ field, path }) =>
                html`<li data-bindable-field-path=${path.join('.')}>
                  <strong>${referenceText(field.label) ?? field.id}</strong>
                  <span class="field-coordinate">${path.join('.')} · ${field.kind}</span>
                  <button type="button" @click=${(): void => this.setMode('blueprint')}>
                    ${this.#text('studio.contextual/bind-in-blueprint')}
                  </button>
                </li>`,
            )}
          </ul>
        </section>
      </section>
    `;
  }

  #renderEntryField(
    field: FieldDefinition,
    path: readonly LocalName[],
    current: JsonValue | undefined,
    readOnly: boolean,
  ): TemplateResult {
    const pathText = path.join('.');
    const label = referenceText(field.label) ?? field.id;
    const advanced = entryControlFor(field);
    if (advanced !== undefined) {
      const value = current ?? defaultAdvancedValue(advanced, field);
      if (value === undefined) {
        return html`<div class="entry-field-control" data-field-path=${pathText}>
          <strong>${label}</strong>
          <p class="field-help">${this.#text('studio.contextual/no-canonical-value')}</p>
        </div>`;
      }
      return html`<div class="entry-field-control" data-field-path=${pathText}>
        <strong>${label}</strong>
        <div
          class="entry-advanced-holder"
          data-entry-control-key=${pathText}
          data-entry-control=${advanced}
        ></div>
      </div>`;
    }

    if (field.kind === 'boolean') {
      return html`<label class="entry-field-control checkbox-control" data-field-path=${pathText}>
        <input
          type="checkbox"
          .checked=${current === true}
          ?disabled=${readOnly}
          @change=${(event: Event): void => {
            if (event.currentTarget instanceof HTMLInputElement) {
              this.setEntryValue(path, event.currentTarget.checked);
            }
          }}
        />
        ${label}
      </label>`;
    }
    if (field.kind === 'enum' && field.enumValues !== undefined) {
      return html`<label class="entry-field-control" data-field-path=${pathText}>
        ${label}
        <select
          ?disabled=${readOnly}
          @change=${(event: Event): void => {
            if (event.currentTarget instanceof HTMLSelectElement) {
              this.setEntryValue(path, event.currentTarget.value);
            }
          }}
        >
          <option value="" .selected=${current === undefined}>
            ${this.#text('studio.contextual/choose-value')}
          </option>
          ${field.enumValues.map(
            (choice) =>
              html`<option value=${choice.value} .selected=${current === choice.value}>
                ${referenceText(choice.label) ?? choice.value}
              </option>`,
          )}
        </select>
      </label>`;
    }
    if (field.kind === 'collection' || field.cardinality === 'many') {
      return html`<label class="entry-field-control" data-field-path=${pathText}>
        ${label}
        <textarea
          rows="4"
          ?disabled=${readOnly}
          .value=${JSON.stringify(current ?? [], null, 2)}
          @change=${(event: Event): void => this.#setJsonEntryValue(event, path, true)}
        ></textarea>
        <span class="field-help">${this.#text('studio.contextual/json-array')}</span>
      </label>`;
    }
    if (field.kind === 'object' || field.kind.includes('/')) {
      return html`<label class="entry-field-control" data-field-path=${pathText}>
        ${label}
        <textarea
          rows="4"
          ?disabled=${readOnly}
          .value=${JSON.stringify(current ?? {}, null, 2)}
          @change=${(event: Event): void => this.#setJsonEntryValue(event, path, false)}
        ></textarea>
        <span class="field-help">${this.#text('studio.contextual/json-value')}</span>
      </label>`;
    }

    const inputType =
      field.kind === 'date'
        ? 'date'
        : field.kind === 'date-time'
          ? 'datetime-local'
          : field.kind === 'integer'
            ? 'number'
            : 'text';
    return html`<label class="entry-field-control" data-field-path=${pathText}>
      ${label}
      <input
        type=${inputType}
        step=${field.kind === 'integer' ? '1' : nothing}
        .value=${primitiveInputValue(current)}
        ?disabled=${readOnly}
        @change=${(event: Event): void => {
          if (!(event.currentTarget instanceof HTMLInputElement)) return;
          const value =
            field.kind === 'integer'
              ? Number.parseInt(event.currentTarget.value, 10)
              : event.currentTarget.value;
          if (field.kind !== 'integer' || Number.isSafeInteger(value)) {
            this.setEntryValue(path, value);
          }
        }}
      />
    </label>`;
  }

  #announceCommandFailure(error: unknown): void {
    const message =
      error instanceof StudioCommandError || error instanceof Error
        ? error.message
        : 'The Studio command failed.';
    this.#announcement = this.#text('studio.shell/announce-command-failed', { message });
    this.requestUpdate();
  }

  #dirtyLabel(dirty: boolean): string {
    return this.#text(
      dirty ? 'studio.contextual/state-changed' : 'studio.contextual/state-unchanged',
    );
  }

  #fieldKindLabel(kind: ContentFieldKind): string {
    return this.#text(`studio.contextual/field-kind-${kind}` as StudioMessageKey);
  }

  #modeLabel(mode: StudioAuthoringMode): string {
    if (mode === 'model') return this.#text('studio.contextual/mode-model');
    if (mode === 'blueprint') return this.#text('studio.contextual/mode-blueprint');
    return this.#text('studio.contextual/mode-content');
  }

  #presentationLabel(presentation: AuthoringPresentationState): string {
    return this.#text(`studio.contextual/presentation-${presentation}` as StudioMessageKey);
  }

  #saveOutcomeLabel(outcome: AuthoringSaveOutcome): string {
    return this.#text(`studio.contextual/${outcome}` as StudioMessageKey);
  }

  #startLabel(session: AuthoringSessionSnapshot): string {
    if (session.start.kind === 'blank') return this.#text('studio.contextual/start-blank');
    if (session.start.kind === 'existing') return this.#text('studio.contextual/start-existing');
    return this.#text('studio.contextual/start-from-type', {
      type: `${session.start.type.id}@${session.start.type.version}#${session.start.type.revision}`,
    });
  }

  #text(key: StudioMessageKey, parameters?: Readonly<Record<string, string>>): string {
    return messageText(key, this.messages, parameters);
  }

  #createBlueprintConfiguration(
    session: AuthoringSessionSnapshot,
  ): ExperimentalShellConfiguration | undefined {
    const configured = this.configuration;
    if (configured === undefined) return undefined;
    const result = structuredClone(configured);
    result.session.artifacts.blueprint = artifactReference(session.state.blueprint);
    result.session.artifacts.model = artifactReference(this.#draft?.model ?? session.state.model);
    result.session.artifacts.entry = {
      id: (this.#draft?.entry ?? session.state.entry).id,
      revision: (this.#draft?.entry ?? session.state.entry).revision,
    };
    result.session.composite = 'single';
    result.session.mode = 'blueprint';
    result.session.resourceContext = structuredClone(session.resourceContext);
    result.session.sessionGeneration = session.sessionGeneration;
    result.session.sessionId = session.sessionId;
    return result;
  }

  #commandEnvelope(artifactId: StableId, stateVersion: number) {
    const configuration = this.configuration?.session;
    if (configuration === undefined) {
      throw new Error('Load a Studio configuration before applying contextual commands.');
    }
    this.#commandSequence += 1;
    return {
      artifactId,
      baseStateVersion: stateVersion,
      contractVersion: configuration.contractVersion,
      id: `studio-contextual-command-${this.#commandSequence}`,
      kind: 'command' as const,
      sessionGeneration: configuration.sessionGeneration,
    };
  }

  #destroyEntryControls(): void {
    for (const mounted of this.#entryControls.values()) {
      try {
        mounted.handle.destroy();
      } catch {
        // A host-injected control may already have released its resources.
      }
    }
    this.#entryControls.clear();
  }

  #emitChange(
    artifact: StudioContextualChangeDetail['artifact'],
    command: StudioContextualChangeDetail['command'],
    source: StudioContextualChangeDetail['source'],
  ): void {
    const snapshot = this.snapshot;
    if (snapshot === undefined) return;
    this.dispatchEvent(
      new CustomEvent<StudioContextualChangeDetail>('studio-contextual-change', {
        bubbles: true,
        composed: true,
        detail: {
          artifact,
          command,
          snapshot,
          source,
          stateVersions: {
            blueprint: this.blueprintElement?.stateVersion ?? 0,
            entry: this.#draft?.entryVersion ?? 0,
            model: this.#draft?.modelVersion ?? 0,
          },
        },
      }),
    );
  }

  #onBlueprintChange(detail: StudioDocumentChangeDetail): void {
    this.#blueprintDraft = detail.document;
    this.#emitChange('blueprint', detail.command, detail.source);
    this.requestUpdate();
  }

  #onModeTabKeydown(event: KeyboardEvent): void {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const session = this.session;
    if (session === undefined) return;
    const modes = session.capabilities.modes;
    const currentIndex = modes.indexOf(this.mode);
    let nextIndex: number;
    if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = modes.length - 1;
    else if (event.key === 'ArrowLeft')
      nextIndex = (currentIndex - 1 + modes.length) % modes.length;
    else nextIndex = (currentIndex + 1) % modes.length;
    const next = modes[nextIndex];
    if (next === undefined) return;
    event.preventDefault();
    this.setMode(next);
    void this.updateComplete.then(() => {
      this.shadowRoot
        ?.querySelector<HTMLButtonElement>(`.contextual-mode-tab[data-mode="${next}"]`)
        ?.focus();
    });
  }

  #rebuildDraft(): void {
    const session = this.session;
    const configuration = this.configuration?.session;
    this.#destroyEntryControls();
    this.#resourceDiagnostics =
      session === undefined
        ? []
        : [...session.state.diagnostics.map((entry) => structuredClone(entry)), ...validateSession(session)];
    if (session === undefined || configuration === undefined) {
      this.#blueprintDraft = undefined;
      this.#blueprintSessionConfiguration = undefined;
      this.#draft = undefined;
      this.#entryExecutor = undefined;
      this.#modelExecutor = undefined;
      return;
    }
    if (configuration.sessionGeneration !== session.sessionGeneration) {
      this.#resourceDiagnostics.push(
        resourceDiagnostic(
          'studio.contextual/configuration-generation-mismatch',
          'The Studio configuration and contextual session generations do not match.',
          session.sessionId,
        ),
      );
    }
    this.#resourceGeneration = session.sessionGeneration;
    this.#blueprintDraft = structuredClone(session.state.blueprint);
    this.#initialDirty = new Set(session.state.dirty);
    this.#draft = {
      entry: structuredClone(session.state.entry),
      entrySavedVersion: session.state.dirty.includes('entry') ? -1 : 0,
      entryVersion: 0,
      model: structuredClone(session.state.model),
      modelSavedVersion: session.state.dirty.includes('model') ? -1 : 0,
      modelVersion: 0,
    };
    this.#blueprintSessionConfiguration = this.#createBlueprintConfiguration(session);
    const options = {
      document: structuredClone(session.state.blueprint),
      sessionGeneration: session.sessionGeneration,
      sessionState: configuration.sessionState,
    } as const;
    this.#entryExecutor = new StudioSession({ ...options, mode: 'content' });
    this.#modelExecutor = new StudioSession({ ...options, mode: 'model' });
    const modes = session.capabilities.modes;
    this.mode = modes.includes(configuration.mode) ? configuration.mode : (modes[0] ?? 'blueprint');
    const presentations = session.capabilities.presentationStates;
    this.presentation = presentations.includes(session.presentation.current)
      ? session.presentation.current
      : (presentations[0] ?? 'inline');
  }

  #requireDraft(): DraftState {
    if (this.#draft === undefined) {
      throw new Error('Load one contextual resource before applying commands.');
    }
    if (this.configuration?.session.sessionGeneration !== this.#resourceGeneration) {
      throw new StudioCommandError(
        'stale-generation',
        'The contextual resource belongs to an obsolete Studio session generation.',
      );
    }
    return this.#draft;
  }

  #requireExecutor(session: StudioSession | undefined, label: string): StudioSession {
    if (session === undefined) {
      throw new Error(`Load one contextual resource before using ${label} mode.`);
    }
    return session;
  }

  #requireSnapshot(): AuthoringSessionSnapshot {
    const snapshot = this.snapshot;
    if (snapshot === undefined) {
      throw new Error('Load one contextual authoring session before reading its snapshot.');
    }
    return snapshot;
  }

  #setJsonEntryValue(event: Event, path: readonly LocalName[], arrayRequired: boolean): void {
    if (!(event.currentTarget instanceof HTMLTextAreaElement)) return;
    try {
      const value = JSON.parse(event.currentTarget.value) as JsonValue;
      if (arrayRequired && !Array.isArray(value)) {
        throw new TypeError('The field requires an array.');
      }
      this.setEntryValue(path, value);
    } catch (error) {
      this.#announceCommandFailure(error);
    }
  }

  #submitField(event: SubmitEvent): void {
    event.preventDefault();
    if (!(event.currentTarget instanceof HTMLFormElement)) return;
    const data = new FormData(event.currentTarget);
    const id = formString(data, 'id').trim();
    const label = formString(data, 'label').trim();
    const kind = formString(data, 'kind', 'string') as ContentFieldKind;
    if (!LOCAL_NAME.test(id) || id.length > 100 || label.length === 0) {
      this.#announceCommandFailure(new TypeError('Enter a valid field identifier and label.'));
      return;
    }
    const field: FieldDefinition = {
      cardinality: data.get('cardinality') === 'many' ? 'many' : 'one',
      id,
      kind,
      label: { defaultMessage: label, key: `studio.field/${id}` },
      localized: data.get('localized') === 'on',
      required: data.get('required') === 'on',
    };
    if (kind === 'enum') {
      const values = formString(data, 'enumValues')
        .split(/\r?\n/u)
        .map((value) => value.trim())
        .filter((value) => LOCAL_NAME.test(value));
      if (values.length === 0) {
        this.#announceCommandFailure(new TypeError('An enum field requires at least one choice.'));
        return;
      }
      field.enumValues = values.map((value) => ({
        label: { defaultMessage: value, key: `studio.field/${id}-${value}` },
        value,
      }));
    } else if (kind === 'collection') {
      field.itemKind = formString(data, 'itemKind', 'string') as Exclude<
        FieldDefinition['itemKind'],
        undefined
      >;
    } else if (kind === 'object') {
      field.fields = [];
    }
    const control = defaultFieldControl(kind, field.cardinality);
    if (control !== undefined) field.authoring = { control };
    try {
      this.addField(field);
      event.currentTarget.reset();
      this.#announcement = this.#text('studio.contextual/announce-field-added', { label });
    } catch {
      // The core rejection has already been announced.
    }
  }

  async #synchronizeEntryControls(): Promise<void> {
    const draft = this.#draft;
    if (draft === undefined || this.mode !== 'content') return;
    const registry = this.authoringControlRegistry ?? this.#defaultAuthoringControlRegistry;
    const targets = entryFieldTargets(
      draft.model,
      draft.entry,
      this.configuration?.session.sessionState === 'read-only',
    );
    const expected = new Set(targets.map((target) => target.key));
    for (const [key, mounted] of this.#entryControls) {
      if (!expected.has(key) || !mounted.holder.isConnected) {
        mounted.handle.destroy();
        this.#entryControls.delete(key);
      }
    }
    for (const target of targets) {
      const holder = this.shadowRoot?.querySelector<HTMLElement>(
        `[data-entry-control-key="${target.key}"]`,
      );
      if (holder === null || holder === undefined) continue;
      const signature = `${target.control}|${target.readOnly ? 'read-only' : 'editable'}|${this.#resourceGeneration}`;
      const mounted = this.#entryControls.get(target.key);
      if (mounted?.holder === holder && mounted.signature === signature) continue;
      mounted?.handle.destroy();
      holder.replaceChildren();
      try {
        const handle = await registry.mount(target.control, {
          holder,
          onChange: (change) => {
            if (change.valid && !target.readOnly) {
              try {
                this.setEntryValue(target.path, structuredClone(change.value) as JsonValue);
              } catch {
                // The command path has already announced its stable failure.
              }
            }
          },
          readOnly: target.readOnly,
          usage: 'studio.entry/value',
          value: structuredClone(target.value),
        });
        if (!holder.isConnected) {
          handle.destroy();
          continue;
        }
        this.#entryControls.set(target.key, { handle, holder, signature });
      } catch (error) {
        holder.textContent = this.#text('studio.contextual/control-unavailable');
        this.#announceCommandFailure(error);
      }
    }
  }
}

function artifactReference(document: BlueprintDocument | ContentModelDocument) {
  return { id: document.id, revision: document.revision, version: document.version };
}

function defaultAdvancedValue(
  control: StudioAuthoringControlId,
  field: FieldDefinition,
): JsonValue | undefined {
  if (control === STUDIO_AUTHORING_CONTROL_IDS.richText) return { content: [], type: 'doc' };
  if (control === STUDIO_AUTHORING_CONTROL_IDS.money) return { amount: '0', currency: 'USD' };
  if (control === STUDIO_AUTHORING_CONTROL_IDS.mediaCollection || field.cardinality === 'many') {
    return [];
  }
  return undefined;
}

function defaultFieldControl(
  kind: ContentFieldKind,
  cardinality: FieldDefinition['cardinality'],
): QualifiedName | undefined {
  if (kind === 'rich-text') return STUDIO_AUTHORING_CONTROL_IDS.richText;
  if (kind === 'money') return STUDIO_AUTHORING_CONTROL_IDS.money;
  if (kind === 'media') {
    return cardinality === 'many'
      ? STUDIO_AUTHORING_CONTROL_IDS.mediaCollection
      : STUDIO_AUTHORING_CONTROL_IDS.mediaReference;
  }
  return undefined;
}

function entryControlFor(field: FieldDefinition): StudioAuthoringControlId | undefined {
  const declared = field.authoring?.control;
  if (declared !== undefined && ADVANCED_CONTROLS.has(declared)) {
    return declared as StudioAuthoringControlId;
  }
  return defaultFieldControl(field.kind, field.cardinality) as StudioAuthoringControlId | undefined;
}

function entryFieldTargets(
  model: ContentModelDocument,
  entry: EntryDocument,
  readOnly: boolean,
): EntryFieldTarget[] {
  return visibleFields(model.fields).flatMap(({ field, path }) => {
    const control = entryControlFor(field);
    if (control === undefined) return [];
    const value = entryValueAtPath(entry, path) ?? defaultAdvancedValue(control, field);
    if (value === undefined) return [];
    return [
      {
        control,
        field,
        key: path.join('.'),
        path,
        readOnly: readOnly || field.authoring?.readOnly === true,
        value,
      },
    ];
  });
}

function entryValueAtPath(entry: EntryDocument, path: readonly LocalName[]): JsonValue | undefined {
  let current: JsonValue = entry.values;
  for (const member of path) {
    if (current === null || typeof current !== 'object' || Array.isArray(current)) return undefined;
    if (!Object.hasOwn(current, member)) return undefined;
    current = current[member] as JsonValue;
  }
  return current;
}

function formString(data: FormData, name: string, fallback = ''): string {
  const value = data.get(name);
  return typeof value === 'string' ? value : fallback;
}

function primitiveInputValue(value: JsonValue | undefined): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

function referenceText(reference: MessageReference | undefined): string | undefined {
  return reference?.defaultMessage ?? reference?.key;
}

function saveDraft(
  outcome: AuthoringSaveOutcome,
  snapshot: AuthoringSessionSnapshot,
): AuthoringSaveDraft {
  if (outcome === 'save-item') {
    return {
      entry: structuredClone(snapshot.state.entry),
      ...(snapshot.type?.authoringPolicy.itemComposition === 'overrides'
        ? { itemBlueprint: structuredClone(snapshot.state.blueprint) }
        : {}),
      outcome,
    };
  }
  if (outcome === 'save-new-type-version') {
    return {
      blueprint: structuredClone(snapshot.state.blueprint),
      model: structuredClone(snapshot.state.model),
      outcome,
    };
  }
  return {
    authoringPolicy: structuredClone(
      snapshot.type?.authoringPolicy ?? {
        itemComposition: 'denied' as const,
        modes: snapshot.capabilities.modes,
      },
    ),
    blueprint: structuredClone(snapshot.state.blueprint),
    label: structuredClone(snapshot.type?.label ?? snapshot.state.model.label),
    model: structuredClone(snapshot.state.model),
    outcome,
  };
}

function validateSession(session: AuthoringSessionSnapshot): StudioDiagnostic[] {
  const diagnostics: StudioDiagnostic[] = [];
  const model = artifactReference(session.state.model);
  const blueprint = artifactReference(session.state.blueprint);
  const coordinates = session.state.coordinates;
  if (!sameReference(coordinates.model, model)) {
    diagnostics.push(
      resourceDiagnostic(
        'studio.contextual/model-coordinate-mismatch',
        'The session coordinates do not identify the supplied exact Model revision.',
        session.state.model.id,
      ),
    );
  }
  if (!sameReference(coordinates.blueprint, blueprint)) {
    diagnostics.push(
      resourceDiagnostic(
        'studio.contextual/blueprint-coordinate-mismatch',
        'The session coordinates do not identify the supplied exact Blueprint revision.',
        session.state.blueprint.id,
      ),
    );
  }
  if (
    coordinates.entry.id !== session.state.entry.id ||
    coordinates.entry.revision !== session.state.entry.revision
  ) {
    diagnostics.push(
      resourceDiagnostic(
        'studio.contextual/entry-coordinate-mismatch',
        'The session coordinates do not identify the supplied exact Entry revision.',
        session.state.entry.id,
      ),
    );
  }
  if (!sameReference(session.state.blueprint.model, model)) {
    diagnostics.push(
      resourceDiagnostic(
        'studio.contextual/blueprint-model-mismatch',
        'The Blueprint does not lock the supplied exact Model revision.',
        session.state.blueprint.id,
      ),
    );
  }
  if (!sameReference(session.state.entry.model, model)) {
    diagnostics.push(
      resourceDiagnostic(
        'studio.contextual/entry-model-mismatch',
        'The Entry does not lock the supplied exact Model revision.',
        session.state.entry.id,
      ),
    );
  }
  if (
    session.start.kind === 'existing' &&
    session.resourceContext.resource?.id !== session.state.entry.id
  ) {
    diagnostics.push(
      resourceDiagnostic(
        'studio.contextual/entry-resource-mismatch',
        'The existing-item target does not identify the supplied Entry.',
        session.state.entry.id,
      ),
    );
  }
  if (session.type !== undefined) {
    if (!sameReference(session.type.model, model)) {
      diagnostics.push(
        resourceDiagnostic(
          'studio.contextual/type-model-mismatch',
          'The reusable type does not identify the supplied exact Model revision.',
          session.state.model.id,
        ),
      );
    }
    if (!sameReference(session.type.blueprint, blueprint)) {
      diagnostics.push(
        resourceDiagnostic(
          'studio.contextual/type-blueprint-mismatch',
          'The reusable type does not identify the supplied exact Blueprint revision.',
          session.state.blueprint.id,
        ),
      );
    }
    if (
      coordinates.type === undefined ||
      !sameReference(coordinates.type, session.type)
    ) {
      diagnostics.push(
        resourceDiagnostic(
          'studio.contextual/type-coordinate-mismatch',
          'The session coordinates do not identify the supplied exact reusable type version.',
          session.type.id,
        ),
      );
    }
  }
  if (!session.capabilities.presentationStates.includes(session.presentation.current)) {
    diagnostics.push(
      resourceDiagnostic(
        'studio.contextual/presentation-not-authorized',
        'The current presentation is not authorized by this contextual session.',
        session.sessionId,
      ),
    );
  }
  if (session.sessionGeneration.length === 0) {
    diagnostics.push(
      resourceDiagnostic(
        'studio.contextual/session-generation-missing',
        'The contextual session has no authoritative generation.',
        session.sessionId,
      ),
    );
  }
  return diagnostics;
}

function resourceDiagnostic(
  code: QualifiedName,
  message: string,
  artifactId: StableId,
): StudioDiagnostic {
  return {
    code,
    location: { artifactId },
    message: { defaultMessage: message, key: code },
    severity: 'blocking',
  };
}

function sameReference(
  left: { id: StableId; revision: Revision; version: string },
  right: { id: StableId; revision: Revision; version: string },
): boolean {
  return left.id === right.id && left.revision === right.revision && left.version === right.version;
}

function visibleFields(
  fields: readonly FieldDefinition[],
  parentPath: readonly LocalName[] = [],
): { field: FieldDefinition; path: LocalName[] }[] {
  const result: { field: FieldDefinition; path: LocalName[] }[] = [];
  for (const field of [...fields].sort(compareFields)) {
    if (field.authoring?.hidden === true) continue;
    const path = [...parentPath, field.id];
    if (field.kind === 'object' && field.fields !== undefined && field.fields.length > 0) {
      result.push(...visibleFields(field.fields, path));
    } else {
      result.push({ field, path });
    }
  }
  return result;
}

function compareFields(left: FieldDefinition, right: FieldDefinition): number {
  const order =
    (left.authoring?.order ?? Number.MAX_SAFE_INTEGER) -
    (right.authoring?.order ?? Number.MAX_SAFE_INTEGER);
  return order === 0 ? left.id.localeCompare(right.id) : order;
}

declare global {
  interface HTMLElementTagNameMap {
    'kumwe-studio-contextual': KumweStudioContextualElement;
  }
}
