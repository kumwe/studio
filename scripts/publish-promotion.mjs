import { readFile, readdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import { assertCoordinatedRelease } from './release-record.mjs';
import { STUDIO_RELEASE_PACKAGES } from './release-family.mjs';
import { APPROVED_ARTIFACT_PATH, inspectExistingRegistryArtifacts } from './release-artifacts.mjs';
import { assertPromotionPackageState } from './release-policy.mjs';
import { publishMissingApprovedArtifacts } from './staged-publish.mjs';
import { verifyReleaseGateFromEnvironment } from './verify-release-gate.mjs';

const repositoryRoot = new URL('../', import.meta.url);
const ignoredChangesetFiles = new Set(['AGENTS.md', 'CLAUDE.md', 'GEMINI.md', 'README.md']);

export function assertPromotionPublication(input) {
  assertCoordinatedRelease(input.releaseRecord);
  assertPromotionPackageState(input);
}

export function assertOfficialRegistryPreflight(channel, preflight) {
  if (preflight.failures.length > 0) {
    throw new Error(
      `Existing registry packages differ from the approved immutable candidate:\n- ${preflight.failures.join('\n- ')}`,
    );
  }
  if (channel === 'rc' && preflight.missing.length > 0) {
    throw new Error(
      'Official RC publication requires the complete candidate family to have passed quarantine staging first.',
    );
  }
}

async function inspectPublicationState(root, channel) {
  const releaseRecord = JSON.parse(await readFile(new URL('studio-release.json', root), 'utf8'));
  const entries = await readdir(new URL('.changeset/', root), { withFileTypes: true });
  const pendingChangesets = entries
    .filter(
      (entry) =>
        entry.isFile() && entry.name.endsWith('.md') && !ignoredChangesetFiles.has(entry.name),
    )
    .map((entry) => entry.name)
    .sort();
  let preState;
  try {
    preState = JSON.parse(await readFile(new URL('.changeset/pre.json', root), 'utf8'));
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error;
    }
  }
  const state = { channel, pendingChangesets, preState, releaseRecord };
  assertPromotionPublication(state);
  return state;
}

async function main() {
  if (process.argv.length !== 2) {
    throw new Error('Usage: node scripts/publish-promotion.mjs');
  }
  await verifyReleaseGateFromEnvironment();
  const channel = process.env.PROMOTION_CHANNEL;
  const state = await inspectPublicationState(repositoryRoot, channel);
  if (
    process.env.PROMOTION_EXPECTED_VERSION === undefined ||
    state.releaseRecord.release !== process.env.PROMOTION_EXPECTED_VERSION
  ) {
    throw new Error(
      `Publication source ${state.releaseRecord.release} does not match the planned exact coordinate ` +
        `${String(process.env.PROMOTION_EXPECTED_VERSION)}.`,
    );
  }
  const approvedArtifacts = JSON.parse(
    await readFile(new URL(APPROVED_ARTIFACT_PATH, repositoryRoot), 'utf8'),
  );
  const preflight = await inspectExistingRegistryArtifacts(state.releaseRecord, approvedArtifacts);
  assertOfficialRegistryPreflight(channel, preflight);
  console.log(
    `Registry preflight: ${preflight.missing.length} package(s) remain unpublished; ` +
      `${STUDIO_RELEASE_PACKAGES.length - preflight.missing.length} existing package(s) match exactly.`,
  );
  const result = await publishMissingApprovedArtifacts(
    state.releaseRecord,
    approvedArtifacts,
    preflight.missing,
  );
  console.log(
    `Staging publication for ${state.releaseRecord.release} on ${channel}: ` +
      `${result.published.length} package(s) uploaded to ${result.stagingTag}.`,
  );
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
