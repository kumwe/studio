import { describe, expect, it } from 'vitest';
import {
  STUDIO_CONTRACT_VERSION,
  type BlueprintCommand,
  type BlueprintDocument,
  type BlueprintNode,
  type EntryDocument,
  type SetFieldValueCommand,
} from '@kumwe/studio-protocol';
import { applyEntryCommand, StudioSession } from '../src/index.js';

function node(id: string, children: BlueprintNode[] = []): BlueprintNode {
  return {
    authoring: { mode: 'designer' },
    bindings: {},
    id,
    properties: {},
    slots: children.length === 0 ? {} : { main: children },
    type: 'studio.test/section',
    version: '1.0.0',
  };
}

function document(roots: BlueprintNode[]): BlueprintDocument {
  return {
    contractVersion: STUDIO_CONTRACT_VERSION,
    dependencyLock: {
      blocks: [{ revision: 'block-r1', type: 'studio.test/section', version: '1.0.0' }],
      theme: { id: 'studio.test/theme', revision: 'theme-r1', version: '1.0.0' },
    },
    id: 'session.blueprint',
    kind: 'blueprint',
    label: { defaultMessage: 'Session Blueprint', key: 'studio.test/blueprint' },
    model: { id: 'studio.test/model', revision: 'model-r1', version: '1.0.0' },
    owner: { id: 'studio.test/suite', version: '0.1.0-alpha.0' },
    revision: 'blueprint-r1',
    roots,
    status: 'draft',
    version: '1.0.0',
  };
}

function removeCommand(
  nodeId: string,
  overrides: Partial<BlueprintCommand> = {},
): BlueprintCommand {
  return {
    artifactId: 'session.blueprint',
    baseStateVersion: 0,
    contractVersion: STUDIO_CONTRACT_VERSION,
    id: `commands/remove-${nodeId}`,
    kind: 'command',
    payload: { nodeId },
    sessionGeneration: 'generation-1',
    type: 'studio.command/remove-node',
    ...overrides,
  } as BlueprintCommand;
}

function entry(): EntryDocument {
  return {
    contractVersion: STUDIO_CONTRACT_VERSION,
    id: 'entries/example',
    kind: 'entry',
    locale: 'en',
    model: { id: 'studio.test/model', revision: 'model-r1', version: '1.0.0' },
    revision: 'entry-r1',
    status: 'draft',
    values: { price: { amount: '10.00', currency: 'NAD' } },
  };
}

function setFieldValue(fieldPath: string[], value: unknown, locale?: string): SetFieldValueCommand {
  return {
    artifactId: 'entries/example',
    baseStateVersion: 0,
    contractVersion: STUDIO_CONTRACT_VERSION,
    id: 'commands/set-field-value',
    kind: 'command',
    payload: locale === undefined ? { fieldPath, value } : { fieldPath, locale, value },
    sessionGeneration: 'generation-1',
    type: 'studio.command/set-field-value',
  } as SetFieldValueCommand;
}

describe('StudioSession', () => {
  function editableSession(roots: BlueprintNode[] = [node('a'), node('b')]): StudioSession {
    return new StudioSession({
      document: document(roots),
      sessionGeneration: 'generation-1',
      sessionState: 'editable',
    });
  }

  it('rejects every command in a read-only session', () => {
    const session = new StudioSession({
      document: document([node('a')]),
      sessionGeneration: 'generation-1',
      sessionState: 'read-only',
    });
    expect(() => session.execute(removeCommand('a'))).toThrow(
      expect.objectContaining({ code: 'read-only-session' }) as Error,
    );
    expect(session.document.roots).toHaveLength(1);
  });

  it('rejects commands from a stale session generation', () => {
    const session = editableSession();
    expect(() =>
      session.execute(removeCommand('a', { sessionGeneration: 'generation-0' })),
    ).toThrow(expect.objectContaining({ code: 'stale-generation' }) as Error);
  });

  it('rejects commands whose expected revision does not match the saved revision', () => {
    const session = editableSession();
    expect(() => session.execute(removeCommand('a', { expectedRevision: 'blueprint-r2' }))).toThrow(
      expect.objectContaining({ code: 'stale-state' }) as Error,
    );
    session.markSaved('blueprint-r2');
    expect(
      session.execute(removeCommand('a', { expectedRevision: 'blueprint-r2' })).roots,
    ).toHaveLength(1);
  });

  it('tracks dirty state across execute, save, and undo', () => {
    const session = editableSession();
    expect(session.dirty).toBe(false);
    session.execute(removeCommand('a'));
    expect(session.dirty).toBe(true);
    session.markSaved('blueprint-r2');
    expect(session.dirty).toBe(false);
    session.undo();
    expect(session.dirty).toBe(true);
  });

  it('validates selection against the document and prunes removed nodes', () => {
    const session = editableSession([node('a', [node('child')]), node('b')]);
    expect(session.select(['child', 'b', 'child'])).toEqual(['child', 'b']);
    expect(() => session.select(['missing'])).toThrow(
      expect.objectContaining({ code: 'node-not-found' }) as Error,
    );
    expect(session.selection).toEqual(['child', 'b']);

    session.execute(removeCommand('a'));
    expect(session.selection).toEqual(['b']);

    session.undo();
    expect(session.selection).toEqual(['b']);
    session.clearSelection();
    expect(session.selection).toEqual([]);
  });

  it('keeps history semantics through the session facade', () => {
    const session = editableSession();
    session.execute(removeCommand('a'));
    expect(session.canUndo).toBe(true);
    expect(session.undo().roots).toHaveLength(2);
    expect(session.canRedo).toBe(true);
    expect(session.redo().roots).toHaveLength(1);
    expect(session.stateVersion).toBe(3);
  });

  it('rejects a stale base state version through the underlying history', () => {
    const session = editableSession();
    session.execute(removeCommand('a'));
    expect(() => session.execute(removeCommand('b'))).toThrow(
      expect.objectContaining({ code: 'stale-state' }) as Error,
    );
    expect(session.execute(removeCommand('b', { baseStateVersion: 1 })).roots).toHaveLength(0);
  });
});

describe('applyEntryCommand', () => {
  it('sets a nested field value without mutating the input', () => {
    const before = entry();
    const pristine = structuredClone(before);
    const after = applyEntryCommand(before, setFieldValue(['price', 'amount'], '12.50'));
    expect(after.values).toEqual({ price: { amount: '12.50', currency: 'NAD' } });
    expect(before).toStrictEqual(pristine);
  });

  it('creates a top-level value when the final segment is new', () => {
    const after = applyEntryCommand(entry(), setFieldValue(['featured'], true));
    expect(after.values.featured).toBe(true);
  });

  it('accepts a matching locale and rejects a mismatched locale', () => {
    expect(
      applyEntryCommand(entry(), setFieldValue(['featured'], true, 'en')).values.featured,
    ).toBe(true);
    expect(() => applyEntryCommand(entry(), setFieldValue(['featured'], true, 'de'))).toThrow(
      expect.objectContaining({ code: 'locale-mismatch' }) as Error,
    );
  });

  it('rejects a field path through a missing or scalar container', () => {
    for (const path of [
      ['missing', 'amount'],
      ['price', 'amount', 'cents'],
    ]) {
      expect(() => applyEntryCommand(entry(), setFieldValue(path, '1'))).toThrow(
        expect.objectContaining({ code: 'property-not-found' }) as Error,
      );
    }
  });

  it('rejects a command that targets a different entry', () => {
    const command = { ...setFieldValue(['featured'], true), artifactId: 'entries/other' };
    expect(() => applyEntryCommand(entry(), command as SetFieldValueCommand)).toThrow(
      expect.objectContaining({ code: 'node-not-found' }) as Error,
    );
  });

  it('refuses forbidden member names through the schema-safe setter', () => {
    const before = entry();
    const after = applyEntryCommand(before, setFieldValue(['__proto__'], { polluted: true }));
    expect(Object.getPrototypeOf(after.values)).toBe(Object.prototype);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});
