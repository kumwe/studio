import { describe, expect, it } from 'vitest';
import type {
  BlockType,
  BlueprintCommand,
  BlueprintDocument,
  BlueprintNode,
  ThemeDesignControl,
  ThemeViewport,
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

function blueprintNode(id: string, type: string, children: BlueprintNode[] = []): BlueprintNode {
  return {
    authoring: { mode: 'content' },
    bindings: {},
    id,
    properties: {},
    slots: children.length === 0 ? {} : { content: children },
    type: type as BlockType,
    version: '1.0.0',
  };
}

function layoutRoots(): BlueprintNode[] {
  return [
    {
      authoring: { mode: 'content' },
      bindings: {},
      id: 'text-1',
      properties: { align: 'start', size: 2 },
      responsive: { size: { narrow: 1 } },
      responsiveSizeRoles: { inline: { narrow: 'full' } },
      sizeRoles: { block: 'hero', inline: 'half' },
      slots: {},
      type: 'studio.core/text',
      version: '1.0.0',
    },
    blueprintNode('text-2', 'studio.core/text'),
  ];
}

function themeViewports(): ThemeViewport[] {
  return [
    {
      base: true,
      id: 'medium',
      label: { defaultMessage: 'Medium', key: 'studio.test/viewport-medium' },
      order: 1,
      previewWidth: 768,
    },
    {
      base: false,
      id: 'narrow',
      label: { defaultMessage: 'Narrow', key: 'studio.test/viewport-narrow' },
      order: 2,
      previewWidth: 360,
    },
  ];
}

/**
 * The theme's design controls as the host feeds them from the theme
 * document: two `size-role` controls supplying the role vocabulary and one
 * control of another kind that must never leak into it.
 */
function themeDesignControls(): ThemeDesignControl[] {
  return [
    {
      choices: [
        { id: 'full', label: { defaultMessage: 'Full width', key: 'studio.test/role-full' } },
        { id: 'half', label: { defaultMessage: 'Half width', key: 'studio.test/role-half' } },
      ],
      id: 'column-width',
      kind: 'size-role',
      label: { defaultMessage: 'Column width', key: 'studio.test/control-column-width' },
    },
    {
      choices: [
        { id: 'hero', label: { defaultMessage: 'Hero band', key: 'studio.test/role-hero' } },
      ],
      id: 'band-height',
      kind: 'size-role',
      label: { defaultMessage: 'Band height', key: 'studio.test/control-band-height' },
    },
    {
      choices: [
        { id: 'accent', label: { defaultMessage: 'Accent', key: 'studio.test/role-accent' } },
      ],
      id: 'tone',
      kind: 'color-role',
      label: { defaultMessage: 'Tone', key: 'studio.test/control-tone' },
    },
  ];
}

interface MountOptions {
  designControls?: ThemeDesignControl[];
  roots?: BlueprintNode[];
  sessionState?: 'editable' | 'read-only';
  viewports?: ThemeViewport[];
}

async function mountShell(options: MountOptions = {}): Promise<KumweStudioElement> {
  defineKumweStudio();
  const element = new KumweStudioElement();
  element.configuration = {
    blockDefinitions: [
      defineTestBlock({
        label: 'Section',
        slots: [
          {
            accepts: { types: ['studio.core/text'] },
            id: 'content',
            label: { defaultMessage: 'Content', key: 'studio.test/slot-content' },
            maximum: 100,
            minimum: 0,
            ordered: true,
          },
        ],
        type: 'studio.core/section',
      }),
      defineTestBlock({ label: 'Text', type: 'studio.core/text' }),
    ],
    session: createStudioConfigurationFixture(
      options.sessionState === undefined ? {} : { sessionState: options.sessionState },
    ),
  };
  element.document = createBlueprintFixture({ roots: options.roots ?? layoutRoots() });
  if (options.viewports !== undefined) {
    element.viewports = options.viewports;
  }
  if (options.designControls !== undefined) {
    element.designControls = options.designControls;
  }
  document.body.append(element);
  await element.updateComplete;
  return element;
}

function inspectorRegion(element: KumweStudioElement): HTMLElement {
  const region = element.shadowRoot?.querySelector<HTMLElement>('aside.inspector');
  if (region === null || region === undefined) {
    throw new Error('Missing inspector region');
  }
  return region;
}

function layoutSection(element: KumweStudioElement): HTMLElement {
  const section = inspectorRegion(element).querySelector<HTMLElement>('section.inspector-layout');
  if (section === null) {
    throw new Error('Missing layout section');
  }
  return section;
}

function roleSelect(element: KumweStudioElement, axis: string): HTMLSelectElement {
  const select = layoutSection(element).querySelector<HTMLSelectElement>(
    `select.layout-role-select[data-axis="${axis}"]`,
  );
  if (select === null) {
    throw new Error(`Missing role select for the ${axis} axis`);
  }
  return select;
}

function roleInput(element: KumweStudioElement, axis: string): HTMLInputElement {
  const input = layoutSection(element).querySelector<HTMLInputElement>(
    `input.layout-role-input[data-axis="${axis}"]`,
  );
  if (input === null) {
    throw new Error(`Missing role input for the ${axis} axis`);
  }
  return input;
}

function roleUnsetButton(element: KumweStudioElement, axis: string): HTMLButtonElement {
  const button = layoutSection(element).querySelector<HTMLButtonElement>(
    `button.layout-role-unset[data-axis="${axis}"]`,
  );
  if (button === null) {
    throw new Error(`Missing role remove button for the ${axis} axis`);
  }
  return button;
}

function stateText(element: KumweStudioElement, selector: string): string {
  return (
    layoutSection(element).querySelector(selector)?.textContent?.replaceAll(/\s+/gu, ' ').trim() ??
    ''
  );
}

function outlineEntry(element: KumweStudioElement, nodeId: string): HTMLButtonElement {
  const entries =
    element.shadowRoot?.querySelectorAll<HTMLButtonElement>('button.outline-entry') ?? [];
  const entry = [...entries].find((candidate) => candidate.dataset.nodeId === nodeId);
  if (entry === undefined) {
    throw new Error(`Missing outline entry for ${nodeId}`);
  }
  return entry;
}

async function selectNode(element: KumweStudioElement, nodeId: string): Promise<void> {
  outlineEntry(element, nodeId).click();
  await element.updateComplete;
}

function viewportButton(element: KumweStudioElement, id: string): HTMLButtonElement {
  const buttons =
    element.shadowRoot?.querySelectorAll<HTMLButtonElement>('.viewport-switcher button') ?? [];
  const button = [...buttons].find((candidate) => candidate.dataset.viewportId === id);
  if (button === undefined) {
    throw new Error(`Missing viewport button ${id}`);
  }
  return button;
}

async function activateViewport(element: KumweStudioElement, id: string): Promise<void> {
  viewportButton(element, id).click();
  await element.updateComplete;
}

function liveRegionText(element: KumweStudioElement): string {
  return element.shadowRoot?.querySelector('[aria-live="polite"]')?.textContent ?? '';
}

function keydown(init: KeyboardEventInit): KeyboardEvent {
  return new KeyboardEvent('keydown', { bubbles: true, cancelable: true, composed: true, ...init });
}

function observeCommands(element: KumweStudioElement): (BlueprintCommand | null)[] {
  const commands: (BlueprintCommand | null)[] = [];
  element.addEventListener('studio-document-change', (event: Event) => {
    commands.push((event as CustomEvent<StudioDocumentChangeDetail>).detail.command);
  });
  return commands;
}

function selectedNode(element: KumweStudioElement, nodeId = 'text-1'): BlueprintNode {
  const node = element.document?.roots.find((root) => root.id === nodeId);
  if (node === undefined) {
    throw new Error(`Missing node ${nodeId}`);
  }
  return node;
}

function documentSnapshot(element: KumweStudioElement): BlueprintDocument {
  return JSON.parse(JSON.stringify(element.document)) as BlueprintDocument;
}

async function chooseRole(element: KumweStudioElement, axis: string, role: string): Promise<void> {
  const select = roleSelect(element, axis);
  select.value = role;
  select.dispatchEvent(new Event('change', { bubbles: true }));
  await element.updateComplete;
}

describe('layout size-role editor', () => {
  it('populates the role controls from the theme size-role design controls only', async () => {
    const element = await mountShell({
      designControls: themeDesignControls(),
      viewports: themeViewports(),
    });
    await selectNode(element, 'text-1');

    for (const axis of ['inline', 'block']) {
      const options = [...roleSelect(element, axis).querySelectorAll('option')];
      expect(options.map((option) => option.value)).toEqual(['', 'full', 'half', 'hero']);
      expect(options.map((option) => option.textContent?.trim())).toEqual([
        'Choose a role',
        'Full width',
        'Half width',
        'Hero band',
      ]);
      expect(options[0]?.disabled).toBe(true);
    }
    // A declared vocabulary never falls back to a free-text role input.
    expect(layoutSection(element).querySelector('input.layout-role-input')).toBeNull();
    element.remove();
  });

  it('renders base and active-viewport inheritance provenance textually', async () => {
    const element = await mountShell({
      designControls: themeDesignControls(),
      viewports: themeViewports(),
    });
    await selectNode(element, 'text-1');

    // The switcher rests on the base viewport: base assignments only.
    expect(stateText(element, '.layout-base-state[data-axis="inline"]')).toBe('Base: half');
    expect(stateText(element, '.layout-base-state[data-axis="block"]')).toBe('Base: hero');
    expect(layoutSection(element).querySelector('.layout-viewport-state')).toBeNull();

    await activateViewport(element, 'narrow');
    expect(stateText(element, '.layout-viewport-state[data-axis="inline"]')).toBe(
      'Overridden for the Narrow viewport: full',
    );
    expect(stateText(element, '.layout-viewport-state[data-axis="block"]')).toBe(
      'Inherited from base: hero',
    );

    await selectNode(element, 'text-2');
    expect(stateText(element, '.layout-base-state[data-axis="inline"]')).toBe('Base: none');
    expect(stateText(element, '.layout-viewport-state[data-axis="inline"]')).toBe(
      'Inherited from base: none',
    );
    element.remove();
  });

  it('assigns a base role without a viewport while the switcher is on the base viewport', async () => {
    const element = await mountShell({
      designControls: themeDesignControls(),
      viewports: themeViewports(),
    });
    await selectNode(element, 'text-1');
    const commands = observeCommands(element);

    await chooseRole(element, 'block', 'full');

    expect(commands).toHaveLength(1);
    expect(commands[0]?.type).toBe('studio.command/set-size-role');
    expect(commands[0]?.payload).toEqual({ axis: 'block', nodeId: 'text-1', role: 'full' });
    expect(selectedNode(element).sizeRoles).toEqual({ block: 'full', inline: 'half' });
    expect(liveRegionText(element)).toContain('Set the Block size role to full');
    expect(stateText(element, '.layout-base-state[data-axis="block"]')).toBe('Base: full');
    element.remove();
  });

  it('assigns an override carrying the active non-base viewport', async () => {
    const element = await mountShell({
      designControls: themeDesignControls(),
      viewports: themeViewports(),
    });
    await activateViewport(element, 'narrow');
    await selectNode(element, 'text-1');
    const commands = observeCommands(element);

    await chooseRole(element, 'inline', 'half');

    expect(commands).toHaveLength(1);
    expect(commands[0]?.type).toBe('studio.command/set-size-role');
    expect(commands[0]?.payload).toEqual({
      axis: 'inline',
      nodeId: 'text-1',
      role: 'half',
      viewport: 'narrow',
    });
    expect(selectedNode(element).responsiveSizeRoles).toEqual({ inline: { narrow: 'half' } });
    // The base assignment is untouched by an override edit.
    expect(selectedNode(element).sizeRoles).toEqual({ block: 'hero', inline: 'half' });
    expect(liveRegionText(element)).toContain(
      'Set the Inline size role to half for the Narrow viewport',
    );
    element.remove();
  });

  it('removes the base assignment through unset-size-role without a viewport', async () => {
    const element = await mountShell({
      designControls: themeDesignControls(),
      viewports: themeViewports(),
    });
    await selectNode(element, 'text-1');
    const commands = observeCommands(element);

    roleUnsetButton(element, 'inline').click();
    await element.updateComplete;

    expect(commands).toHaveLength(1);
    expect(commands[0]?.type).toBe('studio.command/unset-size-role');
    expect(commands[0]?.payload).toEqual({ axis: 'inline', nodeId: 'text-1' });
    expect(selectedNode(element).sizeRoles).toEqual({ block: 'hero' });
    expect(liveRegionText(element)).toContain('Removed the Inline size role');
    element.remove();
  });

  it('removes a viewport override through unset-size-role with the viewport', async () => {
    const element = await mountShell({
      designControls: themeDesignControls(),
      viewports: themeViewports(),
    });
    await activateViewport(element, 'narrow');
    await selectNode(element, 'text-1');
    const commands = observeCommands(element);

    // The block axis has no narrow override, so its remove control is inert.
    expect(roleUnsetButton(element, 'block').disabled).toBe(true);

    roleUnsetButton(element, 'inline').click();
    await element.updateComplete;

    expect(commands).toHaveLength(1);
    expect(commands[0]?.type).toBe('studio.command/unset-size-role');
    expect(commands[0]?.payload).toEqual({ axis: 'inline', nodeId: 'text-1', viewport: 'narrow' });
    expect(selectedNode(element).responsiveSizeRoles).toBeUndefined();
    expect(liveRegionText(element)).toContain(
      'Removed the Inline size role for the Narrow viewport',
    );
    element.remove();
  });

  it('dispatches nothing when the committed role is chosen again', async () => {
    const element = await mountShell({
      designControls: themeDesignControls(),
      viewports: themeViewports(),
    });
    await selectNode(element, 'text-1');
    const commands = observeCommands(element);
    const before = documentSnapshot(element);

    await chooseRole(element, 'inline', 'half');

    expect(commands).toHaveLength(0);
    expect(element.document).toEqual(before);
    element.remove();
  });

  it('states an empty theme vocabulary textually and offers no role controls', async () => {
    const element = await mountShell({
      designControls: themeDesignControls().filter((control) => control.kind !== 'size-role'),
      viewports: themeViewports(),
    });
    await selectNode(element, 'text-1');

    expect(layoutSection(element).textContent).toContain(
      'The active theme declares no size roles, so none can be assigned.',
    );
    expect(layoutSection(element).querySelector('select.layout-role-select')).toBeNull();
    expect(layoutSection(element).querySelector('input.layout-role-input')).toBeNull();
    expect(layoutSection(element).querySelector('button.layout-role-unset')).toBeNull();
    element.remove();
  });

  it('disables the layout controls with the textual explanation in read-only sessions', async () => {
    const element = await mountShell({
      designControls: themeDesignControls(),
      sessionState: 'read-only',
      viewports: themeViewports(),
    });
    await selectNode(element, 'text-1');

    const controls = [
      ...layoutSection(element).querySelectorAll<HTMLSelectElement | HTMLButtonElement>(
        'select, button',
      ),
    ];
    expect(controls.length).toBeGreaterThan(0);
    for (const control of controls) {
      expect(control.disabled).toBe(true);
    }
    expect(inspectorRegion(element).textContent).toContain(
      'Editing is disabled because this session is read-only.',
    );
    element.remove();
  });
});

describe('layout fallback identifier input', () => {
  it('falls back to a validated identifier input and dispatches a valid role', async () => {
    const element = await mountShell();
    await selectNode(element, 'text-1');
    const commands = observeCommands(element);

    expect(layoutSection(element).textContent).toContain(
      'No theme size-role vocabulary is available.',
    );
    const input = roleInput(element, 'block');
    expect(input.value).toBe('hero');
    input.value = ' wide ';
    input.dispatchEvent(keydown({ key: 'Enter' }));
    await element.updateComplete;

    expect(commands).toHaveLength(1);
    expect(commands[0]?.type).toBe('studio.command/set-size-role');
    expect(commands[0]?.payload).toEqual({ axis: 'block', nodeId: 'text-1', role: 'wide' });
    expect(selectedNode(element).sizeRoles).toEqual({ block: 'wide', inline: 'half' });
    expect(liveRegionText(element)).toContain('Set the Block size role to wide');
    element.remove();
  });

  it('announces an invalid identifier and dispatches nothing', async () => {
    const element = await mountShell();
    await selectNode(element, 'text-1');
    const commands = observeCommands(element);
    const before = documentSnapshot(element);

    const input = roleInput(element, 'inline');
    input.value = 'Not Valid!';
    input.dispatchEvent(keydown({ key: 'Enter' }));
    await element.updateComplete;

    expect(commands).toHaveLength(0);
    expect(element.document).toEqual(before);
    expect(liveRegionText(element)).toContain(
      'The Inline size role must be a lower-case identifier',
    );
    // The text stays available for correction.
    expect(roleInput(element, 'inline').value).toBe('Not Valid!');
    element.remove();
  });

  it('reverts the input with Escape without dispatching', async () => {
    const element = await mountShell();
    await selectNode(element, 'text-1');
    const commands = observeCommands(element);
    const before = documentSnapshot(element);

    const input = roleInput(element, 'inline');
    input.value = 'drifted';
    input.dispatchEvent(keydown({ key: 'Escape' }));
    await element.updateComplete;

    expect(commands).toHaveLength(0);
    expect(element.document).toEqual(before);
    expect(roleInput(element, 'inline').value).toBe('half');
    expect(liveRegionText(element)).toContain('Edit cancelled. Inline size kept its value.');
    element.remove();
  });
});

describe('responsive property provenance', () => {
  it('names the supplying viewport for overrides and marks inherited values', async () => {
    const element = await mountShell({ viewports: themeViewports() });
    await activateViewport(element, 'narrow');
    await selectNode(element, 'text-1');
    const overrides = inspectorRegion(element).querySelector('section.inspector-overrides');

    expect(overrides?.textContent).toContain('Overridden for the Narrow viewport: 1');
    expect(overrides?.textContent).toContain('Inherited from base: "start"');
    // The inherited value is text only; the editable input exists solely for
    // the property the active viewport actually overrides.
    expect(
      overrides?.querySelector('input.inspector-override-input[data-property="size"]'),
    ).not.toBeNull();
    expect(
      overrides?.querySelector('input.inspector-override-input[data-property="align"]'),
    ).toBeNull();
    expect(
      overrides?.querySelector('li.inspector-inherited[data-property="align"]'),
    ).not.toBeNull();

    // Base rows in the properties section carry their provenance too.
    const properties = inspectorRegion(element).querySelector('section.inspector-properties');
    expect(properties?.textContent).toContain('Base value');
    element.remove();
  });

  it('marks every value as inherited when the active viewport supplies none', async () => {
    const element = await mountShell({ viewports: themeViewports() });
    await selectNode(element, 'text-1');
    const overrides = inspectorRegion(element).querySelector('section.inspector-overrides');

    expect(overrides?.textContent).toContain('Inherited from base: "start"');
    expect(overrides?.textContent).toContain('Inherited from base: 2');
    expect(overrides?.querySelector('input.inspector-override-input')).toBeNull();
    element.remove();
  });
});

describe('outline slot structure', () => {
  it('labels slot groupings textually with the declared slot label', async () => {
    const element = await mountShell({
      roots: [
        blueprintNode('section-1', 'studio.core/section', [
          blueprintNode('text-1', 'studio.core/text'),
        ]),
      ],
    });

    const outline = element.shadowRoot?.querySelector('aside.outline');
    const group = outline?.querySelector<HTMLElement>('section.node-children');
    expect(group?.getAttribute('aria-label')).toBe('Slot: Content');
    expect(group?.querySelector('.outline-slot-label')?.textContent?.trim()).toBe('Slot: Content');
    element.remove();
  });

  it('falls back to the raw slot name for a slot the definition does not declare', async () => {
    const undeclared = blueprintNode('section-1', 'studio.core/section');
    undeclared.slots = { extra: [blueprintNode('text-1', 'studio.core/text')] };
    const element = await mountShell({ roots: [undeclared] });

    const outline = element.shadowRoot?.querySelector('aside.outline');
    const group = outline?.querySelector<HTMLElement>('section.node-children');
    expect(group?.getAttribute('aria-label')).toBe('Slot: extra');
    expect(group?.querySelector('.outline-slot-label')?.textContent?.trim()).toBe('Slot: extra');
    element.remove();
  });
});
