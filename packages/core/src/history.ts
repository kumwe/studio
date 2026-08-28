import type { BlueprintCommand, BlueprintDocument, Revision } from '@kumwe/studio-protocol';
import { applyCommand, StudioCommandError } from './commands.js';
import { cloneContractValue } from './clone.js';
import {
  assertBlueprintCommandPolicy,
  type ResolvedStudioSessionPolicy,
} from './session-policy.js';

export class StudioHistory {
  readonly #maximumEntries: number;
  readonly #policy: Readonly<ResolvedStudioSessionPolicy> | undefined;
  #current: BlueprintDocument;
  #future: BlueprintDocument[] = [];
  #past: BlueprintDocument[] = [];
  #stateVersion = 0;

  public constructor(
    document: BlueprintDocument,
    maximumEntries = 100,
    policy?: Readonly<ResolvedStudioSessionPolicy>,
  ) {
    if (!Number.isInteger(maximumEntries) || maximumEntries < 1) {
      throw new RangeError('History maximum must be a positive integer.');
    }
    this.#current = cloneContractValue(document);
    this.#maximumEntries = maximumEntries;
    this.#policy = policy;
  }

  public get canRedo(): boolean {
    return this.#future.length > 0;
  }

  public get canUndo(): boolean {
    return this.#past.length > 0;
  }

  public get current(): BlueprintDocument {
    return cloneContractValue(this.#current);
  }

  public get stateVersion(): number {
    return this.#stateVersion;
  }

  /**
   * Advances the host-authored revision carried by every local snapshot.
   *
   * A successful optimistic save establishes one new base revision for the
   * complete local timeline. Rebasing the current, past, and future snapshots
   * keeps later commands and preview staging on that base without fabricating
   * an edit, changing the history topology, or advancing `stateVersion`.
   */
  public rebaseRevision(revision: Revision): BlueprintDocument {
    const rebase = (document: BlueprintDocument): BlueprintDocument => ({
      ...document,
      revision,
    });
    this.#current = rebase(this.#current);
    this.#past = this.#past.map(rebase);
    this.#future = this.#future.map(rebase);
    return this.current;
  }

  public execute(command: BlueprintCommand): BlueprintDocument {
    if (command.baseStateVersion !== this.#stateVersion) {
      throw new StudioCommandError(
        'stale-state',
        `Command state ${command.baseStateVersion} does not match ${this.#stateVersion}.`,
      );
    }
    const next = applyCommand(this.#current, command);
    if (this.#policy !== undefined) {
      assertBlueprintCommandPolicy(this.#current, command, next, this.#policy);
    }
    this.#past.push(this.#current);
    if (this.#past.length > this.#maximumEntries) {
      this.#past.shift();
    }
    this.#current = next;
    this.#future = [];
    this.#stateVersion += 1;
    return this.current;
  }

  public redo(): BlueprintDocument {
    const next = this.#future.pop();
    if (next === undefined) {
      return this.current;
    }
    this.#past.push(this.#current);
    this.#current = next;
    this.#stateVersion += 1;
    return this.current;
  }

  public undo(): BlueprintDocument {
    const previous = this.#past.pop();
    if (previous === undefined) {
      return this.current;
    }
    this.#future.push(this.#current);
    this.#current = previous;
    this.#stateVersion += 1;
    return this.current;
  }
}
