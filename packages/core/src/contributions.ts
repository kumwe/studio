import type {
  BlockDefinition,
  BlockType,
  BlueprintDocument,
  BlueprintNode,
  ExtensionLifecycleState,
  NodeId,
  OwnerReference,
  Revision,
  StudioDiagnostic,
} from '@kumwe/studio-protocol';
import { cloneContractValue } from './clone.js';
import { StudioCommandError } from './commands.js';
import { BlockRegistry } from './registry.js';

export interface ExtensionContributions {
  blocks: BlockDefinition[];
}

export interface ExtensionInventory {
  diagnostics: StudioDiagnostic[];
  owner: OwnerReference;
  state: ExtensionLifecycleState;
}

export interface GenerationOptions {
  generation: Revision;
}

export interface UnresolvedNodeReport {
  nodeId: NodeId;
  type: BlockType;
  version: string;
}

export class StudioContributionError extends Error {
  public readonly diagnostics: StudioDiagnostic[];

  public constructor(message: string, diagnostics: StudioDiagnostic[]) {
    super(message);
    this.name = 'StudioContributionError';
    this.diagnostics = diagnostics;
  }
}

interface ExtensionRecord {
  contributions: ExtensionContributions;
  diagnostics: StudioDiagnostic[];
  owner: OwnerReference;
  state: ExtensionLifecycleState;
}

/**
 * One immutable, resolvable registry generation. A generation never changes
 * after publication; lifecycle transitions publish a successor instead.
 */
export class RegistryGeneration {
  readonly #generation: Revision;
  readonly #owners: readonly OwnerReference[];
  readonly #registry: BlockRegistry;

  public constructor(
    generation: Revision,
    owners: readonly OwnerReference[],
    registry: BlockRegistry,
  ) {
    this.#generation = generation;
    this.#owners = owners;
    this.#registry = registry;
  }

  public get generation(): Revision {
    return this.#generation;
  }

  public get registry(): BlockRegistry {
    return this.#registry;
  }

  public blocks(): BlockDefinition[] {
    return this.#registry.definitions();
  }

  public owners(): OwnerReference[] {
    return this.#owners.map((owner) => cloneContractValue(owner));
  }

  public resolveBlock(type: BlockType, version: string): BlockDefinition | undefined {
    return this.#registry.resolve(type, version);
  }
}

class SealedBlockRegistry extends BlockRegistry {
  #sealed = false;

  public seal(): void {
    this.#sealed = true;
  }

  public override register(...parameters: Parameters<BlockRegistry['register']>): void {
    if (this.#sealed) {
      throw new Error('A published registry generation is immutable.');
    }
    super.register(...parameters);
  }
}

/**
 * The owner-aware contribution runtime. Activation is transactional: a
 * rejected activation publishes no partial generation and never disturbs a
 * previously active extension. Every successful transition publishes a new
 * immutable generation; disabling an owner removes its executable
 * contributions from resolution without touching stored documents, and a
 * stale generation cannot be used for execution.
 */
export class ContributionRuntime {
  readonly #extensions = new Map<string, ExtensionRecord>();
  #current: RegistryGeneration;

  public constructor(options: Readonly<GenerationOptions>) {
    this.#current = this.#publish(options.generation);
  }

  public get current(): RegistryGeneration {
    return this.#current;
  }

  public activate(
    owner: OwnerReference,
    contributions: Readonly<ExtensionContributions>,
    options: Readonly<GenerationOptions>,
  ): RegistryGeneration {
    const candidate = cloneContractValue(contributions) as ExtensionContributions;
    const diagnostics = this.#collectActivationDiagnostics(owner, candidate);
    if (diagnostics.length > 0) {
      if (!this.#extensions.has(owner.id)) {
        this.#extensions.set(owner.id, {
          contributions: { blocks: [] },
          diagnostics,
          owner: cloneContractValue(owner),
          state: 'rejected',
        });
      }
      throw new StudioContributionError(
        `Activation of ${owner.id} was rejected: ${diagnostics
          .map((diagnostic) => diagnostic.code)
          .join(', ')}.`,
        diagnostics,
      );
    }

    this.#extensions.set(owner.id, {
      contributions: candidate,
      diagnostics: [],
      owner: cloneContractValue(owner),
      state: 'active',
    });
    this.#current = this.#publish(options.generation);
    return this.#current;
  }

  public disable(ownerId: string, options: Readonly<GenerationOptions>): RegistryGeneration {
    const record = this.#requireExtension(ownerId);
    record.state = 'disabled';
    this.#current = this.#publish(options.generation);
    return this.#current;
  }

  public reactivate(ownerId: string, options: Readonly<GenerationOptions>): RegistryGeneration {
    const record = this.#requireExtension(ownerId);
    if (record.state === 'trust-revoked') {
      throw new StudioContributionError(
        `Extension ${ownerId} is trust-revoked and requires a fresh verified activation.`,
        record.diagnostics,
      );
    }
    record.state = 'active';
    this.#current = this.#publish(options.generation);
    return this.#current;
  }

  public revokeTrust(ownerId: string, options: Readonly<GenerationOptions>): RegistryGeneration {
    const record = this.#requireExtension(ownerId);
    record.state = 'trust-revoked';
    record.contributions = { blocks: [] };
    this.#current = this.#publish(options.generation);
    return this.#current;
  }

  public assertCurrent(generation: Revision): RegistryGeneration {
    if (this.#current.generation !== generation) {
      throw new StudioCommandError(
        'stale-generation',
        `Registry generation ${generation} is stale; the active generation is ${this.#current.generation}.`,
      );
    }
    return this.#current;
  }

  public inventory(): ExtensionInventory[] {
    return [...this.#extensions.values()]
      .map((record) => ({
        diagnostics: cloneContractValue(record.diagnostics),
        owner: cloneContractValue(record.owner),
        state: record.state,
      }))
      .sort((left, right) => (left.owner.id < right.owner.id ? -1 : 1));
  }

  public unresolvedNodes(document: BlueprintDocument): UnresolvedNodeReport[] {
    const unresolved: UnresolvedNodeReport[] = [];
    const stack: BlueprintNode[] = [...document.roots].reverse();
    while (stack.length > 0) {
      const node = stack.pop();
      if (node === undefined) {
        break;
      }
      if (this.#current.resolveBlock(node.type, node.version) === undefined) {
        unresolved.push({ nodeId: node.id, type: node.type, version: node.version });
      }
      for (const children of Object.values(node.slots)) {
        stack.push(...[...children].reverse());
      }
    }
    return unresolved;
  }

  #collectActivationDiagnostics(
    owner: OwnerReference,
    candidate: ExtensionContributions,
  ): StudioDiagnostic[] {
    const diagnostics: StudioDiagnostic[] = [];
    const seen = new Set<string>();
    for (const block of candidate.blocks) {
      if (block.owner.id !== owner.id || block.owner.version !== owner.version) {
        diagnostics.push(
          activationDiagnostic(
            'studio.contribution/owner-mismatch',
            `Block ${block.type} declares owner ${block.owner.id}@${block.owner.version}.`,
          ),
        );
        continue;
      }
      const key = `${block.type}@${block.version}`;
      if (seen.has(key)) {
        diagnostics.push(
          activationDiagnostic(
            'studio.contribution/duplicate-contribution',
            `Block ${key} is contributed twice by ${owner.id}.`,
          ),
        );
        continue;
      }
      seen.add(key);
      const conflictingOwner = this.#ownerOfBlockType(block.type, owner.id);
      if (conflictingOwner !== undefined) {
        diagnostics.push(
          activationDiagnostic(
            'studio.contribution/cross-owner-collision',
            `Block type ${block.type} is owned by ${conflictingOwner}.`,
          ),
        );
      }
    }

    if (diagnostics.length === 0) {
      try {
        const dryRun = new SealedBlockRegistry();
        for (const record of this.#extensions.values()) {
          if (record.state !== 'active' || record.owner.id === owner.id) {
            continue;
          }
          for (const block of record.contributions.blocks) {
            dryRun.register(cloneContractValue(block));
          }
        }
        for (const block of candidate.blocks) {
          dryRun.register(cloneContractValue(block));
        }
      } catch (error) {
        diagnostics.push(
          activationDiagnostic(
            'studio.contribution/invalid-definition',
            error instanceof Error ? error.message : 'A contributed definition is invalid.',
          ),
        );
      }
    }
    return diagnostics;
  }

  #ownerOfBlockType(type: BlockType, exceptOwnerId: string): string | undefined {
    for (const record of this.#extensions.values()) {
      if (record.owner.id === exceptOwnerId) {
        continue;
      }
      if (record.state === 'purged' || record.state === 'uninstalled-data-preserved') {
        continue;
      }
      if (record.contributions.blocks.some((block) => block.type === type)) {
        return record.owner.id;
      }
    }
    return undefined;
  }

  #publish(generation: Revision): RegistryGeneration {
    const registry = new SealedBlockRegistry();
    const owners: OwnerReference[] = [];
    for (const record of this.#extensions.values()) {
      if (record.state !== 'active') {
        continue;
      }
      owners.push(cloneContractValue(record.owner));
      for (const block of record.contributions.blocks) {
        registry.register(cloneContractValue(block));
      }
    }
    registry.seal();
    return new RegistryGeneration(generation, owners, registry);
  }

  #requireExtension(ownerId: string): ExtensionRecord {
    const record = this.#extensions.get(ownerId);
    if (record === undefined) {
      throw new StudioContributionError(
        `Extension ${ownerId} is not known to the contribution runtime.`,
        [],
      );
    }
    return record;
  }
}

function activationDiagnostic(code: StudioDiagnostic['code'], message: string): StudioDiagnostic {
  return {
    code,
    message: { defaultMessage: message, key: 'studio.contribution/activation' },
    severity: 'blocking',
  };
}
