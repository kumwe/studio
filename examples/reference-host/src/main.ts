import { defineKumweStudio, type KumweStudioElement } from '@kumwe/studio';
import { BlockRegistry } from '@kumwe/studio-core';
import { PreviewClient } from '@kumwe/studio-preview';
import {
  STUDIO_CONTRACT_VERSION,
  STUDIO_WIRE_PROTOCOL_VERSION,
  type BlockDefinition,
  type BlueprintDocument,
  type BlueprintNode,
  type ExperimentalShellConfiguration,
} from '@kumwe/studio-protocol';
import { createPreviewChannel } from './preview-channel.js';
import { ReferenceDraftStore } from './reference-draft-store.js';
import { connectReferenceRenderer } from './reference-renderer.js';
import { referenceTheme } from './reference-theme.js';
import './style.css';

defineKumweStudio();

const blocks: BlockDefinition[] = [
  defineBlock('studio.core/section', 'Section', [
    {
      accepts: { types: ['studio.core/text'] },
      id: 'content',
      label: { defaultMessage: 'Content', key: 'studio.reference/section-content' },
      maximum: 100,
      minimum: 0,
      ordered: true,
    },
  ]),
  defineBlock('studio.core/text', 'Text'),
];
const blockRegistry = new BlockRegistry(blocks);

const configuration: ExperimentalShellConfiguration = {
  blockDefinitions: blocks,
  session: {
    actor: { displayName: 'Reference Author', id: 'users/reference-author' },
    artifacts: {},
    blocks: blocks.map((block) => ({
      revision: block.revision,
      type: block.type,
      version: block.version,
    })),
    composite: 'single',
    contractVersion: STUDIO_CONTRACT_VERSION,
    displayPreferences: {
      calendar: 'gregory',
      hourCycle: 'h23',
      measurementSystem: 'metric',
      numberingSystem: 'latn',
    },
    features: {
      clipboardMediaUpload: true,
      collaboration: false,
      customInspectors: false,
      executablePlugins: false,
      externalMediaImport: false,
      offlineRecovery: true,
    },
    hostCapabilities: {
      capabilities: [],
      contractVersion: STUDIO_CONTRACT_VERSION,
      host: { generation: 'host-r1', id: 'studio.reference/host', version: '0.1.0' },
      kind: 'host-capabilities',
      ports: [],
      protocolVersions: [STUDIO_WIRE_PROTOCOL_VERSION],
    },
    limits: {
      maxChildrenPerSlot: 1_000,
      maxCommandBatch: 100,
      maxContributionsPerPlugin: 500,
      maxDepth: 32,
      maxExtensionBytes: 1_048_576,
      maxHistoryEntries: 100,
      maxLocaleBytes: 1_048_576,
      maxMediaBatch: 50,
      maxMediaUploadBytes: 1_073_741_824,
      maxNodes: 5_000,
      maxPluginCount: 20,
      maxPreviewBytes: 10_485_760,
      maxPreviewRequestsPerMinute: 120,
      maxPropertyBytes: 1_048_576,
      maxRichTextBytes: 1_048_576,
      maxRichTextDepth: 32,
      maxSlotsPerNode: 20,
    },
    locale: {
      direction: 'ltr',
      fallbacks: [],
      requested: 'en',
      resolved: 'en',
      timeZone: 'Africa/Windhoek',
    },
    mode: 'blueprint',
    permissions: ['studio.permission/edit-blueprint'],
    plugins: [],
    protocolVersion: STUDIO_WIRE_PROTOCOL_VERSION,
    preview: { allowApproximateRenderer: true, enabled: true, sameOriginRequired: true },
    sessionGeneration: 'session-r1',
    sessionId: 'reference-session',
    sessionState: 'editable',
    resourceContext: {
      key: 'contexts/reference-site',
      scopes: [{ id: 'sites/reference', kind: 'studio.scope/site' }],
      surface: 'studio.reference/host',
    },
  },
};

const blueprint: BlueprintDocument = {
  contractVersion: STUDIO_CONTRACT_VERSION,
  dependencyLock: {
    blocks: configuration.session.blocks,
    theme: { id: 'studio.reference/theme', revision: 'theme-r1', version: '1.0.0' },
  },
  id: 'reference.home',
  kind: 'blueprint',
  label: { defaultMessage: 'Reference home', key: 'studio.reference/home' },
  model: { id: 'studio.reference/model', revision: 'model-r1', version: '1.0.0' },
  owner: { id: 'studio.reference/host', version: '0.1.0' },
  revision: 'blueprint-r1',
  roots: [],
  status: 'draft',
  version: '1.0.0',
};

const studio = document.querySelector<KumweStudioElement>('kumwe-studio');
if (studio === null) {
  throw new Error('Reference host is missing its Studio element.');
}

studio.configuration = configuration;
studio.document = blueprint;

studio.addEventListener('studio-insert-request', (event: Event) => {
  const customEvent = event as CustomEvent<{ definition: BlockDefinition }>;
  const definition = customEvent.detail.definition;
  const node: BlueprintNode = {
    authoring: { mode: 'designer' },
    bindings: {},
    id: crypto.randomUUID(),
    properties: definition.type === 'studio.core/text' ? { text: 'Editable text' } : {},
    // A named inline size role, not CSS: the reference renderer maps it to a
    // column span at the active viewport, so a quarter block reflows
    // four-to-two-to-one across the expanded/medium/compact switcher.
    sizeRoles: { inline: definition.type === 'studio.core/section' ? 'quarter' : 'half' },
    slots: Object.fromEntries(definition.slots.map((slot) => [slot.id, []])),
    type: definition.type,
    version: definition.version,
  };
  studio.execute({
    artifactId: studio.document?.id ?? 'reference.home',
    // The session owns the authoritative state version; shell-dispatched
    // outline commands advance it too, so the host must read it back.
    baseStateVersion: studio.stateVersion,
    contractVersion: STUDIO_CONTRACT_VERSION,
    id: crypto.randomUUID(),
    kind: 'command',
    payload: { destination: { position: studio.document?.roots.length ?? 0 }, node },
    sessionGeneration: configuration.session.sessionGeneration,
    type: 'studio.command/insert-node',
  });
});

// --- Preview bridge --------------------------------------------------------
// The shell above is the Studio side; the reference renderer below is the
// preview surface. They talk exclusively through the canonical preview
// channel: a PreviewClient and PreviewHost joined by a real MessageChannel
// (the contract's "equivalently isolated host mechanism" for a same-origin,
// frameless page), with origin pinning, channel id, session generation, and
// sequence filtering fully engaged on both sides.

// Narrowed aliases: hoisted function declarations below cannot rely on the
// module-level null checks, so they close over these non-null bindings.
const shellElement: KumweStudioElement = studio;
const previewSurface = requirePaneElement('.preview-surface');
const previewStatus = requirePaneElement('.preview-status');
const previewSelection = requirePaneElement('.preview-selection');

studio.viewports = referenceTheme.viewports;

const pageOrigin = window.location.origin;
const previewChannelId = crypto.randomUUID();
const sessionGeneration = configuration.session.sessionGeneration;
// The host-owned store binds the complete artifact/revision/digest tuple and
// validates every staged and resolved snapshot with Studio's public validator.
const draftStore = new ReferenceDraftStore(blockRegistry);
const channel = createPreviewChannel(pageOrigin);

const rendererHost = connectReferenceRenderer({
  channelId: previewChannelId,
  endpoint: channel.rendererEndpoint,
  origin: pageOrigin,
  resolveDraft: (payload) => draftStore.resolve(payload),
  sessionGeneration,
  surface: previewSurface,
  theme: referenceTheme,
});

const previewClient = new PreviewClient({
  channelId: previewChannelId,
  sessionGeneration,
  source: channel.studioEndpoint,
  target: channel.studioEndpoint,
  targetOrigin: pageOrigin,
});
previewClient.onMessage((message) => {
  // Reload and teardown reach the shell's live region through its canonical
  // preview-message entry point; everything else is host-side plumbing.
  studio.notifyPreviewMessage(message);
});

let latestMarkerMap: Record<string, string> = {};
let selectedNodeId: string | undefined;
let measureSerial = 0;
let renderSerial = 0;
let renderChain: Promise<void> = Promise.resolve();

rendererHost.announce();
void previewClient.ready().then(
  (ready) => {
    previewStatus.textContent =
      `Preview renderer ${ready.renderer} is ready ` +
      `(viewports: ${ready.viewports.join(', ')}).`;
    scheduleRender();
  },
  () => {
    previewStatus.textContent = 'Preview is disconnected.';
  },
);

studio.addEventListener('studio-document-change', () => {
  scheduleRender();
});
studio.addEventListener('studio-viewport-change', () => {
  scheduleRender();
});

// The shell keeps selection internal, so the host reads it the way assistive
// technology does: from the outline's rendered aria-pressed state. Selection
// then flows to the renderer through the canonical studio.preview/select
// message and comes back as marker-map plus measured geometry.
const selectionObserver = new MutationObserver(() => {
  syncSelectionFromShell();
});
if (studio.shadowRoot !== null) {
  selectionObserver.observe(studio.shadowRoot, {
    attributeFilter: ['aria-pressed'],
    attributes: true,
    childList: true,
    subtree: true,
  });
}

/** Serializes renders so a draft digest is never concurrently pending twice. */
function scheduleRender(): void {
  renderChain = renderChain.then(() => performRender());
}

async function performRender(): Promise<void> {
  const draft = shellElement.document;
  const viewport = shellElement.activeViewport?.id;
  if (draft === undefined || viewport === undefined) {
    return;
  }
  try {
    const staged = await draftStore.stage(draft);
    renderSerial += 1;
    const rendered = await previewClient.render({
      artifactId: staged.artifactId,
      draftDigest: staged.draftDigest,
      draftRevision: staged.draftRevision,
      requestId: `renders/reference-${renderSerial}`,
      viewport,
    });
    latestMarkerMap = rendered.markerMap;
    previewStatus.textContent =
      `Preview: studio.renderer/reference rendered ${rendered.markers.length} ` +
      `region(s) at the ${viewport} viewport.`;
    await syncSelectedRegion();
  } catch (error) {
    if (error instanceof Error && error.message.includes('superseded')) {
      return;
    }
    // Degraded mode: authoring continues; the preview is marked, not hidden.
    previewStatus.textContent = 'Preview is unavailable.';
  }
}

function markerForNode(nodeId: string): string | undefined {
  for (const [marker, mapped] of Object.entries(latestMarkerMap)) {
    if (mapped === nodeId) {
      return marker;
    }
  }
  return undefined;
}

function syncSelectionFromShell(): void {
  const pressed = shellElement.shadowRoot?.querySelector<HTMLElement>(
    '.outline-entry[aria-pressed="true"], .canvas-chip[aria-pressed="true"]',
  );
  const nodeId = pressed?.dataset.nodeId;
  if (nodeId === selectedNodeId) {
    return;
  }
  selectedNodeId = nodeId;
  void syncSelectedRegion();
}

async function syncSelectedRegion(): Promise<void> {
  const nodeId = selectedNodeId;
  if (nodeId === undefined) {
    previewSelection.textContent = 'No block is selected.';
    return;
  }
  const marker = markerForNode(nodeId);
  if (marker === undefined) {
    previewSelection.textContent = 'The selected block has no rendered region yet.';
    return;
  }
  measureSerial += 1;
  const requestId = `measures/selection-${measureSerial}`;
  try {
    previewClient.select({ nodeId, reveal: true });
    const outcome = await previewClient.measure({ markers: [marker], requestId });
    if (nodeId !== selectedNodeId) {
      return;
    }
    if (outcome.status === 'measured') {
      const rect = outcome.geometry.measurements[marker]?.[0];
      previewSelection.textContent =
        rect === undefined
          ? `Selected marker ${marker} for node ${nodeId}; its geometry is unknown.`
          : `Selected marker ${marker} for node ${nodeId} — ` +
            `${Math.round(rect.width)}×${Math.round(rect.height)} CSS px at ` +
            `(${Math.round(rect.x)}, ${Math.round(rect.y)}).`;
    } else {
      previewSelection.textContent =
        `Selected marker ${marker} for node ${nodeId}; ` +
        `geometry is stale until the next render completes.`;
    }
  } catch {
    previewSelection.textContent = `Selected marker ${marker} for node ${nodeId}.`;
  }
}

function requirePaneElement(selector: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(selector);
  if (element === null) {
    throw new Error('Reference host is missing its preview pane.');
  }
  return element;
}

function defineBlock(
  type: BlockDefinition['type'],
  label: string,
  slots: BlockDefinition['slots'] = [],
): BlockDefinition {
  return {
    accessibility: {
      accessibleName: 'not-applicable',
      category: type === 'studio.core/text' ? 'text' : 'structural',
      keyboard: {
        defaultMessage: 'Use the outline controls to position this block.',
        key: 'studio.reference/block-keyboard',
      },
      outputChecks: ['studio.check/reading-order'],
      reducedMotion: 'not-applicable',
    },
    category: type === 'studio.core/text' ? 'studio.category/content' : 'studio.category/layout',
    contractVersion: STUDIO_CONTRACT_VERSION,
    editingModes: ['blueprint', 'content'],
    kind: 'block-definition',
    label: { defaultMessage: label, key: 'studio.reference/block-label' },
    owner: { id: 'studio.reference/blocks', version: '0.1.0' },
    ports: [],
    propertySchema:
      type === 'studio.core/text'
        ? {
            additionalProperties: false,
            properties: { text: { maxLength: 10_000, type: 'string' } },
            required: ['text'],
            type: 'object',
          }
        : { additionalProperties: false, type: 'object' },
    rendererRequirements: [
      { capability: 'studio.renderer/reference', surface: 'preview', versions: '^0.1.0' },
    ],
    revision: `${type.replace('/', '-')}-r1`,
    slots,
    themeControls: [],
    type,
    version: '1.0.0',
  };
}
