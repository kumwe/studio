import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import { STUDIO_RELEASE_PACKAGES } from './release-family.mjs';
import { assertCoordinatedRelease } from './release-record.mjs';

const repositoryRoot = new URL('../', import.meta.url);
const dependencyFields = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
];
const packageNames = new Set(STUDIO_RELEASE_PACKAGES.map(({ name }) => name));

export async function checkReleasePins(root = repositoryRoot) {
  const record = await readJson(new URL('studio-release.json', root));
  assertCoordinatedRelease(record);
  const expectedVersion = record.release;
  const failures = [];

  for (const { directory, name } of STUDIO_RELEASE_PACKAGES) {
    const path = `packages/${directory}/package.json`;
    const manifest = await readJson(new URL(path, root));
    if (manifest.name !== name || manifest.version !== expectedVersion) {
      failures.push(
        `${path} must declare ${name}@${expectedVersion}; found ${String(manifest.name)}@${String(manifest.version)}`,
      );
    }
    collectPinFailures(manifest, path, expectedVersion, failures);
  }

  const referenceHostPath = 'examples/reference-host/package.json';
  collectPinFailures(
    await readJson(new URL(referenceHostPath, root)),
    referenceHostPath,
    expectedVersion,
    failures,
  );

  const lockfile = await readJson(new URL('package-lock.json', root));
  for (const [path, manifest] of Object.entries(lockfile.packages ?? {})) {
    const label = `package-lock.json packages[${JSON.stringify(path)}]`;
    if (packageNames.has(manifest.name) && manifest.version !== expectedVersion) {
      failures.push(
        `${label} must be ${manifest.name}@${expectedVersion}; found ${String(manifest.version)}`,
      );
    }
    collectPinFailures(manifest, label, expectedVersion, failures);
  }

  if (failures.length > 0) {
    throw new Error(`Coordinated release pins drifted:\n- ${failures.join('\n- ')}`);
  }
  return { packageCount: STUDIO_RELEASE_PACKAGES.length, version: expectedVersion };
}

function collectPinFailures(document, label, expectedVersion, failures) {
  for (const field of dependencyFields) {
    for (const [name, version] of Object.entries(document[field] ?? {})) {
      if (packageNames.has(name) && version !== expectedVersion) {
        failures.push(
          `${label} ${field}.${name} must be exactly ${expectedVersion}; found ${version}`,
        );
      }
    }
  }
}

async function readJson(url) {
  return JSON.parse(await readFile(url, 'utf8'));
}

async function main() {
  const result = await checkReleasePins();
  console.log(
    `All ${result.packageCount} Studio manifests, internal dependencies, host pins, and lockfile entries agree on ${result.version}.`,
  );
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
