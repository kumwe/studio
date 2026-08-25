import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { STUDIO_RELEASE_PACKAGES, STUDIO_RELEASE_PACKAGE_NAMES } from './release-family.mjs';

const semanticVersionPattern =
  /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-((?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/u;
const integrityPattern = /^sha256-[A-Za-z0-9+/]{42}[AEIMQUYcgkosw048]=$/u;

// A profile belongs here only after its exact replay and independent review are
// represented by immutable evidence. The current programme has no such claim.
export const CURRENT_CLAIMED_PROFILES = Object.freeze([]);

export async function readStudioReleaseInputs(repositoryRoot) {
  const packages = {};
  for (const { directory, name } of STUDIO_RELEASE_PACKAGES) {
    const manifest = await readJson(new URL(`packages/${directory}/package.json`, repositoryRoot));
    if (manifest.name !== name) {
      throw new Error(
        `Release-family directory packages/${directory} declares ${String(manifest.name)}, expected ${name}.`,
      );
    }
    packages[name] = manifest.version;
  }

  const protocolSource = await readFile(
    new URL('packages/protocol/src/types.ts', repositoryRoot),
    'utf8',
  );
  const { contractVersion, protocolVersion } = parseProtocolConstants(protocolSource);
  const corpusManifest = await readFile(
    new URL('packages/testkit/corpus-manifest.json', repositoryRoot),
  );

  return {
    claimedProfiles: [...CURRENT_CLAIMED_PROFILES],
    contractVersion,
    corpusManifestDigest: sha256Integrity(corpusManifest),
    packages,
    protocolVersion,
  };
}

export function buildStudioReleaseRecord(inputs) {
  assertExactPackageSet(inputs.packages);
  assertSemanticVersion(inputs.protocolVersion, 'protocolVersion');
  if (typeof inputs.contractVersion !== 'string' || inputs.contractVersion.length === 0) {
    throw new Error('contractVersion must be a non-empty string.');
  }
  if (!integrityPattern.test(inputs.corpusManifestDigest)) {
    throw new Error('corpusManifestDigest must be a sha256 SRI value.');
  }
  if (!Array.isArray(inputs.claimedProfiles)) {
    throw new Error('claimedProfiles must be an array.');
  }

  return {
    contractVersion: inputs.contractVersion,
    kind: 'studio-release',
    release: inputs.packages['@kumwe/studio'],
    packages: Object.fromEntries(
      STUDIO_RELEASE_PACKAGE_NAMES.map((name) => [name, inputs.packages[name]]),
    ),
    protocolVersion: inputs.protocolVersion,
    corpusManifestDigest: inputs.corpusManifestDigest,
    claimedProfiles: [...inputs.claimedProfiles].sort(),
  };
}

export function serializeStudioReleaseRecord(record) {
  return `${JSON.stringify(record, null, 2)}\n`;
}

export function assertCoordinatedRelease(record) {
  const drift = STUDIO_RELEASE_PACKAGE_NAMES.filter(
    (name) => record.packages[name] !== record.release,
  );
  if (drift.length > 0) {
    throw new Error(
      `Studio release ${record.release} is not publishable as one coordinate; version drift: ${drift
        .map((name) => `${name}@${record.packages[name]}`)
        .join(', ')}. Run npm run version-packages.`,
    );
  }
}

export function parseProtocolConstants(source) {
  const contractVersion = extractConstant(source, 'STUDIO_CONTRACT_VERSION');
  const protocolVersion = extractConstant(source, 'STUDIO_WIRE_PROTOCOL_VERSION');
  return { contractVersion, protocolVersion };
}

export function sha256Integrity(bytes) {
  return `sha256-${createHash('sha256').update(bytes).digest('base64')}`;
}

function assertExactPackageSet(packages) {
  if (packages === null || typeof packages !== 'object' || Array.isArray(packages)) {
    throw new Error('packages must be an object.');
  }
  const actual = Object.keys(packages).sort();
  const expected = [...STUDIO_RELEASE_PACKAGE_NAMES].sort();
  if (actual.join('\n') !== expected.join('\n')) {
    throw new Error(
      `Release package set differs from the fixed eight-package family. Expected ${expected.join(', ')}; got ${actual.join(', ')}.`,
    );
  }
  for (const name of STUDIO_RELEASE_PACKAGE_NAMES) {
    assertSemanticVersion(packages[name], `packages[${JSON.stringify(name)}]`);
  }
}

function assertSemanticVersion(value, label) {
  if (typeof value !== 'string' || !semanticVersionPattern.test(value)) {
    throw new Error(`${label} must be a semantic version.`);
  }
}

function extractConstant(source, name) {
  const match = new RegExp(`^export const ${name} = ["']([^"']+)["'] as const;$`, 'mu').exec(
    source,
  );
  if (match === null) {
    throw new Error(`Could not read ${name} from packages/protocol/src/types.ts.`);
  }
  return match[1];
}

async function readJson(url) {
  return JSON.parse(await readFile(url, 'utf8'));
}
