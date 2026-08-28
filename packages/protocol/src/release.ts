import studioReleaseRecord from '../studio-release.json' with { type: 'json' };
import type { StudioDeploymentRelease } from './types.js';

/**
 * Release identity compiled into every consumer of this exact protocol family.
 * The browser distribution manifest projects the same two fields from the
 * byte-identical coordinated release record.
 */
export const STUDIO_RELEASE_IDENTITY: Readonly<StudioDeploymentRelease> = Object.freeze({
  corpusManifestDigest: studioReleaseRecord.corpusManifestDigest,
  version: studioReleaseRecord.release,
});
