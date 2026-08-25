import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { collectWorkspaceEvidence } from './lib/third-party-notices.mjs';

const rootDirectory = fileURLToPath(new URL('../', import.meta.url));
const packages = await collectWorkspaceEvidence(rootDirectory);

for (const { packageEntry, evidence } of packages) {
  const noticesFile = path.join(packageEntry.directory, 'THIRD_PARTY_NOTICES.md');
  const licensesDirectory = path.join(packageEntry.directory, 'third-party-licenses');
  await writeFile(noticesFile, evidence.notice);
  await rm(licensesDirectory, { force: true, recursive: true });
  if (evidence.licenses.size > 0) {
    await mkdir(licensesDirectory, { recursive: true });
    for (const [file, text] of [...evidence.licenses.entries()].sort(([left], [right]) =>
      left.localeCompare(right),
    )) {
      await writeFile(path.join(licensesDirectory, file), text);
    }
  }
}

const dependencyCount = packages.reduce(
  (count, entry) => count + entry.evidence.dependencies.length,
  0,
);
console.log(
  `${packages.length} package notice bundle(s) generated with ${dependencyCount} lock-derived runtime dependency record(s).`,
);
