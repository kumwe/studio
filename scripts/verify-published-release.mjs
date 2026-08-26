import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

import { STUDIO_RELEASE_PACKAGES } from './release-family.mjs';
import { APPROVED_ARTIFACT_PATH, assertApprovedReleaseArtifacts } from './release-artifacts.mjs';
import { assertCoordinatedRelease } from './release-record.mjs';

const execFileAsync = promisify(execFile);

export async function collectRegistryFailures(
  record,
  {
    approvedArtifacts,
    distTag,
    fetchAttestations = readAttestations,
    npmJson = readNpmJson,
    provenanceCommit,
    provenanceWorkflow = '.github/workflows/release.yml',
    requireProvenance = false,
    skipMissing = false,
  } = {},
) {
  assertCoordinatedRelease(record);
  if (approvedArtifacts !== undefined) {
    assertApprovedReleaseArtifacts(approvedArtifacts, record);
  }
  const failures = [];
  for (const { name } of STUDIO_RELEASE_PACKAGES) {
    const version = record.packages[name];
    let manifest;
    try {
      manifest = await npmJson(['view', `${name}@${version}`, '--json']);
    } catch {
      if (!skipMissing) failures.push(`${name}@${version} is absent from npm`);
      continue;
    }
    if (manifest.version !== version) {
      failures.push(`${name}@${version} returned version ${String(manifest.version)}`);
    }
    const approved = approvedArtifacts?.packages[name];
    if (approved !== undefined) {
      if (manifest.dist?.integrity !== approved.integrity) {
        failures.push(
          `${name}@${version} registry integrity differs from the approved local tarball`,
        );
      }
      if (manifest.dist?.shasum !== approved.shasum) {
        failures.push(`${name}@${version} registry shasum differs from the approved local tarball`);
      }
    } else if (
      typeof manifest.dist?.integrity !== 'string' ||
      !/^sha512-[A-Za-z0-9+/]+={0,2}$/u.test(manifest.dist.integrity)
    ) {
      failures.push(`${name}@${version} has no registry integrity digest`);
    }
    if (
      requireProvenance &&
      (typeof manifest.dist?.attestations?.url !== 'string' ||
        manifest.dist.attestations.url.length === 0)
    ) {
      failures.push(`${name}@${version} has no npm provenance attestation`);
    } else if (requireProvenance) {
      if (approved === undefined || !/^[a-f0-9]{40}$/u.test(provenanceCommit ?? '')) {
        failures.push(`${name}@${version} lacks approved provenance verification inputs`);
      } else {
        try {
          failures.push(
            ...collectProvenanceFailures(await fetchAttestations(manifest.dist.attestations.url), {
              approved,
              name,
              provenanceCommit,
              version,
              workflowPath: provenanceWorkflow,
            }),
          );
        } catch (error) {
          failures.push(
            `${name}@${version} provenance could not be read: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
    }
    if (distTag !== undefined && distTag.length > 0) {
      let tags;
      try {
        tags = await npmJson(['view', name, 'dist-tags', '--json']);
      } catch {
        tags = {};
      }
      if (tags[distTag] !== version) {
        failures.push(
          `${name} dist-tag ${distTag} is ${String(tags[distTag])}, expected ${version}`,
        );
      }
    }
  }
  return failures;
}

export function collectProvenanceFailures(
  document,
  { approved, name, provenanceCommit, version, workflowPath },
) {
  const failures = [];
  const entries = Array.isArray(document?.attestations) ? document.attestations : [];
  const statements = entries
    .filter((entry) => entry?.predicateType === 'https://slsa.dev/provenance/v1')
    .flatMap((entry) => {
      try {
        return [
          JSON.parse(
            Buffer.from(entry.bundle?.dsseEnvelope?.payload ?? '', 'base64').toString('utf8'),
          ),
        ];
      } catch {
        return [];
      }
    });
  const expectedSubject = `pkg:npm/${name.replace(/^@/u, '%40')}@${version}`;
  const statement = statements.find((candidate) =>
    candidate.subject?.some(
      (subject) => subject.name === expectedSubject && subject.digest?.sha512 === approved.sha512,
    ),
  );
  if (statement === undefined) {
    failures.push(`${name}@${version} provenance subject does not bind the approved tarball`);
    return failures;
  }
  const workflow = statement.predicate?.buildDefinition?.externalParameters?.workflow;
  if (
    workflow?.repository !== 'https://github.com/kumwe/studio' ||
    workflow?.path !== workflowPath ||
    workflow?.ref !== 'refs/heads/main'
  ) {
    failures.push(`${name}@${version} provenance does not name the governed main release workflow`);
  }
  const dependencies = statement.predicate?.buildDefinition?.resolvedDependencies;
  if (
    !Array.isArray(dependencies) ||
    !dependencies.some(
      (dependency) =>
        dependency.uri === 'git+https://github.com/kumwe/studio@refs/heads/main' &&
        dependency.digest?.gitCommit === provenanceCommit,
    )
  ) {
    failures.push(
      `${name}@${version} provenance does not bind dispatch commit ${provenanceCommit}`,
    );
  }
  if (
    !String(statement.predicate?.runDetails?.builder?.id).startsWith(
      'https://github.com/actions/runner/',
    )
  ) {
    failures.push(`${name}@${version} provenance does not identify a GitHub-hosted runner`);
  }
  return failures;
}

async function readNpmJson(arguments_) {
  const { stdout } = await execFileAsync('npm', arguments_, { maxBuffer: 2 * 1_024 * 1_024 });
  return JSON.parse(stdout);
}

async function readAttestations(url) {
  const parsed = new URL(url);
  if (
    parsed.protocol !== 'https:' ||
    parsed.hostname !== 'registry.npmjs.org' ||
    !parsed.pathname.startsWith('/-/npm/v1/attestations/')
  ) {
    throw new Error('npm attestation URL is outside the canonical registry endpoint');
  }
  const response = await fetch(parsed, { redirect: 'error' });
  if (!response.ok) {
    throw new Error(`npm attestation endpoint returned ${response.status}`);
  }
  const source = await response.text();
  if (source.length > 5 * 1_024 * 1_024) {
    throw new Error('npm attestation response exceeds 5 MiB');
  }
  return JSON.parse(source);
}

async function main() {
  const record = JSON.parse(
    await readFile(new URL('../studio-release.json', import.meta.url), 'utf8'),
  );
  if (
    process.env.RELEASE_EXPECTED_VERSION !== undefined &&
    record.release !== process.env.RELEASE_EXPECTED_VERSION
  ) {
    throw new Error(
      `Registry verification source ${record.release} does not match planned coordinate ` +
        `${process.env.RELEASE_EXPECTED_VERSION}.`,
    );
  }
  let approvedArtifacts;
  if (process.env.RELEASE_APPROVED_ARTIFACTS === 'true') {
    approvedArtifacts = JSON.parse(
      await readFile(new URL(`../${APPROVED_ARTIFACT_PATH}`, import.meta.url), 'utf8'),
    );
  }
  const failures = await collectRegistryFailures(record, {
    approvedArtifacts,
    distTag: process.env.RELEASE_DIST_TAG,
    provenanceCommit: process.env.RELEASE_PROVENANCE_COMMIT,
    provenanceWorkflow: process.env.RELEASE_PROVENANCE_WORKFLOW,
    requireProvenance: process.env.RELEASE_REQUIRE_PROVENANCE === 'true',
  });
  if (failures.length > 0) {
    throw new Error(
      `The coordinated Studio registry release is incomplete:\n- ${failures.join('\n- ')}`,
    );
  }

  console.log(
    `Published Studio release ${record.release} verified across all ${STUDIO_RELEASE_PACKAGES.length} packages` +
      `${process.env.RELEASE_DIST_TAG ? ` on ${process.env.RELEASE_DIST_TAG}` : ''}.`,
  );
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
