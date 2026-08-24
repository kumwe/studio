import { computePreviewDraftDigest, type PreviewClient } from '@kumwe/studio-preview';
import type {
  BlueprintDocument,
  NodeId,
  PreviewMessage,
  PreviewReadyPayload,
  PreviewRenderedPayload,
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

export interface StudioPreviewSurfaceCallbacks {
  onActivated(nodeId: NodeId): void;
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
  #pendingIntent: PreviewIntent | undefined;
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
    this.#setState('current');
    this.selectNode(this.#selectedNodeId);
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
