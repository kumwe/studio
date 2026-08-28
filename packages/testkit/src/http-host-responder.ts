import {
  isHostPortFailure,
  STUDIO_CONTRACT_VERSION,
  type AuthoringPort,
  type AuthoringSaveAsNewTypeRequest,
  type AuthoringSaveIntent,
  type AuthoringSaveItemRequest,
  type AuthoringSaveNewTypeVersionRequest,
  type AuthoringStartRequest,
  type AuthoringTargetResolveRequest,
  type AuthoringTypeListQuery,
  type HostErrorCategory,
  type HostPortError,
  type HostPortResult,
  type HostRequestContext,
  type JsonObject,
  type QualifiedName,
} from '@kumwe/studio-protocol';
import {
  AUTHORING_HTTP_OPERATIONS,
  AUTHORING_HTTP_OPERATIONS_BY_ROUTE,
  type AuthoringHttpOperationContract,
  type AuthoringHttpRoute,
  type HttpSchemaValidator,
} from './http-authoring-contract.js';

export interface HttpResponderRequest {
  /** Raw JSON body after the HTTP server has decoded transport bytes as UTF-8. */
  body: string;
  /** Header names are matched case-insensitively. Duplicate spellings fail closed. */
  headers: Readonly<Record<string, string | undefined>>;
  method: string;
  /** Pathname only. A query string is not a Studio port route. */
  path: string;
}

export interface HttpResponderResponse {
  body: string;
  headers: Readonly<Record<string, string>>;
  status: number;
}

export interface HttpTransportSecurityDecision {
  /** Authentication was derived from trusted transport evidence, never the JSON body. */
  authenticated: boolean;
  /** A CSRF token, strict same-origin proof, or non-browser service credential bound this call. */
  requestIntegrity: boolean;
}

export interface HttpTransportSecurityInput {
  capability: QualifiedName;
  headers: Readonly<Record<string, string | undefined>>;
  method: 'POST';
  mutating: boolean;
  path: string;
  route: AuthoringHttpRoute;
}

export type HttpTransportSecurityVerifier = (
  input: HttpTransportSecurityInput,
) => HttpTransportSecurityDecision | Promise<HttpTransportSecurityDecision>;

/**
 * Validates one value against the exact canonical schema reference supplied
 * by the responder. A PHP host performs the equivalent call in its PHP JSON
 * Schema library; the reference responder deliberately does not own Ajv.
 */
export interface AuthoringHttpResponderOptions {
  /** Defaults to 64 MiB; hosts may set a stricter deployment-specific limit. */
  maximumRequestBytes?: number;
  /** Defaults to `/ports`. */
  routePrefix?: string;
  validateSchema: HttpSchemaValidator;
  /** Required fail-closed authentication plus CSRF/origin/service-integrity boundary. */
  verifyTransportSecurity: HttpTransportSecurityVerifier;
}

interface WireRequest {
  arguments: JsonObject;
  context: HostRequestContext;
}

type AuthoringInvoker = (
  authoring: AuthoringPort,
  request: WireRequest,
) => Promise<HostPortResult<unknown>>;

const DEFAULT_MAXIMUM_REQUEST_BYTES = 64 * 1024 * 1024;

const responseHeaders = Object.freeze({
  'cache-control': 'no-store',
  'content-type': 'application/json; charset=utf-8',
  'x-content-type-options': 'nosniff',
});

const invokers: Readonly<Record<AuthoringHttpRoute, AuthoringInvoker>> = Object.freeze({
  'authoring/list-types': (authoring, wire) =>
    authoring.listTypes(wire.arguments.query as unknown as AuthoringTypeListQuery, wire.context),
  'authoring/plan-save': (authoring, wire) =>
    authoring.planSave(wire.arguments.intent as unknown as AuthoringSaveIntent, wire.context),
  'authoring/resolve-target': (authoring, wire) =>
    authoring.resolveTarget(
      wire.arguments.request as unknown as AuthoringTargetResolveRequest,
      wire.context,
    ),
  'authoring/save-as-new-type': (authoring, wire) =>
    authoring.saveAsNewType(
      wire.arguments.request as unknown as AuthoringSaveAsNewTypeRequest,
      wire.context,
    ),
  'authoring/save-item': (authoring, wire) =>
    authoring.saveItem(wire.arguments.request as unknown as AuthoringSaveItemRequest, wire.context),
  'authoring/save-new-type-version': (authoring, wire) =>
    authoring.saveNewTypeVersion(
      wire.arguments.request as unknown as AuthoringSaveNewTypeVersionRequest,
      wire.context,
    ),
  'authoring/start': (authoring, wire) =>
    authoring.start(wire.arguments.request as unknown as AuthoringStartRequest, wire.context),
});

/**
 * Creates a platform-neutral reference responder for all seven contextual
 * authoring routes. It receives and returns plain values, so an HTTP server,
 * Service Worker, browser mock, or PHP interoperability test can bind it
 * without importing a server framework.
 *
 * The responder validates transport method/content type/size, performs the
 * trusted authentication and request-integrity check before parsing JSON,
 * validates the exact operation schema, checks capability and resource
 * context binding, and only then invokes the host-authoritative port.
 */
export function createAuthoringHttpResponder(
  authoring: AuthoringPort,
  options: AuthoringHttpResponderOptions,
): (request: HttpResponderRequest) => Promise<HttpResponderResponse> {
  const maximumRequestBytes = options.maximumRequestBytes ?? DEFAULT_MAXIMUM_REQUEST_BYTES;
  if (!Number.isSafeInteger(maximumRequestBytes) || maximumRequestBytes <= 0) {
    throw new TypeError('maximumRequestBytes must be a positive safe integer.');
  }
  const routePrefix = normalizeRoutePrefix(options.routePrefix ?? '/ports');
  let correlationSerial = 0;

  const failure = (
    category: HostErrorCategory,
    key: QualifiedName,
    defaultMessage: string,
    retryable = false,
  ): HttpResponderResponse => {
    correlationSerial += 1;
    return errorResponse(
      {
        category,
        contractVersion: STUDIO_CONTRACT_VERSION,
        correlationId: `http-responder/${correlationSerial}`,
        kind: 'host-error',
        message: { defaultMessage, key },
        retryable,
      },
      categoryStatus(category),
    );
  };

  return async (request): Promise<HttpResponderResponse> => {
    const operation = operationForPath(request.path, routePrefix);
    if (operation === undefined) {
      return failure(
        'not-found',
        'studio.testkit/http-route-not-found',
        'The requested Studio host operation is unavailable.',
      );
    }
    if (request.method !== 'POST') {
      return withAllowHeader(
        failure(
          'invalid-request',
          'studio.testkit/http-method-invalid',
          'Studio host operations require POST.',
        ),
      );
    }
    if (!isJsonContentType(readSingleHeader(request.headers, 'content-type'))) {
      return failure(
        'invalid-request',
        'studio.testkit/http-content-type-invalid',
        'Studio host operations require an application/json content type.',
      );
    }
    if (utf8ByteLength(request.body) > maximumRequestBytes) {
      return failure(
        'limit-exceeded',
        'studio.testkit/http-request-too-large',
        'The Studio host request exceeds the configured transport limit.',
      );
    }

    let security: HttpTransportSecurityDecision;
    try {
      security = await options.verifyTransportSecurity({
        capability: operation.capability,
        headers: request.headers,
        method: 'POST',
        mutating: operation.mutating,
        path: request.path,
        route: operation.route,
      });
    } catch {
      return failure(
        'internal',
        'studio.testkit/http-security-check-failed',
        'The host could not verify request security.',
      );
    }
    if (!security.authenticated) {
      return failure(
        'unauthenticated',
        'studio.testkit/http-unauthenticated',
        'Authentication is required for Studio authoring.',
      );
    }
    if (!security.requestIntegrity) {
      return failure(
        'forbidden',
        'studio.testkit/http-request-integrity-failed',
        'The Studio authoring request failed request-integrity verification.',
      );
    }

    const parsed = parseJson(request.body);
    if (parsed === undefined) {
      return failure(
        'invalid-request',
        'studio.testkit/http-request-malformed',
        'The Studio host request body is not valid JSON.',
      );
    }
    let valid: boolean;
    try {
      valid = options.validateSchema(operation.requestSchema, parsed);
    } catch {
      return failure(
        'internal',
        'studio.testkit/http-schema-validator-failed',
        'The host could not validate the Studio request.',
      );
    }
    if (!valid || !isWireRequest(parsed) || parsed.context.operationId !== operation.capability) {
      return failure(
        'invalid-request',
        'studio.testkit/http-request-invalid',
        'The Studio host request does not match the operation contract.',
      );
    }
    if (!resourceContextMatches(operation.route, parsed)) {
      return failure(
        'invalid-request',
        'studio.testkit/http-resource-context-mismatch',
        'The operation resource context does not match the request envelope.',
      );
    }

    let result: HostPortResult<unknown>;
    try {
      result = await invokers[operation.route](authoring, parsed);
    } catch (error) {
      if (isHostPortFailure(error)) {
        return errorResponse(error.error, categoryStatus(error.error.category));
      }
      return failure(
        'internal',
        'studio.testkit/http-host-failure',
        'The host could not complete the Studio operation.',
      );
    }

    try {
      valid = options.validateSchema(operation.responseSchema, result);
    } catch {
      valid = false;
    }
    if (!valid) {
      return failure(
        'internal',
        'studio.testkit/http-response-invalid',
        'The host produced an invalid Studio operation result.',
      );
    }
    return jsonResponse(200, result);
  };
}

function operationForPath(
  path: string,
  routePrefix: string,
): AuthoringHttpOperationContract | undefined {
  if (!path.startsWith(`${routePrefix}/`) || path.includes('?') || path.includes('#')) {
    return undefined;
  }
  const route = path.slice(routePrefix.length + 1) as AuthoringHttpRoute;
  return AUTHORING_HTTP_OPERATIONS_BY_ROUTE.get(route);
}

function normalizeRoutePrefix(value: string): string {
  if (!value.startsWith('/') || value.includes('?') || value.includes('#')) {
    throw new TypeError('routePrefix must be an absolute pathname without a query or fragment.');
  }
  const normalized = value.endsWith('/') ? value.slice(0, -1) : value;
  if (normalized.length === 0 || normalized.includes('//')) {
    throw new TypeError('routePrefix must identify one normalized absolute pathname.');
  }
  return normalized;
}

function readSingleHeader(
  headers: Readonly<Record<string, string | undefined>>,
  name: string,
): string | undefined {
  const matches = Object.entries(headers).filter(([key]) => key.toLowerCase() === name);
  return matches.length === 1 ? matches[0]?.[1] : undefined;
}

function isJsonContentType(value: string | undefined): boolean {
  return value?.split(';', 1)[0]?.trim().toLowerCase() === 'application/json';
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function isWireRequest(value: unknown): value is WireRequest {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.arguments === 'object' &&
    record.arguments !== null &&
    !Array.isArray(record.arguments) &&
    typeof record.context === 'object' &&
    record.context !== null &&
    !Array.isArray(record.context)
  );
}

function resourceContextMatches(route: AuthoringHttpRoute, wire: WireRequest): boolean {
  let value: unknown;
  switch (route) {
    case AUTHORING_HTTP_OPERATIONS.resolveTarget.route:
    case AUTHORING_HTTP_OPERATIONS.start.route:
      value = (wire.arguments.request as Record<string, unknown> | undefined)?.resourceContext;
      break;
    case AUTHORING_HTTP_OPERATIONS.listTypes.route:
      value = (wire.arguments.query as Record<string, unknown> | undefined)?.resourceContext;
      break;
    default:
      return true;
  }
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    (value as Record<string, unknown>).key === wire.context.resourceContextKey
  );
}

function categoryStatus(category: HostErrorCategory): number {
  switch (category) {
    case 'unauthenticated':
      return 401;
    case 'forbidden':
      return 403;
    case 'not-found':
      return 404;
    case 'conflict':
      return 409;
    case 'limit-exceeded':
      return 413;
    case 'validation-failed':
      return 422;
    case 'rate-limited':
      return 429;
    case 'unavailable':
      return 503;
    case 'internal':
      return 500;
    case 'cancelled':
    case 'incompatible':
    case 'invalid-request':
      return 400;
  }
}

function errorResponse(error: HostPortError, status: number): HttpResponderResponse {
  return jsonResponse(status, error);
}

function jsonResponse(status: number, value: unknown): HttpResponderResponse {
  return { body: JSON.stringify(value), headers: responseHeaders, status };
}

function withAllowHeader(response: HttpResponderResponse): HttpResponderResponse {
  return { ...response, headers: { ...response.headers, allow: 'POST' } };
}

/** Platform-free UTF-8 byte count used for the transport request limit. */
function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    bytes += codePoint <= 0x7f ? 1 : codePoint <= 0x7ff ? 2 : codePoint <= 0xffff ? 3 : 4;
  }
  return bytes;
}
