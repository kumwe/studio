import { appendFile, readFile, readdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const repositoryRoot = new URL('../', import.meta.url);
const ignoredChangesetFiles = new Set(['AGENTS.md', 'CLAUDE.md', 'GEMINI.md', 'README.md']);

export async function inspectReleasePlan(root = repositoryRoot) {
  const changesetDirectory = new URL('.changeset/', root);
  const preState = JSON.parse(await readFile(new URL('pre.json', changesetDirectory), 'utf8'));
  const entries = await readdir(changesetDirectory, { withFileTypes: true });
  const pendingChangesets = entries
    .filter(
      (entry) =>
        entry.isFile() && entry.name.endsWith('.md') && !ignoredChangesetFiles.has(entry.name),
    )
    .map((entry) => entry.name.slice(0, -'.md'.length))
    .sort();

  if (preState === null || typeof preState !== 'object' || Array.isArray(preState)) {
    throw new Error('.changeset/pre.json must contain an object.');
  }
  if (preState.mode !== 'pre' && preState.mode !== 'exit') {
    throw new Error('.changeset/pre.json mode must be "pre" or "exit".');
  }
  if (typeof preState.tag !== 'string' || preState.tag.length === 0) {
    throw new Error('.changeset/pre.json tag must be a non-empty string.');
  }

  return {
    channel: preState.tag,
    hasPendingChangesets: pendingChangesets.length > 0,
    operation: pendingChangesets.length > 0 ? 'version' : 'publish',
    pendingChangesets,
    preMode: preState.mode,
  };
}

export function formatGitHubOutput(plan) {
  return [
    `channel=${plan.channel}`,
    `has_pending_changesets=${String(plan.hasPendingChangesets)}`,
    `operation=${plan.operation}`,
    `pre_mode=${plan.preMode}`,
  ].join('\n');
}

async function main() {
  const arguments_ = process.argv.slice(2);
  if (arguments_.length > 1 || (arguments_.length === 1 && arguments_[0] !== '--github-output')) {
    throw new Error('Usage: node scripts/release-plan.mjs [--github-output]');
  }

  const plan = await inspectReleasePlan();
  if (arguments_[0] === '--github-output') {
    const outputPath = process.env.GITHUB_OUTPUT;
    if (outputPath === undefined || outputPath.length === 0) {
      throw new Error('GITHUB_OUTPUT is required with --github-output.');
    }
    await appendFile(outputPath, `${formatGitHubOutput(plan)}\n`, 'utf8');
  }

  console.log(
    `Release plan: ${plan.operation} on ${plan.channel}; ` +
      `${plan.pendingChangesets.length} pending changeset(s).`,
  );
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
