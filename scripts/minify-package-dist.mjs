import { lstat, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { basename, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { STUDIO_RELEASE_PACKAGES } from './release-family.mjs';
import { minifyReleaseCss, minifyReleaseJavaScript } from './release-asset-policy.mjs';

const repositoryRoot = resolve(fileURLToPath(new URL('../', import.meta.url)));

export async function minifyPublishedPackageDist(packageDirectory) {
  const directory = resolve(packageDirectory);
  const dist = join(directory, 'dist');
  const files = await filesUnder(dist);
  const modules = packageModules(files);

  for (const path of modules) {
    const source = await readFile(path, 'utf8');
    const minified = await minifyReleaseJavaScript(source, {
      fileName: repositoryPath(repositoryRoot, path),
      format: moduleFormat(path),
    });
    await writeFile(path, minified, 'utf8');
  }
  for (const path of files.filter((candidate) => candidate.endsWith('.css'))) {
    const source = await readFile(path);
    await writeFile(
      path,
      minifyReleaseCss(source, { fileName: repositoryPath(repositoryRoot, path) }),
    );
  }
  for (const path of files.filter((candidate) => /\.(?:cjs|js|mjs|css)\.map$/u.test(candidate))) {
    await rm(path);
  }
  await assertPublishedPackageDistMinified(directory);
  return { modules: modules.length };
}

export async function assertPublishedPackageDistMinified(packageDirectory) {
  const directory = resolve(packageDirectory);
  const dist = join(directory, 'dist');
  const files = await filesUnder(dist);
  const sourceMap = files.find((path) => /\.(?:cjs|js|mjs|css)\.map$/u.test(path));
  if (sourceMap !== undefined) {
    throw new Error(
      `Published package ${basename(directory)} contains invalidated JavaScript source map ` +
        `${repositoryPath(directory, sourceMap)}.`,
    );
  }
  for (const path of packageModules(files)) {
    const source = await readFile(path, 'utf8');
    const minified = await minifyReleaseJavaScript(source, {
      fileName: repositoryPath(repositoryRoot, path),
      format: moduleFormat(path),
    });
    if (source !== minified) {
      throw new Error(
        `Published package module ${repositoryPath(repositoryRoot, path)} is not deterministically minified.`,
      );
    }
  }
  for (const path of files.filter((candidate) => candidate.endsWith('.css'))) {
    const source = await readFile(path);
    const minified = minifyReleaseCss(source, {
      fileName: repositoryPath(repositoryRoot, path),
    });
    if (!source.equals(minified)) {
      throw new Error(
        `Published package stylesheet ${repositoryPath(repositoryRoot, path)} is not deterministically minified.`,
      );
    }
  }
}

function packageModules(files) {
  return files.filter((path) => /\.(?:cjs|js|mjs)$/u.test(path));
}

function moduleFormat(path) {
  return path.endsWith('.cjs') ||
    /^studio-enhancements-[a-f0-9]{16}\.min\.js$/u.test(basename(path))
    ? 'iife'
    : 'esm';
}

async function filesUnder(directory) {
  const result = [];
  for (const name of (await readdir(directory)).sort((left, right) => left.localeCompare(right))) {
    const path = join(directory, name);
    const information = await lstat(path);
    if (information.isSymbolicLink()) {
      throw new Error(`Published package dist cannot contain symbolic link ${path}.`);
    }
    if (information.isDirectory()) result.push(...(await filesUnder(path)));
    else if (information.isFile()) result.push(path);
    else throw new Error(`Published package dist contains non-regular entry ${path}.`);
  }
  return result;
}

function repositoryPath(root, path) {
  return relative(resolve(root), resolve(path)).split(sep).join('/');
}

async function main() {
  const packageIndex = process.argv.indexOf('--package');
  if (packageIndex !== -1) {
    const directory = process.argv[packageIndex + 1];
    if (directory === undefined || process.argv.length !== 4) {
      throw new Error('Usage: node scripts/minify-package-dist.mjs --package <directory>');
    }
    const result = await minifyPublishedPackageDist(resolve(repositoryRoot, directory));
    console.log(`Deterministically minified ${result.modules} package modules in ${directory}.`);
    return;
  }
  if (process.argv.length !== 2) {
    throw new Error('Usage: node scripts/minify-package-dist.mjs [--package <directory>]');
  }
  let total = 0;
  for (const { directory } of STUDIO_RELEASE_PACKAGES) {
    const result = await minifyPublishedPackageDist(join(repositoryRoot, 'packages', directory));
    total += result.modules;
  }
  console.log(`Deterministically minified ${total} modules across the fixed package family.`);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
