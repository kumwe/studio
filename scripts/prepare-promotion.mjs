import { execFileSync } from 'node:child_process';
import { readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { STUDIO_RELEASE_PACKAGES, STUDIO_RELEASE_RECORD_TARGETS } from './release-family.mjs';
import {
  buildStudioReleaseRecord,
  readStudioReleaseInputs,
  serializeStudioReleaseRecord,
} from './release-record.mjs';
import { inspectPromotionPlan } from './promotion-plan.mjs';

const repositoryRoot = new URL('../', import.meta.url);
const dependencyFields = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
];

export async function preparePromotion(
  root = repositoryRoot,
  { candidateRecord, candidateSha = '', channel, evidenceSha = '', profiles },
) {
  const profileInput = Array.isArray(profiles) ? profiles.join(',') : profiles;
  const plan = await inspectPromotionPlan(root, {
    candidateRecord,
    candidateSha,
    channel,
    evidenceSha,
    profiles: profileInput,
  });
  if (plan.operation === 'correct') {
    await prepareRcCorrection(root, plan);
    return plan;
  }
  if (plan.operation !== 'prepare') {
    throw new Error('Promotion preparation received a publication plan.');
  }

  const packageManifestPaths = STUDIO_RELEASE_PACKAGES.map(
    ({ directory }) => `packages/${directory}/package.json`,
  );
  for (const path of [...packageManifestPaths, 'examples/reference-host/package.json']) {
    const manifest = await readJson(new URL(path, root));
    if (packageManifestPaths.includes(path)) {
      if (manifest.version !== plan.sourceVersion) {
        throw new Error(`${path} is not at coordinated source version ${plan.sourceVersion}.`);
      }
      manifest.version = plan.targetVersion;
    }
    updateInternalPins(manifest, plan.sourceVersion, plan.targetVersion, path);
    await writeJson(new URL(path, root), manifest);
  }

  const lockfile = await readJson(new URL('package-lock.json', root));
  for (const [path, manifest] of Object.entries(lockfile.packages ?? {})) {
    if (STUDIO_RELEASE_PACKAGES.some(({ name }) => name === manifest.name)) {
      if (manifest.version !== plan.sourceVersion) {
        throw new Error(
          `package-lock.json ${path} is not at coordinated source version ${plan.sourceVersion}.`,
        );
      }
      manifest.version = plan.targetVersion;
    }
    updateInternalPins(
      manifest,
      plan.sourceVersion,
      plan.targetVersion,
      `package-lock.json ${path || '<root>'}`,
    );
  }
  await writeJson(new URL('package-lock.json', root), lockfile);

  for (const { directory, name } of STUDIO_RELEASE_PACKAGES) {
    const changelogUrl = new URL(`packages/${directory}/CHANGELOG.md`, root);
    const changelog = await readFile(changelogUrl, 'utf8');
    await writeFile(
      changelogUrl,
      prependPromotionChangelog(changelog, {
        channel,
        name,
        sourceVersion: plan.sourceVersion,
        targetVersion: plan.targetVersion,
      }),
    );
  }

  await writeJson(new URL('release-profile-claims.json', root), {
    kind: 'studio-release-profile-claims',
    profiles: plan.profiles,
  });
  if (channel === 'rc') {
    await writeJson(new URL('.changeset/pre.json', root), { mode: 'pre', tag: 'rc' });
  } else {
    await unlink(new URL('.changeset/pre.json', root));
    await rm(new URL('.changeset/pre/', root), { force: true, recursive: true });
  }

  const record = buildStudioReleaseRecord(await readStudioReleaseInputs(root));
  const releaseBytes = serializeStudioReleaseRecord(record);
  await Promise.all(
    STUDIO_RELEASE_RECORD_TARGETS.map((path) => writeFile(new URL(path, root), releaseBytes)),
  );

  return plan;
}

async function prepareRcCorrection(root, plan) {
  const repositoryPath = fileURLToPath(root);
  const changesetsCli = fileURLToPath(
    new URL('../node_modules/@changesets/cli/bin.js', import.meta.url),
  );
  execFileSync(process.execPath, [changesetsCli, 'version'], {
    cwd: repositoryPath,
    stdio: 'inherit',
  });
  const packageManifestPaths = STUDIO_RELEASE_PACKAGES.map(
    ({ directory }) => `packages/${directory}/package.json`,
  );
  for (const path of [...packageManifestPaths, 'examples/reference-host/package.json']) {
    const manifest = await readJson(new URL(path, root));
    if (packageManifestPaths.includes(path) && manifest.version !== plan.targetVersion) {
      throw new Error(
        `${path} is ${String(manifest.version)}; Changesets must generate ${plan.targetVersion}.`,
      );
    }
    updateInternalPins(manifest, plan.sourceVersion, plan.targetVersion, path);
    await writeJson(new URL(path, root), manifest);
  }
  const lockfile = await readJson(new URL('package-lock.json', root));
  for (const [path, manifest] of Object.entries(lockfile.packages ?? {})) {
    if (STUDIO_RELEASE_PACKAGES.some(({ name }) => name === manifest.name)) {
      if (![plan.sourceVersion, plan.targetVersion].includes(manifest.version)) {
        throw new Error(
          `package-lock.json ${path} is ${String(manifest.version)}, expected ${plan.sourceVersion} or ${plan.targetVersion}.`,
        );
      }
      manifest.version = plan.targetVersion;
    }
    updateInternalPins(
      manifest,
      plan.sourceVersion,
      plan.targetVersion,
      `package-lock.json ${path || '<root>'}`,
    );
  }
  await writeJson(new URL('package-lock.json', root), lockfile);
  const generated = buildStudioReleaseRecord(await readStudioReleaseInputs(root));
  if (generated.release !== plan.targetVersion) {
    throw new Error(
      `Changesets generated ${generated.release}; an RC correction must advance exactly to ${plan.targetVersion}.`,
    );
  }
  const bytes = serializeStudioReleaseRecord(generated);
  await Promise.all(
    STUDIO_RELEASE_RECORD_TARGETS.map((path) => writeFile(new URL(path, root), bytes)),
  );
}

export function prependPromotionChangelog(
  changelog,
  { channel, name, sourceVersion, targetVersion },
) {
  const heading = `# ${name}\n\n`;
  if (!changelog.startsWith(heading)) {
    throw new Error(`Changelog for ${name} does not start with its package heading.`);
  }
  if (changelog.includes(`\n## ${targetVersion}\n`)) {
    throw new Error(`Changelog for ${name} already contains ${targetVersion}.`);
  }
  const label = channel === 'rc' ? 'Release Candidate' : 'Stable Release';
  const note =
    channel === 'rc'
      ? `Promote the reviewed coordinated package family from \`${sourceVersion}\` to the first immutable release candidate. Runtime behavior is unchanged by this version transform.`
      : `Promote the Gate B-qualified \`${sourceVersion}\` candidate to the supported stable coordinate. Runtime behavior is unchanged by this version transform.`;
  const entry = `## ${targetVersion}\n\n### ${label}\n\n- ${note}\n\n`;
  return `${heading}${entry}${changelog.slice(heading.length)}`;
}

function updateInternalPins(document, sourceVersion, targetVersion, label) {
  for (const field of dependencyFields) {
    const dependencies = document[field];
    if (dependencies === undefined) {
      continue;
    }
    for (const { name } of STUDIO_RELEASE_PACKAGES) {
      if (dependencies[name] === undefined) {
        continue;
      }
      if (![sourceVersion, targetVersion].includes(dependencies[name])) {
        throw new Error(
          `${label} ${field}.${name} is ${String(dependencies[name])}, expected ${sourceVersion} or ${targetVersion}.`,
        );
      }
      dependencies[name] = targetVersion;
    }
  }
}

async function readJson(url) {
  return JSON.parse(await readFile(url, 'utf8'));
}

async function writeJson(url, value) {
  await writeFile(url, `${JSON.stringify(value, null, 2)}\n`);
}

async function main() {
  if (process.argv.length !== 2) {
    throw new Error('Usage: node scripts/prepare-promotion.mjs');
  }
  const candidateSha = process.env.PROMOTION_CANDIDATE_SHA ?? '';
  let candidateRecord;
  if (candidateSha.length > 0) {
    candidateRecord = JSON.parse(
      execFileSync('git', ['show', `${candidateSha}:studio-release.json`], {
        cwd: fileURLToPath(repositoryRoot),
        encoding: 'utf8',
      }),
    );
  }
  const plan = await preparePromotion(repositoryRoot, {
    candidateRecord,
    candidateSha,
    channel: process.env.PROMOTION_CHANNEL,
    evidenceSha: process.env.PROMOTION_GATE_RECORD_SHA ?? '',
    profiles: process.env.PROMOTION_PROFILES ?? '',
  });
  console.log(
    `Prepared coordinated Studio ${plan.operation} ${plan.sourceVersion} -> ${plan.targetVersion} ` +
      `for ${plan.channel} with ${plan.profiles.length} proposed profile claim(s).`,
  );
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
