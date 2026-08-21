import { canonicalUtf8Bytes, type CanonicalSerializationOptions } from '@kumwe/studio-core';
import type {
  BlueprintDocument,
  BlueprintNode,
  JsonValue,
  NodeId,
  StableId,
  StudioArtifact,
} from '@kumwe/studio-protocol';

const draftDigestPattern = /^[0-9a-f]{64}$/u;
const maximumMarkerOrdinal = 99_999;

export interface PreviewDigestOptions extends CanonicalSerializationOptions {
  /** Web Crypto implementation used to hash the canonical bytes. */
  subtle?: Pick<SubtleCrypto, 'digest'>;
}

export interface PreviewMarkerInventory {
  markerMap: Record<StableId, NodeId>;
  markers: StableId[];
}

/**
 * Return the exact digest preimage for a complete, schema-valid Studio draft.
 * No transport envelope, prefix, BOM, viewport, revision override, or trailing
 * newline is added: the preimage is only the canonical UTF-8 artifact bytes.
 * The authoritative host MUST schema- and semantics-validate the artifact
 * before treating this helper's result as a valid draft identity.
 */
export function canonicalPreviewDraftBytes(
  draft: StudioArtifact,
  options: Readonly<CanonicalSerializationOptions> = {},
): Uint8Array {
  return canonicalUtf8Bytes(draft as unknown as JsonValue, options);
}

/** Compute the lowercase SHA-256 hex identity of a complete Studio draft. */
export async function computePreviewDraftDigest(
  draft: StudioArtifact,
  options: Readonly<PreviewDigestOptions> = {},
): Promise<string> {
  const subtle = options.subtle ?? globalThis.crypto.subtle;
  const serializationOptions =
    options.maximumDepth === undefined ? {} : { maximumDepth: options.maximumDepth };
  const preimage = Uint8Array.from(canonicalPreviewDraftBytes(draft, serializationOptions));
  const digest = await subtle.digest('SHA-256', preimage);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Create the canonical marker for one zero-based Blueprint preorder ordinal. */
export function createPreviewMarker(draftDigest: string, ordinal: number): StableId {
  if (!draftDigestPattern.test(draftDigest)) {
    throw new TypeError('Preview draft digest must be 64 lowercase hexadecimal characters.');
  }
  if (!Number.isSafeInteger(ordinal) || ordinal < 0 || ordinal > maximumMarkerOrdinal) {
    throw new RangeError(`Preview marker ordinal must be between 0 and ${maximumMarkerOrdinal}.`);
  }
  return `studio.preview/node/${draftDigest}/${ordinal}`;
}

/**
 * Build the portable marker inventory for a Blueprint. Traversal is roots in
 * array order, each node before descendants, slot names in ascending UTF-16
 * code-unit order, and children in array order. Node ids must be unique.
 */
export function createPreviewMarkerInventory(
  draft: BlueprintDocument,
  draftDigest: string,
): PreviewMarkerInventory {
  const markerMap: Record<StableId, NodeId> = {};
  const markers: StableId[] = [];
  const nodeIds = new Set<NodeId>();

  const visit = (node: BlueprintNode): void => {
    if (nodeIds.has(node.id)) {
      throw new TypeError(`Preview marker inventory cannot contain duplicate node id ${node.id}.`);
    }
    nodeIds.add(node.id);
    const marker = createPreviewMarker(draftDigest, markers.length);
    markers.push(marker);
    markerMap[marker] = node.id;

    const slots = Object.entries(node.slots).sort(([left], [right]) =>
      left < right ? -1 : left > right ? 1 : 0,
    );
    for (const [, children] of slots) {
      for (const child of children) {
        visit(child);
      }
    }
  };

  for (const root of draft.roots) {
    visit(root);
  }
  return { markerMap, markers };
}
