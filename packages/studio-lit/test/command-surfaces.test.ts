import { describe, expect, it } from 'vitest';
import type { BlockType, BlueprintDocument, BlueprintNode } from '@kumwe/studio-protocol';
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

function paletteRoots(): BlueprintNode[] {
  return [
    blueprintNode('section-1', 'studio.core/section', [
      blueprintNode('text-1', 'studio.core/text'),
      blueprintNode('text-2', 'studio.core/text'),
    ]),
  ];
}

function dragRoots(): BlueprintNode[] {
  return [
    blueprintNode('alpha', 'studio.core/text'),
    blueprintNode('beta', 'studio.core/text'),
    blueprintNode('gamma', 'studio.core/text'),
  ];
}

interface MountOptions {
  roots?: BlueprintNode[];
  sessionState?: 'editable' | 'read-only';
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
  element.document = createBlueprintFixture({ roots: options.roots ?? [] });
  document.body.append(element);
  await element.updateComplete;
  return element;
}

function toggleButton(element: KumweStudioElement): HTMLButtonElement {
  const button = element.shadowRoot?.querySelector<HTMLButtonElement>('.command-palette-toggle');
  if (button === null || button === undefined) {
    throw new Error('Missing command palette toggle');
  }
  return button;
}

function paletteSection(element: KumweStudioElement): HTMLElement | null {
  return element.shadowRoot?.querySelector<HTMLElement>('section.command-palette') ?? null;
}

function paletteInput(element: KumweStudioElement): HTMLInputElement {
  const input = element.shadowRoot?.querySelector<HTMLInputElement>('.command-palette input');
  if (input === null || input === undefined) {
    throw new Error('Missing command palette input');
  }
  return input;
}

function commandEntries(element: KumweStudioElement): HTMLButtonElement[] {
  return [
    ...(element.shadowRoot?.querySelectorAll<HTMLButtonElement>('button.command-entry') ?? []),
  ];
}

function commandEntry(element: KumweStudioElement, commandId: string): HTMLButtonElement {
  const entry = commandEntries(element).find(
    (candidate) => candidate.dataset.commandId === commandId,
  );
  if (entry === undefined) {
    throw new Error(`Missing command entry ${commandId}`);
  }
  return entry;
}

async function setFilter(element: KumweStudioElement, value: string): Promise<void> {
  const input = paletteInput(element);
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await element.updateComplete;
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

function canvasChip(element: KumweStudioElement, nodeId: string): HTMLButtonElement {
  const chips = element.shadowRoot?.querySelectorAll<HTMLButtonElement>('button.canvas-chip') ?? [];
  const chip = [...chips].find((candidate) => candidate.dataset.nodeId === nodeId);
  if (chip === undefined) {
    throw new Error(`Missing canvas chip for ${nodeId}`);
  }
  return chip;
}

function dropIndicator(element: KumweStudioElement): HTMLElement | null {
  return element.shadowRoot?.querySelector<HTMLElement>('.drop-indicator') ?? null;
}

function liveRegionText(element: KumweStudioElement): string {
  return element.shadowRoot?.querySelector('[aria-live="polite"]')?.textContent ?? '';
}

function activeElement(element: KumweStudioElement): Element | null {
  return element.shadowRoot?.activeElement ?? null;
}

function keydown(init: KeyboardEventInit): KeyboardEvent {
  return new KeyboardEvent('keydown', { bubbles: true, cancelable: true, composed: true, ...init });
}

function pointer(type: string, pointerId: number): PointerEvent {
  return new PointerEvent(type, {
    bubbles: true,
    button: 0,
    cancelable: true,
    composed: true,
    pointerId,
  });
}

function documentSnapshot(element: KumweStudioElement): BlueprintDocument {
  return JSON.parse(JSON.stringify(element.document)) as BlueprintDocument;
}

describe('command palette', () => {
  it('opens with Ctrl+K or Meta+K and Escape restores focus to the invoker', async () => {
    const element = await mountShell({ roots: paletteRoots() });
    expect(paletteSection(element)).toBeNull();
    expect(toggleButton(element).getAttribute('aria-expanded')).toBe('false');

    const invoker = outlineEntry(element, 'section-1');
    invoker.focus();
    invoker.dispatchEvent(keydown({ ctrlKey: true, key: 'k' }));
    await element.updateComplete;

    expect(paletteSection(element)).not.toBeNull();
    expect(toggleButton(element).getAttribute('aria-expanded')).toBe('true');
    expect(activeElement(element)).toBe(paletteInput(element));

    paletteInput(element).dispatchEvent(keydown({ key: 'Escape' }));
    await element.updateComplete;

    expect(paletteSection(element)).toBeNull();
    expect(toggleButton(element).getAttribute('aria-expanded')).toBe('false');
    expect(activeElement(element)).toBe(invoker);

    invoker.dispatchEvent(keydown({ key: 'k', metaKey: true }));
    await element.updateComplete;
    expect(paletteSection(element)).not.toBeNull();
    element.remove();
  });

  it('opens through the visible toolbar button', async () => {
    const element = await mountShell({ roots: paletteRoots() });

    toggleButton(element).click();
    await element.updateComplete;
    expect(paletteSection(element)).not.toBeNull();
    expect(toggleButton(element).getAttribute('aria-expanded')).toBe('true');

    toggleButton(element).click();
    await element.updateComplete;
    expect(paletteSection(element)).toBeNull();
    element.remove();
  });

  it('exposes every structural operation of the selection and filters case-insensitively', async () => {
    const element = await mountShell({ roots: paletteRoots() });
    await selectNode(element, 'section-1');
    toggleButton(element).click();
    await element.updateComplete;

    expect(commandEntries(element).map((entry) => entry.dataset.commandId)).toEqual([
      'move-up',
      'move-down',
      'duplicate',
      'delete',
      'undo',
      'redo',
      'clear-selection',
      'insert-studio.core/section@1.0.0',
      'insert-studio.core/text@1.0.0',
    ]);

    await setFilter(element, 'MOVE');
    expect(commandEntries(element).map((entry) => entry.dataset.commandId)).toEqual([
      'move-up',
      'move-down',
    ]);

    await setFilter(element, 'insert');
    expect(commandEntries(element).map((entry) => entry.dataset.commandId)).toEqual([
      'insert-studio.core/section@1.0.0',
      'insert-studio.core/text@1.0.0',
    ]);

    await setFilter(element, 'no such command');
    expect(commandEntries(element)).toHaveLength(0);
    expect(paletteSection(element)?.textContent).toContain('No commands match the filter.');
    element.remove();
  });

  it('runs the first enabled entry on Enter and applies the real command', async () => {
    const element = await mountShell({ roots: paletteRoots() });
    await selectNode(element, 'text-1');
    toggleButton(element).click();
    await element.updateComplete;

    await setFilter(element, 'move down');
    paletteInput(element).dispatchEvent(keydown({ key: 'Enter' }));
    await element.updateComplete;

    const section = element.document?.roots.find((root) => root.id === 'section-1');
    expect(section?.slots.content?.map((child) => child.id)).toEqual(['text-2', 'text-1']);
    expect(liveRegionText(element)).toContain('Moved Text down');
    expect(paletteSection(element)).toBeNull();
    const active = activeElement(element);
    expect(active instanceof HTMLElement ? active.dataset.nodeId : undefined).toBe('text-1');
    element.remove();
  });

  it('navigates the results with ArrowUp and ArrowDown', async () => {
    const element = await mountShell({ roots: paletteRoots() });
    toggleButton(element).click();
    await element.updateComplete;

    // Without selection and history the only enabled entries are the inserts.
    paletteInput(element).dispatchEvent(keydown({ key: 'ArrowDown' }));
    let active = activeElement(element);
    expect(active instanceof HTMLElement ? active.dataset.commandId : undefined).toBe(
      'insert-studio.core/section@1.0.0',
    );

    active?.dispatchEvent(keydown({ key: 'ArrowDown' }));
    active = activeElement(element);
    expect(active instanceof HTMLElement ? active.dataset.commandId : undefined).toBe(
      'insert-studio.core/text@1.0.0',
    );

    active?.dispatchEvent(keydown({ key: 'ArrowUp' }));
    active = activeElement(element);
    expect(active instanceof HTMLElement ? active.dataset.commandId : undefined).toBe(
      'insert-studio.core/section@1.0.0',
    );

    active?.dispatchEvent(keydown({ key: 'ArrowUp' }));
    expect(activeElement(element)).toBe(paletteInput(element));
    element.remove();
  });

  it('inserts at the end of the roots, or into the first declared slot of the selection', async () => {
    const element = await mountShell({ roots: paletteRoots() });

    toggleButton(element).click();
    await element.updateComplete;
    commandEntry(element, 'insert-studio.core/text@1.0.0').click();
    await element.updateComplete;

    expect(element.document?.roots.map((root) => root.id)).toEqual(['section-1', 'text-3']);
    expect(element.document?.roots[1]?.type).toBe('studio.core/text');
    expect(liveRegionText(element)).toContain('Inserted Text');
    expect(outlineEntry(element, 'text-3').getAttribute('aria-pressed')).toBe('true');

    await selectNode(element, 'section-1');
    toggleButton(element).click();
    await element.updateComplete;
    commandEntry(element, 'insert-studio.core/text@1.0.0').click();
    await element.updateComplete;

    const section = element.document?.roots.find((root) => root.id === 'section-1');
    expect(section?.slots.content?.map((child) => child.id)).toEqual([
      'text-1',
      'text-2',
      'text-4',
    ]);
    expect(element.document?.roots).toHaveLength(2);
    element.remove();
  });

  it('disables every mutating entry in read-only sessions but keeps clearing selection', async () => {
    const element = await mountShell({ roots: paletteRoots(), sessionState: 'read-only' });
    await selectNode(element, 'text-1');
    const before = documentSnapshot(element);

    toggleButton(element).click();
    await element.updateComplete;

    for (const commandId of [
      'move-up',
      'move-down',
      'duplicate',
      'delete',
      'undo',
      'redo',
      'insert-studio.core/section@1.0.0',
      'insert-studio.core/text@1.0.0',
    ]) {
      expect(commandEntry(element, commandId).disabled).toBe(true);
    }
    expect(commandEntry(element, 'clear-selection').disabled).toBe(false);

    commandEntry(element, 'insert-studio.core/text@1.0.0').click();
    await element.updateComplete;
    expect(element.document).toEqual(before);

    commandEntry(element, 'clear-selection').click();
    await element.updateComplete;
    expect(outlineEntry(element, 'text-1').getAttribute('aria-pressed')).toBe('false');
    expect(liveRegionText(element)).toContain('Selection cleared');
    expect(element.document).toEqual(before);
    element.remove();
  });
});

describe('canvas pointer drag', () => {
  it('reorders within the collection through reorder-children and announces the drop', async () => {
    const element = await mountShell({ roots: dragRoots() });

    canvasChip(element, 'alpha').dispatchEvent(pointer('pointerdown', 7));
    expect(dropIndicator(element)).toBeNull();

    canvasChip(element, 'gamma').dispatchEvent(pointer('pointermove', 7));
    await element.updateComplete;
    expect(dropIndicator(element)?.textContent).toContain('Moving Text to position 3 of 3');

    canvasChip(element, 'gamma').dispatchEvent(pointer('pointerup', 7));
    await element.updateComplete;

    expect(element.document?.roots.map((root) => root.id)).toEqual(['beta', 'gamma', 'alpha']);
    expect(liveRegionText(element)).toContain('Moved Text to position 3 of 3');
    expect(dropIndicator(element)).toBeNull();
    expect(canvasChip(element, 'alpha').getAttribute('aria-pressed')).toBe('true');

    element.undo();
    await element.updateComplete;
    expect(element.document?.roots.map((root) => root.id)).toEqual(['alpha', 'beta', 'gamma']);
    element.remove();
  });

  it('leaves the document unchanged when Escape cancels a drag', async () => {
    const element = await mountShell({ roots: dragRoots() });
    const before = documentSnapshot(element);

    canvasChip(element, 'alpha').dispatchEvent(pointer('pointerdown', 3));
    canvasChip(element, 'beta').dispatchEvent(pointer('pointermove', 3));
    await element.updateComplete;
    expect(dropIndicator(element)).not.toBeNull();

    canvasChip(element, 'beta').dispatchEvent(keydown({ key: 'Escape' }));
    await element.updateComplete;

    expect(dropIndicator(element)).toBeNull();
    expect(element.document).toEqual(before);
    expect(liveRegionText(element)).toContain('Reorder cancelled. Text kept its position.');

    // The released pointer is inert after the cancellation.
    canvasChip(element, 'gamma').dispatchEvent(pointer('pointerup', 3));
    await element.updateComplete;
    expect(element.document).toEqual(before);
    element.remove();
  });

  it('treats pointercancel and a same-position drop as no-ops', async () => {
    const element = await mountShell({ roots: dragRoots() });
    const before = documentSnapshot(element);

    canvasChip(element, 'alpha').dispatchEvent(pointer('pointerdown', 5));
    canvasChip(element, 'beta').dispatchEvent(pointer('pointermove', 5));
    await element.updateComplete;
    canvasChip(element, 'beta').dispatchEvent(pointer('pointercancel', 5));
    await element.updateComplete;

    expect(element.document).toEqual(before);
    expect(dropIndicator(element)).toBeNull();
    expect(liveRegionText(element)).toContain('Reorder cancelled. Text kept its position.');

    canvasChip(element, 'alpha').dispatchEvent(pointer('pointerdown', 6));
    canvasChip(element, 'gamma').dispatchEvent(pointer('pointermove', 6));
    canvasChip(element, 'alpha').dispatchEvent(pointer('pointermove', 6));
    canvasChip(element, 'alpha').dispatchEvent(pointer('pointerup', 6));
    await element.updateComplete;

    expect(element.document).toEqual(before);
    element.remove();
  });

  it('ignores pointer drags entirely in read-only sessions', async () => {
    const element = await mountShell({ roots: dragRoots(), sessionState: 'read-only' });
    const before = documentSnapshot(element);

    canvasChip(element, 'alpha').dispatchEvent(pointer('pointerdown', 9));
    canvasChip(element, 'gamma').dispatchEvent(pointer('pointermove', 9));
    await element.updateComplete;
    expect(dropIndicator(element)).toBeNull();

    canvasChip(element, 'gamma').dispatchEvent(pointer('pointerup', 9));
    await element.updateComplete;

    expect(element.document).toEqual(before);
    expect(liveRegionText(element)).not.toContain('Moved');
    element.remove();
  });
});
