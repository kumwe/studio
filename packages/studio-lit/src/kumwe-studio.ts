import {
  css,
  html,
  LitElement,
  type CSSResult,
  type PropertyValues,
  type TemplateResult,
} from 'lit';
import { StudioHistory } from '@kumwe/studio-core';
import type {
  BlockDefinition,
  BlueprintCommand,
  BlueprintDocument,
  BlueprintNode,
  ExperimentalShellConfiguration,
  MessageReference,
} from '@kumwe/studio-protocol';

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

export class KumweStudioElement extends LitElement {
  public static override properties = {
    configuration: { attribute: false },
    document: { attribute: false },
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
      grid-template-columns: minmax(12rem, 15rem) minmax(20rem, 1fr) minmax(14rem, 18rem);
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
        grid-template-columns: 12rem minmax(18rem, 1fr);
      }

      .inspector {
        grid-column: 1 / -1;
      }
    }
  `;

  declare public configuration: ExperimentalShellConfiguration | undefined;
  declare public document: BlueprintDocument | undefined;
  declare protected selectedNodeId: string | undefined;

  #history: StudioHistory | undefined;
  #internalDocumentUpdate = false;

  public execute(command: BlueprintCommand): BlueprintDocument {
    if (this.configuration?.session.sessionState === 'read-only') {
      throw new Error('The current Studio session is read-only.');
    }
    if (this.#history === undefined) {
      throw new Error('Load a blueprint document before executing a command.');
    }
    const next = this.#history.execute(command);
    this.#assignInternalDocument(next);
    this.#emitDocumentChange({ command, document: next, source: 'command' });
    return next;
  }

  public redo(): BlueprintDocument | undefined {
    if (
      this.configuration?.session.sessionState === 'read-only' ||
      this.#history?.canRedo !== true
    ) {
      return this.document;
    }
    const next = this.#history.redo();
    this.#assignInternalDocument(next);
    this.#emitDocumentChange({ command: null, document: next, source: 'redo' });
    return next;
  }

  public undo(): BlueprintDocument | undefined {
    if (
      this.configuration?.session.sessionState === 'read-only' ||
      this.#history?.canUndo !== true
    ) {
      return this.document;
    }
    const next = this.#history.undo();
    this.#assignInternalDocument(next);
    this.#emitDocumentChange({ command: null, document: next, source: 'undo' });
    return next;
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('document')) {
      if (this.#internalDocumentUpdate) {
        this.#internalDocumentUpdate = false;
      } else {
        this.#history = this.document === undefined ? undefined : new StudioHistory(this.document);
      }
    }
  }

  protected override render(): TemplateResult {
    const selected =
      this.document === undefined || this.selectedNodeId === undefined
        ? undefined
        : findNode(this.document.roots, this.selectedNodeId);

    return html`
      <div class="workspace">
        <aside class="panel" aria-label="Block palette">
          <h2>Blocks</h2>
          <ul class="palette">
            ${(this.configuration?.blockDefinitions ?? []).map(
              (definition) => html`
                <li>
                  <button
                    type="button"
                    ?disabled=${this.configuration?.session.sessionState === 'read-only'}
                    @click=${(): void => this.#requestInsert(definition)}
                  >
                    ${messageText(definition.label)}
                  </button>
                </li>
              `,
            )}
          </ul>
        </aside>

        <main class="canvas" aria-label="Blueprint structure">
          <div class="toolbar" aria-label="History">
            <button
              type="button"
              ?disabled=${
                this.#history?.canUndo !== true ||
                this.configuration?.session.sessionState === 'read-only'
              }
              @click=${(): void => {
                this.undo();
              }}
            >
              Undo
            </button>
            <button
              type="button"
              ?disabled=${
                this.#history?.canRedo !== true ||
                this.configuration?.session.sessionState === 'read-only'
              }
              @click=${(): void => {
                this.redo();
              }}
            >
              Redo
            </button>
          </div>
          ${
            this.document?.roots.length === 0 || this.document === undefined
              ? html`<p class="empty">Choose a block to begin composing.</p>`
              : html`<ul class="tree">
                  ${this.document.roots.map((node) => this.#renderNode(node))}
                </ul>`
          }
        </main>

        <aside class="panel inspector" aria-label="Inspector">
          <h2>Inspector</h2>
          ${
            selected === undefined
              ? html`<p>Select a block to inspect its contract.</p>`
              : html`
                  <dl>
                    <div>
                      <dt>Identifier</dt>
                      <dd>${selected.id}</dd>
                    </div>
                    <div>
                      <dt>Type</dt>
                      <dd>${selected.type}@${selected.version}</dd>
                    </div>
                    <div>
                      <dt>Properties</dt>
                      <dd>${JSON.stringify(selected.properties)}</dd>
                    </div>
                  </dl>
                `
          }
        </aside>
      </div>
    `;
  }

  #assignInternalDocument(document: BlueprintDocument): void {
    this.#internalDocumentUpdate = true;
    this.document = document;
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

  #renderNode(node: BlueprintNode): TemplateResult {
    const definition = this.configuration?.blockDefinitions.find(
      (candidate) => candidate.type === node.type && candidate.version === node.version,
    );
    const nested = Object.entries(node.slots);
    return html`
      <li>
        <button
          type="button"
          aria-pressed=${this.selectedNodeId === node.id ? 'true' : 'false'}
          @click=${(): void => {
            this.selectedNodeId = node.id;
          }}
        >
          ${definition === undefined ? node.type : messageText(definition.label)}
        </button>
        ${nested.map(
          ([slot, children]) => html`
            <section class="node-children" aria-label=${slot}>
              <ul class="tree">
                ${children.map((child) => this.#renderNode(child))}
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
}

function findNode(nodes: readonly BlueprintNode[], nodeId: string): BlueprintNode | undefined {
  for (const node of nodes) {
    if (node.id === nodeId) {
      return node;
    }
    for (const children of Object.values(node.slots)) {
      const found = findNode(children, nodeId);
      if (found !== undefined) {
        return found;
      }
    }
  }
  return undefined;
}

function messageText(reference: MessageReference): string {
  return reference.defaultMessage ?? reference.key;
}
