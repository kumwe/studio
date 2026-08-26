import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';

import {
  assertProducerDirectory,
  buildCycloneDxSbom,
  buildProducerContractIndex,
  buildProducerSubject,
  collectProducerArtifactFailures,
  collectProducerClosureFailures,
  CYCLONEDX_SCHEMA_ID,
  producerDocument,
  PRODUCER_OUTPUT_SCHEMA_ID,
  PRODUCER_SCENARIO_SETS,
  PRODUCER_TEST_REPORT_SPECS,
  renderEvidenceCommand,
  STUDIO_EVIDENCE_PACKAGE_NAMES,
  TYPESCRIPT_PRODUCER_COMMANDS,
} from '../producer-evidence.mjs';
import { buildCleanConsumerLockEvidence } from '../verify-staged-release.mjs';
import { collectOfficialCycloneDxFailures } from '../lib/cyclonedx-validation.mjs';
import {
  buildExpectedTypeScriptRuntimeInventory,
  TYPESCRIPT_COMPILER_DEPTH_BOUNDARIES,
  typeScriptRuntimeInventoryChecksum,
} from '../lib/typescript-evidence.mjs';

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
const candidateCommit = 'a'.repeat(40);
const schemaFiles = [
  'cyclonedx-sbom-v1.schema.json',
  'producer-contracts.schema.json',
  'producer-output-v1.schema.json',
];
const schemas = await Promise.all(
  schemaFiles.map(async (name) =>
    JSON.parse(await readFile(join(repositoryRoot, 'evidence', 'schema', name), 'utf8')),
  ),
);
const ajv = new Ajv2020({ allErrors: true, strict: true });
for (const schema of schemas) ajv.addSchema(schema);
const validateById = (schemaId, document) => ajv.getSchema(schemaId)?.(document) === true;
const producerRegistry = JSON.parse(
  await readFile(join(repositoryRoot, 'evidence', 'producer-contracts.json'), 'utf8'),
);
const producerRegistrySchema = schemas.find(({ $id }) => $id.includes('producer-contracts'));
const producerRegistryValidator = ajv.getSchema(producerRegistrySchema.$id);
const contractIndex = buildProducerContractIndex(producerRegistry, {
  schemaIds: new Set(schemas.map(({ $id }) => $id)),
});
const subject = await buildProducerSubject(repositoryRoot, candidateCommit);
const packageLock = JSON.parse(await readFile(join(repositoryRoot, 'package-lock.json'), 'utf8'));
const corpusManifest = JSON.parse(
  await readFile(join(repositoryRoot, 'packages/testkit/corpus-manifest.json'), 'utf8'),
);
const releaseRecord = JSON.parse(
  await readFile(join(repositoryRoot, 'studio-release.json'), 'utf8'),
);

test('producer registry is versioned, closed, and covers the fixed structured lane roles', () => {
  assert.equal(producerRegistryValidator(producerRegistry), true, producerRegistryValidator.errors);
  assert.deepEqual(contractIndex.failures, []);
  assert.equal(contractIndex.contractsByRole.size, 12);
  assert.deepEqual(
    [...contractIndex.contractsByLane.get('release/staged-registry-install')].map(
      ({ outputFile }) => outputFile,
    ),
    [
      'clean-consumer-lock.json',
      'provenance-set.json',
      'signature-audit.json',
      'staged-registry-report.json',
    ],
  );

  const changedRole = structuredClone(producerRegistry);
  changedRole.contracts[0].role = 'run/log';
  assert.ok(
    buildProducerContractIndex(changedRole, {
      schemaIds: new Set(schemas.map(({ $id }) => $id)),
    }).failures.some((failure) => failure.includes('run/log is generator-owned')),
  );

  const missingLane = structuredClone(producerRegistry);
  missingLane.contracts = missingLane.contracts.filter(
    ({ laneId }) => laneId !== 'lifecycle/contribution-runtime-v1',
  );
  assert.ok(
    buildProducerContractIndex(missingLane, {
      schemaIds: new Set(schemas.map(({ $id }) => $id)),
    }).failures.some((failure) => failure.includes('lacks its complete structured contract set')),
  );
});

test('producer output directories reject renamed, extra, and symlinked artifacts', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'studio-producer-directory-'));
  t.after(() => rm(root, { force: true, recursive: true }));
  const expected = ['report.json'];
  await writeFile(join(root, expected[0]), '{}\n');
  await assert.doesNotReject(assertProducerDirectory(root, expected));

  await writeFile(join(root, 'extra.json'), '{}\n');
  await assert.rejects(assertProducerDirectory(root, expected), /contain exactly report\.json/u);
  await rm(join(root, 'extra.json'));
  await rm(join(root, expected[0]));
  await writeFile(join(root, 'renamed.json'), '{}\n');
  await assert.rejects(assertProducerDirectory(root, expected), /contain exactly report\.json/u);
  await rm(join(root, 'renamed.json'));
  await mkdir(join(root, 'target'));
  await symlink(join(root, 'target'), join(root, expected[0]));
  await assert.rejects(assertProducerDirectory(root, expected), /regular files/u);
});

test('structured reports reject arbitrary bytes and producer, role, scenario, or candidate substitution', async () => {
  const role = 'lifecycle/contribution-report-v1';
  const producerTestId = 'lifecycle/contribution-runtime-v1';
  const requiredScenarios = [...PRODUCER_SCENARIO_SETS[role]];
  const files = [...PRODUCER_TEST_REPORT_SPECS[role].files];
  const document = producerDocument(role, producerTestId, subject, {
    command: renderEvidenceCommand('./node_modules/.bin/vitest', [
      'run',
      ...files,
      '--coverage.enabled=false',
      '--reporter=json',
    ]),
    files,
    observedTests: requiredScenarios.map((scenario) => `passes ${scenario}`),
    passed: requiredScenarios.length,
    requiredScenarios,
    total: requiredScenarios.length,
  });
  const artifact = {
    mediaType: 'application/json',
    path: 'evidence/bundles/bundle/artifacts/01-contribution-report.json',
    producerTestId,
    role,
  };
  const context = producerContext();
  assert.deepEqual(
    await collectProducerArtifactFailures(artifact, canonicalBytes(document), context),
    [],
  );
  assert.ok(
    (await collectProducerArtifactFailures(artifact, Buffer.from('not-json\n'), context)).some(
      (failure) => failure.includes('not valid JSON'),
    ),
  );

  for (const mutate of [
    (copy) => {
      copy.producerTestId = 'quality/lint';
    },
    (copy) => {
      copy.role = 'integration/reference-host-report-v1';
    },
    (copy) => {
      copy.result.requiredScenarios.pop();
    },
    (copy) => {
      copy.result.command = 'node substituted.mjs';
    },
    (copy) => {
      copy.subject.candidateCommit = 'b'.repeat(40);
    },
  ]) {
    const changed = structuredClone(document);
    mutate(changed);
    assert.notDeepEqual(
      await collectProducerArtifactFailures(artifact, canonicalBytes(changed), context),
      [],
    );
  }
});

test('CycloneDX output is deterministic, production-only, and exact-candidate bound', async () => {
  const cleanConsumerLock = cleanConsumerLockFixture();
  const first = buildCycloneDxSbom(cleanConsumerLock, subject);
  const second = buildCycloneDxSbom(structuredClone(cleanConsumerLock), structuredClone(subject));
  assert.deepEqual(first, second);
  assert.equal(validateById(CYCLONEDX_SCHEMA_ID, first), true);
  assert.deepEqual(await collectOfficialCycloneDxFailures(first), []);
  assert.ok(first.components.length >= 8);
  for (const mutate of [
    (copy) => {
      copy.components = copy.components.filter(({ name }) => name !== '@kumwe/studio-renderer-web');
      copy.dependencies = copy.dependencies.filter(
        ({ ref }) => !ref.includes('studio-renderer-web'),
      );
    },
    (copy) => {
      copy.components[0].purl = 'pkg:npm/substituted@9.9.9';
    },
    (copy) => {
      copy.dependencies.pop();
    },
    (copy) => {
      copy.packages[0].integrity = sha512Integrity(99);
    },
  ]) {
    const changedGraph = structuredClone(cleanConsumerLock);
    mutate(changedGraph);
    assert.throws(() => buildCycloneDxSbom(changedGraph, subject), /graph is invalid/u);
  }
  assert.ok(
    first.components.every(({ name }) => name !== 'dev-only'),
    'dev-only dependencies must not enter the retained production graph',
  );
  const artifact = {
    mediaType: 'application/vnd.cyclonedx+json',
    path: 'evidence/bundles/bundle/artifacts/01-studio-family.cdx.json',
    producerTestId: 'release/sbom-v1',
    role: 'release/cyclonedx-sbom-v1',
  };
  assert.deepEqual(
    await collectProducerArtifactFailures(artifact, canonicalBytes(first), producerContext()),
    [],
  );
  const changed = structuredClone(first);
  changed.metadata.properties.find(({ name }) => name === 'kumwe:evidence:candidate-commit').value =
    'b'.repeat(40);
  assert.ok(
    (
      await collectProducerArtifactFailures(artifact, canonicalBytes(changed), producerContext())
    ).some((failure) => failure.includes('exact bundle execution subject')),
  );
});

test('TypeScript evidence validation uses the candidate-source corpus inventory', async () => {
  const paths = buildExpectedTypeScriptRuntimeInventory(corpusManifest);
  const documents = paths.map((path) => ({
    classification: TYPESCRIPT_COMPILER_DEPTH_BOUNDARIES.includes(path)
      ? 'compiler-depth-boundary'
      : 'assignable',
    path,
  }));
  const role = 'portability/corpus-replay-v1';
  const producerTestId = 'portability/typescript-corpus-v2';
  const document = producerDocument(role, producerTestId, subject, {
    assignableDocuments: documents.filter(({ classification }) => classification === 'assignable')
      .length,
    command: renderEvidenceCommand(...TYPESCRIPT_PRODUCER_COMMANDS[1]),
    compilerDepthBoundaries: documents
      .filter(({ classification }) => classification === 'compiler-depth-boundary')
      .map(({ path }) => path),
    inventoryChecksum: typeScriptRuntimeInventoryChecksum(documents),
    runtimeCommand: renderEvidenceCommand(...TYPESCRIPT_PRODUCER_COMMANDS[2]),
    schemaValidatedRoundTrips: documents.length,
  });
  const artifact = {
    mediaType: 'application/json',
    path: 'evidence/bundles/bundle/artifacts/typescript-corpus.json',
    producerTestId,
    role,
  };
  assert.deepEqual(
    await collectProducerArtifactFailures(artifact, canonicalBytes(document), producerContext()),
    [],
  );
  const priorCandidateCorpus = structuredClone(corpusManifest);
  priorCandidateCorpus.groups.find(({ path }) => path === 'fixtures').files.pop();
  assert.ok(
    (
      await collectProducerArtifactFailures(artifact, canonicalBytes(document), {
        ...producerContext(),
        corpusManifest: priorCandidateCorpus,
      })
    ).some((failure) => failure.includes('exact source inventory')),
  );
});

test('release-family closure rejects an incomplete family and staged byte substitution', () => {
  const approvedPackages = STUDIO_EVIDENCE_PACKAGE_NAMES.map((name, index) =>
    packageArtifact(name, index),
  );
  const approved = producerDocument(
    'release/approved-family-v1',
    'release/reproducible-family-v1',
    subject,
    {
      packages: approvedPackages,
    },
  );
  const staged = producerDocument(
    'release/staged-registry-report-v1',
    'release/staged-registry-install',
    subject,
    {
      cleanConsumer: true,
      coordinate: subject.release,
      packages: approvedPackages.map(({ integrity, name, shasum, version }) => ({
        integrity,
        name,
        shasum,
        version,
      })),
      provenanceVerified: true,
      signaturesVerified: true,
      stagingTag: `studio-stage-${subject.release.replaceAll('.', '-').replaceAll(/[^a-z0-9-]/gu, '-')}`,
    },
  );
  assert.deepEqual(
    collectProducerClosureFailures(
      new Map([
        [approved.role, approved],
        [staged.role, staged],
      ]),
    ),
    [],
  );
  staged.result.packages[0].integrity = sha512Integrity(99);
  assert.ok(
    collectProducerClosureFailures(
      new Map([
        [approved.role, approved],
        [staged.role, staged],
      ]),
    ).some((failure) => failure.includes('approved candidate bytes')),
  );

  const incomplete = structuredClone(approved);
  incomplete.result.packages.pop();
  assert.equal(validateById(PRODUCER_OUTPUT_SCHEMA_ID, incomplete), false);
});

test('clean-consumer projection requires the exact eight registry packages and root pins', () => {
  const packages = {
    '': { dependencies: structuredClone(releaseRecord.packages) },
  };
  for (const [index, name] of STUDIO_EVIDENCE_PACKAGE_NAMES.entries()) {
    packages[`node_modules/${name}`] = {
      integrity: sha512Integrity(index),
      resolved: `https://registry.npmjs.org/${name}/-/${name.slice(name.indexOf('/') + 1)}-${releaseRecord.packages[name]}.tgz`,
      version: releaseRecord.packages[name],
    };
  }
  const lockfile = { lockfileVersion: 3, packages };
  const projection = buildCleanConsumerLockEvidence(lockfile, releaseRecord);
  assert.equal(projection.packages.length, 8);
  const missing = structuredClone(lockfile);
  missing.packages = Object.fromEntries(
    Object.entries(missing.packages).filter(
      ([path]) => path !== `node_modules/${STUDIO_EVIDENCE_PACKAGE_NAMES[0]}`,
    ),
  );
  assert.throws(
    () => buildCleanConsumerLockEvidence(missing, releaseRecord),
    /lacks exact registry metadata/u,
  );
  const drifted = structuredClone(lockfile);
  drifted.packages[''].dependencies[STUDIO_EVIDENCE_PACKAGE_NAMES[0]] = '9.9.9';
  assert.throws(
    () => buildCleanConsumerLockEvidence(drifted, releaseRecord),
    /does not bind the exact candidate family roots/u,
  );
});

function canonicalBytes(document) {
  return Buffer.from(`${JSON.stringify(document, null, 2)}\n`);
}

function packageArtifact(name, index) {
  return {
    integrity: sha512Integrity(index),
    name,
    sha512: Buffer.alloc(64, index).toString('hex'),
    shasum: Buffer.alloc(20, index).toString('hex'),
    size: index + 1,
    version: subject.packages[name],
  };
}

function producerContext() {
  return {
    bundleId: subject.bundleId,
    candidateCommit,
    candidateTree: subject.candidateTree,
    corpusManifest,
    contractIndex,
    execution: subject.execution,
    inputFixtureChecksums: {
      'packages/protocol/schemas/manifest.json': subject.protocolSchemaManifestChecksum,
      'packages/testkit/corpus-manifest.json': subject.corpusManifestChecksum,
      'studio-release.json': subject.releaseRecordChecksum,
    },
    packageLock,
    packageVersions: subject.packages,
    repositoryRoot,
    validateSchema: validateById,
    workPackage: subject.workPackage,
  };
}

function cleanConsumerLockFixture() {
  const packages = {
    '': { dependencies: structuredClone(releaseRecord.packages) },
  };
  for (const [index, name] of STUDIO_EVIDENCE_PACKAGE_NAMES.entries()) {
    packages[`node_modules/${name}`] = {
      ...(name === '@kumwe/studio-core' ? { dependencies: { production: '1.0.0' } } : {}),
      integrity: sha512Integrity(index),
      resolved: `https://registry.npmjs.org/${name}/-/${name.slice(name.indexOf('/') + 1)}-${releaseRecord.packages[name]}.tgz`,
      version: releaseRecord.packages[name],
    };
  }
  packages['node_modules/production'] = {
    integrity: sha512Integrity(80),
    resolved: 'https://registry.npmjs.org/production/-/production-1.0.0.tgz',
    version: '1.0.0',
  };
  packages['node_modules/dev-only'] = {
    dev: true,
    integrity: sha512Integrity(81),
    resolved: 'https://registry.npmjs.org/dev-only/-/dev-only-2.0.0.tgz',
    version: '2.0.0',
  };
  return buildCleanConsumerLockEvidence({ lockfileVersion: 3, packages }, releaseRecord);
}

function sha512Integrity(index) {
  return `sha512-${Buffer.alloc(64, index).toString('base64')}`;
}
