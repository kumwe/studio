import { readFile } from 'node:fs/promises';
import Ajv2020 from 'ajv/dist/2020.js';

import { STUDIO_RELEASE_PACKAGE_NAMES, STUDIO_RELEASE_RECORD_TARGETS } from './release-family.mjs';
import {
  assertCoordinatedRelease,
  buildStudioReleaseRecord,
  readStudioReleaseInputs,
  serializeStudioReleaseRecord,
} from './release-record.mjs';

const repositoryRoot = new URL('../', import.meta.url);
const requireCoordinated = process.argv.slice(2).includes('--require-coordinated');
const unknownArguments = process.argv
  .slice(2)
  .filter((argument) => argument !== '--require-coordinated');
if (unknownArguments.length > 0) {
  throw new Error(`Unknown release-check argument(s): ${unknownArguments.join(', ')}`);
}

const expectedRecord = buildStudioReleaseRecord(await readStudioReleaseInputs(repositoryRoot));
const expectedBytes = serializeStudioReleaseRecord(expectedRecord);
const actualCopies = await Promise.all(
  STUDIO_RELEASE_RECORD_TARGETS.map(async (path) => ({
    bytes: await readFile(new URL(path, repositoryRoot), 'utf8'),
    path,
  })),
);

for (const { bytes, path } of actualCopies) {
  if (bytes !== expectedBytes) {
    throw new Error(`${path} is stale; run npm run release:sync.`);
  }
}

const commonSchema = await readJson(new URL('schemas/common.schema.json', repositoryRoot));
const releaseSchema = await readJson(new URL('schemas/studio-release.schema.json', repositoryRoot));
const ajv = new Ajv2020({ allErrors: true, strict: true });
ajv.addSchema(commonSchema);
const validateRelease = ajv.compile(releaseSchema);
if (!validateRelease(expectedRecord)) {
  throw new Error(
    `studio-release.json does not satisfy its canonical schema: ${ajv.errorsText(validateRelease.errors)}`,
  );
}

const changesetConfig = await readJson(new URL('.changeset/config.json', repositoryRoot));
const fixedGroups = changesetConfig.fixed;
if (
  !Array.isArray(fixedGroups) ||
  fixedGroups.length !== 1 ||
  !sameMembers(fixedGroups[0], STUDIO_RELEASE_PACKAGE_NAMES)
) {
  throw new Error(
    'Changesets must contain exactly one fixed group with all eight Studio packages.',
  );
}

for (const packageDirectory of ['protocol', 'testkit']) {
  const manifest = await readJson(
    new URL(`packages/${packageDirectory}/package.json`, repositoryRoot),
  );
  if (!manifest.files?.includes('studio-release.json')) {
    throw new Error(`${manifest.name} must pack studio-release.json.`);
  }
  if (manifest.exports?.['./studio-release.json'] !== './studio-release.json') {
    throw new Error(`${manifest.name} must export ./studio-release.json.`);
  }
}

if (requireCoordinated) {
  assertCoordinatedRelease(expectedRecord);
}

const coordinated = STUDIO_RELEASE_PACKAGE_NAMES.every(
  (name) => expectedRecord.packages[name] === expectedRecord.release,
);
console.log(
  `Studio release record verified: ${expectedRecord.release}, eight packages, ` +
    `${coordinated ? 'coordinated' : 'staggered pre-version baseline'}, ` +
    `${expectedRecord.claimedProfiles.length} claimed profiles.`,
);

function sameMembers(actual, expected) {
  return Array.isArray(actual) && [...actual].sort().join('\n') === [...expected].sort().join('\n');
}

async function readJson(url) {
  return JSON.parse(await readFile(url, 'utf8'));
}
