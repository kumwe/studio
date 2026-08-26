import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import { assertCoordinatedRelease } from './release-record.mjs';
import { APPROVED_ARTIFACT_PATH, inspectExistingRegistryArtifacts } from './release-artifacts.mjs';
import { inspectReleasePlan } from './release-plan.mjs';
import { publishMissingApprovedArtifacts } from './staged-publish.mjs';

const alphaVersionPattern =
  /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)-alpha\.(0|[1-9][0-9]*)$/u;
const repositoryRoot = new URL('../', import.meta.url);

export function assertAlphaPublication(record, plan) {
  assertCoordinatedRelease(record);

  if (plan.preMode !== 'pre' || plan.channel !== 'alpha') {
    throw new Error('Automated publication is restricted to Changesets alpha pre mode.');
  }
  if (plan.operation !== 'publish' || plan.hasPendingChangesets) {
    throw new Error(
      'Alpha publication requires a consumed version commit with no pending changesets.',
    );
  }
  if (!alphaVersionPattern.test(record.release)) {
    throw new Error(
      `Automated publication accepts only numeric alpha versions; received ${String(record.release)}.`,
    );
  }
}

async function main() {
  if (process.argv.length !== 2) {
    throw new Error('Usage: node scripts/publish-alpha.mjs');
  }

  const record = JSON.parse(await readFile(new URL('studio-release.json', repositoryRoot), 'utf8'));
  const plan = await inspectReleasePlan(repositoryRoot);
  assertAlphaPublication(record, plan);
  const approvedArtifacts = JSON.parse(
    await readFile(new URL(APPROVED_ARTIFACT_PATH, repositoryRoot), 'utf8'),
  );
  const preflight = await inspectExistingRegistryArtifacts(record, approvedArtifacts);
  if (preflight.failures.length > 0) {
    throw new Error(
      `Existing registry packages differ from the approved immutable alpha candidate:\n- ${preflight.failures.join('\n- ')}`,
    );
  }
  console.log(
    `Alpha registry preflight: ${preflight.missing.length} package(s) remain unpublished; ` +
      `${Object.keys(record.packages).length - preflight.missing.length} existing package(s) match exactly.`,
  );

  const result = await publishMissingApprovedArtifacts(
    record,
    approvedArtifacts,
    preflight.missing,
  );
  console.log(
    `Alpha staging publication complete: ${result.published.length} package(s) uploaded to ${result.stagingTag}.`,
  );
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
