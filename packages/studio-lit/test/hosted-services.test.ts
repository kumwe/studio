import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type {
  AuthoringSessionSnapshot,
  AuthoringTargetResolution,
  HostAdapter,
  HostRequestContext,
  MediaAsset,
  MediaUploadGrant,
  MediaUploadRequestDescriptor,
  QualifiedName,
  StudioHostedDeploymentConfiguration,
} from '@kumwe/studio-protocol';
import { STUDIO_CONTRACT_VERSION } from '@kumwe/studio-protocol';
import { createStudioConfigurationFixture } from '@kumwe/studio-testkit';
import {
  assertHostedCapabilityRoutes,
  coordinateHostedIdentifiers,
  createHostedBrowserServices,
} from '../src/hosted-services.js';
import type { StudioHostedMediaGrantTransfer } from '../src/hosted-media-upload.js';

const snapshot = JSON.parse(
  await readFile(join(process.cwd(), 'schemas/examples/authoring-session.example.json'), 'utf8'),
) as AuthoringSessionSnapshot;
const TEST_GRANT_NOW = 1_800_000_000_000;

describe('hosted browser services', () => {
  it('rejects an advertised standard operation without its exact configured route', () => {
    const configuration = deployment();
    configuration.session.hostCapabilities.ports.push({
      id: 'studio.port/resource',
      operations: ['studio.operation/resource.search'],
      version: '1.0.0',
    });

    expect(() => assertHostedCapabilityRoutes(configuration)).toThrow(
      /resource\.search.*resource\/search/u,
    );

    if (configuration.transport.routing.kind !== 'operation-map') {
      throw new TypeError('The test requires operation-map routing.');
    }
    configuration.transport.routing = {
      endpoints: {
        ...configuration.transport.routing.endpoints,
        'resource/search': '/studio/resource/search',
      },
      kind: 'operation-map',
    };
    expect(() => assertHostedCapabilityRoutes(configuration)).not.toThrow();
  });

  it('rejects a standard operation advertised under the wrong port', () => {
    const configuration = deployment();
    configuration.session.hostCapabilities.ports.push({
      id: 'studio.port/resource',
      operations: ['studio.operation/media.list'],
      version: '1.0.0',
    });
    expect(() => assertHostedCapabilityRoutes(configuration)).toThrow(
      /resource.*unrelated.*media\.list/u,
    );
  });

  it('binds resource search to the exact session context and authorized target types', async () => {
    const configuration = deployment();
    configuration.session.hostCapabilities.ports.push({
      id: 'studio.port/resource',
      operations: ['studio.operation/resource.search'],
      version: '1.0.0',
    });
    const contexts: HostRequestContext[] = [];
    const searchImplementation: NonNullable<HostAdapter['resource']>['search'] = (
      query,
      context,
    ) => {
      contexts.push(structuredClone(context));
      return Promise.resolve({
        value: {
          items: [
            {
              id: 'articles/one',
              label: { defaultMessage: 'One', key: 'studio.test/article-one' },
              resourceType: query.resourceType,
            },
          ],
        },
      });
    };
    const search = vi.fn(searchImplementation);
    const adapter = adapterWith({
      resource: { search },
    });
    const resolution = targetResolution();
    resolution.target.resourceTypes = ['studio.test/article'];
    const services = createHostedBrowserServices(adapter, configuration, resolution, identifiers());
    const service = services.resourceSearchService;
    if (service === undefined) throw new Error('Expected a resource search service.');

    expect(service.resourceTypes).toEqual([
      {
        id: 'studio.test/article',
        label: { defaultMessage: 'studio.test/article', key: 'studio.test/article' },
      },
    ]);
    await expect(
      service.search(
        { limit: 20, resourceType: 'studio.test/article' },
        new AbortController().signal,
      ),
    ).resolves.toMatchObject({ items: [{ id: 'articles/one' }] });
    expect(contexts).toEqual([
      expect.objectContaining({
        operationId: 'studio.operation/resource.search',
        protocolVersion: configuration.session.protocolVersion,
        resourceContextKey: configuration.session.resourceContext.key,
        sessionGeneration: configuration.session.sessionGeneration,
      }),
    ]);
    await expect(
      service.search(
        { limit: 20, resourceType: 'studio.test/private' },
        new AbortController().signal,
      ),
    ).rejects.toThrow(/outside the resolved authoring target/u);
    expect(search).toHaveBeenCalledOnce();
    await expect(
      service.search(
        { limit: 0, resourceType: 'studio.test/article' },
        new AbortController().signal,
      ),
    ).rejects.toThrow(/malformed or out of bounds/u);
    expect(search).toHaveBeenCalledOnce();

    search.mockResolvedValueOnce({
      value: {
        items: [
          {
            id: 'private/one',
            label: { defaultMessage: 'Private', key: 'studio.test/private' },
            resourceType: 'studio.test/private',
          },
        ],
      },
    });
    await expect(
      service.search(
        { limit: 20, resourceType: 'studio.test/article' },
        new AbortController().signal,
      ),
    ).rejects.toThrow(/invalid item/u);
  });

  it('composes bounded browse-only media and rejects malformed host assets', async () => {
    const configuration = deployment();
    configuration.session.hostCapabilities.ports.push({
      id: 'studio.port/media',
      operations: ['studio.operation/media.get', 'studio.operation/media.list'],
      version: '1.0.0',
    });
    const asset = mediaAsset();
    const get = vi.fn(() => Promise.resolve({ value: structuredClone(asset) }));
    const adapter = adapterWith({
      media: {
        abortUpload: vi.fn(),
        authorizeUpload: vi.fn(),
        completeUpload: vi.fn(),
        get,
        importExternal: vi.fn(),
        list: vi.fn(() => Promise.resolve({ value: { assets: [structuredClone(asset)] } })),
        uploadStatus: vi.fn(),
      },
    });
    const services = createHostedBrowserServices(
      adapter,
      configuration,
      targetResolution(),
      identifiers(),
    );
    if (services.media === undefined) throw new Error('Expected media services.');

    expect(services.media.uploadsEnabled).toBe(false);
    await expect(services.media.provider.get(asset.id)).resolves.toEqual(asset);
    await expect(services.media.provider.list({ limit: 20 })).resolves.toEqual({ assets: [asset] });

    get.mockResolvedValueOnce({
      value: { ...asset, mediaType: 'not a media type' },
    });
    await expect(services.media.provider.get(asset.id)).rejects.toThrow(/malformed asset/u);
  });

  it('keeps upload authority on the adapter and delegates only granted byte transfer', async () => {
    const currentTimeMilliseconds = 1_800_000_000_000;
    const configuration = deployment();
    configuration.session.features.clipboardMediaUpload = true;
    configuration.session.hostCapabilities.ports.push({
      id: 'studio.port/media',
      operations: [
        'studio.operation/media.get',
        'studio.operation/media.list',
        'studio.operation/media.abort-upload',
        'studio.operation/media.authorize-upload',
        'studio.operation/media.complete-upload',
      ],
      version: '1.0.0',
    });
    const operations: QualifiedName[] = [];
    const authorizeUpload = vi.fn((_request, context: HostRequestContext) => {
      operations.push(context.operationId);
      return Promise.resolve({
        value: {
          expiresAt: new Date(currentTimeMilliseconds + 60_000).toISOString(),
          headers: { 'X-Upload-Grant': 'opaque' },
          method: 'PUT' as const,
          plan: { maximumBytes: 100, resumable: false },
          uploadId: 'host-uploads/one',
          url: 'https://uploads.example.test/one',
        },
      });
    });
    const completeUpload = vi.fn((uploadId: string, context: HostRequestContext) => {
      operations.push(context.operationId);
      return Promise.resolve({
        value: { id: `media/${uploadId}`, revision: 'media-r2', state: 'ready' as const },
      });
    });
    const abortUpload = vi.fn((_: string, context: HostRequestContext) => {
      operations.push(context.operationId);
      return Promise.resolve({ value: null });
    });
    const adapter = adapterWith({
      media: {
        abortUpload,
        authorizeUpload,
        completeUpload,
        get: vi.fn(() => Promise.resolve({ value: null })),
        importExternal: vi.fn(),
        list: vi.fn(() => Promise.resolve({ value: { assets: [] } })),
        uploadStatus: vi.fn(),
      },
    });
    const byteTransferImplementation: StudioHostedMediaGrantTransfer['transfer'] = () =>
      Promise.resolve();
    const byteTransfer = { transfer: vi.fn(byteTransferImplementation) };
    const services = createHostedBrowserServices(
      adapter,
      configuration,
      targetResolution(),
      identifiers(),
      { currentTimeMilliseconds: () => currentTimeMilliseconds, mediaGrantTransfer: byteTransfer },
    );
    const createTransport = services.media?.uploadTransportFactory;
    if (createTransport === undefined) throw new Error('Expected an upload transport factory.');
    const upload = createTransport();
    const data = new Blob(['host-owned']);

    await expect(
      upload.authorize({
        byteSize: data.size,
        filename: 'host.txt',
        mediaType: 'text/plain',
        purpose: 'studio.media/content',
      }),
    ).resolves.toEqual({ maximumBytes: 100, resumable: false });
    await upload.transfer({ data, offset: 0, sessionId: 'local-uploads/one' });
    await expect(upload.finalize('local-uploads/one')).resolves.toEqual({
      id: 'media/host-uploads/one',
      revision: 'media-r2',
      state: 'ready',
    });

    expect(byteTransfer.transfer).toHaveBeenCalledWith(
      expect.objectContaining({ uploadId: 'host-uploads/one' }),
      expect.objectContaining({ data, offset: 0 }),
      undefined,
    );
    expect(byteTransfer.transfer.mock.calls[0]?.[1]).not.toHaveProperty('sessionId');
    expect(authorizeUpload).toHaveBeenCalledOnce();
    expect(completeUpload).toHaveBeenCalledWith(
      'host-uploads/one',
      expect.objectContaining({ operationId: 'studio.operation/media.complete-upload' }),
    );
    const cancelled = createTransport();
    await cancelled.authorize({
      byteSize: data.size,
      filename: 'cancelled.txt',
      mediaType: 'text/plain',
      purpose: 'studio.media/content',
    });
    await cancelled.abort('local-uploads/cancelled');
    expect(abortUpload).toHaveBeenCalledWith(
      'host-uploads/one',
      expect.objectContaining({ operationId: 'studio.operation/media.abort-upload' }),
    );
    expect(operations).toEqual([
      'studio.operation/media.authorize-upload',
      'studio.operation/media.complete-upload',
      'studio.operation/media.authorize-upload',
      'studio.operation/media.abort-upload',
    ]);
  });

  it('binds requested and granted sizes to the resolved session media limit', async () => {
    const requested = uploadHarness({ maximumBytes: 8 });
    const requestedTransport = requested.createTransport();
    await expect(requestedTransport.authorize(uploadRequest(9))).rejects.toThrow(
      /requested media upload exceeds.*session byte limit/u,
    );
    expect(requested.authorizeUpload).not.toHaveBeenCalled();

    const granted = uploadHarness({
      grant: grantFixture({ maximumBytes: 9 }),
      maximumBytes: 8,
    });
    const grantedTransport = granted.createTransport();
    await expect(grantedTransport.authorize(uploadRequest(4))).rejects.toThrow(
      /grant exceeds.*session byte limit/u,
    );
    expect(granted.abortUpload).toHaveBeenCalledWith(
      'host-uploads/adversarial',
      expect.objectContaining({ operationId: 'studio.operation/media.abort-upload' }),
    );
  });

  it('rejects expired and overlong grants using the authorization receipt as issuance', async () => {
    const expired = uploadHarness({
      grant: grantFixture({ expiresAt: new Date(TEST_GRANT_NOW - 1).toISOString() }),
    });
    await expect(expired.createTransport().authorize(uploadRequest(4))).rejects.toThrow(
      /expired or overlong/u,
    );
    expect(expired.abortUpload).toHaveBeenCalledOnce();

    const overlong = uploadHarness({
      grant: grantFixture({
        expiresAt: new Date(TEST_GRANT_NOW + 15 * 60 * 1_000 + 1).toISOString(),
      }),
    });
    await expect(overlong.createTransport().authorize(uploadRequest(4))).rejects.toThrow(
      /expired or overlong/u,
    );
    expect(overlong.abortUpload).toHaveBeenCalledOnce();

    const boundary = uploadHarness({
      grant: grantFixture({
        expiresAt: new Date(TEST_GRANT_NOW + 15 * 60 * 1_000).toISOString(),
      }),
    });
    const boundaryTransport = boundary.createTransport();
    await expect(boundaryTransport.authorize(uploadRequest(4))).resolves.toMatchObject({
      maximumBytes: 8,
    });
    await boundaryTransport.abort('local-uploads/boundary');
  });

  it('enforces canonical upload grant header count, name, and value bounds', async () => {
    const headerCases: readonly Record<string, string>[] = [
      { X_Upload: 'opaque' },
      { [`X${'a'.repeat(100)}`]: 'opaque' },
      { 'X-Upload': 'x'.repeat(2_001) },
      Object.fromEntries(Array.from({ length: 21 }, (_, index) => [`X-Grant-${index}`, 'x'])),
    ];
    for (const headers of headerCases) {
      const harness = uploadHarness({ grant: grantFixture({ headers }) });
      await expect(harness.createTransport().authorize(uploadRequest(4))).rejects.toThrow(
        /malformed upload grant/u,
      );
      expect(harness.abortUpload).toHaveBeenCalledOnce();
    }
  });

  it('aborts and resets after transfer failure so retry receives a fresh grant', async () => {
    const harness = uploadHarness();
    harness.byteTransfer.transfer.mockRejectedValueOnce(new Error('transfer failed'));
    harness.abortUpload.mockRejectedValueOnce(new Error('best-effort abort failed'));
    const transport = harness.createTransport();
    const chunk = { data: new Blob(['data']), offset: 0, sessionId: 'local-uploads/retry' };

    await transport.authorize(uploadRequest(chunk.data.size));
    await expect(transport.transfer(chunk)).rejects.toThrow('transfer failed');
    expect(harness.abortUpload).toHaveBeenCalledOnce();

    await transport.authorize(uploadRequest(chunk.data.size));
    await transport.transfer(chunk);
    await expect(transport.finalize(chunk.sessionId)).resolves.toMatchObject({ state: 'ready' });
    expect(harness.authorizeUpload).toHaveBeenCalledTimes(2);
    expect(harness.byteTransfer.transfer.mock.calls.map(([grant]) => grant.uploadId)).toEqual([
      'host-uploads/adversarial',
      'host-uploads/adversarial-2',
    ]);
  });

  it('aborts and resets after completion failure so retry receives a fresh grant', async () => {
    const harness = uploadHarness();
    harness.completeUpload.mockRejectedValueOnce(new Error('completion failed'));
    const transport = harness.createTransport();
    const chunk = { data: new Blob(['data']), offset: 0, sessionId: 'local-uploads/finalize' };

    await transport.authorize(uploadRequest(chunk.data.size));
    await transport.transfer(chunk);
    await expect(transport.finalize(chunk.sessionId)).rejects.toThrow('completion failed');
    expect(harness.abortUpload).toHaveBeenCalledOnce();

    await transport.authorize(uploadRequest(chunk.data.size));
    await transport.transfer(chunk);
    await expect(transport.finalize(chunk.sessionId)).resolves.toMatchObject({ state: 'ready' });
    expect(harness.completeUpload).toHaveBeenCalledTimes(2);
    expect(harness.byteTransfer.transfer.mock.calls.map(([grant]) => grant.uploadId)).toEqual([
      'host-uploads/adversarial',
      'host-uploads/adversarial-2',
    ]);
  });

  it('fails closed for HTTP preview staging or advertised upload without byte transfer', () => {
    const preview = deployment();
    preview.session.preview.enabled = true;
    preview.session.hostCapabilities.ports.push({
      id: 'studio.port/preview',
      operations: ['studio.operation/preview.cancel', 'studio.operation/preview.render'],
      version: '1.0.0',
    });
    expect(() =>
      createHostedBrowserServices(adapterWith({}), preview, targetResolution(), identifiers()),
    ).toThrow(/configured preview port can stage the complete draft/u);

    const media = deployment();
    media.session.hostCapabilities.ports.push({
      id: 'studio.port/media',
      operations: [
        'studio.operation/media.get',
        'studio.operation/media.list',
        'studio.operation/media.abort-upload',
        'studio.operation/media.authorize-upload',
        'studio.operation/media.complete-upload',
      ],
      version: '1.0.0',
    });
    expect(() =>
      createHostedBrowserServices(
        adapterWith({ media: {} as NonNullable<HostAdapter['media']> }),
        media,
        targetResolution(),
        identifiers(),
      ),
    ).toThrow(/clipboardMediaUpload is disabled/u);

    media.session.features.clipboardMediaUpload = true;
    expect(() =>
      createHostedBrowserServices(
        adapterWith({ media: {} as NonNullable<HostAdapter['media']> }),
        media,
        targetResolution(),
        identifiers(),
      ),
    ).toThrow(/precompiled grant byte transfer/u);

    const external = deployment();
    external.session.hostCapabilities.ports.push({
      id: 'studio.port/media',
      operations: [
        'studio.operation/media.get',
        'studio.operation/media.list',
        'studio.operation/media.import-external',
      ],
      version: '1.0.0',
    });
    expect(() =>
      createHostedBrowserServices(
        adapterWith({ media: {} as NonNullable<HostAdapter['media']> }),
        external,
        targetResolution(),
        identifiers(),
      ),
    ).toThrow(/externalMediaImport is disabled/u);
  });

  it('rejects request identifier reuse across authoring and hosted services', () => {
    const coordinated = coordinateHostedIdentifiers({
      idempotencyKey: () => 'ids/one',
      requestId: () => 'ids/one',
    });
    expect(coordinated.requestId('studio.operation/authoring.start')).toBe('ids/one');
    expect(() => coordinated.requestId('studio.operation/resource.search')).toThrow(/reused/u);
  });
});

interface UploadHarnessOptions {
  readonly grant?: MediaUploadGrant;
  readonly maximumBytes?: number;
}

function uploadHarness(options: UploadHarnessOptions = {}) {
  const configuration = deployment();
  configuration.session.features.clipboardMediaUpload = true;
  configuration.session.limits.maxMediaUploadBytes = options.maximumBytes ?? 8;
  configuration.session.hostCapabilities.ports.push({
    id: 'studio.port/media',
    operations: [
      'studio.operation/media.get',
      'studio.operation/media.list',
      'studio.operation/media.abort-upload',
      'studio.operation/media.authorize-upload',
      'studio.operation/media.complete-upload',
    ],
    version: '1.0.0',
  });
  const initialGrant =
    options.grant ??
    grantFixture({ maximumBytes: configuration.session.limits.maxMediaUploadBytes });
  let grantSerial = 0;
  const authorizeImplementation: NonNullable<HostAdapter['media']>['authorizeUpload'] = () => {
    grantSerial += 1;
    return Promise.resolve({
      value: {
        ...structuredClone(initialGrant),
        uploadId:
          grantSerial === 1
            ? initialGrant.uploadId
            : `${initialGrant.uploadId}-${String(grantSerial)}`,
      },
    });
  };
  const completeImplementation: NonNullable<HostAdapter['media']>['completeUpload'] = (uploadId) =>
    Promise.resolve({
      value: { id: `media/${uploadId}`, revision: 'media-r2', state: 'ready' },
    });
  const abortImplementation: NonNullable<HostAdapter['media']>['abortUpload'] = () =>
    Promise.resolve({ value: null });
  const authorizeUpload = vi.fn(authorizeImplementation);
  const completeUpload = vi.fn(completeImplementation);
  const abortUpload = vi.fn(abortImplementation);
  const transferImplementation: StudioHostedMediaGrantTransfer['transfer'] = () =>
    Promise.resolve();
  const byteTransfer = { transfer: vi.fn(transferImplementation) };
  const services = createHostedBrowserServices(
    adapterWith({
      media: {
        abortUpload,
        authorizeUpload,
        completeUpload,
        get: vi.fn(() => Promise.resolve({ value: null })),
        importExternal: vi.fn(),
        list: vi.fn(() => Promise.resolve({ value: { assets: [] } })),
        uploadStatus: vi.fn(),
      },
    }),
    configuration,
    targetResolution(),
    identifiers(),
    { currentTimeMilliseconds: () => TEST_GRANT_NOW, mediaGrantTransfer: byteTransfer },
  );
  const createTransport = services.media?.uploadTransportFactory;
  if (createTransport === undefined) throw new Error('Expected an upload transport factory.');
  return { abortUpload, authorizeUpload, byteTransfer, completeUpload, createTransport };
}

interface GrantFixtureOptions {
  readonly expiresAt?: string;
  readonly headers?: Record<string, string>;
  readonly maximumBytes?: number;
}

function grantFixture(options: GrantFixtureOptions = {}): MediaUploadGrant {
  return {
    expiresAt: options.expiresAt ?? new Date(TEST_GRANT_NOW + 5 * 60 * 1_000).toISOString(),
    ...(options.headers === undefined ? {} : { headers: options.headers }),
    method: 'PUT',
    plan: { maximumBytes: options.maximumBytes ?? 8, resumable: false },
    uploadId: 'host-uploads/adversarial',
    url: 'https://uploads.example.test/adversarial',
  };
}

function uploadRequest(byteSize: number): MediaUploadRequestDescriptor {
  return {
    byteSize,
    filename: 'adversarial.txt',
    mediaType: 'text/plain',
    purpose: 'studio.media/content',
  };
}

function deployment(): StudioHostedDeploymentConfiguration {
  const configuration = createStudioConfigurationFixture({ mode: 'content' });
  configuration.resourceContext = structuredClone(snapshot.resourceContext);
  configuration.sessionGeneration = snapshot.sessionGeneration;
  configuration.sessionId = snapshot.sessionId;
  configuration.hostCapabilities.ports = [
    {
      id: 'studio.port/authoring',
      operations: ['studio.operation/authoring.resolve-target', 'studio.operation/authoring.start'],
      version: '1.0.0',
    },
  ];
  return {
    contractVersion: STUDIO_CONTRACT_VERSION,
    instanceId: 'services-test',
    kind: 'studio-deployment',
    launch: {
      initialPresentation: 'inline',
      intent: 'edit',
      resourceContext: structuredClone(snapshot.resourceContext),
      start: { kind: 'existing' },
      targetId: snapshot.target.id,
    },
    session: configuration,
    transport: {
      authentication: {
        credentials: 'same-origin',
        csrf: { headerName: 'x-studio-csrf', token: 'csrf-test' },
        kind: 'same-origin-session',
      },
      kind: 'http',
      routing: {
        endpoints: {
          'authoring/resolve-target': '/studio/resolve-target',
          'authoring/start': '/studio/start',
        },
        kind: 'operation-map',
      },
    },
  };
}

function targetResolution(): AuthoringTargetResolution {
  return {
    availableStarts: ['existing'],
    initialPresentation: 'inline',
    resourceContext: structuredClone(snapshot.resourceContext),
    ...(snapshot.presentation.returnContext === undefined
      ? {}
      : { returnContext: structuredClone(snapshot.presentation.returnContext) }),
    target: structuredClone(snapshot.target),
  };
}

function adapterWith(overrides: Partial<HostAdapter>): HostAdapter {
  return {
    artifact: {} as HostAdapter['artifact'],
    ...overrides,
  };
}

function identifiers() {
  let serial = 0;
  return coordinateHostedIdentifiers({
    idempotencyKey: () => `ids/idempotency-${String(++serial)}`,
    requestId: () => `ids/request-${String(++serial)}`,
  });
}

function mediaAsset(): MediaAsset {
  return {
    byteSize: 12,
    contractVersion: STUDIO_CONTRACT_VERSION,
    filename: 'example.png',
    id: 'media/example',
    kind: 'media-asset',
    mediaKind: 'image',
    mediaType: 'image/png',
    metadata: { height: 10, width: 20 },
    revision: 'media-r1',
    state: 'ready',
  };
}
