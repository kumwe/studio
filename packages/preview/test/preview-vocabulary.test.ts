import { describe, expect, it } from 'vitest';
import {
  isPreviewMessage,
  STUDIO_CONTRACT_VERSION,
  type PreviewActivatedPayload,
  type PreviewDisposePayload,
  type PreviewRenderPayload,
  type PreviewRenderedPayload,
  type PreviewViewportPayload,
} from '@kumwe/studio-protocol';
import {
  PreviewClient,
  PreviewHost,
  type PreviewMessageEvent,
  type PreviewMessageListener,
} from '../src/index.js';

/**
 * The Gate A preview vocabulary: a renderer reporting a trusted marker
 * interaction, the client driving the surface to a viewport, and resource
 * revocation for a superseded draft that does not end the channel.
 */

const digest = 'a'.repeat(64);
const marker = `studio.preview/node/${digest}/0`;

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

function pair(): { client: PreviewClient; clientWindow: FakeWindow; host: PreviewHost } {
  const clientWindow = new FakeWindow();
  const hostWindow = new FakeWindow();
  clientWindow.inboundOrigin = 'https://preview.test';
  clientWindow.inboundSource = hostWindow;
  hostWindow.inboundOrigin = 'https://studio.test';
  hostWindow.inboundSource = clientWindow;
  const client = new PreviewClient({
    channelId: 'preview-channel-1',
    sessionGeneration: 'session-r1',
    source: clientWindow,
    target: hostWindow,
    targetOrigin: 'https://preview.test',
    timeoutMilliseconds: 10_000,
  });
  const host = new PreviewHost({
    channelId: 'preview-channel-1',
    render: (payload: PreviewRenderPayload): Promise<PreviewRenderedPayload> =>
      Promise.resolve({
        diagnostics: [],
        draftDigest: payload.draftDigest,
        markerMap: { [`studio.preview/node/${payload.draftDigest}/0`]: 'node-1' },
        markers: [`studio.preview/node/${payload.draftDigest}/0`],
        requestId: payload.requestId,
      }),
    renderer: 'kumwe/fixture-renderer',
    sessionGeneration: 'session-r1',
    source: hostWindow,
    target: clientWindow,
    targetOrigin: 'https://studio.test',
    viewports: ['compact', 'expanded'],
  });
  return { client, clientWindow, host };
}

function renderRequest(requestId = 'renders/1'): PreviewRenderPayload {
  return {
    artifactId: 'blueprint-1',
    draftDigest: digest,
    draftRevision: 'blueprint-r1',
    requestId,
    viewport: 'expanded',
  };
}

describe('preview activation', () => {
  it('delivers a current trusted marker interaction to the client', async () => {
    const { client, host } = pair();
    const seen: PreviewActivatedPayload[] = [];
    client.onActivated((payload) => seen.push(payload));
    await client.render(renderRequest());
    host.announceActivation({ interaction: 'activate', marker });
    expect(seen).toEqual([{ interaction: 'activate', marker }]);
  });

  it('refuses an invented marker at the host and independently drops it at the client', async () => {
    const { client, clientWindow, host } = pair();
    const seen: PreviewActivatedPayload[] = [];
    const inventedMarker = `studio.preview/node/${digest}/1`;
    client.onActivated((payload) => seen.push(payload));
    await client.render(renderRequest());

    expect(() =>
      host.announceActivation({ interaction: 'activate', marker: inventedMarker }),
    ).toThrow(RangeError);
    clientWindow.emit({
      data: {
        channelId: 'preview-channel-1',
        contractVersion: STUDIO_CONTRACT_VERSION,
        kind: 'preview-message',
        payload: { interaction: 'activate', marker: inventedMarker },
        sequence: 1,
        sessionGeneration: 'session-r1',
        type: 'studio.preview/activated',
      },
      origin: clientWindow.inboundOrigin,
      source: clientWindow.inboundSource,
    });

    expect(seen).toEqual([]);
  });

  it('is a canonical message the guard accepts, and rejects an invented interaction', () => {
    const envelope = {
      channelId: 'preview-channel-1',
      contractVersion: STUDIO_CONTRACT_VERSION,
      kind: 'preview-message',
      payload: { interaction: 'activate', marker },
      sequence: 1,
      sessionGeneration: 'session-r1',
      type: 'studio.preview/activated',
    };
    expect(isPreviewMessage(envelope)).toBe(true);
    expect(isPreviewMessage({ ...envelope, payload: { interaction: 'hover', marker } })).toBe(
      false,
    );
  });
});

describe('preview viewport', () => {
  it('drives the surface by semantic role or by bounded dimensions', () => {
    const { client, host } = pair();
    const seen: PreviewViewportPayload[] = [];
    host.onViewport((payload) => seen.push(payload));
    client.setViewport({ viewport: 'compact' });
    client.setViewport({ height: 800, width: 1280 });
    expect(seen).toEqual([{ viewport: 'compact' }, { height: 800, width: 1280 }]);
  });

  it('refuses a role and dimensions together, and refuses an empty instruction', () => {
    const { client } = pair();
    expect(() => client.setViewport({ viewport: 'compact', width: 1280 })).toThrow(RangeError);
    expect(() => client.setViewport({})).toThrow(RangeError);
  });

  it('rejects an out-of-bounds dimension at the guard', () => {
    const envelope = {
      channelId: 'preview-channel-1',
      contractVersion: STUDIO_CONTRACT_VERSION,
      kind: 'preview-message',
      payload: { width: 12 },
      sequence: 1,
      sessionGeneration: 'session-r1',
      type: 'studio.preview/viewport',
    };
    expect(isPreviewMessage(envelope)).toBe(false);
    expect(isPreviewMessage({ ...envelope, payload: { width: 1280 } })).toBe(true);
    expect(isPreviewMessage({ ...envelope, payload: { height: 239 } })).toBe(false);
    expect(isPreviewMessage({ ...envelope, payload: { height: 240 } })).toBe(true);
    expect(isPreviewMessage({ ...envelope, payload: { width: 10_001 } })).toBe(false);
    expect(isPreviewMessage({ ...envelope, payload: { viewport: 'constructor' } })).toBe(false);
    expect(isPreviewMessage({ ...envelope, payload: { viewport: 'Expanded' } })).toBe(false);
    expect(isPreviewMessage({ ...envelope, payload: { viewport: undefined, width: 1280 } })).toBe(
      false,
    );
    expect(isPreviewMessage({ ...envelope, payload: { width: undefined } })).toBe(false);
  });
});

describe('preview dispose', () => {
  it('revokes a superseded draft inventory without ending the channel', async () => {
    const { client, host } = pair();
    const seen: PreviewDisposePayload[] = [];
    host.onDispose((payload) => seen.push(payload));
    await client.render(renderRequest());
    client.disposeDraft({ draftDigest: digest, reason: 'studio.preview/superseded' });
    expect(seen).toEqual([{ draftDigest: digest, reason: 'studio.preview/superseded' }]);

    expect(() => host.announceActivation({ interaction: 'focus', marker })).toThrow(RangeError);

    // The channel is still live, so a fresh render creates a fresh inventory.
    await client.render(renderRequest('renders/2'));
    const activated: PreviewActivatedPayload[] = [];
    client.onActivated((payload) => activated.push(payload));
    host.announceActivation({ interaction: 'focus', marker });
    expect(activated).toHaveLength(1);
  });

  it('accepts a whole-channel revocation and refuses a malformed digest', () => {
    const envelope = {
      channelId: 'preview-channel-1',
      contractVersion: STUDIO_CONTRACT_VERSION,
      kind: 'preview-message',
      payload: { reason: 'studio.preview/session-ended' },
      sequence: 1,
      sessionGeneration: 'session-r1',
      type: 'studio.preview/dispose',
    };
    expect(isPreviewMessage(envelope)).toBe(true);
    expect(
      isPreviewMessage({
        ...envelope,
        payload: { draftDigest: 'not-a-digest', reason: 'studio.preview/session-ended' },
      }),
    ).toBe(false);
  });
});
