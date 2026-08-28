import type { MediaUploadChunk, MediaUploadTransport } from '@kumwe/studio-media';
import type {
  HostRequestContext,
  MediaHostPort,
  MediaUploadAcceptedAsset,
  MediaUploadGrant,
  MediaUploadPlan,
  MediaUploadRequestDescriptor,
  QualifiedName,
  StudioConfiguration,
} from '@kumwe/studio-protocol';
import {
  isStudioTokenLifetimeValid,
  type StudioHostSessionIdentifierFactories,
} from '@kumwe/studio-core';

const ABORT_UPLOAD = 'studio.operation/media.abort-upload';
const AUTHORIZE_UPLOAD = 'studio.operation/media.authorize-upload';
const COMPLETE_UPLOAD = 'studio.operation/media.complete-upload';
const MAXIMUM_MEDIA_BYTES = 1_099_511_627_776;
const STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/u;

/**
 * The only host-specific part of a configured browser upload: move one byte
 * chunk to the exact short-lived destination returned by media.authorizeUpload.
 * This seam cannot authorize, complete, abort, or choose an API route.
 */
export interface StudioHostedMediaGrantTransfer {
  transfer(
    grant: Readonly<MediaUploadGrant>,
    chunk: Readonly<StudioHostedMediaGrantChunk>,
    signal?: AbortSignal,
  ): Promise<void>;
}

/** Bytes and their grant-relative offset; local Studio session identity is never exposed. */
export interface StudioHostedMediaGrantChunk {
  readonly data: Blob;
  readonly offset: number;
}

/** Allocate one adapter-owned lifecycle per media control. */
export function createHostedMediaUploadTransportFactory(
  port: MediaHostPort,
  session: StudioConfiguration,
  identifiers: StudioHostSessionIdentifierFactories,
  bytes: StudioHostedMediaGrantTransfer,
  currentTimeMilliseconds: () => number = () => Date.now(),
): () => MediaUploadTransport {
  return (): MediaUploadTransport =>
    new AdapterBackedMediaUploadTransport(
      port,
      session,
      identifiers,
      bytes,
      currentTimeMilliseconds,
    );
}

class AdapterBackedMediaUploadTransport implements MediaUploadTransport {
  readonly #bytes: StudioHostedMediaGrantTransfer;
  readonly #currentTimeMilliseconds: () => number;
  readonly #identifiers: StudioHostSessionIdentifierFactories;
  readonly #maximumBytes: number;
  readonly #port: MediaHostPort;
  readonly #session: StudioConfiguration;
  #authorizing = false;
  #byteSize = 0;
  #grant: MediaUploadGrant | undefined;
  #grantIssuedAt: string | undefined;
  #localSessionId: string | undefined;
  #nextOffset = 0;
  #pendingAbortSessionId: string | undefined;

  public constructor(
    port: MediaHostPort,
    session: StudioConfiguration,
    identifiers: StudioHostSessionIdentifierFactories,
    bytes: StudioHostedMediaGrantTransfer,
    currentTimeMilliseconds: () => number,
  ) {
    this.#port = port;
    this.#session = session;
    this.#identifiers = identifiers;
    this.#bytes = bytes;
    this.#currentTimeMilliseconds = currentTimeMilliseconds;
    this.#maximumBytes = assertMediaUploadLimit(session.limits.maxMediaUploadBytes);
  }

  public async abort(sessionId: string): Promise<void> {
    assertStableIdentifier(sessionId, 'local media upload session');
    if (this.#authorizing) {
      this.#pendingAbortSessionId = sessionId;
      return;
    }
    const grant = this.#grant;
    if (grant === undefined) return;
    this.#bindLocalSession(sessionId);
    await this.#abortGrantBestEffort(grant);
  }

  public async authorize(
    request: MediaUploadRequestDescriptor,
    signal?: AbortSignal,
  ): Promise<MediaUploadPlan> {
    if (this.#authorizing || this.#grant !== undefined) {
      throw new TypeError('This media upload transport already has an active grant.');
    }
    assertRequestedUploadSize(request.byteSize, this.#maximumBytes);
    throwIfAborted(signal);
    this.#authorizing = true;
    this.#pendingAbortSessionId = undefined;
    this.#byteSize = request.byteSize;
    this.#nextOffset = 0;
    try {
      const result = await this.#port.authorizeUpload(
        structuredClone(request),
        this.#context(AUTHORIZE_UPLOAD),
      );
      const receivedAtMilliseconds = this.#now();
      let validated: ValidatedMediaGrant;
      try {
        validated = parseGrant(result.value, {
          issuedAtMilliseconds: receivedAtMilliseconds,
          maximumBytes: this.#maximumBytes,
          requestedBytes: request.byteSize,
        });
      } catch (error) {
        await this.#abortReturnedGrantBestEffort(result.value);
        throw error;
      }
      const { grant, issuedAt } = validated;
      if (signal?.aborted === true || this.#pendingAbortSessionId !== undefined) {
        await this.#abortGrantBestEffort(grant);
        throw aborted();
      }
      this.#grant = grant;
      this.#grantIssuedAt = issuedAt;
      return structuredClone(grant.plan);
    } catch (error) {
      this.#reset();
      throw error;
    } finally {
      this.#authorizing = false;
    }
  }

  public async finalize(
    sessionId: string,
    signal?: AbortSignal,
  ): Promise<MediaUploadAcceptedAsset> {
    const activeGrant = this.#grant;
    try {
      throwIfAborted(signal);
      const grant = this.#requireGrant();
      this.#bindLocalSession(sessionId);
      if (this.#nextOffset !== this.#byteSize) {
        throw new TypeError('The media upload cannot complete before every byte is transferred.');
      }
      const result = await this.#port.completeUpload(
        grant.uploadId,
        this.#context(COMPLETE_UPLOAD),
      );
      const accepted = parseAcceptedAsset(result.value);
      this.#reset();
      return accepted;
    } catch (error) {
      if (activeGrant === undefined) this.#reset();
      else await this.#abortGrantBestEffort(activeGrant);
      throw error;
    }
  }

  public async transfer(chunk: MediaUploadChunk, signal?: AbortSignal): Promise<void> {
    const activeGrant = this.#grant;
    try {
      throwIfAborted(signal);
      const grant = this.#requireGrant();
      this.#bindLocalSession(chunk.sessionId);
      if (!Number.isSafeInteger(chunk.offset) || chunk.offset !== this.#nextOffset) {
        throw new TypeError('Media upload chunks must be contiguous and ordered.');
      }
      if (chunk.data.size < 1 || chunk.offset + chunk.data.size > this.#byteSize) {
        throw new TypeError('The media upload chunk exceeds its authorized request.');
      }
      await this.#bytes.transfer(
        structuredClone(grant),
        { data: chunk.data, offset: chunk.offset },
        signal,
      );
      throwIfAborted(signal);
      this.#nextOffset += chunk.data.size;
    } catch (error) {
      if (activeGrant === undefined) this.#reset();
      else await this.#abortGrantBestEffort(activeGrant);
      throw error;
    }
  }

  async #abortGrantBestEffort(grant: MediaUploadGrant): Promise<void> {
    await this.#abortUploadIdBestEffort(grant.uploadId);
  }

  async #abortUploadIdBestEffort(uploadId: string): Promise<void> {
    this.#reset();
    try {
      await this.#port.abortUpload(uploadId, this.#context(ABORT_UPLOAD));
    } catch {
      // A failed revocation cannot retain local authority or replace the terminal error.
    }
  }

  async #abortReturnedGrantBestEffort(value: unknown): Promise<void> {
    if (!isRecord(value) || !isStableIdentifier(value.uploadId)) return;
    await this.#abortUploadIdBestEffort(value.uploadId);
  }

  #bindLocalSession(sessionId: string): void {
    assertStableIdentifier(sessionId, 'local media upload session');
    if (this.#localSessionId === undefined) {
      this.#localSessionId = sessionId;
    } else if (this.#localSessionId !== sessionId) {
      throw new TypeError('A media grant cannot be reused by another upload session.');
    }
  }

  #context(operationId: QualifiedName): HostRequestContext {
    return {
      locale: this.#session.locale.resolved,
      operationId,
      protocolVersion: this.#session.protocolVersion,
      requestId: this.#identifiers.requestId(operationId),
      resourceContextKey: this.#session.resourceContext.key,
      sessionGeneration: this.#session.sessionGeneration,
    };
  }

  #requireGrant(): MediaUploadGrant {
    const grant = this.#grant;
    const issuedAt = this.#grantIssuedAt;
    if (grant === undefined || issuedAt === undefined) {
      throw new TypeError('The media upload has no active host grant.');
    }
    assertGrantCurrent(grant, issuedAt, this.#now());
    return grant;
  }

  #now(): number {
    const value = this.#currentTimeMilliseconds();
    if (!Number.isFinite(value)) {
      throw new TypeError('The hosted media grant clock returned an invalid time.');
    }
    return value;
  }

  #reset(): void {
    this.#byteSize = 0;
    this.#grant = undefined;
    this.#grantIssuedAt = undefined;
    this.#localSessionId = undefined;
    this.#nextOffset = 0;
    this.#pendingAbortSessionId = undefined;
  }
}

interface MediaGrantPolicy {
  readonly issuedAtMilliseconds: number;
  readonly maximumBytes: number;
  readonly requestedBytes: number;
}

interface ValidatedMediaGrant {
  readonly grant: MediaUploadGrant;
  readonly issuedAt: string;
}

function parseGrant(value: MediaUploadGrant, policy: MediaGrantPolicy): ValidatedMediaGrant {
  if (
    !isRecord(value) ||
    !hasOnly(value, ['expiresAt', 'headers', 'method', 'plan', 'uploadId', 'url']) ||
    !isStableIdentifier(value.uploadId) ||
    !['POST', 'PUT'].includes(value.method) ||
    !isGrantUrl(value.url) ||
    !isHeaderMap(value.headers) ||
    !isUploadPlan(value.plan)
  ) {
    throw new TypeError('The media host returned a malformed upload grant.');
  }
  const issuedAtDate = new Date(policy.issuedAtMilliseconds);
  if (Number.isNaN(issuedAtDate.getTime())) {
    throw new TypeError('The hosted media grant clock returned an invalid time.');
  }
  const issuedAt = issuedAtDate.toISOString();
  if (
    !isStudioTokenLifetimeValid(
      { expiresAt: value.expiresAt, issuedAt },
      policy.issuedAtMilliseconds,
    )
  ) {
    throw new TypeError('The media host returned an expired or overlong upload grant.');
  }
  if (value.plan.maximumBytes > policy.maximumBytes) {
    throw new RangeError('The media upload grant exceeds the resolved session byte limit.');
  }
  if (value.plan.maximumBytes < policy.requestedBytes) {
    throw new RangeError('The media upload grant does not cover the exact requested byte size.');
  }
  return { grant: structuredClone(value), issuedAt };
}

function parseAcceptedAsset(value: MediaUploadAcceptedAsset): MediaUploadAcceptedAsset {
  if (
    !isRecord(value) ||
    !hasOnly(value, ['id', 'revision', 'state']) ||
    !isStableIdentifier(value.id) ||
    typeof value.revision !== 'string' ||
    value.revision.length < 1 ||
    value.revision.length > 200 ||
    !['processing', 'quarantined', 'ready', 'rejected'].includes(value.state)
  ) {
    throw new TypeError('The media host returned a malformed accepted asset.');
  }
  return structuredClone(value);
}

function assertGrantCurrent(
  grant: MediaUploadGrant,
  issuedAt: string,
  currentTimeMilliseconds: number,
): void {
  if (
    !isStudioTokenLifetimeValid({ expiresAt: grant.expiresAt, issuedAt }, currentTimeMilliseconds)
  ) {
    throw new TypeError('The media upload grant has expired.');
  }
}

function isUploadPlan(value: unknown): value is MediaUploadPlan {
  return (
    isRecord(value) &&
    hasOnly(value, ['chunkBytes', 'maximumBytes', 'resumable']) &&
    Number.isSafeInteger(value.maximumBytes) &&
    Number(value.maximumBytes) > 0 &&
    Number(value.maximumBytes) <= MAXIMUM_MEDIA_BYTES &&
    (value.chunkBytes === undefined ||
      (Number.isSafeInteger(value.chunkBytes) &&
        Number(value.chunkBytes) >= 1_024 &&
        Number(value.chunkBytes) <= Number(value.maximumBytes))) &&
    typeof value.resumable === 'boolean'
  );
}

function isGrantUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2_000) return false;
  try {
    const parsed = new URL(value);
    return (
      parsed.protocol === 'https:' &&
      parsed.username.length === 0 &&
      parsed.password.length === 0 &&
      parsed.hash.length === 0
    );
  } catch {
    return false;
  }
}

function isHeaderMap(value: unknown): value is Record<string, string> | undefined {
  if (value === undefined) return true;
  if (!isRecord(value) || Object.keys(value).length > 20) return false;
  return Object.entries(value).every(
    ([name, headerValue]) =>
      name.length >= 1 &&
      name.length <= 100 &&
      /^[A-Za-z][A-Za-z0-9-]*$/u.test(name) &&
      typeof headerValue === 'string' &&
      headerValue.length <= 2_000 &&
      !/[\r\n]/u.test(headerValue),
  );
}

function assertMediaUploadLimit(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > MAXIMUM_MEDIA_BYTES) {
    throw new TypeError('The resolved media upload byte limit is invalid.');
  }
  return value;
}

function assertRequestedUploadSize(value: number, maximumBytes: number): void {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximumBytes) {
    throw new RangeError('The requested media upload exceeds the resolved session byte limit.');
  }
}

function assertStableIdentifier(value: string, label: string): void {
  if (!isStableIdentifier(value)) {
    throw new TypeError(`The ${label} is not canonical.`);
  }
}

function isStableIdentifier(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length >= 1 &&
    value.length <= 240 &&
    STABLE_ID.test(value) &&
    !['__proto__', 'prototype', 'constructor'].includes(value)
  );
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted === true) throw aborted();
}

function aborted(): Error {
  const error = new Error('The hosted media upload was cancelled.');
  error.name = 'AbortError';
  return error;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

function hasOnly(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}
