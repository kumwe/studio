import { execFileSync } from 'node:child_process';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import Ajv2020 from 'ajv/dist/2020.js';

import {
  buildExternalSubjectAssertionIndex,
  collectExternalSubjectFailures,
} from './external-evidence.mjs';
import {
  assertReviewerAuthorityStructuralPin,
  buildReviewerAuthorityIndex,
} from './review-authentication.mjs';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));

async function main() {
  if (process.argv.length !== 2) {
    throw new Error('Usage: node scripts/verify-kumwe-app-proof.mjs');
  }
  const evidenceRoot = await resolveEvidenceRoot(process.env.STUDIO_EVIDENCE_ROOT);
  const subjectPath = await resolveRegularInput(
    evidenceRoot,
    process.env.STUDIO_EXTERNAL_SUBJECT_PATH,
  );
  const manifestPath = await resolveRegularInput(
    evidenceRoot,
    process.env.STUDIO_EXTERNAL_BUNDLE_MANIFEST_PATH,
  );
  const [subjectBytes, manifestBytes] = await Promise.all([
    readFile(subjectPath),
    readFile(manifestPath),
  ]);
  const subject = JSON.parse(subjectBytes.toString('utf8'));
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  const [schema, reportSchema, attestationSchema, reviewSchema, authoritySchema] =
    await Promise.all(
      [
        'external-subject.schema.json',
        'external-report.schema.json',
        'external-attestation.schema.json',
        'review-attestation.schema.json',
        'reviewer-authorities.schema.json',
      ].map((name) =>
        readFile(new URL(`../evidence/schema/${name}`, import.meta.url), 'utf8').then(JSON.parse),
      ),
    );
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const validateSchema = ajv.compile(schema);
  const validateReportSchema = ajv.compile(reportSchema);
  const validateAttestationSchema = ajv.compile(attestationSchema);
  const validateReviewAttestationSchema = ajv.compile(reviewSchema);
  const validateAuthoritySchema = ajv.compile(authoritySchema);
  const registry = JSON.parse(
    await readFile(
      new URL('../evidence/external-subject-assertions.json', import.meta.url),
      'utf8',
    ),
  );
  const index = buildExternalSubjectAssertionIndex(registry);
  if (index.failures.length > 0) {
    throw new Error(`External subject registry is invalid:\n- ${index.failures.join('\n- ')}`);
  }
  const report = JSON.parse(
    await readFile(await resolveRegularInput(evidenceRoot, subject.reportArtifactPath), 'utf8'),
  );
  const attestation = JSON.parse(
    await readFile(
      await resolveRegularInput(evidenceRoot, subject.attestationArtifactPath),
      'utf8',
    ),
  );
  const [authorityBytes, authorityChecksumBytes] = await Promise.all([
    readFile(new URL('../evidence/reviewer-authorities.json', import.meta.url)),
    readFile(new URL('../evidence/reviewer-authorities.sha256', import.meta.url)),
  ]);
  const authorityRegistry = JSON.parse(authorityBytes.toString('utf8'));
  if (!validateAuthoritySchema(authorityRegistry)) {
    throw new Error('Reviewer authority registry violates its closed schema.');
  }
  assertReviewerAuthorityStructuralPin(authorityBytes, authorityChecksumBytes);
  const authorityIndex = buildReviewerAuthorityIndex(authorityRegistry);
  if (authorityIndex.failures.length > 0) {
    throw new Error(
      `Reviewer authority registry is invalid:\n- ${authorityIndex.failures.join('\n- ')}`,
    );
  }
  const artifactsByPath = new Map(
    (manifest.artifacts ?? []).map((artifact) => [artifact.path, artifact]),
  );
  const assertion = index.subjectsById.get(subject.id);
  const run = (manifest.runs ?? []).find((item) => item.testId === assertion?.laneId);
  const failures = await collectExternalSubjectFailures(subject, {
    artifactPaths: new Set(artifactsByPath.keys()),
    artifactsByPath,
    assertion,
    attestation,
    bundleId: manifest.bundleId,
    candidateCommit: git(['rev-parse', 'HEAD']),
    candidateTree: manifest.source?.tree,
    evidenceRoot,
    execution: {
      attempt: run?.executionAttempt,
      id: run?.executionId,
      runId: run?.runId,
      runner: run?.runner,
    },
    now: Date.now(),
    report,
    reviewerAuthorities: authorityIndex.authoritiesByIdentity,
    reviewerAuthorityStructuralPinVerified: true,
    runnerIdentities: new Set((manifest.runs ?? []).map((item) => item.runner)),
    sourceCommitTime: Date.parse(
      git(['show', '--no-patch', '--format=%cI', git(['rev-parse', 'HEAD'])]),
    ),
    subjectBytes,
    validateAttestationSchema,
    validateReportSchema,
    validateReviewAttestationSchema,
    validateSchema,
    runStartedAt: run?.startedAt,
    workPackage: manifest.workPackage,
  });
  if (failures.length > 0) {
    throw new Error(`Kumwe App evidence failed verification:\n- ${failures.join('\n- ')}`);
  }
  console.log(`Verified authenticated Kumwe App evidence for ${subject.commit}.`);
}

async function resolveEvidenceRoot(value) {
  const candidate = value === undefined ? repositoryRoot : resolve(repositoryRoot, value);
  if (!isContained(repositoryRoot, candidate)) {
    throw new Error('STUDIO_EVIDENCE_ROOT must remain inside the repository.');
  }
  const stat = await lstat(candidate);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error('STUDIO_EVIDENCE_ROOT must be a regular, non-symlink directory.');
  }
  if (!isContained(await realpath(repositoryRoot), await realpath(candidate))) {
    throw new Error('STUDIO_EVIDENCE_ROOT resolves outside the repository.');
  }
  return candidate;
}

async function resolveRegularInput(root, value) {
  if (value === undefined || value.length === 0 || value.includes('\0')) {
    throw new Error('STUDIO_EXTERNAL_SUBJECT_PATH must name a retained external subject record.');
  }
  const candidate = resolve(root, value);
  if (!isContained(root, candidate) || isAbsolute(value)) {
    throw new Error('The external subject input must be a repository-relative path.');
  }
  const stat = await lstat(candidate);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error('The external subject input must be a regular, non-symlink file.');
  }
  if (!isContained(await realpath(root), await realpath(candidate))) {
    throw new Error('The external subject input resolves outside the repository.');
  }
  return candidate;
}

function isContained(root, candidate) {
  const path = relative(root, candidate);
  return path === '' || (!path.startsWith(`..${sep}`) && path !== '..' && !isAbsolute(path));
}

function git(args) {
  return execFileSync('git', args, { cwd: repositoryRoot, encoding: 'utf8' }).trim();
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
