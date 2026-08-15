import { rm } from 'node:fs/promises';
import { glob } from 'node:fs/promises';

const targets = ['.cache', 'dist', 'dist-types', 'coverage'];

for (const pattern of [
  '*.tsbuildinfo',
  'packages/*/dist',
  'packages/*/dist-types',
  'packages/*/*.tsbuildinfo',
  'examples/*/dist',
  'examples/*/dist-types',
  'examples/*/*.tsbuildinfo',
]) {
  for await (const path of glob(pattern)) {
    targets.push(path);
  }
}

await Promise.all(targets.map((path) => rm(path, { force: true, recursive: true })));
