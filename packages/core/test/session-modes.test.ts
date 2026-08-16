import { describe, expect, it } from 'vitest';
import {
  STUDIO_CONTRACT_VERSION,
  type AddModelFieldCommand,
  type BlockType,
  type BlueprintCommand,
  type BlueprintDocument,
  type BlueprintNode,
  type ContentModelDocument,
  type EntryDocument,
  type FieldBinding,
  type JsonObject,
  type NodeAuthoringPolicy,
  type SetFieldValueCommand,
  type StudioSessionMode,
} from '@kumwe/studio-protocol';
import {
  invertCommand,
  permittedCommandTypes,
  resolveSessionMode,
  STUDIO_SESSION_MODES,
  StudioSession,
  type StudioCommandType,
} from '../src/index.js';

/**
 * The exact-record construction fails to compile when a canonical command
 * type is missing or invented, so this list is total by type checking.
 */
const ALL_COMMAND_TYPES = Object.keys({
  'studio.command/add-model-field': true,
  'studio.command/apply-pattern': true,
  'studio.command/batch': true,
  'studio.command/duplicate-node': true,
  'studio.command/insert-node': true,
  'studio.command/move-node': true,
  'studio.command/remove-binding': true,
  'studio.command/remove-node': true,
  'studio.command/reorder-children': true,
  'studio.command/reset-inherited-property': true,
  'studio.command/restore-node': true,
  'studio.command/set-binding': true,
  'studio.command/set-field-value': true,
  'studio.command/set-property': true,
  'studio.command/set-size-role': true,
  'studio.command/unset-property': true,
  'studio.command/unset-size-role': true,
} satisfies Record<StudioCommandType, true>) as StudioCommandType[];

interface TestNodeOptions {
  authoring?: NodeAuthoringPolicy;
  bindings?: Record<string, FieldBinding>;
  properties?: JsonObject;
  responsive?: Record<string, Record<string, string>>;
  sizeRoles?: Record<string, string>;
  slots?: Record<string, BlueprintNode[]>;
  type?: BlockType;
}

function node(id: string, options: TestNodeOptions = {}): BlueprintNode {
  const created: BlueprintNode = {
    authoring: options.authoring ?? { mode: 'designer' },
    bindings: options.bindings ?? {},
    id,
    properties: options.properties ?? {},
    slots: options.slots ?? {},
    type: options.type ?? 'studio.test/section',
    version: '1.0.0',
  };
  if (options.responsive !== undefined) {
    created.responsive = options.responsive;
  }
  if (options.sizeRoles !== undefined) {
    created.sizeRoles = options.sizeRoles;
  }
  return created;
}

function binding(): FieldBinding {
  return {
    onError: 'hide',
    onNull: 'empty',
    source: { fieldPath: ['title'], kind: 'entry-field' },
    transforms: [],
  };
}

function card(id: string): BlueprintNode {
  return node(id, { authoring: { mode: 'content' }, type: 'studio.test/card' });
}

/**
 * One designer shell whose `main` slot holds a structural composition region
 * (allowing only `studio.test/card`) and whose `side` slot holds a designer
 * node. The region contains two content cards and one locked node, so every
 * hybrid boundary has an in-bounds and an out-of-bounds counterpart.
 */
function fixtureRoots(): BlueprintNode[] {
  return [
    node('shell', {
      slots: {
        main: [
          node('region', {
            authoring: { allowedBlocks: ['studio.test/card'], mode: 'structural' },
            slots: {
              items: [
                node('card-1', {
                  authoring: { mode: 'content' },
                  bindings: { label: binding() },
                  properties: { title: 'First' },
                  responsive: { title: { compact: 'Short' } },
                  sizeRoles: { inline: 'half' },
                  type: 'studio.test/card',
                }),
                card('card-2'),
                node('seal', { authoring: { mode: 'locked' }, type: 'studio.test/card' }),
              ],
            },
          }),
        ],
        side: [node('fixed')],
      },
    }),
  ];
}

function fixtureDocument(): BlueprintDocument {
  return {
    contractVersion: STUDIO_CONTRACT_VERSION,
    dependencyLock: {
      blocks: [
        { revision: 'block-r1', type: 'studio.test/section', version: '1.0.0' },
        { revision: 'block-r1', type: 'studio.test/card', version: '1.0.0' },
      ],
      theme: { id: 'studio.test/theme', revision: 'theme-r1', version: '1.0.0' },
    },
    id: 'modes.blueprint',
    kind: 'blueprint',
    label: { defaultMessage: 'Modes Blueprint', key: 'studio.test/blueprint' },
    model: { id: 'studio.test/model', revision: 'model-r1', version: '1.0.0' },
    owner: { id: 'studio.test/suite', version: '0.1.0-alpha.0' },
    revision: 'blueprint-r1',
    roots: fixtureRoots(),
    status: 'draft',
    version: '1.0.0',
  };
}

function sessionFor(mode: StudioSessionMode): StudioSession {
  return new StudioSession({
    document: fixtureDocument(),
    mode,
    sessionGeneration: 'generation-1',
  });
}

let sequence = 0;

function structureCommand(
  type: BlueprintCommand['type'],
  payload: object,
  overrides: Partial<BlueprintCommand> = {},
): BlueprintCommand {
  sequence += 1;
  return {
    artifactId: 'modes.blueprint',
    baseStateVersion: 0,
    contractVersion: STUDIO_CONTRACT_VERSION,
    id: `commands/structure-${String(sequence)}`,
    kind: 'command',
    payload,
    sessionGeneration: 'generation-1',
    type,
    ...overrides,
  } as BlueprintCommand;
}

/** One valid, in-fixture command per Blueprint structure command type. */
const blueprintCommands: Record<BlueprintCommand['type'], () => BlueprintCommand> = {
  'studio.command/apply-pattern': () =>
    structureCommand('studio.command/apply-pattern', {
      destination: { position: 0 },
      idMap: { 'pattern-root': 'pattern-copy' },
      nodes: [card('pattern-root')],
      pattern: { id: 'patterns/test', revision: 'pattern-r1', version: '1.0.0' },
    }),
  'studio.command/batch': () =>
    structureCommand('studio.command/batch', {
      operations: [
        {
          payload: { nodeId: 'card-1', property: 'title', value: 'Batched' },
          type: 'studio.command/set-property',
        },
      ],
    }),
  'studio.command/duplicate-node': () =>
    structureCommand('studio.command/duplicate-node', {
      idMap: { 'card-2': 'card-2-copy' },
      nodeId: 'card-2',
    }),
  'studio.command/insert-node': () =>
    structureCommand('studio.command/insert-node', {
      destination: { parentNodeId: 'region', position: 0, slot: 'items' },
      node: card('card-3'),
    }),
  'studio.command/move-node': () =>
    structureCommand('studio.command/move-node', {
      destination: { parentNodeId: 'region', position: 2, slot: 'items' },
      nodeId: 'card-1',
    }),
  'studio.command/remove-binding': () =>
    structureCommand('studio.command/remove-binding', { nodeId: 'card-1', port: 'label' }),
  'studio.command/remove-node': () =>
    structureCommand('studio.command/remove-node', { nodeId: 'card-1' }),
  'studio.command/reorder-children': () =>
    structureCommand('studio.command/reorder-children', {
      order: ['card-2', 'card-1', 'seal'],
      parentNodeId: 'region',
      slot: 'items',
    }),
  'studio.command/reset-inherited-property': () =>
    structureCommand('studio.command/reset-inherited-property', {
      nodeId: 'card-1',
      property: 'title',
    }),
  'studio.command/restore-node': () =>
    structureCommand('studio.command/restore-node', {
      destination: { parentNodeId: 'region', position: 0, slot: 'items' },
      node: card('card-4'),
    }),
  'studio.command/set-binding': () =>
    structureCommand('studio.command/set-binding', {
      binding: binding(),
      nodeId: 'card-2',
      port: 'label',
    }),
  'studio.command/set-property': () =>
    structureCommand('studio.command/set-property', {
      nodeId: 'card-1',
      property: 'title',
      value: 'Updated',
    }),
  'studio.command/set-size-role': () =>
    structureCommand('studio.command/set-size-role', {
      axis: 'inline',
      nodeId: 'card-2',
      role: 'half',
    }),
  'studio.command/unset-property': () =>
    structureCommand('studio.command/unset-property', { nodeId: 'card-1', property: 'title' }),
  'studio.command/unset-size-role': () =>
    structureCommand('studio.command/unset-size-role', { axis: 'inline', nodeId: 'card-1' }),
};

/**
 * Hybrid overrides where the generic Blueprint factory would leave hybrid
 * bounds: the batch composes only structural-slot operations, and the second
 * operation targets a node the first one introduced, proving the sequential
 * trial evaluation.
 */
const hybridCommands: Partial<Record<BlueprintCommand['type'], () => BlueprintCommand>> = {
  'studio.command/batch': () =>
    structureCommand('studio.command/batch', {
      operations: [
        {
          payload: {
            destination: { parentNodeId: 'region', position: 0, slot: 'items' },
            node: card('card-3'),
          },
          type: 'studio.command/insert-node',
        },
        { payload: { nodeId: 'card-3' }, type: 'studio.command/remove-node' },
      ],
    }),
};

function hybridStructureCommand(type: BlueprintCommand['type']): BlueprintCommand {
  return (hybridCommands[type] ?? blueprintCommands[type])();
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
    values: { title: 'Original' },
  };
}

function setFieldValue(overrides: Partial<SetFieldValueCommand> = {}): SetFieldValueCommand {
  sequence += 1;
  return {
    artifactId: 'entries/example',
    baseStateVersion: 0,
    contractVersion: STUDIO_CONTRACT_VERSION,
    id: `commands/entry-${String(sequence)}`,
    kind: 'command',
    payload: { fieldPath: ['title'], value: 'Edited' },
    sessionGeneration: 'generation-1',
    type: 'studio.command/set-field-value',
    ...overrides,
  };
}

function model(status: ContentModelDocument['status'] = 'draft'): ContentModelDocument {
  return {
    contractVersion: STUDIO_CONTRACT_VERSION,
    fields: [],
    id: 'models/example',
    kind: 'content-model',
    label: { defaultMessage: 'Example model', key: 'studio.test/model-label' },
    owner: { id: 'studio.test/suite', version: '0.1.0-alpha.0' },
    relationships: [],
    revision: 'model-r1',
    status,
    version: '1.0.0',
  };
}

function addModelField(overrides: Partial<AddModelFieldCommand> = {}): AddModelFieldCommand {
  sequence += 1;
  return {
    artifactId: 'models/example',
    baseStateVersion: 0,
    contractVersion: STUDIO_CONTRACT_VERSION,
    id: `commands/model-${String(sequence)}`,
    kind: 'command',
    payload: {
      field: {
        cardinality: 'one',
        id: 'summary',
        kind: 'string',
        label: { defaultMessage: 'Summary', key: 'studio.test/field-summary' },
        localized: false,
        required: false,
      },
    },
    sessionGeneration: 'generation-1',
    type: 'studio.command/add-model-field',
    ...overrides,
  };
}

function dispatch(session: StudioSession, mode: StudioSessionMode, type: StudioCommandType): void {
  if (type === 'studio.command/set-field-value') {
    session.executeEntryCommand(entry(), setFieldValue());
    return;
  }
  if (type === 'studio.command/add-model-field') {
    session.executeModelCommand(model(), addModelField());
    return;
  }
  session.execute(mode === 'hybrid' ? hybridStructureCommand(type) : blueprintCommands[type]());
}

describe('permittedCommandTypes', () => {
  it('is total over every session mode and canonical command type', () => {
    expect(STUDIO_SESSION_MODES).toEqual(['blueprint', 'content', 'hybrid', 'model', 'read-only']);
    expect(ALL_COMMAND_TYPES).toHaveLength(17);
    for (const mode of STUDIO_SESSION_MODES) {
      const permitted = permittedCommandTypes(mode);
      for (const type of permitted) {
        expect(ALL_COMMAND_TYPES).toContain(type);
      }
      for (const type of ALL_COMMAND_TYPES) {
        expect(typeof permitted.has(type)).toBe('boolean');
      }
    }
    expect(permittedCommandTypes('blueprint').size).toBe(15);
    expect(permittedCommandTypes('content').size).toBe(1);
    expect(permittedCommandTypes('hybrid').size).toBe(8);
    expect(permittedCommandTypes('model').size).toBe(1);
    expect(permittedCommandTypes('read-only').size).toBe(0);
  });

  it('returns one shared frozen immutable set per mode', () => {
    for (const mode of STUDIO_SESSION_MODES) {
      const permitted = permittedCommandTypes(mode);
      expect(permittedCommandTypes(mode)).toBe(permitted);
      expect(Object.isFrozen(permitted)).toBe(true);
      const mutable = permitted as Set<StudioCommandType>;
      expect(() => mutable.add('studio.command/set-property')).toThrow(TypeError);
      expect(() => mutable.delete('studio.command/set-property')).toThrow(TypeError);
      expect(() => {
        mutable.clear();
      }).toThrow(TypeError);
    }
  });
});

describe('mode and table consistency', () => {
  for (const mode of STUDIO_SESSION_MODES) {
    for (const type of ALL_COMMAND_TYPES) {
      const expected = permittedCommandTypes(mode).has(type);
      it(`${mode} ${expected ? 'permits' : 'forbids'} ${type}`, () => {
        const session = sessionFor(mode);
        session.select(['card-1']);
        if (expected) {
          expect(() => {
            dispatch(session, mode, type);
          }).not.toThrow();
        } else {
          const before = session.document;
          expect(() => {
            dispatch(session, mode, type);
          }).toThrow(
            expect.objectContaining({
              code: mode === 'read-only' ? 'read-only-session' : 'mode-forbidden',
            }) as Error,
          );
          expect(session.document).toStrictEqual(before);
          expect(session.stateVersion).toBe(0);
          expect(session.canUndo).toBe(false);
          expect(session.canRedo).toBe(false);
          expect(session.selection).toEqual(['card-1']);
          expect(session.dirty).toBe(false);
        }
      });
    }
  }
});

describe('read-only parity with the legacy session state', () => {
  it('treats the legacy read-only state as the read-only mode', () => {
    const legacy = new StudioSession({
      document: fixtureDocument(),
      sessionGeneration: 'generation-1',
      sessionState: 'read-only',
    });
    expect(legacy.mode).toBe('read-only');
    expect(legacy.sessionState).toBe('read-only');
    for (const rejects of [
      (): unknown => legacy.execute(blueprintCommands['studio.command/remove-node']()),
      (): unknown => legacy.executeEntryCommand(entry(), setFieldValue()),
      (): unknown => legacy.executeModelCommand(model(), addModelField()),
    ]) {
      expect(rejects).toThrow(expect.objectContaining({ code: 'read-only-session' }) as Error);
    }
  });

  it('opens the historical full-structure blueprint mode from the legacy editable state', () => {
    const legacy = new StudioSession({
      document: fixtureDocument(),
      sessionGeneration: 'generation-1',
      sessionState: 'editable',
    });
    expect(legacy.mode).toBe('blueprint');
    expect(legacy.sessionState).toBe('editable');
    expect(() => legacy.execute(blueprintCommands['studio.command/set-property']())).not.toThrow();
  });

  it('projects the legacy session state from the mode', () => {
    expect(sessionFor('read-only').sessionState).toBe('read-only');
    for (const mode of ['blueprint', 'content', 'hybrid', 'model'] as const) {
      expect(sessionFor(mode).sessionState).toBe('editable');
    }
  });

  it('accepts agreeing options and rejects contradictions', () => {
    expect(
      new StudioSession({
        document: fixtureDocument(),
        mode: 'content',
        sessionGeneration: 'generation-1',
        sessionState: 'editable',
      }).mode,
    ).toBe('content');
    expect(
      new StudioSession({
        document: fixtureDocument(),
        mode: 'read-only',
        sessionGeneration: 'generation-1',
        sessionState: 'read-only',
      }).mode,
    ).toBe('read-only');
    expect(
      () =>
        new StudioSession({
          document: fixtureDocument(),
          mode: 'content',
          sessionGeneration: 'generation-1',
          sessionState: 'read-only',
        }),
    ).toThrow(RangeError);
    expect(
      () =>
        new StudioSession({
          document: fixtureDocument(),
          mode: 'read-only',
          sessionGeneration: 'generation-1',
          sessionState: 'editable',
        }),
    ).toThrow(RangeError);
    expect(
      () => new StudioSession({ document: fixtureDocument(), sessionGeneration: 'generation-1' }),
    ).toThrow(RangeError);
  });
});

describe('hybrid bounded composition', () => {
  function expectOutOfBounds(command: BlueprintCommand): void {
    const session = sessionFor('hybrid');
    const before = session.document;
    expect(() => session.execute(command)).toThrow(
      expect.objectContaining({ code: 'mode-forbidden' }) as Error,
    );
    expect(session.document).toStrictEqual(before);
    expect(session.canUndo).toBe(false);
  }

  it('permits composing inside a structural slot', () => {
    const session = sessionFor('hybrid');
    const inserted = session.execute(blueprintCommands['studio.command/insert-node']());
    const region = inserted.roots[0]?.slots.main?.[0];
    expect(region?.slots.items?.map((child) => child.id)).toEqual([
      'card-3',
      'card-1',
      'card-2',
      'seal',
    ]);
  });

  it('permits reordering a structural slot even around a locked child', () => {
    const session = sessionFor('hybrid');
    const reordered = session.execute(blueprintCommands['studio.command/reorder-children']());
    const region = reordered.roots[0]?.slots.main?.[0];
    expect(region?.slots.items?.map((child) => child.id)).toEqual(['card-2', 'card-1', 'seal']);
  });

  it('rejects composing into a designer slot', () => {
    expectOutOfBounds(
      structureCommand('studio.command/insert-node', {
        destination: { parentNodeId: 'shell', position: 0, slot: 'main' },
        node: card('card-3'),
      }),
    );
  });

  it('rejects composing the document roots', () => {
    expectOutOfBounds(
      structureCommand('studio.command/insert-node', {
        destination: { position: 0 },
        node: card('card-3'),
      }),
    );
    expectOutOfBounds(structureCommand('studio.command/reorder-children', { order: ['shell'] }));
    expectOutOfBounds(structureCommand('studio.command/remove-node', { nodeId: 'shell' }));
  });

  it('rejects a block type outside the structural allowed blocks', () => {
    expectOutOfBounds(
      structureCommand('studio.command/insert-node', {
        destination: { parentNodeId: 'region', position: 0, slot: 'items' },
        node: node('free-section'),
      }),
    );
  });

  it('never inserts, removes, moves, or duplicates locked structure', () => {
    expectOutOfBounds(
      structureCommand('studio.command/insert-node', {
        destination: { parentNodeId: 'region', position: 0, slot: 'items' },
        node: node('sealed-card', {
          authoring: { mode: 'content' },
          slots: {
            body: [node('inner-seal', { authoring: { mode: 'locked' }, type: 'studio.test/card' })],
          },
          type: 'studio.test/card',
        }),
      }),
    );
    expectOutOfBounds(structureCommand('studio.command/remove-node', { nodeId: 'seal' }));
    expectOutOfBounds(
      structureCommand('studio.command/move-node', {
        destination: { parentNodeId: 'region', position: 0, slot: 'items' },
        nodeId: 'seal',
      }),
    );
    expectOutOfBounds(
      structureCommand('studio.command/duplicate-node', {
        idMap: { seal: 'seal-copy' },
        nodeId: 'seal',
      }),
    );
  });

  it('rejects structure whose source or destination leaves the structural region', () => {
    expectOutOfBounds(
      structureCommand('studio.command/move-node', {
        destination: { parentNodeId: 'shell', position: 0, slot: 'side' },
        nodeId: 'card-1',
      }),
    );
    expectOutOfBounds(
      structureCommand('studio.command/move-node', {
        destination: { parentNodeId: 'region', position: 0, slot: 'items' },
        nodeId: 'fixed',
      }),
    );
    expectOutOfBounds(structureCommand('studio.command/remove-node', { nodeId: 'fixed' }));
    expectOutOfBounds(structureCommand('studio.command/remove-node', { nodeId: 'region' }));
    expectOutOfBounds(
      structureCommand('studio.command/reorder-children', {
        order: ['region'],
        parentNodeId: 'shell',
        slot: 'main',
      }),
    );
    expectOutOfBounds(
      structureCommand('studio.command/duplicate-node', {
        idMap: { 'card-2': 'card-2-copy' },
        nodeId: 'card-2',
        destination: { position: 1 },
      }),
    );
  });

  it('rejects a batch atomically when any operation leaves the bounds', () => {
    expectOutOfBounds(
      structureCommand('studio.command/batch', {
        operations: [
          {
            payload: {
              destination: { parentNodeId: 'region', position: 0, slot: 'items' },
              node: card('card-3'),
            },
            type: 'studio.command/insert-node',
          },
          {
            payload: {
              destination: { parentNodeId: 'shell', position: 0, slot: 'side' },
              nodeId: 'card-3',
            },
            type: 'studio.command/move-node',
          },
        ],
      }),
    );
    expectOutOfBounds(
      structureCommand('studio.command/batch', {
        operations: [
          {
            payload: { nodeId: 'card-1', property: 'title', value: 'Configured' },
            type: 'studio.command/set-property',
          },
        ],
      }),
    );
  });

  it('lets unresolvable references keep their canonical failure codes', () => {
    const session = sessionFor('hybrid');
    expect(() =>
      session.execute(structureCommand('studio.command/remove-node', { nodeId: 'ghost' })),
    ).toThrow(expect.objectContaining({ code: 'node-not-found' }) as Error);
    expect(() =>
      session.execute(
        structureCommand('studio.command/batch', {
          operations: [{ payload: { nodeId: 'ghost' }, type: 'studio.command/remove-node' }],
        }),
      ),
    ).toThrow(expect.objectContaining({ code: 'node-not-found' }) as Error);
    expect(session.canUndo).toBe(false);
  });
});

describe('undo, redo, and inverse closure', () => {
  it('undo and redo only revisit states permitted commands produced', () => {
    const session = sessionFor('hybrid');
    const before = session.document;
    const after = session.execute(blueprintCommands['studio.command/insert-node']());
    expect(session.undo()).toStrictEqual(before);
    expect(session.redo()).toStrictEqual(after);
  });

  for (const mode of ['blueprint', 'hybrid'] as const) {
    const types = [...permittedCommandTypes(mode)].filter(
      (type): type is BlueprintCommand['type'] => type !== 'studio.command/set-field-value',
    );
    for (const type of types) {
      it(`${mode} inverse of ${type} stays permitted and round-trips`, () => {
        const session = sessionFor(mode);
        const before = session.document;
        const forward =
          mode === 'hybrid' ? hybridStructureCommand(type) : blueprintCommands[type]();
        session.execute(forward);
        const inverse = invertCommand(before, forward, { id: 'commands/inverse' });
        expect(permittedCommandTypes(mode).has(inverse.type)).toBe(true);
        session.execute(inverse);
        expect(session.document).toStrictEqual(before);
      });
    }
  }
});

describe('entry and model dispatch through the session', () => {
  it('applies entry commands in content mode without touching the Blueprint history', () => {
    const session = sessionFor('content');
    const updated = session.executeEntryCommand(entry(), setFieldValue());
    expect(updated.values.title).toBe('Edited');
    expect(session.stateVersion).toBe(0);
    expect(session.dirty).toBe(false);
    expect(session.canUndo).toBe(false);
  });

  it('applies model commands in model mode and preserves publication policy', () => {
    const session = sessionFor('model');
    const updated = session.executeModelCommand(model(), addModelField());
    expect(updated.fields.map((field) => field.id)).toEqual(['summary']);
    expect(() => session.executeModelCommand(model('published'), addModelField())).toThrow(
      expect.objectContaining({ code: 'artifact-not-draft' }) as Error,
    );
  });

  it('keeps the reducer guards behind the mode gate', () => {
    const session = sessionFor('content');
    const mismatched = setFieldValue({
      payload: { fieldPath: ['title'], locale: 'de', value: 'Anders' },
    });
    expect(() => session.executeEntryCommand(entry(), mismatched)).toThrow(
      expect.objectContaining({ code: 'locale-mismatch' }) as Error,
    );
  });

  it('rejects stale generations and stale revisions through the wrappers', () => {
    const content = sessionFor('content');
    expect(() =>
      content.executeEntryCommand(entry(), setFieldValue({ sessionGeneration: 'generation-0' })),
    ).toThrow(expect.objectContaining({ code: 'stale-generation' }) as Error);
    expect(() =>
      content.executeEntryCommand(entry(), setFieldValue({ expectedRevision: 'entry-r2' })),
    ).toThrow(expect.objectContaining({ code: 'stale-state' }) as Error);
    expect(
      content.executeEntryCommand(entry(), setFieldValue({ expectedRevision: 'entry-r1' })).values
        .title,
    ).toBe('Edited');
    const modelSession = sessionFor('model');
    expect(() =>
      modelSession.executeModelCommand(model(), addModelField({ expectedRevision: 'model-r2' })),
    ).toThrow(expect.objectContaining({ code: 'stale-state' }) as Error);
  });

  it('lets hybrid sessions edit fields and blueprint sessions never edit fields', () => {
    expect(sessionFor('hybrid').executeEntryCommand(entry(), setFieldValue()).values.title).toBe(
      'Edited',
    );
    expect(() => sessionFor('blueprint').executeEntryCommand(entry(), setFieldValue())).toThrow(
      expect.objectContaining({ code: 'mode-forbidden' }) as Error,
    );
  });
});

describe('resolveSessionMode', () => {
  it('keeps the authoring mode for single-composite editable sessions', () => {
    for (const mode of ['blueprint', 'content', 'model'] as const) {
      expect(resolveSessionMode({ composite: 'single', mode, sessionState: 'editable' })).toBe(
        mode,
      );
    }
  });

  it('flattens the hybrid composite and lets the read-only state win', () => {
    expect(
      resolveSessionMode({ composite: 'hybrid', mode: 'content', sessionState: 'editable' }),
    ).toBe('hybrid');
    expect(
      resolveSessionMode({ composite: 'hybrid', mode: 'blueprint', sessionState: 'editable' }),
    ).toBe('hybrid');
    expect(
      resolveSessionMode({ composite: 'hybrid', mode: 'content', sessionState: 'read-only' }),
    ).toBe('read-only');
    expect(
      resolveSessionMode({ composite: 'single', mode: 'model', sessionState: 'read-only' }),
    ).toBe('read-only');
  });

  it('rejects the hybrid composite with the model editing mode', () => {
    expect(() =>
      resolveSessionMode({ composite: 'hybrid', mode: 'model', sessionState: 'editable' }),
    ).toThrow(RangeError);
  });
});
