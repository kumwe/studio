import { defineKumweStudio, type KumweStudioElement } from '@kumwe/studio';
import {
  BlockRegistry,
  CORE_PRODUCTION_BLOCK_TYPES,
  coreProductionInitialProperties,
  createCoreProductionBlockDefinitions,
  createCoreProductionPatterns,
  isCoreProductionBlockType,
} from '@kumwe/studio-core';
import { PreviewClient } from '@kumwe/studio-preview';
import {
  STUDIO_CONTRACT_VERSION,
  STUDIO_WIRE_PROTOCOL_VERSION,
  type BlockDefinition,
  type BlueprintDocument,
  type BlueprintNode,
  type ContentModelDocument,
  type ExperimentalShellConfiguration,
} from '@kumwe/studio-protocol';
import { createPreviewChannel } from './preview-channel.js';
import { mountReferenceAuthoringControls } from './reference-authoring.js';
import { createBlankReferenceBlueprint, createReferenceBlueprint } from './reference-content.js';
import { ReferenceDraftStore } from './reference-draft-store.js';
import { connectReferenceRenderer } from './reference-renderer.js';
import {
  referenceScopedStyles,
  resolveReferenceBinding,
  resolveReferenceMedia,
} from './reference-resources.js';
import { referenceTheme } from './reference-theme.js';
import './style.css';

defineKumweStudio();

const blocks: BlockDefinition[] = createCoreProductionBlockDefinitions();
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
        {
          id: 'studio.port/model',
          operations: ['studio.operation/model.get', 'studio.operation/model.list'],
          version: '1.0.0',
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

const blueprint: BlueprintDocument = createReferenceBlueprint(blocks);

// A detached, already-authorized model-port projection. The reference host
// owns this definition; the shell may bind its exact fields but never changes
// the definition, workflow, translation, or field policy behind it.
const contentModel: ContentModelDocument = {
  contractVersion: STUDIO_CONTRACT_VERSION,
  fields: [
    {
      authoring: {
        control: 'studio.control/single-line-text',
        order: 0,
        placeholder: {
          defaultMessage: 'Entry title',
          key: 'studio.reference/model-title-placeholder',
        },
      },
      cardinality: 'one',
      id: 'title',
      kind: 'string',
      label: { defaultMessage: 'Title', key: 'studio.reference/model-title' },
      localized: true,
      required: true,
    },
    {
      authoring: { control: 'studio.control/select', order: 1 },
      cardinality: 'one',
      enumValues: [
        {
          label: { defaultMessage: 'Guide', key: 'studio.reference/category-guide' },
          value: 'guide',
        },
        {
          label: { defaultMessage: 'News', key: 'studio.reference/category-news' },
          value: 'news',
        },
      ],
      id: 'category',
      kind: 'enum',
      label: { defaultMessage: 'Category', key: 'studio.reference/model-category' },
      localized: false,
      required: false,
    },
    {
      authoring: { control: 'studio.control/switch', order: 2 },
      cardinality: 'one',
      id: 'featured',
      kind: 'boolean',
      label: { defaultMessage: 'Featured', key: 'studio.reference/model-featured' },
      localized: false,
      required: false,
    },
  ],
  id: blueprint.model.id,
  kind: 'content-model',
  label: { defaultMessage: 'Reference content', key: 'studio.reference/model' },
  owner: { id: 'studio.reference/host', version: '0.1.0' },
  relationships: [],
  revision: blueprint.model.revision,
  status: 'published',
  version: blueprint.model.version,
};

const studio = document.querySelector<KumweStudioElement>('kumwe-studio');
if (studio === null) {
  throw new Error('Reference host is missing its Studio element.');
}

studio.configuration = configuration;
studio.contentModel = contentModel;
studio.document = blueprint;
studio.patterns = createCoreProductionPatterns();

void mountReferenceAuthoringControls(studio, requirePaneElement('.reference-authoring')).catch(
  (error: unknown) => {
    const status = requirePaneElement('.reference-authoring-status');
    status.setAttribute('role', 'alert');
    status.textContent = `Authoring controls are unavailable: ${
      error instanceof Error ? error.message : String(error)
    }`;
  },
);

requireButton('.reference-new').addEventListener('click', () => {
  studio.document = createBlankReferenceBlueprint(blueprint);
});
requireButton('.reference-demo').addEventListener('click', () => {
  studio.document = structuredClone(blueprint);
});

studio.addEventListener('studio-insert-request', (event: Event) => {
  const customEvent = event as CustomEvent<{
    definition: BlockDefinition;
    parentId: string | null;
    slot?: string;
  }>;
  const definition = customEvent.detail.definition;
  if (!isCoreProductionBlockType(definition.type)) {
    throw new Error(`Reference host cannot insert unknown production block ${definition.type}.`);
  }
  const type = definition.type;
  const node: BlueprintNode = {
    authoring: { mode: definition.slots.length === 0 ? 'content' : 'structural' },
    bindings: {},
    id: crypto.randomUUID(),
    properties: coreProductionInitialProperties(type),
    ...(type === CORE_PRODUCTION_BLOCK_TYPES.grid || type === CORE_PRODUCTION_BLOCK_TYPES.columns
      ? { responsive: { columns: { expanded: 4, medium: 2 } } }
      : {}),
    slots: Object.fromEntries(definition.slots.map((slot) => [slot.id, []])),
    type,
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
  resolveBinding: resolveReferenceBinding,
  resolveDraft: (payload) => draftStore.resolve(payload),
  resolveMedia: resolveReferenceMedia,
  scopedStyles: referenceScopedStyles,
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

function requireButton(selector: string): HTMLButtonElement {
  const element = document.querySelector<HTMLButtonElement>(selector);
  if (element === null) throw new Error(`Reference host is missing control ${selector}.`);
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
