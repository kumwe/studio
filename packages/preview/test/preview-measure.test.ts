import { describe, expect, it } from 'vitest';
import {
  isPreviewMessage,
  STUDIO_CONTRACT_VERSION,
  type PreviewErrorMessage,
  type PreviewMarkerRect,
  type PreviewMeasureMessage,
  type PreviewMeasurementsMessage,
  type PreviewRenderedMessage,
  type PreviewViewportMetrics,
} from '@kumwe/studio-protocol';
import {
  PreviewClient,
  PreviewHost,
  type PreviewMeasureCallback,
  type PreviewMeasurement,
  type PreviewMessageEvent,
  type PreviewMessageListener,
} from '../src/index.js';

const digest = 'a'.repeat(64);
const newerDigest = 'b'.repeat(64);

function previewMarker(draftDigest: string, ordinal: number): string {
  return `studio.preview/node/${draftDigest}/${ordinal}`;
}

const viewport: PreviewViewportMetrics = {
  devicePixelRatio: 2,
  height: 800,
  scrollX: 0,
  scrollY: 120,
  width: 1280,
};

class FakeWindow {
  public inboundOrigin = '';
  public inboundSource: unknown;
  public listener: PreviewMessageListener | undefined;
  public readonly posted: unknown[] = [];

  public addEventListener(_type: 'message', listener: PreviewMessageListener): void {
    this.listener = listener;
  }

  public emit(event: PreviewMessageEvent): void {
    this.listener?.(event);
  }

  public postMessage(message: unknown): void {
    this.posted.push(message);
    this.emit({ data: message, origin: this.inboundOrigin, source: this.inboundSource });
  }

  public removeEventListener(_type: 'message', listener: PreviewMessageListener): void {
    if (this.listener === listener) {
      this.listener = undefined;
    }
  }
}

interface LinkedPair {
  clientWindow: FakeWindow;
  hostWindow: FakeWindow;
}

function linkedPair(): LinkedPair {
  const clientWindow = new FakeWindow();
  const hostWindow = new FakeWindow();
  clientWindow.inboundOrigin = 'https://preview.test';
  clientWindow.inboundSource = hostWindow;
  hostWindow.inboundOrigin = 'https://studio.test';
  hostWindow.inboundSource = clientWindow;
  return { clientWindow, hostWindow };
}

function createClient(pair: LinkedPair, timeoutMilliseconds = 10_000): PreviewClient {
  return new PreviewClient({
    channelId: 'preview-channel-1',
    sessionGeneration: 'session-r1',
    source: pair.clientWindow,
    target: pair.hostWindow,
    targetOrigin: 'https://preview.test',
    timeoutMilliseconds,
  });
}

function createHost(pair: LinkedPair, measure?: PreviewMeasureCallback): PreviewHost {
  return new PreviewHost({
    channelId: 'preview-channel-1',
    ...(measure === undefined ? {} : { measure }),
    render: (payload) => {
      const marker0 = previewMarker(payload.draftDigest, 0);
      const marker1 = previewMarker(payload.draftDigest, 1);
      const markers = [marker0, marker1];
      return Promise.resolve({
        diagnostics: [],
        draftDigest: payload.draftDigest,
        markerMap: { [marker0]: 'node-1', [marker1]: 'node-2' },
        markers,
        requestId: payload.requestId,
      });
    },
    renderer: 'kumwe/fixture-renderer',
    sessionGeneration: 'session-r1',
    source: pair.hostWindow,
    target: pair.clientWindow,
    targetOrigin: 'https://studio.test',
    viewports: ['expanded'],
  });
}

function rect(x: number, y: number, width: number, height: number): PreviewMarkerRect {
  return { height, width, x, y };
}

function measureRequest(requestId: string, sequence: number): PreviewMeasureMessage {
  return {
    channelId: 'preview-channel-1',
    contractVersion: STUDIO_CONTRACT_VERSION,
    kind: 'preview-message',
    payload: {
      markers: [
        'studio.preview/node/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/0',
      ],
      requestId,
    },
    sequence,
    sessionGeneration: 'session-r1',
    type: 'studio.preview/measure',
  };
}

function renderedMessage(
  draftDigest: string,
  sequence: number,
  requestId = 'renders/1',
): PreviewRenderedMessage {
  const marker = previewMarker(draftDigest, 0);
  return {
    channelId: 'preview-channel-1',
    contractVersion: STUDIO_CONTRACT_VERSION,
    kind: 'preview-message',
    payload: {
      diagnostics: [],
      draftDigest,
      markerMap: { [marker]: 'node-1' },
      markers: [marker],
      requestId,
    },
    sequence,
    sessionGeneration: 'session-r1',
    type: 'studio.preview/rendered',
  };
}

function measurementsMessage(
  requestId: string,
  draftDigest: string,
  sequence: number,
): PreviewMeasurementsMessage {
  const marker = previewMarker(draftDigest, 0);
  return {
    channelId: 'preview-channel-1',
    contractVersion: STUDIO_CONTRACT_VERSION,
    kind: 'preview-message',
    payload: {
      draftDigest,
      measurements: { [marker]: [rect(10, 20, 300, 16)] },
      requestId,
      unknown: [],
      viewport,
    },
    sequence,
    sessionGeneration: 'session-r1',
    type: 'studio.preview/measurements',
  };
}

function postedByType(windowRef: FakeWindow, type: string): unknown[] {
  return windowRef.posted.filter((message) => (message as { type?: string }).type === type);
}

async function renderFirst(client: PreviewClient): Promise<void> {
  await client.render({
    artifactId: 'blueprint-1',
    draftDigest: digest,
    draftRevision: 'blueprint-r1',
    requestId: 'renders/1',
    viewport: 'expanded',
  });
}

describe('measure round trips', () => {
  it('snapshots the request identity and marker inventory before caller mutation', async () => {
    const pair = linkedPair();
    const client = createClient(pair);
    let settle: ((measurement: PreviewMeasurement) => void) | undefined;
    createHost(
      pair,
      () =>
        new Promise((resolve) => {
          settle = resolve;
        }),
    );
    await renderFirst(client);
    const marker0 = previewMarker(digest, 0);
    const mutableRequest = { markers: [marker0], requestId: 'measure-mutable' };

    const outcome = client.measure(mutableRequest);
    mutableRequest.requestId = 'measure-mutated';
    mutableRequest.markers[0] = previewMarker(digest, 1);
    settle?.({ rects: { [marker0]: [rect(10, 20, 300, 16)] }, viewport });

    expect(postedByType(pair.hostWindow, 'studio.preview/measure')).toEqual([
      expect.objectContaining({
        payload: { markers: [marker0], requestId: 'measure-mutable' },
      }),
    ]);
    await expect(outcome).resolves.toMatchObject({
      geometry: { requestId: 'measure-mutable' },
      status: 'measured',
    });
  });

  it('round-trips multi-rect marker geometry from the renderer-supplied measurer', async () => {
    const pair = linkedPair();
    const client = createClient(pair);
    const rects = {
      'studio.preview/node/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/0': [
        rect(10, 20, 300, 16),
        rect(10, 36, 120, 16),
      ],
      'studio.preview/node/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/1': [
        rect(10, 60, 300, 40),
      ],
    };
    const measured: string[][] = [];
    const responder = createHost(pair, (markers) => {
      measured.push([...markers]);
      return Promise.resolve({ rects, viewport });
    });
    await renderFirst(client);

    const outcome = await client.measure({
      markers: [
        'studio.preview/node/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/0',
        'studio.preview/node/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/1',
      ],
      requestId: 'measure-1',
    });

    expect(outcome).toEqual({
      geometry: {
        draftDigest: digest,
        measurements: rects,
        requestId: 'measure-1',
        unknown: [],
        viewport,
      },
      status: 'measured',
    });
    expect(measured).toEqual([
      [
        'studio.preview/node/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/0',
        'studio.preview/node/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/1',
      ],
    ]);
    const wire = postedByType(pair.clientWindow, 'studio.preview/measurements').at(0);
    expect(isPreviewMessage(wire)).toBe(true);
    client.dispose();
    responder.dispose();
  });

  it('reports unmeasurable markers in the distinct unknown list', async () => {
    const pair = linkedPair();
    const client = createClient(pair);
    const responder = createHost(pair, () =>
      Promise.resolve({
        rects: {
          'studio.preview/node/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/0':
            [rect(0, 0, 10, 10)],
        },
        viewport,
      }),
    );
    await renderFirst(client);

    const outcome = await client.measure({
      markers: [
        'studio.preview/node/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/0',
        'studio.preview/node/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/1',
      ],
      requestId: 'measure-1',
    });

    expect(outcome).toEqual({
      geometry: {
        draftDigest: digest,
        measurements: {
          'studio.preview/node/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/0':
            [rect(0, 0, 10, 10)],
        },
        requestId: 'measure-1',
        unknown: [
          'studio.preview/node/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/1',
        ],
        viewport,
      },
      status: 'measured',
    });
    client.dispose();
    responder.dispose();
  });

  it('drops markers the measurer invents beyond the requested list', async () => {
    const pair = linkedPair();
    const client = createClient(pair);
    const responder = createHost(pair, () =>
      Promise.resolve({
        rects: {
          'studio.preview/node/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/0':
            [rect(0, 0, 10, 10)],
          'studio.preview/node/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/4':
            [rect(1, 1, 2, 2)],
        },
        viewport,
      }),
    );
    await renderFirst(client);

    const outcome = await client.measure({
      markers: [
        'studio.preview/node/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/0',
      ],
      requestId: 'measure-1',
    });

    expect(outcome).toEqual({
      geometry: {
        draftDigest: digest,
        measurements: {
          'studio.preview/node/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/0':
            [rect(0, 0, 10, 10)],
        },
        requestId: 'measure-1',
        unknown: [],
        viewport,
      },
      status: 'measured',
    });
    client.dispose();
    responder.dispose();
  });
});

describe('measure failure isolation', () => {
  it('rejects a foreign marker at the client without posting or invoking the host', async () => {
    const pair = linkedPair();
    const client = createClient(pair);
    let calls = 0;
    const responder = createHost(pair, () => {
      calls += 1;
      return Promise.resolve({ rects: {}, viewport });
    });
    await renderFirst(client);
    const outboundBefore = pair.hostWindow.posted.length;

    await expect(
      client.measure({
        markers: [previewMarker(digest, 2)],
        requestId: 'measure-1',
      }),
    ).rejects.toMatchObject({ code: 'studio.preview/measure-stale-marker' });
    expect(calls).toBe(0);
    expect(pair.hostWindow.posted).toHaveLength(outboundBefore);
    client.dispose();
    responder.dispose();
  });

  it('answers a raw foreign-marker request with a stable error before measuring', async () => {
    const pair = linkedPair();
    const client = createClient(pair);
    let calls = 0;
    const responder = createHost(pair, () => {
      calls += 1;
      return Promise.resolve({ rects: {}, viewport });
    });
    await renderFirst(client);

    pair.hostWindow.emit({
      data: {
        ...measureRequest('raw-measure-1', 1),
        payload: { markers: [previewMarker(digest, 2)], requestId: 'raw-measure-1' },
      },
      origin: 'https://studio.test',
      source: pair.clientWindow,
    });

    expect(calls).toBe(0);
    const failure = postedByType(pair.clientWindow, 'studio.preview/error').at(0);
    expect((failure as PreviewErrorMessage).payload).toMatchObject({
      code: 'studio.preview/measure-stale-marker',
      correlationId: 'raw-measure-1',
      retryable: true,
    });
    client.dispose();
    responder.dispose();
  });

  it('isolates a rejecting measurer behind a stable qualified error', async () => {
    const pair = linkedPair();
    const client = createClient(pair);
    const responder = createHost(pair, () =>
      Promise.reject(new Error('secret measurer detail: /etc/passwd')),
    );
    await renderFirst(client);

    const measure = client.measure({
      markers: [
        'studio.preview/node/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/0',
      ],
      requestId: 'measure-1',
    });

    await expect(measure).rejects.toThrow('Preview measurement failed.');
    const failure = postedByType(pair.clientWindow, 'studio.preview/error').at(0);
    expect((failure as PreviewErrorMessage).payload).toEqual({
      code: 'studio.preview/measure-failed',
      correlationId: 'measure-1',
      message: {
        defaultMessage: 'Preview measurement failed.',
        key: 'studio.preview/measure-failed',
      },
      retryable: true,
    });
    expect(JSON.stringify(pair.clientWindow.posted)).not.toContain('secret measurer detail');
    client.dispose();
    responder.dispose();
  });

  it('isolates a synchronously throwing measurer the same way', async () => {
    const pair = linkedPair();
    const client = createClient(pair);
    const responder = createHost(pair, () => {
      throw new Error('secret synchronous detail');
    });
    await renderFirst(client);

    await expect(
      client.measure({
        markers: [
          'studio.preview/node/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/0',
        ],
        requestId: 'measure-1',
      }),
    ).rejects.toThrow('Preview measurement failed.');
    expect(JSON.stringify(pair.clientWindow.posted)).not.toContain('secret synchronous detail');
    client.dispose();
    responder.dispose();
  });

  it('answers measure requests as unavailable when no measurer is configured', async () => {
    const pair = linkedPair();
    const client = createClient(pair);
    const responder = createHost(pair);
    await renderFirst(client);

    const measure = client.measure({
      markers: [
        'studio.preview/node/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/0',
      ],
      requestId: 'measure-1',
    });

    await expect(measure).rejects.toThrow('Preview measurement is unavailable.');
    const failure = postedByType(pair.clientWindow, 'studio.preview/error').at(0);
    expect((failure as PreviewErrorMessage).payload).toEqual({
      code: 'studio.preview/measure-unavailable',
      correlationId: 'measure-1',
      message: {
        defaultMessage: 'Preview measurement is unavailable.',
        key: 'studio.preview/measure-unavailable',
      },
      retryable: false,
    });
    client.dispose();
    responder.dispose();
  });

  it('answers a measure request that precedes any completed render as retryable-unavailable', () => {
    const pair = linkedPair();
    let calls = 0;
    const responder = createHost(pair, () => {
      calls += 1;
      return Promise.resolve({ rects: {}, viewport });
    });

    pair.hostWindow.emit({
      data: measureRequest('measure-1', 0),
      origin: 'https://studio.test',
      source: pair.clientWindow,
    });

    expect(calls).toBe(0);
    const failure = postedByType(pair.clientWindow, 'studio.preview/error').at(0);
    expect((failure as PreviewErrorMessage).payload).toMatchObject({
      code: 'studio.preview/measure-unavailable',
      correlationId: 'measure-1',
      retryable: true,
    });
    responder.dispose();
  });
});

describe('measure lifecycle', () => {
  it('rejects measure before this client has a completed render', async () => {
    const pair = linkedPair();
    const client = createClient(pair);
    const responder = createHost(pair, () => Promise.resolve({ rects: {}, viewport }));

    await expect(
      client.measure({
        markers: [
          'studio.preview/node/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/0',
        ],
        requestId: 'measure-1',
      }),
    ).rejects.toThrow(/completed render/u);
    client.dispose();
    responder.dispose();
  });

  it('voids an in-flight measure on reload and drops the late measurer result', async () => {
    const pair = linkedPair();
    const client = createClient(pair);
    const resolvers: ((measurement: PreviewMeasurement) => void)[] = [];
    const responder = createHost(
      pair,
      () =>
        new Promise<PreviewMeasurement>((resolve) => {
          resolvers.push(resolve);
        }),
    );
    await renderFirst(client);

    const measure = client.measure({
      markers: [
        'studio.preview/node/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/0',
      ],
      requestId: 'measure-1',
    });
    responder.reload('studio.preview/renderer-restarted');

    await expect(measure).rejects.toThrow('Preview renderer reloaded before responding.');
    resolvers.at(0)?.({
      rects: {
        'studio.preview/node/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/0': [
          rect(0, 0, 1, 1),
        ],
      },
      viewport,
    });
    await Promise.resolve();
    expect(postedByType(pair.clientWindow, 'studio.preview/measurements')).toHaveLength(0);
    client.dispose();
    responder.dispose();
  });

  it('aborts measurement before a viewport listener runs and drops late geometry', async () => {
    const pair = linkedPair();
    const client = createClient(pair);
    let resolveMeasurement: ((measurement: PreviewMeasurement) => void) | undefined;
    let measureSignal: AbortSignal | undefined;
    const responder = createHost(
      pair,
      (_markers, signal) =>
        new Promise<PreviewMeasurement>((resolve) => {
          measureSignal = signal;
          resolveMeasurement = resolve;
        }),
    );
    const abortedAtViewportListener: boolean[] = [];
    responder.onViewport(() => {
      abortedAtViewportListener.push(measureSignal?.aborted === true);
    });
    await renderFirst(client);

    const measure = client.measure({ markers: [previewMarker(digest, 0)], requestId: 'measure-1' });
    client.setViewport({ height: 800 });

    await expect(measure).rejects.toMatchObject({
      code: 'studio.preview/measure-viewport-changed',
    });
    expect(abortedAtViewportListener).toEqual([true]);
    expect(measureSignal?.aborted).toBe(true);

    resolveMeasurement?.({
      rects: { [previewMarker(digest, 0)]: [rect(0, 0, 1, 1)] },
      viewport,
    });
    await Promise.resolve();
    expect(postedByType(pair.clientWindow, 'studio.preview/measurements')).toHaveLength(0);
    client.dispose();
    responder.dispose();
  });

  it('invalidates an in-flight measurement when the same digest is rerendered', async () => {
    const pair = linkedPair();
    const client = createClient(pair);
    let resolveMeasurement: ((measurement: PreviewMeasurement) => void) | undefined;
    let measureSignal: AbortSignal | undefined;
    const responder = createHost(
      pair,
      (_markers, signal) =>
        new Promise<PreviewMeasurement>((resolve) => {
          measureSignal = signal;
          resolveMeasurement = resolve;
        }),
    );
    await renderFirst(client);

    const measure = client.measure({ markers: [previewMarker(digest, 0)], requestId: 'measure-1' });
    await client.render({
      artifactId: 'blueprint-1',
      draftDigest: digest,
      draftRevision: 'blueprint-r1',
      requestId: 'renders/2',
      viewport: 'compact',
    });
    await expect(measure).rejects.toThrow(/superseded/u);
    expect(measureSignal?.aborted).toBe(true);

    resolveMeasurement?.({
      rects: { [previewMarker(digest, 0)]: [rect(0, 0, 1, 1)] },
      viewport,
    });
    await Promise.resolve();
    expect(postedByType(pair.clientWindow, 'studio.preview/measurements')).toHaveLength(0);
    client.dispose();
    responder.dispose();
  });

  it('supersedes an older measure and answers only the newest request', async () => {
    const pair = linkedPair();
    const client = createClient(pair);
    const resolvers: ((measurement: PreviewMeasurement) => void)[] = [];
    const responder = createHost(
      pair,
      () =>
        new Promise<PreviewMeasurement>((resolve) => {
          resolvers.push(resolve);
        }),
    );
    await renderFirst(client);

    const older = client.measure({
      markers: [
        'studio.preview/node/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/0',
      ],
      requestId: 'measure-1',
    });
    const newer = client.measure({
      markers: [
        'studio.preview/node/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/0',
      ],
      requestId: 'measure-2',
    });

    resolvers.at(0)?.({
      rects: {
        'studio.preview/node/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/0': [
          rect(0, 0, 1, 1),
        ],
      },
      viewport,
    });
    resolvers.at(1)?.({
      rects: {
        'studio.preview/node/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/0': [
          rect(2, 2, 3, 3),
        ],
      },
      viewport,
    });

    await expect(older).rejects.toThrow(/superseded/u);
    await expect(newer).resolves.toEqual({
      geometry: {
        draftDigest: digest,
        measurements: {
          'studio.preview/node/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/0':
            [rect(2, 2, 3, 3)],
        },
        requestId: 'measure-2',
        unknown: [],
        viewport,
      },
      status: 'measured',
    });
    expect(postedByType(pair.clientWindow, 'studio.preview/measurements')).toHaveLength(1);
    client.dispose();
    responder.dispose();
  });

  it('rejects geometry whose marker partition belongs to another digest', async () => {
    const pair = linkedPair();
    const client = createClient(pair);
    const render = client.render({
      artifactId: 'blueprint-1',
      draftDigest: digest,
      draftRevision: 'blueprint-r1',
      requestId: 'renders/1',
      viewport: 'expanded',
    });
    pair.clientWindow.emit({
      data: renderedMessage(digest, 0),
      origin: 'https://preview.test',
      source: pair.hostWindow,
    });
    await render;

    const measure = client.measure({
      markers: [
        'studio.preview/node/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/0',
      ],
      requestId: 'measure-1',
    });
    pair.clientWindow.emit({
      data: measurementsMessage('measure-1', newerDigest, 1),
      origin: 'https://preview.test',
      source: pair.hostWindow,
    });

    await expect(measure).rejects.toMatchObject({
      code: 'studio.preview/invalid-measurements',
    });
    client.dispose();
  });

  it('ignores measure traffic on a disposed responder', () => {
    const pair = linkedPair();
    let calls = 0;
    const responder = createHost(pair, () => {
      calls += 1;
      return Promise.resolve({ rects: {}, viewport });
    });
    responder.dispose();

    pair.hostWindow.emit({
      data: measureRequest('measure-1', 0),
      origin: 'https://studio.test',
      source: pair.clientWindow,
    });

    expect(calls).toBe(0);
    expect(pair.clientWindow.posted).toHaveLength(0);
  });

  it('rejects an in-flight measure when the client is disposed', async () => {
    const pair = linkedPair();
    const client = createClient(pair);
    const responder = createHost(pair, () => new Promise<PreviewMeasurement>(() => undefined));
    await renderFirst(client);

    const measure = client.measure({
      markers: [
        'studio.preview/node/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/0',
      ],
      requestId: 'measure-1',
    });
    client.dispose();

    await expect(measure).rejects.toThrow(/disposed/u);
    await expect(
      client.measure({
        markers: [
          'studio.preview/node/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/0',
        ],
        requestId: 'measure-2',
      }),
    ).rejects.toThrow(/disposed/u);
    responder.dispose();
  });
});

describe('measure message guards', () => {
  function canonicalMeasure(): Record<string, unknown> {
    return measureRequest('measure-1', 0) as unknown as Record<string, unknown>;
  }

  function canonicalMeasurements(): Record<string, unknown> {
    return measurementsMessage('measure-1', digest, 1) as unknown as Record<string, unknown>;
  }

  function withMeasurementsPayload(payload: Record<string, unknown>): Record<string, unknown> {
    return { ...canonicalMeasurements(), payload };
  }

  function measurementsPayload(): Record<string, unknown> {
    return {
      draftDigest: digest,
      measurements: {
        'studio.preview/node/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/0': [
          rect(10, 20, 300, 16),
        ],
      },
      requestId: 'measure-1',
      unknown: [],
      viewport,
    };
  }

  it('accepts canonical measure and measurements messages', () => {
    expect(isPreviewMessage(canonicalMeasure())).toBe(true);
    expect(isPreviewMessage(canonicalMeasurements())).toBe(true);
  });

  it('rejects oversized marker lists and measurement maps', () => {
    const oversizedRequest = {
      ...canonicalMeasure(),
      payload: {
        markers: Array.from({ length: 1_001 }, (_, index) => previewMarker(digest, index)),
        requestId: 'measure-1',
      },
    };
    const oversizedMap = withMeasurementsPayload({
      ...measurementsPayload(),
      measurements: Object.fromEntries(
        Array.from({ length: 1_001 }, (_, index) => [
          previewMarker(digest, index),
          [rect(0, 0, 1, 1)],
        ]),
      ),
    });
    const oversizedUnknown = withMeasurementsPayload({
      ...measurementsPayload(),
      unknown: Array.from({ length: 1_001 }, (_, index) => previewMarker(digest, index)),
    });

    expect(isPreviewMessage(oversizedRequest)).toBe(false);
    expect(isPreviewMessage(oversizedMap)).toBe(false);
    expect(isPreviewMessage(oversizedUnknown)).toBe(false);
  });

  it('rejects non-finite and out-of-bound geometry numbers', () => {
    const nanRect = withMeasurementsPayload({
      ...measurementsPayload(),
      measurements: {
        'studio.preview/node/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/0': [
          { height: 16, width: 300, x: Number.NaN, y: 20 },
        ],
      },
    });
    const infiniteRect = withMeasurementsPayload({
      ...measurementsPayload(),
      measurements: {
        'studio.preview/node/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/0': [
          { height: 16, width: Number.POSITIVE_INFINITY, x: 10, y: 20 },
        ],
      },
    });
    const negativeExtent = withMeasurementsPayload({
      ...measurementsPayload(),
      measurements: {
        'studio.preview/node/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/0': [
          rect(10, 20, -1, 16),
        ],
      },
    });
    const hugeCoordinate = withMeasurementsPayload({
      ...measurementsPayload(),
      measurements: {
        'studio.preview/node/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/0': [
          rect(1_000_000_000, 20, 300, 16),
        ],
      },
    });
    const nanViewport = withMeasurementsPayload({
      ...measurementsPayload(),
      viewport: { ...viewport, devicePixelRatio: Number.NaN },
    });
    const zeroPixelRatio = withMeasurementsPayload({
      ...measurementsPayload(),
      viewport: { ...viewport, devicePixelRatio: 0 },
    });

    expect(isPreviewMessage(nanRect)).toBe(false);
    expect(isPreviewMessage(infiniteRect)).toBe(false);
    expect(isPreviewMessage(negativeExtent)).toBe(false);
    expect(isPreviewMessage(hugeCoordinate)).toBe(false);
    expect(isPreviewMessage(nanViewport)).toBe(false);
    expect(isPreviewMessage(zeroPixelRatio)).toBe(false);
  });

  it('rejects unknown members on payloads, rectangles, and viewport records', () => {
    const extraRequestMember = {
      ...canonicalMeasure(),
      payload: {
        markers: [
          'studio.preview/node/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/0',
        ],
        requestId: 'measure-1',
        urgent: true,
      },
    };
    const extraRectMember = withMeasurementsPayload({
      ...measurementsPayload(),
      measurements: {
        'studio.preview/node/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/0': [
          { height: 16, top: 20, width: 300, x: 10, y: 20 },
        ],
      },
    });
    const extraViewportMember = withMeasurementsPayload({
      ...measurementsPayload(),
      viewport: { ...viewport, zoom: 1 },
    });

    expect(isPreviewMessage(extraRequestMember)).toBe(false);
    expect(isPreviewMessage(extraRectMember)).toBe(false);
    expect(isPreviewMessage(extraViewportMember)).toBe(false);
  });

  it('rejects unsafe member names and empty rectangle lists in the measurement map', () => {
    const polluted = withMeasurementsPayload({
      ...measurementsPayload(),
      measurements: JSON.parse(
        '{"__proto__": [{"height": 1, "width": 1, "x": 0, "y": 0}]}',
      ) as Record<string, unknown>,
    });
    const emptyRects = withMeasurementsPayload({
      ...measurementsPayload(),
      measurements: {
        'studio.preview/node/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/0':
          [],
      },
    });

    expect(isPreviewMessage(polluted)).toBe(false);
    expect(isPreviewMessage(emptyRects)).toBe(false);
  });
});
