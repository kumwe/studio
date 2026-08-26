import { execFileSync } from 'node:child_process';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import Ajv2020 from 'ajv/dist/2020.js';

import {
  buildExternalSubjectAssertionIndex,
  collectExternalSubjectFailures,
} from './external-evidence.mjs';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));

async function main() {
  if (process.argv.length !== 2) {
    throw new Error('Usage: node scripts/verify-kumwe-app-proof.mjs');
  }
  const subjectPath = await resolveRegularInput(process.env.STUDIO_EXTERNAL_SUBJECT_PATH);
  const subject = JSON.parse(await readFile(subjectPath, 'utf8'));
  const [schema, reportSchema, attestationSchema] = await Promise.all(
    [
      'external-subject.schema.json',
      'external-report.schema.json',
      'external-attestation.schema.json',
    ].map((name) =>
      readFile(new URL(`../evidence/schema/${name}`, import.meta.url), 'utf8').then(JSON.parse),
    ),
  );
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const validateSchema = ajv.compile(schema);
  const validateReportSchema = ajv.compile(reportSchema);
  const validateAttestationSchema = ajv.compile(attestationSchema);
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
    await readFile(await resolveRegularInput(subject.reportArtifactPath), 'utf8'),
  );
  const attestation = JSON.parse(
    await readFile(await resolveRegularInput(subject.attestationArtifactPath), 'utf8'),
  );
  const failures = collectExternalSubjectFailures(subject, {
    artifactPaths: new Set([
      subject.recordArtifactPath,
      subject.reportArtifactPath,
      subject.attestationArtifactPath,
    ]),
    assertion: index.subjectsById.get(subject.id),
    attestation,
    candidateCommit: git(['rev-parse', 'HEAD']),
    report,
    validateAttestationSchema,
    validateReportSchema,
    validateSchema,
  });
  if (failures.length > 0) {
    throw new Error(`Kumwe App evidence failed verification:\n- ${failures.join('\n- ')}`);
  }
  console.log(`Verified authenticated Kumwe App evidence for ${subject.commit}.`);
}

async function resolveRegularInput(value) {
  if (value === undefined || value.length === 0 || value.includes('\0')) {
    throw new Error('STUDIO_EXTERNAL_SUBJECT_PATH must name a retained external subject record.');
  }
  const candidate = resolve(repositoryRoot, value);
  if (!isContained(repositoryRoot, candidate) || isAbsolute(value)) {
    throw new Error('The external subject input must be a repository-relative path.');
  }
  const stat = await lstat(candidate);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error('The external subject input must be a regular, non-symlink file.');
  }
  if (!isContained(await realpath(repositoryRoot), await realpath(candidate))) {
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
