import { describe, expect, it } from 'vitest';
import { Ajv2020 } from 'ajv/dist/2020.js';
import {
  protocolSchemas,
  STUDIO_CONTRACT_VERSION,
  type DesignVocabulary,
  type MigrationDeclaration,
  type PluginManifest,
  type ThemeDocument,
} from '../src/index.js';

const ajv = new Ajv2020({ allErrors: true, strict: true });
for (const schema of protocolSchemas) {
  ajv.addSchema(schema);
}

describe('artifact type projections', () => {
  it('accepts a canonical plugin manifest at compile time and schema level', () => {
    const manifest: PluginManifest = {
      activation: 'declarative',
      contractVersion: STUDIO_CONTRACT_VERSION,
      contributions: [
        {
          id: 'org.example.blocks/hero',
          integrity: 'sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=',
          kind: 'block',
          resource: 'contributions/hero.block.json',
          version: '1.0.0',
        },
      ],
      dependencies: [{ id: 'org.example/base', optional: true, versions: '>=1 <2' }],
      entryModules: [],
      id: 'org.example/starter',
      kind: 'plugin-manifest',
      label: { defaultMessage: 'Starter blocks', key: 'org.example/starter' },
      locales: ['en'],
      optionalCapabilities: [{ id: 'studio.capability/preview', versions: '>=0.1 <1' }],
      owner: { id: 'org.example/starter', version: '1.0.0' },
      permissions: ['studio.permission/compose'],
      requiredCapabilities: [{ id: 'studio.capability/blocks', versions: '>=0.1 <1' }],
      version: '1.0.0',
    };
    const validate = ajv.getSchema(
      'https://schemas.kumwe.org/studio/v1/plugin-manifest.schema.json',
    );
    expect(validate).toBeDefined();
    expect(validate?.(manifest), ajv.errorsText(validate?.errors)).toBe(true);
  });

  it('accepts a canonical theme document at compile time and schema level', () => {
    const theme: ThemeDocument = {
      blockSupport: [
        {
          renderer: 'org.example/web-renderer',
          type: 'org.example.blocks/hero',
          versions: '>=1 <2',
        },
      ],
      contractVersion: STUDIO_CONTRACT_VERSION,
      designControls: [
        {
          choices: [
            { id: 'calm', label: { defaultMessage: 'Calm', key: 'org.example/tone-calm' } },
            { id: 'bold', label: { defaultMessage: 'Bold', key: 'org.example/tone-bold' } },
          ],
          id: 'tone',
          kind: 'enum',
          label: { defaultMessage: 'Tone', key: 'org.example/tone' },
        },
      ],
      id: 'themes/aurora',
      kind: 'theme',
      label: { defaultMessage: 'Aurora', key: 'org.example/aurora' },
      owner: { id: 'org.example/aurora', version: '1.0.0' },
      recipes: [
        {
          blockType: 'org.example.blocks/hero',
          designValues: { tone: 'calm' },
          id: 'hero-calm',
          label: { defaultMessage: 'Calm hero', key: 'org.example/hero-calm' },
        },
      ],
      renderers: [
        {
          exactPreview: true,
          id: 'org.example/web-renderer',
          surfaces: ['web', 'preview'],
          version: '1.0.0',
        },
      ],
      revision: 'theme-r1',
      version: '1.0.0',
      viewports: [
        {
          base: true,
          id: 'expanded',
          label: { defaultMessage: 'Expanded', key: 'org.example/expanded' },
          order: 0,
          previewWidth: 1280,
        },
      ],
    };
    const validate = ajv.getSchema('https://schemas.kumwe.org/studio/v1/theme.schema.json');
    expect(validate).toBeDefined();
    expect(validate?.(theme), ajv.errorsText(validate?.errors)).toBe(true);
  });

  it('accepts a canonical design vocabulary at compile time and schema level', () => {
    const vocabulary: DesignVocabulary = {
      contractVersion: STUDIO_CONTRACT_VERSION,
      designControls: [
        {
          choices: [
            { id: 'full', label: { defaultMessage: 'Full', key: 'org.example/width-full' } },
            { id: 'half', label: { defaultMessage: 'Half', key: 'org.example/width-half' } },
          ],
          id: 'card-width',
          kind: 'size-role',
          label: { defaultMessage: 'Card width', key: 'org.example/card-width' },
        },
      ],
      id: 'org.example.blocks/vocabulary',
      kind: 'design-vocabulary',
      label: { defaultMessage: 'Block vocabulary', key: 'org.example/vocabulary' },
      owner: { id: 'org.example/starter', version: '1.0.0' },
      recipes: [
        {
          blockType: 'org.example.blocks/hero',
          designValues: { 'card-width': 'half' },
          id: 'hero-half',
          label: { defaultMessage: 'Half-width hero', key: 'org.example/hero-half' },
        },
      ],
      version: '1.0.0',
    };
    const validate = ajv.getSchema(
      'https://schemas.kumwe.org/studio/v1/design-vocabulary.schema.json',
    );
    expect(validate).toBeDefined();
    expect(validate?.(vocabulary), ajv.errorsText(validate?.errors)).toBe(true);
  });

  it('accepts a canonical migration declaration at compile time and schema level', () => {
    const migration: MigrationDeclaration = {
      artifactKinds: ['blueprint', 'entry'],
      contractVersion: STUDIO_CONTRACT_VERSION,
      id: 'org.example.blocks/hero-to-banner',
      kind: 'migration',
      label: { defaultMessage: 'Hero becomes banner', key: 'org.example/hero-to-banner' },
      lossClassification: 'lossless',
      owner: { id: 'org.example/starter', version: '1.1.0' },
      sourceVersions: '>=1.0.0 <1.1.0',
      targetVersion: '1.1.0',
      version: '1.1.0',
    };
    const validate = ajv.getSchema('https://schemas.kumwe.org/studio/v1/migration.schema.json');
    expect(validate).toBeDefined();
    expect(validate?.(migration), ajv.errorsText(validate?.errors)).toBe(true);
  });
});
