import { describe, expect, it } from 'vitest';
import { Ajv2020 } from 'ajv/dist/2020.js';
import {
  mediaUploadSessionSchema,
  protocolSchemas,
  type MediaUploadAcceptedAsset,
  type MediaUploadPlan,
  type MediaUploadRequestDescriptor,
  type MediaUploadSession,
} from '@kumwe/studio-protocol';
import { MediaUploadController, type MediaUploadTransport } from '../src/index.js';

const ajv = new Ajv2020({ allErrors: true, strict: true });
for (const schema of protocolSchemas) {
  ajv.addSchema(schema);
}
const validateSession = ajv.getSchema(mediaUploadSessionSchema.$id ?? '');

const acceptedAsset: MediaUploadAcceptedAsset = {
  id: 'asset-1',
  revision: 'asset-r1',
  state: 'processing',
};

const uploadRequest = {
  filename: 'windhoek-skyline.jpg',
  mediaType: 'image/jpeg',
  purpose: 'studio.media/entry-image',
} satisfies Omit<MediaUploadRequestDescriptor, 'byteSize'>;

class FakeTransport implements MediaUploadTransport {
  public readonly abortCalls: string[] = [];
  public readonly authorizeCalls: MediaUploadRequestDescriptor[] = [];
  public readonly finalizeCalls: string[] = [];
  public plan: MediaUploadPlan = { chunkBytes: 1024, maximumBytes: 1_000_000, resumable: true };
  public readonly transferCalls: { offset: number; sessionId: string; size: number }[] = [];

  public abort(sessionId: string): Promise<void> {
    this.abortCalls.push(sessionId);
    return Promise.resolve();
  }

  public authorize(request: MediaUploadRequestDescriptor): Promise<MediaUploadPlan> {
    this.authorizeCalls.push(structuredClone(request));
    return Promise.resolve({ ...this.plan });
  }

  public finalize(sessionId: string): Promise<MediaUploadAcceptedAsset> {
    this.finalizeCalls.push(sessionId);
    return Promise.resolve({ ...acceptedAsset });
  }

  public transfer(chunk: { data: Blob; offset: number; sessionId: string }): Promise<void> {
    this.transferCalls.push({
      offset: chunk.offset,
      sessionId: chunk.sessionId,
      size: chunk.data.size,
    });
    return Promise.resolve();
  }
}

function createController(transport: MediaUploadTransport): MediaUploadController {
  let counter = 0;
  return new MediaUploadController(transport, {
    sessionId: (): string => `upload-${(counter += 1)}`,
  });
}

function collectSnapshots(controller: MediaUploadController): MediaUploadSession[] {
  const snapshots: MediaUploadSession[] = [];
  controller.subscribe((session) => snapshots.push(session));
  return snapshots;
}

/** Every snapshot a listener observes must satisfy the canonical schema. */
function expectValidSnapshots(snapshots: readonly MediaUploadSession[]): void {
  expect(validateSession).toBeDefined();
  for (const snapshot of snapshots) {
    expect(validateSession?.(snapshot), ajv.errorsText(validateSession?.errors)).toBe(true);
  }
}

function fileOfBytes(size: number): Blob {
  return new Blob([new Uint8Array(size)], { type: 'image/jpeg' });
}

describe('MediaUploadController', () => {
  it('drives requested → authorized → transferring → verifying → complete with per-chunk progress', async () => {
    const transport = new FakeTransport();
    const controller = createController(transport);
    const snapshots = collectSnapshots(controller);

    const session = await controller.upload(fileOfBytes(2_500), uploadRequest);

    expect(snapshots.map((snapshot) => snapshot.state)).toEqual([
      'requested',
      'authorized',
      'transferring',
      'transferring',
      'transferring',
      'transferring',
      'verifying',
      'complete',
    ]);
    expect(snapshots.map((snapshot) => snapshot.progress.transferredBytes)).toEqual([
      0, 0, 0, 1_024, 2_048, 2_500, 2_500, 2_500,
    ]);
    expect(transport.authorizeCalls).toEqual([{ ...uploadRequest, byteSize: 2_500 }]);
    expect(transport.transferCalls).toEqual([
      { offset: 0, sessionId: 'upload-1', size: 1_024 },
      { offset: 1_024, sessionId: 'upload-1', size: 1_024 },
      { offset: 2_048, sessionId: 'upload-1', size: 452 },
    ]);
    expect(transport.finalizeCalls).toEqual(['upload-1']);
    expect(session.state).toBe('complete');
    expect(session.asset).toEqual(acceptedAsset);
    expect(session.request.byteSize).toBe(2_500);
    for (const snapshot of snapshots) {
      expect(snapshot.id).toBe('upload-1');
      expect(snapshot.progress.totalBytes).toBe(2_500);
      expect(snapshot.progress.transferredBytes).toBeLessThanOrEqual(snapshot.progress.totalBytes);
    }
    expectValidSnapshots(snapshots);
  });

  it('transfers the whole file as one chunk when the plan sets no chunkBytes', async () => {
    const transport = new FakeTransport();
    transport.plan = { maximumBytes: 1_000_000, resumable: false };
    const controller = createController(transport);
    const snapshots = collectSnapshots(controller);

    const session = await controller.upload(fileOfBytes(2_500), uploadRequest);

    expect(session.state).toBe('complete');
    expect(transport.transferCalls).toEqual([{ offset: 0, sessionId: 'upload-1', size: 2_500 }]);
    expectValidSnapshots(snapshots);
  });

  it('fails before any transfer when the file exceeds the authorized maximum', async () => {
    const transport = new FakeTransport();
    transport.plan = { chunkBytes: 1_024, maximumBytes: 2_000, resumable: true };
    const controller = createController(transport);
    const snapshots = collectSnapshots(controller);

    const session = await controller.upload(fileOfBytes(2_500), uploadRequest);

    expect(snapshots.map((snapshot) => snapshot.state)).toEqual(['requested', 'failed']);
    expect(session.state).toBe('failed');
    expect(session.failure).toEqual({
      code: 'studio.media/upload-too-large',
      message: {
        defaultMessage: 'The file is larger than the host allows for this upload.',
        key: 'studio.media/upload-too-large',
      },
      parameters: { byteSize: 2_500, maximumBytes: 2_000 },
      severity: 'error',
    });
    expect(transport.transferCalls).toHaveLength(0);
    expect(transport.finalizeCalls).toHaveLength(0);
    expectValidSnapshots(snapshots);
  });

  it('maps an authorize rejection to the generic failure diagnostic without leaking details', async () => {
    const providerDetail = 'Bearer secret-token from /srv/private/uploads';
    const transport = new FakeTransport();
    transport.authorize = (): Promise<MediaUploadPlan> => Promise.reject(new Error(providerDetail));
    const controller = createController(transport);
    const snapshots = collectSnapshots(controller);

    const session = await controller.upload(fileOfBytes(2_500), uploadRequest);

    expect(snapshots.map((snapshot) => snapshot.state)).toEqual(['requested', 'failed']);
    expect(session.failure).toEqual({
      code: 'studio.media/upload-failed',
      message: {
        defaultMessage: 'The upload could not be completed.',
        key: 'studio.media/upload-failed',
      },
      severity: 'error',
    });
    expect(transport.transferCalls).toHaveLength(0);
    expect(JSON.stringify(snapshots)).not.toContain(providerDetail);
    expectValidSnapshots(snapshots);
  });

  it('maps a mid-stream transfer rejection to a failed session that keeps prior progress', async () => {
    const providerDetail = 'disk full on /srv/media-volume-7';
    const transport = new FakeTransport();
    const originalTransfer = transport.transfer.bind(transport);
    transport.transfer = (chunk): Promise<void> =>
      chunk.offset === 1_024 ? Promise.reject(new Error(providerDetail)) : originalTransfer(chunk);
    const controller = createController(transport);
    const snapshots = collectSnapshots(controller);

    const session = await controller.upload(fileOfBytes(2_500), uploadRequest);

    expect(snapshots.map((snapshot) => snapshot.state)).toEqual([
      'requested',
      'authorized',
      'transferring',
      'transferring',
      'failed',
    ]);
    expect(session.failure?.code).toBe('studio.media/upload-failed');
    expect(session.progress).toEqual({ totalBytes: 2_500, transferredBytes: 1_024 });
    expect(session.plan).toEqual(transport.plan);
    expect(transport.finalizeCalls).toHaveLength(0);
    expect(JSON.stringify(snapshots)).not.toContain(providerDetail);
    expectValidSnapshots(snapshots);
  });

  it('maps a finalize rejection to a failed session after verifying', async () => {
    const transport = new FakeTransport();
    transport.finalize = (): Promise<MediaUploadAcceptedAsset> =>
      Promise.reject(new Error('verification backend offline'));
    const controller = createController(transport);
    const snapshots = collectSnapshots(controller);

    const session = await controller.upload(fileOfBytes(2_500), uploadRequest);

    expect(snapshots.at(-2)?.state).toBe('verifying');
    expect(session.state).toBe('failed');
    expect(session.asset).toBeUndefined();
    expect(session.failure?.code).toBe('studio.media/upload-failed');
    expect(JSON.stringify(snapshots)).not.toContain('backend offline');
    expectValidSnapshots(snapshots);
  });

  it('cancels mid-transfer, stops further chunks, and aborts the transport session', async () => {
    const transport = new FakeTransport();
    const controller = createController(transport);
    const snapshots = collectSnapshots(controller);
    const originalTransfer = transport.transfer.bind(transport);
    transport.transfer = (chunk): Promise<void> => {
      const result = originalTransfer(chunk);
      if (chunk.offset === 1_024) {
        controller.cancel();
      }
      return result;
    };

    const session = await controller.upload(fileOfBytes(2_500), uploadRequest);

    expect(session.state).toBe('cancelled');
    expect(snapshots.map((snapshot) => snapshot.state)).toEqual([
      'requested',
      'authorized',
      'transferring',
      'transferring',
      'cancelled',
    ]);
    expect(transport.transferCalls.map((call) => call.offset)).toEqual([0, 1_024]);
    expect(transport.abortCalls).toEqual(['upload-1']);
    expect(session.progress).toEqual({ totalBytes: 2_500, transferredBytes: 1_024 });
    expectValidSnapshots(snapshots);
  });

  it('ignores transport.abort rejections while cancelling', async () => {
    const transport = new FakeTransport();
    transport.abort = (): Promise<void> => Promise.reject(new Error('abort endpoint gone'));
    const controller = createController(transport);
    const snapshots = collectSnapshots(controller);
    const originalTransfer = transport.transfer.bind(transport);
    transport.transfer = (chunk): Promise<void> => {
      controller.cancel();
      return originalTransfer(chunk);
    };

    const session = await controller.upload(fileOfBytes(2_500), uploadRequest);

    expect(session.state).toBe('cancelled');
    expect(JSON.stringify(snapshots)).not.toContain('abort endpoint gone');
    expectValidSnapshots(snapshots);
  });

  it('retries a failed upload from authorize with the same request and a fresh session id', async () => {
    const transport = new FakeTransport();
    const originalAuthorize = transport.authorize.bind(transport);
    let attempts = 0;
    transport.authorize = (request): Promise<MediaUploadPlan> => {
      attempts += 1;
      return attempts === 1
        ? Promise.reject(new Error('transient outage'))
        : originalAuthorize(request);
    };
    const controller = createController(transport);
    const snapshots = collectSnapshots(controller);

    const failed = await controller.upload(fileOfBytes(2_500), uploadRequest);
    expect(failed.state).toBe('failed');
    expect(failed.id).toBe('upload-1');

    const retried = await controller.retry();

    expect(retried.state).toBe('complete');
    expect(retried.id).toBe('upload-2');
    expect(retried.request).toEqual(failed.request);
    expect(transport.transferCalls.every((call) => call.sessionId === 'upload-2')).toBe(true);
    expectValidSnapshots(snapshots);
  });

  it('rejects retry unless the current session has failed', async () => {
    const transport = new FakeTransport();
    const controller = createController(transport);

    await expect(controller.retry()).rejects.toThrow(
      'Only a failed upload session can be retried.',
    );

    await controller.upload(fileOfBytes(2_500), uploadRequest);
    await expect(controller.retry()).rejects.toThrow(
      'Only a failed upload session can be retried.',
    );
  });

  it('rejects an empty file before opening a session', async () => {
    const transport = new FakeTransport();
    const controller = createController(transport);
    const snapshots = collectSnapshots(controller);

    await expect(controller.upload(fileOfBytes(0), uploadRequest)).rejects.toThrow(
      'Cannot upload an empty file.',
    );
    expect(snapshots).toHaveLength(0);
    expect(transport.authorizeCalls).toHaveLength(0);
  });

  it('rejects a second upload while one is in progress', async () => {
    const transport = new FakeTransport();
    const controller = createController(transport);

    const first = controller.upload(fileOfBytes(2_500), uploadRequest);
    await expect(controller.upload(fileOfBytes(2_500), uploadRequest)).rejects.toThrow(
      'An upload session is already in progress.',
    );
    await expect(first).resolves.toEqual(expect.objectContaining({ state: 'complete' }));
  });

  it('supports subscribe/unsubscribe semantics with cloned snapshots', async () => {
    const transport = new FakeTransport();
    const controller = createController(transport);
    expect(() => controller.session).toThrow('No upload session has been started.');

    const events: MediaUploadSession[] = [];
    const unsubscribe = controller.subscribe((session) => events.push(session));
    expect(events).toHaveLength(0);

    await controller.upload(fileOfBytes(2_500), uploadRequest);
    const notified = events.length;
    expect(notified).toBeGreaterThan(0);

    const late: MediaUploadSession[] = [];
    controller.subscribe((session) => late.push(session));
    expect(late).toHaveLength(1);
    expect(late[0]?.state).toBe('complete');

    unsubscribe();
    await controller.upload(fileOfBytes(2_500), uploadRequest);
    expect(events).toHaveLength(notified);

    const snapshot = controller.session;
    snapshot.state = 'failed';
    expect(controller.session.state).toBe('complete');
    expect(late.at(-1)).not.toBe(late.at(-2));
    expectValidSnapshots([...events, ...late]);
  });
});
