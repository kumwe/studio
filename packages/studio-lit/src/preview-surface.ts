import {
  computePreviewDraftDigest,
  type PreviewClient,
  type PreviewMeasureOutcome,
} from '@kumwe/studio-preview';
import type {
  BlueprintDocument,
  NodeId,
  PreviewMarkerRect,
  PreviewMessage,
  PreviewReadyPayload,
  PreviewRenderedPayload,
  PreviewViewportMetrics,
  QualifiedName,
  Revision,
  StableId,
} from '@kumwe/studio-protocol';

/** Host-authored identity for the exact validated draft staged for preview. */
export interface StudioPreviewDraftIdentity {
  artifactId: StableId;
  draftDigest: string;
  draftRevision: Revision;
}

export interface StudioPreviewStageOptions {
  /** Aborts when a newer shell state supersedes this staging attempt. */
  signal: AbortSignal;
}

/**
 * Browser-preview resources supplied by the embedding host.
 *
 * The shell owns the client after binding. The host still owns authenticated
 * staging, authorization, the renderer route and the framed (or equivalently
 * isolated) surface. `stage` must bind and return the identity of exactly the
 * draft it receives; the shell never fabricates a preview credential or
 * treats the digest as authority.
 */
export interface StudioPreviewBinding {
  client: PreviewClient;
  stage(
    draft: BlueprintDocument,
    options: Readonly<StudioPreviewStageOptions>,
  ): Promise<StudioPreviewDraftIdentity>;
}

export type StudioPreviewState = 'closed' | 'connecting' | 'current' | 'rendering' | 'stale';

/**
 * Volatile visual geometry for one accepted render. The map is deliberately
 * node-oriented for the shell, while the wire remains marker-oriented. No
 * member of this object is serialized into a Studio artifact.
 */
export interface StudioPreviewGeometry {
  draftDigest: string;
  measurements: Readonly<Record<NodeId, readonly PreviewMarkerRect[]>>;
  unknownNodeIds: readonly NodeId[];
  viewport: Readonly<PreviewViewportMetrics>;
}

export interface StudioPreviewSurfaceCallbacks {
  onActivated(nodeId: NodeId): void;
  onGeometry?(geometry: StudioPreviewGeometry | undefined): void;
  onMessage(message: PreviewMessage): void;
  onState(state: StudioPreviewState): void;
}

interface PreviewIntent {
  draft: BlueprintDocument;
  generation: number;
  viewport: string | undefined;
}

/**
 * Deterministic shell-side orchestration around the canonical PreviewClient.
 * A microtask is the only coalescing boundary: all synchronous changes reduce
 * to the final immutable snapshot, with no clock or debounce interval in the
 * observable behavior. Every newer intent aborts prior work and generation
 * checks prevent a staging or renderer callback that ignores cancellation
 * from publishing stale marker authority.
 */
export class StudioPreviewSurface {
  readonly #binding: StudioPreviewBinding;
  readonly #callbacks: StudioPreviewSurfaceCallbacks;
  readonly #controllers = new Set<AbortController>();
  readonly #unsubscribeActivated: () => void;
  readonly #unsubscribeMessages: () => void;
  #accepted = false;
  #acceptedDigest: string | undefined;
  #closed = false;
  #generation = 0;
  #lastViewport: string | undefined;
  #latestIntent: PreviewIntent | undefined;
  #markerMap: Record<StableId, NodeId> = {};
  #measurementController: AbortController | undefined;
  #measurementGeneration = 0;
  #pendingIntent: PreviewIntent | undefined;
  #rendered: PreviewRenderedPayload | undefined;
  #measureSerial = 0;
  #renderSerial = 0;
  #scheduled = false;
  #selectedNodeId: NodeId | undefined;
  #state: StudioPreviewState = 'connecting';

  public constructor(binding: StudioPreviewBinding, callbacks: StudioPreviewSurfaceCallbacks) {
    this.#binding = binding;
    this.#callbacks = callbacks;
    this.#unsubscribeMessages = binding.client.onMessage((message) => {
      this.#receive(message);
    });
    this.#unsubscribeActivated = binding.client.onActivated((payload) => {
      const nodeId = this.#markerMap[payload.marker];
      if (nodeId === undefined) {
        return;
      }
      this.#selectedNodeId = nodeId;
      this.#callbacks.onActivated(nodeId);
    });
    callbacks.onState(this.#state);
  }

  public get state(): StudioPreviewState {
    return this.#state;
  }

  /** Queue the latest complete draft and semantic viewport for rendering. */
  public update(draft: BlueprintDocument, viewport: string | undefined): void {
    if (this.#closed) {
      return;
    }
    let snapshot: BlueprintDocument;
    try {
      snapshot = structuredClone(draft);
    } catch {
      this.#setState('stale');
      return;
    }
    this.#generation += 1;
    const intent: PreviewIntent = { draft: snapshot, generation: this.#generation, viewport };
    this.#latestIntent = intent;
    this.#pendingIntent = intent;
    if (this.#acceptedDigest !== undefined) {
      try {
        this.#binding.client.disposeDraft({
          draftDigest: this.#acceptedDigest,
          reason: 'studio.preview/draft-superseded',
        });
      } catch {
        // The visible state below becomes stale. A closed remote channel
        // cannot be revived by a best-effort resource revocation.
      }
    }
    this.#accepted = false;
    this.#acceptedDigest = undefined;
    this.#markerMap = {};
    this.#rendered = undefined;
    this.#clearGeometry();
    for (const controller of this.#controllers) {
      controller.abort('Preview render was superseded by newer authoring state.');
    }
    this.#schedule();
  }

  /**
   * Mirror shell selection only after the latest marker map proves that the
   * node has a live rendered region. Selection remains fully usable without
   * that proof; it is simply not sent into a stale surface.
   */
  public selectNode(nodeId: NodeId | undefined): void {
    this.#selectedNodeId = nodeId;
    if (nodeId === undefined || !Object.values(this.#markerMap).includes(nodeId)) {
      return;
    }
    try {
      this.#binding.client.select({ nodeId, reveal: true });
    } catch {
      this.#setState('stale');
    }
  }

  /**
   * Re-measure the current render after host-observed scroll, resize, zoom or
   * late asset settlement. The call is inert until a render is accepted.
   */
  public refreshGeometry(): void {
    const rendered = this.#rendered;
    if (rendered !== undefined && this.#accepted) {
      void this.#measure(rendered);
    }
  }

  /** End the preview channel and release every shell-side listener. */
  public teardown(reason: QualifiedName): void {
    if (this.#closed) {
      return;
    }
    try {
      this.#binding.client.teardown(reason);
    } catch {
      // A remote teardown may already have disposed the client. Local cleanup
      // remains deterministic and cannot reopen a closed channel.
    }
    this.#close();
  }

  #close(): void {
    if (this.#closed) {
      return;
    }
    this.#closed = true;
    this.#generation += 1;
    this.#pendingIntent = undefined;
    this.#accepted = false;
    this.#acceptedDigest = undefined;
    this.#markerMap = {};
    this.#rendered = undefined;
    this.#clearGeometry();
    for (const controller of this.#controllers) {
      controller.abort('Preview channel closed.');
    }
    this.#controllers.clear();
    this.#unsubscribeActivated();
    this.#unsubscribeMessages();
    this.#setState('closed');
  }

  async #perform(intent: PreviewIntent): Promise<void> {
    const controller = new AbortController();
    this.#controllers.add(controller);
    try {
      this.#setState('connecting');
      const ready = await this.#binding.client.ready({ signal: controller.signal });
      if (!this.#isCurrent(intent, controller)) {
        return;
      }
      const viewport = this.#resolveViewport(intent, ready);
      if (viewport === undefined) {
        this.#setState('stale');
        return;
      }
      const expectedDigest = await computePreviewDraftDigest(intent.draft);
      if (!this.#isCurrent(intent, controller)) {
        return;
      }
      const identity = await this.#binding.stage(intent.draft, { signal: controller.signal });
      if (!this.#isCurrent(intent, controller)) {
        return;
      }
      if (
        identity.artifactId !== intent.draft.id ||
        identity.draftRevision !== intent.draft.revision ||
        identity.draftDigest !== expectedDigest
      ) {
        throw new TypeError('The host staged a different preview draft identity.');
      }
      if (this.#lastViewport !== viewport) {
        this.#binding.client.setViewport({ viewport });
        this.#lastViewport = viewport;
      }
      this.#renderSerial += 1;
      this.#setState('rendering');
      const rendered = await this.#binding.client.render(
        {
          artifactId: identity.artifactId,
          draftDigest: identity.draftDigest,
          draftRevision: identity.draftRevision,
          requestId: `renders/studio-shell-${this.#renderSerial}`,
          viewport,
        },
        { signal: controller.signal },
      );
      if (!this.#isCurrent(intent, controller)) {
        return;
      }
      this.#accept(rendered);
    } catch {
      if (this.#isCurrent(intent, controller)) {
        this.#accepted = false;
        this.#acceptedDigest = undefined;
        this.#markerMap = {};
        this.#rendered = undefined;
        this.#clearGeometry();
        this.#setState('stale');
      }
    } finally {
      this.#controllers.delete(controller);
    }
  }

  #accept(rendered: PreviewRenderedPayload): void {
    this.#markerMap = structuredClone(rendered.markerMap);
    this.#accepted = true;
    this.#acceptedDigest = rendered.draftDigest;
    this.#rendered = structuredClone(rendered);
    this.#setState('current');
    this.selectNode(this.#selectedNodeId);
    void this.#measure(rendered);
  }

  async #measure(rendered: PreviewRenderedPayload): Promise<void> {
    const entries = Object.entries(rendered.markerMap);
    if (entries.length === 0) {
      this.#clearGeometry();
      return;
    }
    this.#measurementController?.abort('Preview geometry was superseded by a newer measurement.');
    this.#measurementGeneration += 1;
    const generation = this.#measurementGeneration;
    const controller = new AbortController();
    this.#measurementController = controller;
    this.#controllers.add(controller);
    const measurements: Record<NodeId, PreviewMarkerRect[]> = {};
    const unknownNodeIds: NodeId[] = [];
    let viewport: PreviewViewportMetrics | undefined;
    try {
      // The wire deliberately bounds each request. Sequential chunks retain
      // the same accepted digest while supporting documents larger than one
      // request without racing the responder's latest-measure generation.
      for (let offset = 0; offset < entries.length; offset += 1_000) {
        const chunk = entries.slice(offset, offset + 1_000);
        this.#measureSerial += 1;
        const outcome: PreviewMeasureOutcome = await this.#binding.client.measure(
          {
            markers: chunk.map(([marker]) => marker),
            requestId: `measurements/studio-shell-${this.#measureSerial}`,
          },
          { signal: controller.signal },
        );
        if (
          !this.#isAcceptedGeometry(rendered, controller, generation) ||
          outcome.status !== 'measured'
        ) {
          return;
        }
        viewport ??= structuredClone(outcome.geometry.viewport);
        for (const [marker, rects] of Object.entries(outcome.geometry.measurements)) {
          const nodeId = rendered.markerMap[marker];
          if (nodeId !== undefined) {
            measurements[nodeId] = structuredClone(rects);
          }
        }
        for (const marker of outcome.geometry.unknown) {
          const nodeId = rendered.markerMap[marker];
          if (nodeId !== undefined) {
            unknownNodeIds.push(nodeId);
          }
        }
      }
      if (viewport !== undefined && this.#isAcceptedGeometry(rendered, controller, generation)) {
        this.#callbacks.onGeometry?.({
          draftDigest: rendered.draftDigest,
          measurements,
          unknownNodeIds,
          viewport,
        });
      }
    } catch {
      // Geometry is a progressive enhancement. Losing it must not revoke a
      // valid render, selection, outline or keyboard command surface.
      if (this.#isAcceptedGeometry(rendered, controller, generation)) {
        this.#callbacks.onGeometry?.(undefined);
      }
    } finally {
      this.#controllers.delete(controller);
      if (this.#measurementController === controller) {
        this.#measurementController = undefined;
      }
    }
  }

  #isAcceptedGeometry(
    rendered: PreviewRenderedPayload,
    controller: AbortController,
    generation: number,
  ): boolean {
    return (
      !this.#closed &&
      !controller.signal.aborted &&
      generation === this.#measurementGeneration &&
      this.#accepted &&
      this.#acceptedDigest === rendered.draftDigest &&
      this.#rendered?.requestId === rendered.requestId
    );
  }

  #clearGeometry(): void {
    this.#measurementGeneration += 1;
    this.#measurementController?.abort('Preview geometry authority was revoked.');
    this.#measurementController = undefined;
    this.#callbacks.onGeometry?.(undefined);
  }

  #isCurrent(intent: PreviewIntent, controller: AbortController): boolean {
    return (
      !this.#closed &&
      !controller.signal.aborted &&
      intent.generation === this.#generation &&
      this.#latestIntent?.generation === intent.generation
    );
  }

  #receive(message: PreviewMessage): void {
    this.#callbacks.onMessage(message);
    if (message.type === 'studio.preview/reload') {
      this.#accepted = false;
      this.#acceptedDigest = undefined;
      this.#lastViewport = undefined;
      this.#markerMap = {};
      this.#rendered = undefined;
      this.#clearGeometry();
      this.#setState('stale');
      const latest = this.#latestIntent;
      if (latest !== undefined) {
        this.update(latest.draft, latest.viewport);
      }
    } else if (message.type === 'studio.preview/ready') {
      if (!this.#accepted && this.#controllers.size === 0 && this.#pendingIntent === undefined) {
        const latest = this.#latestIntent;
        if (latest !== undefined) {
          this.update(latest.draft, latest.viewport);
        }
      }
    } else if (message.type === 'studio.preview/teardown') {
      this.#close();
    } else if (
      message.type === 'studio.preview/error' &&
      message.payload.correlationId === undefined
    ) {
      this.#accepted = false;
      this.#acceptedDigest = undefined;
      this.#markerMap = {};
      this.#rendered = undefined;
      this.#clearGeometry();
      this.#setState('stale');
    }
  }

  #resolveViewport(intent: PreviewIntent, ready: PreviewReadyPayload): string | undefined {
    const viewport = intent.viewport ?? ready.viewports[0];
    return viewport !== undefined && ready.viewports.includes(viewport) ? viewport : undefined;
  }

  #schedule(): void {
    if (this.#scheduled) {
      return;
    }
    this.#scheduled = true;
    queueMicrotask(() => {
      this.#scheduled = false;
      const intent = this.#pendingIntent;
      this.#pendingIntent = undefined;
      if (intent !== undefined && !this.#closed) {
        void this.#perform(intent);
      }
    });
  }

  #setState(state: StudioPreviewState): void {
    if (state === this.#state) {
      return;
    }
    this.#state = state;
    this.#callbacks.onState(state);
  }
}
