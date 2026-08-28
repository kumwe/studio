import {
  authoringSaveSchema,
  authoringSessionSchema,
  authoringTargetSchema,
  blueprintSchema,
  commonSchema,
  contentModelSchema,
  entrySchema,
  reusableContentTypeSchema,
  type AddModelFieldCommand,
  type AuthoringArtifactCoordinates,
  type AuthoringPort,
  type AuthoringPresentationState,
  type AuthoringSaveAsNewTypeRequest,
  type AuthoringSaveIntent,
  type AuthoringSaveItemRequest,
  type AuthoringSaveNewTypeVersionRequest,
  type AuthoringSaveOutcome,
  type AuthoringSavePlan,
  type AuthoringSaveResult,
  type AuthoringSessionSnapshot,
  type AuthoringStartRequest,
  type AuthoringTargetResolution,
  type AuthoringTargetResolveRequest,
  type AuthoringTypeListPage,
  type AuthoringTypeListQuery,
  type BlueprintCommand,
  type BlueprintDocument,
  type ContentModelDocument,
  type EntryDocument,
  type HostAdapter,
  type HostPortFailure,
  type HostPortResult,
  type JsonValue,
  type MessageReference,
  type QualifiedName,
  type ReusableContentTypeDefinition,
  type Revision,
  type SetFieldValueCommand,
  type StudioConfiguration,
  type StudioDiagnostic,
} from '@kumwe/studio-protocol';
import { canonicalStringify } from './canonical.js';
import { cloneContractValue } from './clone.js';
import { StudioCommandError } from './commands.js';
import { applyEntryCommand } from './entry-commands.js';
import {
  SessionIdentifierAllocator,
  StudioHostSessionError,
  adapterContractFailure,
  createContext,
  createDiagnostic,
  isStaleGenerationFailure,
  mutationFingerprint,
  normalizeHostRejection,
  type StudioHostSessionIdentifierFactories,
} from './host-session.js';
import { applyModelCommand } from './model-commands.js';
import { negotiateCapabilities, type CapabilityNegotiationResult } from './negotiation.js';
import { compileProfileSchema, type CompiledSchemaValidator } from './profile-validator.js';
import { StudioSession } from './session.js';
import {
  assertBlueprintWithinSessionPolicy,
  assertEntryWithinSessionPolicy,
  assertModelWithinSessionPolicy,
} from './session-policy.js';

const AUTHORING_PORT: QualifiedName = 'studio.port/authoring';
const AUTHORING_RESOLVE_TARGET: QualifiedName = 'studio.operation/authoring.resolve-target';
const AUTHORING_LIST_TYPES: QualifiedName = 'studio.operation/authoring.list-types';
const AUTHORING_START: QualifiedName = 'studio.operation/authoring.start';
const AUTHORING_PLAN_SAVE: QualifiedName = 'studio.operation/authoring.plan-save';
const AUTHORING_SAVE_ITEM: QualifiedName = 'studio.operation/authoring.save-item';
const AUTHORING_SAVE_NEW_TYPE_VERSION: QualifiedName =
  'studio.operation/authoring.save-new-type-version';
const AUTHORING_SAVE_AS_NEW_TYPE: QualifiedName = 'studio.operation/authoring.save-as-new-type';

const schemaDependencies = [
  commonSchema,
  authoringTargetSchema,
  reusableContentTypeSchema,
  contentModelSchema,
  blueprintSchema,
  entrySchema,
  authoringSessionSchema,
  authoringSaveSchema,
] as const;

const validateResolveRequest = compileReference(
  'https://schemas.kumwe.org/studio/v1/authoring-target.schema.json#/$defs/resolveRequest',
) as unknown as ContractValidator<AuthoringTargetResolveRequest>;
const validateTargetResolution = compileReference(
  'https://schemas.kumwe.org/studio/v1/authoring-target.schema.json#/$defs/resolution',
) as unknown as ContractValidator<AuthoringTargetResolution>;
const validateTypeListQuery = compileReference(
  'https://schemas.kumwe.org/studio/v1/reusable-content-type.schema.json#/$defs/listQuery',
) as unknown as ContractValidator<AuthoringTypeListQuery>;
const validateTypeListPage = compileReference(
  'https://schemas.kumwe.org/studio/v1/reusable-content-type.schema.json#/$defs/listPage',
) as unknown as ContractValidator<AuthoringTypeListPage>;
const validateStartRequest = compileReference(
  'https://schemas.kumwe.org/studio/v1/authoring-session.schema.json#/$defs/startRequest',
) as unknown as ContractValidator<AuthoringStartRequest>;
const validateSessionSnapshot = compileReference(
  'https://schemas.kumwe.org/studio/v1/authoring-session.schema.json#/$defs/snapshot',
) as unknown as ContractValidator<AuthoringSessionSnapshot>;
const validateSaveIntent = compileReference(
  'https://schemas.kumwe.org/studio/v1/authoring-save.schema.json#/$defs/saveIntent',
) as unknown as ContractValidator<AuthoringSaveIntent>;
const validateSavePlan = compileReference(
  'https://schemas.kumwe.org/studio/v1/authoring-save.schema.json#/$defs/savePlan',
) as unknown as ContractValidator<AuthoringSavePlan>;
const validateSaveResult = compileReference(
  'https://schemas.kumwe.org/studio/v1/authoring-save.schema.json#/$defs/saveResult',
) as unknown as ContractValidator<AuthoringSaveResult>;

interface ContractValidator<TValue> {
  validate(instance: unknown): instance is TValue;
}

/**
 * Check an untrusted value against the complete canonical contextual-project
 * schema. The guard performs no authorization and returns no host authority;
 * callers still decide whether the referenced blocks and capabilities are
 * available in their runtime.
 */
export function isAuthoringSessionSnapshot(value: unknown): value is AuthoringSessionSnapshot {
  return validateSessionSnapshot.validate(value);
}

/** Check an untrusted value against the canonical host save-intent shape. */
export function isAuthoringSaveIntent(value: unknown): value is AuthoringSaveIntent {
  return validateSaveIntent.validate(value);
}

export interface OpenContextualStudioSessionOptions {
  /** The same resolved configuration that binds locale, actor, context and generation. */
  configuration: StudioConfiguration;
  /** Injected deterministic identifiers; core reads no clock or random source. */
  identifiers: StudioHostSessionIdentifierFactories;
  /** The exact target/resource request resolved before any artifacts are started. */
  target: AuthoringTargetResolveRequest;
  /** Blank, reusable-type, or existing-item start for that same target and resource. */
  start: AuthoringStartRequest;
}

export interface PreflightContextualStudioSessionOptions {
  /** The same resolved configuration that binds locale, actor, context and generation. */
  configuration: StudioConfiguration;
  /** Injected deterministic identifiers; core reads no clock or random source. */
  identifiers: StudioHostSessionIdentifierFactories;
  /** The exact target/resource request authorized before a start is selected. */
  target: AuthoringTargetResolveRequest;
}

export interface StudioContextualArtifactStateVersions {
  readonly blueprint: number;
  readonly entry: number;
  readonly model: number;
}

export interface StudioContextualDirtyArtifacts {
  readonly blueprint: boolean;
  readonly entry: boolean;
  readonly model: boolean;
}

export type StudioContextualSaveIntentOptions =
  | {
      /** Include a separately authorized item-local Blueprint, never a reusable-type mutation. */
      readonly includeItemBlueprint?: boolean;
      readonly outcome: 'save-item';
    }
  | { readonly outcome: 'save-new-type-version' }
  | {
      readonly authoringPolicy: ReusableContentTypeDefinition['authoringPolicy'];
      readonly label: MessageReference;
      readonly outcome: 'save-as-new-type';
    };

/**
 * One DOM-free, resource-bound editing state. The three drafts stay separate,
 * carry independent state versions, and accept only commands for the modes the
 * host resolved. Durable effects remain on the host-session handle.
 */
export interface StudioContextualSession {
  readonly blueprint: BlueprintDocument;
  readonly blueprintSession: StudioSession;
  readonly coordinates: AuthoringArtifactCoordinates;
  readonly dirty: StudioContextualDirtyArtifacts;
  readonly entry: EntryDocument;
  readonly model: ContentModelDocument;
  readonly snapshot: AuthoringSessionSnapshot;
  readonly stateVersions: StudioContextualArtifactStateVersions;
  createSaveIntent(options: StudioContextualSaveIntentOptions): AuthoringSaveIntent;
  executeBlueprint(command: BlueprintCommand): BlueprintDocument;
  executeEntry(command: SetFieldValueCommand): EntryDocument;
  executeModel(command: AddModelFieldCommand): ContentModelDocument;
  setPresentation(presentation: AuthoringPresentationState): AuthoringPresentationState;
}

export interface StudioContextualTypeCatalog {
  list(query: AuthoringTypeListQuery): Promise<HostPortResult<AuthoringTypeListPage>>;
}

/** A resolved target that has not yet hydrated blank, reusable-type, or existing drafts. */
export interface StudioContextualPreflightHandle {
  readonly diagnostics: readonly StudioDiagnostic[];
  readonly disposed: boolean;
  readonly invalidated: boolean;
  readonly negotiation: CapabilityNegotiationResult;
  readonly resolution: AuthoringTargetResolution;
  readonly started: boolean;
  readonly types: StudioContextualTypeCatalog | undefined;
  dispose(): void;
  start(request: AuthoringStartRequest): Promise<StudioContextualHostSessionHandle>;
}

export interface StudioContextualHostSessionHandle {
  readonly diagnostics: readonly StudioDiagnostic[];
  readonly disposed: boolean;
  readonly invalidated: boolean;
  readonly negotiation: CapabilityNegotiationResult;
  readonly resolution: AuthoringTargetResolution;
  readonly session: StudioContextualSession;
  readonly types: StudioContextualTypeCatalog | undefined;
  dispose(): void;
  planSave(intent: AuthoringSaveIntent): Promise<HostPortResult<AuthoringSavePlan>>;
  save(
    intent: AuthoringSaveIntent,
    plan: AuthoringSavePlan,
    acceptedConsequences?: readonly QualifiedName[],
  ): Promise<HostPortResult<AuthoringSaveResult>>;
}

/**
 * Opens the additive coordinated profile without changing the legacy
 * Blueprint-only `openStudioSession` contract. Target resolution and start are
 * explicit host calls; core never guesses an artifact or creates persistence.
 */
export async function openContextualStudioSession(
  adapter: HostAdapter,
  options: Readonly<OpenContextualStudioSessionOptions>,
): Promise<StudioContextualHostSessionHandle> {
  assertOpeningRequests(options.configuration, options.target, options.start);
  const preflight = await preflightContextualStudioSession(adapter, {
    configuration: options.configuration,
    identifiers: options.identifiers,
    target: options.target,
  });
  try {
    return await preflight.start(options.start);
  } catch (error) {
    preflight.dispose();
    throw error;
  }
}

/**
 * Resolve one target without prematurely choosing a create source. Interactive
 * shells use this to present only the host-authorized blank/from-type choices;
 * the convenience opener above uses the same path and immediately starts.
 */
export async function preflightContextualStudioSession(
  adapter: HostAdapter,
  options: Readonly<PreflightContextualStudioSessionOptions>,
): Promise<StudioContextualPreflightHandle> {
  const configuration = cloneContractValue(options.configuration);
  const targetRequest = cloneContractValue(options.target);
  assertPreflightRequest(configuration, targetRequest);

  const negotiation = negotiateCapabilities(configuration.hostCapabilities, {
    requiredPorts: [AUTHORING_PORT],
    supportedProtocolVersions: [configuration.protocolVersion],
  });
  if (configuration.sessionState === 'read-only') {
    negotiation.sessionState = 'read-only';
  }
  const authoring = appendOpeningOperationDiagnostics(adapter, configuration, negotiation);
  throwIfBlocked(negotiation, 'The resolved configuration cannot open contextual authoring.');
  if (authoring === undefined) {
    throw new StudioHostSessionError(
      'configuration-blocked',
      'The resolved configuration has no contextual authoring adapter.',
      negotiation.diagnostics,
    );
  }

  const identifiers = new SessionIdentifierAllocator(options.identifiers);
  try {
    const resolutionResult: unknown = await invokeOpeningCall(() =>
      authoring.resolveTarget(
        targetRequest,
        createContext(configuration, identifiers.requestId(AUTHORING_RESOLVE_TARGET), {
          operationId: AUTHORING_RESOLVE_TARGET,
        }),
      ),
    );
    const resolution = readResultValue<AuthoringTargetResolution>(
      resolutionResult,
      validateTargetResolution,
      'studio.host/unexpected-authoring-target',
      'The authoring port returned a malformed target resolution.',
    );
    assertResolvedTarget(configuration, targetRequest, resolution);
    appendResolvedOperationDiagnostics(configuration, negotiation, resolution);
    throwIfBlocked(
      negotiation,
      'The resolved target cannot provide its declared authoring profile.',
    );

    return new BoundContextualPreflight(
      authoring,
      configuration,
      identifiers,
      negotiation,
      targetRequest,
      resolution,
    );
  } catch (error) {
    identifiers.dispose();
    throw error;
  }
}

class BoundContextualPreflight implements StudioContextualPreflightHandle {
  public readonly diagnostics: readonly StudioDiagnostic[];
  public readonly negotiation: CapabilityNegotiationResult;
  public readonly resolution: AuthoringTargetResolution;
  public readonly types: StudioContextualTypeCatalog | undefined;

  readonly #authoring: AuthoringPort;
  readonly #configuration: StudioConfiguration;
  readonly #identifiers: SessionIdentifierAllocator;
  readonly #targetRequest: AuthoringTargetResolveRequest;
  #disposed = false;
  #invalidationFailure: HostPortFailure | undefined;
  #startIdempotencyKeys = new Map<string, string>();
  #startActive = false;
  #started = false;

  public constructor(
    authoring: AuthoringPort,
    configuration: StudioConfiguration,
    identifiers: SessionIdentifierAllocator,
    negotiation: CapabilityNegotiationResult,
    targetRequest: AuthoringTargetResolveRequest,
    resolution: AuthoringTargetResolution,
  ) {
    this.#authoring = authoring;
    this.#configuration = configuration;
    this.#identifiers = identifiers;
    this.#targetRequest = cloneContractValue(targetRequest);
    this.negotiation = cloneNegotiation(negotiation);
    this.diagnostics = cloneContractValue(negotiation.diagnostics);
    this.resolution = cloneContractValue(resolution);
    this.types = operationAdvertised(configuration, AUTHORING_LIST_TYPES)
      ? Object.freeze({ list: (query: AuthoringTypeListQuery) => this.#listTypes(query) })
      : undefined;
  }

  public get disposed(): boolean {
    return this.#disposed;
  }

  public get invalidated(): boolean {
    return this.#invalidationFailure !== undefined;
  }

  public get started(): boolean {
    return this.#started;
  }

  public dispose(): void {
    if (this.#disposed || this.#started) return;
    this.#disposed = true;
    this.#startIdempotencyKeys.clear();
    this.#identifiers.dispose();
  }

  public async start(request: AuthoringStartRequest): Promise<StudioContextualHostSessionHandle> {
    this.#assertActive();
    if (this.#startActive) {
      throw new StudioHostSessionError(
        'invalid-authoring-request',
        'A contextual Studio start is already active for this resolved target.',
      );
    }
    const startRequest = cloneContractValue(request);
    assertOpeningRequests(this.#configuration, this.#targetRequest, startRequest);
    assertStartAllowed(this.resolution, startRequest);
    const fingerprint = mutationFingerprint(
      startRequest as unknown as JsonValue,
      this.#configuration,
    );
    let idempotencyKey = this.#startIdempotencyKeys.get(fingerprint);
    if (idempotencyKey === undefined) {
      idempotencyKey = this.#identifiers.idempotencyKey(AUTHORING_START, fingerprint);
      this.#startIdempotencyKeys.set(fingerprint, idempotencyKey);
    }
    this.#startActive = true;
    try {
      const startResult: unknown = await this.#invoke(() =>
        this.#authoring.start(
          startRequest,
          createContext(this.#configuration, this.#identifiers.requestId(AUTHORING_START), {
            idempotencyKey,
            operationId: AUTHORING_START,
          }),
        ),
      );
      const snapshot = readResultValue<AuthoringSessionSnapshot>(
        startResult,
        validateSessionSnapshot,
        'studio.host/unexpected-authoring-session',
        'The authoring port returned a malformed contextual session.',
      );
      assertOpeningSnapshot(this.#configuration, this.resolution, startRequest, snapshot);
      this.#started = true;
      this.#startIdempotencyKeys.clear();
      return new BoundContextualHostSession(
        this.#authoring,
        this.#configuration,
        this.#identifiers,
        this.negotiation,
        this.resolution,
        snapshot,
      );
    } finally {
      this.#startActive = false;
    }
  }

  async #listTypes(query: AuthoringTypeListQuery): Promise<HostPortResult<AuthoringTypeListPage>> {
    this.#assertActive();
    return listContextualTypes(
      this.#authoring,
      this.#configuration,
      this.#identifiers,
      this.resolution,
      (operation) => this.#invoke(operation),
      query,
    );
  }

  #assertActive(): void {
    if (this.#invalidationFailure !== undefined) throw this.#invalidationFailure;
    if (this.#started) {
      throw new StudioHostSessionError(
        'disposed',
        'The contextual Studio preflight has already transferred ownership to a session.',
      );
    }
    if (this.#disposed) {
      throw new StudioHostSessionError('disposed', 'The contextual Studio preflight is disposed.');
    }
  }

  async #invoke<TValue>(operation: () => Promise<TValue>): Promise<TValue> {
    this.#assertActive();
    try {
      return await operation();
    } catch (error) {
      const failure = normalizeHostRejection(error);
      if (isStaleGenerationFailure(failure)) this.#invalidationFailure = failure;
      throw failure;
    }
  }
}

class BoundContextualDraftSession implements StudioContextualSession {
  readonly #limits: StudioConfiguration['limits'];
  readonly #maximumHistoryEntries: number;
  readonly #permissions: readonly QualifiedName[];
  readonly #readOnly: boolean;
  #blueprintSession!: StudioSession;
  #entry!: EntryDocument;
  #entryStateVersion = 0;
  #initialDirty = new Set<'blueprint' | 'entry' | 'model'>();
  #model!: ContentModelDocument;
  #modelStateVersion = 0;
  #presentation!: AuthoringPresentationState;
  #snapshot!: AuthoringSessionSnapshot;

  public constructor(snapshot: AuthoringSessionSnapshot, configuration: StudioConfiguration) {
    this.#limits = cloneContractValue(configuration.limits);
    this.#maximumHistoryEntries = configuration.limits.maxHistoryEntries;
    this.#permissions = cloneContractValue(configuration.permissions);
    this.#readOnly = configuration.sessionState === 'read-only';
    this.acceptHostSnapshot(snapshot);
  }

  public get blueprint(): BlueprintDocument {
    return cloneContractValue(this.#blueprintSession.document);
  }

  public get blueprintSession(): StudioSession {
    return this.#blueprintSession;
  }

  public get coordinates(): AuthoringArtifactCoordinates {
    return cloneContractValue(this.#snapshot.state.coordinates);
  }

  public get dirty(): StudioContextualDirtyArtifacts {
    return Object.freeze({
      blueprint: this.#initialDirty.has('blueprint') || this.#blueprintSession.dirty,
      entry: this.#initialDirty.has('entry') || this.#entryStateVersion > 0,
      model: this.#initialDirty.has('model') || this.#modelStateVersion > 0,
    });
  }

  public get entry(): EntryDocument {
    return cloneContractValue(this.#entry);
  }

  public get model(): ContentModelDocument {
    return cloneContractValue(this.#model);
  }

  public get snapshot(): AuthoringSessionSnapshot {
    const dirty = this.dirty;
    return cloneContractValue({
      ...this.#snapshot,
      presentation: {
        ...this.#snapshot.presentation,
        current: this.#presentation,
      },
      state: {
        ...this.#snapshot.state,
        blueprint: this.#blueprintSession.document,
        dirty: (['model', 'blueprint', 'entry'] as const).filter((kind) => dirty[kind]),
        entry: this.#entry,
        model: this.#model,
      },
    });
  }

  public get stateVersions(): StudioContextualArtifactStateVersions {
    return Object.freeze({
      blueprint: this.#blueprintSession.stateVersion,
      entry: this.#entryStateVersion,
      model: this.#modelStateVersion,
    });
  }

  /** @internal Last host-accepted state before local draft overlays. */
  public get acceptedSnapshot(): AuthoringSessionSnapshot {
    return cloneContractValue(this.#snapshot);
  }

  public createSaveIntent(options: StudioContextualSaveIntentOptions): AuthoringSaveIntent {
    this.#assertSaveOutcome(options.outcome);
    const common = {
      contractVersion: this.#snapshot.contractVersion,
      expected: this.coordinates,
      kind: 'authoring-save-intent' as const,
      sessionId: this.#snapshot.sessionId,
    };
    let intent: AuthoringSaveIntent;
    switch (options.outcome) {
      case 'save-item': {
        const includeItemBlueprint = options.includeItemBlueprint ?? false;
        if (includeItemBlueprint && !this.#allowsItemComposition()) {
          throw new StudioHostSessionError(
            'invalid-authoring-request',
            'This session does not authorize item-local Blueprint composition.',
          );
        }
        intent = {
          ...common,
          draft: {
            outcome: 'save-item',
            entry: this.entry,
            ...(includeItemBlueprint ? { itemBlueprint: this.blueprint } : {}),
          },
        };
        break;
      }
      case 'save-new-type-version':
        if (this.#snapshot.type === undefined) {
          throw new StudioHostSessionError(
            'invalid-authoring-request',
            'Saving a new type version requires an existing reusable content type.',
          );
        }
        intent = {
          ...common,
          draft: {
            blueprint: this.blueprint,
            model: this.model,
            outcome: 'save-new-type-version',
          },
        };
        break;
      case 'save-as-new-type':
        intent = {
          ...common,
          draft: {
            authoringPolicy: cloneContractValue(options.authoringPolicy),
            blueprint: this.blueprint,
            label: cloneContractValue(options.label),
            model: this.model,
            outcome: 'save-as-new-type',
          },
        };
        break;
    }
    if (!validateSaveIntent.validate(intent)) {
      throw new StudioHostSessionError(
        'invalid-authoring-request',
        'The requested save intent is outside the canonical authoring-save contract.',
      );
    }
    return cloneContractValue(intent);
  }

  public executeBlueprint(command: BlueprintCommand): BlueprintDocument {
    this.#assertWritableMode('blueprint');
    return cloneContractValue(this.#blueprintSession.execute(cloneContractValue(command)));
  }

  public executeEntry(command: SetFieldValueCommand): EntryDocument {
    this.#assertWritableMode('content');
    this.#assertCommandFence(
      command,
      this.#entry.id,
      this.#entry.revision,
      this.#entryStateVersion,
    );
    const next = applyEntryCommand(this.#entry, cloneContractValue(command));
    assertEntryWithinSessionPolicy(next, this.#limits);
    this.#entry = next;
    this.#entryStateVersion += 1;
    return this.entry;
  }

  public executeModel(command: AddModelFieldCommand): ContentModelDocument {
    this.#assertWritableMode('model');
    this.#assertCommandFence(
      command,
      this.#model.id,
      this.#model.revision,
      this.#modelStateVersion,
    );
    const next = applyModelCommand(this.#model, cloneContractValue(command));
    assertModelWithinSessionPolicy(next, this.#limits);
    this.#model = next;
    this.#modelStateVersion += 1;
    return this.model;
  }

  public setPresentation(presentation: AuthoringPresentationState): AuthoringPresentationState {
    if (!this.#snapshot.capabilities.presentationStates.includes(presentation)) {
      throw new StudioHostSessionError(
        'invalid-authoring-request',
        `The resolved contextual session does not support the ${presentation} presentation.`,
      );
    }
    this.#presentation = presentation;
    return this.#presentation;
  }

  /** @internal Replaces drafts only with a fully validated host-accepted snapshot. */
  public acceptHostSnapshot(snapshot: AuthoringSessionSnapshot): void {
    assertBlueprintWithinSessionPolicy(snapshot.state.blueprint, this.#limits);
    assertEntryWithinSessionPolicy(snapshot.state.entry, this.#limits);
    assertModelWithinSessionPolicy(snapshot.state.model, this.#limits);
    const previousSelection = this.#blueprintSession?.selection ?? [];
    this.#snapshot = cloneContractValue(snapshot);
    this.#model = cloneContractValue(snapshot.state.model);
    this.#entry = cloneContractValue(snapshot.state.entry);
    this.#presentation = snapshot.presentation.current;
    this.#modelStateVersion = 0;
    this.#entryStateVersion = 0;
    this.#initialDirty = new Set(snapshot.state.dirty);
    this.#blueprintSession = new StudioSession({
      document: cloneContractValue(snapshot.state.blueprint),
      limits: this.#limits,
      maximumHistoryEntries: this.#maximumHistoryEntries,
      mode: resolveBlueprintDraftMode(snapshot, this.#readOnly),
      permissions: this.#permissions,
      sessionGeneration: snapshot.sessionGeneration,
    });
    this.#blueprintSession.markSaved(snapshot.state.blueprint.revision);
    const retainedSelection = previousSelection.filter((nodeId) =>
      containsNode(this.#blueprintSession.document.roots, nodeId),
    );
    if (retainedSelection.length > 0) {
      this.#blueprintSession.select(retainedSelection);
    }
  }

  #allowsItemComposition(): boolean {
    return this.#snapshot.type === undefined
      ? this.#snapshot.start.kind === 'blank'
      : this.#snapshot.type.authoringPolicy.itemComposition === 'overrides';
  }

  #assertCommandFence(
    command: {
      readonly artifactId: string;
      readonly baseStateVersion: number;
      readonly expectedRevision?: Revision;
      readonly sessionGeneration: Revision;
    },
    artifactId: string,
    acceptedRevision: Revision,
    stateVersion: number,
  ): void {
    if (command.sessionGeneration !== this.#snapshot.sessionGeneration) {
      throw new StudioCommandError(
        'stale-generation',
        'The command generation does not match the contextual session generation.',
      );
    }
    if (command.artifactId !== artifactId) {
      throw new StudioCommandError(
        'node-not-found',
        `Command targets ${command.artifactId}, not ${artifactId}.`,
      );
    }
    if (command.baseStateVersion !== stateVersion) {
      throw new StudioCommandError(
        'stale-state',
        `Command state ${String(command.baseStateVersion)} does not match ${String(stateVersion)}.`,
      );
    }
    if (command.expectedRevision !== undefined && command.expectedRevision !== acceptedRevision) {
      throw new StudioCommandError(
        'stale-state',
        `Command expects revision ${command.expectedRevision}, but the session holds ${acceptedRevision}.`,
      );
    }
  }

  #assertSaveOutcome(outcome: AuthoringSaveOutcome): void {
    if (this.#readOnly) {
      throw new StudioHostSessionError(
        'read-only-session',
        'A read-only contextual session cannot create a save intent.',
      );
    }
    if (!this.#snapshot.capabilities.saveOutcomes.includes(outcome)) {
      throw new StudioHostSessionError(
        'invalid-authoring-request',
        `The resolved contextual session does not support ${outcome}.`,
      );
    }
  }

  #assertWritableMode(mode: 'blueprint' | 'content' | 'model'): void {
    if (this.#readOnly) {
      throw new StudioCommandError(
        'read-only-session',
        'A read-only contextual session never applies a persistent command.',
      );
    }
    if (!this.#snapshot.capabilities.modes.includes(mode)) {
      throw new StudioCommandError(
        'mode-forbidden',
        `The resolved contextual session does not permit ${mode} commands.`,
      );
    }
  }
}

class BoundContextualHostSession implements StudioContextualHostSessionHandle {
  public readonly diagnostics: readonly StudioDiagnostic[];
  public readonly negotiation: CapabilityNegotiationResult;
  public readonly resolution: AuthoringTargetResolution;
  public readonly session: StudioContextualSession;
  public readonly types: StudioContextualTypeCatalog | undefined;

  readonly #authoring: AuthoringPort;
  readonly #configuration: StudioConfiguration;
  readonly #draftSession: BoundContextualDraftSession;
  readonly #identifiers: SessionIdentifierAllocator;
  readonly #plannedIntents = new Map<string, string>();
  readonly #retryIntents = new Map<QualifiedName, RetryIntent>();
  #disposed = false;
  #invalidationFailure: HostPortFailure | undefined;
  #saveTail: Promise<void> = Promise.resolve();

  public constructor(
    authoring: AuthoringPort,
    configuration: StudioConfiguration,
    identifiers: SessionIdentifierAllocator,
    negotiation: CapabilityNegotiationResult,
    resolution: AuthoringTargetResolution,
    snapshot: AuthoringSessionSnapshot,
  ) {
    this.#authoring = authoring;
    this.#configuration = configuration;
    this.#identifiers = identifiers;
    this.negotiation = cloneNegotiation(negotiation);
    this.diagnostics = cloneContractValue(negotiation.diagnostics);
    this.resolution = cloneContractValue(resolution);
    this.#draftSession = new BoundContextualDraftSession(snapshot, configuration);
    this.session = this.#draftSession;
    this.types = operationAdvertised(configuration, AUTHORING_LIST_TYPES)
      ? Object.freeze({
          list: (query: AuthoringTypeListQuery) => this.#listTypes(query),
        })
      : undefined;
  }

  public get disposed(): boolean {
    return this.#disposed;
  }

  public get invalidated(): boolean {
    return this.#invalidationFailure !== undefined;
  }

  public dispose(): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    this.#plannedIntents.clear();
    this.#retryIntents.clear();
    this.#identifiers.dispose();
  }

  public async planSave(intent: AuthoringSaveIntent): Promise<HostPortResult<AuthoringSavePlan>> {
    this.#assertActive();
    this.#assertCurrentIntent(intent);
    const intentSnapshot = cloneContractValue(intent);
    const context = createContext(
      this.#configuration,
      this.#identifiers.requestId(AUTHORING_PLAN_SAVE),
      { operationId: AUTHORING_PLAN_SAVE },
    );
    const result: unknown = await this.#invoke(() =>
      this.#authoring.planSave(intentSnapshot, context),
    );
    const plan = readResultValue<AuthoringSavePlan>(
      result,
      validateSavePlan,
      'studio.host/unexpected-authoring-save-plan',
      'The authoring port returned a malformed save plan.',
    );
    assertPlanMatchesIntent(plan, intentSnapshot);
    this.#plannedIntents.set(planKey(plan), canonical(intentSnapshot));
    return {
      ...(isResultWithRevision(result) ? { revision: result.revision } : {}),
      value: cloneContractValue(plan),
    };
  }

  public save(
    intent: AuthoringSaveIntent,
    plan: AuthoringSavePlan,
    acceptedConsequences: readonly QualifiedName[] = [],
  ): Promise<HostPortResult<AuthoringSaveResult>> {
    try {
      this.#assertActive();
      this.#assertCurrentIntent(intent);
      assertPlanMatchesIntent(plan, intent);
      if (this.#plannedIntents.get(planKey(plan)) !== canonical(intent)) {
        throw new StudioHostSessionError(
          'save-plan-mismatch',
          'The save plan was not produced for this exact current intent.',
        );
      }
      assertAcceptedConsequences(plan, acceptedConsequences);
      const intentSnapshot = cloneContractValue(intent);
      const planSnapshot = cloneContractValue(plan);
      const request = createSaveRequest(intentSnapshot, planSnapshot, acceptedConsequences);
      const operationId = saveOperation(intentSnapshot.draft.outcome);
      const scheduled = this.#saveTail.then(() =>
        this.#commit(operationId, intentSnapshot, request, planSnapshot),
      );
      this.#saveTail = scheduled.then(
        () => undefined,
        () => undefined,
      );
      return scheduled;
    } catch (error) {
      return Promise.reject(
        error instanceof Error
          ? error
          : new Error('The contextual Studio session failed with a non-Error rejection.'),
      );
    }
  }

  async #commit(
    operationId: QualifiedName,
    intent: AuthoringSaveIntent,
    request:
      AuthoringSaveAsNewTypeRequest | AuthoringSaveItemRequest | AuthoringSaveNewTypeVersionRequest,
    plan: AuthoringSavePlan,
  ): Promise<HostPortResult<AuthoringSaveResult>> {
    this.#assertActive();
    this.#assertCurrentIntent(intent);
    assertPlanMatchesIntent(plan, intent);
    if (this.#plannedIntents.get(planKey(plan)) !== canonical(intent)) {
      throw new StudioHostSessionError(
        'save-plan-mismatch',
        'The save plan is no longer valid for the current contextual draft.',
      );
    }
    const fingerprint = mutationFingerprint(request as unknown as JsonValue, this.#configuration);
    const idempotencyKey = this.#mutationKey(operationId, fingerprint);
    const context = createContext(this.#configuration, this.#identifiers.requestId(operationId), {
      idempotencyKey,
      operationId,
    });
    const result: unknown = await this.#invoke(() => {
      switch (request.kind) {
        case 'authoring-save-item-request':
          return this.#authoring.saveItem(request, context);
        case 'authoring-save-new-type-version-request':
          return this.#authoring.saveNewTypeVersion(request, context);
        case 'authoring-save-as-new-type-request':
          return this.#authoring.saveAsNewType(request, context);
      }
    });
    const saved = readResultValue<AuthoringSaveResult>(
      result,
      validateSaveResult,
      'studio.host/unexpected-authoring-save-result',
      'The authoring port returned a malformed save result.',
    );
    const prior = this.#draftSession.snapshot;
    const acceptedBase = this.#draftSession.acceptedSnapshot;
    assertSaveResult(plan, request, saved, prior, acceptedBase);
    const reconciled = reconcileExcludedDrafts(saved, request, prior);
    this.#draftSession.acceptHostSnapshot(reconciled.session);
    this.#plannedIntents.clear();
    this.#clearMutationKey(operationId, fingerprint);
    return {
      ...(isResultWithRevision(result) ? { revision: result.revision } : {}),
      value: cloneContractValue(reconciled),
    };
  }

  async #listTypes(query: AuthoringTypeListQuery): Promise<HostPortResult<AuthoringTypeListPage>> {
    this.#assertActive();
    return listContextualTypes(
      this.#authoring,
      this.#configuration,
      this.#identifiers,
      this.resolution,
      (operation) => this.#invoke(operation),
      query,
    );
  }

  #assertCurrentIntent(intent: AuthoringSaveIntent): void {
    if (!validateSaveIntent.validate(intent)) {
      throw new StudioHostSessionError(
        'invalid-authoring-request',
        'The save intent is outside the canonical authoring-save contract.',
      );
    }
    const expected = this.#draftSession.createSaveIntent(optionsFromIntent(intent));
    if (canonical(intent) !== canonical(expected)) {
      throw new StudioHostSessionError(
        'save-plan-mismatch',
        'The save intent no longer matches the current resource-bound drafts and revisions.',
      );
    }
  }

  #assertActive(): void {
    if (this.#invalidationFailure !== undefined) {
      throw this.#invalidationFailure;
    }
    if (this.#disposed) {
      throw new StudioHostSessionError('disposed', 'The contextual Studio session is disposed.');
    }
  }

  #clearMutationKey(operationId: QualifiedName, fingerprint: string): void {
    if (this.#retryIntents.get(operationId)?.fingerprint === fingerprint) {
      this.#retryIntents.delete(operationId);
    }
  }

  async #invoke<TValue>(operation: () => Promise<TValue>): Promise<TValue> {
    this.#assertActive();
    try {
      return await operation();
    } catch (error) {
      const failure = normalizeHostRejection(error);
      if (isStaleGenerationFailure(failure)) {
        this.#invalidationFailure = failure;
      }
      throw failure;
    }
  }

  #mutationKey(operationId: QualifiedName, fingerprint: string): string {
    const prior = this.#retryIntents.get(operationId);
    if (prior?.fingerprint === fingerprint) {
      return prior.idempotencyKey;
    }
    const idempotencyKey = this.#identifiers.idempotencyKey(operationId, fingerprint);
    this.#retryIntents.set(operationId, { fingerprint, idempotencyKey });
    return idempotencyKey;
  }
}

async function listContextualTypes(
  authoring: AuthoringPort,
  configuration: StudioConfiguration,
  identifiers: SessionIdentifierAllocator,
  resolution: AuthoringTargetResolution,
  invoke: <TValue>(operation: () => Promise<TValue>) => Promise<TValue>,
  query: AuthoringTypeListQuery,
): Promise<HostPortResult<AuthoringTypeListPage>> {
  if (
    !validateTypeListQuery.validate(query) ||
    query.targetId !== resolution.target.id ||
    !equal(query.resourceContext, resolution.resourceContext)
  ) {
    throw new StudioHostSessionError(
      'invalid-authoring-request',
      'A type query must be canonical and target this exact contextual resource.',
    );
  }
  const querySnapshot = cloneContractValue(query);
  const result: unknown = await invoke(() =>
    authoring.listTypes(
      querySnapshot,
      createContext(configuration, identifiers.requestId(AUTHORING_LIST_TYPES), {
        operationId: AUTHORING_LIST_TYPES,
      }),
    ),
  );
  const page = readResultValue<AuthoringTypeListPage>(
    result,
    validateTypeListPage,
    'studio.host/unexpected-authoring-type-page',
    'The authoring port returned a malformed reusable-type page.',
  );
  if (page.items.length > query.limit || hasDuplicateTypeCoordinates(page)) {
    throw adapterContractFailure(
      'studio.host/unexpected-authoring-type-page',
      'The authoring port returned an oversized or duplicate reusable-type page.',
    );
  }
  return {
    ...(isResultWithRevision(result) ? { revision: result.revision } : {}),
    value: cloneContractValue(page),
  };
}

interface RetryIntent {
  readonly fingerprint: string;
  readonly idempotencyKey: string;
}

function compileReference(reference: string): CompiledSchemaValidator {
  return compileProfileSchema(
    { $ref: reference, $schema: 'https://json-schema.org/draft/2020-12/schema' },
    { schemas: [...schemaDependencies] },
  );
}

function assertOpeningRequests(
  configuration: StudioConfiguration,
  target: AuthoringTargetResolveRequest,
  start: AuthoringStartRequest,
): void {
  assertPreflightRequest(configuration, target);
  if (!validateStartRequest.validate(start)) {
    throw new StudioHostSessionError(
      'invalid-authoring-request',
      'Contextual opening requires a canonical start request.',
    );
  }
  if (target.targetId !== start.targetId || !equal(target.resourceContext, start.resourceContext)) {
    throw new StudioHostSessionError(
      'invalid-authoring-request',
      'Target resolution, start, and configuration must bind the same exact resource context.',
    );
  }
  const expectedIntent = start.source.kind === 'existing' ? 'edit' : 'create';
  if (target.intent !== expectedIntent) {
    throw new StudioHostSessionError(
      'invalid-authoring-request',
      `The ${start.source.kind} start requires the ${expectedIntent} target intent.`,
    );
  }
  if (
    target.requestedPresentation !== undefined &&
    start.presentation !== undefined &&
    target.requestedPresentation !== start.presentation
  ) {
    throw new StudioHostSessionError(
      'invalid-authoring-request',
      'The target and start requests name different presentation states.',
    );
  }
}

function assertPreflightRequest(
  configuration: StudioConfiguration,
  target: AuthoringTargetResolveRequest,
): void {
  if (
    !validateResolveRequest.validate(target) ||
    !equal(target.resourceContext, configuration.resourceContext)
  ) {
    throw new StudioHostSessionError(
      'invalid-authoring-request',
      'Contextual preflight requires one canonical target bound to the configured resource context.',
    );
  }
}

function appendOpeningOperationDiagnostics(
  adapter: HostAdapter,
  configuration: StudioConfiguration,
  negotiation: CapabilityNegotiationResult,
): AuthoringPort | undefined {
  for (const operationId of [AUTHORING_RESOLVE_TARGET, AUTHORING_START]) {
    if (!operationAdvertised(configuration, operationId)) {
      negotiation.diagnostics.push(
        createDiagnostic(
          'studio.host/missing-required-operation',
          `The authoring port does not advertise ${operationId}.`,
          'blocking',
          { operationId },
        ),
      );
    }
  }
  if (adapter.authoring === undefined) {
    negotiation.diagnostics.push(
      createDiagnostic(
        'studio.host/adapter-port-unavailable',
        'The host advertises contextual authoring but the adapter does not implement it.',
        'blocking',
        { port: AUTHORING_PORT },
      ),
    );
  }
  return adapter.authoring;
}

function appendResolvedOperationDiagnostics(
  configuration: StudioConfiguration,
  negotiation: CapabilityNegotiationResult,
  resolution: AuthoringTargetResolution,
): void {
  if (resolution.availableStarts.includes('from-type')) {
    requireOperation(configuration, negotiation, AUTHORING_LIST_TYPES);
  }
  if (configuration.sessionState === 'read-only') {
    return;
  }
  if (resolution.target.saveOutcomes.length > 0) {
    requireOperation(configuration, negotiation, AUTHORING_PLAN_SAVE);
  }
  for (const outcome of resolution.target.saveOutcomes) {
    requireOperation(configuration, negotiation, saveOperation(outcome));
  }
}

function requireOperation(
  configuration: StudioConfiguration,
  negotiation: CapabilityNegotiationResult,
  operationId: QualifiedName,
): void {
  if (!operationAdvertised(configuration, operationId)) {
    negotiation.diagnostics.push(
      createDiagnostic(
        'studio.host/missing-required-operation',
        `The resolved authoring target requires ${operationId}.`,
        'blocking',
        { operationId },
      ),
    );
  }
}

function operationAdvertised(
  configuration: StudioConfiguration,
  operationId: QualifiedName,
): boolean {
  return (
    configuration.hostCapabilities.ports
      .find((port) => port.id === AUTHORING_PORT)
      ?.operations.includes(operationId) ?? false
  );
}

function throwIfBlocked(negotiation: CapabilityNegotiationResult, message: string): void {
  if (negotiation.diagnostics.some((diagnostic) => diagnostic.severity === 'blocking')) {
    throw new StudioHostSessionError('configuration-blocked', message, negotiation.diagnostics);
  }
}

function assertResolvedTarget(
  configuration: StudioConfiguration,
  request: AuthoringTargetResolveRequest,
  resolution: AuthoringTargetResolution,
): void {
  const resourceType = resolution.resourceContext.resource?.type;
  if (
    resolution.target.id !== request.targetId ||
    resolution.target.surface !== resolution.resourceContext.surface ||
    !equal(resolution.resourceContext, request.resourceContext) ||
    !equal(resolution.resourceContext, configuration.resourceContext) ||
    !resolution.target.eligibility.includes(request.intent) ||
    !resolution.target.presentationStates.includes(resolution.initialPresentation) ||
    (resourceType !== undefined && !resolution.target.resourceTypes.includes(resourceType)) ||
    (request.requestedPresentation !== undefined &&
      resolution.initialPresentation !== request.requestedPresentation)
  ) {
    throw unexpectedAuthoringResult(
      'studio.host/authoring-target-mismatch',
      'The resolved target does not match the requested resource, intent, or presentation.',
    );
  }
  if (resolution.availableStarts.some((kind) => !resolution.target.startKinds.includes(kind))) {
    throw unexpectedAuthoringResult(
      'studio.host/authoring-target-mismatch',
      'The target resolution offers a start kind the declaration does not authorize.',
    );
  }
}

function assertStartAllowed(
  resolution: AuthoringTargetResolution,
  request: AuthoringStartRequest,
): void {
  if (
    !resolution.availableStarts.includes(request.source.kind) ||
    !resolution.target.startKinds.includes(request.source.kind) ||
    (request.presentation !== undefined &&
      !resolution.target.presentationStates.includes(request.presentation))
  ) {
    throw new StudioHostSessionError(
      'invalid-authoring-request',
      `The resolved target does not authorize the requested ${request.source.kind} start and presentation.`,
    );
  }
}

function assertOpeningSnapshot(
  configuration: StudioConfiguration,
  resolution: AuthoringTargetResolution,
  request: AuthoringStartRequest,
  snapshot: AuthoringSessionSnapshot,
): void {
  // A schema-valid host document can still exceed the lower limits negotiated
  // for this exact session. Reject every coordinated draft before ownership is
  // transferred to a live session (and before the preflight becomes started).
  assertBlueprintWithinSessionPolicy(snapshot.state.blueprint, configuration.limits);
  assertEntryWithinSessionPolicy(snapshot.state.entry, configuration.limits);
  assertModelWithinSessionPolicy(snapshot.state.model, configuration.limits);
  const expectedPresentation = request.presentation ?? resolution.initialPresentation;
  if (
    snapshot.sessionId !== configuration.sessionId ||
    snapshot.sessionGeneration !== configuration.sessionGeneration ||
    !equal(snapshot.target, resolution.target) ||
    !equal(snapshot.resourceContext, resolution.resourceContext) ||
    !equal(snapshot.start, request.source) ||
    snapshot.presentation.current !== expectedPresentation ||
    !equal(snapshot.presentation.returnContext, resolution.returnContext) ||
    !isSubset(snapshot.capabilities.modes, resolution.target.modes) ||
    !isSubset(snapshot.capabilities.presentationStates, resolution.target.presentationStates) ||
    !isSubset(snapshot.capabilities.saveOutcomes, resolution.target.saveOutcomes)
  ) {
    throw unexpectedAuthoringResult(
      'studio.host/authoring-session-mismatch',
      'The started session does not preserve its requested target, resource, generation, or capabilities.',
    );
  }
  assertSnapshotArtifacts(snapshot);
  switch (request.source.kind) {
    case 'blank':
      if (snapshot.type !== undefined || snapshot.state.coordinates.type !== undefined) {
        throw unexpectedAuthoringResult(
          'studio.host/authoring-start-mismatch',
          'A blank start cannot silently bind an existing reusable content type.',
        );
      }
      break;
    case 'from-type':
      if (
        snapshot.type === undefined ||
        !equal(referenceOf(snapshot.type), request.source.type) ||
        !equal(snapshot.state.coordinates.type, request.source.type)
      ) {
        throw unexpectedAuthoringResult(
          'studio.host/authoring-start-mismatch',
          'A from-type start must hydrate the exact requested reusable content type.',
        );
      }
      break;
    case 'existing':
      if (
        resolution.resourceContext.resource === undefined ||
        snapshot.type === undefined ||
        snapshot.state.coordinates.type === undefined
      ) {
        throw unexpectedAuthoringResult(
          'studio.host/authoring-start-mismatch',
          'An existing-item start requires an exact resource and reusable content type.',
        );
      }
      break;
  }
}

function assertSnapshotArtifacts(snapshot: AuthoringSessionSnapshot): void {
  const { coordinates, model, blueprint, entry } = snapshot.state;
  if (
    !matchesLockedDocument(coordinates.model, model) ||
    !matchesLockedDocument(coordinates.blueprint, blueprint) ||
    coordinates.entry.id !== entry.id ||
    coordinates.entry.revision !== entry.revision ||
    !equal(blueprint.model, coordinates.model) ||
    !equal(entry.model, coordinates.model)
  ) {
    throw unexpectedAuthoringResult(
      'studio.host/authoring-artifact-coordinate-mismatch',
      'The Model, Blueprint, and Entry documents do not match their accepted coordinates.',
    );
  }
  if (
    snapshot.type === undefined
      ? coordinates.type !== undefined
      : !equal(referenceOf(snapshot.type), coordinates.type) ||
        !equal(snapshot.type.model, coordinates.model) ||
        (snapshot.type.authoringPolicy.itemComposition === 'denied' &&
          !equal(snapshot.type.blueprint, coordinates.blueprint))
  ) {
    throw unexpectedAuthoringResult(
      'studio.host/authoring-type-coordinate-mismatch',
      'The reusable content type does not match the coordinated artifact coordinates.',
    );
  }
}

function assertPlanMatchesIntent(plan: AuthoringSavePlan, intent: AuthoringSaveIntent): void {
  if (
    plan.contractVersion !== intent.contractVersion ||
    plan.sessionId !== intent.sessionId ||
    plan.outcome !== intent.draft.outcome ||
    !equal(plan.expected, intent.expected)
  ) {
    throw new StudioHostSessionError(
      'save-plan-mismatch',
      'The host save plan does not match the current save intent.',
    );
  }
  const affected = new Set(plan.affectedArtifacts);
  if (intent.draft.outcome === 'save-item') {
    if (
      !affected.has('entry') ||
      affected.has('model') ||
      affected.has('reusable-content-type') ||
      (intent.draft.itemBlueprint === undefined
        ? affected.has('blueprint')
        : !affected.has('blueprint'))
    ) {
      throw new StudioHostSessionError(
        'save-plan-mismatch',
        'A save-item plan may affect only the Entry and an explicitly supplied item Blueprint.',
      );
    }
  } else if (
    affected.has('entry') ||
    !affected.has('model') ||
    !affected.has('blueprint') ||
    !affected.has('reusable-content-type')
  ) {
    throw new StudioHostSessionError(
      'save-plan-mismatch',
      'A reusable-type plan must affect Model, Blueprint, and type, but never Entry values.',
    );
  }
}

function assertAcceptedConsequences(
  plan: AuthoringSavePlan,
  accepted: readonly QualifiedName[],
): void {
  if (new Set(accepted).size !== accepted.length) {
    throw new StudioHostSessionError(
      'invalid-authoring-request',
      'Accepted save consequences must be unique.',
    );
  }
  const consequenceCodes = new Set(plan.consequences.map((entry) => entry.code));
  if (accepted.some((code) => !consequenceCodes.has(code))) {
    throw new StudioHostSessionError(
      'invalid-authoring-request',
      'A save request cannot accept a consequence absent from its plan.',
    );
  }
  if (plan.confirmationRequired && [...consequenceCodes].some((code) => !accepted.includes(code))) {
    throw new StudioHostSessionError(
      'invalid-authoring-request',
      'Every consequence in a confirmation-required plan must be accepted explicitly.',
    );
  }
}

function createSaveRequest(
  intent: AuthoringSaveIntent,
  plan: AuthoringSavePlan,
  acceptedConsequences: readonly QualifiedName[],
): AuthoringSaveAsNewTypeRequest | AuthoringSaveItemRequest | AuthoringSaveNewTypeVersionRequest {
  const common = {
    acceptedConsequences: [...acceptedConsequences],
    contractVersion: intent.contractVersion,
    plan: { id: plan.id, revision: plan.revision },
  };
  switch (intent.draft.outcome) {
    case 'save-item':
      return {
        ...common,
        draft: cloneContractValue(intent.draft),
        kind: 'authoring-save-item-request',
      };
    case 'save-new-type-version':
      return {
        ...common,
        draft: cloneContractValue(intent.draft),
        kind: 'authoring-save-new-type-version-request',
      };
    case 'save-as-new-type':
      return {
        ...common,
        draft: cloneContractValue(intent.draft),
        kind: 'authoring-save-as-new-type-request',
      };
  }
}

function assertSaveResult(
  plan: AuthoringSavePlan,
  request:
    AuthoringSaveAsNewTypeRequest | AuthoringSaveItemRequest | AuthoringSaveNewTypeVersionRequest,
  result: AuthoringSaveResult,
  prior: AuthoringSessionSnapshot,
  acceptedBase: AuthoringSessionSnapshot,
): void {
  if (
    result.contractVersion !== prior.contractVersion ||
    result.outcome !== plan.outcome ||
    !equal(result.plan, { id: plan.id, revision: plan.revision }) ||
    result.session.sessionId !== prior.sessionId ||
    result.session.sessionGeneration !== prior.sessionGeneration ||
    result.session.contractVersion !== prior.contractVersion ||
    !equal(result.session.target, prior.target) ||
    !equal(result.session.resourceContext, prior.resourceContext) ||
    !equal(result.session.start, prior.start) ||
    !equal(result.session.capabilities, prior.capabilities) ||
    (!equal(result.session.presentation, acceptedBase.presentation) &&
      !equal(result.session.presentation, prior.presentation)) ||
    result.session.contributionGeneration !== prior.contributionGeneration
  ) {
    throw adapterContractFailure(
      'studio.host/unexpected-authoring-save-result',
      'The save result does not reconcile the planned resource-bound session.',
    );
  }
  assertSnapshotArtifacts(result.session);
  if (request.kind === 'authoring-save-item-request') {
    if (
      !equal(result.session.state.coordinates.model, acceptedBase.state.coordinates.model) ||
      (!equal(result.session.state.model, acceptedBase.state.model) &&
        !equal(result.session.state.model, prior.state.model)) ||
      (request.draft.itemBlueprint === undefined &&
        (!equal(
          result.session.state.coordinates.blueprint,
          acceptedBase.state.coordinates.blueprint,
        ) ||
          (!equal(result.session.state.blueprint, acceptedBase.state.blueprint) &&
            !equal(result.session.state.blueprint, prior.state.blueprint))))
    ) {
      throw adapterContractFailure(
        'studio.host/unexpected-unaffected-artifact-mutation',
        'A save-item result changed a Model or reusable Blueprint excluded from the request.',
      );
    }
    if (!equal(result.session.type, prior.type)) {
      throw adapterContractFailure(
        'studio.host/unexpected-type-mutation',
        'A save-item result changed the reusable content type excluded from the request.',
      );
    }
  } else {
    const returnedItemState = entryItemState(result.session.state.entry);
    if (
      !equal(returnedItemState, entryItemState(acceptedBase.state.entry)) &&
      !equal(returnedItemState, entryItemState(prior.state.entry))
    ) {
      throw adapterContractFailure(
        'studio.host/unexpected-entry-mutation',
        'A reusable-type save result changed Entry values or item-only state excluded from the request.',
      );
    }
    const acceptedType = result.session.type;
    if (acceptedType === undefined) {
      throw adapterContractFailure(
        'studio.host/missing-accepted-content-type',
        'A reusable-type save result did not return its accepted content type.',
      );
    }
    if (request.kind === 'authoring-save-new-type-version-request') {
      const previousType = prior.type;
      if (
        acceptedType.id !== previousType?.id ||
        acceptedType.version === previousType?.version ||
        acceptedType.revision === previousType?.revision ||
        acceptedType.model.id !== previousType?.model.id ||
        acceptedType.model.revision === previousType?.model.revision ||
        acceptedType.blueprint.id !== previousType?.blueprint.id ||
        acceptedType.blueprint.revision === previousType?.blueprint.revision
      ) {
        throw adapterContractFailure(
          'studio.host/invalid-type-successor',
          'A save-new-type-version result must return immutable successor type, Model, and Blueprint coordinates.',
        );
      }
    } else if (acceptedType.id === prior.type?.id) {
      throw adapterContractFailure(
        'studio.host/invalid-new-type-identity',
        'A save-as-new-type result must return a distinct reusable content type identity.',
      );
    }
  }
}

function entryItemState(entry: EntryDocument): JsonValue {
  return {
    ...(entry.compositionOverrides === undefined
      ? {}
      : { compositionOverrides: entry.compositionOverrides }),
    ...(entry.extensions === undefined ? {} : { extensions: entry.extensions }),
    id: entry.id,
    ...(entry.locale === undefined ? {} : { locale: entry.locale }),
    status: entry.status,
    ...(entry.translationOf === undefined ? {} : { translationOf: entry.translationOf }),
    values: entry.values,
    ...(entry.workflowState === undefined ? {} : { workflowState: entry.workflowState }),
  };
}

function reconcileExcludedDrafts(
  result: AuthoringSaveResult,
  request:
    AuthoringSaveAsNewTypeRequest | AuthoringSaveItemRequest | AuthoringSaveNewTypeVersionRequest,
  prior: AuthoringSessionSnapshot,
): AuthoringSaveResult {
  const reconciled = cloneContractValue(result);
  reconciled.session.presentation = cloneContractValue(prior.presentation);
  const dirty = new Set(reconciled.session.state.dirty);
  if (request.kind === 'authoring-save-item-request') {
    reconciled.session.state.model = cloneContractValue(prior.state.model);
    if (prior.state.dirty.includes('model')) {
      dirty.add('model');
    }
    if (request.draft.itemBlueprint === undefined) {
      reconciled.session.state.blueprint = cloneContractValue(prior.state.blueprint);
      if (prior.state.dirty.includes('blueprint')) {
        dirty.add('blueprint');
      }
    }
  } else {
    const acceptedEntry = reconciled.session.state.entry;
    const localEntry = prior.state.entry;
    const mergedEntry: EntryDocument = {
      ...(localEntry.compositionOverrides === undefined
        ? {}
        : { compositionOverrides: cloneContractValue(localEntry.compositionOverrides) }),
      contractVersion: acceptedEntry.contractVersion,
      ...(localEntry.extensions === undefined
        ? {}
        : { extensions: cloneContractValue(localEntry.extensions) }),
      id: localEntry.id,
      kind: 'entry',
      ...(localEntry.locale === undefined ? {} : { locale: localEntry.locale }),
      model: cloneContractValue(acceptedEntry.model),
      revision: acceptedEntry.revision,
      status: localEntry.status,
      ...(localEntry.translationOf === undefined
        ? {}
        : { translationOf: localEntry.translationOf }),
      values: cloneContractValue(localEntry.values),
      ...(localEntry.workflowState === undefined
        ? {}
        : { workflowState: localEntry.workflowState }),
    };
    reconciled.session.state.entry = mergedEntry;
    if (prior.state.dirty.includes('entry')) {
      dirty.add('entry');
    }
  }
  reconciled.session.state.dirty = (['model', 'blueprint', 'entry'] as const).filter((kind) =>
    dirty.has(kind),
  );
  return reconciled;
}

function optionsFromIntent(intent: AuthoringSaveIntent): StudioContextualSaveIntentOptions {
  switch (intent.draft.outcome) {
    case 'save-item':
      return {
        includeItemBlueprint: intent.draft.itemBlueprint !== undefined,
        outcome: 'save-item',
      };
    case 'save-new-type-version':
      return { outcome: 'save-new-type-version' };
    case 'save-as-new-type':
      return {
        authoringPolicy: cloneContractValue(intent.draft.authoringPolicy),
        label: cloneContractValue(intent.draft.label),
        outcome: 'save-as-new-type',
      };
  }
}

function saveOperation(outcome: AuthoringSaveOutcome): QualifiedName {
  switch (outcome) {
    case 'save-item':
      return AUTHORING_SAVE_ITEM;
    case 'save-new-type-version':
      return AUTHORING_SAVE_NEW_TYPE_VERSION;
    case 'save-as-new-type':
      return AUTHORING_SAVE_AS_NEW_TYPE;
  }
}

function resolveBlueprintDraftMode(
  snapshot: AuthoringSessionSnapshot,
  readOnly: boolean,
): 'blueprint' | 'hybrid' | 'read-only' {
  if (readOnly) {
    return 'read-only';
  }
  if (snapshot.capabilities.modes.includes('blueprint')) {
    return 'blueprint';
  }
  return snapshot.capabilities.modes.includes('content') ? 'hybrid' : 'read-only';
}

function readResultValue<TValue>(
  result: unknown,
  validator: ContractValidator<TValue>,
  diagnosticCode: QualifiedName,
  defaultMessage: string,
): TValue {
  if (
    typeof result !== 'object' ||
    result === null ||
    Array.isArray(result) ||
    !Object.hasOwn(result, 'value') ||
    !validator.validate((result as { value: unknown }).value)
  ) {
    throw adapterContractFailure(diagnosticCode, defaultMessage);
  }
  return cloneContractValue((result as { value: TValue }).value);
}

function isResultWithRevision(value: unknown): value is { revision: Revision } {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    'revision' in value &&
    typeof value.revision === 'string' &&
    value.revision.length >= 1 &&
    value.revision.length <= 200
  );
}

async function invokeOpeningCall<TValue>(operation: () => Promise<TValue>): Promise<TValue> {
  try {
    return await operation();
  } catch (error) {
    throw normalizeHostRejection(error);
  }
}

function unexpectedAuthoringResult(code: QualifiedName, message: string): HostPortFailure {
  return adapterContractFailure(code, message);
}

function matchesLockedDocument(
  reference: { readonly id: string; readonly revision: Revision; readonly version: string },
  document: { readonly id: string; readonly revision: Revision; readonly version: string },
): boolean {
  return (
    reference.id === document.id &&
    reference.version === document.version &&
    reference.revision === document.revision
  );
}

function referenceOf(type: ReusableContentTypeDefinition): {
  readonly id: string;
  readonly revision: Revision;
  readonly version: string;
} {
  return { id: type.id, revision: type.revision, version: type.version };
}

function planKey(plan: AuthoringSavePlan): string {
  return `${plan.id}\u0000${plan.revision}`;
}

function hasDuplicateTypeCoordinates(page: AuthoringTypeListPage): boolean {
  const seen = new Set<string>();
  for (const item of page.items) {
    const key = `${item.reference.id}\u0000${item.reference.version}\u0000${item.reference.revision}`;
    if (seen.has(key)) {
      return true;
    }
    seen.add(key);
  }
  return false;
}

function cloneNegotiation(value: CapabilityNegotiationResult): CapabilityNegotiationResult {
  return {
    availablePorts: [...value.availablePorts],
    diagnostics: cloneContractValue(value.diagnostics),
    missingOptionalPorts: [...value.missingOptionalPorts],
    missingRequiredPorts: [...value.missingRequiredPorts],
    ...(value.protocolVersion === undefined ? {} : { protocolVersion: value.protocolVersion }),
    sessionState: value.sessionState,
  };
}

function canonical(value: unknown): string {
  return canonicalStringify(value as JsonValue);
}

function equal(left: unknown, right: unknown): boolean {
  return canonical(left) === canonical(right);
}

function isSubset<TValue>(values: readonly TValue[], allowed: readonly TValue[]): boolean {
  return values.every((value) => allowed.includes(value));
}

function containsNode(
  nodes: readonly { readonly id: string; readonly slots: Record<string, readonly unknown[]> }[],
  nodeId: string,
): boolean {
  for (const node of nodes) {
    if (node.id === nodeId) {
      return true;
    }
    for (const children of Object.values(node.slots)) {
      if (
        containsNode(
          children as readonly {
            readonly id: string;
            readonly slots: Record<string, readonly unknown[]>;
          }[],
          nodeId,
        )
      ) {
        return true;
      }
    }
  }
  return false;
}
