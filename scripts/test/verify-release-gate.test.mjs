import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { commandForEvidenceLane } from '../evidence-validation.mjs';
import { VERSION_TWO_RELEASE_PROFILES } from '../release-policy.mjs';
import {
  assertCurrentCandidateCoordinate,
  assertEvidenceChangedPaths,
  assertEvidenceSemanticEquality,
  assertLatestGateDecision,
  assertStableChangedPaths,
  assertStableEnvironmentQualification,
  assertStablePromotion,
  assertStatusGatePass,
  EVIDENCE_SEMANTIC_PATHS,
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

  it('refuses to reinterpret historical evidence with current verifier semantics', async (t) => {
    const candidateRoot = await mkdtemp(join(tmpdir(), 'studio-candidate-semantics-'));
    const executionRoot = await mkdtemp(join(tmpdir(), 'studio-execution-semantics-'));
    t.after(() => rm(candidateRoot, { force: true, recursive: true }));
    t.after(() => rm(executionRoot, { force: true, recursive: true }));
    for (const path of EVIDENCE_SEMANTIC_PATHS) {
      for (const root of [candidateRoot, executionRoot]) {
        await mkdir(join(root, path, '..'), { recursive: true });
        await writeFile(join(root, path), `same semantics for ${path}\n`);
      }
    }
    const candidateLock = {
      lockfileVersion: 3,
      packages: {
        '': { devDependencies: { ajv: '1.0.0' } },
        'node_modules/ajv': { integrity: 'sha512-candidate', version: '1.0.0' },
        'node_modules/@kumwe/studio-core': { link: true, resolved: 'packages/core' },
        'packages/core': { version: '0.1.0-rc.1' },
      },
    };
    const executionLock = structuredClone(candidateLock);
    await Promise.all([
      writeFile(join(candidateRoot, 'package-lock.json'), JSON.stringify(candidateLock)),
      writeFile(join(executionRoot, 'package-lock.json'), JSON.stringify(executionLock)),
    ]);
    for (const requiredPath of [
      '.github/actions/setup-studio/action.yml',
      'package.json',
      'package-lock.json',
      'evidence/reviewer-authorities.sha256',
      'evidence/schema/review-attestation.schema.json',
      'evidence/schema/reviewer-authorities.schema.json',
      'scripts/evidence-generator-input.mjs',
      'scripts/prepare-promotion.mjs',
      'scripts/promotion-plan.mjs',
      'scripts/publish-promotion.mjs',
      'scripts/publish-staged-candidate.mjs',
      'scripts/reconcile-release-tag.mjs',
      'scripts/release-artifacts.mjs',
      'scripts/release-family.mjs',
      'scripts/release-policy.mjs',
      'scripts/release-record.mjs',
      'scripts/review-authentication.mjs',
      'scripts/staged-publish.mjs',
      'scripts/verify-published-release.mjs',
    ]) {
      assert.ok(
        EVIDENCE_SEMANTIC_PATHS.includes(requiredPath),
        `${requiredPath} is outside the transitive semantic closure`,
      );
    }
    await assert.doesNotReject(() => assertEvidenceSemanticEquality(candidateRoot, executionRoot));
    for (const path of [
      'scripts/evidence-lanes.mjs',
      'scripts/evidence-generator-input.mjs',
      'scripts/publish-promotion.mjs',
      'scripts/release-policy.mjs',
      'scripts/review-authentication.mjs',
    ]) {
      await writeFile(join(executionRoot, path), `changed semantics for ${path}\n`);
      await assert.rejects(
        () => assertEvidenceSemanticEquality(candidateRoot, executionRoot),
        /differ from the executing release verifier/u,
      );
      await writeFile(join(executionRoot, path), `same semantics for ${path}\n`);
    }
    executionLock.packages['packages/core'].version = '0.1.0';
    await writeFile(join(executionRoot, 'package-lock.json'), JSON.stringify(executionLock));
    await assert.rejects(
      () => assertEvidenceSemanticEquality(candidateRoot, executionRoot),
      /package-lock\.json differs/u,
    );
    await assert.doesNotReject(() =>
      assertEvidenceSemanticEquality(candidateRoot, executionRoot, {
        allowWorkspaceReleaseVersionDrift: true,
      }),
    );
    executionLock.packages['node_modules/ajv'].version = '2.0.0';
    await writeFile(join(executionRoot, 'package-lock.json'), JSON.stringify(executionLock));
    await assert.rejects(
      () =>
        assertEvidenceSemanticEquality(candidateRoot, executionRoot, {
          allowWorkspaceReleaseVersionDrift: true,
        }),
      /external dependency closure differs/u,
    );
    executionLock.packages['node_modules/ajv'].version = '1.0.0';
    await writeFile(join(executionRoot, 'package-lock.json'), JSON.stringify(executionLock));
    await assert.doesNotReject(() =>
      assertEvidenceSemanticEquality(candidateRoot, executionRoot, {
        allowWorkspaceReleaseVersionDrift: true,
      }),
    );
    executionLock.packages['packages/core'].version = '0.1.0-rc.1';
    await writeFile(join(executionRoot, 'package-lock.json'), JSON.stringify(executionLock));
    await rm(join(candidateRoot, 'scripts/publish-promotion.mjs'));
    await assert.rejects(
      () => assertEvidenceSemanticEquality(candidateRoot, executionRoot),
      /must both contain scripts\/publish-promotion\.mjs/u,
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
    claimedProfiles: [...VERSION_TWO_RELEASE_PROFILES],
    packages: Object.fromEntries(packageNames.map((name) => [name, version])),
    release: version,
  };
}
