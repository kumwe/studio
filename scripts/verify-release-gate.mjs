import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';

import {
  buildCriterionIndex,
  collectBundleFailures,
  collectGateRecordFailures,
} from './evidence-validation.mjs';
import { assertCoordinatedRelease } from './release-record.mjs';
import { STUDIO_RELEASE_PACKAGES, STUDIO_RELEASE_RECORD_TARGETS } from './release-family.mjs';
import { preparePromotion } from './prepare-promotion.mjs';
import {
  assertPromotionEvidencePolicy,
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

export function assertStatusGatePass(status, gate) {
  const row = new RegExp(`^\\| Gate ${gate}\\s*\\|\\s*([^|]+)\\|`, 'mu').exec(status);
  if (row === null || !/^Pass(?:ed)?(?:\s|$)/u.test(row[1].trim())) {
    throw new Error(
      `docs/roadmap/STATUS.md does not record Gate ${gate} as Pass; publication is blocked.`,
    );
  }
}

export function assertStableEnvironmentQualification(matrix, candidateMatrix = matrix) {
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

  const gates = channel === 'stable' ? ['A', 'B'] : [requiredGate];
  for (const gate of gates) {
    const record = await loadGateRecord({
      candidateRoot,
      candidateSha,
      criterionIndex,
      evidenceRoot,
      gate,
      packageVersions: candidateReleaseRecord.packages,
      registry,
      validateBundle,
      validateGate,
    });
    assertStatusGatePass(
      await readFile(resolve(evidenceRoot, 'docs/roadmap/STATUS.md'), 'utf8'),
      gate,
    );
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
    assertStableEnvironmentQualification(environmentMatrix, candidateEnvironmentMatrix);
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
    await preparePromotion(root, {
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
  registry,
  validateBundle,
  validateGate,
}) {
  const fileName = `gate-${gate.toLowerCase()}.json`;
  let record;
  try {
    record = JSON.parse(
      await readFile(resolve(evidenceRoot, 'evidence', 'gates', fileName), 'utf8'),
    );
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
  return record;
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
