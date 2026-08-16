import {
  css,
  html,
  LitElement,
  nothing,
  type CSSResult,
  type PropertyValues,
  type TemplateResult,
} from 'lit';
import {
  BlockRegistry,
  StudioCommandError,
  StudioSession,
  validateBlueprint,
  type StudioCommandErrorCode,
  type StudioSessionOptions,
} from '@kumwe/studio-core';
import type {
  BlockDefinition,
  BlueprintCommand,
  BlueprintDocument,
  BlueprintNode,
  CommandDestination,
  DuplicateNodeCommand,
  ExperimentalShellConfiguration,
  FieldBinding,
  InsertNodeCommand,
  JsonValue,
  MessageReference,
  NodeId,
  RemoveBindingCommand,
  RemoveNodeCommand,
  ReorderChildrenCommand,
  ReorderChildrenPayload,
  Revision,
  SetBindingCommand,
  SetPropertyCommand,
  SetPropertyPayload,
  StudioContractVersion,
  StudioDiagnostic,
  ThemeViewport,
  UnsetPropertyCommand,
  UnsetPropertyPayload,
} from '@kumwe/studio-protocol';
import { messageText, type StudioMessageKey, type StudioMessageOverrides } from './messages.js';
import {
  allocateDuplicateIdMap,
  collectDocumentIds,
  findAncestry,
  findOutlineLocation,
} from './outline.js';

export interface StudioDocumentChangeDetail {
  command: BlueprintCommand | null;
  document: BlueprintDocument;
  source: 'command' | 'redo' | 'undo';
}

export interface StudioInsertRequestDetail {
  definition: BlockDefinition;
  parentId: string | null;
  slot?: string;
}

export interface StudioDirtyChangedDetail {
  dirty: boolean;
}

export interface StudioViewportChangeDetail {
  viewport: ThemeViewport;
}

interface ShellCommandEnvelope {
  artifactId: string;
  baseStateVersion: number;
  contractVersion: StudioContractVersion;
  id: string;
  kind: 'command';
  sessionGeneration: Revision;
}

interface CommandPaletteEntry {
  disabled: boolean;
  id: string;
  label: string;
  run: () => void;
}

interface CanvasDragState {
  active: boolean;
  capture?: Element;
  label: string;
  nodeId: NodeId;
  order: NodeId[];
  parentNodeId?: NodeId;
  pointerId: number;
  slot?: string;
  sourceIndex: number;
  targetIndex: number;
}

export class KumweStudioElement extends LitElement {
  public static override properties = {
    announcement: { attribute: false, state: true },
    configuration: { attribute: false },
    document: { attribute: false },
    messages: { attribute: false },
    paletteFilter: { attribute: false, state: true },
    paletteOpen: { attribute: false, state: true },
    selectedNodeId: { attribute: false, state: true },
    viewports: { attribute: false },
  };

  public static override styles: CSSResult = css`
    :host {
      --studio-border: #d7dce2;
      --studio-panel: #f7f8fa;
      --studio-primary: #3157d5;
      color: #18202a;
      display: block;
      font:
        400 0.9375rem/1.45 system-ui,
        sans-serif;
      min-height: 30rem;
    }

    .workspace {
      display: grid;
      grid-template-columns:
        minmax(10rem, 13rem) minmax(18rem, 1fr) minmax(11rem, 15rem)
        minmax(12rem, 16rem);
      min-height: inherit;
    }

    .panel,
    .canvas {
      border: 1px solid var(--studio-border);
      padding: 1rem;
    }

    .panel {
      background: var(--studio-panel);
    }

    h2 {
      font-size: 0.8125rem;
      letter-spacing: 0.05em;
      margin: 0 0 0.75rem;
      text-transform: uppercase;
    }

    button {
      background: white;
      border: 1px solid var(--studio-border);
      border-radius: 0.375rem;
      color: inherit;
      cursor: pointer;
      font: inherit;
      padding: 0.5rem 0.625rem;
      text-align: left;
    }

    button:disabled {
      cursor: not-allowed;
      opacity: 0.55;
    }

    button:focus-visible {
      outline: 0.1875rem solid color-mix(in srgb, var(--studio-primary), transparent 55%);
      outline-offset: 0.125rem;
    }

    button[aria-pressed='true'] {
      border-color: var(--studio-primary);
      box-shadow: inset 0.1875rem 0 0 var(--studio-primary);
    }

    .palette,
    .tree {
      display: grid;
      gap: 0.5rem;
      list-style: none;
      margin: 0;
      padding: 0;
    }

    .toolbar {
      display: flex;
      gap: 0.5rem;
      justify-content: flex-end;
      margin-bottom: 1rem;
    }

    .command-palette-toggle {
      font-size: 0.8125rem;
      margin-bottom: 0.75rem;
      padding: 0.375rem 0.5rem;
    }

    .command-palette {
      background: var(--studio-panel);
      border: 1px solid var(--studio-border);
      border-radius: 0.375rem;
      display: grid;
      gap: 0.5rem;
      margin-bottom: 1rem;
      padding: 0.75rem;
    }

    .command-palette input {
      border: 1px solid var(--studio-border);
      border-radius: 0.375rem;
      font: inherit;
      padding: 0.5rem 0.625rem;
    }

    .command-palette .hint {
      margin: 0;
    }

    .command-results {
      display: grid;
      gap: 0.375rem;
      list-style: none;
      margin: 0;
      padding: 0;
    }

    .command-empty {
      color: #5d6671;
      margin: 0;
    }

    .canvas-chip {
      touch-action: none;
    }

    .drop-indicator {
      border: 1px dashed var(--studio-primary);
      border-radius: 0.375rem;
      font-weight: 600;
      margin: 0 0 0.75rem;
      padding: 0.375rem 0.5rem;
    }

    .node-children {
      border-inline-start: 1px solid var(--studio-border);
      margin: 0.5rem 0 0 0.75rem;
      padding-inline-start: 0.75rem;
    }

    .empty {
      color: #5d6671;
      padding: 3rem 1rem;
      text-align: center;
    }

    .hint {
      color: #5d6671;
      font-size: 0.75rem;
      margin: 0 0 0.75rem;
    }

    .unresolved {
      background: #fbe9e9;
      border: 1px solid #e5b6b6;
      border-radius: 0.25rem;
      color: #7c1d1d;
      font-size: 0.75rem;
      padding: 0 0.25rem;
    }

    .outline-controls {
      display: flex;
      flex-wrap: wrap;
      gap: 0.375rem;
      margin-top: 0.375rem;
    }

    .outline-controls button {
      font-size: 0.8125rem;
      padding: 0.375rem 0.5rem;
    }

    .viewport-switcher {
      display: flex;
      flex-wrap: wrap;
      gap: 0.375rem;
      margin-bottom: 0.75rem;
    }

    .viewport-switcher button {
      font-size: 0.8125rem;
      padding: 0.375rem 0.5rem;
    }

    .breadcrumb ol {
      align-items: center;
      display: flex;
      flex-wrap: wrap;
      gap: 0.375rem;
      list-style: none;
      margin: 0 0 0.75rem;
      padding: 0;
    }

    .breadcrumb li + li::before {
      content: '\\203A';
      margin-inline-end: 0.375rem;
    }

    .breadcrumb button {
      font-size: 0.8125rem;
      padding: 0.25rem 0.375rem;
    }

    .breadcrumb-current {
      font-weight: 600;
    }

    .diagnostics {
      grid-column: 1 / -1;
    }

    .diagnostics-list {
      display: grid;
      gap: 0.5rem;
      list-style: none;
      margin: 0;
      padding: 0;
    }

    .diagnostics-empty {
      color: #5d6671;
      margin: 0;
    }

    .diagnostic-severity {
      font-size: 0.75rem;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }

    .diagnostic-severity::after {
      content: ':';
    }

    .statusbar {
      align-items: center;
      border: 1px solid var(--studio-border);
      display: flex;
      gap: 0.5rem;
      grid-column: 1 / -1;
      padding: 0.5rem 1rem;
    }

    .save-state[data-dirty='true'] {
      color: #7c4a03;
    }

    .assistive {
      block-size: 1px;
      clip-path: inset(50%);
      inline-size: 1px;
      margin: -1px;
      overflow: hidden;
      padding: 0;
      position: absolute;
      white-space: nowrap;
    }

    dl {
      display: grid;
      gap: 0.75rem;
      margin: 0;
    }

    dt {
      color: #5d6671;
      font-size: 0.75rem;
      text-transform: uppercase;
    }

    dd {
      margin: 0.125rem 0 0;
      overflow-wrap: anywhere;
    }

    .inspector-section {
      margin-top: 1rem;
    }

    .inspector-section h3 {
      font-size: 0.75rem;
      letter-spacing: 0.05em;
      margin: 0 0 0.5rem;
      text-transform: uppercase;
    }

    .inspector-rows {
      display: grid;
      gap: 0.5rem;
      list-style: none;
      margin: 0 0 0.5rem;
      padding: 0;
    }

    .inspector-row {
      align-items: center;
      display: flex;
      flex-wrap: wrap;
      gap: 0.375rem;
    }

    .inspector-name {
      font-size: 0.8125rem;
      font-weight: 600;
      overflow-wrap: anywhere;
    }

    .inspector input {
      border: 1px solid var(--studio-border);
      border-radius: 0.375rem;
      flex: 1 1 6rem;
      font: inherit;
      min-inline-size: 0;
      padding: 0.375rem 0.5rem;
    }

    .inspector input:disabled {
      background: var(--studio-panel);
      cursor: not-allowed;
      opacity: 0.55;
    }

    .inspector button {
      font-size: 0.8125rem;
      padding: 0.375rem 0.5rem;
    }

    .inspector-binding-value {
      font-size: 0.75rem;
      overflow-wrap: anywhere;
    }

    .inspector-empty {
      color: #5d6671;
      margin: 0 0 0.5rem;
    }

    @media (max-width: 60rem) {
      .workspace {
        grid-template-columns: minmax(16rem, 1fr);
      }
    }

    /* SR-019: no chrome motion is essential, so a reduced-motion preference
       zeroes every animation and transition the shell declares now or later. */
    @media (prefers-reduced-motion: reduce) {
      :host,
      *,
      *::before,
      *::after {
        animation-delay: 0s !important;
        animation-duration: 0s !important;
        animation-iteration-count: 1 !important;
        scroll-behavior: auto !important;
        transition-delay: 0s !important;
        transition-duration: 0s !important;
      }
    }
  `;

  declare public configuration: ExperimentalShellConfiguration | undefined;
  declare public document: BlueprintDocument | undefined;
  declare public messages: StudioMessageOverrides | undefined;
  declare public viewports: ThemeViewport[] | undefined;
  declare protected announcement: string | undefined;
  declare protected paletteFilter: string | undefined;
  declare protected paletteOpen: boolean | undefined;
  declare protected selectedNodeId: string | undefined;

  #activeViewportId: string | undefined;
  #commandSequence = 0;
  #diagnostics: StudioDiagnostic[] = [];
  #drag: CanvasDragState | undefined;
  #internalDocumentUpdate = false;
  #lastDirty = false;
  #paletteInvoker: HTMLElement | undefined;
  #pendingFocusNodeId: NodeId | undefined;
  #pendingPaletteFocus = false;
  #registry: BlockRegistry | undefined;
  #session: StudioSession | undefined;
  #sessionGeneration: Revision = '';

  public get activeViewport(): ThemeViewport | undefined {
    const ordered = this.#orderedViewports();
    if (ordered.length === 0) {
      return undefined;
    }
    const chosen = ordered.find((viewport) => viewport.id === this.#activeViewportId);
    return chosen ?? ordered.find((viewport) => viewport.base) ?? ordered[0];
  }

  public get stateVersion(): number {
    return this.#session?.stateVersion ?? 0;
  }

  public execute(command: BlueprintCommand): BlueprintDocument {
    if (this.configuration?.session.sessionState === 'read-only') {
      const message = 'The current Studio session is read-only.';
      this.#announce('studio.shell/announce-conflict', { message });
      throw new Error(message);
    }
    const session = this.#session;
    if (session === undefined) {
      throw new Error('Load a blueprint document before executing a command.');
    }
    let next: BlueprintDocument;
    try {
      next = session.execute(command);
    } catch (error) {
      if (error instanceof StudioCommandError && CONFLICT_ERROR_CODES.has(error.code)) {
        this.#announce('studio.shell/announce-conflict', { message: error.message });
      } else {
        this.#announce('studio.shell/announce-command-failed', {
          message: error instanceof Error ? error.message : String(error),
        });
      }
      throw error;
    }
    this.#assignInternalDocument(next);
    this.selectedNodeId = session.selection[0];
    this.#emitDocumentChange({ command, document: next, source: 'command' });
    this.#syncDirty();
    return next;
  }

  public markSaved(revision?: Revision): void {
    const session = this.#session;
    if (session === undefined) {
      return;
    }
    session.markSaved(revision ?? session.savedRevision);
    this.#syncDirty();
    this.requestUpdate();
  }

  public redo(): BlueprintDocument | undefined {
    const session = this.#session;
    if (this.#isReadOnly() || session?.canRedo !== true) {
      return this.document;
    }
    this.#captureOutlineFocus();
    const next = session.redo();
    this.#assignInternalDocument(next);
    this.selectedNodeId = session.selection[0];
    this.#emitDocumentChange({ command: null, document: next, source: 'redo' });
    this.#syncDirty();
    this.#announce('studio.shell/announce-redid');
    return next;
  }

  public undo(): BlueprintDocument | undefined {
    const session = this.#session;
    if (this.#isReadOnly() || session?.canUndo !== true) {
      return this.document;
    }
    this.#captureOutlineFocus();
    const next = session.undo();
    this.#assignInternalDocument(next);
    this.selectedNodeId = session.selection[0];
    this.#emitDocumentChange({ command: null, document: next, source: 'undo' });
    this.#syncDirty();
    this.#announce('studio.shell/announce-undid');
    return next;
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('viewports')) {
      this.#activeViewportId = undefined;
    }
    if (changed.has('configuration')) {
      this.#rebuildRegistry();
    }
    if (changed.has('document') || changed.has('configuration')) {
      if (this.#internalDocumentUpdate) {
        this.#internalDocumentUpdate = false;
      } else {
        this.#rebuildSession();
      }
      this.#revalidate();
    }
  }

  protected override updated(): void {
    if (this.#pendingPaletteFocus) {
      this.#pendingPaletteFocus = false;
      this.shadowRoot?.querySelector<HTMLInputElement>('.command-palette input')?.focus();
    }
    const nodeId = this.#pendingFocusNodeId;
    if (nodeId === undefined) {
      return;
    }
    this.#pendingFocusNodeId = undefined;
    this.#focusOutlineEntry(nodeId);
  }

  protected override render(): TemplateResult {
    const session = this.#session;
    const readOnly = this.#isReadOnly();
    const roots = this.document?.roots ?? [];
    const selected =
      this.document === undefined || this.selectedNodeId === undefined
        ? undefined
        : findOutlineLocation(this.document.roots, this.selectedNodeId)?.node;

    return html`
      <div
        class="workspace"
        @keydown=${(event: KeyboardEvent): void => {
          this.#onWorkspaceKeydown(event);
        }}
      >
        <aside class="panel" aria-label=${this.#text('studio.shell/palette-label')}>
          <h2>${this.#text('studio.shell/palette-heading')}</h2>
          <ul class="palette">
            ${(this.configuration?.blockDefinitions ?? []).map(
              (definition) => html`
                <li>
                  <button
                    type="button"
                    ?disabled=${readOnly}
                    @click=${(): void => this.#requestInsert(definition)}
                  >
                    ${referenceText(definition.label)}
                  </button>
                </li>
              `,
            )}
          </ul>
        </aside>

        <main
          class="canvas"
          aria-label=${this.#text('studio.shell/canvas-label')}
          data-viewport=${this.activeViewport?.id ?? nothing}
          @pointermove=${(event: PointerEvent): void => {
            this.#onCanvasPointerMove(event);
          }}
          @pointerup=${(event: PointerEvent): void => {
            this.#onCanvasPointerUp(event);
          }}
          @pointercancel=${(event: PointerEvent): void => {
            this.#onCanvasPointerCancel(event);
          }}
        >
          ${this.#renderViewportSwitcher()} ${this.#renderBreadcrumb()}
          <button
            type="button"
            class="command-palette-toggle"
            aria-expanded=${this.paletteOpen === true ? 'true' : 'false'}
            @click=${(event: Event): void => {
              this.#togglePalette(event);
            }}
          >
            ${this.#text('studio.shell/command-palette-toggle')}
          </button>
          ${this.#renderCommandPalette()}
          <div class="toolbar" role="group" aria-label=${this.#text('studio.shell/history-label')}>
            <button
              type="button"
              ?disabled=${session?.canUndo !== true || readOnly}
              @click=${(): void => {
                this.undo();
              }}
            >
              ${this.#text('studio.shell/undo')}
            </button>
            <button
              type="button"
              ?disabled=${session?.canRedo !== true || readOnly}
              @click=${(): void => {
                this.redo();
              }}
            >
              ${this.#text('studio.shell/redo')}
            </button>
          </div>
          ${this.#renderDropIndicator()}
          ${
            roots.length === 0
              ? html`<p class="empty">${this.#text('studio.shell/canvas-empty')}</p>`
              : html`<ul class="tree">
                  ${roots.map((node) => this.#renderCanvasNode(node))}
                </ul>`
          }
        </main>

        <aside class="panel outline" aria-label=${this.#text('studio.shell/outline-heading')}>
          <h2>${this.#text('studio.shell/outline-heading')}</h2>
          <p class="hint">${this.#text('studio.shell/outline-hint')}</p>
          ${
            roots.length === 0
              ? html`<p class="empty">${this.#text('studio.shell/outline-empty')}</p>`
              : html`<ul class="tree">
                  ${roots.map((node) => this.#renderOutlineNode(node))}
                </ul>`
          }
        </aside>

        <aside class="panel inspector" aria-label=${this.#text('studio.shell/inspector-heading')}>
          <h2>${this.#text('studio.shell/inspector-heading')}</h2>
          ${
            selected === undefined
              ? html`<p>${this.#text('studio.shell/inspector-empty')}</p>`
              : this.#renderInspector(selected)
          }
        </aside>

        <section
          class="panel diagnostics"
          aria-label=${this.#text('studio.shell/diagnostics-heading')}
        >
          <h2>${this.#text('studio.shell/diagnostics-heading')}</h2>
          ${
            this.#diagnostics.length === 0
              ? html`<p class="diagnostics-empty">
                  ${this.#text('studio.shell/diagnostics-empty')}
                </p>`
              : html`<ul class="diagnostics-list">
                  ${this.#diagnostics.map((entry) => this.#renderDiagnostic(entry))}
                </ul>`
          }
        </section>

        <footer class="statusbar" aria-label=${this.#text('studio.shell/status-label')}>
          ${
            session === undefined
              ? nothing
              : html`<span class="save-state" data-dirty=${session.dirty ? 'true' : 'false'}>
                  ${this.#text(
                    session.dirty
                      ? 'studio.shell/save-state-unsaved'
                      : 'studio.shell/save-state-saved',
                  )}
                </span>`
          }
          <p class="assistive" aria-live="polite">${this.announcement ?? ''}</p>
        </footer>
      </div>
    `;
  }

  #addOverride(node: BlueprintNode, viewport: ThemeViewport): void {
    const nameInput =
      this.shadowRoot?.querySelector<HTMLInputElement>('input.inspector-add-override-name') ?? null;
    const valueInput =
      this.shadowRoot?.querySelector<HTMLInputElement>('input.inspector-add-override-value') ??
      null;
    if (nameInput === null || valueInput === null) {
      return;
    }
    const property = nameInput.value.trim();
    if (property.length === 0) {
      this.#announce('studio.shell/announce-name-required');
      return;
    }
    const parsed = this.#parseJsonInput(valueInput.value, property);
    if (parsed === undefined) {
      return;
    }
    if (this.#setNodeProperty(node, property, parsed.value, viewport)) {
      nameInput.value = '';
      valueInput.value = '';
    }
  }

  #addProperty(node: BlueprintNode): void {
    const nameInput =
      this.shadowRoot?.querySelector<HTMLInputElement>('input.inspector-add-property-name') ?? null;
    const valueInput =
      this.shadowRoot?.querySelector<HTMLInputElement>('input.inspector-add-property-value') ??
      null;
    if (nameInput === null || valueInput === null) {
      return;
    }
    const property = nameInput.value.trim();
    if (property.length === 0) {
      this.#announce('studio.shell/announce-name-required');
      return;
    }
    const parsed = this.#parseJsonInput(valueInput.value, property);
    if (parsed === undefined) {
      return;
    }
    if (this.#setNodeProperty(node, property, parsed.value, undefined)) {
      nameInput.value = '';
      valueInput.value = '';
    }
  }

  #announce(key: StudioMessageKey, parameters?: Readonly<Record<string, string>>): void {
    this.announcement = messageText(key, this.messages, parameters);
  }

  #assignInternalDocument(document: BlueprintDocument): void {
    this.#internalDocumentUpdate = true;
    this.document = document;
  }

  /**
   * Abandons an in-progress canvas drag without touching the document.
   * Returns whether a drag was actually pending, so keyboard handling can
   * consume the Escape key only when it cancelled something.
   */
  #cancelDrag(): boolean {
    const drag = this.#drag;
    if (drag === undefined) {
      return false;
    }
    this.#drag = undefined;
    this.#releaseDragCapture(drag);
    if (drag.active) {
      this.#announce('studio.shell/announce-drag-cancelled', { label: drag.label });
    }
    this.requestUpdate();
    return true;
  }

  #captureOutlineFocus(): void {
    const active = this.shadowRoot?.activeElement;
    if (
      active instanceof HTMLElement &&
      active.classList.contains('outline-entry') &&
      active.dataset.nodeId !== undefined
    ) {
      this.#pendingFocusNodeId = active.dataset.nodeId;
    }
  }

  #closePalette(restoreFocus: boolean): void {
    this.paletteOpen = false;
    this.paletteFilter = '';
    const invoker = this.#paletteInvoker;
    this.#paletteInvoker = undefined;
    if (restoreFocus && invoker?.isConnected === true) {
      invoker.focus();
    }
  }

  #commandEnvelope(document: BlueprintDocument, session: StudioSession): ShellCommandEnvelope {
    this.#commandSequence += 1;
    return {
      artifactId: document.id,
      baseStateVersion: session.stateVersion,
      contractVersion: document.contractVersion,
      id: `studio-shell-command-${this.#commandSequence}`,
      kind: 'command',
      sessionGeneration: this.#sessionGeneration,
    };
  }

  #currentInspectorNode(nodeId: NodeId): BlueprintNode | undefined {
    return this.document === undefined
      ? undefined
      : findOutlineLocation(this.document.roots, nodeId)?.node;
  }

  #deleteNode(node: BlueprintNode): void {
    const session = this.#session;
    const document = this.document;
    if (session === undefined || document === undefined || this.#isReadOnly()) {
      return;
    }
    const location = findOutlineLocation(document.roots, node.id);
    if (location === undefined) {
      return;
    }
    const previousSiblingId =
      location.index > 0 ? location.collection[location.index - 1]?.id : undefined;
    const parentId = location.parentNodeId;
    const label = this.#nodeLabel(node);
    const command: RemoveNodeCommand = {
      ...this.#commandEnvelope(document, session),
      payload: { nodeId: node.id },
      type: 'studio.command/remove-node',
    };
    if (this.#runShellCommand(command)) {
      const focusTarget = previousSiblingId ?? parentId ?? this.document?.roots[0]?.id;
      if (focusTarget !== undefined) {
        this.#selectNode(focusTarget);
        this.#pendingFocusNodeId = focusTarget;
      }
      this.#announce('studio.shell/announce-deleted', { label });
    }
  }

  #duplicateNode(node: BlueprintNode): void {
    const session = this.#session;
    const document = this.document;
    if (session === undefined || document === undefined || this.#isReadOnly()) {
      return;
    }
    const idMap = allocateDuplicateIdMap(document.roots, node);
    const copyId = idMap[node.id];
    if (copyId === undefined) {
      return;
    }
    const command: DuplicateNodeCommand = {
      ...this.#commandEnvelope(document, session),
      payload: { idMap, nodeId: node.id },
      type: 'studio.command/duplicate-node',
    };
    if (this.#runShellCommand(command)) {
      this.#selectNode(copyId);
      this.#pendingFocusNodeId = copyId;
      this.#announce('studio.shell/announce-duplicated', { label: this.#nodeLabel(node) });
    }
  }

  #emitDocumentChange(detail: StudioDocumentChangeDetail): void {
    this.dispatchEvent(
      new CustomEvent<StudioDocumentChangeDetail>('studio-document-change', {
        bubbles: true,
        composed: true,
        detail,
      }),
    );
  }

  #filteredPaletteEntries(): CommandPaletteEntry[] {
    const filter = (this.paletteFilter ?? '').trim().toLowerCase();
    const entries = this.#paletteEntries();
    if (filter.length === 0) {
      return entries;
    }
    return entries.filter((entry) => entry.label.toLowerCase().includes(filter));
  }

  #findDefinition(node: BlueprintNode): BlockDefinition | undefined {
    return this.configuration?.blockDefinitions.find(
      (candidate) => candidate.type === node.type && candidate.version === node.version,
    );
  }

  #focusOutlineEntry(nodeId: NodeId): void {
    const entries = this.shadowRoot?.querySelectorAll<HTMLButtonElement>('button.outline-entry');
    if (entries === undefined) {
      return;
    }
    for (const entry of entries) {
      if (entry.dataset.nodeId === nodeId) {
        entry.focus();
        return;
      }
    }
  }

  /**
   * Inserts a fresh node for a palette block definition: into the selected
   * node's first declared slot when its definition declares slots, otherwise
   * at the end of the document roots — the same placement an outline insert
   * resolves to.
   */
  #insertDefinition(definition: BlockDefinition): void {
    const session = this.#session;
    const document = this.document;
    if (session === undefined || document === undefined || this.#isReadOnly()) {
      return;
    }
    const selected =
      this.selectedNodeId === undefined
        ? undefined
        : findOutlineLocation(document.roots, this.selectedNodeId)?.node;
    const selectedDefinition = selected === undefined ? undefined : this.#findDefinition(selected);
    const firstSlot = selectedDefinition?.slots[0];
    let destination: CommandDestination;
    if (selected !== undefined && firstSlot !== undefined) {
      const children = Object.hasOwn(selected.slots, firstSlot.id)
        ? selected.slots[firstSlot.id]
        : undefined;
      destination = {
        parentNodeId: selected.id,
        position: children?.length ?? 0,
        slot: firstSlot.id,
      };
    } else {
      destination = { position: document.roots.length };
    }
    const taken = collectDocumentIds(document.roots);
    const base = definition.type.slice(definition.type.indexOf('/') + 1);
    let counter = 1;
    let nodeId = `${base}-${counter}`;
    while (taken.has(nodeId)) {
      counter += 1;
      nodeId = `${base}-${counter}`;
    }
    const node: BlueprintNode = {
      authoring: { mode: 'content' },
      bindings: {},
      id: nodeId,
      properties: {},
      slots: {},
      type: definition.type,
      version: definition.version,
    };
    const command: InsertNodeCommand = {
      ...this.#commandEnvelope(document, session),
      payload: { destination, node },
      type: 'studio.command/insert-node',
    };
    if (this.#runShellCommand(command)) {
      this.#selectNode(nodeId);
      this.#pendingFocusNodeId = nodeId;
      this.#announce('studio.shell/announce-inserted', {
        label: referenceText(definition.label),
      });
    }
  }

  #isReadOnly(): boolean {
    return (
      this.configuration?.session.sessionState === 'read-only' ||
      this.#session?.sessionState === 'read-only'
    );
  }

  #moveNode(node: BlueprintNode, direction: -1 | 1): void {
    const session = this.#session;
    const document = this.document;
    if (session === undefined || document === undefined || this.#isReadOnly()) {
      return;
    }
    const location = findOutlineLocation(document.roots, node.id);
    if (location === undefined) {
      return;
    }
    const targetIndex = location.index + direction;
    if (targetIndex < 0 || targetIndex >= location.collection.length) {
      return;
    }
    const order = location.collection.map((sibling) => sibling.id);
    const [movedId] = order.splice(location.index, 1);
    if (movedId === undefined) {
      return;
    }
    order.splice(targetIndex, 0, movedId);
    const payload: ReorderChildrenPayload = { order };
    if (location.parentNodeId !== undefined && location.slot !== undefined) {
      payload.parentNodeId = location.parentNodeId;
      payload.slot = location.slot;
    }
    const command: ReorderChildrenCommand = {
      ...this.#commandEnvelope(document, session),
      payload,
      type: 'studio.command/reorder-children',
    };
    if (this.#runShellCommand(command)) {
      this.#pendingFocusNodeId = node.id;
      this.#announce(
        direction === -1 ? 'studio.shell/announce-moved-up' : 'studio.shell/announce-moved-down',
        { label: this.#nodeLabel(node) },
      );
    }
  }

  #moveOutlineFocus(origin: EventTarget | null, direction: -1 | 1): void {
    const entries = [
      ...(this.shadowRoot?.querySelectorAll<HTMLButtonElement>('button.outline-entry') ?? []),
    ];
    const index = entries.findIndex((entry) => entry === origin);
    if (index === -1) {
      return;
    }
    entries[index + direction]?.focus();
  }

  #nodeLabel(node: BlueprintNode): string {
    const definition = this.#findDefinition(node);
    return definition === undefined ? node.type : referenceText(definition.label);
  }

  #onCanvasPointerCancel(event: PointerEvent): void {
    if (this.#drag?.pointerId === event.pointerId) {
      this.#cancelDrag();
    }
  }

  #onCanvasPointerMove(event: PointerEvent): void {
    const drag = this.#drag;
    if (drag === undefined) {
      return;
    }
    if (event.pointerId !== drag.pointerId) {
      return;
    }
    drag.active = true;
    const index = this.#resolveDragIndex(event, drag);
    if (index !== undefined) {
      drag.targetIndex = index;
    }
    this.requestUpdate();
  }

  #onCanvasPointerUp(event: PointerEvent): void {
    const drag = this.#drag;
    if (drag === undefined) {
      return;
    }
    if (event.pointerId !== drag.pointerId) {
      return;
    }
    this.#drag = undefined;
    this.#releaseDragCapture(drag);
    if (!drag.active) {
      // A plain press stays a click; selection is handled by the click path.
      return;
    }
    this.requestUpdate();
    if (drag.targetIndex === drag.sourceIndex) {
      this.#announce('studio.shell/announce-drag-cancelled', { label: drag.label });
      return;
    }
    const session = this.#session;
    const document = this.document;
    if (session === undefined || document === undefined || this.#isReadOnly()) {
      return;
    }
    const order = [...drag.order];
    const [movedId] = order.splice(drag.sourceIndex, 1);
    if (movedId === undefined) {
      return;
    }
    order.splice(drag.targetIndex, 0, movedId);
    const payload: ReorderChildrenPayload = { order };
    if (drag.parentNodeId !== undefined && drag.slot !== undefined) {
      payload.parentNodeId = drag.parentNodeId;
      payload.slot = drag.slot;
    }
    const command: ReorderChildrenCommand = {
      ...this.#commandEnvelope(document, session),
      payload,
      type: 'studio.command/reorder-children',
    };
    if (this.#runShellCommand(command)) {
      this.#selectNode(drag.nodeId);
      this.#announce('studio.shell/announce-dropped', {
        count: String(drag.order.length),
        label: drag.label,
        position: String(drag.targetIndex + 1),
      });
    }
  }

  /**
   * Starts tracking a possible chip drag. The drag only becomes active on the
   * first pointer move, so a plain press-and-release stays an ordinary click.
   * Read-only sessions and single-child collections never start tracking.
   */
  #onChipPointerDown(event: PointerEvent, node: BlueprintNode): void {
    const document = this.document;
    if (
      document === undefined ||
      this.#session === undefined ||
      this.#isReadOnly() ||
      event.button !== 0 ||
      this.#drag !== undefined
    ) {
      return;
    }
    const location = findOutlineLocation(document.roots, node.id);
    if (location === undefined || location.collection.length < 2) {
      return;
    }
    const drag: CanvasDragState = {
      active: false,
      label: this.#nodeLabel(node),
      nodeId: node.id,
      order: location.collection.map((sibling) => sibling.id),
      pointerId: event.pointerId,
      sourceIndex: location.index,
      targetIndex: location.index,
    };
    if (location.parentNodeId !== undefined && location.slot !== undefined) {
      drag.parentNodeId = location.parentNodeId;
      drag.slot = location.slot;
    }
    const chip = event.currentTarget;
    if (chip instanceof Element) {
      drag.capture = chip;
      try {
        chip.setPointerCapture(event.pointerId);
      } catch {
        // Pointer capture is a progressive nicety; tracking works without it.
      }
    }
    this.#drag = drag;
  }

  /**
   * The shared keyboard contract of every inspector value input: Enter parses
   * the text as JSON and commits it through set-property (with the viewport
   * when the input edits an override); Escape reverts to the committed value
   * and announces the cancellation. Both success and failure re-align the
   * input with the document, so a rejected command never leaves optimistic
   * text behind while focus stays on the input.
   */
  #onInspectorValueKeydown(
    event: KeyboardEvent,
    node: BlueprintNode,
    property: string,
    viewport: ThemeViewport | undefined,
  ): void {
    const input = event.currentTarget;
    if (!(input instanceof HTMLInputElement)) {
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const parsed = this.#parseJsonInput(input.value, property);
      if (parsed === undefined) {
        return;
      }
      this.#setNodeProperty(node, property, parsed.value, viewport);
      const current = this.#currentInspectorNode(node.id) ?? node;
      input.value = this.#serializedInspectorValue(current, property, viewport);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      const current = this.#currentInspectorNode(node.id) ?? node;
      input.value = this.#serializedInspectorValue(current, property, viewport);
      this.#announce('studio.shell/announce-edit-cancelled', { property });
    }
  }

  #onOutlineKeydown(event: KeyboardEvent, node: BlueprintNode): void {
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      const direction: -1 | 1 = event.key === 'ArrowUp' ? -1 : 1;
      if (event.altKey) {
        this.#moveNode(node, direction);
      } else {
        this.#moveOutlineFocus(event.currentTarget, direction);
      }
      return;
    }
    if (event.key === 'Delete') {
      event.preventDefault();
      this.#deleteNode(node);
      return;
    }
    if ((event.key === 'd' || event.key === 'D') && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      this.#duplicateNode(node);
    }
  }

  #onPaletteEntryKeydown(event: KeyboardEvent): void {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') {
      return;
    }
    event.preventDefault();
    const buttons = this.#paletteResultButtons();
    const index = buttons.findIndex((button) => button === event.currentTarget);
    if (index === -1) {
      return;
    }
    if (event.key === 'ArrowDown') {
      buttons[index + 1]?.focus();
      return;
    }
    if (index === 0) {
      this.shadowRoot?.querySelector<HTMLInputElement>('.command-palette input')?.focus();
      return;
    }
    buttons[index - 1]?.focus();
  }

  #onPaletteInputKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.#paletteResultButtons()[0]?.focus();
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const first = this.#filteredPaletteEntries().find((entry) => !entry.disabled);
      if (first !== undefined) {
        this.#runPaletteEntry(first);
      }
    }
  }

  #onWorkspaceKeydown(event: KeyboardEvent): void {
    if ((event.key === 'k' || event.key === 'K') && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      this.#togglePalette(event);
      return;
    }
    if (event.key === 'Escape') {
      if (this.#cancelDrag()) {
        event.preventDefault();
        return;
      }
      if (this.paletteOpen === true) {
        event.preventDefault();
        this.#closePalette(true);
      }
    }
  }

  #orderedViewports(): ThemeViewport[] {
    return [...(this.viewports ?? [])].sort((left, right) => left.order - right.order);
  }

  /**
   * The executable command list for the palette. Selection-scoped structural
   * entries reuse the outline's dispatch paths and its exact disabled rules;
   * insert entries mirror the block palette. Labels are catalog strings so the
   * case-insensitive filter operates on localized text.
   */
  #paletteEntries(): CommandPaletteEntry[] {
    const session = this.#session;
    const document = this.document;
    const readOnly = this.#isReadOnly();
    const entries: CommandPaletteEntry[] = [];
    const location =
      document === undefined || this.selectedNodeId === undefined
        ? undefined
        : findOutlineLocation(document.roots, this.selectedNodeId);
    if (location !== undefined) {
      const node = location.node;
      const first = location.index === 0;
      const last = location.index === location.collection.length - 1;
      entries.push(
        {
          disabled: readOnly || first,
          id: 'move-up',
          label: this.#text('studio.shell/move-up'),
          run: (): void => {
            this.#moveNode(node, -1);
          },
        },
        {
          disabled: readOnly || last,
          id: 'move-down',
          label: this.#text('studio.shell/move-down'),
          run: (): void => {
            this.#moveNode(node, 1);
          },
        },
        {
          disabled: readOnly,
          id: 'duplicate',
          label: this.#text('studio.shell/duplicate'),
          run: (): void => {
            this.#duplicateNode(node);
          },
        },
        {
          disabled: readOnly,
          id: 'delete',
          label: this.#text('studio.shell/delete'),
          run: (): void => {
            this.#deleteNode(node);
          },
        },
      );
    }
    entries.push(
      {
        disabled: readOnly || session?.canUndo !== true,
        id: 'undo',
        label: this.#text('studio.shell/undo'),
        run: (): void => {
          this.undo();
        },
      },
      {
        disabled: readOnly || session?.canRedo !== true,
        id: 'redo',
        label: this.#text('studio.shell/redo'),
        run: (): void => {
          this.redo();
        },
      },
      {
        disabled: location === undefined,
        id: 'clear-selection',
        label: this.#text('studio.shell/command-clear-selection'),
        run: (): void => {
          this.#session?.clearSelection();
          this.selectedNodeId = undefined;
          this.#announce('studio.shell/announce-selection-cleared');
        },
      },
    );
    for (const definition of this.configuration?.blockDefinitions ?? []) {
      entries.push({
        disabled: readOnly,
        id: `insert-${definition.type}@${definition.version}`,
        label: this.#text('studio.shell/command-insert', {
          label: referenceText(definition.label),
        }),
        run: (): void => {
          this.#insertDefinition(definition);
        },
      });
    }
    return entries;
  }

  #paletteResultButtons(): HTMLButtonElement[] {
    return [
      ...(this.shadowRoot?.querySelectorAll<HTMLButtonElement>('button.command-entry') ?? []),
    ].filter((button) => !button.disabled);
  }

  /**
   * Parses one inspector input as JSON. A parse failure announces the
   * invalid-value message naming the edited field and returns undefined so
   * the caller dispatches nothing; the wrapper object distinguishes a parsed
   * null from a failed parse.
   */
  #parseJsonInput(text: string, label: string): { value: JsonValue } | undefined {
    try {
      return { value: JSON.parse(text) as JsonValue };
    } catch {
      this.#announce('studio.shell/announce-invalid-value', { label });
      return undefined;
    }
  }

  #rebuildRegistry(): void {
    const registry = new BlockRegistry();
    for (const definition of this.configuration?.blockDefinitions ?? []) {
      try {
        registry.register(definition);
      } catch {
        // An unregistrable definition surfaces as block-unavailable diagnostics.
      }
    }
    this.#registry = registry;
  }

  #rebuildSession(): void {
    if (this.document === undefined) {
      this.#session = undefined;
      this.#sessionGeneration = '';
    } else {
      const generation = this.configuration?.session.sessionGeneration ?? this.document.revision;
      const options: StudioSessionOptions = {
        document: this.document,
        sessionGeneration: generation,
        sessionState: this.configuration?.session.sessionState ?? 'editable',
      };
      const maximumHistoryEntries = this.configuration?.session.limits.maxHistoryEntries;
      if (maximumHistoryEntries !== undefined) {
        options.maximumHistoryEntries = maximumHistoryEntries;
      }
      this.#session = new StudioSession(options);
      this.#sessionGeneration = generation;
    }
    this.#drag = undefined;
    this.selectedNodeId = undefined;
    this.#syncDirty();
  }

  #releaseDragCapture(drag: CanvasDragState): void {
    try {
      drag.capture?.releasePointerCapture(drag.pointerId);
    } catch {
      // The capture may already have been released by the platform.
    }
  }

  #removeBinding(node: BlueprintNode, port: string): void {
    const session = this.#session;
    const document = this.document;
    if (session === undefined || document === undefined || this.#isReadOnly()) {
      return;
    }
    const command: RemoveBindingCommand = {
      ...this.#commandEnvelope(document, session),
      payload: { nodeId: node.id, port },
      type: 'studio.command/remove-binding',
    };
    if (this.#runShellCommand(command)) {
      this.#announce('studio.shell/announce-binding-removed', { port });
    }
  }

  #renderBreadcrumb(): TemplateResult | typeof nothing {
    const roots = this.document?.roots;
    if (roots === undefined || this.selectedNodeId === undefined) {
      return nothing;
    }
    const ancestry = findAncestry(roots, this.selectedNodeId);
    if (ancestry.length === 0) {
      return nothing;
    }
    return html`
      <nav class="breadcrumb" aria-label=${this.#text('studio.shell/breadcrumb-label')}>
        <ol>
          ${ancestry.map((node, index) =>
            index === ancestry.length - 1
              ? html`<li>
                  <span class="breadcrumb-current" aria-current="true">
                    ${this.#nodeLabel(node)}
                  </span>
                </li>`
              : html`<li>
                  <button
                    type="button"
                    class="breadcrumb-entry"
                    data-node-id=${node.id}
                    @click=${(): void => {
                      this.#selectNode(node.id);
                    }}
                  >
                    ${this.#nodeLabel(node)}
                  </button>
                </li>`,
          )}
        </ol>
      </nav>
    `;
  }

  #renderCanvasNode(node: BlueprintNode): TemplateResult {
    const definition = this.#findDefinition(node);
    const nested = Object.entries(node.slots);
    return html`
      <li>
        <button
          type="button"
          class="canvas-chip"
          data-node-id=${node.id}
          aria-pressed=${this.selectedNodeId === node.id ? 'true' : 'false'}
          @click=${(): void => {
            this.#selectNode(node.id);
          }}
          @pointerdown=${(event: PointerEvent): void => {
            this.#onChipPointerDown(event, node);
          }}
        >
          ${definition === undefined ? node.type : referenceText(definition.label)}
        </button>
        ${nested.map(
          ([slot, children]) => html`
            <section class="node-children" aria-label=${slot}>
              <ul class="tree">
                ${children.map((child) => this.#renderCanvasNode(child))}
              </ul>
            </section>
          `,
        )}
      </li>
    `;
  }

  /**
   * The palette is deliberately not an ARIA combobox: it is a labelled region
   * holding a labelled filter input and a list of real, natively focusable
   * buttons. Arrow keys move between the input and the enabled results, Enter
   * activates, Tab leaves in document order — behavior documented in
   * docs/experience/keyboard.md.
   */
  #renderCommandPalette(): TemplateResult | typeof nothing {
    if (this.paletteOpen !== true) {
      return nothing;
    }
    const entries = this.#filteredPaletteEntries();
    return html`
      <section
        class="command-palette"
        aria-label=${this.#text('studio.shell/command-palette-label')}
      >
        <input
          type="text"
          aria-label=${this.#text('studio.shell/command-palette-input-label')}
          .value=${this.paletteFilter ?? ''}
          @input=${(event: Event): void => {
            const target = event.currentTarget;
            if (target instanceof HTMLInputElement) {
              this.paletteFilter = target.value;
            }
          }}
          @keydown=${(event: KeyboardEvent): void => {
            this.#onPaletteInputKeydown(event);
          }}
        />
        <p class="hint">${this.#text('studio.shell/command-palette-hint')}</p>
        ${
          entries.length === 0
            ? html`<p class="command-empty">${this.#text('studio.shell/command-palette-empty')}</p>`
            : html`
                <ul
                  class="command-results"
                  aria-label=${this.#text('studio.shell/command-palette-results-label')}
                >
                  ${entries.map(
                    (entry) => html`
                      <li>
                        <button
                          type="button"
                          class="command-entry"
                          data-command-id=${entry.id}
                          ?disabled=${entry.disabled}
                          @click=${(): void => {
                            this.#runPaletteEntry(entry);
                          }}
                          @keydown=${(event: KeyboardEvent): void => {
                            this.#onPaletteEntryKeydown(event);
                          }}
                        >
                          ${entry.label}
                        </button>
                      </li>
                    `,
                  )}
                </ul>
              `
        }
      </section>
    `;
  }

  #renderDiagnostic(entry: StudioDiagnostic): TemplateResult {
    const severity = html`<span class="diagnostic-severity">
      ${this.#text(SEVERITY_MESSAGE_KEYS[entry.severity])}
    </span>`;
    const message = diagnosticText(entry);
    const nodeId = entry.location?.nodeId;
    return html`
      <li>
        ${
          nodeId === undefined
            ? html`<span class="diagnostic-text">${severity} ${message}</span>`
            : html`
                <button
                  type="button"
                  class="diagnostic-entry"
                  data-node-id=${nodeId}
                  @click=${(): void => {
                    this.#revealDiagnosticNode(nodeId);
                  }}
                >
                  ${severity} ${message}
                </button>
              `
        }
      </li>
    `;
  }

  /** Textual drop-position readout shown while a canvas chip drag is active. */
  #renderDropIndicator(): TemplateResult | typeof nothing {
    const drag = this.#drag;
    if (drag?.active !== true) {
      return nothing;
    }
    return html`
      <p class="drop-indicator">
        ${this.#text('studio.shell/drag-drop-position', {
          count: String(drag.order.length),
          label: drag.label,
          position: String(drag.targetIndex + 1),
        })}
      </p>
    `;
  }

  /**
   * The editable inspector: contract facts, then keyboard-complete editors
   * for base properties, bindings, and active-viewport overrides. Tab order
   * follows the DOM order documented in docs/experience/keyboard.md. In
   * read-only sessions every control renders disabled and the hint line
   * states the reason textually.
   */
  #renderInspector(node: BlueprintNode): TemplateResult {
    const readOnly = this.#isReadOnly();
    return html`
      <dl>
        <div>
          <dt>${this.#text('studio.shell/inspector-identifier')}</dt>
          <dd>${node.id}</dd>
        </div>
        <div>
          <dt>${this.#text('studio.shell/inspector-type')}</dt>
          <dd>${node.type}@${node.version}</dd>
        </div>
      </dl>
      ${
        readOnly
          ? html`<p class="hint inspector-read-only">
              ${this.#text('studio.shell/inspector-read-only')}
            </p>`
          : html`<p class="hint">${this.#text('studio.shell/inspector-hint')}</p>`
      }
      ${this.#renderInspectorProperties(node, readOnly)}
      ${this.#renderInspectorBindings(node, readOnly)}
      ${this.#renderInspectorOverrides(node, readOnly)}
    `;
  }

  #renderInspectorBindings(node: BlueprintNode, readOnly: boolean): TemplateResult {
    const entries = Object.entries(node.bindings);
    return html`
      <section
        class="inspector-section inspector-bindings"
        aria-label=${this.#text('studio.shell/inspector-bindings-heading')}
      >
        <h3>${this.#text('studio.shell/inspector-bindings-heading')}</h3>
        ${
          entries.length === 0
            ? html`<p class="inspector-empty">
                ${this.#text('studio.shell/inspector-bindings-empty')}
              </p>`
            : html`
                <ul class="inspector-rows">
                  ${entries.map(
                    ([port, binding]) => html`
                      <li class="inspector-row">
                        <span class="inspector-name">${port}</span>
                        <code class="inspector-binding-value">${JSON.stringify(binding)}</code>
                        <button
                          type="button"
                          class="inspector-binding-remove"
                          data-port=${port}
                          aria-label=${this.#text('studio.shell/inspector-remove-binding-label', {
                            port,
                          })}
                          ?disabled=${readOnly}
                          @click=${(): void => {
                            this.#removeBinding(node, port);
                          }}
                        >
                          ${this.#text('studio.shell/inspector-remove-binding')}
                        </button>
                      </li>
                    `,
                  )}
                </ul>
              `
        }
        <div class="inspector-row inspector-set-binding-form">
          <input
            type="text"
            class="inspector-binding-port"
            aria-label=${this.#text('studio.shell/inspector-binding-port-label')}
            ?disabled=${readOnly}
          />
          <input
            type="text"
            class="inspector-binding-value-input"
            aria-label=${this.#text('studio.shell/inspector-binding-value-label')}
            ?disabled=${readOnly}
          />
          <button
            type="button"
            class="inspector-binding-set"
            ?disabled=${readOnly}
            @click=${(): void => {
              this.#setBinding(node);
            }}
          >
            ${this.#text('studio.shell/inspector-set-binding')}
          </button>
        </div>
      </section>
    `;
  }

  /**
   * The per-viewport override editor for the active viewport of the switcher.
   * Overrides dispatch the same set-property and unset-property commands as
   * base properties, carrying the viewport, and every announcement names the
   * viewport — the keyboard path that stands in for visual resize work.
   */
  #renderInspectorOverrides(
    node: BlueprintNode,
    readOnly: boolean,
  ): TemplateResult | typeof nothing {
    const viewport = this.activeViewport;
    if (viewport === undefined) {
      return nothing;
    }
    const viewportLabel = referenceText(viewport.label);
    const rows: [string, JsonValue][] = [];
    for (const [property, values] of Object.entries(node.responsive ?? {})) {
      const value = values[viewport.id];
      if (value !== undefined) {
        rows.push([property, value]);
      }
    }
    return html`
      <section
        class="inspector-section inspector-overrides"
        aria-label=${this.#text('studio.shell/inspector-overrides-heading', {
          viewport: viewportLabel,
        })}
      >
        <h3>
          ${this.#text('studio.shell/inspector-overrides-heading', { viewport: viewportLabel })}
        </h3>
        ${
          rows.length === 0
            ? html`<p class="inspector-empty">
                ${this.#text('studio.shell/inspector-overrides-empty', {
                  viewport: viewportLabel,
                })}
              </p>`
            : html`
                <ul class="inspector-rows">
                  ${rows.map(
                    ([property, value]) => html`
                      <li class="inspector-row">
                        <span class="inspector-name">${property}</span>
                        <input
                          type="text"
                          class="inspector-override-input"
                          data-property=${property}
                          aria-label=${this.#text('studio.shell/inspector-override-value-label', {
                            property,
                            viewport: viewportLabel,
                          })}
                          .value=${JSON.stringify(value)}
                          ?disabled=${readOnly}
                          @keydown=${(event: KeyboardEvent): void => {
                            this.#onInspectorValueKeydown(event, node, property, viewport);
                          }}
                        />
                        <button
                          type="button"
                          class="inspector-override-remove"
                          data-property=${property}
                          aria-label=${this.#text('studio.shell/inspector-remove-override-label', {
                            property,
                            viewport: viewportLabel,
                          })}
                          ?disabled=${readOnly}
                          @click=${(): void => {
                            this.#unsetNodeProperty(node, property, viewport);
                          }}
                        >
                          ${this.#text('studio.shell/inspector-remove-override')}
                        </button>
                      </li>
                    `,
                  )}
                </ul>
              `
        }
        <div class="inspector-row inspector-add-override-form">
          <input
            type="text"
            class="inspector-add-override-name"
            aria-label=${this.#text('studio.shell/inspector-add-override-name-label')}
            ?disabled=${readOnly}
          />
          <input
            type="text"
            class="inspector-add-override-value"
            aria-label=${this.#text('studio.shell/inspector-add-override-value-label')}
            ?disabled=${readOnly}
          />
          <button
            type="button"
            class="inspector-add-override-submit"
            ?disabled=${readOnly}
            @click=${(): void => {
              this.#addOverride(node, viewport);
            }}
          >
            ${this.#text('studio.shell/inspector-add-override')}
          </button>
        </div>
      </section>
    `;
  }

  #renderInspectorProperties(node: BlueprintNode, readOnly: boolean): TemplateResult {
    const entries = Object.entries(node.properties);
    return html`
      <section
        class="inspector-section inspector-properties"
        aria-label=${this.#text('studio.shell/inspector-properties')}
      >
        <h3>${this.#text('studio.shell/inspector-properties')}</h3>
        ${
          entries.length === 0
            ? html`<p class="inspector-empty">
                ${this.#text('studio.shell/inspector-properties-empty')}
              </p>`
            : html`
                <ul class="inspector-rows">
                  ${entries.map(
                    ([property, value]) => html`
                      <li class="inspector-row">
                        <span class="inspector-name">${property}</span>
                        <input
                          type="text"
                          class="inspector-property-input"
                          data-property=${property}
                          aria-label=${this.#text('studio.shell/inspector-property-value-label', {
                            property,
                          })}
                          .value=${JSON.stringify(value)}
                          ?disabled=${readOnly}
                          @keydown=${(event: KeyboardEvent): void => {
                            this.#onInspectorValueKeydown(event, node, property, undefined);
                          }}
                        />
                        <button
                          type="button"
                          class="inspector-property-unset"
                          data-property=${property}
                          aria-label=${this.#text('studio.shell/inspector-unset-label', {
                            property,
                          })}
                          ?disabled=${readOnly}
                          @click=${(): void => {
                            this.#unsetNodeProperty(node, property, undefined);
                          }}
                        >
                          ${this.#text('studio.shell/inspector-unset')}
                        </button>
                      </li>
                    `,
                  )}
                </ul>
              `
        }
        <div class="inspector-row inspector-add-property-form">
          <input
            type="text"
            class="inspector-add-property-name"
            aria-label=${this.#text('studio.shell/inspector-add-property-name-label')}
            ?disabled=${readOnly}
          />
          <input
            type="text"
            class="inspector-add-property-value"
            aria-label=${this.#text('studio.shell/inspector-add-property-value-label')}
            ?disabled=${readOnly}
          />
          <button
            type="button"
            class="inspector-add-property-submit"
            ?disabled=${readOnly}
            @click=${(): void => {
              this.#addProperty(node);
            }}
          >
            ${this.#text('studio.shell/inspector-add-property')}
          </button>
        </div>
      </section>
    `;
  }

  #renderOutlineControls(node: BlueprintNode): TemplateResult {
    const location =
      this.document === undefined ? undefined : findOutlineLocation(this.document.roots, node.id);
    const readOnly = this.#isReadOnly();
    const first = location === undefined || location.index === 0;
    const last = location === undefined || location.index === location.collection.length - 1;
    return html`
      <div
        class="outline-controls"
        role="group"
        aria-label=${this.#text('studio.shell/block-actions')}
      >
        <button
          type="button"
          class="outline-move-up"
          ?disabled=${readOnly || first}
          @click=${(): void => {
            this.#moveNode(node, -1);
          }}
        >
          ${this.#text('studio.shell/move-up')}
        </button>
        <button
          type="button"
          class="outline-move-down"
          ?disabled=${readOnly || last}
          @click=${(): void => {
            this.#moveNode(node, 1);
          }}
        >
          ${this.#text('studio.shell/move-down')}
        </button>
        <button
          type="button"
          class="outline-duplicate"
          ?disabled=${readOnly}
          @click=${(): void => {
            this.#duplicateNode(node);
          }}
        >
          ${this.#text('studio.shell/duplicate')}
        </button>
        <button
          type="button"
          class="outline-delete"
          ?disabled=${readOnly}
          @click=${(): void => {
            this.#deleteNode(node);
          }}
        >
          ${this.#text('studio.shell/delete')}
        </button>
      </div>
    `;
  }

  #renderOutlineNode(node: BlueprintNode): TemplateResult {
    const definition = this.#findDefinition(node);
    const selected = this.selectedNodeId === node.id;
    const nested = Object.entries(node.slots);
    return html`
      <li>
        <button
          type="button"
          class="outline-entry"
          data-node-id=${node.id}
          aria-pressed=${selected ? 'true' : 'false'}
          @click=${(): void => {
            this.#selectNode(node.id);
          }}
          @keydown=${(event: KeyboardEvent): void => {
            this.#onOutlineKeydown(event, node);
          }}
        >
          ${
            definition === undefined
              ? html`${node.type}
                  <span class="unresolved">${this.#text('studio.shell/unresolved-block')}</span>`
              : referenceText(definition.label)
          }
        </button>
        ${selected ? this.#renderOutlineControls(node) : nothing}
        ${nested.map(([slot, children]) =>
          children.length === 0
            ? nothing
            : html`
                <section class="node-children" aria-label=${slot}>
                  <ul class="tree">
                    ${children.map((child) => this.#renderOutlineNode(child))}
                  </ul>
                </section>
              `,
        )}
      </li>
    `;
  }

  #renderViewportSwitcher(): TemplateResult | typeof nothing {
    const ordered = this.#orderedViewports();
    if (ordered.length === 0) {
      return nothing;
    }
    const active = this.activeViewport;
    return html`
      <section class="viewport-switcher" aria-label=${this.#text('studio.shell/viewport-label')}>
        ${ordered.map(
          (viewport) => html`
            <button
              type="button"
              class="viewport-option"
              data-viewport-id=${viewport.id}
              aria-pressed=${active?.id === viewport.id ? 'true' : 'false'}
              @click=${(): void => {
                this.#selectViewport(viewport);
              }}
            >
              ${referenceText(viewport.label)}
            </button>
          `,
        )}
      </section>
    `;
  }

  #requestInsert(definition: BlockDefinition): void {
    this.dispatchEvent(
      new CustomEvent<StudioInsertRequestDetail>('studio-insert-request', {
        bubbles: true,
        composed: true,
        detail: { definition, parentId: null },
      }),
    );
  }

  /**
   * Maps a pointer position onto a target position within the dragged node's
   * own collection. Chips with measurable geometry are hit-tested by their
   * vertical extent; environments without layout (such as the test DOM) fall
   * back to the event's composed path. Only the source collection's chips are
   * considered — cross-slot reparenting is out of scope for pointer drag.
   */
  #resolveDragIndex(event: PointerEvent, drag: CanvasDragState): number | undefined {
    const chips = [
      ...(this.shadowRoot?.querySelectorAll<HTMLButtonElement>('button.canvas-chip') ?? []),
    ].filter((chip) => {
      const nodeId = chip.dataset.nodeId;
      return nodeId !== undefined && drag.order.includes(nodeId);
    });
    let nearestIndex: number | undefined;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const chip of chips) {
      const rect = chip.getBoundingClientRect();
      if (rect.height <= 0) {
        continue;
      }
      const nodeId = chip.dataset.nodeId;
      if (nodeId === undefined) {
        continue;
      }
      if (event.clientY >= rect.top && event.clientY <= rect.bottom) {
        return drag.order.indexOf(nodeId);
      }
      const distance = Math.abs(event.clientY - (rect.top + rect.height / 2));
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = drag.order.indexOf(nodeId);
      }
    }
    if (nearestIndex !== undefined) {
      return nearestIndex;
    }
    for (const hop of event.composedPath()) {
      if (hop instanceof HTMLElement) {
        const nodeId = hop.dataset.nodeId;
        if (nodeId !== undefined && drag.order.includes(nodeId)) {
          return drag.order.indexOf(nodeId);
        }
      }
    }
    return undefined;
  }

  #revalidate(): void {
    if (this.document === undefined) {
      this.#diagnostics = [];
      return;
    }
    const registry = this.#registry ?? new BlockRegistry();
    const result = validateBlueprint(this.document, registry);
    this.#diagnostics = [...result.diagnostics].sort(
      (left, right) => SEVERITY_RANK[left.severity] - SEVERITY_RANK[right.severity],
    );
  }

  #revealDiagnosticNode(nodeId: NodeId): void {
    this.#selectNode(nodeId);
    this.#pendingFocusNodeId = nodeId;
    this.requestUpdate();
  }

  #runPaletteEntry(entry: CommandPaletteEntry): void {
    if (entry.disabled) {
      return;
    }
    const invoker = this.#paletteInvoker;
    this.#closePalette(false);
    entry.run();
    if (this.#pendingFocusNodeId === undefined && invoker?.isConnected === true) {
      invoker.focus();
    }
  }

  #runShellCommand(command: BlueprintCommand): boolean {
    try {
      this.execute(command);
      return true;
    } catch {
      // execute() has already announced the failure through the live region.
      return false;
    }
  }

  #selectNode(nodeId: NodeId): void {
    const session = this.#session;
    if (session === undefined) {
      return;
    }
    try {
      session.select([nodeId]);
    } catch {
      return;
    }
    this.selectedNodeId = nodeId;
  }

  #selectViewport(viewport: ThemeViewport): void {
    if (this.activeViewport?.id === viewport.id) {
      return;
    }
    this.#activeViewportId = viewport.id;
    this.dispatchEvent(
      new CustomEvent<StudioViewportChangeDetail>('studio-viewport-change', {
        bubbles: true,
        composed: true,
        detail: { viewport },
      }),
    );
    this.#announce('studio.shell/announce-viewport-changed', {
      label: referenceText(viewport.label),
    });
    this.requestUpdate();
  }

  #serializedInspectorValue(
    node: BlueprintNode,
    property: string,
    viewport: ThemeViewport | undefined,
  ): string {
    const value =
      viewport === undefined
        ? node.properties[property]
        : node.responsive?.[property]?.[viewport.id];
    return value === undefined ? '' : JSON.stringify(value);
  }

  #setBinding(node: BlueprintNode): void {
    const session = this.#session;
    const document = this.document;
    const portInput =
      this.shadowRoot?.querySelector<HTMLInputElement>('input.inspector-binding-port') ?? null;
    const valueInput =
      this.shadowRoot?.querySelector<HTMLInputElement>('input.inspector-binding-value-input') ??
      null;
    if (
      session === undefined ||
      document === undefined ||
      this.#isReadOnly() ||
      portInput === null ||
      valueInput === null
    ) {
      return;
    }
    const port = portInput.value.trim();
    if (port.length === 0) {
      this.#announce('studio.shell/announce-name-required');
      return;
    }
    const parsed = this.#parseJsonInput(valueInput.value, port);
    if (parsed === undefined) {
      return;
    }
    const value = parsed.value;
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      this.#announce('studio.shell/announce-invalid-value', { label: port });
      return;
    }
    const command: SetBindingCommand = {
      ...this.#commandEnvelope(document, session),
      payload: { binding: value as unknown as FieldBinding, nodeId: node.id, port },
      type: 'studio.command/set-binding',
    };
    if (this.#runShellCommand(command)) {
      portInput.value = '';
      valueInput.value = '';
      this.#announce('studio.shell/announce-binding-set', { port });
    }
  }

  /**
   * Dispatches set-property for a base value or, with a viewport, for a
   * responsive override, and announces the outcome — naming the viewport for
   * overrides. Returns whether the command applied.
   */
  #setNodeProperty(
    node: BlueprintNode,
    property: string,
    value: JsonValue,
    viewport: ThemeViewport | undefined,
  ): boolean {
    const session = this.#session;
    const document = this.document;
    if (session === undefined || document === undefined || this.#isReadOnly()) {
      return false;
    }
    const payload: SetPropertyPayload = { nodeId: node.id, property, value };
    if (viewport !== undefined) {
      payload.viewport = viewport.id;
    }
    const command: SetPropertyCommand = {
      ...this.#commandEnvelope(document, session),
      payload,
      type: 'studio.command/set-property',
    };
    if (!this.#runShellCommand(command)) {
      return false;
    }
    if (viewport === undefined) {
      this.#announce('studio.shell/announce-property-set', { property });
    } else {
      this.#announce('studio.shell/announce-override-set', {
        property,
        viewport: referenceText(viewport.label),
      });
    }
    return true;
  }

  #syncDirty(): void {
    const dirty = this.#session?.dirty ?? false;
    if (dirty === this.#lastDirty) {
      return;
    }
    this.#lastDirty = dirty;
    this.dispatchEvent(
      new CustomEvent<StudioDirtyChangedDetail>('studio-dirty-changed', {
        bubbles: true,
        composed: true,
        detail: { dirty },
      }),
    );
  }

  #text(key: StudioMessageKey, parameters?: Readonly<Record<string, string>>): string {
    return messageText(key, this.messages, parameters);
  }

  #togglePalette(event?: Event): void {
    if (this.paletteOpen === true) {
      this.#closePalette(true);
      return;
    }
    const origin = event?.composedPath()[0];
    this.#paletteInvoker = origin instanceof HTMLElement ? origin : undefined;
    this.paletteOpen = true;
    this.paletteFilter = '';
    this.#pendingPaletteFocus = true;
  }

  #unsetNodeProperty(
    node: BlueprintNode,
    property: string,
    viewport: ThemeViewport | undefined,
  ): void {
    const session = this.#session;
    const document = this.document;
    if (session === undefined || document === undefined || this.#isReadOnly()) {
      return;
    }
    const payload: UnsetPropertyPayload = { nodeId: node.id, property };
    if (viewport !== undefined) {
      payload.viewport = viewport.id;
    }
    const command: UnsetPropertyCommand = {
      ...this.#commandEnvelope(document, session),
      payload,
      type: 'studio.command/unset-property',
    };
    if (!this.#runShellCommand(command)) {
      return;
    }
    if (viewport === undefined) {
      this.#announce('studio.shell/announce-property-unset', { property });
    } else {
      this.#announce('studio.shell/announce-override-removed', {
        property,
        viewport: referenceText(viewport.label),
      });
    }
  }
}

/**
 * Session-level rejections meaning the document/session pairing is stale or
 * non-writable rather than the command being malformed. They surface through
 * the conflict announcement, which carries recovery guidance.
 */
const CONFLICT_ERROR_CODES: ReadonlySet<StudioCommandErrorCode> = new Set([
  'read-only-session',
  'stale-generation',
  'stale-state',
]);

const SEVERITY_MESSAGE_KEYS: Record<StudioDiagnostic['severity'], StudioMessageKey> = {
  blocking: 'studio.shell/severity-blocking',
  error: 'studio.shell/severity-error',
  information: 'studio.shell/severity-information',
  warning: 'studio.shell/severity-warning',
};

const SEVERITY_RANK: Record<StudioDiagnostic['severity'], number> = {
  blocking: 0,
  error: 1,
  information: 3,
  warning: 2,
};

function diagnosticText(entry: StudioDiagnostic): string {
  const template = referenceText(entry.message);
  if (entry.parameters === undefined) {
    return template;
  }
  let text = template;
  for (const [name, value] of Object.entries(entry.parameters)) {
    text = text.replaceAll(`{${name}}`, String(value));
  }
  return text;
}

function referenceText(reference: MessageReference): string {
  return reference.defaultMessage ?? reference.key;
}
