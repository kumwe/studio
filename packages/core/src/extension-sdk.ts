import {
  commonSchema,
  pluginManifestSchema,
  STUDIO_CONTRACT_VERSION,
} from '@kumwe/studio-protocol';
import type {
  BlockDefinition,
  DesignVocabulary,
  ExtensionLifecycleState,
  FieldAdapterContribution,
  InspectorContribution,
  MigrationDeclaration,
  OwnerReference,
  PatternDocument,
  PluginContributionKind,
  PluginManifest,
  QualifiedName,
  StudioDiagnostic,
  UnresolvedContribution,
  UnresolvedContributionReason,
  UnresolvedContributionReference,
} from '@kumwe/studio-protocol';
import { cloneContractValue } from './clone.js';
import {
  ContributionRuntime,
  StudioContributionError,
  type ExtensionContributions,
  type GenerationOptions,
  type RegistryGeneration,
} from './contributions.js';
import { compileProfileSchema, type CompiledSchemaValidator } from './profile-validator.js';

/**
 * One authored Studio plugin: the declarative manifest plus the concrete
 * canonical composition payloads the manifest declares. All six payload
 * families are validated and activated transactionally; other manifest kinds
 * remain resource-backed host declarations.
 */
export interface StudioPluginDefinition {
  blocks?: readonly BlockDefinition[];
  designVocabularies?: readonly DesignVocabulary[];
  fieldAdapters?: readonly FieldAdapterContribution[];
  inspectors?: readonly InspectorContribution[];
  manifest: PluginManifest;
  migrations?: readonly MigrationDeclaration[];
  patterns?: readonly PatternDocument[];
}

const validateManifestSchema: CompiledSchemaValidator = compileProfileSchema(pluginManifestSchema, {
  schemas: [commonSchema],
});

const canonicalContributionKinds: ReadonlySet<PluginContributionKind> = new Set([
  'block',
  'design-vocabulary',
  'field-adapter',
  'inspector',
  'migration',
  'pattern',
]);

/**
 * The typed authoring entry point for extension developers. At compile time
 * this is an identity function: the argument is checked against the closed
 * protocol types, so a typo is an editor error. At runtime it front-loads
 * activation: the canonical plugin-manifest schema, the namespace and
 * declaration coherence rules of the plugin contract, and the contribution
 * runtime's own activation checks (applied through a dry-run activation, not
 * a reimplementation). It adds no invariant of its own — everything it
 * rejects would be rejected identically at activation. Violations throw the
 * runtime's `StudioContributionError` with blocking diagnostics; the
 * validated definition is deep-frozen and returned.
 */
export function defineStudioPlugin<TDefinition extends StudioPluginDefinition>(
  definition: TDefinition,
): TDefinition {
  assertCoherentDefinition(definition);
  const dryRun = new ContributionRuntime({ generation: 'authoring-mirror-0' });
  dryRun.activate(definition.manifest.owner, mutableContributions(definition), {
    generation: 'authoring-mirror-1',
  });
  return deepFreeze(definition);
}

/**
 * Activate an authored plugin definition on a contribution runtime. The
 * manifest-level coherence checks run first and fail closed before the
 * runtime transaction begins; the runtime then applies its own activation
 * rules unchanged, so a rejected definition never disturbs the active
 * generation.
 */
export function activateStudioPlugin(
  runtime: ContributionRuntime,
  definition: StudioPluginDefinition,
  options: Readonly<GenerationOptions>,
): RegistryGeneration {
  assertCoherentDefinition(definition);
  return runtime.activate(definition.manifest.owner, mutableContributions(definition), options);
}

/**
 * The portable unresolved-contribution documents for declared, non-block
 * contribution references (field adapters, patterns, transforms, renderer
 * capabilities, and the other manifest kinds). This mirrors the reason
 * mapping the runtime applies to Blueprint block nodes, lifted from
 * registered block versions to manifest declarations: an unknown id is
 * `not-installed`, an undeclared version is `incompatible`, a trust-revoked
 * owner is `owner-revoked`, and any other inactive owner is
 * `owner-disabled`. References the current generation resolves produce no
 * document.
 */
export function unresolvedDeclaredContributions(
  runtime: ContributionRuntime,
  plugins: readonly StudioPluginDefinition[],
  references: readonly UnresolvedContributionReference[],
): UnresolvedContribution[] {
  const states = new Map(runtime.inventory().map((entry) => [entry.owner.id, entry.state]));
  const unresolved: UnresolvedContribution[] = [];
  const seen = new Set<string>();
  for (const reference of references) {
    const key = `${reference.contribution}:${reference.id}@${reference.version}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    const resolution = canonicalContributionKinds.has(reference.contribution)
      ? runtime.unresolvedReference(reference)
      : resolveDeclaredReference(states, plugins, reference);
    if (resolution === undefined) {
      continue;
    }
    const document: UnresolvedContribution = {
      contractVersion: STUDIO_CONTRACT_VERSION,
      diagnostics: [
        {
          code: 'studio.validation/contribution-unavailable',
          message: {
            defaultMessage: `The ${reference.id} ${reference.contribution} contribution is currently unavailable; its content is preserved.`,
            key: 'studio.validation/contribution-unavailable',
          },
          severity: 'warning',
        },
      ],
      kind: 'unresolved-contribution',
      reason: resolution.reason,
      reference: cloneContractValue(reference),
    };
    if (resolution.owner !== undefined) {
      document.owner = cloneContractValue(resolution.owner);
    }
    unresolved.push(document);
  }
  return unresolved;
}

interface DeclaredReferenceResolution {
  owner?: OwnerReference;
  reason: UnresolvedContributionReason;
}

function resolveDeclaredReference(
  states: ReadonlyMap<string, ExtensionLifecycleState>,
  plugins: readonly StudioPluginDefinition[],
  reference: UnresolvedContributionReference,
): DeclaredReferenceResolution | undefined {
  for (const plugin of plugins) {
    const versions = plugin.manifest.contributions
      .filter(
        (contribution) =>
          contribution.kind === reference.contribution && contribution.id === reference.id,
      )
      .map((contribution) => contribution.version);
    if (versions.length === 0) {
      continue;
    }
    const owner = plugin.manifest.owner;
    const state = states.get(owner.id);
    if (state === undefined) {
      return { reason: 'not-installed' };
    }
    if (!versions.includes(reference.version)) {
      return { owner, reason: 'incompatible' };
    }
    if (state === 'trust-revoked') {
      return { owner, reason: 'owner-revoked' };
    }
    if (state === 'active') {
      return undefined;
    }
    return { owner, reason: 'owner-disabled' };
  }
  return { reason: 'not-installed' };
}

function assertCoherentDefinition(definition: StudioPluginDefinition): void {
  const diagnostics = collectDefinitionDiagnostics(definition);
  if (diagnostics.length > 0) {
    throw new StudioContributionError(
      `Definition of ${definition.manifest.id} was rejected: ${diagnostics
        .map((diagnostic) => diagnostic.code)
        .join(', ')}.`,
      diagnostics,
    );
  }
}

function collectDefinitionDiagnostics(definition: StudioPluginDefinition): StudioDiagnostic[] {
  const diagnostics: StudioDiagnostic[] = [];
  const manifest = definition.manifest;
  if (!validateManifestSchema.validate(manifest)) {
    for (const error of validateManifestSchema.errors ?? []) {
      diagnostics.push(
        coherenceDiagnostic(
          'studio.contribution/invalid-manifest',
          `Manifest ${error.instancePath === '' ? 'document' : error.instancePath} ${error.message}.`,
          error.instancePath === '' ? undefined : error.instancePath,
        ),
      );
    }
    return diagnostics;
  }

  const namespace = namespaceOf(manifest.id);
  const declared = new Set<string>();
  for (const contribution of manifest.contributions) {
    if (!isUnderNamespace(contribution.id, namespace)) {
      diagnostics.push(
        coherenceDiagnostic(
          'studio.contribution/foreign-namespace',
          `Contribution ${contribution.id} is outside the ${namespace} namespace owned by ${manifest.id}.`,
        ),
      );
    }
    const key = declarationKey(contribution.kind, contribution.id, contribution.version);
    if (declared.has(key)) {
      diagnostics.push(
        coherenceDiagnostic(
          'studio.contribution/duplicate-contribution',
          `${contribution.kind} contribution ${contribution.id}@${contribution.version} is declared twice by ${manifest.id}.`,
        ),
      );
    }
    declared.add(key);
    if (contribution.executable === true && manifest.activation !== 'executable') {
      diagnostics.push(
        coherenceDiagnostic(
          'studio.contribution/undeclared-executable',
          `Contribution ${contribution.id} is executable, but ${manifest.id} declares declarative activation.`,
        ),
      );
    }
  }

  const declaredCapabilities = new Set(
    [...manifest.requiredCapabilities, ...manifest.optionalCapabilities].map(
      (capability) => capability.id,
    ),
  );
  const payloadEntries = definitionContributionEntries(definition);
  const payloadKeys = new Set<string>();
  for (const entry of payloadEntries) {
    const key = declarationKey(entry.kind, entry.id, entry.version);
    payloadKeys.add(key);
    if (!declared.has(key)) {
      diagnostics.push(
        coherenceDiagnostic(
          'studio.contribution/undeclared-registration',
          `${entry.kind} ${entry.id}@${entry.version} is not declared by ${manifest.id}.`,
        ),
      );
    }
    for (const capability of entry.requiredCapabilities) {
      if (!declaredCapabilities.has(capability)) {
        diagnostics.push(
          coherenceDiagnostic(
            'studio.contribution/undeclared-capability',
            `${entry.kind} ${entry.id} requires the ${capability} capability, which ${manifest.id} does not declare.`,
          ),
        );
      }
    }
  }
  for (const contribution of manifest.contributions) {
    if (
      canonicalContributionKinds.has(contribution.kind) &&
      !payloadKeys.has(declarationKey(contribution.kind, contribution.id, contribution.version))
    ) {
      diagnostics.push(
        coherenceDiagnostic(
          'studio.contribution/missing-registration',
          `${contribution.kind} ${contribution.id}@${contribution.version} has no canonical payload in ${manifest.id}.`,
        ),
      );
    }
  }
  return diagnostics;
}

interface DefinitionContributionEntry {
  id: string;
  kind: PluginContributionKind;
  requiredCapabilities: QualifiedName[];
  version: string;
}

function definitionContributionEntries(
  definition: StudioPluginDefinition,
): DefinitionContributionEntry[] {
  return [
    ...(definition.blocks ?? []).map((payload) => ({
      id: payload.type,
      kind: 'block' as const,
      requiredCapabilities: payload.rendererRequirements.map(
        (requirement) => requirement.capability,
      ),
      version: payload.version,
    })),
    ...(definition.designVocabularies ?? []).map((payload) => ({
      id: payload.id,
      kind: 'design-vocabulary' as const,
      requiredCapabilities: [],
      version: payload.version,
    })),
    ...(definition.fieldAdapters ?? []).map((payload) => ({
      id: payload.id,
      kind: 'field-adapter' as const,
      requiredCapabilities:
        payload.requiredCapability === undefined ? [] : [payload.requiredCapability],
      version: payload.version,
    })),
    ...(definition.inspectors ?? []).map((payload) => ({
      id: payload.id,
      kind: 'inspector' as const,
      requiredCapabilities:
        payload.requiredCapability === undefined ? [] : [payload.requiredCapability],
      version: payload.version,
    })),
    ...(definition.migrations ?? []).map((payload) => ({
      id: payload.id,
      kind: 'migration' as const,
      requiredCapabilities: [],
      version: payload.version,
    })),
    ...(definition.patterns ?? []).map((payload) => ({
      id: payload.id,
      kind: 'pattern' as const,
      requiredCapabilities: [],
      version: payload.version,
    })),
  ];
}

function mutableContributions(definition: StudioPluginDefinition): ExtensionContributions {
  return {
    blocks: [...(definition.blocks ?? [])],
    designVocabularies: [...(definition.designVocabularies ?? [])],
    fieldAdapters: [...(definition.fieldAdapters ?? [])],
    inspectors: [...(definition.inspectors ?? [])],
    migrations: [...(definition.migrations ?? [])],
    patterns: [...(definition.patterns ?? [])],
  };
}

function declarationKey(kind: PluginContributionKind, id: string, version: string): string {
  return `${kind}\u0000${id}\u0000${version}`;
}

function namespaceOf(id: QualifiedName): string {
  const separator = id.indexOf('/');
  return separator === -1 ? id : id.slice(0, separator);
}

function isUnderNamespace(id: QualifiedName, namespace: string): boolean {
  const candidate = namespaceOf(id);
  return candidate === namespace || candidate.startsWith(`${namespace}.`);
}

function coherenceDiagnostic(
  code: StudioDiagnostic['code'],
  message: string,
  jsonPointer?: string,
): StudioDiagnostic {
  const diagnostic: StudioDiagnostic = {
    code,
    message: { defaultMessage: message, key: 'studio.contribution/activation' },
    severity: 'blocking',
  };
  if (jsonPointer !== undefined) {
    diagnostic.location = { jsonPointer };
  }
  return diagnostic;
}

function deepFreeze<TValue>(value: TValue): TValue {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const entry of Object.values(value as Record<string, unknown>)) {
    deepFreeze(entry);
  }
  return value;
}
