import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { assertLiveMain } from '../reconcile-release-tag.mjs';

const workflows = new Map([
  ['ci.yml', 3],
  ['evidence-bundle.yml', 1],
  ['release.yml', 6],
  ['version-packages.yml', 1],
]);
const workflowRoot = fileURLToPath(new URL('../../.github/workflows/', import.meta.url));
const packageFile = fileURLToPath(new URL('../../package.json', import.meta.url));
const pinnedPhpSetup = 'shivammathur/setup-php@f3e473d116dcccaddc5834248c87452386958240';

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

test('one candidate qualification command owns repository, PHP, and browser proof', async () => {
  const manifest = JSON.parse(await readFile(packageFile, 'utf8'));
  assert.equal(manifest.scripts['check:php-reference'], 'node scripts/check-php-reference.mjs');
  assert.equal(
    manifest.scripts['qualify:candidate'],
    'npm run check && npm run check:php-reference && npm run check:a11y && npm run check:public-runtime',
  );
  assert.equal(manifest.scripts.verify, 'npm run qualify:candidate');
  assert.equal(
    manifest.scripts['release:readiness'],
    'node scripts/verify-release-gate.mjs && npm run qualify:candidate',
  );
  for (const name of ['build', 'check']) {
    assert.ok(
      manifest.scripts[name].indexOf('npm run build:packages:minify') <
        manifest.scripts[name].indexOf('npm run build:browser'),
      `${name} must preserve the minified dependency inputs that define published browser bytes`,
    );
    assert.ok(
      manifest.scripts[name].lastIndexOf('npm run build:packages:minify') >
        manifest.scripts[name].lastIndexOf('npm run build:browser'),
      `${name} can leave source maps regenerated after the final package minification pass`,
    );
  }
});

test('beta publication qualifies the exact source before artifacts or credentials', async () => {
  const source = await readFile(`${workflowRoot}version-packages.yml`, 'utf8');
  const plan = source.indexOf('name: Inspect beta release plan');
  const php = source.indexOf('name: Set up pinned PHP for beta candidate qualification');
  const chromium = source.indexOf('name: Install locked Chromium for beta candidate qualification');
  const qualification = source.indexOf('name: Qualify the exact beta publication source');
  const artifacts = source.indexOf('name: Generate approved local package tarball digests');
  const authentication = source.indexOf('name: Verify npm authentication');
  assert.ok(plan >= 0 && plan < php);
  assert.ok(php < chromium && chromium < qualification);
  assert.ok(qualification < artifacts && artifacts < authentication);
  assert.match(source, new RegExp(pinnedPhpSetup, 'u'));
  assert.match(source, /php-version: '8\.1'/u);
  assert.match(source, /playwright install --with-deps chromium/u);
  assert.match(
    source,
    /name: Qualify the exact beta publication source\n\s+if: steps\.plan\.outputs\.operation == 'publish'\n\s+run: npm run qualify:candidate/u,
  );
  assert.match(
    source,
    /name: Run repository quality for non-publishing beta work\n\s+if: steps\.plan\.outputs\.operation != 'publish'/u,
  );
});

test('governed promotion qualifies mutated, quarantined, and publication sources', async () => {
  const source = await readFile(`${workflowRoot}release.yml`, 'utf8');
  const prepare = source.split('\n  prepare:')[1].split('\n  stage:')[0];
  const stage = source.split('\n  stage:')[1].split('\n  publish:')[0];
  const publish = source.split('\n  publish:')[1];

  for (const [name, block] of [
    ['prepare', prepare],
    ['stage', stage],
    ['publish', publish],
  ]) {
    assert.match(block, new RegExp(pinnedPhpSetup, 'u'), `${name} does not pin PHP setup`);
    assert.match(block, /php-version: '8\.1'/u, `${name} does not select the PHP 8.1 baseline`);
    assert.match(block, /install-playwright: 'true'/u, `${name} does not install locked Chromium`);
  }

  assert.ok(
    prepare.indexOf('run: npm run release:prepare') <
      prepare.indexOf('run: npm run qualify:candidate'),
    'promotion metadata is not qualified after mutation',
  );
  assert.ok(
    stage.indexOf('run: npm run qualify:candidate') <
      stage.indexOf('run: npm run release:artifacts'),
    'RC quarantine artifacts are created before qualification',
  );
  assert.ok(
    stage.indexOf('run: npm run release:artifacts') <
      stage.indexOf('name: Verify npm authentication'),
    'RC quarantine authenticates before exact artifacts exist',
  );

  assert.match(
    publish,
    /ref: \$\{\{ inputs\.channel == 'rc' && inputs\.candidate_sha \|\| inputs\.expected_main_sha \}\}/u,
  );
  assert.match(
    publish,
    /uses: \.\/\.release-controller\/\.github\/actions\/setup-studio\n\s+with:\n\s+working-directory: '\.'\n\s+install-playwright: 'true'/u,
  );
  assert.match(
    publish,
    /name: Revalidate RC with the exact current-main controller\n\s+if: inputs\.channel == 'rc'\n\s+working-directory: \.release-controller/u,
  );
  const candidateQualification = publish
    .split('name: Qualify the exact immutable RC publication source')[1]
    .split('name: Generate approved local package tarball digests')[0];
  assert.match(candidateQualification, /run: npm run qualify:candidate/u);
  assert.doesNotMatch(candidateQualification, /working-directory:/u);
  assert.ok(
    publish.indexOf('run: npm run release:readiness') <
      publish.indexOf('run: npm run release:artifacts'),
    'stable evidence/readiness does not precede artifact generation',
  );
  assert.ok(
    publish.indexOf('run: npm run qualify:candidate') <
      publish.indexOf('run: npm run release:artifacts'),
    'RC qualification does not precede artifact generation',
  );
  assert.ok(
    publish.indexOf('run: npm run release:artifacts') <
      publish.indexOf('name: Verify npm authentication'),
    'publication authenticates before exact artifacts exist',
  );
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
        : 'name: Verify immutable package bits before moving the beta tag',
    );
    const reconciliation = source.indexOf(
      name === 'release.yml'
        ? 'name: Reconcile the channel distribution tag'
        : 'name: Reconcile the beta dist-tag',
    );
    const finalVerification = source.indexOf(
      name === 'release.yml'
        ? 'name: Verify the complete registry release, provenance, and channel tag'
        : 'name: Verify the complete published release set, provenance, and beta tag',
    );
    const cleanup = source.indexOf(
      'name: Clean or report retained non-channel staging tags after complete success',
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
    const reconciliationName =
      name === 'release.yml'
        ? 'name: Reconcile the channel distribution tag'
        : 'name: Reconcile the beta dist-tag';
    const reconciliationBlock = source
      .split(reconciliationName)[1]
      .split(
        name === 'release.yml'
          ? 'name: Verify the complete registry release, provenance, and channel tag'
          : 'name: Verify the complete published release set, provenance, and beta tag',
      )[0];
    assert.match(reconciliationBlock, /STUDIO_EXPECTED_MAIN_SHA:/u);
    if (name === 'release.yml') {
      const githubReleaseBlock = source.split('name: Create or verify the GitHub release')[1];
      assert.match(githubReleaseBlock, /EXPECTED_MAIN_SHA:/u);
      assert.match(githubReleaseBlock, /git ls-remote --exit-code origin refs\/heads\/main/u);
      assert.ok(
        source.indexOf('node scripts/verify-github-release.mjs') < cleanup,
        'release.yml cleans staging before exact GitHub release recovery verification',
      );
    } else {
      const githubRelease = source.indexOf(
        'name: Create or verify the coordinated beta GitHub prerelease',
      );
      assert.ok(
        finalVerification < githubRelease && githubRelease < cleanup,
        'version-packages.yml does not reconcile GitHub after final registry proof and before cleanup',
      );
      const finalVerificationBlock = source
        .split('name: Verify the complete published release set, provenance, and beta tag')[1]
        .split('name: Generate immutable beta GitHub release notes')[0];
      assert.match(finalVerificationBlock, /RELEASE_WRITE_PROVENANCE_OUTPUT: 'true'/u);
      assert.match(finalVerificationBlock, /id: verified_beta/u);
    }
  }
});

test('GitHub releases recover exact browser assets without overwrite', async () => {
  for (const [name, step] of [
    ['release.yml', 'name: Create or verify the GitHub release'],
    ['version-packages.yml', 'name: Create or verify the coordinated beta GitHub prerelease'],
  ]) {
    const source = await readFile(`${workflowRoot}${name}`, 'utf8');
    const releaseBlock = source.split(step)[1];
    assert.match(releaseBlock, /approved\.browser\.path/u);
    assert.match(releaseBlock, /approved\.browser\.checksumPath/u);
    assert.match(releaseBlock, /sha256sum --check/u);
    assert.match(releaseBlock, /gh release create .*"\$archive" "\$checksum"/u);
    assert.match(releaseBlock, /gh release download/u);
    assert.match(releaseBlock, /cmp --silent/u);
    assert.match(releaseBlock, /--json assets,body,isDraft,isPrerelease,name,tagName/u);
    assert.doesNotMatch(releaseBlock, /--clobber/u);
  }
});

test('beta GitHub prerelease is exact-source, fail-closed, and token-scoped', async () => {
  const source = await readFile(`${workflowRoot}version-packages.yml`, 'utf8');
  const releaseBlock = source
    .split('name: Create or verify the coordinated beta GitHub prerelease')[1]
    .split('name: Clean or report retained non-channel staging tags')[0];
  assert.match(
    source,
    /permissions:\n\s+contents: write\n\s+id-token: write\n\s+pull-requests: write/u,
  );
  assert.match(releaseBlock, /GH_TOKEN: \$\{\{ secrets\.GITHUB_TOKEN \}\}/u);
  assert.match(
    releaseBlock,
    /PUBLISH_SOURCE_SHA: \$\{\{ steps\.verified_beta\.outputs\.provenance_commit \}\}/u,
  );
  assert.match(
    releaseBlock,
    /git merge-base --is-ancestor "\$PUBLISH_SOURCE_SHA" "\$EXPECTED_MAIN_SHA"/u,
  );
  assert.match(releaseBlock, /git ls-remote --exit-code origin "refs\/tags\/\$tag"/u);
  assert.match(releaseBlock, /--prerelease/u);
  assert.ok(
    releaseBlock.indexOf('[[ "$(git rev-list -n 1 "$tag")" == "$PUBLISH_SOURCE_SHA" ]]') <
      releaseBlock.indexOf('gh release upload'),
    'existing beta tags are not verified before release mutation',
  );
  assert.doesNotMatch(releaseBlock, /NODE_AUTH_TOKEN/u);
});

test('Changesets action is version-PR-only and cannot publish tags or GitHub releases', async () => {
  const source = await readFile(`${workflowRoot}version-packages.yml`, 'utf8');
  assert.match(source, /if: steps\.plan\.outputs\.operation == 'version'/u);
  assert.match(source, /create-github-releases: false/u);
  assert.match(source, /push-git-tags: false/u);
  assert.doesNotMatch(source, /publish-script:/u);
  assert.match(source, /run: npm run release:publish-prerelease/u);
  const publishBlock = source.split('name: Publish missing approved tarballs')[1];
  assert.match(publishBlock, /STUDIO_EXPECTED_MAIN_SHA: \$\{\{ github\.sha \}\}/u);
  const titleCorrection = source.split(
    'name: Keep the generated version pull request labeled beta',
  )[1];
  assert.match(titleCorrection, /steps\.release\.outputs\['pr-number'\]/u);
  assert.match(titleCorrection, /chore: version Studio packages \(beta\)/u);
});

test('npm credentials stay in their channel-specific GitHub secret boundaries', async () => {
  const beta = await readFile(`${workflowRoot}version-packages.yml`, 'utf8');
  assert.doesNotMatch(beta, /^\s+environment:/mu);
  assert.match(beta, /NODE_AUTH_TOKEN: \$\{\{ secrets\.NPM_TOKEN \}\}/u);
  assert.doesNotMatch(beta, /vars\.NPM_TOKEN/u);

  const promotion = await readFile(`${workflowRoot}release.yml`, 'utf8');
  const stageJob = promotion.split('\n  stage:')[1].split('\n  publish:')[0];
  const publishJob = promotion.split('\n  publish:')[1];
  assert.match(stageJob, /environment: studio-rc/u);
  assert.match(stageJob, /NODE_AUTH_TOKEN: \$\{\{ secrets\.NPM_TOKEN \}\}/u);
  assert.match(publishJob, /environment: studio-\$\{\{ inputs\.channel \}\}/u);
  assert.match(publishJob, /NODE_AUTH_TOKEN: \$\{\{ secrets\.NPM_TOKEN \}\}/u);
  assert.doesNotMatch(promotion, /vars\.NPM_TOKEN/u);
});
