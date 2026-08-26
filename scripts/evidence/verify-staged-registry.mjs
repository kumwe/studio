import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { loadProducerRuntime, STUDIO_EVIDENCE_PACKAGE_NAMES } from '../producer-evidence.mjs';
import { stagingTagForVersion } from '../staged-publish.mjs';
import {
  assertStagedVerificationSource,
  buildFreshApprovedArtifacts,
  proveCleanRegistryInstall,
} from '../verify-staged-release.mjs';
import { collectRegistryEvidence } from '../verify-published-release.mjs';

const repositoryRootUrl = new URL('../../', import.meta.url);
const repositoryRoot = fileURLToPath(repositoryRootUrl);
const laneId = 'release/staged-registry-install';
const runtime = await loadProducerRuntime(repositoryRoot, laneId);
const releaseRecordSource = await readFile(
  new URL('studio-release.json', repositoryRootUrl),
  'utf8',
);
const record = JSON.parse(releaseRecordSource);
const actualSha = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: repositoryRoot,
  encoding: 'utf8',
}).trim();
const workingTreeState = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], {
  cwd: repositoryRoot,
  encoding: 'utf8',
}).trim();
assertStagedVerificationSource(
  record,
  actualSha,
  process.env.RELEASE_EXPECTED_VERSION,
  workingTreeState,
);
const approvedArtifacts = await buildFreshApprovedArtifacts(record, { root: repositoryRootUrl });
const stagingTag = stagingTagForVersion(record.release);
const registryEvidence = await collectRegistryEvidence(record, {
  approvedArtifacts,
  distTag: stagingTag,
  provenanceCommit: actualSha,
  requireProvenance: true,
});
if (registryEvidence.failures.length > 0) {
  throw new Error(
    `The quarantined RC cannot support structured release evidence:\n- ${registryEvidence.failures.join(
      '\n- ',
    )}`,
  );
}
const cleanConsumerLock = await proveCleanRegistryInstall(record, releaseRecordSource, {
  captureEvidence: true,
});
if (cleanConsumerLock === undefined) {
  throw new Error('The clean registry consumer did not return a retained lock projection.');
}
const packageResults = STUDIO_EVIDENCE_PACKAGE_NAMES.map((name) => ({
  integrity: approvedArtifacts.packages[name].integrity,
  name,
  shasum: approvedArtifacts.packages[name].shasum,
  version: record.packages[name],
}));

await runtime.write('release/clean-consumer-lock-v1', cleanConsumerLock);
await runtime.write('release/provenance-set-v1', {
  packages: [...registryEvidence.packages].sort((left, right) =>
    left.name.localeCompare(right.name, 'en'),
  ),
});
await runtime.write('release/signature-audit-v1', {
  auditCommand: 'npm audit signatures --omit=dev',
  outcome: 'verified',
  packages: [...STUDIO_EVIDENCE_PACKAGE_NAMES],
});
await runtime.write('release/staged-registry-report-v1', {
  cleanConsumer: true,
  coordinate: record.release,
  packages: packageResults,
  provenanceVerified: true,
  signaturesVerified: true,
  stagingTag,
});
process.stdout.write(
  `Structured staged-registry evidence produced for ${record.release} across eight packages.\n`,
);
