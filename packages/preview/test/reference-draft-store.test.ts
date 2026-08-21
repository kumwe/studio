import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { BlockRegistry } from '@kumwe/studio-core';
import type { BlueprintDocument, PreviewRenderPayload } from '@kumwe/studio-protocol';
import {
  ReferenceDraftStore,
  ReferenceDraftStoreError,
} from '../../../examples/reference-host/src/reference-draft-store.js';

let emptyDraft: BlueprintDocument;

beforeAll(async () => {
  const vector = JSON.parse(
    await readFile(join(process.cwd(), 'schemas/vectors/preview/empty-draft.json'), 'utf8'),
  ) as { draft: BlueprintDocument };
  emptyDraft = vector.draft;
});

function request(
  identity: Awaited<ReturnType<ReferenceDraftStore['stage']>>,
): PreviewRenderPayload {
  return {
    ...identity,
    requestId: 'renders/reference-1',
    viewport: 'expanded',
  };
}

describe('reference preview draft store', () => {
  it('resolves only the exact artifact, revision, and digest tuple', async () => {
    const store = new ReferenceDraftStore(new BlockRegistry());
    const identity = await store.stage(emptyDraft);

    await expect(store.resolve(request(identity))).resolves.toEqual(emptyDraft);
    await expect(
      store.resolve({ ...request(identity), artifactId: 'blueprints/another' }),
    ).rejects.toMatchObject({ code: 'studio.preview/draft-not-found' });
    await expect(
      store.resolve({ ...request(identity), draftRevision: 'empty-preview-r2' }),
    ).rejects.toMatchObject({ code: 'studio.preview/draft-not-found' });
    await expect(
      store.resolve({ ...request(identity), draftDigest: 'f'.repeat(64) }),
    ).rejects.toMatchObject({ code: 'studio.preview/draft-not-found' });
  });

  it('validates before hashing and isolates stored state from caller mutation', async () => {
    const store = new ReferenceDraftStore(new BlockRegistry());
    const callerDraft = structuredClone(emptyDraft);
    const identity = await store.stage(callerDraft);
    callerDraft.id = 'blueprints/mutated-after-stage';

    await expect(store.resolve(request(identity))).resolves.toEqual(emptyDraft);

    const invalid = {
      ...emptyDraft,
      contractVersion: 'wrong-version',
    } as unknown as BlueprintDocument;
    await expect(store.stage(invalid)).rejects.toBeInstanceOf(ReferenceDraftStoreError);
    await expect(store.stage(invalid)).rejects.toMatchObject({
      code: 'studio.preview/draft-invalid',
    });
  });
});
