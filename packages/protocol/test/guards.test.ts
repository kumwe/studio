import { describe, expect, it } from 'vitest';
import {
  HostPortFailure,
  isHostPortFailure,
  isHostPortError,
  isPreviewMarker,
  isPreviewMessage,
  STUDIO_CONTRACT_VERSION,
  STUDIO_WIRE_PROTOCOL_VERSION,
  type HostPortError,
} from '../src/index.js';

const previewDigest = 'a'.repeat(64);
const previewMarker = (ordinal: number, digest = previewDigest): string =>
  `studio.preview/node/${digest}/${ordinal}`;

function readyMessage(): Record<string, unknown> {
  return {
    channelId: 'preview-channel-1',
    contractVersion: STUDIO_CONTRACT_VERSION,
    kind: 'preview-message',
    payload: {
      protocolVersion: STUDIO_WIRE_PROTOCOL_VERSION,
      renderer: 'studio.test/renderer',
      viewports: ['expanded'],
    },
    sequence: 0,
    sessionGeneration: 'session-r1',
    type: 'studio.preview/ready',
  };
}

describe('isPreviewMessage', () => {
  it('accepts a bounded canonical payload', () => {
    expect(isPreviewMessage(readyMessage())).toBe(true);
  });

  it('keeps the draft.2 message vocabulary closed', () => {
    expect(
      isPreviewMessage({
        ...readyMessage(),
        payload: {},
        type: 'org.example.preview/custom',
      }),
    ).toBe(false);
  });

  it('rejects arrays that exceed the canonical payload bounds', () => {
    const message = readyMessage();
    message.payload = {
      protocolVersion: STUDIO_WIRE_PROTOCOL_VERSION,
      renderer: 'studio.test/renderer',
      viewports: Array.from({ length: 21 }, (_, index) => `viewport-${index}`),
    };

    expect(isPreviewMessage(message)).toBe(false);
  });

  it('rejects oversized identifiers and diagnostic collections', () => {
    const oversizedId = `a${'b'.repeat(240)}`;
    const rendered = {
      channelId: oversizedId,
      contractVersion: STUDIO_CONTRACT_VERSION,
      kind: 'preview-message',
      payload: {
        diagnostics: Array.from({ length: 10_001 }, () => ({
          code: 'studio.test/problem',
          message: { key: 'studio.test/problem' },
          severity: 'error',
        })),
        draftDigest: previewDigest,
        markerMap: {},
        markers: [],
        requestId: 'renders/1',
      },
      sequence: 0,
      sessionGeneration: 'session-r1',
      type: 'studio.preview/rendered',
    };

    expect(isPreviewMessage(rendered)).toBe(false);
    rendered.channelId = 'preview-channel-1';
    expect(isPreviewMessage(rendered)).toBe(false);
  });

  it.each(['__proto__', 'prototype', 'constructor'])(
    'rejects forbidden stable identifier %s',
    (identifier) => {
      const message = readyMessage();
      message.channelId = identifier;

      expect(isPreviewMessage(message)).toBe(false);
    },
  );

  it('rejects forbidden diagnostic parameter names', () => {
    const rendered = {
      channelId: 'preview-channel-1',
      contractVersion: STUDIO_CONTRACT_VERSION,
      kind: 'preview-message',
      payload: {
        diagnostics: [
          {
            code: 'studio.test/problem',
            message: { key: 'studio.test/problem' },
            parameters: JSON.parse('{"constructor":"secret"}') as unknown,
            severity: 'error',
          },
        ],
        draftDigest: previewDigest,
        markerMap: {},
        markers: [],
        requestId: 'renders/1',
      },
      sequence: 0,
      sessionGeneration: 'session-r1',
      type: 'studio.preview/rendered',
    };

    expect(isPreviewMessage(rendered)).toBe(false);
  });

  it('rejects forbidden local names in preview payload arrays', () => {
    const message = readyMessage();
    message.payload = {
      protocolVersion: STUDIO_WIRE_PROTOCOL_VERSION,
      renderer: 'studio.test/renderer',
      viewports: ['constructor'],
    };

    expect(isPreviewMessage(message)).toBe(false);
  });

  it('rejects sparse or augmented arrays that cannot be JSON payload arrays', () => {
    const sparse = new Array<unknown>(1);
    const sparseMessage = readyMessage();
    sparseMessage.payload = {
      protocolVersion: STUDIO_WIRE_PROTOCOL_VERSION,
      renderer: 'studio.test/renderer',
      viewports: sparse,
    };

    const augmented = ['expanded'] as string[] & { metadata?: string };
    augmented.metadata = 'not-json-array-data';
    const augmentedMessage = readyMessage();
    augmentedMessage.payload = {
      protocolVersion: STUDIO_WIRE_PROTOCOL_VERSION,
      renderer: 'studio.test/renderer',
      viewports: augmented,
    };

    expect(isPreviewMessage(sparseMessage)).toBe(false);
    expect(isPreviewMessage(augmentedMessage)).toBe(false);
  });
});

describe('isHostPortError', () => {
  function hostError(): Record<string, unknown> {
    return {
      category: 'conflict',
      contractVersion: STUDIO_CONTRACT_VERSION,
      correlationId: 'requests/2f6c1f6d',
      kind: 'host-error',
      message: { defaultMessage: 'Another revision was accepted.', key: 'studio.host/conflict' },
      retryable: false,
      revision: 'blueprint-r9',
    };
  }

  it('accepts a canonical host error', () => {
    expect(isHostPortError(hostError())).toBe(true);
  });

  it('rejects unknown categories, members, and unsafe shapes', () => {
    expect(isHostPortError({ ...hostError(), category: 'exploded' })).toBe(false);
    expect(isHostPortError({ ...hostError(), stack: 'at main.ts:1' })).toBe(false);
    expect(isHostPortError({ ...hostError(), retryable: 'yes' })).toBe(false);
    expect(isHostPortError({ ...hostError(), retryAfterMilliseconds: -1 })).toBe(false);
    expect(isHostPortError({ ...hostError(), message: { key: 'not-qualified' } })).toBe(false);
    const { message, ...withoutMessage } = hostError();
    void message;
    expect(isHostPortError(withoutMessage)).toBe(false);
  });
});

describe('HostPortFailure', () => {
  const error: HostPortError = {
    category: 'conflict',
    contractVersion: STUDIO_CONTRACT_VERSION,
    correlationId: 'requests/host-failure',
    kind: 'host-error',
    message: { defaultMessage: 'Another revision was accepted.', key: 'studio.host/conflict' },
    retryable: false,
    revision: 'blueprint-r9',
  };

  it('wraps only the canonical serializable host error', () => {
    const failure = new HostPortFailure(error);

    expect(failure).toBeInstanceOf(Error);
    expect(failure.name).toBe('HostPortFailure');
    expect(failure.message).toBe('Another revision was accepted.');
    expect(failure.error).toBe(error);
    expect(isHostPortFailure(failure)).toBe(true);
  });

  it('rejects malformed errors and does not accept raw error documents', () => {
    expect(
      () => new HostPortFailure({ ...error, category: 'exploded' } as unknown as HostPortError),
    ).toThrow(TypeError);
    expect(isHostPortFailure(error)).toBe(false);
    expect(isHostPortFailure(new Error('transport detail'))).toBe(false);
    expect(isHostPortFailure({ error })).toBe(false);
  });
});

describe('reload and teardown messages', () => {
  function reloadMessage(): Record<string, unknown> {
    return {
      channelId: 'preview-channel-1',
      contractVersion: STUDIO_CONTRACT_VERSION,
      kind: 'preview-message',
      payload: { reason: 'studio.preview/renderer-restarted' },
      sequence: 3,
      sessionGeneration: 'session-r1',
      type: 'studio.preview/reload',
    };
  }

  it('accepts canonical reload and teardown payloads', () => {
    expect(isPreviewMessage(reloadMessage())).toBe(true);
    expect(isPreviewMessage({ ...reloadMessage(), type: 'studio.preview/teardown' })).toBe(true);
  });

  it('rejects unqualified reasons and extra members', () => {
    const unqualified = reloadMessage();
    unqualified.payload = { reason: 'because' };
    const extra = reloadMessage();
    extra.payload = { detail: 'stack trace', reason: 'studio.preview/renderer-restarted' };
    expect(isPreviewMessage(unqualified)).toBe(false);
    expect(isPreviewMessage(extra)).toBe(false);
  });
});

describe('rendered marker maps', () => {
  function renderedMessage(): Record<string, unknown> {
    const marker0 = previewMarker(0);
    const marker1 = previewMarker(1);
    return {
      channelId: 'preview-channel-1',
      contractVersion: STUDIO_CONTRACT_VERSION,
      kind: 'preview-message',
      payload: {
        diagnostics: [],
        draftDigest: previewDigest,
        markerMap: { [marker0]: 'node-1', [marker1]: 'node-2' },
        markers: [marker0, marker1],
        requestId: 'renders/1',
      },
      sequence: 4,
      sessionGeneration: 'session-r1',
      type: 'studio.preview/rendered',
    };
  }

  it('accepts an exact marker-to-node map and requires it for an empty inventory', () => {
    expect(isPreviewMessage(renderedMessage())).toBe(true);
    const withoutMap = renderedMessage();
    withoutMap.payload = {
      diagnostics: [],
      draftDigest: previewDigest,
      markers: [],
    };
    const empty = renderedMessage();
    empty.payload = {
      diagnostics: [],
      draftDigest: previewDigest,
      markerMap: {},
      markers: [],
      requestId: 'renders/1',
    };
    expect(isPreviewMessage(withoutMap)).toBe(false);
    expect(isPreviewMessage(empty)).toBe(true);
  });

  it('rejects unsafe marker map member names and values', () => {
    const polluted = renderedMessage();
    polluted.payload = {
      diagnostics: [],
      draftDigest: previewDigest,
      markerMap: JSON.parse('{"__proto__": "node-1"}') as Record<string, string>,
      markers: [previewMarker(0)],
    };
    const badValue = renderedMessage();
    badValue.payload = {
      diagnostics: [],
      draftDigest: previewDigest,
      markerMap: { [previewMarker(0)]: '' },
      markers: [previewMarker(0)],
    };
    expect(isPreviewMessage(polluted)).toBe(false);
    expect(isPreviewMessage(badValue)).toBe(false);
  });

  it('rejects missing, extra, reordered, cross-draft, and many-to-one marker mappings', () => {
    const marker0 = previewMarker(0);
    const marker1 = previewMarker(1);
    const base = {
      diagnostics: [],
      draftDigest: previewDigest,
      markerMap: { [marker0]: 'node-1', [marker1]: 'node-2' },
      markers: [marker0, marker1],
    };
    const message = renderedMessage();

    expect(
      isPreviewMessage({ ...message, payload: { ...base, markerMap: { [marker0]: 'node-1' } } }),
    ).toBe(false);
    expect(
      isPreviewMessage({
        ...message,
        payload: { ...base, markerMap: { ...base.markerMap, [previewMarker(2)]: 'node-3' } },
      }),
    ).toBe(false);
    expect(
      isPreviewMessage({ ...message, payload: { ...base, markers: [marker1, marker0] } }),
    ).toBe(false);
    expect(
      isPreviewMessage({
        ...message,
        payload: {
          ...base,
          markerMap: { [previewMarker(0, 'b'.repeat(64))]: 'node-1' },
          markers: [previewMarker(0, 'b'.repeat(64))],
        },
      }),
    ).toBe(false);
    expect(
      isPreviewMessage({
        ...message,
        payload: { ...base, markerMap: { [marker0]: 'node-1', [marker1]: 'node-1' } },
      }),
    ).toBe(false);
  });
});

describe('preview marker grammar and measurements', () => {
  const message = (type: string, payload: Record<string, unknown>): Record<string, unknown> => ({
    channelId: 'preview-channel-1',
    contractVersion: STUDIO_CONTRACT_VERSION,
    kind: 'preview-message',
    payload,
    sequence: 5,
    sessionGeneration: 'session-r1',
    type,
  });

  it('accepts only canonical lowercase digest and zero-based ordinal forms', () => {
    expect(isPreviewMarker(previewMarker(0))).toBe(true);
    expect(isPreviewMarker(previewMarker(99_999), previewDigest)).toBe(true);
    expect(isPreviewMarker(previewMarker(0), 'b'.repeat(64))).toBe(false);
    expect(isPreviewMarker(`studio.preview/node/${previewDigest}/00`)).toBe(false);
    expect(isPreviewMarker(`studio.preview/node/${previewDigest.toUpperCase()}/0`)).toBe(false);
    expect(isPreviewMarker(`studio.preview/node/${previewDigest}/100000`)).toBe(false);
  });

  it('rejects duplicate measurement requests and overlapping response inventories', () => {
    const marker = previewMarker(0);
    expect(
      isPreviewMessage(
        message('studio.preview/measure', { markers: [marker, marker], requestId: 'measure-1' }),
      ),
    ).toBe(false);

    expect(
      isPreviewMessage(
        message('studio.preview/measurements', {
          draftDigest: previewDigest,
          measurements: {
            [marker]: [{ height: 10, width: 10, x: 0, y: 0 }],
          },
          requestId: 'measure-1',
          unknown: [marker],
          viewport: { devicePixelRatio: 1, height: 600, scrollX: 0, scrollY: 0, width: 800 },
        }),
      ),
    ).toBe(false);
  });
});
