import {
  computePreviewDraftDigest,
  createPreviewMarker,
  createPreviewMarkerInventory,
  PreviewHost,
  type PreviewMeasurement,
} from '@kumwe/studio-preview';
import {
  CORE_LAYOUT_BLOCK_TYPES,
  CORE_LAYOUT_THEME_CONTROLS,
  isCoreLayoutBlockType,
  resolveCoreLayoutIntent,
} from '@kumwe/studio-core';
import type {
  BlueprintDocument,
  BlueprintNode,
  NodeId,
  PreviewMarkerRect,
  PreviewRenderedPayload,
  PreviewRenderPayload,
  StableId,
  StudioDiagnostic,
  ThemeDocument,
  ThemeViewport,
} from '@kumwe/studio-protocol';
import type { PreviewChannelEndpoint } from './preview-channel.js';

export interface ReferenceRendererOptions {
  channelId: string;
  endpoint: PreviewChannelEndpoint;
  origin: string;
  /**
   * Resolves the exact artifact, revision, and digest tuple to the composition
   * it names. The request carries a bounded reference — never the document —
   * so the host owns validation and storage and the renderer reads the draft
   * back through this seam.
   */
  resolveDraft: (payload: PreviewRenderPayload) => Promise<BlueprintDocument | undefined>;
  sessionGeneration: string;
  surface: HTMLElement;
  theme: ThemeDocument;
}

/**
 * Renderer-owned projection from theme design-control choices to concrete CSS
 * values. The theme document stays declarative (controls, choices, recipes);
 * only the renderer knows what a choice means visually, and it publishes that
 * meaning exclusively as `--theme-*` custom properties the bundled stylesheet
 * consumes.
 */
const themeTokenCss: Record<string, Record<string, string>> = {
  'block-gap': { cozy: '0.5rem', roomy: '1rem' },
  'heading-scale': { display: '1.25rem', regular: '1rem' },
  [CORE_LAYOUT_THEME_CONTROLS.spacing]: {
    comfortable: '1rem',
    compact: '0.5rem',
    none: '0',
    spacious: '2rem',
  },
  'surface-tone': { paper: '#ffffff', tinted: '#eef2fb' },
};

/**
 * Column-span each named inline size role occupies inside the preview grid.
 * The grid's column count follows the active viewport (four wide, two medium,
 * one compact), so a `quarter` block reflows four-to-two-to-one across the
 * viewport switcher without storing any CSS in the document.
 */
const inlineSizeRoleSpans: Record<string, number> = {
  full: 4,
  half: 2,
  quarter: 1,
};

interface RenderResult {
  diagnostics: StudioDiagnostic[];
  markerByNode: Map<NodeId, StableId>;
  markerMap: Record<StableId, NodeId>;
  markers: StableId[];
}

/**
 * The reference renderer behind the preview bridge: it answers
 * `studio.preview/render` by projecting the resolved draft into semantic DOM
 * (built exclusively through `createElement`/`textContent`, so the page's
 * Trusted Types enforcement never sees a string sink), tags every rendered
 * node with an opaque marker it reports back through the marker map, supplies
 * the geometry measurer that turns marker ids into real client rectangles,
 * and reveals `studio.preview/select` targets by highlighting the marked
 * region. Returns the connected `PreviewHost`; the caller announces readiness
 * once its own side of the channel is listening.
 */
export function connectReferenceRenderer(options: ReferenceRendererOptions): PreviewHost {
  const { resolveDraft, surface, theme } = options;
  const recipesByBlockType = new Map(
    theme.recipes.map((recipe) => [recipe.blockType, recipe.designValues]),
  );
  let markerByNode = new Map<NodeId, StableId>();
  let selectedNodeId: NodeId | undefined;

  async function render(
    payload: PreviewRenderPayload,
    signal: AbortSignal,
  ): Promise<PreviewRenderedPayload> {
    const draft = await resolveDraft(payload);
    signal.throwIfAborted();
    if (draft === undefined) {
      // The responder replaces this reason with the stable, non-disclosing
      // `studio.preview/render-failed` error before it crosses the channel.
      throw new Error('The requested draft digest is not resolvable.');
    }
    if ((await computePreviewDraftDigest(draft)) !== payload.draftDigest) {
      throw new Error('The resolved draft no longer matches its requested digest.');
    }
    signal.throwIfAborted();
    const viewport = theme.viewports.find((entry) => entry.id === payload.viewport);
    if (viewport === undefined) {
      throw new Error('The requested viewport is not declared by the theme.');
    }
    const result = renderDraft(draft, viewport, payload.draftDigest);
    const expected = createPreviewMarkerInventory(draft, payload.draftDigest);
    if (!sameMarkerInventory(result, expected)) {
      throw new Error('The renderer marker map does not match canonical Blueprint preorder.');
    }
    markerByNode = result.markerByNode;
    if (selectedNodeId !== undefined) {
      highlight(selectedNodeId);
    }
    return {
      diagnostics: result.diagnostics,
      draftDigest: payload.draftDigest,
      markerMap: result.markerMap,
      markers: result.markers,
      requestId: payload.requestId,
    };
  }

  function renderDraft(
    draft: BlueprintDocument,
    viewport: ThemeViewport,
    draftDigest: string,
  ): RenderResult {
    const columns = columnsForViewport(viewport);
    const result: RenderResult = {
      diagnostics: [],
      markerByNode: new Map(),
      markerMap: {},
      markers: [],
    };

    surface.replaceChildren();
    surface.dataset.previewViewport = viewport.id;
    surface.style.maxWidth = `${viewport.previewWidth}px`;
    applyThemeTokens(surface, theme);

    if (draft.roots.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'preview-empty';
      empty.textContent = 'The composition is empty. Insert a block to preview it.';
      surface.append(empty);
      return result;
    }

    const grid = document.createElement('div');
    grid.className = 'preview-grid';
    grid.style.setProperty('--preview-columns', String(columns));
    for (const root of draft.roots) {
      grid.append(renderNode(root, viewport, columns, draftDigest, result));
    }
    surface.append(grid);
    return result;
  }

  function renderNode(
    node: BlueprintNode,
    viewport: ThemeViewport,
    columns: number,
    draftDigest: string,
    result: RenderResult,
  ): HTMLElement {
    const element = createBlockElement(node, result);
    markNode(element, node, draftDigest, result);
    element.style.gridColumn = `span ${spanFor(node, viewport, columns)}`;
    applyRecipeTokens(element, node);
    applyCoreLayout(element, node, viewport);

    const slots = Object.entries(node.slots).sort(([left], [right]) =>
      left < right ? -1 : left > right ? 1 : 0,
    );
    for (const [slot, children] of slots) {
      if (children.length === 0) {
        continue;
      }
      const slotElement = document.createElement('div');
      slotElement.className = 'preview-slot';
      slotElement.dataset.slot = slot;
      for (const child of children) {
        slotElement.append(renderNode(child, viewport, columns, draftDigest, result));
      }
      element.append(slotElement);
    }
    return element;
  }

  function createBlockElement(node: BlueprintNode, result: RenderResult): HTMLElement {
    if (node.type === CORE_LAYOUT_BLOCK_TYPES.section) {
      const section = document.createElement('section');
      section.className = 'preview-block preview-layout preview-section';
      const heading = document.createElement('h3');
      heading.textContent = 'Section';
      section.append(heading);
      return section;
    }
    if (node.type === CORE_LAYOUT_BLOCK_TYPES.stack) {
      const stack = document.createElement('div');
      stack.className = 'preview-block preview-layout preview-stack';
      return stack;
    }
    if (node.type === CORE_LAYOUT_BLOCK_TYPES.grid) {
      const grid = document.createElement('div');
      grid.className = 'preview-block preview-layout preview-grid-block';
      return grid;
    }
    if (node.type === CORE_LAYOUT_BLOCK_TYPES.columns) {
      const columns = document.createElement('div');
      columns.className = 'preview-block preview-layout preview-columns';
      return columns;
    }
    if (node.type === 'studio.core/text') {
      const paragraph = document.createElement('p');
      paragraph.className = 'preview-block preview-text';
      const text = node.properties.text;
      paragraph.textContent = typeof text === 'string' ? text : '';
      return paragraph;
    }
    result.diagnostics.push({
      code: 'studio.renderer/unknown-block',
      location: { nodeId: node.id },
      message: {
        defaultMessage: 'The reference renderer has no registration for this block type.',
        key: 'studio.renderer/unknown-block',
      },
      severity: 'warning',
    });
    const fallback = document.createElement('div');
    fallback.className = 'preview-block preview-unknown';
    fallback.textContent = 'Unsupported block';
    return fallback;
  }

  function applyCoreLayout(
    element: HTMLElement,
    node: BlueprintNode,
    viewport: ThemeViewport,
  ): void {
    if (!isCoreLayoutBlockType(node.type)) {
      return;
    }
    const intent = resolveCoreLayoutIntent(node, viewport, theme);
    element.dataset.layoutAlignment = intent.alignment.value;
    element.dataset.layoutSpacing = intent.spacing.value;
    element.dataset.layoutVisibility = intent.visibility.value;
    element.hidden = intent.visibility.value === 'hidden';
    const gap = themeTokenCss[CORE_LAYOUT_THEME_CONTROLS.spacing]?.[intent.spacing.value];
    if (gap !== undefined) {
      element.style.setProperty('--layout-gap', gap);
    }
    if (intent.columns !== undefined) {
      element.style.setProperty('--layout-columns', String(intent.columns.value));
      element.dataset.layoutColumns = String(intent.columns.value);
    }
    if (intent.collapse !== undefined) {
      element.dataset.layoutCollapse = intent.collapse.value;
    }
    if (intent.direction !== undefined) {
      element.dataset.layoutDirection = intent.direction.value;
    }
  }

  function markNode(
    element: HTMLElement,
    node: BlueprintNode,
    draftDigest: string,
    result: RenderResult,
  ): void {
    const marker = createPreviewMarker(draftDigest, result.markers.length);
    element.dataset.marker = marker;
    result.markers.push(marker);
    result.markerMap[marker] = node.id;
    result.markerByNode.set(node.id, marker);
  }

  function spanFor(node: BlueprintNode, viewport: ThemeViewport, columns: number): number {
    const role =
      node.responsiveSizeRoles?.inline?.[viewport.id] ?? node.sizeRoles?.inline ?? 'full';
    const span = inlineSizeRoleSpans[role] ?? inlineSizeRoleSpans.full ?? 1;
    return Math.max(1, Math.min(columns, span));
  }

  function measure(markers: StableId[]): Promise<PreviewMeasurement> {
    const rects: Record<StableId, PreviewMarkerRect[]> = {};
    for (const marker of markers) {
      const element = surface.querySelector(`[data-marker="${marker}"]`);
      if (element === null) {
        continue;
      }
      const boxes = [...element.getClientRects()].map((rect) => ({
        height: rect.height,
        width: rect.width,
        x: rect.x,
        y: rect.y,
      }));
      if (boxes.length > 0) {
        rects[marker] = boxes;
      }
    }
    return Promise.resolve({
      rects,
      viewport: {
        devicePixelRatio: window.devicePixelRatio,
        height: window.innerHeight,
        scrollX: window.scrollX,
        scrollY: window.scrollY,
        width: window.innerWidth,
      },
    });
  }

  function applyRecipeTokens(element: HTMLElement, node: BlueprintNode): void {
    // Block-level design values come from the theme's recipes, keyed by block
    // type; they override the surface defaults through the same custom
    // properties, so cascade order is the only mechanism involved.
    const designValues = recipesByBlockType.get(node.type);
    if (designValues === undefined) {
      return;
    }
    for (const [controlId, choice] of Object.entries(designValues)) {
      if (typeof choice !== 'string') {
        continue;
      }
      const css = themeTokenCss[controlId]?.[choice];
      if (css !== undefined) {
        element.style.setProperty(`--theme-${controlId}`, css);
      }
    }
  }

  function highlight(nodeId: NodeId): void {
    for (const previous of surface.querySelectorAll<HTMLElement>('[data-selected]')) {
      delete previous.dataset.selected;
    }
    const marker = markerByNode.get(nodeId);
    if (marker === undefined) {
      return;
    }
    const element = surface.querySelector<HTMLElement>(`[data-marker="${marker}"]`);
    if (element === null) {
      return;
    }
    element.dataset.selected = 'true';
  }

  const host = new PreviewHost({
    channelId: options.channelId,
    measure,
    render,
    renderer: 'studio.renderer/reference',
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
        .querySelector(`[data-selected="true"]`)
        ?.scrollIntoView({ behavior: 'auto', block: 'nearest' });
    }
  });
  return host;
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

function columnsForViewport(viewport: ThemeViewport): number {
  if (viewport.previewWidth >= 1200) {
    return 4;
  }
  if (viewport.previewWidth >= 700) {
    return 2;
  }
  return 1;
}

function applyThemeTokens(surface: HTMLElement, theme: ThemeDocument): void {
  for (const control of theme.designControls) {
    const defaultChoice = control.choices[0];
    if (defaultChoice === undefined) {
      continue;
    }
    const css = themeTokenCss[control.id]?.[defaultChoice.id];
    if (css !== undefined) {
      surface.style.setProperty(`--theme-${control.id}`, css);
    }
  }
}
