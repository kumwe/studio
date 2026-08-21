import { describe, expect, it } from 'vitest';
import {
  STUDIO_CONTRACT_VERSION,
  STUDIO_WIRE_PROTOCOL_VERSION,
  type PreviewErrorMessage,
  type PreviewRenderMessage,
  type PreviewRenderedPayload,
  type PreviewSelectPayload,
} from '@kumwe/studio-protocol';
import {
  PreviewClient,
  PreviewHost,
  type PreviewMessageEvent,
  type PreviewMessageListener,
  type PreviewRenderCallback,
} from '../src/index.js';

const neverSettle = (): void => undefined;
const digest = 'a'.repeat(64);
const newerDigest = 'b'.repeat(64);
const foreignDigest = 'c'.repeat(64);

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

function createHost(pair: LinkedPair, render: PreviewRenderCallback): PreviewHost {
  return new PreviewHost({
    channelId: 'preview-channel-1',
    render,
    renderer: 'kumwe/fixture-renderer',
    sessionGeneration: 'session-r1',
    source: pair.hostWindow,
    target: pair.clientWindow,
    targetOrigin: 'https://studio.test',
    viewports: ['compact', 'expanded'],
  });
}

function request(
  draftDigest = digest,
  requestId = 'renders/1',
  viewport = 'expanded',
): PreviewRenderMessage['payload'] {
  return {
    artifactId: 'blueprint-1',
    draftDigest,
    draftRevision: 'blueprint-r1',
    requestId,
    viewport,
  };
}

function renderedPayload(draftDigest = digest, requestId = 'renders/1'): PreviewRenderedPayload {
  const marker = `studio.preview/node/${draftDigest}/0`;
  return {
    diagnostics: [],
    draftDigest,
    markerMap: { [marker]: 'node-1' },
    markers: [marker],
    requestId,
  };
}

function renderRequest(draftDigest = digest, sequence = 0): PreviewRenderMessage {
  return {
    channelId: 'preview-channel-1',
    contractVersion: STUDIO_CONTRACT_VERSION,
    kind: 'preview-message',
    payload: request(draftDigest, `renders/${sequence + 1}`),
    sequence,
    sessionGeneration: 'session-r1',
    type: 'studio.preview/render',
  };
}

function postedByType(windowRef: FakeWindow, type: string): unknown[] {
  return windowRef.posted.filter((message) => (message as { type?: string }).type === type);
}

describe('PreviewHost', () => {
  it('rejects wildcard target origins', () => {
    const pair = linkedPair();
    expect(
      () =>
        new PreviewHost({
          channelId: 'preview-channel-1',
          render: () => Promise.resolve(renderedPayload()),
          renderer: 'kumwe/fixture-renderer',
          sessionGeneration: 'session-r1',
          source: pair.hostWindow,
          target: pair.clientWindow,
          targetOrigin: '*',
          viewports: ['expanded'],
        }),
    ).toThrow(/wildcard/u);
  });

  it('announces a canonical ready message with its own sequence counter', () => {
    const pair = linkedPair();
    const responder = createHost(pair, () => Promise.resolve(renderedPayload()));
    responder.announce();

    expect(pair.clientWindow.posted).toEqual([
      {
        channelId: 'preview-channel-1',
        contractVersion: STUDIO_CONTRACT_VERSION,
        kind: 'preview-message',
        payload: {
          protocolVersion: STUDIO_WIRE_PROTOCOL_VERSION,
          renderer: 'kumwe/fixture-renderer',
          viewports: ['compact', 'expanded'],
        },
        sequence: 0,
        sessionGeneration: 'session-r1',
        type: 'studio.preview/ready',
      },
    ]);
    responder.dispose();
    expect(() => responder.announce()).toThrow(/disposed/u);
  });

  it('completes the announce to ready() handshake against a linked client', async () => {
    const pair = linkedPair();
    const preview = createClient(pair);
    const responder = createHost(pair, () => Promise.resolve(renderedPayload()));
    const ready = preview.ready();
    responder.announce();

    await expect(ready).resolves.toEqual({
      protocolVersion: STUDIO_WIRE_PROTOCOL_VERSION,
      renderer: 'kumwe/fixture-renderer',
      viewports: ['compact', 'expanded'],
    });
    preview.dispose();
    responder.dispose();
  });

  it('round-trips a render request through the host callback', async () => {
    const pair = linkedPair();
    const preview = createClient(pair);
    const responder = createHost(pair, (payload) =>
      Promise.resolve(renderedPayload(payload.draftDigest, payload.requestId)),
    );

    await expect(preview.render(request())).resolves.toEqual(renderedPayload());
    preview.dispose();
    responder.dispose();
  });

  it('rejects a renderer response that does not match the requested draft digest', async () => {
    const pair = linkedPair();
    const preview = createClient(pair);
    const responder = createHost(pair, () => Promise.resolve(renderedPayload(foreignDigest)));

    await expect(preview.render(request())).rejects.toThrow('Preview rendering failed.');
    preview.dispose();
    responder.dispose();
  });

  it('isolates render failures behind a stable generic error', async () => {
    const pair = linkedPair();
    const preview = createClient(pair);
    const responder = createHost(pair, () =>
      Promise.reject(new Error('secret renderer detail: /etc/passwd')),
    );
    const render = preview.render(request());

    await expect(render).rejects.toThrow('Preview rendering failed.');
    const failure = postedByType(pair.clientWindow, 'studio.preview/error').at(0);
    expect((failure as PreviewErrorMessage).payload).toEqual({
      code: 'studio.preview/render-failed',
      correlationId: 'renders/1',
      message: {
        defaultMessage: 'Preview rendering failed.',
        key: 'studio.preview/render-failed',
      },
      retryable: true,
    });
    expect(JSON.stringify(pair.clientWindow.posted)).not.toContain('secret renderer detail');
    preview.dispose();
    responder.dispose();
  });

  it('drops a superseded render result and answers only the latest request', async () => {
    const pair = linkedPair();
    const preview = createClient(pair);
    const resolvers = new Map<string, (rendered: PreviewRenderedPayload) => void>();
    const responder = createHost(
      pair,
      (payload) =>
        new Promise<PreviewRenderedPayload>((resolve) => {
          resolvers.set(payload.draftDigest, resolve);
        }),
    );
    const older = preview.render(request(digest, 'renders/1'));
    const newer = preview.render(request(newerDigest, 'renders/2'));

    resolvers.get(digest)?.(renderedPayload(digest, 'renders/1'));
    resolvers.get(newerDigest)?.(renderedPayload(newerDigest, 'renders/2'));

    await expect(older).rejects.toThrow(/superseded/u);
    await expect(newer).resolves.toEqual(renderedPayload(newerDigest, 'renders/2'));
    expect(postedByType(pair.clientWindow, 'studio.preview/rendered')).toHaveLength(1);
    preview.dispose();
    responder.dispose();
  });

  it('aborts and drops a stale same-digest callback across viewport retries', async () => {
    const pair = linkedPair();
    const preview = createClient(pair);
    const resolvers = new Map<string, (rendered: PreviewRenderedPayload) => void>();
    const signals = new Map<string, AbortSignal>();
    const responder = createHost(
      pair,
      (payload, signal) =>
        new Promise<PreviewRenderedPayload>((resolve) => {
          signals.set(payload.requestId, signal);
          resolvers.set(payload.requestId, resolve);
        }),
    );

    const compact = preview.render(request(digest, 'renders/compact-1', 'compact'));
    const expanded = preview.render(request(digest, 'renders/expanded-2', 'expanded'));
    expect(signals.get('renders/compact-1')?.aborted).toBe(true);

    resolvers.get('renders/compact-1')?.(renderedPayload(digest, 'renders/compact-1'));
    resolvers.get('renders/expanded-2')?.(renderedPayload(digest, 'renders/expanded-2'));

    await expect(compact).rejects.toThrow(/superseded/u);
    await expect(expanded).resolves.toEqual(renderedPayload(digest, 'renders/expanded-2'));
    expect(postedByType(pair.clientWindow, 'studio.preview/rendered')).toHaveLength(1);
    preview.dispose();
    responder.dispose();
  });

  it('dispose invalidates an in-flight render and prevents late inventory reactivation', async () => {
    const pair = linkedPair();
    const preview = createClient(pair);
    let resolveRender: ((rendered: PreviewRenderedPayload) => void) | undefined;
    let renderSignal: AbortSignal | undefined;
    const responder = createHost(
      pair,
      (_payload, signal) =>
        new Promise<PreviewRenderedPayload>((resolve) => {
          renderSignal = signal;
          resolveRender = resolve;
        }),
    );
    const render = preview.render(request());

    preview.disposeDraft({ draftDigest: digest, reason: 'studio.preview/superseded' });
    await expect(render).rejects.toMatchObject({ code: 'studio.preview/render-disposed' });
    expect(renderSignal?.aborted).toBe(true);

    resolveRender?.(renderedPayload());
    await Promise.resolve();
    expect(postedByType(pair.clientWindow, 'studio.preview/rendered')).toHaveLength(0);
    expect(() =>
      responder.announceActivation({
        interaction: 'activate',
        marker: `studio.preview/node/${digest}/0`,
      }),
    ).toThrow(/current render inventory/u);
    preview.dispose();
    responder.dispose();
  });

  it('client timeout revokes and aborts the host callback', async () => {
    const pair = linkedPair();
    const preview = createClient(pair, 10);
    let renderSignal: AbortSignal | undefined;
    const responder = createHost(pair, (_payload, signal) => {
      renderSignal = signal;
      return new Promise<PreviewRenderedPayload>(neverSettle);
    });

    await expect(preview.render(request())).rejects.toThrow(/timed out/u);
    expect(renderSignal?.aborted).toBe(true);
    expect(postedByType(pair.clientWindow, 'studio.preview/rendered')).toHaveLength(0);
    preview.dispose();
    responder.dispose();
  });

  it('ignores wrong-origin, wrong-source, wrong-channel, and replayed messages', () => {
    const pair = linkedPair();
    let calls = 0;
    const responder = createHost(pair, () => {
      calls += 1;
      return Promise.resolve(renderedPayload());
    });

    pair.hostWindow.emit({
      data: renderRequest(digest, 0),
      origin: 'https://evil.test',
      source: pair.clientWindow,
    });
    pair.hostWindow.emit({
      data: renderRequest(digest, 0),
      origin: 'https://studio.test',
      source: {},
    });
    pair.hostWindow.emit({
      data: { ...renderRequest(digest, 0), channelId: 'other-channel' },
      origin: 'https://studio.test',
      source: pair.clientWindow,
    });
    pair.hostWindow.emit({
      data: renderRequest(digest, 0),
      origin: 'https://studio.test',
      source: pair.clientWindow,
    });
    pair.hostWindow.emit({
      data: renderRequest(newerDigest, 0),
      origin: 'https://studio.test',
      source: pair.clientWindow,
    });

    expect(calls).toBe(1);
    responder.dispose();
  });

  it('forwards select messages to registered listeners until unsubscribed', () => {
    const pair = linkedPair();
    const preview = createClient(pair);
    const responder = createHost(pair, () => Promise.resolve(renderedPayload()));
    const selections: PreviewSelectPayload[] = [];
    const unsubscribe = responder.onSelect((payload) => {
      selections.push(payload);
    });

    preview.select({ nodeId: 'node-1', reveal: true });
    expect(selections).toEqual([{ nodeId: 'node-1', reveal: true }]);

    unsubscribe();
    preview.select({ nodeId: 'node-2' });
    expect(selections).toHaveLength(1);
    preview.dispose();
    responder.dispose();
  });

  it('silently drops an in-flight render result after the host is disposed', async () => {
    const pair = linkedPair();
    const preview = createClient(pair, 10);
    const resolvers = new Map<string, (rendered: PreviewRenderedPayload) => void>();
    const responder = createHost(
      pair,
      (payload) =>
        new Promise<PreviewRenderedPayload>((resolve) => {
          resolvers.set(payload.draftDigest, resolve);
        }),
    );
    const render = preview.render(request());

    responder.dispose();
    resolvers.get(digest)?.(renderedPayload());

    await expect(render).rejects.toThrow(/timed out/u);
    expect(postedByType(pair.clientWindow, 'studio.preview/rendered')).toHaveLength(0);
    preview.dispose();
  });

  it('rejects an in-flight render on client dispose and ignores the late host result', async () => {
    const pair = linkedPair();
    const preview = createClient(pair);
    const resolvers = new Map<string, (rendered: PreviewRenderedPayload) => void>();
    const responder = createHost(
      pair,
      (payload) =>
        new Promise<PreviewRenderedPayload>((resolve) => {
          resolvers.set(payload.draftDigest, resolve);
        }),
    );
    const render = preview.render(request());

    preview.dispose();
    await expect(render).rejects.toThrow(/disposed/u);

    resolvers.get(digest)?.(renderedPayload());
    await Promise.resolve();
    expect(postedByType(pair.clientWindow, 'studio.preview/rendered')).toHaveLength(1);
    responder.dispose();
  });
});

describe('reload and teardown', () => {
  it('voids in-flight renders on reload and re-announces readiness', async () => {
    const pair = linkedPair();
    const client = createClient(pair);
    const responder = createHost(pair, () => new Promise<PreviewRenderedPayload>(neverSettle));
    responder.announce();
    await client.ready();

    const pendingRender = client.render(request());
    responder.reload('studio.preview/renderer-restarted');

    await expect(pendingRender).rejects.toThrow('Preview renderer reloaded before responding.');
    expect(postedByType(pair.clientWindow, 'studio.preview/reload')).toHaveLength(1);
    await expect(client.ready()).resolves.toMatchObject({
      renderer: 'kumwe/fixture-renderer',
    });

    client.dispose();
    responder.dispose();
  });

  it('tears down the whole channel from the host side', async () => {
    const pair = linkedPair();
    const client = createClient(pair);
    const responder = createHost(pair, () => new Promise<PreviewRenderedPayload>(neverSettle));
    responder.announce();
    await client.ready();

    const pendingRender = client.render(request());
    responder.teardown('studio.preview/session-ended');

    await expect(pendingRender).rejects.toThrow('Preview channel was torn down.');
    await expect(client.render(request(newerDigest, 'renders/2'))).rejects.toThrow(
      'Preview client was disposed.',
    );
    expect(() => responder.announce()).toThrow('Preview host was disposed.');
  });

  it('tears down the whole channel from the client side', () => {
    const pair = linkedPair();
    const rendered: unknown[] = [];
    const responder = createHost(pair, (payload) => {
      rendered.push(payload);
      return Promise.resolve(renderedPayload(payload.draftDigest, payload.requestId));
    });
    responder.announce();
    const client = createClient(pair);

    client.teardown('studio.preview/session-ended');

    expect(postedByType(pair.hostWindow, 'studio.preview/teardown')).toHaveLength(1);
    // The disposed host ignores later requests entirely.
    pair.hostWindow.emit({
      data: renderRequest(digest, 5),
      origin: 'https://studio.test',
      source: pair.clientWindow,
    });
    expect(rendered).toHaveLength(0);
    expect(() => responder.announce()).toThrow('Preview host was disposed.');
  });
});
