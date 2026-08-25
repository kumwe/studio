import { execFileSync } from 'node:child_process';
import { access, readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repositoryRoot = new URL('../', import.meta.url);

export function inspectEnvironment({
  browserInstalled,
  dependenciesInstalled,
  isShallowRepository,
  nodeVersion,
  npmVersion,
  packageManager,
}) {
  const failures = [];
  const expectedNpm = /^npm@(.+)$/u.exec(packageManager)?.[1];
  const nodeMajor = Number.parseInt(nodeVersion.split('.')[0] ?? '', 10);

  if (!Number.isInteger(nodeMajor) || nodeMajor !== 24) {
    failures.push(`Node 24 is required; found ${nodeVersion}.`);
  }
  if (expectedNpm === undefined || npmVersion !== expectedNpm) {
    failures.push(`npm ${expectedNpm ?? 'from packageManager'} is required; found ${npmVersion}.`);
  }
  if (isShallowRepository) {
    failures.push('A full Git history is required; unshallow the repository before working.');
  }
  if (!dependenciesInstalled) {
    failures.push('Locked dependencies are absent; run npm ci.');
  }
  if (!browserInstalled) {
    failures.push('Playwright Chromium is absent; run npx playwright install chromium.');
  }

  return failures;
}

async function exists(url) {
  try {
    await access(url);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  if (process.argv.length !== 2) {
    throw new Error('Usage: node scripts/doctor.mjs');
  }

  const manifest = JSON.parse(await readFile(new URL('package.json', repositoryRoot), 'utf8'));
  const npmVersion = execFileSync('npm', ['--version'], { encoding: 'utf8' }).trim();
  const shallow =
    execFileSync('git', ['rev-parse', '--is-shallow-repository'], {
      cwd: fileURLToPath(repositoryRoot),
      encoding: 'utf8',
    }).trim() === 'true';
  const dependenciesInstalled = await exists(
    new URL('node_modules/.package-lock.json', repositoryRoot),
  );

  let browserInstalled = false;
  if (dependenciesInstalled) {
    try {
      const { chromium } = await import('@playwright/test');
      browserInstalled = await exists(pathToFileURL(chromium.executablePath()));
    } catch {
      browserInstalled = false;
    }
  }

  const failures = inspectEnvironment({
    browserInstalled,
    dependenciesInstalled,
    isShallowRepository: shallow,
    nodeVersion: process.versions.node,
    npmVersion,
    packageManager: manifest.packageManager,
  });
  if (failures.length > 0) {
    throw new Error(`Environment is not ready:\n- ${failures.join('\n- ')}`);
  }

  console.log(
    `Environment ready: Node ${process.versions.node}, npm ${npmVersion}, full Git history, ` +
      'locked dependencies, and Playwright Chromium.',
  );
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
