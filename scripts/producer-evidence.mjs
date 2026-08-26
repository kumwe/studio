import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

import { EVIDENCE_LANES, evidenceLane, renderEvidenceCommand } from './evidence-lanes.mjs';
import { STUDIO_RELEASE_PACKAGE_NAMES } from './release-family.mjs';
import { assertCoordinatedRelease } from './release-record.mjs';
import { stagingTagForVersion } from './staged-publish.mjs';
import { collectOfficialCycloneDxFailures } from './lib/cyclonedx-validation.mjs';
import {
  buildExpectedTypeScriptRuntimeInventory,
  TYPESCRIPT_COMPILER_DEPTH_BOUNDARIES,
  typeScriptRuntimeInventoryChecksum,
} from './lib/typescript-evidence.mjs';

export { renderEvidenceCommand } from './evidence-lanes.mjs';

export const PRODUCER_SCHEMA_VERSION = '1.0.0';
export const PRODUCER_OUTPUT_SCHEMA_ID =
  'https://schemas.kumwe.org/studio/evidence/producer-output-v1.schema.json';
export const CYCLONEDX_SCHEMA_ID =
  'https://schemas.kumwe.org/studio/evidence/cyclonedx-sbom-v1.schema.json';
export const PRODUCER_SUBJECT_PATHS = Object.freeze({
  corpusManifestChecksum: 'packages/testkit/corpus-manifest.json',
  protocolSchemaManifestChecksum: 'packages/protocol/schemas/manifest.json',
  releaseRecordChecksum: 'studio-release.json',
});

const canonicalRepository = 'https://github.com/kumwe/studio';
const familyNames = Object.freeze([...STUDIO_RELEASE_PACKAGE_NAMES].sort());
const scenarioSets = Object.freeze({
  'integration/media-rich-text-report-v1': Object.freeze([
    'canonical-rich-text-round-trip',
    'host-media-browse-and-select',
    'host-media-upload-cancel-retry',
    'safe-html-hostile-input',
    'strict-csp-editor-boundary',
  ]),
  'integration/reference-host-report-v1': Object.freeze([
    'deadline-and-disconnect-mapping',
    'generation-invalidation',
    'malformed-response-refusal',
    'model-and-resource-transport',
    'save-conflict-recovery',
  ]),
  'lifecycle/contribution-report-v1': Object.freeze([
    'activation-atomicity',
    'disable-diagnostics',
    'immutable-generation',
    'non-block-contribution-lifecycle',
    'trust-revocation',
    'upgrade-and-rollback',
  ]),
});
const testReportSpecs = Object.freeze({
  'integration/media-rich-text-report-v1': Object.freeze({
    files: Object.freeze([
      'packages/media/test/media-field.test.ts',
      'packages/media/test/upload-controller.test.ts',
      'packages/rich-text/test/authoring-foundation.test.ts',
      'packages/rich-text/test/projection-conformance.test.ts',
      'packages/rich-text/test/strict-csp-surface.test.ts',
      'packages/testkit/test/media-import-policy.test.ts',
    ]),
    laneId: 'integration/media-rich-text-v1',
  }),
  'integration/reference-host-report-v1': Object.freeze({
    files: Object.freeze([
      'packages/testkit/test/host-sequence-vectors.test.ts',
      'packages/testkit/test/host-testbed.test.ts',
      'packages/testkit/test/http-transport.test.ts',
      'packages/testkit/test/session-lifecycle.test.ts',
    ]),
    laneId: 'integration/reference-host-http-v1',
  }),
  'lifecycle/contribution-report-v1': Object.freeze({
    files: Object.freeze([
      'packages/core/test/contributions.test.ts',
      'packages/core/test/extension-sdk.test.ts',
      'packages/core/test/migrations.test.ts',
      'packages/testkit/test/session-lifecycle.test.ts',
    ]),
    laneId: 'lifecycle/contribution-runtime-v1',
  }),
});
const typescriptCommands = Object.freeze([
  Object.freeze(['npm', Object.freeze(['run', 'protocol:models:check'])]),
  Object.freeze([
    'node',
    Object.freeze([
      '--test',
      'scripts/test/typescript-model-generator.test.mjs',
      'scripts/test/typescript-corpus-assignability.test.mjs',
    ]),
  ]),
  Object.freeze([
    './node_modules/.bin/vitest',
    Object.freeze([
      'run',
      'packages/protocol/test/generated-models.test.ts',
      '--coverage.enabled=false',
      '--reporter=json',
    ]),
  ]),
]);

export function checksumIntegrity(bytes) {
  return `sha256-${createHash('sha256').update(bytes).digest('base64')}`;
}

export function buildProducerContractIndex(registry, { schemaIds = new Set() } = {}) {
  const contractsByLane = new Map();
  const contractsByRole = new Map();
  const failures = [];
  if (
    registry?.contractVersion !== PRODUCER_SCHEMA_VERSION ||
    registry?.kind !== 'studio-evidence-producer-contract-registry' ||
    !Array.isArray(registry?.contracts) ||
    Object.keys(registry ?? {})
      .sort()
      .join('\n') !== 'contractVersion\ncontracts\nkind'
  ) {
    return {
      contractsByLane,
      contractsByRole,
      failures: ['producer contract registry has an invalid closed shape'],
    };
  }
  const outputFiles = new Set();
  for (const contract of registry.contracts) {
    if (
      contract === null ||
      typeof contract !== 'object' ||
      Array.isArray(contract) ||
      Object.keys(contract).sort().join('\n') !== 'laneId\nmediaType\noutputFile\nrole\nschemaId'
    ) {
      failures.push('producer contract entry has an invalid closed shape');
      continue;
    }
    if (contractsByRole.has(contract.role)) {
      failures.push(`producer artifact role ${String(contract.role)} is duplicated`);
      continue;
    }
    if (contract.role === 'run/log') {
      failures.push('run/log is generator-owned and cannot be a structured producer contract');
      continue;
    }
    if (outputFiles.has(`${contract.laneId}\0${contract.outputFile}`)) {
      failures.push(
        `producer lane ${String(contract.laneId)} duplicates output ${String(contract.outputFile)}`,
      );
      continue;
    }
    const lane = evidenceLane(contract.laneId);
    if (lane === undefined) {
      failures.push(`producer contract ${String(contract.role)} names an unregistered lane`);
    } else if (lane.availability !== 'executable') {
      failures.push(
        `producer contract ${String(contract.role)} names non-executable lane ${contract.laneId}`,
      );
    } else if (!lane.artifactRoles.includes(contract.role)) {
      failures.push(
        `producer contract ${String(contract.role)} is outside lane ${String(contract.laneId)}`,
      );
    }
    if (schemaIds.size > 0 && !schemaIds.has(contract.schemaId)) {
      failures.push(`producer contract ${String(contract.role)} names an unavailable schema`);
    }
    contractsByRole.set(contract.role, Object.freeze({ ...contract }));
    outputFiles.add(`${contract.laneId}\0${contract.outputFile}`);
    const laneContracts = contractsByLane.get(contract.laneId) ?? [];
    laneContracts.push(Object.freeze({ ...contract }));
    contractsByLane.set(contract.laneId, laneContracts);
  }
  for (const [laneId, contracts] of contractsByLane) {
    contracts.sort((left, right) => left.outputFile.localeCompare(right.outputFile, 'en'));
    contractsByLane.set(laneId, Object.freeze(contracts));
    const registeredRoles = evidenceLane(laneId).artifactRoles.filter((role) => role !== 'run/log');
    const contractRoles = contracts.map(({ role }) => role);
    if (!sameMembers(registeredRoles, contractRoles)) {
      failures.push(`producer lane ${laneId} structured roles drifted from its contracts`);
    }
  }
  for (const [laneId, registered] of Object.entries(EVIDENCE_LANES)) {
    if (registered.availability !== 'executable') continue;
    const registeredRoles = registered.artifactRoles.filter((role) => role !== 'run/log');
    if (registeredRoles.length === 0) continue;
    const contractRoles = (contractsByLane.get(laneId) ?? []).map(({ role }) => role);
    if (!sameMembers(registeredRoles, contractRoles)) {
      failures.push(
        `executable producer lane ${laneId} lacks its complete structured contract set`,
      );
    }
  }
  return { contractsByLane, contractsByRole, failures };
}

export async function buildProducerSubject(
  repositoryRoot,
  candidateCommit,
  identity = {
    bundleId: 'test-bundle',
    candidateTree: candidateCommit,
    execution: {
      attempt: 1,
      id: 'test/execution',
      runId: 'test/execution/run-001',
      runner: 'test',
    },
    workPackage: 'M1-01',
  },
) {
  if (!/^[a-f0-9]{40}$/u.test(candidateCommit)) {
    throw new Error('Structured evidence requires an exact lowercase candidate commit.');
  }
  const releaseRecordBytes = await readFile(join(repositoryRoot, 'studio-release.json'));
  const releaseRecord = JSON.parse(releaseRecordBytes);
  assertCoordinatedRelease(releaseRecord);
  return {
    bundleId: identity.bundleId,
    candidateCommit,
    candidateTree: identity.candidateTree,
    corpusManifestChecksum: checksumIntegrity(
      await readFile(join(repositoryRoot, PRODUCER_SUBJECT_PATHS.corpusManifestChecksum)),
    ),
    execution: identity.execution,
    packages: Object.fromEntries(familyNames.map((name) => [name, releaseRecord.packages[name]])),
    protocolSchemaManifestChecksum: checksumIntegrity(
      await readFile(join(repositoryRoot, PRODUCER_SUBJECT_PATHS.protocolSchemaManifestChecksum)),
    ),
    release: releaseRecord.release,
    releaseRecordChecksum: checksumIntegrity(releaseRecordBytes),
    repository: canonicalRepository,
    workPackage: identity.workPackage,
  };
}

export async function loadProducerRuntime(repositoryRoot, laneId) {
  if (process.env.STUDIO_EVIDENCE_PRODUCER_TEST_ID !== laneId) {
    throw new Error(`Producer ${laneId} must run through create-evidence-bundle.mjs.`);
  }
  const candidateCommit = process.env.STUDIO_EVIDENCE_CANDIDATE_SHA;
  const registry = JSON.parse(
    await readFile(join(repositoryRoot, 'evidence', 'producer-contracts.json'), 'utf8'),
  );
  const contractIndex = buildProducerContractIndex(registry);
  if (contractIndex.failures.length > 0) {
    throw new Error(
      `Producer contract registry is invalid:\n- ${contractIndex.failures.join('\n- ')}`,
    );
  }
  const identity = {
    bundleId: process.env.STUDIO_EVIDENCE_BUNDLE_ID,
    candidateTree: process.env.STUDIO_EVIDENCE_CANDIDATE_TREE,
    execution: {
      attempt: Number(process.env.STUDIO_EVIDENCE_EXECUTION_ATTEMPT),
      id: process.env.STUDIO_EVIDENCE_EXECUTION_ID,
      runId: process.env.STUDIO_EVIDENCE_RUN_ID,
      runner: process.env.STUDIO_EVIDENCE_RUNNER,
    },
    workPackage: process.env.STUDIO_EVIDENCE_WORK_PACKAGE,
  };
  const subject = await buildProducerSubject(repositoryRoot, candidateCommit, identity);
  return {
    contractIndex,
    subject,
    async write(role, result) {
      return writeProducerOutput({
        contractIndex,
        document: producerDocument(role, laneId, subject, result),
      });
    },
    async writeRaw(role, document) {
      return writeProducerOutput({
        contractIndex,
        document,
        producerTestId: laneId,
        role,
        subject,
      });
    },
  };
}

export async function writeProducerOutput({
  contractIndex,
  document,
  outputDirectory = process.env.STUDIO_EVIDENCE_OUTPUT_DIR,
  producerTestId = document?.producerTestId,
  role = document?.role,
  subject = document?.subject,
}) {
  const contract = contractIndex.contractsByRole.get(role);
  if (contract === undefined) {
    throw new Error(`No producer contract exists for ${String(role)}.`);
  }
  assertProducerEnvironment(contract, { producerTestId, role, subject }, outputDirectory);
  try {
    await mkdir(outputDirectory, { recursive: false, mode: 0o700 });
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
    const outputStat = await lstat(outputDirectory);
    if (!outputStat.isDirectory() || outputStat.isSymbolicLink()) {
      throw new Error('Producer output location is not a regular directory.', { cause: error });
    }
  }
  const outputPath = join(outputDirectory, contract.outputFile);
  await writeFile(outputPath, `${JSON.stringify(document, null, 2)}\n`, {
    flag: 'wx',
    mode: 0o600,
  });
  return outputPath;
}

export function producerDocument(role, producerTestId, subject, result) {
  return {
    kind: 'studio-evidence-producer-output',
    producerTestId,
    result,
    role,
    schemaVersion: PRODUCER_SCHEMA_VERSION,
    subject,
  };
}

export function structuredArtifactName(runIndex, testId, outputFile) {
  return `${String(runIndex + 1).padStart(2, '0')}-${testId.replaceAll('/', '-')}-${outputFile}`;
}

export function runVitestEvidence(repositoryRoot, files) {
  const binary = join(repositoryRoot, 'node_modules', '.bin', 'vitest');
  const args = ['run', ...files, '--coverage.enabled=false', '--reporter=json'];
  const result = spawnSync(binary, args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    env: { ...process.env, CI: '1' },
    maxBuffer: 20 * 1_024 * 1_024,
  });
  if (result.error !== undefined || result.status !== 0) {
    throw new Error(
      `Focused producer command failed:\n${String(result.stdout ?? '').slice(-4000)}\n${String(
        result.stderr ?? '',
      ).slice(-4000)}`,
      { cause: result.error },
    );
  }
  const report = JSON.parse(result.stdout);
  if (
    report.numFailedTests !== 0 ||
    report.numPassedTests <= 0 ||
    report.numTotalTests !== report.numPassedTests
  ) {
    throw new Error('Focused producer report did not record a complete passing test set.');
  }
  const observedTests = [
    ...new Set(
      (report.testResults ?? []).flatMap((testFile) =>
        (testFile.assertionResults ?? [])
          .filter((assertion) => assertion.status === 'passed')
          .map((assertion) => assertion.fullName ?? assertion.title),
      ),
    ),
  ].sort();
  if (observedTests.length !== report.numPassedTests) {
    throw new Error(
      'Focused producer report contains missing, duplicate, or non-passing assertions.',
    );
  }
  process.stdout.write(
    `${renderEvidenceCommand('./node_modules/.bin/vitest', args)} passed ${observedTests.length} tests.\n`,
  );
  return {
    command: renderEvidenceCommand('./node_modules/.bin/vitest', args),
    files: [...files].sort(),
    observedTests,
    passed: report.numPassedTests,
    total: report.numTotalTests,
  };
}

export function buildTestProducerResult(testReport, requiredScenarios, scenarioPatterns) {
  for (const scenario of requiredScenarios) {
    const pattern = scenarioPatterns[scenario];
    if (
      !(pattern instanceof RegExp) ||
      !testReport.observedTests.some((name) => pattern.test(name))
    ) {
      throw new Error(`Focused producer did not observe required scenario ${scenario}.`);
    }
  }
  return {
    ...testReport,
    requiredScenarios: [...requiredScenarios],
  };
}

export function buildCycloneDxSbom(cleanConsumerLock, subject) {
  if (
    cleanConsumerLock?.lockfileVersion !== 3 ||
    !Array.isArray(cleanConsumerLock?.components) ||
    !Array.isArray(cleanConsumerLock?.dependencies)
  ) {
    throw new Error('CycloneDX producer requires retained clean-consumer lock graph evidence.');
  }
  const graphFailures = collectCleanConsumerGraphFailures(cleanConsumerLock, subject);
  if (graphFailures.length > 0) {
    throw new Error(`Clean-consumer graph is invalid:\n- ${graphFailures.join('\n- ')}`);
  }
  const componentRefs = new Set(cleanConsumerLock.components.map(({ purl }) => purl));
  if (componentRefs.size !== cleanConsumerLock.components.length) {
    throw new Error('Clean-consumer graph contains duplicate component identities.');
  }
  for (const { dependsOn, ref } of cleanConsumerLock.dependencies) {
    if (!componentRefs.has(ref) || dependsOn.some((dependency) => !componentRefs.has(dependency))) {
      throw new Error('Clean-consumer dependency graph links an unknown component.');
    }
  }
  const components = cleanConsumerLock.components.map((entry) => {
    const [group, name] = entry.name.startsWith('@')
      ? entry.name.split('/')
      : [undefined, entry.name];
    return {
      'bom-ref': entry.purl,
      ...(group === undefined ? {} : { group }),
      hashes: [
        {
          alg: 'SHA-512',
          content: Buffer.from(entry.integrity.slice('sha512-'.length), 'base64').toString('hex'),
        },
      ],
      name,
      purl: entry.purl,
      scope: entry.optional ? 'optional' : 'required',
      type: 'library',
      version: entry.version,
    };
  });
  const rootRef = `pkg:npm/kumwe-studio-workspace@${subject.release}`;
  const familyRefs = familyNames.map((name) => npmPackagePurl(name, subject.packages[name]));
  const properties = {
    'kumwe:evidence:bundle-id': subject.bundleId,
    'kumwe:evidence:candidate-commit': subject.candidateCommit,
    'kumwe:evidence:candidate-tree': subject.candidateTree,
    'kumwe:evidence:corpus-manifest-checksum': subject.corpusManifestChecksum,
    'kumwe:evidence:execution-attempt': String(subject.execution.attempt),
    'kumwe:evidence:execution-id': subject.execution.id,
    'kumwe:evidence:producer-test-id': 'release/sbom-v1',
    'kumwe:evidence:protocol-schema-manifest-checksum': subject.protocolSchemaManifestChecksum,
    'kumwe:evidence:release-record-checksum': subject.releaseRecordChecksum,
    'kumwe:evidence:repository': subject.repository,
    'kumwe:evidence:role': 'release/cyclonedx-sbom-v1',
    'kumwe:evidence:schema-version': PRODUCER_SCHEMA_VERSION,
    'kumwe:evidence:run-id': subject.execution.runId,
    'kumwe:evidence:runner': subject.execution.runner,
    'kumwe:evidence:work-package': subject.workPackage,
  };
  return {
    $schema: 'http://cyclonedx.org/schema/bom-1.5.schema.json',
    bomFormat: 'CycloneDX',
    components: components.sort((left, right) => left.purl.localeCompare(right.purl, 'en')),
    dependencies: [
      {
        dependsOn: familyRefs.sort((left, right) => left.localeCompare(right, 'en')),
        ref: rootRef,
      },
      ...cleanConsumerLock.dependencies,
    ],
    metadata: {
      component: {
        'bom-ref': rootRef,
        name: 'kumwe-studio-workspace',
        type: 'application',
        version: subject.release,
      },
      properties: Object.entries(properties)
        .sort(([left], [right]) => left.localeCompare(right, 'en'))
        .map(([name, value]) => ({ name, value })),
    },
    specVersion: '1.5',
    version: 1,
  };
}

export async function collectProducerArtifactFailures(
  artifact,
  bytes,
  {
    bundleId,
    candidateCommit,
    candidateTree,
    corpusManifest,
    contractIndex,
    execution,
    inputFixtureChecksums,
    packageVersions,
    validateSchema,
    workPackage,
  },
) {
  const failures = [];
  const contract = contractIndex.contractsByRole.get(artifact.role);
  if (contract === undefined) return failures;
  if (artifact.producerTestId !== contract.laneId) {
    failures.push(`structured artifact ${artifact.path} substituted producer lane`);
  }
  if (artifact.mediaType !== contract.mediaType) {
    failures.push(`structured artifact ${artifact.path} has media type ${artifact.mediaType}`);
  }
  let document;
  try {
    document = JSON.parse(bytes.toString('utf8'));
  } catch {
    failures.push(`structured artifact ${artifact.path} is not valid JSON`);
    return failures;
  }
  if (!validateSchema(contract.schemaId, document)) {
    failures.push(`structured artifact ${artifact.path} violates ${contract.schemaId}`);
    return failures;
  }
  const expectedSubject = {
    bundleId,
    candidateCommit,
    candidateTree,
    corpusManifestChecksum: inputFixtureChecksums[PRODUCER_SUBJECT_PATHS.corpusManifestChecksum],
    execution,
    packages: Object.fromEntries(familyNames.map((name) => [name, packageVersions[name]])),
    protocolSchemaManifestChecksum:
      inputFixtureChecksums[PRODUCER_SUBJECT_PATHS.protocolSchemaManifestChecksum],
    release: packageVersions[familyNames[0]],
    releaseRecordChecksum: inputFixtureChecksums[PRODUCER_SUBJECT_PATHS.releaseRecordChecksum],
    repository: canonicalRepository,
    workPackage,
  };
  if (contract.schemaId === CYCLONEDX_SCHEMA_ID) {
    failures.push(...(await collectOfficialCycloneDxFailures(document)));
    collectCycloneIdentityFailures(failures, document, expectedSubject);
    return failures;
  }
  if (
    document.role !== contract.role ||
    document.producerTestId !== contract.laneId ||
    !isDeepStrictEqual(document.subject, expectedSubject)
  ) {
    failures.push(`structured artifact ${artifact.path} does not bind its exact producer subject`);
  }
  if (document.role === 'portability/corpus-replay-v1') {
    try {
      if (corpusManifest === undefined) {
        throw new Error('candidate-source corpus manifest was not supplied');
      }
      const paths = buildExpectedTypeScriptRuntimeInventory(corpusManifest);
      const documents = paths.map((path) => ({
        classification: TYPESCRIPT_COMPILER_DEPTH_BOUNDARIES.includes(path)
          ? 'compiler-depth-boundary'
          : 'assignable',
        path,
      }));
      if (
        document.result?.schemaValidatedRoundTrips !== documents.length ||
        document.result?.assignableDocuments !==
          documents.filter(({ classification }) => classification === 'assignable').length ||
        !isDeepStrictEqual(
          document.result?.compilerDepthBoundaries,
          documents
            .filter(({ classification }) => classification === 'compiler-depth-boundary')
            .map(({ path }) => path),
        ) ||
        document.result?.inventoryChecksum !== typeScriptRuntimeInventoryChecksum(documents)
      ) {
        failures.push('TypeScript corpus evidence differs from the exact source inventory');
      }
    } catch (error) {
      failures.push(
        `TypeScript corpus source inventory is unavailable: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  failures.push(...collectRoleSemanticFailures(document));
  return failures;
}

export function collectProducerClosureFailures(documentsByRole) {
  const failures = [];
  const approved = documentsByRole.get('release/approved-family-v1');
  if (approved === undefined) return failures;
  const approvedByName = new Map(approved.result.packages.map((entry) => [entry.name, entry]));
  for (const role of [
    'release/clean-consumer-lock-v1',
    'release/provenance-set-v1',
    'release/staged-registry-report-v1',
  ]) {
    const document = documentsByRole.get(role);
    if (document === undefined) continue;
    for (const entry of document.result.packages) {
      const expected = approvedByName.get(entry.name);
      if (
        expected === undefined ||
        entry.integrity !== expected.integrity ||
        entry.version !== expected.version
      ) {
        failures.push(`${role} differs from the approved candidate bytes for ${entry.name}`);
      }
      if (entry.shasum !== undefined && entry.shasum !== expected?.shasum) {
        failures.push(`${role} differs from the approved candidate shasum for ${entry.name}`);
      }
    }
  }
  const reproducible = documentsByRole.get('release/reproducible-family-report-v1');
  if (reproducible !== undefined) {
    for (const entry of reproducible.result.packages) {
      if (entry.firstIntegrity !== approvedByName.get(entry.name)?.integrity) {
        failures.push(
          `release/reproducible-family-report-v1 differs from approved bytes for ${entry.name}`,
        );
      }
    }
  }
  const cleanConsumer = documentsByRole.get('release/clean-consumer-lock-v1');
  const sbom = documentsByRole.get('release/cyclonedx-sbom-v1');
  if (cleanConsumer !== undefined && sbom !== undefined) {
    const sbomSubject = cycloneDxSubject(sbom, cleanConsumer.subject);
    if (!isDeepStrictEqual(sbom, buildCycloneDxSbom(cleanConsumer.result, sbomSubject))) {
      failures.push('CycloneDX graph is not the exact retained clean-consumer dependency graph');
    }
  }
  return failures;
}

function collectCycloneIdentityFailures(failures, document, subject) {
  const properties = Object.fromEntries(
    (document.metadata?.properties ?? []).map(({ name, value }) => [name, value]),
  );
  const expected = {
    'kumwe:evidence:bundle-id': subject.bundleId,
    'kumwe:evidence:candidate-commit': subject.candidateCommit,
    'kumwe:evidence:candidate-tree': subject.candidateTree,
    'kumwe:evidence:corpus-manifest-checksum': subject.corpusManifestChecksum,
    'kumwe:evidence:execution-attempt': String(subject.execution.attempt),
    'kumwe:evidence:execution-id': subject.execution.id,
    'kumwe:evidence:producer-test-id': 'release/sbom-v1',
    'kumwe:evidence:protocol-schema-manifest-checksum': subject.protocolSchemaManifestChecksum,
    'kumwe:evidence:release-record-checksum': subject.releaseRecordChecksum,
    'kumwe:evidence:repository': subject.repository,
    'kumwe:evidence:role': 'release/cyclonedx-sbom-v1',
    'kumwe:evidence:run-id': subject.execution.runId,
    'kumwe:evidence:runner': subject.execution.runner,
    'kumwe:evidence:schema-version': PRODUCER_SCHEMA_VERSION,
    'kumwe:evidence:work-package': subject.workPackage,
  };
  if (!isDeepStrictEqual(properties, expected)) {
    failures.push('CycloneDX metadata does not bind its exact bundle execution subject');
  }
}

function cycloneDxSubject(document, cleanSubject) {
  const properties = Object.fromEntries(
    document.metadata.properties.map(({ name, value }) => [name, value]),
  );
  return {
    ...cleanSubject,
    execution: {
      attempt: Number(properties['kumwe:evidence:execution-attempt']),
      id: properties['kumwe:evidence:execution-id'],
      runId: properties['kumwe:evidence:run-id'],
      runner: properties['kumwe:evidence:runner'],
    },
  };
}

function collectRoleSemanticFailures(document) {
  const failures = [];
  const testReportSpec = testReportSpecs[document.role];
  const expectedScenarios = scenarioSets[document.role];
  if (testReportSpec !== undefined) {
    const expectedCommand = renderEvidenceCommand('./node_modules/.bin/vitest', [
      'run',
      ...testReportSpec.files,
      '--coverage.enabled=false',
      '--reporter=json',
    ]);
    if (
      document.producerTestId !== testReportSpec.laneId ||
      document.result?.command !== expectedCommand ||
      !isDeepStrictEqual(document.result?.files, [...testReportSpec.files])
    ) {
      failures.push(`structured role ${document.role} substituted its fixed test command or files`);
    }
    if (!isDeepStrictEqual(document.result?.requiredScenarios, [...expectedScenarios])) {
      failures.push(`structured role ${document.role} does not bind its closed scenario set`);
    }
    if (
      document.result?.passed !== document.result?.total ||
      document.result?.passed !== document.result?.observedTests?.length
    ) {
      failures.push(`structured role ${document.role} is not an exact all-passing test report`);
    }
  }
  if (document.role === 'portability/typescript-generation-v1') {
    const expectedCommands = typescriptCommands.map(([command, args]) =>
      renderEvidenceCommand(command, args),
    );
    if (!isDeepStrictEqual(document.result?.commands, expectedCommands)) {
      failures.push('TypeScript generation evidence substituted its fixed commands');
    }
  }
  if (
    document.role === 'portability/corpus-replay-v1' &&
    (document.result?.command !== renderEvidenceCommand(...typescriptCommands[1]) ||
      document.result?.runtimeCommand !== renderEvidenceCommand(...typescriptCommands[2]))
  ) {
    failures.push('TypeScript corpus evidence substituted its fixed replay command');
  }
  if (
    ['release/approved-family-v1', 'release/reproducible-family-report-v1'].includes(document.role)
  ) {
    collectExactFamilyFailures(failures, document.result?.packages, document.subject);
  }
  if (document.role === 'release/clean-consumer-lock-v1') {
    collectExactFamilyFailures(failures, document.result?.packages, document.subject);
    if (!isDeepStrictEqual(document.result?.rootDependencies, document.subject?.packages)) {
      failures.push('clean-consumer lock root dependencies differ from the candidate family');
    }
    failures.push(...collectCleanConsumerGraphFailures(document.result, document.subject));
    for (const item of document.result?.packages ?? []) {
      const tarballName = item.name.slice(item.name.indexOf('/') + 1);
      if (
        item.resolved !==
        `https://registry.npmjs.org/${item.name}/-/${tarballName}-${item.version}.tgz`
      ) {
        failures.push(`clean-consumer lock has a substituted registry URL for ${item.name}`);
      }
    }
    const components = document.result?.components ?? [];
    const componentRefs = components.map(({ purl }) => purl);
    if (
      new Set(componentRefs).size !== componentRefs.length ||
      !isDeepStrictEqual(componentRefs, [...componentRefs].sort())
    ) {
      failures.push('clean-consumer components must have unique sorted purl identities');
    }
    const knownRefs = new Set(componentRefs);
    const dependencyRefs = (document.result?.dependencies ?? []).map(({ ref }) => ref);
    if (
      !isDeepStrictEqual(dependencyRefs, [...componentRefs]) ||
      document.result?.dependencies?.some(
        ({ dependsOn }) =>
          !isDeepStrictEqual(dependsOn, [...dependsOn].sort()) ||
          dependsOn.some((ref) => !knownRefs.has(ref)),
      )
    ) {
      failures.push('clean-consumer dependency edges must exactly cover and link known components');
    }
  }
  if (document.role === 'release/provenance-set-v1') {
    collectExactFamilyFailures(failures, document.result?.packages, document.subject);
  }
  if (document.role === 'release/signature-audit-v1') {
    if (!isDeepStrictEqual(document.result?.packages, familyNames)) {
      failures.push('signature audit does not cover the exact eight-package family');
    }
  }
  if (document.role === 'release/staged-registry-report-v1') {
    collectExactFamilyFailures(failures, document.result?.packages, document.subject);
    if (document.result?.coordinate !== document.subject?.release) {
      failures.push('staged registry report coordinate differs from its candidate subject');
    }
    if (document.result?.stagingTag !== stagingTagForVersion(document.subject?.release)) {
      failures.push('staged registry report names a substituted quarantine tag');
    }
  }
  return failures;
}

function collectCleanConsumerGraphFailures(cleanConsumerLock, subject) {
  const failures = [];
  const components = Array.isArray(cleanConsumerLock?.components)
    ? cleanConsumerLock.components
    : [];
  const dependencies = Array.isArray(cleanConsumerLock?.dependencies)
    ? cleanConsumerLock.dependencies
    : [];
  const componentsByPurl = new Map(components.map((component) => [component.purl, component]));
  if (componentsByPurl.size !== components.length) {
    failures.push('clean-consumer graph contains duplicate component purls');
  }
  for (const component of components) {
    if (component.purl !== npmPackagePurl(component.name, component.version)) {
      failures.push(`clean-consumer component ${String(component.name)} has a substituted purl`);
    }
  }
  const dependenciesByRef = new Map(dependencies.map((dependency) => [dependency.ref, dependency]));
  if (dependenciesByRef.size !== dependencies.length) {
    failures.push('clean-consumer graph contains duplicate dependency refs');
  }
  if (!sameMembers([...dependenciesByRef.keys()], [...componentsByPurl.keys()])) {
    failures.push('clean-consumer dependency refs must exactly cover every component');
  }
  for (const dependency of dependencies) {
    if (
      !componentsByPurl.has(dependency.ref) ||
      dependency.dependsOn.some((ref) => !componentsByPurl.has(ref))
    ) {
      failures.push(
        `clean-consumer dependency ${String(dependency.ref)} links an unknown component`,
      );
    }
  }
  const packages = Array.isArray(cleanConsumerLock?.packages) ? cleanConsumerLock.packages : [];
  const packagesByName = new Map(packages.map((entry) => [entry.name, entry]));
  for (const name of familyNames) {
    const entry = packagesByName.get(name);
    const version = subject?.packages?.[name];
    const component = componentsByPurl.get(npmPackagePurl(name, version));
    if (
      entry === undefined ||
      component === undefined ||
      entry.version !== version ||
      component.name !== name ||
      component.version !== entry.version ||
      component.integrity !== entry.integrity ||
      component.resolved !== entry.resolved ||
      component.optional !== false
    ) {
      failures.push(`clean-consumer graph does not bind exact family component ${name}`);
    }
  }
  return failures;
}

function npmPackagePurl(name, version) {
  const encodedName = name.startsWith('@') ? `%40${name.slice(1)}` : name;
  return `pkg:npm/${encodedName}@${version}`;
}

function collectExactFamilyFailures(failures, packages, subject) {
  const packageNames = Array.isArray(packages) ? packages.map(({ name }) => name) : [];
  if (!isDeepStrictEqual(packageNames, familyNames)) {
    failures.push('structured release artifact does not cover the exact eight-package family');
    return;
  }
  for (const item of packages) {
    if (item.version !== subject?.packages?.[item.name]) {
      failures.push(`structured release artifact has drifted version for ${String(item.name)}`);
    }
    if (
      item.byteIdentical === true &&
      (item.firstIntegrity !== item.secondIntegrity || item.firstIntegrity === undefined)
    ) {
      failures.push(`reproducible-family artifact has unequal digests for ${String(item.name)}`);
    }
    if (
      typeof item.sha512 === 'string' &&
      item.integrity !== `sha512-${Buffer.from(item.sha512, 'hex').toString('base64')}`
    ) {
      failures.push(`approved-family artifact has inconsistent SHA-512 forms for ${item.name}`);
    }
  }
}

function assertProducerEnvironment(contract, document, outputDirectory) {
  if (typeof outputDirectory !== 'string' || !isAbsolute(outputDirectory)) {
    throw new Error('STUDIO_EVIDENCE_OUTPUT_DIR must name an absolute generator-owned directory.');
  }
  if (process.env.STUDIO_EVIDENCE_PRODUCER_TEST_ID !== contract.laneId) {
    throw new Error(`Producer ${contract.laneId} is outside its generator-owned lane.`);
  }
  if (process.env.STUDIO_EVIDENCE_CANDIDATE_SHA !== document.subject?.candidateCommit) {
    throw new Error(`Producer ${contract.laneId} does not bind the dispatched candidate.`);
  }
  const exactEnvironmentBindings = [
    ['STUDIO_EVIDENCE_BUNDLE_ID', document.subject?.bundleId],
    ['STUDIO_EVIDENCE_CANDIDATE_TREE', document.subject?.candidateTree],
    ['STUDIO_EVIDENCE_EXECUTION_ATTEMPT', String(document.subject?.execution?.attempt)],
    ['STUDIO_EVIDENCE_EXECUTION_ID', document.subject?.execution?.id],
    ['STUDIO_EVIDENCE_RUN_ID', document.subject?.execution?.runId],
    ['STUDIO_EVIDENCE_RUNNER', document.subject?.execution?.runner],
    ['STUDIO_EVIDENCE_WORK_PACKAGE', document.subject?.workPackage],
  ];
  if (exactEnvironmentBindings.some(([name, value]) => process.env[name] !== value)) {
    throw new Error(`Producer ${contract.laneId} does not bind its exact bundle execution.`);
  }
  if (document.producerTestId !== contract.laneId || document.role !== contract.role) {
    throw new Error(`Producer ${contract.laneId} attempted a role or lane substitution.`);
  }
}

export async function assertProducerDirectory(directory, expectedFiles) {
  const stat = await lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error('Producer output location is not a regular generator-owned directory.');
  }
  const entries = (await readdir(directory, { withFileTypes: true })).sort((left, right) =>
    left.name.localeCompare(right.name, 'en'),
  );
  const expected = [...expectedFiles].sort((left, right) => left.localeCompare(right, 'en'));
  if (
    entries.some((entry) => !entry.isFile() || entry.isSymbolicLink()) ||
    !isDeepStrictEqual(
      entries.map(({ name }) => name),
      expected,
    )
  ) {
    throw new Error(
      `Producer output must contain exactly ${expected.join(', ')} as regular files.`,
    );
  }
}

function sameMembers(left, right) {
  if (left.length !== right.length) return false;
  const rightMembers = new Set(right);
  return rightMembers.size === right.length && left.every((member) => rightMembers.has(member));
}

export {
  familyNames as STUDIO_EVIDENCE_PACKAGE_NAMES,
  scenarioSets as PRODUCER_SCENARIO_SETS,
  testReportSpecs as PRODUCER_TEST_REPORT_SPECS,
  typescriptCommands as TYPESCRIPT_PRODUCER_COMMANDS,
};
