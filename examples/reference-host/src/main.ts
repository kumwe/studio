import {
  defineKumweStudioContextual,
  type KumweStudioContextualElement,
  type KumweStudioElement,
  type StudioContextualChangeDetail,
  type StudioContextualPresentationChangeDetail,
  type StudioContextualSaveRequestDetail,
} from '@kumwe/studio';
import {
  BlockRegistry,
  CORE_PRODUCTION_BLOCK_TYPES,
  coreProductionInitialProperties,
  createCoreProductionBlockDefinitions,
  createCoreProductionPatterns,
  isCoreProductionBlockType,
  openContextualStudioSession,
  validateBlueprint,
  type StudioContextualHostSessionHandle,
} from '@kumwe/studio-core';
import { PreviewClient } from '@kumwe/studio-preview';
import {
  STUDIO_CONTRACT_VERSION,
  STUDIO_WIRE_PROTOCOL_VERSION,
  type BlockDefinition,
  type BlueprintCommand,
  type BlueprintDocument,
  type BlueprintNode,
  type AddModelFieldCommand,
  type AuthoringSaveOutcome,
  type AuthoringSavePlan,
  type AuthoringSaveResult,
  type AuthoringSessionSnapshot,
  type AuthoringStartSource,
  type ExperimentalShellConfiguration,
  type SetFieldValueCommand,
  type StudioResourceContext,
} from '@kumwe/studio-protocol';
import { createPreviewChannel } from './preview-channel.js';
import { mountReferenceAuthoringControls } from './reference-authoring.js';
import {
  createReferenceAuthoringHost,
  REFERENCE_AUTHORING_TARGET_ID,
} from './reference-authoring-port.js';
import { createReferenceBlueprint } from './reference-content.js';
import { ReferenceDraftStore } from './reference-draft-store.js';
import { connectReferenceRenderer } from './reference-renderer.js';
import {
  referenceScopedStyles,
  resolveReferenceBinding,
  resolveReferenceMedia,
} from './reference-resources.js';
import { referenceTheme } from './reference-theme.js';
import './style.css';

defineKumweStudioContextual();

const blocks: BlockDefinition[] = createCoreProductionBlockDefinitions();
const blockRegistry = new BlockRegistry(blocks);
const browserDraftKey = 'studio.reference/draft-v1';

const baseConfiguration: ExperimentalShellConfiguration = {
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
          id: 'studio.port/authoring',
          operations: [
            'studio.operation/authoring.resolve-target',
            'studio.operation/authoring.list-types',
            'studio.operation/authoring.start',
            'studio.operation/authoring.plan-save',
            'studio.operation/authoring.save-item',
            'studio.operation/authoring.save-new-type-version',
            'studio.operation/authoring.save-as-new-type',
          ],
          version: '1.0.0',
        },
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
    permissions: [
      'studio.permission/edit-model',
      'studio.permission/edit-blueprint',
      'studio.permission/edit-content',
      'studio.permission/save',
    ],
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
const referenceHost = createReferenceAuthoringHost(blueprint);
const contextualStudio = requireContextualStudio();

contextualStudio.patterns = createCoreProductionPatterns();
contextualStudio.theme = referenceTheme;

let activeConfiguration = baseConfiguration;
let activeHandle: StudioContextualHostSessionHandle | undefined;
let disposeAuthoringControls: (() => void) | undefined;
let pendingSave:
  | {
      detail: StudioContextualSaveRequestDetail;
      plan: AuthoringSavePlan;
    }
  | undefined;
let identifierSerial = 0;
let launchSerial = 0;
let launchInFlight = false;
let saveInFlight = false;

requireButton('.reference-new').addEventListener('click', () => {
  void launch({ kind: 'blank' });
});
requireButton('.reference-demo').addEventListener('click', () => {
  void launch({ kind: 'existing' });
});
requireButton('.reference-from-type').addEventListener('click', () => {
  void launch({ kind: 'from-type', type: referenceHost.authoring.latestTypeReference });
});
requireButton('.reference-save').addEventListener('click', () => {
  const studio = requireBlueprintElement();
  const current = studio.document;
  if (current === undefined || !validateBlueprint(current, blockRegistry).valid) {
    announceReferenceSession('The current draft is invalid and was not saved.', true);
    return;
  }
  localStorage.setItem(browserDraftKey, JSON.stringify(current));
  announceReferenceSession('Browser draft saved.');
});
requireButton('.reference-reload').addEventListener('click', () => {
  const studio = requireBlueprintElement();
  const serialized = localStorage.getItem(browserDraftKey);
  if (serialized === null) {
    announceReferenceSession('No browser draft has been saved.', true);
    return;
  }
  try {
    const candidate = JSON.parse(serialized) as BlueprintDocument;
    if (!validateBlueprint(candidate, blockRegistry).valid) {
      throw new Error('The saved draft no longer validates against this catalog.');
    }
    studio.document = structuredClone(candidate);
    announceReferenceSession('Browser draft reloaded.');
  } catch (error) {
    announceReferenceSession(
      error instanceof Error ? error.message : 'The browser draft could not be reloaded.',
      true,
    );
  }
});

contextualStudio.addEventListener('studio-insert-request', (event: Event) => {
  const studio = requireBlueprintElement();
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
    sessionGeneration: activeConfiguration.session.sessionGeneration,
    type: 'studio.command/insert-node',
  });
});

contextualStudio.addEventListener('studio-contextual-change', (event: Event) => {
  const detail = (event as CustomEvent<StudioContextualChangeDetail>).detail;
  const handle = activeHandle;
  if (handle === undefined) return;
  if (detail.command === null) {
    if (detail.artifact === 'blueprint' && detail.source === 'undo') {
      handle.session.blueprintSession.undo();
    } else if (detail.artifact === 'blueprint' && detail.source === 'redo') {
      handle.session.blueprintSession.redo();
    }
    updateCoordinateSummary(detail.snapshot);
    return;
  }
  if (detail.artifact === 'model') {
    handle.session.executeModel(detail.command as AddModelFieldCommand);
  } else if (detail.artifact === 'entry') {
    handle.session.executeEntry(detail.command as SetFieldValueCommand);
  } else handle.session.executeBlueprint(detail.command as BlueprintCommand);
  updateCoordinateSummary(detail.snapshot);
});

contextualStudio.addEventListener('studio-contextual-save-request', (event: Event) => {
  const detail = (event as CustomEvent<StudioContextualSaveRequestDetail>).detail;
  void prepareSave(detail);
});

contextualStudio.addEventListener('studio-contextual-presentation-change', (event: Event) => {
  const detail = (event as CustomEvent<StudioContextualPresentationChangeDetail>).detail;
  activeHandle?.session.setPresentation(detail.presentation);
});

requireButton('.reference-save-confirm').addEventListener('click', () => {
  void confirmSave();
});
requireButton('.reference-save-cancel').addEventListener('click', () => {
  pendingSave = undefined;
  requirePaneElement('.reference-save-review').hidden = true;
  announceReferenceSession('Save cancelled. No host revisions changed.');
});

// --- Preview bridge --------------------------------------------------------
// The shell above is the Studio side; the reference renderer below is the
// preview surface. They talk exclusively through the canonical preview
// channel: a PreviewClient and PreviewHost joined by a real MessageChannel
// (the contract's "equivalently isolated host mechanism" for a same-origin,
// frameless page), with origin pinning, channel id, session generation, and
// sequence filtering fully engaged on both sides.

const previewSurface = requirePaneElement('.preview-surface');

const pageOrigin = window.location.origin;
const previewChannelId = crypto.randomUUID();
const sessionGeneration = baseConfiguration.session.sessionGeneration;
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
contextualStudio.previewBinding = {
  client: previewClient,
  async stage(draft, options) {
    options.signal.throwIfAborted();
    const staged = await draftStore.stage(draft);
    options.signal.throwIfAborted();
    return staged;
  },
};
rendererHost.announce();

await launch({ kind: 'existing' });

async function launch(source: AuthoringStartSource): Promise<void> {
  const launchId = ++launchSerial;
  const resourceContext = resourceContextFor(source);
  const configuration = configurationFor(resourceContext);
  launchInFlight = true;
  updateLaunchControls();
  announceReferenceSession(`Opening ${launchLabel(source)}…`);
  try {
    const handle = await openContextualStudioSession(referenceHost.adapter, {
      configuration: configuration.session,
      identifiers: {
        idempotencyKey: (operationId) =>
          `reference-idempotency-${++identifierSerial}-${operationId.split('/').at(-1) ?? 'save'}`,
        requestId: (operationId) =>
          `reference-request-${++identifierSerial}-${operationId.split('/').at(-1) ?? 'call'}`,
      },
      start: {
        presentation: 'inline',
        resourceContext,
        source,
        targetId: REFERENCE_AUTHORING_TARGET_ID,
      },
      target: {
        intent: source.kind === 'existing' ? 'edit' : 'create',
        requestedPresentation: 'inline',
        resourceContext,
        targetId: REFERENCE_AUTHORING_TARGET_ID,
      },
    });
    if (launchId !== launchSerial) {
      handle.dispose();
      return;
    }
    activeHandle?.dispose();
    activeHandle = handle;
    activeConfiguration = configuration;
    contextualStudio.configuration = configuration;
    contextualStudio.session = handle.session.snapshot;
    await contextualStudio.updateComplete;
    await contextualStudio.authoringReady;
    await remountRepresentativeControls();
    updateCoordinateSummary(handle.session.snapshot);
    pendingSave = undefined;
    requirePaneElement('.reference-save-review').hidden = true;
    clearSaveResult();
    announceReferenceSession(`${launchLabel(source)} opened in contextual Studio.`);
  } catch (error) {
    if (launchId !== launchSerial) return;
    announceReferenceSession(
      errorMessage(error, 'Studio could not open this content resource.'),
      true,
    );
  } finally {
    if (launchId === launchSerial) {
      launchInFlight = false;
      updateLaunchControls();
    }
  }
}

async function prepareSave(detail: StudioContextualSaveRequestDetail): Promise<void> {
  const handle = activeHandle;
  if (launchInFlight || saveInFlight || pendingSave !== undefined) {
    announceReferenceSession('Finish or cancel the current host operation before another save.');
    return;
  }
  if (handle === undefined) {
    announceReferenceSession('No contextual authoring session is active.', true);
    return;
  }
  try {
    saveInFlight = true;
    updateLaunchControls();
    announceReferenceSession('The host is planning the selected save outcome…');
    const { value: plan } = await handle.planSave(detail.intent);
    pendingSave = { detail, plan };
    clearSaveResult();
    renderSavePlan(plan);
    announceReferenceSession('Review the affected artifacts and confirm the save.');
  } catch (error) {
    announceReferenceSession(errorMessage(error, 'The host could not plan this save.'), true);
  } finally {
    saveInFlight = false;
    updateLaunchControls();
  }
}

async function confirmSave(): Promise<void> {
  const pending = pendingSave;
  const handle = activeHandle;
  if (pending === undefined || handle === undefined) {
    announceReferenceSession('There is no planned save to confirm.', true);
    return;
  }
  try {
    saveInFlight = true;
    updateLaunchControls();
    requireButton('.reference-save-confirm').disabled = true;
    const acceptedConsequences = pending.plan.consequences.map(({ code }) => code);
    const { value: accepted } = await handle.save(
      pending.detail.intent,
      pending.plan,
      acceptedConsequences,
    );
    contextualStudio.session = accepted.session;
    await contextualStudio.updateComplete;
    await contextualStudio.authoringReady;
    await remountRepresentativeControls();
    updateCoordinateSummary(accepted.session);
    renderSaveResult(accepted);
    pendingSave = undefined;
    requirePaneElement('.reference-save-review').hidden = true;
    announceReferenceSession(`${saveOutcomeLabel(accepted.outcome)} accepted by the host.`);
  } catch (error) {
    announceReferenceSession(errorMessage(error, 'The host rejected this save.'), true);
  } finally {
    saveInFlight = false;
    updateLaunchControls();
    requireButton('.reference-save-confirm').disabled = false;
  }
}

async function remountRepresentativeControls(): Promise<void> {
  disposeAuthoringControls?.();
  disposeAuthoringControls = undefined;
  const authoring = requirePaneElement('.reference-authoring');
  const studio = requireBlueprintElement();
  if (findNode(studio.document?.roots ?? [], 'faq-editor-answer') === undefined) {
    authoring.hidden = true;
    return;
  }
  authoring.hidden = false;
  try {
    disposeAuthoringControls = await mountReferenceAuthoringControls(studio, authoring);
  } catch (error) {
    const status = requirePaneElement('.reference-authoring-status');
    status.setAttribute('role', 'alert');
    status.textContent = `Authoring controls are unavailable: ${errorMessage(error, 'Unknown error')}`;
  }
}

function configurationFor(resourceContext: StudioResourceContext): ExperimentalShellConfiguration {
  const configuration = structuredClone(baseConfiguration);
  configuration.session.resourceContext = structuredClone(resourceContext);
  return configuration;
}

function resourceContextFor(source: AuthoringStartSource): StudioResourceContext {
  const id =
    source.kind === 'existing'
      ? referenceHost.authoring.existingEntry.id
      : source.kind === 'blank'
        ? 'content/new-blank'
        : 'content/new-from-type';
  return {
    key:
      source.kind === 'existing'
        ? 'contexts/reference-existing-item'
        : source.kind === 'blank'
          ? 'contexts/reference-new-blank'
          : 'contexts/reference-new-from-type',
    resource: { id, type: 'studio.reference/content' },
    revision:
      source.kind === 'existing' ? referenceHost.authoring.existingEntry.revision : 'entry-new-r0',
    scopes: [{ id: 'sites/reference', kind: 'studio.scope/site' }],
    surface: 'studio.reference/content-editor',
  };
}

function updateCoordinateSummary(snapshot: AuthoringSessionSnapshot): void {
  setText('.reference-start-coordinate', launchLabel(snapshot.start));
  setText(
    '.reference-type-coordinate',
    snapshot.type === undefined
      ? 'New reusable type not yet saved'
      : coordinate(snapshot.type.id, snapshot.type.version, snapshot.type.revision),
  );
  setText(
    '.reference-model-coordinate',
    coordinate(
      snapshot.state.coordinates.model.id,
      snapshot.state.coordinates.model.version,
      snapshot.state.coordinates.model.revision,
    ),
  );
  setText(
    '.reference-blueprint-coordinate',
    coordinate(
      snapshot.state.coordinates.blueprint.id,
      snapshot.state.coordinates.blueprint.version,
      snapshot.state.coordinates.blueprint.revision,
    ),
  );
  setText(
    '.reference-entry-coordinate',
    `${snapshot.state.coordinates.entry.id}#${snapshot.state.coordinates.entry.revision}`,
  );
  setText(
    '.reference-entry-values',
    Object.keys(snapshot.state.entry.values).length === 0
      ? 'Empty values'
      : JSON.stringify(snapshot.state.entry.values),
  );
}

function renderSavePlan(plan: AuthoringSavePlan): void {
  const review = requirePaneElement('.reference-save-review');
  setText('.reference-save-review-title', `Confirm ${saveOutcomeLabel(plan.outcome)}`);
  replaceList(
    '.reference-save-artifacts',
    plan.affectedArtifacts.map((artifact) => artifactLabel(artifact)),
  );
  replaceList(
    '.reference-save-consequences',
    plan.consequences.length === 0
      ? ['No reusable content type will be changed.']
      : plan.consequences.map(({ message }) => message.defaultMessage ?? message.key),
  );
  review.hidden = false;
  requireButton('.reference-save-confirm').focus();
}

function renderSaveResult(result: AuthoringSaveResult): void {
  const output = requirePaneElement('.reference-save-result');
  output.hidden = false;
  output.setAttribute('role', 'status');
  const coordinates = result.session.state.coordinates;
  output.textContent = `${saveOutcomeLabel(result.outcome)} accepted. Model ${coordinates.model.revision}; Blueprint ${coordinates.blueprint.revision}; Entry ${coordinates.entry.revision}${coordinates.type === undefined ? '' : `; reusable type ${coordinates.type.version}#${coordinates.type.revision}`}.`;
}

function clearSaveResult(): void {
  const output = requirePaneElement('.reference-save-result');
  output.hidden = true;
  output.textContent = '';
}

function replaceList(selector: string, values: readonly string[]): void {
  const list = requirePaneElement(selector);
  list.replaceChildren(
    ...values.map((value) => {
      const item = document.createElement('li');
      item.textContent = value;
      return item;
    }),
  );
}

function setText(selector: string, value: string): void {
  requirePaneElement(selector).textContent = value;
}

function coordinate(id: string, version: string, revision: string): string {
  return `${id}@${version}#${revision}`;
}

function artifactLabel(artifact: AuthoringSavePlan['affectedArtifacts'][number]): string {
  if (artifact === 'reusable-content-type') return 'Reusable content type';
  return artifact.charAt(0).toUpperCase() + artifact.slice(1);
}

function launchLabel(source: AuthoringStartSource): string {
  if (source.kind === 'existing') return 'existing item';
  if (source.kind === 'blank') return 'blank content';
  return `content from ${source.type.id}@${source.type.version}`;
}

function saveOutcomeLabel(outcome: AuthoringSaveOutcome): string {
  if (outcome === 'save-item') return 'Save item';
  if (outcome === 'save-new-type-version') return 'Save new type version';
  return 'Save as new type';
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.length > 0 ? error.message : fallback;
}

function requireBlueprintElement(): KumweStudioElement {
  const element = contextualStudio.blueprintElement;
  if (element === undefined) throw new Error('The contextual Blueprint canvas is unavailable.');
  return element;
}

function requireContextualStudio(): KumweStudioContextualElement {
  const element = document.querySelector<KumweStudioContextualElement>('kumwe-studio-contextual');
  if (element === null) {
    throw new Error('Reference host is missing its contextual Studio element.');
  }
  return element;
}

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

function updateLaunchControls(): void {
  const disabled = launchInFlight || saveInFlight;
  for (const selector of ['.reference-demo', '.reference-new', '.reference-from-type']) {
    requireButton(selector).disabled = disabled;
  }
}

function announceReferenceSession(message: string, error = false): void {
  const status = requirePaneElement('.reference-session-status');
  status.setAttribute('role', error ? 'alert' : 'status');
  status.textContent = message;
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
