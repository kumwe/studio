import type {
  MediaUploadPlan,
  MediaUploadRequestDescriptor,
  StudioDiagnostic,
} from '@kumwe/studio-protocol';
import { MEDIA_UPLOAD_FAILURE, MEDIA_UPLOAD_TOO_LARGE } from './upload-controller.js';

/**
 * The host-declared upload policy: the bounded upload plan the host grants
 * (`MediaUploadPlan`) plus the declared media types it accepts. This is the
 * policy shape the canonical vectors in `schemas/vectors/media/` fix; the
 * host remains authoritative and re-verifies everything server-side.
 */
export interface MediaUploadPolicy {
  acceptedMediaTypes: readonly string[];
  chunkBytes?: number;
  maximumBytes: number;
  resumable: boolean;
}

export type MediaUploadPolicyDecision =
  | { failure: StudioDiagnostic; outcome: 'rejected' }
  | { outcome: 'accepted'; plan: MediaUploadPlan };

/** The deterministic upload plan a policy grants, independent of any request. */
export function planFromPolicy(policy: MediaUploadPolicy): MediaUploadPlan {
  const plan: MediaUploadPlan = {
    maximumBytes: policy.maximumBytes,
    resumable: policy.resumable,
  };
  if (policy.chunkBytes !== undefined) {
    plan.chunkBytes = policy.chunkBytes;
  }
  return plan;
}

/**
 * Evaluates one upload request against a host-declared policy, in the fixed
 * order filename, media type, size. Rejections use the closed media failure
 * vocabulary: an oversize request fails with `studio.media/upload-too-large`
 * carrying the byte counts only as machine-readable diagnostic parameters
 * (the exact diagnostic `MediaUploadController` raises at the same boundary),
 * and every other violation fails with the generic
 * `studio.media/upload-failed` — user-facing messages never echo the raw
 * size, media type, or filename. The canonical corpus in
 * `schemas/vectors/media/` replays this decision.
 */
export function evaluateUploadPolicy(
  policy: MediaUploadPolicy,
  request: MediaUploadRequestDescriptor,
): MediaUploadPolicyDecision {
  if (
    !isCanonicalFilename(request.filename) ||
    !policy.acceptedMediaTypes.includes(request.mediaType) ||
    !Number.isInteger(request.byteSize) ||
    request.byteSize < 1
  ) {
    return {
      failure: {
        code: 'studio.media/upload-failed',
        message: { ...MEDIA_UPLOAD_FAILURE },
        severity: 'error',
      },
      outcome: 'rejected',
    };
  }
  if (request.byteSize > policy.maximumBytes) {
    return {
      failure: {
        code: 'studio.media/upload-too-large',
        message: { ...MEDIA_UPLOAD_TOO_LARGE },
        parameters: { byteSize: request.byteSize, maximumBytes: policy.maximumBytes },
        severity: 'error',
      },
      outcome: 'rejected',
    };
  }
  return { outcome: 'accepted', plan: planFromPolicy(policy) };
}

/**
 * Mirrors the filename rule of `media-upload-session.schema.json`: one to 255
 * code points, no C0 control characters, no DEL, and no path separators —
 * per the media contract, filenames are display metadata, never storage
 * paths.
 */
function isCanonicalFilename(filename: string): boolean {
  let length = 0;
  for (const character of filename) {
    length += 1;
    if (length > 255) {
      return false;
    }
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint <= 0x1f || codePoint === 0x7f || character === '/' || character === '\\') {
      return false;
    }
  }
  return length >= 1;
}
