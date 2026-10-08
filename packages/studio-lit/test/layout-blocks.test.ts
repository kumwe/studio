import { describe, expect, it } from 'vitest';
import {
  CORE_LAYOUT_BLOCK_TYPES,
  CORE_LAYOUT_THEME_CONTROLS,
  CORE_PRODUCTION_BLOCK_TYPES,
  RECIPE_MARKER_PROPERTY,
  coreLayoutInitialProperties,
  createCoreLayoutBlockDefinitions,
  createCoreProductionBlockDefinitions,
  isCoreLayoutBlockType,
} from '@kumwe/studio-core';
import {
  STUDIO_CONTRACT_VERSION,
  type BlockDefinition,
  type BlockType,
  type BlueprintCommand,
  type BlueprintNode,
  type ThemeDesignControl,
  type ThemeDocument,
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
  type StudioInsertRequestDetail,
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

function liveRegionText(element: KumweStudioElement): string {
  return element.shadowRoot?.querySelector('[aria-live="polite"]')?.textContent ?? '';
}

/** Two update rounds: the render, then the focus placement queued behind it. */
async function settle(element: KumweStudioElement): Promise<void> {
  await element.updateComplete;
  await element.updateComplete;
}

function columnsCards(element: KumweStudioElement): HTMLButtonElement[] {
  return [
    ...(element.shadowRoot?.querySelectorAll<HTMLButtonElement>(
      'aside.library ul.palette button.palette-columns',
    ) ?? []),
  ];
}

function columnsCard(element: KumweStudioElement, count: number): HTMLButtonElement {
  const card = element.shadowRoot?.querySelector<HTMLButtonElement>(
    `ul.palette button.palette-columns[data-columns="${String(count)}"]`,
  );
  if (card === null || card === undefined) {
    throw new Error(`Missing the ${String(count)} columns card.`);
  }
  return card;
}

/** A card's visible name without its decorative, hidden symbol. */
function cardLabel(button: HTMLButtonElement): string {
  expect(button.querySelector('.block-symbol')?.getAttribute('aria-hidden')).toBe('true');
  const copy = button.cloneNode(true) as HTMLButtonElement;
  copy.querySelector('.block-symbol')?.remove();
  return (copy.textContent ?? '').trim();
}

function outlineTexts(element: KumweStudioElement): string[] {
  return [
    ...(element.shadowRoot?.querySelectorAll<HTMLButtonElement>('button.outline-entry') ?? []),
  ].map((entry) => (entry.textContent ?? '').trim());
}

function outlineEntry(element: KumweStudioElement, nodeId: string): HTMLButtonElement {
  const entry = element.shadowRoot?.querySelector<HTMLButtonElement>(
    `button.outline-entry[data-node-id="${nodeId}"]`,
  );
  if (entry === null || entry === undefined) {
    throw new Error(`Missing outline entry ${nodeId}`);
  }
  return entry;
}

function libraryDestination(element: KumweStudioElement): string | null {
  const line = element.shadowRoot?.querySelector('p.library-destination#library-destination');
  return line === null || line === undefined ? null : (line.textContent ?? '').trim();
}

function insertedNodeTypes(command: BlueprintCommand | undefined): string[] {
  if (command?.type !== 'studio.command/batch') {
    return [];
  }
  return command.payload.operations.map((operation) =>
    operation.type === 'studio.command/insert-node' ? operation.payload.node.type : operation.type,
  );
}

function stackChild(id: string): BlueprintNode {
  return {
    authoring: { mode: 'structural' },
    bindings: {},
    id,
    properties: { direction: 'block' },
    slots: { items: [] },
    type: CORE_LAYOUT_BLOCK_TYPES.stack,
    version: '1.0.0',
  };
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

/** SR-037: adding N columns is one batch reachable without dragging. */
describe('columns as one batch', () => {
  it('creates N columns as one batch of existing types that undoes in one step', async () => {
    const element = await mount([]);
    const commands = observedCommands(element);
    expect(element.shadowRoot?.querySelector('.workspace')?.getAttribute('data-library')).toBe(
      'open',
    );
    expect(columnsCards(element).map((card) => card.dataset.columns)).toEqual(['2', '3', '4']);
    expect(columnsCards(element).map(cardLabel)).toEqual(['2 columns', '3 columns', '4 columns']);
    expect(columnsCards(element).every((card) => !card.disabled)).toBe(true);

    columnsCard(element, 3).click();
    await settle(element);

    expect(commands).toHaveLength(1);
    expect(commands[0]?.type).toBe('studio.command/batch');
    expect(insertedNodeTypes(commands[0])).toEqual([
      CORE_LAYOUT_BLOCK_TYPES.columns,
      CORE_LAYOUT_BLOCK_TYPES.stack,
      CORE_LAYOUT_BLOCK_TYPES.stack,
      CORE_LAYOUT_BLOCK_TYPES.stack,
    ]);
    const inserted = element.document?.roots;
    expect(inserted).toStrictEqual([
      {
        authoring: { mode: 'structural' },
        bindings: {},
        id: 'columns-1',
        properties: { collapse: 'stack', columns: 3 },
        slots: { items: [stackChild('stack-1'), stackChild('stack-2'), stackChild('stack-3')] },
        type: CORE_LAYOUT_BLOCK_TYPES.columns,
        version: '1.0.0',
      },
    ]);
    expect(outlineTexts(element)).toEqual([
      'Columns',
      'Stack, column 1 of 3',
      'Stack, column 2 of 3',
      'Stack, column 3 of 3',
    ]);
    expect(outlineEntry(element, 'columns-1').getAttribute('aria-pressed')).toBe('true');
    expect(element.shadowRoot?.activeElement).toBe(outlineEntry(element, 'columns-1'));
    expect(liveRegionText(element)).toBe('Inserted 3 columns');
    // Every new column is an empty container the page offers explicitly.
    expect(
      [
        ...(element.shadowRoot?.querySelectorAll<HTMLButtonElement>(
          'div.canvas-add-zones > button.canvas-add-into',
        ) ?? []),
      ].map((button) => button.dataset.parentId),
    ).toEqual(['stack-1', 'stack-2', 'stack-3']);

    element.undo();
    await settle(element);
    expect(element.document?.roots).toEqual([]);
    element.redo();
    await settle(element);
    expect(element.document?.roots).toStrictEqual(inserted);
    expect(commands).toHaveLength(1);

    outlineEntry(element, 'stack-2').click();
    await element.updateComplete;
    expect(
      element.shadowRoot?.querySelector('.breadcrumb .breadcrumb-current')?.textContent?.trim(),
    ).toBe('Stack, column 2 of 3');
    element.remove();
  });

  it('dispatches the columns batch through the cancelable request with its operations', async () => {
    const element = await mount([]);
    const commands = observedCommands(element);
    const details: StudioInsertRequestDetail[] = [];
    element.addEventListener('studio-insert-request', (event: Event) => {
      details.push((event as CustomEvent<StudioInsertRequestDetail>).detail);
      event.preventDefault();
    });
    element.shadowRoot
      ?.querySelector<HTMLButtonElement>('div.outline-level-add > button.outline-add-page')
      ?.click();
    await settle(element);
    expect(libraryDestination(element)).toBe('Adding to document roots, position 1 of 1');
    const before = structuredClone(element.document);

    columnsCard(element, 2).click();
    await settle(element);

    expect(details).toHaveLength(1);
    expect(details[0]).toMatchObject({
      definition: expect.objectContaining({ type: CORE_LAYOUT_BLOCK_TYPES.columns }) as unknown,
      parentId: null,
      position: 0,
    });
    expect(details[0]).not.toHaveProperty('slot');
    const operations = details[0]?.operations ?? [];
    expect(operations).toHaveLength(3);
    expect(
      operations.map((operation) =>
        operation.type === 'studio.command/insert-node'
          ? [operation.payload.node.id, operation.payload.destination]
          : operation.type,
      ),
    ).toEqual([
      ['columns-1', { position: 0 }],
      ['stack-1', { parentNodeId: 'columns-1', position: 0, slot: 'items' }],
      ['stack-2', { parentNodeId: 'columns-1', position: 1, slot: 'items' }],
    ]);
    expect(element.document).toEqual(before);
    expect(commands).toEqual([]);
    expect(libraryDestination(element)).toBeNull();
    element.remove();
  });

  it('columns cards follow the pending destination and are hidden without both layout definitions', async () => {
    const element = await mount();
    await selectGrid(element);
    const into = element.shadowRoot?.querySelector<HTMLButtonElement>(
      '.outline-controls button.outline-add-into[data-slot="items"]',
    );
    if (into === null || into === undefined) throw new Error('Missing Add block into Items.');
    into.click();
    await settle(element);
    expect(libraryDestination(element)).toBe(
      'Adding to Grid (grid-1): Items slot, position 1 of 1',
    );

    columnsCard(element, 2).click();
    await settle(element);
    const grid = element.document?.roots[0];
    expect(element.document?.roots).toHaveLength(1);
    expect(grid?.slots.items?.map((child) => child.id)).toEqual(['columns-1']);
    expect(grid?.slots.items?.[0]?.properties).toEqual({ collapse: 'stack', columns: 2 });
    expect(grid?.slots.items?.[0]?.slots.items?.map((child) => child.id)).toEqual([
      'stack-1',
      'stack-2',
    ]);
    expect(liveRegionText(element)).toBe('Inserted 2 columns');
    expect(libraryDestination(element)).toBeNull();

    if (element.configuration === undefined) {
      throw new Error('Fixture requires a Studio configuration.');
    }
    element.configuration = {
      ...element.configuration,
      blockDefinitions: definitions.filter(
        (definition) => definition.type !== CORE_LAYOUT_BLOCK_TYPES.stack,
      ),
    };
    await settle(element);
    expect(columnsCards(element)).toEqual([]);
    expect(
      element.shadowRoot?.querySelector(
        `.palette-block[data-block-type="${CORE_LAYOUT_BLOCK_TYPES.columns}"]`,
      ),
    ).not.toBeNull();
    element.remove();
  });

  it('lists the columns cards after the Columns card and runs them from the command palette as one batch', async () => {
    const element = await mount();
    const commands = observedCommands(element);
    const cards = [
      ...(element.shadowRoot?.querySelectorAll<HTMLButtonElement>(
        'aside.library ul.palette button',
      ) ?? []),
    ];
    const columnsIndex = cards.findIndex(
      (card) => card.dataset.blockType === CORE_LAYOUT_BLOCK_TYPES.columns,
    );
    expect(
      cards.slice(columnsIndex + 1, columnsIndex + 4).map((card) => card.dataset.columns),
    ).toEqual(['2', '3', '4']);

    await selectGrid(element);
    element.shadowRoot
      ?.querySelector<HTMLButtonElement>(
        '.outline-controls button.outline-add-into[data-slot="items"]',
      )
      ?.click();
    await settle(element);
    expect(libraryDestination(element)).toBe(
      'Adding to Grid (grid-1): Items slot, position 1 of 1',
    );
    element.shadowRoot?.querySelector<HTMLButtonElement>('.command-palette-toggle')?.click();
    await element.updateComplete;
    const entries = [
      ...(element.shadowRoot?.querySelectorAll<HTMLButtonElement>('.command-entry') ?? []),
    ];
    const columnsEntries = entries.filter((entry) =>
      entry.dataset.commandId?.startsWith('insert-columns-'),
    );
    expect(columnsEntries.map((entry) => entry.dataset.commandId)).toEqual([
      'insert-columns-2',
      'insert-columns-3',
      'insert-columns-4',
    ]);
    expect(columnsEntries.map((entry) => (entry.textContent ?? '').trim())).toEqual([
      'Insert 2 columns',
      'Insert 3 columns',
      'Insert 4 columns',
    ]);
    expect(columnsEntries.every((entry) => !entry.disabled)).toBe(true);
    columnsEntries[1]?.click();
    await settle(element);

    expect(commands).toHaveLength(1);
    expect(insertedNodeTypes(commands[0])).toEqual([
      CORE_LAYOUT_BLOCK_TYPES.columns,
      CORE_LAYOUT_BLOCK_TYPES.stack,
      CORE_LAYOUT_BLOCK_TYPES.stack,
      CORE_LAYOUT_BLOCK_TYPES.stack,
    ]);
    const grid = element.document?.roots[0];
    expect(grid?.slots.items?.map((child) => child.id)).toEqual(['columns-1']);
    expect(grid?.slots.items?.[0]?.slots.items?.map((child) => child.id)).toEqual([
      'stack-1',
      'stack-2',
      'stack-3',
    ]);
    expect(liveRegionText(element)).toBe('Inserted 3 columns');
    expect(libraryDestination(element)).toBeNull();
    element.undo();
    await settle(element);
    expect(element.document?.roots[0]?.slots.items).toEqual([]);
    element.remove();
  });

  it('disables the columns cards in read-only sessions and inserts nothing', async () => {
    defineKumweStudio();
    const element = new KumweStudioElement();
    element.configuration = {
      blockDefinitions: definitions,
      session: createStudioConfigurationFixture({ sessionState: 'read-only' }),
    };
    element.document = createBlueprintFixture({ roots: [] });
    document.body.append(element);
    await element.updateComplete;
    const commands = observedCommands(element);
    expect(columnsCards(element)).toHaveLength(3);
    expect(columnsCards(element).every((card) => card.disabled)).toBe(true);
    columnsCard(element, 4).click();
    await settle(element);
    expect(element.document?.roots).toEqual([]);
    expect(commands).toEqual([]);
    element.remove();
  });
});

describe('insertion destinations in a host-extended layout family', () => {
  const hostType = 'org.example.catalog/price' as BlockType;
  const hostBlock = defineTestBlock({ label: 'Price', type: hostType });

  /** An empty layout container of `type`, its slot keys taken from its own definition. */
  function emptyContainer(definition: BlockDefinition): BlueprintNode {
    if (!isCoreLayoutBlockType(definition.type)) {
      throw new Error(`${definition.type} is not a core layout type.`);
    }
    return {
      authoring: { mode: 'structural' },
      bindings: {},
      id: 'container-1',
      properties: coreLayoutInitialProperties(definition.type),
      slots: Object.fromEntries(definition.slots.map((slot) => [slot.id, []])),
      type: definition.type,
      version: definition.version,
    };
  }

  async function mountFamily(
    family: BlockDefinition[],
    container: BlockDefinition,
  ): Promise<KumweStudioElement> {
    defineKumweStudio();
    const element = new KumweStudioElement();
    const blockDefinitions = [...family, hostBlock];
    element.configuration = {
      blockDefinitions,
      session: createStudioConfigurationFixture(),
    };
    element.document = createBlueprintFixture({
      blockLocks: blockDefinitions.map((definition) => ({
        revision: definition.revision,
        type: definition.type,
        version: definition.version,
      })),
      roots: [emptyContainer(container)],
    });
    document.body.append(element);
    await element.updateComplete;
    return element;
  }

  function hostCard(element: KumweStudioElement): HTMLButtonElement {
    const card = element.shadowRoot?.querySelector<HTMLButtonElement>(
      `.palette-block[data-block-type="${hostType}"]`,
    );
    if (card === null || card === undefined) throw new Error('Missing the host block card.');
    return card;
  }

  async function openSlot(element: KumweStudioElement, slot: string): Promise<void> {
    outlineEntry(element, 'container-1').click();
    await settle(element);
    const into = element.shadowRoot?.querySelector<HTMLButtonElement>(
      `.outline-controls button.outline-add-into[data-slot="${slot}"]`,
    );
    if (into === null || into === undefined) throw new Error(`Missing Add block into ${slot}.`);
    expect(into.disabled).toBe(false);
    into.click();
    await settle(element);
  }

  it('offers and inserts the host types the target family admits inside every layout container', async () => {
    const extended = createCoreLayoutBlockDefinitions({ acceptedChildTypes: [hostType] });
    expect(extended.map((definition) => definition.type)).toEqual([
      CORE_LAYOUT_BLOCK_TYPES.section,
      CORE_LAYOUT_BLOCK_TYPES.stack,
      CORE_LAYOUT_BLOCK_TYPES.grid,
      CORE_LAYOUT_BLOCK_TYPES.columns,
    ]);
    for (const container of extended) {
      const slot = container.slots[0]?.id ?? '';
      const element = await mountFamily(extended, container);
      // The empty-container list offers the slot because the host type may go there.
      expect(
        element.shadowRoot?.querySelector(
          `button.canvas-add-into[data-parent-id="container-1"][data-slot="${slot}"]`,
        ),
      ).not.toBeNull();
      await openSlot(element, slot);
      expect(libraryDestination(element)).toMatch(
        /^Adding to .+ \(container-1\): .+ slot, position 1 of 1$/u,
      );
      expect(hostCard(element).disabled).toBe(false);
      hostCard(element).click();
      await settle(element);
      expect(element.document?.roots[0]?.slots[slot]?.map((child) => child.type)).toEqual([
        hostType,
      ]);
      expect(libraryDestination(element)).toBeNull();
      element.remove();
    }
  });

  it('refuses the host type in a layout slot when the family does not admit it', async () => {
    const family = createCoreLayoutBlockDefinitions();
    const section = family.find(
      (definition) => definition.type === CORE_LAYOUT_BLOCK_TYPES.section,
    );
    if (section === undefined) throw new Error('The layout family has a section.');
    const slot = section.slots[0]?.id ?? '';
    const element = await mountFamily(family, section);
    await openSlot(element, slot);
    expect(libraryDestination(element)).toMatch(/position 1 of 1$/u);
    expect(hostCard(element).disabled).toBe(true);
    element.remove();
  });
});
