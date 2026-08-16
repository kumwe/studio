import {
  isPreviewMessage,
  STUDIO_CONTRACT_VERSION,
  STUDIO_WIRE_PROTOCOL_VERSION,
  type LocalName,
  type PreviewMarkerRect,
  type PreviewMeasurePayload,
  type PreviewMessage,
  type PreviewRenderedPayload,
  type PreviewRenderPayload,
  type PreviewSelectPayload,
  type PreviewViewportMetrics,
  type QualifiedName,
  type StableId,
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

/**
 * Raw measurement produced by the embedding renderer. The responder never reads the
 * DOM itself: the renderer supplies marker rectangles and viewport metrics, keeping
 * this package DOM-free and testable. Markers absent from `rects` (or mapped to an
 * empty rectangle list) are reported back as unknown, never thrown.
 */
export interface PreviewMeasurement {
  rects: Record<StableId, PreviewMarkerRect[]>;
  viewport: PreviewViewportMetrics;
}

export type PreviewMeasureCallback = (markers: StableId[]) => Promise<PreviewMeasurement>;

export type PreviewSelectListener = (payload: PreviewSelectPayload) => void;

export interface PreviewHostOptions {
  channelId: string;
  /** Renderer-supplied marker measurer; without one, measure requests are answered as unavailable. */
  measure?: PreviewMeasureCallback;
  render: PreviewRenderCallback;
  renderer: QualifiedName;
  sessionGeneration: string;
  source: PreviewMessageSource;
  target: PreviewMessageTarget;
  targetOrigin: string;
  viewports: LocalName[];
}

/**
 * The preview-surface half of the channel: answers `studio.preview/render` and
 * `studio.preview/measure` requests from a `PreviewClient` and forwards
 * `studio.preview/select` to registered listeners. Inbound messages are filtered exactly
 * like the client filters its own: pinned origin, expected source window, canonical
 * schema, channel ID, session generation, and a strictly increasing sequence.
 */
export class PreviewHost {
  readonly #channelId: string;
  readonly #listener: PreviewMessageListener;
  readonly #measureCallback: PreviewMeasureCallback | undefined;
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
  #latestMeasureRequestId: string | undefined;
  #latestRenderDigest: string | undefined;
  #measuredRenderDigest: string | undefined;
  #sequence = 0;

  public constructor(options: PreviewHostOptions) {
    this.#targetOrigin = normalizeOrigin(options.targetOrigin);
    this.#channelId = options.channelId;
    this.#sessionGeneration = options.sessionGeneration;
    this.#source = options.source;
    this.#target = options.target;
    this.#measureCallback = options.measure;
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
    this.#latestMeasureRequestId = undefined;
    this.#latestRenderDigest = undefined;
    this.#measuredRenderDigest = undefined;
  }

  public onSelect(listener: PreviewSelectListener): () => void {
    this.#selectListeners.add(listener);
    return (): void => {
      this.#selectListeners.delete(listener);
    };
  }

  /**
   * Announce that the renderer reloaded: any in-flight render or measurement is
   * void and the client must resend. The host re-announces readiness afterwards.
   */
  public reload(reason: QualifiedName): void {
    this.#assertActive();
    this.#latestMeasureRequestId = undefined;
    this.#latestRenderDigest = undefined;
    this.#measuredRenderDigest = undefined;
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

  #handleMeasure(payload: PreviewMeasurePayload): void {
    const requestId = payload.requestId;
    this.#latestMeasureRequestId = requestId;
    if (this.#measureCallback === undefined) {
      this.#settleMeasureFailure(requestId, {
        code: 'studio.preview/measure-unavailable',
        defaultMessage: 'Preview measurement is unavailable.',
        retryable: false,
      });
      return;
    }
    if (this.#measuredRenderDigest === undefined) {
      // Nothing has rendered yet, so there is no digest to bind geometry to.
      this.#settleMeasureFailure(requestId, {
        code: 'studio.preview/measure-unavailable',
        defaultMessage: 'Preview measurement is unavailable.',
        retryable: true,
      });
      return;
    }
    const markers = [...new Set(payload.markers)];
    let result: Promise<PreviewMeasurement>;
    try {
      result = this.#measureCallback(markers);
    } catch {
      this.#settleMeasureFailure(requestId, measureFailed());
      return;
    }
    void result.then(
      (measurement) => {
        this.#settleMeasured(requestId, markers, measurement);
      },
      () => {
        this.#settleMeasureFailure(requestId, measureFailed());
      },
    );
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
    } else if (event.data.type === 'studio.preview/measure') {
      this.#handleMeasure(event.data.payload);
    } else if (event.data.type === 'studio.preview/select') {
      for (const listener of this.#selectListeners) {
        listener(event.data.payload);
      }
    } else if (event.data.type === 'studio.preview/teardown') {
      this.dispose();
    }
  }

  // Measurer failure details never cross the channel: the rejection reason is dropped and a
  // stable generic error is posted instead, correlated by the request identifier.
  #settleMeasureFailure(
    requestId: string,
    failure: { code: QualifiedName; defaultMessage: string; retryable: boolean },
  ): void {
    if (this.#disposed || this.#latestMeasureRequestId !== requestId) {
      return;
    }
    this.#latestMeasureRequestId = undefined;
    this.#post({
      channelId: this.#channelId,
      contractVersion: STUDIO_CONTRACT_VERSION,
      kind: 'preview-message',
      payload: {
        code: failure.code,
        correlationId: requestId,
        message: { defaultMessage: failure.defaultMessage, key: failure.code },
        retryable: failure.retryable,
      },
      sequence: this.#sequence++,
      sessionGeneration: this.#sessionGeneration,
      type: 'studio.preview/error',
    });
  }

  // Geometry is stamped with the digest of the render the surface currently shows, and only
  // markers from the request are answered — requested markers the measurer cannot place are
  // listed as unknown, extra markers it invents are dropped. A measurement superseded by a
  // newer request, voided by a reload, or settling after disposal is dropped silently.
  #settleMeasured(requestId: string, markers: StableId[], measurement: PreviewMeasurement): void {
    const draftDigest = this.#measuredRenderDigest;
    if (this.#disposed || this.#latestMeasureRequestId !== requestId || draftDigest === undefined) {
      return;
    }
    this.#latestMeasureRequestId = undefined;
    const measurements: Record<StableId, PreviewMarkerRect[]> = {};
    const unknown: StableId[] = [];
    for (const marker of markers) {
      const rects = Object.hasOwn(measurement.rects, marker)
        ? measurement.rects[marker]
        : undefined;
      if (rects === undefined || rects.length === 0) {
        unknown.push(marker);
      } else {
        measurements[marker] = rects.map((rect) => ({
          height: rect.height,
          width: rect.width,
          x: rect.x,
          y: rect.y,
        }));
      }
    }
    this.#post({
      channelId: this.#channelId,
      contractVersion: STUDIO_CONTRACT_VERSION,
      kind: 'preview-message',
      payload: {
        draftDigest,
        measurements,
        requestId,
        unknown,
        viewport: {
          devicePixelRatio: measurement.viewport.devicePixelRatio,
          height: measurement.viewport.height,
          scrollX: measurement.viewport.scrollX,
          scrollY: measurement.viewport.scrollY,
          width: measurement.viewport.width,
        },
      },
      sequence: this.#sequence++,
      sessionGeneration: this.#sessionGeneration,
      type: 'studio.preview/measurements',
    });
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
    // The surface now shows this render; measurements are bound to its digest.
    this.#measuredRenderDigest = draftDigest;
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

function measureFailed(): { code: QualifiedName; defaultMessage: string; retryable: boolean } {
  return {
    code: 'studio.preview/measure-failed',
    defaultMessage: 'Preview measurement failed.',
    retryable: true,
  };
}
