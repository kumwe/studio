import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { STUDIO_RELEASE_PACKAGES } from './release-family.mjs';
import { RELEASE_PACKAGE_BUDGETS } from './release-asset-policy.mjs';
import { assertCoordinatedRelease } from './release-record.mjs';
import { assertPublishedPackageDistMinified } from './minify-package-dist.mjs';
import {
  assertPackagedStudioEnhancementRuntime,
  buildStudioEnhancementRuntimeAssets,
} from './studio-enhancement-artifacts.mjs';
import {
  assertApprovedBrowserArtifact,
  assertApprovedBrowserArtifactFiles,
  buildStudioBrowserReleaseArtifact,
} from './studio-browser-artifacts.mjs';

const execFileAsync = promisify(execFile);
const repositoryRoot = new URL('../', import.meta.url);
export const APPROVED_ARTIFACT_PATH = '.release-artifacts/approved-package-integrities.json';
export const APPROVED_ARTIFACT_DIRECTORY = '.release-artifacts/packages';

export async function buildApprovedReleaseArtifacts(
  root = repositoryRoot,
  {
    buildBrowserArtifact = buildStudioBrowserReleaseArtifact,
    packPackage = packPackageWithNpm,
  } = {},
) {
  const record = JSON.parse(await readFile(new URL('studio-release.json', root), 'utf8'));
  assertCoordinatedRelease(record);
  // Build first: the exact same self-contained browser module is then present
  // in @kumwe/studio's tarball and in the non-npm release archive.
  const firstBrowser = assertApprovedBrowserArtifact(
    await buildBrowserArtifact(root),
    record.release,
  );
  const browser = assertApprovedBrowserArtifact(await buildBrowserArtifact(root), record.release);
  for (const member of ['assetManifestSha256', 'integrity', 'sha256', 'sha512', 'size']) {
    if (firstBrowser[member] !== browser[member]) {
      throw new Error(`Two clean Studio browser archive builds differ (${member}).`);
    }
  }
  const firstEnhancement = await buildStudioEnhancementRuntimeAssets(root);
  const secondEnhancement = await buildStudioEnhancementRuntimeAssets(root);
  if (!firstEnhancement.bytes.equals(secondEnhancement.bytes)) {
    throw new Error('Two clean Studio enhancement runtime builds differ.');
  }
  const browserManifest = JSON.parse(
    await readFile(new URL('packages/studio-lit/dist/browser/studio-assets.json', root), 'utf8'),
  );
  const expectedEnhancement = browserManifest.assets?.find(
    (asset) => asset?.role === 'enhancement-runtime',
  );
  const packagedEnhancement = await assertPackagedStudioEnhancementRuntime(
    root,
    expectedEnhancement,
  );
  if (!packagedEnhancement.bytes.equals(secondEnhancement.bytes)) {
    throw new Error('Renderer-web and authoring-archive enhancement runtime bytes differ.');
  }
  const packages = {};
  for (const { directory, name } of STUDIO_RELEASE_PACKAGES) {
    const packageDirectory = fileURLToPath(new URL(`packages/${directory}/`, root));
    await assertPublishedPackageDistMinified(packageDirectory);
    const packInput = {
      directory: packageDirectory,
      name,
      outputDirectory: fileURLToPath(new URL(`${APPROVED_ARTIFACT_DIRECTORY}/`, root)),
      version: record.release,
    };
    const firstArtifact = await packPackage(packInput);
    const artifact = await packPackage(packInput);
    for (const member of ['integrity', 'sha256', 'sha512', 'shasum', 'size', 'version']) {
      if (firstArtifact[member] !== artifact[member]) {
        throw new Error(`Two clean npm package builds for ${name} differ (${member}).`);
      }
    }
    const path = approvedArtifactPath(directory, artifact.sha256);
    packages[name] = normalizeArtifact(
      { ...artifact, budgetBytes: RELEASE_PACKAGE_BUDGETS[name], path },
      name,
      record.release,
      path,
    );
  }
  return {
    browser,
    kind: 'studio-approved-package-artifacts',
    packages,
    release: record.release,
  };
}

export function assertApprovedReleaseArtifacts(document, record) {
  assertCoordinatedRelease(record);
  if (
    document === null ||
    typeof document !== 'object' ||
    Array.isArray(document) ||
    document.kind !== 'studio-approved-package-artifacts' ||
    document.browser === null ||
    typeof document.browser !== 'object' ||
    Array.isArray(document.browser) ||
    document.release !== record.release ||
    document.packages === null ||
    typeof document.packages !== 'object' ||
    Array.isArray(document.packages) ||
    Object.keys(document).sort().join('\n') !== 'browser\nkind\npackages\nrelease' ||
    Object.keys(document.packages).sort().join('\n') !==
      STUDIO_RELEASE_PACKAGES.map(({ name }) => name)
        .sort()
        .join('\n')
  ) {
    throw new Error('Approved package artifact manifest does not match the release family.');
  }
  assertApprovedBrowserArtifact(document.browser, record.release);
  for (const { name } of STUDIO_RELEASE_PACKAGES) {
    const { directory } = STUDIO_RELEASE_PACKAGES.find((entry) => entry.name === name);
    normalizeArtifact(
      document.packages[name],
      name,
      record.release,
      approvedArtifactPath(directory, document.packages[name]?.sha256),
    );
  }
}

export async function assertApprovedReleaseArtifactFiles(document, record, root = repositoryRoot) {
  assertApprovedReleaseArtifacts(document, record);
  await assertApprovedBrowserArtifactFiles(document.browser, record.release, root);
  for (const { name } of STUDIO_RELEASE_PACKAGES) {
    await assertApprovedReleaseArtifactFile(document.packages[name], name, root);
  }
}

export async function assertApprovedReleaseArtifactFile(approved, name, root = repositoryRoot) {
  const bytes = await readFile(new URL(approved.path, root));
  const actual = artifactFromBytes(bytes, approved.version);
  for (const member of ['integrity', 'sha256', 'sha512', 'shasum', 'size', 'version']) {
    if (actual[member] !== approved[member]) {
      throw new Error(
        `Retained tarball for ${name}@${approved.version} changed after local approval (${member}).`,
      );
    }
  }
}

export async function inspectExistingRegistryArtifacts(
  record,
  approved,
  { npmManifest = readOptionalNpmManifest } = {},
) {
  assertApprovedReleaseArtifacts(approved, record);
  const failures = [];
  const missing = [];
  for (const { name } of STUDIO_RELEASE_PACKAGES) {
    const version = record.packages[name];
    const manifest = await npmManifest(name, version);
    if (manifest === undefined) {
      missing.push(`${name}@${version}`);
      continue;
    }
    const expected = approved.packages[name];
    if (manifest.version !== version) {
      failures.push(`${name}@${version} returned version ${String(manifest.version)}`);
    }
    if (manifest.dist?.integrity !== expected.integrity) {
      failures.push(
        `${name}@${version} registry integrity differs from the approved local tarball`,
      );
    }
    if (manifest.dist?.shasum !== expected.shasum) {
      failures.push(`${name}@${version} registry shasum differs from the approved local tarball`);
    }
    if (
      typeof manifest.dist?.attestations?.url !== 'string' ||
      manifest.dist.attestations.url.length === 0
    ) {
      failures.push(`${name}@${version} has no npm provenance attestation`);
    }
  }
  return { failures, missing };
}

export async function writeApprovedReleaseArtifacts(root = repositoryRoot) {
  await rm(new URL(`${APPROVED_ARTIFACT_DIRECTORY}/`, root), { force: true, recursive: true });
  await mkdir(new URL(`${APPROVED_ARTIFACT_DIRECTORY}/`, root), { recursive: true });
  const document = await buildApprovedReleaseArtifacts(root);
  const output = new URL(APPROVED_ARTIFACT_PATH, root);
  await mkdir(new URL('.release-artifacts/', root), { recursive: true });
  await writeFile(output, `${JSON.stringify(document, null, 2)}\n`);
  return document;
}

async function packPackageWithNpm({ directory, name, outputDirectory, version }) {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'studio-approved-pack-'));
  try {
    const { stdout } = await execFileAsync(
      'npm',
      [
        'pack',
        '--json',
        '--ignore-scripts',
        '--workspaces=false',
        '--pack-destination',
        temporaryDirectory,
      ],
      { cwd: directory, maxBuffer: 5 * 1_024 * 1_024 },
    );
    const result = JSON.parse(stdout)[0];
    if (result?.name !== name || result?.version !== version) {
      throw new Error(`npm pack produced ${String(result?.name)}@${String(result?.version)}.`);
    }
    const fileName = basename(result.filename ?? '');
    if (fileName.length === 0 || fileName !== result.filename) {
      throw new Error(`npm pack returned unsafe filename ${String(result?.filename)}.`);
    }
    const bytes = await readFile(join(temporaryDirectory, fileName));
    const artifact = artifactFromBytes(bytes, version);
    const outputPath = join(
      outputDirectory,
      `${basename(directory)}-${artifact.sha256.slice(0, 16)}.tgz`,
    );
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, bytes);
    return artifact;
  } finally {
    await rm(temporaryDirectory, { force: true, recursive: true });
  }
}

export function artifactFromBytes(bytes, version) {
  return {
    integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}`,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    sha512: createHash('sha512').update(bytes).digest('hex'),
    shasum: createHash('sha1').update(bytes).digest('hex'),
    size: bytes.byteLength,
    version,
  };
}

function normalizeArtifact(artifact, name, version, expectedPath) {
  if (
    artifact === null ||
    typeof artifact !== 'object' ||
    Array.isArray(artifact) ||
    artifact.version !== version ||
    artifact.path !== expectedPath ||
    artifact.budgetBytes !== RELEASE_PACKAGE_BUDGETS[name] ||
    artifact.size > artifact.budgetBytes ||
    !/^sha512-[A-Za-z0-9+/]+={0,2}$/u.test(artifact.integrity) ||
    !/^[a-f0-9]{64}$/u.test(artifact.sha256) ||
    !/^[a-f0-9]{128}$/u.test(artifact.sha512) ||
    !/^[a-f0-9]{40}$/u.test(artifact.shasum) ||
    !Number.isSafeInteger(artifact.size) ||
    artifact.size <= 0 ||
    Object.keys(artifact).sort().join('\n') !==
      'budgetBytes\nintegrity\npath\nsha256\nsha512\nshasum\nsize\nversion'
  ) {
    throw new Error(`Approved artifact for ${name}@${version} has an invalid closed shape.`);
  }
  const encoded = Buffer.from(artifact.integrity.slice('sha512-'.length), 'base64').toString('hex');
  if (encoded !== artifact.sha512) {
    throw new Error(`Approved artifact for ${name}@${version} has inconsistent SHA-512 forms.`);
  }
  return { ...artifact };
}

function approvedArtifactPath(directory, sha256) {
  if (!/^[a-f0-9]{64}$/u.test(sha256)) {
    return `${APPROVED_ARTIFACT_DIRECTORY}/${directory}-invalid.tgz`;
  }
  return `${APPROVED_ARTIFACT_DIRECTORY}/${directory}-${sha256.slice(0, 16)}.tgz`;
}

async function readOptionalNpmManifest(name, version) {
  try {
    const { stdout } = await execFileAsync('npm', ['view', `${name}@${version}`, '--json'], {
      maxBuffer: 2 * 1_024 * 1_024,
    });
    return JSON.parse(stdout);
  } catch (error) {
    if (/\bE404\b/u.test(`${error?.stderr ?? ''}\n${error?.stdout ?? ''}`)) {
      return undefined;
    }
    throw error;
  }
}

async function main() {
  if (process.argv.length !== 2) {
    throw new Error('Usage: node scripts/release-artifacts.mjs');
  }
  const document = await writeApprovedReleaseArtifacts();
  console.log(
    `Approved local tarball digests generated for ${Object.keys(document.packages).length} ` +
      `packages at ${document.release}.`,
  );
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
