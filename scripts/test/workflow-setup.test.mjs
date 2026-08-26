import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { assertLiveMain } from '../reconcile-release-tag.mjs';

const workflows = new Map([
  ['ci.yml', 2],
  ['evidence-bundle.yml', 1],
  ['release.yml', 6],
  ['version-packages.yml', 1],
]);
const workflowRoot = fileURLToPath(new URL('../../.github/workflows/', import.meta.url));

test('official channel reconciliation requires the exact live main ref', async () => {
  const expected = 'a'.repeat(40);
  await assert.doesNotReject(() =>
    assertLiveMain(expected, { readRemoteMain: async () => expected }),
  );
  await assert.rejects(
    () => assertLiveMain(expected, { readRemoteMain: async () => 'b'.repeat(40) }),
    /Live origin\/main moved/u,
  );
  await assert.rejects(
    () => assertLiveMain('main', { readRemoteMain: async () => expected }),
    /exact lowercase commit SHA/u,
  );
});

test('every executable workflow uses the single Studio environment action', async () => {
  for (const [name, expectedSetups] of workflows) {
    const source = await readFile(`${workflowRoot}${name}`, 'utf8');
    const setups =
      source.match(
        /^\s*uses: \.\/(?:\.release-controller\/)?\.github\/actions\/setup-studio$/gmu,
      ) ?? [];
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
    const stagingPublication = source.indexOf(
      'name: Publish missing approved tarballs to a non-channel staging tag',
    );
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
    const cleanup = source.indexOf(
      'name: Remove the non-channel staging tag after complete success',
    );
    assert.ok(stagingPublication >= 0, `${name} has no staging-only publication step`);
    assert.ok(preTagVerification >= 0, `${name} has no pre-tag artifact verification`);
    assert.ok(
      stagingPublication < preTagVerification,
      `${name} does not verify after staging publication`,
    );
    assert.ok(preTagVerification < reconciliation, `${name} moves the tag before bit verification`);
    assert.ok(reconciliation < finalVerification, `${name} does not verify the reconciled tag`);
    assert.ok(finalVerification < cleanup, `${name} cleans staging before the final channel proof`);
    if (name === 'release.yml') {
      const reconciliationBlock = source.split('name: Reconcile the channel distribution tag')[1];
      assert.match(reconciliationBlock, /STUDIO_EXPECTED_MAIN_SHA:/u);
      const githubReleaseBlock = source.split('name: Create or verify the GitHub release')[1];
      assert.match(githubReleaseBlock, /EXPECTED_MAIN_SHA:/u);
      assert.match(githubReleaseBlock, /git ls-remote --exit-code origin refs\/heads\/main/u);
      assert.ok(
        source.indexOf('node scripts/verify-github-release.mjs') < cleanup,
        'release.yml cleans staging before exact GitHub release recovery verification',
      );
    }
  }
});

test('Changesets action is version-PR-only and cannot publish tags or GitHub releases', async () => {
  const source = await readFile(`${workflowRoot}version-packages.yml`, 'utf8');
  assert.match(source, /if: steps\.plan\.outputs\.operation == 'version'/u);
  assert.match(source, /create-github-releases: false/u);
  assert.match(source, /push-git-tags: false/u);
  assert.doesNotMatch(source, /publish-script:/u);
  assert.match(source, /run: npm run release:publish-alpha/u);
  const publishBlock = source.split('name: Publish missing approved tarballs')[1];
  assert.match(publishBlock, /STUDIO_EXPECTED_MAIN_SHA: \$\{\{ github\.sha \}\}/u);
});
