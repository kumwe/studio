import { describe, expect, it } from 'vitest';
import type {
  BlockType,
  BlueprintBlockLock,
  BlueprintNode,
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
  type StudioViewportChangeDetail,
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

function structuredRoots(): BlueprintNode[] {
  return [
    blueprintNode('hero-1', 'studio.core/hero'),
    blueprintNode('section-1', 'studio.core/section', [
      blueprintNode('text-1', 'studio.core/text'),
      blueprintNode('text-2', 'studio.core/text'),
    ]),
  ];
}

function registeredBlockLocks(): BlueprintBlockLock[] {
  return [
    { revision: 'block-r1', type: 'studio.core/section', version: '1.0.0' },
    { revision: 'block-r1', type: 'studio.core/text', version: '1.0.0' },
  ];
}

function themeViewports(): ThemeViewport[] {
  return [
    {
      base: false,
      id: 'narrow',
      label: { defaultMessage: 'Narrow', key: 'studio.test/viewport-narrow' },
      order: 3,
      previewWidth: 360,
    },
    {
      base: false,
      id: 'wide',
      label: { defaultMessage: 'Wide', key: 'studio.test/viewport-wide' },
      order: 1,
      previewWidth: 1280,
    },
    {
      base: true,
      id: 'medium',
      label: { defaultMessage: 'Medium', key: 'studio.test/viewport-medium' },
      order: 2,
      previewWidth: 768,
    },
  ];
}

interface MountOptions {
  blockLocks?: BlueprintBlockLock[];
  roots?: BlueprintNode[];
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
    session: createStudioConfigurationFixture(),
  };
  const fixtureOptions: { blockLocks?: BlueprintBlockLock[]; roots: BlueprintNode[] } = {
    roots: options.roots ?? [],
  };
  if (options.blockLocks !== undefined) {
    fixtureOptions.blockLocks = options.blockLocks;
  }
  element.document = createBlueprintFixture(fixtureOptions);
  if (options.viewports !== undefined) {
    element.viewports = options.viewports;
  }
  document.body.append(element);
  await element.updateComplete;
  return element;
}

function canvas(element: KumweStudioElement): HTMLElement {
  const region = element.shadowRoot?.querySelector<HTMLElement>('main.canvas');
  if (region === null || region === undefined) {
    throw new Error('Missing canvas region');
  }
  return region;
}

function viewportButtons(element: KumweStudioElement): HTMLButtonElement[] {
  return [
    ...(element.shadowRoot?.querySelectorAll<HTMLButtonElement>('.viewport-switcher button') ?? []),
  ];
}

function viewportButton(element: KumweStudioElement, id: string): HTMLButtonElement {
  const button = viewportButtons(element).find((candidate) => candidate.dataset.viewportId === id);
  if (button === undefined) {
    throw new Error(`Missing viewport button ${id}`);
  }
  return button;
}

function breadcrumb(element: KumweStudioElement): HTMLElement | null {
  return element.shadowRoot?.querySelector<HTMLElement>('nav.breadcrumb') ?? null;
}

function diagnosticsRegion(element: KumweStudioElement): HTMLElement {
  const region = element.shadowRoot?.querySelector<HTMLElement>('section.diagnostics');
  if (region === null || region === undefined) {
    throw new Error('Missing diagnostics region');
  }
  return region;
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

describe('viewport switcher', () => {
  it('renders one labelled toggle per viewport ordered by the order member', async () => {
    const element = await mountShell({ viewports: themeViewports() });

    const region = element.shadowRoot?.querySelector('[aria-label="Preview width"]');
    expect(region).not.toBeNull();
    const buttons = viewportButtons(element);
    expect(buttons.map((button) => button.dataset.viewportId)).toEqual([
      'wide',
      'medium',
      'narrow',
    ]);
    expect(buttons.map((button) => button.textContent?.trim())).toEqual([
      'Wide',
      'Medium',
      'Narrow',
    ]);
    element.remove();
  });

  it('defaults to the base viewport and reflects it on the canvas', async () => {
    const element = await mountShell({ viewports: themeViewports() });

    expect(element.activeViewport?.id).toBe('medium');
    expect(viewportButton(element, 'medium').getAttribute('aria-pressed')).toBe('true');
    expect(viewportButton(element, 'wide').getAttribute('aria-pressed')).toBe('false');
    expect(viewportButton(element, 'narrow').getAttribute('aria-pressed')).toBe('false');
    expect(canvas(element).getAttribute('data-viewport')).toBe('medium');
    element.remove();
  });

  it('selecting a viewport toggles aria-pressed, fires the event, and updates data-viewport', async () => {
    const element = await mountShell({ viewports: themeViewports() });
    const observed: string[] = [];
    element.addEventListener('studio-viewport-change', (event: Event) => {
      observed.push((event as CustomEvent<StudioViewportChangeDetail>).detail.viewport.id);
    });

    viewportButton(element, 'narrow').click();
    await element.updateComplete;

    expect(element.activeViewport?.id).toBe('narrow');
    expect(observed).toEqual(['narrow']);
    expect(viewportButton(element, 'narrow').getAttribute('aria-pressed')).toBe('true');
    expect(viewportButton(element, 'medium').getAttribute('aria-pressed')).toBe('false');
    expect(canvas(element).getAttribute('data-viewport')).toBe('narrow');

    viewportButton(element, 'narrow').click();
    await element.updateComplete;
    expect(observed).toEqual(['narrow']);
    element.remove();
  });

  it('renders no switcher and no data-viewport without host-supplied viewports', async () => {
    const element = await mountShell();

    expect(element.shadowRoot?.querySelector('.viewport-switcher')).toBeNull();
    expect(element.activeViewport).toBeUndefined();
    expect(canvas(element).hasAttribute('data-viewport')).toBe(false);
    element.remove();
  });
});

describe('breadcrumb', () => {
  it('shows the ancestry of a nested selection with the current node as text', async () => {
    const element = await mountShell({ roots: structuredRoots() });

    expect(breadcrumb(element)).toBeNull();

    await selectNode(element, 'text-1');

    const nav = breadcrumb(element);
    expect(nav).not.toBeNull();
    expect(nav?.getAttribute('aria-label')).toBe('Selection path');
    const crumbs = [...(nav?.querySelectorAll('li') ?? [])];
    expect(crumbs.map((crumb) => crumb.textContent?.trim())).toEqual(['Section', 'Text']);

    const current = nav?.querySelector('[aria-current="true"]');
    expect(current).not.toBeNull();
    expect(current?.tagName).not.toBe('BUTTON');
    expect(current?.textContent?.trim()).toBe('Text');
    expect(nav?.querySelectorAll('button').length).toBe(1);
    element.remove();
  });

  it('selects the ancestor when its crumb is activated', async () => {
    const element = await mountShell({ roots: structuredRoots() });

    await selectNode(element, 'text-2');
    const ancestor = breadcrumb(element)?.querySelector<HTMLButtonElement>(
      'button[data-node-id="section-1"]',
    );
    expect(ancestor).not.toBeNull();
    ancestor?.click();
    await element.updateComplete;

    expect(outlineEntry(element, 'section-1').getAttribute('aria-pressed')).toBe('true');
    const nav = breadcrumb(element);
    expect(nav?.querySelector('[aria-current="true"]')?.textContent?.trim()).toBe('Section');
    expect(nav?.querySelectorAll('button').length).toBe(0);
    element.remove();
  });
});

describe('diagnostics surface', () => {
  it('lists a textual severity and message when a block is unregistered', async () => {
    const element = await mountShell({
      blockLocks: registeredBlockLocks(),
      roots: structuredRoots(),
    });

    const region = diagnosticsRegion(element);
    expect(region.getAttribute('aria-label')).toBe('Diagnostics');
    const entries = [...region.querySelectorAll('li')];
    expect(entries.length).toBe(1);
    expect(entries[0]?.textContent).toContain('Error');
    expect(entries[0]?.textContent).toContain('Block studio.core/hero@1.0.0 is not registered.');
    element.remove();
  });

  it('selects and focuses the node in the outline when an entry is activated', async () => {
    const element = await mountShell({
      blockLocks: registeredBlockLocks(),
      roots: structuredRoots(),
    });

    const entry = diagnosticsRegion(element).querySelector<HTMLButtonElement>(
      'button[data-node-id="hero-1"]',
    );
    expect(entry).not.toBeNull();
    entry?.click();
    await element.updateComplete;

    expect(outlineEntry(element, 'hero-1').getAttribute('aria-pressed')).toBe('true');
    const active = element.shadowRoot?.activeElement;
    expect(active instanceof HTMLElement ? active.dataset.nodeId : undefined).toBe('hero-1');
    element.remove();
  });

  it('shows the catalog-driven empty state for a valid document', async () => {
    const element = await mountShell({
      blockLocks: registeredBlockLocks(),
      roots: [
        blueprintNode('section-1', 'studio.core/section', [
          blueprintNode('text-1', 'studio.core/text'),
        ]),
      ],
    });

    const region = diagnosticsRegion(element);
    expect(region.querySelectorAll('li').length).toBe(0);
    expect(region.textContent).toContain('No issues');
    element.remove();
  });

  it('re-validates after commands and undo/redo', async () => {
    const element = await mountShell({
      blockLocks: registeredBlockLocks(),
      roots: [blueprintNode('section-1', 'studio.core/section')],
    });
    expect(diagnosticsRegion(element).textContent).toContain('No issues');

    element.execute({
      artifactId: element.document?.id ?? 'test.blueprint',
      baseStateVersion: element.stateVersion,
      contractVersion: element.document?.contractVersion ?? '0.1-draft',
      id: 'command-hero',
      kind: 'command',
      payload: {
        destination: { position: element.document?.roots.length ?? 0 },
        node: blueprintNode('hero-1', 'studio.core/hero'),
      },
      sessionGeneration: 'session-r1',
      type: 'studio.command/insert-node',
    });
    await element.updateComplete;
    expect(diagnosticsRegion(element).textContent).toContain(
      'Block studio.core/hero@1.0.0 is not registered.',
    );

    element.undo();
    await element.updateComplete;
    expect(diagnosticsRegion(element).textContent).toContain('No issues');

    element.redo();
    await element.updateComplete;
    expect(diagnosticsRegion(element).textContent).toContain(
      'Block studio.core/hero@1.0.0 is not registered.',
    );
    element.remove();
  });
});
