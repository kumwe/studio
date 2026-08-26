import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { artifactFromBytes } from '../release-artifacts.mjs';
import { STUDIO_RELEASE_PACKAGES } from '../release-family.mjs';
import { loadProducerRuntime } from '../producer-evidence.mjs';
import { buildReproducibleEnvironment } from '../lib/reproducible-environment.mjs';

const execFileAsync = promisify(execFile);
const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
const laneId = 'release/reproducible-family-v1';
const runtime = await loadProducerRuntime(repositoryRoot, laneId);
const temporaryRoot = await mkdtemp(join(tmpdir(), 'studio-evidence-reproducible-'));

try {
  const passes = [];
  for (let pass = 0; pass < 2; pass += 1) {
    const passRoot = join(temporaryRoot, `pass-${pass + 1}`);
    const sourceRoot = join(passRoot, 'source');
    const destination = join(passRoot, 'packages');
    await mkdir(passRoot);
    await execFileAsync(
      'git',
      ['worktree', 'add', '--detach', sourceRoot, runtime.subject.candidateCommit],
      {
        cwd: repositoryRoot,
        maxBuffer: 5 * 1_024 * 1_024,
      },
    );
    const [userConfig, globalConfig] = [
      join(passRoot, 'empty-user.npmrc'),
      join(passRoot, 'empty-global.npmrc'),
    ];
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
      { cwd: sourceRoot, env: environment, maxBuffer: 10 * 1_024 * 1_024 },
    );
    await execFileAsync('npm', ['run', 'build'], {
      cwd: sourceRoot,
      env: environment,
      maxBuffer: 20 * 1_024 * 1_024,
    });
    const { stdout: isolatedTree } = await execFileAsync('git', ['rev-parse', 'HEAD^{tree}'], {
      cwd: sourceRoot,
    });
    if (isolatedTree.trim() !== runtime.subject.candidateTree) {
      throw new Error('Reproducibility pass checked out a substituted candidate tree.');
    }
    await mkdir(destination);
    const packages = new Map();
    for (const { directory, name } of STUDIO_RELEASE_PACKAGES) {
      const { stderr, stdout } = await execFileAsync(
        'npm',
        [
          'pack',
          '--json',
          '--ignore-scripts',
          '--workspaces=false',
          '--pack-destination',
          destination,
        ],
        {
          cwd: join(sourceRoot, 'packages', directory),
          env: environment,
          maxBuffer: 5 * 1_024 * 1_024,
        },
      );
      if (stderr) process.stderr.write(stderr);
      const packed = JSON.parse(stdout)[0];
      if (
        packed?.name !== name ||
        packed?.version !== runtime.subject.packages[name] ||
        basename(packed?.filename ?? '') !== packed?.filename
      ) {
        throw new Error(`npm pack produced an unexpected artifact for ${name}.`);
      }
      const bytes = await readFile(join(destination, packed.filename));
      packages.set(name, { bytes, ...artifactFromBytes(bytes, packed.version) });
    }
    passes.push(packages);
  }

  const approvedPackages = [];
  const reproducedPackages = [];
  for (const name of Object.keys(runtime.subject.packages).sort()) {
    const first = passes[0].get(name);
    const second = passes[1].get(name);
    if (first === undefined || second === undefined || !first.bytes.equals(second.bytes)) {
      throw new Error(`Two clean npm pack passes differ for ${name}.`);
    }
    approvedPackages.push({
      integrity: first.integrity,
      name,
      sha512: first.sha512,
      shasum: first.shasum,
      size: first.size,
      version: first.version,
    });
    reproducedPackages.push({
      byteIdentical: true,
      firstIntegrity: first.integrity,
      name,
      secondIntegrity: second.integrity,
      version: first.version,
    });
  }
  await runtime.write('release/approved-family-v1', { packages: approvedPackages });
  await runtime.write('release/reproducible-family-report-v1', {
    packages: reproducedPackages,
    passes: 2,
  });
  process.stdout.write('Two byte-identical npm pack passes verified for all eight packages.\n');
} finally {
  for (const pass of [2, 1]) {
    const sourceRoot = join(temporaryRoot, `pass-${pass}`, 'source');
    try {
      await execFileAsync('git', ['worktree', 'remove', '--force', sourceRoot], {
        cwd: repositoryRoot,
      });
    } catch {
      // The worktree may not have been created; the bounded temporary root is removed below.
    }
  }
  await rm(temporaryRoot, { force: true, recursive: true });
}
