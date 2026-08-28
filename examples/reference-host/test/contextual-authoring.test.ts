import { describe, expect, it } from 'vitest';
import {
  createCoreProductionBlockDefinitions,
  openContextualStudioSession,
  type StudioContextualHostSessionHandle,
  type StudioHostSessionIdentifierFactories,
} from '@kumwe/studio-core';
import {
  STUDIO_CONTRACT_VERSION,
  STUDIO_WIRE_PROTOCOL_VERSION,
  type AuthoringSaveIntent,
  type AuthoringSaveItemRequest,
  type AuthoringStartRequest,
  type AuthoringStartSource,
  type HostPortFailure,
  type HostRequestContext,
  type QualifiedName,
  type SetFieldValueCommand,
  type StudioConfiguration,
  type StudioResourceContext,
} from '@kumwe/studio-protocol';
import {
  createReferenceAuthoringHost,
  REFERENCE_AUTHORING_TARGET_ID,
  type ReferenceAuthoringHost,
} from '../src/reference-authoring-port.js';
import { createReferenceBlueprint } from '../src/reference-content.js';
import { createBlankReferenceArtifacts } from '../src/reference-contextual-data.js';

const AUTHORING_OPERATIONS: QualifiedName[] = [
  'studio.operation/authoring.resolve-target',
  'studio.operation/authoring.list-types',
  'studio.operation/authoring.start',
  'studio.operation/authoring.plan-save',
  'studio.operation/authoring.save-item',
  'studio.operation/authoring.save-new-type-version',
  'studio.operation/authoring.save-as-new-type',
];
const TARGET_ID: QualifiedName = REFERENCE_AUTHORING_TARGET_ID;

describe('reference contextual starts', () => {
  it('opens an existing item through the public core API at its pinned type, not latest', async () => {
    const host = referenceHost();
    const opened = await openReference(host, { kind: 'existing' });
    const { session } = opened;

    expect(host.authoring.existingTypeReference).toMatchObject({
      revision: 'type-r1',
      version: '1.0.0',
    });
    expect(host.authoring.latestTypeReference).toMatchObject({
      revision: 'type-r2',
      version: '2.0.0',
    });
    expect(session.snapshot.type).toMatchObject(host.authoring.existingTypeReference);
    expect(session.coordinates.type).toEqual(host.authoring.existingTypeReference);
    expect(session.entry.values).toEqual({
      category: 'guide',
      featured: true,
      title: 'Building pages with contextual Studio',
    });
    expect(session.model).toMatchObject(session.snapshot.type?.model ?? {});
    expect(session.blueprint.model).toEqual(session.coordinates.model);
    expect(session.entry.model).toEqual(session.coordinates.model);

    const catalog = await opened.types?.list({
      limit: 10,
      resourceContext: session.snapshot.resourceContext,
      targetId: TARGET_ID,
    });
    expect(catalog?.value.items.map(({ reference }) => reference)).toEqual([
      host.authoring.latestTypeReference,
      host.authoring.existingTypeReference,
    ]);
  });

  it('hydrates the exact selected type into an empty new Entry', async () => {
    const host = referenceHost();
    const selected = host.authoring.latestTypeReference;
    const opened = await openReference(host, { kind: 'from-type', type: selected });

    expect(opened.session.snapshot.type).toMatchObject(selected);
    expect(opened.session.coordinates.type).toEqual(selected);
    expect(opened.session.coordinates.model).toEqual(opened.session.snapshot.type?.model);
    expect(opened.session.coordinates.blueprint).toEqual(opened.session.snapshot.type?.blueprint);
    expect(opened.session.model).toMatchObject({ revision: 'model-r2', version: '2.0.0' });
    expect(opened.session.blueprint).toMatchObject({
      revision: 'blueprint-r2',
      version: '2.0.0',
    });
    expect(opened.session.entry.values).toEqual({});
    expect(opened.session.entry.model).toEqual(opened.session.coordinates.model);
  });

  it('creates distinct, empty Model, Blueprint, and Entry drafts for blank starts', async () => {
    const host = referenceHost();
    const opened = await openReference(host, { kind: 'blank' });
    const representative = createReferenceBlueprint(createCoreProductionBlockDefinitions());
    const resource = opened.session.snapshot.resourceContext.resource;
    if (resource === undefined) throw new Error('The blank reference session lost its resource.');
    const blank = createBlankReferenceArtifacts(representative, resource.id);

    expect(opened.session.snapshot.type).toBeUndefined();
    expect(opened.session.coordinates.type).toBeUndefined();
    expect(opened.session.model).toEqual(blank.model);
    expect(opened.session.blueprint).toEqual(blank.blueprint);
    expect(opened.session.entry).toEqual(blank.entry);
    expect(opened.session.model.fields).toEqual([]);
    expect(opened.session.blueprint.roots).toEqual([]);
    expect(opened.session.entry.values).toEqual({});
    expect(opened.session.model.id).not.toBe(representative.model.id);
    expect(opened.session.blueprint.id).not.toBe(representative.id);
    expect(
      new Set([opened.session.model.id, opened.session.blueprint.id, opened.session.entry.id]),
    ).toHaveLength(3);
  });
});

describe('reference coordinated saves', () => {
  it('plans and accepts an item-only save without mutating its pinned type artifacts', async () => {
    const host = referenceHost();
    const opened = await openReference(host, { kind: 'existing' });
    const before = structuredClone(opened.session.snapshot);

    opened.session.executeEntry(setTitleCommand(opened, 'A saved contextual page'));
    const intent = opened.session.createSaveIntent({ outcome: 'save-item' });
    const plan = (await opened.planSave(intent)).value;

    expect(plan.affectedArtifacts).toEqual(['entry']);
    expect(plan.confirmationRequired).toBe(false);
    expect(plan.consequences).toEqual([]);
    expect(plan.successorContext).not.toEqual(before.presentation.returnContext);

    const accepted = (await opened.save(intent, plan)).value.session;
    expect(accepted.presentation.returnContext).toEqual(plan.successorContext);
    expect(accepted.state.entry.values.title).toBe('A saved contextual page');
    expect(accepted.state.entry.revision).not.toBe(before.state.entry.revision);
    expect(accepted.state.model).toEqual(before.state.model);
    expect(accepted.state.blueprint).toEqual(before.state.blueprint);
    expect(accepted.type).toEqual(before.type);
    expect(accepted.state.coordinates.model).toEqual(before.state.coordinates.model);
    expect(accepted.state.coordinates.blueprint).toEqual(before.state.coordinates.blueprint);
    expect(accepted.state.coordinates.type).toEqual(before.state.coordinates.type);
    expect(opened.session.dirty).toEqual({ blueprint: false, entry: false, model: false });
  });

  it('requires explicit consequences before accepting an immutable type successor', async () => {
    const host = referenceHost();
    const opened = await openReference(host, { kind: 'existing' });
    const before = structuredClone(opened.session.snapshot);
    const intent = opened.session.createSaveIntent({ outcome: 'save-new-type-version' });
    const plan = (await opened.planSave(intent)).value;
    const consequenceCodes = plan.consequences.map(({ code }) => code);

    expect(plan.affectedArtifacts).toEqual(['model', 'blueprint', 'reusable-content-type']);
    expect(plan.confirmationRequired).toBe(true);
    expect(consequenceCodes).toEqual([
      'studio.reference/immutable-successor',
      'studio.reference/dependent-entry-migration',
    ]);
    await expect(opened.save(intent, plan)).rejects.toMatchObject({
      code: 'invalid-authoring-request',
    });

    const accepted = (await opened.save(intent, plan, consequenceCodes)).value.session;
    expect(accepted.type?.id).toBe(before.type?.id);
    expect(accepted.type?.revision).not.toBe(before.type?.revision);
    expect(accepted.type?.version).toBe('1.0.1');
    expect(accepted.state.model.revision).not.toBe(before.state.model.revision);
    expect(accepted.state.blueprint.revision).not.toBe(before.state.blueprint.revision);
    expect(accepted.state.entry.values).toEqual(before.state.entry.values);
    expect(accepted.state.entry.model).toEqual(accepted.state.coordinates.model);
    expect(accepted.state.coordinates.type).toMatchObject({
      id: before.type?.id,
      version: '1.0.1',
    });
  });

  it('saves a new reusable type without copying the current Entry values into the definition', async () => {
    const host = referenceHost();
    const opened = await openReference(host, { kind: 'existing' });
    const before = structuredClone(opened.session.snapshot);
    const intent = opened.session.createSaveIntent({
      authoringPolicy: { itemComposition: 'overrides', modes: ['model', 'blueprint', 'content'] },
      label: { defaultMessage: 'Copied page structure', key: 'studio.reference/copied-type' },
      outcome: 'save-as-new-type',
    });
    const plan = (await opened.planSave(intent)).value;
    const consequenceCodes = plan.consequences.map(({ code }) => code);

    expect(plan.affectedArtifacts).toEqual(['model', 'blueprint', 'reusable-content-type']);
    expect(plan.affectedArtifacts).not.toContain('entry');
    expect(consequenceCodes).toEqual(['studio.reference/entry-values-excluded']);

    const accepted = (await opened.save(intent, plan, consequenceCodes)).value.session;
    expect(accepted.type?.id).toMatch(/^studio\.reference\/type-created-/u);
    expect(accepted.state.model.id).not.toBe(before.state.model.id);
    expect(accepted.state.blueprint.id).not.toBe(before.state.blueprint.id);
    expect(accepted.state.entry.values).toEqual(before.state.entry.values);
    expect(accepted.type).not.toHaveProperty('values');
  });

  it('accepts a blank canvas as a reusable draft without publishing empty artifacts', async () => {
    const host = referenceHost();
    const opened = await openReference(host, { kind: 'blank' });
    const intent = opened.session.createSaveIntent({
      authoringPolicy: { itemComposition: 'denied', modes: ['model', 'blueprint', 'content'] },
      label: { defaultMessage: 'New page draft', key: 'studio.reference/new-page-draft' },
      outcome: 'save-as-new-type',
    });
    const plan = (await opened.planSave(intent)).value;
    const accepted = (
      await opened.save(
        intent,
        plan,
        plan.consequences.map(({ code }) => code),
      )
    ).value.session;

    expect(accepted.type).toMatchObject({ status: 'draft', version: '1.0.0' });
    expect(accepted.state.model).toMatchObject({ fields: [], status: 'draft' });
    expect(accepted.state.blueprint).toMatchObject({ roots: [], status: 'draft' });
    expect(accepted.state.entry.values).toEqual({});
  });

  it('rejects wrong resource contexts and stale coordinates, while replaying one mutation key', async () => {
    const host = referenceHost();
    const resourceContext = referenceResourceContext(host, { kind: 'existing' });

    await expect(
      host.authoring.start(
        startRequest(resourceContext, { kind: 'existing' }),
        hostContext('studio.operation/authoring.start', resourceContext, {
          resourceContextKey: 'contexts/wrong-resource',
        }),
      ),
    ).rejects.toEqual(
      expect.objectContaining<Partial<HostPortFailure>>({
        error: expect.objectContaining({ category: 'forbidden' }) as HostPortFailure['error'],
      }),
    );

    const snapshot = (
      await host.authoring.start(
        startRequest(resourceContext, { kind: 'existing' }),
        hostContext('studio.operation/authoring.start', resourceContext),
      )
    ).value;
    const intent: AuthoringSaveIntent = {
      contractVersion: STUDIO_CONTRACT_VERSION,
      draft: { entry: structuredClone(snapshot.state.entry), outcome: 'save-item' },
      expected: structuredClone(snapshot.state.coordinates),
      kind: 'authoring-save-intent',
      sessionId: snapshot.sessionId,
    };
    const plan = (
      await host.authoring.planSave(
        intent,
        hostContext('studio.operation/authoring.plan-save', resourceContext),
      )
    ).value;
    const request: AuthoringSaveItemRequest = {
      acceptedConsequences: [],
      contractVersion: STUDIO_CONTRACT_VERSION,
      draft: { entry: structuredClone(snapshot.state.entry), outcome: 'save-item' },
      kind: 'authoring-save-item-request',
      plan: {
        id: plan.id,
        revision: plan.revision,
        successorContext: structuredClone(plan.successorContext),
      },
    };
    const saveContext = hostContext('studio.operation/authoring.save-item', resourceContext, {
      idempotencyKey: 'mutations/reference-item-save',
    });
    const first = await host.authoring.saveItem(request, saveContext);
    const replay = await host.authoring.saveItem(request, saveContext);

    expect(replay).toEqual(first);
    await expect(
      host.authoring.planSave(
        intent,
        hostContext('studio.operation/authoring.plan-save', resourceContext),
      ),
    ).rejects.toEqual(
      expect.objectContaining<Partial<HostPortFailure>>({
        error: expect.objectContaining({ category: 'conflict' }) as HostPortFailure['error'],
      }),
    );
  });
});

function referenceHost(): ReferenceAuthoringHost {
  const definitions = createCoreProductionBlockDefinitions();
  return createReferenceAuthoringHost(createReferenceBlueprint(definitions));
}

async function openReference(
  host: ReferenceAuthoringHost,
  source: AuthoringStartSource,
): Promise<StudioContextualHostSessionHandle> {
  const resourceContext = referenceResourceContext(host, source);
  return openContextualStudioSession(host.adapter, {
    configuration: configuration(resourceContext),
    identifiers: identifierFactories(),
    start: startRequest(resourceContext, source),
    target: {
      intent: source.kind === 'existing' ? 'edit' : 'create',
      requestedPresentation: 'inline',
      resourceContext,
      targetId: TARGET_ID,
    },
  });
}

function startRequest(
  resourceContext: StudioResourceContext,
  source: AuthoringStartSource,
): AuthoringStartRequest {
  return {
    presentation: 'inline' as const,
    resourceContext,
    source,
    targetId: TARGET_ID,
  };
}

function referenceResourceContext(
  host: ReferenceAuthoringHost,
  source: AuthoringStartSource,
): StudioResourceContext {
  const existing = host.authoring.existingEntry;
  return {
    key: `contexts/reference-${source.kind}`,
    resource: {
      id: source.kind === 'existing' ? existing.id : `content/new-${source.kind}`,
      type: 'studio.reference/content',
    },
    revision: source.kind === 'existing' ? existing.revision : 'entry-new-r0',
    scopes: [{ id: 'sites/reference', kind: 'studio.scope/site' }],
    surface: 'studio.reference/content-editor',
  };
}

function configuration(resourceContext: StudioResourceContext): StudioConfiguration {
  return {
    actor: { displayName: 'Reference Author', id: 'users/reference-author' },
    artifacts: {},
    blocks: [],
    composite: 'single',
    contractVersion: STUDIO_CONTRACT_VERSION,
    displayPreferences: {
      calendar: 'gregory',
      hourCycle: 'h23',
      measurementSystem: 'metric',
      numberingSystem: 'latn',
    },
    features: {
      clipboardMediaUpload: false,
      collaboration: false,
      customInspectors: false,
      executablePlugins: false,
      externalMediaImport: false,
      offlineRecovery: true,
    },
    hostCapabilities: {
      capabilities: [],
      contractVersion: STUDIO_CONTRACT_VERSION,
      host: { generation: 'host-r1', id: 'studio.reference/host', version: '1.0.0' },
      kind: 'host-capabilities',
      ports: [{ id: 'studio.port/authoring', operations: AUTHORING_OPERATIONS, version: '1.0.0' }],
      protocolVersions: [STUDIO_WIRE_PROTOCOL_VERSION],
    },
    limits: {
      maxChildrenPerSlot: 1_000,
      maxCommandBatch: 100,
      maxContributionsPerPlugin: 500,
      maxDepth: 32,
      maxExtensionBytes: 1_048_576,
      maxHistoryEntries: 100,
      maxLocaleBytes: 1_048_576,
      maxMediaBatch: 50,
      maxMediaUploadBytes: 1_073_741_824,
      maxNodes: 5_000,
      maxPluginCount: 20,
      maxPreviewBytes: 10_485_760,
      maxPreviewRequestsPerMinute: 120,
      maxPropertyBytes: 1_048_576,
      maxRichTextBytes: 1_048_576,
      maxRichTextDepth: 32,
      maxSlotsPerNode: 20,
    },
    locale: {
      direction: 'ltr',
      fallbacks: [],
      requested: 'en',
      resolved: 'en',
      timeZone: 'Africa/Windhoek',
    },
    mode: 'blueprint',
    permissions: [
      'studio.permission/edit-model',
      'studio.permission/edit-blueprint',
      'studio.permission/edit-content',
      'studio.permission/save',
    ],
    plugins: [],
    preview: { allowApproximateRenderer: true, enabled: true, sameOriginRequired: true },
    protocolVersion: STUDIO_WIRE_PROTOCOL_VERSION,
    resourceContext: structuredClone(resourceContext),
    sessionGeneration: 'session-r1',
    sessionId: 'reference-session',
    sessionState: 'editable',
  };
}

function identifierFactories(): StudioHostSessionIdentifierFactories {
  let serial = 0;
  return {
    idempotencyKey(): string {
      serial += 1;
      return `mutations/reference-${serial}`;
    },
    requestId(): string {
      serial += 1;
      return `requests/reference-${serial}`;
    },
  };
}

function setTitleCommand(
  opened: StudioContextualHostSessionHandle,
  value: string,
): SetFieldValueCommand {
  return {
    artifactId: opened.session.entry.id,
    baseStateVersion: opened.session.stateVersions.entry,
    contractVersion: STUDIO_CONTRACT_VERSION,
    expectedRevision: opened.session.coordinates.entry.revision,
    id: 'commands/reference-set-title',
    kind: 'command',
    payload: { fieldPath: ['title'], locale: 'en', value },
    sessionGeneration: 'session-r1',
    type: 'studio.command/set-field-value',
  };
}

function hostContext(
  operationId: QualifiedName,
  resourceContext: StudioResourceContext,
  overrides: Partial<HostRequestContext> = {},
): HostRequestContext {
  return {
    operationId,
    protocolVersion: STUDIO_WIRE_PROTOCOL_VERSION,
    requestId: `requests/${operationId}`,
    resourceContextKey: resourceContext.key,
    sessionGeneration: 'session-r1',
    ...overrides,
  };
}
