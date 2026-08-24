import { describe, expect, it } from 'vitest';
import {
  STUDIO_CONTRACT_VERSION,
  type BlockDefinition,
  type BlueprintBlockLock,
  type BlueprintCommand,
  type BlueprintDocument,
  type BlueprintNode,
  type InsertNodeCommand,
} from '@kumwe/studio-protocol';
import { applyCommand, BlockRegistry, StudioHistory, validateBlueprint } from '../src/index.js';

const textBlock: BlockDefinition = {
  accessibility: {
    accessibleName: 'not-applicable',
    category: 'text',
    keyboard: { defaultMessage: 'Edit text with the keyboard.', key: 'studio.test/text-keyboard' },
    outputChecks: ['studio.check/text'],
    reducedMotion: 'not-applicable',
  },
  category: 'studio.category/content',
  contractVersion: STUDIO_CONTRACT_VERSION,
  kind: 'block-definition',
  label: { defaultMessage: 'Text', key: 'studio.test/text' },
  editingModes: ['blueprint', 'content'],
  owner: { id: 'studio.test/blocks', version: '0.1.0-alpha.0' },
  ports: [],
  propertySchema: {
    additionalProperties: false,
    properties: { text: { type: 'string' } },
    required: ['text'],
    type: 'object',
  },
  rendererRequirements: [
    { capability: 'studio.renderer/text', surface: 'preview', versions: '^0.1.0' },
  ],
  revision: 'text-r1',
  slots: [],
  themeControls: [],
  type: 'studio.core/text',
  version: '1.0.0',
};

function document(
  blocks: BlueprintBlockLock[] = [
    { revision: textBlock.revision, type: textBlock.type, version: textBlock.version },
  ],
): BlueprintDocument {
  return {
    contractVersion: STUDIO_CONTRACT_VERSION,
    dependencyLock: {
      blocks,
      theme: { id: 'studio.test/theme', revision: 'theme-r1', version: '1.0.0' },
    },
    id: 'test.blueprint',
    kind: 'blueprint',
    label: { defaultMessage: 'Test', key: 'studio.test/blueprint' },
    model: { id: 'studio.test/model', revision: 'model-r1', version: '1.0.0' },
    owner: { id: 'studio.test/suite', version: '1.0.0' },
    revision: 'blueprint-r1',
    roots: [],
    status: 'draft',
    version: '1.0.0',
  };
}

function textNode(bind = false): BlueprintNode {
  return {
    authoring: { mode: 'content' },
    bindings: bind
      ? {
          text: {
            onError: 'error',
            onNull: 'error',
            source: { fieldPath: ['product', 'name'], kind: 'entry-field' },
            transforms: [],
          },
        }
      : {},
    id: 'text-1',
    properties: { text: 'Hello' },
    slots: {},
    type: 'studio.core/text',
    version: '1.0.0',
  };
}

function insert(node: BlueprintNode, baseStateVersion = 0): InsertNodeCommand {
  return {
    artifactId: 'test.blueprint',
    baseStateVersion,
    contractVersion: STUDIO_CONTRACT_VERSION,
    id: `command-${baseStateVersion}`,
    kind: 'command',
    payload: { destination: { position: 0 }, node },
    sessionGeneration: 'session-r1',
    type: 'studio.command/insert-node',
  };
}

describe('Studio core', () => {
  it('applies canonical commands without mutating the source document', () => {
    const source = document();
    const next = applyCommand(source, insert(textNode()));

    expect(source.roots).toHaveLength(0);
    expect(next.roots[0]?.properties.text).toBe('Hello');
    expect(next.revision).toBe('blueprint-r1');
  });

  it('treats inherited-looking slot and responsive names as owned map entries', () => {
    const parent = { ...textNode(), id: 'parent-1' };
    const child = { ...textNode(), id: 'child-1' };
    const source = { ...document(), roots: [parent] };
    const insertIntoInheritedName = {
      ...insert(child),
      payload: {
        destination: { parentNodeId: parent.id, position: 0, slot: 'toString' },
        node: child,
      },
    } as unknown as BlueprintCommand;

    const inserted = applyCommand(source, insertIntoInheritedName);
    const insertedSlots = inserted.roots[0]?.slots ?? {};
    expect(Object.hasOwn(insertedSlots, 'toString')).toBe(true);
    expect(Object.getOwnPropertyDescriptor(insertedSlots, 'toString')?.value as unknown).toEqual([
      expect.objectContaining({ id: child.id }),
    ]);

    const setResponsiveInheritedNames = {
      artifactId: source.id,
      baseStateVersion: 0,
      contractVersion: STUDIO_CONTRACT_VERSION,
      id: 'command-responsive-inherited',
      kind: 'command',
      payload: {
        nodeId: parent.id,
        property: 'toString',
        value: 'safe-value',
        viewport: 'valueOf',
      },
      sessionGeneration: 'session-r1',
      type: 'studio.command/set-property',
    } as unknown as BlueprintCommand;
    const objectToString = Object.getOwnPropertyDescriptor(Object.prototype, 'toString')
      ?.value as object;

    expect(Object.hasOwn(objectToString, 'valueOf')).toBe(false);
    const responsive = applyCommand(source, setResponsiveInheritedNames);
    expect(Object.hasOwn(objectToString, 'valueOf')).toBe(false);
    const responsiveMap = responsive.roots[0]?.responsive ?? {};
    expect(Object.hasOwn(responsiveMap, 'toString')).toBe(true);
    const responsiveValues = Object.getOwnPropertyDescriptor(responsiveMap, 'toString')
      ?.value as Record<string, unknown>;
    expect(Object.getOwnPropertyDescriptor(responsiveValues, 'valueOf')?.value as unknown).toBe(
      'safe-value',
    );
  });

  it('supports bounded undo and redo history', () => {
    const history = new StudioHistory(document());
    history.execute(insert(textNode()));

    expect(history.canUndo).toBe(true);
    expect(history.undo().roots).toHaveLength(0);
    expect(history.canRedo).toBe(true);
    expect(history.redo().roots).toHaveLength(1);
    expect(history.stateVersion).toBe(3);
  });

  it('rebases current, past, and future snapshots without advancing local state', () => {
    const history = new StudioHistory(document());
    history.execute(insert(textNode()));
    history.execute(insert({ ...textNode(), id: 'text-2' }, 1));
    expect(history.undo().roots.map((node) => node.id)).toEqual(['text-1']);
    const stateVersion = history.stateVersion;

    expect(history.rebaseRevision('blueprint-r2').revision).toBe('blueprint-r2');
    expect(history.stateVersion).toBe(stateVersion);
    expect(history.canUndo).toBe(true);
    expect(history.canRedo).toBe(true);

    expect(history.redo()).toMatchObject({ revision: 'blueprint-r2' });
    expect(history.undo()).toMatchObject({ revision: 'blueprint-r2' });
    expect(history.undo()).toMatchObject({ revision: 'blueprint-r2', roots: [] });
    expect(history.redo()).toMatchObject({ revision: 'blueprint-r2' });
    expect(history.redo()).toMatchObject({ revision: 'blueprint-r2' });
  });

  it('validates registered blocks and canonical field bindings', () => {
    const registry = new BlockRegistry([textBlock]);
    const source = applyCommand(document(), insert(textNode(true)));

    const result = validateBlueprint(source, registry, {
      fieldPaths: new Set(['product.price']),
    });

    expect(result.valid).toBe(false);
    const diagnostic = result.diagnostics.find(
      (entry) => entry.code === 'studio.validation/field-unavailable',
    );
    expect(diagnostic?.location?.nodeId).toBe('text-1');
  });

  it('scopes compiled property schemas to the registry that admitted them', () => {
    const numberBlock: BlockDefinition = {
      ...textBlock,
      propertySchema: {
        additionalProperties: false,
        properties: { text: { type: 'number' } },
        required: ['text'],
        type: 'object',
      },
      revision: 'text-r2',
    };
    const stringDocument = applyCommand(document(), insert(textNode()));
    const numberDocument = applyCommand(
      document([
        {
          revision: numberBlock.revision,
          type: numberBlock.type,
          version: numberBlock.version,
        },
      ]),
      insert({ ...textNode(), properties: { text: 42 } }),
    );

    expect(validateBlueprint(stringDocument, new BlockRegistry([textBlock])).valid).toBe(true);
    expect(validateBlueprint(numberDocument, new BlockRegistry([numberBlock])).valid).toBe(true);
  });

  it('fails closed when a resolved block differs from the dependency lock', () => {
    const missing = validateBlueprint(
      applyCommand(document([]), insert(textNode())),
      new BlockRegistry([textBlock]),
    );
    expect(missing.diagnostics.some((entry) => entry.code.endsWith('/block-lock-missing'))).toBe(
      true,
    );

    const stale = validateBlueprint(
      applyCommand(
        document([{ revision: 'text-stale', type: textBlock.type, version: textBlock.version }]),
        insert(textNode()),
      ),
      new BlockRegistry([textBlock]),
    );
    expect(
      stale.diagnostics.some((entry) => entry.code.endsWith('/block-lock-revision-mismatch')),
    ).toBe(true);

    const integrity = 'sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=';
    const locked = applyCommand(
      document([
        {
          integrity,
          revision: textBlock.revision,
          type: textBlock.type,
          version: textBlock.version,
        },
      ]),
      insert(textNode()),
    );
    expect(
      validateBlueprint(locked, new BlockRegistry([textBlock])).diagnostics.some((entry) =>
        entry.code.endsWith('/block-lock-integrity-unverified'),
      ),
    ).toBe(true);

    const verifiedRegistry = new BlockRegistry();
    verifiedRegistry.register(textBlock, { verifiedIntegrity: integrity });
    expect(validateBlueprint(locked, verifiedRegistry).valid).toBe(true);

    const mismatchedRegistry = new BlockRegistry();
    mismatchedRegistry.register(textBlock, {
      verifiedIntegrity: 'sha256-ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0=',
    });
    expect(
      validateBlueprint(locked, mismatchedRegistry).diagnostics.some((entry) =>
        entry.code.endsWith('/block-lock-integrity-mismatch'),
      ),
    ).toBe(true);

    expect(() =>
      new BlockRegistry().register(textBlock, { verifiedIntegrity: 'sha256-YWJj' }),
    ).toThrow(/canonical SRI/u);
  });

  it('rejects property schemas outside the bounded Studio Schema Profile', () => {
    expect(
      () =>
        new BlockRegistry([
          {
            ...textBlock,
            propertySchema: {
              additionalProperties: false,
              pattern: '(a+)+$',
              type: 'object',
            },
          },
        ]),
    ).toThrow(/pattern.*not allowed/u);
    expect(
      () =>
        new BlockRegistry([
          {
            ...textBlock,
            propertySchema: {
              $ref: 'https://untrusted.example/schema.json',
              additionalProperties: false,
              type: 'object',
            },
          },
        ]),
    ).toThrow(/local JSON Pointer reference/u);
  });

  it.each<unknown>([
    JSON.parse(
      '{"additionalProperties":false,"type":"object","properties":{"__proto__":{"type":"string"}}}',
    ) as unknown,
    JSON.parse(
      '{"additionalProperties":false,"type":"object","default":{"safe":{"constructor":{"prototype":true}}}}',
    ) as unknown,
    JSON.parse(
      '{"additionalProperties":false,"type":"object","examples":[{"safe":{"__proto__":true}}]}',
    ) as unknown,
    {
      additionalProperties: false,
      default: { 'control\u0000character': true },
      type: 'object',
    },
    { additionalProperties: false, properties: { '': { type: 'string' } }, type: 'object' },
  ])('rejects unsafe member names anywhere in a contributed schema', (propertySchema) => {
    expect(
      () =>
        new BlockRegistry([
          {
            ...textBlock,
            propertySchema: propertySchema as BlockDefinition['propertySchema'],
          },
        ]),
    ).toThrow(/forbidden object member name/u);
  });

  it('classifies an over-length contributed member name as a limit failure', () => {
    expect(
      () =>
        new BlockRegistry([
          {
            ...textBlock,
            propertySchema: {
              additionalProperties: false,
              default: { ['x'.repeat(201)]: true },
              type: 'object',
            },
          },
        ]),
    ).toThrow(/member name longer than 200 characters/u);
  });

  it('rejects recursive contributed property schemas before compilation', () => {
    const propertySchema = JSON.parse(`{
      "$defs": {
        "value": {
          "anyOf": [
            { "type": "string" },
            {
              "additionalProperties": false,
              "properties": { "next": { "$ref": "#/$defs/value" } },
              "type": "object"
            }
          ]
        }
      },
      "$ref": "#/$defs/value"
    }`) as BlockDefinition['propertySchema'];

    expect(() => new BlockRegistry([{ ...textBlock, propertySchema }])).toThrow(
      /Recursive contributed schemas/u,
    );
  });

  it('preflights deeply nested untrusted nodes before recursive schema evaluation', () => {
    let root = textNode();
    for (let depth = 0; depth < 2_000; depth += 1) {
      root = {
        ...textNode(),
        id: `text-${depth + 2}`,
        slots: { content: [root] },
      };
    }
    const deeplyNested = { ...document(), roots: [root] };

    expect(() => validateBlueprint(deeplyNested, new BlockRegistry([textBlock]))).not.toThrow();
    expect(
      validateBlueprint(deeplyNested, new BlockRegistry([textBlock])).diagnostics.some((entry) =>
        entry.code.endsWith('/maximum-depth'),
      ),
    ).toBe(true);
  });

  it('preflights deeply nested generic values before canonical schema evaluation', () => {
    let properties: Record<string, unknown> = { text: 'Hello' };
    for (let depth = 0; depth < 3_000; depth += 1) {
      properties = { next: properties };
    }
    const deeplyNested = {
      ...document(),
      roots: [{ ...textNode(), properties }],
    };

    expect(() => validateBlueprint(deeplyNested, new BlockRegistry([textBlock]))).not.toThrow();
    expect(
      validateBlueprint(deeplyNested, new BlockRegistry([textBlock])).diagnostics.some((entry) =>
        entry.code.endsWith('/maximum-value-depth'),
      ),
    ).toBe(true);
  });

  it('returns canonical diagnostics for malformed runtime documents', () => {
    const registry = new BlockRegistry([textBlock]);
    const malformedDocuments: unknown[] = [
      {},
      { dependencyLock: { blocks: [] }, roots: 'not-an-array' },
    ];

    for (const malformed of malformedDocuments) {
      expect(() => validateBlueprint(malformed, registry)).not.toThrow();
      const result = validateBlueprint(malformed, registry);
      expect(result.valid).toBe(false);
      expect(
        result.diagnostics.some((entry) => entry.code.startsWith('studio.validation/schema-')),
      ).toBe(true);
    }
  });

  it('does not include authored command payloads in unsupported-command errors', () => {
    const unsupported = {
      ...insert(textNode()),
      payload: { secret: 'database-password=/private/path' }, // studio-secret-scan:allow
      type: 'studio.command/private-operation',
    } as unknown as InsertNodeCommand;

    let message = '';
    try {
      applyCommand(document(), unsupported);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain('studio.command/private-operation');
    expect(message).not.toContain('database-password');
    expect(message).not.toContain('/private/path');
  });
});
