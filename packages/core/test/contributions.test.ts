import { describe, expect, it } from 'vitest';
import {
  STUDIO_CONTRACT_VERSION,
  type BlockDefinition,
  type BlueprintDocument,
  type OwnerReference,
} from '@kumwe/studio-protocol';
import {
  ContributionRuntime,
  StudioCommandError,
  StudioContributionError,
  validateBlueprint,
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
      { nodeId: 'node-a', type: 'org.example/hero', version: '1.0.0' },
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
