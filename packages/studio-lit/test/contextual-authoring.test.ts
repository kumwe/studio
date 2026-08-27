import { afterEach, describe, expect, it } from 'vitest';
import {
  STUDIO_CONTRACT_VERSION,
  type AddModelFieldCommand,
  type AuthoringSessionSnapshot,
  type AuthoringStartSource,
  type AuthoringTargetDeclaration,
  type BlueprintDocument,
  type ContentModelDocument,
  type EntryDocument,
  type ExperimentalShellConfiguration,
  type FieldDefinition,
  type ReusableContentTypeDefinition,
  type SetFieldValueCommand,
  type SetPropertyCommand,
} from '@kumwe/studio-protocol';
import {
  createBlueprintFixture,
  createStudioConfigurationFixture,
  defineTestBlock,
} from '@kumwe/studio-testkit';
import {
  defineKumweStudioContextual,
  KumweStudioContextualElement,
  StudioAuthoringControlRegistry,
  type StudioContextualChangeDetail,
  type StudioContextualSaveRequestDetail,
} from '../src/index.js';

const owner = { id: 'studio.test/owner', version: '1.0.0' } as const;

afterEach(() => {
  document.body.replaceChildren();
});

function fields(): FieldDefinition[] {
  return [
    {
      authoring: { control: 'studio.control/single-line-text', order: 0 },
      cardinality: 'one',
      id: 'title',
      kind: 'string',
      label: { defaultMessage: 'Title', key: 'studio.test/title' },
      localized: true,
      required: true,
    },
    {
      authoring: { control: 'studio.control/switch', order: 1 },
      cardinality: 'one',
      id: 'featured',
      kind: 'boolean',
      label: { defaultMessage: 'Featured', key: 'studio.test/featured' },
      localized: false,
      required: false,
    },
  ];
}

function model(
  blueprint: BlueprintDocument,
  status: 'draft' | 'published' = 'draft',
  modelFields: FieldDefinition[] = fields(),
): ContentModelDocument {
  return {
    contractVersion: STUDIO_CONTRACT_VERSION,
    fields: modelFields,
    id: blueprint.model.id,
    kind: 'content-model',
    label: { defaultMessage: 'Article', key: 'studio.test/article-model' },
    owner,
    relationships: [],
    revision: blueprint.model.revision,
    status,
    version: blueprint.model.version,
  };
}

function entry(
  modelDocument: ContentModelDocument,
  values: EntryDocument['values'] = {},
): EntryDocument {
  return {
    contractVersion: STUDIO_CONTRACT_VERSION,
    id: 'article:one',
    kind: 'entry',
    locale: 'en',
    model: {
      id: modelDocument.id,
      revision: modelDocument.revision,
      version: modelDocument.version,
    },
    revision: 'entry-r7',
    status: 'draft',
    values,
  };
}

function createSession(
  configuration: ExperimentalShellConfiguration,
  blueprint: BlueprintDocument,
  modelDocument: ContentModelDocument,
  entryDocument: EntryDocument,
  start: AuthoringStartSource,
): AuthoringSessionSnapshot {
  const target: AuthoringTargetDeclaration = {
    contractVersion: STUDIO_CONTRACT_VERSION,
    contributionDependencies: [],
    eligibility: ['create', 'edit'] as const,
    id: 'studio.test/article-authoring',
    kind: 'authoring-target' as const,
    label: { defaultMessage: 'Article editor', key: 'studio.test/article-editor' },
    modes: ['model', 'blueprint', 'content'] as const,
    owner,
    presentationStates: ['inline', 'minimized', 'maximized', 'fullscreen'] as const,
    requiredCapabilities: [],
    resourceTypes: ['studio.test/article'],
    saveOutcomes: ['save-item', 'save-new-type-version', 'save-as-new-type'] as const,
    startKinds: ['blank', 'existing', 'from-type'] as const,
    surface: 'studio.test/content-editor',
  };
  const type: ReusableContentTypeDefinition = {
    authoringPolicy: {
      itemComposition: 'denied' as const,
      modes: ['model', 'blueprint', 'content'] as const,
    },
    blueprint: {
      id: blueprint.id,
      revision: blueprint.revision,
      version: blueprint.version,
    },
    contractVersion: STUDIO_CONTRACT_VERSION,
    id: 'article-type',
    kind: 'reusable-content-type' as const,
    label: { defaultMessage: 'Article page', key: 'studio.test/article-type' },
    model: {
      id: modelDocument.id,
      revision: modelDocument.revision,
      version: modelDocument.version,
    },
    revision: 'type-r4',
    status: 'draft' as const,
    version: '1.2.0',
  };
  return {
    capabilities: {
      modes: [...target.modes],
      presentationStates: [...target.presentationStates],
      saveOutcomes: [...target.saveOutcomes],
    },
    contractVersion: STUDIO_CONTRACT_VERSION,
    contributionGeneration: 'contributions-r3',
    kind: 'authoring-session',
    presentation: {
      current: 'inline',
      returnContext: {
        key: 'article-edit',
        label: { defaultMessage: 'Return to article', key: 'studio.test/return' },
      },
    },
    resourceContext: {
      key: 'article-one-edit',
      resource: { id: entryDocument.id, type: 'studio.test/article' },
      revision: entryDocument.revision,
      scopes: [],
      surface: 'studio.test/content-editor',
    },
    sessionGeneration: configuration.session.sessionGeneration,
    sessionId: configuration.session.sessionId,
    start,
    state: {
      blueprint,
      coordinates: {
        blueprint: {
          id: blueprint.id,
          revision: blueprint.revision,
          version: blueprint.version,
        },
        entry: { id: entryDocument.id, revision: entryDocument.revision },
        model: {
          id: modelDocument.id,
          revision: modelDocument.revision,
          version: modelDocument.version,
        },
        type: { id: type.id, revision: type.revision, version: type.version },
      },
      diagnostics: [],
      dirty: [],
      entry: entryDocument,
      model: modelDocument,
    },
    target,
    type,
  };
}

async function mount(
  options: {
    modelFields?: FieldDefinition[];
    start?: AuthoringStartSource;
    values?: EntryDocument['values'];
  } = {},
): Promise<KumweStudioContextualElement> {
  defineKumweStudioContextual();
  const definition = defineTestBlock({ label: 'Article card', type: 'studio.test/article-card' });
  definition.ports = [
    {
      id: 'headline',
      label: { defaultMessage: 'Headline', key: 'studio.test/headline' },
      multiple: false,
      required: false,
      valueType: 'text',
    },
  ];
  const blueprint = createBlueprintFixture({
    blockLocks: [
      { revision: definition.revision, type: definition.type, version: definition.version },
    ],
    roots: [
      {
        authoring: { mode: 'content' },
        bindings: {},
        id: 'article-card-1',
        properties: { title: 'Card' },
        slots: {},
        type: definition.type,
        version: definition.version,
      },
    ],
  });
  const modelDocument = model(blueprint, 'draft', options.modelFields);
  const entryDocument = entry(
    modelDocument,
    options.values ?? { featured: false, title: 'Exact value' },
  );
  const session = createStudioConfigurationFixture({ mode: 'blueprint' });
  session.hostCapabilities.ports.push({
    id: 'studio.port/model',
    operations: ['studio.operation/model.get', 'studio.operation/model.list'],
    version: '1.0.0',
  });
  const configuration: ExperimentalShellConfiguration = {
    blockDefinitions: [definition],
    session,
  };
  const element = new KumweStudioContextualElement();
  element.configuration = configuration;
  element.session = createSession(
    configuration,
    blueprint,
    modelDocument,
    entryDocument,
    options.start ?? { kind: 'existing' },
  );
  document.body.append(element);
  await element.updateComplete;
  return element;
}

function modeButton(element: KumweStudioContextualElement, mode: string): HTMLButtonElement {
  const button = element.shadowRoot?.querySelector<HTMLButtonElement>(
    `.contextual-mode-tab[data-mode="${mode}"]`,
  );
  if (button === null || button === undefined) throw new Error(`Missing ${mode} mode.`);
  return button;
}

describe('contextual authoring shell', () => {
  it('renders the canonical existing resource as one persistent Model, Blueprint and Content shell', async () => {
    const element = await mount();

    expect(
      element.shadowRoot?.querySelector('.contextual-workspace')?.getAttribute('data-start'),
    ).toBe('existing');
    expect(element.shadowRoot?.querySelectorAll('.contextual-mode-tab')).toHaveLength(3);
    expect(element.blueprintElement).toBeDefined();
    expect(element.snapshot?.state.entry.values).toEqual({ featured: false, title: 'Exact value' });
    expect(element.snapshot?.state.model.revision).toBe(
      element.snapshot?.state.blueprint.model.revision,
    );
  });

  it.each([
    [{ kind: 'blank' } as const, 'blank'],
    [
      {
        kind: 'from-type',
        type: { id: 'article-type', revision: 'type-r4', version: '1.2.0' },
      } as const,
      'from-type',
    ],
  ])('renders a %s launch without another workspace', async (start, expected) => {
    const element = await mount({ start, values: {} });
    expect(
      element.shadowRoot?.querySelector('.contextual-workspace')?.getAttribute('data-start'),
    ).toBe(expected);
    expect(element.shadowRoot?.querySelectorAll('kumwe-studio')).toHaveLength(1);
    expect(element.snapshot?.state.entry.values).toEqual({});
  });

  it('creates a typed field and actual Entry value through core commands in the same session', async () => {
    const element = await mount();
    const observed: StudioContextualChangeDetail[] = [];
    element.addEventListener('studio-contextual-change', (event) => {
      observed.push((event as CustomEvent<StudioContextualChangeDetail>).detail);
    });

    element.setMode('model');
    await element.updateComplete;
    const form = element.shadowRoot?.querySelector<HTMLFormElement>('.model-field-form');
    if (form === null || form === undefined) throw new Error('Missing field builder.');
    const id = form.elements.namedItem('id');
    const label = form.elements.namedItem('label');
    if (!(id instanceof HTMLInputElement) || !(label instanceof HTMLInputElement)) {
      throw new Error('Missing field identity controls.');
    }
    id.value = 'summary';
    label.value = 'Summary';
    form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }));
    await element.updateComplete;

    expect(element.snapshot?.state.model.fields.at(-1)?.id).toBe('summary');
    expect((observed[0]?.command as AddModelFieldCommand).type).toBe(
      'studio.command/add-model-field',
    );

    element.setMode('blueprint');
    await element.updateComplete;
    const blueprint = element.blueprintElement;
    if (blueprint === undefined) throw new Error('Missing Blueprint shell.');
    blueprint.selectNode('article-card-1');
    blueprint.requestUpdate();
    await blueprint.updateComplete;
    const field = blueprint.shadowRoot?.querySelector<HTMLSelectElement>(
      '.inspector-binding-field[data-port="headline"]',
    );
    if (field === null || field === undefined) throw new Error('Missing field binding control.');
    field.value = JSON.stringify(['summary']);
    field.dispatchEvent(new Event('change', { bubbles: true }));
    await blueprint.updateComplete;
    expect(blueprint.document?.roots[0]?.bindings.headline?.source).toEqual({
      fieldPath: ['summary'],
      kind: 'entry-field',
    });

    element.setMode('content');
    await element.updateComplete;
    const title = element.shadowRoot?.querySelector<HTMLInputElement>(
      '.entry-field-control[data-field-path="title"] input',
    );
    if (title === null || title === undefined) throw new Error('Missing title value control.');
    title.value = 'Updated in Studio';
    title.dispatchEvent(new Event('change', { bubbles: true }));
    await element.updateComplete;

    expect(element.snapshot?.state.entry.values.title).toBe('Updated in Studio');
    expect((observed.at(-1)?.command as SetFieldValueCommand).type).toBe(
      'studio.command/set-field-value',
    );
    expect(element.dirtyState).toEqual({ blueprint: true, entry: true, model: true });
  });

  it('mounts canonical rich text through Studio private controls without exposing Editor.js', async () => {
    const body: FieldDefinition = {
      authoring: { control: 'studio.control/rich-text', order: 0 },
      cardinality: 'one',
      id: 'body',
      kind: 'rich-text',
      label: { defaultMessage: 'Body', key: 'studio.test/body' },
      localized: true,
      required: false,
    };
    const element = await mount({
      modelFields: [body],
      values: {
        body: {
          content: [{ content: [{ text: 'Canonical body', type: 'text' }], type: 'paragraph' }],
          type: 'doc',
        },
      },
    });
    element.authoringControlRegistry = new StudioAuthoringControlRegistry({
      strictContentSecurityPolicy: true,
    });
    element.setMode('content');
    await element.updateComplete;
    await element.authoringReady;

    const holder = element.shadowRoot?.querySelector<HTMLElement>(
      '[data-entry-control-key="body"]',
    );
    expect(holder?.querySelector('[data-studio-rich-text-surface="strict-csp"]')).not.toBeNull();
    expect(holder?.querySelector('.codex-editor,.fake-editorjs-runtime')).toBeNull();
    expect(element).not.toHaveProperty('editorJs');
  });

  it('keeps Blueprint selection, history, dirty state and Entry work across modes and presentations', async () => {
    const element = await mount();
    const blueprint = element.blueprintElement;
    if (blueprint === undefined || element.configuration === undefined) {
      throw new Error('Missing Blueprint shell.');
    }
    blueprint.selectNode('article-card-1');
    const command: SetPropertyCommand = {
      artifactId: blueprint.document?.id ?? '',
      baseStateVersion: blueprint.stateVersion,
      contractVersion: STUDIO_CONTRACT_VERSION,
      id: 'set-card-title',
      kind: 'command',
      payload: { nodeId: 'article-card-1', property: 'title', value: 'Changed' },
      sessionGeneration: element.configuration.session.sessionGeneration,
      type: 'studio.command/set-property',
    };
    blueprint.execute(command);
    element.setMode('content');
    element.setEntryValue(['title'], 'Unsaved content');

    for (const presentation of ['maximized', 'fullscreen', 'minimized', 'inline'] as const) {
      element.setPresentation(presentation);
      await element.updateComplete;
      expect(element.blueprintElement).toBe(blueprint);
      expect(blueprint.selection).toEqual(['article-card-1']);
      expect(blueprint.stateVersion).toBe(1);
      expect(element.snapshot?.state.entry.values.title).toBe('Unsaved content');
      expect(element.dirty).toBe(true);
      expect(element.snapshot?.sessionGeneration).toBe(element.session?.sessionGeneration);
    }
  });

  it('provides keyboard mode navigation and native non-drag controls', async () => {
    const element = await mount();
    const blueprint = modeButton(element, 'blueprint');
    blueprint.focus();
    blueprint.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowRight' }));
    await element.updateComplete;

    expect(element.currentMode).toBe('content');
    expect(element.shadowRoot?.activeElement).toBe(modeButton(element, 'content'));
    expect(element.shadowRoot?.querySelector('.model-field-form')).not.toBeNull();
    expect(element.shadowRoot?.querySelector('[data-field-path="title"] input')).not.toBeNull();
  });

  it('emits a canonical host-owned save intent and excludes Entry values from a new type', async () => {
    const element = await mount({ values: { title: 'Private item value' } });
    let detail: StudioContextualSaveRequestDetail | undefined;
    element.addEventListener('studio-contextual-save-request', (event) => {
      detail = (event as CustomEvent<StudioContextualSaveRequestDetail>).detail;
    });

    element.requestSave('save-as-new-type');

    expect(detail?.intent.kind).toBe('authoring-save-intent');
    expect(detail?.intent.draft.outcome).toBe('save-as-new-type');
    expect(detail?.intent.draft).not.toHaveProperty('entry');
    expect(JSON.stringify(detail?.intent.draft)).not.toContain('Private item value');
    expect(detail?.intent.expected).toEqual(element.session?.state.coordinates);
  });

  it('keeps exact-coordinate mismatches visible and stable across presentation changes', async () => {
    const element = await mount();
    if (element.session === undefined) throw new Error('Missing session.');
    element.session = {
      ...element.session,
      state: {
        ...element.session.state,
        entry: {
          ...element.session.state.entry,
          model: { ...element.session.state.entry.model, revision: 'wrong-model-revision' },
        },
      },
    };
    await element.updateComplete;
    expect(element.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      'studio.contextual/entry-model-mismatch',
    );

    element.setPresentation('fullscreen');
    await element.updateComplete;
    expect(element.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      'studio.contextual/entry-model-mismatch',
    );
  });
});
