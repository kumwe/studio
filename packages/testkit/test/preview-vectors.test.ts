import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { computePreviewDraftDigest, createPreviewMarkerInventory } from '@kumwe/studio-preview';
import {
  isPreviewRenderedPayload,
  protocolSchemas,
  STUDIO_WIRE_PROTOCOL_VERSION,
  type BlueprintDocument,
  type NodeId,
  type StableId,
} from '@kumwe/studio-protocol';

interface PreviewVector {
  draft: BlueprintDocument;
  expect: {
    draftDigest: string;
    markerMap: Record<StableId, NodeId>;
    markers: StableId[];
  };
  profile: string;
  protocolVersion: string;
  render: {
    artifactId: string;
    draftDigest: string;
    draftRevision: string;
    requestId: string;
    viewport: string;
  };
}

const vectorDirectory = join(process.cwd(), 'packages/testkit/vectors/preview');
const vectorFiles = (await readdir(vectorDirectory))
  .filter((name) => name.endsWith('.json'))
  .sort();
const vectors: [string, PreviewVector][] = await Promise.all(
  vectorFiles.map(async (file) => [
    file,
    JSON.parse(await readFile(join(vectorDirectory, file), 'utf8')) as PreviewVector,
  ]),
);

const ajv = new Ajv2020({ allErrors: true, strict: true });
for (const schema of protocolSchemas) {
  ajv.addSchema(schema);
}
const validatePreviewVector = ajv.getSchema(
  'https://schemas.kumwe.org/studio/v1/preview-vector.schema.json',
);

describe('canonical preview identity vectors', () => {
  it('publishes one non-empty profile for the current wire protocol', () => {
    expect(vectors.length).toBeGreaterThan(0);
    expect(new Set(vectors.map(([, vector]) => vector.profile))).toEqual(
      new Set(['studio.profile/preview-identity-v1']),
    );
    expect(new Set(vectors.map(([, vector]) => vector.protocolVersion))).toEqual(
      new Set([STUDIO_WIRE_PROTOCOL_VERSION]),
    );
    expect(new Set(vectors.map(([, vector]) => vector.render.requestId)).size).toBe(vectors.length);
  });

  describe.each(vectors)('%s', (_file, vector) => {
    it('validates against the canonical preview vector schema', () => {
      expect(validatePreviewVector).toBeDefined();
      expect(validatePreviewVector?.(vector), ajv.errorsText(validatePreviewVector?.errors)).toBe(
        true,
      );
    });

    it('reproduces the canonical draft digest and exact marker inventory', async () => {
      const draftDigest = await computePreviewDraftDigest(vector.draft);
      expect(draftDigest).toBe(vector.expect.draftDigest);
      expect(createPreviewMarkerInventory(vector.draft, draftDigest)).toEqual({
        markerMap: vector.expect.markerMap,
        markers: vector.expect.markers,
      });
      expect(vector.render).toMatchObject({
        artifactId: vector.draft.id,
        draftDigest,
        draftRevision: vector.draft.revision,
      });
      expect(
        isPreviewRenderedPayload({
          diagnostics: [],
          draftDigest,
          markerMap: vector.expect.markerMap,
          markers: vector.expect.markers,
          requestId: vector.render.requestId,
        }),
      ).toBe(true);
    });
  });
});
