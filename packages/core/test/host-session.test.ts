import { describe, expect, it } from 'vitest';
import {
  HostPortFailure,
  STUDIO_STALE_SESSION_GENERATION_DIAGNOSTIC_CODE,
  type ArtifactPort,
  type BlueprintDocument,
  type HostPortResult,
  type InsertNodeCommand,
  type JsonObject,
  type QualifiedName,
  type StudioConfiguration,
} from '@kumwe/studio-protocol';
import {
  createBlueprintFixture,
  createHostRequestContextFixture,
  createStudioConfigurationFixture,
  createTestbedHost,
} from '@kumwe/studio-testkit';
import {
  openStudioSession,
  StudioHostSessionError,
  type StudioHostSessionHandle,
  type StudioHostSessionIdentifierFactories,
} from '../src/index.js';

const ARTIFACT_LOAD: QualifiedName = 'studio.operation/artifact.load';
const ARTIFACT_SAVE: QualifiedName = 'studio.operation/artifact.save';

interface IdentifierProbe {
  factories: StudioHostSessionIdentifierFactories;
  idempotencyOperations: QualifiedName[];
  requestOperations: QualifiedName[];
}

function identifierProbe(): IdentifierProbe {
  const idempotencyOperations: QualifiedName[] = [];
  const requestOperations: QualifiedName[] = [];
  let idempotencySerial = 0;
  let requestSerial = 0;
  return {
    factories: {
      idempotencyKey(operationId: QualifiedName): string {
        idempotencyOperations.push(operationId);
        idempotencySerial += 1;
        return `idempotency/host-session-${String(idempotencySerial)}`;
      },
      requestId(operationId: QualifiedName): string {
        requestOperations.push(operationId);
        requestSerial += 1;
        return `requests/host-session-${String(requestSerial)}`;
      },
    },
    idempotencyOperations,
    requestOperations,
  };
}

function configurationFor(
  blueprint: BlueprintDocument,
  options: {
    artifactOperations?: QualifiedName[];
    composite?: 'hybrid' | 'single';
    mode?: 'blueprint' | 'content' | 'model';
    recovery?: boolean;
    sessionGeneration?: string;
    sessionState?: 'editable' | 'read-only';
  } = {},
): StudioConfiguration {
  const configuration = createStudioConfigurationFixture({
    ...(options.composite === undefined ? {} : { composite: options.composite }),
    ...(options.mode === undefined ? {} : { mode: options.mode }),
    ...(options.sessionState === undefined ? {} : { sessionState: options.sessionState }),
  });
  configuration.artifacts.blueprint = {
    id: blueprint.id,
    revision: blueprint.revision,
    version: blueprint.version,
  };
  configuration.features.offlineRecovery = options.recovery ?? false;
  configuration.sessionGeneration = options.sessionGeneration ?? 'session-r1';
  configuration.hostCapabilities.ports = [
    {
      id: 'studio.port/artifact',
      operations: options.artifactOperations ?? [ARTIFACT_LOAD, ARTIFACT_SAVE],
      version: '1.0.0',
    },
    ...(options.recovery === true
      ? [
          {
            id: 'studio.port/recovery' as const,
            operations: [
              'studio.operation/recovery.store',
              'studio.operation/recovery.load',
              'studio.operation/recovery.discard',
            ] as QualifiedName[],
            version: '1.0.0',
          },
        ]
      : []),
  ];
  return configuration;
}

function insertCommand(
  session: StudioHostSessionHandle['session'],
  sessionGeneration: string,
  nodeId: string,
): InsertNodeCommand {
  return {
    artifactId: session.document.id,
    baseStateVersion: session.stateVersion,
    contractVersion: '0.1-draft',
    expectedRevision: session.savedRevision,
    id: `commands/${nodeId}`,
    kind: 'command',
    payload: {
      destination: { position: session.document.roots.length },
      node: {
        authoring: { mode: 'designer' },
        bindings: {},
        id: nodeId,
        properties: {},
        slots: {},
        type: 'studio.test/section',
        version: '1.0.0',
      },
    },
    sessionGeneration,
    type: 'studio.command/insert-node',
  };
}

describe('openStudioSession', () => {
  it('opens, edits, saves, and exposes raw recovery lifecycle operations', async () => {
    const blueprint = createBlueprintFixture({
      id: 'lifecycle.blueprint',
      revision: 'lifecycle.blueprint-r1',
    });
    const testbed = createTestbedHost({
      documents: [blueprint],
      permissions: ['studio.permission/save'],
    });
    const configuration = configurationFor(blueprint, {
      recovery: true,
      sessionGeneration: testbed.controls.sessionGeneration,
    });
    const identifiers = identifierProbe();

    const handle = await openStudioSession(testbed.host, {
      configuration,
      identifiers: identifiers.factories,
    });

    expect(handle.revision).toBe(blueprint.revision);
    expect(handle.session.mode).toBe('blueprint');
    expect(handle.session.dirty).toBe(false);
    expect(handle.negotiation.sessionState).toBe('editable');
    expect(handle.diagnostics).toEqual([]);
    expect(handle.recovery).toBeDefined();

    handle.session.execute(
      insertCommand(handle.session, configuration.sessionGeneration, 'node-first'),
    );
    const saved = await handle.save();
    expect(saved).toEqual({ revision: 'lifecycle.blueprint-r2', value: null });
    expect(handle.revision).toBe('lifecycle.blueprint-r2');
    expect(handle.session.savedRevision).toBe('lifecycle.blueprint-r2');
    expect(handle.session.dirty).toBe(false);
    expect(testbed.controls.revisionOf(blueprint.id)).toBe('lifecycle.blueprint-r2');

    const envelope: JsonObject = {
      baseRevision: handle.revision,
      draft: handle.session.document as unknown as JsonObject,
    };
    await handle.recovery?.store(envelope);
    expect((await handle.recovery?.load())?.value).toEqual(envelope);
    await handle.recovery?.discard();
    expect((await handle.recovery?.load())?.value).toBeNull();

    expect(identifiers.requestOperations).toEqual([
      'studio.operation/artifact.load',
      'studio.operation/artifact.save',
      'studio.operation/recovery.store',
      'studio.operation/recovery.load',
      'studio.operation/recovery.discard',
      'studio.operation/recovery.load',
    ]);
    expect(identifiers.idempotencyOperations).toEqual([
      'studio.operation/artifact.save',
      'studio.operation/recovery.store',
      'studio.operation/recovery.discard',
    ]);

    const unchanged = await handle.save();
    expect(unchanged).toEqual({ revision: 'lifecycle.blueprint-r2', value: null });
    expect(testbed.controls.revisionOf(blueprint.id)).toBe('lifecycle.blueprint-r2');
  });

  it('refuses missing capability, operation, artifact, and unsupported profiles before loading', async () => {
    const blueprint = createBlueprintFixture({ id: 'blocked.blueprint' });
    const testbed = createTestbedHost({ documents: [blueprint] });
    const cases: { configuration: StudioConfiguration; diagnostic: QualifiedName }[] = [];

    const missingPort = configurationFor(blueprint);
    missingPort.hostCapabilities.ports = [];
    cases.push({ configuration: missingPort, diagnostic: 'studio.host/missing-required-port' });

    const missingSave = configurationFor(blueprint, { artifactOperations: [ARTIFACT_LOAD] });
    cases.push({
      configuration: missingSave,
      diagnostic: 'studio.host/missing-required-operation',
    });

    const missingArtifact = configurationFor(blueprint);
    missingArtifact.artifacts = {};
    cases.push({
      configuration: missingArtifact,
      diagnostic: 'studio.host/missing-blueprint-artifact',
    });

    const unsupportedProfile = configurationFor(blueprint, { mode: 'content' });
    cases.push({
      configuration: unsupportedProfile,
      diagnostic: 'studio.host/unsupported-session-profile',
    });

    const noProtocol = configurationFor(blueprint);
    noProtocol.hostCapabilities.protocolVersions = [];
    cases.push({
      configuration: noProtocol,
      diagnostic: 'studio.host/no-common-protocol-version',
    });

    for (const testCase of cases) {
      const identifiers = identifierProbe();
      let caught: unknown;
      try {
        await openStudioSession(testbed.host, {
          configuration: testCase.configuration,
          identifiers: identifiers.factories,
        });
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(StudioHostSessionError);
      expect(caught).toMatchObject({ code: 'configuration-blocked' });
      expect((caught as StudioHostSessionError).diagnostics).toContainEqual(
        expect.objectContaining({ code: testCase.diagnostic, severity: 'blocking' }),
      );
      expect(identifiers.requestOperations).toEqual([]);
    }
  });

  it('opens read-only with load alone and refuses save locally', async () => {
    const blueprint = createBlueprintFixture({ id: 'read-only.blueprint' });
    const testbed = createTestbedHost({ documents: [blueprint] });
    const configuration = configurationFor(blueprint, {
      artifactOperations: [ARTIFACT_LOAD],
      sessionState: 'read-only',
    });
    const identifiers = identifierProbe();
    const handle = await openStudioSession(testbed.host, {
      configuration,
      identifiers: identifiers.factories,
    });

    expect(handle.session.mode).toBe('read-only');
    expect(handle.negotiation.sessionState).toBe('read-only');
    await expect(handle.save()).rejects.toMatchObject({ code: 'read-only-session' });
    expect(identifiers.requestOperations).toEqual([ARTIFACT_LOAD]);
    expect(identifiers.idempotencyOperations).toEqual([]);
  });

  it('degrades missing optional recovery without inventing an adapter surface', async () => {
    const blueprint = createBlueprintFixture({ id: 'degraded.blueprint' });
    const testbed = createTestbedHost({ documents: [blueprint] });
    const configuration = configurationFor(blueprint);
    configuration.features.offlineRecovery = true;
    const handle = await openStudioSession(testbed.host, {
      configuration,
      identifiers: identifierProbe().factories,
    });

    expect(handle.recovery).toBeUndefined();
    expect(handle.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'studio.host/missing-optional-port',
        parameters: { port: 'studio.port/recovery' },
        severity: 'information',
      }),
    );
  });

  it('snapshots the resolved configuration before later caller mutation', async () => {
    const blueprint = createBlueprintFixture({
      id: 'immutable-configuration.blueprint',
      revision: 'immutable-configuration.blueprint-r1',
    });
    const testbed = createTestbedHost({
      documents: [blueprint],
      permissions: ['studio.permission/save'],
    });
    const generation = testbed.controls.sessionGeneration;
    const configuration = configurationFor(blueprint, { sessionGeneration: generation });
    const handle = await openStudioSession(testbed.host, {
      configuration,
      identifiers: identifierProbe().factories,
    });

    configuration.sessionGeneration = 'session-caller-mutated';
    configuration.resourceContext.key = 'contexts/caller-mutated';
    configuration.locale.resolved = 'fr';
    handle.session.execute(insertCommand(handle.session, generation, 'node'));

    await expect(handle.save()).resolves.toEqual({
      revision: 'immutable-configuration.blueprint-r2',
      value: null,
    });
  });

  it('refuses a non-Blueprint or differently identified artifact without fabrication', async () => {
    const blueprint = createBlueprintFixture({ id: 'expected.blueprint' });
    const testbed = createTestbedHost({ documents: [blueprint] });
    const configuration = configurationFor(blueprint);
    const artifact: ArtifactPort = {
      ...testbed.host.artifact,
      load: (): Promise<HostPortResult<BlueprintDocument>> =>
        Promise.resolve({
          value: createBlueprintFixture({ id: 'different.blueprint' }),
        }),
    };

    await expect(
      openStudioSession(
        { ...testbed.host, artifact },
        {
          configuration,
          identifiers: identifierProbe().factories,
        },
      ),
    ).rejects.toMatchObject({ code: 'unexpected-artifact' });
  });
});

describe('bound host-session persistence', () => {
  it('surfaces a conflict with safe revision and leaves all local state intact', async () => {
    const blueprint = createBlueprintFixture({ id: 'conflict.blueprint' });
    const testbed = createTestbedHost({
      documents: [blueprint],
      permissions: ['studio.permission/save'],
    });
    const configuration = configurationFor(blueprint, {
      sessionGeneration: testbed.controls.sessionGeneration,
    });
    const identifiers = identifierProbe();
    const handle = await openStudioSession(testbed.host, {
      configuration,
      identifiers: identifiers.factories,
    });

    handle.session.execute(
      insertCommand(handle.session, configuration.sessionGeneration, 'node-local'),
    );
    handle.session.select(['node-local']);
    const before = {
      canRedo: handle.session.canRedo,
      canUndo: handle.session.canUndo,
      dirty: handle.session.dirty,
      document: handle.session.document,
      revision: handle.revision,
      savedRevision: handle.session.savedRevision,
      selection: handle.session.selection,
      stateVersion: handle.session.stateVersion,
    };

    const rivalLoaded = await testbed.host.artifact.load(
      { id: blueprint.id, version: blueprint.version },
      createHostRequestContextFixture({
        operationId: ARTIFACT_LOAD,
        requestId: 'requests/rival-load',
        sessionGeneration: testbed.controls.sessionGeneration,
      }),
    );
    await testbed.host.artifact.save(
      rivalLoaded.value,
      createHostRequestContextFixture({
        expectedRevision: rivalLoaded.revision ?? blueprint.revision,
        idempotencyKey: 'idempotency/rival-save',
        operationId: ARTIFACT_SAVE,
        requestId: 'requests/rival-save',
        sessionGeneration: testbed.controls.sessionGeneration,
      }),
    );

    let conflict: unknown;
    try {
      await handle.save();
    } catch (error) {
      conflict = error;
    }
    expect(conflict).toBeInstanceOf(HostPortFailure);
    expect(conflict).toMatchObject({
      error: {
        category: 'conflict',
        revision: testbed.controls.revisionOf(blueprint.id),
      },
    });
    expect({
      canRedo: handle.session.canRedo,
      canUndo: handle.session.canUndo,
      dirty: handle.session.dirty,
      document: handle.session.document,
      revision: handle.revision,
      savedRevision: handle.session.savedRevision,
      selection: handle.session.selection,
      stateVersion: handle.session.stateVersion,
    }).toEqual(before);

    await expect(handle.save()).rejects.toMatchObject({ error: { category: 'conflict' } });
    expect(identifiers.idempotencyOperations).toEqual([ARTIFACT_SAVE]);
    expect(identifiers.requestOperations).toEqual([ARTIFACT_LOAD, ARTIFACT_SAVE, ARTIFACT_SAVE]);
  });

  it('reuses a failed exact-intent key and maps disconnect/single-shot failures canonically', async () => {
    const blueprint = createBlueprintFixture({
      id: 'retry.blueprint',
      revision: 'retry.blueprint-r1',
    });
    const testbed = createTestbedHost({
      documents: [blueprint],
      permissions: ['studio.permission/save'],
    });
    const identifiers = identifierProbe();
    const configuration = configurationFor(blueprint, {
      sessionGeneration: testbed.controls.sessionGeneration,
    });
    const handle = await openStudioSession(testbed.host, {
      configuration,
      identifiers: identifiers.factories,
    });
    handle.session.execute(insertCommand(handle.session, configuration.sessionGeneration, 'node'));

    testbed.controls.failNext('artifact', 'save', 'rate-limited');
    await expect(handle.save()).rejects.toMatchObject({
      error: { category: 'rate-limited', retryable: true },
    });
    expect(testbed.controls.revisionOf(blueprint.id)).toBe(blueprint.revision);
    expect(identifiers.idempotencyOperations).toEqual([ARTIFACT_SAVE]);

    testbed.controls.disconnect();
    await expect(handle.save()).rejects.toMatchObject({
      error: { category: 'unavailable', retryable: true },
    });
    expect(identifiers.idempotencyOperations).toEqual([ARTIFACT_SAVE]);
    expect(handle.invalidated).toBe(false);

    testbed.controls.reconnect();
    await expect(handle.save()).resolves.toEqual({ revision: 'retry.blueprint-r2', value: null });
    expect(testbed.controls.revisionOf(blueprint.id)).toBe('retry.blueprint-r2');
    expect(identifiers.idempotencyOperations).toEqual([ARTIFACT_SAVE]);
  });

  it('coalesces duplicate pending saves so the real host accepts one effect', async () => {
    const blueprint = createBlueprintFixture({
      id: 'coalesced.blueprint',
      revision: 'coalesced.blueprint-r1',
    });
    const testbed = createTestbedHost({
      documents: [blueprint],
      permissions: ['studio.permission/save'],
    });
    let enterSave: (() => void) | undefined;
    let releaseSave: (() => void) | undefined;
    const entered = new Promise<void>((resolve) => {
      enterSave = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      releaseSave = resolve;
    });
    let saveCalls = 0;
    const artifact: ArtifactPort = {
      ...testbed.host.artifact,
      async save(document, context): Promise<HostPortResult<null>> {
        saveCalls += 1;
        enterSave?.();
        await gate;
        return testbed.host.artifact.save(document, context);
      },
    };
    const configuration = configurationFor(blueprint, {
      sessionGeneration: testbed.controls.sessionGeneration,
    });
    const identifiers = identifierProbe();
    const handle = await openStudioSession(
      { ...testbed.host, artifact },
      { configuration, identifiers: identifiers.factories },
    );
    handle.session.execute(insertCommand(handle.session, configuration.sessionGeneration, 'node'));

    const first = handle.save();
    await entered;
    const second = handle.save();
    expect(second).toBe(first);
    releaseSave?.();
    await expect(Promise.all([first, second])).resolves.toEqual([
      { revision: 'coalesced.blueprint-r2', value: null },
      { revision: 'coalesced.blueprint-r2', value: null },
    ]);
    expect(saveCalls).toBe(1);
    expect(testbed.controls.revisionOf(blueprint.id)).toBe('coalesced.blueprint-r2');
    expect(identifiers.idempotencyOperations).toEqual([ARTIFACT_SAVE]);
  });

  it('advances the accepted base but keeps a newer edit dirty when save settles late', async () => {
    const blueprint = createBlueprintFixture({
      id: 'late-save.blueprint',
      revision: 'late-save.blueprint-r1',
    });
    const testbed = createTestbedHost({
      documents: [blueprint],
      permissions: ['studio.permission/save'],
    });
    let enterSave: (() => void) | undefined;
    let releaseSave: (() => void) | undefined;
    const entered = new Promise<void>((resolve) => {
      enterSave = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      releaseSave = resolve;
    });
    let delayed = true;
    const artifact: ArtifactPort = {
      ...testbed.host.artifact,
      async save(document, context): Promise<HostPortResult<null>> {
        if (delayed) {
          delayed = false;
          enterSave?.();
          await gate;
        }
        return testbed.host.artifact.save(document, context);
      },
    };
    const configuration = configurationFor(blueprint, {
      sessionGeneration: testbed.controls.sessionGeneration,
    });
    const handle = await openStudioSession(
      { ...testbed.host, artifact },
      { configuration, identifiers: identifierProbe().factories },
    );
    handle.session.execute(
      insertCommand(handle.session, configuration.sessionGeneration, 'node-before-save'),
    );
    const pending = handle.save();
    await entered;
    handle.session.execute(
      insertCommand(handle.session, configuration.sessionGeneration, 'node-during-save'),
    );
    releaseSave?.();
    await pending;

    expect(handle.revision).toBe('late-save.blueprint-r2');
    expect(handle.session.savedRevision).toBe('late-save.blueprint-r2');
    expect(handle.session.document.revision).toBe('late-save.blueprint-r2');
    expect(handle.session.dirty).toBe(true);
    expect(handle.session.document.roots.map((node) => node.id)).toEqual([
      'node-before-save',
      'node-during-save',
    ]);
    const persistedAfterFirst = await testbed.host.artifact.load(
      { id: blueprint.id, version: blueprint.version },
      createHostRequestContextFixture({
        operationId: ARTIFACT_LOAD,
        requestId: 'requests/inspect-first',
        sessionGeneration: testbed.controls.sessionGeneration,
      }),
    );
    expect((persistedAfterFirst.value as BlueprintDocument).roots.map((node) => node.id)).toEqual([
      'node-before-save',
    ]);

    await expect(handle.save()).resolves.toEqual({
      revision: 'late-save.blueprint-r3',
      value: null,
    });
    expect(handle.session.dirty).toBe(false);
    expect(handle.session.savedRevision).toBe('late-save.blueprint-r3');
    expect(handle.session.document.revision).toBe('late-save.blueprint-r3');
  });

  it('normalizes an unwrapped adapter exception to a safe internal HostPortFailure', async () => {
    const blueprint = createBlueprintFixture({ id: 'unsafe-adapter.blueprint' });
    const testbed = createTestbedHost({
      documents: [blueprint],
      permissions: ['studio.permission/save'],
    });
    const artifact: ArtifactPort = {
      ...testbed.host.artifact,
      save: (): Promise<HostPortResult<null>> =>
        Promise.reject(new Error('private transport secret')),
    };
    const configuration = configurationFor(blueprint, {
      sessionGeneration: testbed.controls.sessionGeneration,
    });
    const handle = await openStudioSession(
      { ...testbed.host, artifact },
      { configuration, identifiers: identifierProbe().factories },
    );
    handle.session.execute(insertCommand(handle.session, configuration.sessionGeneration, 'node'));

    let caught: unknown;
    try {
      await handle.save();
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(HostPortFailure);
    expect(caught).toMatchObject({
      error: {
        category: 'internal',
        diagnostics: [{ code: 'studio.host/invalid-failure-wrapper' }],
        retryable: false,
      },
    });
    expect((caught as Error).message).not.toContain('private transport secret');
  });
});

describe('host-session invalidation and disposal', () => {
  it('keeps an unrelated invalid request scoped to its attempted operation', async () => {
    const blueprint = createBlueprintFixture({
      id: 'invalid-request.blueprint',
      revision: 'invalid-request.blueprint-r1',
    });
    const testbed = createTestbedHost({
      documents: [blueprint],
      permissions: ['studio.permission/save'],
    });
    const configuration = configurationFor(blueprint, {
      sessionGeneration: testbed.controls.sessionGeneration,
    });
    const handle = await openStudioSession(testbed.host, {
      configuration,
      identifiers: identifierProbe().factories,
    });
    handle.session.execute(insertCommand(handle.session, configuration.sessionGeneration, 'node'));

    testbed.controls.failNext('artifact', 'save', 'invalid-request');
    let invalidRequest: unknown;
    try {
      await handle.save();
    } catch (error) {
      invalidRequest = error;
    }
    expect(invalidRequest).toBeInstanceOf(HostPortFailure);
    expect((invalidRequest as HostPortFailure).error.category).toBe('invalid-request');
    expect((invalidRequest as HostPortFailure).error.diagnostics).toBeUndefined();
    expect(handle.invalidated).toBe(false);
    await expect(handle.save()).resolves.toEqual({
      revision: 'invalid-request.blueprint-r2',
      value: null,
    });
  });

  it('invalidates the entire handle after the stable stale-generation diagnostic', async () => {
    const blueprint = createBlueprintFixture({ id: 'generation.blueprint' });
    const testbed = createTestbedHost({
      documents: [blueprint],
      permissions: ['studio.permission/save'],
    });
    const configuration = configurationFor(blueprint, {
      recovery: true,
      sessionGeneration: testbed.controls.sessionGeneration,
    });
    const identifiers = identifierProbe();
    const handle = await openStudioSession(testbed.host, {
      configuration,
      identifiers: identifiers.factories,
    });
    handle.session.execute(insertCommand(handle.session, configuration.sessionGeneration, 'node'));
    testbed.controls.setPermissions([]);

    let stale: unknown;
    try {
      await handle.save();
    } catch (error) {
      stale = error;
    }
    expect(stale).toBeInstanceOf(HostPortFailure);
    expect(stale).toMatchObject({
      error: {
        category: 'invalid-request',
        diagnostics: [
          expect.objectContaining({
            code: STUDIO_STALE_SESSION_GENERATION_DIAGNOSTIC_CODE,
          }),
        ],
      },
    });
    expect(handle.invalidated).toBe(true);
    const requestCount = identifiers.requestOperations.length;

    let later: unknown;
    try {
      await handle.recovery?.load();
    } catch (error) {
      later = error;
    }
    expect(later).toBe(stale);
    await expect(handle.save()).rejects.toBe(stale);
    expect(identifiers.requestOperations).toHaveLength(requestCount);
  });

  it('disposes locally and idempotently without another host request', async () => {
    const blueprint = createBlueprintFixture({ id: 'disposed.blueprint' });
    const testbed = createTestbedHost({ documents: [blueprint] });
    const configuration = configurationFor(blueprint, {
      recovery: true,
      sessionGeneration: testbed.controls.sessionGeneration,
    });
    const identifiers = identifierProbe();
    const handle = await openStudioSession(testbed.host, {
      configuration,
      identifiers: identifiers.factories,
    });
    const requestCount = identifiers.requestOperations.length;

    handle.dispose();
    handle.dispose();
    expect(handle.disposed).toBe(true);
    await expect(handle.save()).rejects.toMatchObject({ code: 'disposed' });
    await expect(handle.recovery?.load()).rejects.toMatchObject({ code: 'disposed' });
    expect(identifiers.requestOperations).toHaveLength(requestCount);
  });

  it('rejects duplicate or malformed injected request identifiers before a second host call', async () => {
    const blueprint = createBlueprintFixture({ id: 'identifiers.blueprint' });
    const testbed = createTestbedHost({
      documents: [blueprint],
      permissions: ['studio.permission/save'],
    });
    const configuration = configurationFor(blueprint, {
      sessionGeneration: testbed.controls.sessionGeneration,
    });
    const identifiers: StudioHostSessionIdentifierFactories = {
      idempotencyKey: (): string => 'idempotency/reused',
      requestId: (): string => 'requests/reused',
    };
    const handle = await openStudioSession(testbed.host, { configuration, identifiers });
    handle.session.execute(insertCommand(handle.session, configuration.sessionGeneration, 'node'));

    await expect(handle.save()).rejects.toMatchObject({ code: 'invalid-identifier' });
    expect(testbed.controls.revisionOf(blueprint.id)).toBe(blueprint.revision);

    await expect(
      openStudioSession(testbed.host, {
        configuration,
        identifiers: {
          idempotencyKey: (): string => 'bad key',
          requestId: (): string => 'bad key',
        },
      }),
    ).rejects.toMatchObject({ code: 'invalid-identifier' });
  });
});
