import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createCoreProductionBlockDefinitions } from '@kumwe/studio-core';
import type {
  AuthoringSessionSnapshot,
  BlockDefinition,
  BlueprintBlockLock,
  JsonValue,
  PatternDocument,
  StudioConfiguration,
} from '@kumwe/studio-protocol';
import { createStudioConfigurationFixture } from '@kumwe/studio-testkit';
import { resolveStudioHostedPolicyCatalog } from '../src/hosted-policy.js';

const authoringSessionFixture = JSON.parse(
  await readFile(join(process.cwd(), 'schemas/examples/authoring-session.example.json'), 'utf8'),
) as AuthoringSessionSnapshot;
const extensionBlock = JSON.parse(
  await readFile(join(process.cwd(), 'schemas/examples/block.price.example.json'), 'utf8'),
) as BlockDefinition;

describe('hosted catalog policy', () => {
  it('exposes only the exact built-in definitions locked by the resolved host session', () => {
    const state = fixtureState();
    const catalog = resolveStudioHostedPolicyCatalog({
      builtInBlockDefinitions: state.builtIns,
      resolvedContributions: [],
      session: state.session,
      snapshot: state.snapshot,
    });

    expect(catalog.blockDefinitions.map((entry) => entry.type)).toEqual([state.definition.type]);
    expect(catalog.patterns).toEqual([]);
    expect(catalog.blockDefinitions).not.toHaveLength(state.builtIns.length);
  });

  it('rejects missing, stale, duplicate, and Blueprint-mismatched host locks', () => {
    const missing = fixtureState();
    missing.session.blocks = [
      { revision: 'missing-r1', type: 'org.example/missing', version: '1.0.0' },
    ];
    expect(() => resolve(missing)).toThrow('not built in or target-admitted');

    const stale = fixtureState();
    stale.session.blocks[0] = { ...first(stale.session.blocks), revision: 'stale-r1' };
    expect(() => resolve(stale)).toThrow('not locked revision stale-r1');

    const duplicate = fixtureState();
    duplicate.session.blocks.push(structuredClone(first(duplicate.session.blocks)));
    expect(() => resolve(duplicate)).toThrow('repeats the');

    const mismatched = fixtureState();
    mismatched.snapshot.state.blueprint.dependencyLock.blocks[0] = {
      ...first(mismatched.snapshot.state.blueprint.dependencyLock.blocks),
      integrity: 'sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
    };
    expect(() => resolve(mismatched)).toThrow('does not match the resolved Studio session lock');
  });

  it('requires extension blocks to be both target-admitted and exactly session-locked', () => {
    const state = fixtureState();
    state.session.blocks.push(lockOf(extensionBlock));

    expect(() => resolve(state)).toThrow('not built in or target-admitted');

    const admitted = resolveStudioHostedPolicyCatalog({
      builtInBlockDefinitions: state.builtIns,
      resolvedContributions: [extensionBlock],
      session: state.session,
      snapshot: state.snapshot,
    });
    expect(admitted.blockDefinitions.map((entry) => entry.type)).toEqual([
      state.definition.type,
      extensionBlock.type,
    ]);

    state.session.blocks.pop();
    expect(() =>
      resolveStudioHostedPolicyCatalog({
        builtInBlockDefinitions: state.builtIns,
        resolvedContributions: [extensionBlock],
        session: state.session,
        snapshot: state.snapshot,
      }),
    ).toThrow('does not lock that block');
  });

  it('rejects a started session that does not admit the host-resolved mode', () => {
    const state = fixtureState();
    state.snapshot.capabilities.modes = ['blueprint'];
    expect(() => resolve(state)).toThrow('does not admit the host-resolved Studio mode');
  });

  it('admits a pattern only when every exact block dependency is in the host catalog', () => {
    const state = fixtureState();
    const pattern = patternFor(extensionBlock);
    expect(() =>
      resolveStudioHostedPolicyCatalog({
        builtInBlockDefinitions: state.builtIns,
        resolvedContributions: [pattern],
        session: state.session,
        snapshot: state.snapshot,
      }),
    ).toThrow('requires an unavailable block lock');

    state.session.blocks.push(lockOf(extensionBlock));
    const admitted = resolveStudioHostedPolicyCatalog({
      builtInBlockDefinitions: state.builtIns,
      resolvedContributions: [extensionBlock, pattern],
      session: state.session,
      snapshot: state.snapshot,
    });
    expect(admitted.patterns).toEqual([pattern]);
  });

  it('fails before mounting when opened content or plugin inventory exceeds host limits', () => {
    const nodeCount = fixtureState();
    nodeCount.session.limits.maxNodes = 1;
    nodeCount.snapshot.state.blueprint.roots.push(
      structuredClone(first(nodeCount.snapshot.state.blueprint.roots)),
    );
    expectResourceLimit(nodeCount);

    const slots = fixtureState();
    slots.session.limits.maxSlotsPerNode = 0;
    first(slots.snapshot.state.blueprint.roots).slots = { content: [] };
    expectResourceLimit(slots);

    const children = fixtureState();
    children.session.limits.maxChildrenPerSlot = 0;
    first(children.snapshot.state.blueprint.roots).slots = {
      content: [structuredClone(first(children.snapshot.state.blueprint.roots))],
    };
    expectResourceLimit(children);

    const depth = fixtureState();
    depth.session.limits.maxDepth = 1;
    first(depth.snapshot.state.blueprint.roots).slots = {
      content: [structuredClone(first(depth.snapshot.state.blueprint.roots))],
    };
    expectResourceLimit(depth);

    const plugins = fixtureState();
    plugins.session.limits.maxPluginCount = 0;
    plugins.session.plugins = [
      { id: 'org.example/plugin', revision: 'plugin-r1', version: '1.0.0' },
    ];
    expect(() => resolve(plugins)).toThrow('plugin limit');
  });

  it('rejects initial Blueprint property and extension payloads above exact host limits', () => {
    const properties = fixtureState();
    properties.session.limits.maxPropertyBytes = 0;
    first(properties.snapshot.state.blueprint.roots).properties = { copy: 'not admitted' };
    expectResourceLimit(properties);

    const extensions = fixtureState();
    extensions.session.limits.maxExtensionBytes = 0;
    first(extensions.snapshot.state.blueprint.roots).extensions = {
      'studio.test/data': { enabled: true },
    };
    expectResourceLimit(extensions);
  });

  it('rejects initial Entry and Model extension payloads above exact host limits', () => {
    const entry = fixtureState();
    entry.session.limits.maxExtensionBytes = 0;
    entry.snapshot.state.entry.extensions = { 'studio.test/data': { enabled: true } };
    expectResourceLimit(entry);

    const model = fixtureState();
    model.session.limits.maxExtensionBytes = 0;
    first(model.snapshot.state.model.fields).extensions = {
      'studio.test/data': { enabled: true },
    };
    expectResourceLimit(model);
  });

  it('rejects initial rich text above exact byte and nesting limits without mutation', () => {
    const bytes = fixtureState();
    bytes.session.limits.maxRichTextBytes = 20;
    first(bytes.snapshot.state.blueprint.roots).properties = {
      copy: richTextValue('bounded by the exact hosted configuration'),
    };
    const pristineBytes = structuredClone(bytes.snapshot);
    expectResourceLimit(bytes);
    expect(bytes.snapshot).toStrictEqual(pristineBytes);

    const depth = fixtureState();
    depth.session.limits.maxRichTextDepth = 2;
    depth.snapshot.state.entry.values.copy = richTextValue('nested');
    expectResourceLimit(depth);

    const model = fixtureState();
    model.session.limits.maxRichTextBytes = 20;
    first(model.snapshot.state.model.fields).defaultValue = richTextValue('model default');
    expectResourceLimit(model);
  });
});

interface FixtureState {
  builtIns: BlockDefinition[];
  definition: BlockDefinition;
  session: StudioConfiguration;
  snapshot: AuthoringSessionSnapshot;
}

function fixtureState(): FixtureState {
  const builtIns = createCoreProductionBlockDefinitions();
  const definition = builtIns.find((entry) => entry.type === 'studio.core/rich-text');
  if (definition === undefined) throw new Error('The first-party rich-text definition is missing.');
  const snapshot = structuredClone(authoringSessionFixture);
  const lock = lockOf(definition);
  snapshot.state.blueprint.dependencyLock.blocks = [lock];
  const root = snapshot.state.blueprint.roots[0];
  if (root === undefined) throw new Error('The authoring fixture requires one root node.');
  root.type = definition.type;
  root.version = definition.version;
  const session = createStudioConfigurationFixture({ mode: 'content' });
  session.blocks = [structuredClone(lock)];
  session.plugins = [];
  return { builtIns, definition, session, snapshot };
}

function resolve(state: FixtureState) {
  return resolveStudioHostedPolicyCatalog({
    builtInBlockDefinitions: state.builtIns,
    resolvedContributions: [],
    session: state.session,
    snapshot: state.snapshot,
  });
}

function expectResourceLimit(state: FixtureState): void {
  expect(() => resolve(state)).toThrow(
    expect.objectContaining({ code: 'resource-limit' }) as Error,
  );
}

function richTextValue(text: string): JsonValue {
  return {
    content: [{ content: [{ text, type: 'text' }], type: 'paragraph' }],
    type: 'doc',
  };
}

function first<TValue>(values: readonly TValue[]): TValue {
  const value = values[0];
  if (value === undefined) throw new Error('The test fixture requires a first value.');
  return value;
}

function lockOf(definition: BlockDefinition): BlueprintBlockLock {
  return {
    revision: definition.revision,
    type: definition.type,
    version: definition.version,
  };
}

function patternFor(definition: BlockDefinition): PatternDocument {
  return {
    blockDependencies: [lockOf(definition)],
    contractVersion: definition.contractVersion,
    id: 'org.example.catalog/patterns/price',
    kind: 'pattern',
    label: { defaultMessage: 'Price', key: 'org.example.catalog/patterns/price' },
    owner: structuredClone(definition.owner),
    revision: 'price-pattern-r1',
    roots: [
      {
        authoring: { mode: 'designer' },
        bindings: {},
        id: 'price-pattern-node',
        properties: {},
        slots: {},
        type: definition.type,
        version: definition.version,
      },
    ],
    version: '1.0.0',
  };
}
