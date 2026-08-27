import {
  HostPortFailure,
  STUDIO_CONTRACT_VERSION,
  STUDIO_WIRE_PROTOCOL_VERSION,
  type AuthoringArtifactCoordinates,
  type AuthoringPort,
  type AuthoringSaveAsNewTypeRequest,
  type AuthoringSaveIntent,
  type AuthoringSaveItemRequest,
  type AuthoringSaveNewTypeVersionRequest,
  type AuthoringSaveOutcome,
  type AuthoringSavePlan,
  type AuthoringSaveResult,
  type AuthoringSessionSnapshot,
  type AuthoringStartRequest,
  type AuthoringTargetDeclaration,
  type AuthoringTargetResolution,
  type AuthoringTargetResolveRequest,
  type AuthoringTypeListPage,
  type AuthoringTypeListQuery,
  type ArtifactPort,
  type ArtifactReference,
  type BlueprintDocument,
  type ContentModelDocument,
  type EntryDocument,
  type HostPortError,
  type HostPortResult,
  type HostRequestContext,
  type HostAdapter,
  type MessageReference,
  type QualifiedName,
  type ReusableContentTypeDefinition,
  type ReusableContentTypeReference,
  type Revision,
  type StudioDiagnostic,
  type StudioResourceContext,
  type StudioArtifact,
  type JsonValue,
} from '@kumwe/studio-protocol';
import { canonicalStringify } from '@kumwe/studio-core';
import {
  createBlankReferenceArtifacts,
  createEmptyReferenceEntry,
  createReferenceContentModel,
  createReferenceEntry,
} from './reference-contextual-data.js';

export const REFERENCE_AUTHORING_TARGET_ID = 'studio.reference/content-page';

export interface ReferenceAuthoringHost {
  adapter: HostAdapter;
  authoring: ReferenceAuthoringPort;
}

export function createReferenceAuthoringHost(
  representativeBlueprint: Readonly<BlueprintDocument>,
): ReferenceAuthoringHost {
  const authoring = new ReferenceAuthoringPort(representativeBlueprint);
  return {
    adapter: { artifact: new ReferenceArtifactPort(authoring), authoring },
    authoring,
  };
}

const OPERATIONS = Object.freeze({
  listTypes: 'studio.operation/authoring.list-types',
  planSave: 'studio.operation/authoring.plan-save',
  resolveTarget: 'studio.operation/authoring.resolve-target',
  saveAsNewType: 'studio.operation/authoring.save-as-new-type',
  saveItem: 'studio.operation/authoring.save-item',
  saveNewTypeVersion: 'studio.operation/authoring.save-new-type-version',
  start: 'studio.operation/authoring.start',
} as const);

const ALL_MODES = ['model', 'blueprint', 'content'] as const;
const ALL_PRESENTATIONS = ['inline', 'minimized', 'maximized', 'fullscreen'] as const;
const ALL_SAVE_OUTCOMES = ['save-item', 'save-new-type-version', 'save-as-new-type'] as const;

const target: AuthoringTargetDeclaration = {
  contractVersion: STUDIO_CONTRACT_VERSION,
  contributionDependencies: [],
  eligibility: ['create', 'edit'],
  id: REFERENCE_AUTHORING_TARGET_ID,
  kind: 'authoring-target',
  label: { defaultMessage: 'Reference content page', key: 'studio.reference/content-page' },
  modes: [...ALL_MODES],
  owner: { id: 'studio.reference/host', version: '1.0.0' },
  presentationStates: [...ALL_PRESENTATIONS],
  requiredCapabilities: [],
  resourceTypes: ['studio.reference/content'],
  saveOutcomes: [...ALL_SAVE_OUTCOMES],
  startKinds: ['blank', 'from-type', 'existing'],
  surface: 'studio.reference/content-editor',
};

interface StoredType {
  blueprint: BlueprintDocument;
  definition: ReusableContentTypeDefinition;
  model: ContentModelDocument;
}

interface StoredPlan {
  intent: AuthoringSaveIntent;
  plan: AuthoringSavePlan;
}

interface StoredSaveResult {
  fingerprint: string;
  result: AuthoringSaveResult;
}

/**
 * A deterministic browser-only AuthoringPort. It acts as the already-
 * authenticated host seam for this example: target resolution, exact artifact
 * hydration, planning, concurrency checks and accepted revisions all happen
 * here instead of in the Studio element. It is intentionally not presented as
 * a production server or durable database.
 */
export class ReferenceAuthoringPort implements AuthoringPort {
  readonly #existingEntry: EntryDocument;
  readonly #existingType: StoredType;
  readonly #latestType: StoredType;
  readonly #plans = new Map<string, StoredPlan>();
  readonly #sessions = new Map<string, AuthoringSessionSnapshot>();
  readonly #saveResults = new Map<string, StoredSaveResult>();
  #serial = 10;

  public constructor(representativeBlueprint: Readonly<BlueprintDocument>) {
    const existingBlueprint = asPublishedBlueprint(representativeBlueprint);
    const existingModel = createReferenceContentModel(existingBlueprint);
    this.#existingType = storedType('studio.reference/page', existingModel, existingBlueprint, {
      revision: 'type-r1',
      version: '1.0.0',
    });
    this.#existingEntry = createReferenceEntry(existingModel);

    const latestModel: ContentModelDocument = {
      ...structuredClone(existingModel),
      revision: 'model-r2',
      version: '2.0.0',
    };
    const latestBlueprint: BlueprintDocument = {
      ...structuredClone(existingBlueprint),
      model: artifactReference(latestModel),
      revision: 'blueprint-r2',
      version: '2.0.0',
    };
    this.#latestType = storedType('studio.reference/page', latestModel, latestBlueprint, {
      revision: 'type-r2',
      version: '2.0.0',
    });
  }

  public get existingEntry(): EntryDocument {
    return structuredClone(this.#existingEntry);
  }

  public get existingTypeReference(): ReusableContentTypeReference {
    return typeReference(this.#existingType.definition);
  }

  public get latestTypeReference(): ReusableContentTypeReference {
    return typeReference(this.#latestType.definition);
  }

  public artifact(reference: Readonly<ArtifactReference>): StudioArtifact {
    const candidates: StudioArtifact[] = [
      this.#existingType.model,
      this.#existingType.blueprint,
      this.#latestType.model,
      this.#latestType.blueprint,
      this.#existingEntry,
    ];
    const found = candidates.find(
      (candidate) =>
        candidate.id === reference.id &&
        (reference.revision === undefined || candidate.revision === reference.revision) &&
        ('version' in candidate ? candidate.version === reference.version : true),
    );
    if (found === undefined) fail('not-found', 'The exact Studio artifact is unavailable.');
    return structuredClone(found);
  }

  public async resolveTarget(
    request: AuthoringTargetResolveRequest,
    context: HostRequestContext,
  ): Promise<HostPortResult<AuthoringTargetResolution>> {
    await browserAdapterBoundary();
    this.#assertContext(context, OPERATIONS.resolveTarget, request.resourceContext);
    this.#assertTarget(request.targetId);
    if (!target.eligibility.includes(request.intent)) {
      fail('forbidden', 'The requested authoring intent is not allowed for this target.');
    }
    const requested = request.requestedPresentation ?? 'inline';
    if (!target.presentationStates.includes(requested)) {
      fail('incompatible', 'The requested presentation is not supported by this target.');
    }
    return result({
      availableStarts: request.intent === 'edit' ? ['existing'] : ['blank', 'from-type'],
      initialPresentation: requested,
      resourceContext: structuredClone(request.resourceContext),
      returnContext: {
        key: 'returns/reference-content-list',
        label: { defaultMessage: 'Reference content', key: 'studio.reference/content-list' },
      },
      target: structuredClone(target),
    });
  }

  public async listTypes(
    query: AuthoringTypeListQuery,
    context: HostRequestContext,
  ): Promise<HostPortResult<AuthoringTypeListPage>> {
    await browserAdapterBoundary();
    this.#assertContext(context, OPERATIONS.listTypes, query.resourceContext);
    this.#assertTarget(query.targetId);
    if (!Number.isSafeInteger(query.limit) || query.limit < 1 || query.limit > 100) {
      fail('invalid-request', 'The reusable-content-type page limit is invalid.');
    }
    const search = query.search?.trim().toLocaleLowerCase('en') ?? '';
    const all = [this.#latestType, this.#existingType]
      .filter((candidate) =>
        labelText(candidate.definition.label).toLocaleLowerCase('en').includes(search),
      )
      .map(({ definition }) => ({
        blueprint: structuredClone(definition.blueprint),
        label: structuredClone(definition.label),
        model: structuredClone(definition.model),
        reference: typeReference(definition),
      }));
    const offset = query.cursor === undefined ? 0 : parseCursor(query.cursor);
    const items = all.slice(offset, offset + query.limit);
    const nextOffset = offset + items.length;
    return result({
      items,
      ...(nextOffset < all.length ? { nextCursor: `reference-${nextOffset}` } : {}),
    });
  }

  public async start(
    request: AuthoringStartRequest,
    context: HostRequestContext,
  ): Promise<HostPortResult<AuthoringSessionSnapshot>> {
    await browserAdapterBoundary();
    this.#assertContext(context, OPERATIONS.start, request.resourceContext);
    this.#assertTarget(request.targetId);
    const presentation = request.presentation ?? 'inline';
    if (!target.presentationStates.includes(presentation)) {
      fail('incompatible', 'The requested presentation is not supported by this target.');
    }

    let blueprint: BlueprintDocument;
    let entry: EntryDocument;
    let model: ContentModelDocument;
    let type: ReusableContentTypeDefinition | undefined;
    const resource = request.resourceContext.resource;
    if (resource?.type !== 'studio.reference/content') {
      fail('invalid-request', 'Contextual authoring requires one reference content resource.');
    }
    if (request.source.kind === 'blank') {
      const blank = createBlankReferenceArtifacts(this.#existingType.blueprint, resource.id);
      ({ blueprint, entry, model } = blank);
    } else if (request.source.kind === 'existing') {
      ({ blueprint, model } = cloneStoredType(this.#existingType));
      entry = structuredClone(this.#existingEntry);
      if (entry.id !== resource.id) {
        fail('not-found', 'The requested resource does not identify this existing Entry.');
      }
      type = structuredClone(this.#existingType.definition);
    } else {
      const selected = this.#findType(request.source.type);
      ({ blueprint, model } = cloneStoredType(selected));
      entry = createEmptyReferenceEntry(model, resource.id);
      type = structuredClone(selected.definition);
    }

    // This browser adapter is bound to the reference shell configuration. In
    // a production transport the authenticated adapter instance would carry
    // the same host-minted session identity; the request deliberately cannot
    // let an untrusted client choose a different one.
    const sessionId = 'reference-session';
    const session = createSession({
      blueprint,
      entry,
      model,
      presentation,
      resourceContext: request.resourceContext,
      sessionId,
      start: request.source,
      ...(type === undefined ? {} : { type }),
    });
    this.#sessions.set(sessionId, structuredClone(session));
    return result(session, session.state.coordinates.entry.revision);
  }

  public async planSave(
    intent: AuthoringSaveIntent,
    context: HostRequestContext,
  ): Promise<HostPortResult<AuthoringSavePlan>> {
    await browserAdapterBoundary();
    const session = this.#requireSession(intent.sessionId);
    this.#assertContext(context, OPERATIONS.planSave, session.resourceContext);
    assertCoordinates(intent.expected, session.state.coordinates);
    assertDraftMatchesOutcome(intent);
    const consequences = saveConsequences(intent.draft.outcome);
    const plan: AuthoringSavePlan = {
      affectedArtifacts: affectedArtifacts(intent),
      confirmationRequired: consequences.length > 0,
      consequences,
      contractVersion: STUDIO_CONTRACT_VERSION,
      expected: structuredClone(intent.expected),
      id: `reference-save-plan-${this.#nextSerial()}`,
      kind: 'authoring-save-plan',
      outcome: intent.draft.outcome,
      revision: 'plan-r1',
      sessionId: intent.sessionId,
    };
    this.#plans.set(plan.id, { intent: structuredClone(intent), plan: structuredClone(plan) });
    return result(plan, plan.revision);
  }

  public saveItem(
    request: AuthoringSaveItemRequest,
    context: HostRequestContext,
  ): Promise<HostPortResult<AuthoringSaveResult>> {
    return this.#save(request, context, OPERATIONS.saveItem, 'save-item', (session) => {
      const entry = structuredClone(request.draft.entry);
      entry.revision = `entry-r${this.#nextSerial()}`;
      session.state.entry = entry;
      session.state.coordinates.entry = entryReference(entry);
      if (request.draft.itemBlueprint !== undefined) {
        const blueprint = structuredClone(request.draft.itemBlueprint);
        blueprint.revision = `item-blueprint-r${this.#nextSerial()}`;
        session.state.blueprint = blueprint;
        session.state.coordinates.blueprint = artifactReference(blueprint);
      }
    });
  }

  public saveNewTypeVersion(
    request: AuthoringSaveNewTypeVersionRequest,
    context: HostRequestContext,
  ): Promise<HostPortResult<AuthoringSaveResult>> {
    return this.#save(
      request,
      context,
      OPERATIONS.saveNewTypeVersion,
      'save-new-type-version',
      (session) => {
        const nextVersion = nextPatchVersion(session.type?.version ?? request.draft.model.version);
        const model: ContentModelDocument = {
          ...structuredClone(request.draft.model),
          revision: `model-r${this.#nextSerial()}`,
          status: 'published',
          version: nextVersion,
        };
        const blueprint: BlueprintDocument = {
          ...structuredClone(request.draft.blueprint),
          model: artifactReference(model),
          revision: `blueprint-r${this.#nextSerial()}`,
          status: 'published',
          version: nextVersion,
        };
        const definition = storedType(
          session.type?.id ?? 'studio.reference/page',
          model,
          blueprint,
          { revision: `type-r${this.#nextSerial()}`, version: nextVersion },
        ).definition;
        const entry: EntryDocument = {
          ...structuredClone(session.state.entry),
          model: artifactReference(model),
          revision: `entry-migrated-r${this.#nextSerial()}`,
        };
        session.type = definition;
        session.state = acceptedState(model, blueprint, entry, definition);
      },
    );
  }

  public saveAsNewType(
    request: AuthoringSaveAsNewTypeRequest,
    context: HostRequestContext,
  ): Promise<HostPortResult<AuthoringSaveResult>> {
    return this.#save(request, context, OPERATIONS.saveAsNewType, 'save-as-new-type', (session) => {
      const serial = this.#nextSerial();
      const version = '1.0.0';
      const model: ContentModelDocument = {
        ...structuredClone(request.draft.model),
        id: `studio.reference/model-created-${serial}`,
        revision: `model-created-r${serial}`,
        status: 'draft',
        version,
      };
      const blueprint: BlueprintDocument = {
        ...structuredClone(request.draft.blueprint),
        id: `studio.reference/blueprint-created-${serial}`,
        model: artifactReference(model),
        revision: `blueprint-created-r${serial}`,
        status: 'draft',
        version,
      };
      const definition = storedType(
        `studio.reference/type-created-${serial}`,
        model,
        blueprint,
        { revision: `type-created-r${serial}`, version },
        request.draft.label,
        request.draft.authoringPolicy,
        'draft',
      ).definition;
      const entry: EntryDocument = {
        ...structuredClone(session.state.entry),
        model: artifactReference(model),
        revision: `entry-rebound-r${serial}`,
      };
      session.type = definition;
      session.state = acceptedState(model, blueprint, entry, definition);
    });
  }

  async #save(
    request:
      AuthoringSaveItemRequest | AuthoringSaveNewTypeVersionRequest | AuthoringSaveAsNewTypeRequest,
    context: HostRequestContext,
    operation: QualifiedName,
    outcome: AuthoringSaveOutcome,
    apply: (session: AuthoringSessionSnapshot) => void,
  ): Promise<HostPortResult<AuthoringSaveResult>> {
    await browserAdapterBoundary();
    if (context.idempotencyKey === undefined) {
      fail('invalid-request', 'A contextual save requires an idempotency key.');
    }
    const fingerprint = saveFingerprint(operation, request, context);
    const replay = this.#saveResults.get(context.idempotencyKey);
    if (replay !== undefined) {
      if (replay.fingerprint !== fingerprint) {
        fail('invalid-request', 'An idempotency key cannot be reused for a different save intent.');
      }
      this.#assertContext(context, operation, replay.result.session.resourceContext);
      return result(replay.result, replay.result.session.state.coordinates.entry.revision);
    }
    const stored = this.#plans.get(request.plan.id);
    if (
      stored?.plan.revision !== request.plan.revision ||
      stored.plan.outcome !== outcome ||
      stored.intent.draft.outcome !== outcome ||
      canonical(stored.intent.draft) !== canonical(request.draft)
    ) {
      fail('conflict', 'The save plan does not match this requested outcome.');
    }
    const session = this.#requireSession(stored.plan.sessionId);
    this.#assertContext(context, operation, session.resourceContext);
    assertCoordinates(stored.plan.expected, session.state.coordinates);
    assertAcceptedConsequences(request.acceptedConsequences, stored.plan);
    apply(session);
    session.state.dirty = [];
    session.state.diagnostics = [];
    this.#sessions.set(session.sessionId, structuredClone(session));
    const accepted: AuthoringSaveResult = {
      contractVersion: STUDIO_CONTRACT_VERSION,
      kind: 'authoring-save-result',
      outcome,
      plan: structuredClone(request.plan),
      session: structuredClone(session),
    };
    this.#saveResults.set(context.idempotencyKey, {
      fingerprint,
      result: structuredClone(accepted),
    });
    return result(accepted, session.state.coordinates.entry.revision);
  }

  #assertContext(
    context: HostRequestContext,
    operation: QualifiedName,
    resourceContext: StudioResourceContext,
  ): void {
    if (context.operationId !== operation) {
      fail('invalid-request', 'The host operation identifier does not match the invoked method.');
    }
    if (context.protocolVersion !== STUDIO_WIRE_PROTOCOL_VERSION) {
      fail('incompatible', 'The reference host does not support this wire protocol version.');
    }
    if (context.resourceContextKey !== resourceContext.key) {
      fail('forbidden', 'The request is not bound to this resource context.');
    }
    if (context.sessionGeneration.length === 0 || context.requestId.length === 0) {
      fail('invalid-request', 'The request context is incomplete.');
    }
  }

  #assertTarget(targetId: string): void {
    if (targetId !== target.id) fail('not-found', 'The requested authoring target is unavailable.');
  }

  #findType(reference: ReusableContentTypeReference): StoredType {
    const candidates = [this.#existingType, this.#latestType];
    const selected = candidates.find(
      ({ definition }) =>
        definition.id === reference.id &&
        definition.version === reference.version &&
        definition.revision === reference.revision,
    );
    if (selected === undefined) {
      fail('not-found', 'The exact reusable content type version is unavailable.');
    }
    return selected;
  }

  #requireSession(sessionId: string): AuthoringSessionSnapshot {
    const session = this.#sessions.get(sessionId);
    if (session === undefined)
      fail('not-found', 'The contextual authoring session is unavailable.');
    return structuredClone(session);
  }

  #nextSerial(): number {
    this.#serial += 1;
    return this.#serial;
  }
}

class ReferenceArtifactPort implements ArtifactPort {
  readonly #authoring: ReferenceAuthoringPort;

  public constructor(authoring: ReferenceAuthoringPort) {
    this.#authoring = authoring;
  }

  public async dependencies(
    reference: ArtifactReference,
    context: HostRequestContext,
  ): Promise<HostPortResult<ArtifactReference[]>> {
    await browserAdapterBoundary();
    void context;
    const artifact = this.#authoring.artifact(reference);
    if (artifact.kind === 'blueprint') {
      return result([
        structuredClone(artifact.model),
        structuredClone(artifact.dependencyLock.theme),
      ]);
    }
    if (artifact.kind === 'entry') return result([structuredClone(artifact.model)]);
    return result([]);
  }

  public async load(
    reference: ArtifactReference,
    context: HostRequestContext,
  ): Promise<HostPortResult<StudioArtifact>> {
    await browserAdapterBoundary();
    void context;
    const artifact = this.#authoring.artifact(reference);
    return result(artifact, artifact.revision);
  }

  public async publish(): Promise<HostPortResult<null>> {
    await browserAdapterBoundary();
    fail('forbidden', 'Contextual publication is not exposed by this browser-only reference host.');
  }

  public async save(): Promise<HostPortResult<null>> {
    await browserAdapterBoundary();
    fail('forbidden', 'Contextual artifacts must use one declared authoring save outcome.');
  }

  public async unpublish(): Promise<HostPortResult<null>> {
    await browserAdapterBoundary();
    fail('forbidden', 'Contextual publication is not exposed by this browser-only reference host.');
  }
}

/** Keep the in-memory reference adapter observably asynchronous like a transport-backed port. */
function browserAdapterBoundary(): Promise<void> {
  return Promise.resolve();
}

function createSession(options: {
  blueprint: BlueprintDocument;
  entry: EntryDocument;
  model: ContentModelDocument;
  presentation: AuthoringSessionSnapshot['presentation']['current'];
  resourceContext: StudioResourceContext;
  sessionId: string;
  start: AuthoringSessionSnapshot['start'];
  type?: ReusableContentTypeDefinition;
}): AuthoringSessionSnapshot {
  const { blueprint, entry, model } = options;
  return {
    capabilities: {
      modes: [...ALL_MODES],
      presentationStates: [...ALL_PRESENTATIONS],
      saveOutcomes:
        options.type === undefined ? ['save-item', 'save-as-new-type'] : [...ALL_SAVE_OUTCOMES],
    },
    contractVersion: STUDIO_CONTRACT_VERSION,
    contributionGeneration: 'reference-contributions-r1',
    kind: 'authoring-session',
    presentation: {
      current: options.presentation,
      returnContext: {
        key: 'returns/reference-content-list',
        label: { defaultMessage: 'Reference content', key: 'studio.reference/content-list' },
      },
    },
    resourceContext: structuredClone(options.resourceContext),
    sessionGeneration: 'session-r1',
    sessionId: options.sessionId,
    start: structuredClone(options.start),
    state: acceptedState(model, blueprint, entry, options.type),
    target: structuredClone(target),
    ...(options.type === undefined ? {} : { type: structuredClone(options.type) }),
  };
}

function acceptedState(
  model: ContentModelDocument,
  blueprint: BlueprintDocument,
  entry: EntryDocument,
  type?: ReusableContentTypeDefinition,
): AuthoringSessionSnapshot['state'] {
  return {
    blueprint: structuredClone(blueprint),
    coordinates: {
      blueprint: artifactReference(blueprint),
      entry: entryReference(entry),
      model: artifactReference(model),
      ...(type === undefined ? {} : { type: typeReference(type) }),
    },
    diagnostics: [],
    dirty: [],
    entry: structuredClone(entry),
    model: structuredClone(model),
  };
}

function storedType(
  id: string,
  model: ContentModelDocument,
  blueprint: BlueprintDocument,
  identity: { revision: Revision; version: string },
  label: MessageReference = {
    defaultMessage: 'Reference page',
    key: 'studio.reference/page-type',
  },
  authoringPolicy: ReusableContentTypeDefinition['authoringPolicy'] = {
    itemComposition: 'overrides',
    modes: [...ALL_MODES],
  },
  status: ReusableContentTypeDefinition['status'] = 'published',
): StoredType {
  return {
    blueprint: structuredClone(blueprint),
    definition: {
      authoringPolicy: structuredClone(authoringPolicy),
      blueprint: artifactReference(blueprint),
      contractVersion: STUDIO_CONTRACT_VERSION,
      id,
      kind: 'reusable-content-type',
      label: structuredClone(label),
      model: artifactReference(model),
      revision: identity.revision,
      status,
      version: identity.version,
    },
    model: structuredClone(model),
  };
}

function cloneStoredType(value: StoredType): {
  blueprint: BlueprintDocument;
  model: ContentModelDocument;
} {
  return { blueprint: structuredClone(value.blueprint), model: structuredClone(value.model) };
}

function asPublishedBlueprint(source: Readonly<BlueprintDocument>): BlueprintDocument {
  return { ...structuredClone(source), status: 'published' };
}

function artifactReference(document: BlueprintDocument | ContentModelDocument) {
  return { id: document.id, revision: document.revision, version: document.version };
}

function entryReference(document: EntryDocument) {
  return { id: document.id, revision: document.revision };
}

function typeReference(definition: ReusableContentTypeDefinition): ReusableContentTypeReference {
  return { id: definition.id, revision: definition.revision, version: definition.version };
}

function result<T>(value: T, revision?: Revision): HostPortResult<T> {
  return { value: structuredClone(value), ...(revision === undefined ? {} : { revision }) };
}

function affectedArtifacts(intent: AuthoringSaveIntent): AuthoringSavePlan['affectedArtifacts'] {
  if (intent.draft.outcome !== 'save-item') {
    return ['model', 'blueprint', 'reusable-content-type'];
  }
  return intent.draft.itemBlueprint === undefined ? ['entry'] : ['entry', 'blueprint'];
}

function saveConsequences(outcome: AuthoringSaveOutcome): StudioDiagnostic[] {
  if (outcome === 'save-item') return [];
  if (outcome === 'save-as-new-type') {
    return [
      consequence(
        'studio.reference/entry-values-excluded',
        'The new reusable type contains the Model and Blueprint only; this Entry’s values are excluded.',
      ),
    ];
  }
  return [
    consequence(
      'studio.reference/immutable-successor',
      'New immutable Model, Blueprint, and reusable-content-type revisions will be created.',
    ),
    consequence(
      'studio.reference/dependent-entry-migration',
      'The reference host will migrate this Entry to the accepted successor definition.',
    ),
  ];
}

function consequence(code: QualifiedName, defaultMessage: string): StudioDiagnostic {
  return {
    code,
    message: { defaultMessage, key: code },
    severity: 'information',
  };
}

function assertCoordinates(
  expected: AuthoringArtifactCoordinates,
  actual: AuthoringArtifactCoordinates,
): void {
  if (JSON.stringify(expected) !== JSON.stringify(actual)) {
    fail('conflict', 'The exact authoring coordinates changed before this operation was accepted.');
  }
}

function assertDraftMatchesOutcome(intent: AuthoringSaveIntent): void {
  const { draft, expected } = intent;
  if (draft.outcome === 'save-item') {
    if (draft.entry.id !== expected.entry.id) {
      fail('invalid-request', 'Save item targets a different Entry.');
    }
    return;
  }
  if (draft.model.id !== expected.model.id || draft.blueprint.id !== expected.blueprint.id) {
    fail('invalid-request', 'The type save draft does not match the coordinated artifacts.');
  }
}

function assertAcceptedConsequences(accepted: readonly string[], plan: AuthoringSavePlan): void {
  const required = plan.consequences.map(({ code }) => code).sort();
  const supplied = [...accepted].sort();
  if (JSON.stringify(required) !== JSON.stringify(supplied)) {
    fail('invalid-request', 'Every planned consequence must be explicitly accepted once.');
  }
}

function parseCursor(cursor: string): number {
  const match = /^reference-(\d+)$/u.exec(cursor);
  const offset = match?.[1] === undefined ? Number.NaN : Number.parseInt(match[1], 10);
  if (!Number.isSafeInteger(offset) || offset < 0) {
    fail('invalid-request', 'The reusable-content-type cursor is invalid.');
  }
  return offset;
}

function nextPatchVersion(version: string): string {
  const match = /^(\d+)\.(\d+)\.(\d+)$/u.exec(version);
  if (match?.[1] === undefined || match[2] === undefined || match[3] === undefined) {
    fail('incompatible', 'The current reusable-content-type version is not semantic.');
  }
  return `${match[1]}.${match[2]}.${Number.parseInt(match[3], 10) + 1}`;
}

function labelText(label: { defaultMessage?: string; key: string }): string {
  return label.defaultMessage ?? label.key;
}

function saveFingerprint(
  operation: QualifiedName,
  request:
    AuthoringSaveItemRequest | AuthoringSaveNewTypeVersionRequest | AuthoringSaveAsNewTypeRequest,
  context: HostRequestContext,
): string {
  return canonical({
    ...(context.expectedRevision === undefined
      ? {}
      : { expectedRevision: context.expectedRevision }),
    ...(context.locale === undefined ? {} : { locale: context.locale }),
    operation,
    protocolVersion: context.protocolVersion,
    request,
    resourceContextKey: context.resourceContextKey,
    sessionGeneration: context.sessionGeneration,
  });
}

function canonical(value: unknown): string {
  return canonicalStringify(value as JsonValue);
}

function fail(category: HostPortError['category'], defaultMessage: string): never {
  throw new HostPortFailure({
    category,
    contractVersion: STUDIO_CONTRACT_VERSION,
    kind: 'host-error',
    message: { defaultMessage, key: `studio.reference/${category}` },
    retryable: false,
  });
}
