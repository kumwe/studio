import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const expectedEvidenceId = process.env.STUDIO_GATE_B_EVIDENCE_ID;
const expectedCommit = process.env.STUDIO_RELEASE_CANDIDATE_SHA;
const gateRecordPath = process.env.STUDIO_GATE_B_RECORD;

if (expectedEvidenceId === undefined || expectedEvidenceId.length === 0) {
  throw new Error('STUDIO_GATE_B_EVIDENCE_ID is required; publication is blocked.');
}
if (expectedCommit === undefined || !/^[a-f0-9]{40}$/u.test(expectedCommit)) {
  throw new Error(
    'STUDIO_RELEASE_CANDIDATE_SHA must identify the exact reviewed candidate; publication is blocked.',
  );
}
if (gateRecordPath === undefined || gateRecordPath.length === 0) {
  throw new Error(
    'STUDIO_GATE_B_RECORD must point to a later accepted record; publication is blocked.',
  );
}

const checkedOutCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
if (checkedOutCommit !== expectedCommit) {
  throw new Error('The checked-out source is not the accepted release candidate.');
}

let record;
try {
  record = JSON.parse(await readFile(gateRecordPath, 'utf8'));
} catch (error) {
  throw new Error(
    'The separate accepted Gate B record is absent or invalid; publication is blocked.',
    {
      cause: error,
    },
  );
}

if (
  record.gate !== 'B' ||
  record.decision !== 'pass' ||
  record.evidenceBundleId !== expectedEvidenceId ||
  record.sourceCommit !== expectedCommit ||
  !Array.isArray(record.reviewers) ||
  record.reviewers.length < 2 ||
  !record.reviewers.every((reviewer) => typeof reviewer === 'string' && reviewer.length > 0) ||
  new Set(record.reviewers).size !== record.reviewers.length
) {
  throw new Error('Gate B record does not approve this exact commit and evidence bundle.');
}

console.log(
  `Draft Gate B record ${expectedEvidenceId} matches candidate ${expectedCommit}. ` +
    'This readiness check is non-authoritative and cannot publish packages.',
);
