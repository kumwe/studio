import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type {
  MediaUploadAcceptedAsset,
  MediaUploadPlan,
  MediaUploadRequestDescriptor,
  MediaUploadSessionState,
} from '@kumwe/studio-protocol';
import {
  evaluateUploadPolicy,
  MediaUploadController,
  planFromPolicy,
  type MediaUploadPolicy,
  type MediaUploadTransport,
} from '../src/index.js';

interface MediaVector {
  cancel?: {
    during: 'complete' | 'requested' | 'transferring' | 'verifying';
    finalState: 'cancelled' | 'complete';
  };
  description: string;
  expect:
    | { code: string; messageMustNotContain?: string[]; outcome: 'rejected' }
    | { outcome: 'accepted'; plan: MediaUploadPlan };
  id: string;
  policy: MediaUploadPolicy;
  request: MediaUploadRequestDescriptor;
  retry?: { freshSession: true };
}

const vectorDirectory = join(process.cwd(), 'packages/testkit/vectors/media');
const vectorFiles = (await readdir(vectorDirectory))
  .filter((name) => name.endsWith('.json'))
  .sort();

const vectors: [string, MediaVector][] = await Promise.all(
  vectorFiles.map(async (file): Promise<[string, MediaVector]> => {
    const vector = JSON.parse(await readFile(join(vectorDirectory, file), 'utf8')) as MediaVector;
    return [file, vector];
  }),
);

const acceptedAsset: MediaUploadAcceptedAsset = {
  id: 'asset-1',
  revision: 'asset-r1',
  state: 'processing',
};

/**
 * A host transport that enforces the vector's policy: authorization consults
 * `evaluateUploadPolicy` and declines every rejection except the oversize
 * one, whose plan is granted so the controller's own canonical boundary
 * check produces the identical `studio.media/upload-too-large` diagnostic.
 * The `cancel` hook interrupts the upload while the session is in the state
 * the vector names.
 */
function createPolicyTransport(
  policy: MediaUploadPolicy,
  onState?: (state: MediaUploadSessionState) => void,
): MediaUploadTransport {
  return {
    abort: (): Promise<void> => Promise.resolve(),
    authorize: (request): Promise<MediaUploadPlan> => {
      onState?.('requested');
      const decision = evaluateUploadPolicy(policy, request);
      if (
        decision.outcome === 'rejected' &&
        decision.failure.code !== 'studio.media/upload-too-large'
      ) {
        return Promise.reject(new Error('host declined: internal policy detail'));
      }
      return Promise.resolve(planFromPolicy(policy));
    },
    finalize: (): Promise<MediaUploadAcceptedAsset> => {
      onState?.('verifying');
      return Promise.resolve({ ...acceptedAsset });
    },
    transfer: (): Promise<void> => {
      onState?.('transferring');
      return Promise.resolve();
    },
  };
}

function fileOfBytes(size: number): Blob {
  return new Blob([new Uint8Array(size)]);
}

function userFacingText(message: { defaultMessage?: string; key: string }): string {
  return `${message.key} ${message.defaultMessage ?? ''}`;
}

describe('canonical media policy vectors', () => {
  it('has a non-empty corpus', () => {
    expect(vectors.length).toBeGreaterThan(0);
  });

  describe.each(vectors)('%s', (file, vector) => {
    it('evaluates the policy to the canonical decision', () => {
      const decision = evaluateUploadPolicy(vector.policy, vector.request);

      if (vector.expect.outcome === 'accepted') {
        expect(decision).toStrictEqual({ outcome: 'accepted', plan: vector.expect.plan });
        return;
      }
      expect(decision.outcome).toBe('rejected');
      if (decision.outcome !== 'rejected') {
        return;
      }
      expect(decision.failure.code).toBe(vector.expect.code);
      expect(decision.failure.severity).toBe('error');
      for (const forbidden of vector.expect.messageMustNotContain ?? []) {
        expect(userFacingText(decision.failure.message)).not.toContain(forbidden);
      }
    });

    it('drives the upload orchestration to the expected outcome', async () => {
      // The callback only runs during upload(), after the controller exists.
      const transport = createPolicyTransport(vector.policy, (state) => {
        if (state === vector.cancel?.during) {
          controller.cancel();
        }
      });
      let counter = 0;
      const controller = new MediaUploadController(transport, {
        sessionId: (): string => `upload-${(counter += 1)}`,
      });
      const { byteSize, ...request } = vector.request;

      const session = await controller.upload(fileOfBytes(byteSize), request);
      expect(session.request).toStrictEqual(vector.request);

      if (vector.cancel?.during === 'complete') {
        expect(session.state).toBe('complete');
        controller.cancel();
        expect(controller.session.state).toBe(vector.cancel.finalState);
        expect(controller.session.asset).toStrictEqual(acceptedAsset);
        return;
      }

      if (vector.cancel !== undefined) {
        expect(session.state).toBe(vector.cancel.finalState);
        expect(session.asset).toBeUndefined();
        if (vector.cancel.during !== 'requested') {
          // The plan the policy granted survives on the cancelled session.
          expect(session.plan).toStrictEqual(
            vector.expect.outcome === 'accepted' ? vector.expect.plan : undefined,
          );
        }
        return;
      }

      if (vector.expect.outcome === 'accepted') {
        expect(session.state).toBe('complete');
        expect(session.plan).toStrictEqual(vector.expect.plan);
        expect(session.asset).toStrictEqual(acceptedAsset);
        return;
      }

      expect(session.state).toBe('failed');
      // The orchestration reaches the same diagnostic the policy evaluation
      // produced, whichever side enforced it.
      const decision = evaluateUploadPolicy(vector.policy, vector.request);
      expect(decision.outcome).toBe('rejected');
      if (decision.outcome === 'rejected') {
        expect(session.failure).toStrictEqual(decision.failure);
      }
      for (const forbidden of vector.expect.messageMustNotContain ?? []) {
        expect(JSON.stringify(session.failure?.message)).not.toContain(forbidden);
      }
      // Host-side rejection details never surface in the session.
      expect(JSON.stringify(session)).not.toContain('internal policy detail');

      if (vector.retry !== undefined) {
        const retried = await controller.retry();
        expect(retried.state).toBe('failed');
        expect(retried.failure).toStrictEqual(session.failure);
        expect(retried.request).toStrictEqual(session.request);
        // Retry always runs under a fresh session identity.
        expect(retried.id).not.toBe(session.id);
      }
    });
  });
});
