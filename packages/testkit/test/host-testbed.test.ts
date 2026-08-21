import { describe, expect, it } from 'vitest';
import {
  STUDIO_CONTRACT_VERSION,
  isHostPortError,
  type ArtifactPort,
  type HostErrorCategory,
  type HostPortError,
  type HostRequestContext,
  type LocalizationPort,
  type MediaAsset,
  type MediaHostPort,
  type PermissionPort,
  type PreviewPort,
  type RecoveryPort,
  type ResourcePort,
  type ResourceSearchHit,
  type TelemetryEvent,
  type TelemetryPort,
} from '@kumwe/studio-protocol';
import {
  createBlueprintFixture,
  createHostRequestContextFixture,
  createTestbedHost,
  TestbedHostError,
  type HostRequestContextFixtureOptions,
  type TestbedHost,
  type TestbedHostOptions,
} from '../src/index.js';

const alphaReference = { id: 'docs/alpha', version: '1.0.0' };

async function expectHostError(
  operation: Promise<unknown>,
  category: HostErrorCategory,
): Promise<HostPortError> {
  let caught: unknown;
  try {
    await operation;
  } catch (error) {
    caught = error;
  }
  if (!(caught instanceof TestbedHostError)) {
    throw new Error('Expected the operation to reject with a TestbedHostError.');
  }
  expect(isHostPortError(caught.error)).toBe(true);
  expect(caught.error.category).toBe(category);
  return caught.error;
}

function createMediaAssetFixture(index: number): MediaAsset {
  return {
    byteSize: 1_000 + index,
    contractVersion: STUDIO_CONTRACT_VERSION,
    filename: `asset-${index}.png`,
    id: `media/asset-${index}`,
    kind: 'media-asset',
    mediaKind: 'image',
    mediaType: 'image/png',
    metadata: {},
    revision: `media-r${index}`,
    state: 'ready',
  };
}

function createResourceFixture(index: number): ResourceSearchHit {
  return {
    id: `resources/product-${index}`,
    label: { defaultMessage: `Product ${index}`, key: 'studio.test/resource-label' },
    resourceType: 'studio.resource/product',
  };
}

function createTestbed(overrides: TestbedHostOptions = {}): TestbedHost {
  return createTestbedHost({
    allowTestOperationId: true,
    documents: [
      createBlueprintFixture({ id: 'docs/alpha', revision: 'docs/alpha-r1' }),
      createBlueprintFixture({ id: 'docs/beta', revision: 'docs/beta-r1' }),
    ],
    mediaAssets: [0, 1, 2, 3, 4].map(createMediaAssetFixture),
    messages: {
      'en-US': {
        'studio.test/menu.open': 'Open',
        'studio.test/menu.save': 'Save',
        'studio.test/title': 'Studio',
      },
    },
    permissions: ['studio.permission/publish', 'studio.permission/save'],
    resources: [
      ...[0, 1, 2, 3, 4, 5, 6].map(createResourceFixture),
      {
        id: 'resources/category-0',
        label: { defaultMessage: 'Category 0', key: 'studio.test/resource-label' },
        resourceType: 'studio.resource/category',
      },
    ],
    ...overrides,
  });
}

function contextFor(
  testbed: TestbedHost,
  overrides: HostRequestContextFixtureOptions = {},
): HostRequestContext {
  return createHostRequestContextFixture({
    sessionGeneration: testbed.controls.sessionGeneration,
    ...overrides,
  });
}

interface RequiredPorts {
  artifact: ArtifactPort;
  localization: LocalizationPort;
  media: MediaHostPort;
  permission: PermissionPort;
  preview: PreviewPort;
  recovery: RecoveryPort;
  resource: ResourcePort;
  telemetry: TelemetryPort;
}

function requirePorts(testbed: TestbedHost): RequiredPorts {
  const { artifact, localization, media, permission, preview, recovery, resource, telemetry } =
    testbed.host;
  if (
    localization === undefined ||
    media === undefined ||
    permission === undefined ||
    preview === undefined ||
    recovery === undefined ||
    resource === undefined ||
    telemetry === undefined
  ) {
    throw new Error('The testbed host must implement every optional port it declares.');
  }
  return { artifact, localization, media, permission, preview, recovery, resource, telemetry };
}

describe('Testbed host', () => {
  it('preserves authoritative seeded revisions and generations before deterministic advance', async () => {
    const testbed = createTestbedHost({
      documents: [createBlueprintFixture({ id: 'docs/upstream', revision: 'vendor-revision-77' })],
      permissions: ['studio.permission/publish'],
      sessionGeneration: 'vendor-session-12',
    });
    expect(testbed.controls.revisionOf('docs/upstream')).toBe('vendor-revision-77');
    expect(testbed.controls.sessionGeneration).toBe('vendor-session-12');

    const loaded = await testbed.host.artifact.load(
      { id: 'docs/upstream', version: '1.0.0' },
      createHostRequestContextFixture({
        operationId: 'studio.operation/artifact.load',
        sessionGeneration: 'vendor-session-12',
      }),
    );
    expect(loaded).toMatchObject({
      revision: 'vendor-revision-77',
      value: { revision: 'vendor-revision-77' },
    });

    const published = await testbed.host.artifact.publish(
      { id: 'docs/upstream', version: '1.0.0' },
      createHostRequestContextFixture({
        expectedRevision: 'vendor-revision-77',
        operationId: 'studio.operation/artifact.publish',
        sessionGeneration: 'vendor-session-12',
      }),
    );
    expect(published.revision).toBe('docs/upstream-r1');

    testbed.controls.setPermissions([]);
    expect(testbed.controls.sessionGeneration).toBe('session-r1');
  });

  it('loads and saves with deterministic revision advance', async () => {
    const testbed = createTestbed();
    const { artifact } = testbed.host;

    const loaded = await artifact.load(alphaReference, contextFor(testbed));
    expect(loaded.revision).toBe('docs/alpha-r1');
    expect(loaded.value.id).toBe('docs/alpha');
    expect(loaded.value.revision).toBe('docs/alpha-r1');

    const draft = loaded.value;
    draft.extensions = { 'studio.test/edit': 'first' };
    const reloadedBeforeSave = await artifact.load(alphaReference, contextFor(testbed));
    expect(reloadedBeforeSave.value.extensions).toBeUndefined();

    const saved = await artifact.save(
      draft,
      contextFor(testbed, { expectedRevision: 'docs/alpha-r1' }),
    );
    expect(saved.revision).toBe('docs/alpha-r2');
    expect(testbed.controls.revisionOf('docs/alpha')).toBe('docs/alpha-r2');

    const reloaded = await artifact.load(alphaReference, contextFor(testbed));
    expect(reloaded.revision).toBe('docs/alpha-r2');
    expect(reloaded.value.revision).toBe('docs/alpha-r2');
    expect(reloaded.value.extensions).toEqual({ 'studio.test/edit': 'first' });
  });

  it('rejects conflicting saves with the safe current revision and keeps stored state', async () => {
    const testbed = createTestbed();
    const { artifact } = testbed.host;

    const draft = (await artifact.load(alphaReference, contextFor(testbed))).value;
    draft.extensions = { 'studio.test/edit': 'winner' };
    await artifact.save(draft, contextFor(testbed, { expectedRevision: 'docs/alpha-r1' }));

    draft.extensions = { 'studio.test/edit': 'loser' };
    const conflict = await expectHostError(
      artifact.save(draft, contextFor(testbed, { expectedRevision: 'docs/alpha-r1' })),
      'conflict',
    );
    expect(conflict.revision).toBe('docs/alpha-r2');
    expect(conflict.retryable).toBe(false);

    const reloaded = await artifact.load(alphaReference, contextFor(testbed));
    expect(reloaded.revision).toBe('docs/alpha-r2');
    expect(reloaded.value.extensions).toEqual({ 'studio.test/edit': 'winner' });
    expect(testbed.controls.revisionOf('docs/alpha')).toBe('docs/alpha-r2');
  });

  it('lets the second writer win and the first writer recover by reloading', async () => {
    const testbed = createTestbed();
    const { artifact } = testbed.host;

    const firstWriter = await artifact.load(alphaReference, contextFor(testbed));
    const secondWriter = await artifact.load(alphaReference, contextFor(testbed));

    secondWriter.value.extensions = { 'studio.test/edit': 'second-writer' };
    await artifact.save(
      secondWriter.value,
      contextFor(testbed, { expectedRevision: 'docs/alpha-r1' }),
    );

    firstWriter.value.extensions = { 'studio.test/edit': 'first-writer' };
    const conflict = await expectHostError(
      artifact.save(firstWriter.value, contextFor(testbed, { expectedRevision: 'docs/alpha-r1' })),
      'conflict',
    );
    expect(conflict.revision).toBe('docs/alpha-r2');

    const recovered = await artifact.load(alphaReference, contextFor(testbed));
    expect(recovered.value.extensions).toEqual({ 'studio.test/edit': 'second-writer' });

    recovered.value.extensions = { 'studio.test/edit': 'first-writer' };
    const retried = await artifact.save(
      recovered.value,
      contextFor(testbed, { expectedRevision: 'docs/alpha-r2' }),
    );
    expect(retried.revision).toBe('docs/alpha-r3');

    const final = await artifact.load(alphaReference, contextFor(testbed));
    expect(final.value.extensions).toEqual({ 'studio.test/edit': 'first-writer' });
  });

  it('publishes and unpublishes under the optimistic concurrency rule', async () => {
    const testbed = createTestbed();
    const { artifact } = testbed.host;

    const stale = await expectHostError(
      artifact.publish(alphaReference, contextFor(testbed, { expectedRevision: 'docs/alpha-r0' })),
      'conflict',
    );
    expect(stale.revision).toBe('docs/alpha-r1');

    const published = await artifact.publish(
      alphaReference,
      contextFor(testbed, { expectedRevision: 'docs/alpha-r1' }),
    );
    expect(published.revision).toBe('docs/alpha-r2');
    expect((await artifact.load(alphaReference, contextFor(testbed))).value.status).toBe(
      'published',
    );

    const unpublished = await artifact.unpublish(
      alphaReference,
      contextFor(testbed, { expectedRevision: 'docs/alpha-r2' }),
    );
    expect(unpublished.revision).toBe('docs/alpha-r3');
    expect((await artifact.load(alphaReference, contextFor(testbed))).value.status).toBe('draft');

    const dependencies = await artifact.dependencies(alphaReference, contextFor(testbed));
    expect(dependencies.value).toEqual([]);
  });

  it('bumps the generation on permission change and rejects stale generations on every port', async () => {
    const testbed = createTestbed();
    const ports = requirePorts(testbed);
    const stale = contextFor(testbed);

    const before = await ports.permission.explain('studio.permission/publish', contextFor(testbed));
    expect(before.value).toEqual({ allowed: true });

    testbed.controls.setPermissions(['studio.permission/save']);
    expect(testbed.controls.sessionGeneration).not.toBe(stale.sessionGeneration);

    const staleOperations: (() => Promise<unknown>)[] = [
      () => ports.artifact.load(alphaReference, stale),
      () => ports.localization.messages('en-US', ['studio.test/menu'], stale),
      () => ports.media.list({ limit: 10 }, stale),
      () => ports.permission.refresh(stale),
      () => ports.preview.cancel('digest-1', stale),
      () => ports.recovery.load(stale),
      () => ports.resource.search({ limit: 10, resourceType: 'studio.resource/product' }, stale),
      () => ports.telemetry.emit({ name: 'studio.test/event' }, stale),
    ];
    for (const operation of staleOperations) {
      const error = await expectHostError(operation(), 'invalid-request');
      expect(error.message.defaultMessage).toBe('The session generation is no longer valid.');
      expect(error.retryable).toBe(false);
    }

    const explained = await ports.permission.explain(
      'studio.permission/publish',
      contextFor(testbed),
    );
    expect(explained.value.allowed).toBe(false);
    expect(explained.value.reason?.defaultMessage).toBe(
      'The session does not hold this permission.',
    );

    const refreshed = await ports.permission.refresh(contextFor(testbed));
    expect(refreshed.value.permissions).toEqual(['studio.permission/save']);
    expect(refreshed.value.sessionGeneration).toBe(testbed.controls.sessionGeneration);
  });

  it('rejects every operation as retryable unavailable while disconnected', async () => {
    const testbed = createTestbed();
    const ports = requirePorts(testbed);

    testbed.controls.disconnect();
    const unavailable = await expectHostError(
      ports.artifact.load(alphaReference, contextFor(testbed)),
      'unavailable',
    );
    expect(unavailable.retryable).toBe(true);
    const telemetryError = await expectHostError(
      ports.telemetry.emit({ name: 'studio.test/event' }, contextFor(testbed)),
      'unavailable',
    );
    expect(telemetryError.retryable).toBe(true);

    testbed.controls.reconnect();
    const loaded = await ports.artifact.load(alphaReference, contextFor(testbed));
    expect(loaded.revision).toBe('docs/alpha-r1');
  });

  it('injects exactly one matching failure and then resumes normal service', async () => {
    const testbed = createTestbed();
    const { artifact } = testbed.host;

    testbed.controls.failNext('artifact', 'load', 'rate-limited');
    testbed.controls.failNext('artifact', 'save', 'internal');

    const rateLimited = await expectHostError(
      artifact.load(alphaReference, contextFor(testbed)),
      'rate-limited',
    );
    expect(rateLimited.retryable).toBe(true);

    const loaded = await artifact.load(alphaReference, contextFor(testbed));
    expect(loaded.revision).toBe('docs/alpha-r1');

    const internal = await expectHostError(
      artifact.save(loaded.value, contextFor(testbed, { expectedRevision: 'docs/alpha-r1' })),
      'internal',
    );
    expect(internal.retryable).toBe(false);

    const saved = await artifact.save(
      loaded.value,
      contextFor(testbed, { expectedRevision: 'docs/alpha-r1' }),
    );
    expect(saved.revision).toBe('docs/alpha-r2');
  });

  it('produces guard-conforming errors for every injected category', async () => {
    const categories: HostErrorCategory[] = [
      'cancelled',
      'conflict',
      'forbidden',
      'incompatible',
      'internal',
      'invalid-request',
      'limit-exceeded',
      'not-found',
      'rate-limited',
      'unauthenticated',
      'unavailable',
      'validation-failed',
    ];
    const testbed = createTestbed();
    for (const category of categories) {
      testbed.controls.failNext('artifact', 'load', category);
      const error = await expectHostError(
        testbed.host.artifact.load(alphaReference, contextFor(testbed)),
        category,
      );
      expect(error.retryable).toBe(category === 'rate-limited' || category === 'unavailable');
    }
    const recovered = await testbed.host.artifact.load(alphaReference, contextFor(testbed));
    expect(recovered.revision).toBe('docs/alpha-r1');
  });

  it('paginates resource search with opaque cursors and no duplicates', async () => {
    const testbed = createTestbed();
    const ports = requirePorts(testbed);

    const ids: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const page = await ports.resource.search(
        {
          limit: 3,
          resourceType: 'studio.resource/product',
          ...(cursor === undefined ? {} : { cursor }),
        },
        contextFor(testbed),
      );
      pages += 1;
      ids.push(...page.value.items.map((item) => item.id));
      cursor = page.value.nextCursor;
    } while (cursor !== undefined);

    expect(pages).toBe(3);
    expect(ids).toHaveLength(7);
    expect(new Set(ids).size).toBe(7);
    expect(ids.every((id) => id.startsWith('resources/product-'))).toBe(true);

    const searched = await ports.resource.search(
      { limit: 10, resourceType: 'studio.resource/product', search: 'product 3' },
      contextFor(testbed),
    );
    expect(searched.value.items.map((item) => item.id)).toEqual(['resources/product-3']);
    expect(searched.value.nextCursor).toBeUndefined();

    await expectHostError(
      ports.resource.search(
        { limit: 0, resourceType: 'studio.resource/product' },
        contextFor(testbed),
      ),
      'invalid-request',
    );
    await expectHostError(
      ports.resource.search(
        { limit: 101, resourceType: 'studio.resource/product' },
        contextFor(testbed),
      ),
      'invalid-request',
    );
    await expectHostError(
      ports.resource.search(
        { cursor: '!!invalid!!', limit: 3, resourceType: 'studio.resource/product' },
        contextFor(testbed),
      ),
      'invalid-request',
    );
  });

  it('paginates media listings and returns null for unknown assets', async () => {
    const testbed = createTestbed();
    const ports = requirePorts(testbed);

    const ids: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const page = await ports.media.list(
        { limit: 2, ...(cursor === undefined ? {} : { cursor }) },
        contextFor(testbed),
      );
      pages += 1;
      ids.push(...page.value.assets.map((asset) => asset.id));
      cursor = page.value.nextCursor;
    } while (cursor !== undefined);

    expect(pages).toBe(3);
    expect(ids).toHaveLength(5);
    expect(new Set(ids).size).toBe(5);

    const found = await ports.media.get('media/asset-2', contextFor(testbed));
    expect(found.value?.id).toBe('media/asset-2');
    expect(found.revision).toBe('media-r2');

    const missing = await ports.media.get('media/asset-99', contextFor(testbed));
    expect(missing.value).toBeNull();

    const filtered = await ports.media.list({ limit: 10, search: 'ASSET-3' }, contextFor(testbed));
    expect(filtered.value.assets.map((asset) => asset.id)).toEqual(['media/asset-3']);
  });

  it('serves namespace-filtered messages and rejects unknown locales without disclosure', async () => {
    const testbed = createTestbed();
    const ports = requirePorts(testbed);

    const messages = await ports.localization.messages(
      'en-US',
      ['studio.test/menu'],
      contextFor(testbed),
    );
    expect(messages.value).toEqual({
      'studio.test/menu.open': 'Open',
      'studio.test/menu.save': 'Save',
    });

    const exact = await ports.localization.messages(
      'en-US',
      ['studio.test/title'],
      contextFor(testbed),
    );
    expect(exact.value).toEqual({ 'studio.test/title': 'Studio' });

    const error = await expectHostError(
      ports.localization.messages('fr-FR', ['studio.test/menu'], contextFor(testbed)),
      'not-found',
    );
    expect(JSON.stringify(error)).not.toContain('en-US');
  });

  it('stores, loads, and discards one recovery envelope per resource context key', async () => {
    const testbed = createTestbed();
    const ports = requirePorts(testbed);
    const contextOne = (): HostRequestContext =>
      contextFor(testbed, { resourceContextKey: 'contexts/one' });
    const contextTwo = (): HostRequestContext =>
      contextFor(testbed, { resourceContextKey: 'contexts/two' });

    expect((await ports.recovery.load(contextOne())).value).toBeNull();

    await ports.recovery.store({ draft: 'one' }, contextOne());
    await ports.recovery.store({ draft: 'two' }, contextTwo());
    expect((await ports.recovery.load(contextOne())).value).toEqual({ draft: 'one' });
    expect((await ports.recovery.load(contextTwo())).value).toEqual({ draft: 'two' });

    await ports.recovery.discard(contextOne());
    expect((await ports.recovery.load(contextOne())).value).toBeNull();
    expect((await ports.recovery.load(contextTwo())).value).toEqual({ draft: 'two' });
  });

  it('records primitive telemetry attributes and rejects structured values', async () => {
    const testbed = createTestbed();
    const ports = requirePorts(testbed);

    await ports.telemetry.emit(
      { attributes: { count: 2, empty: null, label: 'save', ok: true }, name: 'studio.test/event' },
      contextFor(testbed),
    );
    expect(testbed.controls.telemetryEvents).toEqual([
      { attributes: { count: 2, empty: null, label: 'save', ok: true }, name: 'studio.test/event' },
    ]);

    const structured = {
      attributes: { nested: { deep: true } },
      name: 'studio.test/event',
    } as unknown as TelemetryEvent;
    await expectHostError(ports.telemetry.emit(structured, contextFor(testbed)), 'invalid-request');

    const infinite: TelemetryEvent = {
      attributes: { value: Number.POSITIVE_INFINITY },
      name: 'studio.test/event',
    };
    await expectHostError(ports.telemetry.emit(infinite, contextFor(testbed)), 'invalid-request');

    expect(testbed.controls.telemetryEvents).toHaveLength(1);
  });

  it('does not disclose seeded identifiers in not-found errors', async () => {
    const testbed = createTestbed();

    const error = await expectHostError(
      testbed.host.artifact.load({ id: 'docs/missing', version: '1.0.0' }, contextFor(testbed)),
      'not-found',
    );
    expect(error.retryable).toBe(false);

    const serialized = JSON.stringify(error);
    expect(serialized).not.toContain('docs/alpha');
    expect(serialized).not.toContain('docs/beta');
    expect(serialized).not.toContain('docs/missing');
    expect(testbed.controls.revisionOf('docs/missing')).toBeUndefined();
  });

  it('validates the request context structurally and the protocol version compatibly', async () => {
    const testbed = createTestbed();
    const { artifact } = testbed.host;

    await expectHostError(
      artifact.load(alphaReference, contextFor(testbed, { requestId: '' })),
      'invalid-request',
    );
    await expectHostError(
      artifact.load(alphaReference, contextFor(testbed, { resourceContextKey: '' })),
      'invalid-request',
    );
    await expectHostError(
      artifact.load(alphaReference, contextFor(testbed, { sessionGeneration: '' })),
      'invalid-request',
    );

    const emptyOperation = {
      ...contextFor(testbed),
      operationId: '',
    } as unknown as HostRequestContext;
    await expectHostError(artifact.load(alphaReference, emptyOperation), 'invalid-request');

    const wrongProtocol = {
      ...contextFor(testbed),
      protocolVersion: '99.0.0',
    } as unknown as HostRequestContext;
    const incompatible = await expectHostError(
      artifact.load(alphaReference, wrongProtocol),
      'incompatible',
    );
    expect(incompatible.retryable).toBe(false);
  });

  it('enforces the closed operation capability by default', async () => {
    const strict = createTestbedHost({
      documents: [createBlueprintFixture({ id: 'docs/strict', revision: 'docs/strict-r1' })],
    });
    const reference = { id: 'docs/strict', version: '1.0.0' };

    const mismatch = await expectHostError(
      strict.host.artifact.load(
        reference,
        createHostRequestContextFixture({
          operationId: 'studio.operation/artifact.save',
          sessionGeneration: strict.controls.sessionGeneration,
        }),
      ),
      'invalid-request',
    );
    expect(mismatch.message.defaultMessage).toBe(
      'The request operation identifier does not match the invoked port.',
    );

    const loaded = await strict.host.artifact.load(
      reference,
      createHostRequestContextFixture({
        operationId: 'studio.operation/artifact.load',
        sessionGeneration: strict.controls.sessionGeneration,
      }),
    );
    expect(loaded.revision).toBe('docs/strict-r1');
  });

  it('bounds deterministic rate policies and logical clock advances', () => {
    expect(() =>
      createTestbedHost({
        rateLimits: [
          {
            maximumRequests: 1001,
            operationId: 'studio.operation/recovery.store',
            windowMilliseconds: 60_000,
          },
        ],
      }),
    ).toThrow(RangeError);
    expect(() =>
      createTestbedHost({
        rateLimits: [
          {
            maximumRequests: 1,
            operationId: 'studio.operation/recovery.store',
            windowMilliseconds: 86_400_001,
          },
        ],
      }),
    ).toThrow(RangeError);

    const testbed = createTestbedHost();
    expect(() => testbed.controls.advanceClock(-1)).toThrow(RangeError);
    testbed.controls.advanceClock(Number.MAX_SAFE_INTEGER);
    expect(() => testbed.controls.advanceClock(1)).toThrow(RangeError);
  });

  it('isolates the retained idempotent outcome from caller mutation', async () => {
    const testbed = createTestbedHost();
    const media = requirePorts(testbed).media;
    const request = {
      byteSize: 1_048_576,
      filename: 'photo.jpg',
      mediaType: 'image/jpeg',
      purpose: 'studio.media/content' as const,
    };
    const context = (requestId: string, idempotencyKey: string): HostRequestContext =>
      createHostRequestContextFixture({
        idempotencyKey,
        operationId: 'studio.operation/media.authorize-upload',
        requestId,
        sessionGeneration: testbed.controls.sessionGeneration,
      });

    const first = await media.authorizeUpload(
      request,
      context('requests/upload-first', 'idempotency/upload-one'),
    );
    const firstHeaders = first.value.headers;
    expect(firstHeaders).toBeDefined();
    if (firstHeaders === undefined) {
      throw new Error('The deterministic upload grant must carry its session header.');
    }
    firstHeaders['X-Upload-Session'] = 'caller-mutated';

    const replay = await media.authorizeUpload(
      request,
      context('requests/upload-replay', 'idempotency/upload-one'),
    );
    const replayHeaders = replay.value.headers;
    expect(replayHeaders).toBeDefined();
    if (replayHeaders === undefined) {
      throw new Error('The replayed upload grant must carry its session header.');
    }
    expect(replay.value.uploadId).toBe('uploads/testbed-1');
    expect(replayHeaders['X-Upload-Session']).toBe('uploads/testbed-1');

    const next = await media.authorizeUpload(
      request,
      context('requests/upload-next', 'idempotency/upload-two'),
    );
    expect(next.value.uploadId).toBe('uploads/testbed-2');
  });

  it('separates idempotency records by operation, resource context, and session generation', async () => {
    const testbed = createTestbedHost();
    const recovery = requirePorts(testbed).recovery;
    const context = (
      operationId: HostRequestContext['operationId'],
      requestId: string,
      resourceContextKey: string,
    ): HostRequestContext =>
      createHostRequestContextFixture({
        idempotencyKey: 'idempotency/shared-across-scopes',
        operationId,
        requestId,
        resourceContextKey,
        sessionGeneration: testbed.controls.sessionGeneration,
      });

    await recovery.store(
      { value: 'resource-a' },
      context('studio.operation/recovery.store', 'requests/scope-resource-a', 'contexts/a'),
    );
    await recovery.store(
      { value: 'resource-b' },
      context('studio.operation/recovery.store', 'requests/scope-resource-b', 'contexts/b'),
    );
    expect(testbed.controls.recoveryEnvelope('contexts/a')).toEqual({ value: 'resource-a' });
    expect(testbed.controls.recoveryEnvelope('contexts/b')).toEqual({ value: 'resource-b' });

    await recovery.discard(
      context('studio.operation/recovery.discard', 'requests/scope-operation', 'contexts/b'),
    );
    expect(testbed.controls.recoveryEnvelope('contexts/b')).toBeUndefined();

    await recovery.store(
      { value: 'session-before' },
      context(
        'studio.operation/recovery.store',
        'requests/scope-session-before',
        'contexts/session',
      ),
    );
    testbed.controls.setPermissions([]);
    await recovery.store(
      { value: 'session-after' },
      context(
        'studio.operation/recovery.store',
        'requests/scope-session-after',
        'contexts/session',
      ),
    );
    expect(testbed.controls.recoveryEnvelope('contexts/session')).toEqual({
      value: 'session-after',
    });
  });

  it('does not retain a failed idempotent mutation as an accepted intent', async () => {
    const testbed = createTestbedHost({
      documents: [createBlueprintFixture({ id: 'docs/retry', revision: 'docs/retry-r1' })],
      permissions: ['studio.permission/publish'],
    });
    const reference = { id: 'docs/retry', version: '1.0.0' };
    const context = (requestId: string, expectedRevision: string): HostRequestContext =>
      createHostRequestContextFixture({
        expectedRevision,
        idempotencyKey: 'idempotency/retry-after-conflict',
        operationId: 'studio.operation/artifact.publish',
        requestId,
        sessionGeneration: testbed.controls.sessionGeneration,
      });

    await expectHostError(
      testbed.host.artifact.publish(
        reference,
        context('requests/publish-conflict', 'docs/retry-r0'),
      ),
      'conflict',
    );
    const accepted = await testbed.host.artifact.publish(
      reference,
      context('requests/publish-retry', 'docs/retry-r1'),
    );
    expect(accepted.revision).toBe('docs/retry-r2');
    expect(testbed.controls.artifactStatus('docs/retry')).toBe('published');
  });

  it('renders previews through the injected callback and cancels to null', async () => {
    const draftDigest = 'a'.repeat(64);
    const marker = `studio.preview/node/${draftDigest}/0`;
    const payload = {
      artifactId: 'docs/alpha',
      draftDigest,
      draftRevision: 'alpha-r1',
      requestId: 'renders/1',
      viewport: 'desktop',
    };

    const custom = createTestbed({
      render: (input) => ({
        diagnostics: [],
        draftDigest: input.draftDigest,
        markerMap: { [marker]: 'node-custom' },
        markers: [marker],
        requestId: input.requestId,
      }),
    });
    const customPorts = requirePorts(custom);
    const rendered = await customPorts.preview.render(payload, contextFor(custom));
    expect(rendered.value).toEqual({
      diagnostics: [],
      draftDigest,
      markerMap: { [marker]: 'node-custom' },
      markers: [marker],
      requestId: 'renders/1',
    });

    const fallback = createTestbed();
    const fallbackPorts = requirePorts(fallback);
    const defaultRendered = await fallbackPorts.preview.render(payload, contextFor(fallback));
    expect(defaultRendered.value).toEqual({
      diagnostics: [],
      draftDigest,
      markerMap: {},
      markers: [],
      requestId: 'renders/1',
    });

    const cancelled = await fallbackPorts.preview.cancel('digest-1', contextFor(fallback));
    expect(cancelled.value).toBeNull();
  });

  it.each([
    ['request identifier', { requestId: 'renders/wrong' }],
    ['draft digest', { draftDigest: 'b'.repeat(64) }],
  ])('rejects a renderer result with a mismatched %s', async (_label, mismatch) => {
    const draftDigest = 'a'.repeat(64);
    const payload = {
      artifactId: 'docs/alpha',
      draftDigest,
      draftRevision: 'alpha-r1',
      requestId: 'renders/expected',
      viewport: 'desktop',
    };
    const testbed = createTestbed({
      render: (input) => ({
        diagnostics: [],
        draftDigest: input.draftDigest,
        markerMap: {},
        markers: [],
        requestId: input.requestId,
        ...mismatch,
      }),
    });
    const { preview } = requirePorts(testbed);

    const error = await expectHostError(preview.render(payload, contextFor(testbed)), 'internal');

    expect(error.retryable).toBe(false);
    expect(testbed.controls.pendingPreviewRenders).toBe(0);
    expect(testbed.controls.previewDeliveries).toEqual([]);
  });

  it('exposes a guard-conforming error document on TestbedHostError', async () => {
    const testbed = createTestbed();

    let caught: unknown;
    try {
      await testbed.host.artifact.load({ id: 'docs/none', version: '1.0.0' }, contextFor(testbed));
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Error);
    expect(caught).toBeInstanceOf(TestbedHostError);
    if (caught instanceof TestbedHostError) {
      expect(caught.name).toBe('TestbedHostError');
      expect(isHostPortError(caught.error)).toBe(true);
      expect(caught.message).toBe(caught.error.message.defaultMessage);
    }
  });
});
