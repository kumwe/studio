import {
  computePreviewDraftDigest,
  createPreviewMarker,
  createPreviewMarkerInventory,
  PreviewHost,
  type PreviewMeasurement,
} from '@kumwe/studio-preview';
import type {
  BlueprintDocument,
  BlueprintNode,
  MediaReference,
  NodeId,
  PreviewActivatedPayload,
  PreviewMarkerRect,
  PreviewRenderedPayload,
  PreviewRenderPayload,
  StableId,
  StudioDiagnostic,
  ThemeDocument,
} from '@kumwe/studio-protocol';
import {
  enhanceStudioWeb,
  renderStudioWeb,
  type ResolvedWebMedia,
  type StudioScopedStyleSheet,
  type StudioWebAdvancedAdapters,
  type StudioWebEnhancementHandle,
} from '@kumwe/studio-renderer-web';
import type { PreviewChannelEndpoint } from './preview-channel.js';

const REFERENCE_STYLE_NONCE = 'studio-reference-style-v1';

export interface ReferenceRendererOptions {
  adapters?: StudioWebAdvancedAdapters;
  channelId: string;
  endpoint: PreviewChannelEndpoint;
  origin: string;
  resolveBinding: (node: Readonly<BlueprintNode>, port: string) => unknown;
  /** Resolve the exact artifact, revision, and digest tuple named by a preview request. */
  resolveDraft: (payload: PreviewRenderPayload) => Promise<BlueprintDocument | undefined>;
  resolveMedia: (
    reference: Readonly<MediaReference>,
  ) => Promise<ResolvedWebMedia> | ResolvedWebMedia;
  scopedStyles?: Readonly<Record<string, StudioScopedStyleSheet>>;
  sessionGeneration: string;
  surface: HTMLElement;
  theme: ThemeDocument;
}

interface RenderResult {
  diagnostics: StudioDiagnostic[];
  markerByNode: Map<NodeId, StableId>;
  markerMap: Record<StableId, NodeId>;
  markers: StableId[];
}

/**
 * Preview bridge for the production semantic-web renderer. The only
 * TrustedHTML policy in this module accepts output returned directly by
 * `renderStudioWeb`; neither authored HTML nor host strings can reach it.
 * Canonical preview markers are added after parsing and verified against the
 * protocol's preorder inventory before the rendered response is announced.
 */
export function connectReferenceRenderer(options: ReferenceRendererOptions): PreviewHost {
  const { resolveDraft, surface, theme } = options;
  let enhancementHandle: StudioWebEnhancementHandle | undefined;
  let markerByNode = new Map<NodeId, StableId>();
  let currentDraftDigest: string | undefined;
  let selectedNodeId: NodeId | undefined;

  async function render(
    payload: PreviewRenderPayload,
    signal: AbortSignal,
  ): Promise<PreviewRenderedPayload> {
    const draft = await resolveDraft(payload);
    signal.throwIfAborted();
    if (draft === undefined) throw new Error('The requested draft digest is not resolvable.');
    if ((await computePreviewDraftDigest(draft)) !== payload.draftDigest) {
      throw new Error('The resolved draft no longer matches its requested digest.');
    }
    const viewport = theme.viewports.find((entry) => entry.id === payload.viewport);
    if (viewport === undefined)
      throw new Error('The requested viewport is not declared by the theme.');
    const result = await renderDraft(draft, viewport.id, payload.draftDigest, signal);
    const expected = createPreviewMarkerInventory(draft, payload.draftDigest);
    if (!sameMarkerInventory(result, expected)) {
      throw new Error('The renderer marker map does not match canonical Blueprint preorder.');
    }
    markerByNode = result.markerByNode;
    currentDraftDigest = payload.draftDigest;
    if (selectedNodeId !== undefined) highlight(selectedNodeId);
    return {
      diagnostics: result.diagnostics,
      draftDigest: payload.draftDigest,
      markerMap: result.markerMap,
      markers: result.markers,
      requestId: payload.requestId,
    };
  }

  async function renderDraft(
    draft: BlueprintDocument,
    viewport: string,
    draftDigest: string,
    signal: AbortSignal,
  ): Promise<RenderResult> {
    enhancementHandle?.dispose();
    enhancementHandle = undefined;
    surface.replaceChildren();
    surface.dataset.previewViewport = viewport;

    const output = await renderStudioWeb(draft, {
      cspNonce: REFERENCE_STYLE_NONCE,
      locale: 'en',
      resolveBinding: options.resolveBinding,
      resolveMedia: options.resolveMedia,
      ...(options.scopedStyles === undefined ? {} : { scopedStyles: options.scopedStyles }),
    });
    signal.throwIfAborted();

    const style = document.createElement('style');
    style.dataset.studioRenderer = 'semantic-web';
    style.nonce = REFERENCE_STYLE_NONCE;
    style.textContent = output.css;
    const content = document.createElement('div');
    content.className = 'preview-rendered-page';
    setTrustedRendererMarkup(content, output.html);
    if (draft.roots.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'preview-empty';
      empty.textContent = 'The composition is empty. Insert a block to preview it.';
      content.append(empty);
    }
    surface.replaceChildren(style, content);

    const result = markRenderedNodes(content, draft.roots, draftDigest);
    enhancementHandle = await enhanceStudioWeb(content, output, {
      ...(options.adapters === undefined ? {} : { adapters: options.adapters }),
      signal,
    });
    signal.throwIfAborted();
    return result;
  }

  function measure(markers: StableId[]): Promise<PreviewMeasurement> {
    const rects: Record<StableId, PreviewMarkerRect[]> = {};
    const surfaceRect = surface.getBoundingClientRect();
    for (const marker of markers) {
      const element = [...surface.querySelectorAll<HTMLElement>('[data-marker]')].find(
        (candidate) => candidate.dataset.marker === marker,
      );
      if (element === undefined) continue;
      const boxes = [...element.getClientRects()].map((rect) => ({
        height: rect.height,
        width: rect.width,
        x: rect.x - surfaceRect.x,
        y: rect.y - surfaceRect.y,
      }));
      if (boxes.length > 0) rects[marker] = boxes;
    }
    return Promise.resolve({
      rects,
      viewport: {
        devicePixelRatio: window.devicePixelRatio,
        height: surface.clientHeight,
        scrollX: surface.scrollLeft,
        scrollY: surface.scrollTop,
        width: surface.clientWidth,
      },
    });
  }

  function highlight(nodeId: NodeId): void {
    for (const previous of surface.querySelectorAll<HTMLElement>('[data-selected]')) {
      delete previous.dataset.selected;
    }
    const marker = markerByNode.get(nodeId);
    if (marker === undefined) return;
    const element = [...surface.querySelectorAll<HTMLElement>('[data-marker]')].find(
      (candidate) => candidate.dataset.marker === marker,
    );
    if (element !== undefined) element.dataset.selected = 'true';
  }

  const host = new PreviewHost({
    channelId: options.channelId,
    measure,
    render,
    renderer: 'studio.renderer/semantic-web',
    sessionGeneration: options.sessionGeneration,
    source: options.endpoint,
    target: options.endpoint,
    targetOrigin: options.origin,
    viewports: theme.viewports.map((viewport) => viewport.id),
  });
  host.onSelect((payload) => {
    selectedNodeId = payload.nodeId;
    highlight(payload.nodeId);
    if (payload.reveal === true) {
      surface
        .querySelector('[data-selected="true"]')
        ?.scrollIntoView({ behavior: 'auto', block: 'nearest' });
    }
  });
  host.onDispose((payload) => {
    if (payload.draftDigest !== undefined && payload.draftDigest !== currentDraftDigest) return;
    enhancementHandle?.dispose();
    enhancementHandle = undefined;
    currentDraftDigest = undefined;
    markerByNode = new Map();
    surface.replaceChildren();
  });

  const announceInteraction = (
    event: Event,
    interaction: PreviewActivatedPayload['interaction'],
  ): void => {
    if (!event.isTrusted) return;
    const origin = event.target;
    const marked = origin instanceof Element ? origin.closest<HTMLElement>('[data-marker]') : null;
    const marker = marked?.dataset.marker;
    if (marker === undefined || marked === null || !surface.contains(marked)) return;
    host.announceActivation({ interaction, marker });
  };
  surface.addEventListener('click', (event) => announceInteraction(event, 'activate'));
  surface.addEventListener('contextmenu', (event) => announceInteraction(event, 'context-menu'));
  surface.addEventListener('focusin', (event) => announceInteraction(event, 'focus'));
  return host;
}

function markRenderedNodes(
  content: HTMLElement,
  roots: readonly BlueprintNode[],
  draftDigest: string,
): RenderResult {
  const result: RenderResult = {
    diagnostics: [],
    markerByNode: new Map(),
    markerMap: {},
    markers: [],
  };
  const elementByNode = new Map(
    [...content.querySelectorAll<HTMLElement>('[data-studio-node]')].flatMap((element) => {
      const nodeId = element.dataset.studioNode;
      return nodeId === undefined ? [] : [[nodeId, element] as const];
    }),
  );
  const visit = (node: BlueprintNode): void => {
    const element = elementByNode.get(node.id);
    if (element === undefined) {
      result.diagnostics.push({
        code: 'studio.renderer/missing-node',
        location: { nodeId: node.id },
        message: {
          defaultMessage: 'The semantic renderer did not produce a node marker target.',
          key: 'studio.renderer/missing-node',
        },
        severity: 'error',
      });
      return;
    }
    const marker = createPreviewMarker(draftDigest, result.markers.length);
    element.dataset.marker = marker;
    result.markers.push(marker);
    result.markerMap[marker] = node.id;
    result.markerByNode.set(node.id, marker);
    for (const children of Object.values(node.slots)) children.forEach(visit);
  };
  roots.forEach(visit);
  return result;
}

function sameMarkerInventory(
  actual: Pick<RenderResult, 'markerMap' | 'markers'>,
  expected: Pick<RenderResult, 'markerMap' | 'markers'>,
): boolean {
  return (
    actual.markers.length === expected.markers.length &&
    actual.markers.every(
      (marker, index) =>
        marker === expected.markers[index] &&
        actual.markerMap[marker] === expected.markerMap[marker],
    ) &&
    Object.keys(actual.markerMap).length === Object.keys(expected.markerMap).length
  );
}

interface TrustedHtmlPolicy {
  createHTML(value: string): unknown;
}

interface TrustedTypesFactory {
  createPolicy(name: string, rules: { createHTML: (value: string) => string }): TrustedHtmlPolicy;
}

let rendererPolicy: TrustedHtmlPolicy | undefined;

function setTrustedRendererMarkup(holder: HTMLElement, markup: string): void {
  const trustedTypes = (window as Window & { trustedTypes?: TrustedTypesFactory }).trustedTypes;
  rendererPolicy ??= trustedTypes?.createPolicy('studio-renderer', {
    createHTML: (value) => value,
  });
  const sink = holder as unknown as { innerHTML: unknown };
  sink.innerHTML = rendererPolicy?.createHTML(markup) ?? markup;
}
