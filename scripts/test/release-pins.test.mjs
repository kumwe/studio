import assert from 'node:assert/strict';
import test from 'node:test';

import { checkReleasePins } from '../check-release-pins.mjs';

test('the checked-in eight-package family and internal pins are coordinated', async () => {
  const result = await checkReleasePins();
  assert.equal(result.packageCount, 8);
  assert.equal(result.version, '0.1.0-alpha.9');
});
