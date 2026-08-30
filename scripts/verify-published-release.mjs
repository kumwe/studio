import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFile, readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { STUDIO_RELEASE_PACKAGES } from './release-family.mjs';
import { APPROVED_ARTIFACT_PATH, assertApprovedReleaseArtifacts } from './release-artifacts.mjs';
import { assertCoordinatedRelease } from './release-record.mjs';

const execFileAsync = promisify(execFile);
const shaPattern = /^[a-f0-9]{40}$/u;

// The public npm registry is eventually consistent: a freshly published
// version or a just-moved dist-tag can 404 or read stale on some replicas for
// minutes after the write succeeds. Verification must therefore poll inside a
// bounded window before declaring the coordinated release incomplete.
export const REGISTRY_PROPAGATION_WINDOW_MS = 300_000;
const REGISTRY_POLL_INTERVAL_MS = 10_000;

export async function collectRegistryEvidence(
  record,
  {
    acceptProvenanceCommit,
    approvedArtifacts,
    distTag,
    fetchAttestations = readAttestations,
    now = Date.now,
    npmJson = readNpmJson,
    propagationWindowMs = 0,
    provenanceCommit,
    provenanceWorkflow = '.github/workflows/release.yml',
    requireProvenance = false,
    skipMissing = false,
    sleep = defaultSleep,
  } = {},
) {
  assertCoordinatedRelease(record);
  if (approvedArtifacts !== undefined) {
    assertApprovedReleaseArtifacts(approvedArtifacts, record);
  }
  // One deadline for the whole family keeps the total wait bounded: once the
  // window closes, remaining absent coordinates fail without further polling.
  const propagationDeadline = now() + propagationWindowMs;
  const failures = [];
  const packages = [];
  const provenanceCommits = [];
  for (const { name } of STUDIO_RELEASE_PACKAGES) {
    const version = record.packages[name];
    let manifest;
    for (;;) {
      try {
        manifest = await npmJson(['view', `${name}@${version}`, '--json']);
        break;
      } catch {
        // Preflight callers expect absence and must not wait for it.
        if (skipMissing || now() >= propagationDeadline) break;
        await sleep(REGISTRY_POLL_INTERVAL_MS);
      }
    }
    if (manifest === undefined) {
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
    let attestationDocument;
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
        // The attestation endpoint replicates independently of the manifest
        // and can 404 for a while after a publish the manifest already shows.
        for (;;) {
          try {
            attestationDocument = await fetchAttestations(manifest.dist.attestations.url);
            break;
          } catch (error) {
            if (now() >= propagationDeadline) {
              failures.push(
                `${name}@${version} provenance could not be read: ${
                  error instanceof Error ? error.message : String(error)
                }`,
              );
              break;
            }
            await sleep(REGISTRY_POLL_INTERVAL_MS);
          }
        }
        if (attestationDocument !== undefined) {
          const provenance = await collectProvenanceEvidence(attestationDocument, {
            acceptProvenanceCommit,
            approved,
            name,
            provenanceCommit,
            version,
            workflowPath: provenanceWorkflow,
          });
          failures.push(...provenance.failures);
          if (provenance.sourceCommit !== undefined) {
            provenanceCommits.push(provenance.sourceCommit);
          }
        }
      }
    }
    if (distTag !== undefined && distTag.length > 0) {
      let tags;
      for (;;) {
        try {
          tags = await npmJson(['view', name, 'dist-tags', '--json']);
        } catch {
          tags = {};
        }
        if (tags[distTag] === version || now() >= propagationDeadline) break;
        await sleep(REGISTRY_POLL_INTERVAL_MS);
      }
      if (tags[distTag] !== version) {
        failures.push(
          `${name} dist-tag ${distTag} is ${String(tags[distTag])}, expected ${version}`,
        );
      }
    }
    if (attestationDocument !== undefined) {
      packages.push({
        attestationDigest: `sha256-${createHash('sha256')
          .update(JSON.stringify(attestationDocument))
          .digest('base64')}`,
        attestationUrl: manifest.dist.attestations.url,
        integrity: manifest.dist.integrity,
        name,
        shasum: manifest.dist.shasum,
        version,
        workflow: provenanceWorkflow,
      });
    }
  }
  const coordinatedProvenanceCommits = [...new Set(provenanceCommits)].sort();
  if (requireProvenance && !skipMissing && coordinatedProvenanceCommits.length !== 1) {
    failures.push('Studio package provenance does not bind one coordinated publication source');
  }
  return { failures, packages, provenanceCommits: coordinatedProvenanceCommits };
}

export async function collectRegistryFailures(record, options = {}) {
  return (await collectRegistryEvidence(record, options)).failures;
}

export async function collectProvenanceFailures(document, options) {
  return (await collectProvenanceEvidence(document, options)).failures;
}

export async function collectProvenanceEvidence(
  document,
  { acceptProvenanceCommit, approved, name, provenanceCommit, version, workflowPath },
) {
  const acceptCommit = acceptProvenanceCommit ?? (async (commit) => commit === provenanceCommit);
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
    return { failures, sourceCommit: undefined };
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
  const mainCommits = [
    ...new Set(
      (Array.isArray(dependencies) ? dependencies : [])
        .filter(
          (dependency) =>
            dependency.uri === 'git+https://github.com/kumwe/studio@refs/heads/main' &&
            typeof dependency.digest?.gitCommit === 'string',
        )
        .map((dependency) => dependency.digest.gitCommit),
    ),
  ];
  let sourceCommit;
  if (mainCommits.length !== 1) {
    failures.push(`${name}@${version} provenance must bind exactly one governed main commit`);
  } else if (!shaPattern.test(mainCommits[0])) {
    failures.push(`${name}@${version} provenance source commit is not a lowercase full SHA`);
  } else {
    try {
      if (await acceptCommit(mainCommits[0])) {
        sourceCommit = mainCommits[0];
      } else {
        failures.push(
          `${name}@${version} provenance does not bind dispatch commit ${provenanceCommit}`,
        );
      }
    } catch (error) {
      failures.push(
        `${name}@${version} provenance source could not be accepted: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
  if (
    !String(statement.predicate?.runDetails?.builder?.id).startsWith(
      'https://github.com/actions/runner/',
    )
  ) {
    failures.push(`${name}@${version} provenance does not identify a GitHub-hosted runner`);
  }
  return { failures, sourceCommit: failures.length === 0 ? sourceCommit : undefined };
}

async function defaultSleep(milliseconds) {
  await new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

// Registry coordinates are immutable, so bits published from an earlier main
// commit can never re-bind a later dispatch commit. Re-verification therefore
// accepts provenance bound to any ancestor of the checked-out main head: the
// byte-exact comparison against locally rebuilt tarballs and the exact
// workflow, ref, and builder assertions still hold, so acceptance continues
// to prove the registry bits came from this repository's governed history.
async function isAncestorOfCheckedOutHead(commit) {
  if (!/^[a-f0-9]{40}$/u.test(commit)) {
    return false;
  }
  try {
    await execFileAsync('git', ['merge-base', '--is-ancestor', commit, 'HEAD'], {
      cwd: fileURLToPath(new URL('../', import.meta.url)),
    });
    return true;
  } catch {
    return false;
  }
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
  let acceptProvenanceCommit;
  if (process.env.RELEASE_PROVENANCE_ANCESTOR_OK === 'true') {
    acceptProvenanceCommit = async (commit) =>
      commit === process.env.RELEASE_PROVENANCE_COMMIT ||
      (await isAncestorOfCheckedOutHead(commit));
  }
  const evidence = await collectRegistryEvidence(record, {
    acceptProvenanceCommit,
    approvedArtifacts,
    distTag: process.env.RELEASE_DIST_TAG,
    propagationWindowMs: REGISTRY_PROPAGATION_WINDOW_MS,
    provenanceCommit: process.env.RELEASE_PROVENANCE_COMMIT,
    provenanceWorkflow: process.env.RELEASE_PROVENANCE_WORKFLOW,
    requireProvenance: process.env.RELEASE_REQUIRE_PROVENANCE === 'true',
  });
  if (evidence.failures.length > 0) {
    throw new Error(
      `The coordinated Studio registry release is incomplete:\n- ${evidence.failures.join('\n- ')}`,
    );
  }

  if (process.env.RELEASE_WRITE_PROVENANCE_OUTPUT === 'true') {
    if (
      process.env.GITHUB_OUTPUT === undefined ||
      process.env.GITHUB_OUTPUT.length === 0 ||
      evidence.provenanceCommits.length !== 1
    ) {
      throw new Error('A single verified provenance commit and GITHUB_OUTPUT are required.');
    }
    await appendFile(
      process.env.GITHUB_OUTPUT,
      `provenance_commit=${evidence.provenanceCommits[0]}\nversion=${record.release}\n`,
      'utf8',
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
