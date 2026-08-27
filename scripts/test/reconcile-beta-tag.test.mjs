import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { isErroneousPrereleaseLatest, reconcileBetaTags } from '../reconcile-beta-tag.mjs';

const version = '0.1.0-beta.10';

function registry(initial) {
  const state = structuredClone(initial);
  return {
    addTag: async (name, addedVersion, tag) => {
      state[name].tags[tag] = addedVersion;
    },
    npmValue: async ([, spec, field]) => {
      if (field === 'version') {
        const name = spec.slice(0, spec.lastIndexOf('@'));
        const requested = spec.slice(spec.lastIndexOf('@') + 1);
        return state[name].versions.includes(requested) ? requested : undefined;
      }
      return state[spec].tags[field.slice('dist-tags.'.length)];
    },
    state,
  };
}

describe('beta dist-tag reconciliation', () => {
  it('tolerates the registry refusing to delete a prerelease latest tag', async () => {
    const { addTag, npmValue, state } = registry({
      '@kumwe/studio-core': {
        tags: { beta: '0.1.0-beta.8', latest: '0.1.0-beta.8' },
        versions: ['0.1.0-beta.8', version],
      },
    });
    const result = await reconcileBetaTags([{ name: '@kumwe/studio-core', version }], {
      addTag,
      npmValue,
      removeTag: async () => {
        throw new Error('npm error code E403: 403 Forbidden - DELETE dist-tags/latest');
      },
    });
    assert.deepEqual(result.latestRetained, ['@kumwe/studio-core@0.1.0-beta.8']);
    assert.deepEqual(result.latestRemoved, []);
    assert.deepEqual(result.moved, ['@kumwe/studio-core: 0.1.0-beta.8 -> 0.1.0-beta.10']);
    assert.equal(state['@kumwe/studio-core'].tags.beta, version);
  });

  it('records an actual removal of an erroneous prerelease latest tag', async () => {
    const { addTag, npmValue, state } = registry({
      '@kumwe/studio-core': {
        tags: { latest: '0.1.0-beta.8' },
        versions: ['0.1.0-beta.8', version],
      },
    });
    const result = await reconcileBetaTags([{ name: '@kumwe/studio-core', version }], {
      addTag,
      npmValue,
      removeTag: async (name, tag) => {
        state[name].tags = Object.fromEntries(
          Object.entries(state[name].tags).filter(([key]) => key !== tag),
        );
      },
    });
    assert.deepEqual(result.latestRemoved, ['@kumwe/studio-core@0.1.0-beta.8']);
    assert.deepEqual(result.latestRetained, []);
    assert.equal(state['@kumwe/studio-core'].tags.beta, version);
  });

  it('still fails when a removal error leaves the latest tag in a different state', async () => {
    const { addTag, npmValue, state } = registry({
      '@kumwe/studio-core': {
        tags: { latest: '0.1.0-beta.8' },
        versions: ['0.1.0-beta.8', version],
      },
    });
    await assert.rejects(
      reconcileBetaTags([{ name: '@kumwe/studio-core', version }], {
        addTag,
        npmValue,
        removeTag: async (name) => {
          state[name].tags.latest = '0.1.0-beta.7';
          throw new Error('registry wrote an unexpected tag state');
        },
      }),
      /Could not reconcile beta registry tags/u,
    );
  });

  it('still fails when the beta tag itself cannot be moved', async () => {
    const { npmValue } = registry({
      '@kumwe/studio-core': {
        tags: { latest: '1.0.0' },
        versions: [version],
      },
    });
    await assert.rejects(
      reconcileBetaTags([{ name: '@kumwe/studio-core', version }], {
        addTag: async () => {
          throw new Error('npm error code E403');
        },
        npmValue,
        removeTag: async () => undefined,
      }),
      /Could not reconcile beta registry tags/u,
    );
  });

  it('skips unpublished coordinates without touching any tag', async () => {
    const { addTag, npmValue } = registry({
      '@kumwe/studio-core': { tags: {}, versions: [] },
    });
    let removals = 0;
    const result = await reconcileBetaTags([{ name: '@kumwe/studio-core', version }], {
      addTag,
      npmValue,
      removeTag: async () => {
        removals += 1;
      },
    });
    assert.deepEqual(result.unpublished, [`@kumwe/studio-core@${version}`]);
    assert.equal(removals, 0);
  });

  it('classifies only prerelease coordinates as erroneous latest values', () => {
    assert.equal(isErroneousPrereleaseLatest('0.1.0-beta.10'), true);
    assert.equal(isErroneousPrereleaseLatest('1.2.3-rc.1'), true);
    assert.equal(isErroneousPrereleaseLatest('1.2.3'), false);
    assert.equal(isErroneousPrereleaseLatest(undefined), false);
  });
});
