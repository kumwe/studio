import { defineKumweStudio, type KumweStudioElement } from '@kumwe/studio';
import {
  STUDIO_CONTRACT_VERSION,
  STUDIO_WIRE_PROTOCOL_VERSION,
  type BlockDefinition,
  type BlueprintDocument,
  type BlueprintNode,
  type ExperimentalShellConfiguration,
} from '@kumwe/studio-protocol';
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
    preview: { allowApproximateRenderer: true, enabled: false, sameOriginRequired: true },
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
let stateVersion = 0;

studio.addEventListener('studio-insert-request', (event: Event) => {
  const customEvent = event as CustomEvent<{ definition: BlockDefinition }>;
  const definition = customEvent.detail.definition;
  const node: BlueprintNode = {
    authoring: { mode: 'designer' },
    bindings: {},
    id: crypto.randomUUID(),
    properties: definition.type === 'studio.core/text' ? { text: 'Editable text' } : {},
    slots: Object.fromEntries(definition.slots.map((slot) => [slot.id, []])),
    type: definition.type,
    version: definition.version,
  };
  studio.execute({
    artifactId: studio.document?.id ?? 'reference.home',
    baseStateVersion: stateVersion++,
    contractVersion: STUDIO_CONTRACT_VERSION,
    id: crypto.randomUUID(),
    kind: 'command',
    payload: { destination: { position: studio.document?.roots.length ?? 0 }, node },
    sessionGeneration: configuration.session.sessionGeneration,
    type: 'studio.command/insert-node',
  });
});

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
    propertySchema: { type: 'object' },
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
