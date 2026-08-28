import { css, html, LitElement, type CSSResult, type TemplateResult } from 'lit';
import {
  BlockRegistry,
  CORE_PRODUCTION_BLOCK_TYPES,
  assertBlueprintWithinSessionPolicy,
  assertEntryWithinSessionPolicy,
  assertModelWithinSessionPolicy,
  canonicalStringify,
  coreProductionInitialProperties,
  createCoreProductionBlockDefinitions,
  createCoreProductionPatterns,
  isAuthoringSaveIntent,
  isAuthoringSessionSnapshot,
  isCoreProductionBlockType,
  parseJsonRejectingDuplicateMembers,
  validateBlueprint,
} from '@kumwe/studio-core';
import {
  STUDIO_CONTRACT_VERSION,
  STUDIO_WIRE_PROTOCOL_VERSION,
  type AuthoringSaveIntent,
  type AuthoringSaveOutcome,
  type AuthoringSessionSnapshot,
  type BlockDefinition,
  type BlueprintNode,
  type ExperimentalShellConfiguration,
  type JsonValue,
  type PatternDocument,
  type StudioLimits,
} from '@kumwe/studio-protocol';
import {
  createStudioAuthoringSaveIntent,
  KumweStudioContextualElement,
  type StudioContextualChangeDetail,
  type StudioContextualSaveRequestDetail,
} from './contextual-authoring.js';
import { KumweStudioElement, type StudioInsertRequestDetail } from './kumwe-studio.js';
import { messageText, type StudioMessageKey, type StudioMessageOverrides } from './messages.js';

const LOCAL_OWNER = { id: 'studio.local/browser', version: '1.0.0' } as const;
const LOCAL_MODEL_ID = 'studio.local/models/page';
const LOCAL_BLUEPRINT_ID = 'studio.local/blueprints/page';
const LOCAL_ENTRY_ID = 'studio.local/entries/page';
const LOCAL_SESSION_ID = 'studio.local/sessions/page';
const LOCAL_SESSION_GENERATION = 'local-session-r1';
const LOCAL_CONTRIBUTION_GENERATION = 'local-catalog-r1';
const LOCAL_THEME = {
  id: 'studio.local/themes/default',
  revision: 'local-theme-r1',
  version: '1.0.0',
} as const;
const MAXIMUM_PROJECT_BYTES = 16 * 1_024 * 1_024;
const MAXIMUM_PROJECT_DEPTH = 64;
const STANDALONE_LOCALE_PATTERN = /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/u;
const RIGHT_TO_LEFT_LANGUAGES = new Set([
  'ar',
  'ckb',
  'dv',
  'fa',
  'he',
  'ks',
  'ps',
  'sd',
  'ug',
  'ur',
  'yi',
]);
const LOCAL_STUDIO_LIMITS: Readonly<StudioLimits> = Object.freeze({
  maxChildrenPerSlot: 1_000,
  maxCommandBatch: 100,
  maxContributionsPerPlugin: 0,
  maxDepth: 32,
  maxExtensionBytes: 0,
  maxHistoryEntries: 100,
  maxLocaleBytes: 1_048_576,
  maxMediaBatch: 1,
  maxMediaUploadBytes: 1,
  maxNodes: 5_000,
  maxPluginCount: 0,
  maxPreviewBytes: 1,
  maxPreviewRequestsPerMinute: 1,
  maxPropertyBytes: 1_048_576,
  maxRichTextBytes: 1_048_576,
  maxRichTextDepth: 32,
  maxSlotsPerNode: 20,
});

export interface StudioStandaloneDownload {
  filename: string;
  json: string;
  mediaType: 'application/json';
}

export type StudioStandaloneDownloadHandler = (download: StudioStandaloneDownload) => void;

export interface StudioStandaloneRuntimeOptions {
  /** Optional canonical project snapshot to open instead of the blank project. */
  initialProject?: AuthoringSessionSnapshot;
  /** Injectable download boundary for tests or an embedding browser shell. */
  download?: StudioStandaloneDownloadHandler;
  /** Optional localized shell text. */
  messages?: StudioMessageOverrides;
  /** Requested bounded BCP 47-style locale. Defaults to `en`. */
  locale?: string;
}

export interface StudioStandaloneRuntimeHandle {
  readonly element: KumweStudioStandaloneElement;
  dispose(): void;
}

/**
 * Build one deterministic, fully detached local project. It grants no server
 * authority and contains no endpoint, credential, token, or persistence port.
 */
export function createStudioStandaloneProject(): AuthoringSessionSnapshot {
  const definitions = createCoreProductionBlockDefinitions();
  const modelReference = {
    id: LOCAL_MODEL_ID,
    revision: 'local-model-r1',
    version: '1.0.0',
  } as const;
  const blueprintReference = {
    id: LOCAL_BLUEPRINT_ID,
    revision: 'local-blueprint-r1',
    version: '1.0.0',
  } as const;
  const entryReference = { id: LOCAL_ENTRY_ID, revision: 'local-entry-r1' } as const;
  return {
    capabilities: {
      modes: ['model', 'blueprint', 'content'],
      presentationStates: ['inline', 'minimized', 'maximized', 'fullscreen'],
      saveOutcomes: ['save-as-new-type'],
    },
    contractVersion: STUDIO_CONTRACT_VERSION,
    contributionGeneration: LOCAL_CONTRIBUTION_GENERATION,
    kind: 'authoring-session',
    presentation: { current: 'inline' },
    resourceContext: {
      key: 'studio.local/context/page',
      resource: { id: LOCAL_ENTRY_ID, type: 'studio.local/page' },
      scopes: [],
      surface: 'studio.local/workspace',
    },
    sessionGeneration: LOCAL_SESSION_GENERATION,
    sessionId: LOCAL_SESSION_ID,
    start: { kind: 'blank' },
    state: {
      blueprint: {
        contractVersion: STUDIO_CONTRACT_VERSION,
        dependencyLock: {
          blocks: definitions.map((definition) => ({
            revision: definition.revision,
            type: definition.type,
            version: definition.version,
          })),
          theme: LOCAL_THEME,
        },
        id: blueprintReference.id,
        kind: 'blueprint',
        label: { defaultMessage: 'Untitled page', key: 'studio.local/page-blueprint' },
        model: modelReference,
        owner: LOCAL_OWNER,
        revision: blueprintReference.revision,
        roots: [],
        status: 'draft',
        version: blueprintReference.version,
      },
      coordinates: {
        blueprint: blueprintReference,
        entry: entryReference,
        model: modelReference,
      },
      diagnostics: [],
      dirty: [],
      entry: {
        contractVersion: STUDIO_CONTRACT_VERSION,
        id: entryReference.id,
        kind: 'entry',
        model: modelReference,
        revision: entryReference.revision,
        status: 'draft',
        values: {},
      },
      model: {
        contractVersion: STUDIO_CONTRACT_VERSION,
        fields: [],
        id: modelReference.id,
        kind: 'content-model',
        label: { defaultMessage: 'Page content', key: 'studio.local/page-model' },
        owner: LOCAL_OWNER,
        relationships: [],
        revision: modelReference.revision,
        status: 'draft',
        version: modelReference.version,
      },
    },
    target: {
      contractVersion: STUDIO_CONTRACT_VERSION,
      contributionDependencies: [],
      eligibility: ['create', 'edit'],
      id: 'studio.local/page-builder',
      kind: 'authoring-target',
      label: { defaultMessage: 'Local page', key: 'studio.local/page-builder' },
      modes: ['model', 'blueprint', 'content'],
      owner: LOCAL_OWNER,
      presentationStates: ['inline', 'minimized', 'maximized', 'fullscreen'],
      requiredCapabilities: [],
      resourceTypes: ['studio.local/page'],
      saveOutcomes: ['save-as-new-type'],
      startKinds: ['blank', 'from-type', 'existing'],
      surface: 'studio.local/workspace',
    },
  };
}

/** Serialize a lossless, reopenable project snapshot in canonical JSON order. */
export function serializeStudioStandaloneProject(project: AuthoringSessionSnapshot): string {
  const validated = parseStudioStandaloneProject(project);
  return canonicalStringify(validated as unknown as JsonValue, {
    maximumDepth: MAXIMUM_PROJECT_DEPTH,
  });
}

/**
 * Parse an untrusted project file. Local mode accepts only the canonical
 * contextual snapshot and the exact built-in catalog it can execute.
 */
export function parseStudioStandaloneProject(input: unknown): AuthoringSessionSnapshot {
  const value = normalizeProjectInput(input);
  if (!isAuthoringSessionSnapshot(value)) {
    throw new TypeError('The selected file is not a canonical Studio project snapshot.');
  }
  assertStandaloneSessionPolicy(value);
  assertStandaloneRelationships(value);
  assertStandaloneCatalog(value);
  return structuredClone(value);
}

/** Serialize one outcome-specific host save intent without performing a save. */
export function serializeStudioStandaloneSaveIntent(intent: AuthoringSaveIntent): string {
  if (!isAuthoringSaveIntent(intent)) {
    throw new TypeError('The value is not a canonical Studio host save intent.');
  }
  return canonicalStringify(intent as unknown as JsonValue, {
    maximumDepth: MAXIMUM_PROJECT_DEPTH,
  });
}

/**
 * Local-only wrapper around the same contextual Model/Blueprint/Entry shell
 * used by host mode. Its state lives solely in this element until exported.
 */
export class KumweStudioStandaloneElement extends LitElement {
  public static override properties = {
    downloadHandler: { attribute: false },
    messages: { attribute: false },
    announcement: { attribute: false, state: true },
    saveOutcome: { attribute: false, state: true },
  };

  public static override styles: CSSResult = css`
    :host {
      color: #18202a;
      display: block;
      font:
        400 0.9375rem/1.45 system-ui,
        sans-serif;
      min-inline-size: 0;
    }

    .standalone-runtime {
      display: grid;
      gap: 0.75rem;
    }

    .standalone-boundary {
      background: #fff9e9;
      border: 1px solid #d7b65b;
      border-radius: 0.5rem;
      display: grid;
      gap: 0.625rem;
      padding: 0.75rem 1rem;
    }

    .standalone-boundary h1,
    .standalone-boundary p {
      margin: 0;
    }

    .standalone-boundary h1 {
      font-size: 1rem;
    }

    .standalone-actions {
      align-items: end;
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
    }

    .standalone-control {
      display: grid;
      gap: 0.25rem;
    }

    button,
    input,
    select {
      font: inherit;
    }

    button,
    input[type='file'],
    select {
      background: white;
      border: 1px solid #7b6a3c;
      border-radius: 0.375rem;
      color: inherit;
      min-block-size: 2.5rem;
      padding: 0.45rem 0.625rem;
    }

    button {
      cursor: pointer;
    }

    :is(button, input, select):focus-visible {
      outline: 0.1875rem solid #3157d5;
      outline-offset: 0.125rem;
    }

    .standalone-status {
      min-block-size: 1.25rem;
    }

    @media (max-width: 40rem) {
      .standalone-actions,
      .standalone-control {
        align-items: stretch;
        inline-size: 100%;
      }

      button,
      input[type='file'],
      select {
        inline-size: 100%;
      }
    }
  `;

  declare public downloadHandler: StudioStandaloneDownloadHandler;
  declare public messages: StudioMessageOverrides | undefined;
  declare protected announcement: string;
  declare protected saveOutcome: AuthoringSaveOutcome;

  #configuration: ExperimentalShellConfiguration;
  #definitions: BlockDefinition[];
  #locale: string;
  #patterns: PatternDocument[];
  #project: AuthoringSessionSnapshot;
  #sequence = 0;

  public constructor() {
    super();
    this.#definitions = createCoreProductionBlockDefinitions();
    this.#locale = 'en';
    this.#patterns = createCoreProductionPatterns();
    this.#project = createStudioStandaloneProject();
    this.#configuration = standaloneConfiguration(this.#project, this.#definitions, this.#locale);
    this.announcement = '';
    this.downloadHandler = defaultDownload;
    this.saveOutcome = 'save-as-new-type';
  }

  public get contextualElement(): KumweStudioContextualElement | undefined {
    return (
      this.shadowRoot?.querySelector<KumweStudioContextualElement>('kumwe-studio-contextual') ??
      undefined
    );
  }

  /** Detached exact current project; mutations cannot reach the live session. */
  public get project(): AuthoringSessionSnapshot {
    return structuredClone(this.contextualElement?.snapshot ?? this.#project);
  }

  /** Apply the local UI locale without introducing a hosted session or authority input. */
  public setLocale(locale: string): void {
    assertStandaloneLocale(locale);
    this.#locale = locale;
    this.#configuration = standaloneConfiguration(this.#project, this.#definitions, locale);
    this.lang = locale;
    this.dir = standaloneDirection(locale);
    this.requestUpdate();
  }

  /** Replace the current in-memory project after complete canonical validation. */
  public importProjectJson(input: unknown): void {
    const project = parseStudioStandaloneProject(input);
    this.#project = project;
    this.#configuration = standaloneConfiguration(project, this.#definitions, this.#locale);
    if (!project.capabilities.saveOutcomes.includes(this.saveOutcome)) {
      this.saveOutcome = project.capabilities.saveOutcomes[0] ?? 'save-as-new-type';
    }
    this.announcement = this.#text('studio.standalone/imported');
    this.requestUpdate();
  }

  /** Lossless full workspace: Model, Blueprint, Entry, presentation and state. */
  public exportProjectJson(): string {
    return serializeStudioStandaloneProject(this.project);
  }

  /** Exact host-facing dataset for one explicit save outcome; never persistence. */
  public exportSaveIntentJson(outcome: AuthoringSaveOutcome = this.saveOutcome): string {
    const snapshot = this.project;
    if (!snapshot.capabilities.saveOutcomes.includes(outcome)) {
      throw new RangeError(`Save-intent outcome ${outcome} is unavailable in this project.`);
    }
    return serializeStudioStandaloneSaveIntent(createStudioAuthoringSaveIntent(outcome, snapshot));
  }

  public downloadProject(): void {
    this.downloadHandler({
      filename: 'kumwe-studio-project.json',
      json: this.exportProjectJson(),
      mediaType: 'application/json',
    });
    this.announcement = this.#text('studio.standalone/project-downloaded');
  }

  public downloadSaveIntent(outcome: AuthoringSaveOutcome = this.saveOutcome): void {
    this.downloadHandler({
      filename: `kumwe-studio-${outcome}-intent.json`,
      json: this.exportSaveIntentJson(outcome),
      mediaType: 'application/json',
    });
    this.announcement = this.#text('studio.standalone/save-intent-downloaded', {
      outcome: this.#saveOutcomeLabel(outcome),
    });
  }

  protected override render(): TemplateResult {
    const outcomes = this.#project.capabilities.saveOutcomes;
    return html`
      <section class="standalone-runtime">
        <header class="standalone-boundary" aria-labelledby="studio-standalone-heading">
          <h1 id="studio-standalone-heading">${this.#text('studio.standalone/heading')}</h1>
          <p>${this.#text('studio.standalone/no-persistence')}</p>
          <div
            class="standalone-actions"
            role="group"
            aria-label=${this.#text('studio.standalone/json-actions')}
          >
            <label class="standalone-control">
              <span>${this.#text('studio.standalone/import-project')}</span>
              <input
                type="file"
                accept=".json,application/json"
                @change=${(event: Event): void => {
                  void this.#onProjectFile(event);
                }}
              />
            </label>
            <button type="button" @click=${(): void => this.downloadProject()}>
              ${this.#text('studio.standalone/download-project')}
            </button>
            <label class="standalone-control">
              <span>${this.#text('studio.standalone/save-intent-outcome')}</span>
              <select
                .value=${this.saveOutcome}
                @change=${(event: Event): void => {
                  if (event.currentTarget instanceof HTMLSelectElement) {
                    this.saveOutcome = event.currentTarget.value as AuthoringSaveOutcome;
                  }
                }}
              >
                ${outcomes.map(
                  (outcome) => html`
                    <option value=${outcome}>${this.#saveOutcomeLabel(outcome)}</option>
                  `,
                )}
              </select>
            </label>
            <button type="button" @click=${(): void => this.downloadSaveIntent()}>
              ${this.#text('studio.standalone/download-save-intent')}
            </button>
          </div>
          <p class="standalone-status" role="status" aria-live="polite">${this.announcement}</p>
        </header>
        <kumwe-studio-contextual
          .configuration=${this.#configuration}
          .messages=${this.#contextualMessages()}
          .patterns=${this.#patterns}
          .session=${this.#project}
          @studio-contextual-change=${(event: CustomEvent<StudioContextualChangeDetail>): void =>
            this.#onContextualChange(event.detail)}
          @studio-contextual-save-request=${(
            event: CustomEvent<StudioContextualSaveRequestDetail>,
          ): void => this.#onSaveRequest(event)}
          @studio-insert-request=${(event: CustomEvent<StudioInsertRequestDetail>): void =>
            this.#onInsertRequest(event.detail)}
        ></kumwe-studio-contextual>
      </section>
    `;
  }

  async #onProjectFile(event: Event): Promise<void> {
    if (!(event.currentTarget instanceof HTMLInputElement)) return;
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = '';
    if (file === undefined) return;
    try {
      if (file.size > MAXIMUM_PROJECT_BYTES) {
        throw new RangeError('The selected project exceeds the 16 MiB local import limit.');
      }
      this.importProjectJson(await file.text());
    } catch (error) {
      this.announcement = this.#text('studio.standalone/import-failed', {
        message: error instanceof Error ? error.message : 'Unknown project error.',
      });
    }
  }

  #onContextualChange(detail: StudioContextualChangeDetail): void {
    this.announcement = this.#text('studio.standalone/change-local', {
      artifact: detail.artifact,
    });
  }

  #onSaveRequest(event: CustomEvent<StudioContextualSaveRequestDetail>): void {
    // This wrapper is the complete local boundary. It deliberately prevents a
    // save-intent event from escaping as if a HostAdapter were attached.
    event.stopPropagation();
    this.downloadHandler({
      filename: `kumwe-studio-${event.detail.intent.draft.outcome}-intent.json`,
      json: serializeStudioStandaloneSaveIntent(event.detail.intent),
      mediaType: 'application/json',
    });
    this.announcement = this.#text('studio.standalone/save-intent-downloaded', {
      outcome: this.#saveOutcomeLabel(event.detail.intent.draft.outcome),
    });
  }

  #onInsertRequest(detail: StudioInsertRequestDetail): void {
    const studio = this.contextualElement?.blueprintElement;
    const document = studio?.document;
    if (studio === undefined || document === undefined) return;
    const definition = this.#definitions.find(
      (candidate) =>
        candidate.type === detail.definition.type &&
        candidate.version === detail.definition.version &&
        candidate.revision === detail.definition.revision,
    );
    if (definition === undefined || !isCoreProductionBlockType(definition.type)) {
      throw new TypeError('Local Studio can insert only its built-in block catalog.');
    }
    const id = this.#nextNodeId(document.roots);
    const node: BlueprintNode = {
      authoring: { mode: definition.slots.length === 0 ? 'content' : 'structural' },
      bindings: {},
      id,
      properties: coreProductionInitialProperties(definition.type),
      slots: Object.fromEntries(definition.slots.map((slot) => [slot.id, []])),
      type: definition.type,
      version: definition.version,
    };
    if (
      definition.type === CORE_PRODUCTION_BLOCK_TYPES.grid ||
      definition.type === CORE_PRODUCTION_BLOCK_TYPES.columns
    ) {
      node.responsive = { columns: { expanded: 4, medium: 2 } };
    }
    const parent = detail.parentId === null ? undefined : findNode(document.roots, detail.parentId);
    const destination =
      parent === undefined || detail.slot === undefined
        ? { position: document.roots.length }
        : {
            parentNodeId: parent.id,
            position: parent.slots[detail.slot]?.length ?? 0,
            slot: detail.slot,
          };
    this.#sequence += 1;
    studio.execute({
      artifactId: document.id,
      baseStateVersion: studio.stateVersion,
      contractVersion: document.contractVersion,
      id: `studio-local-insert-${this.#sequence}`,
      kind: 'command',
      payload: { destination, node },
      sessionGeneration: this.#configuration.session.sessionGeneration,
      type: 'studio.command/insert-node',
    });
  }

  #nextNodeId(roots: readonly BlueprintNode[]): string {
    const identifiers = collectNodeIds(roots);
    do {
      this.#sequence += 1;
    } while (identifiers.has(`studio-local-node-${this.#sequence}`));
    return `studio-local-node-${this.#sequence}`;
  }

  #saveOutcomeLabel(outcome: AuthoringSaveOutcome): string {
    const keys: Record<AuthoringSaveOutcome, StudioMessageKey> = {
      'save-as-new-type': 'studio.contextual/save-as-new-type',
      'save-item': 'studio.contextual/save-item',
      'save-new-type-version': 'studio.contextual/save-new-type-version',
    };
    return this.#text(keys[outcome]);
  }

  #contextualMessages(): StudioMessageOverrides {
    return {
      'studio.contextual/all-saved': {
        defaultMessage: this.#text('studio.standalone/no-in-memory-edits'),
      },
      'studio.contextual/announce-save-requested': {
        defaultMessage: this.#text('studio.standalone/save-button-announcement'),
      },
      'studio.contextual/save-plan-help': {
        defaultMessage: this.#text('studio.standalone/save-button-help'),
      },
      'studio.shell/save-state-saved': {
        defaultMessage: this.#text('studio.standalone/current-in-memory-draft'),
      },
      ...this.messages,
    };
  }

  #text(key: StudioMessageKey, parameters?: Readonly<Record<string, string>>): string {
    return messageText(key, this.messages, parameters);
  }
}

/** Register the local wrapper and the two contextual elements it composes. */
export function defineKumweStudioStandalone(tagName = 'kumwe-studio-standalone'): void {
  if (customElements.get('kumwe-studio') === undefined) {
    customElements.define('kumwe-studio', KumweStudioElement);
  }
  if (customElements.get('kumwe-studio-contextual') === undefined) {
    customElements.define('kumwe-studio-contextual', KumweStudioContextualElement);
  }
  if (customElements.get(tagName) === undefined) {
    customElements.define(tagName, KumweStudioStandaloneElement);
  }
}

/** Create one isolated local runtime without mounting it. */
export function createStudioStandaloneRuntime(
  options: StudioStandaloneRuntimeOptions = {},
): KumweStudioStandaloneElement {
  defineKumweStudioStandalone();
  const element = document.createElement('kumwe-studio-standalone');
  if (!(element instanceof KumweStudioStandaloneElement)) {
    throw new TypeError('The registered standalone Studio element has an incompatible class.');
  }
  element.setLocale(options.locale ?? 'en');
  if (options.download !== undefined) element.downloadHandler = options.download;
  if (options.messages !== undefined) element.messages = options.messages;
  if (options.initialProject !== undefined) element.importProjectJson(options.initialProject);
  return element;
}

/** Mount one isolated local runtime into an ordinary host element. */
export function mountStudioStandalone(
  target: HTMLElement,
  options: StudioStandaloneRuntimeOptions = {},
): StudioStandaloneRuntimeHandle {
  const element = createStudioStandaloneRuntime(options);
  target.replaceChildren(element);
  let disposed = false;
  return {
    element,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      element.remove();
    },
  };
}

function standaloneConfiguration(
  project: AuthoringSessionSnapshot,
  definitions: readonly BlockDefinition[],
  locale: string,
): ExperimentalShellConfiguration {
  return {
    blockDefinitions: definitions.map((definition) => structuredClone(definition)),
    session: {
      actor: { displayName: 'Local author', id: 'studio.local/browser-author' },
      artifacts: structuredClone(project.state.coordinates),
      blocks: definitions.map((definition) => ({
        revision: definition.revision,
        type: definition.type,
        version: definition.version,
      })),
      composite: 'single',
      contractVersion: STUDIO_CONTRACT_VERSION,
      displayPreferences: {
        calendar: 'gregory',
        hourCycle: 'h23',
        measurementSystem: 'metric',
        numberingSystem: 'latn',
      },
      features: {
        clipboardMediaUpload: false,
        collaboration: false,
        customInspectors: false,
        executablePlugins: false,
        externalMediaImport: false,
        offlineRecovery: false,
      },
      hostCapabilities: {
        capabilities: [],
        contractVersion: STUDIO_CONTRACT_VERSION,
        host: {
          generation: project.sessionGeneration,
          id: 'studio.local/browser-runtime',
          version: '1.0.0',
        },
        kind: 'host-capabilities',
        ports: [],
        protocolVersions: [STUDIO_WIRE_PROTOCOL_VERSION],
      },
      limits: structuredClone(LOCAL_STUDIO_LIMITS),
      locale: {
        direction: standaloneDirection(locale),
        fallbacks: locale.toLowerCase() === 'en' ? [] : ['en'],
        requested: locale,
        resolved: locale,
        timeZone: 'UTC',
      },
      mode: 'blueprint',
      permissions: [],
      plugins: [],
      preview: {
        allowApproximateRenderer: false,
        enabled: false,
        sameOriginRequired: true,
      },
      protocolVersion: STUDIO_WIRE_PROTOCOL_VERSION,
      resourceContext: structuredClone(project.resourceContext),
      sessionGeneration: project.sessionGeneration,
      sessionId: project.sessionId,
      sessionState: 'editable',
    },
  };
}

function assertStandaloneLocale(locale: string): void {
  if (locale.length > 50 || !STANDALONE_LOCALE_PATTERN.test(locale)) {
    throw new TypeError('Standalone Studio locale must be a bounded BCP 47-style language tag.');
  }
}

function standaloneDirection(locale: string): 'ltr' | 'rtl' {
  return RIGHT_TO_LEFT_LANGUAGES.has(locale.split('-', 1)[0]?.toLowerCase() ?? '') ? 'rtl' : 'ltr';
}

function normalizeProjectInput(input: unknown): unknown {
  let value: unknown;
  if (typeof input === 'string') {
    assertProjectSize(input);
    try {
      value = parseJsonRejectingDuplicateMembers(input, MAXIMUM_PROJECT_DEPTH);
    } catch (error) {
      const detail = error instanceof Error ? ` ${error.message}` : '';
      throw new SyntaxError(`The selected project file is not valid JSON.${detail}`, {
        cause: error,
      });
    }
  } else {
    value = input;
  }
  let canonical: string;
  try {
    canonical = canonicalStringify(value as JsonValue, {
      maximumDepth: MAXIMUM_PROJECT_DEPTH,
    });
  } catch {
    throw new TypeError('The selected project contains a non-canonical or unsafe JSON value.');
  }
  assertProjectSize(canonical);
  return JSON.parse(canonical) as unknown;
}

function assertProjectSize(value: string): void {
  if (new TextEncoder().encode(value).byteLength > MAXIMUM_PROJECT_BYTES) {
    throw new RangeError('The selected project exceeds the 16 MiB local import limit.');
  }
}

function assertStandaloneSessionPolicy(project: AuthoringSessionSnapshot): void {
  assertBlueprintWithinSessionPolicy(project.state.blueprint, LOCAL_STUDIO_LIMITS);
  assertEntryWithinSessionPolicy(project.state.entry, LOCAL_STUDIO_LIMITS);
  assertModelWithinSessionPolicy(project.state.model, LOCAL_STUDIO_LIMITS);
}

function assertStandaloneCatalog(project: AuthoringSessionSnapshot): void {
  const definitions = createCoreProductionBlockDefinitions();
  const registry = new BlockRegistry(definitions);
  const result = validateBlueprint(project.state.blueprint, registry, {
    maximumDepth: 32,
    maximumNodes: 5_000,
  });
  if (!result.valid) {
    const first = result.diagnostics.find(
      (diagnostic) => diagnostic.severity === 'error' || diagnostic.severity === 'blocking',
    );
    throw new TypeError(
      first?.message.defaultMessage ?? 'The project Blueprint is invalid for the built-in catalog.',
    );
  }
  const available = new Map(
    definitions.map((definition) => [
      `${definition.type}@${definition.version}`,
      definition.revision,
    ]),
  );
  const locks = project.state.blueprint.dependencyLock.blocks;
  if (locks.length !== available.size) {
    throw new TypeError('A local project must lock the complete built-in block catalog.');
  }
  for (const lock of locks) {
    if (available.get(`${lock.type}@${lock.version}`) !== lock.revision) {
      throw new TypeError(
        `The local project cannot resolve block ${lock.type}@${lock.version}#${lock.revision}.`,
      );
    }
  }
  if ((project.state.blueprint.dependencyLock.plugins?.length ?? 0) > 0) {
    throw new TypeError('Standalone local projects cannot activate plugin dependencies.');
  }
}

function assertStandaloneRelationships(project: AuthoringSessionSnapshot): void {
  const { blueprint, coordinates, entry, model } = project.state;
  if (
    !sameLockedReference(coordinates.model, model) ||
    !sameLockedReference(blueprint.model, model) ||
    !sameLockedReference(entry.model, model)
  ) {
    throw new TypeError('The project does not identify one exact Model revision throughout.');
  }
  if (!sameLockedReference(coordinates.blueprint, blueprint)) {
    throw new TypeError('The project coordinates do not identify its exact Blueprint revision.');
  }
  if (coordinates.entry.id !== entry.id || coordinates.entry.revision !== entry.revision) {
    throw new TypeError('The project coordinates do not identify its exact Entry revision.');
  }
  switch (project.start.kind) {
    case 'blank':
      if (project.type !== undefined || coordinates.type !== undefined) {
        throw new TypeError('A blank local project cannot bind a reusable content type.');
      }
      if (project.capabilities.saveOutcomes.some((outcome) => outcome !== 'save-as-new-type')) {
        throw new TypeError('A blank local project can expose only save-as-new-type.');
      }
      break;
    case 'from-type':
      if (
        project.type === undefined ||
        coordinates.type === undefined ||
        !sameLockedReference(project.start.type, project.type) ||
        !sameLockedReference(coordinates.type, project.type)
      ) {
        throw new TypeError(
          'A from-type local project must identify the exact requested reusable content type.',
        );
      }
      assertTypeArtifactRelationships(project, model, blueprint);
      break;
    case 'existing':
      if (
        project.type === undefined ||
        coordinates.type === undefined ||
        !sameLockedReference(coordinates.type, project.type) ||
        project.resourceContext.resource?.id !== entry.id
      ) {
        throw new TypeError(
          'An existing local project must identify its exact Entry and reusable content type.',
        );
      }
      assertTypeArtifactRelationships(project, model, blueprint);
      break;
  }
  if (
    project.capabilities.modes.some((mode) => !project.target.modes.includes(mode)) ||
    project.capabilities.presentationStates.some(
      (presentation) => !project.target.presentationStates.includes(presentation),
    ) ||
    project.capabilities.saveOutcomes.some(
      (outcome) => !project.target.saveOutcomes.includes(outcome),
    )
  ) {
    throw new TypeError('The project capabilities exceed its declared local authoring target.');
  }
}

function assertTypeArtifactRelationships(
  project: AuthoringSessionSnapshot,
  model: AuthoringSessionSnapshot['state']['model'],
  blueprint: AuthoringSessionSnapshot['state']['blueprint'],
): void {
  const type = project.type;
  if (
    type === undefined ||
    !sameLockedReference(type.model, model) ||
    (type.authoringPolicy.itemComposition === 'denied' &&
      !sameLockedReference(type.blueprint, blueprint))
  ) {
    throw new TypeError('The project reusable type does not lock its exact artifacts.');
  }
}

function sameLockedReference(
  reference: { id: string; revision: string; version: string },
  document: { id: string; revision: string; version: string },
): boolean {
  return (
    reference.id === document.id &&
    reference.revision === document.revision &&
    reference.version === document.version
  );
}

function collectNodeIds(roots: readonly BlueprintNode[]): Set<string> {
  const identifiers = new Set<string>();
  const stack = [...roots];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node === undefined) continue;
    identifiers.add(node.id);
    for (const children of Object.values(node.slots)) stack.push(...children);
  }
  return identifiers;
}

function findNode(roots: readonly BlueprintNode[], id: string): BlueprintNode | undefined {
  const stack = [...roots];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node === undefined) continue;
    if (node.id === id) return node;
    for (const children of Object.values(node.slots)) stack.push(...children);
  }
  return undefined;
}

function defaultDownload(download: StudioStandaloneDownload): void {
  const url = URL.createObjectURL(
    new Blob([download.json], { type: `${download.mediaType};charset=utf-8` }),
  );
  const anchor = document.createElement('a');
  anchor.download = download.filename;
  anchor.href = url;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

declare global {
  interface HTMLElementTagNameMap {
    'kumwe-studio-standalone': KumweStudioStandaloneElement;
  }
}
