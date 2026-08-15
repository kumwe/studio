import { describe, expect, it } from 'vitest';
import {
  STUDIO_CONTRACT_VERSION,
  STUDIO_WIRE_PROTOCOL_VERSION,
  type PreviewErrorMessage,
  type PreviewReadyMessage,
  type PreviewRenderedMessage,
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

function response(draftDigest = digest, sequence = 1): PreviewRenderedMessage {
  return {
    channelId: 'preview-channel-1',
    contractVersion: STUDIO_CONTRACT_VERSION,
    kind: 'preview-message',
    payload: { diagnostics: [], draftDigest, markers: ['node-1'] },
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
    const result = preview.render({
      artifactId: 'blueprint-1',
      draftDigest: digest,
      viewport: 'expanded',
    });
    endpoint.emit({ data: response(), origin: 'https://example.test', source: endpoint });

    await expect(result).resolves.toEqual(response().payload);
    preview.dispose();
  });

  it('ignores a same-origin response from another source', async () => {
    const endpoint = new Endpoint();
    const preview = client(endpoint, 10);
    const result = preview.render({
      artifactId: 'blueprint-1',
      draftDigest: digest,
      viewport: 'expanded',
    });
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
    const render = preview.render({
      artifactId: 'blueprint-1',
      draftDigest: digest,
      viewport: 'expanded',
    });
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

    endpoint.emit({ data: response(digest, 1), origin: 'https://example.test', source: endpoint });
    endpoint.emit({
      data: response(newerDigest, 2),
      origin: 'https://example.test',
      source: endpoint,
    });

    await expect(older).rejects.toThrow(/superseded/u);
    await expect(newer).resolves.toEqual(response(newerDigest, 2).payload);
    expect(accepted).toBe(1);
    preview.dispose();
  });

  it('applies a correlated error only to the matching render', async () => {
    const endpoint = new Endpoint();
    const preview = client(endpoint, 10);
    const render = preview.render({
      artifactId: 'blueprint-1',
      draftDigest: digest,
      viewport: 'expanded',
    });

    endpoint.emit({
      data: errorResponse('unrelated-render', 1),
      origin: 'https://example.test',
      source: endpoint,
    });
    endpoint.emit({
      data: errorResponse(digest, 2),
      origin: 'https://example.test',
      source: endpoint,
    });

    await expect(render).rejects.toThrow('Render failed.');
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
