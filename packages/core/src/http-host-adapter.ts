import {
  HostPortFailure,
  isHostPortError,
  STUDIO_CONTRACT_VERSION,
  type ArtifactReference,
  type AuthoringSaveAsNewTypeRequest,
  type AuthoringSaveIntent,
  type AuthoringSaveItemRequest,
  type AuthoringSaveNewTypeVersionRequest,
  type AuthoringSavePlan,
  type AuthoringSaveResult,
  type AuthoringSessionSnapshot,
  type AuthoringStartRequest,
  type AuthoringTargetResolution,
  type AuthoringTargetResolveRequest,
  type AuthoringTypeListPage,
  type AuthoringTypeListQuery,
  type ContentModelDocument,
  type HostAdapter,
  type HostErrorCategory,
  type HostPortError,
  type HostPortResult,
  type HostRequestContext,
  type JsonObject,
  type MediaAsset,
  type MediaPage,
  type MediaUploadAcceptedAsset,
  type MediaUploadGrant,
  type MediaUploadRequestDescriptor,
  type MediaQuery,
  type PermissionExplanation,
  type PermissionSnapshot,
  type PreviewRenderedPayload,
  type PreviewRenderPayload,
  type QualifiedName,
  type ResourceSearchPage,
  type ResourceSearchQuery,
  type StudioDeploymentOperationRoute,
  type StudioArtifact,
  type TelemetryEvent,
} from '@kumwe/studio-protocol';
import { AUTHORING_HTTP_OPERATIONS, type HttpSchemaValidator } from './http-authoring-contract.js';
import { parseJsonRejectingDuplicateMembers } from './strict-json.js';
import {
  assertStudioTokenLifetime,
  isAuthenticationLifetimeFailure,
} from './authentication-lifetime.js';

/**
 * Minimal structural view of an HTTP response the adapter needs: media type,
 * status code, and raw body text. Deliberately narrower than any platform
 * response class so implementations from any runtime satisfy it. A missing
 * `contentType` models a hostile/invalid response and is rejected.
 */
export interface HttpResponseLike {
  /** Parsed response Content-Type; omission is a fail-closed invalid response. */
  contentType?: string;
  status: number;
  /**
   * Read at most `maximumBytes` decoded transport bytes. Implementations MUST
   * reject with a reason named `ResponseLimitError` before exceeding it.
   */
  text(maximumBytes: number): Promise<string>;
}

/** The request shape the adapter hands to the injected transport. */
export interface HttpRequestInit {
  body: string;
  /** Browser credential policy. `same-origin` is the secure default. */
  credentials: 'include' | 'omit' | 'same-origin';
  headers: Record<string, string>;
  method: 'POST';
  /** Opaque abort signal produced by the injected timeout factory, if any. */
  signal?: unknown;
}

/**
 * The injected fetch-like transport — the adapter's portability seam.
 *
 * Core source is deliberately free of host globals (no fetch, no DOM, no
 * Node), so the embedder supplies the platform transport: a Node test injects
 * a `node:http`-backed implementation while `@kumwe/studio` supplies the
 * browser fetch convenience, and either stays outside this package. The function must
 * resolve with the terminal HTTP response (any status) and reject only for
 * transport-level failures: network refusal, connection loss, or an abort
 * raised by the injected timeout signal.
 */
export type HttpFetchLike = (url: string, init: HttpRequestInit) => Promise<HttpResponseLike>;

/**
 * An abort signal handle minted per request by the injected timeout factory.
 * `signal` is passed through to the transport untouched; `release` (when
 * present) is invoked once the request settles so timer-backed factories can
 * clean up.
 */
export interface HttpTimeoutHandle {
  /**
   * Optional deadline rejection for work which happens before fetch receives
   * the platform signal (notably an asynchronous authentication refresh).
   */
  deadline?: PromiseLike<never>;
  release?(): void;
  signal: unknown;
}

/**
 * Exact operation endpoints supplied by the host. Missing entries are
 * unavailable capabilities; the transport never invents a fallback URL.
 */
export type HttpHostOperationEndpoints = Readonly<Partial<Record<HttpHostOperationRoute, string>>>;

export type HttpHostRoutingConfiguration =
  | {
      /** Each configured operation is posted to its exact host-owned URL. */
      readonly endpoints: HttpHostOperationEndpoints;
      readonly kind: 'operation-map';
    }
  | {
      /**
       * Every operation uses one URL. Dispatch is carried only in the fixed
       * `X-Studio-Operation` header; the canonical JSON body is unchanged.
       */
      readonly endpoint: string;
      readonly kind: 'single-endpoint';
    };

export interface HttpSameOriginSessionAuthentication {
  readonly credentials: 'same-origin';
  readonly csrf: {
    readonly headerName: string;
    readonly token: string;
  };
  readonly kind: 'same-origin-session';
}

export interface HttpBearerTokenAuthentication {
  readonly credentials: 'omit';
  /** Closed browser-use window; the server independently verifies the token. */
  readonly expiresAt: string;
  readonly issuedAt: string;
  readonly kind: 'bearer-token';
  readonly token: string;
}

export interface HttpHeaderTokenAuthentication {
  readonly credentials: 'omit';
  /** Closed browser-use window; the server independently verifies the token. */
  readonly expiresAt: string;
  readonly headerName: string;
  readonly issuedAt: string;
  readonly kind: 'header-token';
  readonly token: string;
}

/** Authentication material has exactly one transport projection. */
export type HttpAuthenticationConfiguration =
  | HttpBearerTokenAuthentication
  | HttpHeaderTokenAuthentication
  | HttpSameOriginSessionAuthentication;

/** Canonical browser/server deployment input for the HTTP HostAdapter. */
export interface HttpHostTransportConfiguration {
  readonly authentication: HttpAuthenticationConfiguration;
  readonly kind: 'http';
  readonly maximumResponseBytes?: number;
  readonly requestTimeoutMilliseconds?: number;
  readonly routing: HttpHostRoutingConfiguration;
}

export interface HttpAuthenticationRequest {
  /** Stable route only; authentication hooks never receive request content. */
  readonly operation: HttpHostOperationRoute;
}

/**
 * JS-only refresh seam. It runs for every call and may return fresh short-lived
 * material. Returning `undefined` retains the static deployment value.
 */
export type HttpAuthenticationResolver = (
  request: HttpAuthenticationRequest,
) =>
  | HttpAuthenticationConfiguration
  | Promise<HttpAuthenticationConfiguration | undefined>
  | undefined;

/** Closed route vocabulary implemented by the configured HTTP adapter. */
export type HttpHostOperationRoute = StudioDeploymentOperationRoute;

/** Closed route vocabulary accepted in a configured operation map. */
export const HTTP_HOST_OPERATION_ROUTES: readonly HttpHostOperationRoute[] = Object.freeze([
  'artifact/dependencies',
  'artifact/load',
  'artifact/publish',
  'artifact/save',
  'artifact/unpublish',
  'authoring/list-types',
  'authoring/plan-save',
  'authoring/resolve-target',
  'authoring/save-as-new-type',
  'authoring/save-item',
  'authoring/save-new-type-version',
  'authoring/start',
  'localization/messages',
  'media/abort-upload',
  'media/authorize-upload',
  'media/complete-upload',
  'media/get',
  'media/import-external',
  'media/list',
  'media/upload-status',
  'model/get',
  'model/list',
  'permission/explain',
  'permission/refresh',
  'preview/cancel',
  'preview/render',
  'recovery/discard',
  'recovery/load',
  'recovery/store',
  'resource/search',
  'telemetry/emit',
]);

export interface HttpHostAdapterOptions {
  /**
   * Second half of the portability seam: mints the per-request timeout
   * signal. When omitted, requests carry no deadline. A rejection whose
   * reason is named `AbortError` or `TimeoutError` is mapped to the canonical
   * deadline failure.
   */
  createTimeoutSignal?: (timeoutMilliseconds: number) => HttpTimeoutHandle;
  /** Deterministic clock used only to refuse expired configured credentials. */
  currentTimeMilliseconds: () => number;
  fetchImplementation: HttpFetchLike;
  /**
   * Produces per-call authentication and CSRF/origin-integrity headers. It is
   * invoked for every attempt so rotated credentials are not captured once.
   * `accept` and `content-type` are transport-owned and cannot be overridden.
   */
  requestHeaders?: () => Readonly<Record<string, string>>;
  /**
   * Resolve or refresh configured authentication for every request. The value
   * is projected only to the declared header and credential policy; Studio
   * never treats it as permission or identity data.
   */
  resolveAuthentication?: HttpAuthenticationResolver;
  /**
   * Optional exact request/result validation. Standalone host integration
   * conformance supplies this callback using the canonical protocol schemas.
   */
  validateSchema?: HttpSchemaValidator;
}

/** Explicit alias retained for consumers that emphasize configuration ownership. */
export type ConfiguredHttpHostAdapterOptions = HttpHostAdapterOptions;

interface FailureShape {
  category: HostErrorCategory;
  defaultMessage: string;
  key: QualifiedName;
  retryable: boolean;
}

interface HttpRequestAuthenticationProjection {
  credentials: HttpRequestInit['credentials'];
  headers: Readonly<Record<string, string>>;
}

interface HttpRequestTarget {
  operationHeader?: HttpHostOperationRoute;
  url: string;
}

interface NormalizedHttpTransport {
  authentication?: HttpAuthenticationConfiguration;
  credentials: HttpRequestInit['credentials'];
  currentTimeMilliseconds?: () => number;
  maximumResponseBytes: number;
  resolveTarget(operation: HttpHostOperationRoute): HttpRequestTarget | undefined;
  timeoutMilliseconds: number;
}

/**
 * A `HostAdapter` that speaks canonical JSON over an injected fetch-like
 * transport. A deployment provides exact per-operation endpoints or one
 * endpoint selected by the fixed `X-Studio-Operation` header. Production
 * routing is never inferred from a base URL convention.
 *
 * Success responses (2xx) must carry a `HostPortResult` JSON body. Failure
 * responses that carry a guard-conforming `HostPortError` body are re-thrown
 * as that canonical error, so a host-authored category (with its safe
 * revision on conflicts) crosses the transport intact. Everything else is
 * mapped onto the canonical host error categories without disclosing
 * transport details: network refusal and deadline expiry become
 * `unavailable`, HTTP statuses map by class (401 `unauthenticated`, 403
 * `forbidden`, 404 `not-found`, 409 `conflict`, 413 `limit-exceeded`, 422
 * `validation-failed`, 429 `rate-limited`, 5xx `internal`/`unavailable`), and
 * a malformed body — unparseable JSON, a result without `value`, or an error
 * document the guard rejects — becomes `internal`. Every rejection is a
 * canonical `HostPortFailure` whose `error` satisfies `isHostPortError`, and no
 * message ever echoes response bodies, addresses, or underlying reasons.
 */
export function createHttpHostAdapter(
  configuration: HttpHostTransportConfiguration,
  options: ConfiguredHttpHostAdapterOptions,
): HostAdapter {
  const transport = normalizeTransport(configuration, options);
  let correlationSerial = 0;

  function createError(failure: FailureShape): HostPortFailure {
    correlationSerial += 1;
    const error: HostPortError = {
      category: failure.category,
      contractVersion: STUDIO_CONTRACT_VERSION,
      correlationId: `http-transport-${correlationSerial}`,
      kind: 'host-error',
      message: { defaultMessage: failure.defaultMessage, key: failure.key },
      retryable: failure.retryable,
    };
    return new HostPortFailure(error);
  }

  async function call<TValue>(
    portName: string,
    operation: string,
    callArguments: JsonObject,
    context: HostRequestContext,
    requestSchema = 'https://schemas.kumwe.org/studio/v1/host-request.schema.json',
    responseSchema = 'https://schemas.kumwe.org/studio/v1/host-result.schema.json',
  ): Promise<HostPortResult<TValue>> {
    const operationRoute = `${portName}/${operation}` as HttpHostOperationRoute;
    const target = transport.resolveTarget(operationRoute);
    if (target === undefined) {
      throw createError(missingRoute());
    }
    const wireRequest = { arguments: callArguments, context };
    if (options.validateSchema !== undefined) {
      let valid: boolean;
      try {
        valid = options.validateSchema(requestSchema, wireRequest);
      } catch {
        throw createError(schemaValidatorFailure());
      }
      if (!valid) {
        throw createError(invalidRequest());
      }
    }
    let body: string;
    try {
      body = JSON.stringify(wireRequest);
    } catch {
      throw createError(invalidRequest());
    }
    let handle: HttpTimeoutHandle | undefined;
    try {
      handle = options.createTimeoutSignal?.(transport.timeoutMilliseconds);
    } catch {
      throw createError(timeoutFactoryFailure());
    }
    try {
      let resolvedAuthentication: HttpAuthenticationConfiguration | undefined;
      if (options.resolveAuthentication !== undefined) {
        try {
          resolvedAuthentication = await waitForRequestDeadline(
            Promise.resolve().then(() =>
              options.resolveAuthentication?.({ operation: operationRoute }),
            ),
            handle,
          );
        } catch (reason) {
          throw createError(
            isDeadlineFailure(reason)
              ? classifyTransportFailure(reason)
              : authenticationRefreshFailure(),
          );
        }
      }
      let authentication: HttpRequestAuthenticationProjection | undefined;
      let headers: Record<string, string>;
      try {
        const authenticationConfiguration = resolvedAuthentication ?? transport.authentication;
        const currentTimeMilliseconds =
          authenticationConfiguration?.kind === 'same-origin-session'
            ? undefined
            : transport.currentTimeMilliseconds?.();
        if (currentTimeMilliseconds !== undefined && !Number.isFinite(currentTimeMilliseconds)) {
          throw new TypeError('The configured transport clock returned an invalid time.');
        }
        authentication =
          authenticationConfiguration === undefined
            ? undefined
            : projectAuthentication(authenticationConfiguration, currentTimeMilliseconds);
        headers = createRequestHeaders(
          authentication?.headers,
          options.requestHeaders?.(),
          target.operationHeader,
        );
      } catch (reason) {
        throw createError(
          isAuthenticationLifetimeFailure(reason)
            ? authenticationLifetimeInvalid()
            : invalidRequest(),
        );
      }
      let response: HttpResponseLike;
      try {
        response = await waitForRequestDeadline(
          options.fetchImplementation(target.url, {
            body,
            credentials: authentication?.credentials ?? transport.credentials,
            headers,
            method: 'POST',
            ...(handle === undefined ? {} : { signal: handle.signal }),
          }),
          handle,
        );
      } catch (reason) {
        throw createError(
          isInvalidRequestTransportFailure(reason)
            ? invalidRequest()
            : classifyTransportFailure(reason),
        );
      }
      if (response.contentType === undefined || !isJsonContentType(response.contentType)) {
        throw createError(malformedResponse());
      }

      let bodyText: string;
      try {
        bodyText = await waitForRequestDeadline(
          response.text(transport.maximumResponseBytes),
          handle,
        );
      } catch (reason) {
        throw createError(
          isResponseLimitFailure(reason)
            ? responseTooLarge()
            : isDeadlineFailure(reason)
              ? classifyTransportFailure(reason)
              : malformedResponse(),
        );
      }
      if (utf8ByteLength(bodyText) > transport.maximumResponseBytes) {
        throw createError(responseTooLarge());
      }
      if (response.status >= 200 && response.status < 300) {
        const parsed = parseJson(bodyText);
        if (
          !isHostPortResult(parsed) ||
          (options.validateSchema !== undefined &&
            !safelyValidate(options.validateSchema, responseSchema, parsed))
        ) {
          throw createError(malformedResponse());
        }
        const result: HostPortResult<TValue> = {
          ...(parsed.revision === undefined ? {} : { revision: parsed.revision }),
          value: parsed.value as TValue,
        };
        return result;
      }

      const parsed = parseJson(bodyText);
      if (isHostPortError(parsed)) {
        if (!hasCanonicalTransportFailureInvariants(parsed)) {
          throw createError(malformedResponse());
        }
        // The host authored a canonical error; transport it verbatim.
        throw new HostPortFailure(parsed);
      }
      if (claimsHostPortError(parsed)) {
        // A body that identifies itself as the versioned host-error wire shape
        // cannot fall through to status-only interpretation when its closed
        // fields or cross-field semantics are invalid.
        throw createError(malformedResponse());
      }
      throw createError(statusFailure(response.status));
    } finally {
      safelyReleaseTimeoutHandle(handle);
    }
  }

  return {
    artifact: {
      dependencies(
        reference: ArtifactReference,
        context: HostRequestContext,
      ): Promise<HostPortResult<ArtifactReference[]>> {
        return call('artifact', 'dependencies', { reference: asJson(reference) }, context);
      },
      load(
        reference: ArtifactReference,
        context: HostRequestContext,
      ): Promise<HostPortResult<StudioArtifact>> {
        return call('artifact', 'load', { reference: asJson(reference) }, context);
      },
      publish(
        reference: ArtifactReference,
        context: HostRequestContext,
      ): Promise<HostPortResult<null>> {
        return call('artifact', 'publish', { reference: asJson(reference) }, context);
      },
      save(document: StudioArtifact, context: HostRequestContext): Promise<HostPortResult<null>> {
        return call('artifact', 'save', { document: asJson(document) }, context);
      },
      unpublish(
        reference: ArtifactReference,
        context: HostRequestContext,
      ): Promise<HostPortResult<null>> {
        return call('artifact', 'unpublish', { reference: asJson(reference) }, context);
      },
    },
    authoring: {
      listTypes(
        query: AuthoringTypeListQuery,
        context: HostRequestContext,
      ): Promise<HostPortResult<AuthoringTypeListPage>> {
        return call(
          'authoring',
          'list-types',
          { query: asJson(query) },
          context,
          AUTHORING_HTTP_OPERATIONS.listTypes.requestSchema,
          AUTHORING_HTTP_OPERATIONS.listTypes.responseSchema,
        );
      },
      planSave(
        intent: AuthoringSaveIntent,
        context: HostRequestContext,
      ): Promise<HostPortResult<AuthoringSavePlan>> {
        return call(
          'authoring',
          'plan-save',
          { intent: asJson(intent) },
          context,
          AUTHORING_HTTP_OPERATIONS.planSave.requestSchema,
          AUTHORING_HTTP_OPERATIONS.planSave.responseSchema,
        );
      },
      resolveTarget(
        request: AuthoringTargetResolveRequest,
        context: HostRequestContext,
      ): Promise<HostPortResult<AuthoringTargetResolution>> {
        return call(
          'authoring',
          'resolve-target',
          { request: asJson(request) },
          context,
          AUTHORING_HTTP_OPERATIONS.resolveTarget.requestSchema,
          AUTHORING_HTTP_OPERATIONS.resolveTarget.responseSchema,
        );
      },
      saveAsNewType(
        request: AuthoringSaveAsNewTypeRequest,
        context: HostRequestContext,
      ): Promise<HostPortResult<AuthoringSaveResult>> {
        return call(
          'authoring',
          'save-as-new-type',
          { request: asJson(request) },
          context,
          AUTHORING_HTTP_OPERATIONS.saveAsNewType.requestSchema,
          AUTHORING_HTTP_OPERATIONS.saveAsNewType.responseSchema,
        );
      },
      saveItem(
        request: AuthoringSaveItemRequest,
        context: HostRequestContext,
      ): Promise<HostPortResult<AuthoringSaveResult>> {
        return call(
          'authoring',
          'save-item',
          { request: asJson(request) },
          context,
          AUTHORING_HTTP_OPERATIONS.saveItem.requestSchema,
          AUTHORING_HTTP_OPERATIONS.saveItem.responseSchema,
        );
      },
      saveNewTypeVersion(
        request: AuthoringSaveNewTypeVersionRequest,
        context: HostRequestContext,
      ): Promise<HostPortResult<AuthoringSaveResult>> {
        return call(
          'authoring',
          'save-new-type-version',
          { request: asJson(request) },
          context,
          AUTHORING_HTTP_OPERATIONS.saveNewTypeVersion.requestSchema,
          AUTHORING_HTTP_OPERATIONS.saveNewTypeVersion.responseSchema,
        );
      },
      start(
        request: AuthoringStartRequest,
        context: HostRequestContext,
      ): Promise<HostPortResult<AuthoringSessionSnapshot>> {
        return call(
          'authoring',
          'start',
          { request: asJson(request) },
          context,
          AUTHORING_HTTP_OPERATIONS.start.requestSchema,
          AUTHORING_HTTP_OPERATIONS.start.responseSchema,
        );
      },
    },
    localization: {
      messages(
        locale: string,
        namespaces: QualifiedName[],
        context: HostRequestContext,
      ): Promise<HostPortResult<Record<QualifiedName, string>>> {
        return call('localization', 'messages', { locale, namespaces }, context);
      },
    },
    media: {
      abortUpload(uploadId: string, context: HostRequestContext): Promise<HostPortResult<null>> {
        return call('media', 'abort-upload', { uploadId }, context);
      },
      authorizeUpload(
        request: MediaUploadRequestDescriptor,
        context: HostRequestContext,
      ): Promise<HostPortResult<MediaUploadGrant>> {
        return call('media', 'authorize-upload', { request: asJson(request) }, context);
      },
      completeUpload(
        uploadId: string,
        context: HostRequestContext,
      ): Promise<HostPortResult<MediaUploadAcceptedAsset>> {
        return call('media', 'complete-upload', { uploadId }, context);
      },
      get(
        assetId: string,
        context: HostRequestContext,
      ): Promise<HostPortResult<MediaAsset | null>> {
        return call('media', 'get', { assetId }, context);
      },
      importExternal(
        url: string,
        context: HostRequestContext,
      ): Promise<HostPortResult<MediaUploadAcceptedAsset>> {
        return call('media', 'import-external', { url }, context);
      },
      list(query: MediaQuery, context: HostRequestContext): Promise<HostPortResult<MediaPage>> {
        return call('media', 'list', { query: asJson(query) }, context);
      },
      uploadStatus(
        assetId: string,
        context: HostRequestContext,
      ): Promise<HostPortResult<MediaUploadAcceptedAsset>> {
        return call('media', 'upload-status', { assetId }, context);
      },
    },
    model: {
      get(
        reference: ArtifactReference,
        context: HostRequestContext,
      ): Promise<HostPortResult<ContentModelDocument>> {
        return call('model', 'get', { reference: asJson(reference) }, context);
      },
      list(context: HostRequestContext): Promise<HostPortResult<ContentModelDocument[]>> {
        return call('model', 'list', {}, context);
      },
    },
    permission: {
      explain(
        operation: QualifiedName,
        context: HostRequestContext,
      ): Promise<HostPortResult<PermissionExplanation>> {
        return call('permission', 'explain', { operation }, context);
      },
      refresh(context: HostRequestContext): Promise<HostPortResult<PermissionSnapshot>> {
        return call('permission', 'refresh', {}, context);
      },
    },
    preview: {
      cancel(draftDigest: string, context: HostRequestContext): Promise<HostPortResult<null>> {
        return call('preview', 'cancel', { draftDigest }, context);
      },
      render(
        payload: PreviewRenderPayload,
        context: HostRequestContext,
      ): Promise<HostPortResult<PreviewRenderedPayload>> {
        return call('preview', 'render', { payload: asJson(payload) }, context);
      },
    },
    recovery: {
      discard(context: HostRequestContext): Promise<HostPortResult<null>> {
        return call('recovery', 'discard', {}, context);
      },
      load(context: HostRequestContext): Promise<HostPortResult<JsonObject | null>> {
        return call('recovery', 'load', {}, context);
      },
      store(envelope: JsonObject, context: HostRequestContext): Promise<HostPortResult<null>> {
        return call('recovery', 'store', { envelope }, context);
      },
    },
    resource: {
      search(
        query: ResourceSearchQuery,
        context: HostRequestContext,
      ): Promise<HostPortResult<ResourceSearchPage>> {
        return call('resource', 'search', { query: asJson(query) }, context);
      },
    },
    telemetry: {
      emit(event: TelemetryEvent, context: HostRequestContext): Promise<HostPortResult<null>> {
        return call('telemetry', 'emit', { event: asJson(event) }, context);
      },
    },
  };
}

function claimsHostPortError(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    (value as { readonly kind?: unknown }).kind === 'host-error'
  );
}

/** Serializable typed values cross the wire as their JSON projections. */
function asJson(value: unknown): JsonObject {
  return JSON.parse(JSON.stringify(value)) as JsonObject;
}

function parseJson(text: string): unknown {
  try {
    return parseJsonRejectingDuplicateMembers(text, 64);
  } catch {
    return undefined;
  }
}

function hasCanonicalTransportFailureInvariants(error: HostPortError): boolean {
  if (error.revision !== undefined && error.category !== 'conflict') {
    return false;
  }
  return (
    error.retryAfterMilliseconds === undefined ||
    (error.retryable && (error.category === 'rate-limited' || error.category === 'unavailable'))
  );
}

function isHostPortResult(value: unknown): value is { revision?: string; value: unknown } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  if (!Object.hasOwn(record, 'value')) {
    return false;
  }
  const revision = record.revision;
  if (revision !== undefined && (typeof revision !== 'string' || revision.length === 0)) {
    return false;
  }
  return Object.keys(record).every((key) => key === 'value' || key === 'revision');
}

function classifyTransportFailure(reason: unknown): FailureShape {
  if (isDeadlineFailure(reason)) {
    // The injected deadline signal fired before the host answered.
    return {
      category: 'unavailable',
      defaultMessage: 'The host did not respond within the transport deadline.',
      key: 'studio.transport/http-timeout',
      retryable: true,
    };
  }
  return {
    category: 'unavailable',
    defaultMessage: 'The host could not be reached.',
    key: 'studio.transport/http-unreachable',
    retryable: true,
  };
}

function isDeadlineFailure(reason: unknown): boolean {
  const name =
    typeof reason === 'object' && reason !== null && 'name' in reason ? reason.name : undefined;
  return name === 'AbortError' || name === 'TimeoutError';
}

function isInvalidRequestTransportFailure(reason: unknown): boolean {
  const name =
    typeof reason === 'object' && reason !== null && 'name' in reason ? reason.name : undefined;
  return name === 'InvalidRequestError';
}

interface AbortSignalProjection {
  readonly aborted: boolean;
  readonly reason?: unknown;
  addEventListener(
    type: 'abort',
    listener: () => void,
    options?: { readonly once?: boolean },
  ): void;
  removeEventListener(type: 'abort', listener: () => void): void;
}

async function waitForRequestDeadline<TValue>(
  work: PromiseLike<TValue>,
  handle: HttpTimeoutHandle | undefined,
): Promise<TValue> {
  if (handle?.deadline !== undefined) {
    return Promise.race([Promise.resolve(work), Promise.resolve(handle.deadline)]);
  }
  const signal = asAbortSignalProjection(handle?.signal);
  if (signal === undefined) {
    return work;
  }
  if (signal.aborted) {
    throw abortReason(signal.reason);
  }
  let abortListener = (): void => undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    abortListener = (): void => reject(abortReason(signal.reason));
    signal.addEventListener('abort', abortListener, { once: true });
  });
  try {
    return await Promise.race([Promise.resolve(work), deadline]);
  } finally {
    signal.removeEventListener('abort', abortListener);
  }
}

function asAbortSignalProjection(value: unknown): AbortSignalProjection | undefined {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('aborted' in value) ||
    typeof value.aborted !== 'boolean' ||
    !('addEventListener' in value) ||
    typeof value.addEventListener !== 'function' ||
    !('removeEventListener' in value) ||
    typeof value.removeEventListener !== 'function'
  ) {
    return undefined;
  }
  return value as AbortSignalProjection;
}

function abortReason(reason: unknown): Error {
  if (isDeadlineFailure(reason)) {
    return reason as Error;
  }
  const error = new Error('The Studio host request exceeded its deadline.');
  error.name = 'TimeoutError';
  return error;
}

function safelyReleaseTimeoutHandle(handle: HttpTimeoutHandle | undefined): void {
  try {
    handle?.release?.();
  } catch {
    // Cleanup cannot replace the canonical outcome of authentication,
    // transport, response parsing, or a host-authored failure.
  }
}

function malformedResponse(): FailureShape {
  return {
    category: 'internal',
    defaultMessage: 'The host response could not be interpreted.',
    key: 'studio.transport/http-malformed-response',
    retryable: false,
  };
}

function invalidRequest(): FailureShape {
  return {
    category: 'invalid-request',
    defaultMessage: 'The Studio request does not match the host transport contract.',
    key: 'studio.transport/http-invalid-request',
    retryable: false,
  };
}

function authenticationRefreshFailure(): FailureShape {
  return {
    category: 'unavailable',
    defaultMessage: 'The request authentication material could not be refreshed.',
    key: 'studio.transport/http-authentication-unavailable',
    retryable: true,
  };
}

function authenticationLifetimeInvalid(): FailureShape {
  return {
    category: 'unauthenticated',
    defaultMessage: 'The configured request authentication material is not currently valid.',
    key: 'studio.transport/http-authentication-invalid-lifetime',
    retryable: false,
  };
}

function missingRoute(): FailureShape {
  return {
    category: 'incompatible',
    defaultMessage: 'The requested host operation has no configured transport route.',
    key: 'studio.transport/http-route-unavailable',
    retryable: false,
  };
}

function schemaValidatorFailure(): FailureShape {
  return {
    category: 'internal',
    defaultMessage: 'The Studio transport schema validator failed.',
    key: 'studio.transport/http-schema-validator-failed',
    retryable: false,
  };
}

function timeoutFactoryFailure(): FailureShape {
  return {
    category: 'internal',
    defaultMessage: 'The Studio transport deadline could not be initialized.',
    key: 'studio.transport/http-timeout-factory-failed',
    retryable: false,
  };
}

function responseTooLarge(): FailureShape {
  return {
    category: 'limit-exceeded',
    defaultMessage: 'The host response exceeds the configured transport limit.',
    key: 'studio.transport/http-response-too-large',
    retryable: false,
  };
}

function safelyValidate(
  validator: HttpSchemaValidator,
  schemaReference: string,
  value: unknown,
): boolean {
  try {
    return validator(schemaReference, value);
  } catch {
    return false;
  }
}

function isResponseLimitFailure(reason: unknown): boolean {
  return (
    typeof reason === 'object' &&
    reason !== null &&
    'name' in reason &&
    reason.name === 'ResponseLimitError'
  );
}

function isJsonContentType(value: string): boolean {
  return value.split(';', 1)[0]?.trim().toLowerCase() === 'application/json';
}

function normalizeTransport(
  configuration: HttpHostTransportConfiguration,
  options: ConfiguredHttpHostAdapterOptions,
): NormalizedHttpTransport {
  if (configuration.kind !== 'http') {
    throw new TypeError('A canonical HTTP transport configuration is required.');
  }
  assertOnlyObjectMembers(
    configuration,
    ['authentication', 'kind', 'maximumResponseBytes', 'requestTimeoutMilliseconds', 'routing'],
    'HTTP transport configuration',
  );
  const timeoutMilliseconds = configuration.requestTimeoutMilliseconds ?? 10_000;
  const maximumResponseBytes = configuration.maximumResponseBytes ?? 64 * 1024 * 1024;
  assertBoundedSafeInteger(timeoutMilliseconds, 100, 120_000, 'requestTimeoutMilliseconds');
  assertBoundedSafeInteger(maximumResponseBytes, 1024, 64 * 1024 * 1024, 'maximumResponseBytes');
  if (typeof options.currentTimeMilliseconds !== 'function') {
    throw new TypeError('Configured HTTP transports require an injected deterministic clock.');
  }
  const authentication = cloneAuthentication(configuration.authentication);
  return {
    authentication,
    credentials: 'omit',
    currentTimeMilliseconds: options.currentTimeMilliseconds,
    maximumResponseBytes,
    resolveTarget: normalizeRouting(configuration.routing),
    timeoutMilliseconds,
  };
}

function normalizeRouting(
  routing: HttpHostRoutingConfiguration,
): (operation: HttpHostOperationRoute) => HttpRequestTarget | undefined {
  if (typeof routing !== 'object' || routing === null) {
    throw new TypeError('A canonical HTTP routing configuration is required.');
  }
  if (routing.kind === 'single-endpoint') {
    assertOnlyObjectMembers(routing, ['endpoint', 'kind'], 'single-endpoint routing');
    const endpoint = assertExactEndpoint(routing.endpoint, 'routing.endpoint');
    return (operation): HttpRequestTarget => ({ operationHeader: operation, url: endpoint });
  }
  if (routing.kind !== 'operation-map') {
    throw new TypeError('Unknown HTTP routing configuration.');
  }
  assertOnlyObjectMembers(routing, ['endpoints', 'kind'], 'operation-map routing');
  if (typeof routing.endpoints !== 'object' || routing.endpoints === null) {
    throw new TypeError('routing.endpoints must be an object.');
  }
  const endpointByOperation: Partial<Record<HttpHostOperationRoute, string>> = {};
  const knownOperations = new Set<HttpHostOperationRoute>(HTTP_HOST_OPERATION_ROUTES);
  for (const [operation, endpoint] of Object.entries(routing.endpoints)) {
    if (!knownOperations.has(operation as HttpHostOperationRoute)) {
      throw new TypeError('routing.endpoints contains an unknown operation.');
    }
    endpointByOperation[operation as HttpHostOperationRoute] = assertExactEndpoint(
      endpoint,
      `routing.endpoints.${operation}`,
    );
  }
  return (operation): HttpRequestTarget | undefined => {
    const url = endpointByOperation[operation];
    return url === undefined ? undefined : { url };
  };
}

function assertBoundedSafeInteger(
  value: number,
  minimum: number,
  maximum: number,
  name: string,
): void {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new TypeError(`${name} must be a safe integer from ${minimum} through ${maximum}.`);
  }
}

function assertOnlyObjectMembers(
  value: object,
  allowedMembers: readonly string[],
  name: string,
): void {
  const allowed = new Set(allowedMembers);
  if (Object.keys(value).some((member) => !allowed.has(member))) {
    throw new TypeError(`${name} contains an unknown member.`);
  }
}

function assertExactEndpoint(value: unknown, name: string): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 2048 ||
    value.trim() !== value ||
    /\s/u.test(value) ||
    value.includes('#') ||
    value.includes('\\')
  ) {
    throw new TypeError(
      `${name} must be an exact HTTP(S) URL reference without whitespace or a fragment.`,
    );
  }

  const queryStart = value.indexOf('?');
  const locator = queryStart === -1 ? value : value.slice(0, queryStart);
  if (locator.length === 0) {
    throw new TypeError(`${name} must contain a non-empty HTTP endpoint path.`);
  }
  let path: string;
  if (locator.startsWith('https://') || locator.startsWith('http://')) {
    const schemeEnd = locator.indexOf('://') + 3;
    const pathStart = locator.indexOf('/', schemeEnd);
    const authority =
      pathStart === -1 ? locator.slice(schemeEnd) : locator.slice(schemeEnd, pathStart);
    assertCanonicalAuthority(authority, name);
    path = pathStart === -1 ? '' : locator.slice(pathStart);
  } else {
    if (locator.startsWith('//') || /^[A-Za-z][A-Za-z0-9+.-]*:/u.test(locator)) {
      throw new TypeError(`${name} must be an HTTP(S) URL or a same-origin path.`);
    }
    path = locator;
  }

  if (path.includes('//') || /%(?:2f|5c)/iu.test(path)) {
    throw new TypeError(`${name} path must not contain ambiguous separators.`);
  }
  for (const segment of path.split('/')) {
    const decodedDots = segment.replaceAll(/%2e/giu, '.');
    if (decodedDots === '.' || decodedDots === '..') {
      throw new TypeError(`${name} path must not contain dot segments.`);
    }
  }
  return value;
}

function assertCanonicalAuthority(authority: string, name: string): void {
  if (
    authority.length === 0 ||
    authority !== authority.toLowerCase() ||
    authority.includes('@') ||
    authority.includes('%') ||
    authority.endsWith('.')
  ) {
    throw new TypeError(`${name} must contain one canonical host without embedded credentials.`);
  }
  const bracketed = /^(\[[0-9a-f:.]+\])(?::([0-9]+))?$/u.exec(authority);
  const named = /^([a-z0-9](?:[a-z0-9.-]*[a-z0-9])?)(?::([0-9]+))?$/u.exec(authority);
  const match = bracketed ?? named;
  if (match === null || named?.[1]?.includes('..') === true) {
    throw new TypeError(`${name} must contain a canonical HTTP host.`);
  }
  const port = match[2];
  if (
    port !== undefined &&
    (port !== String(Number(port)) || Number(port) < 1 || Number(port) > 65_535)
  ) {
    throw new TypeError(`${name} must contain a canonical HTTP port.`);
  }
}

function projectAuthentication(
  configuration: HttpAuthenticationConfiguration,
  currentTimeMilliseconds?: number,
): HttpRequestAuthenticationProjection {
  if (typeof configuration !== 'object' || configuration === null) {
    throw new TypeError('A canonical HTTP authentication configuration is required.');
  }
  let credentials: HttpRequestInit['credentials'];
  let headerName: string;
  let headerValue: string;
  switch (configuration.kind) {
    case 'same-origin-session':
      assertOnlyObjectMembers(
        configuration,
        ['credentials', 'csrf', 'kind'],
        'same-origin session authentication',
      );
      if (
        configuration.credentials !== 'same-origin' ||
        typeof configuration.csrf !== 'object' ||
        configuration.csrf === null
      ) {
        throw new TypeError('Invalid same-origin session authentication configuration.');
      }
      assertOnlyObjectMembers(configuration.csrf, ['headerName', 'token'], 'CSRF configuration');
      credentials = 'same-origin';
      headerName = assertCustomAuthenticationHeaderName(
        configuration.csrf.headerName,
        'csrf.headerName',
      );
      headerValue = assertOpaqueHeaderToken(configuration.csrf.token, 4096, 'csrf.token');
      break;
    case 'bearer-token':
      assertOnlyObjectMembers(
        configuration,
        ['credentials', 'expiresAt', 'issuedAt', 'kind', 'token'],
        'bearer-token authentication',
      );
      if (configuration.credentials !== 'omit') {
        throw new TypeError('Bearer authentication must omit ambient credentials.');
      }
      assertStudioTokenLifetime(configuration, currentTimeMilliseconds);
      credentials = 'omit';
      headerName = 'authorization';
      headerValue = `Bearer ${assertOpaqueHeaderToken(configuration.token, 8192, 'authentication.token')}`;
      break;
    case 'header-token':
      assertOnlyObjectMembers(
        configuration,
        ['credentials', 'expiresAt', 'headerName', 'issuedAt', 'kind', 'token'],
        'header-token authentication',
      );
      if (configuration.credentials !== 'omit') {
        throw new TypeError('Header-token authentication must omit ambient credentials.');
      }
      assertStudioTokenLifetime(configuration, currentTimeMilliseconds);
      credentials = 'omit';
      headerName = assertCustomAuthenticationHeaderName(
        configuration.headerName,
        'authentication.headerName',
      );
      headerValue = assertOpaqueHeaderToken(configuration.token, 8192, 'authentication.token');
      break;
    default:
      throw new TypeError('Unknown HTTP authentication configuration.');
  }
  const headers: Record<string, string> = {};
  appendRequestHeaders(headers, { [headerName]: headerValue });
  return { credentials, headers };
}

function cloneAuthentication(
  configuration: HttpAuthenticationConfiguration,
): HttpAuthenticationConfiguration {
  projectAuthentication(configuration);
  switch (configuration.kind) {
    case 'same-origin-session': {
      const value = configuration.csrf.token;
      return {
        credentials: 'same-origin',
        csrf: {
          headerName: configuration.csrf.headerName,
          token: value,
        },
        kind: 'same-origin-session',
      };
    }
    case 'bearer-token': {
      const value = configuration.token;
      return {
        credentials: 'omit',
        expiresAt: configuration.expiresAt,
        issuedAt: configuration.issuedAt,
        kind: 'bearer-token',
        token: value,
      };
    }
    case 'header-token': {
      const value = configuration.token;
      return {
        credentials: 'omit',
        expiresAt: configuration.expiresAt,
        headerName: configuration.headerName,
        issuedAt: configuration.issuedAt,
        kind: 'header-token',
        token: value,
      };
    }
  }
}

function assertOpaqueHeaderToken(value: unknown, maximumLength: number, name: string): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > maximumLength ||
    /\s/u.test(value) ||
    hasInvalidHeaderValue(value)
  ) {
    throw new TypeError(`${name} must be one bounded HTTP ByteString token.`);
  }
  return value;
}

function assertCustomAuthenticationHeaderName(value: unknown, name: string): string {
  if (typeof value !== 'string') {
    throw new TypeError(`${name} must be a safe custom HTTP field name.`);
  }
  const normalized = value.toLowerCase();
  if (
    value.length > 100 ||
    !/^[!#$%&'*+.^_`|~0-9a-z-]+$/u.test(normalized) ||
    normalized === 'accept' ||
    normalized === 'authorization' ||
    normalized === 'content-type' ||
    normalized === 'x-studio-operation' ||
    !isSafeRequestHeaderName(normalized)
  ) {
    throw new TypeError(`${name} must be a safe custom HTTP field name.`);
  }
  return value;
}

function createRequestHeaders(
  authentication: Readonly<Record<string, string>> | undefined,
  supplied: Readonly<Record<string, string>> | undefined,
  operationHeader: HttpHostOperationRoute | undefined,
): Record<string, string> {
  const headers: Record<string, string> = {};
  appendRequestHeaders(headers, authentication);
  appendRequestHeaders(headers, supplied);
  if (operationHeader !== undefined) {
    if (Object.hasOwn(headers, 'x-studio-operation')) {
      throw new TypeError('Transport-owned HTTP headers cannot be overridden.');
    }
    headers['x-studio-operation'] = operationHeader;
  }
  headers.accept = 'application/json';
  headers['content-type'] = 'application/json';
  return headers;
}

function appendRequestHeaders(
  headers: Record<string, string>,
  supplied: Readonly<Record<string, string>> | undefined,
): void {
  const entries = Object.entries(supplied ?? {});
  if (entries.length > 100) {
    throw new TypeError('Too many HTTP request headers.');
  }
  for (const [name, value] of entries) {
    const normalized = name.toLowerCase();
    if (
      name.length > 100 ||
      !/^[!#$%&'*+.^_`|~0-9a-z-]+$/u.test(normalized) ||
      typeof value !== 'string' ||
      value.length > 8192 ||
      value.trim() !== value ||
      hasInvalidHeaderValue(value) ||
      !isSafeRequestHeaderName(normalized)
    ) {
      throw new TypeError('Invalid HTTP request header.');
    }
    if (
      normalized === 'accept' ||
      normalized === 'content-type' ||
      normalized === 'x-studio-operation'
    ) {
      throw new TypeError('Transport-owned HTTP headers cannot be overridden.');
    }
    if (Object.hasOwn(headers, normalized)) {
      throw new TypeError('Duplicate HTTP request header.');
    }
    headers[normalized] = value;
  }
}

function hasInvalidHeaderValue(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 8 || (code >= 10 && code <= 31) || code === 127 || code > 255) {
      return true;
    }
  }
  return false;
}

function isSafeRequestHeaderName(name: string): boolean {
  if (
    name.startsWith('proxy-') ||
    name.startsWith('sec-') ||
    name.startsWith('access-control-') ||
    name === 'forwarded' ||
    name.startsWith('x-forwarded-')
  ) {
    return false;
  }
  switch (name) {
    case 'connection':
    case 'content-length':
    case 'cookie':
    case 'date':
    case 'expect':
    case 'host':
    case 'keep-alive':
    case 'origin':
    case 'referer':
    case 'set-cookie':
    case 'te':
    case 'trailer':
    case 'transfer-encoding':
    case 'upgrade':
    case 'user-agent':
    case 'via':
      return false;
    default:
      return true;
  }
}

/** Platform-free UTF-8 byte count used for the transport response limit. */
function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    bytes += codePoint <= 0x7f ? 1 : codePoint <= 0x7ff ? 2 : codePoint <= 0xffff ? 3 : 4;
  }
  return bytes;
}

function statusFailure(status: number): FailureShape {
  const category = categoryForStatus(status);
  return {
    category,
    defaultMessage: 'The host rejected the request.',
    key: `studio.transport/http-status-${category}`,
    retryable: category === 'rate-limited' || category === 'unavailable',
  };
}

function categoryForStatus(status: number): HostErrorCategory {
  switch (status) {
    case 401:
      return 'unauthenticated';
    case 403:
      return 'forbidden';
    case 404:
      return 'not-found';
    case 408:
      return 'unavailable';
    case 409:
      return 'conflict';
    case 413:
      return 'limit-exceeded';
    case 422:
      return 'validation-failed';
    case 429:
      return 'rate-limited';
    case 502:
    case 503:
    case 504:
      return 'unavailable';
    default:
      if (status >= 400 && status < 500) {
        return 'invalid-request';
      }
      return 'internal';
  }
}
