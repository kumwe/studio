import { access, readFile } from 'node:fs/promises';

const registryUrl = new URL('../docs/experience/requirements.md', import.meta.url);
const registry = await readFile(registryUrl, 'utf8');

const rows = registry
  .split('\n')
  .filter((line) => /^\| SR-[0-9]{3} \|/u.test(line))
  .map((line) => line.split('|').map((cell) => cell.trim()));

if (rows.length === 0) {
  throw new Error('The interaction requirement registry declares no requirements.');
}

const identifiers = new Set();
const manualProcedures = [...registry.matchAll(/`manual:([a-z0-9-]+)`/gu)].map((match) => match[1]);

for (const row of rows) {
  const [, id, requirement, source, enforcement] = row;
  if (id === undefined || requirement === undefined || source === undefined || !enforcement) {
    throw new Error(`Malformed registry row: ${row.join(' | ')}`);
  }
  if (identifiers.has(id)) {
    throw new Error(`Requirement identifier ${id} is duplicated.`);
  }
  identifiers.add(id);
  if (requirement.length === 0 || source.length === 0) {
    throw new Error(`Requirement ${id} is missing its statement or source.`);
  }

  if (enforcement === 'open') {
    continue;
  }
  if (enforcement.startsWith('manual:')) {
    const procedure = enforcement.slice('manual:'.length);
    if (!manualProcedures.includes(procedure)) {
      throw new Error(`Requirement ${id} names an undocumented manual procedure ${procedure}.`);
    }
    continue;
  }
  try {
    await access(new URL(`../${enforcement}`, import.meta.url));
  } catch {
    throw new Error(
      `Requirement ${id} points at ${enforcement}, which does not exist in the repository.`,
    );
  }
}

const open = rows.filter((row) => row[4] === 'open').length;
console.log(
  `${rows.length} interaction requirements verified (${rows.length - open} enforced or manual, ${open} open).`,
);
