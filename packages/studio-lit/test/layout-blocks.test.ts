import { describe, expect, it } from 'vitest';
import {
  CORE_LAYOUT_BLOCK_TYPES,
  CORE_LAYOUT_THEME_CONTROLS,
  CORE_PRODUCTION_BLOCK_TYPES,
  RECIPE_MARKER_PROPERTY,
  createCoreLayoutBlockDefinitions,
  createCoreProductionBlockDefinitions,
} from '@kumwe/studio-core';
import {
  STUDIO_CONTRACT_VERSION,
  type BlueprintCommand,
  type BlueprintNode,
  type ThemeDesignControl,
  type ThemeDocument,
} from '@kumwe/studio-protocol';
import { createBlueprintFixture, createStudioConfigurationFixture } from '@kumwe/studio-testkit';
import {
  defineKumweStudio,
  KumweStudioElement,
  type StudioDocumentChangeDetail,
} from '../src/index.js';

const definitions = createCoreLayoutBlockDefinitions();

function controls(): ThemeDesignControl[] {
  const control = (
    id: string,
    kind: ThemeDesignControl['kind'],
    values: readonly string[],
  ): ThemeDesignControl => ({
    choices: values.map((value) => ({
      id: value,
      label: { defaultMessage: value, key: `studio.test/${id}-${value}` },
    })),
    id,
    kind,
    label: { defaultMessage: id, key: `studio.test/${id}` },
  });
  return [
    control(CORE_LAYOUT_THEME_CONTROLS.alignment, 'enum', ['center', 'end', 'start', 'stretch']),
    control(CORE_LAYOUT_THEME_CONTROLS.spacing, 'spacing-role', [
      'comfortable',
      'compact',
      'none',
      'spacious',
    ]),
    control(CORE_LAYOUT_THEME_CONTROLS.visibility, 'enum', ['hidden', 'visible']),
    control(CORE_LAYOUT_THEME_CONTROLS.direction, 'enum', ['block', 'inline']),
    control(CORE_LAYOUT_THEME_CONTROLS.collapse, 'enum', ['preserve', 'stack', 'wrap']),
  ];
}

function theme(): ThemeDocument {
  return {
    blockSupport: definitions.map((definition) => ({
      renderer: 'studio.renderer/layout',
      type: definition.type,
      versions: '^1.0.0',
    })),
    contractVersion: STUDIO_CONTRACT_VERSION,
    designControls: controls(),
    id: 'studio.test/layout-theme',
    kind: 'theme',
    label: { defaultMessage: 'Layout theme', key: 'studio.test/layout-theme' },
    owner: { id: 'studio.test/theme-owner', version: '1.0.0' },
    recipes: [
      {
        blockType: CORE_LAYOUT_BLOCK_TYPES.grid,
        designValues: { alignment: 'center', collapse: 'wrap', spacing: 'spacious' },
        id: 'editorial-grid',
        label: { defaultMessage: 'Editorial grid', key: 'studio.test/editorial-grid' },
      },
    ],
    renderers: [
      {
        exactPreview: true,
        id: 'studio.renderer/layout',
        surfaces: ['preview', 'web'],
        version: '1.0.0',
      },
    ],
    revision: 'theme-r1',
    version: '1.0.0',
    viewports: [
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
    ],
  };
}

function gridNode(): BlueprintNode {
  return {
    authoring: { mode: 'structural' },
    bindings: {},
    id: 'grid-1',
    properties: {
      alignment: 'stretch',
      collapse: 'stack',
      columns: 1,
      spacing: 'comfortable',
      visibility: 'visible',
    },
    responsive: { columns: { medium: 2 } },
    slots: { items: [] },
    type: CORE_LAYOUT_BLOCK_TYPES.grid,
    version: '1.0.0',
  };
}

async function mount(roots: BlueprintNode[] = [gridNode()]): Promise<KumweStudioElement> {
  defineKumweStudio();
  const element = new KumweStudioElement();
  element.configuration = {
    blockDefinitions: definitions,
    session: createStudioConfigurationFixture(),
  };
  element.document = createBlueprintFixture({
    blockLocks: definitions.map((definition) => ({
      revision: definition.revision,
      type: definition.type,
      version: definition.version,
    })),
    roots,
  });
  element.theme = theme();
  document.body.append(element);
  await element.updateComplete;
  return element;
}

async function selectGrid(element: KumweStudioElement): Promise<void> {
  element.shadowRoot
    ?.querySelector<HTMLButtonElement>('.outline-entry[data-node-id="grid-1"]')
    ?.click();
  await element.updateComplete;
}

function observedCommands(element: KumweStudioElement): BlueprintCommand[] {
  const commands: BlueprintCommand[] = [];
  element.addEventListener('studio-document-change', (event: Event) => {
    const command = (event as CustomEvent<StudioDocumentChangeDetail>).detail.command;
    if (command !== null) {
      commands.push(command);
    }
  });
  return commands;
}

describe('layout authoring controls', () => {
  it('edits bounded theme tokens with explicit breakpoint inheritance', async () => {
    const element = await mount();
    await selectGrid(element);
    const design = element.shadowRoot?.querySelector('.inspector-design');
    expect(design).not.toBeNull();
    const visibility = design?.querySelector<HTMLSelectElement>('[data-property="visibility"]');
    expect(visibility?.value).toBe('visible');

    element.shadowRoot
      ?.querySelector<HTMLButtonElement>('.viewport-switcher [data-viewport-id="medium"]')
      ?.click();
    await element.updateComplete;
    const mediumVisibility = element.shadowRoot?.querySelector<HTMLSelectElement>(
      '.inspector-design [data-property="visibility"]',
    );
    expect(mediumVisibility?.value).toBe('visible');
    if (mediumVisibility === null || mediumVisibility === undefined) {
      throw new Error('Missing medium viewport visibility control.');
    }
    mediumVisibility.value = 'hidden';
    mediumVisibility.dispatchEvent(new Event('change', { bubbles: true }));
    await element.updateComplete;

    expect(element.document?.roots[0]?.responsive?.visibility).toEqual({ medium: 'hidden' });
    expect(
      element.shadowRoot?.querySelector(
        '.inspector-design [data-property="visibility"] + .inspector-design-unset',
      ),
    ).not.toBeNull();
    element.remove();
  });

  it('applies a theme recipe as one atomic canonical batch', async () => {
    const element = await mount();
    const commands = observedCommands(element);
    await selectGrid(element);
    const selector = element.shadowRoot?.querySelector<HTMLSelectElement>(
      '.inspector-recipe-select',
    );
    if (selector === null || selector === undefined) {
      throw new Error('Missing recipe selector.');
    }
    selector.value = 'editorial-grid';
    selector.dispatchEvent(new Event('change', { bubbles: true }));
    await element.updateComplete;

    expect(commands).toHaveLength(1);
    expect(commands[0]?.type).toBe('studio.command/batch');
    expect(element.document?.roots[0]?.properties).toMatchObject({
      [RECIPE_MARKER_PROPERTY]: 'editorial-grid',
      alignment: 'center',
      collapse: 'wrap',
      spacing: 'spacious',
    });
    element.remove();
  });

  it('inserts canonical layout nodes with structural policy and bounded defaults', async () => {
    const element = await mount([]);
    element.shadowRoot?.querySelector<HTMLButtonElement>('.command-palette-toggle')?.click();
    await element.updateComplete;
    const insert = [
      ...(element.shadowRoot?.querySelectorAll<HTMLButtonElement>('.command-entry') ?? []),
    ].find((button) => button.textContent?.includes('Insert Grid'));
    if (insert === undefined) {
      throw new Error('Missing Insert Grid command.');
    }
    insert.click();
    await element.updateComplete;

    expect(element.document?.roots[0]).toMatchObject({
      authoring: { mode: 'structural' },
      properties: { collapse: 'stack', columns: 1 },
      slots: { items: [] },
      type: CORE_LAYOUT_BLOCK_TYPES.grid,
    });
    element.remove();
  });

  it('inserts every first-party content block with its schema-valid production defaults', async () => {
    const element = await mount([]);
    const productionDefinitions = createCoreProductionBlockDefinitions();
    if (element.configuration === undefined) {
      throw new Error('Fixture requires a Studio configuration.');
    }
    element.configuration = {
      ...element.configuration,
      blockDefinitions: productionDefinitions,
    };
    await element.updateComplete;
    element.shadowRoot?.querySelector<HTMLButtonElement>('.command-palette-toggle')?.click();
    await element.updateComplete;
    const insert = [
      ...(element.shadowRoot?.querySelectorAll<HTMLButtonElement>('.command-entry') ?? []),
    ].find((button) => button.textContent?.includes('Insert Heading'));
    if (insert === undefined) {
      throw new Error('Missing Insert Heading command.');
    }
    insert.click();
    await element.updateComplete;

    expect(element.document?.roots[0]).toMatchObject({
      authoring: { mode: 'content' },
      properties: { level: 2 },
      slots: {},
      type: CORE_PRODUCTION_BLOCK_TYPES.heading,
    });
    element.remove();
  });
});
