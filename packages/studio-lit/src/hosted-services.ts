import {
  HTTP_HOST_OPERATION_ROUTES,
  STUDIO_RESOURCE_SEARCH_LIMITS,
  type HttpHostOperationRoute,
  type StudioHostSessionIdentifierFactories,
} from '@kumwe/studio-core';
import type { MediaProvider } from '@kumwe/studio-media';
import {
  STUDIO_CONTRACT_VERSION,
  type AuthoringTargetResolution,
  type HostAdapter,
  type HostPortCapability,
  type HostRequestContext,
  type MediaAsset,
  type MediaPage,
  type MediaQuery,
  type QualifiedName,
  type ResourceSearchPage,
  type ResourceSearchQuery,
  type StudioConfiguration,
  type StudioHostedDeploymentConfiguration,
} from '@kumwe/studio-protocol';
import type { StudioMediaAuthoringServices } from './media-authoring-control.js';
import {
  createHostedMediaUploadTransportFactory,
  type StudioHostedMediaGrantTransfer,
} from './hosted-media-upload.js';
import type {
  StudioResourceSearchService,
  StudioResourceTypeOption,
} from './resource-authoring-control.js';
import { parseStudioResourceSearchPage } from './resource-authoring-control.js';

const MEDIA_PORT = 'studio.port/media';
const PREVIEW_PORT = 'studio.port/preview';
const RESOURCE_PORT = 'studio.port/resource';
const MEDIA_GET = 'studio.operation/media.get';
const MEDIA_IMPORT_EXTERNAL = 'studio.operation/media.import-external';
const MEDIA_LIST = 'studio.operation/media.list';
const MEDIA_UPLOAD_OPERATIONS = Object.freeze([
  'studio.operation/media.abort-upload',
  'studio.operation/media.authorize-upload',
  'studio.operation/media.complete-upload',
] as const satisfies readonly QualifiedName[]);
const PREVIEW_OPERATIONS = Object.freeze([
  'studio.operation/preview.cancel',
  'studio.operation/preview.render',
] as const satisfies readonly QualifiedName[]);
const RESOURCE_SEARCH = 'studio.operation/resource.search';
const STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/u;
const QUALIFIED_NAME = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*\/[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/u;
const LOCAL_NAME = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/u;
const MEDIA_TYPE = /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/u;
const KNOWN_OPERATION_ROUTES = new Map<QualifiedName, HttpHostOperationRoute>(
  HTTP_HOST_OPERATION_ROUTES.map((route) => [
    `studio.operation/${route.replace('/', '.')}` as QualifiedName,
    route,
  ]),
);

export interface StudioHostedBrowserServiceOptions {
  readonly currentTimeMilliseconds?: () => number;
  readonly mediaGrantTransfer?: StudioHostedMediaGrantTransfer;
}

export interface StudioHostedBrowserServices {
  readonly media: StudioMediaAuthoringServices | undefined;
  readonly resourceSearchService: StudioResourceSearchService | undefined;
}

/**
 * Share one request-identity namespace across contextual authoring and the
 * browser services mounted beside it. Custom deterministic factories remain a
 * test/precompiled seam, but cannot reuse one identifier across operations.
 */
export function coordinateHostedIdentifiers(
  source: StudioHostSessionIdentifierFactories,
): StudioHostSessionIdentifierFactories {
  const requestIds = new Set<string>();
  const idempotencyKeys = new Set<string>();
  return Object.freeze({
    idempotencyKey(operationId: QualifiedName): string {
      return uniqueIdentifier(
        source.idempotencyKey(operationId),
        idempotencyKeys,
        'idempotency key',
      );
    },
    requestId(operationId: QualifiedName): string {
      return uniqueIdentifier(source.requestId(operationId), requestIds, 'request ID');
    },
  });
}

/**
 * Every standard operation the host advertises must have an exact configured
 * route. A single endpoint is inherently complete; an operation map may not
 * defer failure until a user presses a control.
 */
export function assertHostedCapabilityRoutes(
  configuration: StudioHostedDeploymentConfiguration,
): void {
  const routing = configuration.transport.routing;
  for (const port of configuration.session.hostCapabilities.ports) {
    assertPortOperationOwnership(port);
    if (routing.kind === 'single-endpoint') continue;
    for (const operation of port.operations) {
      const route = KNOWN_OPERATION_ROUTES.get(operation);
      if (route !== undefined && routing.endpoints[route] === undefined) {
        throw new TypeError(
          `The host advertises ${operation} without configuring its exact ${route} route.`,
        );
      }
    }
  }
}

/** Compose only browser services backed by this exact resolved host session. */
export function createHostedBrowserServices(
  adapter: HostAdapter,
  configuration: StudioHostedDeploymentConfiguration,
  resolution: AuthoringTargetResolution,
  identifiers: StudioHostSessionIdentifierFactories,
  options: StudioHostedBrowserServiceOptions = {},
): StudioHostedBrowserServices {
  const session = configuration.session;
  const resourcePort = findPort(session, RESOURCE_PORT);
  const mediaPort = findPort(session, MEDIA_PORT);
  const previewPort = findPort(session, PREVIEW_PORT);

  const resourceSearchService = createResourceSearchService(
    adapter,
    session,
    resolution,
    identifiers,
    resourcePort,
  );
  const media = createMediaServices(
    adapter,
    session,
    identifiers,
    mediaPort,
    options.mediaGrantTransfer,
    options.currentTimeMilliseconds,
  );
  assertConfiguredPreviewSupport(session, previewPort);

  return Object.freeze({ media, resourceSearchService });
}

function createResourceSearchService(
  adapter: HostAdapter,
  session: StudioConfiguration,
  resolution: AuthoringTargetResolution,
  identifiers: StudioHostSessionIdentifierFactories,
  port: HostPortCapability | undefined,
): StudioResourceSearchService | undefined {
  if (!port?.operations.includes(RESOURCE_SEARCH)) return undefined;
  if (adapter.resource === undefined) {
    throw new TypeError(
      'The host advertises resource search but its adapter has no resource port.',
    );
  }
  const resourceTypes: StudioResourceTypeOption[] = resolution.target.resourceTypes.map((id) => ({
    id,
    label: { defaultMessage: id, key: id },
  }));
  const admittedResourceTypes = new Set(resourceTypes.map(({ id }) => id));
  return Object.freeze({
    resourceTypes: Object.freeze(resourceTypes),
    async search(
      query: Readonly<ResourceSearchQuery>,
      signal: AbortSignal,
    ): Promise<ResourceSearchPage> {
      assertResourceSearchQuery(query);
      if (!admittedResourceTypes.has(query.resourceType)) {
        throw new TypeError(
          'Resource search refused a type outside the resolved authoring target.',
        );
      }
      const context = createServiceContext(session, identifiers, RESOURCE_SEARCH);
      const result = await abortable(
        adapter.resource?.search(structuredClone(query), context) ??
          Promise.reject(new TypeError('The resource port became unavailable.')),
        signal,
      );
      return parseStudioResourceSearchPage(result.value, query);
    },
  });
}

function assertResourceSearchQuery(query: Readonly<ResourceSearchQuery>): void {
  if (
    !isRecord(query) ||
    !hasOnly(query, ['cursor', 'limit', 'resourceType', 'search']) ||
    !Number.isSafeInteger(query.limit) ||
    query.limit < STUDIO_RESOURCE_SEARCH_LIMITS.minimumLimit ||
    query.limit > STUDIO_RESOURCE_SEARCH_LIMITS.maximumLimit ||
    typeof query.resourceType !== 'string' ||
    query.resourceType.length > 160 ||
    !QUALIFIED_NAME.test(query.resourceType) ||
    (query.cursor !== undefined &&
      (typeof query.cursor !== 'string' ||
        query.cursor.length < 1 ||
        query.cursor.length > STUDIO_RESOURCE_SEARCH_LIMITS.maximumCursorLength)) ||
    (query.search !== undefined &&
      (typeof query.search !== 'string' ||
        query.search.length > STUDIO_RESOURCE_SEARCH_LIMITS.maximumSearchLength))
  ) {
    throw new TypeError('The hosted resource search query is malformed or out of bounds.');
  }
}

function createMediaServices(
  adapter: HostAdapter,
  session: StudioConfiguration,
  identifiers: StudioHostSessionIdentifierFactories,
  port: HostPortCapability | undefined,
  grantTransfer: StudioHostedMediaGrantTransfer | undefined,
  currentTimeMilliseconds: (() => number) | undefined,
): StudioMediaAuthoringServices | undefined {
  if (port === undefined) {
    if (grantTransfer !== undefined) {
      throw new TypeError('A media grant transfer requires an advertised Studio media port.');
    }
    return undefined;
  }
  const supportsGet = port.operations.includes(MEDIA_GET);
  const supportsList = port.operations.includes(MEDIA_LIST);
  if (supportsGet !== supportsList) {
    throw new TypeError('Studio media browsing requires both media.get and media.list.');
  }
  const advertisedUploadOperations = MEDIA_UPLOAD_OPERATIONS.filter((operation) =>
    port.operations.includes(operation),
  );
  const supportsExternalImport = port.operations.includes(MEDIA_IMPORT_EXTERNAL);
  if (
    advertisedUploadOperations.length !== 0 &&
    advertisedUploadOperations.length !== MEDIA_UPLOAD_OPERATIONS.length
  ) {
    throw new TypeError(
      'Studio media upload requires abort-upload, authorize-upload, and complete-upload together.',
    );
  }
  if (advertisedUploadOperations.length > 0 && !supportsGet) {
    throw new TypeError('Studio media upload controls also require media.get and media.list.');
  }
  if (advertisedUploadOperations.length > 0 && !session.features.clipboardMediaUpload) {
    throw new TypeError(
      'The host advertises media byte intake while clipboardMediaUpload is disabled.',
    );
  }
  if (supportsExternalImport && !session.features.externalMediaImport) {
    throw new TypeError(
      'The host advertises external media import while externalMediaImport is disabled.',
    );
  }
  if (advertisedUploadOperations.length > 0 && grantTransfer === undefined) {
    throw new TypeError(
      'The host advertises media upload but did not supply a precompiled grant byte transfer.',
    );
  }
  if (grantTransfer !== undefined && advertisedUploadOperations.length === 0) {
    throw new TypeError(
      'A browser media grant transfer requires advertised media upload operations.',
    );
  }
  if (!supportsGet) return undefined;
  if (adapter.media === undefined) {
    throw new TypeError('The host advertises media browsing but its adapter has no media port.');
  }

  const provider: MediaProvider = Object.freeze({
    async get(assetId: string, signal?: AbortSignal): Promise<MediaAsset | null> {
      const result = await optionallyAbortable(
        adapter.media?.get(assetId, createServiceContext(session, identifiers, MEDIA_GET)) ??
          Promise.reject(new TypeError('The media port became unavailable.')),
        signal,
      );
      return parseMediaAsset(result.value);
    },
    async list(query: MediaQuery, signal?: AbortSignal): Promise<MediaPage> {
      const result = await optionallyAbortable(
        adapter.media?.list(
          structuredClone(query),
          createServiceContext(session, identifiers, MEDIA_LIST),
        ) ?? Promise.reject(new TypeError('The media port became unavailable.')),
        signal,
      );
      return parseMediaPage(result.value, query.limit);
    },
    upload(): Promise<MediaAsset> {
      return Promise.reject(
        new TypeError('Hosted media upload is orchestrated by the field control grant lifecycle.'),
      );
    },
  });
  return Object.freeze({
    provider,
    ...(grantTransfer === undefined
      ? {}
      : {
          uploadTransportFactory: createHostedMediaUploadTransportFactory(
            adapter.media,
            session,
            identifiers,
            grantTransfer,
            currentTimeMilliseconds,
          ),
        }),
    uploadsEnabled: grantTransfer !== undefined,
  });
}

function assertConfiguredPreviewSupport(
  session: StudioConfiguration,
  port: HostPortCapability | undefined,
): void {
  if (!session.preview.enabled) return;
  if (
    port === undefined ||
    PREVIEW_OPERATIONS.some((operation) => !port.operations.includes(operation))
  ) {
    throw new TypeError(
      'Enabled hosted preview requires advertised preview.render and preview.cancel.',
    );
  }
  throw new TypeError(
    'Enabled HTTP preview is unavailable until the configured preview port can stage the complete draft; an opaque browser binding cannot replace that route.',
  );
}

function assertPortOperationOwnership(port: HostPortCapability): void {
  const knownPortPrefix = portRoutePrefix(port.id);
  if (knownPortPrefix === undefined) return;
  for (const operation of port.operations) {
    const route = KNOWN_OPERATION_ROUTES.get(operation);
    if (route !== undefined && !route.startsWith(knownPortPrefix)) {
      throw new TypeError(`${port.id} cannot advertise the unrelated ${operation} operation.`);
    }
  }
}

function portRoutePrefix(portId: QualifiedName): string | undefined {
  const prefix = 'studio.port/';
  if (!portId.startsWith(prefix)) return undefined;
  const candidate = `${portId.slice(prefix.length)}/`;
  return HTTP_HOST_OPERATION_ROUTES.some((route) => route.startsWith(candidate))
    ? candidate
    : undefined;
}

function findPort(session: StudioConfiguration, id: QualifiedName): HostPortCapability | undefined {
  return session.hostCapabilities.ports.find((entry) => entry.id === id);
}

function createServiceContext(
  session: StudioConfiguration,
  identifiers: StudioHostSessionIdentifierFactories,
  operationId: QualifiedName,
): HostRequestContext {
  return {
    locale: session.locale.resolved,
    operationId,
    protocolVersion: session.protocolVersion,
    requestId: identifiers.requestId(operationId),
    resourceContextKey: session.resourceContext.key,
    sessionGeneration: session.sessionGeneration,
  };
}

function uniqueIdentifier(value: string, used: Set<string>, label: string): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 240 ||
    !STABLE_ID.test(value) ||
    ['__proto__', 'prototype', 'constructor'].includes(value)
  ) {
    throw new TypeError(`The hosted ${label} factory returned a non-canonical value.`);
  }
  if (used.has(value)) {
    throw new TypeError(`The hosted ${label} factory reused a value in one Studio session.`);
  }
  used.add(value);
  return value;
}

async function optionallyAbortable<TValue>(
  promise: Promise<TValue>,
  signal: AbortSignal | undefined,
): Promise<TValue> {
  return signal === undefined ? promise : abortable(promise, signal);
}

async function abortable<TValue>(promise: Promise<TValue>, signal: AbortSignal): Promise<TValue> {
  if (signal.aborted) throw aborted();
  let onAbort = (): void => undefined;
  const cancellation = new Promise<never>((_resolve, reject) => {
    onAbort = (): void => reject(aborted());
    signal.addEventListener('abort', onAbort, { once: true });
  });
  try {
    return await Promise.race([promise, cancellation]);
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
}

function aborted(): Error {
  const error = new Error('The hosted Studio service request was cancelled.');
  error.name = 'AbortError';
  return error;
}

function parseMediaPage(value: unknown, limit: number): MediaPage {
  if (
    !isRecord(value) ||
    !hasOnly(value, ['assets', 'nextCursor']) ||
    !Array.isArray(value.assets)
  ) {
    throw new TypeError('The media host returned a malformed page.');
  }
  if (value.assets.length > limit) {
    throw new RangeError('The media host returned more assets than requested.');
  }
  const assets = value.assets.map((asset) => {
    const parsed = parseMediaAsset(asset);
    if (parsed === null) throw new TypeError('A media list cannot contain a null asset.');
    return parsed;
  });
  if (new Set(assets.map((asset) => asset.id)).size !== assets.length) {
    throw new TypeError('The media host returned duplicate assets.');
  }
  if (
    value.nextCursor !== undefined &&
    (typeof value.nextCursor !== 'string' ||
      value.nextCursor.length < 1 ||
      value.nextCursor.length > 500)
  ) {
    throw new TypeError('The media host returned a malformed cursor.');
  }
  return {
    assets: structuredClone(assets),
    ...(value.nextCursor === undefined ? {} : { nextCursor: value.nextCursor }),
  };
}

function parseMediaAsset(value: unknown): MediaAsset | null {
  if (value === null) return null;
  if (
    !isRecord(value) ||
    !hasOnly(value, [
      'byteSize',
      'contractVersion',
      'extensions',
      'filename',
      'id',
      'kind',
      'mediaKind',
      'mediaType',
      'metadata',
      'renditions',
      'revision',
      'state',
    ]) ||
    value.contractVersion !== STUDIO_CONTRACT_VERSION ||
    value.kind !== 'media-asset' ||
    !isStableId(value.id) ||
    !isRevision(value.revision) ||
    !['archived', 'processing', 'quarantined', 'ready', 'rejected'].includes(String(value.state)) ||
    !['archive', 'audio', 'document', 'image', 'other', 'video'].includes(
      String(value.mediaKind),
    ) ||
    !isMediaType(value.mediaType) ||
    !isInteger(value.byteSize, 0, 1_099_511_627_776) ||
    typeof value.filename !== 'string' ||
    value.filename.length < 1 ||
    value.filename.length > 500 ||
    !isMediaMetadata(value.metadata) ||
    !isRenditions(value.renditions) ||
    !isExtensions(value.extensions)
  ) {
    throw new TypeError('The media host returned a malformed asset.');
  }
  return structuredClone(value) as unknown as MediaAsset;
}

function isMediaMetadata(value: unknown): boolean {
  if (
    !isRecord(value) ||
    !hasOnly(value, [
      'altText',
      'caption',
      'credit',
      'decorative',
      'durationMilliseconds',
      'focalPoint',
      'height',
      'license',
      'width',
    ])
  ) {
    return false;
  }
  return (
    isOptionalString(value.altText, 5_000) &&
    isOptionalString(value.caption, 20_000) &&
    isOptionalString(value.credit, 2_000) &&
    (value.decorative === undefined || typeof value.decorative === 'boolean') &&
    (value.durationMilliseconds === undefined ||
      isInteger(value.durationMilliseconds, 0, 864_000_000)) &&
    (value.height === undefined || isInteger(value.height, 1, 1_000_000)) &&
    isOptionalString(value.license, 500) &&
    (value.width === undefined || isInteger(value.width, 1, 1_000_000)) &&
    (value.focalPoint === undefined || isFocalPoint(value.focalPoint))
  );
}

function isRenditions(value: unknown): boolean {
  if (value === undefined) return true;
  if (!Array.isArray(value) || value.length > 100) return false;
  const identities = new Set<string>();
  for (const rendition of value) {
    if (
      !isRecord(rendition) ||
      !hasOnly(rendition, ['height', 'id', 'mediaType', 'width']) ||
      !isLocalName(rendition.id) ||
      !isMediaType(rendition.mediaType) ||
      !isInteger(rendition.height, 1, 1_000_000) ||
      !isInteger(rendition.width, 1, 1_000_000) ||
      identities.has(rendition.id)
    ) {
      return false;
    }
    identities.add(rendition.id);
  }
  return true;
}

function isExtensions(value: unknown): boolean {
  if (value === undefined) return true;
  if (!isRecord(value) || Object.keys(value).length > 100) return false;
  return Object.keys(value).every((key) => QUALIFIED_NAME.test(key));
}

function isFocalPoint(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasOnly(value, ['x', 'y']) &&
    Object.keys(value).length === 2 &&
    isUnit(value.x) &&
    isUnit(value.y)
  );
}

function isUnit(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function isInteger(value: unknown, minimum: number, maximum: number): boolean {
  return Number.isSafeInteger(value) && Number(value) >= minimum && Number(value) <= maximum;
}

function isOptionalString(value: unknown, maximum: number): boolean {
  return value === undefined || (typeof value === 'string' && value.length <= maximum);
}

function isStableId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length >= 1 &&
    value.length <= 240 &&
    STABLE_ID.test(value) &&
    !['__proto__', 'prototype', 'constructor'].includes(value)
  );
}

function isRevision(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 1 && value.length <= 200;
}

function isLocalName(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 100 && LOCAL_NAME.test(value);
}

function isMediaType(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 200 && MEDIA_TYPE.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

function hasOnly(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}
