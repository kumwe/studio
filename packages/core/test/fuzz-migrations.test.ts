import { describe, expect, it } from 'vitest';
import type {
  JsonValue,
  OwnerReference,
  QualifiedName,
  SemanticVersion,
} from '@kumwe/studio-protocol';
import {
  canonicalStringify,
  MigrationRunner,
  satisfiesVersionRange,
  StudioMigrationError,
  type MigratableArtifactKind,
  type MigratableDocument,
  type MigrationApplyResult,
  type MigrationDescriptor,
} from '../src/index.js';

/**
 * Deterministic seeded fuzz lane for the MigrationRunner (M3-01). Every
 * iteration generates a fresh runner, a batch of migration descriptors with
 * varied kinds, ranges, loss classifications, and migrate behaviors, plus
 * documents whose versions land inside, at, or outside the source ranges. An
 * independent oracle predicts every plan and apply outcome; any failure
 * message names the seed and iteration needed to replay it.
 */

const SEEDS = [13, 599, 40_961] as const;
const ITERATIONS_PER_SEED = 110;

const OWNER: OwnerReference = { id: 'studio.fuzz/migrations', version: '1.0.0' };
const ARTIFACT_KINDS = [
  'block-definition',
  'blueprint',
  'content-model',
  'entry',
  'theme',
] as const satisfies readonly MigratableArtifactKind[];
const STRING_VALUES = [
  'plain text',
  'quotes "and" a \\ backslash',
  'unicode ☃ é 🚀',
  'line\nbreak\tand tab',
] as const;

type MigrationErrorCode = StudioMigrationError['code'];

/**
 * The exact-record construction fails to compile when a canonical failure
 * code is missing or invented, so membership checks below cover the closed
 * union completely.
 */
const MIGRATION_ERROR_CODES = Object.keys({
  'already-applied': true,
  'confirmation-required': true,
  'duplicate-migration': true,
  'invalid-result': true,
  'not-applicable': true,
  'unknown-migration': true,
} satisfies Record<MigrationErrorCode, true>) as MigrationErrorCode[];

const APPLY_ERROR_CODES = [
  'already-applied',
  'confirmation-required',
  'invalid-result',
  'not-applicable',
  'unknown-migration',
] as const;

type Rng = () => number;

/** mulberry32: integer-safe, identical sequence on every platform. */
function createRng(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t = (t ^ (t + Math.imul(t ^ (t >>> 7), t | 61))) >>> 0;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function integer(rng: Rng, maximumExclusive: number): number {
  return Math.floor(rng() * maximumExclusive);
}

function pick<T>(rng: Rng, items: readonly T[]): T {
  const item = items[integer(rng, items.length)];
  if (item === undefined) {
    throw new Error('pick requires a non-empty candidate list.');
  }
  return item;
}

function shuffle<T>(rng: Rng, items: readonly T[]): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = integer(rng, index + 1);
    const left = copy[index];
    const right = copy[swap];
    if (left !== undefined && right !== undefined) {
      copy[index] = right;
      copy[swap] = left;
    }
  }
  return copy;
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const member of Object.values(value)) {
      deepFreeze(member);
    }
  }
  return value;
}

function describeError(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : JSON.stringify(error);
}

function canonicalDocument(document: MigratableDocument): string {
  return canonicalStringify(document as unknown as JsonValue);
}

// --- descriptor generation -----------------------------------------------

type MigrateBehavior = 'correct' | 'kind-changing' | 'mutation-attempting' | 'wrong-target';

interface GeneratedMigration {
  behavior: MigrateBehavior;
  descriptor: MigrationDescriptor;
  /** One version guaranteed to satisfy the descriptor's source range. */
  insideVersion: SemanticVersion;
}

interface GeneratedRange {
  insideVersion: SemanticVersion;
  sourceVersions: string;
  targetVersion: SemanticVersion;
}

/**
 * One source range in each supported grammar form, paired with a version
 * inside it and a target version guaranteed to sit outside it.
 */
function makeRange(rng: Rng): GeneratedRange {
  const major = 1 + integer(rng, 3);
  const minor = integer(rng, 4);
  const patch = integer(rng, 4);
  switch (integer(rng, 4)) {
    case 0:
      return {
        insideVersion: `${major}.${minor}.${patch}`,
        sourceVersions: `>=${major}.0.0 <${major + 1}.0.0`,
        targetVersion: `${major + 1}.0.0`,
      };
    case 1:
      return {
        insideVersion: `${major}.${minor}.${patch}`,
        sourceVersions: `^${major}.${minor}.${patch}`,
        targetVersion: `${major + 1}.0.0`,
      };
    case 2:
      return {
        insideVersion: `${major}.${minor}.${patch}`,
        sourceVersions: `~${major}.${minor}.${patch}`,
        targetVersion: `${major}.${minor + 1}.0`,
      };
    default:
      return {
        insideVersion: `${major}.${minor}.${patch}`,
        sourceVersions: `${major}.${minor}.${patch}`,
        targetVersion: `${major}.${minor}.${patch + 1}`,
      };
  }
}

function makeMigrate(
  behavior: MigrateBehavior,
  id: QualifiedName,
  targetVersion: SemanticVersion,
): MigrationDescriptor['migrate'] {
  switch (behavior) {
    case 'correct':
      return (input) => ({ ...input, migratedBy: id, version: targetVersion });
    case 'kind-changing':
      return (input) => ({
        ...input,
        kind: input.kind === 'entry' ? 'theme' : 'entry',
        version: targetVersion,
      });
    case 'mutation-attempting':
      return (input) => {
        // A hostile migrate scribbles over the document it received; only
        // the runner's private working copy may ever absorb this.
        input.tamperedBy = id;
        input.version = '0.0.0-tampered';
        return { ...input, migratedBy: id, version: targetVersion };
      };
    default:
      return (input) => ({ ...input, migratedBy: id, version: `9${targetVersion}` });
  }
}

function makeMigration(rng: Rng, id: QualifiedName): GeneratedMigration {
  const range = makeRange(rng);
  const behaviorRoll = rng();
  const behavior: MigrateBehavior =
    behaviorRoll < 0.55
      ? 'correct'
      : behaviorRoll < 0.7
        ? 'mutation-attempting'
        : behaviorRoll < 0.85
          ? 'kind-changing'
          : 'wrong-target';
  const kindCount = 1 + integer(rng, ARTIFACT_KINDS.length);
  const artifactKinds = shuffle(rng, ARTIFACT_KINDS).slice(0, kindCount).sort();
  return {
    behavior,
    descriptor: {
      artifactKinds,
      description: `Generated ${behavior} migration for ${artifactKinds.join(', ')}.`,
      id,
      lossClassification: rng() < 0.35 ? 'lossy' : 'lossless',
      migrate: makeMigrate(behavior, id, range.targetVersion),
      owner: OWNER,
      sourceVersions: range.sourceVersions,
      targetVersion: range.targetVersion,
    },
    insideVersion: range.insideVersion,
  };
}

// --- document generation -------------------------------------------------

function makeDocument(rng: Rng, kind: string, version: SemanticVersion): MigratableDocument {
  return {
    kind,
    label: pick(rng, STRING_VALUES),
    payload: {
      count: integer(rng, 1_000),
      nested: { flag: rng() < 0.5, tone: pick(rng, STRING_VALUES) },
      tags: Array.from({ length: integer(rng, 3) }, () => pick(rng, STRING_VALUES)),
    },
    version,
  };
}

// --- the oracle ----------------------------------------------------------

function predictApplyOutcome(
  chosen: GeneratedMigration | undefined,
  document: MigratableDocument,
  confirmLossy: boolean,
): MigrationErrorCode | undefined {
  if (chosen === undefined) {
    return 'unknown-migration';
  }
  const { behavior, descriptor } = chosen;
  if (!descriptor.artifactKinds.includes(document.kind as MigratableArtifactKind)) {
    return 'not-applicable';
  }
  if (!satisfiesVersionRange(document.version, descriptor.sourceVersions)) {
    return document.version === descriptor.targetVersion ? 'already-applied' : 'not-applicable';
  }
  if (descriptor.lossClassification === 'lossy' && !confirmLossy) {
    return 'confirmation-required';
  }
  if (behavior === 'kind-changing' || behavior === 'wrong-target') {
    return 'invalid-result';
  }
  return undefined;
}

// --- the lane ------------------------------------------------------------

interface LaneOutcome {
  applied: number;
  codes: Partial<Record<MigrationErrorCode, number>>;
  registerRejections: number;
  rejected: number;
  trace: string[];
}

function runMigrationLane(seed: number): LaneOutcome {
  const rng = createRng(seed);
  const outcome: LaneOutcome = {
    applied: 0,
    codes: {},
    registerRejections: 0,
    rejected: 0,
    trace: [],
  };

  const recordRejection = (code: MigrationErrorCode): void => {
    outcome.codes[code] = (outcome.codes[code] ?? 0) + 1;
    outcome.rejected += 1;
  };

  for (let iteration = 0; iteration < ITERATIONS_PER_SEED; iteration += 1) {
    const context = `seed=${seed} iteration=${iteration}`;
    const runner = new MigrationRunner();
    const generated: GeneratedMigration[] = [];
    const count = 2 + integer(rng, 3);
    for (let index = 0; index < count; index += 1) {
      const migration = makeMigration(rng, `studio.migration/gen-${seed}-${iteration}-${index}`);
      runner.register(migration.descriptor);
      generated.push(migration);
    }

    if (rng() < 0.5) {
      // A rejected registration must leave the registry untouched.
      const registered = runner.migrations().map((migration) => migration.id);
      const rejectionKind = integer(rng, 3);
      const expectedCode: MigrationErrorCode =
        rejectionKind === 0
          ? 'duplicate-migration'
          : rejectionKind === 1
            ? 'invalid-result'
            : 'not-applicable';
      let failure: unknown;
      try {
        if (rejectionKind === 0) {
          runner.register(pick(rng, generated).descriptor);
        } else if (rejectionKind === 1) {
          const template = makeMigration(rng, `studio.migration/self-${seed}-${iteration}`);
          runner.register({
            ...template.descriptor,
            sourceVersions: '>=1.0.0 <3.0.0',
            targetVersion: '2.0.0',
          });
        } else {
          const template = makeMigration(rng, `studio.migration/kindless-${seed}-${iteration}`);
          runner.register({ ...template.descriptor, artifactKinds: [] });
        }
      } catch (error) {
        failure = error;
      }
      expect(
        failure,
        `${context}: expected a ${expectedCode} registration rejection`,
      ).toBeDefined();
      expect(
        failure instanceof StudioMigrationError,
        `${context}: the registration rejection escaped with ${describeError(failure)}`,
      ).toBe(true);
      if (!(failure instanceof StudioMigrationError)) {
        throw new Error(`${context}: unreachable`);
      }
      expect(failure.code, `${context}: wrong registration rejection code`).toBe(expectedCode);
      expect(
        runner.migrations().map((migration) => migration.id),
        `${context}: a rejected registration changed the registry`,
      ).toStrictEqual(registered);
      outcome.registerRejections += 1;
      outcome.trace.push(`${iteration}:register-rejected:${failure.code}`);
    }

    const documentCount = 2 + integer(rng, 2);
    for (let documentIndex = 0; documentIndex < documentCount; documentIndex += 1) {
      const documentContext = `${context} document=${documentIndex}`;
      const anchor = pick(rng, generated);
      const kindRoll = rng();
      const kind =
        kindRoll < 0.55
          ? pick(rng, anchor.descriptor.artifactKinds)
          : kindRoll < 0.9
            ? pick(rng, ARTIFACT_KINDS)
            : 'alien-artifact';
      const versionRoll = rng();
      const version =
        versionRoll < 0.45
          ? anchor.insideVersion
          : versionRoll < 0.65
            ? anchor.descriptor.targetVersion
            : versionRoll < 0.85
              ? '0.0.1'
              : '9.9.9';
      const document = makeDocument(rng, kind, version);
      deepFreeze(document);
      const before = canonicalDocument(document);

      // plan(): only matching migrations, sorted by id, deterministically.
      const expectedPlan = generated
        .filter(
          (entry) =>
            entry.descriptor.artifactKinds.includes(document.kind as MigratableArtifactKind) &&
            satisfiesVersionRange(document.version, entry.descriptor.sourceVersions),
        )
        .map((entry) => entry.descriptor.id)
        .sort();
      const plannedIds = runner.plan(document).map((migration) => migration.id);
      expect(plannedIds, `${documentContext}: plan disagrees with the oracle`).toStrictEqual(
        expectedPlan,
      );
      expect(
        runner.plan(document).map((migration) => migration.id),
        `${documentContext}: plan is not deterministic`,
      ).toStrictEqual(plannedIds);
      expect(
        canonicalDocument(document),
        `${documentContext}: plan mutated its input document`,
      ).toBe(before);

      // apply(): the oracle predicts success or the exact failure code. The
      // anchor migration is favored so the success path stays represented.
      const chosenRoll = rng();
      const chosen =
        chosenRoll < 0.15 ? undefined : chosenRoll < 0.6 ? anchor : pick(rng, generated);
      const migrationId: QualifiedName =
        chosen === undefined ? 'studio.migration/unknown' : chosen.descriptor.id;
      const confirmLossy = rng() < 0.5;
      const expected = predictApplyOutcome(chosen, document, confirmLossy);
      let failure: unknown;
      let result: MigrationApplyResult | undefined;
      try {
        result = runner.apply(document, migrationId, { confirmLossy });
      } catch (error) {
        failure = error;
      }

      if (expected === undefined) {
        expect(
          failure,
          `${documentContext}: expected success but received ${describeError(failure)}`,
        ).toBeUndefined();
        expect(result, `${documentContext}: apply returned nothing`).toBeDefined();
        if (result === undefined || chosen === undefined) {
          throw new Error(`${documentContext}: unreachable`);
        }
        expect(result.migrationId, `${documentContext}: wrong migration id`).toBe(migrationId);
        expect(result.diagnostics, `${documentContext}: unexpected diagnostics`).toStrictEqual([]);
        expect(result.document.kind, `${documentContext}: the migration changed the kind`).toBe(
          document.kind,
        );
        expect(result.document.version, `${documentContext}: wrong target version`).toBe(
          chosen.descriptor.targetVersion,
        );
        expect(result.document.migratedBy, `${documentContext}: the migrate never ran`).toBe(
          chosen.descriptor.id,
        );
        if (chosen.behavior === 'mutation-attempting') {
          expect(
            result.document.tamperedBy,
            `${documentContext}: migrate must receive a private working copy`,
          ).toBe(chosen.descriptor.id);
        }
        outcome.applied += 1;
        outcome.trace.push(`${iteration}.${documentIndex}:applied:${chosen.behavior}`);

        // Reapplying the same migration at the target version now
        // classifies as already-applied, never as a second application.
        let reapplyFailure: unknown;
        try {
          runner.apply(result.document, migrationId, { confirmLossy: true });
        } catch (error) {
          reapplyFailure = error;
        }
        expect(
          reapplyFailure instanceof StudioMigrationError &&
            reapplyFailure.code === 'already-applied',
          `${documentContext}: reapplication must fail with already-applied, got ${describeError(reapplyFailure)}`,
        ).toBe(true);
        if (reapplyFailure instanceof StudioMigrationError) {
          recordRejection(reapplyFailure.code);
        }
      } else {
        expect(failure, `${documentContext}: expected a ${expected} rejection`).toBeDefined();
        expect(
          failure instanceof StudioMigrationError,
          `${documentContext}: the rejection escaped with ${describeError(failure)}`,
        ).toBe(true);
        if (!(failure instanceof StudioMigrationError)) {
          throw new Error(`${documentContext}: unreachable`);
        }
        expect(
          MIGRATION_ERROR_CODES.includes(failure.code),
          `${documentContext}: code ${failure.code} left the closed union`,
        ).toBe(true);
        expect(
          failure.code,
          `${documentContext}: expected ${expected} but received ${failure.code}`,
        ).toBe(expected);
        recordRejection(failure.code);
        outcome.trace.push(`${iteration}.${documentIndex}:rejected:${failure.code}`);
      }

      // apply() never mutates its input, on success or failure alike.
      expect(canonicalDocument(document), `${documentContext}: apply mutated its input`).toBe(
        before,
      );
    }
  }
  return outcome;
}

describe('migration runner fuzzing (M3-01)', () => {
  it.each([...SEEDS])(
    'holds the runner invariants across %d-seeded descriptors and documents',
    (seed) => {
      const outcome = runMigrationLane(seed);
      // Guard against silent generator degeneration: the success path, the
      // rejection path, and every apply-facing failure code must stay well
      // represented.
      expect(outcome.applied, `seed=${seed}: too few applied migrations`).toBeGreaterThan(20);
      expect(outcome.rejected, `seed=${seed}: too few rejected migrations`).toBeGreaterThan(20);
      expect(
        outcome.registerRejections,
        `seed=${seed}: too few rejected registrations`,
      ).toBeGreaterThan(10);
      for (const code of APPLY_ERROR_CODES) {
        expect(
          outcome.codes[code] ?? 0,
          `seed=${seed}: failure code ${code} was never exercised`,
        ).toBeGreaterThan(0);
      }
    },
  );

  it('produces an identical outcome stream for a fixed seed', () => {
    expect(runMigrationLane(SEEDS[0]).trace).toStrictEqual(runMigrationLane(SEEDS[0]).trace);
  });
});
