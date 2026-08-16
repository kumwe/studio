import {
  isPreviewMessage,
  STUDIO_CONTRACT_VERSION,
  STUDIO_WIRE_PROTOCOL_VERSION,
  type LocalName,
  type PreviewMessage,
  type PreviewRenderedPayload,
  type PreviewRenderPayload,
  type PreviewSelectPayload,
  type QualifiedName,
} from '@kumwe/studio-protocol';
import {
  normalizeOrigin,
  type PreviewMessageEvent,
  type PreviewMessageListener,
  type PreviewMessageSource,
  type PreviewMessageTarget,
} from './preview-client.js';

export type PreviewRenderCallback = (
  payload: PreviewRenderPayload,
) => Promise<PreviewRenderedPayload>;

export type PreviewSelectListener = (payload: PreviewSelectPayload) => void;

export interface PreviewHostOptions {
  channelId: string;
  render: PreviewRenderCallback;
  renderer: QualifiedName;
  sessionGeneration: string;
  source: PreviewMessageSource;
  target: PreviewMessageTarget;
  targetOrigin: string;
  viewports: LocalName[];
}

/**
 * The preview-surface half of the channel: answers `studio.preview/render` requests from a
 * `PreviewClient` and forwards `studio.preview/select` to registered listeners. Inbound
 * messages are filtered exactly like the client filters its own: pinned origin, expected
 * source window, canonical schema, channel ID, session generation, and a strictly
 * increasing sequence.
 */
export class PreviewHost {
  readonly #channelId: string;
  readonly #listener: PreviewMessageListener;
  readonly #renderCallback: PreviewRenderCallback;
  readonly #renderer: QualifiedName;
  readonly #selectListeners = new Set<PreviewSelectListener>();
  readonly #sessionGeneration: string;
  readonly #source: PreviewMessageSource;
  readonly #target: PreviewMessageTarget;
  readonly #targetOrigin: string;
  readonly #viewports: LocalName[];
  #disposed = false;
  #lastInboundSequence = -1;
  #latestRenderDigest: string | undefined;
  #sequence = 0;

  public constructor(options: PreviewHostOptions) {
    this.#targetOrigin = normalizeOrigin(options.targetOrigin);
    this.#channelId = options.channelId;
    this.#sessionGeneration = options.sessionGeneration;
    this.#source = options.source;
    this.#target = options.target;
    this.#renderCallback = options.render;
    this.#renderer = options.renderer;
    this.#viewports = [...options.viewports];
    this.#listener = (event): void => {
      this.#receive(event);
    };
    this.#source.addEventListener('message', this.#listener);
  }

  /**
   * Posts the `studio.preview/ready` announcement carrying the wire protocol version,
   * renderer id, and viewport inventory. Announcement is an explicit step so the host can
   * finish its own setup before opening the channel.
   */
  public announce(): void {
    this.#assertActive();
    this.#post({
      channelId: this.#channelId,
      contractVersion: STUDIO_CONTRACT_VERSION,
      kind: 'preview-message',
      payload: {
        protocolVersion: STUDIO_WIRE_PROTOCOL_VERSION,
        renderer: this.#renderer,
        viewports: [...this.#viewports],
      },
      sequence: this.#sequence++,
      sessionGeneration: this.#sessionGeneration,
      type: 'studio.preview/ready',
    });
  }

  public dispose(): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    this.#source.removeEventListener('message', this.#listener);
    this.#selectListeners.clear();
    this.#latestRenderDigest = undefined;
  }

  public onSelect(listener: PreviewSelectListener): () => void {
    this.#selectListeners.add(listener);
    return (): void => {
      this.#selectListeners.delete(listener);
    };
  }

  /**
   * Announce that the renderer reloaded: any in-flight render is void and the
   * client must resend. The host re-announces readiness afterwards.
   */
  public reload(reason: QualifiedName): void {
    this.#assertActive();
    this.#latestRenderDigest = undefined;
    this.#post({
      channelId: this.#channelId,
      contractVersion: STUDIO_CONTRACT_VERSION,
      kind: 'preview-message',
      payload: { reason },
      sequence: this.#sequence++,
      sessionGeneration: this.#sessionGeneration,
      type: 'studio.preview/reload',
    });
    this.announce();
  }

  /** Announce channel closure to the client, then dispose this host. */
  public teardown(reason: QualifiedName): void {
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

  #assertActive(): void {
    if (this.#disposed) {
      throw new Error('Preview host was disposed.');
    }
  }

  #handleRender(payload: PreviewRenderPayload): void {
    const draftDigest = payload.draftDigest;
    this.#latestRenderDigest = draftDigest;
    let result: Promise<PreviewRenderedPayload>;
    try {
      result = this.#renderCallback(payload);
    } catch {
      this.#settleFailure(draftDigest);
      return;
    }
    void result.then(
      (rendered) => {
        this.#settleRendered(draftDigest, rendered);
      },
      () => {
        this.#settleFailure(draftDigest);
      },
    );
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

    if (event.data.type === 'studio.preview/render') {
      this.#handleRender(event.data.payload);
    } else if (event.data.type === 'studio.preview/select') {
      for (const listener of this.#selectListeners) {
        listener(event.data.payload);
      }
    } else if (event.data.type === 'studio.preview/teardown') {
      this.dispose();
    }
  }

  // Renderer failure details never cross the channel: the rejection reason is dropped and a
  // stable generic error is posted instead, correlated by the request's draft digest.
  #settleFailure(draftDigest: string): void {
    if (this.#disposed || this.#latestRenderDigest !== draftDigest) {
      return;
    }
    this.#latestRenderDigest = undefined;
    this.#post({
      channelId: this.#channelId,
      contractVersion: STUDIO_CONTRACT_VERSION,
      kind: 'preview-message',
      payload: {
        code: 'studio.preview/render-failed',
        correlationId: draftDigest,
        message: {
          defaultMessage: 'Preview rendering failed.',
          key: 'studio.preview/render-failed',
        },
        retryable: true,
      },
      sequence: this.#sequence++,
      sessionGeneration: this.#sessionGeneration,
      type: 'studio.preview/error',
    });
  }

  // The response digest is stamped from the request, so a callback can never answer for a
  // different draft than the one it was asked to render. Results that were superseded by a
  // newer request, or that settle after disposal, are dropped silently.
  #settleRendered(draftDigest: string, rendered: PreviewRenderedPayload): void {
    if (this.#disposed || this.#latestRenderDigest !== draftDigest) {
      return;
    }
    this.#latestRenderDigest = undefined;
    this.#post({
      channelId: this.#channelId,
      contractVersion: STUDIO_CONTRACT_VERSION,
      kind: 'preview-message',
      payload: {
        diagnostics: rendered.diagnostics,
        draftDigest,
        markers: rendered.markers,
        ...(rendered.markerMap === undefined ? {} : { markerMap: rendered.markerMap }),
      },
      sequence: this.#sequence++,
      sessionGeneration: this.#sessionGeneration,
      type: 'studio.preview/rendered',
    });
  }
}
