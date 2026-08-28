import {
  createHttpHostAdapter,
  type ConfiguredHttpHostAdapterOptions,
  type HttpAuthenticationResolver,
  type HttpFetchLike,
  type HttpHostTransportConfiguration,
  type HttpResponseLike,
  type HttpTimeoutHandle,
} from '@kumwe/studio-core';
import type { HostAdapter } from '@kumwe/studio-protocol';

export interface BrowserHttpHostAdapterOptions extends Omit<
  ConfiguredHttpHostAdapterOptions,
  'createTimeoutSignal' | 'currentTimeMilliseconds' | 'fetchImplementation'
> {
  /** Deterministic test seam; normal browsers always use their actual `window.location`. */
  browserLocation?: BrowserLocationSnapshot;
  /** Deterministic credential-lifetime clock; defaults to `Date.now`. */
  currentTimeMilliseconds?: () => number;
  /** Override for tests or a host-managed fetch policy; defaults to global `fetch`. */
  fetchImplementation?: typeof fetch;
}

export interface BrowserLocationSnapshot {
  readonly href: string;
  readonly origin: string;
}

export type BrowserConfiguredHttpHostAdapterOptions = BrowserHttpHostAdapterOptions;

/**
 * Drop-in compiled-browser HostAdapter for the canonical Studio HTTP binding.
 * It supplies the browser fetch and AbortController seams to the shared
 * DOM/Node-free implementation; PHP or another backend only implements the
 * documented JSON routes and never runs this code on the server.
 */
export function createBrowserHttpHostAdapter(
  configuration: HttpHostTransportConfiguration,
  options: BrowserHttpHostAdapterOptions = {},
): HostAdapter {
  const browserFetch = options.fetchImplementation ?? globalThis.fetch;
  if (typeof browserFetch !== 'function') {
    throw new TypeError('A browser fetch implementation is required.');
  }

  const fetchImplementation: HttpFetchLike = async (url, init): Promise<HttpResponseLike> => {
    const response = await browserFetch(url, {
      body: init.body,
      cache: 'no-store',
      credentials: init.credentials,
      headers: init.headers,
      method: init.method,
      redirect: 'error',
      ...(init.signal === undefined ? {} : { signal: init.signal as AbortSignal }),
    });
    const contentType = response.headers.get('content-type');
    return {
      ...(contentType === null ? {} : { contentType }),
      status: response.status,
      text: (maximumBytes: number) => readBoundedResponseText(response, maximumBytes),
    };
  };
  const { browserLocation, currentTimeMilliseconds, resolveAuthentication, ...portableOptions } =
    options;
  const documentUrl = resolveBrowserDocumentUrl(browserLocation);
  const normalizedConfiguration = normalizeBrowserHttpConfiguration(configuration, documentUrl);
  return createHttpHostAdapter(normalizedConfiguration, {
    ...portableOptions,
    createTimeoutSignal: createBrowserTimeoutSignal,
    currentTimeMilliseconds: currentTimeMilliseconds ?? (() => Date.now()),
    fetchImplementation,
    ...(resolveAuthentication === undefined
      ? {}
      : {
          resolveAuthentication: guardBrowserAuthenticationResolver(
            resolveAuthentication,
            normalizedConfiguration,
            documentUrl.origin,
          ),
        }),
  });
}

function normalizeBrowserHttpConfiguration(
  configuration: HttpHostTransportConfiguration,
  base: URL,
): HttpHostTransportConfiguration {
  const resolveEndpoint = (endpoint: string): string => {
    assertUnambiguousBrowserEndpoint(endpoint);
    const resolved = new URL(endpoint, base);
    if (
      (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') ||
      resolved.username !== '' ||
      resolved.password !== '' ||
      resolved.hash !== ''
    ) {
      throw new TypeError('Configured browser endpoints must be credential-free HTTP(S) URLs.');
    }
    if (resolved.protocol !== 'https:' && !isLoopbackHostname(resolved.hostname)) {
      throw new TypeError(
        'Authenticated browser endpoints must use HTTPS except on an explicit loopback host.',
      );
    }
    if (
      configuration.authentication.kind === 'same-origin-session' &&
      resolved.origin !== base.origin
    ) {
      throw new TypeError('Same-origin session endpoints must match the document origin exactly.');
    }
    return resolved.href;
  };

  const routing =
    configuration.routing.kind === 'single-endpoint'
      ? {
          endpoint: resolveEndpoint(configuration.routing.endpoint),
          kind: 'single-endpoint' as const,
        }
      : {
          endpoints: Object.fromEntries(
            Object.entries(configuration.routing.endpoints).map(([operation, endpoint]) => [
              operation,
              resolveEndpoint(endpoint),
            ]),
          ),
          kind: 'operation-map' as const,
        };
  return { ...configuration, routing };
}

function resolveBrowserDocumentUrl(suppliedLocation: BrowserLocationSnapshot | undefined): URL {
  const browserLocation = suppliedLocation ?? globalThis.location;
  const href = browserLocation?.href;
  const origin = browserLocation?.origin;
  if (browserLocation === undefined || typeof href !== 'string' || typeof origin !== 'string') {
    throw new TypeError('Configured browser HTTP transport requires the browser location.');
  }
  const base = new URL(href);
  if (
    (base.protocol !== 'http:' && base.protocol !== 'https:') ||
    base.username !== '' ||
    base.password !== '' ||
    base.origin !== origin
  ) {
    throw new TypeError('The browser location must be one consistent credential-free HTTP(S) URL.');
  }
  if (base.protocol !== 'https:' && !isLoopbackHostname(base.hostname)) {
    throw new TypeError(
      'Authenticated Studio requires an HTTPS document except on an explicit loopback host.',
    );
  }
  return base;
}

function isLoopbackHostname(value: string): boolean {
  const hostname = value.toLowerCase();
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname === '[::1]' ||
    hostname === '::1'
  ) {
    return true;
  }
  const octets = hostname.split('.');
  return (
    octets.length === 4 &&
    octets[0] === '127' &&
    octets.every((octet) => /^(?:0|[1-9][0-9]{0,2})$/u.test(octet) && Number(octet) <= 255)
  );
}

function guardBrowserAuthenticationResolver(
  resolver: HttpAuthenticationResolver,
  configuration: HttpHostTransportConfiguration,
  documentOrigin: string,
): HttpAuthenticationResolver {
  return async (request) => {
    const authentication = await resolver(request);
    if (authentication?.kind !== 'same-origin-session') {
      return authentication;
    }
    const endpoint =
      configuration.routing.kind === 'single-endpoint'
        ? configuration.routing.endpoint
        : configuration.routing.endpoints[request.operation];
    if (endpoint !== undefined && new URL(endpoint).origin !== documentOrigin) {
      throw new TypeError(
        'Refreshed same-origin session material cannot use a cross-origin route.',
      );
    }
    return authentication;
  };
}

function assertUnambiguousBrowserEndpoint(endpoint: string): void {
  if (
    endpoint.length === 0 ||
    endpoint.length > 2048 ||
    endpoint.trim() !== endpoint ||
    /\s/u.test(endpoint) ||
    endpoint.includes('\\') ||
    endpoint.includes('#')
  ) {
    throw new TypeError('Configured browser endpoints must be bounded exact URL references.');
  }
  const locator = endpoint.split('?', 1)[0] ?? '';
  if (locator.startsWith('//') || /%(?:2f|5c)/iu.test(locator)) {
    throw new TypeError('Configured browser endpoint separators must be unambiguous.');
  }
  const schemeEnd = locator.indexOf('://');
  const pathStart = schemeEnd === -1 ? -1 : locator.indexOf('/', schemeEnd + 3);
  const path = schemeEnd === -1 ? locator : pathStart === -1 ? '' : locator.slice(pathStart);
  for (const segment of path.split('/')) {
    const decodedDots = segment.replaceAll(/%2e/giu, '.');
    if (decodedDots === '.' || decodedDots === '..') {
      throw new TypeError('Configured browser endpoints must not contain dot segments.');
    }
  }
}

async function readBoundedResponseText(response: Response, maximumBytes: number): Promise<string> {
  const declaredLength = response.headers.get('content-length');
  if (
    declaredLength !== null &&
    /^[0-9]+$/u.test(declaredLength) &&
    Number(declaredLength) > maximumBytes
  ) {
    throw responseLimitError();
  }

  if (response.body === null) {
    const value = await response.text();
    if (new TextEncoder().encode(value).byteLength > maximumBytes) {
      throw responseLimitError();
    }
    return value;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const chunks: string[] = [];
  let receivedBytes = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) {
        break;
      }
      receivedBytes += next.value.byteLength;
      if (receivedBytes > maximumBytes) {
        throw responseLimitError();
      }
      chunks.push(decoder.decode(next.value, { stream: true }));
    }
    chunks.push(decoder.decode());
    return chunks.join('');
  } catch (reason) {
    try {
      await reader.cancel();
    } catch {
      // The original malformed/limit/deadline classification remains
      // authoritative even when an already-failed stream refuses cancellation.
    }
    throw reason;
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // Reader cleanup cannot replace the canonical stream outcome.
    }
  }
}

function responseLimitError(): Error {
  const error = new Error('The Studio host response exceeded its configured byte limit.');
  error.name = 'ResponseLimitError';
  return error;
}

function createBrowserTimeoutSignal(timeoutMilliseconds: number): HttpTimeoutHandle {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => {
    const reason = new Error('The Studio host request exceeded its deadline.');
    reason.name = 'TimeoutError';
    controller.abort(reason);
  }, timeoutMilliseconds);
  return {
    release: () => globalThis.clearTimeout(timeout),
    signal: controller.signal,
  };
}
