import { describe, expect, it } from 'vitest';
import {
  STUDIO_CONTRACT_VERSION,
  type BlockDefinition,
  type BlockType,
  type BlueprintNode,
  type InsertNodeCommand,
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
    element.messages = {
      'studio.shell/outline-heading': { defaultMessage: 'Struktur' },
      'studio.shell/palette-heading': { defaultMessage: 'Bausteine' },
    };
    await element.updateComplete;

    expect(element.shadowRoot?.textContent).toContain('Bausteine');
    expect(element.shadowRoot?.textContent).toContain('Struktur');
    expect(element.shadowRoot?.querySelector('aside[aria-label="Struktur"]')).not.toBeNull();
    element.remove();
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

    element.markSaved();
    await element.updateComplete;
    expect(saveStateText(element)).toBe('Saved');
    expect(observed).toEqual([true, false]);
    element.remove();
  });
});
