import {
  isPreviewMessage,
  STUDIO_CONTRACT_VERSION,
  type PreviewMessage,
  type PreviewRenderedPayload,
  type PreviewRenderPayload,
  type PreviewSelectPayload,
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

export interface PreviewRenderOptions {
  signal?: AbortSignal;
}

export type PreviewProtocolListener = (message: PreviewMessage) => void;

interface PendingRender {
  cleanup: () => void;
  reject: (reason?: unknown) => void;
  resolve: (result: PreviewRenderedPayload) => void;
  timeout: ReturnType<typeof setTimeout>;
}

export class PreviewClient {
  readonly #channelId: string;
  readonly #listener: PreviewMessageListener;
  readonly #listeners = new Set<PreviewProtocolListener>();
  readonly #pending = new Map<string, PendingRender>();
  readonly #sessionGeneration: string;
  readonly #source: PreviewMessageSource;
  readonly #target: PreviewMessageTarget;
  readonly #targetOrigin: string;
  readonly #timeoutMilliseconds: number;
  #disposed = false;
  #lastInboundSequence = -1;
  #latestRenderDigest: string | undefined;
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
    this.#listeners.clear();
  }

  public onMessage(listener: PreviewProtocolListener): () => void {
    this.#listeners.add(listener);
    return (): void => {
      this.#listeners.delete(listener);
    };
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
        pending.resolve(event.data.payload);
      }
    } else if (event.data.type === 'studio.preview/error') {
      const message = event.data.payload.message.defaultMessage ?? event.data.payload.message.key;
      const correlatedDigest = event.data.payload.correlationId;
      if (correlatedDigest !== undefined) {
        const pending = this.#pending.get(correlatedDigest);
        if (pending === undefined) {
          return;
        }
        clearTimeout(pending.timeout);
        pending.cleanup();
        pending.reject(new Error(message));
        this.#pending.delete(correlatedDigest);
        if (this.#latestRenderDigest === correlatedDigest) {
          this.#latestRenderDigest = undefined;
        }
      } else {
        for (const pending of this.#pending.values()) {
          clearTimeout(pending.timeout);
          pending.cleanup();
          pending.reject(new Error(message));
        }
        this.#pending.clear();
        this.#latestRenderDigest = undefined;
      }
    }

    for (const listener of this.#listeners) {
      listener(event.data);
    }
  }
}

function normalizeOrigin(input: string): string {
  if (input === '*') {
    throw new TypeError('Preview target origin must be exact; wildcard origins are forbidden.');
  }

  const url = new URL(input);
  if (url.origin === 'null') {
    throw new TypeError('Preview target origin must use a network origin.');
  }
  return url.origin;
}
