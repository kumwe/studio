import { execFileSync } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { assertSecretDetectorSelfTest, scanSecretLine } from './lib/secret-detector.mjs';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const maximumFileBytes = 1024 * 1024;
const ALLOWLIST = [];
const binaryExtensions = new Set([
  '.avif',
  '.eot',
  '.gif',
  '.gz',
  '.ico',
  '.jar',
  '.jpeg',
  '.jpg',
  '.mp3',
  '.mp4',
  '.otf',
  '.pdf',
  '.png',
  '.tar',
  '.tgz',
  '.ttf',
  '.wasm',
  '.webm',
  '.webp',
  '.woff',
  '.woff2',
  '.zip',
]);

const detectorCount = assertSecretDetectorSelfTest();
const repositoryOutput = execFileSync(
  'git',
  ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
  {
    cwd: repositoryRoot,
    encoding: 'utf8',
  },
);
const repositoryFiles = repositoryOutput.split('\0').filter((path) => path.length > 0);
const failures = [];
let scannedFileCount = 0;
let skippedFileCount = 0;
for (const path of repositoryFiles) {
  if (ALLOWLIST.includes(path) || binaryExtensions.has(extname(path).toLowerCase())) {
    skippedFileCount += 1;
    continue;
  }
  const absolutePath = join(repositoryRoot, path);
  if ((await stat(absolutePath)).size > maximumFileBytes) {
    skippedFileCount += 1;
    continue;
  }
  const source = await readFile(absolutePath, 'utf8');
  scannedFileCount += 1;
  for (const [index, line] of source.split(/\r?\n/u).entries()) {
    for (const finding of scanSecretLine(line)) {
      failures.push(`${path}:${index + 1}: matches the ${finding} pattern`);
    }
  }
}

if (failures.length > 0) {
  throw new Error(`Potential secrets detected:\n${failures.join('\n')}`);
}

console.log(
  `${detectorCount} secret patterns passed the embedded self-check; ${scannedFileCount} ` +
    `tracked and untracked repository files scanned (${skippedFileCount} skipped) with no secrets detected.`,
);

export { scanSecretLine as scanLine } from './lib/secret-detector.mjs';
