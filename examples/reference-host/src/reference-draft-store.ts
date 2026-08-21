import { validateBlueprint, type BlockRegistry } from '@kumwe/studio-core';
import { computePreviewDraftDigest } from '@kumwe/studio-preview';
import type {
  BlueprintDocument,
  PreviewRenderPayload,
  StudioDiagnostic,
} from '@kumwe/studio-protocol';

export interface StagedReferenceDraft {
  artifactId: string;
  draftDigest: string;
  draftRevision: string;
}

/**
 * Small, bounded draft store used by the standalone reference host. Entries
 * are keyed by the complete artifact identity tuple, never by a digest alone.
 * Every ingress and egress crosses the public Studio schema/semantic validator;
 * hashing happens only after validation and callers receive defensive clones.
 */
export class ReferenceDraftStore {
  readonly #entries = new Map<string, BlueprintDocument>();
  readonly #maximumEntries: number;
  readonly #registry: BlockRegistry;

  public constructor(registry: BlockRegistry, maximumEntries = 4) {
    if (!Number.isSafeInteger(maximumEntries) || maximumEntries < 1 || maximumEntries > 100) {
      throw new RangeError('Reference draft-store capacity must be between 1 and 100.');
    }
    this.#registry = registry;
    this.#maximumEntries = maximumEntries;
  }

  public async stage(draft: BlueprintDocument): Promise<StagedReferenceDraft> {
    const snapshot: unknown = structuredClone(draft);
    this.#assertValid(snapshot);
    const validated = snapshot;
    const draftDigest = await computePreviewDraftDigest(validated);
    const identity = {
      artifactId: validated.id,
      draftDigest,
      draftRevision: validated.revision,
    };
    this.#entries.set(identityKey(identity), structuredClone(validated));
    while (this.#entries.size > this.#maximumEntries) {
      const oldest = this.#entries.keys().next().value;
      if (oldest === undefined) {
        break;
      }
      this.#entries.delete(oldest);
    }
    return identity;
  }

  public async resolve(payload: PreviewRenderPayload): Promise<BlueprintDocument> {
    const stored = this.#entries.get(identityKey(payload));
    if (stored === undefined) {
      throw new ReferenceDraftStoreError(
        'studio.preview/draft-not-found',
        'The requested artifact, revision, and digest tuple is not staged.',
      );
    }

    const snapshot: unknown = structuredClone(stored);
    this.#assertValid(snapshot);
    const validated = snapshot;
    if (validated.id !== payload.artifactId || validated.revision !== payload.draftRevision) {
      throw new ReferenceDraftStoreError(
        'studio.preview/draft-identity-mismatch',
        'The staged draft metadata does not match the render request.',
      );
    }
    const actualDigest = await computePreviewDraftDigest(validated);
    if (actualDigest !== payload.draftDigest) {
      throw new ReferenceDraftStoreError(
        'studio.preview/draft-digest-mismatch',
        'The staged draft bytes do not match the render request.',
      );
    }
    return structuredClone(validated);
  }

  #assertValid(value: unknown): asserts value is BlueprintDocument {
    const result = validateBlueprint(value, this.#registry);
    if (!result.valid) {
      throw new ReferenceDraftStoreError(
        'studio.preview/draft-invalid',
        'The preview draft failed Studio schema or semantic validation.',
        result.diagnostics,
      );
    }
  }
}

export class ReferenceDraftStoreError extends Error {
  public readonly code: string;
  public readonly diagnostics: StudioDiagnostic[];

  public constructor(code: string, message: string, diagnostics: StudioDiagnostic[] = []) {
    super(message);
    this.name = 'ReferenceDraftStoreError';
    this.code = code;
    this.diagnostics = structuredClone(diagnostics);
  }
}

function identityKey(identity: {
  artifactId: string;
  draftDigest: string;
  draftRevision: string;
}): string {
  return JSON.stringify([identity.artifactId, identity.draftRevision, identity.draftDigest]);
}
