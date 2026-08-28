import {
  HTTP_HOST_OPERATION_ROUTES,
  createHttpHostAdapter as createCoreHttpHostAdapter,
  type HttpAuthenticationResolver,
  type HttpFetchLike,
  type HttpRequestInit,
  type HttpSchemaValidator,
  type HttpTimeoutHandle,
} from '@kumwe/studio-core';
import { isHostPortFailure, type HostAdapter } from '@kumwe/studio-protocol';
import { TestbedHostError } from './host-testbed.js';

export { HTTP_HOST_OPERATION_ROUTES } from '@kumwe/studio-core';

export type {
  ConfiguredHttpHostAdapterOptions,
  HttpAuthenticationConfiguration,
  HttpAuthenticationRequest,
  HttpAuthenticationResolver,
  HttpBearerTokenAuthentication,
  HttpFetchLike,
  HttpHeaderTokenAuthentication,
  HttpHostOperationEndpoints,
  HttpHostOperationRoute,
  HttpHostRoutingConfiguration,
  HttpHostTransportConfiguration,
  HttpRequestInit,
  HttpResponseLike,
  HttpSameOriginSessionAuthentication,
  HttpTimeoutHandle,
} from '@kumwe/studio-core';

/** Historical conventional-route options retained only for test conformance. */
export interface HttpHostAdapterOptions {
  createTimeoutSignal?: (timeoutMilliseconds: number) => HttpTimeoutHandle;
  credentials?: HttpRequestInit['credentials'];
  fetchImplementation: HttpFetchLike;
  maximumResponseBytes?: number;
  requestHeaders?: () => Readonly<Record<string, string>>;
  resolveAuthentication?: HttpAuthenticationResolver;
  timeoutMilliseconds?: number;
  validateSchema?: HttpSchemaValidator;
}

/**
 * Backward-compatible testkit facade over the production core transport.
 * Canonical `HostPortFailure` rejections are translated to the historical
 * `TestbedHostError` subclass without duplicating any HTTP behavior.
 */
export function createHttpHostAdapter(
  baseUrl: string,
  options: HttpHostAdapterOptions,
): HostAdapter {
  const createTimeoutSignal = options.createTimeoutSignal;
  const base = normalizeConventionalBaseUrl(baseUrl);
  const endpoints = Object.fromEntries(
    HTTP_HOST_OPERATION_ROUTES.map((operation) => [operation, `${base}/ports/${operation}`]),
  );
  const timeoutMilliseconds = options.timeoutMilliseconds ?? 10_000;
  const maximumResponseBytes = options.maximumResponseBytes ?? 64 * 1024 * 1024;
  if (!Number.isSafeInteger(timeoutMilliseconds) || timeoutMilliseconds <= 0) {
    throw new TypeError('timeoutMilliseconds must be a positive safe integer.');
  }
  if (!Number.isSafeInteger(maximumResponseBytes) || maximumResponseBytes <= 0) {
    throw new TypeError('maximumResponseBytes must be a positive safe integer.');
  }
  const fetchImplementation: HttpFetchLike = async (url, init) => {
    let headers: Record<string, string>;
    try {
      headers = createLegacyRequestHeaders(init.headers, options.requestHeaders?.());
    } catch {
      const error = new Error('The testkit HTTP request headers are invalid.');
      error.name = 'InvalidRequestError';
      throw error;
    }
    const response = await options.fetchImplementation(url, {
      ...init,
      credentials: options.credentials ?? 'same-origin',
      headers,
    });
    return {
      ...(response.contentType === undefined ? {} : { contentType: response.contentType }),
      status: response.status,
      text: () => response.text(maximumResponseBytes),
    };
  };
  return wrapAdapterFailures(
    createCoreHttpHostAdapter(
      {
        authentication: {
          credentials: 'omit',
          expiresAt: '1970-01-01T00:10:00Z',
          headerName: 'X-Studio-Testkit-Transport',
          issuedAt: '1970-01-01T00:00:00Z',
          kind: 'header-token',
          token: 'conformance',
        },
        kind: 'http',
        maximumResponseBytes: Math.min(64 * 1024 * 1024, Math.max(1024, maximumResponseBytes)),
        requestTimeoutMilliseconds: 10_000,
        routing: { endpoints, kind: 'operation-map' },
      },
      {
        ...(createTimeoutSignal === undefined
          ? {}
          : {
              createTimeoutSignal: () => createTimeoutSignal(timeoutMilliseconds),
            }),
        currentTimeMilliseconds: () => 0,
        fetchImplementation,
        ...(options.resolveAuthentication === undefined
          ? {}
          : { resolveAuthentication: options.resolveAuthentication }),
        ...(options.validateSchema === undefined ? {} : { validateSchema: options.validateSchema }),
      },
    ),
  );
}

function normalizeConventionalBaseUrl(value: string): string {
  if (value === '') {
    return '';
  }
  if (
    value.trim() !== value ||
    /\s/u.test(value) ||
    value.includes('?') ||
    value.includes('#') ||
    value.includes('\\')
  ) {
    throw new TypeError('baseUrl must not contain whitespace, a query, or a fragment.');
  }
  const normalized = value.endsWith('/') ? value.slice(0, -1) : value;
  let path: string;
  if (normalized.startsWith('https://') || normalized.startsWith('http://')) {
    const schemeEnd = normalized.indexOf('://') + 3;
    const pathStart = normalized.indexOf('/', schemeEnd);
    const authority =
      pathStart === -1 ? normalized.slice(schemeEnd) : normalized.slice(schemeEnd, pathStart);
    if (authority.length === 0 || authority.includes('@')) {
      throw new TypeError('baseUrl must contain a host and must not embed credentials.');
    }
    path = pathStart === -1 ? '' : normalized.slice(pathStart);
  } else {
    if (!normalized.startsWith('/') || normalized.startsWith('//')) {
      throw new TypeError('baseUrl must be an HTTP(S) URL or a same-origin absolute path.');
    }
    path = normalized;
  }
  if (path.includes('//')) {
    throw new TypeError('baseUrl path must be normalized without empty segments.');
  }
  for (const segment of path.split('/')) {
    if (segment === '.' || segment === '..' || /%2e/iu.test(segment)) {
      throw new TypeError('baseUrl path must not contain dot segments.');
    }
  }
  return normalized;
}

function createLegacyRequestHeaders(
  transportHeaders: Readonly<Record<string, string>>,
  supplied: Readonly<Record<string, string>> | undefined,
): Record<string, string> {
  const headers: Record<string, string> = { ...transportHeaders };
  for (const [name, value] of Object.entries(supplied ?? {})) {
    const normalized = name.toLowerCase();
    if (
      name.length > 100 ||
      !/^[!#$%&'*+.^_`|~0-9a-z-]+$/u.test(normalized) ||
      value.length > 8192 ||
      value.trim() !== value ||
      invalidByteStringHeaderValue(value) ||
      normalized === 'accept' ||
      normalized === 'content-type' ||
      normalized === 'x-studio-operation' ||
      Object.hasOwn(headers, normalized)
    ) {
      throw new TypeError('Invalid HTTP request header.');
    }
    headers[normalized] = value;
  }
  return headers;
}

function invalidByteStringHeaderValue(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 8 || (code >= 10 && code <= 31) || code === 127 || code > 255) {
      return true;
    }
  }
  return false;
}

function wrapAdapterFailures(adapter: HostAdapter): HostAdapter {
  const wrapped = Object.fromEntries(
    Object.entries(adapter).map(([name, port]) => [name, wrapPortFailures(port)]),
  );
  return wrapped as unknown as HostAdapter;
}

function wrapPortFailures<TPort extends object>(port: TPort): TPort {
  return new Proxy(port, {
    get(target, property, receiver): unknown {
      const member = Reflect.get(target, property, receiver) as unknown;
      if (typeof member !== 'function') {
        return member;
      }
      return (...arguments_: unknown[]): Promise<unknown> =>
        Promise.resolve(Reflect.apply(member, target, arguments_)).catch((error: unknown) => {
          if (isHostPortFailure(error) && !(error instanceof TestbedHostError)) {
            throw new TestbedHostError(error.error);
          }
          throw error;
        });
    },
  });
}
