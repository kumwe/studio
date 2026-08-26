import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export function collectGithubReleaseFailures(metadata, notes, { channel, version }) {
  const expectedTag = `studio-v${version}`;
  const failures = [];
  if (metadata?.tagName !== expectedTag) {
    failures.push(`tagName is ${String(metadata?.tagName)}, expected ${expectedTag}`);
  }
  if (metadata?.name !== `Studio ${version}`) {
    failures.push(`name is ${String(metadata?.name)}, expected Studio ${version}`);
  }
  if (metadata?.isDraft !== false) {
    failures.push('release must not be a draft');
  }
  if (metadata?.isPrerelease !== (channel === 'rc')) {
    failures.push(`prerelease state does not match ${channel}`);
  }
  if (String(metadata?.body ?? '') !== notes) {
    failures.push('release notes differ from the generated immutable notes');
  }
  return failures;
}

async function main() {
  if (process.argv.length !== 2) {
    throw new Error('Usage: node scripts/verify-github-release.mjs');
  }
  const [metadataSource, notes] = await Promise.all([
    readFile(new URL('../.release-artifacts/github-release.json', import.meta.url), 'utf8'),
    readFile(new URL('../release-notes.md', import.meta.url), 'utf8'),
  ]);
  const failures = collectGithubReleaseFailures(JSON.parse(metadataSource), notes, {
    channel: process.env.GITHUB_RELEASE_CHANNEL,
    version: process.env.GITHUB_RELEASE_VERSION,
  });
  if (failures.length > 0) {
    throw new Error(`GitHub release metadata is unsafe to recover:\n- ${failures.join('\n- ')}`);
  }
  console.log(`GitHub release metadata verified for Studio ${process.env.GITHUB_RELEASE_VERSION}.`);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
