import { describe, expect, it } from 'vitest';
import {
  STUDIO_CONTRACT_VERSION,
  type BlueprintCommand,
  type BlueprintDocument,
  type BlueprintNode,
  type JsonValue,
  type QualifiedName,
} from '@kumwe/studio-protocol';
import {
  STUDIO_PROTOCOL_MAXIMUM_COMMAND_POLICY_LIMITS,
  StudioSession,
  type StudioCommandPolicyLimits,
} from '../src/index.js';

const REQUIRED_PERMISSION: QualifiedName = 'studio.permission/edit-protected';

function node(
  id: string,
  options: {
    children?: BlueprintNode[];
    extensions?: Record<QualifiedName, JsonValue>;
    permission?: QualifiedName;
    slots?: Record<string, BlueprintNode[]>;
  } = {},
): BlueprintNode {
  return {
    authoring: {
      mode: 'designer',
      ...(options.permission === undefined ? {} : { requiredPermission: options.permission }),
    },
    bindings: {},
    ...(options.extensions === undefined ? {} : { extensions: options.extensions }),
    id,
    properties: {},
    slots:
      options.slots ??
      (options.children === undefined || options.children.length === 0
        ? {}
        : { main: options.children }),
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
    id: 'policy.blueprint',
    kind: 'blueprint',
    label: { defaultMessage: 'Policy Blueprint', key: 'studio.test/policy-blueprint' },
    model: { id: 'studio.test/model', revision: 'model-r1', version: '1.0.0' },
    owner: { id: 'studio.test/suite', version: '1.0.0' },
    revision: 'blueprint-r1',
    roots,
    status: 'draft',
    version: '1.0.0',
  };
}

function session(
  roots: BlueprintNode[],
  options: {
    limits?: Readonly<Partial<StudioCommandPolicyLimits>>;
    permissions?: readonly QualifiedName[];
  } = {},
): StudioSession {
  return new StudioSession({
    document: document(roots),
    ...(options.limits === undefined ? {} : { limits: options.limits }),
    mode: 'blueprint',
    ...(options.permissions === undefined ? {} : { permissions: options.permissions }),
    sessionGeneration: 'generation-1',
  });
}

function command(type: BlueprintCommand['type'], payload: object): BlueprintCommand {
  return {
    artifactId: 'policy.blueprint',
    baseStateVersion: 0,
    contractVersion: STUDIO_CONTRACT_VERSION,
    id: `commands/${type.slice(type.indexOf('/') + 1)}`,
    kind: 'command',
    payload,
    sessionGeneration: 'generation-1',
    type,
  } as BlueprintCommand;
}

function insert(
  target: BlueprintNode,
  parentNodeId?: string,
  slot?: string,
  position = parentNodeId === undefined ? 1 : 0,
): BlueprintCommand {
  return command('studio.command/insert-node', {
    destination:
      parentNodeId === undefined
        ? { position }
        : { parentNodeId, position, ...(slot === undefined ? {} : { slot }) },
    node: target,
  });
}

function setProperty(nodeId: string, property: string, value: JsonValue): BlueprintCommand {
  return command('studio.command/set-property', { nodeId, property, value });
}

function expectAtomicRejection(
  current: StudioSession,
  rejected: BlueprintCommand,
  code: 'permission-forbidden' | 'resource-limit',
): void {
  const before = current.document;
  const selection = current.selection;
  expect(() => current.execute(rejected)).toThrow(expect.objectContaining({ code }) as Error);
  expect(current.document).toStrictEqual(before);
  expect(current.selection).toStrictEqual(selection);
  expect(current.stateVersion).toBe(0);
  expect(current.dirty).toBe(false);
  expect(current.canUndo).toBe(false);
  expect(current.canRedo).toBe(false);
}

describe('StudioSession command resource policy', () => {
  it('rejects a projected node count above maxNodes atomically', () => {
    const current = session([node('root')], { limits: { maxNodes: 1 } });
    current.select(['root']);
    expectAtomicRejection(current, insert(node('second')), 'resource-limit');
  });

  it('rejects a projected nesting depth above maxDepth atomically', () => {
    const current = session([node('root')], { limits: { maxDepth: 1 } });
    current.select(['root']);
    expectAtomicRejection(current, insert(node('child'), 'root', 'main'), 'resource-limit');
  });

  it('rejects a projected slot count above maxSlotsPerNode atomically', () => {
    const current = session([node('root')], { limits: { maxSlotsPerNode: 0 } });
    current.select(['root']);
    expectAtomicRejection(current, insert(node('child'), 'root', 'new-slot'), 'resource-limit');
  });

  it('rejects a projected child count above maxChildrenPerSlot atomically', () => {
    const current = session([node('root', { children: [node('first')] })], {
      limits: { maxChildrenPerSlot: 1 },
    });
    current.select(['root']);
    expectAtomicRejection(current, insert(node('second'), 'root', 'main', 1), 'resource-limit');
  });

  it('rejects a batch above maxCommandBatch atomically', () => {
    const current = session([node('root')], { limits: { maxCommandBatch: 1 } });
    current.select(['root']);
    expectAtomicRejection(
      current,
      command('studio.command/batch', {
        operations: [
          {
            payload: { nodeId: 'root', property: 'title', value: 'First' },
            type: 'studio.command/set-property',
          },
          {
            payload: { nodeId: 'root', property: 'summary', value: 'Second' },
            type: 'studio.command/set-property',
          },
        ],
      }),
      'resource-limit',
    );
  });

  it('rejects projected property storage above maxPropertyBytes atomically', () => {
    const current = session([node('root')], { limits: { maxPropertyBytes: 1 } });
    current.select(['root']);
    expectAtomicRejection(current, setProperty('root', 'title', 'too large'), 'resource-limit');
  });

  it('rejects projected extension storage above maxExtensionBytes atomically', () => {
    const current = session([node('root')], { limits: { maxExtensionBytes: 0 } });
    current.select(['root']);
    expectAtomicRejection(
      current,
      insert(
        node('extended', {
          extensions: { 'studio.test/data': { enabled: true } },
        }),
      ),
      'resource-limit',
    );
  });

  it('rejects a canonical rich-text document above maxRichTextBytes atomically', () => {
    const current = session([node('root')], { limits: { maxRichTextBytes: 20 } });
    current.select(['root']);
    expectAtomicRejection(
      current,
      setProperty('root', 'copy', {
        content: [{ content: [{ text: 'bounded content', type: 'text' }], type: 'paragraph' }],
        type: 'doc',
      }),
      'resource-limit',
    );
  });

  it('rejects canonical rich-text nesting above maxRichTextDepth atomically', () => {
    const current = session([node('root')], { limits: { maxRichTextDepth: 2 } });
    current.select(['root']);
    expectAtomicRejection(
      current,
      setProperty('root', 'copy', {
        content: [{ content: [{ text: 'nested', type: 'text' }], type: 'paragraph' }],
        type: 'doc',
      }),
      'resource-limit',
    );
  });

  it('uses protocol maxima when a direct legacy session omits policy limits', () => {
    const current = session([node('root')]);
    expect(STUDIO_PROTOCOL_MAXIMUM_COMMAND_POLICY_LIMITS).toMatchObject({
      maxDepth: 128,
      maxNodes: 100_000,
      maxRichTextBytes: 10_485_760,
    });
    expect(current.execute(setProperty('root', 'title', 'Allowed')).roots[0]?.properties).toEqual({
      title: 'Allowed',
    });
  });

  it('rejects direct policy values above immutable protocol maxima', () => {
    expect(() =>
      session([node('root')], {
        limits: {
          maxNodes: STUDIO_PROTOCOL_MAXIMUM_COMMAND_POLICY_LIMITS.maxNodes + 1,
        },
      }),
    ).toThrow(RangeError);
  });
});

describe('Blueprint node requiredPermission policy', () => {
  it('rejects direct edits to a protected node and permits the exact permission', () => {
    const protectedNode = node('protected', { permission: REQUIRED_PERMISSION });
    const denied = session([protectedNode]);
    denied.select(['protected']);
    expectAtomicRejection(
      denied,
      setProperty('protected', 'title', 'Denied'),
      'permission-forbidden',
    );

    const allowed = session([protectedNode], { permissions: [REQUIRED_PERMISSION] });
    expect(
      allowed.execute(setProperty('protected', 'title', 'Allowed')).roots[0]?.properties,
    ).toEqual({ title: 'Allowed' });
  });

  it('rejects removal of an ancestor that contains a protected descendant', () => {
    const current = session([
      node('ancestor', {
        children: [node('protected', { permission: REQUIRED_PERMISSION })],
      }),
    ]);
    current.select(['ancestor']);
    expectAtomicRejection(
      current,
      command('studio.command/remove-node', { nodeId: 'ancestor' }),
      'permission-forbidden',
    );
  });

  it('rejects creation of a protected subtree', () => {
    const current = session([node('root')]);
    current.select(['root']);
    expectAtomicRejection(
      current,
      insert(node('protected', { permission: REQUIRED_PERMISSION })),
      'permission-forbidden',
    );
  });

  it('rejects moving a node into a protected destination parent', () => {
    const current = session([
      node('moving'),
      node('protected-parent', {
        permission: REQUIRED_PERMISSION,
        slots: { main: [] },
      }),
    ]);
    current.select(['moving']);
    expectAtomicRejection(
      current,
      command('studio.command/move-node', {
        destination: { parentNodeId: 'protected-parent', position: 0, slot: 'main' },
        nodeId: 'moving',
      }),
      'permission-forbidden',
    );
  });

  it('rejects reordering a collection containing a protected node', () => {
    const current = session([node('open'), node('protected', { permission: REQUIRED_PERMISSION })]);
    current.select(['open']);
    expectAtomicRejection(
      current,
      command('studio.command/reorder-children', {
        order: ['protected', 'open'],
      }),
      'permission-forbidden',
    );
  });
});
