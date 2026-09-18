import { html, render } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { computePreviewDraftDigest } from '@kumwe/studio-preview';
import type {
  BlueprintDocument,
  BlueprintNode,
  EntryDocument,
  JsonValue,
  NodeId,
  PreviewMarkerRect,
  ThemeViewport,
} from '@kumwe/studio-protocol';
import {
  enhanceStudioWeb,
  renderStudioWeb,
  type StudioWebEnhancementHandle,
  type StudioWebRenderContext,
} from '@kumwe/studio-renderer-web';
import type { StudioPreviewGeometry } from './preview-surface.js';

/** Explicit local projection input, never a substitute for an authoritative host preview. */
export interface StudioLocalCanvasContext {
  readonly entry?: Readonly<EntryDocument>;
  readonly renderContext?: Readonly<StudioWebRenderContext>;
}

/**
 * The responsive widths the local canvas offers when no theme declares its
 * own. They mirror the semantic web renderer's fixed 48rem/75rem breakpoints,
 * so every width shows behaviour the public renderer really produces. They
 * are authoring chrome, never stored in a Blueprint.
 */
export const STUDIO_LOCAL_CANVAS_VIEWPORTS: readonly ThemeViewport[] = Object.freeze([
  {
    base: true,
    id: 'compact',
    label: { key: 'studio.local/compact', defaultMessage: 'Mobile' },
    order: 0,
    previewWidth: 360,
  },
  {
    base: false,
    id: 'medium',
    label: { key: 'studio.local/medium', defaultMessage: 'Tablet' },
    order: 1,
    previewWidth: 768,
  },
  {
    base: false,
    id: 'expanded',
    label: { key: 'studio.local/expanded', defaultMessage: 'Desktop' },
    order: 2,
    previewWidth: 1440,
  },
]);

export interface StudioLocalCanvasCallbacks {
  onActivated(nodeId: NodeId): void;
  onGeometry(geometry: StudioPreviewGeometry | undefined): void;
  onState(state: 'current' | 'rendering' | 'unavailable'): void;
}

const EDITOR_CSS = `
:host{display:block;min-inline-size:0;color:#18202a;background:white}
.canvas-frame{position:relative;min-block-size:20rem;overflow:hidden}
.canvas-viewport{position:absolute;inset-block-start:0;inset-inline-start:0;transform-origin:top left;container-type:inline-size;container-name:studio-local-canvas;font:400 16px/1.5 system-ui,sans-serif}
.canvas-page{display:flow-root;min-block-size:320px;padding:24px;box-sizing:border-box;overflow-wrap:anywhere}
.canvas-page :is(h1,h2,h3,h4,h5,h6){line-height:1.2}
.canvas-page [data-studio-layout]:empty{min-block-size:4rem;outline:1px dashed #c5cad2;outline-offset:-1px}
.canvas-page :is(h1,h2,h3,h4,h5,h6):empty{min-block-size:1.2em;outline:1px dashed #c5cad2}
.canvas-page [data-studio-block]{position:relative}
.canvas-page img{max-inline-size:100%;block-size:auto}
.canvas-page [data-studio-part=action]{display:inline-block;padding:.7em 1.2em;border:1px solid currentColor;border-radius:.3rem;text-decoration:none}
`;

/**
 * The portable renderer mounted into an isolated local authoring surface.
 *
 * Only renderStudioWeb's freshly generated output reaches Lit's markup directive;
 * there is deliberately no public HTML or CSS setter. The enclosing document's
 * existing lit-html Trusted Types policy is sufficient. Constructed stylesheets
 * keep local authoring compatible with style-src 'none', without a nonce, iframe,
 * network request or an executable string. All objects are ephemeral UI state.
 */
export class StudioLocalCanvas {
  readonly #host: HTMLElement;
  readonly #root: ShadowRoot;
  readonly #callbacks: StudioLocalCanvasCallbacks;
  readonly #sheet: CSSStyleSheet;
  readonly #layoutSheet: CSSStyleSheet;
  readonly #resize: ResizeObserver | undefined;
  #abort: AbortController | undefined;
  #enhancements: StudioWebEnhancementHandle | undefined;
  #disposed = false;
  #generation = 0;
  #digest: string | undefined;
  #nodes: ReadonlySet<string> = new Set();
  #width = 1440;
  #layout = '';
  #frame: number | undefined;
  #ready: Promise<void> = Promise.resolve();

  public constructor(host: HTMLElement, callbacks: StudioLocalCanvasCallbacks) {
    this.#host = host;
    this.#callbacks = callbacks;
    this.#root = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
    this.#sheet = new CSSStyleSheet();
    this.#layoutSheet = new CSSStyleSheet();
    this.#root.adoptedStyleSheets = [this.#sheet, this.#layoutSheet];
    this.#root.addEventListener('click', this.#onClick);
    this.#root.addEventListener('submit', this.#preventNavigation);
    this.#root.addEventListener('load', this.#requestMeasurement, true);
    host.ownerDocument.defaultView?.addEventListener('resize', this.#requestMeasurement);
    host.ownerDocument.defaultView?.addEventListener('scroll', this.#requestMeasurement, true);
    this.#resize =
      typeof ResizeObserver === 'undefined'
        ? undefined
        : new ResizeObserver(this.#requestMeasurement);
    this.#resize?.observe(host);
    void host.ownerDocument.fonts?.ready.then(this.#requestMeasurement);
  }

  public get ready(): Promise<void> {
    return this.#ready;
  }

  public update(
    draft: BlueprintDocument,
    context: StudioLocalCanvasContext,
    width: number,
  ): Promise<void> {
    if (this.#disposed) return Promise.resolve();
    this.#generation += 1;
    const generation = this.#generation;
    this.#abort?.abort();
    const controller = new AbortController();
    this.#abort = controller;
    this.#digest = undefined;
    this.#callbacks.onGeometry(undefined);
    this.#callbacks.onState('rendering');
    this.#ready = this.#render(draft, context, width, generation, controller);
    return this.#ready;
  }

  public refreshGeometry(): void {
    this.#requestMeasurement();
  }

  public reveal(nodeId: NodeId): void {
    for (const element of this.#root.querySelectorAll<HTMLElement>('[data-studio-node]')) {
      if (element.dataset.studioNode === nodeId) {
        element.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
        break;
      }
    }
    this.#requestMeasurement();
  }

  public dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#generation += 1;
    this.#abort?.abort();
    this.#enhancements?.dispose();
    this.#resize?.disconnect();
    if (this.#frame !== undefined)
      this.#host.ownerDocument.defaultView?.cancelAnimationFrame(this.#frame);
    this.#root.removeEventListener('click', this.#onClick);
    this.#root.removeEventListener('submit', this.#preventNavigation);
    this.#root.removeEventListener('load', this.#requestMeasurement, true);
    this.#host.ownerDocument.defaultView?.removeEventListener('resize', this.#requestMeasurement);
    this.#host.ownerDocument.defaultView?.removeEventListener(
      'scroll',
      this.#requestMeasurement,
      true,
    );
    render(null, this.#root);
    this.#root.adoptedStyleSheets = [];
    this.#callbacks.onGeometry(undefined);
  }

  async #render(
    draft: BlueprintDocument,
    context: StudioLocalCanvasContext,
    width: number,
    generation: number,
    controller: AbortController,
  ): Promise<void> {
    try {
      if (!Number.isFinite(width) || width < 1 || width > 10_000)
        throw new RangeError('The canvas width is outside the supported viewport bounds.');
      const snapshot = structuredClone(draft);
      const entry = context.entry === undefined ? undefined : structuredClone(context.entry);
      const renderContext: StudioWebRenderContext = {
        ...context.renderContext,
        resolveBinding:
          context.renderContext?.resolveBinding ??
          ((node, port) => resolveLocalBinding(node, port, entry)),
      };
      const [output, digest] = await Promise.all([
        renderStudioWeb(snapshot, renderContext),
        computePreviewDraftDigest(snapshot),
      ]);
      if (!this.#current(generation, controller)) return;
      this.#enhancements?.dispose();
      this.#enhancements = undefined;
      this.#width = width;
      // Only the semantic renderer's fixed width queries become container
      // queries. Print and reduced-motion queries retain browser semantics.
      const canvasCss = output.css.replaceAll(
        /@media\s*\(width\s*>=\s*(48|75)rem\)/gu,
        '@container studio-local-canvas (width >= $1rem)',
      );
      this.#sheet.replaceSync(EDITOR_CSS + canvasCss);
      render(
        html`<div class="canvas-frame">
          <div class="canvas-viewport">
            <div class="canvas-page">${unsafeHTML(output.html)}</div>
          </div>
        </div>`,
        this.#root,
      );
      const page = this.#root.querySelector<HTMLElement>('.canvas-page');
      if (page === null) throw new Error('The local canvas has no rendered page.');
      this.#nodes = nodeIds(snapshot.roots);
      const markers = [...page.querySelectorAll<HTMLElement>('[data-studio-node]')];
      const renderedIds = markers.map((element) => element.dataset.studioNode ?? '');
      if (
        renderedIds.length !== this.#nodes.size ||
        new Set(renderedIds).size !== renderedIds.length ||
        renderedIds.some((id) => !this.#nodes.has(id))
      ) {
        throw new Error('The local canvas renderer did not preserve the exact node inventory.');
      }
      const enhancements = await enhanceStudioWeb(page, output, { signal: controller.signal });
      if (!this.#current(generation, controller)) {
        enhancements.dispose();
        return;
      }
      this.#enhancements = enhancements;
      this.#digest = digest;
      this.#resize?.disconnect();
      this.#resize?.observe(this.#host);
      this.#resize?.observe(page);
      this.#measure();
      this.#callbacks.onState('current');
      this.#requestMeasurement();
    } catch {
      if (!this.#current(generation, controller)) return;
      this.#digest = undefined;
      this.#enhancements?.dispose();
      this.#enhancements = undefined;
      render(null, this.#root);
      this.#callbacks.onGeometry(undefined);
      this.#callbacks.onState('unavailable');
    }
  }

  #current(generation: number, controller: AbortController): boolean {
    return !this.#disposed && !controller.signal.aborted && generation === this.#generation;
  }

  readonly #preventNavigation = (event: Event): void => {
    event.preventDefault();
  };

  readonly #onClick = (event: Event): void => {
    // Local authoring never submits a form or follows a link into another page.
    const path = event.composedPath();
    if (path.some((target) => target instanceof Element && target.matches('a,form')))
      event.preventDefault();
    const marked = path.find(
      (target) => target instanceof HTMLElement && target.dataset.studioNode !== undefined,
    );
    if (
      marked instanceof HTMLElement &&
      marked.dataset.studioNode !== undefined &&
      this.#nodes.has(marked.dataset.studioNode)
    )
      this.#callbacks.onActivated(marked.dataset.studioNode);
  };

  readonly #requestMeasurement = (): void => {
    if (this.#disposed || this.#frame !== undefined) return;
    const window = this.#host.ownerDocument.defaultView;
    if (window === null) return;
    this.#frame = window.requestAnimationFrame(() => {
      this.#frame = undefined;
      this.#measure();
    });
  };

  #measure(): void {
    if (this.#disposed || this.#digest === undefined || !this.#host.isConnected) return;
    const page = this.#root.querySelector<HTMLElement>('.canvas-page');
    if (page === null) return;
    const available = this.#host.clientWidth;
    const scale = available > 0 ? Math.min(1, available / this.#width) : 1;
    const height = Math.max(320, page.scrollHeight, page.offsetHeight);
    const layout = `.canvas-viewport{inline-size:${this.#width}px;transform:scale(${scale})}.canvas-frame{block-size:${Math.ceil(height * scale)}px}`;
    if (layout !== this.#layout) {
      this.#layout = layout;
      this.#layoutSheet.replaceSync(layout);
    }
    const origin = this.#host.getBoundingClientRect();
    if (origin.width <= 0 || origin.height <= 0) return;
    const measurements: Record<NodeId, PreviewMarkerRect[]> = {};
    const unknownNodeIds: NodeId[] = [];
    for (const element of page.querySelectorAll<HTMLElement>('[data-studio-node]')) {
      const id = element.dataset.studioNode;
      if (id === undefined || !this.#nodes.has(id)) continue;
      const rects = [...element.getClientRects()]
        .filter((rect) => rect.width > 0 && rect.height > 0)
        .map((rect) => ({
          height: rect.height,
          width: rect.width,
          x: rect.x - origin.x,
          y: rect.y - origin.y,
        }));
      if (rects.length === 0) unknownNodeIds.push(id);
      else measurements[id] = rects;
    }
    this.#callbacks.onGeometry({
      draftDigest: this.#digest,
      measurements,
      unknownNodeIds,
      viewport: {
        devicePixelRatio: this.#host.ownerDocument.defaultView?.devicePixelRatio ?? 1,
        height: origin.height,
        scrollX: 0,
        scrollY: 0,
        width: origin.width,
      },
    });
  }
}

function nodeIds(roots: readonly BlueprintNode[]): ReadonlySet<NodeId> {
  const result = new Set<NodeId>();
  const pending = [...roots];
  while (pending.length > 0) {
    const node = pending.pop();
    if (node === undefined) continue;
    if (result.has(node.id))
      throw new TypeError('The canvas draft contains duplicate node identities.');
    result.add(node.id);
    for (const children of Object.values(node.slots)) pending.push(...children);
  }
  return result;
}

/** Local evaluation is deliberately limited; it cannot run a query or host transform. */
function resolveLocalBinding(
  node: Readonly<BlueprintNode>,
  port: string,
  entry: Readonly<EntryDocument> | undefined,
): unknown {
  const binding = node.bindings[port];
  if (binding === undefined) return undefined;
  if (binding.transforms.length !== 0)
    return binding.onError === 'fallback' ? binding.fallback : undefined;
  if (binding.source.kind === 'static-value') return binding.source.value;
  if (binding.source.kind !== 'entry-field')
    return binding.onError === 'fallback' ? binding.fallback : undefined;
  let value: JsonValue | undefined = entry?.values;
  for (const part of binding.source.fieldPath) {
    if (
      value === undefined ||
      value === null ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      !Object.hasOwn(value, part)
    )
      return binding.onNull === 'fallback' ? binding.fallback : undefined;
    value = value[part];
  }
  return value ?? (binding.onNull === 'fallback' ? binding.fallback : undefined);
}
