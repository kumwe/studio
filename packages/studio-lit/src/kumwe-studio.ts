import {
  css,
  html,
  LitElement,
  nothing,
  type CSSResult,
  type PropertyValues,
  type TemplateResult,
} from 'lit';
import { StudioSession, type StudioSessionOptions } from '@kumwe/studio-core';
import type {
  BlockDefinition,
  BlueprintCommand,
  BlueprintDocument,
  BlueprintNode,
  DuplicateNodeCommand,
  ExperimentalShellConfiguration,
  MessageReference,
  NodeId,
  RemoveNodeCommand,
  ReorderChildrenCommand,
  ReorderChildrenPayload,
  Revision,
  StudioContractVersion,
} from '@kumwe/studio-protocol';
import { messageText, type StudioMessageKey, type StudioMessageOverrides } from './messages.js';
import { allocateDuplicateIdMap, findOutlineLocation } from './outline.js';

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

interface ShellCommandEnvelope {
  artifactId: string;
  baseStateVersion: number;
  contractVersion: StudioContractVersion;
  id: string;
  kind: 'command';
  sessionGeneration: Revision;
}

export class KumweStudioElement extends LitElement {
  public static override properties = {
    announcement: { attribute: false, state: true },
    configuration: { attribute: false },
    document: { attribute: false },
    messages: { attribute: false },
    selectedNodeId: { attribute: false, state: true },
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

    @media (max-width: 60rem) {
      .workspace {
        grid-template-columns: minmax(16rem, 1fr);
      }
    }
  `;

  declare public configuration: ExperimentalShellConfiguration | undefined;
  declare public document: BlueprintDocument | undefined;
  declare public messages: StudioMessageOverrides | undefined;
  declare protected announcement: string | undefined;
  declare protected selectedNodeId: string | undefined;

  #commandSequence = 0;
  #internalDocumentUpdate = false;
  #lastDirty = false;
  #pendingFocusNodeId: NodeId | undefined;
  #session: StudioSession | undefined;
  #sessionGeneration: Revision = '';

  public get stateVersion(): number {
    return this.#session?.stateVersion ?? 0;
  }

  public execute(command: BlueprintCommand): BlueprintDocument {
    if (this.configuration?.session.sessionState === 'read-only') {
      throw new Error('The current Studio session is read-only.');
    }
    const session = this.#session;
    if (session === undefined) {
      throw new Error('Load a blueprint document before executing a command.');
    }
    let next: BlueprintDocument;
    try {
      next = session.execute(command);
    } catch (error) {
      this.#announce('studio.shell/announce-command-failed', {
        message: error instanceof Error ? error.message : String(error),
      });
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
    if (changed.has('document') || changed.has('configuration')) {
      if (this.#internalDocumentUpdate) {
        this.#internalDocumentUpdate = false;
      } else {
        this.#rebuildSession();
      }
    }
  }

  protected override updated(): void {
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
      <div class="workspace">
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

        <main class="canvas" aria-label=${this.#text('studio.shell/canvas-label')}>
          <div class="toolbar" aria-label=${this.#text('studio.shell/history-label')}>
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
              : html`
                  <dl>
                    <div>
                      <dt>${this.#text('studio.shell/inspector-identifier')}</dt>
                      <dd>${selected.id}</dd>
                    </div>
                    <div>
                      <dt>${this.#text('studio.shell/inspector-type')}</dt>
                      <dd>${selected.type}@${selected.version}</dd>
                    </div>
                    <div>
                      <dt>${this.#text('studio.shell/inspector-properties')}</dt>
                      <dd>${JSON.stringify(selected.properties)}</dd>
                    </div>
                  </dl>
                `
          }
        </aside>

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

  #announce(key: StudioMessageKey, parameters?: Readonly<Record<string, string>>): void {
    this.announcement = messageText(key, this.messages, parameters);
  }

  #assignInternalDocument(document: BlueprintDocument): void {
    this.#internalDocumentUpdate = true;
    this.document = document;
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
    this.selectedNodeId = undefined;
    this.#syncDirty();
  }

  #renderCanvasNode(node: BlueprintNode): TemplateResult {
    const definition = this.#findDefinition(node);
    const nested = Object.entries(node.slots);
    return html`
      <li>
        <button
          type="button"
          aria-pressed=${this.selectedNodeId === node.id ? 'true' : 'false'}
          @click=${(): void => {
            this.#selectNode(node.id);
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

  #requestInsert(definition: BlockDefinition): void {
    this.dispatchEvent(
      new CustomEvent<StudioInsertRequestDetail>('studio-insert-request', {
        bubbles: true,
        composed: true,
        detail: { definition, parentId: null },
      }),
    );
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
}

function referenceText(reference: MessageReference): string {
  return reference.defaultMessage ?? reference.key;
}
