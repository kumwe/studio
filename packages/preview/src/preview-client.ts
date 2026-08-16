import {
  isPreviewMessage,
  STUDIO_CONTRACT_VERSION,
  type PreviewMeasurePayload,
  type PreviewMeasurementsPayload,
  type PreviewMessage,
  type PreviewReadyPayload,
  type PreviewRenderedPayload,
  type PreviewRenderPayload,
  type PreviewSelectPayload,
  type PreviewTeardownPayload,
} from '@kumwe/studio-protocol';

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
  reject: (reason?: unknown) => void;
  resolve: (result: PreviewRenderedPayload) => void;
  timeout: ReturnType<typeof setTimeout>;
}

interface PendingMeasure {
  cleanup: () => void;
  reject: (reason?: unknown) => void;
  resolve: (outcome: PreviewMeasureOutcome) => void;
  timeout: ReturnType<typeof setTimeout>;
}

export class PreviewClient {
  readonly #channelId: string;
  readonly #listener: PreviewMessageListener;
  readonly #listeners = new Set<PreviewProtocolListener>();
  readonly #pending = new Map<string, PendingRender>();
  readonly #pendingMeasures = new Map<string, PendingMeasure>();
  readonly #pendingReady = new Set<PendingReady>();
  readonly #sessionGeneration: string;
  readonly #source: PreviewMessageSource;
  readonly #target: PreviewMessageTarget;
  readonly #targetOrigin: string;
  readonly #timeoutMilliseconds: number;
  #disposed = false;
  #lastInboundSequence = -1;
  #latestRenderDigest: string | undefined;
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
    this.#listeners.clear();
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
    if (this.#pending.has(payload.draftDigest)) {
      return Promise.reject(new Error(`Render ${payload.draftDigest} is already pending.`));
    }

    for (const [digest, pending] of this.#pending) {
      clearTimeout(pending.timeout);
      pending.cleanup();
      pending.reject(
        new Error(`Preview render ${digest} was superseded by ${payload.draftDigest}.`),
      );
    }
    this.#pending.clear();
    this.#latestRenderDigest = payload.draftDigest;

    return new Promise<PreviewRenderedPayload>((resolve, reject) => {
      const abort = (): void => {
        const pending = this.#pending.get(payload.draftDigest);
        if (pending !== undefined) {
          clearTimeout(pending.timeout);
          this.#pending.delete(payload.draftDigest);
          pending.cleanup();
          if (this.#latestRenderDigest === payload.draftDigest) {
            this.#latestRenderDigest = undefined;
          }
          pending.reject(new Error('Preview render was aborted.'));
        }
      };
      const cleanup = (): void => {
        options.signal?.removeEventListener('abort', abort);
      };
      const timeout = setTimeout(() => {
        const pending = this.#pending.get(payload.draftDigest);
        if (pending !== undefined) {
          this.#pending.delete(payload.draftDigest);
          pending.cleanup();
          if (this.#latestRenderDigest === payload.draftDigest) {
            this.#latestRenderDigest = undefined;
          }
          pending.reject(new Error(`Preview render ${payload.draftDigest} timed out.`));
        }
      }, this.#timeoutMilliseconds);

      this.#pending.set(payload.draftDigest, { cleanup, reject, resolve, timeout });
      options.signal?.addEventListener('abort', abort, { once: true });
      this.#post({
        channelId: this.#channelId,
        contractVersion: STUDIO_CONTRACT_VERSION,
        kind: 'preview-message',
        payload,
        sequence: this.#sequence++,
        sessionGeneration: this.#sessionGeneration,
        type: 'studio.preview/render',
      });
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
    if (this.#latestRenderedDigest === undefined) {
      return Promise.reject(new Error('Preview measure requires a completed render.'));
    }
    if (this.#pendingMeasures.has(payload.requestId)) {
      return Promise.reject(new Error(`Measure ${payload.requestId} is already pending.`));
    }

    for (const [requestId, pending] of this.#pendingMeasures) {
      clearTimeout(pending.timeout);
      pending.cleanup();
      pending.reject(
        new Error(`Preview measure ${requestId} was superseded by ${payload.requestId}.`),
      );
    }
    this.#pendingMeasures.clear();

    return new Promise<PreviewMeasureOutcome>((resolve, reject) => {
      const abort = (): void => {
        const pending = this.#pendingMeasures.get(payload.requestId);
        if (pending !== undefined) {
          clearTimeout(pending.timeout);
          this.#pendingMeasures.delete(payload.requestId);
          pending.cleanup();
          pending.reject(new Error('Preview measure was aborted.'));
        }
      };
      const cleanup = (): void => {
        options.signal?.removeEventListener('abort', abort);
      };
      const timeout = setTimeout(() => {
        const pending = this.#pendingMeasures.get(payload.requestId);
        if (pending !== undefined) {
          this.#pendingMeasures.delete(payload.requestId);
          pending.cleanup();
          pending.reject(new Error(`Preview measure ${payload.requestId} timed out.`));
        }
      }, this.#timeoutMilliseconds);

      this.#pendingMeasures.set(payload.requestId, { cleanup, reject, resolve, timeout });
      options.signal?.addEventListener('abort', abort, { once: true });
      this.#post({
        channelId: this.#channelId,
        contractVersion: STUDIO_CONTRACT_VERSION,
        kind: 'preview-message',
        payload,
        sequence: this.#sequence++,
        sessionGeneration: this.#sessionGeneration,
        type: 'studio.preview/measure',
      });
    });
  }

  public select(payload: PreviewSelectPayload): void {
    this.#assertActive();
    this.#post({
      channelId: this.#channelId,
      contractVersion: STUDIO_CONTRACT_VERSION,
      kind: 'preview-message',
      payload,
      sequence: this.#sequence++,
      sessionGeneration: this.#sessionGeneration,
      type: 'studio.preview/select',
    });
  }

  #assertActive(): void {
    if (this.#disposed) {
      throw new Error('Preview client was disposed.');
    }
  }

  #post(message: PreviewMessage): void {
    this.#target.postMessage(message, this.#targetOrigin);
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

    if (event.data.type === 'studio.preview/rendered') {
      if (event.data.payload.draftDigest !== this.#latestRenderDigest) {
        return;
      }
      const pending = this.#pending.get(event.data.payload.draftDigest);
      if (pending !== undefined) {
        clearTimeout(pending.timeout);
        pending.cleanup();
        this.#pending.delete(event.data.payload.draftDigest);
        this.#latestRenderDigest = undefined;
        this.#latestRenderedDigest = event.data.payload.draftDigest;
        pending.resolve(event.data.payload);
      }
    } else if (event.data.type === 'studio.preview/measurements') {
      const pending = this.#pendingMeasures.get(event.data.payload.requestId);
      if (pending !== undefined) {
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
          pendingRender.reject(new Error(message));
          this.#pending.delete(correlationId);
          if (this.#latestRenderDigest === correlationId) {
            this.#latestRenderDigest = undefined;
          }
        }
        if (pendingMeasure !== undefined) {
          clearTimeout(pendingMeasure.timeout);
          pendingMeasure.cleanup();
          pendingMeasure.reject(new Error(message));
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
        this.#latestRenderDigest = undefined;
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
      this.#latestRenderDigest = undefined;
      this.#latestRenderedDigest = undefined;
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
      sequence: this.#sequence++,
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
