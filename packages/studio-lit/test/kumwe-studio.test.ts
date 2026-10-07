import { describe, expect, it } from 'vitest';
import {
  STUDIO_CONTRACT_VERSION,
  type BlockDefinition,
  type BlockType,
  type BlueprintNode,
  type InsertNodeCommand,
  type RemoveNodeCommand,
} from '@kumwe/studio-protocol';
import {
  createBlueprintFixture,
  createStudioConfigurationFixture,
  defineTestBlock,
} from '@kumwe/studio-testkit';
import { defineKumweStudio, KumweStudioElement } from '../src/index.js';

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

function structuredRoots(): BlueprintNode[] {
  return [
    blueprintNode('hero-1', 'studio.core/hero'),
    blueprintNode('section-1', 'studio.core/section', [
      blueprintNode('text-1', 'studio.core/text'),
      blueprintNode('text-2', 'studio.core/text'),
    ]),
  ];
}

interface MountOptions {
  composite?: 'hybrid' | 'single';
  definitions?: BlockDefinition[];
  mode?: 'blueprint' | 'content' | 'model';
  roots?: BlueprintNode[];
  sessionState?: 'editable' | 'read-only';
}

async function mountShell(options: MountOptions = {}): Promise<KumweStudioElement> {
  defineKumweStudio();
  const element = new KumweStudioElement();
  element.configuration = {
    blockDefinitions: options.definitions ?? [
      defineTestBlock({ label: 'Section', type: 'studio.core/section' }),
      defineTestBlock({ label: 'Text', type: 'studio.core/text' }),
    ],
    session: createStudioConfigurationFixture({
      composite: options.composite ?? 'single',
      mode: options.mode ?? 'blueprint',
      sessionState: options.sessionState ?? 'editable',
    }),
  };
  element.document = createBlueprintFixture({ roots: options.roots ?? [] });
  document.body.append(element);
  await element.updateComplete;
  return element;
}

function outlineEntries(element: KumweStudioElement): HTMLButtonElement[] {
  return [
    ...(element.shadowRoot?.querySelectorAll<HTMLButtonElement>('button.outline-entry') ?? []),
  ];
}

function outlineEntry(element: KumweStudioElement, nodeId: string): HTMLButtonElement {
  const entry = outlineEntries(element).find((candidate) => candidate.dataset.nodeId === nodeId);
  if (entry === undefined) {
    throw new Error(`Missing outline entry for ${nodeId}`);
  }
  return entry;
}

function controlButton(element: KumweStudioElement, className: string): HTMLButtonElement {
  const button = element.shadowRoot?.querySelector<HTMLButtonElement>(
    `.outline-controls button.${className}`,
  );
  if (button === null || button === undefined) {
    throw new Error(`Missing outline control ${className}`);
  }
  return button;
}

function liveRegionText(element: KumweStudioElement): string {
  return element.shadowRoot?.querySelector('[aria-live="polite"]')?.textContent ?? '';
}

function saveStateText(element: KumweStudioElement): string {
  return element.shadowRoot?.querySelector('.save-state')?.textContent?.trim() ?? '';
}

function activeOutlineNodeId(element: KumweStudioElement): string | undefined {
  const active = element.shadowRoot?.activeElement;
  return active instanceof HTMLElement ? active.dataset.nodeId : undefined;
}

function workspace(element: KumweStudioElement): HTMLElement {
  const region = element.shadowRoot?.querySelector<HTMLElement>('.workspace');
  if (region === null || region === undefined) {
    throw new Error('Missing workspace');
  }
  return region;
}

function panelView(element: KumweStudioElement): string | null {
  return workspace(element).getAttribute('data-panel-view');
}

function panelScope(element: KumweStudioElement): string | null {
  return workspace(element).getAttribute('data-panel-scope');
}

/** The details header's Back control, or null while the contextual modes hide it. */
function panelBack(element: KumweStudioElement): HTMLButtonElement | null {
  return (
    element.shadowRoot?.querySelector<HTMLButtonElement>(
      'aside.inspector .panel-header button.panel-back',
    ) ?? null
  );
}

/** The opened level's `Back to …` control, or null at the page level. */
function scopeBack(element: KumweStudioElement): HTMLButtonElement | null {
  return (
    element.shadowRoot?.querySelector<HTMLButtonElement>(
      'aside.outline .panel-header button.panel-back',
    ) ?? null
  );
}

function keydown(target: EventTarget, key: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    composed: true,
    key,
    ...init,
  });
  target.dispatchEvent(event);
  return event;
}

/** Two update rounds: the render, then the focus placement queued behind it. */
async function settle(element: KumweStudioElement): Promise<void> {
  await element.updateComplete;
  await element.updateComplete;
}

function removeNodeCommand(element: KumweStudioElement, nodeId: string): RemoveNodeCommand {
  return {
    artifactId: element.document?.id ?? 'test.blueprint',
    baseStateVersion: element.stateVersion,
    contractVersion: STUDIO_CONTRACT_VERSION,
    id: `command-remove-${nodeId}`,
    kind: 'command',
    payload: { nodeId },
    sessionGeneration: 'session-r1',
    type: 'studio.command/remove-node',
  };
}

async function selectNode(element: KumweStudioElement, nodeId: string): Promise<void> {
  outlineEntry(element, nodeId).click();
  await element.updateComplete;
}

function insertTextCommand(
  element: KumweStudioElement,
  nodeId = 'text-inserted',
): InsertNodeCommand {
  return {
    artifactId: element.document?.id ?? 'test.blueprint',
    baseStateVersion: element.stateVersion,
    contractVersion: STUDIO_CONTRACT_VERSION,
    id: `command-${nodeId}`,
    kind: 'command',
    payload: {
      destination: { position: element.document?.roots.length ?? 0 },
      node: blueprintNode(nodeId, 'studio.core/text'),
    },
    sessionGeneration: 'session-r1',
    type: 'studio.command/insert-node',
  };
}

describe('kumwe-studio element', () => {
  it('resolves every wire mode instead of flattening editable sessions to Blueprint mode', async () => {
    for (const expected of ['blueprint', 'content', 'model'] as const) {
      const element = await mountShell({ mode: expected, roots: structuredRoots() });
      expect(element.sessionMode).toBe(expected);
      const paletteButtons = [
        ...(element.shadowRoot?.querySelectorAll<HTMLButtonElement>('.palette button') ?? []),
      ];
      expect(paletteButtons.every((button) => button.disabled)).toBe(expected !== 'blueprint');
      element.remove();
    }

    const readOnly = await mountShell({ mode: 'blueprint', sessionState: 'read-only' });
    expect(readOnly.sessionMode).toBe('read-only');
    readOnly.remove();

    const hybrid = await mountShell({ composite: 'hybrid', mode: 'content' });
    expect(hybrid.sessionMode).toBe('hybrid');
    hybrid.remove();
  });

  it('derives disabled Blueprint affordances from the canonical mode table', async () => {
    for (const mode of ['content', 'model'] as const) {
      const element = await mountShell({ mode, roots: structuredRoots() });
      await selectNode(element, 'text-1');
      expect(controlButton(element, 'outline-move-up').disabled).toBe(true);
      expect(controlButton(element, 'outline-move-down').disabled).toBe(true);
      expect(controlButton(element, 'outline-duplicate').disabled).toBe(true);
      expect(controlButton(element, 'outline-delete').disabled).toBe(true);
      expect(() => element.execute(insertTextCommand(element, `${mode}-forbidden`))).toThrow(
        expect.objectContaining({ code: 'mode-forbidden' }) as Error,
      );
      expect(element.document?.roots).toEqual(structuredRoots());
      element.remove();
    }
  });

  it('bounds hybrid structure controls to declared composable slots', async () => {
    const roots = structuredRoots();
    const section = roots[1];
    if (section === undefined) {
      throw new Error('fixture requires a section root');
    }
    section.authoring = { mode: 'structural' };
    const element = await mountShell({
      composite: 'hybrid',
      definitions: [
        defineTestBlock({
          label: 'Section',
          slots: [
            {
              accepts: { types: ['studio.core/text'] },
              id: 'content',
              label: { defaultMessage: 'Content', key: 'studio.test/content' },
              maximum: 100,
              minimum: 0,
              ordered: true,
            },
          ],
          type: 'studio.core/section',
        }),
        defineTestBlock({ label: 'Text', type: 'studio.core/text' }),
      ],
      mode: 'content',
      roots,
    });

    await selectNode(element, 'section-1');
    expect(controlButton(element, 'outline-delete').disabled).toBe(true);
    const paletteButtons = [
      ...(element.shadowRoot?.querySelectorAll<HTMLButtonElement>('.palette button') ?? []),
    ];
    expect(paletteButtons.find((button) => button.textContent?.includes('Text'))?.disabled).toBe(
      false,
    );

    await selectNode(element, 'text-1');
    expect(controlButton(element, 'outline-move-down').disabled).toBe(false);
    expect(controlButton(element, 'outline-delete').disabled).toBe(false);
    const inspectorInputs = [
      ...(element.shadowRoot?.querySelectorAll<HTMLInputElement>('.inspector input') ?? []),
    ];
    expect(inspectorInputs.every((input) => input.disabled)).toBe(true);
    element.remove();
  });

  it('renders a palette and applies canonical commands', async () => {
    const element = await mountShell({
      definitions: [defineTestBlock({ label: 'Text', type: 'studio.core/text' })],
    });

    element.execute(insertTextCommand(element, 'text-1'));
    await element.updateComplete;

    expect(element.document?.roots).toHaveLength(1);
    expect(element.shadowRoot?.textContent).toContain('Text');
    element.remove();
  });

  it('lets a host select its assigned node after executing an insertion command', async () => {
    const element = await mountShell({
      definitions: [defineTestBlock({ label: 'Text', type: 'studio.core/text' })],
    });

    element.execute(insertTextCommand(element, 'host-text'));
    element.selectNode('host-text');
    await element.updateComplete;

    expect(outlineEntry(element, 'host-text').getAttribute('aria-pressed')).toBe('true');
    element.selectNode(undefined);
    await element.updateComplete;
    expect(outlineEntry(element, 'host-text').getAttribute('aria-pressed')).toBe('false');
    expect(() => element.selectNode('missing-node')).toThrow(
      'Node missing-node cannot be selected because it is not in the document.',
    );
    element.remove();
  });

  it('renders the outline tree and marks unresolved blocks', async () => {
    const element = await mountShell({ roots: structuredRoots() });

    const outline = element.shadowRoot?.querySelector('aside[aria-label="Outline"]');
    expect(outline).not.toBeNull();
    expect(outline?.textContent).toContain(
      'Arrow keys move focus. Alt+Arrow moves the block. Delete removes it.',
    );

    const entries = outlineEntries(element).map((entry) => entry.dataset.nodeId);
    expect(entries).toEqual(['hero-1', 'section-1', 'text-1', 'text-2']);

    const unresolved = outlineEntry(element, 'hero-1');
    expect(unresolved.textContent).toContain('studio.core/hero');
    expect(unresolved.textContent).toContain('(unresolved)');
    expect(outlineEntry(element, 'section-1').textContent).toContain('Section');
    expect(outlineEntry(element, 'section-1').textContent).not.toContain('(unresolved)');
    element.remove();
  });

  it('selecting through the outline updates inspector and canvas selection', async () => {
    const element = await mountShell({ roots: structuredRoots() });

    await selectNode(element, 'text-1');

    expect(outlineEntry(element, 'text-1').getAttribute('aria-pressed')).toBe('true');
    const inspector = element.shadowRoot?.querySelector('.inspector');
    expect(inspector?.textContent).toContain('text-1');
    expect(inspector?.textContent).toContain('studio.core/text@1.0.0');
    const canvasSelected = element.shadowRoot?.querySelector('main button[aria-pressed="true"]');
    expect(canvasSelected?.textContent).toContain('Text');
    element.remove();
  });

  it('moves nodes with reorder-children and disables controls at the edges', async () => {
    const element = await mountShell({ roots: structuredRoots() });

    await selectNode(element, 'section-1');
    expect(controlButton(element, 'outline-move-up').disabled).toBe(false);
    expect(controlButton(element, 'outline-move-down').disabled).toBe(true);

    controlButton(element, 'outline-move-up').click();
    await element.updateComplete;

    expect(element.document?.roots.map((root) => root.id)).toEqual(['section-1', 'hero-1']);
    expect(liveRegionText(element)).toContain('Moved Section up');
    expect(controlButton(element, 'outline-move-up').disabled).toBe(true);
    expect(controlButton(element, 'outline-move-down').disabled).toBe(false);
    expect(activeOutlineNodeId(element)).toBe('section-1');

    await selectNode(element, 'text-1');
    controlButton(element, 'outline-move-down').click();
    await element.updateComplete;

    const section = element.document?.roots.find((root) => root.id === 'section-1');
    expect(section?.slots.content?.map((child) => child.id)).toEqual(['text-2', 'text-1']);
    expect(liveRegionText(element)).toContain('Moved Text down');
    element.remove();
  });

  it('duplicates the selected node with fresh identifiers and focuses the copy', async () => {
    const element = await mountShell({ roots: structuredRoots() });

    await selectNode(element, 'text-1');
    controlButton(element, 'outline-duplicate').click();
    await element.updateComplete;

    const section = element.document?.roots.find((root) => root.id === 'section-1');
    expect(section?.slots.content?.map((child) => child.id)).toEqual([
      'text-1',
      'text-1-copy-1',
      'text-2',
    ]);
    expect(outlineEntry(element, 'text-1-copy-1').getAttribute('aria-pressed')).toBe('true');
    expect(activeOutlineNodeId(element)).toBe('text-1-copy-1');
    expect(liveRegionText(element)).toContain('Duplicated Text');
    element.remove();
  });

  it('skips identifiers already present when allocating duplicate ids', async () => {
    const element = await mountShell({
      roots: [
        blueprintNode('text-1', 'studio.core/text'),
        blueprintNode('text-1-copy-1', 'studio.core/text'),
      ],
    });

    await selectNode(element, 'text-1');
    controlButton(element, 'outline-duplicate').click();
    await element.updateComplete;

    expect(element.document?.roots.map((root) => root.id)).toEqual([
      'text-1',
      'text-1-copy-2',
      'text-1-copy-1',
    ]);
    element.remove();
  });

  it('deletes nodes, announcing and focusing the previous sibling or the parent', async () => {
    const element = await mountShell({ roots: structuredRoots() });

    await selectNode(element, 'text-2');
    controlButton(element, 'outline-delete').click();
    await element.updateComplete;

    expect(liveRegionText(element)).toContain('Deleted Text block');
    expect(activeOutlineNodeId(element)).toBe('text-1');
    expect(outlineEntry(element, 'text-1').getAttribute('aria-pressed')).toBe('true');

    controlButton(element, 'outline-delete').click();
    await element.updateComplete;

    expect(activeOutlineNodeId(element)).toBe('section-1');
    const section = element.document?.roots.find((root) => root.id === 'section-1');
    expect(section?.slots.content).toBeUndefined();
    element.remove();
  });

  it('supports the documented outline keyboard shortcuts', async () => {
    const element = await mountShell({ roots: structuredRoots() });

    const sectionEntry = outlineEntry(element, 'section-1');
    sectionEntry.focus();
    sectionEntry.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'ArrowUp' }),
    );
    expect(activeOutlineNodeId(element)).toBe('hero-1');

    outlineEntry(element, 'hero-1').dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'ArrowDown' }),
    );
    expect(activeOutlineNodeId(element)).toBe('section-1');

    outlineEntry(element, 'section-1').dispatchEvent(
      new KeyboardEvent('keydown', {
        altKey: true,
        bubbles: true,
        cancelable: true,
        key: 'ArrowUp',
      }),
    );
    await element.updateComplete;
    expect(element.document?.roots.map((root) => root.id)).toEqual(['section-1', 'hero-1']);
    expect(liveRegionText(element)).toContain('Moved Section up');

    outlineEntry(element, 'text-1').dispatchEvent(
      new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        ctrlKey: true,
        key: 'd',
      }),
    );
    await element.updateComplete;
    const section = element.document?.roots.find((root) => root.id === 'section-1');
    expect(section?.slots.content?.map((child) => child.id)).toEqual([
      'text-1',
      'text-1-copy-1',
      'text-2',
    ]);
    expect(activeOutlineNodeId(element)).toBe('text-1-copy-1');

    outlineEntry(element, 'text-1-copy-1').dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Delete' }),
    );
    await element.updateComplete;
    expect(section && element.document?.roots.length).toBeDefined();
    const sectionAfter = element.document?.roots.find((root) => root.id === 'section-1');
    expect(sectionAfter?.slots.content?.map((child) => child.id)).toEqual(['text-1', 'text-2']);
    expect(activeOutlineNodeId(element)).toBe('text-1');
    element.remove();
  });

  it('keeps focus on the surviving node across undo and redo', async () => {
    const element = await mountShell({ roots: structuredRoots() });

    await selectNode(element, 'section-1');
    controlButton(element, 'outline-move-up').click();
    await element.updateComplete;
    expect(activeOutlineNodeId(element)).toBe('section-1');

    element.undo();
    await element.updateComplete;
    expect(element.document?.roots.map((root) => root.id)).toEqual(['hero-1', 'section-1']);
    expect(liveRegionText(element)).toContain('Undid change');
    expect(activeOutlineNodeId(element)).toBe('section-1');

    element.redo();
    await element.updateComplete;
    expect(element.document?.roots.map((root) => root.id)).toEqual(['section-1', 'hero-1']);
    expect(liveRegionText(element)).toContain('Redid change');
    expect(activeOutlineNodeId(element)).toBe('section-1');
    element.remove();
  });

  it('announces command failures with their message', async () => {
    const element = await mountShell({ roots: structuredRoots() });

    const duplicate = insertTextCommand(element, 'text-1');
    expect(() => element.execute(duplicate)).toThrow();
    await element.updateComplete;

    expect(liveRegionText(element)).toContain('Command failed:');
    expect(liveRegionText(element)).toContain('text-1');
    element.remove();
  });

  it('announces stale-generation rejections through the conflict message', async () => {
    const element = await mountShell({ roots: structuredRoots() });

    const stale = { ...insertTextCommand(element), sessionGeneration: 'session-r999' };
    expect(() => element.execute(stale)).toThrow();
    await element.updateComplete;

    expect(liveRegionText(element)).toContain('The change was rejected:');
    expect(liveRegionText(element)).toContain('session-r999');
    expect(liveRegionText(element)).toContain('refresh the session or undo');
    element.remove();
  });

  it('renders read-only sessions with every mutation control disabled', async () => {
    const element = await mountShell({ roots: structuredRoots(), sessionState: 'read-only' });

    const palette = element.shadowRoot?.querySelectorAll<HTMLButtonElement>('.palette button');
    expect(palette?.length).toBeGreaterThan(0);
    for (const button of palette ?? []) {
      expect(button.disabled).toBe(true);
    }
    const toolbar = element.shadowRoot?.querySelectorAll<HTMLButtonElement>('.toolbar button');
    for (const button of toolbar ?? []) {
      expect(button.disabled).toBe(true);
    }

    await selectNode(element, 'text-1');
    expect(outlineEntry(element, 'text-1').getAttribute('aria-pressed')).toBe('true');
    for (const className of [
      'outline-move-down',
      'outline-move-up',
      'outline-delete',
      'outline-duplicate',
    ]) {
      expect(controlButton(element, className).disabled).toBe(true);
    }

    outlineEntry(element, 'text-1').dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Delete' }),
    );
    await element.updateComplete;
    const section = element.document?.roots.find((root) => root.id === 'section-1');
    expect(section?.slots.content?.map((child) => child.id)).toEqual(['text-1', 'text-2']);
    element.remove();
  });

  it('lets hosts override chrome strings through the message catalog', async () => {
    const element = await mountShell({ roots: structuredRoots() });

    expect(element.shadowRoot?.textContent).toContain('Blocks');
    expect(element.shadowRoot?.querySelector('button.add-blocks-toggle')?.textContent?.trim()).toBe(
      'Add blocks',
    );
    element.messages = {
      'studio.shell/add-blocks-toggle': { defaultMessage: 'Bausteine hinzufügen' },
      'studio.shell/outline-heading': { defaultMessage: 'Struktur' },
      'studio.shell/palette-heading': { defaultMessage: 'Bausteine' },
      'studio.shell/panel-back': { defaultMessage: 'Zurück' },
    };
    await element.updateComplete;

    expect(element.shadowRoot?.textContent).toContain('Bausteine');
    expect(element.shadowRoot?.textContent).toContain('Struktur');
    expect(element.shadowRoot?.querySelector('aside[aria-label="Struktur"]')).not.toBeNull();
    expect(element.shadowRoot?.querySelector('button.add-blocks-toggle')?.textContent?.trim()).toBe(
      'Bausteine hinzufügen',
    );

    await selectNode(element, 'text-1');
    element.revealInspector();
    await element.updateComplete;
    expect(panelView(element)).toBe('details');
    expect(panelBack(element)?.textContent).toContain('Zurück');
    expect(panelBack(element)?.textContent).not.toContain('Back');
    element.remove();
  });

  it('collapses the block palette behind Add blocks on a non-empty document and opens it on a blank one', async () => {
    const element = await mountShell({ roots: structuredRoots() });
    const workspace = element.shadowRoot?.querySelector('.workspace');
    const toggle = element.shadowRoot?.querySelector<HTMLButtonElement>(
      'aside.outline .panel-header button.add-blocks-toggle',
    );
    const library = element.shadowRoot?.querySelector('aside.library');
    expect(workspace?.getAttribute('data-library')).toBe('closed');
    expect(toggle?.textContent?.trim()).toBe('Add blocks');
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
    expect(toggle?.getAttribute('aria-controls')).toBe('library');
    expect(library?.id).toBe('library');
    expect(library?.getAttribute('aria-label')).toBe('Block palette');

    toggle?.click();
    await element.updateComplete;
    expect(workspace?.getAttribute('data-library')).toBe('open');
    expect(toggle?.getAttribute('aria-expanded')).toBe('true');
    expect(workspace?.getAttribute('data-pane')).toBe('library');

    toggle?.click();
    await element.updateComplete;
    expect(workspace?.getAttribute('data-library')).toBe('closed');
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
    expect(workspace?.getAttribute('data-pane')).toBe('outline');
    element.remove();

    const blank = await mountShell();
    expect(blank.shadowRoot?.querySelector('.workspace')?.getAttribute('data-library')).toBe(
      'open',
    );
    expect(
      blank.shadowRoot?.querySelector('button.add-blocks-toggle')?.getAttribute('aria-expanded'),
    ).toBe('true');
    blank.remove();
  });

  it('moves focus from a closing library to the Add blocks control', async () => {
    const element = await mountShell();
    const toggle = element.shadowRoot?.querySelector<HTMLButtonElement>('button.add-blocks-toggle');
    const search = element.shadowRoot?.querySelector<HTMLInputElement>(
      'aside.library input[type="search"]',
    );
    if (toggle == null || search == null) throw new Error('Missing library controls');
    expect(element.shadowRoot?.querySelector('.workspace')?.getAttribute('data-library')).toBe(
      'open',
    );
    search.focus();
    expect(element.shadowRoot?.activeElement).toBe(search);

    toggle.click();
    await element.updateComplete;
    expect(element.shadowRoot?.querySelector('.workspace')?.getAttribute('data-library')).toBe(
      'closed',
    );
    expect(element.shadowRoot?.activeElement).toBe(toggle);
    element.remove();
  });

  it('closes an open library from any pane at wide widths and brings it forward while sheets are active', async () => {
    const element = await mountShell({ roots: structuredRoots() });
    const workspace = element.shadowRoot?.querySelector('.workspace');
    const toggle = element.shadowRoot?.querySelector<HTMLButtonElement>('button.add-blocks-toggle');
    const switcher = element.shadowRoot?.querySelector<HTMLElement>('nav.pane-switcher');
    if (toggle == null || switcher == null) throw new Error('Missing workspace controls');
    const insertFromPalette = async (): Promise<void> => {
      const palette = [
        ...(element.shadowRoot?.querySelectorAll<HTMLButtonElement>('.palette button') ?? []),
      ];
      palette.find((button) => button.textContent?.includes('Text'))?.click();
      await element.updateComplete;
      expect(workspace?.getAttribute('data-pane')).toBe('canvas');
    };

    // Wide: an insertion returns to the canvas pane; the next press still closes.
    toggle.click();
    await element.updateComplete;
    expect(workspace?.getAttribute('data-library')).toBe('open');
    await insertFromPalette();
    toggle.click();
    await element.updateComplete;
    expect(workspace?.getAttribute('data-library')).toBe('closed');
    expect(workspace?.getAttribute('data-pane')).toBe('canvas');

    // Sheets: the switcher is laid out, so a press from another sheet brings
    // the open library forward instead of closing it behind that sheet.
    const original = switcher.getBoundingClientRect.bind(switcher);
    switcher.getBoundingClientRect = (): DOMRect => new DOMRect(0, 0, 390, 40);
    toggle.click();
    await element.updateComplete;
    expect(workspace?.getAttribute('data-library')).toBe('open');
    expect(workspace?.getAttribute('data-pane')).toBe('library');
    await insertFromPalette();
    toggle.click();
    await element.updateComplete;
    expect(workspace?.getAttribute('data-library')).toBe('open');
    expect(workspace?.getAttribute('data-pane')).toBe('library');
    toggle.click();
    await element.updateComplete;
    expect(workspace?.getAttribute('data-library')).toBe('closed');
    expect(workspace?.getAttribute('data-pane')).toBe('outline');
    switcher.getBoundingClientRect = original;
    element.remove();
  });

  it('orders the structure panel before the page', async () => {
    const element = await mountShell({ roots: structuredRoots() });
    const children = [...(element.shadowRoot?.querySelector('.workspace')?.children ?? [])];
    const indexOf = (selector: string): number =>
      children.findIndex((child) => child.matches(selector));
    const outline = indexOf('aside.outline');
    const library = indexOf('aside.library');
    const inspector = indexOf('aside.inspector');
    const canvas = indexOf('main.canvas');

    expect(outline).toBeGreaterThanOrEqual(0);
    expect(outline).toBeLessThan(library);
    expect(library).toBeLessThan(inspector);
    expect(inspector).toBeLessThan(canvas);
    element.remove();
  });

  it('keeps an open library that holds focus when the document is replaced', async () => {
    const element = await mountShell();
    expect(element.shadowRoot?.querySelector('.workspace')?.getAttribute('data-library')).toBe(
      'open',
    );
    const search = element.shadowRoot?.querySelector<HTMLInputElement>(
      'aside.library input[type="search"]',
    );
    if (search == null) throw new Error('Missing library search');
    search.focus();
    expect(element.shadowRoot?.activeElement).toBe(search);

    element.document = createBlueprintFixture({ roots: structuredRoots() });
    await element.updateComplete;
    expect(outlineEntries(element).map((entry) => entry.dataset.nodeId)).toEqual([
      'hero-1',
      'section-1',
      'text-1',
      'text-2',
    ]);
    expect(element.shadowRoot?.querySelector('.workspace')?.getAttribute('data-library')).toBe(
      'open',
    );
    expect(element.shadowRoot?.activeElement).toBe(search);
    element.remove();

    const inverse = await mountShell();
    const outline = inverse.shadowRoot?.querySelector<HTMLElement>('aside.outline');
    if (outline == null) throw new Error('Missing outline panel');
    outline.focus();
    expect(inverse.shadowRoot?.activeElement).toBe(outline);

    inverse.document = createBlueprintFixture({ roots: structuredRoots() });
    await inverse.updateComplete;
    expect(inverse.shadowRoot?.querySelector('.workspace')?.getAttribute('data-library')).toBe(
      'closed',
    );
    inverse.remove();
  });

  it('tracks the save state and emits studio-dirty-changed', async () => {
    const element = await mountShell({ roots: [] });
    const observed: boolean[] = [];
    element.addEventListener('studio-dirty-changed', (event: Event) => {
      observed.push((event as CustomEvent<{ dirty: boolean }>).detail.dirty);
    });

    expect(saveStateText(element)).toBe('Saved');

    element.execute(insertTextCommand(element));
    await element.updateComplete;
    expect(saveStateText(element)).toBe('Unsaved changes');
    expect(observed).toEqual([true]);

    element.markSaved('blueprint-r2');
    await element.updateComplete;
    expect(saveStateText(element)).toBe('Saved');
    expect(element.document?.revision).toBe('blueprint-r2');
    expect(observed).toEqual([true, false]);
    element.remove();
  });

  it('rebases a late save without replacing shell history or selection', async () => {
    const element = await mountShell({ roots: structuredRoots() });
    await selectNode(element, 'text-1');
    element.execute(insertTextCommand(element, 'saved-edit'));
    const savedStateVersion = element.stateVersion;
    element.execute(insertTextCommand(element, 'newer-edit'));

    element.markSaved('blueprint-r2', savedStateVersion);
    await element.updateComplete;

    expect(element.document?.revision).toBe('blueprint-r2');
    expect(element.stateVersion).toBe(2);
    expect(saveStateText(element)).toBe('Unsaved changes');
    expect(outlineEntry(element, 'text-1').getAttribute('aria-pressed')).toBe('true');

    expect(element.undo()).toMatchObject({ revision: 'blueprint-r2' });
    await element.updateComplete;
    expect(element.document?.roots.some((node) => node.id === 'newer-edit')).toBe(false);
    expect(outlineEntry(element, 'text-1').getAttribute('aria-pressed')).toBe('true');

    expect(element.redo()).toMatchObject({ revision: 'blueprint-r2' });
    await element.updateComplete;
    expect(element.document?.roots.some((node) => node.id === 'newer-edit')).toBe(true);
    expect(outlineEntry(element, 'text-1').getAttribute('aria-pressed')).toBe('true');
    element.remove();
  });
});

describe('layered structure navigation', () => {
  it('opens the structure view at the page level and keeps the whole tree', async () => {
    const element = await mountShell({ roots: structuredRoots() });

    expect(panelView(element)).toBe('structure');
    expect(workspace(element).hasAttribute('data-panel-scope')).toBe(false);
    expect(outlineEntries(element).map((entry) => entry.dataset.nodeId)).toEqual([
      'hero-1',
      'section-1',
      'text-1',
      'text-2',
    ]);
    expect(scopeBack(element)).toBeNull();
    expect(element.shadowRoot?.querySelector('aside.outline h2')?.textContent?.trim()).toBe(
      'Outline',
    );
    expect(element.shadowRoot?.querySelector('button.outline-open')).toBeNull();
    expect(element.shadowRoot?.querySelector('button.outline-edit')).toBeNull();
    expect(element.shadowRoot?.querySelector('button.outline-whole-tree')).toBeNull();
    element.remove();
  });

  it('drills into a container with Open and ArrowRight and lists only its slot children', async () => {
    const element = await mountShell({ roots: structuredRoots() });

    await selectNode(element, 'section-1');
    expect(controlButton(element, 'outline-edit').textContent?.trim()).toBe('Edit');
    expect(controlButton(element, 'outline-open').textContent?.trim()).toBe('Open');

    controlButton(element, 'outline-open').click();
    await settle(element);
    expect(panelView(element)).toBe('structure');
    expect(panelScope(element)).toBe('section-1');
    expect(outlineEntries(element).map((entry) => entry.dataset.nodeId)).toEqual([
      'text-1',
      'text-2',
    ]);
    expect(scopeBack(element)?.textContent).toContain('Back to Page');
    expect(
      element.shadowRoot
        ?.querySelector('aside.outline h2.outline-scope-heading')
        ?.textContent?.trim(),
    ).toBe('Section');
    expect(element.shadowRoot?.querySelector('button.outline-whole-tree')).not.toBeNull();
    expect(liveRegionText(element)).toBe('Showing Outline for Section');
    expect(activeOutlineNodeId(element)).toBe('text-1');
    // A leaf inside the level offers Edit but no Open.
    await selectNode(element, 'text-1');
    expect(controlButton(element, 'outline-edit')).toBeDefined();
    expect(element.shadowRoot?.querySelector('button.outline-open')).toBeNull();

    element.shadowRoot?.querySelector<HTMLButtonElement>('button.outline-whole-tree')?.click();
    await settle(element);
    expect(workspace(element).hasAttribute('data-panel-scope')).toBe(false);
    expect(outlineEntries(element).map((entry) => entry.dataset.nodeId)).toEqual([
      'hero-1',
      'section-1',
      'text-1',
      'text-2',
    ]);
    expect(scopeBack(element)).toBeNull();
    expect(activeOutlineNodeId(element)).toBe('section-1');
    expect(liveRegionText(element)).toBe('Showing Outline for Page');

    outlineEntry(element, 'section-1').focus();
    expect(keydown(outlineEntry(element, 'section-1'), 'ArrowRight').defaultPrevented).toBe(true);
    await settle(element);
    expect(panelScope(element)).toBe('section-1');
    expect(activeOutlineNodeId(element)).toBe('text-1');
    expect(liveRegionText(element)).toBe('Showing Outline for Section');

    expect(keydown(outlineEntry(element, 'text-1'), 'ArrowLeft').defaultPrevented).toBe(true);
    await settle(element);
    expect(workspace(element).hasAttribute('data-panel-scope')).toBe(false);
    expect(activeOutlineNodeId(element)).toBe('section-1');
    expect(liveRegionText(element)).toBe('Showing Outline for Page');
    // At the page level ArrowLeft has nothing to close and is left to the browser.
    expect(keydown(outlineEntry(element, 'section-1'), 'ArrowLeft').defaultPrevented).toBe(false);

    keydown(outlineEntry(element, 'section-1'), 'ArrowRight');
    await settle(element);
    expect(panelScope(element)).toBe('section-1');
    expect(keydown(outlineEntry(element, 'text-1'), 'Escape').defaultPrevented).toBe(true);
    await settle(element);
    expect(workspace(element).hasAttribute('data-panel-scope')).toBe(false);
    expect(activeOutlineNodeId(element)).toBe('section-1');
    // At the page level in the structure view Escape is not consumed.
    expect(keydown(outlineEntry(element, 'section-1'), 'Escape').defaultPrevented).toBe(false);
    element.remove();
  });

  it('ArrowRight on a block without children opens its details and focuses the first control', async () => {
    const element = await mountShell({
      definitions: [
        defineTestBlock({ label: 'Section', type: 'studio.core/section' }),
        {
          ...defineTestBlock({
            label: 'Text',
            propertySchema: {
              additionalProperties: false,
              properties: { text: { type: 'string' } },
              type: 'object',
            },
            type: 'studio.core/text',
          }),
          propertyControls: [{ control: 'org.example.catalog/plain-text', property: 'text' }],
        },
      ],
      roots: structuredRoots(),
    });

    outlineEntry(element, 'text-1').focus();
    expect(keydown(outlineEntry(element, 'text-1'), 'ArrowRight').defaultPrevented).toBe(true);
    await settle(element);

    expect(panelView(element)).toBe('details');
    expect(outlineEntry(element, 'text-1').getAttribute('aria-pressed')).toBe('true');
    const active = element.shadowRoot?.activeElement;
    expect(active?.closest('aside.inspector')).not.toBeNull();
    expect(active?.matches('.scalar-control input')).toBe(true);
    expect(liveRegionText(element)).toBe('Showing Inspector for Text');
    element.remove();
  });

  it('Edit opens the details view, Back returns to the selected entry, and each change is announced once', async () => {
    const roots = structuredRoots();
    const second = roots[1]?.slots.content?.[1];
    if (second === undefined) throw new Error('fixture requires text-2');
    second.properties = { align: 'start' };
    const element = await mountShell({ roots });

    await selectNode(element, 'text-2');
    expect(liveRegionText(element)).toBe('');
    controlButton(element, 'outline-edit').click();
    await settle(element);
    expect(panelView(element)).toBe('details');
    expect(workspace(element).getAttribute('data-pane')).toBe('inspector');
    expect(panelBack(element)?.textContent).toContain('Back');
    expect(liveRegionText(element)).toBe('Showing Inspector for Text');

    // A sentinel announcement, then the same layer again: the layer is not re-announced.
    const alignInput = element.shadowRoot?.querySelector<HTMLInputElement>(
      'aside.inspector input.inspector-property-input[data-property="align"]',
    );
    if (alignInput == null) throw new Error('Missing align input');
    keydown(alignInput, 'Escape');
    await element.updateComplete;
    expect(liveRegionText(element)).toBe('Edit cancelled. align kept its value.');
    controlButton(element, 'outline-edit').click();
    await settle(element);
    expect(panelView(element)).toBe('details');
    expect(liveRegionText(element)).toBe('Edit cancelled. align kept its value.');

    panelBack(element)?.click();
    await settle(element);
    expect(panelView(element)).toBe('structure');
    expect(workspace(element).getAttribute('data-pane')).toBe('outline');
    expect(activeOutlineNodeId(element)).toBe('text-2');
    expect(outlineEntry(element, 'text-2').getAttribute('aria-pressed')).toBe('true');
    expect(liveRegionText(element)).toBe('Showing Outline for Page');

    // After a layer change the same details layer is announced again, exactly once.
    controlButton(element, 'outline-edit').click();
    await settle(element);
    expect(liveRegionText(element)).toBe('Showing Inspector for Text');
    element.remove();
  });

  it('Escape unwinds details to structure only from the panel chrome and never from a value input', async () => {
    const roots = structuredRoots();
    const first = roots[1]?.slots.content?.[0];
    if (first === undefined) throw new Error('fixture requires text-1');
    first.properties = { align: 'start' };
    const element = await mountShell({ roots });

    await selectNode(element, 'text-1');
    element.revealInspector();
    await settle(element);
    expect(panelView(element)).toBe('details');
    const back = panelBack(element);
    if (back === null) throw new Error('Missing Back control');
    back.focus();
    expect(element.shadowRoot?.activeElement).toBe(back);
    expect(keydown(back, 'Escape').defaultPrevented).toBe(true);
    await settle(element);
    expect(panelView(element)).toBe('structure');
    expect(activeOutlineNodeId(element)).toBe('text-1');

    element.revealInspector();
    await settle(element);
    expect(panelView(element)).toBe('details');
    const alignInput = element.shadowRoot?.querySelector<HTMLInputElement>(
      'aside.inspector input.inspector-property-input[data-property="align"]',
    );
    if (alignInput == null) throw new Error('Missing align input');
    alignInput.focus();
    keydown(alignInput, 'Escape');
    await settle(element);
    expect(panelView(element)).toBe('details');
    const nameInput = element.shadowRoot?.querySelector<HTMLInputElement>(
      'aside.inspector input.inspector-add-property-name',
    );
    if (nameInput == null) throw new Error('Missing add-property input');
    nameInput.focus();
    expect(keydown(nameInput, 'Escape').defaultPrevented).toBe(false);
    await settle(element);
    expect(panelView(element)).toBe('details');

    // The command palette closes first; the panel stays where it is.
    keydown(workspace(element), 'k', { ctrlKey: true });
    await element.updateComplete;
    const paletteInput = element.shadowRoot?.querySelector<HTMLInputElement>(
      'section.command-palette input',
    );
    if (paletteInput == null) throw new Error('Missing command palette');
    expect(keydown(paletteInput, 'Escape').defaultPrevented).toBe(true);
    await settle(element);
    expect(element.shadowRoot?.querySelector('section.command-palette')).toBeNull();
    expect(panelView(element)).toBe('details');

    // From the page column Escape is not a panel key.
    const stage = element.shadowRoot?.querySelector<HTMLElement>('main.canvas');
    if (stage == null) throw new Error('Missing canvas');
    expect(keydown(stage, 'Escape').defaultPrevented).toBe(false);
    await settle(element);
    expect(panelView(element)).toBe('details');
    element.remove();
  });

  it('revealInspector() opens details without moving focus and selectNode() does not open them', async () => {
    const element = await mountShell({ roots: structuredRoots() });
    expect(element.shadowRoot?.activeElement).toBeNull();
    const before = liveRegionText(element);

    element.selectNode('text-1');
    await element.updateComplete;
    expect(panelView(element)).toBe('structure');
    expect(outlineEntry(element, 'text-1').getAttribute('aria-pressed')).toBe('true');

    element.revealInspector();
    await settle(element);
    expect(panelView(element)).toBe('details');
    expect(workspace(element).getAttribute('data-pane')).toBe('inspector');
    expect(element.shadowRoot?.activeElement).toBeNull();
    expect(liveRegionText(element)).toBe(before);
    element.remove();

    // Focus in a region the details view hides moves to the Back control.
    const blank = await mountShell();
    const search = blank.shadowRoot?.querySelector<HTMLInputElement>(
      'aside.library input[type="search"]',
    );
    if (search == null) throw new Error('Missing library search');
    search.focus();
    expect(blank.shadowRoot?.activeElement).toBe(search);
    blank.revealInspector();
    await settle(blank);
    expect(panelView(blank)).toBe('details');
    expect(blank.shadowRoot?.activeElement).toBe(panelBack(blank));
    blank.remove();
  });

  it('a structural outcome returns the structure view and lists the focus target without a second announcement', async () => {
    const element = await mountShell({ roots: structuredRoots() });

    await selectNode(element, 'section-1');
    controlButton(element, 'outline-open').click();
    await settle(element);
    expect(panelScope(element)).toBe('section-1');
    await selectNode(element, 'text-2');
    controlButton(element, 'outline-delete').click();
    await settle(element);
    expect(liveRegionText(element)).toBe('Deleted Text block');
    expect(panelScope(element)).toBe('section-1');
    expect(activeOutlineNodeId(element)).toBe('text-1');

    // The next target is the parent, which the level does not list: the
    // level falls back to the page without an announcement of its own.
    controlButton(element, 'outline-delete').click();
    await settle(element);
    expect(liveRegionText(element)).toBe('Deleted Text block');
    expect(workspace(element).hasAttribute('data-panel-scope')).toBe(false);
    expect(panelView(element)).toBe('structure');
    expect(activeOutlineNodeId(element)).toBe('section-1');
    element.remove();

    const inserting = await mountShell({ roots: structuredRoots() });
    await selectNode(inserting, 'text-1');
    controlButton(inserting, 'outline-edit').click();
    await settle(inserting);
    expect(panelView(inserting)).toBe('details');
    const before = outlineEntries(inserting).map((entry) => entry.dataset.nodeId);
    const palette = [
      ...(inserting.shadowRoot?.querySelectorAll<HTMLButtonElement>('.palette button') ?? []),
    ];
    palette.find((button) => button.textContent?.includes('Text'))?.click();
    await settle(inserting);
    expect(panelView(inserting)).toBe('structure');
    expect(liveRegionText(inserting)).toBe('Inserted Text');
    const inserted = activeOutlineNodeId(inserting);
    expect(inserted).toBeDefined();
    expect(before).not.toContain(inserted);
    expect(outlineEntry(inserting, inserted ?? '').getAttribute('aria-pressed')).toBe('true');
    inserting.remove();
  });

  it('a deleted level falls back to the page', async () => {
    const element = await mountShell({ roots: structuredRoots() });

    await selectNode(element, 'section-1');
    controlButton(element, 'outline-open').click();
    await settle(element);
    expect(panelScope(element)).toBe('section-1');

    element.execute(removeNodeCommand(element, 'section-1'));
    await settle(element);
    expect(workspace(element).hasAttribute('data-panel-scope')).toBe(false);
    expect(panelView(element)).toBe('structure');
    expect(scopeBack(element)).toBeNull();
    expect(outlineEntries(element).map((entry) => entry.dataset.nodeId)).toEqual(['hero-1']);
    element.remove();
  });

  it('maps the Outline and Inspector sheets to the two views and leaves the others alone', async () => {
    const element = await mountShell({ roots: structuredRoots() });
    const switcher = element.shadowRoot?.querySelector<HTMLElement>('nav.pane-switcher');
    if (switcher == null) throw new Error('Missing pane switcher');
    const original = switcher.getBoundingClientRect.bind(switcher);
    switcher.getBoundingClientRect = (): DOMRect => new DOMRect(0, 0, 390, 40);
    const paneButton = (label: string): HTMLButtonElement => {
      const button = [...switcher.querySelectorAll<HTMLButtonElement>('button')].find(
        (candidate) => candidate.textContent?.trim() === label,
      );
      if (button === undefined) throw new Error(`Missing pane button ${label}`);
      return button;
    };
    const before = liveRegionText(element);

    paneButton('Inspector').click();
    await element.updateComplete;
    expect(workspace(element).getAttribute('data-pane')).toBe('inspector');
    expect(panelView(element)).toBe('details');
    // Sheet switches are not announced.
    expect(liveRegionText(element)).toBe(before);

    // Without a selection Back focuses the outline region rather than nothing.
    const back = panelBack(element);
    if (back === null) throw new Error('Missing Back control');
    back.focus();
    back.click();
    await settle(element);
    expect(workspace(element).getAttribute('data-pane')).toBe('outline');
    expect(panelView(element)).toBe('structure');
    expect(element.shadowRoot?.activeElement).toBe(
      element.shadowRoot?.querySelector('aside.outline'),
    );
    expect(liveRegionText(element)).toBe('Showing Outline for Page');
    const afterBack = liveRegionText(element);

    paneButton('Inspector').click();
    await element.updateComplete;
    expect(panelView(element)).toBe('details');
    paneButton('Blocks').click();
    await element.updateComplete;
    expect(workspace(element).getAttribute('data-pane')).toBe('library');
    expect(panelView(element)).toBe('details');
    paneButton('Canvas').click();
    await element.updateComplete;
    expect(workspace(element).getAttribute('data-pane')).toBe('canvas');
    expect(panelView(element)).toBe('details');
    paneButton('Outline').click();
    await element.updateComplete;
    expect(workspace(element).getAttribute('data-pane')).toBe('outline');
    expect(panelView(element)).toBe('structure');
    // None of the four sheet switches announced anything.
    expect(liveRegionText(element)).toBe(afterBack);
    switcher.getBoundingClientRect = original;
    element.remove();
  });

  it('maps the contextual modes to layers and keeps the docked panel across a document replacement', async () => {
    const element = await mountShell({ roots: structuredRoots() });
    const before = liveRegionText(element);
    const inspector = element.shadowRoot?.querySelector<HTMLElement>('aside.inspector');
    if (inspector == null) throw new Error('Missing inspector');

    element.inspectorMode = 'content';
    await element.updateComplete;
    expect(panelView(element)).toBe('details');
    expect(workspace(element).getAttribute('data-pane')).toBe('inspector');
    expect(panelBack(element)).toBeNull();
    expect(keydown(inspector, 'Escape').defaultPrevented).toBe(false);
    await settle(element);
    expect(panelView(element)).toBe('details');

    element.inspectorMode = 'blueprint';
    await element.updateComplete;
    expect(panelView(element)).toBe('structure');
    expect(workspace(element).getAttribute('data-pane')).toBe('canvas');
    expect(panelBack(element)).not.toBeNull();

    element.inspectorMode = 'model';
    await element.updateComplete;
    expect(panelView(element)).toBe('details');
    expect(panelBack(element)).toBeNull();
    expect(keydown(inspector, 'Escape').defaultPrevented).toBe(false);
    await settle(element);
    expect(panelView(element)).toBe('details');
    expect(liveRegionText(element)).toBe(before);

    element.inspectorMode = 'blueprint';
    await element.updateComplete;
    await selectNode(element, 'section-1');
    controlButton(element, 'outline-open').click();
    await settle(element);
    expect(panelScope(element)).toBe('section-1');
    expect(liveRegionText(element)).toBe('Showing Outline for Section');
    const afterOpen = liveRegionText(element);
    element.inspectorMode = 'content';
    await element.updateComplete;
    expect(panelView(element)).toBe('details');
    expect(liveRegionText(element)).toBe(afterOpen);

    // A replaced host document while a docked panel shows keeps the details
    // layer and returns the structure layer to the page level, silently.
    element.document = createBlueprintFixture({ roots: structuredRoots() });
    await settle(element);
    expect(panelView(element)).toBe('details');
    expect(workspace(element).hasAttribute('data-panel-scope')).toBe(false);
    expect(panelBack(element)).toBeNull();
    expect(liveRegionText(element)).toBe(afterOpen);
    element.remove();
  });

  it('marks the listed ancestor when a deeper node is hovered inside an opened level', async () => {
    const element = await mountShell({
      roots: [
        blueprintNode('section-1', 'studio.core/section', [
          blueprintNode('columns-1', 'studio.core/section', [
            blueprintNode('text-3', 'studio.core/text'),
          ]),
        ]),
      ],
    });
    const hoveredIds = (): (string | undefined)[] =>
      [
        ...(element.shadowRoot?.querySelectorAll<HTMLButtonElement>(
          'button.outline-entry[data-hovered="true"]',
        ) ?? []),
      ].map((entry) => entry.dataset.nodeId);
    const hover = (nodeId: string): void => {
      outlineEntry(element, nodeId).dispatchEvent(
        new PointerEvent('pointerenter', { bubbles: false, composed: true }),
      );
    };

    await selectNode(element, 'section-1');
    controlButton(element, 'outline-open').click();
    await settle(element);
    expect(outlineEntries(element).map((entry) => entry.dataset.nodeId)).toEqual(['columns-1']);
    hover('columns-1');
    await element.updateComplete;
    expect(hoveredIds()).toEqual(['columns-1']);

    await selectNode(element, 'columns-1');
    controlButton(element, 'outline-open').click();
    await settle(element);
    expect(panelScope(element)).toBe('columns-1');
    expect(scopeBack(element)?.textContent).toContain('Back to Section');
    expect(outlineEntries(element).map((entry) => entry.dataset.nodeId)).toEqual(['text-3']);
    hover('text-3');
    await element.updateComplete;
    expect(hoveredIds()).toEqual(['text-3']);

    // Back one level: the hovered node is text-3, which this level does not
    // list, so its listed ancestor carries the indicator, and only it.
    keydown(outlineEntry(element, 'text-3'), 'ArrowLeft');
    await settle(element);
    expect(panelScope(element)).toBe('section-1');
    expect(activeOutlineNodeId(element)).toBe('columns-1');
    expect(hoveredIds()).toEqual(['columns-1']);
    element.remove();
  });

  it('keeps the docked panel when a diagnostic reveals its block in the contextual modes', async () => {
    const element = await mountShell({ roots: structuredRoots() });
    element.inspectorMode = 'content';
    await element.updateComplete;
    expect(panelView(element)).toBe('details');
    const before = liveRegionText(element);

    // hero-1 has no definition, so its block-unavailable diagnostic is node-located.
    const diagnostic = element.shadowRoot?.querySelector<HTMLButtonElement>(
      'button.diagnostic-entry[data-node-id="hero-1"]',
    );
    if (diagnostic == null) throw new Error('Missing node-located diagnostic');
    diagnostic.focus();
    diagnostic.click();
    await settle(element);
    expect(element.selection).toEqual(['hero-1']);
    // The structure view would hide the docked Content panel with no Back and
    // no Escape unwind, so the view and the sheet stay where they were.
    expect(panelView(element)).toBe('details');
    expect(workspace(element).getAttribute('data-pane')).toBe('inspector');
    expect(panelBack(element)).toBeNull();
    expect(liveRegionText(element)).toBe(before);

    // The Blueprint tab is the return; the revealed block is listed there.
    element.inspectorMode = 'blueprint';
    await settle(element);
    expect(panelView(element)).toBe('structure');
    expect(outlineEntry(element, 'hero-1').getAttribute('aria-pressed')).toBe('true');
    element.remove();
  });

  it('moves focus into the details region where the contextual modes render no Back', async () => {
    const element = await mountShell({ roots: structuredRoots() });
    const switcher = element.shadowRoot?.querySelector<HTMLElement>('nav.pane-switcher');
    if (switcher == null) throw new Error('Missing pane switcher');
    const original = switcher.getBoundingClientRect.bind(switcher);
    switcher.getBoundingClientRect = (): DOMRect => new DOMRect(0, 0, 390, 40);
    const inspector = element.shadowRoot?.querySelector<HTMLElement>('aside.inspector');
    if (inspector == null) throw new Error('Missing inspector');
    element.inspectorMode = 'content';
    await element.updateComplete;
    const outlineButton = [...switcher.querySelectorAll<HTMLButtonElement>('button')].find(
      (candidate) => candidate.textContent?.trim() === 'Outline',
    );
    if (outlineButton === undefined) throw new Error('Missing Outline pane button');

    // A host reveal while the Outline sheet holds focus.
    outlineButton.click();
    await element.updateComplete;
    expect(panelView(element)).toBe('structure');
    outlineEntry(element, 'text-1').focus();
    element.revealInspector();
    await settle(element);
    expect(panelView(element)).toBe('details');
    expect(workspace(element).getAttribute('data-pane')).toBe('inspector');
    expect(panelBack(element)).toBeNull();
    const active = element.shadowRoot?.activeElement ?? null;
    expect(active).not.toBeNull();
    expect(inspector.contains(active)).toBe(true);

    // The row's Edit with no focusable control in the docked panel.
    outlineButton.click();
    await element.updateComplete;
    await selectNode(element, 'text-1');
    controlButton(element, 'outline-edit').click();
    await settle(element);
    expect(panelView(element)).toBe('details');
    const afterEdit = element.shadowRoot?.activeElement ?? null;
    expect(afterEdit).not.toBeNull();
    expect(inspector.contains(afterEdit)).toBe(true);
    switcher.getBoundingClientRect = original;
    element.remove();
  });

  it('a level that loses its last child falls back to its parent with the container focused', async () => {
    const element = await mountShell({
      roots: [
        blueprintNode('hero-1', 'studio.core/hero'),
        blueprintNode('section-1', 'studio.core/section', [
          blueprintNode('text-1', 'studio.core/text'),
        ]),
      ],
    });

    await selectNode(element, 'section-1');
    controlButton(element, 'outline-open').click();
    await settle(element);
    expect(panelScope(element)).toBe('section-1');
    expect(activeOutlineNodeId(element)).toBe('text-1');

    // A host-run removal of the only listed row: the level is never shown
    // empty, and the container the row belonged to takes the focus.
    element.execute(removeNodeCommand(element, 'text-1'));
    await settle(element);
    expect(workspace(element).hasAttribute('data-panel-scope')).toBe(false);
    expect(panelView(element)).toBe('structure');
    expect(element.shadowRoot?.querySelector('aside.outline p.empty')).toBeNull();
    expect(outlineEntries(element).map((entry) => entry.dataset.nodeId)).toEqual([
      'hero-1',
      'section-1',
    ]);
    expect(activeOutlineNodeId(element)).toBe('section-1');

    // Undo restores the child; the author opens the level again and undoes an
    // insert whose entry holds focus, which is the same collapse.
    element.undo();
    await settle(element);
    expect(outlineEntries(element).map((entry) => entry.dataset.nodeId)).toEqual([
      'hero-1',
      'section-1',
      'text-1',
    ]);
    element.execute(removeNodeCommand(element, 'text-1'));
    await settle(element);
    element.execute({
      ...insertTextCommand(element, 'text-9'),
      payload: {
        destination: { parentNodeId: 'section-1', position: 0, slot: 'content' },
        node: blueprintNode('text-9', 'studio.core/text'),
      },
    });
    await settle(element);
    await selectNode(element, 'section-1');
    controlButton(element, 'outline-open').click();
    await settle(element);
    expect(panelScope(element)).toBe('section-1');
    expect(activeOutlineNodeId(element)).toBe('text-9');
    element.undo();
    await settle(element);
    expect(liveRegionText(element)).toBe('Undid change');
    expect(workspace(element).hasAttribute('data-panel-scope')).toBe(false);
    expect(element.shadowRoot?.querySelector('aside.outline p.empty')).toBeNull();
    expect(activeOutlineNodeId(element)).toBe('section-1');
    element.remove();
  });

  it('leaves a modified horizontal arrow to the platform', async () => {
    const element = await mountShell({ roots: structuredRoots() });

    for (const init of [
      { ctrlKey: true },
      { metaKey: true },
      { shiftKey: true },
      { altKey: true },
    ] as const) {
      expect(keydown(outlineEntry(element, 'section-1'), 'ArrowRight', init).defaultPrevented).toBe(
        false,
      );
      await settle(element);
      expect(workspace(element).hasAttribute('data-panel-scope')).toBe(false);
      expect(panelView(element)).toBe('structure');
    }

    keydown(outlineEntry(element, 'section-1'), 'ArrowRight');
    await settle(element);
    expect(panelScope(element)).toBe('section-1');
    expect(
      keydown(outlineEntry(element, 'text-1'), 'ArrowLeft', { altKey: true }).defaultPrevented,
    ).toBe(false);
    await settle(element);
    expect(panelScope(element)).toBe('section-1');
    element.remove();
  });

  it('returns the structure layer with focus and an announcement when the document is replaced under the details view', async () => {
    const roots = structuredRoots();
    const first = roots[1]?.slots.content?.[0];
    if (first === undefined) throw new Error('fixture requires text-1');
    first.properties = { align: 'start' };
    const element = await mountShell({ roots });

    await selectNode(element, 'text-1');
    controlButton(element, 'outline-edit').click();
    await settle(element);
    expect(panelView(element)).toBe('details');
    const control = element.shadowRoot?.activeElement ?? null;
    expect(control).not.toBeNull();
    expect(element.shadowRoot?.querySelector('aside.inspector')?.contains(control)).toBe(true);
    expect(liveRegionText(element)).toBe('Showing Inspector for Text');

    element.document = createBlueprintFixture({ roots: structuredRoots() });
    await settle(element);
    expect(panelView(element)).toBe('structure');
    expect(element.selection).toEqual([]);
    expect(element.shadowRoot?.activeElement).toBe(
      element.shadowRoot?.querySelector('aside.outline'),
    );
    expect(liveRegionText(element)).toBe('Showing Outline for Page');
    element.remove();
  });
});
