import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';

import { assertCoordinatedRelease } from './release-record.mjs';

const execFileAsync = promisify(execFile);
const record = JSON.parse(
  await readFile(new URL('../studio-release.json', import.meta.url), 'utf8'),
);
assertCoordinatedRelease(record);

const missing = [];
for (const [name, version] of Object.entries(record.packages)) {
  let published;
  try {
    const { stdout } = await execFileAsync('npm', ['view', `${name}@${version}`, 'version'], {
      maxBuffer: 1_024 * 1_024,
    });
    published = stdout.trim();
  } catch {
    published = undefined;
  }
  if (published !== version) {
    missing.push(`${name}@${version}`);
  }
}

if (missing.length > 0) {
  throw new Error(
    `The coordinated Studio release is incomplete on npm:\n${missing
      .map((entry) => `  ${entry}`)
      .join('\n')}`,
  );
}

console.log(`Published Studio release ${record.release} verified across all seven packages.`);
