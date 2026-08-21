import { describe, expect, it } from 'vitest';
import {
  isHostPortError,
  type BlueprintDocument,
  type InsertNodeCommand,
} from '@kumwe/studio-protocol';
import { StudioSession } from '@kumwe/studio-core';
import {
  createBlueprintFixture,
  createHostRequestContextFixture,
  createTestbedHost,
  TestbedHostError,
} from '../src/index.js';

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

describe('session lifecycle against the host testbed', () => {
  it('loads, edits, saves, loses a race, and recovers through the recovery port', async () => {
    const blueprint = createBlueprintFixture({ id: 'lifecycle.blueprint' });
    const { host, controls } = createTestbedHost({
      allowTestOperationId: true,
      documents: [blueprint],
      permissions: ['studio.permission/publish', 'studio.permission/save'],
    });
    const generation = controls.sessionGeneration;
    const context = (
      expectedRevision?: string,
    ): ReturnType<typeof createHostRequestContextFixture> =>
      createHostRequestContextFixture({
        sessionGeneration: generation,
        ...(expectedRevision === undefined ? {} : { expectedRevision }),
      });

    // Load and open an editable session at the loaded revision.
    const loaded = await host.artifact.load(
      { id: 'lifecycle.blueprint', version: '1.0.0' },
      context(),
    );
    const loadedDocument = loaded.value as BlueprintDocument;
    const session = new StudioSession({
      document: { ...loadedDocument, revision: loaded.revision ?? loadedDocument.revision },
      sessionGeneration: generation,
      sessionState: 'editable',
    });
    session.markSaved(loaded.revision ?? loadedDocument.revision);
    expect(session.dirty).toBe(false);

    // Edit and save with optimistic concurrency.
    session.execute(insertCommand('lifecycle.blueprint', generation, 0, 'node-first'));
    expect(session.dirty).toBe(true);
    const firstSave = await host.artifact.save(session.document, context(session.savedRevision));
    expect(firstSave.revision).toBeDefined();
    session.markSaved(firstSave.revision ?? '');
    expect(session.dirty).toBe(false);

    // A second writer advances the host revision underneath us.
    const rival = await host.artifact.load(
      { id: 'lifecycle.blueprint', version: '1.0.0' },
      context(),
    );
    await host.artifact.save(rival.value, context(rival.revision ?? ''));

    // Our next save must surface a conflict carrying the safe current revision.
    session.execute(insertCommand('lifecycle.blueprint', generation, 1, 'node-second'));
    let conflictRevision: string | undefined;
    try {
      await host.artifact.save(session.document, context(session.savedRevision));
      expect.unreachable('the conflicting save must reject');
    } catch (error) {
      expect(error).toBeInstanceOf(TestbedHostError);
      const hostError = (error as TestbedHostError).error;
      expect(isHostPortError(hostError)).toBe(true);
      expect(hostError.category).toBe('conflict');
      conflictRevision = hostError.revision;
    }
    expect(conflictRevision).toBe(controls.revisionOf('lifecycle.blueprint'));

    // Preserve the local draft, reload the authoritative revision, reconcile.
    await host.recovery?.store(
      { draft: session.document as unknown as Record<string, never> },
      context(),
    );
    const reloaded = await host.artifact.load(
      { id: 'lifecycle.blueprint', version: '1.0.0' },
      context(),
    );
    expect(reloaded.revision).toBe(conflictRevision);
    const envelope = await host.recovery?.load(context());
    expect(envelope?.value).not.toBeNull();
    await host.recovery?.discard(context());
    expect((await host.recovery?.load(context()))?.value).toBeNull();
  });

  it('invalidates the whole session when permissions change mid-flight', async () => {
    const blueprint = createBlueprintFixture({ id: 'permissions.blueprint' });
    const { host, controls } = createTestbedHost({
      allowTestOperationId: true,
      documents: [blueprint],
      permissions: ['studio.permission/publish', 'studio.permission/save'],
    });
    const staleGeneration = controls.sessionGeneration;
    const staleContext = createHostRequestContextFixture({ sessionGeneration: staleGeneration });

    controls.setPermissions(['studio.permission/read']);
    expect(controls.sessionGeneration).not.toBe(staleGeneration);

    await expect(
      host.artifact.load({ id: 'permissions.blueprint', version: '1.0.0' }, staleContext),
    ).rejects.toMatchObject({ error: { category: 'invalid-request' } });

    const session = new StudioSession({
      document: blueprint,
      sessionGeneration: staleGeneration,
      sessionState: 'editable',
    });
    expect(() =>
      session.execute(
        insertCommand('permissions.blueprint', controls.sessionGeneration, 0, 'node-x'),
      ),
    ).toThrow(expect.objectContaining({ code: 'stale-generation' }) as Error);

    const refreshed = await host.permission?.refresh(
      createHostRequestContextFixture({ sessionGeneration: controls.sessionGeneration }),
    );
    expect(refreshed?.value.permissions).toEqual(['studio.permission/read']);
    expect(refreshed?.value.sessionGeneration).toBe(controls.sessionGeneration);
  });
});
