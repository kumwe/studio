import type { BlueprintCommand, BlueprintDocument } from '@kumwe/studio-protocol';
import { applyCommand, StudioCommandError } from './commands.js';
import { cloneContractValue } from './clone.js';

export class StudioHistory {
  readonly #maximumEntries: number;
  #current: BlueprintDocument;
  #future: BlueprintDocument[] = [];
  #past: BlueprintDocument[] = [];
  #stateVersion = 0;

  public constructor(document: BlueprintDocument, maximumEntries = 100) {
    if (!Number.isInteger(maximumEntries) || maximumEntries < 1) {
      throw new RangeError('History maximum must be a positive integer.');
    }
    this.#current = cloneContractValue(document);
    this.#maximumEntries = maximumEntries;
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

  public execute(command: BlueprintCommand): BlueprintDocument {
    if (command.baseStateVersion !== this.#stateVersion) {
      throw new StudioCommandError(
        'stale-state',
        `Command state ${command.baseStateVersion} does not match ${this.#stateVersion}.`,
      );
    }
    const next = applyCommand(this.#current, command);
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
