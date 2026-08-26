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

test('publish workflows approve exact local tarballs before npm authentication', async () => {
  for (const name of ['release.yml', 'version-packages.yml']) {
    const source = await readFile(`${workflowRoot}${name}`, 'utf8');
    const artifactStep = source.indexOf('run: npm run release:artifacts');
    const authenticationStep = source.indexOf('name: Verify npm authentication');
    const verificationInput = source.indexOf("RELEASE_APPROVED_ARTIFACTS: 'true'");
    assert.ok(artifactStep >= 0, `${name} does not generate approved tarballs`);
    assert.ok(
      artifactStep < authenticationStep,
      `${name} authenticates before approving exact local tarballs`,
    );
    assert.ok(
      verificationInput > authenticationStep,
      `${name} does not post-verify the approved tarballs`,
    );
    assert.match(source, /RELEASE_REQUIRE_PROVENANCE: 'true'/u);
  }
});

test('publish workflows prove new registry bits before moving distribution tags', async () => {
  for (const name of ['release.yml', 'version-packages.yml']) {
    const source = await readFile(`${workflowRoot}${name}`, 'utf8');
    const preTagVerification = source.indexOf(
      name === 'release.yml'
        ? 'name: Verify immutable package bits before moving the channel tag'
        : 'name: Verify immutable package bits before moving the alpha tag',
    );
    const reconciliation = source.indexOf(
      name === 'release.yml'
        ? 'name: Reconcile the channel distribution tag'
        : 'name: Reconcile the alpha dist-tag',
    );
    const finalVerification = source.indexOf(
      name === 'release.yml'
        ? 'name: Verify the complete registry release, provenance, and channel tag'
        : 'name: Verify the complete published release set, provenance, and alpha tag',
    );
    assert.ok(preTagVerification >= 0, `${name} has no pre-tag artifact verification`);
    assert.ok(preTagVerification < reconciliation, `${name} moves the tag before bit verification`);
    assert.ok(reconciliation < finalVerification, `${name} does not verify the reconciled tag`);
  }
});
