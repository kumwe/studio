import { describe, expect, it } from 'vitest';
import {
  HostPortFailure,
  STUDIO_STALE_SESSION_GENERATION_DIAGNOSTIC_CODE,
  type BlueprintDocument,
  type HostAdapter,
  type HostPortResult,
  type HostRequestContext,
  type QualifiedName,
  type ResourcePort,
  type ResourceSearchPage,
  type ResourceSearchQuery,
  type StudioConfiguration,
} from '@kumwe/studio-protocol';
import {
  createBlueprintFixture,
  createStudioConfigurationFixture,
  createTestbedHost,
} from '@kumwe/studio-testkit';
import { openStudioSession, type StudioHostSessionIdentifierFactories } from '../src/index.js';

const ARTIFACT_LOAD: QualifiedName = 'studio.operation/artifact.load';
const ARTIFACT_SAVE: QualifiedName = 'studio.operation/artifact.save';
const RESOURCE_SEARCH: QualifiedName = 'studio.operation/resource.search';
const RESOURCE_TYPE: QualifiedName = 'studio.resource/product';

interface IdentifierProbe {
  factories: StudioHostSessionIdentifierFactories;
  operations: QualifiedName[];
}

function identifierProbe(): IdentifierProbe {
  const operations: QualifiedName[] = [];
  let serial = 0;
  return {
    factories: {
      idempotencyKey(operationId): string {
        return `idempotency/${operationId.replaceAll('/', '-')}`;
      },
      requestId(operationId): string {
        operations.push(operationId);
        serial += 1;
        return `requests/resource-session-${String(serial)}`;
      },
    },
    operations,
  };
}

function configurationFor(
  blueprint: BlueprintDocument,
  options: {
    resource?: boolean;
    resourceOperations?: QualifiedName[];
    sessionGeneration?: string;
  } = {},
): StudioConfiguration {
  const configuration = createStudioConfigurationFixture();
  configuration.artifacts.blueprint = {
    id: blueprint.id,
    revision: blueprint.revision,
    version: blueprint.version,
  };
  configuration.sessionGeneration = options.sessionGeneration ?? 'session-r1';
  configuration.hostCapabilities.ports = [
    {
      id: 'studio.port/artifact',
      operations: [ARTIFACT_LOAD, ARTIFACT_SAVE],
      version: '1.0.0',
    },
    ...(options.resource === false
      ? []
      : [
          {
            id: 'studio.port/resource' as const,
            operations: options.resourceOperations ?? [RESOURCE_SEARCH],
            version: '1.0.0',
          },
        ]),
  ];
  return configuration;
}

describe('host-session resource discovery surface', () => {
  it('searches with canonical read contexts and returns detached matched resources', async () => {
    const blueprint = createBlueprintFixture({ id: 'resources.blueprint' });
    const testbed = createTestbedHost({
      documents: [blueprint],
      sessionGeneration: 'session-r1',
    });
    const adapterPage: ResourceSearchPage = {
      items: [
        {
          id: 'products/one',
          label: { defaultMessage: 'Product one', key: 'studio.test/product-one' },
          resourceType: RESOURCE_TYPE,
        },
        {
          id: 'products/two',
          label: { defaultMessage: 'Product two', key: 'studio.test/product-two' },
          resourceType: RESOURCE_TYPE,
        },
      ],
    };
    let capturedContext: HostRequestContext | undefined;
    let capturedQuery: ResourceSearchQuery | undefined;
    const resource: ResourcePort = {
      search(query, context) {
        capturedQuery = query;
        capturedContext = context;
        return Promise.resolve({ value: adapterPage });
      },
    };
    const identifiers = identifierProbe();
    const configuration = configurationFor(blueprint);
    const handle = await openStudioSession(
      { ...testbed.host, resource },
      { configuration, identifiers: identifiers.factories },
    );
    const resources = handle.resources;
    if (resources === undefined) {
      throw new Error('The complete advertised resource port must be bound.');
    }

    const query: ResourceSearchQuery = { limit: 2, resourceType: RESOURCE_TYPE, search: 'product' };
    const first = await resources.search(query);
    query.search = 'caller mutation';

    expect(capturedQuery).toEqual({
      limit: 2,
      resourceType: RESOURCE_TYPE,
      search: 'product',
    });
    expect(capturedContext).toEqual({
      locale: configuration.locale.resolved,
      operationId: RESOURCE_SEARCH,
      protocolVersion: configuration.protocolVersion,
      requestId: 'requests/resource-session-2',
      resourceContextKey: configuration.resourceContext.key,
      sessionGeneration: configuration.sessionGeneration,
    });
    expect(first.value.items.map((item) => item.id)).toEqual(['products/one', 'products/two']);
    const mutableFirst = first.value.items[0];
    if (mutableFirst !== undefined) {
      mutableFirst.label.defaultMessage = 'caller mutation';
    }
    expect(adapterPage.items[0]?.label.defaultMessage).toBe('Product one');

    expect((await resources.search({ limit: 2, resourceType: RESOURCE_TYPE })).value.items).toEqual(
      [
        {
          id: 'products/one',
          label: { defaultMessage: 'Product one', key: 'studio.test/product-one' },
          resourceType: RESOURCE_TYPE,
        },
        {
          id: 'products/two',
          label: { defaultMessage: 'Product two', key: 'studio.test/product-two' },
          resourceType: RESOURCE_TYPE,
        },
      ],
    );
    expect(identifiers.operations).toEqual([ARTIFACT_LOAD, RESOURCE_SEARCH, RESOURCE_SEARCH]);
  });

  it('refuses malformed caller queries before allocating a request or calling the adapter', async () => {
    const blueprint = createBlueprintFixture({ id: 'invalid-resource-query.blueprint' });
    const testbed = createTestbedHost({ documents: [blueprint] });
    let calls = 0;
    const resource: ResourcePort = {
      search() {
        calls += 1;
        return Promise.resolve({ value: { items: [] } });
      },
    };
    const identifiers = identifierProbe();
    const handle = await openStudioSession(
      { ...testbed.host, resource },
      { configuration: configurationFor(blueprint), identifiers: identifiers.factories },
    );
    const attempts = identifiers.operations.length;
    const invalidQueries: unknown[] = [
      { limit: 0, resourceType: RESOURCE_TYPE },
      { limit: 101, resourceType: RESOURCE_TYPE },
      { limit: 1.5, resourceType: RESOURCE_TYPE },
      { limit: 1, resourceType: 'not-qualified' },
      { cursor: '', limit: 1, resourceType: RESOURCE_TYPE },
      { cursor: 'x'.repeat(501), limit: 1, resourceType: RESOURCE_TYPE },
      { limit: 1, resourceType: RESOURCE_TYPE, search: 'x'.repeat(501) },
      { limit: 1, privateHint: true, resourceType: RESOURCE_TYPE },
    ];

    for (const query of invalidQueries) {
      await expect(handle.resources?.search(query as ResourceSearchQuery)).rejects.toMatchObject({
        code: 'invalid-resource-query',
      });
    }
    expect(calls).toBe(0);
    expect(identifiers.operations).toHaveLength(attempts);
  });

  it('maps malformed, cross-type, duplicate, and oversized pages to a safe failure', async () => {
    const pages: unknown[] = [
      {
        items: [
          {
            id: 'articles/one',
            label: { key: 'studio.test/article-one' },
            resourceType: 'studio.resource/article',
          },
        ],
      },
      {
        items: [
          { id: 'products/one', label: { key: 'studio.test/one' }, resourceType: RESOURCE_TYPE },
          { id: 'products/one', label: { key: 'studio.test/two' }, resourceType: RESOURCE_TYPE },
        ],
      },
      {
        items: [{ id: 'bad id', label: { key: 'studio.test/one' }, resourceType: RESOURCE_TYPE }],
      },
      {
        items: [
          { id: 'products/one', label: { key: 'not-qualified' }, resourceType: RESOURCE_TYPE },
        ],
      },
      {
        items: [
          {
            id: 'products/one',
            label: { defaultMessage: '', key: 'studio.test/one' },
            resourceType: RESOURCE_TYPE,
          },
        ],
      },
      { items: [], nextCursor: '' },
      { items: [], privateHint: true },
      {
        items: [
          { id: 'products/one', label: { key: 'studio.test/one' }, resourceType: RESOURCE_TYPE },
          { id: 'products/two', label: { key: 'studio.test/two' }, resourceType: RESOURCE_TYPE },
        ],
      },
    ];

    for (const page of pages) {
      const blueprint = createBlueprintFixture({ id: 'unsafe-resource.blueprint' });
      const testbed = createTestbedHost({ documents: [blueprint] });
      const resource: ResourcePort = {
        search: () => Promise.resolve({ value: page } as HostPortResult<ResourceSearchPage>),
      };
      const handle = await openStudioSession(
        { ...testbed.host, resource },
        { configuration: configurationFor(blueprint), identifiers: identifierProbe().factories },
      );

      let caught: unknown;
      try {
        await handle.resources?.search({ limit: 1, resourceType: RESOURCE_TYPE });
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(HostPortFailure);
      expect(caught).toMatchObject({
        error: {
          category: 'internal',
          diagnostics: [{ code: 'studio.host/unexpected-resource-result' }],
          retryable: false,
        },
      });
    }
  });

  it('degrades absent operations and adapters through optional-port diagnostics', async () => {
    const blueprint = createBlueprintFixture({ id: 'degraded-resource.blueprint' });
    const testbed = createTestbedHost({ documents: [blueprint] });

    const incomplete = await openStudioSession(testbed.host, {
      configuration: configurationFor(blueprint, { resourceOperations: [] }),
      identifiers: identifierProbe().factories,
    });
    expect(incomplete.resources).toBeUndefined();
    expect(incomplete.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'studio.host/missing-optional-operation',
        parameters: { operationId: RESOURCE_SEARCH },
      }),
    );

    const adapter: HostAdapter = { artifact: testbed.host.artifact };
    const unimplemented = await openStudioSession(adapter, {
      configuration: configurationFor(blueprint),
      identifiers: identifierProbe().factories,
    });
    expect(unimplemented.resources).toBeUndefined();
    expect(unimplemented.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'studio.host/adapter-port-unavailable',
        parameters: { port: 'studio.port/resource' },
      }),
    );

    const absent = await openStudioSession(testbed.host, {
      configuration: configurationFor(blueprint, { resource: false }),
      identifiers: identifierProbe().factories,
      optionalPorts: ['studio.port/resource'],
    });
    expect(absent.resources).toBeUndefined();
    expect(absent.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'studio.host/missing-optional-port',
        parameters: { port: 'studio.port/resource' },
      }),
    );
  });

  it('invalidates resource reads on stale generation and refuses later host calls', async () => {
    const blueprint = createBlueprintFixture({ id: 'stale-resource.blueprint' });
    const testbed = createTestbedHost({ documents: [blueprint] });
    const identifiers = identifierProbe();
    const handle = await openStudioSession(testbed.host, {
      configuration: configurationFor(blueprint, {
        sessionGeneration: testbed.controls.sessionGeneration,
      }),
      identifiers: identifiers.factories,
    });
    testbed.controls.setPermissions([]);

    let stale: unknown;
    try {
      await handle.resources?.search({ limit: 10, resourceType: RESOURCE_TYPE });
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
    const attempts = identifiers.operations.length;
    await expect(handle.resources?.search({ limit: 10, resourceType: RESOURCE_TYPE })).rejects.toBe(
      stale,
    );
    expect(identifiers.operations).toHaveLength(attempts);
  });
});
