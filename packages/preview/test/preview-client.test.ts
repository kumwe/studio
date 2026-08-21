import { describe, expect, it } from 'vitest';
import {
  STUDIO_CONTRACT_VERSION,
  STUDIO_WIRE_PROTOCOL_VERSION,
  type PreviewErrorMessage,
  type PreviewReadyMessage,
  type PreviewRenderedMessage,
  type PreviewRenderPayload,
} from '@kumwe/studio-protocol';
import {
  PreviewClient,
  type PreviewMessageEvent,
  type PreviewMessageListener,
} from '../src/index.js';

const digest = 'a'.repeat(64);
const newerDigest = 'b'.repeat(64);

class Endpoint {
  public listener: PreviewMessageListener | undefined;
  public posted?: unknown;

  public addEventListener(_type: 'message', listener: PreviewMessageListener): void {
    this.listener = listener;
  }

  public emit(event: PreviewMessageEvent): void {
    this.listener?.(event);
  }

  public postMessage(message: unknown): void {
    this.posted = message;
  }

  public removeEventListener(_type: 'message', listener: PreviewMessageListener): void {
    if (this.listener === listener) {
      this.listener = undefined;
    }
  }
}

function request(
  draftDigest = digest,
  requestId = 'renders/1',
  viewport = 'expanded',
): PreviewRenderPayload {
  return {
    artifactId: 'blueprint-1',
    draftDigest,
    draftRevision: 'blueprint-r1',
    requestId,
    viewport,
  };
}

function response(
  draftDigest = digest,
  sequence = 1,
  requestId = 'renders/1',
): PreviewRenderedMessage {
  const marker = `studio.preview/node/${draftDigest}/0`;
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

function errorResponse(correlationId?: string, sequence = 1): PreviewErrorMessage {
  return {
    channelId: 'preview-channel-1',
    contractVersion: STUDIO_CONTRACT_VERSION,
    kind: 'preview-message',
    payload: {
      code: 'preview/render-failed',
      ...(correlationId === undefined ? {} : { correlationId }),
      message: { defaultMessage: 'Render failed.', key: 'preview/render-failed' },
      retryable: false,
    },
    sequence,
    sessionGeneration: 'session-r1',
    type: 'studio.preview/error',
  };
}

function readyMessage(sequence = 1): PreviewReadyMessage {
  return {
    channelId: 'preview-channel-1',
    contractVersion: STUDIO_CONTRACT_VERSION,
    kind: 'preview-message',
    payload: {
      protocolVersion: STUDIO_WIRE_PROTOCOL_VERSION,
      renderer: 'kumwe/fixture-renderer',
      viewports: ['compact', 'expanded'],
    },
    sequence,
    sessionGeneration: 'session-r1',
    type: 'studio.preview/ready',
  };
}

function client(endpoint: Endpoint, timeoutMilliseconds = 10_000): PreviewClient {
  return new PreviewClient({
    channelId: 'preview-channel-1',
    sessionGeneration: 'session-r1',
    source: endpoint,
    target: endpoint,
    targetOrigin: 'https://example.test',
    timeoutMilliseconds,
  });
}

describe('PreviewClient', () => {
  it('rejects wildcard target origins', () => {
    const endpoint = new Endpoint();
    expect(
      () =>
        new PreviewClient({
          channelId: 'channel-1',
          sessionGeneration: 'session-r1',
          source: endpoint,
          target: endpoint,
          targetOrigin: '*',
        }),
    ).toThrow(/wildcard/u);
  });

  it('matches a canonical rendered message from the configured source and origin', async () => {
    const endpoint = new Endpoint();
    const preview = client(endpoint);
    const result = preview.render(request());
    endpoint.emit({ data: response(), origin: 'https://example.test', source: endpoint });

    await expect(result).resolves.toEqual(response().payload);
    preview.dispose();
  });

  it('ignores a same-origin response from another source', async () => {
    const endpoint = new Endpoint();
    const preview = client(endpoint, 10);
    const result = preview.render(request());
    endpoint.emit({ data: response(), origin: 'https://example.test', source: {} });

    await expect(result).rejects.toThrow(/timed out/u);
    preview.dispose();
  });

  it('rejects replayed sequences and malformed error payloads without dereferencing them', async () => {
    const endpoint = new Endpoint();
    const preview = client(endpoint, 10);
    let accepted = 0;
    preview.onMessage(() => {
      accepted += 1;
    });
    const render = preview.render(request());
    endpoint.emit({ data: response(), origin: 'https://example.test', source: endpoint });
    endpoint.emit({ data: response(), origin: 'https://example.test', source: endpoint });
    endpoint.emit({
      data: {
        channelId: 'preview-channel-1',
        contractVersion: STUDIO_CONTRACT_VERSION,
        kind: 'preview-message',
        payload: { message: null },
        sequence: 2,
        sessionGeneration: 'session-r1',
        type: 'studio.preview/error',
      },
      origin: 'https://example.test',
      source: endpoint,
    });

    await expect(render).resolves.toEqual(response().payload);
    expect(accepted).toBe(1);
    preview.dispose();
  });

  it('supersedes an older render and discards its stale response', async () => {
    const endpoint = new Endpoint();
    const preview = client(endpoint);
    let accepted = 0;
    preview.onMessage(() => {
      accepted += 1;
    });
    const older = preview.render(request(digest, 'renders/1'));
    const newer = preview.render(request(newerDigest, 'renders/2'));

    endpoint.emit({
      data: response(digest, 1, 'renders/1'),
      origin: 'https://example.test',
      source: endpoint,
    });
    endpoint.emit({
      data: response(newerDigest, 2, 'renders/2'),
      origin: 'https://example.test',
      source: endpoint,
    });

    await expect(older).rejects.toThrow(/superseded/u);
    await expect(newer).resolves.toEqual(response(newerDigest, 2, 'renders/2').payload);
    expect(accepted).toBe(1);
    preview.dispose();
  });

  it('correlates same-digest viewport retries by unique render request id', async () => {
    const endpoint = new Endpoint();
    const preview = client(endpoint);
    const controller = new AbortController();
    const compact = preview.render(request(digest, 'renders/compact-1', 'compact'), {
      signal: controller.signal,
    });
    controller.abort();
    await expect(compact).rejects.toThrow(/aborted/u);

    const expanded = preview.render(request(digest, 'renders/expanded-2', 'expanded'));
    endpoint.emit({
      data: response(digest, 1, 'renders/compact-1'),
      origin: 'https://example.test',
      source: endpoint,
    });
    endpoint.emit({
      data: response(digest, 2, 'renders/expanded-2'),
      origin: 'https://example.test',
      source: endpoint,
    });

    await expect(expanded).resolves.toEqual(response(digest, 2, 'renders/expanded-2').payload);
    preview.dispose();
  });

  it('rejects malformed outbound render and viewport payloads before posting', async () => {
    const endpoint = new Endpoint();
    const preview = client(endpoint);

    await expect(preview.render({ ...request(), viewport: 'constructor' })).rejects.toMatchObject({
      code: 'studio.preview/invalid-outbound-message',
    });
    expect(() => preview.setViewport({ height: 239 })).toThrow(
      expect.objectContaining({ code: 'studio.preview/invalid-outbound-message' }),
    );
    expect(() => preview.setViewport({ viewport: 'constructor' })).toThrow(
      expect.objectContaining({ code: 'studio.preview/invalid-outbound-message' }),
    );
    expect(endpoint.posted).toBeUndefined();
    preview.dispose();
  });

  it('rejects an in-flight measurement before posting a viewport change', async () => {
    const endpoint = new Endpoint();
    const preview = client(endpoint, 10);
    const render = preview.render(request());
    endpoint.emit({
      data: response(),
      origin: 'https://example.test',
      source: endpoint,
    });
    await render;

    const marker = `studio.preview/node/${digest}/0`;
    const measure = preview.measure({ markers: [marker], requestId: 'measure-1' });
    preview.setViewport({ width: 1280 });

    await expect(measure).rejects.toMatchObject({
      code: 'studio.preview/measure-viewport-changed',
      retryable: true,
    });
    expect(endpoint.posted).toMatchObject({
      payload: { width: 1280 },
      type: 'studio.preview/viewport',
    });
    preview.dispose();
  });

  it('applies a correlated error only to the matching render', async () => {
    const endpoint = new Endpoint();
    const preview = client(endpoint, 10);
    const render = preview.render(request());

    endpoint.emit({
      data: errorResponse('unrelated-render', 1),
      origin: 'https://example.test',
      source: endpoint,
    });
    endpoint.emit({
      data: errorResponse('renders/1', 2),
      origin: 'https://example.test',
      source: endpoint,
    });

    await expect(render).rejects.toThrow('Render failed.');
    preview.dispose();
  });

  it('fails a request-id match carrying a different draft digest without timing out', async () => {
    const endpoint = new Endpoint();
    const preview = client(endpoint, 10);
    const render = preview.render(request());

    endpoint.emit({
      data: response(newerDigest, 1, 'renders/1'),
      origin: 'https://example.test',
      source: endpoint,
    });

    await expect(render).rejects.toMatchObject({
      code: 'studio.preview/render-correlation-mismatch',
    });
    preview.dispose();
  });

  it('snapshots render correlation before the caller can mutate its payload', async () => {
    const endpoint = new Endpoint();
    const preview = client(endpoint, 10);
    const mutableRequest = request();
    const render = preview.render(mutableRequest);

    mutableRequest.requestId = 'renders/mutated';
    mutableRequest.draftDigest = newerDigest;

    expect(endpoint.posted).toMatchObject({
      payload: { draftDigest: digest, requestId: 'renders/1' },
    });
    endpoint.emit({
      data: response(digest, 1, 'renders/1'),
      origin: 'https://example.test',
      source: endpoint,
    });

    await expect(render).resolves.toMatchObject({ draftDigest: digest, requestId: 'renders/1' });
    preview.dispose();
  });

  it('resolves ready() when the host announcement arrives', async () => {
    const endpoint = new Endpoint();
    const preview = client(endpoint);
    const ready = preview.ready();
    endpoint.emit({ data: readyMessage(), origin: 'https://example.test', source: endpoint });

    await expect(ready).resolves.toEqual(readyMessage().payload);
    preview.dispose();
  });

  it('resolves ready() immediately from a cached announcement', async () => {
    const endpoint = new Endpoint();
    const preview = client(endpoint, 10);
    endpoint.emit({ data: readyMessage(), origin: 'https://example.test', source: endpoint });

    await expect(preview.ready()).resolves.toEqual(readyMessage().payload);
    preview.dispose();
  });

  it('times out ready() when no announcement arrives', async () => {
    const endpoint = new Endpoint();
    const preview = client(endpoint, 10);

    await expect(preview.ready()).rejects.toThrow(/timed out/u);
    preview.dispose();
  });

  it('rejects ready() on abort and on dispose', async () => {
    const endpoint = new Endpoint();
    const preview = client(endpoint);
    const controller = new AbortController();
    const aborted = preview.ready({ signal: controller.signal });
    controller.abort();
    await expect(aborted).rejects.toThrow(/aborted/u);

    const disposed = preview.ready();
    preview.dispose();
    await expect(disposed).rejects.toThrow(/disposed/u);
    await expect(preview.ready()).rejects.toThrow(/disposed/u);
  });
});
