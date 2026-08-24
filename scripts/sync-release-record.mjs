import { writeFile } from 'node:fs/promises';

import { STUDIO_RELEASE_RECORD_TARGETS } from './release-family.mjs';
import {
  buildStudioReleaseRecord,
  readStudioReleaseInputs,
  serializeStudioReleaseRecord,
} from './release-record.mjs';

const repositoryRoot = new URL('../', import.meta.url);
const record = buildStudioReleaseRecord(await readStudioReleaseInputs(repositoryRoot));
const bytes = serializeStudioReleaseRecord(record);

await Promise.all(
  STUDIO_RELEASE_RECORD_TARGETS.map((path) => writeFile(new URL(path, repositoryRoot), bytes)),
);

console.log(
  `Studio release ${record.release} synchronized to ${STUDIO_RELEASE_RECORD_TARGETS.length} byte-identical records.`,
);
