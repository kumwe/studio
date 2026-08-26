import assert from 'node:assert/strict';
import test from 'node:test';

import { checkReleasePins } from '../check-release-pins.mjs';

test('the checked-in eight-package family and internal pins stay coordinated across version increments', async () => {
  const result = await checkReleasePins();
  assert.equal(result.packageCount, 8);
  // Changesets owns the coordinate, so this invariant must remain valid for every generated version.
  assert.match(
    result.version,
    /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u,
  );
});
