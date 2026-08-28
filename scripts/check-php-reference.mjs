import { execFile } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const phpRoots = [
  'examples/php-authoring-host/public',
  'examples/php-authoring-host/src',
  'examples/php-authoring-host/tests',
  'e2e/php-authoring-host',
];

const version = await runPhp(['-r', 'echo PHP_VERSION_ID;']);
const versionId = Number.parseInt(version.stdout.trim(), 10);
if (!Number.isSafeInteger(versionId) || versionId < 80_100) {
  throw new Error(
    `PHP reference qualification requires PHP 8.1 or newer; received ${version.stdout.trim() || 'an unreadable version'}.`,
  );
}

const phpFiles = [];
for (const root of phpRoots) {
  await collectPhpFiles(join(repositoryRoot, root), phpFiles);
}
phpFiles.sort();
if (phpFiles.length === 0) {
  throw new Error('PHP reference qualification found no PHP source files.');
}

for (const file of phpFiles) {
  const result = await runPhp(['-l', file]);
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
}

const unitResult = await runPhp(['examples/php-authoring-host/tests/run.php']);
process.stdout.write(unitResult.stdout);
process.stderr.write(unitResult.stderr);
console.log(`PHP reference qualification passed for ${phpFiles.length} source files.`);

async function collectPhpFiles(directory, output) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      await collectPhpFiles(path, output);
    } else if (entry.isFile() && entry.name.endsWith('.php')) {
      output.push(relative(repositoryRoot, path));
    }
  }
}

async function runPhp(arguments_) {
  try {
    return await execFileAsync('php', arguments_, {
      cwd: repositoryRoot,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
      windowsHide: true,
    });
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw new Error('PHP reference qualification requires the PHP CLI on PATH.', {
        cause: error,
      });
    }
    if (typeof error?.stdout === 'string') process.stdout.write(error.stdout);
    if (typeof error?.stderr === 'string') process.stderr.write(error.stderr);
    throw error;
  }
}
