import { describe, expect, it } from 'vitest';
import { applyCommand, applyEntryCommand, applyModelCommand } from '@kumwe/studio-core';
import {
  STUDIO_CONTRACT_VERSION,
  type AddModelFieldCommand,
  type AuthoringPort,
  type AuthoringSaveIntent,
  type AuthoringSavePlan,
  type AuthoringSaveResult,
  type AuthoringSessionSnapshot,
  type AuthoringStartRequest,
  type AuthoringTargetDeclaration,
  type AuthoringTargetResolveRequest,
  type AuthoringTypeListQuery,
  type BlueprintDocument,
  type ContentModelDocument,
  type EntryDocument,
  type HostRequestContext,
  type InsertNodeCommand,
  type ReusableContentTypeDefinition,
  type SetFieldValueCommand,
  type StudioCommand,
  type StudioResourceContext,
} from '@kumwe/studio-protocol';
import {
  createHostRequestContextFixture,
  createTestbedHost,
  runContextualAuthoringStrideVector,
  type ContextualAuthoringConformanceAdapter,
  type ContextualAuthoringSaveRequest,
  type ContextualAuthoringStrideVector,
  type TestbedAuthoringOptions,
} from '../src/index.js';

const target: AuthoringTargetDeclaration = {
  contractVersion: STUDIO_CONTRACT_VERSION,
  contributionDependencies: [],
  eligibility: ['create', 'edit'],
  id: 'studio.test/content-editor',
  kind: 'authoring-target',
  label: { defaultMessage: 'Content editor', key: 'studio.test/content-editor' },
  modes: ['model', 'blueprint', 'content'],
  owner: { id: 'studio.test/host', version: '1.0.0' },
  presentationStates: ['inline', 'fullscreen'],
  requiredCapabilities: [],
  resourceTypes: ['studio.test/article'],
  saveOutcomes: ['save-item', 'save-new-type-version', 'save-as-new-type'],
  startKinds: ['blank', 'from-type', 'existing'],
  surface: 'studio.test/article-editor',
};

const existingContext = resourceContext('contexts/existing', 'articles/existing');
const fromTypeContext = resourceContext('contexts/from-type', 'articles/new-from-type');
const blankContext = resourceContext('contexts/blank', 'articles/new-blank');
const existingValues = { summary: 'Do not copy this value', title: 'Existing article' };

const typeV1 = reusableType('1.0.0', 'type-r1', 'model-r1', 'blueprint-r1');
const typeV2 = reusableType('2.0.0', 'type-r2', 'model-r2', 'blueprint-r2');
const existing = sessionFixture({
  context: existingContext,
  entryId: 'articles/existing',
  entryRevision: 'entry-existing-r7',
  sessionId: 'sessions/existing',
  source: { kind: 'existing' },
  type: typeV1,
  values: existingValues,
});
const fromType = sessionFixture({
  context: fromTypeContext,
  entryId: 'articles/new-from-type',
  entryRevision: 'entry-from-type-r0',
  sessionId: 'sessions/from-type',
  source: { kind: 'from-type', type: referenceOf(typeV2) },
  type: typeV2,
  values: {},
});
const blank = blankSessionFixture();

const targetRequest: AuthoringTargetResolveRequest = {
  intent: 'edit',
  requestedPresentation: 'inline',
  resourceContext: existingContext,
  targetId: target.id,
};
const targetResolution = {
  availableStarts: ['existing'] as const,
  initialPresentation: 'inline' as const,
  resourceContext: existingContext,
  returnContext: { key: 'returns/article-list' },
  target,
};
const typeQuery: AuthoringTypeListQuery = {
  limit: 10,
  resourceContext: fromTypeContext,
  targetId: target.id,
};
const typePage = {
  items: [typeV1, typeV2].map((definition) => ({
    blueprint: definition.blueprint,
    label: definition.label,
    model: definition.model,
    reference: referenceOf(definition),
  })),
};

const blankStart: AuthoringStartRequest = {
  resourceContext: blankContext,
  source: { kind: 'blank' },
  targetId: target.id,
};
const fromTypeStart: AuthoringStartRequest = {
  resourceContext: fromTypeContext,
  source: { kind: 'from-type', type: referenceOf(typeV2) },
  targetId: target.id,
};
const existingStart: AuthoringStartRequest = {
  resourceContext: existingContext,
  source: { kind: 'existing' },
  targetId: target.id,
};

const modelCommand: AddModelFieldCommand = {
  artifactId: blank.state.model.id,
  baseStateVersion: 0,
  contractVersion: STUDIO_CONTRACT_VERSION,
  expectedRevision: blank.state.model.revision,
  id: 'commands/add-summary',
  kind: 'command',
  payload: {
    field: {
      authoring: { control: 'studio.control/single-line-text' },
      cardinality: 'one',
      id: 'summary',
      kind: 'string',
      label: { defaultMessage: 'Summary', key: 'studio.test/summary' },
      localized: false,
      required: false,
    },
  },
  sessionGeneration: blank.sessionGeneration,
  type: 'studio.command/add-model-field',
};
const blueprintCommand: InsertNodeCommand = {
  artifactId: blank.state.blueprint.id,
  baseStateVersion: 0,
  contractVersion: STUDIO_CONTRACT_VERSION,
  expectedRevision: blank.state.blueprint.revision,
  id: 'commands/insert-heading',
  kind: 'command',
  payload: {
    destination: { position: 0 },
    node: {
      authoring: { mode: 'designer' },
      bindings: {},
      id: 'node-heading',
      properties: {},
      slots: {},
      type: 'studio.test/heading',
      version: '1.0.0',
    },
  },
  sessionGeneration: blank.sessionGeneration,
  type: 'studio.command/insert-node',
};
const entryCommand: SetFieldValueCommand = {
  artifactId: blank.state.entry.id,
  baseStateVersion: 0,
  contractVersion: STUDIO_CONTRACT_VERSION,
  expectedRevision: blank.state.entry.revision,
  id: 'commands/set-summary',
  kind: 'command',
  payload: { fieldPath: ['summary'], value: 'Authored in one session' },
  sessionGeneration: blank.sessionGeneration,
  type: 'studio.command/set-field-value',
};
const authoredBlank = authoredSnapshot(blank, [modelCommand, blueprintCommand, entryCommand]);

const saveAssertions = createSaveAssertions();
const authoringFixtures: TestbedAuthoringOptions = {
  plans: saveAssertions.map(({ expectPlan, intent }) => ({
    intent,
    plan: expectPlan,
    resourceContextKey: resourceKeyForIntent(intent),
  })),
  saves: saveAssertions.map(({ expectResult, request }) => ({
    request,
    resourceContextKey: expectResult.session.resourceContext.key,
    result: expectResult,
  })),
  starts: [
    { request: blankStart, session: blank },
    { request: fromTypeStart, session: fromType },
    { request: existingStart, session: existing },
  ],
  targets: [{ request: targetRequest, resolution: targetResolution }],
  types: [typeV1, typeV2].map((definition) => ({
    definition,
    resourceContextKey: fromTypeContext.key,
    targetId: target.id,
  })),
};

describe('contextual authoring first-stride conformance', () => {
  it('replays target, exact starts, coordinated commands, and distinct host saves', async () => {
    const testbed = createTestbedHost({ authoring: authoringFixtures });
    const authoring = requiredAuthoring(testbed.host.authoring);
    const adapter = conformanceAdapter(authoring, testbed.controls.sessionGeneration);
    const vector: ContextualAuthoringStrideVector = {
      authoring: {
        commands: [modelCommand, blueprintCommand, entryCommand],
        expect: authoredBlank,
        startName: 'blank',
      },
      contractVersion: STUDIO_CONTRACT_VERSION,
      description: 'First executable contextual Model, Blueprint, Entry, and save-boundary stride.',
      id: 'studio.conformance/contextual-authoring-first-stride',
      kind: 'contextual-authoring-stride-vector',
      launches: [
        { expect: blank, name: 'blank', request: blankStart },
        {
          expect: fromType,
          forbiddenEntryValues: [existingValues],
          name: 'from-type',
          request: fromTypeStart,
        },
        { expect: existing, name: 'existing', request: existingStart },
      ],
      requirements: [
        'STUDIO-PROD-001',
        'STUDIO-PROD-002',
        'STUDIO-PROD-003',
        'STUDIO-PROD-004',
        'STUDIO-PROD-005',
        'STUDIO-PROD-006',
        'STUDIO-PROD-010',
      ],
      saves: saveAssertions,
      target: { expect: targetResolution, request: targetRequest },
      types: { expect: typePage, query: typeQuery },
    };

    const result = await runContextualAuthoringStrideVector(vector, adapter);

    expect(result).toEqual({
      completeProfile: false,
      mismatches: [],
      passed: true,
      profile: 'studio.profile/authoring-web',
      vectorId: vector.id,
    });
    expect(testbed.controls.authoringOperations.map(({ operation }) => operation)).toEqual([
      'resolve-target',
      'list-types',
      'start',
      'start',
      'start',
      'plan-save',
      'save-item',
      'plan-save',
      'save-new-type-version',
      'plan-save',
      'save-as-new-type',
    ]);
  });

  it('fails closed when launch or save intent crosses the authoritative resource context', async () => {
    const testbed = createTestbedHost({ authoring: authoringFixtures });
    const authoring = requiredAuthoring(testbed.host.authoring);
    const itemSave = saveAssertions[0];
    if (itemSave === undefined) throw new Error('The item-save fixture is required.');
    if (itemSave.request.kind !== 'authoring-save-item-request') {
      throw new Error('The first save fixture must be save-item.');
    }

    await expect(
      authoring.resolveTarget(
        targetRequest,
        authoringContext(
          'resolve-target',
          testbed.controls.sessionGeneration,
          'contexts/another-resource',
        ),
      ),
    ).rejects.toMatchObject({ error: { category: 'invalid-request' } });

    await expect(
      authoring.planSave(
        itemSave.intent,
        authoringContext(
          'plan-save',
          testbed.controls.sessionGeneration,
          'contexts/another-resource',
        ),
      ),
    ).rejects.toMatchObject({ error: { category: 'invalid-request' } });

    await expect(
      authoring.saveItem(
        itemSave.request,
        authoringContext(
          'save-item',
          testbed.controls.sessionGeneration,
          'contexts/another-resource',
          1,
          true,
        ),
      ),
    ).rejects.toMatchObject({ error: { category: 'invalid-request' } });
    expect(testbed.controls.authoringOperations).toEqual([]);
  });

  it('replays an idempotent start once and rejects reuse for changed launch intent', async () => {
    const testbed = createTestbedHost({ authoring: authoringFixtures });
    const authoring = requiredAuthoring(testbed.host.authoring);
    const context = authoringContext(
      'start',
      testbed.controls.sessionGeneration,
      blankContext.key,
      1,
      true,
    );

    const first = await authoring.start(blankStart, context);
    const replay = await authoring.start(blankStart, context);
    expect(replay).toEqual(first);
    expect(testbed.controls.authoringOperations.map(({ operation }) => operation)).toEqual([
      'start',
    ]);

    await expect(
      authoring.start(
        {
          ...blankStart,
          source: { kind: 'from-type', type: referenceOf(typeV2) },
        },
        context,
      ),
    ).rejects.toMatchObject({ error: { category: 'invalid-request' } });
    expect(testbed.controls.authoringOperations).toHaveLength(1);
  });

  it('rejects save vectors that cross reusable-type or unsaved-Entry boundaries', async () => {
    const testbed = createTestbedHost({ authoring: authoringFixtures });
    const adapter = conformanceAdapter(
      requiredAuthoring(testbed.host.authoring),
      testbed.controls.sessionGeneration,
    );
    const badItem = structuredClone(saveAssertions[0]);
    const badType = structuredClone(saveAssertions[1]);
    if (badItem === undefined || badType === undefined) {
      throw new Error('The save-boundary fixtures are required.');
    }
    badItem.expectResult.session.type = structuredClone(typeV2);
    badItem.expectResult.session.state.coordinates.type = referenceOf(typeV2);
    badType.expectResult.session.state.entry.values.title = 'Host lost the unsaved value';
    badType.expectResult.session.state.dirty = [];
    const brokenAdapter: ContextualAuthoringConformanceAdapter = {
      ...adapter,
      saveItem: () => Promise.resolve(structuredClone(badItem.expectResult)),
      saveNewTypeVersion: () => Promise.resolve(structuredClone(badType.expectResult)),
    };
    const vector: ContextualAuthoringStrideVector = {
      contractVersion: STUDIO_CONTRACT_VERSION,
      description: 'Negative save-boundary drill.',
      id: 'studio.conformance/contextual-authoring-save-boundary-negative',
      kind: 'contextual-authoring-stride-vector',
      launches: [],
      requirements: ['STUDIO-PROD-004', 'STUDIO-PROD-006'],
      saves: [badItem, badType],
      target: { expect: targetResolution, request: targetRequest },
      types: { expect: typePage, query: typeQuery },
    };

    const result = await runContextualAuthoringStrideVector(vector, brokenAdapter);

    expect(result.completeProfile).toBe(false);
    expect(result.passed).toBe(false);
    expect(result.mismatches).toContain(
      'saves[0] (save-item).result reusable type differs from the vector expectation',
    );
    expect(result.mismatches).toContain(
      'saves[1] (save-new-type-version).result Entry values differs from the vector expectation',
    );
    expect(result.mismatches).toContain(
      'saves[1] (save-new-type-version).result Entry dirty state differs from the vector expectation',
    );
  });

  it('does not turn a partial runner or a copied Entry into a profile claim', async () => {
    const testbed = createTestbedHost({ authoring: authoringFixtures });
    const adapter = conformanceAdapter(
      requiredAuthoring(testbed.host.authoring),
      testbed.controls.sessionGeneration,
    );
    const copied = structuredClone(fromType);
    copied.state.entry.values = structuredClone(existingValues);
    const vector: ContextualAuthoringStrideVector = {
      contractVersion: STUDIO_CONTRACT_VERSION,
      description: 'Negative copied-value drill.',
      id: 'studio.conformance/contextual-authoring-copied-value-negative',
      kind: 'contextual-authoring-stride-vector',
      launches: [
        {
          expect: copied,
          forbiddenEntryValues: [existingValues],
          name: 'from-type',
          request: fromTypeStart,
        },
      ],
      requirements: ['STUDIO-PROD-002', 'STUDIO-PROD-004'],
      saves: [],
      target: { expect: targetResolution, request: targetRequest },
      types: { expect: typePage, query: typeQuery },
    };
    const copiedAdapter: ContextualAuthoringConformanceAdapter = {
      ...adapter,
      start: () => Promise.resolve(structuredClone(copied)),
    };

    const result = await runContextualAuthoringStrideVector(vector, copiedAdapter);

    expect(result.passed).toBe(false);
    expect(result.completeProfile).toBe(false);
    expect(result.mismatches).toContain(
      'launches[0] (from-type) copied forbidden Entry values set 0',
    );
  });
});

function resourceContext(key: string, resourceId: string): StudioResourceContext {
  return {
    key,
    resource: { id: resourceId, type: 'studio.test/article' },
    scopes: [],
    surface: target.surface,
  };
}

function reusableType(
  version: string,
  revision: string,
  modelRevision: string,
  blueprintRevision: string,
): ReusableContentTypeDefinition {
  return {
    authoringPolicy: {
      itemComposition: 'overrides',
      modes: ['model', 'blueprint', 'content'],
    },
    blueprint: {
      id: 'studio.test/article-blueprint',
      revision: blueprintRevision,
      version,
    },
    contractVersion: STUDIO_CONTRACT_VERSION,
    id: 'content-types/article',
    kind: 'reusable-content-type',
    label: { defaultMessage: `Article ${version}`, key: 'studio.test/article-type' },
    model: { id: 'studio.test/article-model', revision: modelRevision, version },
    revision,
    status: 'published',
    version,
  };
}

function sessionFixture(options: {
  context: StudioResourceContext;
  entryId: string;
  entryRevision: string;
  sessionId: string;
  source: AuthoringStartRequest['source'];
  type: ReusableContentTypeDefinition;
  values: EntryDocument['values'];
}): AuthoringSessionSnapshot {
  const model = modelDocument(options.type.model);
  const blueprint = blueprintDocument(options.type.blueprint, options.type.model);
  const entry = entryDocument(
    options.entryId,
    options.entryRevision,
    options.type.model,
    options.values,
  );
  return snapshot({
    blueprint,
    context: options.context,
    entry,
    model,
    sessionId: options.sessionId,
    source: options.source,
    type: options.type,
  });
}

function blankSessionFixture(): AuthoringSessionSnapshot {
  const modelLock = { id: 'studio.test/blank-model', revision: 'blank-model-r0', version: '0.1.0' };
  const blueprintLock = {
    id: 'studio.test/blank-blueprint',
    revision: 'blank-blueprint-r0',
    version: '0.1.0',
  };
  return snapshot({
    blueprint: blueprintDocument(blueprintLock, modelLock),
    context: blankContext,
    entry: entryDocument('articles/new-blank', 'blank-entry-r0', modelLock, {}),
    model: modelDocument(modelLock),
    sessionId: 'sessions/blank',
    source: { kind: 'blank' },
  });
}

function snapshot(options: {
  blueprint: BlueprintDocument;
  context: StudioResourceContext;
  entry: EntryDocument;
  model: ContentModelDocument;
  sessionId: string;
  source: AuthoringStartRequest['source'];
  type?: ReusableContentTypeDefinition;
}): AuthoringSessionSnapshot {
  return {
    capabilities: {
      modes: ['model', 'blueprint', 'content'],
      presentationStates: ['inline', 'fullscreen'],
      saveOutcomes: ['save-item', 'save-new-type-version', 'save-as-new-type'],
    },
    contractVersion: STUDIO_CONTRACT_VERSION,
    contributionGeneration: 'contributions-r1',
    kind: 'authoring-session',
    presentation: { current: 'inline', returnContext: { key: 'returns/article-list' } },
    resourceContext: structuredClone(options.context),
    sessionGeneration: 'session-r1',
    sessionId: options.sessionId,
    start: structuredClone(options.source),
    state: {
      blueprint: structuredClone(options.blueprint),
      coordinates: {
        blueprint: referenceOf(options.blueprint),
        entry: { id: options.entry.id, revision: options.entry.revision },
        model: referenceOf(options.model),
        ...(options.type === undefined ? {} : { type: referenceOf(options.type) }),
      },
      diagnostics: [],
      dirty: [],
      entry: structuredClone(options.entry),
      model: structuredClone(options.model),
    },
    target,
    ...(options.type === undefined ? {} : { type: structuredClone(options.type) }),
  };
}

function modelDocument(lock: {
  id: string;
  revision: string;
  version: string;
}): ContentModelDocument {
  return {
    contractVersion: STUDIO_CONTRACT_VERSION,
    fields: [],
    id: lock.id,
    kind: 'content-model',
    label: { defaultMessage: 'Article model', key: 'studio.test/article-model' },
    owner: { id: 'studio.test/host', version: '1.0.0' },
    relationships: [],
    revision: lock.revision,
    status: 'draft',
    version: lock.version,
  };
}

function blueprintDocument(
  lock: { id: string; revision: string; version: string },
  modelLock: { id: string; revision: string; version: string },
): BlueprintDocument {
  return {
    contractVersion: STUDIO_CONTRACT_VERSION,
    dependencyLock: {
      blocks: [],
      theme: { id: 'studio.test/theme', revision: 'theme-r1', version: '1.0.0' },
    },
    id: lock.id,
    kind: 'blueprint',
    label: { defaultMessage: 'Article page', key: 'studio.test/article-blueprint' },
    model: structuredClone(modelLock),
    owner: { id: 'studio.test/host', version: '1.0.0' },
    revision: lock.revision,
    roots: [],
    status: 'draft',
    version: lock.version,
  };
}

function entryDocument(
  id: string,
  revision: string,
  modelLock: { id: string; revision: string; version: string },
  values: EntryDocument['values'],
): EntryDocument {
  return {
    contractVersion: STUDIO_CONTRACT_VERSION,
    id,
    kind: 'entry',
    model: structuredClone(modelLock),
    revision,
    status: 'draft',
    values: structuredClone(values),
  };
}

function authoredSnapshot(
  initial: AuthoringSessionSnapshot,
  commands: readonly StudioCommand[],
): AuthoringSessionSnapshot {
  const next = structuredClone(initial);
  for (const command of commands) {
    if (command.type === 'studio.command/add-model-field') {
      next.state.model = applyModelCommand(next.state.model, command);
    } else if (command.type === 'studio.command/set-field-value') {
      next.state.entry = applyEntryCommand(next.state.entry, command);
    } else {
      next.state.blueprint = applyCommand(next.state.blueprint, command);
    }
  }
  next.state.dirty = ['model', 'blueprint', 'entry'];
  return next;
}

function createSaveAssertions(): ContextualAuthoringStrideVector['saves'] {
  const itemBlueprint = structuredClone(existing.state.blueprint);
  itemBlueprint.id = 'articles/existing/blueprint-override';
  itemBlueprint.revision = 'item-blueprint-r1';
  const itemEntry = structuredClone(existing.state.entry);
  itemEntry.values.title = 'Edited item';
  const itemIntent: AuthoringSaveIntent = {
    contractVersion: STUDIO_CONTRACT_VERSION,
    draft: { entry: itemEntry, itemBlueprint, outcome: 'save-item' },
    expected: structuredClone(existing.state.coordinates),
    kind: 'authoring-save-intent',
    sessionId: existing.sessionId,
  };
  const itemAccepted = structuredClone(existing);
  itemAccepted.state.blueprint = structuredClone(itemBlueprint);
  itemAccepted.state.coordinates.blueprint = referenceOf(itemBlueprint);
  itemAccepted.state.entry = structuredClone(itemEntry);

  const versionBefore = structuredClone(existing);
  versionBefore.state.dirty = ['entry'];
  versionBefore.state.entry.values.title = 'Unsaved item value';
  const versionIntent: AuthoringSaveIntent = {
    contractVersion: STUDIO_CONTRACT_VERSION,
    draft: {
      blueprint: structuredClone(versionBefore.state.blueprint),
      model: structuredClone(versionBefore.state.model),
      outcome: 'save-new-type-version',
    },
    expected: structuredClone(versionBefore.state.coordinates),
    kind: 'authoring-save-intent',
    sessionId: versionBefore.sessionId,
  };

  const newTypeBefore = structuredClone(blank);
  newTypeBefore.state.dirty = ['entry'];
  newTypeBefore.state.entry.values.summary = 'Unsaved blank-item value';
  const newTypeIntent: AuthoringSaveIntent = {
    contractVersion: STUDIO_CONTRACT_VERSION,
    draft: {
      authoringPolicy: { itemComposition: 'overrides', modes: ['model', 'blueprint', 'content'] },
      blueprint: structuredClone(newTypeBefore.state.blueprint),
      label: { defaultMessage: 'New article type', key: 'studio.test/new-article-type' },
      model: structuredClone(newTypeBefore.state.model),
      outcome: 'save-as-new-type',
    },
    expected: structuredClone(newTypeBefore.state.coordinates),
    kind: 'authoring-save-intent',
    sessionId: newTypeBefore.sessionId,
  };
  return [
    saveAssertion(itemIntent, ['entry', 'blueprint'], false, itemAccepted, existing),
    saveAssertion(
      versionIntent,
      ['model', 'blueprint', 'reusable-content-type'],
      true,
      versionBefore,
    ),
    saveAssertion(
      newTypeIntent,
      ['model', 'blueprint', 'reusable-content-type'],
      true,
      newTypeBefore,
    ),
  ];
}

function saveAssertion(
  intent: AuthoringSaveIntent,
  affectedArtifacts: AuthoringSavePlan['affectedArtifacts'],
  confirmationRequired: boolean,
  acceptedSession: AuthoringSessionSnapshot,
  before: AuthoringSessionSnapshot = acceptedSession,
): ContextualAuthoringStrideVector['saves'][number] {
  const suffix = intent.draft.outcome;
  const plan: AuthoringSavePlan = {
    affectedArtifacts,
    confirmationRequired,
    consequences: [],
    contractVersion: STUDIO_CONTRACT_VERSION,
    expected: structuredClone(intent.expected),
    id: `plans/${suffix}`,
    kind: 'authoring-save-plan',
    outcome: intent.draft.outcome,
    revision: `${suffix}-plan-r1`,
    sessionId: intent.sessionId,
  };
  const common = {
    acceptedConsequences: [],
    contractVersion: STUDIO_CONTRACT_VERSION,
    plan: { id: plan.id, revision: plan.revision },
  };
  let request: ContextualAuthoringSaveRequest;
  switch (intent.draft.outcome) {
    case 'save-item':
      request = { ...common, draft: intent.draft, kind: 'authoring-save-item-request' };
      break;
    case 'save-new-type-version':
      request = {
        ...common,
        draft: intent.draft,
        kind: 'authoring-save-new-type-version-request',
      };
      break;
    case 'save-as-new-type':
      request = { ...common, draft: intent.draft, kind: 'authoring-save-as-new-type-request' };
      break;
  }
  const result: AuthoringSaveResult = {
    contractVersion: STUDIO_CONTRACT_VERSION,
    kind: 'authoring-save-result',
    outcome: intent.draft.outcome,
    plan: structuredClone(request.plan),
    session: structuredClone(acceptedSession),
  };
  return {
    before: structuredClone(before),
    expectPlan: plan,
    expectResult: result,
    intent,
    request,
  };
}

function conformanceAdapter(
  authoring: AuthoringPort,
  sessionGeneration: string,
): ContextualAuthoringConformanceAdapter {
  let requestSerial = 0;
  const context = (
    operation: string,
    resourceContextKey: string,
    mutation = false,
  ): HostRequestContext => {
    requestSerial += 1;
    return authoringContext(
      operation,
      sessionGeneration,
      resourceContextKey,
      requestSerial,
      mutation,
    );
  };
  return {
    async listTypes(query) {
      return (
        await authoring.listTypes(
          structuredClone(query),
          context('list-types', query.resourceContext.key),
        )
      ).value;
    },
    open(snapshot) {
      const current = structuredClone(snapshot);
      return {
        dispatch(command) {
          if (command.type === 'studio.command/add-model-field') {
            current.state.model = applyModelCommand(current.state.model, command);
          } else if (command.type === 'studio.command/set-field-value') {
            current.state.entry = applyEntryCommand(current.state.entry, command);
          } else {
            current.state.blueprint = applyCommand(current.state.blueprint, command);
          }
          const kind =
            command.type === 'studio.command/add-model-field'
              ? 'model'
              : command.type === 'studio.command/set-field-value'
                ? 'entry'
                : 'blueprint';
          if (!current.state.dirty.includes(kind)) current.state.dirty.push(kind);
          current.state.dirty.sort(
            (left, right) =>
              ['model', 'blueprint', 'entry'].indexOf(left) -
              ['model', 'blueprint', 'entry'].indexOf(right),
          );
        },
        observe: () => structuredClone(current),
      };
    },
    async planSave(intent) {
      return (
        await authoring.planSave(
          structuredClone(intent),
          context('plan-save', resourceKeyForIntent(intent), false),
        )
      ).value;
    },
    async resolveTarget(request) {
      return (
        await authoring.resolveTarget(
          structuredClone(request),
          context('resolve-target', request.resourceContext.key),
        )
      ).value;
    },
    async saveAsNewType(request) {
      return (
        await authoring.saveAsNewType(
          structuredClone(request),
          context('save-as-new-type', resourceKeyForPlan(request.plan.id), true),
        )
      ).value;
    },
    async saveItem(request) {
      return (
        await authoring.saveItem(
          structuredClone(request),
          context('save-item', resourceKeyForPlan(request.plan.id), true),
        )
      ).value;
    },
    async saveNewTypeVersion(request) {
      return (
        await authoring.saveNewTypeVersion(
          structuredClone(request),
          context('save-new-type-version', resourceKeyForPlan(request.plan.id), true),
        )
      ).value;
    },
    async start(request) {
      return (
        await authoring.start(
          structuredClone(request),
          context('start', request.resourceContext.key, true),
        )
      ).value;
    },
  };
}

function authoringContext(
  operation: string,
  sessionGeneration: string,
  resourceContextKey: string,
  serial = 1,
  mutation = false,
): HostRequestContext {
  return createHostRequestContextFixture({
    ...(mutation ? { idempotencyKey: `idempotency/${operation}-${serial}` } : {}),
    operationId: `studio.operation/authoring.${operation}`,
    requestId: `requests/${operation}-${serial}`,
    resourceContextKey,
    sessionGeneration,
  });
}

function resourceKeyForIntent(intent: Readonly<AuthoringSaveIntent>): string {
  return intent.sessionId === blank.sessionId ? blankContext.key : existingContext.key;
}

function resourceKeyForPlan(planId: string): string {
  return planId.endsWith('save-as-new-type') ? blankContext.key : existingContext.key;
}

function requiredAuthoring(authoring: AuthoringPort | undefined): AuthoringPort {
  if (authoring === undefined) throw new Error('The contextual testbed port is required.');
  return authoring;
}

function referenceOf(value: { id: string; revision: string; version: string }): {
  id: string;
  revision: string;
  version: string;
} {
  return { id: value.id, revision: value.revision, version: value.version };
}
