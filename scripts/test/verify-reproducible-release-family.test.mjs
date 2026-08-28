import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { STUDIO_RELEASE_PACKAGE_NAMES } from '../release-family.mjs';
import { assertReproduciblePackagePasses } from '../verify-reproducible-release-family.mjs';

function pass(suffix = '') {
  return new Map(
    STUDIO_RELEASE_PACKAGE_NAMES.map((name) => [name, Buffer.from(`${name}${suffix}`)]),
  );
}

describe('clean release-family reproducibility gate', () => {
  it('accepts exactly two byte-identical complete package passes', () => {
    assert.doesNotThrow(() => assertReproduciblePackagePasses([pass(), pass()]));
  });

  it('rejects missing, extra, or byte-different passes', () => {
    assert.throws(() => assertReproduciblePackagePasses([pass()]), /exactly two/u);
    assert.throws(() => assertReproduciblePackagePasses([pass(), pass(), pass()]), /exactly two/u);
    assert.throws(() => assertReproduciblePackagePasses([pass(), pass('-different')]), /differ/u);
    const incomplete = pass();
    incomplete.delete(STUDIO_RELEASE_PACKAGE_NAMES[0]);
    assert.throws(() => assertReproduciblePackagePasses([pass(), incomplete]), /differ/u);
  });
});
