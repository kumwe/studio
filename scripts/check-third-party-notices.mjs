import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { collectWorkspaceEvidence } from './lib/third-party-notices.mjs';

const rootDirectory = fileURLToPath(new URL('../', import.meta.url));
const packages = await collectWorkspaceEvidence(rootDirectory);

for (const { packageEntry, evidence } of packages) {
  const noticesFile = path.join(packageEntry.directory, 'THIRD_PARTY_NOTICES.md');
  let actualNotice;
  try {
    actualNotice = await readFile(noticesFile, 'utf8');
  } catch {
    throw new Error(`${packageEntry.manifest.name} is missing THIRD_PARTY_NOTICES.md.`);
  }
  if (actualNotice !== evidence.notice) {
    throw new Error(
      `${packageEntry.manifest.name} has stale THIRD_PARTY_NOTICES.md; run npm run licenses:generate.`,
    );
  }

  const licensesDirectory = path.join(packageEntry.directory, 'third-party-licenses');
  let actualFiles = [];
  try {
    actualFiles = (await readdir(licensesDirectory)).sort();
  } catch {
    if (evidence.licenses.size > 0) {
      throw new Error(`${packageEntry.manifest.name} is missing third-party-licenses/.`);
    }
  }
  const expectedFiles = [...evidence.licenses.keys()].sort();
  if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) {
    throw new Error(
      `${packageEntry.manifest.name} has stale third-party license files; run npm run licenses:generate.`,
    );
  }
  for (const file of expectedFiles) {
    const actual = await readFile(path.join(licensesDirectory, file), 'utf8');
    if (actual !== evidence.licenses.get(file)) {
      throw new Error(`${packageEntry.manifest.name} has stale license evidence ${file}.`);
    }
  }
}

console.log(`${packages.length} lock-derived third-party notice bundle(s) verified.`);
