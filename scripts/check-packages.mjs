import { execFile } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

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
  if (packageLicense !== rootLicense) {
    throw new Error(`${manifest.name ?? packageName} does not carry the canonical license text.`);
  }
  if (typeof manifest.version !== 'string' || !manifest.version.includes('-')) {
    throw new Error(`${manifest.name ?? packageName} must remain a prerelease before Gate B.`);
  }

  const { stdout } = await execFileAsync(
    'npm',
    ['pack', '--dry-run', '--json', '--ignore-scripts'],
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
  for (const required of [
    'LICENSE',
    'README.md',
    'dist/index.d.ts',
    'dist/index.js',
    'package.json',
  ]) {
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
