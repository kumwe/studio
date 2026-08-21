import {
  STUDIO_CONTRACT_VERSION,
  type ContentModelDocument,
  type EntryDocument,
  type Revision,
  type StableId,
  type StudioArtifact,
} from '@kumwe/studio-protocol';
import { createBlueprintFixture } from '../src/index.js';

export type HostArtifactSeed =
  | {
      id: StableId;
      kind: 'blueprint' | 'content-model';
      revision: Revision;
      status?: 'draft' | 'published' | 'retired';
    }
  | {
      id: StableId;
      kind: 'entry';
      revision: Revision;
      status?: 'archived' | 'draft' | 'in-review' | 'published';
    };

/** Materializes the minimum valid artifact document for a portable host seed. */
export function materializeHostArtifactSeed(seed: HostArtifactSeed): StudioArtifact {
  if (seed.kind === 'blueprint') {
    const document = createBlueprintFixture({ id: seed.id, revision: seed.revision });
    document.status = seed.status ?? 'draft';
    return document;
  }
  if (seed.kind === 'content-model') {
    const document: ContentModelDocument = {
      contractVersion: STUDIO_CONTRACT_VERSION,
      fields: [
        {
          cardinality: 'one',
          id: 'value',
          kind: 'string',
          label: { defaultMessage: 'Value', key: 'studio.test/seed-value' },
          localized: false,
          required: false,
        },
      ],
      id: seed.id,
      kind: 'content-model',
      label: { defaultMessage: 'Seed model', key: 'studio.test/seed-model' },
      owner: { id: 'studio.test/testkit', version: '1.0.0' },
      relationships: [],
      revision: seed.revision,
      status: seed.status ?? 'draft',
      version: '1.0.0',
    };
    return document;
  }
  const document: EntryDocument = {
    contractVersion: STUDIO_CONTRACT_VERSION,
    id: seed.id,
    kind: 'entry',
    model: { id: 'studio.test/model', revision: 'model-r1', version: '1.0.0' },
    revision: seed.revision,
    status: (seed.status as EntryDocument['status'] | undefined) ?? 'draft',
    values: {},
  };
  return document;
}
