import { describe, expect, it } from 'vitest';
import { Ajv2020 } from 'ajv/dist/2020.js';
import {
  protocolSchemas,
  STUDIO_CONTRACT_VERSION,
  type BlockDefinition,
  type BlueprintDocument,
  type OwnerReference,
  type PluginContributionDeclaration,
  type PluginContributionKind,
  type SemanticVersion,
  type UnresolvedContributionReference,
} from '@kumwe/studio-protocol';
import {
  activateStudioPlugin,
  ContributionRuntime,
  defineStudioPlugin,
  StudioCommandError,
  StudioContributionError,
  unresolvedDeclaredContributions,
  validateBlueprint,
  type StudioPluginDefinition,
} from '../src/index.js';

const ownerA: OwnerReference = { id: 'org.example/blocks', version: '1.0.0' };
const ownerB: OwnerReference = { id: 'org.other/blocks', version: '2.0.0' };

function block(
  type: `${string}/${string}`,
  owner: OwnerReference,
  version = '1.0.0',
): BlockDefinition {
  return {
    accessibility: {
      accessibleName: 'not-applicable',
      category: 'structural',
      keyboard: { defaultMessage: 'Keyboard first.', key: 'studio.test/keyboard' },
      outputChecks: ['studio.check/test'],
      reducedMotion: 'not-applicable',
    },
    category: 'studio.category/test',
    contractVersion: STUDIO_CONTRACT_VERSION,
    editingModes: ['blueprint'],
    kind: 'block-definition',
    label: { defaultMessage: 'Block', key: 'studio.test/block' },
    owner,
    ports: [],
    propertySchema: { additionalProperties: false, type: 'object' },
    rendererRequirements: [
      { capability: 'studio.renderer/test', surface: 'preview', versions: '^0.1.0' },
    ],
    revision: 'block-r1',
    slots: [],
    themeControls: [],
    type,
    version,
  };
}

function documentUsing(type: `${string}/${string}`): BlueprintDocument {
  return {
    contractVersion: STUDIO_CONTRACT_VERSION,
    dependencyLock: {
      blocks: [{ revision: 'block-r1', type, version: '1.0.0' }],
      theme: { id: 'studio.test/theme', revision: 'theme-r1', version: '1.0.0' },
    },
    id: 'runtime.blueprint',
    kind: 'blueprint',
    label: { defaultMessage: 'Runtime Blueprint', key: 'studio.test/blueprint' },
    model: { id: 'studio.test/model', revision: 'model-r1', version: '1.0.0' },
    owner: { id: 'studio.test/suite', version: '0.1.0-alpha.0' },
    revision: 'blueprint-r1',
    roots: [
      {
        authoring: { mode: 'designer' },
        bindings: {},
        id: 'node-a',
        properties: {},
        slots: {},
        type,
        version: '1.0.0',
      },
    ],
    status: 'draft',
    version: '1.0.0',
  };
}

const toolkitKinds = [
  'field-adapter',
  'pattern',
  'transform',
  'renderer-capability',
  'inspector',
] as const;

function toolkitDeclaration(
  kind: PluginContributionKind,
  version: SemanticVersion,
): PluginContributionDeclaration {
  return {
    executable: false,
    id: `org.example.toolkit/${kind}`,
    integrity: 'sha256-gEReHtrWQj4XVxU9b3Yie2ssI8Wsy/nv+rvEe6RcFac=',
    kind,
    resource: `contributions/${kind}.json`,
    version,
  };
}

function toolkitDefinition(version: SemanticVersion = '1.0.0'): StudioPluginDefinition {
  return {
    manifest: {
      activation: 'declarative',
      contractVersion: STUDIO_CONTRACT_VERSION,
      contributions: toolkitKinds.map((kind) => toolkitDeclaration(kind, version)),
      dependencies: [],
      entryModules: [],
      id: 'org.example/toolkit',
      kind: 'plugin-manifest',
      label: { defaultMessage: 'Toolkit', key: 'org.example.toolkit/plugin' },
      optionalCapabilities: [],
      owner: { id: 'org.example/toolkit', version },
      permissions: [],
      requiredCapabilities: [],
      version,
    },
  };
}

function toolkitReferences(version: SemanticVersion = '1.0.0'): UnresolvedContributionReference[] {
  return toolkitKinds.map((kind) => ({
    contribution: kind,
    id: `org.example.toolkit/${kind}`,
    version,
  }));
}

describe('ContributionRuntime', () => {
  it('activates contributions into a new immutable generation', () => {
    const runtime = new ContributionRuntime({ generation: 'gen-0' });
    const generation = runtime.activate(
      ownerA,
      { blocks: [block('org.example/hero', ownerA)] },
      { generation: 'gen-1' },
    );
    expect(generation.generation).toBe('gen-1');
    expect(generation.resolveBlock('org.example/hero', '1.0.0')).toBeDefined();
    expect(generation.owners()).toEqual([ownerA]);
    expect(() => generation.registry.register(block('org.example/late', ownerA))).toThrow(
      'immutable',
    );
  });

  it('rejects activation atomically without publishing a partial generation', () => {
    const runtime = new ContributionRuntime({ generation: 'gen-0' });
    const before = runtime.current;
    expect(() =>
      runtime.activate(
        ownerA,
        {
          blocks: [
            block('org.example/good', ownerA),
            block('org.example/bad', { id: 'org.impostor/blocks', version: '9.9.9' }),
          ],
        },
        { generation: 'gen-1' },
      ),
    ).toThrow(StudioContributionError);
    expect(runtime.current).toBe(before);
    expect(runtime.current.resolveBlock('org.example/good', '1.0.0')).toBeUndefined();
    expect(runtime.inventory()).toEqual([expect.objectContaining({ state: 'rejected' }) as object]);
  });

  it('fails closed on cross-owner block type collisions', () => {
    const runtime = new ContributionRuntime({ generation: 'gen-0' });
    runtime.activate(
      ownerA,
      { blocks: [block('org.example/hero', ownerA)] },
      { generation: 'gen-1' },
    );
    expect(() =>
      runtime.activate(
        ownerB,
        { blocks: [block('org.example/hero', ownerB)] },
        { generation: 'gen-2' },
      ),
    ).toThrow(StudioContributionError);
    expect(runtime.current.generation).toBe('gen-1');
  });

  it('keeps the previous activation when an upgrade is rejected', () => {
    const runtime = new ContributionRuntime({ generation: 'gen-0' });
    runtime.activate(
      ownerA,
      { blocks: [block('org.example/hero', ownerA)] },
      { generation: 'gen-1' },
    );
    expect(() =>
      runtime.activate(
        ownerA,
        { blocks: [block('org.example/hero', { id: 'org.impostor/blocks', version: '1.0.0' })] },
        { generation: 'gen-2' },
      ),
    ).toThrow(StudioContributionError);
    expect(runtime.current.generation).toBe('gen-1');
    expect(runtime.current.resolveBlock('org.example/hero', '1.0.0')).toBeDefined();
    expect(runtime.inventory()).toEqual([expect.objectContaining({ state: 'active' }) as object]);
  });

  it('disable removes executable contributions while documents stay diagnosable', () => {
    const runtime = new ContributionRuntime({ generation: 'gen-0' });
    runtime.activate(
      ownerA,
      { blocks: [block('org.example/hero', ownerA)] },
      { generation: 'gen-1' },
    );
    const document = documentUsing('org.example/hero');
    expect(validateBlueprint(document, runtime.current.registry).valid).toBe(true);
    expect(runtime.unresolvedNodes(document)).toEqual([]);

    runtime.disable(ownerA.id, { generation: 'gen-2' });
    expect(runtime.current.resolveBlock('org.example/hero', '1.0.0')).toBeUndefined();
    expect(runtime.unresolvedNodes(document)).toEqual([
      {
        nodeId: 'node-a',
        owner: ownerA,
        reason: 'owner-disabled',
        type: 'org.example/hero',
        version: '1.0.0',
      },
    ]);
    const result = validateBlueprint(document, runtime.current.registry);
    expect(result.valid).toBe(false);
    expect(result.diagnostics.some((entry) => entry.code.includes('block'))).toBe(true);

    runtime.reactivate(ownerA.id, { generation: 'gen-3' });
    expect(runtime.current.resolveBlock('org.example/hero', '1.0.0')).toBeDefined();
    expect(runtime.unresolvedNodes(document)).toEqual([]);
  });

  it('trust revocation drops contributions and blocks reactivation', () => {
    const runtime = new ContributionRuntime({ generation: 'gen-0' });
    runtime.activate(
      ownerA,
      { blocks: [block('org.example/hero', ownerA)] },
      { generation: 'gen-1' },
    );
    runtime.revokeTrust(ownerA.id, { generation: 'gen-2' });
    expect(runtime.current.resolveBlock('org.example/hero', '1.0.0')).toBeUndefined();
    expect(() => runtime.reactivate(ownerA.id, { generation: 'gen-3' })).toThrow(
      StudioContributionError,
    );
    const fresh = runtime.activate(
      ownerA,
      { blocks: [block('org.example/hero', ownerA)] },
      { generation: 'gen-4' },
    );
    expect(fresh.resolveBlock('org.example/hero', '1.0.0')).toBeDefined();
  });

  it('refuses execution against a stale generation', () => {
    const runtime = new ContributionRuntime({ generation: 'gen-0' });
    const first = runtime.activate(
      ownerA,
      { blocks: [block('org.example/hero', ownerA)] },
      { generation: 'gen-1' },
    );
    runtime.disable(ownerA.id, { generation: 'gen-2' });
    expect(() => runtime.assertCurrent(first.generation)).toThrow(
      expect.objectContaining({ code: 'stale-generation' }) as Error,
    );
    expect(runtime.assertCurrent('gen-2').generation).toBe('gen-2');
    expect(first.resolveBlock('org.example/hero', '1.0.0')).toBeDefined();
  });

  it('rejects duplicate contributions from the same owner', () => {
    const runtime = new ContributionRuntime({ generation: 'gen-0' });
    expect(() =>
      runtime.activate(
        ownerA,
        { blocks: [block('org.example/hero', ownerA), block('org.example/hero', ownerA)] },
        { generation: 'gen-1' },
      ),
    ).toThrow(StudioContributionError);
  });

  it('reports unknown extensions with a contribution error', () => {
    const runtime = new ContributionRuntime({ generation: 'gen-0' });
    expect(() => runtime.disable('org.unknown/blocks', { generation: 'gen-1' })).toThrow(
      StudioContributionError,
    );
    expect(() => runtime.assertCurrent('gen-9')).toThrow(StudioCommandError);
  });
});

describe('unresolved contribution reporting', () => {
  it('distinguishes disabled, revoked, incompatible, and uninstalled reasons', () => {
    const runtime = new ContributionRuntime({ generation: 'gen-0' });
    runtime.activate(
      ownerA,
      { blocks: [block('org.example/hero', ownerA)] },
      { generation: 'gen-1' },
    );

    runtime.disable(ownerA.id, { generation: 'gen-2' });
    expect(runtime.unresolvedNodes(documentUsing('org.example/hero'))[0]?.reason).toBe(
      'owner-disabled',
    );

    runtime.revokeTrust(ownerA.id, { generation: 'gen-3' });
    expect(runtime.unresolvedNodes(documentUsing('org.example/hero'))[0]?.reason).toBe(
      'owner-revoked',
    );

    const incompatible = documentUsing('org.example/hero');
    for (const root of incompatible.roots) {
      root.version = '9.9.9';
    }
    expect(runtime.unresolvedNodes(incompatible)[0]?.reason).toBe('incompatible');

    expect(runtime.unresolvedNodes(documentUsing('org.example/unknown'))[0]?.reason).toBe(
      'not-installed',
    );
  });

  it('aggregates schema-valid unresolved-contribution documents per block version', () => {
    const runtime = new ContributionRuntime({ generation: 'gen-0' });
    runtime.activate(
      ownerA,
      { blocks: [block('org.example/hero', ownerA)] },
      { generation: 'gen-1' },
    );
    runtime.disable(ownerA.id, { generation: 'gen-2' });

    const document = documentUsing('org.example/hero');
    const [firstRoot] = document.roots;
    if (firstRoot === undefined) {
      throw new Error('fixture requires a root');
    }
    document.roots.push({ ...firstRoot, id: 'node-b' });
    const contributions = runtime.unresolvedContributions(document);
    expect(contributions).toHaveLength(1);
    expect(contributions[0]).toMatchObject({
      affectedNodes: ['node-a', 'node-b'],
      kind: 'unresolved-contribution',
      owner: ownerA,
      reason: 'owner-disabled',
      reference: { contribution: 'block', id: 'org.example/hero', version: '1.0.0' },
    });

    const ajv = new Ajv2020({ allErrors: true, strict: true });
    for (const schema of protocolSchemas) {
      ajv.addSchema(schema);
    }
    const validate = ajv.getSchema(
      'https://schemas.kumwe.org/studio/v1/unresolved-contribution.schema.json',
    );
    expect(validate?.(contributions[0]), ajv.errorsText(validate?.errors)).toBe(true);
  });
});

describe('extension lifecycle beyond blocks', () => {
  it('activates declared non-block kinds into a sealed immutable generation', () => {
    const runtime = new ContributionRuntime({ generation: 'gen-0' });
    const definition = defineStudioPlugin(toolkitDefinition());
    const generation = activateStudioPlugin(runtime, definition, { generation: 'gen-1' });
    expect(generation.generation).toBe('gen-1');
    expect(generation.owners()).toEqual([definition.manifest.owner]);
    expect(() => generation.registry.register(block('org.example/late', ownerA))).toThrow(
      'immutable',
    );
    expect(unresolvedDeclaredContributions(runtime, [definition], toolkitReferences())).toEqual([]);
    expect(runtime.inventory()).toEqual([expect.objectContaining({ state: 'active' }) as object]);
  });

  it('owner disable removes the executable surface while every declared kind stays diagnosable', () => {
    const runtime = new ContributionRuntime({ generation: 'gen-0' });
    const definition = defineStudioPlugin(toolkitDefinition());
    activateStudioPlugin(runtime, definition, { generation: 'gen-1' });

    runtime.disable('org.example/toolkit', { generation: 'gen-2' });
    expect(runtime.current.owners()).toEqual([]);
    const unresolved = unresolvedDeclaredContributions(runtime, [definition], toolkitReferences());
    expect(unresolved.map((entry) => [entry.reference.contribution, entry.reason])).toEqual(
      toolkitKinds.map((kind) => [kind, 'owner-disabled']),
    );
    expect(unresolved.every((entry) => entry.owner?.id === 'org.example/toolkit')).toBe(true);

    const ajv = new Ajv2020({ allErrors: true, strict: true });
    for (const schema of protocolSchemas) {
      ajv.addSchema(schema);
    }
    const validate = ajv.getSchema(
      'https://schemas.kumwe.org/studio/v1/unresolved-contribution.schema.json',
    );
    for (const entry of unresolved) {
      expect(validate?.(entry), ajv.errorsText(validate?.errors)).toBe(true);
    }

    runtime.reactivate('org.example/toolkit', { generation: 'gen-3' });
    expect(unresolvedDeclaredContributions(runtime, [definition], toolkitReferences())).toEqual([]);
  });

  it('trust revocation reports owner-revoked per kind and blocks reactivation', () => {
    const runtime = new ContributionRuntime({ generation: 'gen-0' });
    const definition = defineStudioPlugin(toolkitDefinition());
    activateStudioPlugin(runtime, definition, { generation: 'gen-1' });

    runtime.revokeTrust('org.example/toolkit', { generation: 'gen-2' });
    const unresolved = unresolvedDeclaredContributions(runtime, [definition], toolkitReferences());
    expect(unresolved.map((entry) => [entry.reference.contribution, entry.reason])).toEqual(
      toolkitKinds.map((kind) => [kind, 'owner-revoked']),
    );
    expect(() => runtime.reactivate('org.example/toolkit', { generation: 'gen-3' })).toThrow(
      StudioContributionError,
    );

    activateStudioPlugin(runtime, definition, { generation: 'gen-4' });
    expect(unresolvedDeclaredContributions(runtime, [definition], toolkitReferences())).toEqual([]);
  });

  it('incompatible-owner and duplicate-id definitions fail closed without disturbing the active generation', () => {
    const runtime = new ContributionRuntime({ generation: 'gen-0' });
    const definition = defineStudioPlugin(toolkitDefinition());
    activateStudioPlugin(runtime, definition, { generation: 'gen-1' });

    const foreignNamespace: StudioPluginDefinition = {
      manifest: {
        ...toolkitDefinition().manifest,
        contributions: [toolkitDeclaration('pattern', '1.0.0')],
        id: 'org.other/tools',
        owner: { id: 'org.other/tools', version: '1.0.0' },
      },
    };
    expect(() => activateStudioPlugin(runtime, foreignNamespace, { generation: 'gen-2' })).toThrow(
      StudioContributionError,
    );

    const duplicateId: StudioPluginDefinition = {
      manifest: {
        ...toolkitDefinition().manifest,
        contributions: [
          toolkitDeclaration('field-adapter', '1.0.0'),
          toolkitDeclaration('field-adapter', '1.0.0'),
        ],
      },
    };
    expect(() => activateStudioPlugin(runtime, duplicateId, { generation: 'gen-2' })).toThrow(
      StudioContributionError,
    );

    expect(runtime.current.generation).toBe('gen-1');
    expect(runtime.current.owners()).toEqual([definition.manifest.owner]);
    expect(unresolvedDeclaredContributions(runtime, [definition], toolkitReferences())).toEqual([]);
  });

  it('upgrade replaces declared versions atomically and reports retired versions incompatible', () => {
    const runtime = new ContributionRuntime({ generation: 'gen-0' });
    activateStudioPlugin(runtime, defineStudioPlugin(toolkitDefinition('1.0.0')), {
      generation: 'gen-1',
    });

    const upgraded = defineStudioPlugin(toolkitDefinition('2.0.0'));
    const generation = activateStudioPlugin(runtime, upgraded, { generation: 'gen-2' });
    expect(generation.generation).toBe('gen-2');
    expect(runtime.inventory()).toEqual([expect.objectContaining({ state: 'active' }) as object]);
    expect(
      unresolvedDeclaredContributions(runtime, [upgraded], toolkitReferences('2.0.0')),
    ).toEqual([]);

    const retired = unresolvedDeclaredContributions(
      runtime,
      [upgraded],
      toolkitReferences('1.0.0'),
    );
    expect(retired.map((entry) => [entry.reference.contribution, entry.reason])).toEqual(
      toolkitKinds.map((kind) => [kind, 'incompatible']),
    );
    expect(retired[0]?.owner).toEqual({ id: 'org.example/toolkit', version: '2.0.0' });
  });

  it('reports not-installed for declarations no activated extension provides', () => {
    const runtime = new ContributionRuntime({ generation: 'gen-0' });
    const definition = defineStudioPlugin(toolkitDefinition());

    const inactive = unresolvedDeclaredContributions(runtime, [definition], toolkitReferences());
    expect(inactive.every((entry) => entry.reason === 'not-installed')).toBe(true);
    expect(inactive.every((entry) => entry.owner === undefined)).toBe(true);

    activateStudioPlugin(runtime, definition, { generation: 'gen-1' });
    const unknown = unresolvedDeclaredContributions(
      runtime,
      [definition],
      [{ contribution: 'panel', id: 'org.example.toolkit/missing', version: '1.0.0' }],
    );
    expect(unknown).toEqual([expect.objectContaining({ reason: 'not-installed' }) as object]);
  });
});
