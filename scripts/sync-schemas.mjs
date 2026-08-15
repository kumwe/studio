import { cp, mkdir, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

const sourceDirectory = new URL('../schemas/', import.meta.url);
const targetDirectory = new URL('../packages/protocol/schemas/', import.meta.url);
const exampleDirectory = new URL('../schemas/examples/', import.meta.url);
const fixtureDirectory = new URL('../packages/testkit/fixtures/', import.meta.url);

await rm(targetDirectory, { force: true, recursive: true });
await mkdir(targetDirectory, { recursive: true });
await rm(fixtureDirectory, { force: true, recursive: true });
await mkdir(fixtureDirectory, { recursive: true });

for (const entry of await readdir(sourceDirectory, { withFileTypes: true })) {
  if (entry.isFile() && entry.name.endsWith('.schema.json')) {
    await cp(new URL(entry.name, sourceDirectory), new URL(entry.name, targetDirectory));
  }
}

for (const entry of await readdir(exampleDirectory, { withFileTypes: true })) {
  if (entry.isFile() && entry.name.endsWith('.json')) {
    await cp(new URL(entry.name, exampleDirectory), new URL(entry.name, fixtureDirectory));
  }
}

const copied = (await readdir(targetDirectory)).filter((name) => name.endsWith('.schema.json'));
if (copied.length === 0) {
  throw new Error(`No schemas were copied to ${join(targetDirectory.pathname)}.`);
}

const fixtures = (await readdir(fixtureDirectory)).filter((name) => name.endsWith('.json'));
if (fixtures.length === 0) {
  throw new Error(`No fixtures were copied to ${join(fixtureDirectory.pathname)}.`);
}
