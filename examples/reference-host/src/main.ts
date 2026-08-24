import { defineKumweStudio, type KumweStudioElement } from '@kumwe/studio';
import {
  BlockRegistry,
  coreLayoutInitialProperties,
  createCoreLayoutBlockDefinitions,
  isCoreLayoutBlockType,
} from '@kumwe/studio-core';
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
  ...createCoreLayoutBlockDefinitions({
    acceptedChildTypes: ['studio.core/text'],
    rendererRequirements: [
      { capability: 'studio.renderer/reference', surface: 'preview', versions: '^0.1.0' },
    ],
  }),
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
      ports: [
        {
          id: 'studio.port/preview',
          operations: ['studio.operation/preview.render', 'studio.operation/preview.cancel'],
          version: '0.1.0',
        },
      ],
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
  const customEvent = event as CustomEvent<{
    definition: BlockDefinition;
    parentId: string | null;
    slot?: string;
  }>;
  const definition = customEvent.detail.definition;
  const layoutType = isCoreLayoutBlockType(definition.type) ? definition.type : undefined;
  const node: BlueprintNode = {
    authoring: { mode: layoutType === undefined ? 'designer' : 'structural' },
    bindings: {},
    id: crypto.randomUUID(),
    properties:
      definition.type === 'studio.core/text'
        ? { text: 'Editable text' }
        : layoutType === undefined
          ? {}
          : coreLayoutInitialProperties(layoutType),
    ...(definition.type === 'studio.core/grid' || definition.type === 'studio.core/columns'
      ? { responsive: { columns: { expanded: 4, medium: 2 } } }
      : {}),
    // A named inline size role, not CSS: the reference renderer maps it to a
    // column span at the active viewport, so a quarter block reflows
    // four-to-two-to-one across the expanded/medium/compact switcher.
    sizeRoles: { inline: layoutType === undefined ? 'half' : 'quarter' },
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
    payload: {
      destination:
        customEvent.detail.parentId === null || customEvent.detail.slot === undefined
          ? { position: studio.document?.roots.length ?? 0 }
          : {
              parentNodeId: customEvent.detail.parentId,
              position:
                findNode(studio.document?.roots ?? [], customEvent.detail.parentId)?.slots[
                  customEvent.detail.slot
                ]?.length ?? 0,
              slot: customEvent.detail.slot,
            },
      node,
    },
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

const previewSurface = requirePaneElement('.preview-surface');

studio.theme = referenceTheme;

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
studio.previewBinding = {
  client: previewClient,
  async stage(draft, options) {
    options.signal.throwIfAborted();
    const staged = await draftStore.stage(draft);
    options.signal.throwIfAborted();
    return staged;
  },
};
rendererHost.announce();

function requirePaneElement(selector: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(selector);
  if (element === null) {
    throw new Error('Reference host is missing its preview pane.');
  }
  return element;
}

function findNode(nodes: readonly BlueprintNode[], id: string): BlueprintNode | undefined {
  const stack = [...nodes];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node === undefined) {
      break;
    }
    if (node.id === id) {
      return node;
    }
    for (const children of Object.values(node.slots)) {
      stack.push(...children);
    }
  }
  return undefined;
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
