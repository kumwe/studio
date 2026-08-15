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
    documents: [
      createBlueprintFixture({ id: 'docs/alpha' }),
      createBlueprintFixture({ id: 'docs/beta' }),
    ],
    mediaAssets: [0, 1, 2, 3, 4].map(createMediaAssetFixture),
    messages: {
      'en-US': {
        'studio.test/menu.open': 'Open',
        'studio.test/menu.save': 'Save',
        'studio.test/title': 'Studio',
      },
    },
    permissions: ['studio.action/publish', 'studio.action/save'],
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

    const before = await ports.permission.explain('studio.action/publish', contextFor(testbed));
    expect(before.value).toEqual({ allowed: true });

    testbed.controls.setPermissions(['studio.action/save']);
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

    const explained = await ports.permission.explain('studio.action/publish', contextFor(testbed));
    expect(explained.value.allowed).toBe(false);
    expect(explained.value.reason?.defaultMessage).toBe(
      'The session does not hold this permission.',
    );

    const refreshed = await ports.permission.refresh(contextFor(testbed));
    expect(refreshed.value.permissions).toEqual(['studio.action/save']);
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

  it('renders previews through the injected callback and cancels to null', async () => {
    const payload = { artifactId: 'docs/alpha', draftDigest: 'digest-1', viewport: 'desktop' };

    const custom = createTestbed({
      render: (input) => ({
        diagnostics: [],
        draftDigest: input.draftDigest,
        markers: ['markers/custom'],
      }),
    });
    const customPorts = requirePorts(custom);
    const rendered = await customPorts.preview.render(payload, contextFor(custom));
    expect(rendered.value).toEqual({
      diagnostics: [],
      draftDigest: 'digest-1',
      markers: ['markers/custom'],
    });

    const fallback = createTestbed();
    const fallbackPorts = requirePorts(fallback);
    const defaultRendered = await fallbackPorts.preview.render(payload, contextFor(fallback));
    expect(defaultRendered.value).toEqual({
      diagnostics: [],
      draftDigest: 'digest-1',
      markers: [],
    });

    const cancelled = await fallbackPorts.preview.cancel('digest-1', contextFor(fallback));
    expect(cancelled.value).toBeNull();
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
