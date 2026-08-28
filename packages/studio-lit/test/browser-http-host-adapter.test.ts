import { describe, expect, it } from 'vitest';
import {
  HostPortFailure,
  STUDIO_WIRE_PROTOCOL_VERSION,
  type HostRequestContext,
} from '@kumwe/studio-protocol';
import type { HttpHostTransportConfiguration } from '@kumwe/studio-core';
import { createBrowserHttpHostAdapter } from '../src/http.js';

const context: HostRequestContext = {
  operationId: 'studio.operation/model.list',
  protocolVersion: STUDIO_WIRE_PROTOCOL_VERSION,
  requestId: 'requests/browser-http',
  resourceContextKey: 'contexts/browser-http',
  sessionGeneration: 'session-r1',
};
const secureBrowserLocation = {
  href: 'https://admin.example.test/workspace',
  origin: 'https://admin.example.test',
} as const;

function sessionConfiguration(
  routing: HttpHostTransportConfiguration['routing'],
  overrides: Partial<HttpHostTransportConfiguration> = {},
): HttpHostTransportConfiguration {
  return {
    authentication: {
      credentials: 'same-origin',
      csrf: { headerName: 'X-CSRF-Token', token: 'csrf-r1' },
      kind: 'same-origin-session',
    },
    kind: 'http',
    routing,
    ...overrides,
  };
}

describe('createBrowserHttpHostAdapter', () => {
  it('supplies safe browser fetch defaults and the public HostAdapter surface', async () => {
    let observed: RequestInit | undefined;
    const adapter = createBrowserHttpHostAdapter(
      sessionConfiguration({ endpoint: '/studio-api', kind: 'single-endpoint' }),
      {
        browserLocation: secureBrowserLocation,
        fetchImplementation: (_input, init) => {
          observed = init;
          return Promise.resolve(
            new Response('{"value":[]}', {
              headers: { 'content-type': 'application/json' },
              status: 200,
            }),
          );
        },
      },
    );
    await expect(adapter.model?.list(context)).resolves.toEqual({ value: [] });
    expect(observed).toMatchObject({
      cache: 'no-store',
      credentials: 'same-origin',
      method: 'POST',
      redirect: 'error',
    });
  });

  it.each([
    { contentType: undefined, status: 200 },
    { contentType: 'text/plain', status: 200 },
    { contentType: undefined, status: 403 },
    { contentType: 'text/html', status: 403 },
  ])(
    'rejects a $status browser response with Content-Type $contentType',
    async ({ contentType, status }) => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{"value":[]}'));
          controller.close();
        },
      });
      const adapter = createBrowserHttpHostAdapter(
        sessionConfiguration({ endpoint: '/studio-api', kind: 'single-endpoint' }),
        {
          browserLocation: secureBrowserLocation,
          fetchImplementation: () =>
            Promise.resolve(
              new Response(body, {
                ...(contentType === undefined ? {} : { headers: { 'content-type': contentType } }),
                status,
              }),
            ),
        },
      );

      const failure = await hostFailure(adapter.model?.list(context));
      expect(failure.error).toMatchObject({
        category: 'internal',
        message: { key: 'studio.transport/http-malformed-response' },
      });
    },
  );

  it.each([
    {
      endpoint: 'https://attacker.example.test/studio',
      kind: 'single-endpoint' as const,
    },
    {
      endpoints: {
        'model/list': 'https://attacker.example.test/studio-models',
      },
      kind: 'operation-map' as const,
    },
  ])('refuses cross-origin $kind routing before exposing session or CSRF material', (routing) => {
    let fetchCalls = 0;
    expect(() =>
      createBrowserHttpHostAdapter(
        {
          authentication: {
            credentials: 'same-origin',
            csrf: { headerName: 'X-CSRF-Token', token: 'private' },
            kind: 'same-origin-session',
          },
          kind: 'http',
          routing,
        },
        {
          browserLocation: secureBrowserLocation,
          fetchImplementation: () => {
            fetchCalls += 1;
            return Promise.resolve(new Response('{"value":[]}'));
          },
        },
      ),
    ).toThrow(/document origin/u);
    expect(fetchCalls).toBe(0);
  });

  it('resolves same-origin endpoint references against the injected document base', async () => {
    let observedUrl = '';
    const adapter = createBrowserHttpHostAdapter(
      {
        authentication: {
          credentials: 'same-origin',
          csrf: { headerName: 'X-CSRF-Token', token: 'csrf-r1' },
          kind: 'same-origin-session',
        },
        kind: 'http',
        routing: {
          endpoints: { 'model/list': 'ajax/studio-models?format=json' },
          kind: 'operation-map',
        },
      },
      {
        browserLocation: {
          href: 'https://admin.example.test/extensions/editor/',
          origin: 'https://admin.example.test',
        },
        fetchImplementation: (url) => {
          observedUrl = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
          return Promise.resolve(
            new Response('{"value":[]}', {
              headers: { 'content-type': 'application/json' },
              status: 200,
            }),
          );
        },
      },
    );

    await adapter.model?.list(context);
    expect(observedUrl).toBe(
      'https://admin.example.test/extensions/editor/ajax/studio-models?format=json',
    );
  });

  it('uses the browser clock to refuse an expired configured token before fetch', async () => {
    let fetchCalls = 0;
    const adapter = createBrowserHttpHostAdapter(
      {
        authentication: {
          credentials: 'omit',
          expiresAt: '2000-01-01T00:00:00Z',
          issuedAt: '1999-12-31T23:50:00Z',
          kind: 'bearer-token',
          token: 'expired',
        },
        kind: 'http',
        routing: { endpoint: '/studio', kind: 'single-endpoint' },
      },
      {
        browserLocation: secureBrowserLocation,
        currentTimeMilliseconds: () => Date.parse('2029-01-01T00:00:00Z'),
        fetchImplementation: () => {
          fetchCalls += 1;
          return Promise.resolve(new Response('{"value":[]}'));
        },
      },
    );

    const failure = await hostFailure(adapter.model?.list(context));
    expect(failure.error.message.key).toBe('studio.transport/http-authentication-invalid-lifetime');
    expect(fetchCalls).toBe(0);
  });

  it('uses the browser clock to refuse a future-issued token before fetch', async () => {
    let fetchCalls = 0;
    const adapter = createBrowserHttpHostAdapter(
      {
        authentication: {
          credentials: 'omit',
          expiresAt: '2029-01-01T00:11:00Z',
          issuedAt: '2029-01-01T00:01:00Z',
          kind: 'bearer-token',
          token: 'future',
        },
        kind: 'http',
        routing: { endpoint: '/studio', kind: 'single-endpoint' },
      },
      {
        browserLocation: secureBrowserLocation,
        currentTimeMilliseconds: () => Date.parse('2029-01-01T00:00:00Z'),
        fetchImplementation: () => {
          fetchCalls += 1;
          return Promise.resolve(new Response('{"value":[]}'));
        },
      },
    );

    const failure = await hostFailure(adapter.model?.list(context));
    expect(failure.error.message.key).toBe('studio.transport/http-authentication-invalid-lifetime');
    expect(fetchCalls).toBe(0);
  });

  it('does not leak dynamically refreshed session material to a token-configured cross-origin route', async () => {
    let fetchCalls = 0;
    const adapter = createBrowserHttpHostAdapter(
      {
        authentication: {
          credentials: 'omit',
          expiresAt: '2029-01-01T00:10:00Z',
          issuedAt: '2029-01-01T00:00:00Z',
          kind: 'bearer-token',
          token: 'example',
        },
        kind: 'http',
        routing: { endpoint: 'https://api.example.test/studio', kind: 'single-endpoint' },
      },
      {
        browserLocation: secureBrowserLocation,
        currentTimeMilliseconds: () => Date.parse('2029-01-01T00:00:00Z'),
        fetchImplementation: () => {
          fetchCalls += 1;
          return Promise.resolve(new Response('{"value":[]}'));
        },
        resolveAuthentication: () => ({
          credentials: 'same-origin',
          csrf: { headerName: 'X-CSRF-Token', token: 'private' },
          kind: 'same-origin-session',
        }),
      },
    );

    const failure = await hostFailure(adapter.model?.list(context));
    expect(failure.error.message.key).toBe('studio.transport/http-authentication-unavailable');
    expect(fetchCalls).toBe(0);
  });

  it('keeps the deadline active while a response body is still streaming', async () => {
    const adapter = createBrowserHttpHostAdapter(
      sessionConfiguration(
        { endpoint: '/studio-api', kind: 'single-endpoint' },
        { requestTimeoutMilliseconds: 100 },
      ),
      {
        browserLocation: secureBrowserLocation,
        fetchImplementation: (_input, init) => {
          let controller: ReadableStreamDefaultController<Uint8Array>;
          const body = new ReadableStream<Uint8Array>({
            start(value) {
              controller = value;
              value.enqueue(new TextEncoder().encode('{"value":'));
            },
          });
          init?.signal?.addEventListener('abort', () => controller.error(init.signal?.reason), {
            once: true,
          });
          return Promise.resolve(
            new Response(body, { headers: { 'content-type': 'application/json' }, status: 200 }),
          );
        },
      },
    );
    const failure = await hostFailure(adapter.model?.list(context));
    expect(failure.error).toMatchObject({
      category: 'unavailable',
      message: { key: 'studio.transport/http-timeout' },
      retryable: true,
    });
  });

  it('stops streaming a response when the byte ceiling is crossed', async () => {
    const adapter = createBrowserHttpHostAdapter(
      sessionConfiguration(
        { endpoint: '/studio-api', kind: 'single-endpoint' },
        { maximumResponseBytes: 1024 },
      ),
      {
        browserLocation: secureBrowserLocation,
        fetchImplementation: () =>
          Promise.resolve(
            new Response(
              new ReadableStream<Uint8Array>({
                start(controller) {
                  controller.enqueue(new Uint8Array(1025));
                  controller.close();
                },
              }),
              { headers: { 'content-type': 'application/json' }, status: 200 },
            ),
          ),
      },
    );
    const failure = await hostFailure(adapter.model?.list(context));
    expect(failure.error).toMatchObject({
      category: 'limit-exceeded',
      message: { key: 'studio.transport/http-response-too-large' },
      retryable: false,
    });
  });

  it('cancels the response reader when fatal UTF-8 decoding rejects', async () => {
    let cancelled = false;
    const adapter = createBrowserHttpHostAdapter(
      sessionConfiguration({ endpoint: '/studio-api', kind: 'single-endpoint' }),
      {
        browserLocation: secureBrowserLocation,
        fetchImplementation: () =>
          Promise.resolve(
            new Response(
              new ReadableStream<Uint8Array>({
                cancel() {
                  cancelled = true;
                },
                start(controller) {
                  controller.enqueue(Uint8Array.from([0xc3, 0x28]));
                },
              }),
              { headers: { 'content-type': 'application/json' }, status: 200 },
            ),
          ),
      },
    );

    const failure = await hostFailure(adapter.model?.list(context));
    expect(failure.error).toMatchObject({
      category: 'internal',
      message: { key: 'studio.transport/http-malformed-response' },
      retryable: false,
    });
    expect(cancelled).toBe(true);
  });

  it('ignores a hostile cross-origin base element and keeps CSRF on the actual origin', async () => {
    const base = document.createElement('base');
    base.href = 'https://attacker.example.test/capture/';
    document.head.append(base);
    let observed: { headers: HeadersInit | undefined; url: string } | undefined;
    try {
      const adapter = createBrowserHttpHostAdapter(
        sessionConfiguration({ endpoint: 'studio-api', kind: 'single-endpoint' }),
        {
          fetchImplementation: (input, init) => {
            observed = {
              headers: init?.headers,
              url:
                typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
            };
            return Promise.resolve(
              new Response('{"value":[]}', {
                headers: { 'content-type': 'application/json' },
                status: 200,
              }),
            );
          },
        },
      );

      await adapter.model?.list(context);
      expect(new URL(observed?.url ?? '').origin).toBe(window.location.origin);
      expect(new URL(observed?.url ?? '').origin).not.toBe('https://attacker.example.test');
      expect(observed?.headers).toMatchObject({ 'x-csrf-token': 'csrf-r1' });
    } finally {
      base.remove();
    }
  });

  it('refuses authenticated cleartext transport except for explicit loopback development', async () => {
    expect(() =>
      createBrowserHttpHostAdapter(
        sessionConfiguration({ endpoint: '/studio-api', kind: 'single-endpoint' }),
        {
          browserLocation: {
            href: 'http://admin.example.test/workspace',
            origin: 'http://admin.example.test',
          },
          fetchImplementation: () => Promise.resolve(new Response('{"value":[]}')),
        },
      ),
    ).toThrow(/requires an HTTPS document/u);

    expect(() =>
      createBrowserHttpHostAdapter(
        {
          authentication: {
            credentials: 'omit',
            expiresAt: '2029-01-01T00:10:00Z',
            issuedAt: '2029-01-01T00:00:00Z',
            kind: 'bearer-token',
            token: 'example',
          },
          kind: 'http',
          routing: { endpoint: 'https://api.example.test/studio', kind: 'single-endpoint' },
        },
        {
          browserLocation: {
            href: 'http://admin.example.test/workspace',
            origin: 'http://admin.example.test',
          },
          fetchImplementation: () => Promise.resolve(new Response('{"value":[]}')),
        },
      ),
    ).toThrow(/requires an HTTPS document/u);

    let observedUrl = '';
    const loopback = createBrowserHttpHostAdapter(
      sessionConfiguration({ endpoint: '/studio-api', kind: 'single-endpoint' }),
      {
        browserLocation: {
          href: 'http://127.0.0.1:8080/workspace',
          origin: 'http://127.0.0.1:8080',
        },
        fetchImplementation: (input) => {
          observedUrl =
            typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
          return Promise.resolve(
            new Response('{"value":[]}', {
              headers: { 'content-type': 'application/json' },
              status: 200,
            }),
          );
        },
      },
    );
    await expect(loopback.model?.list(context)).resolves.toEqual({ value: [] });
    expect(observedUrl).toBe('http://127.0.0.1:8080/studio-api');
  });

  it('accepts only a declarative HTTP transport configuration, never a base URL string', () => {
    expect(() =>
      createBrowserHttpHostAdapter('/studio-api' as unknown as HttpHostTransportConfiguration, {
        browserLocation: secureBrowserLocation,
        fetchImplementation: () => Promise.resolve(new Response('{"value":[]}')),
      }),
    ).toThrow(TypeError);
  });
});

async function hostFailure(operation: Promise<unknown> | undefined): Promise<HostPortFailure> {
  if (operation === undefined) {
    throw new Error('The HTTP HostAdapter must expose the model port.');
  }
  try {
    await operation;
  } catch (error) {
    expect(error).toBeInstanceOf(HostPortFailure);
    return error as HostPortFailure;
  }
  throw new Error('Expected the HTTP operation to fail.');
}
