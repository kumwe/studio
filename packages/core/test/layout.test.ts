import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  STUDIO_CONTRACT_VERSION,
  type BlockDefinition,
  type BlockType,
  type BlueprintDocument,
  type BlueprintNode,
  type ThemeDesignControl,
  type ThemeDocument,
  type ThemeViewport,
} from '@kumwe/studio-protocol';
import type { CoreLayoutBlockDefinitionOptions } from '../src/index.js';
import {
  BlockRegistry,
  canonicalUtf8Bytes,
  CORE_LAYOUT_BLOCK_TYPES,
  CORE_LAYOUT_THEME_CONTROLS,
  compileStudioPropertySchema,
  coreLayoutInitialProperties,
  createCoreLayoutBlockDefinitions,
  createCoreProductionBlockDefinitions,
  resolveCoreLayoutIntent,
  validateBlueprint,
} from '../src/index.js';
import type { CoreLayoutError } from '../src/index.js';
import { fnv1a64Hex } from '../src/fnv.js';

const bytesOf = (definitions: readonly BlockDefinition[]): Uint8Array =>
  canonicalUtf8Bytes(definitions as unknown as Parameters<typeof canonicalUtf8Bytes>[0]);

const viewports: ThemeViewport[] = [
  {
    base: true,
    id: 'compact',
    label: { defaultMessage: 'Compact', key: 'studio.test/compact' },
    order: 0,
    previewWidth: 360,
  },
  {
    base: false,
    id: 'medium',
    label: { defaultMessage: 'Medium', key: 'studio.test/medium' },
    order: 1,
    previewWidth: 768,
  },
  {
    base: false,
    id: 'expanded',
    label: { defaultMessage: 'Expanded', key: 'studio.test/expanded' },
    order: 2,
    previewWidth: 1440,
  },
];

function viewport(id: string): ThemeViewport {
  const match = viewports.find((candidate) => candidate.id === id);
  if (match === undefined) {
    throw new Error(`Fixture requires viewport ${id}.`);
  }
  return match;
}

function layoutControls(spacingChoices: readonly string[]): ThemeDesignControl[] {
  const control = (
    id: string,
    kind: ThemeDesignControl['kind'],
    choices: readonly string[],
  ): ThemeDesignControl => ({
    choices: choices.map((choice) => ({
      id: choice,
      label: { defaultMessage: choice, key: `studio.test/${id}-${choice}` },
    })),
    id,
    kind,
    label: { defaultMessage: id, key: `studio.test/${id}` },
  });
  return [
    control(CORE_LAYOUT_THEME_CONTROLS.alignment, 'enum', ['center', 'end', 'start', 'stretch']),
    control(CORE_LAYOUT_THEME_CONTROLS.spacing, 'spacing-role', spacingChoices),
    control(CORE_LAYOUT_THEME_CONTROLS.visibility, 'enum', ['hidden', 'visible']),
    control(CORE_LAYOUT_THEME_CONTROLS.direction, 'enum', ['block', 'inline']),
    control(CORE_LAYOUT_THEME_CONTROLS.collapse, 'enum', ['preserve', 'stack', 'wrap']),
  ];
}

function theme(id: 'themes/aurora' | 'themes/ledger'): ThemeDocument {
  const renderer = id === 'themes/aurora' ? 'renderers/aurora' : 'renderers/ledger';
  return {
    blockSupport: Object.values(CORE_LAYOUT_BLOCK_TYPES).map((type) => ({
      renderer,
      type,
      versions: '^1.0.0',
    })),
    contractVersion: STUDIO_CONTRACT_VERSION,
    designControls: layoutControls(['comfortable', 'compact', 'none', 'spacious']),
    id,
    kind: 'theme',
    label: { defaultMessage: id, key: `studio.test/${id.replace('/', '-')}` },
    owner: { id, version: '1.0.0' },
    recipes: [
      {
        blockType: CORE_LAYOUT_BLOCK_TYPES.grid,
        designValues: { alignment: 'stretch', collapse: 'stack', spacing: 'comfortable' },
        id: 'responsive-grid',
        label: { defaultMessage: 'Responsive grid', key: 'studio.test/responsive-grid' },
      },
    ],
    renderers: [
      {
        exactPreview: id === 'themes/ledger',
        id: renderer,
        surfaces: ['preview', 'web'],
        version: '1.0.0',
      },
    ],
    revision: id === 'themes/aurora' ? 'aurora-r1' : 'ledger-r7',
    version: id === 'themes/aurora' ? '1.0.0' : '3.2.0',
    viewports,
  };
}

function layoutNode(
  id: string,
  type: (typeof CORE_LAYOUT_BLOCK_TYPES)[keyof typeof CORE_LAYOUT_BLOCK_TYPES],
  children: BlueprintNode[] = [],
): BlueprintNode {
  const slot = type === CORE_LAYOUT_BLOCK_TYPES.section ? 'content' : 'items';
  return {
    authoring: { mode: 'structural' },
    bindings: {},
    id,
    properties: coreLayoutInitialProperties(type),
    slots: { [slot]: children },
    type,
    version: '1.0.0',
  };
}

function responsivePage(): BlueprintDocument {
  const grid = layoutNode('grid-1', CORE_LAYOUT_BLOCK_TYPES.grid, [
    layoutNode('stack-1', CORE_LAYOUT_BLOCK_TYPES.stack),
    layoutNode('stack-2', CORE_LAYOUT_BLOCK_TYPES.stack),
    layoutNode('stack-3', CORE_LAYOUT_BLOCK_TYPES.stack),
    layoutNode('stack-4', CORE_LAYOUT_BLOCK_TYPES.stack),
  ]);
  grid.properties = {
    alignment: 'stretch',
    collapse: 'stack',
    columns: 1,
    spacing: 'comfortable',
    visibility: 'visible',
  };
  grid.responsive = { columns: { expanded: 4, medium: 2 } };
  return {
    contractVersion: STUDIO_CONTRACT_VERSION,
    dependencyLock: {
      blocks: createCoreLayoutBlockDefinitions().map((definition) => ({
        revision: definition.revision,
        type: definition.type,
        version: definition.version,
      })),
      theme: { id: 'themes/aurora', revision: 'aurora-r1', version: '1.0.0' },
    },
    id: 'pages/responsive',
    kind: 'blueprint',
    label: { defaultMessage: 'Responsive page', key: 'studio.test/responsive-page' },
    model: { id: 'models/page', revision: 'model-r1', version: '1.0.0' },
    owner: { id: 'studio.test/layout', version: '1.0.0' },
    revision: 'page-r1',
    roots: [layoutNode('section-1', CORE_LAYOUT_BLOCK_TYPES.section, [grid])],
    status: 'draft',
    version: '1.0.0',
  };
}

describe('core layout block family', () => {
  it('ships four schema-profile-valid definitions with explicit renderer and slot allowlists', () => {
    const definitions = createCoreLayoutBlockDefinitions({
      acceptedChildTypes: ['org.example/content'],
      rendererRequirements: [
        { capability: 'org.example/layout', surface: 'web', versions: '^2.0.0' },
      ],
    });

    expect(definitions.map((definition) => definition.type)).toEqual([
      CORE_LAYOUT_BLOCK_TYPES.section,
      CORE_LAYOUT_BLOCK_TYPES.stack,
      CORE_LAYOUT_BLOCK_TYPES.grid,
      CORE_LAYOUT_BLOCK_TYPES.columns,
    ]);
    for (const definition of definitions) {
      expect(compileStudioPropertySchema(definition.propertySchema)).toBeDefined();
      expect(definition.slots[0]?.accepts.types).toContain('org.example/content');
      expect(definition.rendererRequirements).toEqual([
        { capability: 'org.example/layout', surface: 'web', versions: '^2.0.0' },
      ]);
      expect(JSON.stringify(definition)).not.toMatch(/(?:css|className|<style|px)/iu);
    }
  });

  it('validates a nested section, grid, and stack composition', () => {
    const definitions = createCoreLayoutBlockDefinitions();
    const outcome = validateBlueprint(responsivePage(), new BlockRegistry(definitions));
    expect(outcome).toEqual({ diagnostics: [], valid: true });
  });

  it.each([theme('themes/aurora'), theme('themes/ledger')])(
    'resolves four-to-two-to-one reflow without theme-specific markup for $id',
    (activeTheme) => {
      const grid = responsivePage().roots[0]?.slots.content?.[0];
      if (grid === undefined) {
        throw new Error('Fixture requires a grid node.');
      }
      expect(
        viewports.map((viewport) => resolveCoreLayoutIntent(grid, viewport, activeTheme).columns),
      ).toEqual([
        { source: 'base', value: 1 },
        { source: 'viewport', value: 2, viewport: 'medium' },
        { source: 'viewport', value: 4, viewport: 'expanded' },
      ]);
    },
  );

  it('inherits bounded tokens from base and fails closed when a theme omits one', () => {
    const grid = responsivePage().roots[0]?.slots.content?.[0];
    if (grid === undefined) {
      throw new Error('Fixture requires a grid node.');
    }
    grid.responsive = {
      ...grid.responsive,
      visibility: { medium: 'hidden' },
    };
    const activeTheme = theme('themes/aurora');
    expect(resolveCoreLayoutIntent(grid, viewport('compact'), activeTheme).visibility).toEqual({
      source: 'base',
      value: 'visible',
    });
    expect(resolveCoreLayoutIntent(grid, viewport('medium'), activeTheme).visibility).toEqual({
      source: 'viewport',
      value: 'hidden',
      viewport: 'medium',
    });

    activeTheme.designControls = activeTheme.designControls.filter(
      (control) => control.id !== CORE_LAYOUT_THEME_CONTROLS.visibility,
    );
    expect(() => resolveCoreLayoutIntent(grid, viewport('compact'), activeTheme)).toThrow(
      expect.objectContaining({ code: 'theme-control-missing' }) as CoreLayoutError,
    );
  });

  it('derives one revision per option set, independent of child-type order and layout repetition', () => {
    const first = createCoreLayoutBlockDefinitions({
      acceptedChildTypes: ['org.example/b', 'org.example/a'],
    });
    const second = createCoreLayoutBlockDefinitions({
      acceptedChildTypes: ['org.example/a', 'org.example/b'],
    });
    const third = createCoreLayoutBlockDefinitions({
      acceptedChildTypes: ['org.example/a', CORE_LAYOUT_BLOCK_TYPES.stack, 'org.example/b'],
    });

    expect(bytesOf(second)).toEqual(bytesOf(first));
    expect(bytesOf(third)).toEqual(bytesOf(first));
    const revisions = first.map((definition) => definition.revision);
    for (const revision of revisions) {
      expect(revision).toMatch(/^layout-(?:section|stack|grid|columns)-h[0-9a-f]{16}$/u);
    }
    expect(new Set(revisions.map((revision) => revision.slice(-16)))).toHaveLength(1);
  });

  it('changes the revision when the host types or renderer requirements change', () => {
    const web = { capability: 'org.example/layout', surface: 'web', versions: '^1.0.0' } as const;
    const preview = { ...web, surface: 'preview' } as const;
    const hexOf = (definitions: BlockDefinition[]): string =>
      definitions[0]?.revision.slice(-16) ?? '';
    const base = hexOf(
      createCoreLayoutBlockDefinitions({
        acceptedChildTypes: ['org.example/a'],
        rendererRequirements: [preview, web],
      }),
    );
    const variants = [
      hexOf(
        createCoreLayoutBlockDefinitions({
          acceptedChildTypes: ['org.example/a', 'org.example/b'],
          rendererRequirements: [preview, web],
        }),
      ),
      hexOf(
        createCoreLayoutBlockDefinitions({
          acceptedChildTypes: ['org.example/a'],
          rendererRequirements: [preview, { ...web, versions: '^2.0.0' }],
        }),
      ),
      hexOf(
        createCoreLayoutBlockDefinitions({
          acceptedChildTypes: ['org.example/a'],
          rendererRequirements: [web, preview],
        }),
      ),
    ];
    expect(new Set([base, ...variants])).toHaveLength(4);
  });

  it('pins the bare factory bytes and revision as a golden vector', () => {
    // The revision follows the built bytes (ADR 0038 decision 5), so a change to the family's
    // base bytes changes these values; the golden makes that visible in review.
    const definitions = createCoreLayoutBlockDefinitions();
    expect(definitions.map((definition) => definition.revision)).toEqual([
      'layout-section-hdcc4a88dfebb2281',
      'layout-stack-hdcc4a88dfebb2281',
      'layout-grid-hdcc4a88dfebb2281',
      'layout-columns-hdcc4a88dfebb2281',
    ]);
    expect(`sha256-${createHash('sha256').update(bytesOf(definitions)).digest('base64')}`).toBe(
      'sha256-ZfQUdr7StjshOssBLFeha3BreOyaJQRe7N5tZ12AJFo=',
    );
    expect(
      createCoreLayoutBlockDefinitions({ acceptedChildTypes: ['org.example.catalog/price'] })[0]
        ?.revision,
    ).toBe('layout-section-h128d49a2ce8a70cd');
  });

  it('derives the revision from the built family bytes with the revision left out', () => {
    const definitions = createCoreLayoutBlockDefinitions({
      acceptedChildTypes: ['org.example.catalog/price'],
      rendererRequirements: [
        { capability: 'org.example/layout', surface: 'web', versions: '^1.0.0' },
      ],
    });
    const unrevised = definitions.map((definition) => {
      const bytes: Partial<BlockDefinition> = { ...definition };
      delete bytes.revision;
      return bytes;
    });
    const digest = fnv1a64Hex(
      canonicalUtf8Bytes(unrevised as unknown as Parameters<typeof canonicalUtf8Bytes>[0]),
    );
    expect(definitions.map((definition) => definition.revision)).toEqual(
      ['section', 'stack', 'grid', 'columns'].map((name) => `layout-${name}-h${digest}`),
    );
  });

  it('never yields the production layout-<name>-r1 revisions from the factory', () => {
    const production = new Set(
      createCoreProductionBlockDefinitions()
        .slice(0, 4)
        .map((definition) => definition.revision),
    );
    const semanticWeb = [
      { capability: 'studio.renderer/semantic-web', surface: 'preview', versions: '^1.0.0' },
      { capability: 'studio.renderer/semantic-web', surface: 'web', versions: '^1.0.0' },
    ] as const;
    const optionSets: CoreLayoutBlockDefinitionOptions[] = [
      {},
      { acceptedChildTypes: ['org.example/content'] },
      { rendererRequirements: semanticWeb },
      {
        acceptedChildTypes: Object.values(CORE_LAYOUT_BLOCK_TYPES),
        rendererRequirements: semanticWeb,
      },
    ];
    for (const options of optionSets) {
      for (const definition of createCoreLayoutBlockDefinitions(options)) {
        expect(definition.revision).not.toMatch(/-r1$/u);
        expect(production.has(definition.revision)).toBe(false);
      }
    }
  });

  it.each<{ label: string; message: string; types: BlockType[] }>([
    {
      label: 'more than 64 host child types',
      types: Array.from({ length: 65 }, (_, index): BlockType => `org.example/block-${index}`),
      message: 'A core layout family lists at most 64 child types, layout types included.',
    },
    {
      label: '64 host child types plus a layout type',
      types: [
        CORE_LAYOUT_BLOCK_TYPES.section,
        ...Array.from({ length: 64 }, (_, index): BlockType => `org.example/block-${index}`),
      ],
      message: 'A core layout family lists at most 64 child types, layout types included.',
    },
    {
      label: 'a repeated host child type',
      types: ['org.example/a', 'org.example/a'],
      message: 'Core layout child type org.example/a is listed more than once.',
    },
    {
      label: 'a repeated layout type',
      types: [CORE_LAYOUT_BLOCK_TYPES.grid, CORE_LAYOUT_BLOCK_TYPES.grid],
      message: 'Core layout child type studio.core/grid is listed more than once.',
    },
    {
      label: 'a reserved first-party content type',
      types: ['studio.core/heading'],
      message: 'Core layout slots cannot admit the reserved Studio type studio.core/heading.',
    },
    {
      label: 'any other reserved Studio namespace',
      types: ['studio.example/anything'],
      message: 'Core layout slots cannot admit the reserved Studio type studio.example/anything.',
    },
  ])('rejects $label', ({ types, message }) => {
    expect(() => createCoreLayoutBlockDefinitions({ acceptedChildTypes: types })).toThrow(
      new RangeError(message),
    );
  });

  it('admits exactly 64 host child types', () => {
    const types = Array.from({ length: 64 }, (_, index): BlockType => `org.example/block-${index}`);
    const [section] = createCoreLayoutBlockDefinitions({ acceptedChildTypes: types });
    expect(section?.slots[0]?.accepts.types).toHaveLength(68);
  });

  it('keeps the empty renderer requirement refusal', () => {
    expect(() => createCoreLayoutBlockDefinitions({ rendererRequirements: [] })).toThrow(
      new RangeError('Core layout blocks require at least one trusted renderer capability.'),
    );
  });

  it('admits a host block inside a section and validates with zero slot diagnostics', () => {
    const layouts = createCoreLayoutBlockDefinitions({
      acceptedChildTypes: ['org.example/content'],
    });
    const [template] = layouts;
    if (template === undefined) {
      throw new Error('The factory returns the section first.');
    }
    const content: BlockDefinition = {
      ...structuredClone(template),
      label: { defaultMessage: 'Content', key: 'org.example/content' },
      owner: { id: 'org.example/blocks', version: '1.0.0' },
      propertyControls: [],
      propertySchema: { additionalProperties: false, properties: {}, type: 'object' },
      revision: 'content-r1',
      slots: [],
      themeControls: [],
      type: 'org.example/content',
    };
    const page = (definitions: BlockDefinition[]): BlueprintDocument => {
      const document = responsivePage();
      document.dependencyLock.blocks = definitions.map((definition) => ({
        revision: definition.revision,
        type: definition.type,
        version: definition.version,
      }));
      document.roots = [
        layoutNode('section-1', CORE_LAYOUT_BLOCK_TYPES.section, [
          {
            authoring: { mode: 'structural' },
            bindings: {},
            id: 'content-1',
            properties: {},
            slots: {},
            type: 'org.example/content',
            version: '1.0.0',
          },
        ]),
      ];
      return document;
    };
    const extended = [...layouts, content];
    expect(validateBlueprint(page(extended), new BlockRegistry(extended))).toEqual({
      diagnostics: [],
      valid: true,
    });

    const bare = [...createCoreLayoutBlockDefinitions(), content];
    expect(
      validateBlueprint(page(bare), new BlockRegistry(bare)).diagnostics.map(
        (diagnostic) => diagnostic.code,
      ),
    ).toEqual(['studio.validation/slot-rejects-type']);
  });
});
