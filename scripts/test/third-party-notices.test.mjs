import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  createPackageEvidence,
  loadWorkspace,
  resolveRuntimeClosure,
} from '../lib/third-party-notices.mjs';

const createFixture = async ({ dependencyVersion = '1.2.3', includeLicense = true } = {}) => {
  const root = await mkdtemp(path.join(tmpdir(), 'studio-notices-'));
  await mkdir(path.join(root, 'packages', 'consumer'), { recursive: true });
  await mkdir(path.join(root, 'packages', 'foundation'), { recursive: true });
  await mkdir(path.join(root, 'node_modules', 'vendor-package'), { recursive: true });
  await mkdir(path.join(root, 'node_modules', 'vendor-child'), { recursive: true });
  await writeFile(
    path.join(root, 'packages', 'consumer', 'package.json'),
    JSON.stringify({
      name: '@kumwe/consumer',
      version: '0.1.0-alpha.1',
      dependencies: { '@kumwe/foundation': '0.1.0-alpha.1' },
    }),
  );
  await writeFile(
    path.join(root, 'packages', 'foundation', 'package.json'),
    JSON.stringify({
      name: '@kumwe/foundation',
      version: '0.1.0-alpha.1',
      dependencies: { 'vendor-package': dependencyVersion },
    }),
  );
  await writeFile(
    path.join(root, 'package-lock.json'),
    JSON.stringify({
      lockfileVersion: 3,
      packages: {
        'node_modules/vendor-package': {
          version: '1.2.3',
          integrity: 'sha512-parent',
          license: 'Apache-2.0',
          dependencies: { 'vendor-child': '^2.0.0' },
        },
        'node_modules/vendor-child': {
          version: '2.0.1',
          integrity: 'sha512-child',
          license: 'MIT',
        },
      },
    }),
  );
  await writeFile(
    path.join(root, 'node_modules', 'vendor-package', 'package.json'),
    JSON.stringify({ name: 'vendor-package', version: '1.2.3' }),
  );
  await writeFile(
    path.join(root, 'node_modules', 'vendor-child', 'package.json'),
    JSON.stringify({ name: 'vendor-child', version: '2.0.1' }),
  );
  if (includeLicense) {
    await writeFile(path.join(root, 'node_modules', 'vendor-package', 'LICENSE'), 'Apache terms\n');
  }
  await writeFile(path.join(root, 'node_modules', 'vendor-child', 'LICENSE.md'), 'MIT terms\n');
  return root;
};

test('resolves the transitive production closure through internal workspace packages', async () => {
  const root = await createFixture();
  const workspace = await loadWorkspace(root);
  const consumer = workspace.internalByName.get('@kumwe/consumer');
  assert.ok(consumer);
  assert.deepEqual(
    resolveRuntimeClosure(workspace, consumer).map(({ identity }) => identity),
    ['vendor-child@2.0.1', 'vendor-package@1.2.3'],
  );
});

test('builds deterministic notices and exact installed license evidence', async () => {
  const root = await createFixture();
  const workspace = await loadWorkspace(root);
  const consumer = workspace.internalByName.get('@kumwe/consumer');
  assert.ok(consumer);
  const first = await createPackageEvidence(root, workspace, consumer);
  const second = await createPackageEvidence(root, workspace, consumer);
  assert.equal(first.notice, second.notice);
  assert.match(first.notice, /vendor-package \| 1\.2\.3 \| Apache-2\.0/);
  assert.deepEqual(
    [...first.licenses.keys()],
    ['vendor-child-2.0.1.txt', 'vendor-package-1.2.3.txt'],
  );
  assert.equal(first.licenses.get('vendor-package-1.2.3.txt'), 'Apache terms\n');
});

test('rejects ranged direct production dependencies', async () => {
  const root = await createFixture({ dependencyVersion: '^1.2.3' });
  const workspace = await loadWorkspace(root);
  const foundation = workspace.internalByName.get('@kumwe/foundation');
  assert.ok(foundation);
  assert.throws(() => resolveRuntimeClosure(workspace, foundation), /must use an exact version/);
});

test('fails closed when an installed package omits its license text', async () => {
  const root = await createFixture({ includeLicense: false });
  const workspace = await loadWorkspace(root);
  const foundation = workspace.internalByName.get('@kumwe/foundation');
  assert.ok(foundation);
  await assert.rejects(
    createPackageEvidence(root, workspace, foundation),
    /does not provide a recognized license text/,
  );
});
