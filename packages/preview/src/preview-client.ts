import {
  isPreviewMarker,
  isPreviewMessage,
  STUDIO_CONTRACT_VERSION,
  type PreviewMeasurePayload,
  type PreviewMeasurementsPayload,
  type PreviewMessage,
  type PreviewReadyPayload,
  type PreviewRenderedPayload,
  type PreviewRenderPayload,
  type PreviewActivatedPayload,
  type PreviewDisposePayload,
  type PreviewSelectPayload,
  type PreviewViewportPayload,
  type PreviewTeardownPayload,
  type QualifiedName,
} from '@kumwe/studio-protocol';

/** Stable client-side and wire failure surfaced by the preview channel. */
export class PreviewChannelError extends Error {
  public readonly code: QualifiedName;
  public readonly retryable: boolean;

  public constructor(code: QualifiedName, message: string, retryable = false) {
    super(message);
    this.name = 'PreviewChannelError';
    this.code = code;
    this.retryable = retryable;
  }
}

function snapshotOutboundPayload<Payload>(payload: Payload): Payload {
  try {
    return structuredClone(payload);
  } catch {
    throw new PreviewChannelError(
      'studio.preview/invalid-outbound-message',
      'Refused an invalid outbound preview message.',
    );
  }
}

export interface PreviewMessageEvent {
  data: unknown;
  origin: string;
  source: unknown;
}

export type PreviewMessageListener = (event: PreviewMessageEvent) => void;

export interface PreviewMessageSource {
  addEventListener(type: 'message', listener: PreviewMessageListener): void;
  removeEventListener(type: 'message', listener: PreviewMessageListener): void;
}

export interface PreviewMessageTarget {
  postMessage(message: unknown, targetOrigin: string): void;
}

export interface PreviewClientOptions {
  channelId: string;
  sessionGeneration: string;
  source: PreviewMessageSource;
  target: PreviewMessageTarget;
  targetOrigin: string;
  timeoutMilliseconds?: number;
}

export interface PreviewReadyOptions {
  signal?: AbortSignal;
}

export interface PreviewRenderOptions {
  signal?: AbortSignal;
}

export interface PreviewMeasureOptions {
  signal?: AbortSignal;
}

/**
 * Result of a `measure()` call. Geometry whose render digest no longer matches the
 * client's latest rendered digest is discarded and surfaced as a `stale` outcome —
 * a typed signal to re-measure, not an error.
 */
export type PreviewMeasureOutcome =
  | { geometry: PreviewMeasurementsPayload; status: 'measured' }
  | { measuredDigest: string; status: 'stale' };

export type PreviewProtocolListener = (message: PreviewMessage) => void;

interface PendingReady {
  cleanup: () => void;
  reject: (reason?: unknown) => void;
  resolve: (payload: PreviewReadyPayload) => void;
  timeout: ReturnType<typeof setTimeout>;
}

interface PendingRender {
  cleanup: () => void;
  payload: PreviewRenderPayload;
  reject: (reason?: unknown) => void;
  resolve: (result: PreviewRenderedPayload) => void;
  timeout: ReturnType<typeof setTimeout>;
}

interface PendingMeasure {
  cleanup: () => void;
  payload: PreviewMeasurePayload;
  reject: (reason?: unknown) => void;
  resolve: (outcome: PreviewMeasureOutcome) => void;
  timeout: ReturnType<typeof setTimeout>;
}

export type PreviewActivationListener = (payload: PreviewActivatedPayload) => void;

export class PreviewClient {
  readonly #activationListeners = new Set<PreviewActivationListener>();
  readonly #channelId: string;
  readonly #listener: PreviewMessageListener;
  readonly #listeners = new Set<PreviewProtocolListener>();
  readonly #markerInventory = new Set<string>();
  readonly #pending = new Map<string, PendingRender>();
  readonly #pendingMeasures = new Map<string, PendingMeasure>();
  readonly #pendingReady = new Set<PendingReady>();
  readonly #sessionGeneration: string;
  readonly #source: PreviewMessageSource;
  readonly #target: PreviewMessageTarget;
  readonly #targetOrigin: string;
  readonly #timeoutMilliseconds: number;
  readonly #usedRequestIds = new Set<string>();
  #disposed = false;
  #lastInboundSequence = -1;
  #latestRenderRequestId: string | undefined;
  #latestRenderedDigest: string | undefined;
  #readyPayload: PreviewReadyPayload | undefined;
  #sequence = 0;

  public constructor(options: PreviewClientOptions) {
    this.#targetOrigin = normalizeOrigin(options.targetOrigin);
    this.#channelId = options.channelId;
    this.#sessionGeneration = options.sessionGeneration;
    this.#source = options.source;
    this.#target = options.target;
    this.#timeoutMilliseconds = options.timeoutMilliseconds ?? 10_000;
    this.#listener = (event): void => {
      this.#receive(event);
    };
    this.#source.addEventListener('message', this.#listener);
  }

  public dispose(): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    this.#source.removeEventListener('message', this.#listener);
    for (const pending of this.#pending.values()) {
      clearTimeout(pending.timeout);
      pending.cleanup();
      pending.reject(new Error('Preview client was disposed.'));
    }
    this.#pending.clear();
    for (const pending of this.#pendingMeasures.values()) {
      clearTimeout(pending.timeout);
      pending.cleanup();
      pending.reject(new Error('Preview client was disposed.'));
    }
    this.#pendingMeasures.clear();
    for (const pending of this.#pendingReady) {
      clearTimeout(pending.timeout);
      pending.cleanup();
      pending.reject(new Error('Preview client was disposed.'));
    }
    this.#pendingReady.clear();
    this.#activationListeners.clear();
    this.#listeners.clear();
    this.#latestRenderRequestId = undefined;
    this.#latestRenderedDigest = undefined;
    this.#markerInventory.clear();
  }

  public onMessage(listener: PreviewProtocolListener): () => void {
    this.#listeners.add(listener);
    return (): void => {
      this.#listeners.delete(listener);
    };
  }

  /**
   * Resolves once the host announces `studio.preview/ready` on this channel. If the
   * announcement was already received, the cached payload resolves immediately.
   *
   * `isPreviewMessage` accepts only ready payloads carrying the exact draft wire protocol
   * version, so an announcement from an incompatible host is filtered out and never resolves
   * this promise — the wait times out instead. The promise also rejects on abort or when the
   * client is disposed.
   */
  public ready(options: PreviewReadyOptions = {}): Promise<PreviewReadyPayload> {
    if (this.#disposed) {
      return Promise.reject(new Error('Preview client was disposed.'));
    }
    if (options.signal?.aborted === true) {
      return Promise.reject(
        new Error('Preview ready wait was aborted.', { cause: options.signal.reason }),
      );
    }
    if (this.#readyPayload !== undefined) {
      return Promise.resolve(this.#readyPayload);
    }

    return new Promise<PreviewReadyPayload>((resolve, reject) => {
      const abort = (): void => {
        if (this.#pendingReady.delete(pending)) {
          clearTimeout(pending.timeout);
          pending.cleanup();
          pending.reject(new Error('Preview ready wait was aborted.'));
        }
      };
      const cleanup = (): void => {
        options.signal?.removeEventListener('abort', abort);
      };
      const timeout = setTimeout(() => {
        if (this.#pendingReady.delete(pending)) {
          pending.cleanup();
          pending.reject(new Error('Preview ready wait timed out.'));
        }
      }, this.#timeoutMilliseconds);
      const pending: PendingReady = { cleanup, reject, resolve, timeout };

      this.#pendingReady.add(pending);
      options.signal?.addEventListener('abort', abort, { once: true });
    });
  }

  public render(
    payload: PreviewRenderPayload,
    options: PreviewRenderOptions = {},
  ): Promise<PreviewRenderedPayload> {
    if (this.#disposed) {
      return Promise.reject(new Error('Preview client was disposed.'));
    }
    if (options.signal?.aborted === true) {
      return Promise.reject(
        new Error('Preview render was aborted.', { cause: options.signal.reason }),
      );
    }
    let request: PreviewRenderPayload;
    try {
      request = snapshotOutboundPayload(payload);
    } catch (error) {
      return Promise.reject(
        error instanceof Error
          ? error
          : new PreviewChannelError(
              'studio.preview/invalid-outbound-message',
              'Refused an invalid outbound preview message.',
            ),
      );
    }

    const message: PreviewMessage = {
      channelId: this.#channelId,
      contractVersion: STUDIO_CONTRACT_VERSION,
      kind: 'preview-message',
      payload: request,
      sequence: this.#sequence,
      sessionGeneration: this.#sessionGeneration,
      type: 'studio.preview/render',
    };
    try {
      this.#assertOutbound(message);
    } catch (error) {
      return Promise.reject(
        error instanceof Error
          ? error
          : new PreviewChannelError(
              'studio.preview/invalid-outbound-message',
              'Refused an invalid outbound preview message.',
            ),
      );
    }
    if (this.#usedRequestIds.has(request.requestId)) {
      return Promise.reject(
        new PreviewChannelError(
          'studio.preview/request-id-reused',
          `Preview request ${request.requestId} was already used in this session.`,
        ),
      );
    }

    for (const [requestId, pending] of this.#pending) {
      clearTimeout(pending.timeout);
      pending.cleanup();
      pending.reject(
        new Error(`Preview render ${requestId} was superseded by ${request.requestId}.`),
      );
    }
    this.#pending.clear();
    this.#rejectPendingMeasures(
      new Error(`Preview measurements were superseded by render ${request.requestId}.`),
    );
    this.#usedRequestIds.add(request.requestId);
    this.#latestRenderRequestId = request.requestId;
    this.#latestRenderedDigest = undefined;
    this.#markerInventory.clear();

    return new Promise<PreviewRenderedPayload>((resolve, reject) => {
      const abort = (): void => {
        const pending = this.#pending.get(request.requestId);
        if (pending !== undefined) {
          clearTimeout(pending.timeout);
          this.#pending.delete(request.requestId);
          pending.cleanup();
          if (this.#latestRenderRequestId === request.requestId) {
            this.#latestRenderRequestId = undefined;
          }
          pending.reject(new Error('Preview render was aborted.'));
          this.#revokeRemoteRender(request.draftDigest, 'studio.preview/client-aborted');
        }
      };
      const cleanup = (): void => {
        options.signal?.removeEventListener('abort', abort);
      };
      const timeout = setTimeout(() => {
        const pending = this.#pending.get(request.requestId);
        if (pending !== undefined) {
          this.#pending.delete(request.requestId);
          pending.cleanup();
          if (this.#latestRenderRequestId === request.requestId) {
            this.#latestRenderRequestId = undefined;
          }
          pending.reject(new Error(`Preview render ${request.requestId} timed out.`));
          this.#revokeRemoteRender(request.draftDigest, 'studio.preview/client-timeout');
        }
      }, this.#timeoutMilliseconds);

      this.#pending.set(request.requestId, {
        cleanup,
        payload: request,
        reject,
        resolve,
        timeout,
      });
      options.signal?.addEventListener('abort', abort, { once: true });
      try {
        this.#post(message);
      } catch (error) {
        clearTimeout(timeout);
        cleanup();
        this.#pending.delete(request.requestId);
        if (this.#latestRenderRequestId === request.requestId) {
          this.#latestRenderRequestId = undefined;
        }
        reject(error instanceof Error ? error : new Error('Preview transport failed.'));
      }
    });
  }

  /**
   * Requests the on-screen geometry of render markers from the responder. Resolves with a
   * `measured` outcome carrying viewport-relative CSS-pixel rectangles, or a `stale`
   * outcome when the response was measured against a render this client no longer
   * considers latest. Rejects on teardown, reload, supersession, abort, timeout, and
   * disposal exactly like `render()` does. Requires a completed render: geometry is a
   * volatile measurement of a specific render digest, never document state.
   */
  public measure(
    payload: PreviewMeasurePayload,
    options: PreviewMeasureOptions = {},
  ): Promise<PreviewMeasureOutcome> {
    if (this.#disposed) {
      return Promise.reject(new Error('Preview client was disposed.'));
    }
    if (options.signal?.aborted === true) {
      return Promise.reject(
        new Error('Preview measure was aborted.', { cause: options.signal.reason }),
      );
    }
    let request: PreviewMeasurePayload;
    try {
      request = snapshotOutboundPayload(payload);
    } catch (error) {
      return Promise.reject(
        error instanceof Error
          ? error
          : new PreviewChannelError(
              'studio.preview/invalid-outbound-message',
              'Refused an invalid outbound preview message.',
            ),
      );
    }
    if (this.#latestRenderedDigest === undefined) {
      return Promise.reject(new Error('Preview measure requires a completed render.'));
    }

    const message: PreviewMessage = {
      channelId: this.#channelId,
      contractVersion: STUDIO_CONTRACT_VERSION,
      kind: 'preview-message',
      payload: request,
      sequence: this.#sequence,
      sessionGeneration: this.#sessionGeneration,
      type: 'studio.preview/measure',
    };
    try {
      this.#assertOutbound(message);
    } catch (error) {
      return Promise.reject(
        error instanceof Error
          ? error
          : new PreviewChannelError(
              'studio.preview/invalid-outbound-message',
              'Refused an invalid outbound preview message.',
            ),
      );
    }
    if (this.#usedRequestIds.has(request.requestId)) {
      return Promise.reject(
        new PreviewChannelError(
          'studio.preview/request-id-reused',
          `Preview request ${request.requestId} was already used in this session.`,
        ),
      );
    }

    if (
      request.markers.some(
        (marker) =>
          !this.#markerInventory.has(marker) ||
          !isPreviewMarker(marker, this.#latestRenderedDigest),
      )
    ) {
      return Promise.reject(
        new PreviewChannelError(
          'studio.preview/measure-stale-marker',
          'Preview measurement markers must belong to the current render inventory.',
          true,
        ),
      );
    }

    for (const [requestId, pending] of this.#pendingMeasures) {
      clearTimeout(pending.timeout);
      pending.cleanup();
      pending.reject(
        new Error(`Preview measure ${requestId} was superseded by ${request.requestId}.`),
      );
    }
    this.#pendingMeasures.clear();
    this.#usedRequestIds.add(request.requestId);

    return new Promise<PreviewMeasureOutcome>((resolve, reject) => {
      const abort = (): void => {
        const pending = this.#pendingMeasures.get(request.requestId);
        if (pending !== undefined) {
          clearTimeout(pending.timeout);
          this.#pendingMeasures.delete(request.requestId);
          pending.cleanup();
          pending.reject(new Error('Preview measure was aborted.'));
        }
      };
      const cleanup = (): void => {
        options.signal?.removeEventListener('abort', abort);
      };
      const timeout = setTimeout(() => {
        const pending = this.#pendingMeasures.get(request.requestId);
        if (pending !== undefined) {
          this.#pendingMeasures.delete(request.requestId);
          pending.cleanup();
          pending.reject(new Error(`Preview measure ${request.requestId} timed out.`));
        }
      }, this.#timeoutMilliseconds);

      this.#pendingMeasures.set(request.requestId, {
        cleanup,
        payload: request,
        reject,
        resolve,
        timeout,
      });
      options.signal?.addEventListener('abort', abort, { once: true });
      try {
        this.#post(message);
      } catch (error) {
        clearTimeout(timeout);
        cleanup();
        this.#pendingMeasures.delete(request.requestId);
        reject(error instanceof Error ? error : new Error('Preview transport failed.'));
      }
    });
  }

  /**
   * Drive the preview surface to a semantic viewport role or to bounded
   * explicit dimensions. The two are alternatives, so a payload carrying both
   * is refused before it reaches the channel.
   */
  public setViewport(payload: PreviewViewportPayload): void {
    this.#assertActive();
    const hasRole = payload.viewport !== undefined;
    const hasDimensions = payload.width !== undefined || payload.height !== undefined;
    if (hasRole === hasDimensions) {
      throw new RangeError(
        'A viewport message carries either a semantic role or explicit dimensions, never both.',
      );
    }
    const message: PreviewMessage = {
      channelId: this.#channelId,
      contractVersion: STUDIO_CONTRACT_VERSION,
      kind: 'preview-message',
      payload,
      sequence: this.#sequence,
      sessionGeneration: this.#sessionGeneration,
      type: 'studio.preview/viewport',
    };
    this.#assertOutbound(message);
    this.#rejectPendingMeasures(
      new PreviewChannelError(
        'studio.preview/measure-viewport-changed',
        'Preview measurement was invalidated by a viewport change.',
        true,
      ),
    );
    this.#post(message);
  }

  /**
   * Instruct the renderer to revoke the resources it holds for a superseded
   * draft while the channel stays open. This is not teardown: teardown ends
   * the session, dispose frees a render's resources within it.
   */
  public disposeDraft(payload: PreviewDisposePayload): void {
    this.#assertActive();
    const message: PreviewMessage = {
      channelId: this.#channelId,
      contractVersion: STUDIO_CONTRACT_VERSION,
      kind: 'preview-message',
      payload,
      sequence: this.#sequence,
      sessionGeneration: this.#sessionGeneration,
      type: 'studio.preview/dispose',
    };
    this.#assertOutbound(message);
    for (const [requestId, pending] of this.#pending) {
      if (
        payload.draftDigest === undefined ||
        pending.payload.draftDigest === payload.draftDigest
      ) {
        clearTimeout(pending.timeout);
        pending.cleanup();
        pending.reject(
          new PreviewChannelError(
            'studio.preview/render-disposed',
            `Preview render ${requestId} was disposed before completion.`,
          ),
        );
        this.#pending.delete(requestId);
        if (this.#latestRenderRequestId === requestId) {
          this.#latestRenderRequestId = undefined;
        }
      }
    }
    if (payload.draftDigest === undefined || payload.draftDigest === this.#latestRenderedDigest) {
      this.#latestRenderedDigest = undefined;
      this.#markerInventory.clear();
      this.#rejectPendingMeasures(
        new PreviewChannelError(
          'studio.preview/measure-disposed',
          'Preview measurement was disposed with its render.',
        ),
      );
    }
    this.#post(message);
  }

  /** Observe trusted marker interactions the renderer reports. */
  public onActivated(listener: PreviewActivationListener): () => void {
    this.#activationListeners.add(listener);
    return (): void => {
      this.#activationListeners.delete(listener);
    };
  }

  public select(payload: PreviewSelectPayload): void {
    this.#assertActive();
    this.#post({
      channelId: this.#channelId,
      contractVersion: STUDIO_CONTRACT_VERSION,
      kind: 'preview-message',
      payload,
      sequence: this.#sequence,
      sessionGeneration: this.#sessionGeneration,
      type: 'studio.preview/select',
    });
  }

  #assertActive(): void {
    if (this.#disposed) {
      throw new Error('Preview client was disposed.');
    }
  }

  #assertOutbound(message: PreviewMessage): void {
    if (!isPreviewMessage(message)) {
      throw new PreviewChannelError(
        'studio.preview/invalid-outbound-message',
        'Refused an invalid outbound preview message.',
      );
    }
  }

  #post(message: PreviewMessage): void {
    this.#assertOutbound(message);
    this.#sequence += 1;
    this.#target.postMessage(message, this.#targetOrigin);
  }

  #rejectPendingMeasures(reason: Error): void {
    for (const pending of this.#pendingMeasures.values()) {
      clearTimeout(pending.timeout);
      pending.cleanup();
      pending.reject(reason);
    }
    this.#pendingMeasures.clear();
  }

  #revokeRemoteRender(draftDigest: string, reason: PreviewDisposePayload['reason']): void {
    if (this.#disposed) {
      return;
    }
    try {
      this.#post({
        channelId: this.#channelId,
        contractVersion: STUDIO_CONTRACT_VERSION,
        kind: 'preview-message',
        payload: { draftDigest, reason },
        sequence: this.#sequence,
        sessionGeneration: this.#sessionGeneration,
        type: 'studio.preview/dispose',
      });
    } catch {
      // Local cancellation is already complete. A transport exception cannot
      // resurrect the request, and private transport details are not surfaced.
    }
  }

  #receive(event: PreviewMessageEvent): void {
    if (
      event.origin !== this.#targetOrigin ||
      event.source !== this.#target ||
      !isPreviewMessage(event.data) ||
      event.data.channelId !== this.#channelId ||
      event.data.sessionGeneration !== this.#sessionGeneration ||
      event.data.sequence <= this.#lastInboundSequence
    ) {
      return;
    }
    this.#lastInboundSequence = event.data.sequence;

    if (event.data.type === 'studio.preview/activated') {
      if (
        !this.#markerInventory.has(event.data.payload.marker) ||
        !isPreviewMarker(event.data.payload.marker, this.#latestRenderedDigest)
      ) {
        return;
      }
      for (const listener of this.#activationListeners) {
        listener(event.data.payload);
      }
      return;
    }

    if (event.data.type === 'studio.preview/rendered') {
      if (event.data.payload.requestId !== this.#latestRenderRequestId) {
        return;
      }
      const pending = this.#pending.get(event.data.payload.requestId);
      if (pending !== undefined && event.data.payload.draftDigest !== pending.payload.draftDigest) {
        clearTimeout(pending.timeout);
        pending.cleanup();
        this.#pending.delete(event.data.payload.requestId);
        this.#latestRenderRequestId = undefined;
        pending.reject(
          new PreviewChannelError(
            'studio.preview/render-correlation-mismatch',
            'Preview response digest did not match its render request.',
          ),
        );
        return;
      }
      if (pending !== undefined) {
        clearTimeout(pending.timeout);
        pending.cleanup();
        this.#pending.delete(event.data.payload.requestId);
        this.#latestRenderRequestId = undefined;
        this.#latestRenderedDigest = event.data.payload.draftDigest;
        this.#markerInventory.clear();
        for (const marker of event.data.payload.markers) {
          this.#markerInventory.add(marker);
        }
        pending.resolve(event.data.payload);
      }
    } else if (event.data.type === 'studio.preview/measurements') {
      const pending = this.#pendingMeasures.get(event.data.payload.requestId);
      if (pending !== undefined) {
        const responseMarkers = [
          ...Object.keys(event.data.payload.measurements),
          ...event.data.payload.unknown,
        ];
        if (
          responseMarkers.length !== pending.payload.markers.length ||
          pending.payload.markers.some((marker) => !responseMarkers.includes(marker))
        ) {
          clearTimeout(pending.timeout);
          pending.cleanup();
          this.#pendingMeasures.delete(event.data.payload.requestId);
          pending.reject(
            new PreviewChannelError(
              'studio.preview/invalid-measurements',
              'Preview measurements did not exactly partition the requested marker inventory.',
            ),
          );
          return;
        }
        clearTimeout(pending.timeout);
        pending.cleanup();
        this.#pendingMeasures.delete(event.data.payload.requestId);
        // Geometry measured against a superseded render is discarded, not surfaced:
        // the typed stale outcome tells the caller to re-measure.
        if (event.data.payload.draftDigest === this.#latestRenderedDigest) {
          pending.resolve({ geometry: event.data.payload, status: 'measured' });
        } else {
          pending.resolve({ measuredDigest: event.data.payload.draftDigest, status: 'stale' });
        }
      }
    } else if (event.data.type === 'studio.preview/error') {
      const message = event.data.payload.message.defaultMessage ?? event.data.payload.message.key;
      const correlationId = event.data.payload.correlationId;
      if (correlationId !== undefined) {
        const pendingRender = this.#pending.get(correlationId);
        const pendingMeasure = this.#pendingMeasures.get(correlationId);
        if (pendingRender === undefined && pendingMeasure === undefined) {
          return;
        }
        if (pendingRender !== undefined) {
          clearTimeout(pendingRender.timeout);
          pendingRender.cleanup();
          pendingRender.reject(
            new PreviewChannelError(event.data.payload.code, message, event.data.payload.retryable),
          );
          this.#pending.delete(correlationId);
          if (this.#latestRenderRequestId === correlationId) {
            this.#latestRenderRequestId = undefined;
            this.#markerInventory.clear();
          }
        }
        if (pendingMeasure !== undefined) {
          clearTimeout(pendingMeasure.timeout);
          pendingMeasure.cleanup();
          pendingMeasure.reject(
            new PreviewChannelError(event.data.payload.code, message, event.data.payload.retryable),
          );
          this.#pendingMeasures.delete(correlationId);
        }
      } else {
        for (const pending of this.#pending.values()) {
          clearTimeout(pending.timeout);
          pending.cleanup();
          pending.reject(new Error(message));
        }
        this.#pending.clear();
        for (const pending of this.#pendingMeasures.values()) {
          clearTimeout(pending.timeout);
          pending.cleanup();
          pending.reject(new Error(message));
        }
        this.#pendingMeasures.clear();
        this.#latestRenderRequestId = undefined;
        this.#latestRenderedDigest = undefined;
        this.#markerInventory.clear();
      }
    } else if (event.data.type === 'studio.preview/ready') {
      this.#readyPayload = event.data.payload;
      const waiters = [...this.#pendingReady];
      this.#pendingReady.clear();
      for (const pending of waiters) {
        clearTimeout(pending.timeout);
        pending.cleanup();
        pending.resolve(event.data.payload);
      }
    } else if (
      event.data.type === 'studio.preview/reload' ||
      event.data.type === 'studio.preview/teardown'
    ) {
      const reason =
        event.data.type === 'studio.preview/reload'
          ? 'Preview renderer reloaded before responding.'
          : 'Preview channel was torn down.';
      for (const pending of this.#pending.values()) {
        clearTimeout(pending.timeout);
        pending.cleanup();
        pending.reject(new Error(reason));
      }
      this.#pending.clear();
      // A reload voids in-flight measurements exactly like it voids renders, and the
      // digest they were bound to no longer describes what the surface shows.
      for (const pending of this.#pendingMeasures.values()) {
        clearTimeout(pending.timeout);
        pending.cleanup();
        pending.reject(new Error(reason));
      }
      this.#pendingMeasures.clear();
      this.#latestRenderRequestId = undefined;
      this.#latestRenderedDigest = undefined;
      this.#markerInventory.clear();
      // A reloaded renderer announces itself again; the cached payload may
      // no longer describe it.
      this.#readyPayload = undefined;
    }

    const teardown = event.data.type === 'studio.preview/teardown';
    for (const listener of this.#listeners) {
      listener(event.data);
    }
    if (teardown) {
      this.dispose();
    }
  }

  /** Announce channel closure to the host, then dispose this client. */
  public teardown(reason: PreviewTeardownPayload['reason']): void {
    this.#assertActive();
    this.#post({
      channelId: this.#channelId,
      contractVersion: STUDIO_CONTRACT_VERSION,
      kind: 'preview-message',
      payload: { reason },
      sequence: this.#sequence,
      sessionGeneration: this.#sessionGeneration,
      type: 'studio.preview/teardown',
    });
    this.dispose();
  }
}

// Shared with PreviewHost; intentionally not re-exported from the package index.
export function normalizeOrigin(input: string): string {
  if (input === '*') {
    throw new TypeError('Preview target origin must be exact; wildcard origins are forbidden.');
  }

  const url = new URL(input);
  if (url.origin === 'null') {
    throw new TypeError('Preview target origin must use a network origin.');
  }
  return url.origin;
}
