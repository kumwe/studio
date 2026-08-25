import { appendFile, readFile, readdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import { assertCoordinatedRelease } from './release-record.mjs';
import {
  assertPromotionPackageState,
  nextRcVersion,
  parseProfileInput,
  promotionTargetVersion,
  requiredGateForChannel,
} from './release-policy.mjs';

const repositoryRoot = new URL('../', import.meta.url);
const shaPattern = /^[a-f0-9]{40}$/u;
const ignoredChangesetFiles = new Set(['AGENTS.md', 'CLAUDE.md', 'GEMINI.md', 'README.md']);

export async function inspectPromotionPlan(
  root = repositoryRoot,
  { candidateSha = '', channel, evidenceSha = '', profiles = '' } = {},
) {
  const record = JSON.parse(await readFile(new URL('studio-release.json', root), 'utf8'));
  assertCoordinatedRelease(record);
  const pendingChangesets = await listPendingChangesets(root);
  const preState = await readPreState(root);
  const hasCandidate = candidateSha.length > 0;
  const hasEvidence = evidenceSha.length > 0;
  if (hasCandidate !== hasEvidence) {
    throw new Error(
      'candidate_sha and gate_record_sha must either both be empty or both be supplied.',
    );
  }
  if (
    hasCandidate &&
    (!shaPattern.test(candidateSha) ||
      !shaPattern.test(evidenceSha) ||
      candidateSha === evidenceSha)
  ) {
    throw new Error(
      'candidate_sha and gate_record_sha must be distinct lowercase 40-character SHAs.',
    );
  }

  const preparingRc = channel === 'rc' && record.release.includes('-alpha.');
  const preparingStable = channel === 'stable' && record.release.includes('-rc.');
  if (preparingRc || preparingStable) {
    if (preparingStable && (!hasCandidate || !hasEvidence)) {
      throw new Error(
        'Stable preparation requires the qualified RC candidate_sha and its Gate B gate_record_sha.',
      );
    }
    if (preparingRc && (hasCandidate || hasEvidence)) {
      throw new Error('RC preparation does not accept candidate or gate-record SHAs.');
    }
    if (pendingChangesets.length > 0) {
      throw new Error('Publish the pending alpha Changesets before preparing a promotion.');
    }
    if (channel === 'rc' && (preState?.mode !== 'pre' || preState.tag !== 'alpha')) {
      throw new Error('RC preparation must start from the active alpha prerelease train.');
    }
    if (channel === 'stable' && (preState?.mode !== 'pre' || preState.tag !== 'rc')) {
      throw new Error('Stable preparation must start from an immutable RC coordinate.');
    }
    const requestedProfiles = preparingRc
      ? parseProfileInput(profiles, { requireNonEmpty: true })
      : parseProfileInput(record.claimedProfiles.join(','), { requireNonEmpty: true });
    if (preparingStable && profiles.length > 0) {
      throw new Error(
        'Stable preparation preserves the RC profile claims; profiles must be empty.',
      );
    }
    return {
      channel,
      gate: requiredGateForChannel(channel),
      operation: 'prepare',
      profiles: requestedProfiles,
      sourceVersion: record.release,
      targetVersion: promotionTargetVersion(channel, record.release),
    };
  }

  const correctingRc = channel === 'rc' && record.release.includes('-rc.') && !hasCandidate;
  if (correctingRc) {
    if (preState?.mode !== 'pre' || preState.tag !== 'rc') {
      throw new Error('RC correction requires the active rc prerelease train.');
    }
    if (pendingChangesets.length === 0) {
      throw new Error(
        'No RC correction Changesets are pending. Supply candidate/evidence SHAs to publish instead.',
      );
    }
    const releaseTypes = await readPendingReleaseTypes(root, pendingChangesets);
    if (releaseTypes.length === 0 || releaseTypes.some((type) => type !== 'patch')) {
      throw new Error('RC corrections require non-empty patch-only Changesets.');
    }
    if (profiles.length > 0) {
      throw new Error(
        'RC corrections preserve the existing profile claims; profiles must be empty.',
      );
    }
    return {
      channel,
      gate: requiredGateForChannel(channel),
      operation: 'correct',
      profiles: parseProfileInput(record.claimedProfiles.join(','), { requireNonEmpty: true }),
      sourceVersion: record.release,
      targetVersion: nextRcVersion(record.release),
    };
  }

  if (!hasCandidate) {
    throw new Error('candidate_sha and gate_record_sha must be lowercase 40-character SHAs.');
  }
  if (profiles.length > 0) {
    throw new Error(
      'profiles is preparation-only; publication reads claims from the candidate record.',
    );
  }
  assertPromotionPackageState({ channel, pendingChangesets, preState, releaseRecord: record });
  return {
    channel,
    gate: requiredGateForChannel(channel),
    operation: 'publish',
    profiles: [...record.claimedProfiles],
    sourceVersion: record.release,
    targetVersion: record.release,
  };
}

async function readPendingReleaseTypes(root, names) {
  const types = [];
  for (const name of names) {
    const source = await readFile(new URL(`.changeset/${name}`, root), 'utf8');
    const frontmatter = /^---\n([\s\S]*?)\n---(?:\n|$)/u.exec(source)?.[1] ?? '';
    types.push(
      ...[...frontmatter.matchAll(/:\s*(major|minor|patch)\s*$/gmu)].map((match) => match[1]),
    );
  }
  return types;
}

export function formatPromotionOutput(plan) {
  return [
    `channel=${plan.channel}`,
    `gate=${plan.gate}`,
    `operation=${plan.operation}`,
    `profiles=${plan.profiles.join(',')}`,
    `source_version=${plan.sourceVersion}`,
    `target_version=${plan.targetVersion}`,
  ].join('\n');
}

async function readPreState(root) {
  try {
    return JSON.parse(await readFile(new URL('.changeset/pre.json', root), 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
}

async function listPendingChangesets(root) {
  const entries = await readdir(new URL('.changeset/', root), { withFileTypes: true });
  return entries
    .filter(
      (entry) =>
        entry.isFile() && entry.name.endsWith('.md') && !ignoredChangesetFiles.has(entry.name),
    )
    .map((entry) => entry.name)
    .sort();
}

async function main() {
  if (process.argv.length !== 2) {
    throw new Error('Usage: node scripts/promotion-plan.mjs');
  }
  const plan = await inspectPromotionPlan(repositoryRoot, {
    candidateSha: process.env.PROMOTION_CANDIDATE_SHA ?? '',
    channel: process.env.PROMOTION_CHANNEL,
    evidenceSha: process.env.PROMOTION_GATE_RECORD_SHA ?? '',
    profiles: process.env.PROMOTION_PROFILES ?? '',
  });
  const outputPath = process.env.GITHUB_OUTPUT;
  if (outputPath !== undefined && outputPath.length > 0) {
    await appendFile(outputPath, `${formatPromotionOutput(plan)}\n`, 'utf8');
  }
  console.log(
    `Promotion plan: ${plan.operation} ${plan.channel} ${plan.sourceVersion} -> ${plan.targetVersion}; ` +
      `Gate ${plan.gate}; ${plan.profiles.length} profile(s).`,
  );
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
