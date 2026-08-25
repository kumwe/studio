import { describe, expect, it } from 'vitest';
import { STUDIO_CONTRACT_VERSION, type BlueprintDocument } from '@kumwe/studio-protocol';
import {
  BlockRegistry,
  CORE_PRODUCTION_BLOCK_TYPES,
  CORE_PRODUCTION_CONTROL_IDS,
  CORE_PRODUCTION_PATTERN_IDS,
  compileStudioPropertySchema,
  coreProductionInitialProperties,
  createCoreProductionBlockDefinitions,
  createCoreProductionPatterns,
  validateBlueprint,
} from '../src/index.js';

describe('production block catalog', () => {
  const definitions = createCoreProductionBlockDefinitions();

  it('ships exactly 30 unique, schema-profile-valid first-party definitions', () => {
    expect(definitions).toHaveLength(30);
    expect(new Set(definitions.map((definition) => definition.type))).toHaveLength(30);
    expect(new Set(Object.values(CORE_PRODUCTION_BLOCK_TYPES))).toHaveLength(30);

    for (const definition of definitions) {
      const validator = compileStudioPropertySchema(definition.propertySchema);
      expect(
        validator.validate(
          coreProductionInitialProperties(
            definition.type as (typeof CORE_PRODUCTION_BLOCK_TYPES)[keyof typeof CORE_PRODUCTION_BLOCK_TYPES],
          ),
        ),
        `${definition.type}: ${JSON.stringify(validator.errors)}`,
      ).toBe(true);
      expect(definition.rendererRequirements).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ capability: 'studio.renderer/semantic-web', surface: 'web' }),
        ]),
      );
    }
  });

  it('assigns implementation-neutral controls and keeps resource/query ports read-only', () => {
    const ports = definitions.flatMap((definition) => definition.ports);
    const controls = new Set(
      ports.flatMap((port) =>
        port.authoring?.control === undefined ? [] : [port.authoring.control],
      ),
    );

    for (const control of [
      CORE_PRODUCTION_CONTROL_IDS.chart,
      CORE_PRODUCTION_CONTROL_IDS.drawing,
      CORE_PRODUCTION_CONTROL_IDS.mediaCollection,
      CORE_PRODUCTION_CONTROL_IDS.mediaReference,
      CORE_PRODUCTION_CONTROL_IDS.money,
      CORE_PRODUCTION_CONTROL_IDS.richText,
      CORE_PRODUCTION_CONTROL_IDS.source,
    ]) {
      expect(controls.has(control), control).toBe(true);
    }
    expect(
      ports
        .filter((port) => port.valueType === 'resource')
        .every((port) => port.authoring?.readOnly === true && port.authoring.control === undefined),
    ).toBe(true);
    const richTextProfiles = ports
      .filter((port) => port.authoring?.control === CORE_PRODUCTION_CONTROL_IDS.richText)
      .map((port) => port.authoring?.profile);
    expect(richTextProfiles.length).toBeGreaterThan(0);
    expect(new Set(richTextProfiles)).toEqual(new Set(['studio.rich-text/marketing']));
  });

  it('ships ten deterministic patterns whose nodes validate against the catalog', () => {
    const registry = new BlockRegistry(definitions);
    const patterns = createCoreProductionPatterns();
    expect(patterns.map((pattern) => pattern.id)).toEqual([...CORE_PRODUCTION_PATTERN_IDS]);

    for (const pattern of patterns) {
      const document: BlueprintDocument = {
        contractVersion: STUDIO_CONTRACT_VERSION,
        dependencyLock: {
          blocks: pattern.blockDependencies,
          theme: { id: 'studio.theme/reference', revision: 'r1', version: '1.0.0' },
        },
        id: `test/${pattern.id.replace('/', '-')}`,
        kind: 'blueprint',
        label: pattern.label,
        model: { id: 'studio.model/page', revision: 'r1', version: '1.0.0' },
        owner: pattern.owner,
        revision: 'r1',
        roots: pattern.roots,
        status: 'draft',
        version: pattern.version,
      };
      expect(validateBlueprint(document, registry), pattern.id).toEqual({
        diagnostics: [],
        valid: true,
      });
    }
  });

  it('models slideshow as a progressively enhanced gallery presentation', () => {
    const gallery = definitions.find(
      (definition) => definition.type === CORE_PRODUCTION_BLOCK_TYPES.gallery,
    );
    expect(gallery?.propertySchema).toMatchObject({
      properties: { presentation: { enum: ['grid', 'slideshow'] } },
    });
  });

  it('models reusable dialog, popover, and message notice families', () => {
    const byType = new Map(definitions.map((definition) => [definition.type, definition]));
    expect(byType.get(CORE_PRODUCTION_BLOCK_TYPES.dialog)).toMatchObject({
      accessibility: { category: 'interactive' },
      slots: [{ id: 'content' }],
    });
    expect(byType.get(CORE_PRODUCTION_BLOCK_TYPES.popover)).toMatchObject({
      accessibility: { category: 'interactive' },
      slots: [{ id: 'content' }],
    });
    expect(byType.get(CORE_PRODUCTION_BLOCK_TYPES.notice)?.propertySchema).toMatchObject({
      properties: {
        tone: { enum: ['comment', 'error', 'information', 'success', 'warning'] },
      },
    });
    expect(
      byType.get(CORE_PRODUCTION_BLOCK_TYPES.notice)?.ports.find((port) => port.id === 'content')
        ?.authoring,
    ).toMatchObject({ control: CORE_PRODUCTION_CONTROL_IDS.richText });
  });
});
