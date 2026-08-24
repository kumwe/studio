import {
  blockDefinitionSchema,
  blueprintSchema,
  commonSchema,
  designVocabularySchema,
  fieldAdapterSchema,
  inspectorSchema,
  migrationSchema,
  patternSchema,
  STUDIO_CONTRACT_VERSION,
} from '@kumwe/studio-protocol';
import type {
  BlockDefinition,
  BlockType,
  BlueprintDocument,
  BlueprintNode,
  DesignVocabulary,
  ExtensionLifecycleState,
  FieldAdapterContribution,
  InspectorContribution,
  MigrationDeclaration,
  NodeId,
  OwnerReference,
  PatternDocument,
  Revision,
  StudioDiagnostic,
  UnresolvedContribution,
  UnresolvedContributionReference,
  UnresolvedContributionReason,
} from '@kumwe/studio-protocol';
import { cloneContractValue } from './clone.js';
import { StudioCommandError } from './commands.js';
import { BlockRegistry } from './registry.js';
import { compileProfileSchema, type CompiledSchemaValidator } from './profile-validator.js';
import { assertStudioPropertySchema } from './schema-profile.js';

export interface ExtensionContributions {
  blocks: BlockDefinition[];
  designVocabularies?: DesignVocabulary[];
  fieldAdapters?: FieldAdapterContribution[];
  inspectors?: InspectorContribution[];
  migrations?: MigrationDeclaration[];
  patterns?: PatternDocument[];
}

interface NormalizedExtensionContributions {
  blocks: BlockDefinition[];
  designVocabularies: DesignVocabulary[];
  fieldAdapters: FieldAdapterContribution[];
  inspectors: InspectorContribution[];
  migrations: MigrationDeclaration[];
  patterns: PatternDocument[];
}

export type StudioCompositionContributionKind =
  'block' | 'design-vocabulary' | 'field-adapter' | 'inspector' | 'migration' | 'pattern';

export type StudioCompositionContribution =
  | BlockDefinition
  | DesignVocabulary
  | FieldAdapterContribution
  | InspectorContribution
  | MigrationDeclaration
  | PatternDocument;

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
  owner?: OwnerReference;
  reason: UnresolvedContributionReason;
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
  contributions: NormalizedExtensionContributions;
  diagnostics: StudioDiagnostic[];
  owner: OwnerReference;
  state: ExtensionLifecycleState;
}

interface ContributionEntry {
  id: string;
  kind: StudioCompositionContributionKind;
  owner: OwnerReference;
  payload: StudioCompositionContribution;
  version: string;
}

const contributionValidators: Readonly<
  Record<StudioCompositionContributionKind, CompiledSchemaValidator>
> = {
  block: compileProfileSchema(blockDefinitionSchema, { schemas: [commonSchema] }),
  'design-vocabulary': compileProfileSchema(designVocabularySchema, {
    schemas: [commonSchema],
  }),
  'field-adapter': compileProfileSchema(fieldAdapterSchema, { schemas: [commonSchema] }),
  inspector: compileProfileSchema(inspectorSchema, { schemas: [commonSchema] }),
  migration: compileProfileSchema(migrationSchema, { schemas: [commonSchema] }),
  pattern: compileProfileSchema(patternSchema, { schemas: [commonSchema, blueprintSchema] }),
};

/**
 * One immutable, resolvable registry generation. A generation never changes
 * after publication; lifecycle transitions publish a successor instead.
 */
export class RegistryGeneration {
  readonly #contributions: ReadonlyMap<string, StudioCompositionContribution>;
  readonly #generation: Revision;
  readonly #owners: readonly OwnerReference[];
  readonly #registry: BlockRegistry;

  public constructor(
    generation: Revision,
    owners: readonly OwnerReference[],
    registry: BlockRegistry,
    contributions: readonly ContributionEntry[] = [],
  ) {
    this.#contributions = new Map(
      contributions.map((entry) => [
        contributionKey(entry.kind, entry.id, entry.version),
        cloneContractValue(entry.payload),
      ]),
    );
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

  /** Resolve one of the six canonical composition payload kinds by exact identity. */
  public resolveContribution(
    kind: StudioCompositionContributionKind,
    id: string,
    version: string,
  ): StudioCompositionContribution | undefined {
    if (kind === 'block') {
      return this.resolveBlock(id as BlockType, version);
    }
    const payload = this.#contributions.get(contributionKey(kind, id, version));
    return payload === undefined ? undefined : cloneContractValue(payload);
  }

  /** Enumerate one canonical kind in deterministic identity/version order. */
  public contributions(kind: StudioCompositionContributionKind): StudioCompositionContribution[] {
    if (kind === 'block') {
      return this.blocks();
    }
    const prefix = `${kind}\u0000`;
    return [...this.#contributions.entries()]
      .filter(([key]) => key.startsWith(prefix))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([, payload]) => cloneContractValue(payload));
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
    const candidate = normalizeContributions(contributions);
    const diagnostics = this.#collectActivationDiagnostics(owner, candidate);
    if (diagnostics.length > 0) {
      if (!this.#extensions.has(owner.id)) {
        this.#extensions.set(owner.id, {
          contributions: normalizeContributions({ blocks: [] }),
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
    // Contribution DATA is retained for the diagnostics inventory the
    // lifecycle contract requires; only resolution excludes it, because a
    // published generation includes active extensions exclusively.
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
        const { owner, reason } = this.#unresolvedReason(node.type, node.version);
        const report: UnresolvedNodeReport = {
          nodeId: node.id,
          reason,
          type: node.type,
          version: node.version,
        };
        if (owner !== undefined) {
          report.owner = cloneContractValue(owner);
        }
        unresolved.push(report);
      }
      for (const children of Object.values(node.slots)) {
        stack.push(...[...children].reverse());
      }
    }
    return unresolved;
  }

  /**
   * The portable unresolved-contribution documents for a Blueprint: one per
   * unresolved block type and version, carrying the affected nodes and a
   * localizable diagnostic, without interpreting node data through another
   * owner.
   */
  public unresolvedContributions(document: BlueprintDocument): UnresolvedContribution[] {
    const grouped = new Map<string, UnresolvedContribution>();
    for (const report of this.unresolvedNodes(document)) {
      const key = `${report.type}@${report.version}`;
      let entry = grouped.get(key);
      if (entry === undefined) {
        entry = {
          affectedNodes: [],
          contractVersion: STUDIO_CONTRACT_VERSION,
          diagnostics: [
            {
              code: 'studio.validation/block-unavailable',
              message: {
                defaultMessage: `The ${report.type} block is currently unavailable; its content is preserved.`,
                key: 'studio.validation/block-unavailable',
              },
              severity: 'warning',
            },
          ],
          kind: 'unresolved-contribution',
          reason: report.reason,
          reference: { contribution: 'block', id: report.type, version: report.version },
        };
        if (report.owner !== undefined) {
          entry.owner = report.owner;
        }
        grouped.set(key, entry);
      }
      entry.affectedNodes?.push(report.nodeId);
    }
    return [...grouped.values()];
  }

  /**
   * Resolve the lifecycle reason for any canonical contribution reference.
   * Identity is kind-scoped, so a pattern can never satisfy a field-adapter
   * reference merely because their IDs and versions match.
   */
  public unresolvedReference(
    reference: UnresolvedContributionReference,
  ): { owner?: OwnerReference; reason: UnresolvedContributionReason } | undefined {
    if (!isCompositionContributionKind(reference.contribution)) {
      return { reason: 'not-installed' };
    }
    if (
      this.#current.resolveContribution(reference.contribution, reference.id, reference.version) !==
      undefined
    ) {
      return undefined;
    }
    return this.#unresolvedContributionReason(
      reference.contribution,
      reference.id,
      reference.version,
    );
  }

  #unresolvedReason(
    type: BlockType,
    version: string,
  ): { owner?: OwnerReference; reason: UnresolvedContributionReason } {
    return this.#unresolvedContributionReason('block', type, version);
  }

  #unresolvedContributionReason(
    kind: StudioCompositionContributionKind,
    id: string,
    version: string,
  ): { owner?: OwnerReference; reason: UnresolvedContributionReason } {
    for (const record of this.#extensions.values()) {
      const versions = contributionEntries(record.contributions)
        .filter((entry) => entry.kind === kind && entry.id === id)
        .map((entry) => entry.version);
      if (versions.length === 0) {
        continue;
      }
      if (!versions.includes(version)) {
        return { owner: record.owner, reason: 'incompatible' };
      }
      if (record.state === 'trust-revoked') {
        return { owner: record.owner, reason: 'owner-revoked' };
      }
      return { owner: record.owner, reason: 'owner-disabled' };
    }
    return { reason: 'not-installed' };
  }

  #collectActivationDiagnostics(
    owner: OwnerReference,
    candidate: NormalizedExtensionContributions,
  ): StudioDiagnostic[] {
    const diagnostics: StudioDiagnostic[] = [];
    const seen = new Set<string>();
    for (const entry of contributionEntries(candidate)) {
      if (entry.owner.id !== owner.id || entry.owner.version !== owner.version) {
        diagnostics.push(
          activationDiagnostic(
            'studio.contribution/owner-mismatch',
            `${entry.kind} ${entry.id} declares owner ${entry.owner.id}@${entry.owner.version}.`,
          ),
        );
        continue;
      }
      const key = contributionKey(entry.kind, entry.id, entry.version);
      if (seen.has(key)) {
        diagnostics.push(
          activationDiagnostic(
            'studio.contribution/duplicate-contribution',
            `${entry.kind} ${entry.id}@${entry.version} is contributed twice by ${owner.id}.`,
          ),
        );
        continue;
      }
      seen.add(key);
      const conflictingOwner = this.#ownerOfContribution(entry.kind, entry.id, owner.id);
      if (conflictingOwner !== undefined) {
        diagnostics.push(
          activationDiagnostic(
            'studio.contribution/cross-owner-collision',
            `${entry.kind} ${entry.id} is owned by ${conflictingOwner}.`,
          ),
        );
      }
      const validator = contributionValidators[entry.kind];
      if (!validator.validate(entry.payload)) {
        const first = validator.errors?.[0];
        diagnostics.push(
          activationDiagnostic(
            'studio.contribution/invalid-definition',
            `${entry.kind} ${entry.id}@${entry.version} ${first?.instancePath ?? 'document'} ${first?.message ?? 'violates its canonical schema'}.`,
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
        for (const adapter of candidate.fieldAdapters) {
          if (adapter.optionSchema !== undefined) {
            assertStudioPropertySchema(adapter.optionSchema);
          }
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

  #ownerOfContribution(
    kind: StudioCompositionContributionKind,
    id: string,
    exceptOwnerId: string,
  ): string | undefined {
    for (const record of this.#extensions.values()) {
      if (record.owner.id === exceptOwnerId) {
        continue;
      }
      if (record.state === 'purged' || record.state === 'uninstalled-data-preserved') {
        continue;
      }
      if (
        contributionEntries(record.contributions).some(
          (entry) => entry.kind === kind && entry.id === id,
        )
      ) {
        return record.owner.id;
      }
    }
    return undefined;
  }

  #publish(generation: Revision): RegistryGeneration {
    const registry = new SealedBlockRegistry();
    const owners: OwnerReference[] = [];
    const contributions: ContributionEntry[] = [];
    for (const record of this.#extensions.values()) {
      if (record.state !== 'active') {
        continue;
      }
      owners.push(cloneContractValue(record.owner));
      for (const block of record.contributions.blocks) {
        registry.register(cloneContractValue(block));
      }
      contributions.push(...contributionEntries(record.contributions));
    }
    registry.seal();
    return new RegistryGeneration(generation, owners, registry, contributions);
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

function normalizeContributions(
  contributions: Readonly<ExtensionContributions>,
): NormalizedExtensionContributions {
  return {
    blocks: cloneContractValue(contributions.blocks),
    designVocabularies: cloneContractValue(contributions.designVocabularies ?? []),
    fieldAdapters: cloneContractValue(contributions.fieldAdapters ?? []),
    inspectors: cloneContractValue(contributions.inspectors ?? []),
    migrations: cloneContractValue(contributions.migrations ?? []),
    patterns: cloneContractValue(contributions.patterns ?? []),
  };
}

function contributionEntries(contributions: NormalizedExtensionContributions): ContributionEntry[] {
  return [
    ...contributions.blocks.map((payload) => ({
      id: payload.type,
      kind: 'block' as const,
      owner: payload.owner,
      payload,
      version: payload.version,
    })),
    ...contributions.designVocabularies.map((payload) => ({
      id: payload.id,
      kind: 'design-vocabulary' as const,
      owner: payload.owner,
      payload,
      version: payload.version,
    })),
    ...contributions.fieldAdapters.map((payload) => ({
      id: payload.id,
      kind: 'field-adapter' as const,
      owner: payload.owner,
      payload,
      version: payload.version,
    })),
    ...contributions.inspectors.map((payload) => ({
      id: payload.id,
      kind: 'inspector' as const,
      owner: payload.owner,
      payload,
      version: payload.version,
    })),
    ...contributions.migrations.map((payload) => ({
      id: payload.id,
      kind: 'migration' as const,
      owner: payload.owner,
      payload,
      version: payload.version,
    })),
    ...contributions.patterns.map((payload) => ({
      id: payload.id,
      kind: 'pattern' as const,
      owner: payload.owner,
      payload,
      version: payload.version,
    })),
  ];
}

function contributionKey(
  kind: StudioCompositionContributionKind,
  id: string,
  version: string,
): string {
  return `${kind}\u0000${id}\u0000${version}`;
}

function isCompositionContributionKind(
  kind: UnresolvedContributionReference['contribution'],
): kind is StudioCompositionContributionKind {
  return (
    kind === 'block' ||
    kind === 'design-vocabulary' ||
    kind === 'field-adapter' ||
    kind === 'inspector' ||
    kind === 'migration' ||
    kind === 'pattern'
  );
}

function activationDiagnostic(code: StudioDiagnostic['code'], message: string): StudioDiagnostic {
  return {
    code,
    message: { defaultMessage: message, key: 'studio.contribution/activation' },
    severity: 'blocking',
  };
}
