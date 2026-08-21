import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Ajv2020 } from 'ajv/dist/2020.js';
import {
  isHostPortError,
  isPreviewRenderedPayload,
  protocolSchemas,
  type ArtifactReference,
  type HostErrorCategory,
  type HostPortError,
  type HostPortResult,
  type HostRequestContext,
  type JsonObject,
  type PreviewRenderPayload,
  type PreviewRenderedPayload,
  type QualifiedName,
  type Revision,
  type StableId,
} from '@kumwe/studio-protocol';
import { createTestbedHost, type TestbedHost } from '../src/index.js';
import { materializeHostArtifactSeed, type HostArtifactSeed } from './host-artifact-seed.js';

interface SequenceGiven {
  artifacts: HostArtifactSeed[];
  permissions: QualifiedName[];
  rateLimits?: {
    maximumRequests: number;
    operationId: QualifiedName;
    retryAfterMilliseconds: number;
    windowMilliseconds: number;
  }[];
  sessionGeneration: Revision;
}

interface ResultExpectation {
  outcome: 'result';
  revisionAdvancesFrom?: Revision;
  sameAs?: StableId;
  value?: 'null' | 'rendered';
}

interface ErrorExpectation {
  category: HostErrorCategory;
  outcome: 'error';
  retryAfterMilliseconds?: number;
  retryable: boolean;
}

type SequenceExpectation = ErrorExpectation | ResultExpectation;

interface InvokeStep {
  action: 'invoke';
  argument?: unknown;
  completion: 'pending' | 'settled';
  context: HostRequestContext;
  expect?: SequenceExpectation;
  id: StableId;
  operation: string;
  port: string;
}

interface SettleStep {
  action: 'settle';
  expect: SequenceExpectation;
  id: StableId;
  invocation: StableId;
}

interface AdvanceClockStep {
  action: 'advance-clock';
  id: StableId;
  milliseconds: number;
}

interface ReleasePreviewRenderStep {
  action: 'release-preview-render';
  id: StableId;
  invocation: StableId;
  value: PreviewRenderedPayload;
}

type SequenceStep = AdvanceClockStep | InvokeStep | ReleasePreviewRenderStep | SettleStep;

interface HostSequenceVector {
  assertions: string[];
  expectFinal: {
    artifacts?: {
      id: StableId;
      revisionFrom: StableId;
      status: 'archived' | 'draft' | 'in-review' | 'published' | 'retired';
    }[];
    pendingPreviewRenders: 0;
    previewDeliveries: string[];
    recovery?: { resourceContextKey: StableId; value: unknown }[];
  };
  given: SequenceGiven;
  id: StableId;
  profile: string;
  steps: SequenceStep[];
}

type SettledOutcome =
  | { outcome: 'error'; value: HostPortError }
  | { outcome: 'result'; value: HostPortResult<unknown> };

const vectorDirectory = join(process.cwd(), 'packages/testkit/vectors/host-sequence');
const vectorFiles = (await readdir(vectorDirectory))
  .filter((name) => name.endsWith('.json'))
  .sort();
const vectors: [string, HostSequenceVector][] = await Promise.all(
  vectorFiles.map(async (file): Promise<[string, HostSequenceVector]> => [
    file,
    JSON.parse(await readFile(join(vectorDirectory, file), 'utf8')) as HostSequenceVector,
  ]),
);

const ajv = new Ajv2020({ allErrors: true, strict: true });
for (const schema of protocolSchemas) {
  ajv.addSchema(schema);
}
const validateSequence = ajv.getSchema(
  'https://schemas.kumwe.org/studio/v1/host-sequence-vector.schema.json',
);

interface SeededSequenceHost {
  claimPreviewRender(invocation: StableId): void;
  releasePreviewRender(invocation: StableId, value: PreviewRenderedPayload): Promise<void>;
  testbed: TestbedHost;
}

function seedHost(given: SequenceGiven): SeededSequenceHost {
  const unclaimedRenderReleases: ((value: PreviewRenderedPayload) => void)[] = [];
  const claimedRenderReleases = new Map<StableId, (value: PreviewRenderedPayload) => void>();
  const testbed = createTestbedHost({
    documents: given.artifacts.map(materializeHostArtifactSeed),
    permissions: given.permissions,
    sessionGeneration: given.sessionGeneration,
    ...(given.rateLimits === undefined
      ? {}
      : {
          rateLimits: given.rateLimits.map((policy) => ({
            maximumRequests: policy.maximumRequests,
            operationId: policy.operationId,
            windowMilliseconds: policy.windowMilliseconds,
          })),
        }),
    render: () =>
      new Promise((resolve) => {
        unclaimedRenderReleases.push(resolve);
      }),
  });
  return {
    claimPreviewRender(invocation: StableId): void {
      const release = unclaimedRenderReleases.shift();
      if (release === undefined) {
        throw new Error(
          `Preview invocation ${invocation} did not register deferred renderer work.`,
        );
      }
      claimedRenderReleases.set(invocation, release);
    },
    async releasePreviewRender(invocation: StableId, value: PreviewRenderedPayload): Promise<void> {
      const release = claimedRenderReleases.get(invocation);
      if (release === undefined) {
        throw new Error(`Preview invocation ${invocation} has no unreleased renderer work.`);
      }
      claimedRenderReleases.delete(invocation);
      release(value);
      // Let both branches of the render/cancellation race observe the
      // deterministic completion before the next JSON step executes.
      await Promise.resolve();
      await Promise.resolve();
    },
    testbed,
  };
}

function dispatch(step: InvokeStep, testbed: TestbedHost): Promise<HostPortResult<unknown>> {
  const { host } = testbed;
  switch (`${step.port}.${step.operation}`) {
    case 'artifact.publish':
      return host.artifact.publish(step.argument as ArtifactReference, step.context);
    case 'preview.cancel':
      return required(host.preview).cancel(step.argument as string, step.context);
    case 'preview.render':
      return required(host.preview).render(step.argument as PreviewRenderPayload, step.context);
    case 'recovery.store':
      return required(host.recovery).store(step.argument as JsonObject, step.context);
    default:
      throw new Error(`No sequence dispatch is declared for ${step.port}.${step.operation}.`);
  }
}

function required<T>(value: T | undefined): T {
  if (value === undefined) {
    throw new Error('The testbed sequence requires a value that is unavailable.');
  }
  return value;
}

async function settle(promise: Promise<HostPortResult<unknown>>): Promise<SettledOutcome> {
  try {
    return { outcome: 'result', value: await promise };
  } catch (error) {
    const hostError = (error as { error?: unknown } | undefined)?.error;
    if (!isHostPortError(hostError)) {
      throw error;
    }
    return { outcome: 'error', value: hostError };
  }
}

function assertExpectation(
  stepId: StableId,
  expectation: SequenceExpectation,
  outcome: SettledOutcome,
  outcomes: ReadonlyMap<StableId, SettledOutcome>,
): void {
  expect(outcome.outcome, `${stepId} outcome`).toBe(expectation.outcome);
  if (expectation.outcome === 'error') {
    if (outcome.outcome !== 'error') {
      return;
    }
    expect(outcome.value.category).toBe(expectation.category);
    expect(outcome.value.retryable).toBe(expectation.retryable);
    if (expectation.retryAfterMilliseconds !== undefined) {
      expect(outcome.value.retryAfterMilliseconds).toBe(expectation.retryAfterMilliseconds);
    }
    return;
  }
  if (outcome.outcome !== 'result') {
    return;
  }
  if (expectation.revisionAdvancesFrom !== undefined) {
    expect(outcome.value.revision).toBeDefined();
    expect(outcome.value.revision).not.toBe(expectation.revisionAdvancesFrom);
  }
  if (expectation.value === 'null') {
    expect(outcome.value.value).toBeNull();
  } else if (expectation.value === 'rendered') {
    expect(outcome.value.value).not.toBeNull();
  }
  if (expectation.sameAs !== undefined) {
    expect(outcome).toEqual(required(outcomes.get(expectation.sameAs)));
  }
}

function assertPreviewResultCorrelation(step: InvokeStep, outcome: SettledOutcome): void {
  if (`${step.port}.${step.operation}` !== 'preview.render' || outcome.outcome !== 'result') {
    return;
  }
  expect(isPreviewRenderedPayload(outcome.value.value), `${step.id} rendered payload`).toBe(true);
  if (!isPreviewRenderedPayload(outcome.value.value)) {
    return;
  }
  const argument = step.argument as PreviewRenderPayload;
  expect(outcome.value.value.draftDigest).toBe(argument.draftDigest);
  expect(outcome.value.value.requestId).toBe(argument.requestId);
}

describe('canonical host sequence conformance vectors', () => {
  it('declares the widened profile and a non-empty assertion corpus', () => {
    expect(vectors.length).toBeGreaterThan(0);
    expect(new Set(vectors.map(([, vector]) => vector.profile))).toEqual(
      new Set(['studio.profile/host-baseline-v2']),
    );
    expect(new Set(vectors.flatMap(([, vector]) => vector.assertions)).size).toBeGreaterThan(4);
  });

  it('materializes every admitted seed kind, revision, status and live generation exactly', async () => {
    const seeds: HostArtifactSeed[] = [
      {
        id: 'seed/blueprint',
        kind: 'blueprint',
        revision: 'upstream-blueprint-r8',
        status: 'published',
      },
      {
        id: 'seed/model',
        kind: 'content-model',
        revision: 'upstream-model-r13',
        status: 'retired',
      },
      {
        id: 'seed/entry',
        kind: 'entry',
        revision: 'upstream-entry-r21',
        status: 'in-review',
      },
    ];
    const testbed = createTestbedHost({
      documents: seeds.map(materializeHostArtifactSeed),
      sessionGeneration: 'session-upstream-r34',
    });
    expect(testbed.controls.sessionGeneration).toBe('session-upstream-r34');
    for (const seed of seeds) {
      expect(testbed.controls.revisionOf(seed.id)).toBe(seed.revision);
      expect(testbed.controls.artifactStatus(seed.id)).toBe(seed.status);
      const loaded = await testbed.host.artifact.load(
        { id: seed.id, version: '1.0.0' },
        {
          operationId: 'studio.operation/artifact.load',
          protocolVersion: '0.1.0-draft.2',
          requestId: `requests/load-${seed.kind}`,
          resourceContextKey: 'contexts/exact-seed',
          sessionGeneration: 'session-upstream-r34',
        },
      );
      expect(loaded.value).toMatchObject({
        id: seed.id,
        kind: seed.kind,
        revision: seed.revision,
        status: seed.status,
      });
    }
  });

  describe.each(vectors)('%s', (file, vector) => {
    it('validates against the canonical sequence schema', () => {
      expect(validateSequence).toBeDefined();
      expect(validateSequence?.(vector), ajv.errorsText(validateSequence?.errors)).toBe(true);
    });

    it('the reference host produces every ordered and final-state assertion', async () => {
      const seeded = seedHost(vector.given);
      const { testbed } = seeded;
      const invocations = new Map<StableId, Promise<HostPortResult<unknown>>>();
      const invocationSteps = new Map<StableId, InvokeStep>();
      const outcomes = new Map<StableId, SettledOutcome>();
      const releasedPreviewResults = new Map<StableId, PreviewRenderedPayload>();
      const settledInvocations = new Set<StableId>();

      for (const step of vector.steps) {
        if (step.action === 'advance-clock') {
          testbed.controls.advanceClock(step.milliseconds);
          continue;
        }
        if (step.action === 'release-preview-render') {
          await seeded.releasePreviewRender(step.invocation, step.value);
          releasedPreviewResults.set(step.invocation, step.value);
          continue;
        }
        if (step.action === 'invoke') {
          const promise = dispatch(step, testbed);
          // Pending operations may reject before their explicit settle step;
          // attach a handler now while preserving the original promise.
          void promise.catch(() => undefined);
          invocations.set(step.id, promise);
          invocationSteps.set(step.id, step);
          if (`${step.port}.${step.operation}` === 'preview.render') {
            seeded.claimPreviewRender(step.id);
          }
          if (step.completion === 'settled') {
            const outcome = await settle(promise);
            settledInvocations.add(step.id);
            outcomes.set(step.id, outcome);
            assertExpectation(step.id, required(step.expect), outcome, outcomes);
            assertPreviewResultCorrelation(step, outcome);
          }
          continue;
        }

        if (settledInvocations.has(step.invocation)) {
          throw new Error(`Invocation ${step.invocation} was settled more than once.`);
        }
        const outcome = await settle(required(invocations.get(step.invocation)));
        settledInvocations.add(step.invocation);
        outcomes.set(step.id, outcome);
        outcomes.set(step.invocation, outcome);
        assertExpectation(step.id, step.expect, outcome, outcomes);
        assertPreviewResultCorrelation(required(invocationSteps.get(step.invocation)), outcome);
        const releasedPreviewResult = releasedPreviewResults.get(step.invocation);
        if (releasedPreviewResult !== undefined && outcome.outcome === 'result') {
          expect(outcome.value.value).toEqual(releasedPreviewResult);
        }
      }

      expect(settledInvocations).toEqual(new Set(invocations.keys()));
      for (const artifact of vector.expectFinal.artifacts ?? []) {
        expect(testbed.controls.artifactStatus(artifact.id)).toBe(artifact.status);
        const source = required(outcomes.get(artifact.revisionFrom));
        expect(source.outcome).toBe('result');
        if (source.outcome === 'result') {
          expect(testbed.controls.revisionOf(artifact.id)).toBe(source.value.revision);
        }
      }
      for (const recovery of vector.expectFinal.recovery ?? []) {
        expect(testbed.controls.recoveryEnvelope(recovery.resourceContextKey)).toEqual(
          recovery.value,
        );
      }
      expect(testbed.controls.pendingPreviewRenders).toBe(vector.expectFinal.pendingPreviewRenders);
      expect(testbed.controls.previewDeliveries).toEqual(vector.expectFinal.previewDeliveries);
    });
  });
});
