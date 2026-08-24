import { canonicalStringify, validateExternalUrl } from '@kumwe/studio-core';
import {
  HostPortFailure,
  STUDIO_CONTRACT_VERSION,
  STUDIO_STALE_SESSION_GENERATION_DIAGNOSTIC_CODE,
  STUDIO_WIRE_PROTOCOL_VERSION,
  type HostAdapter,
  type HostErrorCategory,
  type HostPortError,
  type HostPortResult,
  type HostRequestContext,
  type JsonObject,
  type JsonPrimitive,
  type JsonValue,
  type MediaAsset,
  type MediaUploadAcceptedAsset,
  type MediaUploadGrant,
  type MediaUploadRequestDescriptor,
  type PermissionExplanation,
  type PreviewRenderPayload,
  type PreviewRenderedPayload,
  type QualifiedName,
  type ResourceSearchHit,
  type Revision,
  type StableId,
  type StudioArtifact,
  type StudioDiagnostic,
  type StudioWireProtocolVersion,
  type TelemetryEvent,
} from '@kumwe/studio-protocol';

export type TestbedPortName =
  | 'artifact'
  | 'localization'
  | 'media'
  | 'permission'
  | 'preview'
  | 'recovery'
  | 'resource'
  | 'telemetry';

export interface TestbedHostOptions {
  /**
   * Permits the fixture-only `studio.test/operation` wildcard used by broad
   * unit tests. Defaults to false and MUST remain false for conformance replay.
   */
  allowTestOperationId?: boolean;
  documents?: StudioArtifact[];
  initialClockMilliseconds?: number;
  mediaAssets?: MediaAsset[];
  messages?: Record<string, Record<QualifiedName, string>>;
  permissions?: QualifiedName[];
  rateLimits?: TestbedRateLimitPolicy[];
  render?: (
    payload: PreviewRenderPayload,
  ) => PreviewRenderedPayload | Promise<PreviewRenderedPayload>;
  resources?: ResourceSearchHit[];
  /** Exact live generation to seed before the first portable request. */
  sessionGeneration?: Revision;
}

/** A deterministic fixed-window policy used by portable sequence replays. */
export interface TestbedRateLimitPolicy {
  maximumRequests: number;
  operationId: QualifiedName;
  windowMilliseconds: number;
}

export interface TestbedControls {
  advanceClock(milliseconds: number): void;
  artifactStatus(id: StableId): StudioArtifact['status'] | undefined;
  disconnect(): void;
  failNext(portName: TestbedPortName, operation: string, category: HostErrorCategory): void;
  /**
   * Standalone external-import drill. The wire protocol's media port does not
   * yet carry the media contract's explicit external-import operation, so the
   * testbed exercises the canonical external-URL policy here, under the same
   * request guards as the wire ports (`failNext` targets port `media`,
   * operation `import-external`). A candidate that fails the default policy
   * rejects with a `validation-failed` host error that names the stable
   * rejection reason but never echoes the candidate URL. An accepted
   * candidate mints a deterministic asset identity in `processing` state that
   * the media port can then serve.
   */
  importExternalMedia(
    candidate: string,
    context: HostRequestContext,
  ): Promise<HostPortResult<MediaUploadAcceptedAsset>>;
  reconnect(): void;
  recoveryEnvelope(resourceContextKey: StableId): JsonObject | undefined;
  revisionOf(id: StableId): Revision | undefined;
  readonly pendingPreviewRenders: number;
  readonly previewDeliveries: readonly string[];
  readonly sessionGeneration: Revision;
  setPermissions(permissions: QualifiedName[]): void;
  readonly telemetryEvents: readonly TelemetryEvent[];
}

export interface TestbedHost {
  controls: TestbedControls;
  host: HostAdapter;
}

export interface HostRequestContextFixtureOptions {
  expectedRevision?: Revision;
  idempotencyKey?: StableId;
  locale?: string;
  operationId?: QualifiedName;
  protocolVersion?: StudioWireProtocolVersion;
  requestId?: StableId;
  resourceContextKey?: StableId;
  sessionGeneration?: Revision;
}

export class TestbedHostError extends HostPortFailure {
  public constructor(error: HostPortError) {
    super(error);
    this.name = 'TestbedHostError';
  }
}

export function createHostRequestContextFixture(
  options: HostRequestContextFixtureOptions = {},
): HostRequestContext {
  return {
    ...(options.expectedRevision === undefined
      ? {}
      : { expectedRevision: options.expectedRevision }),
    ...(options.idempotencyKey === undefined ? {} : { idempotencyKey: options.idempotencyKey }),
    ...(options.locale === undefined ? {} : { locale: options.locale }),
    operationId: options.operationId ?? 'studio.test/operation',
    protocolVersion: options.protocolVersion ?? STUDIO_WIRE_PROTOCOL_VERSION,
    requestId: options.requestId ?? 'requests/test-1',
    resourceContextKey: options.resourceContextKey ?? 'contexts/test',
    sessionGeneration: options.sessionGeneration ?? 'session-r1',
  };
}

/**
 * The permissions this reference host gates artifact mutations behind. A host
 * chooses its own names; what the contract fixes is that a mutation is
 * authorized and that a withheld permission is refused as `forbidden`.
 */
const SAVE_PERMISSION: QualifiedName = 'studio.permission/save';
const PUBLISH_PERMISSION: QualifiedName = 'studio.permission/publish';

/** Deterministic bounds the reference host authorizes uploads within. */
const UPLOAD_CHUNK_BYTES = 5_242_880;
const UPLOAD_MAXIMUM_BYTES = 52_428_800;
const GRANT_EXPIRY = '2030-01-01T00:00:00Z';
const MAXIMUM_RATE_LIMIT_REQUESTS = 1000;
const MAXIMUM_RATE_LIMIT_WINDOW_MILLISECONDS = 86_400_000;

export function createTestbedHost(options: TestbedHostOptions = {}): TestbedHost {
  const artifactStore = new Map<StableId, StoredArtifact>();
  for (const seeded of options.documents ?? []) {
    const document = cloneValue(seeded);
    if (artifactStore.has(document.id)) {
      throw new TypeError(`Testbed artifact ${document.id} is duplicated.`);
    }
    const revision = document.revision;
    artifactStore.set(document.id, {
      document,
      revision,
      serial: seededRevisionSerial(document.id, revision),
    });
  }

  const mediaAssets = cloneValue(options.mediaAssets ?? []);
  const resources = cloneValue(options.resources ?? []);
  const messageBundles = new Map<string, Record<QualifiedName, string>>(
    Object.entries(cloneValue(options.messages ?? {})),
  );
  const recoveryStore = new Map<StableId, JsonObject>();
  const telemetryEvents: TelemetryEvent[] = [];
  const injectedFailures: InjectedFailure[] = [];
  const renderCallback = options.render ?? defaultRender;
  const idempotencyRecords = new Map<string, IdempotencyRecord>();
  const pendingPreviewRenders = new Map<string, PendingPreviewRender>();
  const previewDeliveries: string[] = [];
  const rateLimitPolicies = new Map<QualifiedName, TestbedRateLimitPolicy>();
  const rateLimitWindows = new Map<QualifiedName, RateLimitWindow>();
  for (const policy of options.rateLimits ?? []) {
    if (
      !Number.isSafeInteger(policy.maximumRequests) ||
      policy.maximumRequests < 1 ||
      policy.maximumRequests > MAXIMUM_RATE_LIMIT_REQUESTS ||
      !Number.isSafeInteger(policy.windowMilliseconds) ||
      policy.windowMilliseconds < 1 ||
      policy.windowMilliseconds > MAXIMUM_RATE_LIMIT_WINDOW_MILLISECONDS
    ) {
      throw new RangeError('Testbed rate limits require positive safe-integer bounds.');
    }
    if (rateLimitPolicies.has(policy.operationId)) {
      throw new TypeError(`Testbed rate limit ${policy.operationId} is duplicated.`);
    }
    rateLimitPolicies.set(policy.operationId, { ...policy });
  }

  const uploadGrants = new Map<
    StableId,
    { grant: MediaUploadGrant; request: MediaUploadRequestDescriptor }
  >();
  const acceptedUploads = new Map<StableId, MediaUploadAcceptedAsset>();
  let uploadSerial = 0;

  let permissions = (options.permissions ?? []).slice();
  let liveGeneration = options.sessionGeneration ?? 'session-r1';
  if (!isNonEmptyString(liveGeneration) || liveGeneration.length > 200) {
    throw new TypeError('The testbed session generation must be a non-empty bounded revision.');
  }
  let generationSerial = seededRevisionSerial('session', liveGeneration);
  let connected = true;
  let correlationSerial = 0;
  let importSerial = 0;
  let clockMilliseconds = options.initialClockMilliseconds ?? 0;
  if (!Number.isSafeInteger(clockMilliseconds) || clockMilliseconds < 0) {
    throw new RangeError('The testbed logical clock must be a non-negative safe integer.');
  }

  function currentGeneration(): Revision {
    return liveGeneration;
  }

  function createError(
    category: HostErrorCategory,
    defaultMessage: string,
    extras: {
      diagnostics?: StudioDiagnostic[];
      retryAfterMilliseconds?: number;
      retryable?: boolean;
      revision?: Revision;
    } = {},
  ): HostPortError {
    correlationSerial += 1;
    return {
      category,
      contractVersion: STUDIO_CONTRACT_VERSION,
      correlationId: `testbed-correlation-${correlationSerial}`,
      kind: 'host-error',
      message: { defaultMessage, key: `studio.testbed/${category}` },
      retryable: extras.retryable ?? (category === 'rate-limited' || category === 'unavailable'),
      ...(extras.diagnostics === undefined ? {} : { diagnostics: cloneValue(extras.diagnostics) }),
      ...(extras.retryAfterMilliseconds === undefined
        ? {}
        : { retryAfterMilliseconds: extras.retryAfterMilliseconds }),
      ...(extras.revision === undefined ? {} : { revision: extras.revision }),
    };
  }

  function fail(
    category: HostErrorCategory,
    defaultMessage: string,
    extras: {
      diagnostics?: StudioDiagnostic[];
      retryAfterMilliseconds?: number;
      retryable?: boolean;
      revision?: Revision;
    } = {},
  ): never {
    throw new TestbedHostError(createError(category, defaultMessage, extras));
  }

  function guardEnvelope(
    portName: TestbedPortName,
    operation: string,
    context: HostRequestContext,
  ): void {
    if (!connected) {
      fail('unavailable', 'The testbed host is disconnected.');
    }
    if (
      !isNonEmptyString(context.requestId) ||
      !isNonEmptyString(context.operationId) ||
      !isNonEmptyString(context.resourceContextKey) ||
      !isNonEmptyString(context.sessionGeneration)
    ) {
      fail('invalid-request', 'The request context is structurally invalid.');
    }
    if (context.protocolVersion !== STUDIO_WIRE_PROTOCOL_VERSION) {
      fail('incompatible', 'The request protocol version is not supported by this testbed.');
    }
    if (context.sessionGeneration !== currentGeneration()) {
      fail('invalid-request', 'The session generation is no longer valid.', {
        diagnostics: [
          {
            code: STUDIO_STALE_SESSION_GENERATION_DIAGNOSTIC_CODE,
            message: {
              defaultMessage: 'The request belongs to an obsolete Studio session generation.',
              key: STUDIO_STALE_SESSION_GENERATION_DIAGNOSTIC_CODE,
            },
            severity: 'blocking',
          },
        ],
      });
    }
    const expectedOperationId: QualifiedName = `studio.operation/${portName}.${operation}`;
    if (
      context.operationId !== expectedOperationId &&
      !(options.allowTestOperationId === true && context.operationId === 'studio.test/operation')
    ) {
      fail('invalid-request', 'The request operation identifier does not match the invoked port.');
    }
  }

  function applyOperationalGuards(
    portName: TestbedPortName,
    operation: string,
    context: HostRequestContext,
  ): void {
    const index = injectedFailures.findIndex(
      (entry) => entry.portName === portName && entry.operation === operation,
    );
    if (index >= 0) {
      const injected = injectedFailures[index];
      injectedFailures.splice(index, 1);
      if (injected !== undefined) {
        fail(injected.category, 'The testbed injected this failure.');
      }
    }
    const policy = rateLimitPolicies.get(context.operationId);
    if (policy === undefined) {
      return;
    }
    let rateWindow = rateLimitWindows.get(context.operationId);
    if (
      rateWindow === undefined ||
      clockMilliseconds >= rateWindow.startedAtMilliseconds + policy.windowMilliseconds
    ) {
      rateWindow = { requestCount: 0, startedAtMilliseconds: clockMilliseconds };
      rateLimitWindows.set(context.operationId, rateWindow);
    }
    if (rateWindow.requestCount >= policy.maximumRequests) {
      fail('rate-limited', 'The operation has reached its deterministic request bound.', {
        retryAfterMilliseconds:
          rateWindow.startedAtMilliseconds + policy.windowMilliseconds - clockMilliseconds,
      });
    }
    rateWindow.requestCount += 1;
  }

  async function executeBody<TValue>(
    body: () => HostPortResult<TValue> | Promise<HostPortResult<TValue>>,
  ): Promise<HostPortResult<TValue>> {
    try {
      return await body();
    } catch (error) {
      if (error instanceof TestbedHostError) {
        throw error;
      }
      throw new TestbedHostError(
        createError('internal', 'The testbed operation failed unexpectedly.'),
      );
    }
  }

  function run<TValue>(
    portName: TestbedPortName,
    operation: string,
    context: HostRequestContext,
    body: () => HostPortResult<TValue> | Promise<HostPortResult<TValue>>,
  ): Promise<HostPortResult<TValue>> {
    try {
      guardEnvelope(portName, operation, context);
      applyOperationalGuards(portName, operation, context);
      return executeBody(body);
    } catch (error) {
      return executeBody(() => {
        throw error;
      });
    }
  }

  function runMutation<TValue>(
    portName: TestbedPortName,
    operation: string,
    argument: JsonValue,
    context: HostRequestContext,
    body: () => HostPortResult<TValue> | Promise<HostPortResult<TValue>>,
  ): Promise<HostPortResult<TValue>> {
    try {
      guardEnvelope(portName, operation, context);
      const idempotencyKey = context.idempotencyKey;
      if (idempotencyKey === undefined) {
        applyOperationalGuards(portName, operation, context);
        return executeBody(body);
      }

      const scope = canonicalStringify({
        idempotencyKey,
        operationId: context.operationId,
        resourceContextKey: context.resourceContextKey,
        sessionGeneration: context.sessionGeneration,
      });
      const fingerprint = canonicalStringify({
        argument,
        context: {
          ...(context.expectedRevision === undefined
            ? {}
            : { expectedRevision: context.expectedRevision }),
          ...(context.locale === undefined ? {} : { locale: context.locale }),
          protocolVersion: context.protocolVersion,
        },
      });
      const prior = idempotencyRecords.get(scope);
      if (prior !== undefined) {
        if (prior.fingerprint !== fingerprint) {
          fail('invalid-request', 'The idempotency key was already accepted for another intent.');
        }
        return prior.promise.then((result) => cloneValue(result) as HostPortResult<TValue>);
      }

      applyOperationalGuards(portName, operation, context);
      const accepted = executeBody(body).then((result) => cloneValue(result));
      idempotencyRecords.set(scope, {
        fingerprint,
        promise: accepted,
      });
      void accepted.catch(() => {
        if (idempotencyRecords.get(scope)?.promise === accepted) {
          idempotencyRecords.delete(scope);
        }
      });
      return accepted.then((result) => cloneValue(result));
    } catch (error) {
      return executeBody(() => {
        throw error;
      });
    }
  }

  /**
   * The authorization gate a production host applies to every mutation. Reads
   * are authorized by the resolved request context; mutations additionally
   * require the host-declared permission for the operation, and a withheld
   * permission is refused without disclosing whether the artifact exists.
   */
  function requireArtifactPermission(permission: QualifiedName): void {
    if (!permissions.includes(permission)) {
      fail('forbidden', 'The session does not hold the permission this operation requires.');
    }
  }

  function requireStored(id: StableId): StoredArtifact {
    const stored = artifactStore.get(id);
    if (stored === undefined) {
      fail('not-found', 'The requested artifact is not available.');
    }
    return stored;
  }

  function ensureExpectedRevision(stored: StoredArtifact, context: HostRequestContext): void {
    if (context.expectedRevision !== stored.revision) {
      fail('conflict', 'The stored artifact revision differs from the expected revision.', {
        revision: stored.revision,
      });
    }
  }

  function advanceRevision(stored: StoredArtifact): Revision {
    stored.serial += 1;
    stored.revision = `${stored.document.id}-r${stored.serial}`;
    stored.document.revision = stored.revision;
    return stored.revision;
  }

  function setStatus(
    id: StableId,
    context: HostRequestContext,
    status: 'draft' | 'published',
  ): HostPortResult<null> {
    requireArtifactPermission(PUBLISH_PERMISSION);
    const stored = requireStored(id);
    ensureExpectedRevision(stored, context);
    stored.document.status = status;
    return { revision: advanceRevision(stored), value: null };
  }

  function resolveStart(cursor: string | undefined): number {
    if (cursor === undefined) {
      return 0;
    }
    const start = decodeCursor(cursor);
    if (start === undefined) {
      fail('invalid-request', 'The pagination cursor is not valid.');
    }
    return start;
  }

  function ensureLimit(limit: number): void {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      fail('invalid-request', 'The limit must be an integer between 1 and 100.');
    }
  }

  const host: HostAdapter = {
    artifact: {
      dependencies(reference, context) {
        return run('artifact', 'dependencies', context, () => ({ value: [] }));
      },
      load(reference, context) {
        return run('artifact', 'load', context, () => {
          const stored = requireStored(reference.id);
          return { revision: stored.revision, value: cloneValue(stored.document) };
        });
      },
      publish(reference, context) {
        return runMutation('artifact', 'publish', reference as unknown as JsonValue, context, () =>
          setStatus(reference.id, context, 'published'),
        );
      },
      save(document, context) {
        return runMutation('artifact', 'save', document as unknown as JsonValue, context, () => {
          requireArtifactPermission(SAVE_PERMISSION);
          const stored = requireStored(document.id);
          ensureExpectedRevision(stored, context);
          stored.document = cloneValue(document);
          return { revision: advanceRevision(stored), value: null };
        });
      },
      unpublish(reference, context) {
        return runMutation(
          'artifact',
          'unpublish',
          reference as unknown as JsonValue,
          context,
          () => setStatus(reference.id, context, 'draft'),
        );
      },
    },
    localization: {
      messages(locale, namespaces, context) {
        return run('localization', 'messages', context, () => {
          const bundle = messageBundles.get(locale);
          if (bundle === undefined) {
            fail('not-found', 'The requested locale is not available.');
          }
          const value: Record<QualifiedName, string> = {};
          for (const [key, message] of Object.entries(bundle)) {
            const qualifiedKey = key as QualifiedName;
            if (
              namespaces.some(
                (namespace) =>
                  qualifiedKey === namespace || qualifiedKey.startsWith(`${namespace}.`),
              )
            ) {
              value[qualifiedKey] = message;
            }
          }
          return { value };
        });
      },
    },
    media: {
      abortUpload(uploadId, context) {
        return runMutation('media', 'abort-upload', uploadId, context, () => {
          if (!uploadGrants.delete(uploadId)) {
            fail('not-found', 'The requested upload is not available.');
          }
          return { value: null };
        });
      },
      authorizeUpload(request, context) {
        return runMutation(
          'media',
          'authorize-upload',
          request as unknown as JsonValue,
          context,
          () => {
            assertUploadRequest(request);
            uploadSerial += 1;
            const uploadId = `uploads/testbed-${String(uploadSerial)}`;
            const grant: MediaUploadGrant = {
              expiresAt: GRANT_EXPIRY,
              headers: { 'X-Upload-Session': uploadId },
              method: 'PUT',
              plan: {
                chunkBytes: UPLOAD_CHUNK_BYTES,
                maximumBytes: UPLOAD_MAXIMUM_BYTES,
                resumable: true,
              },
              uploadId,
              url: `https://uploads.testbed.invalid/${uploadId}`,
            };
            uploadGrants.set(uploadId, { grant, request: cloneValue(request) });
            return { value: cloneValue(grant) };
          },
        );
      },
      completeUpload(uploadId, context) {
        return runMutation('media', 'complete-upload', uploadId, context, () => {
          const pending = uploadGrants.get(uploadId);
          if (pending === undefined) {
            fail('not-found', 'The requested upload is not available.');
          }
          uploadGrants.delete(uploadId);
          // The host verifies what it received; a declared media type is
          // never trusted, so acceptance lands in `processing`.
          const accepted: MediaUploadAcceptedAsset = {
            id: `assets/${uploadId.replace('uploads/', '')}`,
            revision: `${uploadId}-r1`,
            state: 'processing',
          };
          acceptedUploads.set(accepted.id, accepted);
          return { revision: accepted.revision, value: cloneValue(accepted) };
        });
      },
      get(assetId, context) {
        return run('media', 'get', context, () => {
          const asset = mediaAssets.find((entry) => entry.id === assetId);
          const result: HostPortResult<MediaAsset | null> =
            asset === undefined
              ? { value: null }
              : { revision: asset.revision, value: cloneValue(asset) };
          return result;
        });
      },
      list(query, context) {
        return run('media', 'list', context, () => {
          ensureLimit(query.limit);
          const search = query.search?.toLowerCase();
          const filtered = mediaAssets.filter((asset) => {
            if (query.mediaTypes !== undefined && !query.mediaTypes.includes(asset.mediaType)) {
              return false;
            }
            return search === undefined || asset.filename.toLowerCase().includes(search);
          });
          const start = resolveStart(query.cursor);
          const nextIndex = start + query.limit;
          return {
            value: {
              assets: cloneValue(filtered.slice(start, nextIndex)),
              ...(nextIndex < filtered.length ? { nextCursor: encodeCursor(nextIndex) } : {}),
            },
          };
        });
      },
      importExternal(url, context) {
        return runMutation('media', 'import-external', url, context, () => {
          const verdict = validateExternalUrl(url);
          if (!verdict.ok) {
            // The stable reason is disclosed; the candidate never is.
            fail(
              'validation-failed',
              `The external media candidate was refused: ${verdict.reason}.`,
            );
          }
          importSerial += 1;
          const accepted: MediaUploadAcceptedAsset = {
            id: `assets/imported-${String(importSerial)}`,
            revision: `imports/testbed-${String(importSerial)}-r1`,
            state: 'processing',
          };
          acceptedUploads.set(accepted.id, accepted);
          return { revision: accepted.revision, value: cloneValue(accepted) };
        });
      },
      uploadStatus(assetId, context) {
        return run('media', 'upload-status', context, () => {
          const accepted = acceptedUploads.get(assetId);
          if (accepted === undefined) {
            fail('not-found', 'The requested asset is not available.');
          }
          return { revision: accepted.revision, value: cloneValue(accepted) };
        });
      },
    },
    permission: {
      explain(operation, context) {
        return run('permission', 'explain', context, () => {
          const explanation: PermissionExplanation = permissions.includes(operation)
            ? { allowed: true }
            : {
                allowed: false,
                reason: {
                  defaultMessage: 'The session does not hold this permission.',
                  key: 'studio.testbed/permission-denied',
                },
              };
          return { value: explanation };
        });
      },
      refresh(context) {
        return run('permission', 'refresh', context, () => ({
          value: { permissions: permissions.slice(), sessionGeneration: currentGeneration() },
        }));
      },
    },
    preview: {
      cancel(draftDigest, context) {
        return run('preview', 'cancel', context, () => {
          const pending = pendingPreviewRenders.get(previewRenderKey(draftDigest, context));
          pending?.cancel();
          return { value: null };
        });
      },
      render(payload, context) {
        return run('preview', 'render', context, async () => {
          const key = previewRenderKey(payload.draftDigest, context);
          if (pendingPreviewRenders.has(key)) {
            fail('invalid-request', 'A render for this draft is already in flight.');
          }
          let cancel: () => void = () => undefined;
          const cancellation = new Promise<never>((_resolve, reject) => {
            cancel = () => {
              reject(
                new TestbedHostError(
                  createError('cancelled', 'The in-flight preview render was cancelled.', {
                    retryable: false,
                  }),
                ),
              );
            };
          });
          pendingPreviewRenders.set(key, { cancel });
          try {
            const rendered = await Promise.race([
              Promise.resolve(renderCallback(cloneValue(payload))),
              cancellation,
            ]);
            if (
              rendered.draftDigest !== payload.draftDigest ||
              rendered.requestId !== payload.requestId
            ) {
              fail(
                'internal',
                'The preview renderer returned a result for a different render attempt.',
              );
            }
            previewDeliveries.push(payload.draftDigest);
            return { value: cloneValue(rendered) };
          } finally {
            pendingPreviewRenders.delete(key);
          }
        });
      },
    },
    recovery: {
      discard(context) {
        return runMutation('recovery', 'discard', null, context, () => {
          recoveryStore.delete(context.resourceContextKey);
          return { value: null };
        });
      },
      load(context) {
        return run('recovery', 'load', context, () => {
          const envelope = recoveryStore.get(context.resourceContextKey);
          const result: HostPortResult<JsonObject | null> =
            envelope === undefined ? { value: null } : { value: cloneValue(envelope) };
          return result;
        });
      },
      store(envelope, context) {
        return runMutation('recovery', 'store', envelope, context, () => {
          recoveryStore.set(context.resourceContextKey, cloneValue(envelope));
          return { value: null };
        });
      },
    },
    resource: {
      search(query, context) {
        return run('resource', 'search', context, () => {
          ensureLimit(query.limit);
          const search = query.search?.toLowerCase();
          const filtered = resources.filter((hit) => {
            if (hit.resourceType !== query.resourceType) {
              return false;
            }
            return (
              search === undefined ||
              (hit.label.defaultMessage?.toLowerCase().includes(search) ?? false)
            );
          });
          const start = resolveStart(query.cursor);
          const nextIndex = start + query.limit;
          return {
            value: {
              items: cloneValue(filtered.slice(start, nextIndex)),
              ...(nextIndex < filtered.length ? { nextCursor: encodeCursor(nextIndex) } : {}),
            },
          };
        });
      },
    },
    telemetry: {
      emit(event, context) {
        return runMutation('telemetry', 'emit', event as unknown as JsonValue, context, () => {
          if (event.attributes !== undefined) {
            for (const attribute of Object.values(event.attributes)) {
              if (!isJsonPrimitiveValue(attribute)) {
                fail('invalid-request', 'Telemetry attribute values must be JSON primitives.');
              }
            }
          }
          telemetryEvents.push(cloneValue(event));
          return { value: null };
        });
      },
    },
  };

  const controls: TestbedControls = {
    advanceClock(milliseconds: number): void {
      if (!Number.isSafeInteger(milliseconds) || milliseconds < 0) {
        throw new RangeError('Testbed clock advances must be non-negative safe integers.');
      }
      const next = clockMilliseconds + milliseconds;
      if (!Number.isSafeInteger(next)) {
        throw new RangeError('The testbed logical clock cannot exceed the safe-integer bound.');
      }
      clockMilliseconds = next;
    },
    artifactStatus(id: StableId): StudioArtifact['status'] | undefined {
      return artifactStore.get(id)?.document.status;
    },
    disconnect(): void {
      connected = false;
    },
    failNext(portName: TestbedPortName, operation: string, category: HostErrorCategory): void {
      injectedFailures.push({ category, operation, portName });
    },
    importExternalMedia(
      candidate: string,
      context: HostRequestContext,
    ): Promise<HostPortResult<MediaUploadAcceptedAsset>> {
      return run('media', 'import-external', context, () => {
        const verdict = validateExternalUrl(candidate);
        if (!verdict.ok) {
          fail(
            'validation-failed',
            `The external media source is not allowed by the URL policy (${verdict.reason}).`,
          );
        }
        importSerial += 1;
        const id = `media/import-${importSerial}`;
        const revision = `${id}-r1`;
        mediaAssets.push({
          byteSize: 0,
          contractVersion: STUDIO_CONTRACT_VERSION,
          filename: `import-${importSerial}`,
          id,
          kind: 'media-asset',
          mediaKind: 'other',
          mediaType: 'application/octet-stream',
          metadata: {},
          revision,
          state: 'processing',
        });
        return { revision, value: { id, revision, state: 'processing' } };
      });
    },
    reconnect(): void {
      connected = true;
    },
    recoveryEnvelope(resourceContextKey: StableId): JsonObject | undefined {
      const envelope = recoveryStore.get(resourceContextKey);
      return envelope === undefined ? undefined : cloneValue(envelope);
    },
    revisionOf(id: StableId): Revision | undefined {
      return artifactStore.get(id)?.revision;
    },
    get pendingPreviewRenders(): number {
      return pendingPreviewRenders.size;
    },
    get previewDeliveries(): readonly string[] {
      return previewDeliveries.slice();
    },
    get sessionGeneration(): Revision {
      return currentGeneration();
    },
    setPermissions(next: QualifiedName[]): void {
      permissions = next.slice();
      generationSerial += 1;
      liveGeneration = `session-r${generationSerial}`;
    },
    get telemetryEvents(): readonly TelemetryEvent[] {
      return cloneValue(telemetryEvents);
    },
  };

  return { controls, host };
}

interface StoredArtifact {
  document: StudioArtifact;
  revision: Revision;
  serial: number;
}

interface InjectedFailure {
  category: HostErrorCategory;
  operation: string;
  portName: TestbedPortName;
}

interface IdempotencyRecord {
  fingerprint: string;
  promise: Promise<HostPortResult<unknown>>;
}

interface PendingPreviewRender {
  cancel(): void;
}

interface RateLimitWindow {
  requestCount: number;
  startedAtMilliseconds: number;
}

function defaultRender(payload: PreviewRenderPayload): PreviewRenderedPayload {
  return {
    diagnostics: [],
    draftDigest: payload.draftDigest,
    markerMap: {},
    markers: [],
    requestId: payload.requestId,
  };
}

function previewRenderKey(draftDigest: string, context: HostRequestContext): string {
  return `${context.sessionGeneration}\u0000${context.resourceContextKey}\u0000${draftDigest}`;
}

function seededRevisionSerial(id: StableId, revision: Revision): number {
  const prefix = `${id}-r`;
  if (!revision.startsWith(prefix)) {
    return 0;
  }
  const suffix = revision.slice(prefix.length);
  const parsed = Number(suffix);
  return Number.isSafeInteger(parsed) && parsed >= 0 && String(parsed) === suffix ? parsed : 0;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isJsonPrimitiveValue(value: unknown): value is JsonPrimitive {
  return (
    value === null ||
    typeof value === 'boolean' ||
    typeof value === 'string' ||
    (typeof value === 'number' && Number.isFinite(value))
  );
}

const CURSOR_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function encodeCursor(index: number): string {
  const text = `index:${index}`;
  let encoded = '';
  for (let position = 0; position < text.length; position += 3) {
    const first = text.charCodeAt(position);
    const second = position + 1 < text.length ? text.charCodeAt(position + 1) : undefined;
    const third = position + 2 < text.length ? text.charCodeAt(position + 2) : undefined;
    const chunk = (first << 16) | ((second ?? 0) << 8) | (third ?? 0);
    encoded += CURSOR_ALPHABET.charAt((chunk >> 18) & 0x3f);
    encoded += CURSOR_ALPHABET.charAt((chunk >> 12) & 0x3f);
    encoded += second === undefined ? '=' : CURSOR_ALPHABET.charAt((chunk >> 6) & 0x3f);
    encoded += third === undefined ? '=' : CURSOR_ALPHABET.charAt(chunk & 0x3f);
  }
  return encoded;
}

function decodeCursor(cursor: string): number | undefined {
  if (cursor.length === 0 || cursor.length % 4 !== 0) {
    return undefined;
  }
  const paddingLength = cursor.endsWith('==') ? 2 : cursor.endsWith('=') ? 1 : 0;
  const body = cursor.slice(0, cursor.length - paddingLength);
  let bits = 0;
  let bitCount = 0;
  let text = '';
  for (const character of body) {
    const sextet = CURSOR_ALPHABET.indexOf(character);
    if (sextet < 0) {
      return undefined;
    }
    bits = (bits << 6) | sextet;
    bitCount += 6;
    if (bitCount >= 8) {
      bitCount -= 8;
      text += String.fromCharCode((bits >> bitCount) & 0xff);
    }
  }
  const match = /^index:(0|[1-9][0-9]*)$/u.exec(text);
  const digits = match?.[1];
  if (digits === undefined || digits.length > 9) {
    return undefined;
  }
  return Number(digits);
}

function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * The policy gate that runs before any byte moves: a declared upload larger
 * than the host's bound, or one carrying a filename the canonical shape
 * refuses, is rejected at authorization rather than after a transfer.
 */
function assertUploadRequest(request: MediaUploadRequestDescriptor): void {
  if (request.byteSize > UPLOAD_MAXIMUM_BYTES) {
    throw new TestbedHostError({
      category: 'limit-exceeded',
      contractVersion: STUDIO_CONTRACT_VERSION,
      kind: 'host-error',
      message: {
        defaultMessage: 'The declared upload exceeds the accepted size.',
        key: 'studio.testbed/limit-exceeded',
      },
      retryable: false,
    });
  }
  if (request.filename.includes('/') || request.filename.includes('\\')) {
    throw new TestbedHostError({
      category: 'validation-failed',
      contractVersion: STUDIO_CONTRACT_VERSION,
      kind: 'host-error',
      message: {
        defaultMessage: 'The declared filename is not a canonical display name.',
        key: 'studio.testbed/validation-failed',
      },
      retryable: false,
    });
  }
}
