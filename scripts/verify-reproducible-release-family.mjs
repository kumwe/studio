import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { buildReproducibleEnvironment } from './lib/reproducible-environment.mjs';
import { STUDIO_RELEASE_PACKAGES } from './release-family.mjs';

const execFileAsync = promisify(execFile);
const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));

/**
 * Build and pack the committed release family twice in isolated, credential-free
 * worktrees. This is the publication gate; evidence generation separately binds
 * the same proof to an RC candidate record.
 */
export async function verifyReproducibleReleaseFamily(root = repositoryRoot) {
  const [{ stdout }, { stdout: status }, releaseSource] = await Promise.all([
    execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: root }),
    execFileAsync('git', ['status', '--porcelain=v1', '--untracked-files=all'], { cwd: root }),
    readFile(join(root, 'studio-release.json'), 'utf8'),
  ]);
  const commit = stdout.trim();
  if (!/^[a-f0-9]{40}$/u.test(commit)) throw new Error('Cannot resolve release source commit.');
  if (status.trim().length !== 0) {
    throw new Error(
      'Release reproducibility refuses a dirty worktree; commit the exact publication tree first.',
    );
  }
  const release = JSON.parse(releaseSource);
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'studio-release-reproducible-'));
  const passes = [];
  try {
    for (let pass = 0; pass < 2; pass += 1) {
      const passRoot = join(temporaryRoot, `pass-${pass + 1}`);
      const sourceRoot = join(passRoot, 'source');
      const packageRoot = join(passRoot, 'packages');
      await mkdir(passRoot);
      await execFileAsync('git', ['worktree', 'add', '--detach', sourceRoot, commit], {
        cwd: root,
        maxBuffer: 5 * 1_024 * 1_024,
      });
      const userConfig = join(passRoot, 'empty-user.npmrc');
      const globalConfig = join(passRoot, 'empty-global.npmrc');
      await Promise.all([
        ...['home', 'tmp', 'xdg-cache', 'xdg-config'].map((directory) =>
          mkdir(join(passRoot, directory)),
        ),
        writeFile(userConfig, ''),
        writeFile(globalConfig, ''),
      ]);
      const environment = buildReproducibleEnvironment(passRoot, userConfig, globalConfig);
      await execFileAsync(
        'npm',
        [
          'ci',
          '--ignore-scripts',
          '--no-audit',
          '--no-fund',
          `--userconfig=${userConfig}`,
          `--globalconfig=${globalConfig}`,
        ],
        { cwd: sourceRoot, env: environment, maxBuffer: 20 * 1_024 * 1_024 },
      );
      await execFileAsync('npm', ['run', 'build'], {
        cwd: sourceRoot,
        env: environment,
        maxBuffer: 30 * 1_024 * 1_024,
      });
      await mkdir(packageRoot);
      const packages = new Map();
      for (const { directory, name } of STUDIO_RELEASE_PACKAGES) {
        const { stdout: packedOutput } = await execFileAsync(
          'npm',
          [
            'pack',
            '--json',
            '--ignore-scripts',
            '--workspaces=false',
            '--pack-destination',
            packageRoot,
          ],
          {
            cwd: join(sourceRoot, 'packages', directory),
            env: environment,
            maxBuffer: 5 * 1_024 * 1_024,
          },
        );
        const packed = JSON.parse(packedOutput)[0];
        if (
          packed?.name !== name ||
          packed?.version !== release.packages?.[name] ||
          basename(packed?.filename ?? '') !== packed?.filename
        ) {
          throw new Error(`Clean npm pack produced an unexpected artifact for ${name}.`);
        }
        packages.set(name, await readFile(join(packageRoot, packed.filename)));
      }
      passes.push(packages);
    }
    assertReproduciblePackagePasses(passes);
    return { commit, packages: STUDIO_RELEASE_PACKAGES.length, passes: passes.length };
  } finally {
    for (const pass of [2, 1]) {
      try {
        await execFileAsync(
          'git',
          ['worktree', 'remove', '--force', join(temporaryRoot, `pass-${pass}`, 'source')],
          { cwd: root },
        );
      } catch {
        // A failed setup may not have created both bounded temporary worktrees.
      }
    }
    await rm(temporaryRoot, { force: true, recursive: true });
  }
}

export function assertReproduciblePackagePasses(passes) {
  if (!Array.isArray(passes) || passes.length !== 2) {
    throw new Error('Release reproducibility requires exactly two clean package passes.');
  }
  for (const { name } of STUDIO_RELEASE_PACKAGES) {
    const first = passes[0]?.get(name);
    const second = passes[1]?.get(name);
    if (!Buffer.isBuffer(first) || !Buffer.isBuffer(second) || !first.equals(second)) {
      throw new Error(`Two clean release builds differ for ${name}.`);
    }
  }
}

async function main() {
  if (process.argv.length !== 2) {
    throw new Error('Usage: node scripts/verify-reproducible-release-family.mjs');
  }
  const result = await verifyReproducibleReleaseFamily();
  console.log(
    `Two isolated clean builds produced byte-identical tarballs for ${result.packages} packages at ${result.commit}.`,
  );
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
