import { execFileSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import { collectRegistryFailures } from './verify-published-release.mjs';
import { assertCoordinatedRelease } from './release-record.mjs';
import { STUDIO_RELEASE_PACKAGES } from './release-family.mjs';
import { APPROVED_ARTIFACT_PATH, inspectExistingRegistryArtifacts } from './release-artifacts.mjs';
import { assertPromotionPackageState } from './release-policy.mjs';
import { assertLiveMain } from './reconcile-release-tag.mjs';
import {
  inspectStagingTags,
  publishMissingApprovedArtifacts,
  reconcileStagingTags,
} from './staged-publish.mjs';

const repositoryRoot = new URL('../', import.meta.url);
const ignoredChangesetFiles = new Set(['AGENTS.md', 'CLAUDE.md', 'GEMINI.md', 'README.md']);
const shaPattern = /^[a-f0-9]{40}$/u;

export function assertStagedCandidateState({
  actualSha,
  channel,
  expectedSha,
  expectedVersion,
  pendingChangesets,
  preState,
  releaseRecord,
  workingTreeState,
}) {
  assertCoordinatedRelease(releaseRecord);
  if (channel !== 'rc') {
    throw new Error('Candidate staging is available only for the governed RC channel.');
  }
  if (!shaPattern.test(expectedSha ?? '') || actualSha !== expectedSha) {
    throw new Error('Candidate staging requires the exact checked-out lowercase commit SHA.');
  }
  if (workingTreeState !== '') {
    throw new Error('Candidate staging requires a clean exact-source working tree.');
  }
  if (releaseRecord.release !== expectedVersion) {
    throw new Error(
      `Staging source ${releaseRecord.release} does not match planned coordinate ${String(expectedVersion)}.`,
    );
  }
  assertPromotionPackageState({
    channel,
    pendingChangesets,
    preState,
    releaseRecord,
  });
}

async function inspectCandidateState(root = repositoryRoot) {
  const releaseRecord = JSON.parse(await readFile(new URL('studio-release.json', root), 'utf8'));
  const entries = await readdir(new URL('.changeset/', root), { withFileTypes: true });
  const pendingChangesets = entries
    .filter(
      (entry) =>
        entry.isFile() && entry.name.endsWith('.md') && !ignoredChangesetFiles.has(entry.name),
    )
    .map((entry) => entry.name)
    .sort();
  const preState = JSON.parse(await readFile(new URL('.changeset/pre.json', root), 'utf8'));
  return { pendingChangesets, preState, releaseRecord };
}

async function main() {
  if (process.argv.length !== 2) {
    throw new Error('Usage: node scripts/publish-staged-candidate.mjs');
  }
  const state = await inspectCandidateState();
  const actualSha = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  }).trim();
  const workingTreeState = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  }).trim();
  assertStagedCandidateState({
    ...state,
    actualSha,
    channel: process.env.PROMOTION_CHANNEL,
    expectedSha: process.env.PROMOTION_EXPECTED_SHA,
    expectedVersion: process.env.PROMOTION_EXPECTED_VERSION,
    workingTreeState,
  });
  const approvedArtifacts = JSON.parse(
    await readFile(new URL(APPROVED_ARTIFACT_PATH, repositoryRoot), 'utf8'),
  );
  const preflight = await inspectExistingRegistryArtifacts(state.releaseRecord, approvedArtifacts);
  if (preflight.failures.length > 0) {
    throw new Error(
      `Existing registry packages differ from the approved immutable candidate:\n- ${preflight.failures.join('\n- ')}`,
    );
  }
  const existingProvenanceFailures = await collectRegistryFailures(state.releaseRecord, {
    approvedArtifacts,
    provenanceCommit: actualSha,
    requireProvenance: true,
    skipMissing: true,
  });
  if (existingProvenanceFailures.length > 0) {
    throw new Error(
      `Existing registry packages are not bound to the exact staged source:\n- ${existingProvenanceFailures.join('\n- ')}`,
    );
  }
  const stageTagPreflight = await inspectStagingTags(state.releaseRecord);
  if (stageTagPreflight.failures.length > 0) {
    throw new Error(
      `RC quarantine tag preflight failed before package publication:\n- ${stageTagPreflight.failures.join('\n- ')}`,
    );
  }
  console.log(
    `RC staging preflight: ${preflight.missing.length} package(s) remain unpublished; ` +
      `${STUDIO_RELEASE_PACKAGES.length - preflight.missing.length} existing package(s) match exactly.`,
  );
  const result = await publishMissingApprovedArtifacts(
    state.releaseRecord,
    approvedArtifacts,
    preflight.missing,
    {
      assertPublicationStillAuthorized: () => assertLiveMain(process.env.PROMOTION_EXPECTED_SHA),
    },
  );

  // A partial npm publish can leave its nonofficial tag on uploaded packages.
  // Missing/recovery tags are not reconciled across the family until every
  // immutable coordinate has passed the full provenance check.
  const failures = await collectRegistryFailures(state.releaseRecord, {
    approvedArtifacts,
    provenanceCommit: actualSha,
    requireProvenance: true,
  });
  if (failures.length > 0) {
    throw new Error(
      `The staged RC package family is incomplete or source-mismatched:\n- ${failures.join('\n- ')}`,
    );
  }
  const tags = await reconcileStagingTags(state.releaseRecord);
  console.log(
    `RC quarantine ${state.releaseRecord.release}: ${result.published.length} package(s) uploaded, ` +
      `${tags.added.length} staging tag(s) recovered, official channels unchanged.`,
  );
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
