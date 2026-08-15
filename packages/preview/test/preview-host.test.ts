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

function renderedPayload(draftDigest = digest): PreviewRenderedPayload {
  return { diagnostics: [], draftDigest, markers: ['node-1'] };
}

function renderRequest(draftDigest = digest, sequence = 0): PreviewRenderMessage {
  return {
    channelId: 'preview-channel-1',
    contractVersion: STUDIO_CONTRACT_VERSION,
    kind: 'preview-message',
    payload: { artifactId: 'blueprint-1', draftDigest, viewport: 'expanded' },
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
      Promise.resolve(renderedPayload(payload.draftDigest)),
    );

    await expect(
      preview.render({ artifactId: 'blueprint-1', draftDigest: digest, viewport: 'expanded' }),
    ).resolves.toEqual(renderedPayload());
    preview.dispose();
    responder.dispose();
  });

  it('stamps the requested draft digest onto the rendered response', async () => {
    const pair = linkedPair();
    const preview = createClient(pair);
    const responder = createHost(pair, () => Promise.resolve(renderedPayload(foreignDigest)));

    await expect(
      preview.render({ artifactId: 'blueprint-1', draftDigest: digest, viewport: 'expanded' }),
    ).resolves.toEqual(renderedPayload(digest));
    preview.dispose();
    responder.dispose();
  });

  it('isolates render failures behind a stable generic error', async () => {
    const pair = linkedPair();
    const preview = createClient(pair);
    const responder = createHost(pair, () =>
      Promise.reject(new Error('secret renderer detail: /etc/passwd')),
    );
    const render = preview.render({
      artifactId: 'blueprint-1',
      draftDigest: digest,
      viewport: 'expanded',
    });

    await expect(render).rejects.toThrow('Preview rendering failed.');
    const failure = postedByType(pair.clientWindow, 'studio.preview/error').at(0);
    expect((failure as PreviewErrorMessage).payload).toEqual({
      code: 'studio.preview/render-failed',
      correlationId: digest,
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
    const older = preview.render({
      artifactId: 'blueprint-1',
      draftDigest: digest,
      viewport: 'expanded',
    });
    const newer = preview.render({
      artifactId: 'blueprint-1',
      draftDigest: newerDigest,
      viewport: 'expanded',
    });

    resolvers.get(digest)?.(renderedPayload(digest));
    resolvers.get(newerDigest)?.(renderedPayload(newerDigest));

    await expect(older).rejects.toThrow(/superseded/u);
    await expect(newer).resolves.toEqual(renderedPayload(newerDigest));
    expect(postedByType(pair.clientWindow, 'studio.preview/rendered')).toHaveLength(1);
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
    const render = preview.render({
      artifactId: 'blueprint-1',
      draftDigest: digest,
      viewport: 'expanded',
    });

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
    const render = preview.render({
      artifactId: 'blueprint-1',
      draftDigest: digest,
      viewport: 'expanded',
    });

    preview.dispose();
    await expect(render).rejects.toThrow(/disposed/u);

    resolvers.get(digest)?.(renderedPayload());
    await Promise.resolve();
    expect(postedByType(pair.clientWindow, 'studio.preview/rendered')).toHaveLength(1);
    responder.dispose();
  });
});
