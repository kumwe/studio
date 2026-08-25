import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const workflows = new Map([
  ['ci.yml', 2],
  ['evidence-bundle.yml', 1],
  ['release.yml', 3],
  ['version-packages.yml', 1],
]);
const workflowRoot = fileURLToPath(new URL('../../.github/workflows/', import.meta.url));

test('every executable workflow uses the single Studio environment action', async () => {
  for (const [name, expectedSetups] of workflows) {
    const source = await readFile(`${workflowRoot}${name}`, 'utf8');
    const setups = source.match(/^\s*uses: \.\/\.github\/actions\/setup-studio$/gmu) ?? [];
    assert.equal(setups.length, expectedSetups, `${name} has an unexpected setup path count`);
    assert.doesNotMatch(source, /actions\/setup-node@/u, `${name} bypasses the setup action`);
    assert.doesNotMatch(source, /^\s*run: npm ci$/mu, `${name} duplicates dependency setup`);
    assert.doesNotMatch(source, /npm install --global npm@/u, `${name} duplicates toolchain setup`);
  }
});
