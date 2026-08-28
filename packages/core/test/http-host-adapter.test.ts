import { describe, expect, it } from 'vitest';
import {
  HostPortFailure,
  STUDIO_CONTRACT_VERSION,
  STUDIO_WIRE_PROTOCOL_VERSION,
  type HostPortError,
  type HostRequestContext,
} from '@kumwe/studio-protocol';
import {
  createHttpHostAdapter,
  type HttpHostTransportConfiguration,
  type HttpRequestInit,
} from '../src/index.js';

const context: HostRequestContext = {
  operationId: 'studio.operation/model.list',
  protocolVersion: STUDIO_WIRE_PROTOCOL_VERSION,
  requestId: 'requests/configured-http',
  resourceContextKey: 'contexts/configured-http',
  sessionGeneration: 'session-r1',
};
const configuredNow = (): number => Date.parse('2029-01-01T00:00:00Z');

function sessionConfiguration(
  routing: HttpHostTransportConfiguration['routing'],
): HttpHostTransportConfiguration {
  return {
    authentication: {
      credentials: 'same-origin',
      csrf: { headerName: 'X-CSRF-Token', token: 'csrf-r1' },
      kind: 'same-origin-session',
    },
    kind: 'http',
    maximumResponseBytes: 1024,
    requestTimeoutMilliseconds: 1000,
    routing,
  };
}

function success(value = '[]'): {
  contentType: string;
  status: number;
  text(): Promise<string>;
} {
  return {
    contentType: 'application/json',
    status: 200,
    text: () => Promise.resolve(`{"value":${value}}`),
  };
}

describe('configured HTTP HostAdapter routing', () => {
  it('posts the unchanged canonical body to an exact per-operation endpoint', async () => {
    let observed: { init: HttpRequestInit; url: string } | undefined;
    const adapter = createHttpHostAdapter(
      sessionConfiguration({
        endpoints: { 'model/list': '/application/ajax/studio-models' },
        kind: 'operation-map',
      }),
      {
        currentTimeMilliseconds: configuredNow,
        fetchImplementation: (url, init) => {
          observed = { init, url };
          return Promise.resolve(success());
        },
      },
    );

    await expect(adapter.model?.list(context)).resolves.toEqual({ value: [] });
    expect(observed?.url).toBe('/application/ajax/studio-models');
    expect(JSON.parse(observed?.init.body ?? '')).toEqual({ arguments: {}, context });
    expect(observed?.init.headers).toEqual({
      accept: 'application/json',
      'content-type': 'application/json',
      'x-csrf-token': 'csrf-r1',
    });
    expect(observed?.init.credentials).toBe('same-origin');
  });

  it('uses one exact endpoint plus the fixed operation header without changing the body', async () => {
    let observed: { init: HttpRequestInit; url: string } | undefined;
    const adapter = createHttpHostAdapter(
      sessionConfiguration({ endpoint: '/application/ajax/studio', kind: 'single-endpoint' }),
      {
        currentTimeMilliseconds: configuredNow,
        fetchImplementation: (url, init) => {
          observed = { init, url };
          return Promise.resolve(success());
        },
      },
    );

    await adapter.model?.list(context);
    expect(observed?.url).toBe('/application/ajax/studio');
    expect(observed?.init.headers['x-studio-operation']).toBe('model/list');
    expect(JSON.parse(observed?.init.body ?? '')).toEqual({ arguments: {}, context });
  });

  it('fails a missing operation as incompatible without inventing a route', async () => {
    let fetchCalls = 0;
    const adapter = createHttpHostAdapter(
      sessionConfiguration({
        endpoints: { 'authoring/start': '/application/ajax/studio-start' },
        kind: 'operation-map',
      }),
      {
        currentTimeMilliseconds: configuredNow,
        fetchImplementation: () => {
          fetchCalls += 1;
          return Promise.resolve(success());
        },
      },
    );

    const failure = await hostFailure(adapter.model?.list(context));
    expect(failure.error).toMatchObject({
      category: 'incompatible',
      message: { key: 'studio.transport/http-route-unavailable' },
      retryable: false,
    });
    expect(fetchCalls).toBe(0);
  });

  it('keeps a configured server refusal authoritative and does not fall back', async () => {
    let fetchCalls = 0;
    const adapter = createHttpHostAdapter(
      sessionConfiguration({
        endpoints: { 'model/list': '/application/ajax/studio-models' },
        kind: 'operation-map',
      }),
      {
        currentTimeMilliseconds: configuredNow,
        fetchImplementation: () => {
          fetchCalls += 1;
          return Promise.resolve({
            contentType: 'application/json',
            status: 403,
            text: () => Promise.resolve('{"denied":true}'),
          });
        },
      },
    );

    const failure = await hostFailure(adapter.model?.list(context));
    expect(failure.error.category).toBe('forbidden');
    expect(fetchCalls).toBe(1);
  });
});

describe('configured HTTP HostAdapter authentication', () => {
  it('resolves fresh short-lived bearer material for every request', async () => {
    const observed: HttpRequestInit[] = [];
    let serial = 0;
    const configuration: HttpHostTransportConfiguration = {
      authentication: {
        credentials: 'omit',
        expiresAt: '2029-01-01T00:10:00Z',
        issuedAt: '2029-01-01T00:00:00Z',
        kind: 'bearer-token',
        token: 'example',
      },
      kind: 'http',
      routing: { endpoint: '/application/ajax/studio', kind: 'single-endpoint' },
    };
    const adapter = createHttpHostAdapter(configuration, {
      currentTimeMilliseconds: configuredNow,
      fetchImplementation: (_url, init) => {
        observed.push(init);
        return Promise.resolve(success());
      },
      resolveAuthentication: () => {
        serial += 1;
        return Promise.resolve({
          credentials: 'omit',
          expiresAt: '2029-01-01T00:10:00Z',
          issuedAt: '2029-01-01T00:00:00Z',
          kind: 'bearer-token',
          token: `request-token-${serial}`,
        });
      },
    });

    await adapter.model?.list(context);
    await adapter.model?.list({ ...context, requestId: 'requests/configured-http-2' });
    expect(observed.map((entry) => entry.headers.authorization)).toEqual([
      'Bearer request-token-1',
      'Bearer request-token-2',
    ]);
    expect(observed.every((entry) => entry.credentials === 'omit')).toBe(true);
  });

  it('refuses expired static authentication before any fetch', async () => {
    let fetchCalls = 0;
    const adapter = createHttpHostAdapter(
      {
        authentication: {
          credentials: 'omit',
          expiresAt: '2000-01-01T00:00:00Z',
          issuedAt: '1999-12-31T23:50:00Z',
          kind: 'bearer-token',
          token: 'expired',
        },
        kind: 'http',
        routing: {
          endpoints: { 'model/list': '/application/ajax/studio-models' },
          kind: 'operation-map',
        },
      },
      {
        currentTimeMilliseconds: configuredNow,
        fetchImplementation: () => {
          fetchCalls += 1;
          return Promise.resolve(success());
        },
      },
    );

    const failure = await hostFailure(adapter.model?.list(context));
    expect(failure.error).toMatchObject({
      category: 'unauthenticated',
      message: { key: 'studio.transport/http-authentication-invalid-lifetime' },
      retryable: false,
    });
    expect(fetchCalls).toBe(0);
  });

  it('also refuses expired authentication returned by the refresh hook', async () => {
    let fetchCalls = 0;
    const adapter = createHttpHostAdapter(
      {
        authentication: {
          credentials: 'omit',
          expiresAt: '2029-01-01T00:10:00Z',
          issuedAt: '2029-01-01T00:00:00Z',
          kind: 'bearer-token',
          token: 'example',
        },
        kind: 'http',
        routing: { endpoint: '/application/ajax/studio', kind: 'single-endpoint' },
      },
      {
        currentTimeMilliseconds: configuredNow,
        fetchImplementation: () => {
          fetchCalls += 1;
          return Promise.resolve(success());
        },
        resolveAuthentication: () => ({
          credentials: 'omit',
          expiresAt: '2000-01-01T00:00:00Z',
          headerName: 'X-Studio-Token',
          issuedAt: '1999-12-31T23:50:00Z',
          kind: 'header-token',
          token: 'expired',
        }),
      },
    );

    const failure = await hostFailure(adapter.model?.list(context));
    expect(failure.error.message.key).toBe('studio.transport/http-authentication-invalid-lifetime');
    expect(fetchCalls).toBe(0);
  });

  it('refuses a future-issued token before any fetch', async () => {
    let fetchCalls = 0;
    const adapter = createHttpHostAdapter(
      {
        authentication: {
          credentials: 'omit',
          expiresAt: '2029-01-01T00:11:00Z',
          issuedAt: '2029-01-01T00:01:00Z',
          kind: 'bearer-token',
          token: 'future',
        },
        kind: 'http',
        routing: { endpoint: '/application/ajax/studio', kind: 'single-endpoint' },
      },
      {
        currentTimeMilliseconds: configuredNow,
        fetchImplementation: () => {
          fetchCalls += 1;
          return Promise.resolve(success());
        },
      },
    );

    const failure = await hostFailure(adapter.model?.list(context));
    expect(failure.error.message.key).toBe('studio.transport/http-authentication-invalid-lifetime');
    expect(fetchCalls).toBe(0);
  });

  it.each([
    {
      expiresAt: '2029-01-01T00:15:00.000000001Z',
      issuedAt: '2029-01-01T00:00:00Z',
      name: 'overlong',
    },
    {
      expiresAt: '2029-01-01T00:10:00Z',
      issuedAt: 'not-an-instant',
      name: 'malformed',
    },
  ])('rejects $name token lifetime metadata during adapter construction', (lifetime) => {
    let fetchCalls = 0;
    expect(() =>
      createHttpHostAdapter(
        {
          authentication: {
            credentials: 'omit',
            expiresAt: lifetime.expiresAt,
            issuedAt: lifetime.issuedAt,
            kind: 'bearer-token',
            token: 'invalid',
          },
          kind: 'http',
          routing: { endpoint: '/application/ajax/studio', kind: 'single-endpoint' },
        },
        {
          currentTimeMilliseconds: configuredNow,
          fetchImplementation: () => {
            fetchCalls += 1;
            return Promise.resolve(success());
          },
        },
      ),
    ).toThrow();
    expect(fetchCalls).toBe(0);
  });

  it('rejects header values that cannot be Web IDL ByteStrings', () => {
    expect(() =>
      createHttpHostAdapter(
        {
          authentication: {
            credentials: 'omit',
            expiresAt: '2029-01-01T00:10:00Z',
            headerName: 'X-Studio-Token',
            issuedAt: '2029-01-01T00:00:00Z',
            kind: 'header-token',
            token: '\u0100',
          },
          kind: 'http',
          routing: { endpoint: '/application/ajax/studio', kind: 'single-endpoint' },
        },
        {
          currentTimeMilliseconds: configuredNow,
          fetchImplementation: () => Promise.resolve(success()),
        },
      ),
    ).toThrow(TypeError);
  });

  it.each([
    'Authorization',
    'ACCEPT',
    'Content-Type',
    'Origin',
    'Sec-Fetch-Site',
    'Proxy-Authorization',
    'X-Forwarded-For',
    'X-Studio-Operation',
  ])('rejects reserved custom authentication header %s case-insensitively', (headerName) => {
    expect(() =>
      createHttpHostAdapter(
        {
          authentication: {
            credentials: 'omit',
            expiresAt: '2029-01-01T00:10:00Z',
            headerName,
            issuedAt: '2029-01-01T00:00:00Z',
            kind: 'header-token',
            token: 'example',
          },
          kind: 'http',
          routing: { endpoint: '/application/ajax/studio', kind: 'single-endpoint' },
        },
        {
          currentTimeMilliseconds: configuredNow,
          fetchImplementation: () => Promise.resolve(success()),
        },
      ),
    ).toThrow(/safe custom HTTP field name/u);
  });

  it('bounds asynchronous authentication refresh by the request deadline', async () => {
    let fetchCalls = 0;
    const adapter = createHttpHostAdapter(
      {
        authentication: {
          credentials: 'omit',
          expiresAt: '2029-01-01T00:10:00Z',
          issuedAt: '2029-01-01T00:00:00Z',
          kind: 'bearer-token',
          token: 'example',
        },
        kind: 'http',
        requestTimeoutMilliseconds: 100,
        routing: { endpoint: '/application/ajax/studio', kind: 'single-endpoint' },
      },
      {
        createTimeoutSignal: () => {
          const controller = new AbortController();
          const timer = setTimeout(() => {
            const error = new Error('test deadline');
            error.name = 'TimeoutError';
            controller.abort(error);
          }, 5);
          return {
            release: () => clearTimeout(timer),
            signal: controller.signal,
          };
        },
        currentTimeMilliseconds: configuredNow,
        fetchImplementation: () => {
          fetchCalls += 1;
          return Promise.resolve(success());
        },
        resolveAuthentication: () => new Promise(() => undefined),
      },
    );

    const failure = await hostFailure(adapter.model?.list(context));
    expect(failure.error).toMatchObject({
      category: 'unavailable',
      message: { key: 'studio.transport/http-timeout' },
      retryable: true,
    });
    expect(fetchCalls).toBe(0);
  });
});

describe('configured HTTP HostAdapter response integrity', () => {
  it.each([
    { body: '{"value":[]}', status: 200 },
    { body: JSON.stringify(canonicalHostError('forbidden', false)), status: 403 },
  ])('requires an explicit JSON Content-Type on a $status response', async ({ body, status }) => {
    for (const contentType of [undefined, 'text/plain'] as const) {
      const adapter = createHttpHostAdapter(
        sessionConfiguration({ endpoint: '/application/ajax/studio', kind: 'single-endpoint' }),
        {
          currentTimeMilliseconds: configuredNow,
          fetchImplementation: () =>
            Promise.resolve({
              ...(contentType === undefined ? {} : { contentType }),
              status,
              text: () => Promise.resolve(body),
            }),
        },
      );

      const failure = await hostFailure(adapter.model?.list(context));
      expect(failure.error).toMatchObject({
        category: 'internal',
        message: { key: 'studio.transport/http-malformed-response' },
        retryable: false,
      });
    }
  });

  it.each(['{"value":[],"value":[1]}', `${'['.repeat(65)}null${']'.repeat(65)}`])(
    'rejects ambiguous or over-depth success JSON',
    async (body) => {
      const adapter = adapterResponding(200, body);
      const failure = await hostFailure(adapter.model?.list(context));
      expect(failure.error.message.key).toBe('studio.transport/http-malformed-response');
    },
  );

  it.each([
    {
      ...canonicalHostError('forbidden', false),
      revision: 'host-r2',
    },
    {
      ...canonicalHostError('forbidden', false),
      retryAfterMilliseconds: 1000,
    },
    {
      ...canonicalHostError('rate-limited', false),
      retryAfterMilliseconds: 1000,
    },
  ])('rejects a structurally valid HostFailure with invalid field semantics', async (error) => {
    const adapter = adapterResponding(409, JSON.stringify(error));
    const failure = await hostFailure(adapter.model?.list(context));
    expect(failure.error.message.key).toBe('studio.transport/http-malformed-response');
  });

  it('preserves a canonical conflict failure even when timeout cleanup throws', async () => {
    const expected: HostPortError = {
      ...canonicalHostError('conflict', false),
      revision: 'host-r2',
    };
    const adapter = createHttpHostAdapter(
      sessionConfiguration({ endpoint: '/application/ajax/studio', kind: 'single-endpoint' }),
      {
        createTimeoutSignal: () => ({
          release: () => {
            throw new Error('cleanup failed');
          },
          signal: {},
        }),
        currentTimeMilliseconds: configuredNow,
        fetchImplementation: () =>
          Promise.resolve({
            contentType: 'application/json',
            status: 409,
            text: () => Promise.resolve(JSON.stringify(expected)),
          }),
      },
    );

    const failure = await hostFailure(adapter.model?.list(context));
    expect(failure.error).toEqual(expected);
  });

  it('transports retry guidance only for a retryable rate limit', async () => {
    const expected: HostPortError = {
      ...canonicalHostError('rate-limited', true),
      retryAfterMilliseconds: 1000,
    };
    const adapter = adapterResponding(429, JSON.stringify(expected));
    const failure = await hostFailure(adapter.model?.list(context));
    expect(failure.error).toEqual(expected);
  });
});

describe('configured HTTP endpoint normalization guards', () => {
  it.each([
    '/application /ajax/studio',
    '/application/../ajax/studio',
    '/application/%2e%2e/ajax/studio',
    '/application//ajax/studio',
    '/application/%2fajax/studio',
    'https://Studio.example.test/ajax/studio',
    'https://studio.example.test/ajax\\studio',
  ])('rejects ambiguous endpoint %s', (endpoint) => {
    expect(() =>
      createHttpHostAdapter(sessionConfiguration({ endpoint, kind: 'single-endpoint' }), {
        currentTimeMilliseconds: configuredNow,
        fetchImplementation: () => Promise.resolve(success()),
      }),
    ).toThrow(TypeError);
  });
});

async function hostFailure(operation: Promise<unknown> | undefined): Promise<HostPortFailure> {
  if (operation === undefined) {
    throw new Error('The configured adapter must expose the requested port.');
  }
  try {
    await operation;
  } catch (error) {
    expect(error).toBeInstanceOf(HostPortFailure);
    return error as HostPortFailure;
  }
  throw new Error('Expected the HTTP operation to fail.');
}

function canonicalHostError(
  category: HostPortError['category'],
  retryable: boolean,
): HostPortError {
  return {
    category,
    contractVersion: STUDIO_CONTRACT_VERSION,
    kind: 'host-error',
    message: { defaultMessage: 'The host rejected the operation.', key: 'studio.test/host-error' },
    retryable,
  };
}

function adapterResponding(status: number, body: string): ReturnType<typeof createHttpHostAdapter> {
  return createHttpHostAdapter(
    sessionConfiguration({ endpoint: '/application/ajax/studio', kind: 'single-endpoint' }),
    {
      currentTimeMilliseconds: configuredNow,
      fetchImplementation: () =>
        Promise.resolve({
          contentType: 'application/json',
          status,
          text: () => Promise.resolve(body),
        }),
    },
  );
}
