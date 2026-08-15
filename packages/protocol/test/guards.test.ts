import { describe, expect, it } from 'vitest';
import {
  isPreviewMessage,
  STUDIO_CONTRACT_VERSION,
  STUDIO_WIRE_PROTOCOL_VERSION,
} from '../src/index.js';

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
        draftDigest: 'a'.repeat(64),
        markers: [],
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
        draftDigest: 'a'.repeat(64),
        markers: [],
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
