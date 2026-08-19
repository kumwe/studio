import { createServer, request as httpRequest, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import { StudioSession } from '@kumwe/studio-core';
import {
  isHostPortError,
  type ArtifactReference,
  type BlueprintDocument,
  type HostErrorCategory,
  type HostPortError,
  type HostPortResult,
  type HostRequestContext,
  type InsertNodeCommand,
  type JsonObject,
  type MediaQuery,
  type PreviewRenderPayload,
  type QualifiedName,
  type ResourceSearchQuery,
  type StudioArtifact,
  type TelemetryEvent,
} from '@kumwe/studio-protocol';
import {
  createBlueprintFixture,
  createHostRequestContextFixture,
  createHttpHostAdapter,
  createTestbedHost,
  TestbedHostError,
  type HttpFetchLike,
  type HttpResponseLike,
  type TestbedHostOptions,
} from '../src/index.js';

/**
 * M3-03 "real-transport adapter exercises": the in-memory host testbed is
 * served over an actual `node:http` server through the adapter's JSON
 * mapping, and the session-lifecycle drill plus every transport failure mode
 * runs across real sockets. The adapter itself stays platform-free — the test
 * injects a `node:http`-backed fetch implementation and an abort-signal
 * factory through the documented portability seam.
 */

interface WireRequest {
  arguments: Record<string, unknown>;
  context: HostRequestContext;
}

interface ServerBehaviors {
  /** Destroy the socket of the next request before any response is written. */
  destroyNextSocket: boolean;
  /** Serve this raw status/body for the next request instead of dispatching. */
  overrideNext: { body: string; status: number } | undefined;
  /** Accept the next request but never answer it. */
  stallNextRequest: boolean;
}

interface TestbedServer {
  baseUrl: string;
  behaviors: ServerBehaviors;
  close(): Promise<void>;
  controls: ReturnType<typeof createTestbedHost>['controls'];
}

const statusByCategory: Record<HostErrorCategory, number> = {
  cancelled: 400,
  conflict: 409,
  forbidden: 403,
  incompatible: 400,
  internal: 500,
  'invalid-request': 400,
  'limit-exceeded': 413,
  'not-found': 404,
  'rate-limited': 429,
  unauthenticated: 401,
  unavailable: 503,
  'validation-failed': 422,
};

function definedPort<T>(port: T | undefined): T {
  if (port === undefined) {
    throw new Error('The testbed is expected to implement every port.');
  }
  return port;
}

async function startTestbedServer(options: TestbedHostOptions = {}): Promise<TestbedServer> {
  const { controls, host } = createTestbedHost({
    permissions: ['studio.permission/publish', 'studio.permission/save'],
    ...options,
  });
  const localization = definedPort(host.localization);
  const media = definedPort(host.media);
  const permission = definedPort(host.permission);
  const preview = definedPort(host.preview);
  const recovery = definedPort(host.recovery);
  const resource = definedPort(host.resource);
  const telemetry = definedPort(host.telemetry);

  type Operation = (
    callArguments: Record<string, unknown>,
    context: HostRequestContext,
  ) => Promise<HostPortResult<unknown>>;

  const operations: Record<string, Operation> = {
    'artifact/dependencies': (a, c) =>
      host.artifact.dependencies(a.reference as ArtifactReference, c),
    'artifact/load': (a, c) => host.artifact.load(a.reference as ArtifactReference, c),
    'artifact/publish': (a, c) => host.artifact.publish(a.reference as ArtifactReference, c),
    'artifact/save': (a, c) => host.artifact.save(a.document as StudioArtifact, c),
    'artifact/unpublish': (a, c) => host.artifact.unpublish(a.reference as ArtifactReference, c),
    'localization/messages': (a, c) =>
      localization.messages(a.locale as string, a.namespaces as QualifiedName[], c),
    'media/get': (a, c) => media.get(a.assetId as string, c),
    'media/list': (a, c) => media.list(a.query as MediaQuery, c),
    'permission/explain': (a, c) => permission.explain(a.operation as QualifiedName, c),
    'permission/refresh': (a, c) => permission.refresh(c),
    'preview/cancel': (a, c) => preview.cancel(a.draftDigest as string, c),
    'preview/render': (a, c) => preview.render(a.payload as PreviewRenderPayload, c),
    'recovery/discard': (a, c) => recovery.discard(c),
    'recovery/load': (a, c) => recovery.load(c),
    'recovery/store': (a, c) => recovery.store(a.envelope as JsonObject, c),
    'resource/search': (a, c) => resource.search(a.query as ResourceSearchQuery, c),
    'telemetry/emit': (a, c) => telemetry.emit(a.event as TelemetryEvent, c),
  };

  const behaviors: ServerBehaviors = {
    destroyNextSocket: false,
    overrideNext: undefined,
    stallNextRequest: false,
  };
  const stalled: ServerResponse[] = [];

  const server: Server = createServer((request, response) => {
    if (behaviors.destroyNextSocket) {
      behaviors.destroyNextSocket = false;
      request.socket.destroy();
      return;
    }
    if (behaviors.stallNextRequest) {
      behaviors.stallNextRequest = false;
      stalled.push(response);
      return;
    }
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      const respond = (status: number, body: string): void => {
        response.writeHead(status, { 'content-type': 'application/json' });
        response.end(body);
      };
      const override = behaviors.overrideNext;
      if (override !== undefined) {
        behaviors.overrideNext = undefined;
        respond(override.status, override.body);
        return;
      }
      const match = /^\/ports\/([a-z-]+)\/([a-z-]+)$/u.exec(request.url ?? '');
      const operation =
        match === null || request.method !== 'POST'
          ? undefined
          : operations[`${match[1] ?? ''}/${match[2] ?? ''}`];
      if (operation === undefined) {
        respond(404, 'no such operation');
        return;
      }
      let wire: WireRequest;
      try {
        wire = JSON.parse(Buffer.concat(chunks).toString('utf8')) as WireRequest;
      } catch {
        respond(400, 'unparseable request body');
        return;
      }
      void operation(wire.arguments, wire.context).then(
        (result) => {
          respond(200, JSON.stringify(result));
        },
        (error: unknown) => {
          if (error instanceof TestbedHostError) {
            respond(statusByCategory[error.error.category], JSON.stringify(error.error));
          } else {
            respond(500, 'unexpected server failure');
          }
        },
      );
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    behaviors,
    close: () =>
      new Promise<void>((resolve) => {
        for (const response of stalled) {
          response.destroy();
        }
        server.close(() => {
          resolve();
        });
        server.closeAllConnections();
      }),
    controls,
  };
}

/** A fetch-like transport built directly on `node:http` — real sockets. */
function createNodeFetch(): HttpFetchLike {
  return (url, init) =>
    new Promise<HttpResponseLike>((resolve, reject) => {
      const clientRequest = httpRequest(
        url,
        { agent: false, headers: init.headers, method: init.method },
        (incoming) => {
          const chunks: Buffer[] = [];
          incoming.on('data', (chunk: Buffer) => chunks.push(chunk));
          incoming.on('end', () => {
            resolve({
              status: incoming.statusCode ?? 0,
              text: () => Promise.resolve(Buffer.concat(chunks).toString('utf8')),
            });
          });
          incoming.on('error', reject);
        },
      );
      const signal = init.signal as AbortSignal | undefined;
      if (signal !== undefined) {
        const abort = (): void => {
          clientRequest.destroy();
          const reason = signal.reason as { name?: unknown } | null | undefined;
          const error = new Error('The request was aborted.');
          if (typeof reason?.name === 'string') {
            error.name = reason.name;
          }
          reject(error);
        };
        if (signal.aborted) {
          abort();
        } else {
          signal.addEventListener('abort', abort, { once: true });
        }
      }
      clientRequest.on('error', reject);
      clientRequest.end(init.body);
    });
}

function createAdapter(
  baseUrl: string,
  timeoutMilliseconds?: number,
): ReturnType<typeof createHttpHostAdapter> {
  return createHttpHostAdapter(baseUrl, {
    // The portability seam: platform transport and abort-signal scheduling
    // are injected here so testkit source itself stays global-free.
    createTimeoutSignal: (milliseconds) => ({ signal: AbortSignal.timeout(milliseconds) }),
    fetchImplementation: createNodeFetch(),
    ...(timeoutMilliseconds === undefined ? {} : { timeoutMilliseconds }),
  });
}

async function expectHostFailure(operation: Promise<unknown>): Promise<HostPortError> {
  try {
    await operation;
  } catch (error) {
    expect(error).toBeInstanceOf(TestbedHostError);
    const hostError = (error as TestbedHostError).error;
    // Every transported or adapter-minted failure satisfies the host guard.
    expect(isHostPortError(hostError)).toBe(true);
    return hostError;
  }
  throw new Error('The call was expected to reject with a host error.');
}

function insertCommand(
  artifactId: string,
  sessionGeneration: string,
  baseStateVersion: number,
  nodeId: string,
): InsertNodeCommand {
  return {
    artifactId,
    baseStateVersion,
    contractVersion: '0.1-draft',
    id: `commands/insert-${nodeId}`,
    kind: 'command',
    payload: {
      destination: { position: 0 },
      node: {
        authoring: { mode: 'designer' },
        bindings: {},
        id: nodeId,
        properties: {},
        slots: {},
        type: 'studio.test/section',
        version: '1.0.0',
      },
    },
    sessionGeneration,
    type: 'studio.command/insert-node',
  };
}

describe('createHttpHostAdapter over a real node:http transport', () => {
  it('runs the session lifecycle drill: load, edit, save, conflict, recover', async () => {
    const blueprint = createBlueprintFixture({ id: 'transport.blueprint' });
    const testbed = await startTestbedServer({ documents: [blueprint] });
    try {
      const adapter = createAdapter(testbed.baseUrl);
      const generation = testbed.controls.sessionGeneration;
      const context = (expectedRevision?: string): HostRequestContext =>
        createHostRequestContextFixture({
          sessionGeneration: generation,
          ...(expectedRevision === undefined ? {} : { expectedRevision }),
        });

      // Load across the wire and open an editable session at that revision.
      const loaded = await adapter.artifact.load(
        { id: 'transport.blueprint', version: '1.0.0' },
        context(),
      );
      expect(loaded.revision).toBe('transport.blueprint-r1');
      const loadedDocument = loaded.value as BlueprintDocument;
      const session = new StudioSession({
        document: { ...loadedDocument, revision: loaded.revision ?? loadedDocument.revision },
        sessionGeneration: generation,
        sessionState: 'editable',
      });
      session.markSaved(loaded.revision ?? loadedDocument.revision);

      // Edit locally, save with optimistic concurrency over HTTP.
      session.execute(insertCommand('transport.blueprint', generation, 0, 'node-first'));
      const saved = await adapter.artifact.save(session.document, context(session.savedRevision));
      expect(saved.revision).toBe('transport.blueprint-r2');
      session.markSaved(saved.revision ?? '');

      // A rival writer advances the revision underneath the session.
      const rival = await adapter.artifact.load(
        { id: 'transport.blueprint', version: '1.0.0' },
        context(),
      );
      await adapter.artifact.save(rival.value, context(rival.revision ?? ''));

      // The stale save surfaces the canonical conflict with the safe revision.
      session.execute(insertCommand('transport.blueprint', generation, 1, 'node-second'));
      const conflict = await expectHostFailure(
        adapter.artifact.save(session.document, context(session.savedRevision)),
      );
      expect(conflict.category).toBe('conflict');
      expect(conflict.retryable).toBe(false);
      expect(conflict.revision).toBe(testbed.controls.revisionOf('transport.blueprint'));

      // Recovery round trip: preserve the draft, reload, reconcile, discard.
      const recovery = definedPort(adapter.recovery);
      await recovery.store({ draft: session.document as unknown as JsonObject }, context());
      const reloaded = await adapter.artifact.load(
        { id: 'transport.blueprint', version: '1.0.0' },
        context(),
      );
      expect(reloaded.revision).toBe(conflict.revision);
      const envelope = await recovery.load(context());
      expect(envelope.value).not.toBeNull();
      await recovery.discard(context());
      expect((await recovery.load(context())).value).toBeNull();
    } finally {
      await testbed.close();
    }
  });

  it('invalidates the previous generation when permissions change mid-session', async () => {
    const blueprint = createBlueprintFixture({ id: 'permissions.blueprint' });
    const testbed = await startTestbedServer({ documents: [blueprint] });
    try {
      const adapter = createAdapter(testbed.baseUrl);
      const staleGeneration = testbed.controls.sessionGeneration;

      testbed.controls.setPermissions(['studio.permission/read']);
      expect(testbed.controls.sessionGeneration).not.toBe(staleGeneration);

      const stale = await expectHostFailure(
        adapter.artifact.load(
          { id: 'permissions.blueprint', version: '1.0.0' },
          createHostRequestContextFixture({ sessionGeneration: staleGeneration }),
        ),
      );
      expect(stale.category).toBe('invalid-request');

      const permission = definedPort(adapter.permission);
      const refreshed = await permission.refresh(
        createHostRequestContextFixture({
          sessionGeneration: testbed.controls.sessionGeneration,
        }),
      );
      expect(refreshed.value.permissions).toEqual(['studio.permission/read']);
      expect(refreshed.value.sessionGeneration).toBe(testbed.controls.sessionGeneration);

      // The refreshed generation is usable again across the same transport.
      const reloaded = await adapter.artifact.load(
        { id: 'permissions.blueprint', version: '1.0.0' },
        createHostRequestContextFixture({
          sessionGeneration: testbed.controls.sessionGeneration,
        }),
      );
      expect(reloaded.revision).toBe('permissions.blueprint-r1');
    } finally {
      await testbed.close();
    }
  });

  it('transports host-authored error categories and preview renders verbatim', async () => {
    const blueprint = createBlueprintFixture({ id: 'verbatim.blueprint' });
    const testbed = await startTestbedServer({
      documents: [blueprint],
      render: (payload) => ({
        diagnostics: [],
        draftDigest: payload.draftDigest,
        markerMap: { 'markers/m1': 'node-1' },
        markers: ['markers/m1'],
      }),
    });
    try {
      const adapter = createAdapter(testbed.baseUrl);
      const context = createHostRequestContextFixture({
        sessionGeneration: testbed.controls.sessionGeneration,
      });

      testbed.controls.failNext('artifact', 'load', 'rate-limited');
      const injected = await expectHostFailure(
        adapter.artifact.load({ id: 'verbatim.blueprint', version: '1.0.0' }, context),
      );
      expect(injected.category).toBe('rate-limited');
      expect(injected.retryable).toBe(true);

      const preview = definedPort(adapter.preview);
      const rendered = await preview.render(
        {
          artifactId: 'verbatim.blueprint',
          draftDigest: 'a'.repeat(64),
          viewport: 'expanded',
        },
        context,
      );
      expect(rendered.value.markers).toEqual(['markers/m1']);
      expect(rendered.value.markerMap).toEqual({ 'markers/m1': 'node-1' });
    } finally {
      await testbed.close();
    }
  });

  it('maps network refusal onto the canonical unavailable error', async () => {
    const testbed = await startTestbedServer();
    const { baseUrl } = testbed;
    await testbed.close();

    const adapter = createAdapter(baseUrl);
    const failure = await expectHostFailure(
      adapter.artifact.load(
        { id: 'gone.blueprint', version: '1.0.0' },
        createHostRequestContextFixture(),
      ),
    );
    expect(failure.category).toBe('unavailable');
    expect(failure.retryable).toBe(true);
    expect(failure.message.key).toBe('studio.testkit/http-unreachable');
  });

  it('maps a mid-call disconnect onto the canonical unavailable error', async () => {
    const blueprint = createBlueprintFixture({ id: 'disconnect.blueprint' });
    const testbed = await startTestbedServer({ documents: [blueprint] });
    try {
      const adapter = createAdapter(testbed.baseUrl);
      const context = createHostRequestContextFixture({
        sessionGeneration: testbed.controls.sessionGeneration,
      });

      testbed.behaviors.destroyNextSocket = true;
      const failure = await expectHostFailure(
        adapter.artifact.load({ id: 'disconnect.blueprint', version: '1.0.0' }, context),
      );
      expect(failure.category).toBe('unavailable');
      expect(failure.retryable).toBe(true);

      // The transport recovers on the next call without a new adapter.
      const reloaded = await adapter.artifact.load(
        { id: 'disconnect.blueprint', version: '1.0.0' },
        context,
      );
      expect(reloaded.revision).toBe('disconnect.blueprint-r1');
    } finally {
      await testbed.close();
    }
  });

  it('maps an expired transport deadline onto the canonical unavailable error', async () => {
    const testbed = await startTestbedServer();
    try {
      const adapter = createAdapter(testbed.baseUrl, 25);
      testbed.behaviors.stallNextRequest = true;
      const failure = await expectHostFailure(
        adapter.artifact.load(
          { id: 'stalled.blueprint', version: '1.0.0' },
          createHostRequestContextFixture({
            sessionGeneration: testbed.controls.sessionGeneration,
          }),
        ),
      );
      expect(failure.category).toBe('unavailable');
      expect(failure.retryable).toBe(true);
      expect(failure.message.key).toBe('studio.testkit/http-timeout');
    } finally {
      await testbed.close();
    }
  });

  it('maps malformed response bodies onto the canonical internal error', async () => {
    const testbed = await startTestbedServer();
    try {
      const adapter = createAdapter(testbed.baseUrl);
      const context = createHostRequestContextFixture({
        sessionGeneration: testbed.controls.sessionGeneration,
      });

      // A 200 whose body is not JSON at all.
      testbed.behaviors.overrideNext = { body: 'not-json{{', status: 200 };
      const unparseable = await expectHostFailure(
        adapter.artifact.load({ id: 'malformed.blueprint', version: '1.0.0' }, context),
      );
      expect(unparseable.category).toBe('internal');
      expect(unparseable.retryable).toBe(false);
      expect(unparseable.message.key).toBe('studio.testkit/http-malformed-response');

      // A 200 whose JSON body is not a HostPortResult.
      testbed.behaviors.overrideNext = { body: '{"revision":42,"value":null}', status: 200 };
      const misshapen = await expectHostFailure(
        adapter.artifact.load({ id: 'malformed.blueprint', version: '1.0.0' }, context),
      );
      expect(misshapen.category).toBe('internal');

      // Neither message discloses the body that was received.
      expect(unparseable.message.defaultMessage ?? '').not.toContain('not-json');
      expect(misshapen.message.defaultMessage ?? '').not.toContain('42');
    } finally {
      await testbed.close();
    }
  });

  it('maps error statuses without a canonical body onto status-derived categories', async () => {
    const testbed = await startTestbedServer();
    try {
      const adapter = createAdapter(testbed.baseUrl);
      const context = createHostRequestContextFixture({
        sessionGeneration: testbed.controls.sessionGeneration,
      });
      const drills: { body: string; category: HostErrorCategory; status: number }[] = [
        { body: '<html>bad gateway</html>', category: 'unavailable', status: 503 },
        { body: 'missing', category: 'not-found', status: 404 },
        { body: '{"kind":"not-a-host-error"}', category: 'conflict', status: 409 },
        { body: 'denied', category: 'forbidden', status: 403 },
        { body: 'exploded', category: 'internal', status: 500 },
      ];
      for (const drill of drills) {
        testbed.behaviors.overrideNext = { body: drill.body, status: drill.status };
        const failure = await expectHostFailure(
          adapter.artifact.load({ id: 'status.blueprint', version: '1.0.0' }, context),
        );
        expect(failure.category).toBe(drill.category);
        // Non-disclosing: the raw body never surfaces in the mapped error.
        expect(failure.message.defaultMessage ?? '').not.toContain(drill.body);
      }
    } finally {
      await testbed.close();
    }
  });
});
