import { describe, expect, it } from 'vitest';
import {
  computePreviewDraftDigest,
  type PreviewClient,
  type PreviewProtocolListener,
  type PreviewRenderOptions,
  type PreviewMeasureOutcome,
} from '@kumwe/studio-preview';
import {
  STUDIO_CONTRACT_VERSION,
  STUDIO_WIRE_PROTOCOL_VERSION,
  type BlueprintDocument,
  type BlueprintNode,
  type BlockDefinition,
  type PreviewActivatedPayload,
  type PreviewDisposePayload,
  type PreviewMessage,
  type PreviewMeasurePayload,
  type PreviewReadyPayload,
  type PreviewRenderedPayload,
  type PreviewRenderPayload,
  type PreviewSelectPayload,
  type PreviewViewportPayload,
  type QualifiedName,
} from '@kumwe/studio-protocol';
import {
  createBlueprintFixture,
  createStudioConfigurationFixture,
  defineTestBlock,
} from '@kumwe/studio-testkit';
import { defineKumweStudio, KumweStudioElement, type StudioPreviewBinding } from '../src/index.js';

interface Deferred<Value> {
  promise: Promise<Value>;
  resolve(value: Value): void;
}

interface RenderCall {
  deferred: Deferred<PreviewRenderedPayload>;
  options: PreviewRenderOptions;
  payload: PreviewRenderPayload;
}

class FakePreviewClient {
  public readonly disposals: PreviewDisposePayload[] = [];
  public readonly renders: RenderCall[] = [];
  public readonly selections: PreviewSelectPayload[] = [];
  public readonly viewports: PreviewViewportPayload[] = [];
  public readonly order: string[] = [];
  public readonly measures: PreviewMeasurePayload[] = [];
  public readonly rectsByNode: Record<
    string,
    { height: number; width: number; x: number; y: number }[]
  > = {};
  public measureImplementation:
    ((payload: PreviewMeasurePayload) => Promise<PreviewMeasureOutcome>) | undefined;
  public teardownReason: QualifiedName | undefined;

  readonly #activationListeners = new Set<(payload: PreviewActivatedPayload) => void>();
  readonly #messageListeners = new Set<PreviewProtocolListener>();
  readonly #ready = deferred<PreviewReadyPayload>();
  readonly #renderWaiters: { count: number; resolve: () => void }[] = [];
  #readyPayload: PreviewReadyPayload | undefined;
  #latestMarkerMap: Record<string, string> = {};

  public announceReady(): void {
    const payload: PreviewReadyPayload = {
      protocolVersion: STUDIO_WIRE_PROTOCOL_VERSION,
      renderer: 'studio.renderer/test',
      viewports: ['compact', 'expanded'],
    };
    this.#readyPayload = payload;
    this.order.push('ready');
    this.#ready.resolve(payload);
    this.emitMessage(previewMessage('studio.preview/ready', payload, 0));
  }

  public disposeDraft(payload: PreviewDisposePayload): void {
    this.disposals.push(payload);
  }

  public emitActivated(payload: PreviewActivatedPayload): void {
    for (const listener of [...this.#activationListeners]) {
      listener(payload);
    }
  }

  public emitMessage(message: PreviewMessage): void {
    for (const listener of [...this.#messageListeners]) {
      listener(message);
    }
  }

  public onActivated(listener: (payload: PreviewActivatedPayload) => void): () => void {
    this.#activationListeners.add(listener);
    return (): void => {
      this.#activationListeners.delete(listener);
    };
  }

  public onMessage(listener: PreviewProtocolListener): () => void {
    this.#messageListeners.add(listener);
    return (): void => {
      this.#messageListeners.delete(listener);
    };
  }

  public measure(payload: PreviewMeasurePayload): Promise<PreviewMeasureOutcome> {
    this.measures.push(structuredClone(payload));
    this.order.push('measure');
    if (this.measureImplementation !== undefined) {
      return this.measureImplementation(payload);
    }
    const measurements = Object.fromEntries(
      payload.markers.map((entry, index) => {
        const nodeId = this.#latestMarkerMap[entry];
        return [
          entry,
          nodeId === undefined
            ? []
            : (this.rectsByNode[nodeId] ?? [{ height: 30, width: 120, x: 10, y: 10 + index * 40 }]),
        ];
      }),
    );
    return Promise.resolve({
      geometry: {
        draftDigest: payload.markers[0]?.split('/')[2] ?? '',
        measurements,
        requestId: payload.requestId,
        unknown: payload.markers.filter((entry) => this.#latestMarkerMap[entry] === undefined),
        viewport: {
          devicePixelRatio: 1,
          height: 480,
          scrollX: 0,
          scrollY: 0,
          width: 640,
        },
      },
      status: 'measured',
    });
  }

  public ready(): Promise<PreviewReadyPayload> {
    this.order.push('wait-ready');
    return this.#readyPayload === undefined
      ? this.#ready.promise
      : Promise.resolve(this.#readyPayload);
  }

  public render(
    payload: PreviewRenderPayload,
    options: PreviewRenderOptions = {},
  ): Promise<PreviewRenderedPayload> {
    this.order.push('render');
    const call = { deferred: deferred<PreviewRenderedPayload>(), options, payload };
    this.renders.push(call);
    for (const waiter of [...this.#renderWaiters]) {
      if (this.renders.length >= waiter.count) {
        this.#renderWaiters.splice(this.#renderWaiters.indexOf(waiter), 1);
        waiter.resolve();
      }
    }
    return call.deferred.promise;
  }

  public resolveRender(index: number, markerMap: Record<string, string>): void {
    const call = this.renders[index];
    if (call === undefined) {
      throw new Error(`Missing render ${index}`);
    }
    this.#latestMarkerMap = structuredClone(markerMap);
    call.deferred.resolve({
      diagnostics: [],
      draftDigest: call.payload.draftDigest,
      markerMap,
      markers: Object.keys(markerMap),
      requestId: call.payload.requestId,
    });
  }

  public select(payload: PreviewSelectPayload): void {
    this.selections.push(payload);
  }

  public setViewport(payload: PreviewViewportPayload): void {
    this.order.push('viewport');
    this.viewports.push(payload);
  }

  public teardown(reason: QualifiedName): void {
    this.teardownReason = reason;
  }

  public waitForRenders(count: number): Promise<void> {
    if (this.renders.length >= count) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.#renderWaiters.push({ count, resolve });
    });
  }
}

function deferred<Value>(): Deferred<Value> {
  let resolve: ((value: Value) => void) | undefined;
  const promise = new Promise<Value>((accept) => {
    resolve = accept;
  });
  return {
    promise,
    resolve(value): void {
      resolve?.(value);
    },
  };
}

function node(id: string): BlueprintNode {
  return {
    authoring: { mode: 'content' },
    bindings: {},
    id,
    properties: {},
    slots: {},
    type: 'studio.core/text',
    version: '1.0.0',
  };
}

function section(id: string, children: BlueprintNode[]): BlueprintNode {
  return {
    authoring: { mode: 'structural' },
    bindings: {},
    id,
    properties: {},
    slots: { content: children },
    type: 'studio.core/section',
    version: '1.0.0',
  };
}

function marker(digest: string, ordinal: number): string {
  return `studio.preview/node/${digest}/${ordinal}`;
}

function previewMessage<Type extends PreviewMessage['type']>(
  type: Type,
  payload: Extract<PreviewMessage, { type: Type }>['payload'],
  sequence: number,
): Extract<PreviewMessage, { type: Type }> {
  return {
    channelId: 'channel-test',
    contractVersion: STUDIO_CONTRACT_VERSION,
    kind: 'preview-message',
    payload,
    sequence,
    sessionGeneration: 'session-r1',
    type,
  } as Extract<PreviewMessage, { type: Type }>;
}

interface MountOptions {
  blockDefinitions?: BlockDefinition[];
  client?: FakePreviewClient;
  preview?: boolean;
  roots?: BlueprintNode[];
  sessionState?: 'editable' | 'read-only';
}

async function mount(options: MountOptions = {}): Promise<{
  client: FakePreviewClient;
  element: KumweStudioElement;
  staged: BlueprintDocument[];
}> {
  defineKumweStudio();
  const client = options.client ?? new FakePreviewClient();
  const configuration = createStudioConfigurationFixture(
    options.sessionState === undefined ? {} : { sessionState: options.sessionState },
  );
  const preview = options.preview ?? true;
  configuration.preview.enabled = preview;
  if (preview) {
    configuration.hostCapabilities.ports = [
      {
        id: 'studio.port/preview',
        operations: ['studio.operation/preview.render', 'studio.operation/preview.cancel'],
        version: '0.1.0',
      },
    ];
  }
  const staged: BlueprintDocument[] = [];
  const binding: StudioPreviewBinding = {
    client: client as unknown as PreviewClient,
    async stage(draft, stageOptions) {
      client.order.push('stage');
      staged.push(structuredClone(draft));
      stageOptions.signal.throwIfAborted();
      const digest = await computePreviewDraftDigest(draft);
      stageOptions.signal.throwIfAborted();
      return {
        artifactId: draft.id,
        draftDigest: digest,
        draftRevision: draft.revision,
      };
    },
  };
  const element = new KumweStudioElement();
  element.configuration = {
    blockDefinitions: options.blockDefinitions ?? [
      defineTestBlock({ label: 'Text', type: 'studio.core/text' }),
    ],
    session: configuration,
  };
  element.document = createBlueprintFixture({ roots: options.roots ?? [node('node-1')] });
  element.previewBinding = binding;
  element.viewports = [
    {
      base: true,
      id: 'compact',
      label: { defaultMessage: 'Compact', key: 'studio.test/compact' },
      order: 0,
      previewWidth: 360,
    },
    {
      base: false,
      id: 'expanded',
      label: { defaultMessage: 'Expanded', key: 'studio.test/expanded' },
      order: 1,
      previewWidth: 1_440,
    },
  ];
  document.body.append(element);
  await settle(element);
  return { client, element, staged };
}

async function settle(element: KumweStudioElement): Promise<void> {
  for (let index = 0; index < 8; index += 1) {
    await Promise.resolve();
    await element.updateComplete;
  }
}

function previewStatus(element: KumweStudioElement): string {
  return element.shadowRoot?.querySelector('.preview-status')?.textContent?.trim() ?? '';
}

function outlineEntry(element: KumweStudioElement, nodeId: string): HTMLButtonElement {
  const entries = element.shadowRoot?.querySelectorAll<HTMLButtonElement>('.outline-entry') ?? [];
  const entry = [...entries].find((candidate) => candidate.dataset.nodeId === nodeId);
  if (entry === undefined) {
    throw new Error(`Missing outline entry ${nodeId}`);
  }
  return entry;
}

function pointerEvent(
  type: string,
  pointerId: number,
  clientX: number,
  clientY: number,
): PointerEvent {
  return new PointerEvent(type, {
    bubbles: true,
    button: 0,
    cancelable: true,
    clientX,
    clientY,
    composed: true,
    pointerId,
  });
}

describe('shell preview surface', () => {
  it('waits for ready and deterministically coalesces synchronous draft changes', async () => {
    const { client, element, staged } = await mount();
    expect(client.renders).toHaveLength(0);

    client.announceReady();
    await client.waitForRenders(1);
    await settle(element);
    expect(client.order.indexOf('ready')).toBeLessThan(client.order.indexOf('render'));
    expect(staged).toHaveLength(1);
    expect(client.renders).toHaveLength(1);
    const initialDigest = client.renders[0]?.payload.draftDigest ?? '';
    client.resolveRender(0, { [marker(initialDigest, 0)]: 'node-1' });
    await settle(element);
    expect(previewStatus(element)).toBe('Preview is current.');
    expect(client.measures).toHaveLength(1);
    expect(
      element.shadowRoot?.querySelector('[data-node-id="node-1"].preview-canvas-region'),
    ).not.toBeNull();
    const overlay = element.shadowRoot?.querySelector<SVGSVGElement>('.preview-canvas-overlay');
    expect(overlay?.getAttribute('width')).toBe('640');
    expect(overlay?.getAttribute('height')).toBe('480');
    expect(overlay?.getAttribute('viewBox')).toBe('0 0 640 480');
    expect(overlay?.getAttribute('preserveAspectRatio')).toBe('xMinYMin meet');

    element.refreshPreviewGeometry();
    await settle(element);
    expect(client.measures).toHaveLength(2);

    element.document = createBlueprintFixture({ roots: [node('discarded-node')] });
    element.document = createBlueprintFixture({ roots: [node('new-node')] });
    await client.waitForRenders(2);
    await settle(element);
    expect(staged).toHaveLength(2);
    expect(staged[1]?.roots.map((entry) => entry.id)).toEqual(['new-node']);
    expect(client.renders).toHaveLength(2);
    element.remove();
  });

  it('supersedes preview work and stages the exact rebased save identity', async () => {
    const { client, element, staged } = await mount();
    client.announceReady();
    await client.waitForRenders(1);
    const initialDigest = client.renders[0]?.payload.draftDigest ?? '';
    client.resolveRender(0, { [marker(initialDigest, 0)]: 'node-1' });
    await settle(element);

    element.execute({
      artifactId: element.document?.id ?? 'test.blueprint',
      baseStateVersion: element.stateVersion,
      contractVersion: STUDIO_CONTRACT_VERSION,
      id: 'insert-before-save-acknowledgement',
      kind: 'command',
      payload: { destination: { position: 1 }, node: node('node-2') },
      sessionGeneration: 'session-r1',
      type: 'studio.command/insert-node',
    });
    const savedStateVersion = element.stateVersion;
    await client.waitForRenders(2);

    element.markSaved('blueprint-r2', savedStateVersion);
    await client.waitForRenders(3);
    await settle(element);

    const rebasedDraft = staged[2];
    expect(client.renders[1]?.options.signal?.aborted).toBe(true);
    expect(rebasedDraft).toMatchObject({ revision: 'blueprint-r2' });
    expect(rebasedDraft?.roots.map((entry) => entry.id)).toEqual(['node-1', 'node-2']);
    if (rebasedDraft === undefined) {
      throw new Error('The rebased preview draft was not staged.');
    }
    const rebasedDigest = await computePreviewDraftDigest(rebasedDraft);
    expect(client.renders[2]?.payload).toMatchObject({
      artifactId: rebasedDraft?.id,
      draftDigest: rebasedDigest,
      draftRevision: 'blueprint-r2',
    });
    expect(element.document?.revision).toBe('blueprint-r2');
    element.remove();
  });

  it('drops geometry from a superseded measurement of the same accepted render', async () => {
    const client = new FakePreviewClient();
    const first = deferred<PreviewMeasureOutcome>();
    const second = deferred<PreviewMeasureOutcome>();
    client.measureImplementation = () =>
      client.measures.length === 1 ? first.promise : second.promise;
    const { element } = await mount({ client });
    client.announceReady();
    await client.waitForRenders(1);
    const digest = client.renders[0]?.payload.draftDigest ?? '';
    const liveMarker = marker(digest, 0);
    client.resolveRender(0, { [liveMarker]: 'node-1' });
    await settle(element);
    expect(client.measures).toHaveLength(1);

    element.refreshPreviewGeometry();
    await settle(element);
    expect(client.measures).toHaveLength(2);
    const outcome = (requestId: string, width: number): PreviewMeasureOutcome => ({
      geometry: {
        draftDigest: digest,
        measurements: {
          [liveMarker]: [{ height: 30, width, x: 10, y: 10 }],
        },
        requestId,
        unknown: [],
        viewport: {
          devicePixelRatio: 1,
          height: 480,
          scrollX: 0,
          scrollY: 0,
          width: 640,
        },
      },
      status: 'measured',
    });
    second.resolve(outcome(client.measures[1]?.requestId ?? '', 222));
    await settle(element);
    expect(
      element.shadowRoot
        ?.querySelector('[data-node-id="node-1"].preview-canvas-region')
        ?.getAttribute('width'),
    ).toBe('222');

    first.resolve(outcome(client.measures[0]?.requestId ?? '', 111));
    await settle(element);
    expect(
      element.shadowRoot
        ?.querySelector('[data-node-id="node-1"].preview-canvas-region')
        ?.getAttribute('width'),
    ).toBe('222');
    element.remove();
  });

  it('drops a late superseded settlement and maps selection in both directions', async () => {
    const { client, element } = await mount({ roots: [node('node-1'), node('node-2')] });
    client.announceReady();
    await client.waitForRenders(1);
    await settle(element);
    expect(client.renders).toHaveLength(1);

    element.document = createBlueprintFixture({ roots: [node('new-node'), node('node-2')] });
    await client.waitForRenders(2);
    await settle(element);
    expect(client.renders).toHaveLength(2);
    const oldDigest = client.renders[0]?.payload.draftDigest ?? '';
    const newDigest = client.renders[1]?.payload.draftDigest ?? '';
    const newMarker = marker(newDigest, 0);
    const secondMarker = marker(newDigest, 1);
    client.resolveRender(1, { [newMarker]: 'new-node', [secondMarker]: 'node-2' });
    await settle(element);
    client.resolveRender(0, { [marker(oldDigest, 0)]: 'node-1' });
    await settle(element);
    expect(client.measures).toHaveLength(1);
    expect(client.measures[0]?.markers).toEqual([newMarker, secondMarker]);

    outlineEntry(element, 'node-2').click();
    await settle(element);
    expect(client.selections.at(-1)).toEqual({ nodeId: 'node-2', reveal: true });

    client.emitActivated({ interaction: 'activate', marker: newMarker });
    await settle(element);
    expect(outlineEntry(element, 'new-node').getAttribute('aria-pressed')).toBe('true');
    client.emitActivated({ interaction: 'activate', marker: marker(oldDigest, 0) });
    await settle(element);
    expect(outlineEntry(element, 'new-node').getAttribute('aria-pressed')).toBe('true');
    element.remove();
  });

  it('drives viewport changes through the client and re-renders', async () => {
    const { client, element } = await mount();
    client.announceReady();
    await client.waitForRenders(1);
    await settle(element);
    const digest = client.renders[0]?.payload.draftDigest ?? '';
    client.resolveRender(0, { [marker(digest, 0)]: 'node-1' });
    await settle(element);

    const expanded = element.shadowRoot?.querySelector<HTMLButtonElement>(
      '[data-viewport-id="expanded"]',
    );
    expanded?.click();
    await client.waitForRenders(2);
    await settle(element);
    expect(client.viewports).toEqual([{ viewport: 'compact' }, { viewport: 'expanded' }]);
    expect(client.renders[1]?.payload.viewport).toBe('expanded');
    expect(client.disposals.at(-1)).toEqual({
      draftDigest: digest,
      reason: 'studio.preview/draft-superseded',
    });
    element.remove();
  });

  it('announces reload and teardown without moving focus', async () => {
    const { client, element } = await mount();
    client.announceReady();
    await client.waitForRenders(1);
    await settle(element);
    const digest = client.renders[0]?.payload.draftDigest ?? '';
    client.resolveRender(0, { [marker(digest, 0)]: 'node-1' });
    await settle(element);
    const entry = outlineEntry(element, 'node-1');
    entry.focus();

    client.emitMessage(
      previewMessage('studio.preview/reload', { reason: 'studio.preview/renderer-restarted' }, 1),
    );
    await settle(element);
    expect(element.shadowRoot?.activeElement).toBe(entry);
    expect(element.shadowRoot?.querySelector('[aria-live="polite"]')?.textContent).toContain(
      'The preview reloaded',
    );

    client.emitMessage(
      previewMessage('studio.preview/teardown', { reason: 'studio.preview/session-ended' }, 2),
    );
    await settle(element);
    expect(element.shadowRoot?.activeElement).toBe(entry);
    expect(previewStatus(element)).toContain('Preview is disconnected.');
    expect(element.shadowRoot?.querySelector('[aria-live="polite"]')?.textContent).toContain(
      'The preview closed',
    );
    element.remove();
  });

  it('renders an honest fallback while editing remains usable without capability', async () => {
    const { client, element } = await mount({ preview: false });
    expect(previewStatus(element)).toContain('Preview is unavailable for this session.');
    expect(client.order).toEqual([]);

    element.execute({
      artifactId: element.document?.id ?? 'test.blueprint',
      baseStateVersion: element.stateVersion,
      contractVersion: STUDIO_CONTRACT_VERSION,
      id: 'insert-without-preview',
      kind: 'command',
      payload: { destination: { position: 1 }, node: node('node-2') },
      sessionGeneration: 'session-r1',
      type: 'studio.command/insert-node',
    });
    await settle(element);
    expect(element.document?.roots.map((entry) => entry.id)).toEqual(['node-1', 'node-2']);
    element.remove();
  });

  it('reparents over measured preview geometry and exposes the identical keyboard command', async () => {
    const client = new FakePreviewClient();
    client.rectsByNode['section-a'] = [{ height: 100, width: 300, x: 0, y: 0 }];
    client.rectsByNode['text-1'] = [{ height: 30, width: 120, x: 10, y: 20 }];
    client.rectsByNode['section-b'] = [{ height: 100, width: 300, x: 0, y: 200 }];
    const sectionDefinition = defineTestBlock({
      label: 'Section',
      slots: [
        {
          accepts: { types: ['studio.core/text'] },
          id: 'content',
          label: { defaultMessage: 'Content', key: 'studio.test/content' },
          maximum: 20,
          minimum: 0,
          ordered: true,
        },
      ],
      type: 'studio.core/section',
    });
    const { element } = await mount({
      blockDefinitions: [
        sectionDefinition,
        defineTestBlock({ label: 'Text', type: 'studio.core/text' }),
      ],
      client,
      roots: [section('section-a', [node('text-1')]), section('section-b', [])],
    });
    const commandTypes: string[] = [];
    element.addEventListener('studio-document-change', (event) => {
      const detail = (event as CustomEvent<{ command: { type: string } | null }>).detail;
      if (detail.command !== null) {
        commandTypes.push(detail.command.type);
      }
    });
    client.announceReady();
    await client.waitForRenders(1);
    const digest = client.renders[0]?.payload.draftDigest ?? '';
    client.resolveRender(0, {
      [marker(digest, 0)]: 'section-a',
      [marker(digest, 1)]: 'text-1',
      [marker(digest, 2)]: 'section-b',
    });
    await settle(element);

    element.shadowRoot?.querySelector<HTMLButtonElement>('.canvas-edit-toggle')?.click();
    await element.updateComplete;

    const region = element.shadowRoot?.querySelector<SVGRectElement>(
      '.preview-canvas-region[data-node-id="text-1"]',
    );
    const overlay = element.shadowRoot?.querySelector<SVGSVGElement>('.preview-canvas-overlay');
    expect(region).not.toBeNull();
    expect(overlay).not.toBeNull();
    const beforeCancel = structuredClone(element.document);
    region?.dispatchEvent(pointerEvent('pointerdown', 40, 20, 30));
    overlay?.dispatchEvent(pointerEvent('pointermove', 40, 150, 250));
    await element.updateComplete;
    expect(element.shadowRoot?.querySelector('.preview-canvas-drop-indicator')).not.toBeNull();
    overlay?.dispatchEvent(
      new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        composed: true,
        key: 'Escape',
      }),
    );
    await element.updateComplete;
    overlay?.dispatchEvent(pointerEvent('pointerup', 40, 150, 250));
    await element.updateComplete;
    expect(element.document).toEqual(beforeCancel);
    expect(element.shadowRoot?.querySelector('.preview-canvas-drop-indicator')).toBeNull();

    const activeRegion = element.shadowRoot?.querySelector<SVGRectElement>(
      '.preview-canvas-region[data-node-id="text-1"]',
    );
    const activeOverlay =
      element.shadowRoot?.querySelector<SVGSVGElement>('.preview-canvas-overlay');
    activeRegion?.dispatchEvent(pointerEvent('pointerdown', 41, 20, 30));
    activeOverlay?.dispatchEvent(pointerEvent('pointermove', 41, 150, 250));
    await element.updateComplete;
    expect(element.shadowRoot?.querySelector('.preview-canvas-status')?.textContent).toContain(
      'section-b',
    );
    activeOverlay?.dispatchEvent(pointerEvent('pointerup', 41, 150, 250));
    await settle(element);

    expect(element.document?.roots[0]?.slots.content).toBeUndefined();
    expect(element.document?.roots[1]?.slots.content?.map((child) => child.id)).toEqual(['text-1']);
    expect(commandTypes.at(-1)).toBe('studio.command/move-node');

    element.undo();
    await settle(element);
    outlineEntry(element, 'text-1').click();
    await settle(element);
    const destination = element.shadowRoot?.querySelector<HTMLSelectElement>(
      '.outline-move-destination',
    );
    const option = [...(destination?.options ?? [])].find((candidate) =>
      candidate.textContent.includes('section-b'),
    );
    expect(option).toBeDefined();
    if (destination !== null && destination !== undefined && option !== undefined) {
      destination.value = option.value;
      destination.dispatchEvent(new Event('change', { bubbles: true }));
    }
    await settle(element);
    expect(element.document?.roots[1]?.slots.content?.map((child) => child.id)).toEqual(['text-1']);
    expect(commandTypes.at(-1)).toBe('studio.command/move-node');
    element.remove();
  });

  it('renders the same preview in read-only sessions while mutation stays disabled', async () => {
    const { client, element } = await mount({ sessionState: 'read-only' });
    client.announceReady();
    await client.waitForRenders(1);
    await settle(element);
    const digest = client.renders[0]?.payload.draftDigest ?? '';
    client.resolveRender(0, { [marker(digest, 0)]: 'node-1' });
    await settle(element);
    expect(previewStatus(element)).toBe('Preview is current.');
    const paletteButton = element.shadowRoot?.querySelector<HTMLButtonElement>('.palette button');
    expect(paletteButton?.disabled).toBe(true);
    element.remove();
  });
});
