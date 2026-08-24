import { describe, expect, it } from 'vitest';
import {
  STUDIO_CONTRACT_VERSION,
  type BlueprintDocument,
  type BlueprintNode,
  type ThemeDesignControl,
  type ThemeDocument,
  type ThemeViewport,
} from '@kumwe/studio-protocol';
import {
  BlockRegistry,
  CORE_LAYOUT_BLOCK_TYPES,
  CORE_LAYOUT_THEME_CONTROLS,
  compileStudioPropertySchema,
  coreLayoutInitialProperties,
  createCoreLayoutBlockDefinitions,
  resolveCoreLayoutIntent,
  validateBlueprint,
} from '../src/index.js';
import type { CoreLayoutError } from '../src/index.js';

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
});
