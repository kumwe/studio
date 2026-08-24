import {
  HostPortFailure,
  STUDIO_CONTRACT_VERSION,
  STUDIO_STALE_SESSION_GENERATION_DIAGNOSTIC_CODE,
  isHostPortFailure,
  type BlueprintDocument,
  type HostAdapter,
  type HostPortError,
  type HostPortResult,
  type HostRequestContext,
  type JsonObject,
  type JsonPrimitive,
  type JsonValue,
  type QualifiedName,
  type Revision,
  type StableId,
  type StudioConfiguration,
  type StudioDiagnostic,
} from '@kumwe/studio-protocol';
import { canonicalStringify } from './canonical.js';
import { cloneContractValue } from './clone.js';
import { negotiateCapabilities, type CapabilityNegotiationResult } from './negotiation.js';
import { resolveSessionMode } from './modes.js';
import { StudioSession } from './session.js';

const ARTIFACT_PORT: QualifiedName = 'studio.port/artifact';
const RECOVERY_PORT: QualifiedName = 'studio.port/recovery';
const ARTIFACT_LOAD: QualifiedName = 'studio.operation/artifact.load';
const ARTIFACT_SAVE: QualifiedName = 'studio.operation/artifact.save';
const RECOVERY_STORE: QualifiedName = 'studio.operation/recovery.store';
const RECOVERY_LOAD: QualifiedName = 'studio.operation/recovery.load';
const RECOVERY_DISCARD: QualifiedName = 'studio.operation/recovery.discard';

const STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/u;
const FORBIDDEN_IDENTIFIERS = new Set(['__proto__', 'prototype', 'constructor']);

export interface StudioHostSessionIdentifierFactories {
  /** Allocates a session-unique request identifier for one host attempt. */
  requestId(operationId: QualifiedName): StableId;
  /** Allocates a mutation identifier; exact failed-intent retries reuse it. */
  idempotencyKey(operationId: QualifiedName): StableId;
}

export interface OpenStudioSessionOptions {
  /** A schema-valid, resolved, immutable configuration supplied by the host. */
  configuration: StudioConfiguration;
  /** Injected so core never depends on clocks, randomness, DOM, or Node APIs. */
  identifiers: StudioHostSessionIdentifierFactories;
  /** Additional port capabilities whose absence should be diagnosed as degradation. */
  optionalPorts?: readonly QualifiedName[];
}

export interface StudioHostSessionRecovery {
  discard(): Promise<HostPortResult<null>>;
  load(): Promise<HostPortResult<JsonObject | null>>;
  store(envelope: JsonObject): Promise<HostPortResult<null>>;
}

export interface StudioHostSessionHandle {
  /** The complete open-time negotiation and profile diagnostics. */
  readonly diagnostics: readonly StudioDiagnostic[];
  readonly disposed: boolean;
  readonly invalidated: boolean;
  readonly negotiation: CapabilityNegotiationResult;
  /** Present only when feature policy, advertised operations, and adapter agree. */
  readonly recovery: StudioHostSessionRecovery | undefined;
  /** The most recent host-accepted Blueprint revision. */
  readonly revision: Revision;
  readonly session: StudioSession;
  /** Local, idempotent teardown. It never invents a host teardown operation. */
  dispose(): void;
  save(): Promise<HostPortResult<null>>;
}

export type StudioHostSessionErrorCode =
  | 'configuration-blocked'
  | 'disposed'
  | 'invalid-identifier'
  | 'read-only-session'
  | 'unexpected-artifact';

/** A local composition/state failure, distinct from a host-port rejection. */
export class StudioHostSessionError extends Error {
  public readonly code: StudioHostSessionErrorCode;
  public readonly diagnostics: readonly StudioDiagnostic[];

  public constructor(
    code: StudioHostSessionErrorCode,
    message: string,
    diagnostics: readonly StudioDiagnostic[] = [],
  ) {
    super(message);
    this.name = 'StudioHostSessionError';
    this.code = code;
    this.diagnostics = cloneContractValue(diagnostics);
  }
}

/**
 * Composes the DOM-free editing engine with one resolved host configuration.
 *
 * The current contract-safe profile opens a single Blueprint only. It does
 * not fabricate entry/model state, infer a transport, stage preview drafts,
 * or reconcile recovery data. Those capabilities require their own explicit
 * contracts.
 */
export async function openStudioSession(
  adapter: HostAdapter,
  options: Readonly<OpenStudioSessionOptions>,
): Promise<StudioHostSessionHandle> {
  const configuration = cloneContractValue(options.configuration);
  const optionalPorts = requestedOptionalPorts(configuration, options.optionalPorts);
  const negotiation = negotiateCapabilities(configuration.hostCapabilities, {
    optionalPorts,
    requiredPorts: [ARTIFACT_PORT],
    supportedProtocolVersions: [configuration.protocolVersion],
  });
  if (configuration.sessionState === 'read-only') {
    negotiation.sessionState = 'read-only';
  }

  appendProfileDiagnostics(configuration, negotiation);
  const recoveryAvailable = appendOperationDiagnostics(adapter, configuration, negotiation);
  if (negotiation.diagnostics.some((entry) => entry.severity === 'blocking')) {
    throw new StudioHostSessionError(
      'configuration-blocked',
      'The resolved Studio configuration cannot open a Blueprint host session.',
      negotiation.diagnostics,
    );
  }

  const reference = configuration.artifacts.blueprint;
  if (reference === undefined) {
    // `appendProfileDiagnostics` always made this path blocking. Keep the
    // narrowing explicit so a future diagnostic refactor cannot fabricate a
    // reference or issue a host call.
    throw new StudioHostSessionError(
      'configuration-blocked',
      'A Blueprint host session requires an explicit locked Blueprint reference.',
      negotiation.diagnostics,
    );
  }

  const identifiers = new SessionIdentifierAllocator(options.identifiers);
  const loadContext = createContext(configuration, identifiers.requestId(ARTIFACT_LOAD), {
    operationId: ARTIFACT_LOAD,
  });
  const loaded: unknown = await invokeOpeningHostCall(() =>
    adapter.artifact.load(reference, loadContext),
  );
  if (!isBlueprintLoadResult(loaded, reference.id)) {
    const diagnostic = createDiagnostic(
      'studio.host/unexpected-artifact',
      'The artifact port did not return the configured Blueprint.',
      'blocking',
      { artifactId: reference.id },
    );
    throw new StudioHostSessionError(
      'unexpected-artifact',
      'The host returned an artifact outside the Blueprint session profile.',
      [diagnostic],
    );
  }

  const document = normalizeLoadedBlueprint(loaded.value, loaded.revision);
  const session = new StudioSession({
    document,
    maximumHistoryEntries: configuration.limits.maxHistoryEntries,
    mode: resolveSessionMode(configuration),
    sessionGeneration: configuration.sessionGeneration,
  });
  session.markSaved(document.revision);

  return new BoundStudioHostSession(
    adapter,
    configuration,
    identifiers,
    negotiation,
    recoveryAvailable,
    session,
    document.revision,
  );
}

class BoundStudioHostSession implements StudioHostSessionHandle {
  public readonly diagnostics: readonly StudioDiagnostic[];
  public readonly negotiation: CapabilityNegotiationResult;
  public readonly recovery: StudioHostSessionRecovery | undefined;
  public readonly session: StudioSession;

  readonly #adapter: HostAdapter;
  readonly #configuration: StudioConfiguration;
  readonly #identifiers: SessionIdentifierAllocator;
  readonly #retryIntents = new Map<QualifiedName, RetryIntent>();
  #disposed = false;
  #invalidationFailure: HostPortFailure | undefined;
  #lastScheduledSave: ScheduledSave | undefined;
  #revision: Revision;
  #saveTail: Promise<void> = Promise.resolve();

  public constructor(
    adapter: HostAdapter,
    configuration: StudioConfiguration,
    identifiers: SessionIdentifierAllocator,
    negotiation: CapabilityNegotiationResult,
    recoveryAvailable: boolean,
    session: StudioSession,
    revision: Revision,
  ) {
    this.#adapter = adapter;
    this.#configuration = configuration;
    this.#identifiers = identifiers;
    this.negotiation = cloneNegotiation(negotiation);
    this.diagnostics = cloneContractValue(negotiation.diagnostics);
    this.session = session;
    this.#revision = revision;
    this.recovery = recoveryAvailable
      ? Object.freeze({
          discard: (): Promise<HostPortResult<null>> => this.#discardRecovery(),
          load: (): Promise<HostPortResult<JsonObject | null>> => this.#loadRecovery(),
          store: (envelope: JsonObject): Promise<HostPortResult<null>> =>
            this.#storeRecovery(envelope),
        })
      : undefined;
  }

  public get disposed(): boolean {
    return this.#disposed;
  }

  public get invalidated(): boolean {
    return this.#invalidationFailure !== undefined;
  }

  public get revision(): Revision {
    return this.#revision;
  }

  public dispose(): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    this.#retryIntents.clear();
    this.#identifiers.dispose();
  }

  public save(): Promise<HostPortResult<null>> {
    try {
      this.#assertActive();
      if (this.session.mode === 'read-only') {
        throw new StudioHostSessionError(
          'read-only-session',
          'A read-only Studio host session cannot save.',
        );
      }

      const document = this.session.document;
      const snapshotFingerprint = canonicalStringify(document as unknown as JsonValue);
      const existing = this.#lastScheduledSave;
      if (existing?.snapshotFingerprint === snapshotFingerprint) {
        return existing.promise;
      }
      if (!this.session.dirty) {
        return Promise.resolve({ revision: this.#revision, value: null });
      }

      const stateVersion = this.session.stateVersion;
      const scheduled = this.#saveTail.then(() => this.#saveSnapshot(document, stateVersion));
      this.#saveTail = scheduled.then(
        () => undefined,
        () => undefined,
      );
      this.#lastScheduledSave = { promise: scheduled, snapshotFingerprint };
      const clear = (): void => {
        if (this.#lastScheduledSave?.promise === scheduled) {
          this.#lastScheduledSave = undefined;
        }
      };
      void scheduled.then(clear, clear);
      return scheduled;
    } catch (error) {
      return Promise.reject(
        error instanceof Error
          ? error
          : new Error('The Studio host session failed with a non-Error rejection.'),
      );
    }
  }

  async #discardRecovery(): Promise<HostPortResult<null>> {
    this.#assertActive();
    const recovery = this.#adapter.recovery;
    if (recovery === undefined) {
      throw adapterContractFailure(
        'studio.host/adapter-port-unavailable',
        'The negotiated recovery adapter is unavailable.',
      );
    }
    const fingerprint = mutationFingerprint(null, this.#configuration);
    const idempotencyKey = this.#mutationKey(RECOVERY_DISCARD, fingerprint);
    const context = createContext(
      this.#configuration,
      this.#identifiers.requestId(RECOVERY_DISCARD),
      { idempotencyKey, operationId: RECOVERY_DISCARD },
    );
    const result = await this.#invoke(() => recovery.discard(context));
    this.#clearMutationKey(RECOVERY_DISCARD, fingerprint);
    return result;
  }

  async #loadRecovery(): Promise<HostPortResult<JsonObject | null>> {
    this.#assertActive();
    const recovery = this.#adapter.recovery;
    if (recovery === undefined) {
      throw adapterContractFailure(
        'studio.host/adapter-port-unavailable',
        'The negotiated recovery adapter is unavailable.',
      );
    }
    const context = createContext(this.#configuration, this.#identifiers.requestId(RECOVERY_LOAD), {
      operationId: RECOVERY_LOAD,
    });
    const result = await this.#invoke(() => recovery.load(context));
    return {
      ...(result.revision === undefined ? {} : { revision: result.revision }),
      value: result.value === null ? null : cloneContractValue(result.value),
    };
  }

  async #saveSnapshot(
    snapshot: BlueprintDocument,
    stateVersion: number,
  ): Promise<HostPortResult<null>> {
    this.#assertActive();
    const expectedRevision = this.#revision;
    const document: BlueprintDocument = { ...snapshot, revision: expectedRevision };
    const fingerprint = mutationFingerprint(
      document as unknown as JsonValue,
      this.#configuration,
      expectedRevision,
    );
    const idempotencyKey = this.#mutationKey(ARTIFACT_SAVE, fingerprint);
    const context = createContext(this.#configuration, this.#identifiers.requestId(ARTIFACT_SAVE), {
      expectedRevision,
      idempotencyKey,
      operationId: ARTIFACT_SAVE,
    });
    const result = await this.#invoke(() => this.#adapter.artifact.save(document, context));
    if (result.value !== null || !isRevision(result.revision)) {
      throw adapterContractFailure(
        'studio.host/missing-accepted-revision',
        'The artifact save did not return its accepted revision.',
      );
    }

    this.#revision = result.revision;
    this.session.markSaved(result.revision, stateVersion);
    this.#clearMutationKey(ARTIFACT_SAVE, fingerprint);
    return { revision: result.revision, value: null };
  }

  async #storeRecovery(envelope: JsonObject): Promise<HostPortResult<null>> {
    this.#assertActive();
    const recovery = this.#adapter.recovery;
    if (recovery === undefined) {
      throw adapterContractFailure(
        'studio.host/adapter-port-unavailable',
        'The negotiated recovery adapter is unavailable.',
      );
    }
    const value = cloneContractValue(envelope);
    const fingerprint = mutationFingerprint(value, this.#configuration);
    const idempotencyKey = this.#mutationKey(RECOVERY_STORE, fingerprint);
    const context = createContext(
      this.#configuration,
      this.#identifiers.requestId(RECOVERY_STORE),
      { idempotencyKey, operationId: RECOVERY_STORE },
    );
    const result = await this.#invoke(() => recovery.store(value, context));
    this.#clearMutationKey(RECOVERY_STORE, fingerprint);
    return result;
  }

  #assertActive(): void {
    if (this.#invalidationFailure !== undefined) {
      throw this.#invalidationFailure;
    }
    if (this.#disposed) {
      throw new StudioHostSessionError('disposed', 'The Studio host session is disposed.');
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

  #mutationKey(operationId: QualifiedName, fingerprint: string): StableId {
    const prior = this.#retryIntents.get(operationId);
    if (prior?.fingerprint === fingerprint) {
      return prior.idempotencyKey;
    }
    const idempotencyKey = this.#identifiers.idempotencyKey(operationId, fingerprint);
    this.#retryIntents.set(operationId, { fingerprint, idempotencyKey });
    return idempotencyKey;
  }
}

interface ContextOptions {
  expectedRevision?: Revision;
  idempotencyKey?: StableId;
  operationId: QualifiedName;
}

interface RetryIntent {
  fingerprint: string;
  idempotencyKey: StableId;
}

interface ScheduledSave {
  promise: Promise<HostPortResult<null>>;
  snapshotFingerprint: string;
}

class SessionIdentifierAllocator {
  readonly #factories: StudioHostSessionIdentifierFactories;
  readonly #idempotencyIntents = new Map<string, string>();
  readonly #requestIds = new Set<StableId>();

  public constructor(factories: StudioHostSessionIdentifierFactories) {
    this.#factories = factories;
  }

  public dispose(): void {
    this.#idempotencyIntents.clear();
    this.#requestIds.clear();
  }

  public idempotencyKey(operationId: QualifiedName, fingerprint: string): StableId {
    const value = allocateIdentifier(
      (candidateOperationId) => this.#factories.idempotencyKey(candidateOperationId),
      operationId,
      'idempotency',
    );
    const scope = `${operationId}\u0000${value}`;
    const prior = this.#idempotencyIntents.get(scope);
    if (prior !== undefined && prior !== fingerprint) {
      throw new StudioHostSessionError(
        'invalid-identifier',
        'The idempotency-key factory reused a key for another mutation intent.',
      );
    }
    this.#idempotencyIntents.set(scope, fingerprint);
    return value;
  }

  public requestId(operationId: QualifiedName): StableId {
    const value = allocateIdentifier(
      (candidateOperationId) => this.#factories.requestId(candidateOperationId),
      operationId,
      'request',
    );
    if (this.#requestIds.has(value)) {
      throw new StudioHostSessionError(
        'invalid-identifier',
        'The request-ID factory returned an identifier already used by this session.',
      );
    }
    this.#requestIds.add(value);
    return value;
  }
}

function allocateIdentifier(
  factory: (operationId: QualifiedName) => StableId,
  operationId: QualifiedName,
  purpose: 'idempotency' | 'request',
): StableId {
  let value: unknown;
  try {
    value = factory(operationId);
  } catch {
    throw new StudioHostSessionError(
      'invalid-identifier',
      `The ${purpose}-ID factory failed to allocate an identifier.`,
    );
  }
  if (!isStableId(value)) {
    throw new StudioHostSessionError(
      'invalid-identifier',
      `The ${purpose}-ID factory returned a non-canonical stable identifier.`,
    );
  }
  return value;
}

function appendOperationDiagnostics(
  adapter: HostAdapter,
  configuration: StudioConfiguration,
  negotiation: CapabilityNegotiationResult,
): boolean {
  const artifact = configuration.hostCapabilities.ports.find((entry) => entry.id === ARTIFACT_PORT);
  if (artifact !== undefined) {
    const requiredOperations: QualifiedName[] = [ARTIFACT_LOAD];
    if (configuration.sessionState === 'editable') {
      requiredOperations.push(ARTIFACT_SAVE);
    }
    for (const operationId of requiredOperations) {
      if (!artifact.operations.includes(operationId)) {
        negotiation.diagnostics.push(
          createDiagnostic(
            'studio.host/missing-required-operation',
            `The host does not advertise the required ${operationId} operation.`,
            'blocking',
            { operationId },
          ),
        );
      }
    }
  }

  if (!configuration.features.offlineRecovery) {
    return false;
  }
  const recovery = configuration.hostCapabilities.ports.find((entry) => entry.id === RECOVERY_PORT);
  if (recovery === undefined) {
    return false;
  }
  let available = true;
  for (const operationId of [RECOVERY_STORE, RECOVERY_LOAD, RECOVERY_DISCARD]) {
    if (!recovery.operations.includes(operationId)) {
      available = false;
      negotiation.diagnostics.push(
        createDiagnostic(
          'studio.host/missing-optional-operation',
          `The optional recovery port omits ${operationId}; recovery is disabled.`,
          'information',
          { operationId },
        ),
      );
    }
  }
  if (adapter.recovery === undefined) {
    available = false;
    negotiation.diagnostics.push(
      createDiagnostic(
        'studio.host/adapter-port-unavailable',
        'The capability document advertises recovery but the adapter does not implement it.',
        'information',
        { port: RECOVERY_PORT },
      ),
    );
  }
  return available;
}

function appendProfileDiagnostics(
  configuration: StudioConfiguration,
  negotiation: CapabilityNegotiationResult,
): void {
  if (configuration.artifacts.blueprint === undefined) {
    negotiation.diagnostics.push(
      createDiagnostic(
        'studio.host/missing-blueprint-artifact',
        'A Blueprint session requires a locked Blueprint artifact reference.',
        'blocking',
      ),
    );
  }
  if (configuration.mode !== 'blueprint' || configuration.composite !== 'single') {
    negotiation.diagnostics.push(
      createDiagnostic(
        'studio.host/unsupported-session-profile',
        'This host-session profile opens only single Blueprint configurations.',
        'blocking',
        { composite: configuration.composite, mode: configuration.mode },
      ),
    );
  }
}

function requestedOptionalPorts(
  configuration: StudioConfiguration,
  optionalPorts: readonly QualifiedName[] | undefined,
): QualifiedName[] {
  const ports = new Set<QualifiedName>(optionalPorts ?? []);
  ports.delete(ARTIFACT_PORT);
  if (configuration.features.offlineRecovery) {
    ports.add(RECOVERY_PORT);
  }
  return [...ports];
}

function createContext(
  configuration: StudioConfiguration,
  requestId: StableId,
  options: ContextOptions,
): HostRequestContext {
  return {
    ...(options.expectedRevision === undefined
      ? {}
      : { expectedRevision: options.expectedRevision }),
    ...(options.idempotencyKey === undefined ? {} : { idempotencyKey: options.idempotencyKey }),
    locale: configuration.locale.resolved,
    operationId: options.operationId,
    protocolVersion: configuration.protocolVersion,
    requestId,
    resourceContextKey: configuration.resourceContext.key,
    sessionGeneration: configuration.sessionGeneration,
  };
}

function createDiagnostic(
  code: QualifiedName,
  defaultMessage: string,
  severity: StudioDiagnostic['severity'],
  parameters?: Record<string, JsonPrimitive>,
): StudioDiagnostic {
  return {
    code,
    message: { defaultMessage, key: code },
    ...(parameters === undefined ? {} : { parameters }),
    severity,
  };
}

function normalizeLoadedBlueprint(
  document: BlueprintDocument,
  resultRevision: Revision | undefined,
): BlueprintDocument {
  const revision = resultRevision ?? document.revision;
  if (!isRevision(revision)) {
    throw new StudioHostSessionError(
      'unexpected-artifact',
      'The loaded Blueprint does not carry a valid accepted revision.',
      [
        createDiagnostic(
          'studio.host/missing-accepted-revision',
          'The loaded Blueprint does not carry a valid accepted revision.',
          'blocking',
        ),
      ],
    );
  }
  return cloneContractValue({ ...document, revision });
}

function isBlueprintLoadResult(
  value: unknown,
  artifactId: StableId,
): value is HostPortResult<BlueprintDocument> {
  if (typeof value !== 'object' || value === null || Array.isArray(value) || !('value' in value)) {
    return false;
  }
  const document: unknown = value.value;
  return (
    typeof document === 'object' &&
    document !== null &&
    !Array.isArray(document) &&
    'kind' in document &&
    document.kind === 'blueprint' &&
    'id' in document &&
    document.id === artifactId
  );
}

function mutationFingerprint(
  argument: JsonValue,
  configuration: StudioConfiguration,
  expectedRevision?: Revision,
): string {
  return canonicalStringify({
    argument,
    context: {
      ...(expectedRevision === undefined ? {} : { expectedRevision }),
      locale: configuration.locale.resolved,
      protocolVersion: configuration.protocolVersion,
    },
  });
}

async function invokeOpeningHostCall<TValue>(operation: () => Promise<TValue>): Promise<TValue> {
  try {
    return await operation();
  } catch (error) {
    throw normalizeHostRejection(error);
  }
}

function normalizeHostRejection(error: unknown): HostPortFailure {
  if (isHostPortFailure(error)) {
    return error;
  }
  return adapterContractFailure(
    'studio.host/invalid-failure-wrapper',
    'The host adapter rejected without a canonical HostPortFailure.',
  );
}

function adapterContractFailure(code: QualifiedName, defaultMessage: string): HostPortFailure {
  const error: HostPortError = {
    category: 'internal',
    contractVersion: STUDIO_CONTRACT_VERSION,
    diagnostics: [createDiagnostic(code, defaultMessage, 'error')],
    kind: 'host-error',
    message: { defaultMessage, key: code },
    retryable: false,
  };
  return new HostPortFailure(error);
}

function isStaleGenerationFailure(failure: HostPortFailure): boolean {
  return (
    failure.error.category === 'invalid-request' &&
    (failure.error.diagnostics?.some(
      (entry) => entry.code === STUDIO_STALE_SESSION_GENERATION_DIAGNOSTIC_CODE,
    ) ??
      false)
  );
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

function isStableId(value: unknown): value is StableId {
  return (
    typeof value === 'string' &&
    value.length >= 1 &&
    value.length <= 240 &&
    !FORBIDDEN_IDENTIFIERS.has(value) &&
    STABLE_ID.test(value)
  );
}

function isRevision(value: unknown): value is Revision {
  return typeof value === 'string' && value.length >= 1 && value.length <= 200;
}
