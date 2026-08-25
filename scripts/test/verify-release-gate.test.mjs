import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  assertEvidenceChangedPaths,
  assertStableChangedPaths,
  assertStableEnvironmentQualification,
  assertStablePromotion,
  assertStatusGatePass,
} from '../verify-release-gate.mjs';

const packageNames = [
  '@kumwe/studio-core',
  '@kumwe/studio-media',
  '@kumwe/studio-preview',
  '@kumwe/studio-protocol',
  '@kumwe/studio-renderer-web',
  '@kumwe/studio-rich-text',
  '@kumwe/studio',
  '@kumwe/studio-testkit',
];

describe('promotion gate guards', () => {
  it('treats STATUS as an explicit fail-closed gate authority', () => {
    assert.doesNotThrow(() => assertStatusGatePass('| Gate A | Pass | evidence |', 'A'));
    assert.throws(
      () => assertStatusGatePass('| Gate A | Not assessed | none |', 'A'),
      /publication is blocked/u,
    );
  });

  it('allows evidence commits to carry records, not executable release changes', () => {
    assert.doesNotThrow(() =>
      assertEvidenceChangedPaths([
        'docs/roadmap/STATUS.md',
        'evidence/bundles/bundle-one/manifest.json',
        'evidence/gates/gate-a.json',
      ]),
    );
    assert.throws(
      () => assertEvidenceChangedPaths(['scripts/verify-release-gate.mjs']),
      /outside evidence records/u,
    );
  });

  it('requires qualified Version 2 environment rows before stable', () => {
    const candidate = {
      environments: [
        {
          coveredBy: [],
          id: 'chromium-desktop',
          kind: 'browser',
          requirement: 'Current Chromium',
          status: 'target',
        },
        {
          coveredBy: [],
          id: 'dart-flutter',
          kind: 'toolchain',
          requirement: 'Version 3 Dart target',
          status: 'target',
        },
      ],
    };
    assert.doesNotThrow(() =>
      assertStableEnvironmentQualification(
        {
          environments: [
            {
              coveredBy: ['bundle'],
              id: 'chromium-desktop',
              kind: 'browser',
              requirement: 'Current Chromium',
              status: 'qualified',
            },
            {
              coveredBy: [],
              id: 'dart-flutter',
              kind: 'toolchain',
              requirement: 'Version 3 Dart target',
              status: 'target',
            },
          ],
        },
        candidate,
      ),
    );
    assert.throws(
      () =>
        assertStableEnvironmentQualification(
          {
            environments: [
              {
                coveredBy: [],
                id: 'chromium-desktop',
                kind: 'browser',
                requirement: 'Current Chromium',
                status: 'target',
              },
              candidate.environments[1],
            ],
          },
          candidate,
        ),
      /chromium-desktop/u,
    );
    assert.throws(
      () =>
        assertStableEnvironmentQualification(
          { environments: [candidate.environments[1]] },
          candidate,
        ),
      /preserve every/u,
    );
  });

  it('permits only a deterministic RC-to-stable metadata transform', () => {
    const rc = release('0.1.0-rc.2');
    const stable = release('0.1.0');
    assert.doesNotThrow(() => assertStablePromotion(rc, stable));
    assert.doesNotThrow(() =>
      assertStableChangedPaths([
        '.changeset/pre.json',
        'package-lock.json',
        'packages/core/package.json',
        'studio-release.json',
      ]),
    );
    assert.throws(() => assertStableChangedPaths(['packages/core/src/index.ts']), /outside/u);
  });
});

function release(version) {
  return {
    claimedProfiles: ['studio.profile/engine-core'],
    packages: Object.fromEntries(packageNames.map((name) => [name, version])),
    release: version,
  };
}
