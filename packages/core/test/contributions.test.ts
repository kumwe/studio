import { describe, expect, it } from 'vitest';
import { Ajv2020 } from 'ajv/dist/2020.js';
import {
  protocolSchemas,
  STUDIO_CONTRACT_VERSION,
  type AuthoringTargetDeclaration,
  type AuthoringTargetResolveRequest,
  type BlockDefinition,
  type BlueprintDocument,
  type DesignVocabulary,
  type FieldAdapterContribution,
  type InspectorContribution,
  type MigrationDeclaration,
  type OwnerReference,
  type PatternDocument,
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
const CONTEXTUAL_CAPABILITY = {
  id: 'studio.capability/contextual-authoring',
  version: '1.0.0',
} as const;

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

function authoringTarget(
  owner: OwnerReference,
  id: `${string}/${string}`,
  dependencies: AuthoringTargetDeclaration['contributionDependencies'] = [],
): AuthoringTargetDeclaration {
  return {
    contractVersion: STUDIO_CONTRACT_VERSION,
    contributionDependencies: dependencies,
    eligibility: ['create', 'edit'],
    id,
    kind: 'authoring-target',
    label: { defaultMessage: 'Contextual content', key: `${id.replace('/', '.')}/label` },
    modes: ['model', 'blueprint', 'content'],
    owner,
    presentationStates: ['inline', 'maximized', 'fullscreen'],
    requiredCapabilities: [{ id: CONTEXTUAL_CAPABILITY.id, versions: '>=1.0.0 <2.0.0' }],
    resourceTypes: ['org.example/content'],
    saveOutcomes: ['save-item', 'save-new-type-version', 'save-as-new-type'],
    startKinds: ['blank', 'from-type', 'existing'],
    surface: 'org.example/content-editor',
  };
}

function resolveRequest(targetId: `${string}/${string}`): AuthoringTargetResolveRequest {
  return {
    intent: 'edit',
    requestedPresentation: 'inline',
    resourceContext: {
      key: 'contexts/article-42',
      resource: { id: 'articles/42', type: 'org.example/content' },
      scopes: [{ id: 'sites/main', kind: 'org.example/site' }],
      surface: 'org.example/content-editor',
    },
    targetId,
  };
}

function targetPluginDefinition(
  owner: OwnerReference,
  target: AuthoringTargetDeclaration,
  contributions: Partial<StudioPluginDefinition> = {},
): StudioPluginDefinition {
  return {
    ...contributions,
    authoringTargets: [target],
    manifest: {
      activation: 'declarative',
      contractVersion: STUDIO_CONTRACT_VERSION,
      contributions: [
        {
          executable: false,
          id: target.id,
          integrity: 'sha256-gEReHtrWQj4XVxU9b3Yie2ssI8Wsy/nv+rvEe6RcFac=',
          kind: 'authoring-target',
          resource: 'authoring/target.json',
          version: owner.version,
        },
        ...(contributions.manifest?.contributions ?? []),
      ],
      dependencies: [],
      entryModules: [],
      id: owner.id,
      kind: 'plugin-manifest',
      label: {
        defaultMessage: 'Contextual extension',
        key: `${owner.id.replace('/', '.')}/plugin`,
      },
      optionalCapabilities: [],
      owner,
      permissions: [],
      requiredCapabilities: [
        { id: CONTEXTUAL_CAPABILITY.id, versions: '>=1.0.0 <2.0.0' },
        ...(contributions.manifest?.requiredCapabilities ?? []),
      ],
      version: owner.version,
    },
  };
}

const toolkitKinds = [
  'block',
  'design-vocabulary',
  'field-adapter',
  'inspector',
  'migration',
  'pattern',
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
  const owner: OwnerReference = { id: 'org.example/toolkit', version };
  const designVocabulary: DesignVocabulary = {
    contractVersion: STUDIO_CONTRACT_VERSION,
    designControls: [],
    id: 'org.example.toolkit/design-vocabulary',
    kind: 'design-vocabulary',
    label: { defaultMessage: 'Toolkit vocabulary', key: 'org.example.toolkit/vocabulary' },
    owner,
    recipes: [],
    version,
  };
  const fieldAdapter: FieldAdapterContribution = {
    contractVersion: STUDIO_CONTRACT_VERSION,
    control: 'org.example.toolkit/control',
    fieldKinds: ['studio.field/string'],
    id: 'org.example.toolkit/field-adapter',
    kind: 'field-adapter',
    label: { defaultMessage: 'Toolkit field', key: 'org.example.toolkit/field' },
    owner,
    version,
  };
  const inspector: InspectorContribution = {
    blockTypes: ['org.example.toolkit/block'],
    contractVersion: STUDIO_CONTRACT_VERSION,
    id: 'org.example.toolkit/inspector',
    kind: 'inspector',
    label: { defaultMessage: 'Toolkit inspector', key: 'org.example.toolkit/inspector' },
    owner,
    placement: 'augment',
    version,
  };
  const migration: MigrationDeclaration = {
    artifactKinds: ['blueprint'],
    contractVersion: STUDIO_CONTRACT_VERSION,
    id: 'org.example.toolkit/migration',
    kind: 'migration',
    label: { defaultMessage: 'Toolkit migration', key: 'org.example.toolkit/migration' },
    lossClassification: 'lossless',
    owner,
    sourceVersions: '*',
    targetVersion: version,
    version,
  };
  const pattern: PatternDocument = {
    blockDependencies: [],
    contractVersion: STUDIO_CONTRACT_VERSION,
    id: 'org.example.toolkit/pattern',
    kind: 'pattern',
    label: { defaultMessage: 'Toolkit pattern', key: 'org.example.toolkit/pattern' },
    owner,
    revision: `pattern-${version}`,
    roots: [
      {
        authoring: { mode: 'designer' },
        bindings: {},
        id: 'pattern-root',
        properties: {},
        slots: {},
        type: 'org.example.toolkit/block',
        version,
      },
    ],
    version,
  };
  return {
    blocks: [block('org.example.toolkit/block', owner, version)],
    designVocabularies: [designVocabulary],
    fieldAdapters: [fieldAdapter],
    inspectors: [inspector],
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
      owner,
      permissions: [],
      requiredCapabilities: [{ id: 'studio.renderer/test', versions: '^0.1.0' }],
      version,
    },
    migrations: [migration],
    patterns: [pattern],
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

describe('extension-owned contextual target lifecycle', () => {
  it('resolves core and extension targets through the same immutable path', () => {
    const runtime = new ContributionRuntime({ generation: 'gen-0' });
    const coreOwner: OwnerReference = { id: 'studio.core/content', version: '1.0.0' };
    const coreTarget = authoringTarget(coreOwner, 'studio.core/article-content');
    runtime.activate(
      coreOwner,
      { authoringTargets: [coreTarget], blocks: [] },
      {
        generation: 'gen-1',
      },
    );

    const extensionOwner: OwnerReference = { id: 'org.example/contextual', version: '1.0.0' };
    const extensionTarget = authoringTarget(
      extensionOwner,
      'org.example.contextual/article-content',
    );
    activateStudioPlugin(
      runtime,
      defineStudioPlugin(targetPluginDefinition(extensionOwner, extensionTarget)),
      { generation: 'gen-2' },
    );

    expect(runtime.current.authoringTargets().map(({ id }) => id)).toEqual([
      extensionTarget.id,
      coreTarget.id,
    ]);
    for (const target of [coreTarget, extensionTarget]) {
      expect(
        runtime.current.resolveAuthoringTarget(resolveRequest(target.id), {
          capabilities: [CONTEXTUAL_CAPABILITY],
          mode: 'content',
        }),
      ).toEqual({ contributions: [], target });
    }
  });

  it('fails closed on the wrong surface, resource, intent, presentation, mode, or capability', () => {
    const runtime = new ContributionRuntime({ generation: 'gen-0' });
    const owner: OwnerReference = { id: 'org.example/contextual', version: '1.0.0' };
    const target: AuthoringTargetDeclaration = {
      ...authoringTarget(owner, 'org.example.contextual/article-content'),
      modes: ['content'],
    };
    activateStudioPlugin(runtime, defineStudioPlugin(targetPluginDefinition(owner, target)), {
      generation: 'gen-1',
    });
    const request = resolveRequest(target.id);
    const resolve = (
      override: Partial<AuthoringTargetResolveRequest> = {},
      options: Parameters<typeof runtime.current.resolveAuthoringTarget>[1] = {
        capabilities: [CONTEXTUAL_CAPABILITY],
      },
    ) => runtime.current.resolveAuthoringTarget({ ...request, ...override }, options);

    expect(resolve()).toBeDefined();
    expect(resolve({ intent: 'create' })).toBeDefined();
    expect(resolve({ requestedPresentation: 'minimized' })).toBeUndefined();
    expect(
      resolve({
        resourceContext: { ...request.resourceContext, surface: 'org.other/editor' },
      }),
    ).toBeUndefined();
    expect(
      resolve({
        resourceContext: {
          ...request.resourceContext,
          resource: { id: 'articles/42', type: 'org.other/content' },
        },
      }),
    ).toBeUndefined();
    expect(resolve({}, { capabilities: [CONTEXTUAL_CAPABILITY], mode: 'content' })).toBeDefined();
    expect(resolve({}, { capabilities: [CONTEXTUAL_CAPABILITY], mode: 'model' })).toBeUndefined();
    expect(resolve({}, { capabilities: [], mode: 'content' })).toBeUndefined();
    expect(
      resolve(
        {},
        {
          capabilities: [{ ...CONTEXTUAL_CAPABILITY, version: '2.0.0' }],
          mode: 'content',
        },
      ),
    ).toBeUndefined();
  });

  it('admits only explicitly declared dependencies and selects the newest compatible version', () => {
    const runtime = new ContributionRuntime({ generation: 'gen-0' });
    const providerOwner: OwnerReference = { id: 'org.example/controls', version: '1.0.0' };
    const adapter = (version: SemanticVersion): FieldAdapterContribution => ({
      contractVersion: STUDIO_CONTRACT_VERSION,
      control: 'org.example.controls/text-control',
      fieldKinds: ['studio.field/string'],
      id: 'org.example.controls/text',
      kind: 'field-adapter',
      label: { defaultMessage: `Text ${version}`, key: 'org.example.controls/text' },
      owner: providerOwner,
      version,
    });
    runtime.activate(
      providerOwner,
      {
        blocks: [block('org.example.controls/unrelated', providerOwner)],
        fieldAdapters: [adapter('1.0.0'), adapter('1.2.0'), adapter('2.0.0')],
      },
      { generation: 'gen-1' },
    );

    const targetOwner: OwnerReference = { id: 'org.example/contextual', version: '1.0.0' };
    const target = authoringTarget(targetOwner, 'org.example.contextual/article-content', [
      {
        id: 'org.example.controls/text',
        kind: 'field-adapter',
        required: true,
        versions: '^1.0.0',
      },
      {
        id: 'org.example.controls/optional-pattern',
        kind: 'pattern',
        required: false,
        versions: '^1.0.0',
      },
    ]);
    activateStudioPlugin(runtime, defineStudioPlugin(targetPluginDefinition(targetOwner, target)), {
      generation: 'gen-2',
    });

    const resolution = runtime.current.resolveAuthoringTarget(resolveRequest(target.id), {
      capabilities: [CONTEXTUAL_CAPABILITY],
    });
    expect(resolution?.contributions).toEqual([adapter('1.2.0')]);
    expect(resolution?.contributions).not.toContainEqual(
      block('org.example.controls/unrelated', providerOwner),
    );
  });

  it('withdraws targets and required dependencies on disable or revocation without corrupting generations', () => {
    const runtime = new ContributionRuntime({ generation: 'gen-0' });
    const provider = defineStudioPlugin(toolkitDefinition());
    activateStudioPlugin(runtime, provider, { generation: 'gen-1' });

    const targetOwner: OwnerReference = { id: 'org.example/contextual', version: '1.0.0' };
    const target = authoringTarget(targetOwner, 'org.example.contextual/article-content', [
      {
        id: 'org.example.toolkit/field-adapter',
        kind: 'field-adapter',
        required: true,
        versions: '^1.0.0',
      },
    ]);
    const targetDefinition = defineStudioPlugin(targetPluginDefinition(targetOwner, target));
    activateStudioPlugin(runtime, targetDefinition, { generation: 'gen-2' });
    const request = resolveRequest(target.id);
    const options = { capabilities: [CONTEXTUAL_CAPABILITY] } as const;
    const pinned = runtime.current;
    expect(pinned.resolveAuthoringTarget(request, options)).toBeDefined();

    runtime.disable(provider.manifest.owner.id, { generation: 'gen-3' });
    expect(runtime.current.resolveAuthoringTarget(request, options)).toBeUndefined();
    expect(pinned.resolveAuthoringTarget(request, options)).toBeDefined();
    expect(
      runtime.unresolvedReference({
        contribution: 'field-adapter',
        id: 'org.example.toolkit/field-adapter',
        version: '1.0.0',
      }),
    ).toEqual({ owner: provider.manifest.owner, reason: 'owner-disabled' });

    runtime.reactivate(provider.manifest.owner.id, { generation: 'gen-4' });
    expect(runtime.current.resolveAuthoringTarget(request, options)).toBeDefined();
    runtime.revokeTrust(targetOwner.id, { generation: 'gen-5' });
    expect(runtime.current.authoringTargets()).toEqual([]);
    expect(
      runtime.unresolvedReference({
        contribution: 'authoring-target',
        id: target.id,
        version: targetOwner.version,
      }),
    ).toEqual({ owner: targetOwner, reason: 'owner-revoked' });

    activateStudioPlugin(runtime, targetDefinition, { generation: 'gen-6' });
    runtime.uninstall(targetOwner.id, { generation: 'gen-7' });
    expect(runtime.current.authoringTargets()).toEqual([]);
    expect(runtime.inventory()).toContainEqual(
      expect.objectContaining({ owner: targetOwner, state: 'uninstalled-data-preserved' }),
    );
    expect(() => runtime.reactivate(targetOwner.id, { generation: 'gen-8' })).toThrow(
      StudioContributionError,
    );
    expect(
      runtime.unresolvedReference({
        contribution: 'authoring-target',
        id: target.id,
        version: targetOwner.version,
      }),
    ).toEqual({ owner: targetOwner, reason: 'owner-disabled' });
  });

  it('upgrades targets atomically and rejects cross-owner target collisions', () => {
    const runtime = new ContributionRuntime({ generation: 'gen-0' });
    const ownerV1: OwnerReference = { id: 'org.example/contextual', version: '1.0.0' };
    const targetV1 = authoringTarget(ownerV1, 'org.example.contextual/article-content');
    activateStudioPlugin(runtime, defineStudioPlugin(targetPluginDefinition(ownerV1, targetV1)), {
      generation: 'gen-1',
    });

    const otherOwner: OwnerReference = { id: 'org.example/other', version: '1.0.0' };
    const collision = authoringTarget(otherOwner, targetV1.id);
    expect(() =>
      activateStudioPlugin(
        runtime,
        defineStudioPlugin(targetPluginDefinition(otherOwner, collision)),
        { generation: 'gen-2' },
      ),
    ).toThrow(StudioContributionError);
    expect(runtime.current.generation).toBe('gen-1');

    const ownerV2: OwnerReference = { ...ownerV1, version: '2.0.0' };
    const targetV2 = {
      ...authoringTarget(ownerV2, targetV1.id),
      presentationStates: ['inline', 'maximized'] as const,
    };
    activateStudioPlugin(runtime, defineStudioPlugin(targetPluginDefinition(ownerV2, targetV2)), {
      generation: 'gen-2',
    });
    expect(runtime.current.authoringTargets()).toEqual([targetV2]);
    expect(
      runtime.unresolvedReference({
        contribution: 'authoring-target',
        id: targetV1.id,
        version: '1.0.0',
      }),
    ).toEqual({ owner: ownerV2, reason: 'incompatible' });
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
    for (const kind of toolkitKinds) {
      const id = `org.example.toolkit/${kind}`;
      expect(generation.resolveContribution(kind, id, '1.0.0'), kind).toBeDefined();
      expect(generation.contributions(kind), kind).toHaveLength(1);
    }
    const vocabulary = generation.resolveContribution(
      'design-vocabulary',
      'org.example.toolkit/design-vocabulary',
      '1.0.0',
    ) as DesignVocabulary;
    vocabulary.designControls.push({
      choices: [],
      id: 'mutated',
      kind: 'enum',
      label: { key: 'org.example.toolkit/mutated' },
    });
    expect(
      (
        generation.resolveContribution(
          'design-vocabulary',
          'org.example.toolkit/design-vocabulary',
          '1.0.0',
        ) as DesignVocabulary
      ).designControls,
    ).toEqual([]);
    expect(() => generation.registry.register(block('org.example/late', ownerA))).toThrow(
      'immutable',
    );
    expect(unresolvedDeclaredContributions(runtime, [definition], toolkitReferences())).toEqual([]);
    expect(runtime.inventory()).toEqual([expect.objectContaining({ state: 'active' }) as object]);
  });

  it('keeps contribution identity kind-scoped', () => {
    const runtime = new ContributionRuntime({ generation: 'gen-0' });
    const definition = toolkitDefinition();
    const vocabulary = definition.designVocabularies?.[0];
    const pattern = definition.patterns?.[0];
    if (vocabulary === undefined || pattern === undefined) {
      throw new Error('fixture requires vocabulary and pattern payloads');
    }
    vocabulary.id = 'org.example.toolkit/shared';
    pattern.id = 'org.example.toolkit/shared';
    for (const declaration of definition.manifest.contributions) {
      if (declaration.kind === 'design-vocabulary' || declaration.kind === 'pattern') {
        declaration.id = 'org.example.toolkit/shared';
      }
    }
    const generation = activateStudioPlugin(runtime, defineStudioPlugin(definition), {
      generation: 'gen-1',
    });
    expect(
      generation.resolveContribution('design-vocabulary', 'org.example.toolkit/shared', '1.0.0'),
    ).toMatchObject({ kind: 'design-vocabulary' });
    expect(
      generation.resolveContribution('pattern', 'org.example.toolkit/shared', '1.0.0'),
    ).toMatchObject({ kind: 'pattern' });
    expect(
      runtime.unresolvedReference({
        contribution: 'field-adapter',
        id: 'org.example.toolkit/shared',
        version: '1.0.0',
      }),
    ).toEqual({ reason: 'not-installed' });
  });

  it('rejects a malformed non-block payload atomically', () => {
    const runtime = new ContributionRuntime({ generation: 'gen-0' });
    const active = defineStudioPlugin(toolkitDefinition());
    activateStudioPlugin(runtime, active, { generation: 'gen-1' });
    const before = runtime.current;
    const malformed = toolkitDefinition('2.0.0');
    const adapter = malformed.fieldAdapters?.[0];
    if (adapter === undefined) {
      throw new Error('fixture requires a field adapter');
    }
    adapter.fieldKinds = [];
    try {
      activateStudioPlugin(runtime, malformed, { generation: 'gen-2' });
      throw new Error('Expected malformed activation to fail.');
    } catch (error) {
      expect(error).toBeInstanceOf(StudioContributionError);
      if (error instanceof StudioContributionError) {
        expect(error.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
          'studio.contribution/invalid-definition',
        );
      }
    }
    expect(runtime.current).toBe(before);
    expect(
      runtime.current.resolveContribution(
        'field-adapter',
        'org.example.toolkit/field-adapter',
        '1.0.0',
      ),
    ).toBeDefined();
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

  it('uninstall removes all six kinds while retaining owner identity for diagnosis and migration', () => {
    const runtime = new ContributionRuntime({ generation: 'gen-0' });
    const definition = defineStudioPlugin(toolkitDefinition());
    activateStudioPlugin(runtime, definition, { generation: 'gen-1' });

    runtime.uninstall(definition.manifest.owner.id, { generation: 'gen-2' });
    expect(runtime.current.owners()).toEqual([]);
    expect(runtime.inventory()).toEqual([
      expect.objectContaining({
        owner: definition.manifest.owner,
        state: 'uninstalled-data-preserved',
      }),
    ]);
    const unresolved = unresolvedDeclaredContributions(runtime, [definition], toolkitReferences());
    expect(unresolved.map((entry) => [entry.reference.contribution, entry.reason])).toEqual(
      toolkitKinds.map((kind) => [kind, 'owner-disabled']),
    );
    expect(() => runtime.reactivate(definition.manifest.owner.id, { generation: 'gen-3' })).toThrow(
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
