import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

import { STUDIO_RELEASE_PACKAGES } from './release-family.mjs';
import { assertCoordinatedRelease } from './release-record.mjs';

const execFileAsync = promisify(execFile);

export async function collectRegistryFailures(
  record,
  { distTag, npmJson = readNpmJson, requireProvenance = false } = {},
) {
  assertCoordinatedRelease(record);
  const failures = [];
  for (const { name } of STUDIO_RELEASE_PACKAGES) {
    const version = record.packages[name];
    let manifest;
    try {
      manifest = await npmJson(['view', `${name}@${version}`, '--json']);
    } catch {
      failures.push(`${name}@${version} is absent from npm`);
      continue;
    }
    if (manifest.version !== version) {
      failures.push(`${name}@${version} returned version ${String(manifest.version)}`);
    }
    if (
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

async function readNpmJson(arguments_) {
  const { stdout } = await execFileAsync('npm', arguments_, { maxBuffer: 2 * 1_024 * 1_024 });
  return JSON.parse(stdout);
}

async function main() {
  const record = JSON.parse(
    await readFile(new URL('../studio-release.json', import.meta.url), 'utf8'),
  );
  const failures = await collectRegistryFailures(record, {
    distTag: process.env.RELEASE_DIST_TAG,
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
