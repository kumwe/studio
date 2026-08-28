import { describe, expect, it } from 'vitest';
import {
  HostPortFailure,
  STUDIO_CONTRACT_VERSION,
  STUDIO_STALE_SESSION_GENERATION_DIAGNOSTIC_CODE,
  type AddModelFieldCommand,
  type ArtifactPort,
  type AuthoringPort,
  type AuthoringSaveAsNewTypeRequest,
  type AuthoringSaveIntent,
  type AuthoringSaveItemRequest,
  type AuthoringSaveNewTypeVersionRequest,
  type AuthoringSavePlan,
  type AuthoringSaveResult,
  type AuthoringSessionSnapshot,
  type AuthoringStartRequest,
  type AuthoringTargetDeclaration,
  type AuthoringTargetResolution,
  type AuthoringTargetResolveRequest,
  type AuthoringTypeListQuery,
  type BlueprintCommand,
  type BlueprintDocument,
  type BlueprintNode,
  type ContentModelDocument,
  type EntryDocument,
  type HostAdapter,
  type HostPortError,
  type HostRequestContext,
  type InsertNodeCommand,
  type QualifiedName,
  type ReusableContentTypeDefinition,
  type SetFieldValueCommand,
  type StudioConfiguration,
  type StudioResourceContext,
} from '@kumwe/studio-protocol';
import { createBlueprintFixture, createStudioConfigurationFixture } from '@kumwe/studio-testkit';
import {
  openContextualStudioSession,
  openStudioSession,
  preflightContextualStudioSession,
  type StudioHostSessionIdentifierFactories,
} from '../src/index.js';

const TARGET_ID: QualifiedName = 'studio.test/article-authoring';
const SURFACE: QualifiedName = 'studio.test/content-editor';
const RESOURCE_TYPE: QualifiedName = 'studio.test/article';
const AUTHORING_OPERATIONS: QualifiedName[] = [
  'studio.operation/authoring.resolve-target',
  'studio.operation/authoring.list-types',
  'studio.operation/authoring.start',
  'studio.operation/authoring.plan-save',
  'studio.operation/authoring.save-item',
  'studio.operation/authoring.save-new-type-version',
  'studio.operation/authoring.save-as-new-type',
];

const resourceContext: StudioResourceContext = {
  key: 'contexts/article-7',
  resource: { id: 'articles/7', type: RESOURCE_TYPE },
  scopes: [{ id: 'sites/main', kind: 'studio.test/site' }],
  surface: SURFACE,
};

function modelFixture(overrides: Partial<ContentModelDocument> = {}): ContentModelDocument {
  return {
    contractVersion: STUDIO_CONTRACT_VERSION,
    fields: [
      {
        cardinality: 'one',
        id: 'title',
        kind: 'string',
        label: { defaultMessage: 'Title', key: 'studio.test/title' },
        localized: true,
        required: true,
      },
    ],
    id: 'models/article',
    kind: 'content-model',
    label: { defaultMessage: 'Article', key: 'studio.test/article-model' },
    owner: { id: 'studio.test/host', version: '1.0.0' },
    relationships: [],
    revision: 'model-r1',
    status: 'draft',
    version: '1.0.0',
    ...overrides,
  };
}

function blueprintFixture(model: ContentModelDocument): BlueprintDocument {
  const blueprint = createBlueprintFixture({
    id: 'blueprints/article',
    revision: 'blueprint-r1',
  });
  blueprint.model = { id: model.id, revision: model.revision, version: model.version };
  blueprint.status = 'draft';
  return blueprint;
}

function blueprintNodeFixture(id: string, requiredPermission?: QualifiedName): BlueprintNode {
  return {
    authoring: {
      mode: 'designer',
      ...(requiredPermission === undefined ? {} : { requiredPermission }),
    },
    bindings: {},
    id,
    properties: {},
    slots: {},
    type: 'studio.test/section',
    version: '1.0.0',
  };
}

function entryFixture(
  model: ContentModelDocument,
  overrides: Partial<EntryDocument> = {},
): EntryDocument {
  return {
    contractVersion: STUDIO_CONTRACT_VERSION,
    id: 'articles/7',
    kind: 'entry',
    locale: 'en',
    model: { id: model.id, revision: model.revision, version: model.version },
    revision: 'entry-r7',
    status: 'draft',
    values: { title: 'Exact existing value' },
    workflowState: 'studio.test/draft',
    ...overrides,
  };
}

function typeFixture(
  model: ContentModelDocument,
  blueprint: BlueprintDocument,
  overrides: Partial<ReusableContentTypeDefinition> = {},
): ReusableContentTypeDefinition {
  return {
    authoringPolicy: {
      itemComposition: 'overrides',
      modes: ['model', 'blueprint', 'content'],
    },
    blueprint: {
      id: blueprint.id,
      revision: blueprint.revision,
      version: blueprint.version,
    },
    contractVersion: STUDIO_CONTRACT_VERSION,
    id: 'types/article',
    kind: 'reusable-content-type',
    label: { defaultMessage: 'Article page', key: 'studio.test/article-type' },
    model: { id: model.id, revision: model.revision, version: model.version },
    revision: 'type-r1',
    status: 'published',
    version: '1.0.0',
    ...overrides,
  };
}

function targetFixture(): AuthoringTargetDeclaration {
  return {
    contractVersion: STUDIO_CONTRACT_VERSION,
    contributionDependencies: [],
    eligibility: ['create', 'edit'],
    id: TARGET_ID,
    kind: 'authoring-target',
    label: { defaultMessage: 'Article content', key: 'studio.test/article-target' },
    modes: ['model', 'blueprint', 'content'],
    owner: { id: 'studio.test/extension', version: '1.0.0' },
    presentationStates: ['inline', 'maximized', 'fullscreen'],
    requiredCapabilities: [],
    resourceTypes: [RESOURCE_TYPE],
    saveOutcomes: ['save-item', 'save-new-type-version', 'save-as-new-type'],
    startKinds: ['blank', 'from-type', 'existing'],
    surface: SURFACE,
  };
}

function snapshotFixture(
  source: AuthoringStartRequest['source'] = { kind: 'existing' },
  overrides: Partial<AuthoringSessionSnapshot> = {},
): AuthoringSessionSnapshot {
  const model = modelFixture();
  const blueprint = blueprintFixture(model);
  const type = source.kind === 'blank' ? undefined : typeFixture(model, blueprint);
  const entry = entryFixture(model, {
    values: source.kind === 'existing' ? { title: 'Exact existing value' } : {},
  });
  return {
    capabilities: {
      modes: ['model', 'blueprint', 'content'],
      presentationStates: ['inline', 'maximized', 'fullscreen'],
      saveOutcomes: ['save-item', 'save-new-type-version', 'save-as-new-type'],
    },
    contractVersion: STUDIO_CONTRACT_VERSION,
    contributionGeneration: 'contributions-r4',
    kind: 'authoring-session',
    presentation: {
      current: 'inline',
      returnContext: {
        key: 'return/article-list',
        label: { defaultMessage: 'Articles', key: 'studio.test/articles' },
      },
    },
    resourceContext,
    sessionGeneration: 'session-r3',
    sessionId: 'sessions/article-7',
    start: source,
    state: {
      blueprint,
      coordinates: {
        blueprint: {
          id: blueprint.id,
          revision: blueprint.revision,
          version: blueprint.version,
        },
        entry: { id: entry.id, revision: entry.revision },
        model: { id: model.id, revision: model.revision, version: model.version },
        ...(type === undefined
          ? {}
          : { type: { id: type.id, revision: type.revision, version: type.version } }),
      },
      diagnostics: [],
      dirty: [],
      entry,
      model,
    },
    target: targetFixture(),
    ...(type === undefined ? {} : { type }),
    ...overrides,
  };
}

function resolutionFixture(): AuthoringTargetResolution {
  return {
    availableStarts: ['blank', 'from-type', 'existing'],
    initialPresentation: 'inline',
    resourceContext,
    returnContext: {
      key: 'return/article-list',
      label: { defaultMessage: 'Articles', key: 'studio.test/articles' },
    },
    target: targetFixture(),
  };
}

function configurationFixture(): StudioConfiguration {
  const configuration = createStudioConfigurationFixture();
  configuration.resourceContext = structuredClone(resourceContext);
  configuration.sessionGeneration = 'session-r3';
  configuration.sessionId = 'sessions/article-7';
  configuration.hostCapabilities.ports = [
    {
      id: 'studio.port/authoring',
      operations: [...AUTHORING_OPERATIONS],
      version: '1.0.0',
    },
  ];
  return configuration;
}

interface IdentifierProbe {
  readonly factories: StudioHostSessionIdentifierFactories;
  readonly idempotency: { key: string; operation: QualifiedName }[];
  readonly requests: { id: string; operation: QualifiedName }[];
}

function identifierProbe(): IdentifierProbe {
  const requests: IdentifierProbe['requests'] = [];
  const idempotency: IdentifierProbe['idempotency'] = [];
  let requestSerial = 0;
  let mutationSerial = 0;
  return {
    factories: {
      idempotencyKey(operation): string {
        mutationSerial += 1;
        const key = `idempotency/contextual-${String(mutationSerial)}`;
        idempotency.push({ key, operation });
        return key;
      },
      requestId(operation): string {
        requestSerial += 1;
        const id = `requests/contextual-${String(requestSerial)}`;
        requests.push({ id, operation });
        return id;
      },
    },
    idempotency,
    requests,
  };
}

interface AuthoringProbe {
  contexts: HostRequestContext[];
  failNextSave: boolean;
  failNextStart?: boolean;
  resolution: AuthoringTargetResolution;
  snapshot: AuthoringSessionSnapshot;
}

function hostAdapter(probe: AuthoringProbe): HostAdapter {
  const authoring: AuthoringPort = {
    listTypes(query, context) {
      probe.contexts.push(structuredClone(context));
      return Promise.resolve({
        value: {
          items:
            probe.snapshot.type === undefined
              ? []
              : [
                  {
                    blueprint: structuredClone(probe.snapshot.type.blueprint),
                    label: structuredClone(probe.snapshot.type.label),
                    model: structuredClone(probe.snapshot.type.model),
                    reference: {
                      id: probe.snapshot.type.id,
                      revision: probe.snapshot.type.revision,
                      version: probe.snapshot.type.version,
                    },
                  },
                ],
        },
      });
    },
    planSave(intent, context) {
      probe.contexts.push(structuredClone(context));
      return Promise.resolve({ value: planFor(intent) });
    },
    resolveTarget(request, context) {
      probe.contexts.push(structuredClone(context));
      return Promise.resolve({ value: structuredClone(probe.resolution) });
    },
    saveAsNewType(request, context) {
      probe.contexts.push(structuredClone(context));
      return saveResult(probe, request);
    },
    saveItem(request, context) {
      probe.contexts.push(structuredClone(context));
      return saveResult(probe, request);
    },
    saveNewTypeVersion(request, context) {
      probe.contexts.push(structuredClone(context));
      return saveResult(probe, request);
    },
    start(request, context) {
      probe.contexts.push(structuredClone(context));
      if (probe.failNextStart === true) {
        probe.failNextStart = false;
        return Promise.reject(
          hostFailure('unavailable', 'studio.test/retryable-authoring-start-failure'),
        );
      }
      return Promise.resolve({ value: structuredClone(probe.snapshot) });
    },
  };
  return { artifact: unreachableArtifactPort(), authoring };
}

function planFor(intent: AuthoringSaveIntent): AuthoringSavePlan {
  const affectedArtifacts: AuthoringSavePlan['affectedArtifacts'] =
    intent.draft.outcome === 'save-item'
      ? ['entry', ...(intent.draft.itemBlueprint === undefined ? [] : (['blueprint'] as const))]
      : ['model', 'blueprint', 'reusable-content-type'];
  return {
    affectedArtifacts,
    confirmationRequired: false,
    consequences: [],
    contractVersion: STUDIO_CONTRACT_VERSION,
    expected: structuredClone(intent.expected),
    id: `plans/${intent.draft.outcome}`,
    kind: 'authoring-save-plan',
    outcome: intent.draft.outcome,
    revision: `plan-${intent.draft.outcome}-r1`,
    sessionId: intent.sessionId,
  };
}

function saveResult(
  probe: AuthoringProbe,
  request:
    AuthoringSaveAsNewTypeRequest | AuthoringSaveItemRequest | AuthoringSaveNewTypeVersionRequest,
): Promise<{ value: AuthoringSaveResult }> {
  if (probe.failNextSave) {
    probe.failNextSave = false;
    return Promise.reject(hostFailure('unavailable', 'studio.test/retry-save'));
  }
  const accepted = acceptedSnapshot(probe.snapshot, request);
  probe.snapshot = structuredClone(accepted);
  return Promise.resolve({
    value: {
      contractVersion: STUDIO_CONTRACT_VERSION,
      kind: 'authoring-save-result',
      outcome: request.draft.outcome,
      plan: structuredClone(request.plan),
      session: accepted,
    },
  });
}

function acceptedSnapshot(
  prior: AuthoringSessionSnapshot,
  request:
    AuthoringSaveAsNewTypeRequest | AuthoringSaveItemRequest | AuthoringSaveNewTypeVersionRequest,
): AuthoringSessionSnapshot {
  const accepted = structuredClone(prior);
  if (request.kind === 'authoring-save-item-request') {
    accepted.state.entry = {
      ...structuredClone(request.draft.entry),
      revision: 'entry-r8',
    };
    accepted.state.coordinates.entry = {
      id: accepted.state.entry.id,
      revision: accepted.state.entry.revision,
    };
    accepted.state.dirty = accepted.state.dirty.filter((kind) => kind !== 'entry');
    if (request.draft.itemBlueprint !== undefined) {
      accepted.state.blueprint = {
        ...structuredClone(request.draft.itemBlueprint),
        revision: 'item-blueprint-r2',
      };
      accepted.state.coordinates.blueprint = {
        id: accepted.state.blueprint.id,
        revision: accepted.state.blueprint.revision,
        version: accepted.state.blueprint.version,
      };
      accepted.state.dirty = accepted.state.dirty.filter((kind) => kind !== 'blueprint');
    }
    return accepted;
  }

  const nextModelId =
    request.kind === 'authoring-save-as-new-type-request'
      ? 'models/article-copy'
      : request.draft.model.id;
  const nextBlueprintId =
    request.kind === 'authoring-save-as-new-type-request'
      ? 'blueprints/article-copy'
      : request.draft.blueprint.id;
  const nextModel: ContentModelDocument = {
    ...structuredClone(request.draft.model),
    id: nextModelId,
    revision: 'model-r2',
    version: '1.1.0',
  };
  const nextBlueprint: BlueprintDocument = {
    ...structuredClone(request.draft.blueprint),
    id: nextBlueprintId,
    model: { id: nextModel.id, revision: nextModel.revision, version: nextModel.version },
    revision: 'blueprint-r2',
    version: '1.1.0',
  };
  const priorType = prior.type;
  const nextType = typeFixture(nextModel, nextBlueprint, {
    authoringPolicy:
      request.kind === 'authoring-save-as-new-type-request'
        ? structuredClone(request.draft.authoringPolicy)
        : structuredClone(
            priorType?.authoringPolicy ?? typeFixture(nextModel, nextBlueprint).authoringPolicy,
          ),
    id:
      request.kind === 'authoring-save-as-new-type-request'
        ? 'types/article-copy'
        : (priorType?.id ?? 'types/article'),
    label:
      request.kind === 'authoring-save-as-new-type-request'
        ? structuredClone(request.draft.label)
        : structuredClone(priorType?.label ?? typeFixture(nextModel, nextBlueprint).label),
    revision: 'type-r2',
    version: '1.1.0',
  });
  accepted.type = nextType;
  accepted.state.model = nextModel;
  accepted.state.blueprint = nextBlueprint;
  accepted.state.entry = {
    ...accepted.state.entry,
    model: { id: nextModel.id, revision: nextModel.revision, version: nextModel.version },
    revision: 'entry-r8',
  };
  accepted.state.coordinates = {
    blueprint: {
      id: nextBlueprint.id,
      revision: nextBlueprint.revision,
      version: nextBlueprint.version,
    },
    entry: { id: accepted.state.entry.id, revision: accepted.state.entry.revision },
    model: { id: nextModel.id, revision: nextModel.revision, version: nextModel.version },
    type: { id: nextType.id, revision: nextType.revision, version: nextType.version },
  };
  accepted.state.dirty = accepted.state.dirty.filter(
    (kind) => kind !== 'model' && kind !== 'blueprint',
  );
  return accepted;
}

function unreachableArtifactPort(): ArtifactPort {
  const unreachable = (): Promise<never> => Promise.reject(new Error('artifact port not used'));
  return {
    dependencies: unreachable,
    load: unreachable,
    publish: unreachable,
    save: unreachable,
    unpublish: unreachable,
  };
}

function hostFailure(category: HostPortError['category'], code: QualifiedName): HostPortFailure {
  return new HostPortFailure({
    category,
    contractVersion: STUDIO_CONTRACT_VERSION,
    diagnostics: [
      {
        code,
        message: { defaultMessage: 'Test host refusal', key: code },
        severity: 'error',
      },
    ],
    kind: 'host-error',
    message: { defaultMessage: 'Test host refusal', key: code },
    retryable: category === 'unavailable',
  });
}

function targetRequest(intent: 'create' | 'edit'): AuthoringTargetResolveRequest {
  return { intent, resourceContext, targetId: TARGET_ID };
}

function startRequest(source: AuthoringStartRequest['source']): AuthoringStartRequest {
  return { resourceContext, source, targetId: TARGET_ID };
}

function insertCommand(
  session: Awaited<ReturnType<typeof openContextualStudioSession>>['session'],
): InsertNodeCommand {
  return {
    artifactId: session.blueprint.id,
    baseStateVersion: session.stateVersions.blueprint,
    contractVersion: STUDIO_CONTRACT_VERSION,
    expectedRevision: session.coordinates.blueprint.revision,
    id: 'commands/add-section',
    kind: 'command',
    payload: {
      destination: { position: session.blueprint.roots.length },
      node: {
        authoring: { mode: 'designer' },
        bindings: {},
        id: 'new-section',
        properties: {},
        slots: {},
        type: 'studio.test/section',
        version: '1.0.0',
      },
    },
    sessionGeneration: 'session-r3',
    type: 'studio.command/insert-node',
  };
}

function entryCommand(
  session: Awaited<ReturnType<typeof openContextualStudioSession>>['session'],
  value = 'Edited value',
): SetFieldValueCommand {
  return {
    artifactId: session.entry.id,
    baseStateVersion: session.stateVersions.entry,
    contractVersion: STUDIO_CONTRACT_VERSION,
    expectedRevision: session.coordinates.entry.revision,
    id: 'commands/set-title',
    kind: 'command',
    payload: { fieldPath: ['title'], locale: 'en', value },
    sessionGeneration: 'session-r3',
    type: 'studio.command/set-field-value',
  };
}

function modelCommand(
  session: Awaited<ReturnType<typeof openContextualStudioSession>>['session'],
): AddModelFieldCommand {
  return {
    artifactId: session.model.id,
    baseStateVersion: session.stateVersions.model,
    contractVersion: STUDIO_CONTRACT_VERSION,
    expectedRevision: session.coordinates.model.revision,
    id: 'commands/add-summary',
    kind: 'command',
    payload: {
      field: {
        cardinality: 'one',
        id: 'summary',
        kind: 'rich-text',
        label: { defaultMessage: 'Summary', key: 'studio.test/summary' },
        localized: true,
        required: false,
      },
    },
    sessionGeneration: 'session-r3',
    type: 'studio.command/add-model-field',
  };
}

async function openFixture(
  source: AuthoringStartRequest['source'] = { kind: 'existing' },
  snapshotOverrides: Partial<AuthoringSessionSnapshot> = {},
  configure?: (configuration: StudioConfiguration) => void,
): Promise<{
  handle: Awaited<ReturnType<typeof openContextualStudioSession>>;
  identifiers: IdentifierProbe;
  probe: AuthoringProbe;
}> {
  const snapshot = snapshotFixture(source, snapshotOverrides);
  const probe: AuthoringProbe = {
    contexts: [],
    failNextSave: false,
    resolution: resolutionFixture(),
    snapshot,
  };
  const identifiers = identifierProbe();
  const configuration = configurationFixture();
  configure?.(configuration);
  const handle = await openContextualStudioSession(hostAdapter(probe), {
    configuration,
    identifiers: identifiers.factories,
    start: startRequest(source),
    target: targetRequest(source.kind === 'existing' ? 'edit' : 'create'),
  });
  return { handle, identifiers, probe };
}

describe('contextual Studio opening and exact hydration', () => {
  it.each(['blueprint', 'entry', 'model'] as const)(
    'rejects a schema-valid host %s above the resolved session policy before opening',
    async (artifact) => {
      const snapshot = snapshotFixture({ kind: 'existing' });
      snapshot.state[artifact].extensions = {
        'studio.test/security-probe': { enabled: true },
      };

      await expect(
        openFixture({ kind: 'existing' }, snapshot, (configuration) => {
          configuration.limits.maxExtensionBytes = 0;
        }),
      ).rejects.toMatchObject({ code: 'resource-limit' });
    },
  );

  it('resolves and lists authorized reusable types before starting exact create drafts', async () => {
    const type = typeFixture(modelFixture(), blueprintFixture(modelFixture()));
    const source = {
      kind: 'from-type' as const,
      type: { id: type.id, revision: type.revision, version: type.version },
    };
    const probe: AuthoringProbe = {
      contexts: [],
      failNextSave: false,
      resolution: resolutionFixture(),
      snapshot: snapshotFixture(source),
    };
    const identifiers = identifierProbe();
    const preflight = await preflightContextualStudioSession(hostAdapter(probe), {
      configuration: configurationFixture(),
      identifiers: identifiers.factories,
      target: targetRequest('create'),
    });

    expect(preflight.started).toBe(false);
    expect(identifiers.requests.map(({ operation }) => operation)).toEqual([
      'studio.operation/authoring.resolve-target',
    ]);
    const listed = await preflight.types?.list({
      limit: 100,
      resourceContext,
      targetId: TARGET_ID,
    });
    expect(listed?.value.items[0]?.reference).toEqual(source.type);

    const handle = await preflight.start(startRequest(source));
    expect(handle.session.snapshot.start).toEqual(source);
    expect(preflight.started).toBe(true);
    expect(identifiers.requests.map(({ operation }) => operation)).toEqual([
      'studio.operation/authoring.resolve-target',
      'studio.operation/authoring.list-types',
      'studio.operation/authoring.start',
    ]);
    expect(
      identifiers.idempotency.filter(
        ({ operation }) => operation === 'studio.operation/authoring.start',
      ),
    ).toHaveLength(1);
    expect(probe.contexts.at(-1)?.idempotencyKey).toBe('idempotency/contextual-1');
    await expect(preflight.start(startRequest({ kind: 'blank' }))).rejects.toMatchObject({
      code: 'disposed',
    });
    handle.dispose();
  });

  it('disposes an unstarted preflight without issuing a start request', async () => {
    const probe: AuthoringProbe = {
      contexts: [],
      failNextSave: false,
      resolution: resolutionFixture(),
      snapshot: snapshotFixture({ kind: 'blank' }),
    };
    const identifiers = identifierProbe();
    const preflight = await preflightContextualStudioSession(hostAdapter(probe), {
      configuration: configurationFixture(),
      identifiers: identifiers.factories,
      target: targetRequest('create'),
    });
    preflight.dispose();

    await expect(preflight.start(startRequest({ kind: 'blank' }))).rejects.toMatchObject({
      code: 'disposed',
    });
    expect(identifiers.requests.map(({ operation }) => operation)).toEqual([
      'studio.operation/authoring.resolve-target',
    ]);
  });

  it('reuses the exact start idempotency key after an ambiguous retryable failure', async () => {
    const probe: AuthoringProbe = {
      contexts: [],
      failNextSave: false,
      failNextStart: true,
      resolution: resolutionFixture(),
      snapshot: snapshotFixture({ kind: 'blank' }),
    };
    const identifiers = identifierProbe();
    const preflight = await preflightContextualStudioSession(hostAdapter(probe), {
      configuration: configurationFixture(),
      identifiers: identifiers.factories,
      target: targetRequest('create'),
    });
    const request = startRequest({ kind: 'blank' });

    await expect(preflight.start(request)).rejects.toMatchObject({
      error: { category: 'unavailable' },
    });
    const handle = await preflight.start(request);

    expect(
      identifiers.idempotency.filter(
        ({ operation }) => operation === 'studio.operation/authoring.start',
      ),
    ).toHaveLength(1);
    expect(
      probe.contexts
        .filter(({ operationId }) => operationId === 'studio.operation/authoring.start')
        .map(({ idempotencyKey }) => idempotencyKey),
    ).toEqual(['idempotency/contextual-1', 'idempotency/contextual-1']);
    expect(
      identifiers.requests.filter(
        ({ operation }) => operation === 'studio.operation/authoring.start',
      ),
    ).toHaveLength(2);
    handle.dispose();
  });

  it('resolves and starts one exact resource-bound existing-item session', async () => {
    const { handle, identifiers, probe } = await openFixture();

    expect(handle.session.snapshot.start).toEqual({ kind: 'existing' });
    expect(handle.session.entry.values).toEqual({ title: 'Exact existing value' });
    expect(handle.session.coordinates).toEqual(handle.session.snapshot.state.coordinates);
    expect(handle.session.dirty).toEqual({ blueprint: false, entry: false, model: false });
    expect(identifiers.requests.map(({ operation }) => operation)).toEqual([
      'studio.operation/authoring.resolve-target',
      'studio.operation/authoring.start',
    ]);
    expect(probe.contexts).toHaveLength(2);
    expect(
      probe.contexts.every((context) => context.resourceContextKey === resourceContext.key),
    ).toBe(true);
    expect(probe.contexts.every((context) => context.sessionGeneration === 'session-r3')).toBe(
      true,
    );
  });

  it('opens blank and exact from-type starts without copying Entry values', async () => {
    const blank = await openFixture({ kind: 'blank' });
    expect(blank.handle.session.snapshot.type).toBeUndefined();
    expect(blank.handle.session.entry.values).toEqual({});

    const type = typeFixture(modelFixture(), blueprintFixture(modelFixture()));
    const fromType = await openFixture({
      kind: 'from-type',
      type: { id: type.id, revision: type.revision, version: type.version },
    });
    expect(fromType.handle.session.snapshot.type).toMatchObject({
      id: type.id,
      revision: type.revision,
      version: type.version,
    });
    expect(fromType.handle.session.entry.values).toEqual({});
  });

  it('rejects mismatched request contexts and mismatched hydrated coordinates', async () => {
    const configuration = configurationFixture();
    const probe: AuthoringProbe = {
      contexts: [],
      failNextSave: false,
      resolution: resolutionFixture(),
      snapshot: snapshotFixture(),
    };
    const wrongContext = {
      ...resourceContext,
      key: 'contexts/other',
    };
    await expect(
      openContextualStudioSession(hostAdapter(probe), {
        configuration,
        identifiers: identifierProbe().factories,
        start: { ...startRequest({ kind: 'existing' }), resourceContext: wrongContext },
        target: targetRequest('edit'),
      }),
    ).rejects.toMatchObject({ code: 'invalid-authoring-request' });
    expect(probe.contexts).toEqual([]);

    probe.snapshot = snapshotFixture({ kind: 'existing' });
    probe.snapshot.state.entry.model.revision = 'model-wrong';
    await expect(
      openContextualStudioSession(hostAdapter(probe), {
        configuration,
        identifiers: identifierProbe().factories,
        start: startRequest({ kind: 'existing' }),
        target: targetRequest('edit'),
      }),
    ).rejects.toBeInstanceOf(HostPortFailure);
  });

  it('rejects a started snapshot that substitutes a different return context', async () => {
    const probe: AuthoringProbe = {
      contexts: [],
      failNextSave: false,
      resolution: resolutionFixture(),
      snapshot: snapshotFixture({ kind: 'existing' }),
    };
    probe.snapshot.presentation.returnContext = {
      key: 'return/substituted',
      label: { defaultMessage: 'Wrong return', key: 'studio.test/wrong-return' },
    };

    await expect(
      openContextualStudioSession(hostAdapter(probe), {
        configuration: configurationFixture(),
        identifiers: identifierProbe().factories,
        start: startRequest({ kind: 'existing' }),
        target: targetRequest('edit'),
      }),
    ).rejects.toBeInstanceOf(HostPortFailure);
  });

  it('keeps the Blueprint-only opener available and independently profiled', () => {
    expect(openStudioSession).toBeTypeOf('function');
  });
});

describe('coordinated but separate contextual drafts', () => {
  it('dispatches Model, Blueprint, and Entry commands without collapsing their state', async () => {
    const { handle } = await openFixture();
    handle.session.executeModel(modelCommand(handle.session));
    handle.session.executeBlueprint(insertCommand(handle.session));
    handle.session.executeEntry(entryCommand(handle.session));

    expect(handle.session.model.fields.map((field) => field.id)).toEqual(['title', 'summary']);
    expect(handle.session.blueprint.roots.at(-1)?.id).toBe('new-section');
    expect(handle.session.entry.values.title).toBe('Edited value');
    expect(handle.session.stateVersions).toEqual({ blueprint: 1, entry: 1, model: 1 });
    expect(handle.session.dirty).toEqual({ blueprint: true, entry: true, model: true });
    expect(handle.session.snapshot.state.dirty).toEqual(['model', 'blueprint', 'entry']);
  });

  it('enforces independent state, revision, generation, and mode fences', async () => {
    const { handle } = await openFixture();
    const first = entryCommand(handle.session);
    handle.session.executeEntry(first);
    expect(() => handle.session.executeEntry(first)).toThrow(
      expect.objectContaining({ code: 'stale-state' }) as Error,
    );
    expect(() =>
      handle.session.executeModel({
        ...modelCommand(handle.session),
        expectedRevision: 'model-wrong',
      }),
    ).toThrow(expect.objectContaining({ code: 'stale-state' }) as Error);
    expect(() =>
      handle.session.executeBlueprint({
        ...insertCommand(handle.session),
        sessionGeneration: 'session-stale',
      }),
    ).toThrow(expect.objectContaining({ code: 'stale-generation' }) as Error);

    const modes = snapshotFixture({ kind: 'existing' });
    modes.capabilities.modes = ['content'];
    const contentOnly = await openFixture({ kind: 'existing' }, modes);
    expect(() =>
      contentOnly.handle.session.executeModel(modelCommand(contentOnly.handle.session)),
    ).toThrow(expect.objectContaining({ code: 'mode-forbidden' }) as Error);
  });

  it('enforces the exact contextual Blueprint limits without advancing draft state', async () => {
    const snapshot = snapshotFixture();
    snapshot.state.blueprint.roots = [blueprintNodeFixture('existing-section')];
    const { handle } = await openFixture({ kind: 'existing' }, snapshot, (configuration) => {
      configuration.limits.maxNodes = 1;
    });
    const before = handle.session.snapshot;

    expect(() => handle.session.executeBlueprint(insertCommand(handle.session))).toThrow(
      expect.objectContaining({ code: 'resource-limit' }) as Error,
    );
    expect(handle.session.snapshot).toStrictEqual(before);
    expect(handle.session.stateVersions).toEqual({ blueprint: 0, entry: 0, model: 0 });
    expect(handle.session.dirty).toEqual({ blueprint: false, entry: false, model: false });
  });

  it('enforces exact contextual permissions on protected Blueprint nodes', async () => {
    const snapshot = snapshotFixture();
    const protectedNode = blueprintNodeFixture(
      'protected-section',
      'studio.permission/edit-protected',
    );
    snapshot.state.blueprint.roots = [protectedNode];
    const { handle } = await openFixture({ kind: 'existing' }, snapshot);
    const command: BlueprintCommand = {
      artifactId: handle.session.blueprint.id,
      baseStateVersion: 0,
      contractVersion: STUDIO_CONTRACT_VERSION,
      expectedRevision: handle.session.coordinates.blueprint.revision,
      id: 'commands/protected-property',
      kind: 'command',
      payload: { nodeId: protectedNode.id, property: 'title', value: 'Denied' },
      sessionGeneration: 'session-r3',
      type: 'studio.command/set-property',
    };

    expect(() => handle.session.executeBlueprint(command)).toThrow(
      expect.objectContaining({ code: 'permission-forbidden' }) as Error,
    );
    expect(handle.session.stateVersions.blueprint).toBe(0);
    expect(handle.session.dirty.blueprint).toBe(false);
  });

  it('enforces contextual rich-text and extension limits before entry/model state advances', async () => {
    const { handle } = await openFixture({ kind: 'existing' }, {}, (configuration): void => {
      configuration.limits.maxExtensionBytes = 0;
      configuration.limits.maxRichTextBytes = 20;
    });
    const beforeEntry = handle.session.entry;
    const richTextCommand = entryCommand(handle.session);
    richTextCommand.payload.value = {
      content: [{ content: [{ text: 'too much content', type: 'text' }], type: 'paragraph' }],
      type: 'doc',
    };
    expect(() => handle.session.executeEntry(richTextCommand)).toThrow(
      expect.objectContaining({ code: 'resource-limit' }) as Error,
    );
    expect(handle.session.entry).toStrictEqual(beforeEntry);
    expect(handle.session.stateVersions.entry).toBe(0);

    const extensionCommand = modelCommand(handle.session);
    extensionCommand.payload.field.extensions = { 'studio.test/data': { enabled: true } };
    expect(() => handle.session.executeModel(extensionCommand)).toThrow(
      expect.objectContaining({ code: 'resource-limit' }) as Error,
    );
    expect(handle.session.model.fields.map((field) => field.id)).toEqual(['title']);
    expect(handle.session.stateVersions.model).toBe(0);
  });
});

describe('explicit save planning and host reconciliation', () => {
  it('saves only the item and preserves unsaved Model and reusable Blueprint drafts', async () => {
    const { handle } = await openFixture();
    handle.session.executeModel(modelCommand(handle.session));
    handle.session.executeBlueprint(insertCommand(handle.session));
    handle.session.executeEntry(entryCommand(handle.session));
    const beforeType = handle.session.snapshot.type;
    const intent = handle.session.createSaveIntent({ outcome: 'save-item' });
    expect(intent.draft).toMatchObject({ outcome: 'save-item' });
    expect(intent.draft).not.toHaveProperty('model');
    expect(intent.draft).not.toHaveProperty('blueprint');
    const plan = (await handle.planSave(intent)).value;
    await handle.save(intent, plan);

    expect(handle.session.snapshot.type).toEqual(beforeType);
    expect(handle.session.dirty).toEqual({ blueprint: true, entry: false, model: true });
    expect(handle.session.model.fields.map((field) => field.id)).toContain('summary');
    expect(handle.session.blueprint.roots.at(-1)?.id).toBe('new-section');
  });

  it('accepts an item-local Blueprint while preserving the reusable base Blueprint', async () => {
    const { handle } = await openFixture();
    const baseBlueprint = handle.session.snapshot.type?.blueprint;
    handle.session.executeBlueprint(insertCommand(handle.session));
    const intent = handle.session.createSaveIntent({
      includeItemBlueprint: true,
      outcome: 'save-item',
    });
    const plan = (await handle.planSave(intent)).value;
    await handle.save(intent, plan);

    expect(handle.session.coordinates.blueprint.revision).toBe('item-blueprint-r2');
    expect(handle.session.snapshot.type?.blueprint).toEqual(baseBlueprint);
    expect(handle.session.dirty.blueprint).toBe(false);
  });

  it('preserves local presentation through a save without inventing a host mutation', async () => {
    const { handle } = await openFixture();
    expect(handle.session.setPresentation('maximized')).toBe('maximized');
    expect(handle.session.snapshot.presentation.current).toBe('maximized');

    const intent = handle.session.createSaveIntent({ outcome: 'save-item' });
    const plan = (await handle.planSave(intent)).value;
    const result = await handle.save(intent, plan);

    expect(result.value.session.presentation.current).toBe('maximized');
    expect(handle.session.snapshot.presentation.current).toBe('maximized');
    expect(() => handle.session.setPresentation('minimized')).toThrow(
      expect.objectContaining({ code: 'invalid-authoring-request' }) as Error,
    );
  });

  it('saves an immutable successor type version and preserves dirty Entry values', async () => {
    const initial = snapshotFixture({ kind: 'existing' });
    initial.state.dirty = ['entry'];
    const { handle } = await openFixture({ kind: 'existing' }, initial);
    const entryValues = handle.session.entry.values;
    const intent = handle.session.createSaveIntent({ outcome: 'save-new-type-version' });
    expect(intent.draft).not.toHaveProperty('entry');
    const plan = (await handle.planSave(intent)).value;
    await handle.save(intent, plan);

    expect(handle.session.snapshot.type).toMatchObject({
      id: 'types/article',
      revision: 'type-r2',
      version: '1.1.0',
    });
    expect(handle.session.entry.values).toEqual(entryValues);
    expect(handle.session.dirty.entry).toBe(true);
  });

  it('saves a distinct new type without sending Entry values', async () => {
    const { handle } = await openFixture();
    handle.session.executeEntry(entryCommand(handle.session, 'Unsaved item value'));
    const intent = handle.session.createSaveIntent({
      authoringPolicy: { itemComposition: 'overrides', modes: ['blueprint', 'content'] },
      label: { defaultMessage: 'Article copy', key: 'studio.test/article-copy' },
      outcome: 'save-as-new-type',
    });
    expect(intent.draft).not.toHaveProperty('entry');
    const plan = (await handle.planSave(intent)).value;
    await handle.save(intent, plan);
    expect(handle.session.snapshot.type?.id).toBe('types/article-copy');
    expect(handle.session.entry.values).toEqual({ title: 'Unsaved item value' });
    expect(handle.session.dirty.entry).toBe(true);
  });

  it('rejects a mismatched plan and an unauthorized reusable-type mutation', async () => {
    const { handle, probe } = await openFixture();
    handle.session.executeModel(modelCommand(handle.session));
    const intent = handle.session.createSaveIntent({ outcome: 'save-item' });
    const plan = (await handle.planSave(intent)).value;
    await expect(
      handle.save(intent, { ...plan, outcome: 'save-as-new-type' }),
    ).rejects.toMatchObject({ code: 'save-plan-mismatch' });

    if (probe.snapshot.type === undefined || probe.snapshot.state.coordinates.type === undefined) {
      throw new Error('The existing-item fixture requires a reusable type.');
    }
    probe.snapshot.type.id = 'types/hijacked';
    probe.snapshot.state.coordinates.type.id = 'types/hijacked';
    await expect(handle.save(intent, plan)).rejects.toBeInstanceOf(HostPortFailure);
    expect(handle.session.dirty.model).toBe(true);
  });

  it('reuses an idempotency key after a retryable failure and allocates a new request ID', async () => {
    const { handle, identifiers, probe } = await openFixture();
    handle.session.executeEntry(entryCommand(handle.session));
    const intent = handle.session.createSaveIntent({ outcome: 'save-item' });
    const plan = (await handle.planSave(intent)).value;
    probe.failNextSave = true;
    await expect(handle.save(intent, plan)).rejects.toMatchObject({
      error: { category: 'unavailable' },
    });
    await expect(handle.save(intent, plan)).resolves.toMatchObject({
      value: { outcome: 'save-item' },
    });

    expect(
      identifiers.idempotency.filter(
        ({ operation }) => operation === 'studio.operation/authoring.save-item',
      ),
    ).toHaveLength(1);
    expect(
      identifiers.requests.filter(
        ({ operation }) => operation === 'studio.operation/authoring.save-item',
      ),
    ).toHaveLength(2);
  });

  it('serializes competing saves and rejects a plan after the first acceptance', async () => {
    const { handle, identifiers } = await openFixture();
    handle.session.executeEntry(entryCommand(handle.session));
    const intent = handle.session.createSaveIntent({ outcome: 'save-item' });
    const plan = (await handle.planSave(intent)).value;
    const outcomes = await Promise.allSettled([
      handle.save(intent, plan),
      handle.save(intent, plan),
    ]);

    expect(outcomes[0]).toMatchObject({ status: 'fulfilled' });
    expect(outcomes[1]?.status).toBe('rejected');
    if (outcomes[1]?.status !== 'rejected') {
      throw new Error('The competing save must be rejected after the first save is accepted.');
    }
    const rejection: unknown = outcomes[1].reason;
    expect(rejection).toMatchObject({ code: 'save-plan-mismatch' });
    expect(
      identifiers.requests.filter(
        ({ operation }) => operation === 'studio.operation/authoring.save-item',
      ),
    ).toHaveLength(1);
  });
});

describe('contextual host-session lifecycle', () => {
  it('lists types only for the same target and complete resource context', async () => {
    const { handle } = await openFixture();
    const query: AuthoringTypeListQuery = {
      limit: 10,
      resourceContext,
      targetId: TARGET_ID,
    };
    const listed = await handle.types?.list(query);
    expect(listed?.value.items[0]?.reference.id).toBe('types/article');
    await expect(
      handle.types?.list({
        ...query,
        resourceContext: { ...resourceContext, key: 'contexts/other' },
      }),
    ).rejects.toMatchObject({ code: 'invalid-authoring-request' });
  });

  it('invalidates every later operation after a stale-generation host failure', async () => {
    const snapshot = snapshotFixture();
    const probe: AuthoringProbe = {
      contexts: [],
      failNextSave: false,
      resolution: resolutionFixture(),
      snapshot,
    };
    const adapter = hostAdapter(probe);
    if (adapter.authoring === undefined) {
      throw new Error('The contextual test adapter is required.');
    }
    adapter.authoring.listTypes = () =>
      Promise.reject(
        hostFailure('invalid-request', STUDIO_STALE_SESSION_GENERATION_DIAGNOSTIC_CODE),
      );
    const identifiers = identifierProbe();
    const handle = await openContextualStudioSession(adapter, {
      configuration: configurationFixture(),
      identifiers: identifiers.factories,
      start: startRequest({ kind: 'existing' }),
      target: targetRequest('edit'),
    });
    await expect(
      handle.types?.list({ limit: 10, resourceContext, targetId: TARGET_ID }),
    ).rejects.toBeInstanceOf(HostPortFailure);
    expect(handle.invalidated).toBe(true);
    const attempts = identifiers.requests.length;
    const intent = handle.session.createSaveIntent({ outcome: 'save-item' });
    await expect(handle.planSave(intent)).rejects.toBeInstanceOf(HostPortFailure);
    expect(identifiers.requests).toHaveLength(attempts);
  });

  it('disposes locally and never allocates another host request', async () => {
    const { handle, identifiers } = await openFixture();
    handle.dispose();
    handle.dispose();
    const attempts = identifiers.requests.length;
    const intent = handle.session.createSaveIntent({ outcome: 'save-item' });
    await expect(handle.planSave(intent)).rejects.toMatchObject({ code: 'disposed' });
    expect(identifiers.requests).toHaveLength(attempts);
    expect(handle.disposed).toBe(true);
  });
});
