import { execFile } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { classifyReleaseVersion } from './release-policy.mjs';

const execFileAsync = promisify(execFile);

const packagesDirectory = new URL('../packages/', import.meta.url);
const rootLicense = await readFile(new URL('../LICENSE', import.meta.url), 'utf8');
const packageNames = (await readdir(packagesDirectory, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

for (const packageName of packageNames) {
  const packageDirectory = new URL(`${packageName}/`, packagesDirectory);
  const manifest = JSON.parse(await readFile(new URL('package.json', packageDirectory), 'utf8'));
  const packageLicense = await readFile(new URL('LICENSE', packageDirectory), 'utf8');

  if (manifest.license !== 'MIT') {
    throw new Error(`${manifest.name ?? packageName} must declare the MIT license.`);
  }
  if (!Array.isArray(manifest.files) || !manifest.files.includes('LICENSE')) {
    throw new Error(
      `${manifest.name ?? packageName} must include LICENSE in its package allowlist.`,
    );
  }
  if (!manifest.files.includes('THIRD_PARTY_NOTICES.md')) {
    throw new Error(
      `${manifest.name ?? packageName} must include THIRD_PARTY_NOTICES.md in its package allowlist.`,
    );
  }
  if (!manifest.files.includes('third-party-licenses')) {
    throw new Error(
      `${manifest.name ?? packageName} must include third-party-licenses in its package allowlist.`,
    );
  }
  if (packageLicense !== rootLicense) {
    throw new Error(`${manifest.name ?? packageName} does not carry the canonical license text.`);
  }
  if (classifyReleaseVersion(manifest.version) === undefined) {
    throw new Error(
      `${manifest.name ?? packageName} must use a governed numeric beta, rc, or stable coordinate.`,
    );
  }
  // Provenance-signed publishes verify repository.url against the repository
  // named in the signed build environment; an absent or mismatched field is
  // rejected by the registry at publish time (E422).
  if (
    manifest.repository?.type !== 'git' ||
    manifest.repository.url !== 'git+https://github.com/kumwe/studio.git' ||
    manifest.repository.directory !== `packages/${packageName}`
  ) {
    throw new Error(
      `${manifest.name ?? packageName} must declare the canonical repository with its package directory.`,
    );
  }

  const { stdout } = await execFileAsync(
    'npm',
    ['pack', '--dry-run', '--json', '--ignore-scripts', '--workspaces=false'],
    {
      cwd: fileURLToPath(packageDirectory),
      maxBuffer: 5 * 1_024 * 1_024,
    },
  );
  const packResult = JSON.parse(stdout);
  const packedFiles = packResult[0]?.files?.map((entry) => entry.path);
  if (!Array.isArray(packedFiles)) {
    throw new Error(
      `${manifest.name ?? packageName} did not produce an inspectable pack manifest.`,
    );
  }
  const requiredFiles = [
    'LICENSE',
    'README.md',
    'THIRD_PARTY_NOTICES.md',
    'dist/index.d.ts',
    'dist/index.js',
    'package.json',
  ];
  if (manifest.name === '@kumwe/studio-protocol') {
    requiredFiles.push('schemas/studio-release.schema.json', 'studio-release.json');
  }
  if (manifest.name === '@kumwe/studio-testkit') {
    requiredFiles.push('studio-release.json');
  }
  for (const required of requiredFiles) {
    if (!packedFiles.includes(required)) {
      throw new Error(`${manifest.name ?? packageName} tarball is missing ${required}.`);
    }
  }
  const forbidden = packedFiles.find(
    (path) =>
      path.endsWith('.tsbuildinfo') ||
      path.startsWith('src/') ||
      path.startsWith('test/') ||
      path.includes('/src/') ||
      path.includes('/test/'),
  );
  if (forbidden !== undefined) {
    throw new Error(
      `${manifest.name ?? packageName} tarball includes forbidden file ${forbidden}.`,
    );
  }
}

console.log(
  `${packageNames.length} publishable package manifests, licenses, and tarball contents verified.`,
);
