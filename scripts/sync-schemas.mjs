import { cp, mkdir, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

const sourceDirectory = new URL('../schemas/', import.meta.url);
const targetDirectory = new URL('../packages/protocol/schemas/', import.meta.url);
const exampleDirectory = new URL('../schemas/examples/', import.meta.url);
const fixtureDirectory = new URL('../packages/testkit/fixtures/', import.meta.url);
const vectorDirectory = new URL('../schemas/vectors/command/', import.meta.url);
const vectorTargetDirectory = new URL('../packages/testkit/vectors/command/', import.meta.url);
const invalidDirectory = new URL('../schemas/invalid/', import.meta.url);
const invalidTargetDirectory = new URL('../packages/testkit/invalid/', import.meta.url);

await rm(targetDirectory, { force: true, recursive: true });
await mkdir(targetDirectory, { recursive: true });
await rm(fixtureDirectory, { force: true, recursive: true });
await mkdir(fixtureDirectory, { recursive: true });
await rm(new URL('../packages/testkit/vectors/', import.meta.url), {
  force: true,
  recursive: true,
});
await mkdir(vectorTargetDirectory, { recursive: true });
await rm(invalidTargetDirectory, { force: true, recursive: true });
await mkdir(invalidTargetDirectory, { recursive: true });

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

for (const entry of await readdir(vectorDirectory, { withFileTypes: true })) {
  if (entry.isFile() && entry.name.endsWith('.json')) {
    await cp(new URL(entry.name, vectorDirectory), new URL(entry.name, vectorTargetDirectory));
  }
}

for (const entry of await readdir(invalidDirectory, { withFileTypes: true })) {
  if (entry.isFile() && entry.name.endsWith('.json')) {
    await cp(new URL(entry.name, invalidDirectory), new URL(entry.name, invalidTargetDirectory));
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

const vectors = (await readdir(vectorTargetDirectory)).filter((name) => name.endsWith('.json'));
if (vectors.length === 0) {
  throw new Error(`No command vectors were copied to ${join(vectorTargetDirectory.pathname)}.`);
}

const invalid = (await readdir(invalidTargetDirectory)).filter((name) => name.endsWith('.json'));
if (invalid.length === 0) {
  throw new Error(`No negative fixtures were copied to ${join(invalidTargetDirectory.pathname)}.`);
}
