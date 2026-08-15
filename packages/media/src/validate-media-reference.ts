import type { MediaReference, StudioDiagnostic } from '@kumwe/studio-protocol';

/**
 * Semantic validation the media-reference schema cannot express: a
 * rectangle crop uses normalized coordinates and MUST remain inside the
 * source bounds. Schema validation is assumed to have passed already.
 */
export function validateMediaReference(reference: MediaReference): StudioDiagnostic[] {
  const diagnostics: StudioDiagnostic[] = [];
  const crop = reference.cropIntent;
  if (crop?.mode === 'rectangle') {
    if (crop.x + crop.width > 1 || crop.y + crop.height > 1) {
      diagnostics.push({
        code: 'studio.media/crop-out-of-bounds',
        location: { artifactId: reference.assetId },
        message: {
          defaultMessage: 'The crop rectangle extends beyond the source media bounds.',
          key: 'studio.media/crop-out-of-bounds',
        },
        severity: 'error',
      });
    }
  }
  return diagnostics;
}
