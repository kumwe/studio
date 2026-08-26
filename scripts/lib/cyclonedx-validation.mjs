import { createRequire } from 'node:module';

import { Version } from '@cyclonedx/cyclonedx-library/Spec';
import { JsonValidator } from '@cyclonedx/cyclonedx-library/Validation';

const require = createRequire(import.meta.url);
const libraryManifest = require('@cyclonedx/cyclonedx-library/package.json');

export const OFFICIAL_CYCLONEDX_LIBRARY_VERSION = '10.2.0';

export async function collectOfficialCycloneDxFailures(document) {
  if (libraryManifest.version !== OFFICIAL_CYCLONEDX_LIBRARY_VERSION) {
    return [
      `official CycloneDX validator drifted to ${String(libraryManifest.version)}; expected ${OFFICIAL_CYCLONEDX_LIBRARY_VERSION}`,
    ];
  }
  const validator = new JsonValidator(Version.v1dot5);
  const error = await validator.validate(JSON.stringify(document));
  return error === null
    ? []
    : [`CycloneDX document violates the pinned official 1.5 schema: ${String(error)}`];
}
