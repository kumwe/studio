import { describe, expect, it } from 'vitest';
import {
  STUDIO_CONTRACT_VERSION,
  type BlockDefinition,
  type BlueprintDocument,
  type BlueprintNode,
  type ContentModelDocument,
  type FieldBinding,
  type FieldDefinition,
} from '@kumwe/studio-protocol';
import { createBlueprintFixture, defineTestBlock } from '@kumwe/studio-testkit';
import { projectBlueprintFieldBindings } from '../src/index.js';

function modelFixture(fields: FieldDefinition[] = modelFields()): ContentModelDocument {
  return {
    contractVersion: STUDIO_CONTRACT_VERSION,
    fields,
    id: 'content-model:articles',
    kind: 'content-model',
    label: { defaultMessage: 'Articles', key: 'studio.test/articles' },
    owner: { id: 'studio.test/host', version: '1.0.0' },
    relationships: [],
    revision: 'content-type-v4',
    status: 'published',
    version: '0.0.4',
  };
}

function modelFields(): FieldDefinition[] {
  return [
    {
      authoring: { control: 'studio.control/single-line-text', order: 0 },
      cardinality: 'one',
      id: 'title',
      kind: 'string',
      label: { defaultMessage: 'Title', key: 'studio.test/title' },
      localized: true,
      required: true,
      semanticRole: 'studio.semantic/title',
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
      authoring: { control: 'studio.control/single-line-text', order: 3 },
      cardinality: 'many',
      id: 'tags',
      itemKind: 'string',
      kind: 'collection',
      label: { defaultMessage: 'Tags', key: 'studio.test/tags' },
      localized: false,
      required: false,
    },
    {
      authoring: { control: 'studio.control/object', order: 4 },
      cardinality: 'one',
      fields: [
        {
          authoring: { control: 'studio.control/switch', order: 0 },
          cardinality: 'one',
          id: 'featured',
          kind: 'boolean',
          label: { defaultMessage: 'Featured', key: 'studio.test/featured' },
          localized: false,
          required: false,
        },
      ],
      id: 'metadata',
      kind: 'object',
      label: { defaultMessage: 'Metadata', key: 'studio.test/metadata' },
      localized: false,
      required: false,
    },
  ];
}

function fieldBinding(fieldPath: string[]): FieldBinding {
  return {
    onError: 'error',
    onNull: 'empty',
    source: { fieldPath, kind: 'entry-field' },
    transforms: [],
  };
}

function blockDefinition(): BlockDefinition {
  const definition = defineTestBlock({ label: 'Article card', type: 'studio.test/article-card' });
  definition.ports = [
    {
      id: 'headline',
      label: { defaultMessage: 'Headline', key: 'studio.test/headline' },
      multiple: false,
      required: true,
      valueType: 'text',
    },
    {
      id: 'labels',
      label: { defaultMessage: 'Labels', key: 'studio.test/labels' },
      multiple: true,
      required: false,
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
      id: 'manual',
      label: { defaultMessage: 'Manual', key: 'studio.test/manual' },
      multiple: false,
      required: false,
      valueType: 'text',
    },
  ];
  return definition;
}

function node(bindings: Record<string, FieldBinding>): BlueprintNode {
  return {
    authoring: { mode: 'content' },
    bindings,
    id: 'article-card-1',
    properties: {},
    slots: {},
    type: 'studio.test/article-card',
    version: '1.0.0',
  };
}

function blueprint(bindings: Record<string, FieldBinding>): BlueprintDocument {
  const document = createBlueprintFixture({ roots: [node(bindings)] });
  document.model = {
    id: 'content-model:articles',
    revision: 'content-type-v4',
    version: '0.0.4',
  };
  return document;
}

describe('projectBlueprintFieldBindings', () => {
  it('derives exact compatible candidates, controls, and binding statuses', () => {
    const staticBinding: FieldBinding = {
      onError: 'error',
      onNull: 'empty',
      source: { kind: 'static-value', value: 'Fallback' },
      transforms: [],
    };
    const projection = projectBlueprintFieldBindings(
      blueprint({
        featured: fieldBinding(['metadata', 'featured']),
        headline: fieldBinding(['title']),
        labels: fieldBinding(['tags']),
        manual: staticBinding,
        removed: fieldBinding(['title']),
      }),
      modelFixture(),
      [blockDefinition()],
    );

    expect(projection.nodes.map((entry) => entry.nodeId)).toEqual(['article-card-1']);
    const ports = Object.fromEntries(
      projection.nodes[0]?.ports.map((port) => [port.port, port]) ?? [],
    );
    expect(ports.headline).toMatchObject({
      boundFieldPath: ['title'],
      status: 'resolved',
      valueType: 'text',
    });
    expect(ports.headline?.candidates).toEqual([
      expect.objectContaining({
        control: 'studio.control/single-line-text',
        fieldPath: ['title'],
        kind: 'string',
      }),
      expect.objectContaining({
        control: 'studio.control/select',
        fieldPath: ['category'],
        kind: 'enum',
      }),
    ]);
    expect(ports.labels).toMatchObject({ boundFieldPath: ['tags'], status: 'resolved' });
    expect(ports.labels?.candidates).toEqual([
      expect.objectContaining({
        cardinality: 'many',
        fieldPath: ['tags'],
        itemKind: 'string',
        kind: 'collection',
      }),
    ]);
    expect(ports.featured).toMatchObject({
      boundFieldPath: ['metadata', 'featured'],
      status: 'resolved',
    });
    expect(ports.manual).toMatchObject({ binding: staticBinding, status: 'non-field-source' });
    expect(ports.removed).toMatchObject({ status: 'invalid' });
    expect(projection.diagnostics.map((entry) => entry.code)).toEqual([
      'studio.binding/port-missing',
    ]);
    expect(projection.diagnostics[0]?.location?.nodeId).toBe('article-card-1');
  });

  it('reports removed, type-changed, and cardinality-changed fields without rewriting bindings', () => {
    const original = blueprint({
      featured: fieldBinding(['featured']),
      headline: fieldBinding(['title']),
      labels: fieldBinding(['tags']),
    });
    const changedFields: FieldDefinition[] = [
      {
        cardinality: 'one',
        id: 'featured',
        kind: 'string',
        label: { defaultMessage: 'Featured', key: 'studio.test/featured' },
        localized: false,
        required: false,
      },
      {
        cardinality: 'one',
        id: 'tags',
        kind: 'string',
        label: { defaultMessage: 'Tags', key: 'studio.test/tags' },
        localized: false,
        required: false,
      },
    ];
    const before = structuredClone(original);
    const projection = projectBlueprintFieldBindings(original, modelFixture(changedFields), [
      blockDefinition(),
    ]);

    expect(projection.diagnostics.map((entry) => entry.code)).toEqual([
      'studio.binding/field-missing',
      'studio.binding/field-cardinality-incompatible',
      'studio.binding/field-kind-incompatible',
    ]);
    expect(original).toEqual(before);
    const projectedBinding = projection.nodes[0]?.ports.find(
      (port) => port.port === 'headline',
    )?.binding;
    if (projectedBinding === undefined) {
      throw new Error('The preserved invalid binding is missing.');
    }
    projectedBinding.onError = 'hide';
    expect(original.roots[0]?.bindings.headline?.onError).toBe('error');
  });

  it('fails the whole candidate surface closed on each model coordinate mismatch', () => {
    for (const changed of [
      { id: 'content-model:other' },
      { version: '0.0.5' },
      { revision: 'content-type-v5' },
    ]) {
      const projection = projectBlueprintFieldBindings(
        blueprint({ headline: fieldBinding(['title']) }),
        modelFixture(modelFields()),
        [blockDefinition()],
      );
      const model = { ...modelFixture(), ...changed } as ContentModelDocument;
      const actual = projectBlueprintFieldBindings(
        blueprint({ headline: fieldBinding(['title']) }),
        model,
        [blockDefinition()],
      );
      expect(projection.diagnostics).toEqual([]);
      expect(actual.nodes[0]?.ports[0]?.candidates).toEqual([]);
      expect(actual.nodes[0]?.ports[0]?.status).toBe('invalid');
      expect(actual.diagnostics[0]?.code).toMatch(/^studio\.binding\/model-/u);
    }
  });

  it('orders nodes by canonical preorder and warns for a required unbound port', () => {
    const child = node({});
    child.id = 'child';
    const first = node({});
    first.id = 'first';
    first.slots = { zeta: [], alpha: [child] };
    const second = node({});
    second.id = 'second';
    const document = blueprint({});
    document.roots = [first, second];
    const projection = projectBlueprintFieldBindings(document, modelFixture(), [blockDefinition()]);

    expect(projection.nodes.map((entry) => entry.nodeId)).toEqual(['first', 'child', 'second']);
    expect(
      projection.diagnostics.filter(
        (entry) => entry.code === 'studio.binding/required-port-unbound',
      ),
    ).toHaveLength(3);
  });
});
