import {
  activateStudioPlugin,
  ContributionRuntime,
  createCoreProductionBlockDefinitions,
  createCoreProductionPatterns,
  defineKumweStudioContextual,
  defineStudioPlugin,
  STUDIO_CONTRACT_VERSION,
  STUDIO_CONTEXTUAL_PRESENTATIONS,
  STUDIO_WIRE_PROTOCOL_VERSION,
  StudioAuthoringControlRegistry,
  type AuthoringSessionSnapshot,
  type AuthoringTargetDeclaration,
  type BlockDefinition,
  type ExperimentalShellConfiguration,
  type FieldAdapterContribution,
  type KumweStudioContextualElement,
  type OwnerReference,
  type PatternDocument,
  type PluginContributionDeclaration,
  type PluginContributionKind,
  type PluginManifest,
  type QualifiedName,
  type StudioContextualSaveRequestDetail,
  type StudioExtensionAuthoringControl,
} from '@kumwe/studio/browser-bundle';

declare const __STUDIO_STATIC_SESSION__: AuthoringSessionSnapshot;

const EXTENSION_OWNER: OwnerReference = {
  id: 'org.example/catalog-studio-kit',
  version: '1.0.0',
};
const EXTENSION_TARGET_ID = 'org.example.catalog/product-content' as const;
const EXTENSION_BLOCK_ID = 'org.example.catalog/promo-card' as const;
const EXTENSION_FIELD_ADAPTER_ID = 'org.example.catalog/product-name-adapter' as const;
const EXTENSION_CONTROL_ID = 'org.example.catalog/product-name-control' as const;
const EXTENSION_PATTERN_ID = 'org.example.catalog/promo-card-pattern' as const;
const INTEGRITY = 'sha256-gEReHtrWQj4XVxU9b3Yie2ssI8Wsy/nv+rvEe6RcFac=';

defineKumweStudioContextual();

const coreDefinitions = createCoreProductionBlockDefinitions();
const extensionBlock = extensionBlockDefinition();
const extensionPattern = extensionPatternDefinition();
const extensionFieldAdapter = extensionFieldAdapterDefinition();
const extensionTarget = extensionTargetDefinition();
const extensionPlugin = defineStudioPlugin({
  authoringTargets: [extensionTarget],
  blocks: [extensionBlock],
  fieldAdapters: [extensionFieldAdapter],
  manifest: extensionManifest(),
  patterns: [extensionPattern],
});
const runtime = new ContributionRuntime({ generation: 'extension-generation-r0' });
activateStudioPlugin(runtime, extensionPlugin, { generation: 'extension-generation-r1' });

let session = structuredClone(__STUDIO_STATIC_SESSION__);
session.capabilities.presentationStates = [...STUDIO_CONTEXTUAL_PRESENTATIONS];
session.target.presentationStates = [...STUDIO_CONTEXTUAL_PRESENTATIONS];
const nameField = session.state.model.fields.find((field) => field.id === 'name');
if (nameField === undefined) throw new Error('The standalone fixture requires its name field.');
nameField.authoring = { control: EXTENSION_CONTROL_ID, order: 0 };
session.state.blueprint.dependencyLock.blocks.push({
  revision: extensionBlock.revision,
  type: extensionBlock.type,
  version: extensionBlock.version,
});

const studio = requiredElement(
  document.querySelector<KumweStudioContextualElement>('kumwe-studio-contextual'),
  'kumwe-studio-contextual',
);
const status = requiredElement(
  document.querySelector<HTMLOutputElement>('#runtime-status'),
  '#runtime-status',
);
const intentOutput = requiredElement(
  document.querySelector<HTMLElement>('#save-intent'),
  '#save-intent',
);
const lifecycleState = requiredElement(
  document.querySelector<HTMLOutputElement>('#extension-state'),
  '#extension-state',
);
const lifecycleResolution = requiredElement(
  document.querySelector<HTMLOutputElement>('#extension-resolution'),
  '#extension-resolution',
);
const lifecycleContributions = requiredElement(
  document.querySelector<HTMLElement>('#extension-contributions'),
  '#extension-contributions',
);
const disableButton = requiredElement(
  document.querySelector<HTMLButtonElement>('#extension-disable'),
  '#extension-disable',
);
const reactivateButton = requiredElement(
  document.querySelector<HTMLButtonElement>('#extension-reactivate'),
  '#extension-reactivate',
);
const revokeButton = requiredElement(
  document.querySelector<HTMLButtonElement>('#extension-revoke'),
  '#extension-revoke',
);
const uninstallButton = requiredElement(
  document.querySelector<HTMLButtonElement>('#extension-uninstall'),
  '#extension-uninstall',
);

disableButton.addEventListener('click', () => {
  preserveDraft();
  runtime.disable(EXTENSION_OWNER.id, { generation: 'extension-generation-r2-disabled' });
  applyCurrentGeneration('Extension disabled; canonical content is preserved read-only.');
});
reactivateButton.addEventListener('click', () => {
  preserveDraft();
  runtime.reactivate(EXTENSION_OWNER.id, {
    generation: 'extension-generation-r3-reactivated',
  });
  applyCurrentGeneration('Extension reactivated from the next immutable generation.');
});
revokeButton.addEventListener('click', () => {
  preserveDraft();
  runtime.revokeTrust(EXTENSION_OWNER.id, { generation: 'extension-generation-r4-revoked' });
  applyCurrentGeneration('Extension trust revoked; executable resolution stopped immediately.');
});
uninstallButton.addEventListener('click', () => {
  preserveDraft();
  runtime.uninstall(EXTENSION_OWNER.id, { generation: 'extension-generation-r5-uninstalled' });
  applyCurrentGeneration('Extension uninstalled; canonical content remains preserved.');
});

studio.addEventListener('studio-contextual-save-request', (event: Event) => {
  const { detail } = event as CustomEvent<StudioContextualSaveRequestDetail>;
  intentOutput.textContent = JSON.stringify(detail.intent, null, 2);
  document.dispatchEvent(
    new CustomEvent<StudioContextualSaveRequestDetail>('studio-static-host-save-intent', {
      detail: structuredClone(detail),
    }),
  );
  status.textContent = 'Save intent emitted. No durable effect was applied by this static host.';
});

applyCurrentGeneration('Extension target activated from its immutable contribution generation.');
await studio.updateComplete;
await studio.authoringReady;
status.textContent = 'Studio loaded from prebuilt static browser assets.';
document.documentElement.dataset.studioStaticReady = 'true';

function preserveDraft(): void {
  const snapshot = studio.snapshot;
  if (snapshot !== undefined) session = structuredClone(snapshot);
}

function applyCurrentGeneration(message: string): void {
  const inventory = runtime.inventory().find((item) => item.owner.id === EXTENSION_OWNER.id);
  if (inventory === undefined) throw new Error('The extension lifecycle inventory is unavailable.');
  const resolution = runtime.current.resolveAuthoringTarget(
    {
      intent: 'edit',
      requestedPresentation: session.presentation.current,
      resourceContext: session.resourceContext,
      targetId: EXTENSION_TARGET_ID,
    },
    { capabilities: [], mode: 'content' },
  );
  session.contributionGeneration = runtime.current.generation;
  if (resolution !== undefined) session.target = structuredClone(resolution.target);

  const admittedBlock = resolution?.contributions.find(
    (contribution): contribution is BlockDefinition => contribution.kind === 'block-definition',
  );
  const admittedAdapter = resolution?.contributions.find(
    (contribution): contribution is FieldAdapterContribution =>
      contribution.kind === 'field-adapter',
  );
  const admittedPattern = resolution?.contributions.find(
    (contribution): contribution is PatternDocument => contribution.kind === 'pattern',
  );
  const resolved = resolution !== undefined;
  studio.authoringControlRegistry = new StudioAuthoringControlRegistry({
    extensionControls:
      admittedAdapter?.control === EXTENSION_CONTROL_ID ? [extensionControl()] : [],
  });
  studio.configuration = configurationFor(
    session,
    admittedBlock === undefined ? coreDefinitions : [...coreDefinitions, admittedBlock],
    resolved,
  );
  studio.patterns =
    admittedPattern === undefined
      ? createCoreProductionPatterns()
      : [...createCoreProductionPatterns(), admittedPattern];
  studio.session = structuredClone(session);

  const unresolved = runtime.unresolvedReference({
    contribution: 'authoring-target',
    id: EXTENSION_TARGET_ID,
    version: EXTENSION_OWNER.version,
  });
  lifecycleState.textContent = inventory.state;
  lifecycleResolution.textContent = resolved
    ? `resolved at ${runtime.current.generation}`
    : `unavailable (${unresolved?.reason ?? 'not-installed'}) at ${runtime.current.generation}`;
  lifecycleContributions.textContent = JSON.stringify(
    resolution?.contributions.map((contribution) => ({
      id: contributionId(contribution),
      kind: contribution.kind,
      version: contribution.version,
    })) ?? [],
    null,
    2,
  );
  lifecycleState.dataset.state = inventory.state;
  lifecycleResolution.dataset.resolved = String(resolved);
  document.documentElement.dataset.studioExtensionState = inventory.state;
  document.documentElement.dataset.studioExtensionResolved = String(resolved);
  disableButton.disabled = inventory.state !== 'active';
  reactivateButton.disabled = inventory.state !== 'disabled';
  revokeButton.disabled = inventory.state !== 'active';
  uninstallButton.disabled = inventory.state === 'uninstalled-data-preserved';
  status.textContent = message;
}

function configurationFor(
  currentSession: AuthoringSessionSnapshot,
  definitions: readonly BlockDefinition[],
  editable: boolean,
): ExperimentalShellConfiguration {
  return {
    blockDefinitions: [...definitions],
    session: {
      actor: { displayName: 'Static-host author', id: 'users/static-host-author' },
      artifacts: {
        blueprint: currentSession.state.coordinates.blueprint,
        entry: currentSession.state.coordinates.entry,
        model: currentSession.state.coordinates.model,
      },
      blocks: definitions.map((definition) => ({
        revision: definition.revision,
        type: definition.type,
        version: definition.version,
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
        clipboardMediaUpload: false,
        collaboration: false,
        customInspectors: false,
        executablePlugins: false,
        externalMediaImport: false,
        offlineRecovery: false,
      },
      hostCapabilities: {
        capabilities: [],
        contractVersion: STUDIO_CONTRACT_VERSION,
        host: {
          generation: 'static-host-generation-r1',
          id: 'org.example/static-host',
          version: '1.0.0',
        },
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
      preview: {
        allowApproximateRenderer: false,
        enabled: false,
        sameOriginRequired: true,
      },
      protocolVersion: STUDIO_WIRE_PROTOCOL_VERSION,
      resourceContext: structuredClone(currentSession.resourceContext),
      sessionGeneration: currentSession.sessionGeneration,
      sessionId: currentSession.sessionId,
      sessionState: editable ? 'editable' : 'read-only',
    },
  };
}

function extensionControl(): StudioExtensionAuthoringControl {
  return {
    control: EXTENSION_CONTROL_ID,
    mount(options) {
      const input = document.createElement('input');
      input.setAttribute('aria-label', 'Extension product name');
      input.disabled = options.readOnly === true;
      input.value = String(options.value);
      input.addEventListener('input', () => {
        options.onChange?.({ valid: true, value: input.value });
      });
      options.holder.append(input);
      return {
        destroy: (): void => input.remove(),
        focus: (): void => input.focus(),
        readOnly: input.disabled,
        value: (): string => input.value,
      };
    },
  };
}

function extensionBlockDefinition(): BlockDefinition {
  return {
    accessibility: {
      accessibleName: 'not-applicable',
      category: 'structural',
      keyboard: {
        defaultMessage: 'Use the standard Studio block controls.',
        key: 'org.example.catalog/promo-card-keyboard',
      },
      outputChecks: ['org.example.catalog/promo-card-check'],
      reducedMotion: 'not-applicable',
    },
    category: 'org.example.catalog/content-blocks',
    contractVersion: STUDIO_CONTRACT_VERSION,
    editingModes: ['blueprint', 'content'],
    kind: 'block-definition',
    label: { defaultMessage: 'Catalog promotion', key: 'org.example.catalog/promo-card' },
    owner: EXTENSION_OWNER,
    ports: [],
    propertySchema: {
      additionalProperties: false,
      properties: { tone: { enum: ['enterprise', 'friendly'], type: 'string' } },
      required: ['tone'],
      type: 'object',
    },
    rendererRequirements: [
      { capability: 'org.example.catalog/renderer', surface: 'preview', versions: '^1.0.0' },
    ],
    revision: 'promo-card-block-r1',
    slots: [],
    themeControls: [],
    type: EXTENSION_BLOCK_ID,
    version: '1.0.0',
  };
}

function extensionPatternDefinition(): PatternDocument {
  return {
    blockDependencies: [
      {
        revision: extensionBlock.revision,
        type: extensionBlock.type,
        version: extensionBlock.version,
      },
    ],
    contractVersion: STUDIO_CONTRACT_VERSION,
    id: EXTENSION_PATTERN_ID,
    kind: 'pattern',
    label: { defaultMessage: 'Catalog promotion pattern', key: EXTENSION_PATTERN_ID },
    owner: EXTENSION_OWNER,
    revision: 'promo-card-pattern-r1',
    roots: [
      {
        authoring: { mode: 'designer' },
        bindings: {},
        id: 'extension-promo-card',
        properties: { tone: 'enterprise' },
        slots: {},
        type: EXTENSION_BLOCK_ID,
        version: '1.0.0',
      },
    ],
    version: '1.0.0',
  };
}

function extensionFieldAdapterDefinition(): FieldAdapterContribution {
  return {
    contractVersion: STUDIO_CONTRACT_VERSION,
    control: EXTENSION_CONTROL_ID,
    fieldKinds: ['studio.field/string'],
    id: EXTENSION_FIELD_ADAPTER_ID,
    kind: 'field-adapter',
    label: { defaultMessage: 'Catalog product name', key: EXTENSION_FIELD_ADAPTER_ID },
    owner: EXTENSION_OWNER,
    version: '1.0.0',
  };
}

function extensionTargetDefinition(): AuthoringTargetDeclaration {
  return {
    contractVersion: STUDIO_CONTRACT_VERSION,
    contributionDependencies: [
      { id: EXTENSION_BLOCK_ID, kind: 'block-definition', required: true, versions: '^1.0.0' },
      {
        id: EXTENSION_FIELD_ADAPTER_ID,
        kind: 'field-adapter',
        required: true,
        versions: '^1.0.0',
      },
      { id: EXTENSION_PATTERN_ID, kind: 'pattern', required: true, versions: '^1.0.0' },
    ],
    eligibility: ['create', 'edit'],
    id: EXTENSION_TARGET_ID,
    kind: 'authoring-target',
    label: { defaultMessage: 'Product content', key: EXTENSION_TARGET_ID },
    modes: ['model', 'blueprint', 'content'],
    owner: EXTENSION_OWNER,
    presentationStates: STUDIO_CONTEXTUAL_PRESENTATIONS,
    requiredCapabilities: [],
    resourceTypes: ['org.example.catalog/product'],
    saveOutcomes: ['save-item', 'save-new-type-version', 'save-as-new-type'],
    startKinds: ['blank', 'from-type', 'existing'],
    surface: 'org.example.catalog/product-editor',
  };
}

function extensionManifest(): PluginManifest {
  return {
    activation: 'declarative',
    contractVersion: STUDIO_CONTRACT_VERSION,
    contributions: [
      contributionDeclaration('authoring-target', EXTENSION_TARGET_ID),
      contributionDeclaration('block', EXTENSION_BLOCK_ID),
      contributionDeclaration('field-adapter', EXTENSION_FIELD_ADAPTER_ID),
      contributionDeclaration('pattern', EXTENSION_PATTERN_ID),
    ],
    dependencies: [],
    entryModules: [],
    id: EXTENSION_OWNER.id,
    kind: 'plugin-manifest',
    label: { defaultMessage: 'Catalog Studio kit', key: 'org.example.catalog/plugin' },
    optionalCapabilities: [],
    owner: EXTENSION_OWNER,
    permissions: [],
    requiredCapabilities: [{ id: 'org.example.catalog/renderer', versions: '^1.0.0' }],
    version: EXTENSION_OWNER.version,
  };
}

function contributionDeclaration(
  kind: PluginContributionKind,
  id: QualifiedName,
): PluginContributionDeclaration {
  return {
    executable: false,
    id,
    integrity: INTEGRITY,
    kind,
    resource: `contributions/${kind}.json`,
    version: '1.0.0',
  };
}

function contributionId(contribution: { kind: string }): string {
  const candidate = contribution as { id?: string; type?: string };
  const id = contribution.kind === 'block-definition' ? candidate.type : candidate.id;
  if (id === undefined) throw new TypeError('An admitted contribution has no identity.');
  return id;
}

function requiredElement<TElement extends Element>(
  element: TElement | null,
  selector: string,
): TElement {
  if (element === null) {
    throw new Error(`The standalone deployment document is missing ${selector}.`);
  }
  return element;
}
