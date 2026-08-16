import type {
  AddModelFieldCommand,
  BlueprintCommand,
  BlueprintDocument,
  BlueprintNode,
  ContentModelDocument,
  EntryDocument,
  NodeId,
  Revision,
  SetFieldValueCommand,
  StudioSessionMode,
} from '@kumwe/studio-protocol';
import { StudioCommandError } from './commands.js';
import { applyEntryCommand } from './entry-commands.js';
import { StudioHistory } from './history.js';
import { applyModelCommand } from './model-commands.js';
import { assertHybridCommandInBounds, assertModePermitsCommandType } from './modes.js';

export interface StudioSessionOptions {
  document: BlueprintDocument;
  maximumHistoryEntries?: number;
  /**
   * The session mode fixed for the session's lifetime. When omitted it is
   * derived from `sessionState` for backward compatibility: `read-only`
   * stays `read-only` and `editable` opens the full-structure `blueprint`
   * mode the session historically provided.
   */
  mode?: StudioSessionMode;
  sessionGeneration: Revision;
  /**
   * The legacy spelling of the read-only axis. Mode `read-only` is the
   * canonical spelling of this flag; when both members are present they
   * must agree.
   */
  sessionState?: 'editable' | 'read-only';
}

/**
 * A deterministic editing session over one Blueprint document: bounded
 * history, an explicit selection model, and the session-level guards the
 * command contract requires before any reducer runs. Session generation,
 * mode permission, read-only state, and expected-revision checks fail
 * closed; a rejected command changes neither the document, the history, nor
 * the selection. The session mode is fixed at creation and decides the
 * permitted command set through one deterministic table
 * (`permittedCommandTypes`); hybrid mode additionally bounds structure
 * commands to slots governed by structural authoring regions.
 */
export class StudioSession {
  readonly #history: StudioHistory;
  readonly #mode: StudioSessionMode;
  readonly #sessionGeneration: Revision;
  #savedRevision: Revision;
  #savedStateVersion = 0;
  #selection: NodeId[] = [];

  public constructor(options: Readonly<StudioSessionOptions>) {
    this.#history = new StudioHistory(options.document, options.maximumHistoryEntries ?? 100);
    this.#mode = resolveModeOption(options);
    this.#sessionGeneration = options.sessionGeneration;
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

  /** The session mode fixed at creation. */
  public get mode(): StudioSessionMode {
    return this.#mode;
  }

  public get selection(): readonly NodeId[] {
    return [...this.#selection];
  }

  /** The legacy read-only projection of the session mode. */
  public get sessionState(): 'editable' | 'read-only' {
    return this.#mode === 'read-only' ? 'read-only' : 'editable';
  }

  public get stateVersion(): number {
    return this.#history.stateVersion;
  }

  public execute(command: BlueprintCommand): BlueprintDocument {
    this.#assertWritable();
    this.#assertLiveGeneration(command);
    assertModePermitsCommandType(this.#mode, command.type);
    if (this.#mode === 'hybrid') {
      assertHybridCommandInBounds(this.#history.current, command);
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

  /**
   * Applies one entry field command behind the same session guards as
   * `execute`, so no UI dispatch path bypasses the mode boundary. Entry
   * state stays host-owned: the result is returned, not recorded in the
   * Blueprint history, and the selection is untouched.
   */
  public executeEntryCommand(entry: EntryDocument, command: SetFieldValueCommand): EntryDocument {
    this.#assertWritable();
    this.#assertLiveGeneration(command);
    assertModePermitsCommandType(this.#mode, command.type);
    if (command.expectedRevision !== undefined && command.expectedRevision !== entry.revision) {
      throw new StudioCommandError(
        'stale-state',
        `Command expects revision ${command.expectedRevision}, but the entry holds ${entry.revision}.`,
      );
    }
    return applyEntryCommand(entry, command);
  }

  /**
   * Applies one content-model command behind the same session guards as
   * `execute`, so no UI dispatch path bypasses the mode boundary. Model
   * state stays host-owned: the result is returned, not recorded in the
   * Blueprint history, and the selection is untouched.
   */
  public executeModelCommand(
    model: ContentModelDocument,
    command: AddModelFieldCommand,
  ): ContentModelDocument {
    this.#assertWritable();
    this.#assertLiveGeneration(command);
    assertModePermitsCommandType(this.#mode, command.type);
    if (command.expectedRevision !== undefined && command.expectedRevision !== model.revision) {
      throw new StudioCommandError(
        'stale-state',
        `Command expects revision ${command.expectedRevision}, but the model holds ${model.revision}.`,
      );
    }
    return applyModelCommand(model, command);
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

  #assertWritable(): void {
    if (this.#mode === 'read-only') {
      throw new StudioCommandError(
        'read-only-session',
        'A read-only session never applies a persistent command.',
      );
    }
  }

  #assertLiveGeneration(command: { readonly sessionGeneration: Revision }): void {
    if (command.sessionGeneration !== this.#sessionGeneration) {
      throw new StudioCommandError(
        'stale-generation',
        `Command generation ${command.sessionGeneration} does not match the active session generation.`,
      );
    }
  }

  #pruneSelection(document: BlueprintDocument): void {
    if (this.#selection.length > 0) {
      this.#selection = this.#selection.filter((nodeId) => containsNode(document.roots, nodeId));
    }
  }
}

function resolveModeOption(options: Readonly<StudioSessionOptions>): StudioSessionMode {
  const { mode, sessionState } = options;
  if (mode === undefined) {
    if (sessionState === undefined) {
      throw new RangeError('A session requires an explicit mode or session state.');
    }
    return sessionState === 'read-only' ? 'read-only' : 'blueprint';
  }
  if (sessionState !== undefined && (sessionState === 'read-only') !== (mode === 'read-only')) {
    throw new RangeError(
      `Session mode ${mode} contradicts session state ${sessionState}; mode read-only is the read-only state.`,
    );
  }
  return mode;
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
