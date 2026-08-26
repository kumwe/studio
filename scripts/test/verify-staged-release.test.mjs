import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { STUDIO_RELEASE_PACKAGE_NAMES } from '../release-family.mjs';
import { VERSION_TWO_RELEASE_PROFILES } from '../release-policy.mjs';
import {
  assertStagedVerificationSource,
  buildCleanConsumerLockEvidence,
  buildFreshApprovedArtifacts,
  proveCleanRegistryInstall,
} from '../verify-staged-release.mjs';

const sha = 'a'.repeat(40);

describe('staged RC release evidence', () => {
  it('binds registry evidence to an immutable RC source coordinate', () => {
    assert.doesNotThrow(() =>
      assertStagedVerificationSource(record('0.1.0-rc.1'), sha, '0.1.0-rc.1'),
    );
    assert.throws(
      () => assertStagedVerificationSource(record('0.1.0-alpha.9'), sha),
      /requires an RC coordinate/u,
    );
    assert.throws(
      () => assertStagedVerificationSource(record('0.1.0-rc.1'), 'main'),
      /exact lowercase/u,
    );
    assert.throws(
      () =>
        assertStagedVerificationSource(record('0.1.0-rc.1'), sha, '0.1.0-rc.1', ' M package.json'),
      /clean exact-source/u,
    );
  });

  it('installs the exact family without credentials and audits signatures', async () => {
    const releaseRecord = record('0.1.0-rc.1');
    const releaseRecordSource = `${JSON.stringify(releaseRecord, null, 2)}\n`;
    const calls = [];
    const projection = await proveCleanRegistryInstall(releaseRecord, releaseRecordSource, {
      captureEvidence: true,
      processEnvironment: {
        HOME: '/tmp/credential-bearing-home',
        HTTPS_PROXY: 'http://proxy.invalid',
        NODE_AUTH_TOKEN: '<redacted-token>',
        NPM_CONFIG_GLOBALCONFIG: '/tmp/credential-bearing-global-npmrc',
        PATH: process.env.PATH,
        'npm_config_//registry.npmjs.org/:_authToken': '<redacted-token>',
        npm_config_userconfig: '/tmp/credential-bearing-user-npmrc',
      },
      runNpm: async (arguments_, options) => {
        calls.push({ arguments: arguments_, options });
        assert.equal(options.env.NODE_AUTH_TOKEN, undefined);
        assert.equal(options.env.NPM_TOKEN, undefined);
        assert.ok(options.env.HOME.startsWith(options.cwd));
        assert.ok(options.env.TMPDIR.startsWith(options.cwd));
        assert.notEqual(options.env.HOME, '/tmp/credential-bearing-home');
        assert.equal(options.env.npm_config_userconfig, undefined);
        assert.equal(options.env.NPM_CONFIG_GLOBALCONFIG.startsWith(options.cwd), true);
        assert.ok(options.env.NPM_CONFIG_USERCONFIG.startsWith(options.cwd));
        assert.ok(Object.keys(options.env).every((key) => !/(?:auth|token)/iu.test(key)));
        assert.doesNotMatch(
          await readFile(options.env.NPM_CONFIG_USERCONFIG, 'utf8'),
          /auth|token/iu,
        );
        if (arguments_[0] !== 'install') return;
        const consumerManifest = JSON.parse(
          await readFile(join(options.cwd, 'package.json'), 'utf8'),
        );
        assert.deepEqual(consumerManifest.dependencies, releaseRecord.packages);
        const lockPackages = {
          '': { dependencies: releaseRecord.packages },
        };
        for (const name of STUDIO_RELEASE_PACKAGE_NAMES) {
          const packageRoot = join(options.cwd, 'node_modules', ...name.split('/'));
          await mkdir(packageRoot, { recursive: true });
          await writeFile(
            join(packageRoot, 'package.json'),
            `${JSON.stringify({ name, version: releaseRecord.release })}\n`,
          );
          if (name === '@kumwe/studio-protocol' || name === '@kumwe/studio-testkit') {
            await writeFile(join(packageRoot, 'studio-release.json'), releaseRecordSource);
          }
          lockPackages[`node_modules/${name}`] = {
            integrity: 'sha512-Zml4dHVyZQ==',
            resolved: `https://registry.npmjs.org/${name}/-/fixture.tgz`,
            version: releaseRecord.release,
          };
        }
        await writeFile(
          join(options.cwd, 'package-lock.json'),
          `${JSON.stringify({ lockfileVersion: 3, packages: lockPackages })}\n`,
        );
      },
    });
    assert.equal(calls.length, 2);
    assert.deepEqual(calls[0].arguments.slice(0, 2), ['install', '--ignore-scripts']);
    assert.deepEqual(calls[1].arguments.slice(0, 2), ['audit', 'signatures']);
    assert.equal(projection.lockfileVersion, 3);
    assert.equal(projection.packages.length, 8);
    assert.deepEqual(projection.rootDependencies, releaseRecord.packages);
  });

  it('always rebuilds approved tarballs instead of trusting ignored prior artifacts', async () => {
    const releaseRecord = record('0.1.0-rc.1');
    const stale = { kind: 'stale-ignored-artifacts' };
    const fresh = { kind: 'fresh-approved-artifacts' };
    let writes = 0;
    const result = await buildFreshApprovedArtifacts(releaseRecord, {
      root: new URL('file:///tmp/studio-stale-artifact-test/'),
      verifyArtifactFiles: async (document, verifiedRecord) => {
        assert.notEqual(document, stale);
        assert.equal(document, fresh);
        assert.equal(verifiedRecord, releaseRecord);
      },
      writeArtifacts: async () => {
        writes += 1;
        return fresh;
      },
    });
    assert.equal(writes, 1);
    assert.equal(result, fresh);
  });

  it('retains required peer edges, nested resolution, and omits absent optional peers', () => {
    const releaseRecord = record('0.1.0-rc.1');
    const packages = { '': { dependencies: releaseRecord.packages } };
    for (const name of STUDIO_RELEASE_PACKAGE_NAMES) {
      packages[`node_modules/${name}`] = {
        integrity: 'sha512-Zml4dHVyZQ==',
        resolved: `https://registry.npmjs.org/${name}/-/fixture.tgz`,
        version: releaseRecord.release,
      };
    }
    packages['node_modules/@kumwe/studio-core'] = {
      ...packages['node_modules/@kumwe/studio-core'],
      peerDependencies: { 'optional-peer': '^1.0.0', 'shared-peer': '^2.0.0' },
      peerDependenciesMeta: { 'optional-peer': { optional: true } },
    };
    packages['node_modules/shared-peer'] = registryEntry('shared-peer', '1.0.0');
    packages['node_modules/@kumwe/studio-core/node_modules/shared-peer'] = registryEntry(
      'shared-peer',
      '2.0.0',
    );
    const result = buildCleanConsumerLockEvidence({ lockfileVersion: 3, packages }, releaseRecord);
    const coreRef = `pkg:npm/%40kumwe/studio-core@${releaseRecord.release}`;
    assert.deepEqual(result.dependencies.find(({ ref }) => ref === coreRef)?.dependsOn, [
      'pkg:npm/shared-peer@2.0.0',
    ]);
    assert.ok(result.components.some(({ purl }) => purl === 'pkg:npm/shared-peer@1.0.0'));
    assert.ok(result.components.some(({ purl }) => purl === 'pkg:npm/shared-peer@2.0.0'));
    assert.ok(
      result.dependencies.every(({ dependsOn }) =>
        dependsOn.every((ref) => !ref.includes('/optional-peer@')),
      ),
    );
  });

  it('rejects duplicate component identities with location-dependent topology', () => {
    const releaseRecord = record('0.1.0-rc.1');
    const packages = { '': { dependencies: releaseRecord.packages } };
    for (const name of STUDIO_RELEASE_PACKAGE_NAMES) {
      packages[`node_modules/${name}`] = {
        integrity: 'sha512-Zml4dHVyZQ==',
        resolved: `https://registry.npmjs.org/${name}/-/fixture.tgz`,
        version: releaseRecord.release,
      };
    }
    packages['node_modules/shared-peer'] = registryEntry('shared-peer', '2.0.0');
    packages['node_modules/@kumwe/studio-core/node_modules/shared-peer'] = {
      ...registryEntry('shared-peer', '2.0.0'),
      dependencies: { 'topology-only': '^1.0.0' },
    };
    packages[
      'node_modules/@kumwe/studio-core/node_modules/shared-peer/node_modules/topology-only'
    ] = registryEntry('topology-only', '1.0.0');
    assert.throws(
      () => buildCleanConsumerLockEvidence({ lockfileVersion: 3, packages }, releaseRecord),
      /location-dependent dependency topology/u,
    );
  });

  it('rejects a clean install with a drifted embedded release record', async () => {
    const releaseRecord = record('0.1.0-rc.1');
    const releaseRecordSource = `${JSON.stringify(releaseRecord, null, 2)}\n`;
    await assert.rejects(
      proveCleanRegistryInstall(releaseRecord, releaseRecordSource, {
        runNpm: async (arguments_, options) => {
          if (arguments_[0] !== 'install') return;
          for (const name of STUDIO_RELEASE_PACKAGE_NAMES) {
            const packageRoot = join(options.cwd, 'node_modules', ...name.split('/'));
            await mkdir(packageRoot, { recursive: true });
            await writeFile(
              join(packageRoot, 'package.json'),
              `${JSON.stringify({ name, version: releaseRecord.release })}\n`,
            );
            if (name === '@kumwe/studio-protocol' || name === '@kumwe/studio-testkit') {
              await writeFile(join(packageRoot, 'studio-release.json'), '{}\n');
            }
          }
        },
      }),
      /exact candidate release record/u,
    );
  });
});

function record(version) {
  return {
    claimedProfiles: version.includes('-alpha.') ? [] : [...VERSION_TWO_RELEASE_PROFILES],
    packages: Object.fromEntries(STUDIO_RELEASE_PACKAGE_NAMES.map((name) => [name, version])),
    release: version,
  };
}

function registryEntry(name, version) {
  return {
    integrity: 'sha512-Zml4dHVyZQ==',
    name,
    resolved: `https://registry.npmjs.org/${name}/-/${name}-${version}.tgz`,
    version,
  };
}
