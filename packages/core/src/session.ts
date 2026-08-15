import type {
  BlueprintCommand,
  BlueprintDocument,
  BlueprintNode,
  NodeId,
  Revision,
} from '@kumwe/studio-protocol';
import { StudioCommandError } from './commands.js';
import { StudioHistory } from './history.js';

export interface StudioSessionOptions {
  document: BlueprintDocument;
  maximumHistoryEntries?: number;
  sessionGeneration: Revision;
  sessionState: 'editable' | 'read-only';
}

/**
 * A deterministic editing session over one Blueprint document: bounded
 * history, an explicit selection model, and the session-level guards the
 * command contract requires before any reducer runs. Session generation,
 * read-only state, and expected-revision checks fail closed; a rejected
 * command changes neither the document nor the selection.
 */
export class StudioSession {
  readonly #history: StudioHistory;
  readonly #sessionGeneration: Revision;
  readonly #sessionState: 'editable' | 'read-only';
  #savedRevision: Revision;
  #savedStateVersion = 0;
  #selection: NodeId[] = [];

  public constructor(options: Readonly<StudioSessionOptions>) {
    this.#history = new StudioHistory(options.document, options.maximumHistoryEntries ?? 100);
    this.#sessionGeneration = options.sessionGeneration;
    this.#sessionState = options.sessionState;
    this.#savedRevision = options.document.revision;
  }

  public get canRedo(): boolean {
    return this.#history.canRedo;
  }

  public get canUndo(): boolean {
    return this.#history.canUndo;
  }

  public get dirty(): boolean {
    return this.#history.stateVersion !== this.#savedStateVersion;
  }

  public get document(): BlueprintDocument {
    return this.#history.current;
  }

  public get selection(): readonly NodeId[] {
    return [...this.#selection];
  }

  public get sessionState(): 'editable' | 'read-only' {
    return this.#sessionState;
  }

  public get stateVersion(): number {
    return this.#history.stateVersion;
  }

  public execute(command: BlueprintCommand): BlueprintDocument {
    if (this.#sessionState === 'read-only') {
      throw new StudioCommandError(
        'read-only-session',
        'A read-only session never applies a persistent command.',
      );
    }
    if (command.sessionGeneration !== this.#sessionGeneration) {
      throw new StudioCommandError(
        'stale-generation',
        `Command generation ${command.sessionGeneration} does not match the active session generation.`,
      );
    }
    if (
      command.expectedRevision !== undefined &&
      command.expectedRevision !== this.#savedRevision
    ) {
      throw new StudioCommandError(
        'stale-state',
        `Command expects revision ${command.expectedRevision}, but the session holds ${this.#savedRevision}.`,
      );
    }
    const next = this.#history.execute(command);
    this.#pruneSelection(next);
    return next;
  }

  public markSaved(revision: Revision): void {
    this.#savedRevision = revision;
    this.#savedStateVersion = this.#history.stateVersion;
  }

  public get savedRevision(): Revision {
    return this.#savedRevision;
  }

  public select(nodeIds: readonly NodeId[]): readonly NodeId[] {
    const document = this.#history.current;
    const unique: NodeId[] = [];
    for (const nodeId of nodeIds) {
      if (unique.includes(nodeId)) {
        continue;
      }
      if (!containsNode(document.roots, nodeId)) {
        throw new StudioCommandError(
          'node-not-found',
          `Node ${nodeId} cannot be selected because it is not in the document.`,
        );
      }
      unique.push(nodeId);
    }
    this.#selection = unique;
    return this.selection;
  }

  public clearSelection(): void {
    this.#selection = [];
  }

  public undo(): BlueprintDocument {
    const document = this.#history.undo();
    this.#pruneSelection(document);
    return document;
  }

  public redo(): BlueprintDocument {
    const document = this.#history.redo();
    this.#pruneSelection(document);
    return document;
  }

  #pruneSelection(document: BlueprintDocument): void {
    if (this.#selection.length > 0) {
      this.#selection = this.#selection.filter((nodeId) => containsNode(document.roots, nodeId));
    }
  }
}

function containsNode(nodes: readonly BlueprintNode[], nodeId: NodeId): boolean {
  for (const node of nodes) {
    if (node.id === nodeId) {
      return true;
    }
    for (const children of Object.values(node.slots)) {
      if (containsNode(children, nodeId)) {
        return true;
      }
    }
  }
  return false;
}
