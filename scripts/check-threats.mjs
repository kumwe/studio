import { access, readFile } from 'node:fs/promises';

const registryUrl = new URL('../docs/contracts/security-threats.md', import.meta.url);
const registry = await readFile(registryUrl, 'utf8');

const rows = registry
  .split('\n')
  .filter((line) => /^\| TH-[0-9]{3} \|/u.test(line))
  .map((line) => line.split('|').map((cell) => cell.trim()));

if (rows.length === 0) {
  throw new Error('The threat enforcement registry declares no threats.');
}

const identifiers = new Set();
for (const row of rows) {
  const [, id, threat, enforcement] = row;
  if (id === undefined || threat === undefined || !enforcement) {
    throw new Error(`Malformed registry row: ${row.join(' | ')}`);
  }
  if (identifiers.has(id)) {
    throw new Error(`Threat identifier ${id} is duplicated.`);
  }
  identifiers.add(id);
  if (threat.length === 0) {
    throw new Error(`Threat ${id} is missing its statement.`);
  }
  if (enforcement === 'open') {
    continue;
  }
  try {
    await access(new URL(`../${enforcement}`, import.meta.url));
  } catch {
    throw new Error(
      `Threat ${id} points at ${enforcement}, which does not exist in the repository.`,
    );
  }
}

const open = rows.filter((row) => row[3] === 'open').length;
console.log(
  `${rows.length} threat enforcements verified (${rows.length - open} enforced, ${open} open).`,
);
