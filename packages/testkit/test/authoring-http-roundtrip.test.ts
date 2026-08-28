import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { Ajv2020 } from 'ajv/dist/2020.js';
import {
  HostPortFailure,
  STUDIO_CONTRACT_VERSION,
  STUDIO_WIRE_PROTOCOL_VERSION,
  type AuthoringPort,
  type AuthoringSaveAsNewTypeRequest,
  type AuthoringSaveIntent,
  type AuthoringSaveItemRequest,
  type AuthoringSaveNewTypeVersionRequest,
  type AuthoringSavePlan,
  type AuthoringSaveResult,
  type AuthoringSessionSnapshot,
  type AuthoringStartRequest,
  type AuthoringTargetDeclaration,
  type AuthoringTargetResolveRequest,
  type AuthoringTargetResolution,
  type AuthoringTypeListPage,
  type AuthoringTypeListQuery,
  type HostPortError,
  type HostRequestContext,
  type ReusableContentTypeDefinition,
} from '@kumwe/studio-protocol';
import {
  AUTHORING_HTTP_OPERATIONS,
  createAuthoringHttpResponder,
  createHttpHostAdapter,
  type HttpSchemaValidator,
} from '../src/index.js';

const schemaDirectory = join(process.cwd(), 'schemas');
const ajv = new Ajv2020({ allErrors: true, strict: true });
for (const name of (await readdir(schemaDirectory)).filter((entry) =>
  entry.endsWith('.schema.json'),
)) {
  ajv.addSchema(JSON.parse(await readFile(join(schemaDirectory, name), 'utf8')) as object);
}
const validateSchema: HttpSchemaValidator = (reference, value) => {
  const validate = ajv.getSchema(reference);
  if (validate === undefined) {
    throw new Error(`Unknown canonical schema ${reference}.`);
  }
  return validate(value) as boolean;
};

const target = await fixture<AuthoringTargetDeclaration>('authoring-target.example.json');
const session = await fixture<AuthoringSessionSnapshot>('authoring-session.example.json');
const reusableType = await fixture<ReusableContentTypeDefinition>(
  'reusable-content-type.example.json',
);
const versionPlan = await fixture<AuthoringSavePlan>('authoring-save.plan.example.json');

const resolution: AuthoringTargetResolution = {
  availableStarts: ['blank', 'from-type', 'existing'],
  initialPresentation: 'inline',
  resourceContext: session.resourceContext,
  target,
};
const typePage: AuthoringTypeListPage = {
  items: [
    {
      blueprint: reusableType.blueprint,
      label: reusableType.label,
      model: reusableType.model,
      reference: {
        id: reusableType.id,
        revision: reusableType.revision,
        version: reusableType.version,
      },
    },
  ],
};
const itemPlan: AuthoringSavePlan = {
  ...versionPlan,
  affectedArtifacts: ['entry'],
  confirmationRequired: false,
  consequences: [],
  id: 'save-plans/http-item',
  outcome: 'save-item',
  revision: 'save-plan-item-r1',
};
const newTypePlan: AuthoringSavePlan = {
  ...versionPlan,
  affectedArtifacts: ['model', 'blueprint', 'reusable-content-type'],
  id: 'save-plans/http-new-type',
  outcome: 'save-as-new-type',
  revision: 'save-plan-new-type-r1',
};

const resolveRequest: AuthoringTargetResolveRequest = {
  intent: 'edit',
  requestedPresentation: 'inline',
  resourceContext: session.resourceContext,
  targetId: target.id,
};
const listQuery: AuthoringTypeListQuery = {
  limit: 20,
  resourceContext: session.resourceContext,
  targetId: target.id,
};
const startRequest: AuthoringStartRequest = {
  resourceContext: session.resourceContext,
  source: { kind: 'existing' },
  targetId: target.id,
};
const itemIntent: AuthoringSaveIntent = {
  contractVersion: STUDIO_CONTRACT_VERSION,
  draft: { entry: session.state.entry, outcome: 'save-item' },
  expected: session.state.coordinates,
  kind: 'authoring-save-intent',
  sessionId: session.sessionId,
};
const saveItemRequest: AuthoringSaveItemRequest = {
  acceptedConsequences: [],
  contractVersion: STUDIO_CONTRACT_VERSION,
  draft: { entry: session.state.entry, outcome: 'save-item' },
  kind: 'authoring-save-item-request',
  plan: { id: itemPlan.id, revision: itemPlan.revision },
};
const saveVersionRequest: AuthoringSaveNewTypeVersionRequest = {
  acceptedConsequences: ['studio.authoring/dependent-entry-migration'],
  contractVersion: STUDIO_CONTRACT_VERSION,
  draft: {
    blueprint: session.state.blueprint,
    model: session.state.model,
    outcome: 'save-new-type-version',
  },
  kind: 'authoring-save-new-type-version-request',
  plan: { id: versionPlan.id, revision: versionPlan.revision },
};
const saveAsTypeRequest: AuthoringSaveAsNewTypeRequest = {
  acceptedConsequences: ['studio.authoring/dependent-entry-migration'],
  contractVersion: STUDIO_CONTRACT_VERSION,
  draft: {
    authoringPolicy: reusableType.authoringPolicy,
    blueprint: session.state.blueprint,
    label: reusableType.label,
    model: session.state.model,
    outcome: 'save-as-new-type',
  },
  kind: 'authoring-save-as-new-type-request',
  plan: { id: newTypePlan.id, revision: newTypePlan.revision },
};

describe('contextual authoring HTTP reference binding', () => {
  it('round-trips all seven exact operations with rotating security headers outside JSON', async () => {
    const calls: string[] = [];
    const authoring = createAuthoringPort(calls);
    const responder = createAuthoringHttpResponder(authoring, {
      validateSchema,
      verifyTransportSecurity: ({ headers }) => ({
        authenticated: headers.cookie === 'studio_session=accepted',
        requestIntegrity: headers['x-studio-csrf-token'] === 'rotated',
      }),
    });
    const headerFactory = vi.fn(() => ({
      cookie: 'studio_session=accepted',
      'x-studio-csrf-token': 'rotated',
    }));
    const observedBodies: string[] = [];
    const adapter = createHttpHostAdapter('', {
      credentials: 'include',
      fetchImplementation: async (url, init) => {
        expect(init.credentials).toBe('include');
        observedBodies.push(init.body);
        const response = await responder({
          body: init.body,
          headers: init.headers,
          method: init.method,
          path: url,
        });
        const contentType = response.headers['content-type'];
        return {
          ...(contentType === undefined ? {} : { contentType }),
          status: response.status,
          text: () => Promise.resolve(response.body),
        };
      },
      requestHeaders: headerFactory,
      validateSchema,
    });
    const authoringAdapter = requiredAuthoring(adapter.authoring);

    expect(
      (await authoringAdapter.resolveTarget(resolveRequest, context('resolveTarget', 1))).value,
    ).toEqual(resolution);
    expect((await authoringAdapter.listTypes(listQuery, context('listTypes', 2))).value).toEqual(
      typePage,
    );
    expect((await authoringAdapter.start(startRequest, context('start', 3))).value).toEqual(
      session,
    );
    expect((await authoringAdapter.planSave(itemIntent, context('planSave', 4))).value).toEqual(
      itemPlan,
    );
    expect(
      (await authoringAdapter.saveItem(saveItemRequest, context('saveItem', 5))).value.outcome,
    ).toBe('save-item');
    expect(
      (
        await authoringAdapter.saveNewTypeVersion(
          saveVersionRequest,
          context('saveNewTypeVersion', 6),
        )
      ).value.outcome,
    ).toBe('save-new-type-version');
    expect(
      (await authoringAdapter.saveAsNewType(saveAsTypeRequest, context('saveAsNewType', 7))).value
        .outcome,
    ).toBe('save-as-new-type');

    expect(calls).toEqual([
      'resolve-target',
      'list-types',
      'start',
      'plan-save',
      'save-item',
      'save-new-type-version',
      'save-as-new-type',
    ]);
    expect(headerFactory).toHaveBeenCalledTimes(7);
    expect(
      observedBodies.every((body) => !body.includes('studio_session') && !body.includes('rotated')),
    ).toBe(true);
  });

  it('refuses authentication, request integrity, malformed input, and context mismatch before dispatch', async () => {
    const calls: string[] = [];
    const authoring = createAuthoringPort(calls);
    let authenticated = false;
    let requestIntegrity = true;
    const responder = createAuthoringHttpResponder(authoring, {
      maximumRequestBytes: 200_000,
      validateSchema,
      verifyTransportSecurity: () => ({ authenticated, requestIntegrity }),
    });
    const validBody = JSON.stringify({
      arguments: { request: resolveRequest },
      context: context('resolveTarget', 8),
    });

    expect((await respond(responder, validBody)).status).toBe(401);
    authenticated = true;
    requestIntegrity = false;
    expect((await respond(responder, validBody)).status).toBe(403);
    requestIntegrity = true;
    expect((await respond(responder, '{')).status).toBe(400);
    const mismatch = JSON.stringify({
      arguments: { request: resolveRequest },
      context: { ...context('resolveTarget', 9), resourceContextKey: 'contexts/other' },
    });
    expect((await respond(responder, mismatch)).status).toBe(400);
    expect(calls).toEqual([]);
  });

  it('requires mutation idempotency, maps canonical conflicts, and hides unknown failures', async () => {
    const conflict: HostPortError = {
      category: 'conflict',
      contractVersion: STUDIO_CONTRACT_VERSION,
      kind: 'host-error',
      message: { defaultMessage: 'Reload the accepted session.', key: 'studio.test/conflict' },
      retryable: false,
      revision: 'entry-r9',
    };
    const authoring = createAuthoringPort([]);
    authoring.start = () => Promise.reject(new HostPortFailure(conflict));
    const responder = createAuthoringHttpResponder(authoring, {
      validateSchema,
      verifyTransportSecurity: () => ({ authenticated: true, requestIntegrity: true }),
    });
    const missingIdempotency = JSON.stringify({
      arguments: { request: startRequest },
      context: { ...context('start', 10), idempotencyKey: undefined },
    });
    expect((await respond(responder, missingIdempotency)).status).toBe(400);

    const conflictResponse = await respond(
      responder,
      JSON.stringify({ arguments: { request: startRequest }, context: context('start', 11) }),
      '/ports/authoring/start',
    );
    expect(conflictResponse.status).toBe(409);
    expect(JSON.parse(conflictResponse.body)).toMatchObject({
      category: 'conflict',
      revision: 'entry-r9',
    });

    authoring.start = () => Promise.reject(new Error('private database path /srv/secret'));
    const internal = await respond(
      responder,
      JSON.stringify({ arguments: { request: startRequest }, context: context('start', 12) }),
      '/ports/authoring/start',
    );
    expect(internal.status).toBe(500);
    expect(internal.body).not.toContain('/srv/secret');
  });

  it('publishes a vector matrix identical to the production route registry', async () => {
    const vector = JSON.parse(
      await readFile(
        join(process.cwd(), 'schemas/vectors/authoring-http/transport-matrix.json'),
        'utf8',
      ),
    ) as {
      operations: {
        capability: string;
        route: string;
        requestSchema: string;
        responseSchema: string;
      }[];
    };
    const byRoute = (left: { route: string }, right: { route: string }): number =>
      left.route.localeCompare(right.route);
    expect(
      vector.operations
        .map(({ capability, requestSchema, responseSchema, route }) => ({
          capability,
          requestSchema,
          responseSchema,
          route,
        }))
        .sort(byRoute),
    ).toEqual(
      Object.values(AUTHORING_HTTP_OPERATIONS)
        .map(({ capability, requestSchema, responseSchema, route }) => ({
          capability,
          requestSchema,
          responseSchema,
          route,
        }))
        .sort(byRoute),
    );
  });

  it('fails closed for malformed base URLs, headers, and invalid exact requests or results', async () => {
    const transport = vi.fn(() =>
      Promise.resolve({
        contentType: 'application/json',
        status: 200,
        text: () => Promise.resolve('{"value":null}'),
      }),
    );
    for (const baseUrl of [
      ['https://user:', 'password', '@example.test/studio'].join(''),
      'https://example.test/studio?resource=private',
      'https://example.test/studio//private',
    ]) {
      expect(() =>
        createHttpHostAdapter(baseUrl, {
          fetchImplementation: transport,
        }),
      ).toThrow(TypeError);
    }

    for (const requestHeaders of [
      () => ({ 'Content-Type': 'text/plain' }),
      () => ({ 'X-Studio-Token': 'first', 'x-studio-token': 'second' }),
      () => ({ 'x-studio-token': 'bad\nvalue' }),
    ]) {
      const invalidHeaders = createHttpHostAdapter('', {
        fetchImplementation: transport,
        requestHeaders,
      });
      await expect(
        requiredAuthoring(invalidHeaders.authoring).resolveTarget(
          resolveRequest,
          context('resolveTarget', 20),
        ),
      ).rejects.toMatchObject({ error: { category: 'invalid-request' } });
    }

    const exact = createHttpHostAdapter('', {
      fetchImplementation: transport,
      validateSchema,
    });
    const startContext = context('start', 21);
    delete startContext.idempotencyKey;
    await expect(
      requiredAuthoring(exact.authoring).start(startRequest, startContext),
    ).rejects.toMatchObject({ error: { category: 'invalid-request' } });
    expect(transport).not.toHaveBeenCalled();

    const invalidResultTransport = vi.fn(() =>
      Promise.resolve({
        contentType: 'application/json',
        status: 200,
        text: () => Promise.resolve('{"value":null}'),
      }),
    );
    const invalidResult = createHttpHostAdapter('', {
      fetchImplementation: invalidResultTransport,
      validateSchema,
    });
    await expect(
      requiredAuthoring(invalidResult.authoring).start(startRequest, context('start', 22)),
    ).rejects.toMatchObject({
      error: {
        category: 'internal',
        message: { key: 'studio.transport/http-malformed-response' },
      },
    });
    expect(invalidResultTransport).toHaveBeenCalledTimes(1);
  });
});

async function fixture<T>(name: string): Promise<T> {
  return JSON.parse(await readFile(join(process.cwd(), 'schemas/examples', name), 'utf8')) as T;
}

function context(
  operation: keyof typeof AUTHORING_HTTP_OPERATIONS,
  serial: number,
): HostRequestContext {
  const contract = AUTHORING_HTTP_OPERATIONS[operation];
  return {
    ...(contract.mutating ? { idempotencyKey: `idempotency/http-${serial}` } : {}),
    operationId: contract.capability,
    protocolVersion: STUDIO_WIRE_PROTOCOL_VERSION,
    requestId: `requests/http-${serial}`,
    resourceContextKey: session.resourceContext.key,
    sessionGeneration: session.sessionGeneration,
  };
}

function createAuthoringPort(calls: string[]): AuthoringPort {
  const saveResult = (
    outcome: AuthoringSaveResult['outcome'],
    plan: AuthoringSavePlan,
  ): AuthoringSaveResult => ({
    contractVersion: STUDIO_CONTRACT_VERSION,
    kind: 'authoring-save-result',
    outcome,
    plan: { id: plan.id, revision: plan.revision },
    session,
  });
  return {
    listTypes: () => {
      calls.push('list-types');
      return Promise.resolve({ value: typePage });
    },
    planSave: () => {
      calls.push('plan-save');
      return Promise.resolve({ value: itemPlan });
    },
    resolveTarget: () => {
      calls.push('resolve-target');
      return Promise.resolve({ value: resolution });
    },
    saveAsNewType: () => {
      calls.push('save-as-new-type');
      return Promise.resolve({ value: saveResult('save-as-new-type', newTypePlan) });
    },
    saveItem: () => {
      calls.push('save-item');
      return Promise.resolve({ value: saveResult('save-item', itemPlan) });
    },
    saveNewTypeVersion: () => {
      calls.push('save-new-type-version');
      return Promise.resolve({ value: saveResult('save-new-type-version', versionPlan) });
    },
    start: () => {
      calls.push('start');
      return Promise.resolve({ value: session });
    },
  };
}

function requiredAuthoring(authoring: AuthoringPort | undefined): AuthoringPort {
  if (authoring === undefined) {
    throw new Error('The authoring port is required.');
  }
  return authoring;
}

async function respond(
  responder: ReturnType<typeof createAuthoringHttpResponder>,
  body: string,
  path = '/ports/authoring/resolve-target',
) {
  return responder({
    body,
    headers: { 'content-type': 'application/json' },
    method: 'POST',
    path,
  });
}
