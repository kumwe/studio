import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';

import { checksumFile } from '../evidence-validation.mjs';

const execFileAsync = promisify(execFile);
const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
const intakeSchema = JSON.parse(
  await readFile(join(repositoryRoot, 'evidence/schema/evidence-intake-v1.schema.json'), 'utf8'),
);
const validateIntake = new Ajv2020({ allErrors: true, strict: true }).compile(intakeSchema);

test('authenticated intake contract is closed and checksum-bound', () => {
  const intake = intakeDocument('intake-schema-fixture', 'a'.repeat(40), 'b'.repeat(40));
  assert.equal(validateIntake(intake), true, JSON.stringify(validateIntake.errors));
  Reflect.deleteProperty(intake.entries[0].artifacts[0], 'checksum');
  assert.equal(validateIntake(intake), false);
  intake.entries[0].artifacts[0].checksum = emptyChecksum();
  intake.entries[0].artifacts[0].unexpected = true;
  assert.equal(validateIntake(intake), false);
});

test('assembler rejects a schema-valid pending artifact outside its exact bundle prefix', async (t) => {
  const suffix = `${process.pid}-${Date.now()}`;
  const bundleId = `hostile-intake-${suffix}`;
  const relativeRoot = `.cache/${bundleId}`;
  const pendingRoot = join(repositoryRoot, relativeRoot, 'pending');
  const intakePath = join(repositoryRoot, relativeRoot, 'intake.json');
  const target = join(repositoryRoot, 'evidence/bundles', bundleId);
  t.after(() => rm(join(repositoryRoot, relativeRoot), { force: true, recursive: true }));
  t.after(() => rm(target, { force: true, recursive: true }));
  await mkdir(join(pendingRoot, 'artifacts'), { recursive: true });
  const wrongPath = 'docs/not-a-retained-bundle-artifact.log';
  const artifactFile = join(pendingRoot, 'artifacts', 'not-a-retained-bundle-artifact.log');
  await writeFile(artifactFile, 'green\n');
  const artifactChecksum = await checksumFile(artifactFile);
  const candidateCommit = git('rev-parse', 'HEAD');
  const candidateTree = git('rev-parse', 'HEAD^{tree}');
  const execution = { attempt: 1, id: `local/${bundleId}`, runner: 'test/runner' };
  const manifest = {
    artifactChecksums: { [wrongPath]: artifactChecksum },
    artifacts: [
      {
        checksum: artifactChecksum,
        mediaType: 'text/plain',
        path: wrongPath,
        producerTestId: 'quality/lint',
        role: 'run/log',
      },
    ],
    bundleId,
    criteria: [],
    environment: { node: '24.0.0', npm: '11.9.0', os: 'linux-x64' },
    evidenceSchemaVersion: '0.1-draft',
    execution,
    inputFixtureChecksums: { 'package-lock.json': artifactChecksum },
    intakeExecutions: [],
    profiles: [],
    redaction: { declared: true, statement: 'Hostile path fixture contains no secrets.' },
    review: { status: 'pending' },
    runs: [
      {
        artifactPaths: [wrongPath],
        command: 'npm run lint',
        endedAt: '2026-08-26T10:00:01Z',
        executionAttempt: 1,
        executionId: execution.id,
        exitStatus: 0,
        retryCount: 0,
        runId: `${execution.id}/run-001`,
        runner: execution.runner,
        startedAt: '2026-08-26T10:00:00Z',
        testId: 'quality/lint',
      },
    ],
    scope: {
      proofs: [
        {
          availableRunIds: [],
          class: 'manual-decision',
          criterionId: 'gate-a/01-artifact-vocabulary',
          manualProcedureId: 'gate-a/01-artifact-vocabulary-v1',
          missingRunIds: ['manual/gate-a-01-artifact-vocabulary-v1'],
          requiredRunIds: ['manual/gate-a-01-artifact-vocabulary-v1'],
          requiredSubjectIds: [],
          status: 'manual-input',
        },
      ],
      requestedCriteria: ['gate-a/01-artifact-vocabulary'],
    },
    source: {
      commit: candidateCommit,
      lockfileChecksums: { 'package-lock.json': artifactChecksum },
      repository: 'https://github.com/kumwe/studio',
      tree: candidateTree,
      workingTreeState: 'clean',
    },
    subjects: [],
    workPackage: 'M2-01',
  };
  await writeFile(join(pendingRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(
    intakePath,
    `${JSON.stringify(intakeDocument(bundleId, candidateCommit, candidateTree), null, 2)}\n`,
  );
  await assert.rejects(
    execFileAsync(
      process.execPath,
      [
        'scripts/assemble-evidence-bundle.mjs',
        '--pending',
        `${relativeRoot}/pending`,
        '--intake',
        `${relativeRoot}/intake.json`,
      ],
      { cwd: repositoryRoot },
    ),
    (error) => {
      assert.match(`${error.stderr ?? ''}`, /outside evidence\/bundles\/.*\/artifacts/u);
      return true;
    },
  );
});

function intakeDocument(bundleId, candidateCommit, candidateTree) {
  const pendingExecution = { attempt: 1, id: `local/${bundleId}`, runner: 'test/runner' };
  const execution = {
    attempt: 1,
    id: `local/${bundleId}/intake`,
    runner: 'test/intake-runner',
  };
  return {
    bundleId,
    candidateCommit,
    candidateTree,
    contractVersion: '1.0.0',
    entries: [
      {
        artifacts: [
          descriptor(bundleId, 'decision.json', 'manual/decision-record-v1'),
          descriptor(bundleId, 'observation.txt', 'manual/observation-v1', 'text/plain'),
          descriptor(bundleId, 'review.json', 'review/attestation-v1'),
          descriptor(
            bundleId,
            'review.json.sig',
            'review/signature-v1',
            'application/octet-stream',
          ),
        ],
        class: 'manual-decision',
        criterionId: 'gate-a/01-artifact-vocabulary',
        kind: 'manual',
        laneId: 'manual/gate-a-01-artifact-vocabulary-v1',
        runId: `${execution.id}/run-002`,
        verificationStartedAt: '2026-08-26T10:00:00Z',
      },
    ],
    execution,
    kind: 'studio-evidence-intake',
    pendingExecution,
    workPackage: 'M2-01',
  };
}

function descriptor(bundleId, name, role, mediaType = 'application/json') {
  return {
    checksum: emptyChecksum(),
    mediaType,
    role,
    sourcePath: `inputs/${name}`,
    targetPath: `evidence/bundles/${bundleId}/artifacts/${name}`,
  };
}

function emptyChecksum() {
  return 'sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=';
}

function git(...args) {
  return execFileSync('git', args, { cwd: repositoryRoot, encoding: 'utf8' }).trim();
}
