import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  AuthoringSaveIntent,
  AuthoringSessionSnapshot,
  BlockType,
  BlueprintBatchOperation,
  FieldDefinition,
} from '@kumwe/studio-protocol';
import {
  createStudioStandaloneProject,
  createStudioStandaloneRuntime,
  mountStudioStandalone,
  parseStudioStandaloneProject,
  serializeStudioStandaloneProject,
  type KumweStudioElement,
  type KumweStudioStandaloneElement,
  type StudioInsertRequestDetail,
  type StudioStandaloneDownload,
} from '../src/index.js';

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function ready(element: KumweStudioStandaloneElement): Promise<KumweStudioElement> {
  await element.updateComplete;
  const contextual = element.contextualElement;
  if (contextual === undefined) throw new Error('Missing contextual local shell.');
  await contextual.updateComplete;
  const blueprint = contextual.blueprintElement;
  if (blueprint === undefined) throw new Error('Missing local Blueprint shell.');
  await blueprint.updateComplete;
  return blueprint;
}

function paletteButtons(blueprint: KumweStudioElement): HTMLButtonElement[] {
  return [
    ...(blueprint.shadowRoot?.querySelectorAll<HTMLButtonElement>(
      '.palette:not(.pattern-palette) button',
    ) ?? []),
  ];
}

function fromTypeProject(): AuthoringSessionSnapshot {
  const project = createStudioStandaloneProject();
  const reference = {
    id: 'studio.local/types/imported-page',
    revision: 'local-type-r1',
    version: '1.0.0',
  } as const;
  project.start = { kind: 'from-type', type: reference };
  project.state.coordinates.type = reference;
  project.type = {
    authoringPolicy: {
      itemComposition: 'denied',
      modes: ['model', 'blueprint', 'content'],
    },
    blueprint: structuredClone(project.state.coordinates.blueprint),
    contractVersion: project.contractVersion,
    id: reference.id,
    kind: 'reusable-content-type',
    label: { defaultMessage: 'Imported page type', key: 'studio.local/imported-page-type' },
    model: structuredClone(project.state.coordinates.model),
    revision: reference.revision,
    status: 'draft',
    version: reference.version,
  };
  return project;
}

describe('standalone local Studio runtime', () => {
  it('opens a blank full contextual page builder without a host adapter', async () => {
    const target = document.createElement('div');
    document.body.append(target);
    const mounted = mountStudioStandalone(target);
    const blueprint = await ready(mounted.element);

    expect(target.firstElementChild).toBe(mounted.element);
    expect(mounted.element.project.state).toMatchObject({
      blueprint: { roots: [] },
      entry: { values: {} },
      model: { fields: [] },
    });
    expect(mounted.element.project.start).toEqual({ kind: 'blank' });
    expect(mounted.element.project.type).toBeUndefined();
    expect(mounted.element.project.state.coordinates).not.toHaveProperty('type');
    expect(mounted.element.project.capabilities.saveOutcomes).toEqual(['save-as-new-type']);
    expect(mounted.element.project.target.saveOutcomes).toEqual(['save-as-new-type']);
    // One card per built-in block definition plus the `2 columns`, `3 columns`
    // and `4 columns` cards, which insert a columns block with its stacks.
    expect(paletteButtons(blueprint)).toHaveLength(48);
    expect(
      paletteButtons(blueprint).filter((button) => button.classList.contains('palette-block')),
    ).toHaveLength(45);
    expect(
      paletteButtons(blueprint)
        .filter((button) => button.classList.contains('palette-columns'))
        .map((button) => button.dataset.columns),
    ).toEqual(['2', '3', '4']);
    expect(
      blueprint.shadowRoot?.querySelectorAll<HTMLButtonElement>('button.pattern-apply'),
    ).toHaveLength(10);
    expect(
      mounted.element.shadowRoot?.querySelector('.standalone-boundary')?.textContent,
    ).toContain('Nothing is sent to or saved by a server');
    expect(
      mounted.element.shadowRoot?.querySelector('input[type="file"]')?.getAttribute('accept'),
    ).toContain('application/json');

    mounted.dispose();
    expect(target.childElementCount).toBe(0);
  });

  it('keeps multiple mounts isolated and allocates deterministic local nodes', async () => {
    const left = createStudioStandaloneRuntime();
    const right = createStudioStandaloneRuntime();
    document.body.append(left, right);
    const leftBlueprint = await ready(left);
    const rightBlueprint = await ready(right);

    paletteButtons(leftBlueprint)[0]?.click();
    await leftBlueprint.updateComplete;
    await left.contextualElement?.updateComplete;

    expect(left.project.state.blueprint.roots).toHaveLength(1);
    expect(left.project.state.blueprint.roots[0]?.id).toBe('studio-local-node-1');
    expect(right.project.state.blueprint.roots).toEqual([]);

    paletteButtons(rightBlueprint)[0]?.click();
    await rightBlueprint.updateComplete;
    await right.contextualElement?.updateComplete;
    expect(right.project.state.blueprint.roots[0]?.id).toBe('studio-local-node-1');
    expect(left.exportProjectJson()).toBe(right.exportProjectJson());
  });

  it('honours the explicit position and runs a column card as one undoable batch', async () => {
    const element = createStudioStandaloneRuntime();
    document.body.append(element);
    const blueprint = await ready(element);
    const button = (selector: string): HTMLButtonElement => {
      const found = blueprint.shadowRoot?.querySelector<HTMLButtonElement>(selector);
      if (found === null || found === undefined) throw new Error(`Missing ${selector}`);
      return found;
    };
    const flush = async (): Promise<void> => {
      await blueprint.updateComplete;
      await blueprint.updateComplete;
      await element.contextualElement?.updateComplete;
    };
    const liveRegion = (): string =>
      blueprint.shadowRoot?.querySelector('[aria-live="polite"]')?.textContent?.trim() ?? '';

    button('button.palette-columns[data-columns="2"]').click();
    await flush();
    const roots = blueprint.document?.roots ?? [];
    expect(roots).toHaveLength(1);
    expect(roots[0]).toMatchObject({
      authoring: { mode: 'structural' },
      id: 'columns-1',
      properties: { collapse: 'stack', columns: 2 },
      type: 'studio.core/columns',
    });
    expect(roots[0]?.slots.items?.map((child) => [child.id, child.type])).toEqual([
      ['stack-1', 'studio.core/stack'],
      ['stack-2', 'studio.core/stack'],
    ]);
    expect(element.project.state.blueprint.roots).toEqual(roots);
    // The local host selects the composite's root through `selectNode()`, as
    // the shell does after an insertion it runs itself; the shell completes
    // the synchronous host's insertion: one announcement, focus on the entry.
    expect(blueprint.selection).toEqual(['columns-1']);
    expect(
      blueprint.shadowRoot
        ?.querySelector('button.outline-entry[data-node-id="columns-1"]')
        ?.getAttribute('aria-pressed'),
    ).toBe('true');
    expect(liveRegion()).toBe('Inserted 2 columns');
    expect(blueprint.shadowRoot?.activeElement).toBe(
      button('button.outline-entry[data-node-id="columns-1"]'),
    );
    // The host executed the planned batch: one command, one undo step.
    blueprint.undo();
    await flush();
    expect(blueprint.document?.roots).toEqual([]);
    blueprint.redo();
    await flush();
    expect(blueprint.document?.roots).toEqual(roots);

    // A `+` before the first root reaches position 0, which the host honours.
    button('button.outline-entry[data-node-id="columns-1"]').click();
    await flush();
    button('.outline-controls button.outline-add-before').click();
    await flush();
    expect(blueprint.shadowRoot?.querySelector('p.library-destination')?.textContent?.trim()).toBe(
      'Adding to document roots, position 1 of 2',
    );
    button('.palette-block[data-block-type="studio.core/heading"]').click();
    await flush();
    expect(blueprint.document?.roots.map((root) => root.type)).toEqual([
      'studio.core/heading',
      'studio.core/columns',
    ]);
    // A single local insertion selects, focuses and announces the node the
    // host allocated.
    const heading = blueprint.document?.roots[0]?.id ?? '';
    expect(blueprint.selection).toEqual([heading]);
    expect(liveRegion()).toBe('Inserted Heading');
    expect(blueprint.shadowRoot?.activeElement).toBe(
      button(`button.outline-entry[data-node-id="${heading}"]`),
    );
    expect(blueprint.shadowRoot?.querySelector('p.library-destination')).toBeNull();
  });

  it('refuses a composite insertion that carries anything but built-in insert-node operations', async () => {
    const element = createStudioStandaloneRuntime();
    document.body.append(element);
    const blueprint = await ready(element);
    const columns = blueprint.configuration?.blockDefinitions?.find(
      (definition) => definition.type === 'studio.core/columns',
    );
    if (columns === undefined) throw new Error('Missing the built-in columns definition.');
    const before = structuredClone(blueprint.document);
    const stateVersion = blueprint.stateVersion;
    const request = (operations: BlueprintBatchOperation[]): void => {
      blueprint.dispatchEvent(
        new CustomEvent<StudioInsertRequestDetail>('studio-insert-request', {
          bubbles: true,
          cancelable: true,
          composed: true,
          detail: { definition: columns, operations, parentId: null, position: 0 },
        }),
      );
    };
    const insert = (id: string, type: string): BlueprintBatchOperation => ({
      payload: {
        destination: { position: 0 },
        node: {
          authoring: { mode: 'content' },
          bindings: {},
          id,
          properties: {},
          slots: {},
          type: type as BlockType,
          version: '1.0.0',
        },
      },
      type: 'studio.command/insert-node',
    });
    // The local boundary refuses before it executes anything: an earlier
    // listener may have rewritten the shared detail's operations.
    expect(() => request([insert('price-1', 'org.example.catalog/price')])).toThrow(
      new TypeError('Local Studio can insert only its built-in block catalog.'),
    );
    expect(() =>
      request([{ payload: { nodeId: 'missing' }, type: 'studio.command/remove-node' }]),
    ).toThrow(new TypeError('Local Studio can insert only its built-in block catalog.'));
    expect(blueprint.document).toEqual(before);
    expect(blueprint.stateVersion).toBe(stateVersion);
  });

  it('round-trips lossless project JSON independently from outcome-specific save intent JSON', async () => {
    const downloads: StudioStandaloneDownload[] = [];
    const first = createStudioStandaloneRuntime({
      download: (download) => downloads.push(download),
    });
    document.body.append(first);
    const blueprint = await ready(first);
    paletteButtons(blueprint)[0]?.click();
    await blueprint.updateComplete;
    await first.contextualElement?.updateComplete;
    const titleField: FieldDefinition = {
      authoring: { control: 'studio.control/single-line-text', order: 0 },
      cardinality: 'one',
      id: 'title',
      kind: 'string',
      label: { defaultMessage: 'Title', key: 'studio.local/title' },
      localized: false,
      required: false,
    };
    first.contextualElement?.addField(titleField);
    first.contextualElement?.setEntryValue(['title'], 'Local page title');

    first.downloadProject();
    const projectDownload = downloads.at(-1);
    expect(projectDownload?.filename).toBe('kumwe-studio-project.json');
    const project = JSON.parse(projectDownload?.json ?? '') as AuthoringSessionSnapshot;
    expect(project.state).toMatchObject({
      blueprint: { roots: [{ id: 'studio-local-node-1' }] },
      entry: { values: { title: 'Local page title' } },
      model: { fields: [{ id: 'title' }] },
    });

    first.downloadSaveIntent('save-as-new-type');
    const intentDownload = downloads.at(-1);
    expect(intentDownload?.filename).toBe('kumwe-studio-save-as-new-type-intent.json');
    const intent = JSON.parse(intentDownload?.json ?? '') as AuthoringSaveIntent;
    expect(intent).toMatchObject({
      draft: {
        blueprint: { roots: [{ id: 'studio-local-node-1' }] },
        model: { fields: [{ id: 'title' }] },
        outcome: 'save-as-new-type',
      },
      kind: 'authoring-save-intent',
    });
    expect('entry' in intent.draft).toBe(false);
    expect(intent.expected).toEqual(first.project.state.coordinates);
    if (intent.draft.outcome !== 'save-as-new-type') {
      throw new Error('Expected a save-as-new-type local intent.');
    }
    expect(intent.draft.blueprint).toEqual(first.project.state.blueprint);
    expect(intent.draft.model).toEqual(first.project.state.model);

    const second = createStudioStandaloneRuntime({ initialProject: project });
    document.body.append(second);
    await ready(second);
    expect(second.exportProjectJson()).toBe(projectDownload?.json);
  });

  it('downloads exactly the save intent emitted by the contextual host boundary', async () => {
    const downloads: StudioStandaloneDownload[] = [];
    const element = createStudioStandaloneRuntime({
      download: (download) => downloads.push(download),
    });
    document.body.append(element);
    await ready(element);
    const contextual = element.contextualElement;
    if (contextual === undefined) throw new Error('Missing contextual local shell.');

    contextual.requestSave('save-as-new-type');
    await element.updateComplete;

    expect(downloads).toHaveLength(1);
    expect(downloads[0]?.json).toBe(element.exportSaveIntentJson('save-as-new-type'));
    const intent = JSON.parse(downloads[0]?.json ?? '') as AuthoringSaveIntent;
    expect(intent.draft).toMatchObject({
      blueprint: { roots: [] },
      model: { fields: [] },
      outcome: 'save-as-new-type',
    });
    expect('entry' in intent.draft).toBe(false);
    expect(intent.expected).toEqual(element.project.state.coordinates);
    expect(element.shadowRoot?.querySelector('[role="status"]')?.textContent).toContain(
      'No save occurred',
    );
  });

  it('strictly rejects malformed, duplicate, deep, and non-built-in imports without replacing state', () => {
    const element = createStudioStandaloneRuntime();
    const original = element.exportProjectJson();
    expect(() => element.importProjectJson('{not-json')).toThrow(/not valid JSON/u);

    const duplicate = original.replace(
      '"values":{}',
      '"values":{"nested":{"label":"first","label":"second"}}',
    );
    expect(duplicate).not.toBe(original);
    expect(() => element.importProjectJson(duplicate)).toThrow(/duplicate member "label"/u);

    let tooDeep = 'null';
    for (let depth = 0; depth < 65; depth += 1) tooDeep = `{"nested":${tooDeep}}`;
    expect(() => element.importProjectJson(tooDeep)).toThrow(/maximum depth 64/u);

    const pluginProject = createStudioStandaloneProject();
    pluginProject.state.blueprint.dependencyLock.plugins = [
      { id: 'example/plugin', revision: 'plugin-r1', version: '1.0.0' },
    ];
    expect(() => element.importProjectJson(pluginProject)).toThrow(
      /cannot activate plugin dependencies/u,
    );
    expect(element.exportProjectJson()).toBe(original);
  });

  it.each(['blueprint', 'entry', 'model'] as const)(
    'rejects a schema-valid %s above local session policy without replacing state',
    (artifact) => {
      const element = createStudioStandaloneRuntime();
      const original = element.exportProjectJson();
      const project = createStudioStandaloneProject();
      project.state[artifact].extensions = {
        'studio.test/security-probe': { enabled: true },
      };

      expect(() => element.importProjectJson(project)).toThrow(
        expect.objectContaining({ code: 'resource-limit' }) as Error,
      );
      expect(element.exportProjectJson()).toBe(original);
    },
  );

  it('validates reusable-type relationships according to the project start kind', () => {
    const blankWithType = fromTypeProject();
    blankWithType.start = { kind: 'blank' };
    expect(() => parseStudioStandaloneProject(blankWithType)).toThrow(
      /blank local project cannot bind/u,
    );

    const fromType = fromTypeProject();
    expect(parseStudioStandaloneProject(fromType)).toEqual(fromType);

    const mismatchedStart = fromTypeProject();
    if (mismatchedStart.start.kind !== 'from-type') throw new Error('Expected from-type start.');
    mismatchedStart.start = {
      kind: 'from-type',
      type: { ...mismatchedStart.start.type, revision: 'different-type-r1' },
    };
    expect(() => parseStudioStandaloneProject(mismatchedStart)).toThrow(
      /exact requested reusable content type/u,
    );

    const existing = fromTypeProject();
    existing.start = { kind: 'existing' };
    expect(parseStudioStandaloneProject(existing)).toEqual(existing);
    delete existing.state.coordinates.type;
    expect(() => parseStudioStandaloneProject(existing)).toThrow(
      /existing local project must identify/u,
    );
  });

  it('keeps construction, authoring, import, and export entirely local', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const downloads: StudioStandaloneDownload[] = [];
    const element = createStudioStandaloneRuntime({
      download: (download) => downloads.push(download),
    });
    document.body.append(element);
    const blueprint = await ready(element);

    paletteButtons(blueprint)[0]?.click();
    await blueprint.updateComplete;
    await element.contextualElement?.updateComplete;
    const exported = element.exportProjectJson();
    element.importProjectJson(exported);
    element.downloadProject();
    element.downloadSaveIntent();

    expect(fetch).not.toHaveBeenCalled();
    expect(downloads).toHaveLength(2);
  });

  it('canonicalizes project serialization deterministically', () => {
    const project = createStudioStandaloneProject();
    const first = serializeStudioStandaloneProject(project);
    const shuffled = JSON.parse(first) as AuthoringSessionSnapshot;
    const second = serializeStudioStandaloneProject(shuffled);
    expect(second).toBe(first);
    expect(parseStudioStandaloneProject(first)).toEqual(project);
  });
});
