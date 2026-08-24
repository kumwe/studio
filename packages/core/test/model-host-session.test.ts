import { describe, expect, it } from 'vitest';
import {
  HostPortFailure,
  STUDIO_CONTRACT_VERSION,
  type BlueprintDocument,
  type ContentModelDocument,
  type HostAdapter,
  type ModelPort,
  type QualifiedName,
  type StudioConfiguration,
} from '@kumwe/studio-protocol';
import {
  createBlueprintFixture,
  createStudioConfigurationFixture,
  createTestbedHost,
} from '@kumwe/studio-testkit';
import {
  openStudioSession,
  StudioHostSessionError,
  type StudioHostSessionIdentifierFactories,
} from '../src/index.js';

const ARTIFACT_LOAD: QualifiedName = 'studio.operation/artifact.load';
const ARTIFACT_SAVE: QualifiedName = 'studio.operation/artifact.save';
const MODEL_GET: QualifiedName = 'studio.operation/model.get';
const MODEL_LIST: QualifiedName = 'studio.operation/model.list';

function modelFixture(overrides: Partial<ContentModelDocument> = {}): ContentModelDocument {
  return {
    contractVersion: STUDIO_CONTRACT_VERSION,
    fields: [
      {
        authoring: { control: 'studio.control/single-line-text', order: 0 },
        cardinality: 'one',
        id: 'title',
        kind: 'string',
        label: { defaultMessage: 'Title', key: 'studio.test/model-title' },
        localized: true,
        required: true,
      },
    ],
    id: 'studio.test/model',
    kind: 'content-model',
    label: { defaultMessage: 'Test model', key: 'studio.test/model' },
    owner: { id: 'studio.test/host', version: '1.0.0' },
    relationships: [],
    revision: 'model-r1',
    status: 'published',
    version: '1.0.0',
    ...overrides,
  };
}

interface IdentifierProbe {
  factories: StudioHostSessionIdentifierFactories;
  operations: QualifiedName[];
}

function identifierProbe(): IdentifierProbe {
  const operations: QualifiedName[] = [];
  let serial = 0;
  return {
    factories: {
      idempotencyKey(operationId): string {
        return `idempotency/${operationId.replaceAll('/', '-')}`;
      },
      requestId(operationId): string {
        operations.push(operationId);
        serial += 1;
        return `requests/model-session-${String(serial)}`;
      },
    },
    operations,
  };
}

function configurationFor(
  blueprint: BlueprintDocument,
  options: {
    modelOperations?: QualifiedName[];
    sessionGeneration?: string;
  } = {},
): StudioConfiguration {
  const configuration = createStudioConfigurationFixture();
  configuration.artifacts.blueprint = {
    id: blueprint.id,
    revision: blueprint.revision,
    version: blueprint.version,
  };
  configuration.sessionGeneration = options.sessionGeneration ?? 'session-r1';
  configuration.hostCapabilities.ports = [
    {
      id: 'studio.port/artifact',
      operations: [ARTIFACT_LOAD, ARTIFACT_SAVE],
      version: '1.0.0',
    },
    {
      id: 'studio.port/model',
      operations: options.modelOperations ?? [MODEL_GET, MODEL_LIST],
      version: '1.0.0',
    },
  ];
  return configuration;
}

describe('host-session model projection surface', () => {
  it('reads active/listed models with stable contexts and detached immutable snapshots', async () => {
    const model = modelFixture();
    const blueprint = createBlueprintFixture({ id: 'models.blueprint' });
    blueprint.model = { id: model.id, revision: model.revision, version: model.version };
    const testbed = createTestbedHost({
      documents: [blueprint, model],
      sessionGeneration: 'session-r1',
    });
    const identifiers = identifierProbe();
    const handle = await openStudioSession(testbed.host, {
      configuration: configurationFor(blueprint),
      identifiers: identifiers.factories,
    });

    expect(handle.models).toBeDefined();
    const loaded = await handle.models?.get(handle.session.document.model);
    expect(loaded).toEqual({ revision: model.revision, value: model });
    const mutableField = loaded?.value.fields[0];
    if (mutableField !== undefined) {
      mutableField.label.defaultMessage = 'caller mutation';
    }
    expect((await handle.models?.get(handle.session.document.model))?.value).toEqual(model);

    const listed = await handle.models?.list();
    expect(listed?.value).toEqual([model]);
    listed?.value.splice(0);
    expect((await handle.models?.list())?.value).toEqual([model]);
    expect(identifiers.operations).toEqual([
      ARTIFACT_LOAD,
      MODEL_GET,
      MODEL_GET,
      MODEL_LIST,
      MODEL_LIST,
    ]);
  });

  it('degrades an incomplete or unimplemented advertised model port precisely', async () => {
    const blueprint = createBlueprintFixture({ id: 'degraded-model.blueprint' });
    const testbed = createTestbedHost({ documents: [blueprint] });

    const incomplete = await openStudioSession(testbed.host, {
      configuration: configurationFor(blueprint, { modelOperations: [MODEL_GET] }),
      identifiers: identifierProbe().factories,
    });
    expect(incomplete.models).toBeUndefined();
    expect(incomplete.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'studio.host/missing-optional-operation',
        parameters: { operationId: MODEL_LIST },
      }),
    );

    const adapter: HostAdapter = { artifact: testbed.host.artifact };
    const unimplemented = await openStudioSession(adapter, {
      configuration: configurationFor(blueprint),
      identifiers: identifierProbe().factories,
    });
    expect(unimplemented.models).toBeUndefined();
    expect(unimplemented.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'studio.host/adapter-port-unavailable',
        parameters: { port: 'studio.port/model' },
      }),
    );
  });

  it('normalizes model list results by exact coordinate without mutating the adapter array', async () => {
    const first = modelFixture({ id: 'studio.test/a-model', revision: 'model-r2' });
    const second = modelFixture({ id: 'studio.test/z-model', revision: 'model-r1' });
    const adapterValues = [second, first];
    const blueprint = createBlueprintFixture({ id: 'ordered-models.blueprint' });
    const testbed = createTestbedHost({ documents: [blueprint] });
    const modelPort: ModelPort = {
      get: (reference) =>
        Promise.resolve({
          value: reference.id === first.id ? first : second,
        }),
      list: () => Promise.resolve({ value: adapterValues }),
    };
    const handle = await openStudioSession(
      { artifact: testbed.host.artifact, model: modelPort },
      { configuration: configurationFor(blueprint), identifiers: identifierProbe().factories },
    );

    expect((await handle.models?.list())?.value.map((entry) => entry.id)).toEqual([
      first.id,
      second.id,
    ]);
    expect(adapterValues.map((entry) => entry.id)).toEqual([second.id, first.id]);
  });

  it('maps malformed and cross-coordinate adapter results to a safe canonical failure', async () => {
    const model = modelFixture();
    const blueprint = createBlueprintFixture({ id: 'unsafe-model.blueprint' });
    blueprint.model = { id: model.id, revision: model.revision, version: model.version };
    const testbed = createTestbedHost({ documents: [blueprint] });
    const modelPort: ModelPort = {
      get: () =>
        Promise.resolve({ value: modelFixture({ id: 'studio.test/private-other-model' }) }),
      list: () => Promise.resolve({ value: [model, model] }),
    };
    const handle = await openStudioSession(
      { artifact: testbed.host.artifact, model: modelPort },
      { configuration: configurationFor(blueprint), identifiers: identifierProbe().factories },
    );
    const models = handle.models;
    if (models === undefined) {
      throw new Error('The complete advertised model port must be bound.');
    }

    for (const read of [
      (): Promise<unknown> => models.get(blueprint.model),
      (): Promise<unknown> => models.list(),
    ]) {
      let caught: unknown;
      try {
        await read();
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(HostPortFailure);
      expect(caught).toMatchObject({
        error: {
          category: 'internal',
          diagnostics: [{ code: 'studio.host/unexpected-model-result' }],
          retryable: false,
        },
      });
      expect((caught as Error).message).not.toContain('private-other-model');
    }
  });

  it('invalidates model reads on stale generation and refuses all later host calls', async () => {
    const model = modelFixture();
    const blueprint = createBlueprintFixture({ id: 'stale-model.blueprint' });
    blueprint.model = { id: model.id, revision: model.revision, version: model.version };
    const testbed = createTestbedHost({ documents: [blueprint, model] });
    const identifiers = identifierProbe();
    const configuration = configurationFor(blueprint, {
      sessionGeneration: testbed.controls.sessionGeneration,
    });
    const handle = await openStudioSession(testbed.host, {
      configuration,
      identifiers: identifiers.factories,
    });
    testbed.controls.setPermissions([]);

    await expect(handle.models?.list()).rejects.toMatchObject({
      error: { category: 'invalid-request' },
    });
    expect(handle.invalidated).toBe(true);
    const attempts = identifiers.operations.length;
    await expect(handle.models?.get(blueprint.model)).rejects.toBeInstanceOf(HostPortFailure);
    expect(identifiers.operations).toHaveLength(attempts);
  });

  it('refuses an invalid caller reference before allocating a request', async () => {
    const blueprint = createBlueprintFixture({ id: 'invalid-reference.blueprint' });
    const testbed = createTestbedHost({ documents: [blueprint] });
    const identifiers = identifierProbe();
    const handle = await openStudioSession(testbed.host, {
      configuration: configurationFor(blueprint),
      identifiers: identifiers.factories,
    });
    const attempts = identifiers.operations.length;

    for (const reference of [
      { id: '__proto__', version: '1.0.0' },
      { id: 'studio.test/model', version: 'not semver' },
      { id: 'studio.test/model', privateHint: true, version: '1.0.0' },
    ]) {
      await expect(handle.models?.get(reference as never)).rejects.toBeInstanceOf(
        StudioHostSessionError,
      );
    }
    expect(identifiers.operations).toHaveLength(attempts);
  });
});
