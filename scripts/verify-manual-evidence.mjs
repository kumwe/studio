import { execFileSync } from 'node:child_process';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import Ajv2020 from 'ajv/dist/2020.js';

import { buildManualProcedureIndex, collectManualRecordFailures } from './manual-evidence.mjs';
import { buildCriterionIndex } from './evidence-validation.mjs';
import {
  assertReviewerAuthorityStructuralPin,
  buildReviewerAuthorityIndex,
} from './review-authentication.mjs';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));

async function main() {
  const procedureId = parseProcedureArgument(process.argv.slice(2));
  const recordPath = await resolveRegularInput(process.env.STUDIO_MANUAL_EVIDENCE_PATH);
  const manifestPath = await resolveRegularInput(process.env.STUDIO_MANUAL_BUNDLE_MANIFEST_PATH);
  const [recordBytes, manifestBytes] = await Promise.all([
    readFile(recordPath),
    readFile(manifestPath),
  ]);
  const record = JSON.parse(recordBytes.toString('utf8'));
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  const schemaNames = [
    'manual-record.schema.json',
    'review-attestation.schema.json',
    'reviewer-authorities.schema.json',
  ];
  const schemas = await Promise.all(
    schemaNames.map((name) =>
      readFile(new URL(`../evidence/schema/${name}`, import.meta.url), 'utf8').then(JSON.parse),
    ),
  );
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  for (const schema of schemas) ajv.addSchema(schema);
  const validateSchema = ajv.getSchema(schemas[0].$id);
  const validateReviewAttestationSchema = ajv.getSchema(schemas[1].$id);
  const validateReviewerAuthorities = ajv.getSchema(schemas[2].$id);
  const criteria = JSON.parse(
    await readFile(new URL('../evidence/gate-criteria.json', import.meta.url), 'utf8'),
  );
  const criterionIndex = buildCriterionIndex(criteria);
  const registry = JSON.parse(
    await readFile(new URL('../evidence/manual-procedures.json', import.meta.url), 'utf8'),
  );
  const index = buildManualProcedureIndex(registry, criterionIndex.criteriaById);
  if (criterionIndex.failures.length > 0 || index.failures.length > 0) {
    throw new Error(
      `Manual evidence registries are invalid:\n- ${[...criterionIndex.failures, ...index.failures].join('\n- ')}`,
    );
  }
  const authorityBytes = await readFile(
    new URL('../evidence/reviewer-authorities.json', import.meta.url),
  );
  const authorityChecksumBytes = await readFile(
    new URL('../evidence/reviewer-authorities.sha256', import.meta.url),
  );
  const authorityRegistry = JSON.parse(authorityBytes.toString('utf8'));
  if (!validateReviewerAuthorities(authorityRegistry)) {
    throw new Error('Reviewer authority registry violates its closed schema.');
  }
  assertReviewerAuthorityStructuralPin(authorityBytes, authorityChecksumBytes);
  const authorityIndex = buildReviewerAuthorityIndex(authorityRegistry);
  if (authorityIndex.failures.length > 0) {
    throw new Error(
      `Reviewer authority registry is invalid:\n- ${authorityIndex.failures.join('\n- ')}`,
    );
  }
  const candidateCommit = git(['rev-parse', 'HEAD']);
  const artifactsByPath = new Map(
    (manifest.artifacts ?? []).map((artifact) => [artifact.path, artifact]),
  );
  const procedure = index.proceduresById.get(procedureId);
  const run = (manifest.runs ?? []).find((item) => item.testId === procedure?.laneId);
  const failures = await collectManualRecordFailures(record, {
    artifactPaths: new Set(artifactsByPath.keys()),
    artifactsByPath,
    bundleId: manifest.bundleId,
    candidateCommit,
    evidenceRoot: repositoryRoot,
    now: Date.now(),
    procedure,
    reviewerAuthorities: authorityIndex.authoritiesByIdentity,
    reviewerAuthorityStructuralPinVerified: true,
    runStartedAt: run?.startedAt,
    runnerIdentities: new Set([
      ...(manifest.runs ?? []).map((item) => item.runner),
      ...parseRunnerIdentities(process.env.STUDIO_EVIDENCE_RUNNERS),
    ]),
    sourceCommitTime: Date.parse(git(['show', '--no-patch', '--format=%cI', candidateCommit])),
    subjectBytes: recordBytes,
    validateSchema,
    validateReviewAttestationSchema,
    verificationStartedAt: Date.parse(run?.startedAt ?? ''),
  });
  if (failures.length > 0) {
    throw new Error(`Manual evidence record failed verification:\n- ${failures.join('\n- ')}`);
  }
  console.log(
    `Manual evidence record ${record.procedureId} is structurally complete for ${candidateCommit}; ` +
      'it remains subject to independent bundle and gate review.',
  );
}

function parseProcedureArgument(args) {
  if (
    args.length !== 2 ||
    args[0] !== '--procedure' ||
    !/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/u.test(args[1])
  ) {
    throw new Error('Usage: node scripts/verify-manual-evidence.mjs --procedure <registered-id>');
  }
  return args[1];
}

function parseRunnerIdentities(value) {
  if (value === undefined || value.length === 0) return [];
  const identities = value.split(',');
  if (
    identities.some((identity) => identity.length === 0) ||
    new Set(identities).size !== identities.length
  ) {
    throw new Error(
      'STUDIO_EVIDENCE_RUNNERS must contain unique, nonempty comma-separated identities.',
    );
  }
  return identities;
}

async function resolveRegularInput(value) {
  if (value === undefined || value.length === 0 || value.includes('\0')) {
    throw new Error('Manual evidence paths must name retained regular files.');
  }
  const candidate = resolve(repositoryRoot, value);
  if (!isContained(repositoryRoot, candidate) || isAbsolute(value)) {
    throw new Error('The manual evidence input must be a repository-relative path.');
  }
  const stat = await lstat(candidate);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error('The manual evidence input must be a regular, non-symlink file.');
  }
  if (!isContained(await realpath(repositoryRoot), await realpath(candidate))) {
    throw new Error('The manual evidence input resolves outside the repository.');
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
