import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import { STUDIO_RELEASE_PACKAGE_NAMES } from './release-family.mjs';
import { classifyReleaseVersion } from './release-policy.mjs';

const repositoryRoot = new URL('../', import.meta.url);
const shaPattern = /^[a-f0-9]{40}$/u;

export function buildReleaseNotes(
  record,
  { candidateSha, channel, expectedVersion = record.release, gateRecordSha },
) {
  if (
    !shaPattern.test(candidateSha) ||
    !shaPattern.test(gateRecordSha) ||
    classifyReleaseVersion(record.release) !== channel ||
    record.release !== expectedVersion
  ) {
    throw new Error(
      'Release-note inputs do not identify the published channel and immutable commits.',
    );
  }
  return [
    `# Studio ${record.release}`,
    '',
    `Coordinated ${channel === 'stable' ? 'stable' : 'release-candidate'} release of all eight Studio packages.`,
    '',
    `- Publication source: \`${candidateSha}\``,
    `- Gate/evidence record: \`${gateRecordSha}\``,
    `- Protocol: \`${record.protocolVersion}\``,
    `- Corpus: \`${record.corpusManifestDigest}\``,
    `- Claimed profiles: ${record.claimedProfiles.map((profile) => `\`${profile}\``).join(', ')}`,
    '',
    '## Package family',
    '',
    ...STUDIO_RELEASE_PACKAGE_NAMES.map((name) => `- \`${name}@${record.packages[name]}\``),
    '',
    'See the package changelogs and the immutable evidence commit for detailed changes, limitations, and review records.',
    '',
  ].join('\n');
}

async function main() {
  if (process.argv.length !== 2) {
    throw new Error('Usage: node scripts/generate-release-notes.mjs');
  }
  const record = JSON.parse(await readFile(new URL('studio-release.json', repositoryRoot), 'utf8'));
  process.stdout.write(
    buildReleaseNotes(record, {
      candidateSha: process.env.PROMOTION_PUBLISH_SOURCE_SHA,
      channel: process.env.PROMOTION_CHANNEL,
      expectedVersion: process.env.PROMOTION_EXPECTED_VERSION,
      gateRecordSha: process.env.PROMOTION_GATE_RECORD_SHA,
    }),
  );
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
