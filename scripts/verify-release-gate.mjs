import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import {
  buildCriterionIndex,
  collectBundleFailures,
  collectGateRecordFailures,
} from './evidence-validation.mjs';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const expectedCommit = process.env.STUDIO_RELEASE_CANDIDATE_SHA;
const evidenceCommit = process.env.STUDIO_GATE_RECORD_COMMIT;
const evidenceCheckout = process.env.STUDIO_GATE_EVIDENCE_ROOT;
const gateRecordPath = process.env.STUDIO_GATE_B_RECORD;

if (expectedCommit === undefined || !/^[a-f0-9]{40}$/u.test(expectedCommit)) {
  throw new Error(
    'STUDIO_RELEASE_CANDIDATE_SHA must identify the exact reviewed candidate; publication is blocked.',
  );
}
if (evidenceCommit === undefined || !/^[a-f0-9]{40}$/u.test(evidenceCommit)) {
  throw new Error(
    'STUDIO_GATE_RECORD_COMMIT must identify an immutable later evidence commit; publication is blocked.',
  );
}
if (evidenceCheckout === undefined || gateRecordPath === undefined) {
  throw new Error('The separate Gate B evidence checkout is required; publication is blocked.');
}

const checkedOutCommit = git(repositoryRoot, ['rev-parse', 'HEAD']);
if (checkedOutCommit !== expectedCommit) {
  throw new Error('The checked-out source is not the accepted release candidate.');
}
const evidenceRoot = resolve(repositoryRoot, evidenceCheckout);
const expectedGateRecordPath = resolve(evidenceRoot, 'evidence/gates/gate-b.json');
if (resolve(repositoryRoot, gateRecordPath) !== expectedGateRecordPath) {
  throw new Error(
    'STUDIO_GATE_B_RECORD must name evidence/gates/gate-b.json in the evidence checkout.',
  );
}
const checkedOutEvidenceCommit = git(evidenceRoot, ['rev-parse', 'HEAD']);
if (checkedOutEvidenceCommit !== evidenceCommit || evidenceCommit === expectedCommit) {
  throw new Error('The evidence checkout is not the exact later Gate B record commit.');
}
try {
  execFileSync('git', ['merge-base', '--is-ancestor', expectedCommit, evidenceCommit], {
    cwd: evidenceRoot,
    stdio: 'ignore',
  });
} catch {
  throw new Error('The Gate B record commit does not descend from the candidate commit.');
}
try {
  execFileSync('git', ['merge-base', '--is-ancestor', evidenceCommit, 'origin/main'], {
    cwd: evidenceRoot,
    stdio: 'ignore',
  });
} catch {
  throw new Error('The Gate B record commit is not reachable from the repository main branch.');
}

const candidateRegistryBytes = await readFile(
  resolve(repositoryRoot, 'evidence/gate-criteria.json'),
);
const evidenceRegistryBytes = await readFile(resolve(evidenceRoot, 'evidence/gate-criteria.json'));
if (!candidateRegistryBytes.equals(evidenceRegistryBytes)) {
  throw new Error('The Gate B record changed the candidate criterion registry.');
}
const registry = JSON.parse(candidateRegistryBytes.toString('utf8'));
const criterionIndex = buildCriterionIndex(registry);
if (criterionIndex.failures.length > 0) {
  throw new Error(
    `The candidate criterion registry is invalid:\n- ${criterionIndex.failures.join('\n- ')}`,
  );
}

const bundleSchema = JSON.parse(
  await readFile(resolve(repositoryRoot, 'evidence/schema/evidence-bundle.schema.json'), 'utf8'),
);
const gateSchema = JSON.parse(
  await readFile(resolve(repositoryRoot, 'evidence/schema/gate-record.schema.json'), 'utf8'),
);
const ajv = new Ajv2020({ allErrors: true, strict: true });
const validateBundle = ajv.compile(bundleSchema);
const validateGate = ajv.compile(gateSchema);

let record;
try {
  record = JSON.parse(await readFile(expectedGateRecordPath, 'utf8'));
} catch (error) {
  throw new Error('The separate Gate B record is absent or invalid; publication is blocked.', {
    cause: error,
  });
}
if (!validateGate(record)) {
  throw new Error(`Gate B record violates its schema: ${ajv.errorsText(validateGate.errors)}`);
}
if (record.gate !== 'B' || record.decision !== 'pass' || record.sourceCommit !== expectedCommit) {
  throw new Error('Gate B record does not approve this exact release candidate.');
}

const releaseRecord = JSON.parse(
  await readFile(resolve(repositoryRoot, 'studio-release.json'), 'utf8'),
);
const context = {
  ...criterionIndex,
  evidenceRoot,
  getCommitTime(commit) {
    if (commit !== expectedCommit) {
      return Number.NaN;
    }
    return Date.parse(git(repositoryRoot, ['show', '--no-patch', '--format=%cI', commit]));
  },
  isCommitReachable(commit) {
    return commit === expectedCommit;
  },
  now: Date.now(),
  packageVersions: releaseRecord.packages,
  repositoryRoot,
};

const bundlesById = new Map();
for (const bundleId of record.evidenceBundleIds) {
  if (bundleId.startsWith('SAMPLE-')) {
    throw new Error(`Gate B record links forbidden sample bundle ${bundleId}.`);
  }
  let manifest;
  try {
    manifest = JSON.parse(
      await readFile(
        resolve(evidenceRoot, 'evidence', 'bundles', bundleId, 'manifest.json'),
        'utf8',
      ),
    );
  } catch (error) {
    throw new Error(`Gate B record links missing bundle ${bundleId}.`, { cause: error });
  }
  if (!validateBundle(manifest)) {
    throw new Error(
      `Bundle ${bundleId} violates its schema: ${ajv.errorsText(validateBundle.errors)}`,
    );
  }
  if (manifest.bundleId !== bundleId) {
    throw new Error(`Bundle directory ${bundleId} does not match manifest bundleId.`);
  }
  const failures = await collectBundleFailures(manifest, context);
  if (failures.length > 0) {
    throw new Error(`Bundle ${bundleId} failed authenticity checks:\n- ${failures.join('\n- ')}`);
  }
  bundlesById.set(bundleId, manifest);
}

const gateFailures = await collectGateRecordFailures(record, 'gate-b.json', {
  ...context,
  bundlesById,
  registry,
});
if (gateFailures.length > 0) {
  throw new Error(`Gate B record failed authenticity checks:\n- ${gateFailures.join('\n- ')}`);
}

console.log(
  `Draft Gate B record at ${evidenceCommit} authenticates ${record.evidenceBundleIds.length} ` +
    `bundle(s) for candidate ${expectedCommit}. This readiness check is non-authoritative and ` +
    'cannot publish packages.',
);

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}
