import { describe, expect, it } from 'vitest';
import {
  STUDIO_CONTRACT_VERSION,
  type AddModelFieldCommand,
  type BlueprintDocument,
  type BlueprintNode,
  type ContentModelDocument,
  type FieldDefinition,
  type ThemeDocument,
} from '@kumwe/studio-protocol';
import {
  applyCommand,
  applyModelCommand,
  invertCommand,
  RECIPE_MARKER_PROPERTY,
  recipeSelectionOperations,
} from '../src/index.js';

function heroNode(): BlueprintNode {
  return {
    authoring: { mode: 'designer' },
    bindings: {},
    id: 'node-hero',
    properties: { tone: 'bold' },
    slots: {},
    type: 'org.example.blocks/hero',
    version: '1.0.0',
  };
}

function blueprint(): BlueprintDocument {
  return {
    contractVersion: STUDIO_CONTRACT_VERSION,
    dependencyLock: {
      blocks: [{ revision: 'block-r1', type: 'org.example.blocks/hero', version: '1.0.0' }],
      theme: { id: 'themes/aurora', revision: 'theme-r1', version: '1.0.0' },
    },
    id: 'recipe.blueprint',
    kind: 'blueprint',
    label: { defaultMessage: 'Recipe Blueprint', key: 'studio.test/blueprint' },
    model: { id: 'studio.test/model', revision: 'model-r1', version: '1.0.0' },
    owner: { id: 'studio.test/suite', version: '0.1.0-alpha.0' },
    revision: 'blueprint-r1',
    roots: [heroNode()],
    status: 'draft',
    version: '1.0.0',
  };
}

function theme(): ThemeDocument {
  return {
    blockSupport: [
      { renderer: 'org.example/web', type: 'org.example.blocks/hero', versions: '>=1 <2' },
    ],
    contractVersion: STUDIO_CONTRACT_VERSION,
    designControls: [],
    id: 'themes/aurora',
    kind: 'theme',
    label: { defaultMessage: 'Aurora', key: 'org.example/aurora' },
    owner: { id: 'org.example/aurora', version: '1.0.0' },
    recipes: [
      {
        blockType: 'org.example.blocks/hero',
        designValues: { spacing: 'spacing.section.large', tone: 'calm' },
        id: 'hero-calm',
        label: { defaultMessage: 'Calm hero', key: 'org.example/hero-calm' },
      },
    ],
    renderers: [
      { exactPreview: true, id: 'org.example/web', surfaces: ['web', 'preview'], version: '1.0.0' },
    ],
    revision: 'theme-r1',
    version: '1.0.0',
    viewports: [
      {
        base: true,
        id: 'expanded',
        label: { defaultMessage: 'Expanded', key: 'org.example/expanded' },
        order: 0,
        previewWidth: 1280,
      },
    ],
  };
}

function model(status: ContentModelDocument['status'] = 'draft'): ContentModelDocument {
  return {
    contractVersion: STUDIO_CONTRACT_VERSION,
    fields: [
      {
        cardinality: 'one',
        id: 'name',
        kind: 'string',
        label: { defaultMessage: 'Name', key: 'org.example/name' },
        localized: false,
        required: true,
      },
    ],
    id: 'models/product',
    kind: 'content-model',
    label: { defaultMessage: 'Product', key: 'org.example/product' },
    owner: { id: 'org.example/models', version: '1.0.0' },
    relationships: [],
    revision: 'model-r1',
    status,
    version: '1.0.0',
  };
}

function priceField(): FieldDefinition {
  return {
    cardinality: 'one',
    id: 'price',
    kind: 'money',
    label: { defaultMessage: 'Price', key: 'org.example/price' },
    localized: false,
    required: false,
  };
}

function addField(overrides: Partial<AddModelFieldCommand['payload']> = {}): AddModelFieldCommand {
  return {
    artifactId: 'models/product',
    baseStateVersion: 0,
    contractVersion: STUDIO_CONTRACT_VERSION,
    id: 'commands/add-price',
    kind: 'command',
    payload: { field: priceField(), ...overrides },
    sessionGeneration: 'session-r1',
    type: 'studio.command/add-model-field',
  };
}

describe('recipeSelectionOperations', () => {
  it('expands a recipe into sorted design values plus the marker, applied atomically', () => {
    const document = blueprint();
    const operations = recipeSelectionOperations(heroNode(), theme(), 'hero-calm');
    expect(
      operations.map((operation) =>
        'property' in operation.payload ? operation.payload.property : undefined,
      ),
    ).toEqual(['spacing', 'tone', RECIPE_MARKER_PROPERTY]);

    const command = {
      artifactId: document.id,
      baseStateVersion: 0,
      contractVersion: STUDIO_CONTRACT_VERSION,
      id: 'commands/apply-recipe',
      kind: 'command',
      payload: { operations },
      sessionGeneration: 'session-r1',
      type: 'studio.command/batch',
    } as const;

    const applied = applyCommand(document, command);
    expect(applied.roots[0]?.properties).toEqual({
      [RECIPE_MARKER_PROPERTY]: 'hero-calm',
      spacing: 'spacing.section.large',
      tone: 'calm',
    });

    const inverse = invertCommand(document, command, { id: 'commands/apply-recipe.inverse' });
    expect(applyCommand(applied, inverse)).toStrictEqual(document);
  });

  it('rejects unknown recipes and block type mismatches', () => {
    const node = heroNode();
    expect(() => recipeSelectionOperations(node, theme(), 'missing')).toThrow(
      'does not declare a recipe',
    );
    const wrongNode = { ...node, type: 'org.example.blocks/text' as const };
    expect(() => recipeSelectionOperations(wrongNode, theme(), 'hero-calm')).toThrow(
      'targets org.example.blocks/hero blocks',
    );
  });
});

describe('applyModelCommand', () => {
  it('appends and inserts draft fields without mutating the input', () => {
    const before = model();
    const pristine = structuredClone(before);
    const appended = applyModelCommand(before, addField());
    expect(appended.fields.map((field) => field.id)).toEqual(['name', 'price']);
    const inserted = applyModelCommand(before, addField({ position: 0 }));
    expect(inserted.fields.map((field) => field.id)).toEqual(['price', 'name']);
    expect(before).toStrictEqual(pristine);
  });

  it('rejects non-draft models, duplicates, bad positions, and wrong targets', () => {
    expect(() => applyModelCommand(model('published'), addField())).toThrow(
      expect.objectContaining({ code: 'artifact-not-draft' }) as Error,
    );
    const duplicate = addField({ field: { ...priceField(), id: 'name' } });
    expect(() => applyModelCommand(model(), duplicate)).toThrow(
      expect.objectContaining({ code: 'duplicate-field' }) as Error,
    );
    expect(() => applyModelCommand(model(), addField({ position: 5 }))).toThrow(
      expect.objectContaining({ code: 'invalid-index' }) as Error,
    );
    const wrongTarget = { ...addField(), artifactId: 'models/other' };
    expect(() => applyModelCommand(model(), wrongTarget)).toThrow(
      expect.objectContaining({ code: 'node-not-found' }) as Error,
    );
  });
});
