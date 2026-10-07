import { afterEach, describe, expect, it, vi } from 'vitest';
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

async function mountBoundaryRankingScenario(onlyChildHeight: number): Promise<{
  commandTypes: string[];
  element: KumweStudioElement;
  overlay: SVGSVGElement;
  region: SVGRectElement;
}> {
  const client = new FakePreviewClient();
  client.rectsByNode['section-a'] = [{ height: 100, width: 300, x: 0, y: 0 }];
  client.rectsByNode['text-source'] = [{ height: 30, width: 120, x: 10, y: 20 }];
  client.rectsByNode['section-b'] = [{ height: 100, width: 300, x: 0, y: 200 }];
  client.rectsByNode['text-existing'] = [{ height: onlyChildHeight, width: 300, x: 0, y: 200 }];
  const { element } = await mount({
    blockDefinitions: [
      defineTestBlock({
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
      }),
      defineTestBlock({ label: 'Text', type: 'studio.core/text' }),
    ],
    client,
    roots: [
      section('section-a', [node('text-source')]),
      section('section-b', [node('text-existing')]),
    ],
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
    [marker(digest, 1)]: 'text-source',
    [marker(digest, 2)]: 'section-b',
    [marker(digest, 3)]: 'text-existing',
  });
  await settle(element);

  element.shadowRoot?.querySelector<HTMLButtonElement>('.canvas-edit-toggle')?.click();
  await element.updateComplete;
  const region = element.shadowRoot?.querySelector<SVGRectElement>(
    '.preview-canvas-region[data-node-id="text-source"]',
  );
  const overlay = element.shadowRoot?.querySelector<SVGSVGElement>('.preview-canvas-overlay');
  if (region === null || region === undefined || overlay === null || overlay === undefined) {
    throw new Error('Missing measured preview canvas controls.');
  }
  return { commandTypes, element, overlay, region };
}

function crossingEvent(type: 'pointerenter' | 'pointerleave', pointerId: number): PointerEvent {
  // Enter and leave never bubble, so a crossing on one rect or entry cannot
  // reach the stage's own leave listener and fake the result.
  return new PointerEvent(type, { bubbles: false, composed: true, pointerId });
}

function liveRegionText(element: KumweStudioElement): string {
  return element.shadowRoot?.querySelector('[aria-live="polite"]')?.textContent ?? '';
}

function measuredRegion(element: KumweStudioElement, nodeId: string): SVGRectElement {
  const rect = element.shadowRoot?.querySelector<SVGRectElement>(
    `.preview-canvas-region[data-node-id="${nodeId}"]`,
  );
  if (rect === null || rect === undefined) {
    throw new Error(`Missing measured region ${nodeId}`);
  }
  return rect;
}

function previewStage(element: KumweStudioElement): HTMLElement {
  const stage = element.shadowRoot?.querySelector<HTMLElement>('.preview-stage');
  if (stage === null || stage === undefined) {
    throw new Error('Missing preview stage');
  }
  return stage;
}

/**
 * A measured host preview with the edit control left OFF: section-a holds
 * text-1, section-b is empty, and every rect is accepted geometry.
 */
async function mountMeasuredHoverScenario(): Promise<{
  client: FakePreviewClient;
  commandTypes: string[];
  digest: string;
  element: KumweStudioElement;
}> {
  const client = new FakePreviewClient();
  client.rectsByNode['section-a'] = [{ height: 100, width: 300, x: 0, y: 0 }];
  client.rectsByNode['text-1'] = [{ height: 30, width: 120, x: 10, y: 20 }];
  client.rectsByNode['section-b'] = [{ height: 100, width: 300, x: 0, y: 200 }];
  const { element } = await mount({
    blockDefinitions: [
      defineTestBlock({
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
      }),
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
  return { client, commandTypes, digest, element };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('shell preview surface', () => {
  it('keeps the scrollable preview stage keyboard focusable', async () => {
    const { element } = await mount();
    const stage = element.shadowRoot?.querySelector<HTMLElement>('.preview-stage');

    expect(stage).not.toBeNull();
    if (stage === null || stage === undefined) {
      throw new Error('Missing preview stage');
    }
    expect(stage.tabIndex).toBe(0);
    expect(getComputedStyle(stage).overflow).toBe('auto');
    stage.focus();
    expect(element.shadowRoot?.activeElement).toBe(stage);
    element.remove();
  });

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

  it('prefers the deeper semantic destination when parent and only-child boundaries coincide', async () => {
    const { commandTypes, element, overlay, region } = await mountBoundaryRankingScenario(100);

    region.dispatchEvent(pointerEvent('pointerdown', 42, 150, 30));
    overlay.dispatchEvent(pointerEvent('pointermove', 42, 150, 300));
    await element.updateComplete;
    expect(element.shadowRoot?.querySelector('.preview-canvas-status')?.textContent).toContain(
      'section-b',
    );
    expect(element.shadowRoot?.querySelector('.preview-canvas-drop-indicator')).not.toBeNull();

    overlay.dispatchEvent(pointerEvent('pointerup', 42, 150, 300));
    await settle(element);
    expect(element.document?.roots.map((entry) => entry.id)).toEqual(['section-a', 'section-b']);
    expect(element.document?.roots[1]?.slots.content?.map((child) => child.id)).toEqual([
      'text-existing',
      'text-source',
    ]);
    expect(commandTypes.at(-1)).toBe('studio.command/move-node');
    element.remove();
  });

  it('keeps the nearer root destination when the deeper boundary is one pixel farther', async () => {
    const { commandTypes, element, overlay, region } = await mountBoundaryRankingScenario(99);

    region.dispatchEvent(pointerEvent('pointerdown', 43, 150, 30));
    overlay.dispatchEvent(pointerEvent('pointermove', 43, 150, 300));
    await element.updateComplete;
    expect(element.shadowRoot?.querySelector('.preview-canvas-status')?.textContent).not.toContain(
      'section-b',
    );
    expect(element.shadowRoot?.querySelector('.preview-canvas-drop-indicator')).not.toBeNull();

    overlay.dispatchEvent(pointerEvent('pointerup', 43, 150, 300));
    await settle(element);
    expect(element.document?.roots.map((entry) => entry.id)).toEqual([
      'section-a',
      'section-b',
      'text-source',
    ]);
    expect(element.document?.roots[1]?.slots.content?.map((child) => child.id)).toEqual([
      'text-existing',
    ]);
    expect(commandTypes.at(-1)).toBe('studio.command/move-node');
    element.remove();
  });

  it('paints parent regions before their children so a selected parent cannot mask nested selection', async () => {
    const client = new FakePreviewClient();
    const sharedRect = [{ height: 100, width: 300, x: 0, y: 0 }];
    client.rectsByNode['section-a'] = sharedRect;
    client.rectsByNode['text-1'] = sharedRect;
    const { element } = await mount({
      blockDefinitions: [
        defineTestBlock({
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
        }),
        defineTestBlock({ label: 'Text', type: 'studio.core/text' }),
      ],
      client,
      roots: [section('section-a', [node('text-1')])],
    });
    client.announceReady();
    await client.waitForRenders(1);
    const digest = client.renders[0]?.payload.draftDigest ?? '';
    client.resolveRender(0, {
      [marker(digest, 0)]: 'section-a',
      [marker(digest, 1)]: 'text-1',
    });
    await settle(element);

    outlineEntry(element, 'section-a').click();
    await settle(element);

    const regions = [
      ...(element.shadowRoot?.querySelectorAll<SVGRectElement>('.preview-canvas-region') ?? []),
    ];
    expect(regions.map((region) => region.dataset.nodeId)).toEqual(['section-a', 'text-1']);
    expect(regions[0]?.dataset.selected).toBe('true');
    expect(regions.at(-1)?.dataset.selected).toBe('false');
    element.remove();
  });

  it('mirrors hover between a measured region and its outline entry', async () => {
    const { element } = await mountMeasuredHoverScenario();
    const announced = liveRegionText(element);
    expect(outlineEntry(element, 'text-1').dataset.hovered).toBe('false');
    expect(measuredRegion(element, 'text-1').dataset.hovered).toBe('false');

    measuredRegion(element, 'text-1').dispatchEvent(crossingEvent('pointerenter', 60));
    await element.updateComplete;
    expect(outlineEntry(element, 'text-1').dataset.hovered).toBe('true');
    expect(outlineEntry(element, 'section-a').dataset.hovered).toBe('false');

    measuredRegion(element, 'text-1').dispatchEvent(crossingEvent('pointerleave', 60));
    await element.updateComplete;
    expect(outlineEntry(element, 'text-1').dataset.hovered).toBe('false');

    outlineEntry(element, 'text-1').dispatchEvent(crossingEvent('pointerenter', 60));
    await element.updateComplete;
    expect(measuredRegion(element, 'text-1').dataset.hovered).toBe('true');
    expect(measuredRegion(element, 'section-a').dataset.hovered).toBe('false');

    outlineEntry(element, 'text-1').dispatchEvent(crossingEvent('pointerleave', 60));
    await element.updateComplete;
    expect(measuredRegion(element, 'text-1').dataset.hovered).toBe('false');
    expect(liveRegionText(element)).toBe(announced);
    element.remove();
  });

  it('draws a distinct focused region for a focused outline entry', async () => {
    const { element } = await mountMeasuredHoverScenario();
    const entry = outlineEntry(element, 'text-1');
    expect(measuredRegion(element, 'text-1').dataset.focused).toBe('false');

    entry.focus();
    await element.updateComplete;
    expect(element.shadowRoot?.activeElement).toBe(entry);
    const focused = measuredRegion(element, 'text-1');
    expect(focused.dataset.focused).toBe('true');
    expect(focused.dataset.hovered).toBe('false');
    expect(focused.dataset.selected).toBe('false');
    expect(measuredRegion(element, 'section-a').dataset.focused).toBe('false');

    entry.blur();
    await element.updateComplete;
    expect(measuredRegion(element, 'text-1').dataset.focused).toBe('false');

    // Selecting the entry while it holds focus keeps both states on the rect;
    // the solid selection stroke taking precedence is a browser-lane check.
    entry.click();
    entry.focus();
    await settle(element);
    const selectedAndFocused = measuredRegion(element, 'text-1');
    expect(selectedAndFocused.dataset.selected).toBe('true');
    expect(selectedAndFocused.dataset.focused).toBe('true');
    element.remove();
  });

  it('moves the focused region to the node a re-bound entry shows after a document replacement', async () => {
    const { client, element } = await mountMeasuredHoverScenario();
    const entry = outlineEntry(element, 'section-a');
    entry.focus();
    await element.updateComplete;
    expect(measuredRegion(element, 'section-a').dataset.focused).toBe('true');

    // Entries render in place: the same button now shows section-b and keeps
    // focus without a focus event, so the page indicator must follow it.
    element.document = createBlueprintFixture({
      roots: [section('section-b', []), section('section-a', [node('text-1')])],
    });
    await client.waitForRenders(2);
    const digest = client.renders[1]?.payload.draftDigest ?? '';
    client.resolveRender(1, {
      [marker(digest, 0)]: 'section-b',
      [marker(digest, 1)]: 'section-a',
      [marker(digest, 2)]: 'text-1',
    });
    await settle(element);
    expect(element.shadowRoot?.activeElement).toBe(entry);
    expect(entry.dataset.nodeId).toBe('section-b');
    expect(measuredRegion(element, 'section-b').dataset.focused).toBe('true');
    expect(measuredRegion(element, 'section-a').dataset.focused).toBe('false');
    element.remove();
  });

  it('hovers from the passive stage without the edit control, reveals the host-activated node and arms no drag', async () => {
    const { client, commandTypes, digest, element } = await mountMeasuredHoverScenario();
    expect(
      element.shadowRoot
        ?.querySelector('.canvas-toolbar .canvas-edit-toggle')
        ?.getAttribute('aria-pressed'),
    ).toBe('false');
    const scrollIntoView = vi
      .spyOn(HTMLElement.prototype, 'scrollIntoView')
      .mockImplementation(() => undefined);
    const activeBefore = document.activeElement;
    const selectionsBefore = client.selections.length;

    // The overlay has no box in happy-dom, so client coordinates are the
    // viewport coordinates of the accepted measurements: (40, 30) lies inside
    // section-a and its child text-1, and the deepest measurement wins.
    previewStage(element).dispatchEvent(pointerEvent('pointermove', 61, 40, 30));
    await element.updateComplete;
    expect(outlineEntry(element, 'text-1').dataset.hovered).toBe('true');
    expect(outlineEntry(element, 'section-a').dataset.hovered).toBe('false');
    previewStage(element).dispatchEvent(pointerEvent('pointermove', 61, 200, 80));
    await element.updateComplete;
    expect(outlineEntry(element, 'section-a').dataset.hovered).toBe('true');
    expect(outlineEntry(element, 'text-1').dataset.hovered).toBe('false');
    previewStage(element).dispatchEvent(crossingEvent('pointerleave', 61));
    await element.updateComplete;
    expect(element.shadowRoot?.querySelector('.outline-entry[data-hovered="true"]')).toBeNull();

    // Selection stays the host's trusted activation report, which reveals the
    // entry without moving focus and is never echoed back as a selection.
    client.emitActivated({ interaction: 'activate', marker: marker(digest, 1) });
    await settle(element);
    const entry = outlineEntry(element, 'text-1');
    expect(entry.getAttribute('aria-pressed')).toBe('true');
    expect(element.selection).toEqual(['text-1']);
    expect(scrollIntoView.mock.contexts).toContain(entry);
    expect(document.activeElement).toBe(activeBefore);
    expect(element.shadowRoot?.activeElement).toBeNull();
    expect(client.selections).toHaveLength(selectionsBefore);
    // The host activation opens the details layer without moving focus.
    expect(element.shadowRoot?.querySelector('.workspace')?.getAttribute('data-panel-view')).toBe(
      'details',
    );

    // With the control off the overlay arms no drag.
    measuredRegion(element, 'text-1').dispatchEvent(pointerEvent('pointerdown', 62, 20, 30));
    element.shadowRoot
      ?.querySelector('.preview-canvas-overlay')
      ?.dispatchEvent(pointerEvent('pointermove', 62, 80, 90));
    await element.updateComplete;
    expect(element.shadowRoot?.querySelector('.preview-canvas-drop-indicator')).toBeNull();
    measuredRegion(element, 'text-1').dispatchEvent(pointerEvent('pointerup', 62, 80, 90));
    await settle(element);
    expect(commandTypes).toEqual([]);
    expect(element.selection).toEqual(['text-1']);

    // There is no passive click handler: a click on the stage over section-a
    // selects nothing and asks the host for nothing.
    previewStage(element).dispatchEvent(
      new MouseEvent('click', { bubbles: true, clientX: 200, clientY: 80, composed: true }),
    );
    await settle(element);
    expect(element.selection).toEqual(['text-1']);
    expect(client.selections).toHaveLength(selectionsBefore);
    expect(commandTypes).toEqual([]);

    // Back returns to the structure layer and focuses the activated entry.
    element.shadowRoot
      ?.querySelector<HTMLButtonElement>('aside.inspector button.panel-back')
      ?.click();
    await settle(element);
    expect(element.shadowRoot?.querySelector('.workspace')?.getAttribute('data-panel-view')).toBe(
      'structure',
    );
    expect(element.shadowRoot?.activeElement).toBe(outlineEntry(element, 'text-1'));
    expect(element.selection).toEqual(['text-1']);
    element.remove();
  });

  it('renders the edit control in the toolbar', async () => {
    const { element } = await mountMeasuredHoverScenario();
    const toggle = element.shadowRoot?.querySelector<HTMLButtonElement>(
      '.canvas-toolbar .canvas-edit-toggle',
    );
    expect(toggle).not.toBeNull();
    expect(toggle?.getAttribute('aria-pressed')).toBe('false');
    expect(toggle?.textContent?.trim()).toBe('Select and move rendered blocks');
    expect(element.shadowRoot?.querySelector('.preview-region .canvas-edit-toggle')).toBeNull();
    expect(element.shadowRoot?.querySelectorAll('.canvas-edit-toggle')).toHaveLength(1);

    toggle?.click();
    await element.updateComplete;
    expect(
      element.shadowRoot
        ?.querySelector('.canvas-toolbar .canvas-edit-toggle')
        ?.getAttribute('aria-pressed'),
    ).toBe('true');
    expect(liveRegionText(element)).not.toBe('');

    // Once pressed, hover comes from the overlay rects and the stage's passive
    // listeners stay inert.
    previewStage(element).dispatchEvent(pointerEvent('pointermove', 63, 40, 30));
    await element.updateComplete;
    expect(element.shadowRoot?.querySelector('.outline-entry[data-hovered="true"]')).toBeNull();
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

describe('palette-to-canvas insertion', () => {
  async function mountDropScenario(): Promise<{
    button: HTMLButtonElement;
    commandTypes: string[];
    element: KumweStudioElement;
  }> {
    const client = new FakePreviewClient();
    client.rectsByNode['section-a'] = [{ height: 100, width: 300, x: 0, y: 0 }];
    client.rectsByNode['text-1'] = [{ height: 30, width: 120, x: 10, y: 20 }];
    client.rectsByNode['section-b'] = [{ height: 100, width: 300, x: 0, y: 200 }];
    const { element } = await mount({
      blockDefinitions: [
        defineTestBlock({
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
        }),
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
    const button = element.shadowRoot?.querySelector<HTMLButtonElement>(
      '.palette-block[data-block-type="studio.core/text"]',
    );
    if (button === null || button === undefined) {
      throw new Error('Missing the Text palette block.');
    }
    return { button, commandTypes, element };
  }

  it('drops a palette block into the measured empty slot through the same insert-node command', async () => {
    const { button, commandTypes, element } = await mountDropScenario();
    const before = structuredClone(element.document);

    // A plain press stays a click: no drag state, no extra insertion.
    button.dispatchEvent(pointerEvent('pointerdown', 50, 5, 5));
    button.dispatchEvent(pointerEvent('pointerup', 50, 6, 6));
    await element.updateComplete;
    expect(element.document).toEqual(before);

    button.dispatchEvent(pointerEvent('pointerdown', 51, 5, 5));
    button.dispatchEvent(pointerEvent('pointermove', 51, 150, 250));
    await element.updateComplete;
    expect(element.shadowRoot?.querySelector('.preview-canvas-drop-indicator')).not.toBeNull();
    expect(element.shadowRoot?.querySelector('.preview-canvas-status')?.textContent).toContain(
      'section-b',
    );
    button.dispatchEvent(pointerEvent('pointerup', 51, 150, 250));
    // The browser follows a captured pointerup with a compatibility click; it
    // must not insert a second block.
    button.click();
    await settle(element);

    expect(commandTypes).toEqual(['studio.command/insert-node']);
    expect(element.document?.roots).toHaveLength(2);
    expect(element.document?.roots[1]?.slots.content?.map((child) => child.id)).toEqual(['text-2']);
    expect(element.selection).toEqual(['text-2']);
    expect(element.shadowRoot?.querySelector('.preview-canvas-drop-indicator')).toBeNull();

    // The identical placement is available without dragging: insert, then
    // choose the destination from the outline's native selector.
    element.undo();
    await settle(element);
    expect(element.document).toEqual(before);
    element.selectNode(undefined);
    await settle(element);
    button.click();
    await settle(element);
    expect(element.document?.roots.map((root) => root.id)).toEqual([
      'section-a',
      'section-b',
      'text-2',
    ]);
    outlineEntry(element, 'text-2').click();
    await settle(element);
    const destination = element.shadowRoot?.querySelector<HTMLSelectElement>(
      '.outline-move-destination',
    );
    const option = [...(destination?.options ?? [])].find((candidate) =>
      candidate.textContent.includes('section-b'),
    );
    expect(option).toBeDefined();
    if (destination == null || option === undefined) throw new Error('Missing destination.');
    destination.value = option.value;
    destination.dispatchEvent(new Event('change', { bubbles: true }));
    await settle(element);
    expect(element.document?.roots).toHaveLength(2);
    expect(element.document?.roots[1]?.slots.content?.map((child) => child.id)).toEqual(['text-2']);
    element.remove();
  });

  it('leaves the document unchanged when Escape or pointercancel ends a palette carry', async () => {
    const { button, commandTypes, element } = await mountDropScenario();
    const before = structuredClone(element.document);

    button.dispatchEvent(pointerEvent('pointerdown', 52, 5, 5));
    button.dispatchEvent(pointerEvent('pointermove', 52, 150, 250));
    await element.updateComplete;
    expect(element.shadowRoot?.querySelector('.preview-canvas-drop-indicator')).not.toBeNull();
    document.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Escape' }),
    );
    await element.updateComplete;
    expect(element.shadowRoot?.querySelector('.preview-canvas-drop-indicator')).toBeNull();
    button.dispatchEvent(pointerEvent('pointerup', 52, 150, 250));
    button.click();
    await settle(element);
    expect(element.document).toEqual(before);

    button.dispatchEvent(pointerEvent('pointerdown', 53, 5, 5));
    button.dispatchEvent(pointerEvent('pointermove', 53, 150, 250));
    button.dispatchEvent(pointerEvent('pointercancel', 53, 150, 250));
    await settle(element);
    expect(element.document).toEqual(before);
    expect(commandTypes).toEqual([]);
    expect(element.shadowRoot?.querySelector('.live-region, [aria-live]')?.textContent).toContain(
      'cancelled',
    );

    // Later deliberate clicks insert normally again.
    await new Promise((resolve) => setTimeout(resolve, 1));
    button.click();
    await settle(element);
    expect(commandTypes).toEqual(['studio.command/insert-node']);
    element.remove();
  });

  it('offers no palette carry in read-only sessions', async () => {
    const client = new FakePreviewClient();
    const { element } = await mount({ client, sessionState: 'read-only' });
    client.announceReady();
    await client.waitForRenders(1);
    const digest = client.renders[0]?.payload.draftDigest ?? '';
    client.resolveRender(0, { [marker(digest, 0)]: 'node-1' });
    await settle(element);
    const button = element.shadowRoot?.querySelector<HTMLButtonElement>('.palette-block');
    const before = structuredClone(element.document);
    button?.dispatchEvent(pointerEvent('pointerdown', 54, 5, 5));
    button?.dispatchEvent(pointerEvent('pointermove', 54, 150, 250));
    await element.updateComplete;
    expect(element.shadowRoot?.querySelector('.preview-canvas-drop-indicator')).toBeNull();
    button?.dispatchEvent(pointerEvent('pointerup', 54, 150, 250));
    await settle(element);
    expect(element.document).toEqual(before);
    element.remove();
  });
});
