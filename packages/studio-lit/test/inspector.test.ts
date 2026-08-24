import { describe, expect, it } from 'vitest';
import {
  STUDIO_CONTRACT_VERSION,
  type BlockType,
  type BlueprintCommand,
  type BlueprintDocument,
  type BlueprintNode,
  type SetPropertyCommand,
  type ThemeViewport,
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

function blueprintNode(id: string, type: string): BlueprintNode {
  return {
    authoring: { mode: 'content' },
    bindings: {},
    id,
    properties: {},
    slots: {},
    type: type as BlockType,
    version: '1.0.0',
  };
}

function inspectorRoots(): BlueprintNode[] {
  return [
    {
      authoring: { mode: 'content' },
      bindings: {
        title: {
          onError: 'error',
          onNull: 'empty',
          source: { kind: 'static-value', value: 'Hello' },
          transforms: [],
        },
      },
      id: 'text-1',
      properties: { align: 'start', size: 2 },
      responsive: { size: { narrow: 1 } },
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

interface MountOptions {
  roots?: BlueprintNode[];
  sessionState?: 'editable' | 'read-only';
  viewports?: ThemeViewport[];
}

async function mountShell(options: MountOptions = {}): Promise<KumweStudioElement> {
  defineKumweStudio();
  const element = new KumweStudioElement();
  element.configuration = {
    blockDefinitions: [defineTestBlock({ label: 'Text', type: 'studio.core/text' })],
    session: createStudioConfigurationFixture(
      options.sessionState === undefined ? {} : { sessionState: options.sessionState },
    ),
  };
  element.document = createBlueprintFixture({ roots: options.roots ?? inspectorRoots() });
  if (options.viewports !== undefined) {
    element.viewports = options.viewports;
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

function inspectorInput(element: KumweStudioElement, selector: string): HTMLInputElement {
  const input = inspectorRegion(element).querySelector<HTMLInputElement>(selector);
  if (input === null) {
    throw new Error(`Missing inspector input ${selector}`);
  }
  return input;
}

function inspectorButton(element: KumweStudioElement, selector: string): HTMLButtonElement {
  const button = inspectorRegion(element).querySelector<HTMLButtonElement>(selector);
  if (button === null) {
    throw new Error(`Missing inspector button ${selector}`);
  }
  return button;
}

function propertyInput(element: KumweStudioElement, property: string): HTMLInputElement {
  return inspectorInput(element, `input.inspector-property-input[data-property="${property}"]`);
}

function overrideInput(element: KumweStudioElement, property: string): HTMLInputElement {
  return inspectorInput(element, `input.inspector-override-input[data-property="${property}"]`);
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

function savePropertyCommand(element: KumweStudioElement): SetPropertyCommand {
  return {
    artifactId: element.document?.id ?? 'test.blueprint',
    baseStateVersion: element.stateVersion,
    contractVersion: STUDIO_CONTRACT_VERSION,
    id: 'command-save-align',
    kind: 'command',
    payload: { nodeId: 'text-1', property: 'align', value: 'end' },
    sessionGeneration: 'session-r1',
    type: 'studio.command/set-property',
  };
}

describe('inspector property editing', () => {
  it('commits a property edit with Enter through set-property and announces it', async () => {
    const element = await mountShell();
    await selectNode(element, 'text-1');
    const commands = observeCommands(element);

    const input = propertyInput(element, 'align');
    expect(input.value).toBe('"start"');
    input.focus();
    input.value = '"center"';
    input.dispatchEvent(keydown({ key: 'Enter' }));
    await element.updateComplete;

    expect(selectedNode(element).properties.align).toBe('center');
    expect(commands).toHaveLength(1);
    expect(commands[0]).toMatchObject({
      payload: { nodeId: 'text-1', property: 'align', value: 'center' },
      type: 'studio.command/set-property',
    });
    expect(liveRegionText(element)).toContain('Set align');
    expect(propertyInput(element, 'align').value).toBe('"center"');
    expect(element.shadowRoot?.activeElement).toBe(input);
    element.remove();
  });

  it('announces invalid JSON and dispatches nothing', async () => {
    const element = await mountShell();
    await selectNode(element, 'text-1');
    const commands = observeCommands(element);
    const before = documentSnapshot(element);

    const input = propertyInput(element, 'align');
    input.value = '{not json';
    input.dispatchEvent(keydown({ key: 'Enter' }));
    await element.updateComplete;

    expect(commands).toHaveLength(0);
    expect(element.document).toEqual(before);
    expect(liveRegionText(element)).toContain('The align value is not valid JSON.');
    // The text stays available for correction.
    expect(propertyInput(element, 'align').value).toBe('{not json');
    element.remove();
  });

  it('reverts the input with Escape without dispatching', async () => {
    const element = await mountShell();
    await selectNode(element, 'text-1');
    const commands = observeCommands(element);
    const before = documentSnapshot(element);

    const input = propertyInput(element, 'align');
    input.value = '"drifted"';
    input.dispatchEvent(keydown({ key: 'Escape' }));
    await element.updateComplete;

    expect(commands).toHaveLength(0);
    expect(element.document).toEqual(before);
    expect(propertyInput(element, 'align').value).toBe('"start"');
    expect(liveRegionText(element)).toContain('Edit cancelled. align kept its value.');
    element.remove();
  });

  it('unsets a property through unset-property and announces it', async () => {
    const element = await mountShell();
    await selectNode(element, 'text-1');
    const commands = observeCommands(element);

    inspectorButton(element, 'button.inspector-property-unset[data-property="align"]').click();
    await element.updateComplete;

    expect(selectedNode(element).properties.align).toBeUndefined();
    expect(commands).toHaveLength(1);
    expect(commands[0]).toMatchObject({
      payload: { nodeId: 'text-1', property: 'align' },
      type: 'studio.command/unset-property',
    });
    expect(liveRegionText(element)).toContain('Unset align');
    element.remove();
  });

  it('adds a new property through set-property and clears the form', async () => {
    const element = await mountShell();
    await selectNode(element, 'text-1');
    const commands = observeCommands(element);

    inspectorInput(element, 'input.inspector-add-property-name').value = 'tone';
    inspectorInput(element, 'input.inspector-add-property-value').value = '"brand"';
    inspectorButton(element, 'button.inspector-add-property-submit').click();
    await element.updateComplete;

    expect(selectedNode(element).properties.tone).toBe('brand');
    expect(commands).toHaveLength(1);
    expect(commands[0]).toMatchObject({
      payload: { nodeId: 'text-1', property: 'tone', value: 'brand' },
      type: 'studio.command/set-property',
    });
    expect(liveRegionText(element)).toContain('Set tone');
    expect(inspectorInput(element, 'input.inspector-add-property-name').value).toBe('');
    expect(inspectorInput(element, 'input.inspector-add-property-value').value).toBe('');
    element.remove();
  });

  it('exposes the documented Tab order across the editing controls', async () => {
    const element = await mountShell({ viewports: themeViewports() });
    viewportButton(element, 'narrow').click();
    await element.updateComplete;
    await selectNode(element, 'text-1');

    const controls = [
      ...inspectorRegion(element).querySelectorAll<HTMLElement>('input, button'),
    ].map((control) => control.className);
    expect(controls).toEqual([
      'inspector-property-input',
      'inspector-property-unset',
      'inspector-property-input',
      'inspector-property-unset',
      'inspector-add-property-name',
      'inspector-add-property-value',
      'inspector-add-property-submit',
      'inspector-binding-remove',
      'inspector-binding-port',
      'inspector-binding-value-input',
      'inspector-binding-set',
      'inspector-inheritance-reset',
      'inspector-override-input',
      'inspector-override-remove',
      'inspector-inheritance-reset',
      'inspector-add-override-name',
      'inspector-add-override-value',
      'inspector-add-override-submit',
      'layout-role-input',
      'layout-role-unset',
      'layout-role-input',
      'layout-role-unset',
    ]);
    element.remove();
  });
});

describe('inspector bindings', () => {
  it('sets a binding through set-binding and announces the port', async () => {
    const element = await mountShell();
    await selectNode(element, 'text-1');
    const commands = observeCommands(element);

    inspectorInput(element, 'input.inspector-binding-port').value = 'subtitle';
    inspectorInput(element, 'input.inspector-binding-value-input').value =
      '{"onError":"error","onNull":"empty","source":{"kind":"static-value","value":"Sub"},"transforms":[]}';
    inspectorButton(element, 'button.inspector-binding-set').click();
    await element.updateComplete;

    expect(selectedNode(element).bindings.subtitle).toEqual({
      onError: 'error',
      onNull: 'empty',
      source: { kind: 'static-value', value: 'Sub' },
      transforms: [],
    });
    expect(commands).toHaveLength(1);
    expect(commands[0]).toMatchObject({
      payload: { nodeId: 'text-1', port: 'subtitle' },
      type: 'studio.command/set-binding',
    });
    expect(liveRegionText(element)).toContain('Set the subtitle binding');
    expect(inspectorInput(element, 'input.inspector-binding-port').value).toBe('');
    element.remove();
  });

  it('removes a binding through remove-binding and announces the port', async () => {
    const element = await mountShell();
    await selectNode(element, 'text-1');
    const commands = observeCommands(element);

    inspectorButton(element, 'button.inspector-binding-remove[data-port="title"]').click();
    await element.updateComplete;

    expect(selectedNode(element).bindings.title).toBeUndefined();
    expect(commands).toHaveLength(1);
    expect(commands[0]).toMatchObject({
      payload: { nodeId: 'text-1', port: 'title' },
      type: 'studio.command/remove-binding',
    });
    expect(liveRegionText(element)).toContain('Removed the title binding');
    element.remove();
  });
});

describe('inspector responsive overrides', () => {
  it('edits the active-viewport override through set-property with the viewport', async () => {
    const element = await mountShell({ viewports: themeViewports() });
    viewportButton(element, 'narrow').click();
    await element.updateComplete;
    await selectNode(element, 'text-1');
    const commands = observeCommands(element);

    const input = overrideInput(element, 'size');
    expect(input.value).toBe('1');
    input.value = '3';
    input.dispatchEvent(keydown({ key: 'Enter' }));
    await element.updateComplete;

    expect(selectedNode(element).responsive?.size?.narrow).toBe(3);
    expect(commands).toHaveLength(1);
    expect(commands[0]).toMatchObject({
      payload: { nodeId: 'text-1', property: 'size', value: 3, viewport: 'narrow' },
      type: 'studio.command/set-property',
    });
    expect(liveRegionText(element)).toContain('Set the size override for the Narrow viewport');
    element.remove();
  });

  it('removes an override through unset-property with the viewport', async () => {
    const element = await mountShell({ viewports: themeViewports() });
    viewportButton(element, 'narrow').click();
    await element.updateComplete;
    await selectNode(element, 'text-1');
    const commands = observeCommands(element);

    inspectorButton(element, 'button.inspector-override-remove[data-property="size"]').click();
    await element.updateComplete;

    expect(selectedNode(element).responsive).toBeUndefined();
    expect(commands).toHaveLength(1);
    expect(commands[0]).toMatchObject({
      payload: { nodeId: 'text-1', property: 'size', viewport: 'narrow' },
      type: 'studio.command/unset-property',
    });
    expect(liveRegionText(element)).toContain('Removed the size override for the Narrow viewport');
    element.remove();
  });

  it('resets every viewport override through reset-inherited-property', async () => {
    const roots = inspectorRoots();
    const first = roots[0];
    if (first !== undefined) {
      first.responsive = { size: { narrow: 1, wide: 4 } };
    }
    const element = await mountShell({ roots, viewports: themeViewports() });
    viewportButton(element, 'narrow').click();
    await element.updateComplete;
    await selectNode(element, 'text-1');
    const commands = observeCommands(element);

    inspectorButton(element, 'button.inspector-inheritance-reset[data-property="size"]').click();
    await element.updateComplete;

    expect(selectedNode(element).responsive).toBeUndefined();
    expect(commands).toHaveLength(1);
    expect(commands[0]).toMatchObject({
      payload: { nodeId: 'text-1', property: 'size' },
      type: 'studio.command/reset-inherited-property',
    });
    expect(liveRegionText(element)).toContain('all viewports now inherit the base value');
    element.remove();
  });

  it('adds an override for a base property on the active viewport', async () => {
    const element = await mountShell({ viewports: themeViewports() });
    viewportButton(element, 'narrow').click();
    await element.updateComplete;
    await selectNode(element, 'text-1');
    const commands = observeCommands(element);

    inspectorInput(element, 'input.inspector-add-override-name').value = 'align';
    inspectorInput(element, 'input.inspector-add-override-value').value = '"center"';
    inspectorButton(element, 'button.inspector-add-override-submit').click();
    await element.updateComplete;

    expect(selectedNode(element).responsive?.align?.narrow).toBe('center');
    expect(commands).toHaveLength(1);
    expect(commands[0]).toMatchObject({
      payload: { nodeId: 'text-1', property: 'align', value: 'center', viewport: 'narrow' },
      type: 'studio.command/set-property',
    });
    expect(liveRegionText(element)).toContain('Set the align override for the Narrow viewport');
    element.remove();
  });
});

describe('inspector read-only and failure behaviour', () => {
  it('disables every editing control with a textual explanation in read-only sessions', async () => {
    const element = await mountShell({
      sessionState: 'read-only',
      viewports: themeViewports(),
    });
    await selectNode(element, 'text-1');

    const controls = [
      ...inspectorRegion(element).querySelectorAll<HTMLInputElement | HTMLButtonElement>(
        'input, button',
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

  it('announces a save conflict and keeps focus on the triggering control', async () => {
    const element = await mountShell();
    await selectNode(element, 'text-1');
    const before = documentSnapshot(element);

    const input = propertyInput(element, 'align');
    input.focus();
    const activeBefore = document.activeElement;

    const stale = { ...savePropertyCommand(element), expectedRevision: 'blueprint-r999' };
    expect(() => element.execute(stale)).toThrow();
    await element.updateComplete;

    expect(liveRegionText(element)).toContain('The change was rejected:');
    expect(liveRegionText(element)).toContain('blueprint-r999');
    expect(liveRegionText(element)).toContain('refresh the session or undo');
    expect(document.activeElement).toBe(activeBefore);
    expect(element.shadowRoot?.activeElement).toBe(input);
    expect(element.document).toEqual(before);
    expect(propertyInput(element, 'align').value).toBe('"start"');
    element.remove();
  });

  it('announces the undo outcome after an inspector edit', async () => {
    const element = await mountShell();
    await selectNode(element, 'text-1');

    const input = propertyInput(element, 'align');
    input.value = '"center"';
    input.dispatchEvent(keydown({ key: 'Enter' }));
    await element.updateComplete;
    expect(liveRegionText(element)).toContain('Set align');

    element.undo();
    await element.updateComplete;

    expect(element.shadowRoot?.querySelector('[aria-live="polite"]')).not.toBeNull();
    expect(liveRegionText(element)).toContain('Undid change');
    expect(selectedNode(element).properties.align).toBe('start');
    expect(propertyInput(element, 'align').value).toBe('"start"');
    element.remove();
  });
});
