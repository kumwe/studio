import { describe, expect, it } from 'vitest';
import {
  STUDIO_CONTRACT_VERSION,
  type BlockType,
  type BlueprintDocument,
  type BlueprintNode,
  type PatternDocument,
  type RemoveNodeCommand,
} from '@kumwe/studio-protocol';
import {
  createBlueprintFixture,
  createStudioConfigurationFixture,
  defineTestBlock,
} from '@kumwe/studio-testkit';
import {
  defineKumweStudio,
  KumweStudioElement,
  type StudioInsertRequestDetail,
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
  maxHistoryEntries?: number;
  minimumChildren?: number;
  roots?: BlueprintNode[];
  sessionState?: 'editable' | 'read-only';
}

async function mountShell(options: MountOptions = {}): Promise<KumweStudioElement> {
  defineKumweStudio();
  const element = new KumweStudioElement();
  const session = createStudioConfigurationFixture(
    options.sessionState === undefined ? {} : { sessionState: options.sessionState },
  );
  if (options.maxHistoryEntries !== undefined) {
    session.limits.maxHistoryEntries = options.maxHistoryEntries;
  }
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
            minimum: options.minimumChildren ?? 0,
            ordered: true,
          },
        ],
        type: 'studio.core/section',
      }),
      defineTestBlock({ label: 'Text', type: 'studio.core/text' }),
    ],
    session,
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

/** Two update rounds: the render, then the focus placement queued behind it. */
async function settle(element: KumweStudioElement): Promise<void> {
  await element.updateComplete;
  await element.updateComplete;
}

/** The add layer's destination line, trimmed, or null when no destination is pending. */
function libraryDestination(element: KumweStudioElement): string | null {
  const line = element.shadowRoot?.querySelector('p.library-destination#library-destination');
  return line === null || line === undefined ? null : (line.textContent ?? '').trim();
}

function librarySearch(element: KumweStudioElement): HTMLInputElement {
  const input = element.shadowRoot?.querySelector<HTMLInputElement>(
    'aside.library input[type="search"]',
  );
  if (input === null || input === undefined) {
    throw new Error('Missing library search');
  }
  return input;
}

function libraryState(element: KumweStudioElement): string | null {
  return element.shadowRoot?.querySelector('.workspace')?.getAttribute('data-library') ?? null;
}

function paletteBlock(element: KumweStudioElement, type: string): HTMLButtonElement {
  const button = element.shadowRoot?.querySelector<HTMLButtonElement>(
    `.palette button.palette-block[data-block-type="${type}"]`,
  );
  if (button === null || button === undefined) {
    throw new Error(`Missing palette card ${type}`);
  }
  return button;
}

function addControl(element: KumweStudioElement, selector: string): HTMLButtonElement {
  const button = element.shadowRoot?.querySelector<HTMLButtonElement>(
    `.outline-controls button.${selector}`,
  );
  if (button === null || button === undefined) {
    throw new Error(`Missing add control ${selector}`);
  }
  return button;
}

/** A `+` control's visible name: its text without the decorative, hidden glyph. */
function addLabel(button: HTMLButtonElement): string {
  const glyph = button.querySelector('.add-glyph');
  expect(glyph?.getAttribute('aria-hidden')).toBe('true');
  const copy = button.cloneNode(true) as HTMLButtonElement;
  copy.querySelector('.add-glyph')?.remove();
  return (copy.textContent ?? '').trim();
}

function zoneButtons(element: KumweStudioElement): HTMLButtonElement[] {
  return [
    ...(element.shadowRoot?.querySelectorAll<HTMLButtonElement>(
      'main.canvas div.canvas-add-zones[role="group"] > button.canvas-add-into',
    ) ?? []),
  ];
}

function insertRequests(element: KumweStudioElement): StudioInsertRequestDetail[] {
  const details: StudioInsertRequestDetail[] = [];
  element.addEventListener('studio-insert-request', (event: Event) => {
    details.push((event as CustomEvent<StudioInsertRequestDetail>).detail);
  });
  return details;
}

function slotIds(element: KumweStudioElement, parentId: string): string[] | undefined {
  return element.document?.roots
    .find((root) => root.id === parentId)
    ?.slots.content?.map((child) => child.id);
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
      'restore-last-deleted',
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

  it('dispatches first-class restore-node for the last deleted subtree', async () => {
    const element = await mountShell({ roots: paletteRoots() });
    const commands: string[] = [];
    element.addEventListener('studio-document-change', (event) => {
      const command = (event as CustomEvent<{ command: { type: string } | null }>).detail.command;
      if (command !== null) {
        commands.push(command.type);
      }
    });
    await selectNode(element, 'text-1');
    element.shadowRoot?.querySelector<HTMLButtonElement>('.outline-delete')?.click();
    await element.updateComplete;
    expect(commands.at(-1)).toBe('studio.command/remove-node');
    expect(element.document?.roots[0]?.slots.content?.map((child) => child.id)).toEqual(['text-2']);

    toggleButton(element).click();
    await element.updateComplete;
    const restore = commandEntry(element, 'restore-last-deleted');
    expect(restore.disabled).toBe(false);
    restore.click();
    await element.updateComplete;

    expect(commands.at(-1)).toBe('studio.command/restore-node');
    expect(element.document?.roots[0]?.slots.content?.map((child) => child.id)).toEqual([
      'text-1',
      'text-2',
    ]);
    expect(liveRegionText(element)).toContain('Restored Text block');
    element.remove();
  });

  it('bounds the restore journal to the configured session history limit', async () => {
    const element = await mountShell({ maxHistoryEntries: 1, roots: paletteRoots() });

    await selectNode(element, 'text-1');
    element.shadowRoot?.querySelector<HTMLButtonElement>('.outline-delete')?.click();
    await element.updateComplete;
    await selectNode(element, 'text-2');
    element.shadowRoot?.querySelector<HTMLButtonElement>('.outline-delete')?.click();
    await element.updateComplete;

    toggleButton(element).click();
    await element.updateComplete;
    commandEntry(element, 'restore-last-deleted').click();
    await element.updateComplete;
    expect(element.document?.roots[0]?.slots.content?.map((child) => child.id)).toEqual(['text-2']);

    toggleButton(element).click();
    await element.updateComplete;
    expect(commandEntry(element, 'restore-last-deleted').disabled).toBe(true);
    element.remove();
  });

  it('applies a validated pattern through the canonical apply-pattern command', async () => {
    const element = await mountShell({ roots: [] });
    const pattern: PatternDocument = {
      blockDependencies: [],
      contractVersion: STUDIO_CONTRACT_VERSION,
      id: 'studio.test/hero-pattern',
      kind: 'pattern',
      label: { defaultMessage: 'Hero', key: 'studio.test/hero-pattern' },
      owner: { id: 'studio.test/suite', version: '1.0.0' },
      revision: 'hero-r1',
      roots: [blueprintNode('hero-text', 'studio.core/text')],
      version: '1.0.0',
    };
    let commandType: string | undefined;
    element.addEventListener('studio-document-change', (event) => {
      commandType = (event as CustomEvent<{ command: { type: string } | null }>).detail.command
        ?.type;
    });
    element.patterns = [pattern];
    await element.updateComplete;
    const apply = element.shadowRoot?.querySelector<HTMLButtonElement>(
      '.pattern-apply[data-pattern-id="studio.test/hero-pattern"]',
    );
    expect(apply?.disabled).toBe(false);
    apply?.click();
    await element.updateComplete;

    expect(commandType).toBe('studio.command/apply-pattern');
    expect(element.document?.roots[0]?.id).toBe('hero-text-pattern-1');
    expect(element.document?.roots[0]?.extensions?.['studio.pattern/source']).toEqual({
      id: 'studio.test/hero-pattern',
      revision: 'hero-r1',
      version: '1.0.0',
    });
    expect(liveRegionText(element)).toContain('Applied the Hero pattern');
    element.remove();
  });

  it('does not offer a reparent target that would violate the source slot minimum', async () => {
    const element = await mountShell({
      minimumChildren: 1,
      roots: [
        blueprintNode('section-1', 'studio.core/section', [
          blueprintNode('text-1', 'studio.core/text'),
        ]),
        blueprintNode('section-2', 'studio.core/section'),
      ],
    });
    await selectNode(element, 'text-1');

    const destination = element.shadowRoot?.querySelector<HTMLSelectElement>(
      '.outline-move-destination',
    );
    expect(destination?.disabled).toBe(true);
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

/** SR-036: every `+` carries an explicit parent, slot and position with non-drag parity. */
describe('explicit insertion destinations', () => {
  it('Add block after and before dispatch the request with the explicit position and insert there', async () => {
    const element = await mountShell({ roots: paletteRoots() });
    const requests = insertRequests(element);
    await selectNode(element, 'text-1');
    expect(libraryState(element)).toBe('closed');
    expect(addLabel(addControl(element, 'outline-add-after'))).toBe('Add block after');
    expect(addLabel(addControl(element, 'outline-add-before'))).toBe('Add block before');

    addControl(element, 'outline-add-after').click();
    await settle(element);
    expect(libraryState(element)).toBe('open');
    expect(libraryDestination(element)).toBe(
      'Adding to Section (section-1): Content slot, position 2 of 3',
    );
    expect(activeElement(element)).toBe(librarySearch(element));
    expect(librarySearch(element).getAttribute('aria-describedby')).toBe('library-destination');
    // The content slot accepts only Text: the Section card is disabled, never redirected.
    expect(paletteBlock(element, 'studio.core/section').disabled).toBe(true);
    expect(paletteBlock(element, 'studio.core/text').disabled).toBe(false);
    expect(requests).toEqual([]);

    paletteBlock(element, 'studio.core/text').click();
    await settle(element);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      definition: expect.objectContaining({ type: 'studio.core/text' }) as unknown,
      parentId: 'section-1',
      position: 1,
      slot: 'content',
    });
    expect(requests[0]).not.toHaveProperty('operations');
    expect(slotIds(element, 'section-1')).toEqual(['text-1', 'text-3', 'text-2']);
    expect(liveRegionText(element)).toBe('Inserted Text');
    expect(libraryDestination(element)).toBeNull();
    expect(librarySearch(element).hasAttribute('aria-describedby')).toBe(false);
    expect(activeElement(element)).toBe(outlineEntry(element, 'text-3'));
    expect(paletteBlock(element, 'studio.core/section').disabled).toBe(false);

    // The first position of a non-empty slot is reachable without dragging.
    await selectNode(element, 'text-1');
    addControl(element, 'outline-add-before').click();
    await settle(element);
    expect(libraryDestination(element)).toBe(
      'Adding to Section (section-1): Content slot, position 1 of 4',
    );
    paletteBlock(element, 'studio.core/text').click();
    await settle(element);
    expect(requests).toHaveLength(2);
    expect(requests[1]).toMatchObject({ parentId: 'section-1', position: 0, slot: 'content' });
    expect(slotIds(element, 'section-1')).toEqual(['text-4', 'text-1', 'text-3', 'text-2']);
    expect(libraryDestination(element)).toBeNull();
    element.remove();
  });

  it('Add to page and Add block into carry their destinations and the command palette follows the pending one', async () => {
    const element = await mountShell({ roots: paletteRoots() });
    const requests = insertRequests(element);

    const addToPage = element.shadowRoot?.querySelector<HTMLButtonElement>(
      'aside.outline div.outline-level-add > button.outline-add-page',
    );
    if (addToPage === null || addToPage === undefined) throw new Error('Missing Add to page');
    expect(addLabel(addToPage)).toBe('Add to page');
    addToPage.click();
    await settle(element);
    expect(libraryDestination(element)).toBe('Adding to document roots, position 2 of 2');
    expect(activeElement(element)).toBe(librarySearch(element));
    expect(paletteBlock(element, 'studio.core/section').disabled).toBe(false);
    paletteBlock(element, 'studio.core/text').click();
    await settle(element);
    expect(element.document?.roots.map((root) => root.id)).toEqual(['section-1', 'text-3']);
    expect(requests.at(-1)).toMatchObject({ parentId: null, position: 1 });
    expect(requests.at(-1)).not.toHaveProperty('slot');

    await selectNode(element, 'section-1');
    const into = addControl(element, 'outline-add-into[data-slot="content"]');
    expect(addLabel(into)).toBe('Add block into Content');
    into.click();
    await settle(element);
    expect(libraryDestination(element)).toBe(
      'Adding to Section (section-1): Content slot, position 3 of 3',
    );
    expect(paletteBlock(element, 'studio.core/section').disabled).toBe(true);

    // The command palette inserts where the add layer says (SR-021 parity).
    const invoker = outlineEntry(element, 'section-1');
    invoker.focus();
    invoker.dispatchEvent(keydown({ ctrlKey: true, key: 'k' }));
    await element.updateComplete;
    expect(paletteSection(element)).not.toBeNull();
    expect(libraryDestination(element)).toBe(
      'Adding to Section (section-1): Content slot, position 3 of 3',
    );
    expect(commandEntry(element, 'insert-studio.core/section@1.0.0').disabled).toBe(true);
    expect(commandEntry(element, 'insert-studio.core/text@1.0.0').disabled).toBe(false);
    commandEntry(element, 'insert-studio.core/text@1.0.0').click();
    await settle(element);

    expect(slotIds(element, 'section-1')).toEqual(['text-1', 'text-2', 'text-4']);
    expect(element.document?.roots).toHaveLength(2);
    expect(liveRegionText(element)).toBe('Inserted Text');
    expect(libraryDestination(element)).toBeNull();
    expect(paletteBlock(element, 'studio.core/section').disabled).toBe(false);
    element.remove();
  });

  it('a host that takes ownership receives the position and the shell inserts nothing more', async () => {
    const element = await mountShell({ roots: paletteRoots() });
    const requests = insertRequests(element);
    element.addEventListener('studio-insert-request', (event) => {
      event.preventDefault();
    });
    const before = documentSnapshot(element);
    // A card without a pending destination opens with the library closed on
    // a non-empty page; the request still names its default position.
    element.shadowRoot?.querySelector<HTMLButtonElement>('button.add-blocks-toggle')?.click();
    await settle(element);
    paletteBlock(element, 'studio.core/text').click();
    await settle(element);
    expect(requests.at(-1)).toMatchObject({ parentId: null, position: 1 });
    expect(element.document).toEqual(before);

    await selectNode(element, 'text-2');
    addControl(element, 'outline-add-after').click();
    await settle(element);
    expect(libraryDestination(element)).toBe(
      'Adding to Section (section-1): Content slot, position 3 of 3',
    );
    paletteBlock(element, 'studio.core/text').click();
    await settle(element);

    expect(requests).toHaveLength(2);
    expect(requests[1]).toMatchObject({
      definition: expect.objectContaining({ type: 'studio.core/text' }) as unknown,
      parentId: 'section-1',
      position: 2,
      slot: 'content',
    });
    expect(element.document).toEqual(before);
    // The request is the destination's outcome, whoever performs it.
    expect(libraryDestination(element)).toBeNull();
    element.remove();
  });

  it('Escape in the add layer and a changed selection clear the pending destination; a stale one is pruned', async () => {
    const element = await mountShell({ roots: paletteRoots() });
    await selectNode(element, 'text-1');
    addControl(element, 'outline-add-after').click();
    await settle(element);
    expect(libraryDestination(element)).not.toBeNull();

    // While the search field has text, Escape stays the field's own key.
    const search = librarySearch(element);
    search.value = 'Te';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    await element.updateComplete;
    const typed = keydown({ key: 'Escape' });
    search.dispatchEvent(typed);
    await element.updateComplete;
    expect(typed.defaultPrevented).toBe(false);
    expect(libraryDestination(element)).not.toBeNull();

    search.value = '';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    await element.updateComplete;
    const escape = keydown({ key: 'Escape' });
    search.dispatchEvent(escape);
    await settle(element);
    expect(escape.defaultPrevented).toBe(true);
    expect(libraryDestination(element)).toBeNull();
    expect(libraryState(element)).toBe('open');
    expect(activeElement(element)).toBe(search);
    expect(search.hasAttribute('aria-describedby')).toBe(false);

    addControl(element, 'outline-add-after').click();
    await settle(element);
    expect(libraryDestination(element)).not.toBeNull();
    await selectNode(element, 'text-2');
    expect(libraryDestination(element)).toBeNull();

    await selectNode(element, 'section-1');
    addControl(element, 'outline-add-into[data-slot="content"]').click();
    await settle(element);
    expect(paletteBlock(element, 'studio.core/section').disabled).toBe(true);
    element.execute(removeNodeCommand(element, 'section-1'));
    await settle(element);
    expect(element.document?.roots).toEqual([]);
    expect(libraryDestination(element)).toBeNull();
    expect(paletteBlock(element, 'studio.core/section').disabled).toBe(false);
    expect(paletteBlock(element, 'studio.core/text').disabled).toBe(false);
    paletteBlock(element, 'studio.core/text').click();
    await settle(element);
    expect(element.document?.roots.map((root) => root.id)).toEqual(['text-1']);
    element.remove();

    // A destination past the end of a shrunken collection is pruned even
    // though the selection never changed.
    const page = await mountShell({ roots: dragRoots() });
    page.shadowRoot
      ?.querySelector<HTMLButtonElement>('div.outline-level-add > button.outline-add-page')
      ?.click();
    await settle(page);
    expect(libraryDestination(page)).toBe('Adding to document roots, position 4 of 4');
    page.execute(removeNodeCommand(page, 'gamma'));
    await settle(page);
    expect(libraryDestination(page)).toBeNull();
    page.remove();
  });

  it('a pending destination ends when its own collection changes and survives changes elsewhere', async () => {
    // A move: the selection never changes, but the position would now name a
    // place after alpha rather than after beta.
    const page = await mountShell({ roots: dragRoots() });
    await selectNode(page, 'beta');
    addControl(page, 'outline-add-after').click();
    await settle(page);
    expect(libraryDestination(page)).toBe('Adding to document roots, position 3 of 4');
    addControl(page, 'outline-move-up').click();
    await settle(page);
    expect(page.document?.roots.map((root) => root.id)).toEqual(['beta', 'alpha', 'gamma']);
    expect(page.selection).toEqual(['beta']);
    expect(libraryDestination(page)).toBeNull();
    // The card follows the selection-derived default (the end of the roots,
    // since Text declares no slot), never the stale position.
    paletteBlock(page, 'studio.core/text').click();
    await settle(page);
    expect(page.document?.roots.map((root) => root.id)).toEqual([
      'beta',
      'alpha',
      'gamma',
      'text-1',
    ]);
    page.remove();

    const element = await mountShell({
      roots: [...paletteRoots(), blueprintNode('section-2', 'studio.core/section')],
    });
    element.execute(removeNodeCommand(element, 'text-2'));
    await settle(element);
    await selectNode(element, 'section-1');
    addControl(element, 'outline-add-into[data-slot="content"]').click();
    await settle(element);
    expect(libraryDestination(element)).toBe(
      'Adding to Section (section-1): Content slot, position 2 of 2',
    );
    // A change to another collection keeps the destination's meaning.
    element.execute(removeNodeCommand(element, 'section-2'));
    await settle(element);
    expect(libraryDestination(element)).toBe(
      'Adding to Section (section-1): Content slot, position 2 of 2',
    );
    // Undo restores text-2 into the destination's own collection.
    element.undo();
    await settle(element);
    expect(element.document?.roots.map((root) => root.id)).toEqual(['section-1', 'section-2']);
    expect(libraryDestination(element)).toBe(
      'Adding to Section (section-1): Content slot, position 2 of 2',
    );
    element.undo();
    await settle(element);
    expect(slotIds(element, 'section-1')).toEqual(['text-1', 'text-2']);
    expect(element.selection).toEqual(['section-1']);
    expect(libraryDestination(element)).toBeNull();
    paletteBlock(element, 'studio.core/text').click();
    await settle(element);
    expect(slotIds(element, 'section-1')).toEqual(['text-1', 'text-2', 'text-3']);
    element.remove();
  });

  it('the host selectNode seam clears the pending destination like a selection the author makes', async () => {
    const element = await mountShell({
      roots: [...paletteRoots(), blueprintNode('section-2', 'studio.core/section')],
    });
    await selectNode(element, 'section-1');
    addControl(element, 'outline-add-into[data-slot="content"]').click();
    await settle(element);
    const named = 'Adding to Section (section-1): Content slot, position 3 of 3';
    expect(libraryDestination(element)).toBe(named);
    element.selectNode('section-1');
    await settle(element);
    expect(libraryDestination(element)).toBe(named);

    element.selectNode('section-2');
    await settle(element);
    expect(libraryDestination(element)).toBeNull();
    paletteBlock(element, 'studio.core/text').click();
    await settle(element);
    expect(slotIds(element, 'section-1')).toEqual(['text-1', 'text-2']);
    expect(slotIds(element, 'section-2')).toEqual(['text-3']);

    await selectNode(element, 'section-1');
    addControl(element, 'outline-add-into[data-slot="content"]').click();
    await settle(element);
    expect(libraryDestination(element)).toBe(named);
    element.selectNode(undefined);
    await settle(element);
    expect(libraryDestination(element)).toBeNull();
    element.remove();
  });

  it('completes a synchronous host insertion: selected, focused and announced once', async () => {
    const element = await mountShell({ roots: paletteRoots() });
    const requests = insertRequests(element);
    element.addEventListener('studio-insert-request', (event: Event) => {
      const detail = (event as CustomEvent<StudioInsertRequestDetail>).detail;
      element.execute({
        artifactId: element.document?.id ?? 'test.blueprint',
        baseStateVersion: element.stateVersion,
        contractVersion: STUDIO_CONTRACT_VERSION,
        id: 'command-host-insert',
        kind: 'command',
        payload: {
          // This host serves the one destination the test chooses.
          destination: {
            parentNodeId: 'section-1',
            position: detail.position ?? 0,
            slot: 'content',
          },
          node: blueprintNode('host-text', 'studio.core/text'),
        },
        sessionGeneration: 'session-r1',
        type: 'studio.command/insert-node',
      });
    });
    await selectNode(element, 'text-1');
    addControl(element, 'outline-add-after').click();
    await settle(element);
    paletteBlock(element, 'studio.core/text').click();
    await settle(element);

    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ parentId: 'section-1', position: 1, slot: 'content' });
    // The host inserted; the shell added nothing of its own.
    expect(slotIds(element, 'section-1')).toEqual(['text-1', 'host-text', 'text-2']);
    expect(element.selection).toEqual(['host-text']);
    expect(liveRegionText(element)).toBe('Inserted Text');
    expect(activeElement(element)).toBe(outlineEntry(element, 'host-text'));
    expect(libraryDestination(element)).toBeNull();
    element.remove();
  });

  it('patterns follow a pending destination exactly or are disabled there', async () => {
    const element = await mountShell({ roots: paletteRoots() });
    const pattern = (id: string, root: BlueprintNode): PatternDocument => ({
      blockDependencies: [],
      contractVersion: STUDIO_CONTRACT_VERSION,
      id: `studio.test/${id}`,
      kind: 'pattern',
      label: { defaultMessage: id, key: `studio.test/${id}` },
      owner: { id: 'studio.test/suite', version: '1.0.0' },
      revision: `${id}-r1`,
      roots: [root],
      version: '1.0.0',
    });
    element.patterns = [
      pattern('refused', blueprintNode('band', 'studio.core/section')),
      pattern('accepted', blueprintNode('note', 'studio.core/text')),
    ];
    const commands: { destination?: unknown; type: string }[] = [];
    element.addEventListener('studio-document-change', (event) => {
      const command = (
        event as CustomEvent<{
          command: { payload: { destination?: unknown }; type: string } | null;
        }>
      ).detail.command;
      if (command !== null) {
        commands.push({ destination: command.payload.destination, type: command.type });
      }
    });
    const apply = (id: string): HTMLButtonElement => {
      const button = element.shadowRoot?.querySelector<HTMLButtonElement>(
        `.pattern-apply[data-pattern-id="studio.test/${id}"]`,
      );
      if (button === null || button === undefined) throw new Error(`Missing pattern ${id}`);
      return button;
    };
    await selectNode(element, 'text-1');
    addControl(element, 'outline-add-after').click();
    await settle(element);
    expect(libraryDestination(element)).toBe(
      'Adding to Section (section-1): Content slot, position 2 of 3',
    );
    // The Content slot refuses a Section root: that pattern is disabled
    // rather than redirected to the selection-derived default.
    expect(apply('refused').disabled).toBe(true);
    expect(apply('accepted').disabled).toBe(false);

    apply('accepted').click();
    await settle(element);
    expect(slotIds(element, 'section-1')).toEqual(['text-1', 'note-pattern-1', 'text-2']);
    expect(commands).toEqual([
      {
        destination: { parentNodeId: 'section-1', position: 1, slot: 'content' },
        type: 'studio.command/apply-pattern',
      },
    ]);
    expect(libraryDestination(element)).toBeNull();
    element.remove();
  });

  it('read-only sessions disable every add control', async () => {
    const element = await mountShell({
      roots: [...paletteRoots(), blueprintNode('section-2', 'studio.core/section')],
      sessionState: 'read-only',
    });
    expect(
      element.shadowRoot?.querySelector<HTMLButtonElement>('button.outline-add-page')?.disabled,
    ).toBe(true);
    await selectNode(element, 'text-1');
    expect(addControl(element, 'outline-add-before').disabled).toBe(true);
    expect(addControl(element, 'outline-add-after').disabled).toBe(true);
    await selectNode(element, 'section-1');
    expect(addControl(element, 'outline-add-into[data-slot="content"]').disabled).toBe(true);
    // No empty container is insertable, so the page offers none.
    expect(element.shadowRoot?.querySelector('div.canvas-add-zones')).toBeNull();
    addControl(element, 'outline-add-into[data-slot="content"]').click();
    await settle(element);
    expect(libraryDestination(element)).toBeNull();
    element.remove();
  });

  it('the on-page zone list names every empty container and opens the add layer for it', async () => {
    const element = await mountShell({
      roots: [
        blueprintNode('section-1', 'studio.core/section', [
          blueprintNode('text-1', 'studio.core/text'),
        ]),
        blueprintNode('section-2', 'studio.core/section'),
      ],
    });
    const group = element.shadowRoot?.querySelector('main.canvas div.canvas-add-zones');
    expect(group?.getAttribute('role')).toBe('group');
    expect(group?.getAttribute('aria-label')).toBe('Empty containers');
    const zones = zoneButtons(element);
    expect(zones).toHaveLength(1);
    const [zone] = zones;
    if (zone === undefined) throw new Error('Missing the empty-container control');
    expect(addLabel(zone)).toBe('Add block into Content of Section (section-2)');
    expect(zone.dataset.parentId).toBe('section-2');
    expect(zone.dataset.slot).toBe('content');
    expect(zone.disabled).toBe(false);

    zone.click();
    await settle(element);
    expect(libraryDestination(element)).toBe(
      'Adding to Section (section-2): Content slot, position 1 of 1',
    );
    expect(activeElement(element)).toBe(librarySearch(element));
    paletteBlock(element, 'studio.core/text').click();
    await settle(element);

    expect(slotIds(element, 'section-2')).toEqual(['text-2']);
    expect(slotIds(element, 'section-1')).toEqual(['text-1']);
    expect(zoneButtons(element)).toHaveLength(0);
    expect(element.shadowRoot?.querySelector('div.canvas-add-zones')).toBeNull();
    expect(liveRegionText(element)).toBe('Inserted Text');
    element.remove();
  });

  it('two equal empty containers never share an accessible name', async () => {
    const element = await mountShell({
      roots: [
        blueprintNode('section-1', 'studio.core/section'),
        blueprintNode('section-2', 'studio.core/section'),
      ],
    });
    const names = zoneButtons(element).map(addLabel);
    expect(names).toEqual([
      'Add block into Content of Section (section-1)',
      'Add block into Content of Section (section-2)',
    ]);
    expect(new Set(names).size).toBe(names.length);
    element.remove();
  });
});
