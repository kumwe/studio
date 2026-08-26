import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';

import {
  buildCriterionIndex,
  buildProfileAssertionIndex,
  collectBundleFailures,
  collectGateRecordFailures,
} from './evidence-validation.mjs';
import { assertCoordinatedRelease } from './release-record.mjs';
import { STUDIO_RELEASE_PACKAGES, STUDIO_RELEASE_RECORD_TARGETS } from './release-family.mjs';
import { preparePromotion } from './prepare-promotion.mjs';
import {
  assertPromotionEvidencePolicy,
  assertSameReleaseCoordinate,
  promotionTargetVersion,
  requiredGateForChannel,
} from './release-policy.mjs';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const shaPattern = /^[a-f0-9]{40}$/u;
const evidenceDiffAllowlist = Object.freeze([
  /^docs\/roadmap\/(?:STATUS|evidence)\.md$/u,
  /^evidence\/README\.md$/u,
  /^evidence\/bundles\//u,
  /^evidence\/environment-matrix\.json$/u,
  /^evidence\/gates\//u,
]);
const stableDiffAllowlist = Object.freeze([
  /^\.changeset\/pre(?:\.json|\/)/u,
  /^examples\/reference-host\/package\.json$/u,
  /^package-lock\.json$/u,
  /^packages\/(?:core|media|preview|protocol|renderer-web|rich-text|studio-lit|testkit)\/(?:CHANGELOG\.md|package\.json)$/u,
  /^packages\/(?:protocol|testkit)\/studio-release\.json$/u,
  /^release-profile-claims\.json$/u,
  /^studio-release\.json$/u,
]);
const stableGeneratedPaths = Object.freeze([
  '.changeset/pre.json',
  'examples/reference-host/package.json',
  'package-lock.json',
  'release-profile-claims.json',
  ...STUDIO_RELEASE_RECORD_TARGETS,
  ...STUDIO_RELEASE_PACKAGES.flatMap(({ directory }) => [
    `packages/${directory}/CHANGELOG.md`,
    `packages/${directory}/package.json`,
  ]),
]);
const stableGeneratorInputPaths = Object.freeze([
  ...stableGeneratedPaths,
  'packages/protocol/src/types.ts',
  'packages/testkit/corpus-manifest.json',
]);

const stableEnvironmentLanes = Object.freeze({
  'android-chrome': new Set(['environment/android-chrome']),
  'chromium-desktop': new Set(['accessibility/web']),
  'desktop-os': new Set(['environment/desktop-os']),
  'firefox-desktop': new Set(['environment/firefox-desktop']),
  'generic-reference-host': new Set(['profile/host-baseline', 'profile/host-baseline-v2']),
  'ios-safari': new Set(['environment/ios-safari']),
  'kumwe-app-host': new Set(['environment/kumwe-app-host']),
  'node-npm-workspace': new Set(['quality/typecheck', 'build/workspace']),
  'npm-clean-consumer': new Set(['environment/npm-clean-consumer']),
  'webkit-desktop': new Set(['environment/webkit-desktop']),
});

export function assertStatusGatePass(status, gate) {
  const rows = status
    .split('\n')
    .filter((line) => /^\s*\|/u.test(line))
    .map((line) =>
      line
        .split('|')
        .slice(1, -1)
        .map((cell) => cell.trim()),
    )
    .filter((cells) => cells[0] === `Gate ${gate}`);
  const states = rows.map((cells) => cells.map(classifyGateState).filter(Boolean));
  if (
    rows.length === 0 ||
    states.some((rowStates) => rowStates.length !== 1) ||
    states.some(([state]) => state !== 'pass')
  ) {
    const found = [...new Set(states.flat())];
    throw new Error(
      `docs/roadmap/STATUS.md does not unambiguously record Gate ${gate} as Pass` +
        ` across every authoritative row (found: ${found.join(', ') || 'none'}); publication is blocked.`,
    );
  }
}

export function assertStableEnvironmentQualification(
  matrix,
  candidateMatrix = matrix,
  acceptedBundles = new Map(),
) {
  const candidateById = new Map(
    candidateMatrix.environments.map((environment) => [environment.id, environment]),
  );
  const qualifiedById = new Map(
    matrix.environments.map((environment) => [environment.id, environment]),
  );
  if (
    candidateById.size !== candidateMatrix.environments.length ||
    qualifiedById.size !== matrix.environments.length ||
    [...candidateById.keys()].sort().join('\n') !== [...qualifiedById.keys()].sort().join('\n')
  ) {
    throw new Error(
      'Stable qualification must preserve every candidate environment-matrix identity.',
    );
  }
  const identityDrift = [...candidateById].filter(([id, candidate]) => {
    const qualified = qualifiedById.get(id);
    return qualified.kind !== candidate.kind || qualified.requirement !== candidate.requirement;
  });
  if (identityDrift.length > 0) {
    throw new Error(
      `Stable qualification changed candidate environment requirements: ${identityDrift
        .map(([id]) => id)
        .join(', ')}.`,
    );
  }
  const blockers = [...candidateById.keys()]
    .filter((id) => id !== 'dart-flutter')
    .filter((id) => {
      const environment = qualifiedById.get(id);
      return (
        environment.status !== 'qualified' ||
        !Array.isArray(environment.coveredBy) ||
        environment.coveredBy.length === 0
      );
    });
  if (blockers.length > 0) {
    throw new Error(
      `Stable publication requires every Version 2 environment to be qualified: ${blockers.join(', ')}.`,
    );
  }
  for (const id of [...candidateById.keys()].filter(
    (candidateId) => candidateId !== 'dart-flutter',
  )) {
    const environment = qualifiedById.get(id);
    const allowedLanes = stableEnvironmentLanes[id];
    if (allowedLanes === undefined) {
      throw new Error(`Stable environment ${id} has no governed evidence-lane policy.`);
    }
    for (const reference of environment.coveredBy) {
      const separator = reference.indexOf('#');
      const bundleId = separator > 0 ? reference.slice(0, separator) : '';
      const testId = separator > 0 ? reference.slice(separator + 1) : '';
      const bundle = acceptedBundles.get(bundleId);
      if (
        bundle === undefined ||
        !allowedLanes.has(testId) ||
        !bundle.runs?.some(
          (run) => run.testId === testId && run.exitStatus === 0 && run.retryCount === 0,
        )
      ) {
        throw new Error(
          `Stable environment ${id} coverage ${reference} does not resolve to an accepted reproduced bundle and governed passing lane.`,
        );
      }
      if (
        id === 'chromium-desktop' &&
        !/^Chromium(?:-|\b)/u.test(bundle.environment?.browser ?? '')
      ) {
        throw new Error(`Stable environment ${id} requires a Chromium evidence environment.`);
      }
    }
  }
}

export function assertCurrentCandidateCoordinate(currentRecord, candidateRecord) {
  assertCoordinatedRelease(currentRecord);
  assertCoordinatedRelease(candidateRecord);
  assertSameReleaseCoordinate(currentRecord, candidateRecord);
}

export function assertLatestGateDecision(suppliedRecordBytes, latestRecordBytes, gate) {
  if (!suppliedRecordBytes.equals(latestRecordBytes)) {
    throw new Error(
      `Current main has superseded or revoked the supplied Gate ${gate} decision record.`,
    );
  }
}

export function assertStablePromotion(qualifiedRecord, stableRecord) {
  assertCoordinatedRelease(qualifiedRecord);
  assertCoordinatedRelease(stableRecord);
  const expected = promotionTargetVersion('stable', qualifiedRecord.release);
  if (stableRecord.release !== expected) {
    throw new Error(
      `Stable publication source must be the deterministic ${qualifiedRecord.release} -> ${expected} transform.`,
    );
  }
  if (
    [...qualifiedRecord.claimedProfiles].sort().join('\n') !==
    [...stableRecord.claimedProfiles].sort().join('\n')
  ) {
    throw new Error('Stable promotion must preserve the qualified RC profile claims exactly.');
  }
}

export function assertStableChangedPaths(paths) {
  const forbidden = paths.filter(
    (path) => !stableDiffAllowlist.some((pattern) => pattern.test(path)),
  );
  if (forbidden.length > 0) {
    throw new Error(
      `Stable promotion changed paths outside generated release metadata:\n${forbidden.join('\n')}`,
    );
  }
}

export function assertEvidenceChangedPaths(paths) {
  const forbidden = paths.filter(
    (path) => !evidenceDiffAllowlist.some((pattern) => pattern.test(path)),
  );
  if (forbidden.length > 0) {
    throw new Error(
      `The candidate-to-gate commit range changed files outside evidence records:\n${forbidden.join('\n')}`,
    );
  }
}

export async function verifyReleaseGate({
  candidateRoot,
  candidateSha,
  channel,
  evidenceCommit,
  evidenceRoot,
  expectedMainSha,
  phase,
  publishRoot,
  publishSourceSha,
}) {
  for (const [label, value] of Object.entries({
    candidateSha,
    evidenceCommit,
    expectedMainSha,
    publishSourceSha,
  })) {
    if (!shaPattern.test(value)) {
      throw new Error(`${label} must be an exact lowercase 40-character SHA.`);
    }
  }
  if (phase !== 'prepare' && phase !== 'publish') {
    throw new Error('Promotion phase must be prepare or publish.');
  }
  const requiredGate = requiredGateForChannel(channel);
  const checkedOutCandidate = git(candidateRoot, ['rev-parse', 'HEAD']);
  const checkedOutPublishSource = git(publishRoot, ['rev-parse', 'HEAD']);
  const checkedOutEvidenceCommit = git(evidenceRoot, ['rev-parse', 'HEAD']);
  const remoteMain = git(publishRoot, ['rev-parse', 'origin/main']);
  if (checkedOutCandidate !== candidateSha) {
    throw new Error('The qualification checkout is not the exact reviewed RC candidate.');
  }
  if (checkedOutPublishSource !== publishSourceSha) {
    throw new Error('The publication checkout does not match PROMOTION_PUBLISH_SOURCE_SHA.');
  }
  if (checkedOutEvidenceCommit !== evidenceCommit || evidenceCommit === candidateSha) {
    throw new Error('The evidence checkout is not the exact later gate-record commit.');
  }
  if (remoteMain !== expectedMainSha) {
    throw new Error(
      'origin/main moved after the exact-main dispatch guard; publication is blocked.',
    );
  }
  assertAncestor(
    candidateSha,
    evidenceCommit,
    evidenceRoot,
    'gate record does not descend from candidate',
  );
  assertAncestor(
    evidenceCommit,
    expectedMainSha,
    publishRoot,
    'gate record is not on current main',
  );
  assertAncestor(
    candidateSha,
    publishSourceSha,
    publishRoot,
    'publication source does not descend from candidate',
  );
  assertEvidenceChangedPaths(
    git(evidenceRoot, ['diff', '--name-only', `${candidateSha}..${evidenceCommit}`])
      .split('\n')
      .filter(Boolean),
  );

  const candidateRegistryBytes = await readFile(
    resolve(candidateRoot, 'evidence/gate-criteria.json'),
  );
  const evidenceRegistryBytes = await readFile(
    resolve(evidenceRoot, 'evidence/gate-criteria.json'),
  );
  if (!candidateRegistryBytes.equals(evidenceRegistryBytes)) {
    throw new Error('The gate-record commit changed the candidate criterion registry.');
  }
  const registry = JSON.parse(candidateRegistryBytes.toString('utf8'));
  const criterionIndex = buildCriterionIndex(registry);
  if (criterionIndex.failures.length > 0) {
    throw new Error(
      `The candidate criterion registry is invalid:\n- ${criterionIndex.failures.join('\n- ')}`,
    );
  }
  const bundleSchema = JSON.parse(
    await readFile(resolve(candidateRoot, 'evidence/schema/evidence-bundle.schema.json'), 'utf8'),
  );
  const gateSchema = JSON.parse(
    await readFile(resolve(candidateRoot, 'evidence/schema/gate-record.schema.json'), 'utf8'),
  );
  const environmentMatrixSchema = JSON.parse(
    await readFile(
      resolve(candidateRoot, 'evidence/schema/environment-matrix.schema.json'),
      'utf8',
    ),
  );
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const validateBundle = ajv.compile(bundleSchema);
  const validateGate = ajv.compile(gateSchema);
  const validateEnvironmentMatrix = ajv.compile(environmentMatrixSchema);
  const candidateReleaseRecord = JSON.parse(
    await readFile(resolve(candidateRoot, 'studio-release.json'), 'utf8'),
  );
  assertCoordinatedRelease(candidateReleaseRecord);
  const currentMainReleaseRecord = JSON.parse(
    git(publishRoot, ['show', `${expectedMainSha}:studio-release.json`]),
  );
  if (channel === 'rc' || phase === 'prepare') {
    assertCurrentCandidateCoordinate(currentMainReleaseRecord, candidateReleaseRecord);
  }
  const profileAssertionRegistry = JSON.parse(
    await readFile(resolve(candidateRoot, 'evidence/profile-assertions.json'), 'utf8'),
  );
  const profileAssertionIndex = buildProfileAssertionIndex(
    profileAssertionRegistry,
    criterionIndex.allowedProfiles,
  );
  if (profileAssertionIndex.failures.length > 0) {
    throw new Error(
      `The candidate profile assertion registry is invalid:\n- ${profileAssertionIndex.failures.join('\n- ')}`,
    );
  }

  const gates = channel === 'stable' ? ['A', 'B'] : [requiredGate];
  const acceptedBundles = new Map();
  const evidenceStatus = await readFile(resolve(evidenceRoot, 'docs/roadmap/STATUS.md'), 'utf8');
  const currentStatus = git(publishRoot, ['show', `${expectedMainSha}:docs/roadmap/STATUS.md`]);
  for (const gate of gates) {
    const { bundlesById, record, recordBytes } = await loadGateRecord({
      candidateRoot,
      candidateSha,
      criterionIndex,
      evidenceRoot,
      gate,
      packageVersions: candidateReleaseRecord.packages,
      profileAssertions: profileAssertionIndex.profilesById,
      registry,
      validateBundle,
      validateGate,
    });
    assertStatusGatePass(evidenceStatus, gate);
    assertStatusGatePass(currentStatus, gate);
    const latestRecordBytes = gitBytes(publishRoot, [
      'show',
      `${expectedMainSha}:evidence/gates/gate-${gate.toLowerCase()}.json`,
    ]);
    assertLatestGateDecision(recordBytes, latestRecordBytes, gate);
    for (const [id, bundle] of bundlesById) {
      acceptedBundles.set(id, bundle);
    }
    if (gate === requiredGate) {
      assertPromotionEvidencePolicy({
        candidateSha,
        channel,
        gateRecord: record,
        releaseRecord: candidateReleaseRecord,
      });
    }
  }

  if (channel === 'stable') {
    const [candidateEnvironmentMatrix, environmentMatrix] = await Promise.all([
      readJson(resolve(candidateRoot, 'evidence/environment-matrix.json')),
      readJson(resolve(evidenceRoot, 'evidence/environment-matrix.json')),
    ]);
    if (
      !validateEnvironmentMatrix(candidateEnvironmentMatrix) ||
      !validateEnvironmentMatrix(environmentMatrix)
    ) {
      throw new Error('The stable environment matrix violates the candidate schema.');
    }
    assertStableEnvironmentQualification(
      environmentMatrix,
      candidateEnvironmentMatrix,
      acceptedBundles,
    );
    if (phase === 'publish') {
      const stableReleaseRecord = JSON.parse(
        await readFile(resolve(publishRoot, 'studio-release.json'), 'utf8'),
      );
      assertStablePromotion(candidateReleaseRecord, stableReleaseRecord);
      const paths = git(publishRoot, [
        'diff',
        '--name-only',
        `${evidenceCommit}..${publishSourceSha}`,
      ])
        .split('\n')
        .filter(Boolean);
      assertStableChangedPaths(paths);
      await assertStableGeneratedTree(evidenceRoot, publishRoot);
    }
  } else if (publishSourceSha !== candidateSha) {
    throw new Error('RC publication must use the exact qualified candidate commit as its source.');
  }

  console.log(
    `Gate ${requiredGate} at ${evidenceCommit} authorizes ${phase} for ${channel} from ` +
      `${candidateSha}; current main is ${expectedMainSha}.`,
  );
}

export async function assertStableGeneratedTree(evidenceRoot, publishRoot) {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'studio-stable-promotion-'));
  try {
    for (const path of stableGeneratorInputPaths) {
      try {
        await mkdir(dirname(join(temporaryRoot, path)), { recursive: true });
        await copyFile(resolve(evidenceRoot, path), join(temporaryRoot, path));
      } catch (error) {
        if (error?.code !== 'ENOENT' || path !== '.changeset/pre.json') {
          throw error;
        }
      }
    }
    const root = pathToFileURL(`${temporaryRoot}/`);
    const candidateRecord = await readJson(join(temporaryRoot, 'studio-release.json'));
    await preparePromotion(root, {
      candidateRecord,
      candidateSha: 'a'.repeat(40),
      channel: 'stable',
      evidenceSha: 'b'.repeat(40),
      profiles: [],
    });
    for (const path of stableGeneratedPaths) {
      const [expected, actual] = await Promise.all([
        readOptionalFile(join(temporaryRoot, path)),
        readOptionalFile(resolve(publishRoot, path)),
      ]);
      if (expected === undefined || actual === undefined) {
        if (expected !== actual) {
          throw new Error(`Stable promotion deletion drifted for ${path}.`);
        }
      } else if (!expected.equals(actual)) {
        throw new Error(
          `Stable promotion is not the deterministic generated transform at ${path}.`,
        );
      }
    }
    if ((await readOptionalPath(resolve(publishRoot, '.changeset/pre'))) !== undefined) {
      throw new Error('Stable promotion must remove consumed prerelease Changeset history.');
    }
  } finally {
    await rm(temporaryRoot, { force: true, recursive: true });
  }
}

async function readOptionalPath(path) {
  try {
    return await readFile(path);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return undefined;
    }
    if (error?.code === 'EISDIR') {
      return 'directory-present';
    }
    throw error;
  }
}

async function readOptionalFile(path) {
  try {
    return await readFile(path);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
}

async function loadGateRecord({
  candidateRoot,
  candidateSha,
  criterionIndex,
  evidenceRoot,
  gate,
  packageVersions,
  profileAssertions,
  registry,
  validateBundle,
  validateGate,
}) {
  const fileName = `gate-${gate.toLowerCase()}.json`;
  let record;
  let recordBytes;
  try {
    recordBytes = await readFile(resolve(evidenceRoot, 'evidence', 'gates', fileName));
    record = JSON.parse(recordBytes.toString('utf8'));
  } catch (error) {
    throw new Error(`The separate passing Gate ${gate} record is absent; publication is blocked.`, {
      cause: error,
    });
  }
  if (!validateGate(record)) {
    throw new Error(`Gate ${gate} record violates its schema.`);
  }
  if (record.gate !== gate || record.decision !== 'pass' || record.sourceCommit !== candidateSha) {
    throw new Error(`Gate ${gate} does not approve the exact qualified candidate.`);
  }
  const context = {
    ...criterionIndex,
    evidenceRoot,
    getCommitTime(commit) {
      if (commit !== candidateSha) {
        return Number.NaN;
      }
      return Date.parse(git(candidateRoot, ['show', '--no-patch', '--format=%cI', commit]));
    },
    isCommitReachable(commit) {
      return commit === candidateSha;
    },
    now: Date.now(),
    packageVersions,
    profileAssertions,
    repositoryRoot: candidateRoot,
  };
  const bundlesById = new Map();
  for (const bundleId of record.evidenceBundleIds) {
    if (bundleId.startsWith('SAMPLE-')) {
      throw new Error(`Gate ${gate} links forbidden sample bundle ${bundleId}.`);
    }
    const manifestPath = resolve(evidenceRoot, 'evidence', 'bundles', bundleId, 'manifest.json');
    let manifest;
    try {
      manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    } catch (error) {
      throw new Error(`Gate ${gate} links missing bundle ${bundleId}.`, { cause: error });
    }
    if (!validateBundle(manifest) || manifest.bundleId !== bundleId) {
      throw new Error(`Bundle ${bundleId} violates its schema or directory identity.`);
    }
    const failures = await collectBundleFailures(manifest, context);
    if (failures.length > 0) {
      throw new Error(`Bundle ${bundleId} failed authenticity checks:\n- ${failures.join('\n- ')}`);
    }
    bundlesById.set(bundleId, manifest);
  }
  const failures = await collectGateRecordFailures(record, fileName, {
    ...context,
    bundlesById,
    registry,
  });
  if (failures.length > 0) {
    throw new Error(`Gate ${gate} failed authenticity checks:\n- ${failures.join('\n- ')}`);
  }
  return { bundlesById, record, recordBytes };
}

function assertAncestor(ancestor, descendant, cwd, message) {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', ancestor, descendant], {
      cwd,
      stdio: 'ignore',
    });
  } catch {
    throw new Error(message);
  }
}

function git(cwd, arguments_) {
  return execFileSync('git', arguments_, { cwd, encoding: 'utf8' }).trim();
}

function gitBytes(cwd, arguments_) {
  return execFileSync('git', arguments_, { cwd });
}

function classifyGateState(cell) {
  if (/^Pass(?:ed)?(?:\s|$)/iu.test(cell)) {
    return 'pass';
  }
  if (/^Not assessed(?:\s|;|$)/iu.test(cell)) {
    return 'not-assessed';
  }
  if (/^Blocked(?:\s|;|$)/iu.test(cell)) {
    return 'blocked';
  }
  if (/^Fail(?:ed)?(?:\s|;|$)/iu.test(cell)) {
    return 'failed';
  }
  if (/^Revoked(?:\s|;|$)/iu.test(cell)) {
    return 'revoked';
  }
  return undefined;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

export async function verifyReleaseGateFromEnvironment() {
  if (
    process.env.STUDIO_GATE_EVIDENCE_ROOT === undefined ||
    process.env.STUDIO_GATE_EVIDENCE_ROOT.length === 0
  ) {
    throw new Error('STUDIO_GATE_EVIDENCE_ROOT is required.');
  }
  const candidateRoot = resolve(repositoryRoot, process.env.STUDIO_QUALIFIED_CANDIDATE_ROOT ?? '.');
  const evidenceRoot = resolve(repositoryRoot, process.env.STUDIO_GATE_EVIDENCE_ROOT);
  await verifyReleaseGate({
    candidateRoot,
    candidateSha: process.env.STUDIO_RELEASE_CANDIDATE_SHA,
    channel: process.env.STUDIO_RELEASE_CHANNEL,
    evidenceCommit: process.env.STUDIO_GATE_RECORD_COMMIT,
    evidenceRoot,
    expectedMainSha: process.env.STUDIO_EXPECTED_MAIN_SHA,
    phase: process.env.STUDIO_PROMOTION_PHASE,
    publishRoot: repositoryRoot,
    publishSourceSha: process.env.STUDIO_PUBLISH_SOURCE_SHA,
  });
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await verifyReleaseGateFromEnvironment();
}
