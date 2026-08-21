import {
  isPreviewMarker,
  isPreviewMessage,
  isPreviewRenderedPayload,
  STUDIO_CONTRACT_VERSION,
  STUDIO_WIRE_PROTOCOL_VERSION,
  type LocalName,
  type PreviewMarkerRect,
  type PreviewMeasurePayload,
  type PreviewMessage,
  type PreviewRenderedPayload,
  type PreviewRenderPayload,
  type PreviewActivatedPayload,
  type PreviewDisposePayload,
  type PreviewSelectPayload,
  type PreviewViewportPayload,
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

/** Render work is attempt-scoped; implementations should stop promptly when the signal aborts. */
export type PreviewRenderCallback = (
  payload: PreviewRenderPayload,
  signal: AbortSignal,
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

/** Measurement work is render-generation-scoped and receives the same cancellation discipline. */
export type PreviewMeasureCallback = (
  markers: StableId[],
  signal: AbortSignal,
) => Promise<PreviewMeasurement>;

export type PreviewSelectListener = (payload: PreviewSelectPayload) => void;

export type PreviewViewportListener = (payload: PreviewViewportPayload) => void;

export type PreviewDisposeListener = (payload: PreviewDisposePayload) => void;

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

interface ActiveRender {
  controller: AbortController;
  draftDigest: string;
  generation: number;
  requestId: string;
}

interface ActiveMeasure {
  controller: AbortController;
  draftDigest: string;
  generation: number;
  requestId: string;
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
  readonly #viewportListeners = new Set<PreviewViewportListener>();
  readonly #disposeListeners = new Set<PreviewDisposeListener>();
  readonly #selectListeners = new Set<PreviewSelectListener>();
  readonly #markerInventory = new Set<StableId>();
  readonly #sessionGeneration: string;
  readonly #source: PreviewMessageSource;
  readonly #target: PreviewMessageTarget;
  readonly #targetOrigin: string;
  readonly #usedRequestIds = new Set<string>();
  readonly #viewports: LocalName[];
  #activeMeasure: ActiveMeasure | undefined;
  #activeRender: ActiveRender | undefined;
  #disposed = false;
  #lastInboundSequence = -1;
  #measureGeneration = 0;
  #measuredRenderDigest: string | undefined;
  #renderGeneration = 0;
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
      sequence: this.#sequence,
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
    this.#viewportListeners.clear();
    this.#disposeListeners.clear();
    this.#invalidateMeasure('Preview host was disposed.');
    this.#invalidateRender('Preview host was disposed.');
    this.#measuredRenderDigest = undefined;
    this.#markerInventory.clear();
  }

  /**
   * Report a trusted interaction with a marked region. The renderer reports
   * intent, never raw input events, and the marker carries nothing beyond the
   * node identity the render already published.
   */
  public announceActivation(payload: PreviewActivatedPayload): void {
    this.#assertActive();
    if (
      !this.#markerInventory.has(payload.marker) ||
      !isPreviewMarker(payload.marker, this.#measuredRenderDigest)
    ) {
      throw new RangeError('Preview activation marker is not in the current render inventory.');
    }
    this.#post({
      channelId: this.#channelId,
      contractVersion: STUDIO_CONTRACT_VERSION,
      kind: 'preview-message',
      payload,
      sequence: this.#sequence,
      sessionGeneration: this.#sessionGeneration,
      type: 'studio.preview/activated',
    });
  }

  /** Observe viewport instructions the client drives the surface with. */
  public onViewport(listener: PreviewViewportListener): () => void {
    this.#viewportListeners.add(listener);
    return (): void => {
      this.#viewportListeners.delete(listener);
    };
  }

  /** Observe requests to revoke the resources held for a superseded draft. */
  public onDispose(listener: PreviewDisposeListener): () => void {
    this.#disposeListeners.add(listener);
    return (): void => {
      this.#disposeListeners.delete(listener);
    };
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
    this.#invalidateMeasure('Preview renderer reloaded.');
    this.#invalidateRender('Preview renderer reloaded.');
    this.#measuredRenderDigest = undefined;
    this.#markerInventory.clear();
    this.#post({
      channelId: this.#channelId,
      contractVersion: STUDIO_CONTRACT_VERSION,
      kind: 'preview-message',
      payload: { reason },
      sequence: this.#sequence,
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
      sequence: this.#sequence,
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
    if (this.#usedRequestIds.has(requestId)) {
      this.#postError(requestId, {
        code: 'studio.preview/request-id-reused',
        defaultMessage: 'The preview request identifier was already used in this session.',
        retryable: false,
      });
      return;
    }
    this.#usedRequestIds.add(requestId);
    if (this.#measuredRenderDigest === undefined) {
      // Nothing has rendered yet, so there is no digest to bind geometry to.
      this.#postError(requestId, {
        code: 'studio.preview/measure-unavailable',
        defaultMessage: 'Preview measurement is unavailable.',
        retryable: true,
      });
      return;
    }
    const draftDigest = this.#measuredRenderDigest;
    if (
      payload.markers.some(
        (marker) => !this.#markerInventory.has(marker) || !isPreviewMarker(marker, draftDigest),
      )
    ) {
      this.#postError(requestId, {
        code: 'studio.preview/measure-stale-marker',
        defaultMessage: 'Preview measurement markers are not in the current render inventory.',
        retryable: true,
      });
      return;
    }
    if (this.#measureCallback === undefined) {
      this.#postError(requestId, {
        code: 'studio.preview/measure-unavailable',
        defaultMessage: 'Preview measurement is unavailable.',
        retryable: false,
      });
      return;
    }

    this.#invalidateMeasure('Preview measurement was superseded.');
    const active: ActiveMeasure = {
      controller: new AbortController(),
      draftDigest,
      generation: this.#measureGeneration,
      requestId,
    };
    this.#activeMeasure = active;
    const markers = [...payload.markers];
    let result: Promise<PreviewMeasurement>;
    try {
      result = this.#measureCallback(markers, active.controller.signal);
    } catch {
      this.#settleMeasureFailure(active, measureFailed());
      return;
    }
    void Promise.resolve(result).then(
      (measurement) => {
        try {
          this.#settleMeasured(active, markers, measurement);
        } catch {
          this.#settleMeasureFailure(active, measureFailed());
        }
      },
      () => {
        this.#settleMeasureFailure(active, measureFailed());
      },
    );
  }

  #handleRender(payload: PreviewRenderPayload): void {
    if (this.#usedRequestIds.has(payload.requestId)) {
      this.#postError(payload.requestId, {
        code: 'studio.preview/request-id-reused',
        defaultMessage: 'The preview request identifier was already used in this session.',
        retryable: false,
      });
      return;
    }
    this.#usedRequestIds.add(payload.requestId);
    this.#invalidateMeasure('Preview measurement was superseded by a render.');
    this.#invalidateRender('Preview render was superseded.');
    this.#measuredRenderDigest = undefined;
    this.#markerInventory.clear();
    const active: ActiveRender = {
      controller: new AbortController(),
      draftDigest: payload.draftDigest,
      generation: this.#renderGeneration,
      requestId: payload.requestId,
    };
    this.#activeRender = active;
    let result: Promise<PreviewRenderedPayload>;
    try {
      result = this.#renderCallback(payload, active.controller.signal);
    } catch {
      this.#settleFailure(active);
      return;
    }
    void Promise.resolve(result).then(
      (rendered) => {
        try {
          this.#settleRendered(active, rendered);
        } catch {
          this.#settleFailure(active);
        }
      },
      () => {
        this.#settleFailure(active);
      },
    );
  }

  #post(message: PreviewMessage): void {
    if (!isPreviewMessage(message)) {
      throw new TypeError('Refused an invalid outbound preview message.');
    }
    this.#sequence += 1;
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
    } else if (event.data.type === 'studio.preview/viewport') {
      // Geometry captured before a resize or semantic viewport switch no longer
      // describes the surface. Invalidate before listeners apply the new viewport.
      this.#invalidateMeasure('Preview viewport changed.');
      for (const listener of this.#viewportListeners) {
        listener(event.data.payload);
      }
    } else if (event.data.type === 'studio.preview/dispose') {
      // Resource revocation for a superseded draft; the channel stays open.
      if (
        event.data.payload.draftDigest === undefined ||
        event.data.payload.draftDigest === this.#activeRender?.draftDigest
      ) {
        this.#invalidateRender('Preview render was disposed.');
      }
      if (
        event.data.payload.draftDigest === undefined ||
        event.data.payload.draftDigest === this.#measuredRenderDigest
      ) {
        this.#invalidateMeasure('Preview measurement was disposed.');
        this.#measuredRenderDigest = undefined;
        this.#markerInventory.clear();
      }
      for (const listener of this.#disposeListeners) {
        listener(event.data.payload);
      }
    } else if (event.data.type === 'studio.preview/teardown') {
      this.dispose();
    }
  }

  // Measurer failure details never cross the channel: the rejection reason is dropped and a
  // stable generic error is posted instead, correlated by the request identifier.
  #settleMeasureFailure(
    active: ActiveMeasure,
    failure: { code: QualifiedName; defaultMessage: string; retryable: boolean },
  ): void {
    if (!this.#isActiveMeasure(active)) {
      return;
    }
    this.#activeMeasure = undefined;
    this.#postError(active.requestId, failure);
  }

  #postError(
    correlationId: string,
    failure: { code: QualifiedName; defaultMessage: string; retryable: boolean },
  ): void {
    if (this.#disposed) {
      return;
    }
    this.#post({
      channelId: this.#channelId,
      contractVersion: STUDIO_CONTRACT_VERSION,
      kind: 'preview-message',
      payload: {
        code: failure.code,
        correlationId,
        message: { defaultMessage: failure.defaultMessage, key: failure.code },
        retryable: failure.retryable,
      },
      sequence: this.#sequence,
      sessionGeneration: this.#sessionGeneration,
      type: 'studio.preview/error',
    });
  }

  // Geometry is stamped with the digest of the render the surface currently shows, and only
  // markers from the request are answered — requested markers the measurer cannot place are
  // listed as unknown, extra markers it invents are dropped. A measurement superseded by a
  // newer request, voided by a reload, or settling after disposal is dropped silently.
  #settleMeasured(
    active: ActiveMeasure,
    markers: StableId[],
    measurement: PreviewMeasurement,
  ): void {
    if (!this.#isActiveMeasure(active)) {
      return;
    }
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
    const message: PreviewMessage = {
      channelId: this.#channelId,
      contractVersion: STUDIO_CONTRACT_VERSION,
      kind: 'preview-message',
      payload: {
        draftDigest: active.draftDigest,
        measurements,
        requestId: active.requestId,
        unknown,
        viewport: {
          devicePixelRatio: measurement.viewport.devicePixelRatio,
          height: measurement.viewport.height,
          scrollX: measurement.viewport.scrollX,
          scrollY: measurement.viewport.scrollY,
          width: measurement.viewport.width,
        },
      },
      sequence: this.#sequence,
      sessionGeneration: this.#sessionGeneration,
      type: 'studio.preview/measurements',
    };
    if (!isPreviewMessage(message)) {
      this.#settleMeasureFailure(active, measureFailed());
      return;
    }
    this.#activeMeasure = undefined;
    this.#post(message);
  }

  // Renderer failure details never cross the channel: the rejection reason is dropped and a
  // stable generic error is posted instead, correlated by the unique render request id.
  #settleFailure(active: ActiveRender): void {
    if (!this.#isActiveRender(active)) {
      return;
    }
    this.#activeRender = undefined;
    this.#postError(active.requestId, {
      code: 'studio.preview/render-failed',
      defaultMessage: 'Preview rendering failed.',
      retryable: true,
    });
  }

  // The response digest is stamped from the request, so a callback can never answer for a
  // different draft than the one it was asked to render. Results that were superseded by a
  // newer request, or that settle after disposal, are dropped silently.
  #settleRendered(active: ActiveRender, rendered: PreviewRenderedPayload): void {
    if (!this.#isActiveRender(active)) {
      return;
    }
    if (
      !isPreviewRenderedPayload(rendered) ||
      rendered.draftDigest !== active.draftDigest ||
      rendered.requestId !== active.requestId
    ) {
      this.#settleFailure(active);
      return;
    }
    this.#activeRender = undefined;
    // The surface now shows this render; measurements are bound to its digest.
    this.#measuredRenderDigest = active.draftDigest;
    this.#markerInventory.clear();
    for (const marker of rendered.markers) {
      this.#markerInventory.add(marker);
    }
    this.#post({
      channelId: this.#channelId,
      contractVersion: STUDIO_CONTRACT_VERSION,
      kind: 'preview-message',
      payload: {
        diagnostics: rendered.diagnostics,
        draftDigest: active.draftDigest,
        markers: rendered.markers,
        markerMap: rendered.markerMap,
        requestId: active.requestId,
      },
      sequence: this.#sequence,
      sessionGeneration: this.#sessionGeneration,
      type: 'studio.preview/rendered',
    });
  }

  #invalidateMeasure(reason: string): void {
    this.#measureGeneration += 1;
    this.#activeMeasure?.controller.abort(reason);
    this.#activeMeasure = undefined;
  }

  #invalidateRender(reason: string): void {
    this.#renderGeneration += 1;
    this.#activeRender?.controller.abort(reason);
    this.#activeRender = undefined;
  }

  #isActiveMeasure(active: ActiveMeasure): boolean {
    return (
      !this.#disposed &&
      this.#activeMeasure === active &&
      active.generation === this.#measureGeneration &&
      active.draftDigest === this.#measuredRenderDigest
    );
  }

  #isActiveRender(active: ActiveRender): boolean {
    return (
      !this.#disposed &&
      this.#activeRender === active &&
      active.generation === this.#renderGeneration
    );
  }
}

function measureFailed(): { code: QualifiedName; defaultMessage: string; retryable: boolean } {
  return {
    code: 'studio.preview/measure-failed',
    defaultMessage: 'Preview measurement failed.',
    retryable: true,
  };
}
