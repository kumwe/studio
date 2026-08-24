import { describe, expect, it } from 'vitest';
import {
  STUDIO_CONTRACT_VERSION,
  type BlueprintCommand,
  type BlueprintNode,
  type ContentModelDocument,
  type FieldDefinition,
  type QualifiedName,
} from '@kumwe/studio-protocol';
import {
  createBlueprintFixture,
  createStudioConfigurationFixture,
  defineTestBlock,
} from '@kumwe/studio-testkit';
import {
  defineKumweStudio,
  KumweStudioElement,
  type StudioDocumentChangeDetail,
} from '../src/index.js';

const MODEL_GET: QualifiedName = 'studio.operation/model.get';
const MODEL_LIST: QualifiedName = 'studio.operation/model.list';

function modelFields(): FieldDefinition[] {
  return [
    {
      authoring: {
        control: 'studio.control/single-line-text',
        order: 0,
        placeholder: { defaultMessage: 'Article title', key: 'studio.test/title-placeholder' },
      },
      cardinality: 'one',
      id: 'title',
      kind: 'string',
      label: { defaultMessage: 'Title', key: 'studio.test/title' },
      localized: true,
      required: true,
    },
    {
      authoring: { control: 'kumwe.app/email', order: 1 },
      cardinality: 'one',
      id: 'contact',
      kind: 'string',
      label: { defaultMessage: 'Contact', key: 'studio.test/contact' },
      localized: false,
      required: false,
    },
    {
      authoring: { control: 'studio.control/select', order: 2 },
      cardinality: 'one',
      enumValues: [
        { label: { defaultMessage: 'Guide', key: 'studio.test/guide' }, value: 'guide' },
      ],
      id: 'category',
      kind: 'enum',
      label: { defaultMessage: 'Category', key: 'studio.test/category' },
      localized: false,
      required: false,
    },
    {
      authoring: { control: 'studio.control/switch', order: 3 },
      cardinality: 'one',
      id: 'featured',
      kind: 'boolean',
      label: { defaultMessage: 'Featured', key: 'studio.test/featured' },
      localized: false,
      required: false,
    },
    {
      authoring: { control: 'kumwe.app/schema-group', order: 4 },
      cardinality: 'many',
      id: 'tags',
      itemKind: 'string',
      kind: 'collection',
      label: { defaultMessage: 'Tags', key: 'studio.test/tags' },
      localized: false,
      required: false,
    },
  ];
}

function model(fields: FieldDefinition[] = modelFields()): ContentModelDocument {
  return {
    contractVersion: STUDIO_CONTRACT_VERSION,
    fields,
    id: 'content-model:00000000-0000-4000-8000-000000000001',
    kind: 'content-model',
    label: { defaultMessage: 'Article', key: 'studio.test/article' },
    owner: { id: 'kumwe.app/content', version: '2.0.0' },
    relationships: [],
    revision: 'content-type-v4',
    status: 'published',
    version: '0.0.4',
  };
}

function node(): BlueprintNode {
  return {
    authoring: { mode: 'content' },
    bindings: {
      headline: {
        onError: 'error',
        onNull: 'empty',
        source: { fieldPath: ['title'], kind: 'entry-field' },
        transforms: [],
      },
    },
    id: 'article-card-1',
    properties: {},
    slots: {},
    type: 'studio.test/article-card',
    version: '1.0.0',
  };
}

async function mount(
  options: {
    contentModel?: ContentModelDocument;
    readOnly?: boolean;
  } = {},
): Promise<KumweStudioElement> {
  defineKumweStudio();
  const definition = defineTestBlock({
    label: 'Article card',
    type: 'studio.test/article-card',
  });
  definition.ports = [
    {
      id: 'headline',
      label: { defaultMessage: 'Headline', key: 'studio.test/headline' },
      multiple: false,
      required: true,
      valueType: 'text',
    },
    {
      id: 'featured',
      label: { defaultMessage: 'Featured', key: 'studio.test/featured-port' },
      multiple: false,
      required: false,
      valueType: 'boolean',
    },
    {
      id: 'labels',
      label: { defaultMessage: 'Labels', key: 'studio.test/labels' },
      multiple: true,
      required: false,
      valueType: 'text',
    },
  ];
  const session = createStudioConfigurationFixture({
    sessionState: options.readOnly === true ? 'read-only' : 'editable',
  });
  session.hostCapabilities.ports = [
    {
      id: 'studio.port/model',
      operations: [MODEL_GET, MODEL_LIST],
      version: '1.0.0',
    },
  ];
  const blueprint = createBlueprintFixture({
    blockLocks: [
      { revision: definition.revision, type: definition.type, version: definition.version },
    ],
    roots: [node()],
  });
  const projectedModel = options.contentModel;
  if (projectedModel !== undefined) {
    blueprint.model = {
      id: projectedModel.id,
      revision: projectedModel.revision,
      version: projectedModel.version,
    };
  }
  const element = new KumweStudioElement();
  element.configuration = { blockDefinitions: [definition], session };
  element.contentModel = projectedModel;
  element.document = blueprint;
  document.body.append(element);
  await element.updateComplete;
  const outline = element.shadowRoot?.querySelector<HTMLButtonElement>(
    'button.outline-entry[data-node-id="article-card-1"]',
  );
  if (outline === null || outline === undefined) {
    throw new Error('Missing article card outline entry.');
  }
  outline.click();
  await element.updateComplete;
  return element;
}

function fieldSelect(element: KumweStudioElement, port: string): HTMLSelectElement {
  const select = element.shadowRoot?.querySelector<HTMLSelectElement>(
    `select.inspector-binding-field[data-port="${port}"]`,
  );
  if (select === null || select === undefined) {
    throw new Error(`Missing field selector for ${port}.`);
  }
  return select;
}

function observeCommands(element: KumweStudioElement): BlueprintCommand[] {
  const commands: BlueprintCommand[] = [];
  element.addEventListener('studio-document-change', (event: Event) => {
    const command = (event as CustomEvent<StudioDocumentChangeDetail>).detail.command;
    if (command !== null) {
      commands.push(command);
    }
  });
  return commands;
}

describe('model-projected inspector bindings', () => {
  it('offers only compatible fields and renders the selected field declared control', async () => {
    const projectedModel = model();
    const modelBefore = structuredClone(projectedModel);
    const element = await mount({ contentModel: projectedModel });
    const commands = observeCommands(element);
    const select = fieldSelect(element, 'headline');

    expect([...select.options].map((option) => option.textContent?.trim())).toEqual([
      'Choose a model field',
      'Title (title)',
      'Contact (contact)',
      'Category (category)',
    ]);
    expect(select.dataset.authoringControl).toBe('studio.control/single-line-text');
    expect(
      element.shadowRoot?.querySelector(
        '.inspector-binding-control[data-authoring-control="studio.control/single-line-text"] input[type="text"][disabled]',
      ),
    ).not.toBeNull();
    expect(select.querySelector('option[data-authoring-control="kumwe.app/email"]')).not.toBeNull();
    expect(
      [...fieldSelect(element, 'featured').options].map((option) => option.textContent?.trim()),
    ).toEqual(['Choose a model field', 'Featured (featured)']);
    expect(
      [...fieldSelect(element, 'labels').options].map((option) => option.textContent?.trim()),
    ).toEqual(['Choose a model field', 'Tags (tags)']);

    select.value = JSON.stringify(['contact']);
    select.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    await element.updateComplete;

    expect(commands).toHaveLength(1);
    expect(commands[0]).toMatchObject({
      payload: {
        binding: {
          onError: 'error',
          onNull: 'empty',
          source: { fieldPath: ['contact'], kind: 'entry-field' },
          transforms: [],
        },
        nodeId: 'article-card-1',
        port: 'headline',
      },
      type: 'studio.command/set-binding',
    });
    expect(projectedModel).toEqual(modelBefore);
    expect(
      element.shadowRoot?.querySelector(
        '.inspector-binding-control[data-authoring-control="kumwe.app/email"]',
      )?.textContent,
    ).toContain('requires a host field-adapter contribution');
    element.remove();
  });

  it('preserves and precisely diagnoses a binding after its host field is removed', async () => {
    const element = await mount({ contentModel: model() });
    const documentBefore = structuredClone(element.document);
    element.contentModel = model([
      {
        authoring: { control: 'studio.control/multi-line-text', order: 0 },
        cardinality: 'one',
        id: 'summary',
        kind: 'string',
        label: { defaultMessage: 'Summary', key: 'studio.test/summary' },
        localized: true,
        required: false,
      },
    ]);
    await element.updateComplete;

    expect(element.document).toEqual(documentBefore);
    expect(
      element.shadowRoot?.querySelector('[data-diagnostic-code="studio.binding/field-missing"]'),
    ).not.toBeNull();
    expect(
      element.shadowRoot?.querySelector('.inspector-binding-model[data-port="headline"]')
        ?.textContent,
    ).toContain('no longer resolves');
    expect(
      [...fieldSelect(element, 'headline').options].map((option) => option.textContent?.trim()),
    ).toEqual(['Choose a model field', 'Summary (summary)']);
    element.remove();
  });

  it('fails candidate choices closed on model-coordinate drift and in read-only sessions', async () => {
    const element = await mount({ contentModel: model(), readOnly: true });
    expect(fieldSelect(element, 'headline').disabled).toBe(true);
    expect(
      element.shadowRoot?.querySelector<HTMLButtonElement>(
        'button.inspector-binding-remove[data-port="headline"]',
      )?.disabled,
    ).toBe(true);

    element.contentModel = { ...model(), revision: 'content-type-v5' };
    await element.updateComplete;
    expect(
      element.shadowRoot?.querySelector(
        '[data-diagnostic-code="studio.binding/model-revision-mismatch"]',
      ),
    ).not.toBeNull();
    expect(
      element.shadowRoot?.querySelector('.inspector-binding-model-mismatch')?.textContent,
    ).toContain('does not match the Blueprint lock');
    expect(element.shadowRoot?.querySelector('select.inspector-binding-field')).toBeNull();
    element.remove();
  });

  it('does not fall back to free-form binding JSON when model reads are advertised but unloaded', async () => {
    const element = await mount();
    expect(
      element.shadowRoot?.querySelector('.inspector-binding-model-unavailable')?.textContent,
    ).toContain('no active model projection is loaded');
    expect(element.shadowRoot?.querySelector('input.inspector-binding-value-input')).toBeNull();
    expect(element.shadowRoot?.querySelector('input.inspector-binding-port')).toBeNull();
    element.remove();
  });
});
