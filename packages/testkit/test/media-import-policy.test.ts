import { describe, expect, it } from 'vitest';
import type { ExternalUrlRejectionReason } from '@kumwe/studio-core';
import {
  isHostPortError,
  type HostErrorCategory,
  type HostPortError,
  type HostRequestContext,
  type MediaHostPort,
} from '@kumwe/studio-protocol';
import {
  createHostRequestContextFixture,
  createTestbedHost,
  TestbedHostError,
  type HostRequestContextFixtureOptions,
  type TestbedHost,
} from '../src/index.js';

function contextFor(
  testbed: TestbedHost,
  overrides: HostRequestContextFixtureOptions = {},
): HostRequestContext {
  return createHostRequestContextFixture({
    sessionGeneration: testbed.controls.sessionGeneration,
    ...overrides,
  });
}

function requireMediaPort(testbed: TestbedHost): MediaHostPort {
  const { media } = testbed.host;
  if (media === undefined) {
    throw new Error('The testbed host must provide its media port.');
  }
  return media;
}

async function expectHostError(
  operation: Promise<unknown>,
  category: HostErrorCategory,
): Promise<HostPortError> {
  let caught: unknown;
  try {
    await operation;
  } catch (error) {
    caught = error;
  }
  if (!(caught instanceof TestbedHostError)) {
    throw new Error('Expected the operation to reject with a TestbedHostError.');
  }
  expect(isHostPortError(caught.error)).toBe(true);
  expect(caught.error.category).toBe(category);
  return caught.error;
}

interface SsrfCase {
  candidate: string;
  marker: string;
  reason: ExternalUrlRejectionReason;
}

const ssrfCases: SsrfCase[] = [
  {
    candidate: 'https://exa mple.com/asset.png',
    marker: 'exa mple',
    reason: 'malformed',
  },
  {
    candidate: 'file:///etc/passwd',
    marker: 'etc/passwd',
    reason: 'scheme-not-allowed',
  },
  {
    candidate: ['https://service:', 'hunter2@internal-billing.example/export'].join(''),
    marker: 'hunter2',
    reason: 'credentials-in-url',
  },
  {
    candidate: 'https://169.254.169.254/latest/meta-data/',
    marker: '169.254.169.254',
    reason: 'host-not-allowed',
  },
  {
    candidate: `https://example.com/${'a'.repeat(2_100)}`,
    marker: 'aaaaaaaaaa',
    reason: 'url-too-long',
  },
];

describe('Testbed external media import policy', () => {
  it('rejects one SSRF-shaped source per rejection reason with the canonical error', async () => {
    const testbed = createTestbedHost({ allowTestOperationId: true });
    const media = requireMediaPort(testbed);

    for (const ssrfCase of ssrfCases) {
      const error = await expectHostError(
        testbed.controls.importExternalMedia(ssrfCase.candidate, contextFor(testbed)),
        'validation-failed',
      );
      expect(error.retryable).toBe(false);
      expect(error.message.defaultMessage).toContain(ssrfCase.reason);
      expect(JSON.stringify(error)).not.toContain(ssrfCase.marker);
    }

    const listed = await media.list({ limit: 100 }, contextFor(testbed));
    expect(listed.value.assets).toHaveLength(0);
  });

  it('accepts allowed https sources and mints deterministic processing assets', async () => {
    const testbed = createTestbedHost({ allowTestOperationId: true });
    const media = requireMediaPort(testbed);

    const first = await testbed.controls.importExternalMedia(
      'https://cdn.example.com/hero-image.png',
      contextFor(testbed),
    );
    expect(first.value).toEqual({
      id: 'media/import-1',
      revision: 'media/import-1-r1',
      state: 'processing',
    });

    const second = await testbed.controls.importExternalMedia(
      'https://bücher.example/cover.png',
      contextFor(testbed),
    );
    expect(second.value.id).toBe('media/import-2');

    const fetched = await media.get('media/import-1', contextFor(testbed));
    expect(fetched.revision).toBe('media/import-1-r1');
    expect(fetched.value?.state).toBe('processing');

    const listed = await media.list({ limit: 100 }, contextFor(testbed));
    expect(listed.value.assets.map((asset) => asset.id)).toEqual([
      'media/import-1',
      'media/import-2',
    ]);
  });

  it('runs the drill under the same request guards as the wire ports', async () => {
    const testbed = createTestbedHost({ allowTestOperationId: true });
    const allowed = 'https://cdn.example.com/hero-image.png';

    testbed.controls.failNext('media', 'import-external', 'forbidden');
    await expectHostError(
      testbed.controls.importExternalMedia(allowed, contextFor(testbed)),
      'forbidden',
    );

    testbed.controls.disconnect();
    await expectHostError(
      testbed.controls.importExternalMedia(allowed, contextFor(testbed)),
      'unavailable',
    );
    testbed.controls.reconnect();

    const stale = contextFor(testbed);
    testbed.controls.setPermissions([]);
    await expectHostError(testbed.controls.importExternalMedia(allowed, stale), 'invalid-request');

    const recovered = await testbed.controls.importExternalMedia(allowed, contextFor(testbed));
    expect(recovered.value.id).toBe('media/import-1');
  });

  it('produces failures the host error guard accepts for every taxonomy reason', async () => {
    const testbed = createTestbedHost({ allowTestOperationId: true });

    for (const ssrfCase of ssrfCases) {
      let caught: unknown;
      try {
        await testbed.controls.importExternalMedia(ssrfCase.candidate, contextFor(testbed));
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(TestbedHostError);
      if (caught instanceof TestbedHostError) {
        expect(isHostPortError(caught.error)).toBe(true);
        expect(caught.error.category).toBe('validation-failed');
      }
    }
  });
});
