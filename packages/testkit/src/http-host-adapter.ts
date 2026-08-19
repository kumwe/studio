import {
  isHostPortError,
  STUDIO_CONTRACT_VERSION,
  type ArtifactReference,
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
  type StudioArtifact,
  type TelemetryEvent,
} from '@kumwe/studio-protocol';
import { TestbedHostError } from './host-testbed.js';

/**
 * Minimal structural view of an HTTP response the adapter needs: the status
 * code and the raw body text. Deliberately narrower than any platform
 * response class so implementations from any runtime satisfy it.
 */
export interface HttpResponseLike {
  status: number;
  text(): Promise<string>;
}

/** The request shape the adapter hands to the injected transport. */
export interface HttpRequestInit {
  body: string;
  headers: Record<string, string>;
  method: 'POST';
  /** Opaque abort signal produced by the injected timeout factory, if any. */
  signal?: unknown;
}

/**
 * The injected fetch-like transport — the adapter's portability seam.
 *
 * Testkit source is deliberately free of host globals (no fetch, no DOM, no
 * Node), so the embedder supplies the platform transport: a Node test injects
 * a `node:http`-backed implementation, a browser host would inject the
 * platform fetch, and either stays outside this package. The function must
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
  release?(): void;
  signal: unknown;
}

export interface HttpHostAdapterOptions {
  /**
   * Second half of the portability seam: mints the per-request timeout
   * signal. When omitted, requests carry no deadline. A rejection whose
   * reason is named `AbortError` or `TimeoutError` is mapped to the canonical
   * deadline failure.
   */
  createTimeoutSignal?: (timeoutMilliseconds: number) => HttpTimeoutHandle;
  fetchImplementation: HttpFetchLike;
  /** Transport deadline handed to `createTimeoutSignal`. Defaults to 10 000. */
  timeoutMilliseconds?: number;
}

interface FailureShape {
  category: HostErrorCategory;
  defaultMessage: string;
  key: QualifiedName;
  retryable: boolean;
}

/**
 * A `HostAdapter` that speaks JSON over an injected fetch-like transport to a
 * host server: every port operation becomes
 * `POST {baseUrl}/ports/{port}/{operation}` with a
 * `{ arguments, context }` JSON body.
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
 * `TestbedHostError` whose `error` satisfies `isHostPortError`, and no
 * message ever echoes response bodies, addresses, or underlying reasons.
 */
export function createHttpHostAdapter(
  baseUrl: string,
  options: HttpHostAdapterOptions,
): HostAdapter {
  const base = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const timeoutMilliseconds = options.timeoutMilliseconds ?? 10_000;
  let correlationSerial = 0;

  function createError(failure: FailureShape): TestbedHostError {
    correlationSerial += 1;
    const error: HostPortError = {
      category: failure.category,
      contractVersion: STUDIO_CONTRACT_VERSION,
      correlationId: `http-transport-${correlationSerial}`,
      kind: 'host-error',
      message: { defaultMessage: failure.defaultMessage, key: failure.key },
      retryable: failure.retryable,
    };
    return new TestbedHostError(error);
  }

  async function call<TValue>(
    portName: string,
    operation: string,
    callArguments: JsonObject,
    context: HostRequestContext,
  ): Promise<HostPortResult<TValue>> {
    const handle = options.createTimeoutSignal?.(timeoutMilliseconds);
    let response: HttpResponseLike;
    try {
      response = await options.fetchImplementation(`${base}/ports/${portName}/${operation}`, {
        body: JSON.stringify({ arguments: callArguments, context }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
        ...(handle === undefined ? {} : { signal: handle.signal }),
      });
    } catch (reason) {
      throw createError(classifyTransportFailure(reason));
    } finally {
      handle?.release?.();
    }

    let bodyText: string;
    try {
      bodyText = await response.text();
    } catch {
      throw createError(malformedResponse());
    }

    if (response.status >= 200 && response.status < 300) {
      const parsed = parseJson(bodyText);
      if (!isHostPortResult(parsed)) {
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
      // The host authored a canonical error; transport it verbatim.
      throw new TestbedHostError(parsed);
    }
    throw createError(statusFailure(response.status));
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

/** Serializable typed values cross the wire as their JSON projections. */
function asJson(value: unknown): JsonObject {
  return JSON.parse(JSON.stringify(value)) as JsonObject;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
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
  const name =
    typeof reason === 'object' && reason !== null && 'name' in reason ? reason.name : undefined;
  if (name === 'AbortError' || name === 'TimeoutError') {
    // The injected deadline signal fired before the host answered.
    return {
      category: 'unavailable',
      defaultMessage: 'The host did not respond within the transport deadline.',
      key: 'studio.testkit/http-timeout',
      retryable: true,
    };
  }
  return {
    category: 'unavailable',
    defaultMessage: 'The host could not be reached.',
    key: 'studio.testkit/http-unreachable',
    retryable: true,
  };
}

function malformedResponse(): FailureShape {
  return {
    category: 'internal',
    defaultMessage: 'The host response could not be interpreted.',
    key: 'studio.testkit/http-malformed-response',
    retryable: false,
  };
}

function statusFailure(status: number): FailureShape {
  const category = categoryForStatus(status);
  return {
    category,
    defaultMessage: 'The host rejected the request.',
    key: `studio.testkit/http-status-${category}`,
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
