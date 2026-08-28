import {
  assertBlueprintWithinSessionPolicy,
  assertEntryWithinSessionPolicy,
  assertModelWithinSessionPolicy,
  type StudioCompositionContribution,
} from '@kumwe/studio-core';
import type {
  AuthoringSessionSnapshot,
  BlockDefinition,
  BlueprintBlockLock,
  BlueprintNode,
  DesignVocabulary,
  FieldAdapterContribution,
  InspectorContribution,
  MigrationDeclaration,
  PatternDocument,
  StudioConfiguration,
} from '@kumwe/studio-protocol';

/** The exact declarative catalog authorized for one hosted session generation. */
export interface StudioHostedPolicyCatalog {
  readonly blockDefinitions: readonly BlockDefinition[];
  readonly designVocabularies: readonly DesignVocabulary[];
  readonly fieldAdapters: readonly FieldAdapterContribution[];
  readonly inspectors: readonly InspectorContribution[];
  readonly migrations: readonly MigrationDeclaration[];
  readonly patterns: readonly PatternDocument[];
}

export interface StudioHostedPolicyInput {
  /** Trusted definitions compiled into Studio. They remain unavailable until the host locks them. */
  readonly builtInBlockDefinitions: readonly BlockDefinition[];
  /** Only contributions returned by target resolution for this immutable generation. */
  readonly resolvedContributions: readonly StudioCompositionContribution[];
  readonly session: StudioConfiguration;
  readonly snapshot: AuthoringSessionSnapshot;
}

/**
 * Resolve hosted authoring policy without standalone defaults.
 *
 * A built-in definition is available only when the resolved Studio session
 * locks its exact version and revision. An extension definition additionally
 * has to be admitted by the resolved target. The opened Blueprint may use only
 * an exact subset of that session catalog. Nothing is inferred or repaired.
 */
export function resolveStudioHostedPolicyCatalog(
  input: Readonly<StudioHostedPolicyInput>,
): StudioHostedPolicyCatalog {
  if (!input.snapshot.capabilities.modes.includes(input.session.mode)) {
    throw new TypeError(
      'The opened authoring session does not admit the host-resolved Studio mode.',
    );
  }
  const sessionLocks = indexLocks(input.session.blocks, 'resolved Studio session');
  const blueprintLocks = indexLocks(
    input.snapshot.state.blueprint.dependencyLock.blocks,
    'opened Blueprint',
  );
  const builtIns = indexDefinitions(input.builtInBlockDefinitions, 'built-in catalog');
  const admittedBlockDefinitions = input.resolvedContributions.filter(
    (entry): entry is BlockDefinition => entry.kind === 'block-definition',
  );
  const admittedBlocks = indexDefinitions(admittedBlockDefinitions, 'target-admitted catalog');

  for (const [key, definition] of admittedBlocks) {
    const lock = sessionLocks.get(key);
    if (lock === undefined) {
      throw new TypeError(
        `The resolved target admits ${key}, but the Studio session does not lock that block.`,
      );
    }
    assertDefinitionMatchesLock(definition, lock, 'target-admitted block');
  }

  const blockDefinitions: BlockDefinition[] = [];
  for (const [key, lock] of sessionLocks) {
    const definition = admittedBlocks.get(key) ?? builtIns.get(key);
    if (definition === undefined) {
      throw new TypeError(
        `The resolved Studio session locks ${key}, but that definition is not built in or target-admitted.`,
      );
    }
    assertDefinitionMatchesLock(definition, lock, 'resolved Studio session');
    blockDefinitions.push(structuredClone(definition));
  }

  for (const [key, blueprintLock] of blueprintLocks) {
    const sessionLock = sessionLocks.get(key);
    if (sessionLock === undefined) {
      throw new TypeError(
        `The opened Blueprint locks ${key}, but that block is absent from the resolved Studio session.`,
      );
    }
    if (!sameLock(sessionLock, blueprintLock)) {
      throw new TypeError(
        `The opened Blueprint lock for ${key} does not match the resolved Studio session lock.`,
      );
    }
  }

  assertSnapshotWithinHostedPolicy(input.snapshot, sessionLocks, input.session);

  const patterns = input.resolvedContributions.filter(
    (entry): entry is PatternDocument => entry.kind === 'pattern',
  );
  for (const pattern of patterns) {
    for (const dependency of pattern.blockDependencies) {
      const lock = sessionLocks.get(blockKey(dependency));
      if (lock === undefined || !sameLock(lock, dependency)) {
        throw new TypeError(
          `Target-admitted pattern ${pattern.id}@${pattern.version} requires an unavailable block lock.`,
        );
      }
    }
  }

  assertPluginInventoryLimit(input.session);

  return {
    blockDefinitions,
    designVocabularies: contributionsOfKind(input.resolvedContributions, 'design-vocabulary'),
    fieldAdapters: contributionsOfKind(input.resolvedContributions, 'field-adapter'),
    inspectors: contributionsOfKind(input.resolvedContributions, 'inspector'),
    migrations: contributionsOfKind(input.resolvedContributions, 'migration'),
    patterns: structuredClone(patterns),
  };
}

function indexLocks(
  locks: readonly BlueprintBlockLock[],
  source: string,
): Map<string, BlueprintBlockLock> {
  const result = new Map<string, BlueprintBlockLock>();
  for (const lock of locks) {
    const key = blockKey(lock);
    if (result.has(key)) {
      throw new TypeError(`${source} repeats the ${key} block lock.`);
    }
    result.set(key, structuredClone(lock));
  }
  return result;
}

function indexDefinitions(
  definitions: readonly BlockDefinition[],
  source: string,
): Map<string, BlockDefinition> {
  const result = new Map<string, BlockDefinition>();
  for (const definition of definitions) {
    const key = blockKey(definition);
    if (result.has(key)) {
      throw new TypeError(`${source} repeats the ${key} block definition.`);
    }
    result.set(key, structuredClone(definition));
  }
  return result;
}

function assertDefinitionMatchesLock(
  definition: BlockDefinition,
  lock: BlueprintBlockLock,
  source: string,
): void {
  if (definition.revision !== lock.revision) {
    throw new TypeError(
      `${source} resolves ${blockKey(lock)} to revision ${definition.revision}, not locked revision ${lock.revision}.`,
    );
  }
}

function sameLock(left: BlueprintBlockLock, right: BlueprintBlockLock): boolean {
  return (
    left.type === right.type &&
    left.version === right.version &&
    left.revision === right.revision &&
    left.integrity === right.integrity
  );
}

function blockKey(value: Pick<BlueprintBlockLock, 'type' | 'version'>): string {
  return `${value.type}@${value.version}`;
}

function assertSnapshotWithinHostedPolicy(
  snapshot: AuthoringSessionSnapshot,
  locks: ReadonlyMap<string, BlueprintBlockLock>,
  session: StudioConfiguration,
): void {
  assertBlueprintWithinSessionPolicy(snapshot.state.blueprint, session.limits);
  assertEntryWithinSessionPolicy(snapshot.state.entry, session.limits);
  assertModelWithinSessionPolicy(snapshot.state.model, session.limits);
  const stack: BlueprintNode[] = [...snapshot.state.blueprint.roots];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node === undefined) break;
    if (!locks.has(blockKey(node))) {
      throw new TypeError(
        `Blueprint node ${node.id} uses ${blockKey(node)} without an exact host lock.`,
      );
    }
    for (const children of Object.values(node.slots)) stack.push(...children);
  }
}

function assertPluginInventoryLimit(session: StudioConfiguration): void {
  if (session.plugins.length > session.limits.maxPluginCount) {
    throw new RangeError('The resolved Studio session exceeds its plugin limit.');
  }
}

function contributionsOfKind<
  TKind extends 'design-vocabulary' | 'field-adapter' | 'inspector' | 'migration',
>(
  contributions: readonly StudioCompositionContribution[],
  kind: TKind,
): Extract<StudioCompositionContribution, { kind: TKind }>[] {
  return structuredClone(
    contributions.filter(
      (entry): entry is Extract<StudioCompositionContribution, { kind: TKind }> =>
        entry.kind === kind,
    ),
  );
}
