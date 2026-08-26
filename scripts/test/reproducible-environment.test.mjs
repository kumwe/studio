import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { buildReproducibleEnvironment } from '../lib/reproducible-environment.mjs';

test('reproducibility passes isolate home, temp, and XDG state from caller and each other', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'studio-reproducible-env-'));
  t.after(() => rm(root, { force: true, recursive: true }));
  const callerHome = join(root, 'caller-home');
  const callerTemp = join(root, 'caller-temp');
  await Promise.all([mkdir(callerHome), mkdir(callerTemp)]);
  const environments = [];
  for (const pass of ['pass-1', 'pass-2']) {
    const passRoot = join(root, pass);
    await Promise.all(
      ['home', 'tmp', 'xdg-cache', 'xdg-config'].map((directory) =>
        mkdir(join(passRoot, directory), { recursive: true }),
      ),
    );
    environments.push(
      buildReproducibleEnvironment(
        passRoot,
        join(passRoot, 'user.npmrc'),
        join(passRoot, 'global.npmrc'),
        { HOME: callerHome, PATH: process.env.PATH, TMPDIR: callerTemp },
      ),
    );
  }
  await writeFile(join(environments[0].TMPDIR, 'sentinel'), 'pass one\n');
  await assert.rejects(readFile(join(environments[1].TMPDIR, 'sentinel')));
  await assert.rejects(readFile(join(callerTemp, 'sentinel')));
  assert.notEqual(environments[0].HOME, environments[1].HOME);
  assert.notEqual(environments[0].TMPDIR, environments[1].TMPDIR);
  assert.notEqual(environments[0].XDG_CACHE_HOME, environments[1].XDG_CACHE_HOME);
});
