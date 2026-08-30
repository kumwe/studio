import { readFile, stat } from 'node:fs/promises';
import { basename } from 'node:path';
import { pathToFileURL } from 'node:url';

import { assertApprovedBrowserArtifact } from './studio-browser-artifacts.mjs';

export function collectGithubReleaseFailures(metadata, notes, { assets, channel, version }) {
  const expectedTag = `studio-v${version}`;
  const failures = [];
  if (!['beta', 'rc', 'stable'].includes(channel)) {
    failures.push(`unsupported release channel ${String(channel)}`);
  }
  if (metadata?.tagName !== expectedTag) {
    failures.push(`tagName is ${String(metadata?.tagName)}, expected ${expectedTag}`);
  }
  if (metadata?.name !== `Studio ${version}`) {
    failures.push(`name is ${String(metadata?.name)}, expected Studio ${version}`);
  }
  if (metadata?.isDraft !== false) {
    failures.push('release must not be a draft');
  }
  if (metadata?.isPrerelease !== (channel === 'beta' || channel === 'rc')) {
    failures.push(`prerelease state does not match ${channel}`);
  }
  if (String(metadata?.body ?? '') !== notes) {
    failures.push('release notes differ from the generated immutable notes');
  }
  if (assets !== undefined) {
    const actual = Array.isArray(metadata?.assets)
      ? metadata.assets.map((asset) => ({ name: asset?.name, size: asset?.size }))
      : [];
    const expected = [...assets].sort((left, right) => left.name.localeCompare(right.name));
    actual.sort((left, right) => String(left.name).localeCompare(String(right.name)));
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      failures.push('release assets differ from the exact approved browser archive and checksum');
    }
  }
  return failures;
}

async function main() {
  if (process.argv.length !== 2) {
    throw new Error('Usage: node scripts/verify-github-release.mjs');
  }
  const [metadataSource, notes, approvedSource] = await Promise.all([
    readFile(new URL('../.release-artifacts/github-release.json', import.meta.url), 'utf8'),
    readFile(new URL('../release-notes.md', import.meta.url), 'utf8'),
    readFile(
      new URL('../.release-artifacts/approved-package-integrities.json', import.meta.url),
      'utf8',
    ),
  ]);
  const approved = JSON.parse(approvedSource);
  const browser = assertApprovedBrowserArtifact(
    approved.browser,
    process.env.GITHUB_RELEASE_VERSION,
  );
  const requireAssets = process.env.GITHUB_RELEASE_REQUIRE_ASSETS !== 'false';
  const assets = requireAssets
    ? await Promise.all(
        [browser.path, browser.checksumPath].map(async (path) => ({
          name: basename(path),
          size: (await stat(new URL(`../${path}`, import.meta.url))).size,
        })),
      )
    : undefined;
  const failures = collectGithubReleaseFailures(JSON.parse(metadataSource), notes, {
    assets,
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
