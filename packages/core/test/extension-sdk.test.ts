import { describe, expect, it } from 'vitest';
import {
  STUDIO_CONTRACT_VERSION,
  type BlockDefinition,
  type OwnerReference,
  type PluginContributionDeclaration,
  type PluginContributionKind,
  type PluginManifest,
  type QualifiedName,
} from '@kumwe/studio-protocol';
import {
  activateStudioPlugin,
  ContributionRuntime,
  defineStudioPlugin,
  StudioContributionError,
  type StudioPluginDefinition,
} from '../src/index.js';

const INTEGRITY = 'sha256-gEReHtrWQj4XVxU9b3Yie2ssI8Wsy/nv+rvEe6RcFac=';
const RENDERER_CAPABILITY = { id: 'studio.renderer/test', versions: '^0.1.0' } as const;

const kitOwner: OwnerReference = { id: 'org.example/kit', version: '1.0.0' };

function manifest(overrides: Partial<PluginManifest> = {}): PluginManifest {
  return {
    activation: 'declarative',
    contractVersion: STUDIO_CONTRACT_VERSION,
    contributions: [],
    dependencies: [],
    entryModules: [],
    id: 'org.example/kit',
    kind: 'plugin-manifest',
    label: { defaultMessage: 'Example kit', key: 'org.example.kit/plugin' },
    optionalCapabilities: [],
    owner: kitOwner,
    permissions: [],
    requiredCapabilities: [],
    version: '1.0.0',
    ...overrides,
  };
}

function declaration(
  kind: PluginContributionKind,
  id: QualifiedName,
  version = '1.0.0',
  executable = false,
): PluginContributionDeclaration {
  return {
    executable,
    id,
    integrity: INTEGRITY,
    kind,
    resource: `contributions/${kind}.json`,
    version,
  };
}

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

function heroDefinition(): StudioPluginDefinition {
  return {
    blocks: [block('org.example/hero', kitOwner)],
    manifest: manifest({
      contributions: [declaration('block', 'org.example/hero')],
      requiredCapabilities: [RENDERER_CAPABILITY],
    }),
  };
}

function diagnosticsOf(action: () => unknown): { codes: string[]; error: StudioContributionError } {
  try {
    action();
  } catch (error) {
    if (error instanceof StudioContributionError) {
      return { codes: error.diagnostics.map((diagnostic) => diagnostic.code), error };
    }
    throw error;
  }
  throw new Error('Expected the definition to be rejected.');
}

describe('defineStudioPlugin', () => {
  it('returns the same definition deep-frozen after validation', () => {
    const definition = heroDefinition();
    const result = defineStudioPlugin(definition);
    expect(result).toBe(definition);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.manifest)).toBe(true);
    expect(Object.isFrozen(result.manifest.contributions[0])).toBe(true);
    expect(Object.isFrozen(result.blocks?.[0]?.propertySchema)).toBe(true);
    expect(() => {
      (result.manifest as { version: string }).version = '9.9.9';
    }).toThrow(TypeError);
  });

  it('accepts contribution ids in dotted sub-namespaces of the plugin namespace', () => {
    const definition = defineStudioPlugin({
      manifest: manifest({
        contributions: [declaration('field-adapter', 'org.example.kit.fields/slider')],
      }),
    });
    expect(definition.manifest.contributions).toHaveLength(1);
  });

  it('rejects a manifest that fails the canonical plugin-manifest schema', () => {
    const withTypo = { ...manifest(), studioVersions: '^1.0.0' } as PluginManifest;
    const typo = diagnosticsOf(() => defineStudioPlugin({ manifest: withTypo }));
    expect(typo.codes).toContain('studio.contribution/invalid-manifest');
    expect(typo.error.diagnostics.every((entry) => entry.severity === 'blocking')).toBe(true);

    const unqualified = diagnosticsOf(() =>
      defineStudioPlugin({ manifest: manifest({ id: 'Not.Canonical/Kit' }) }),
    );
    expect(unqualified.codes).toContain('studio.contribution/invalid-manifest');
  });

  it('rejects contribution ids outside the plugin namespace', () => {
    const foreign = diagnosticsOf(() =>
      defineStudioPlugin({
        manifest: manifest({ contributions: [declaration('pattern', 'org.other/card')] }),
      }),
    );
    expect(foreign.codes).toEqual(['studio.contribution/foreign-namespace']);

    const sibling = diagnosticsOf(() =>
      defineStudioPlugin({
        manifest: manifest({ contributions: [declaration('pattern', 'org.example-extra/card')] }),
      }),
    );
    expect(sibling.codes).toEqual(['studio.contribution/foreign-namespace']);
  });

  it('rejects duplicate declarations while allowing multi-version declarations', () => {
    const duplicate = diagnosticsOf(() =>
      defineStudioPlugin({
        manifest: manifest({
          contributions: [
            declaration('field-adapter', 'org.example/slider'),
            declaration('field-adapter', 'org.example/slider'),
          ],
        }),
      }),
    );
    expect(duplicate.codes).toEqual(['studio.contribution/duplicate-contribution']);

    const multiVersion = defineStudioPlugin({
      manifest: manifest({
        contributions: [
          declaration('field-adapter', 'org.example/slider', '1.0.0'),
          declaration('field-adapter', 'org.example/slider', '2.0.0'),
        ],
      }),
    });
    expect(multiVersion.manifest.contributions).toHaveLength(2);
  });

  it('rejects bundled blocks the manifest does not declare', () => {
    const undeclared = diagnosticsOf(() =>
      defineStudioPlugin({
        blocks: [block('org.example/hero', kitOwner)],
        manifest: manifest({ requiredCapabilities: [RENDERER_CAPABILITY] }),
      }),
    );
    expect(undeclared.codes).toEqual(['studio.contribution/undeclared-registration']);
  });

  it('rejects renderer capability requirements absent from the manifest', () => {
    const missing = diagnosticsOf(() =>
      defineStudioPlugin({
        blocks: [block('org.example/hero', kitOwner)],
        manifest: manifest({ contributions: [declaration('block', 'org.example/hero')] }),
      }),
    );
    expect(missing.codes).toEqual(['studio.contribution/undeclared-capability']);

    const optional = defineStudioPlugin({
      blocks: [block('org.example/hero', kitOwner)],
      manifest: manifest({
        contributions: [declaration('block', 'org.example/hero')],
        optionalCapabilities: [RENDERER_CAPABILITY],
      }),
    });
    expect(optional.blocks).toHaveLength(1);
  });

  it('rejects executable declarations under declarative activation', () => {
    const declarative = diagnosticsOf(() =>
      defineStudioPlugin({
        manifest: manifest({
          contributions: [declaration('inspector', 'org.example/inspector', '1.0.0', true)],
        }),
      }),
    );
    expect(declarative.codes).toEqual(['studio.contribution/undeclared-executable']);

    const executable = defineStudioPlugin({
      manifest: manifest({
        activation: 'executable',
        contributions: [declaration('inspector', 'org.example/inspector', '1.0.0', true)],
      }),
    });
    expect(executable.manifest.activation).toBe('executable');
  });

  it('mirrors the runtime activation rules and error shape exactly', () => {
    const impostorBlocks = [
      block('org.example/hero', { id: 'org.impostor/blocks', version: '9.9.9' }),
    ];
    const definition: StudioPluginDefinition = {
      blocks: impostorBlocks,
      manifest: manifest({
        contributions: [declaration('block', 'org.example/hero')],
        requiredCapabilities: [RENDERER_CAPABILITY],
      }),
    };
    const sdk = diagnosticsOf(() => defineStudioPlugin(definition));

    const runtime = new ContributionRuntime({ generation: 'gen-0' });
    const direct = diagnosticsOf(() =>
      runtime.activate(kitOwner, { blocks: [...impostorBlocks] }, { generation: 'gen-1' }),
    );
    expect(sdk.error.message).toBe(direct.error.message);
    expect(sdk.error.diagnostics).toEqual(direct.error.diagnostics);
  });

  it('front-loads the runtime property-schema profile through the dry-run', () => {
    const invalid = diagnosticsOf(() =>
      defineStudioPlugin({
        blocks: [
          {
            ...block('org.example/hero', kitOwner),
            propertySchema: { patternProperties: {}, type: 'object' },
          },
        ],
        manifest: manifest({
          contributions: [declaration('block', 'org.example/hero')],
          requiredCapabilities: [RENDERER_CAPABILITY],
        }),
      }),
    );
    expect(invalid.codes).toEqual(['studio.contribution/invalid-definition']);
  });
});

describe('activateStudioPlugin', () => {
  it('activates a coherent definition into a new generation', () => {
    const runtime = new ContributionRuntime({ generation: 'gen-0' });
    const generation = activateStudioPlugin(runtime, defineStudioPlugin(heroDefinition()), {
      generation: 'gen-1',
    });
    expect(generation.generation).toBe('gen-1');
    expect(generation.resolveBlock('org.example/hero', '1.0.0')).toBeDefined();
    expect(generation.owners()).toEqual([kitOwner]);
  });

  it('fails closed before the runtime transaction on manifest-level violations', () => {
    const runtime = new ContributionRuntime({ generation: 'gen-0' });
    activateStudioPlugin(runtime, defineStudioPlugin(heroDefinition()), { generation: 'gen-1' });
    expect(() =>
      activateStudioPlugin(
        runtime,
        {
          manifest: manifest({
            contributions: [declaration('pattern', 'org.example.kit/card')],
            id: 'org.other/tools',
            owner: { id: 'org.other/tools', version: '1.0.0' },
          }),
        },
        { generation: 'gen-2' },
      ),
    ).toThrow(StudioContributionError);
    expect(runtime.current.generation).toBe('gen-1');
    expect(runtime.inventory()).toHaveLength(1);
  });

  it('leaves block-level rejection behavior to the runtime unchanged', () => {
    const runtime = new ContributionRuntime({ generation: 'gen-0' });
    const definition: StudioPluginDefinition = {
      blocks: [block('org.example/hero', kitOwner), block('org.example/hero', kitOwner)],
      manifest: manifest({
        contributions: [declaration('block', 'org.example/hero')],
        requiredCapabilities: [RENDERER_CAPABILITY],
      }),
    };
    expect(() => activateStudioPlugin(runtime, definition, { generation: 'gen-1' })).toThrow(
      StudioContributionError,
    );
    expect(runtime.current.generation).toBe('gen-0');
    expect(runtime.inventory()).toEqual([expect.objectContaining({ state: 'rejected' }) as object]);
  });
});
