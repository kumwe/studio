import assert from 'node:assert/strict';
import test from 'node:test';

import { inspectEnvironment } from '../doctor.mjs';

const ready = {
  browserInstalled: true,
  dependenciesInstalled: true,
  isShallowRepository: false,
  nodeVersion: '24.19.0',
  npmVersion: '11.9.0',
  packageManager: 'npm@11.9.0',
};

test('accepts the pinned complete contributor environment', () => {
  assert.deepEqual(inspectEnvironment(ready), []);
});

test('reports every actionable environment mismatch together', () => {
  assert.deepEqual(
    inspectEnvironment({
      ...ready,
      browserInstalled: false,
      dependenciesInstalled: false,
      isShallowRepository: true,
      nodeVersion: '25.0.0',
      npmVersion: '12.0.0',
    }),
    [
      'Node 24 is required; found 25.0.0.',
      'npm 11.9.0 is required; found 12.0.0.',
      'A full Git history is required; unshallow the repository before working.',
      'Locked dependencies are absent; run npm ci.',
      'Playwright Chromium is absent; run npx playwright install chromium.',
    ],
  );
});
