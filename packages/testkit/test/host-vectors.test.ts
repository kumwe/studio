import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Ajv2020 } from 'ajv/dist/2020.js';
import {
  isHostPortError,
  protocolSchemas,
  type HostErrorCategory,
  type HostRequestContext,
  type JsonObject,
  type MediaQuery,
  type MediaUploadRequestDescriptor,
  type QualifiedName,
  type Revision,
  type StableId,
  type StudioArtifact,
  type TelemetryEvent,
} from '@kumwe/studio-protocol';
import { createBlueprintFixture, createTestbedHost, type TestbedHost } from '../src/index.js';

/**
 * The canonical host conformance corpus, replayed against the reference host.
 * Every vector states a reproducible precondition and the exact outcome the
 * host contract requires, so an implementation in any language proves the same
 * behaviour from the published JSON without executing Studio code. This suite
 * is the TypeScript reference's own claim against the baseline profile.
 */

interface HostVectorGiven {
  artifacts: { id: StableId; kind: string; revision: Revision }[];
  permissions: QualifiedName[];
  sessionGeneration?: Revision;
}

interface HostVectorExpectResult {
  outcome: 'result';
  revision?: Revision;
  revisionAdvances?: boolean;
  value?: string;
}

interface HostVectorExpectError {
  category: HostErrorCategory;
  messageMustNotContain?: string[];
  outcome: 'error';
  retryable?: boolean;
  revision?: Revision;
}

interface HostVector {
  argument?: Record<string, unknown>;
  context: Record<string, unknown>;
  description: string;
  expect: HostVectorExpectError | HostVectorExpectResult;
  given: HostVectorGiven;
  id: string;
  operation: string;
  port: string;
  profile: string;
}

const vectorDirectory = join(process.cwd(), 'packages/testkit/vectors/host');
const vectorFiles = (await readdir(vectorDirectory))
  .filter((name) => name.endsWith('.json'))
  .sort();

const vectors: [string, HostVector][] = await Promise.all(
  vectorFiles.map(async (file): Promise<[string, HostVector]> => {
    const vector = JSON.parse(await readFile(join(vectorDirectory, file), 'utf8')) as HostVector;
    return [file, vector];
  }),
);

const ajv = new Ajv2020({ allErrors: true, strict: true });
for (const schema of protocolSchemas) {
  ajv.addSchema(schema);
}
const validateHostVector = ajv.getSchema(
  'https://schemas.kumwe.org/studio/v1/host-vector.schema.json',
);

function seedHost(given: HostVectorGiven): TestbedHost {
  const documents: StudioArtifact[] = given.artifacts.map((artifact) =>
    createBlueprintFixture({ id: artifact.id }),
  );
  return createTestbedHost({ documents, permissions: given.permissions });
}

/** Dispatches one vector onto the reference host's typed port surface. */
async function dispatch(vector: HostVector, testbed: TestbedHost): Promise<unknown> {
  const context = vector.context as unknown as HostRequestContext;
  const argument = vector.argument ?? {};
  const host = testbed.host;
  switch (`${vector.port}.${vector.operation}`) {
    case 'artifact.dependencies':
      return host.artifact.dependencies(argument as never, context);
    case 'artifact.load':
      return host.artifact.load(argument as never, context);
    case 'artifact.publish':
      return host.artifact.publish(argument as never, context);
    case 'artifact.save':
      return host.artifact.save(createBlueprintFixture({ id: argument.id as string }), context);
    case 'artifact.unpublish':
      return host.artifact.unpublish(argument as never, context);
    case 'localization.messages':
      return host.localization?.messages(
        argument.locale as string,
        argument.namespaces as QualifiedName[],
        context,
      );
    case 'media.abort-upload':
      return host.media?.abortUpload(argument.uploadId as StableId, context);
    case 'media.authorize-upload':
      return host.media?.authorizeUpload(
        argument as unknown as MediaUploadRequestDescriptor,
        context,
      );
    case 'media.complete-upload':
      return host.media?.completeUpload(argument.uploadId as StableId, context);
    case 'media.import-external':
      return host.media?.importExternal(argument.url as string, context);
    case 'media.upload-status':
      return host.media?.uploadStatus(argument.assetId as StableId, context);
    case 'media.get':
      return host.media?.get(argument.assetId as StableId, context);
    case 'media.list':
      return host.media?.list(argument as unknown as MediaQuery, context);
    case 'permission.explain':
      return host.permission?.explain(argument.operation as QualifiedName, context);
    case 'permission.refresh':
      return host.permission?.refresh(context);
    case 'recovery.load':
      return host.recovery?.load(context);
    case 'recovery.store':
      return host.recovery?.store(argument as JsonObject, context);
    case 'telemetry.emit':
      return host.telemetry?.emit(argument as unknown as TelemetryEvent, context);
    default:
      throw new Error(`No dispatch is declared for ${vector.port}.${vector.operation}.`);
  }
}

describe('canonical host conformance vectors', () => {
  it('has a non-empty corpus', () => {
    expect(vectors.length).toBeGreaterThan(0);
  });

  it('declares one profile across the corpus', () => {
    const profiles = new Set(vectors.map(([, vector]) => vector.profile));
    expect([...profiles]).toEqual(['studio.profile/host-baseline']);
  });

  describe.each(vectors)('%s', (file, vector) => {
    it('validates against the canonical host-vector schema', () => {
      expect(validateHostVector).toBeDefined();
      expect(validateHostVector?.(vector), ajv.errorsText(validateHostVector?.errors)).toBe(true);
    });

    it('the reference host produces the required outcome', async () => {
      const testbed = seedHost(vector.given);
      const stored = vector.given.artifacts[0];
      const priorRevision =
        stored === undefined ? undefined : testbed.controls.revisionOf(stored.id);

      if (vector.expect.outcome === 'result') {
        const expected = vector.expect;
        const result = (await dispatch(vector, testbed)) as {
          revision?: Revision;
          value: unknown;
        };
        if (expected.revision !== undefined) {
          expect(result.revision).toBe(expected.revision);
        }
        if (expected.revisionAdvances === true) {
          expect(result.revision).toBeDefined();
          expect(result.revision).not.toBe(priorRevision);
        }
        if (expected.value === 'null') {
          expect(result.value).toBeNull();
        } else if (expected.value !== undefined) {
          expect(result.value).not.toBeNull();
        }
        return;
      }

      const failure = vector.expect;
      let caught: unknown;
      try {
        await dispatch(vector, testbed);
      } catch (error) {
        caught = error;
      }
      const hostError = (caught as { error?: unknown } | undefined)?.error;
      expect(isHostPortError(hostError), `${file} did not reject with a canonical host error`).toBe(
        true,
      );
      if (!isHostPortError(hostError)) {
        return;
      }
      expect(hostError.category).toBe(failure.category);
      if (failure.retryable !== undefined) {
        expect(hostError.retryable).toBe(failure.retryable);
      }
      // A conflict resolves without a second read only when it carries the
      // safe current revision the host holds.
      if (failure.revision !== undefined) {
        expect(hostError.revision).toBe(failure.revision);
      }
      // A rejection never echoes private identifiers or request internals.
      const rendered = JSON.stringify(hostError);
      for (const forbidden of failure.messageMustNotContain ?? []) {
        expect(rendered).not.toContain(forbidden);
      }
    });
  });
});
