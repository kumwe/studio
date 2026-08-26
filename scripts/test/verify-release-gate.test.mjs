import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { commandForEvidenceLane } from '../evidence-validation.mjs';
import {
  assertCurrentCandidateCoordinate,
  assertEvidenceChangedPaths,
  assertLatestGateDecision,
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
    assert.doesNotThrow(() =>
      assertStatusGatePass(
        '| Gate B | Pass | evidence |\n| B — implemented, qualified, shippable | 18 | Pass |',
        'B',
      ),
    );
    assert.throws(
      () => assertStatusGatePass('| Gate A | Not assessed | none |', 'A'),
      /publication is blocked/u,
    );
    assert.throws(
      () =>
        assertStatusGatePass(
          '| Gate A | Pass | accepted |\n| A — integration contract established | 14 criteria | Revoked | superseded |',
          'A',
        ),
      /unambiguously/u,
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
    const assertions = new Map([
      [
        'chromium-desktop',
        {
          id: 'chromium-desktop',
          status: 'executable',
          variants: [
            {
              environment: {
                browserPrefix: 'Chromium-',
                os: 'linux-x64',
                variant: 'current',
              },
              id: 'current-linux',
              requiredRuns: ['accessibility/web'],
            },
          ],
        },
      ],
      ['dart-flutter', { id: 'dart-flutter', status: 'target', variants: [] }],
    ]);
    const accepted = new Map([
      [
        'bundle-one',
        {
          environment: {
            browser: 'Chromium-141.0.0.0',
            os: 'linux-x64',
            variant: 'current',
          },
          runs: [
            {
              command: commandForEvidenceLane('accessibility/web'),
              exitStatus: 0,
              retryCount: 0,
              testId: 'accessibility/web',
            },
          ],
        },
      ],
    ]);
    const qualified = {
      environments: [
        {
          coveredBy: ['bundle-one#accessibility/web'],
          id: 'chromium-desktop',
          kind: 'browser',
          requirement: 'Current Chromium',
          status: 'qualified',
        },
        candidate.environments[1],
      ],
    };
    assert.doesNotThrow(() =>
      assertStableEnvironmentQualification(qualified, candidate, accepted, assertions),
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
          new Map(),
          assertions,
        ),
      /chromium-desktop/u,
    );
    assert.throws(
      () =>
        assertStableEnvironmentQualification(
          { environments: [candidate.environments[1]] },
          candidate,
          new Map(),
          assertions,
        ),
      /preserve every/u,
    );
    assert.throws(
      () =>
        assertStableEnvironmentQualification(
          {
            environments: [
              {
                coveredBy: ['arbitrary-label'],
                id: 'chromium-desktop',
                kind: 'browser',
                requirement: 'Current Chromium',
                status: 'qualified',
              },
              candidate.environments[1],
            ],
          },
          candidate,
          new Map(),
          assertions,
        ),
      /registered passing lane/u,
    );

    const forged = structuredClone(qualified);
    accepted.get('bundle-one').runs[0].command = 'true';
    assert.throws(
      () => assertStableEnvironmentQualification(forged, candidate, accepted, assertions),
      /registered passing lane/u,
    );
  });

  it('rejects Linux Chromium labels as target-only iOS qualification', () => {
    const candidate = {
      environments: [
        {
          coveredBy: [],
          id: 'ios-safari',
          kind: 'browser',
          requirement: 'Current iOS Safari',
          status: 'target',
        },
      ],
    };
    const qualified = {
      environments: [
        {
          ...candidate.environments[0],
          coveredBy: ['linux#accessibility/web'],
          status: 'qualified',
        },
      ],
    };
    assert.throws(
      () =>
        assertStableEnvironmentQualification(
          qualified,
          candidate,
          new Map([
            [
              'linux',
              {
                environment: { browser: 'Chromium-141', os: 'linux-x64' },
                runs: [
                  {
                    command: 'true',
                    exitStatus: 0,
                    retryCount: 0,
                    testId: 'accessibility/web',
                  },
                ],
              },
            ],
          ]),
          new Map([['ios-safari', { id: 'ios-safari', status: 'target', variants: [] }]]),
        ),
      /target-only/u,
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

  it('rejects a superseded RC coordinate even when both records are coordinated', () => {
    assert.doesNotThrow(() =>
      assertCurrentCandidateCoordinate(release('0.1.0-rc.2'), release('0.1.0-rc.2')),
    );
    assert.throws(
      () => assertCurrentCandidateCoordinate(release('0.1.0-rc.2'), release('0.1.0-rc.1')),
      /supersedes or differs/u,
    );
  });

  it('rejects a later Gate A revocation or replacement on current main', () => {
    const accepted = Buffer.from('{"decision":"pass"}\n');
    assert.doesNotThrow(() => assertLatestGateDecision(accepted, Buffer.from(accepted), 'A'));
    assert.throws(
      () => assertLatestGateDecision(accepted, Buffer.from('{"decision":"fail"}\n'), 'A'),
      /superseded or revoked/u,
    );
  });
});

function release(version) {
  return {
    claimedProfiles: ['studio.profile/engine-core'],
    packages: Object.fromEntries(packageNames.map((name) => [name, version])),
    release: version,
  };
}
