import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import {
  buildCriterionIndex,
  checksumFile,
  collectBundleFailures,
  collectChecksumMapFailures,
  collectGateRecordFailures,
  REQUIRED_EVIDENCE_INPUTS,
  REQUIRED_EVIDENCE_LANES,
} from '../evidence-validation.mjs';

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
const registry = JSON.parse(
  await readFile(`${repositoryRoot}/evidence/gate-criteria.json`, 'utf8'),
);
const criterionIndex = buildCriterionIndex(registry);
const SOURCE_COMMIT = 'a'.repeat(40);
const NOW = Date.parse('2026-08-24T12:00:00Z');

test('criterion registry is schema-valid, stable, unique, and matches roadmap order', async () => {
  const schema = JSON.parse(
    await readFile(`${repositoryRoot}/evidence/schema/gate-criteria.schema.json`, 'utf8'),
  );
  const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema);
  assert.equal(validate(registry), true, JSON.stringify(validate.errors));
  assert.deepEqual(criterionIndex.failures, []);
  assert.equal(registry.gates.A.length, 14);
  assert.equal(registry.gates.B.length, 18);
  assert.equal(criterionIndex.criteriaById.size, 32);

  const roadmap = await readFile(`${repositoryRoot}/docs/roadmap/README.md`, 'utf8');
  const roadmapIds = [...roadmap.matchAll(/\*\*`(gate-[ab]\/[^`]+)`\*\*/gu)].map(
    (match) => match[1],
  );
  assert.deepEqual(
    roadmapIds,
    [...registry.gates.A, ...registry.gates.B].map((criterion) => criterion.id),
  );
});

test('a complete pending bundle is authentic but categorically cannot support a gate', async (t) => {
  const fixture = await createBundleFixture(t);
  assert.deepEqual(await collectBundleFailures(fixture.manifest, fixture.context), []);

  const gate = createPassingGate(fixture.artifactChecksum);
  const pendingBundle = createGateBundle('pending');
  const failures = await collectGateRecordFailures(gate, 'gate-a.json', {
    ...fixture.context,
    bundlesById: new Map([['bundle-one', pendingBundle]]),
    registry,
  });
  assert.ok(failures.includes('bundle bundle-one has not been independently reproduced'));
});

test('bundle authenticity rejects retries, artifact-map drift, and stale review', async (t) => {
  const fixture = await createBundleFixture(t);
  const manifest = structuredClone(fixture.manifest);
  manifest.runs[0].retryCount = 1;
  manifest.artifactChecksums[manifest.artifacts[0].path] = `sha256-${'A'.repeat(43)}=`;
  manifest.review = {
    freshnessExpiresAt: '2026-08-24T11:00:00Z',
    reviewedAt: '2026-08-24T10:00:00Z',
    reviewer: { identity: 'human/reviewer', kind: 'human' },
    status: 'reproduced',
  };
  const failures = await collectBundleFailures(manifest, fixture.context);
  assert.ok(failures.some((failure) => failure.includes('flaky evidence is failing evidence')));
  assert.ok(failures.some((failure) => failure.includes('does not match artifactChecksums')));
  assert.ok(failures.includes('reviewed evidence has expired'));
});

test('checksum validation rejects repository escape, symlinks, and byte drift', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'studio-evidence-paths-'));
  t.after(() => rm(root, { force: true, recursive: true }));
  const outside = await mkdtemp(join(tmpdir(), 'studio-evidence-outside-'));
  t.after(() => rm(outside, { force: true, recursive: true }));
  await writeFile(join(root, 'inside.txt'), 'inside');
  await writeFile(join(outside, 'outside.txt'), 'outside');
  await symlink(join(outside, 'outside.txt'), join(root, 'linked.txt'));
  const failures = [];
  await collectChecksumMapFailures(
    failures,
    'testChecksums',
    {
      '../outside.txt': await checksumFile(join(outside, 'outside.txt')),
      'inside.txt': `sha256-${'A'.repeat(43)}=`,
      'linked.txt': await checksumFile(join(outside, 'outside.txt')),
    },
    root,
  );
  assert.ok(failures.some((failure) => failure.includes('escapes the repository')));
  assert.ok(failures.some((failure) => failure.includes('not sha256-')));
  assert.ok(failures.some((failure) => failure.includes('non-symlink file')));
});

test('fabricated and incomplete gate records fail with stable diagnostics', async (t) => {
  const fixture = await createBundleFixture(t);
  const gate = createPassingGate(fixture.artifactChecksum);
  gate.sourceCommit = '0'.repeat(40);
  gate.criteria[0].evidenceBundleIds = ['does-not-exist'];
  gate.evidenceBundleIds = ['does-not-exist'];
  const failures = await collectGateRecordFailures(gate, 'gate-a.json', {
    ...fixture.context,
    bundlesById: new Map(),
    registry,
  });
  assert.ok(failures.some((failure) => failure.includes('is not reachable')));
  assert.ok(failures.some((failure) => failure.includes('links nonexistent bundle')));
  assert.ok(failures.some((failure) => failure.includes('lacks contract evidence')));
});

test('gate validation rejects samples, source mismatch, stale review, missing classes, and high defects', async (t) => {
  const fixture = await createBundleFixture(t);
  const gate = createPassingGate(fixture.artifactChecksum);
  const bundle = createGateBundle('reproduced');
  bundle.source.commit = 'b'.repeat(40);
  bundle.review.freshnessExpiresAt = '2026-08-24T11:00:00Z';
  bundle.criteria = bundle.criteria.filter(
    (item) =>
      !(
        item.criterionId === registry.gates.A[0].id &&
        item.class === registry.gates.A[0].evidenceClasses[0]
      ),
  );
  gate.criteria[0].evidenceBundleIds = ['SAMPLE-forbidden', 'bundle-one'];
  gate.evidenceBundleIds = ['SAMPLE-forbidden', 'bundle-one'];
  gate.unresolvedDefects.push({
    id: 'DEFECT-1',
    rationale: 'Unresolved contract contradiction.',
    severity: 'high',
  });
  const failures = await collectGateRecordFailures(gate, 'gate-a.json', {
    ...fixture.context,
    bundlesById: new Map([['bundle-one', bundle]]),
    registry,
  });
  assert.ok(failures.some((failure) => failure.includes('forbidden sample bundle')));
  assert.ok(failures.some((failure) => failure.includes('does not describe gate sourceCommit')));
  assert.ok(failures.some((failure) => failure.includes('outside its freshness window')));
  assert.ok(failures.some((failure) => failure.includes('lacks contract evidence')));
  assert.ok(failures.some((failure) => failure.includes('unresolved critical or high defect')));
});

test('a complete multi-criterion Gate A record passes semantic validation', async (t) => {
  const fixture = await createBundleFixture(t);
  const gate = createPassingGate(fixture.artifactChecksum);
  const failures = await collectGateRecordFailures(gate, 'gate-a.json', {
    ...fixture.context,
    bundlesById: new Map([['bundle-one', createGateBundle('reproduced')]]),
    registry,
  });
  assert.deepEqual(failures, []);
});

test('workflow evidence boundaries remain immutable and input-safe', async () => {
  for (const workflowName of ['evidence-bundle.yml', 'release.yml']) {
    const workflow = await readFile(`${repositoryRoot}/.github/workflows/${workflowName}`, 'utf8');
    for (const match of workflow.matchAll(/^\s*uses:\s*([^\s]+)$/gmu)) {
      assert.match(match[1], /@[a-f0-9]{40}$/u, `${workflowName}: ${match[1]} is not pinned`);
    }
    assert.match(workflow, /persist-credentials: false/u);
    assert.match(workflow, /timeout-minutes:/u);
    assertNoInputExpressionInRunBlocks(workflowName, workflow);
  }
  const evidenceWorkflow = await readFile(
    `${repositoryRoot}/.github/workflows/evidence-bundle.yml`,
    'utf8',
  );
  assert.match(evidenceWorkflow, /playwright install --with-deps chromium/u);
  assert.match(evidenceWorkflow, /path: \$\{\{ steps\.bundle\.outputs\.bundle_path \}\}/u);
  assert.doesNotMatch(evidenceWorkflow, /^\s+bundle_id:/mu);
  assert.doesNotMatch(evidenceWorkflow, /path: evidence\/bundles\/$/mu);

  const releaseWorkflow = await readFile(`${repositoryRoot}/.github/workflows/release.yml`, 'utf8');
  assert.match(releaseWorkflow, /ref: \$\{\{ inputs\.gate_record_sha \}\}/u);
  assert.match(releaseWorkflow, /sparse-checkout: evidence/u);
});

async function createBundleFixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'studio-evidence-bundle-'));
  t.after(() => rm(root, { force: true, recursive: true }));
  for (const path of REQUIRED_EVIDENCE_INPUTS) {
    await mkdir(join(root, path, '..'), { recursive: true });
    await writeFile(join(root, path), `${path}\n`);
  }
  const artifactPath = 'evidence/bundles/bundle-one/artifacts/lane.log';
  await mkdir(join(root, artifactPath, '..'), { recursive: true });
  await writeFile(join(root, artifactPath), 'green\n');
  const artifactChecksum = await checksumFile(join(root, artifactPath));
  const inputFixtureChecksums = Object.fromEntries(
    await Promise.all(
      REQUIRED_EVIDENCE_INPUTS.map(async (path) => [path, await checksumFile(join(root, path))]),
    ),
  );
  const runs = REQUIRED_EVIDENCE_LANES.map((testId, index) => ({
    command: `node lane-${index}.mjs`,
    endedAt: `2026-08-24T09:${String(index).padStart(2, '0')}:01Z`,
    exitStatus: 0,
    retryCount: 0,
    runner: 'ci/runner',
    startedAt: `2026-08-24T09:${String(index).padStart(2, '0')}:00Z`,
    testId,
  }));
  const manifest = {
    artifactChecksums: { [artifactPath]: artifactChecksum },
    artifacts: [{ checksum: artifactChecksum, mediaType: 'text/plain', path: artifactPath }],
    bundleId: 'bundle-one',
    criteria: [
      {
        class: registry.gates.A[0].evidenceClasses[0],
        criterionId: registry.gates.A[0].id,
        outcome: 'positive',
      },
    ],
    environment: {
      browser: 'Chromium-141.0.0.0',
      node: '24.6.0',
      npm: '11.9.0',
      os: 'linux-x64',
      packageVersions: { '@kumwe/studio-core': '1.0.0' },
    },
    evidenceSchemaVersion: '0.1-draft',
    inputFixtureChecksums,
    profiles: [],
    redaction: { declared: true, statement: 'No secrets.' },
    review: { status: 'pending' },
    runs,
    source: {
      commit: SOURCE_COMMIT,
      lockfileChecksums: { 'package-lock.json': inputFixtureChecksums['package-lock.json'] },
      repository: 'https://github.com/kumwe/studio',
      workingTreeState: 'clean',
    },
  };
  const context = {
    ...criterionIndex,
    getCommitTime: () => Date.parse('2026-08-24T08:00:00Z'),
    isCommitReachable: (commit) => commit === SOURCE_COMMIT,
    now: NOW,
    packageVersions: { '@kumwe/studio-core': '1.0.0' },
    repositoryRoot: root,
  };
  return { artifactChecksum, context, manifest };
}

function createGateBundle(reviewStatus) {
  return {
    bundleId: 'bundle-one',
    criteria: registry.gates.A.flatMap((criterion) =>
      criterion.evidenceClasses.map((evidenceClass) => ({
        class: evidenceClass,
        criterionId: criterion.id,
        outcome: 'positive',
      })),
    ),
    profiles: [...registry.profileVocabulary],
    review:
      reviewStatus === 'pending'
        ? { status: 'pending' }
        : {
            freshnessExpiresAt: '2026-09-24T10:00:00Z',
            reviewedAt: '2026-08-24T10:00:00Z',
            reviewer: { identity: 'human/bundle-reviewer', kind: 'human' },
            status: 'reproduced',
          },
    source: { commit: SOURCE_COMMIT },
  };
}

function createPassingGate(artifactChecksum) {
  return {
    artifactHashes: {
      'evidence/bundles/bundle-one/artifacts/lane.log': artifactChecksum,
    },
    compatibilityStatement: 'No compatibility claim is waived.',
    criteria: registry.gates.A.map((criterion) => ({
      criterionId: criterion.id,
      evidenceBundleIds: ['bundle-one'],
      outcome: 'met',
    })),
    decidedAt: '2026-08-24T11:00:00Z',
    decision: 'pass',
    evidenceSchemaVersion: '0.1-draft',
    evidenceBundleIds: ['bundle-one'],
    excludedProfiles: [],
    gate: 'A',
    reviewers: [
      {
        identity: 'human/domain-reviewer',
        independent: true,
        kind: 'human',
        roles: ['accessibility', 'compatibility', 'data-integrity', 'security'],
      },
      {
        identity: 'human/general-reviewer',
        independent: false,
        kind: 'human',
        roles: ['general'],
      },
    ],
    signOff: {
      accessibility: 'human/domain-reviewer',
      compatibility: 'human/domain-reviewer',
      dataIntegrity: 'human/domain-reviewer',
      security: 'human/domain-reviewer',
    },
    sourceCommit: SOURCE_COMMIT,
    supportedProfiles: [...registry.profileVocabulary],
    unresolvedDefects: [],
  };
}

function assertNoInputExpressionInRunBlocks(workflowName, workflow) {
  const lines = workflow.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^(\s*)run:\s*(.*)$/u.exec(lines[index]);
    if (match === null) {
      continue;
    }
    assert.doesNotMatch(match[2], /\$\{\{\s*inputs\./u, workflowName);
    const indentation = match[1].length;
    for (index += 1; index < lines.length; index += 1) {
      const line = lines[index];
      if (line.trim().length > 0 && line.search(/\S/u) <= indentation) {
        index -= 1;
        break;
      }
      assert.doesNotMatch(line, /\$\{\{\s*inputs\./u, workflowName);
    }
  }
}
