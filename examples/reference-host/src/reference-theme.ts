import { STUDIO_CONTRACT_VERSION, type ThemeDocument } from '@kumwe/studio-protocol';

/**
 * The theme document the reference host locks in its demo blueprint
 * (`dependencyLock.theme` names the same id/version/revision). It declares
 * the renderer the demo blocks require, the three preview viewports the
 * shell's switcher offers, and the design-control vocabulary the reference
 * renderer projects onto CSS custom properties.
 */
export const referenceTheme: ThemeDocument = {
  blockSupport: [
    { renderer: 'studio.renderer/reference', type: 'studio.core/section', versions: '^1.0.0' },
    { renderer: 'studio.renderer/reference', type: 'studio.core/text', versions: '^1.0.0' },
  ],
  contractVersion: STUDIO_CONTRACT_VERSION,
  designControls: [
    {
      choices: [
        { id: 'cozy', label: { defaultMessage: 'Cozy', key: 'studio.reference/gap-cozy' } },
        { id: 'roomy', label: { defaultMessage: 'Roomy', key: 'studio.reference/gap-roomy' } },
      ],
      id: 'block-gap',
      kind: 'spacing-role',
      label: { defaultMessage: 'Block gap', key: 'studio.reference/block-gap' },
    },
    {
      choices: [
        { id: 'paper', label: { defaultMessage: 'Paper', key: 'studio.reference/tone-paper' } },
        { id: 'tinted', label: { defaultMessage: 'Tinted', key: 'studio.reference/tone-tinted' } },
      ],
      id: 'surface-tone',
      kind: 'color-role',
      label: { defaultMessage: 'Surface tone', key: 'studio.reference/surface-tone' },
    },
    {
      choices: [
        {
          id: 'regular',
          label: { defaultMessage: 'Regular', key: 'studio.reference/heading-regular' },
        },
        {
          id: 'display',
          label: { defaultMessage: 'Display', key: 'studio.reference/heading-display' },
        },
      ],
      id: 'heading-scale',
      kind: 'typography-role',
      label: { defaultMessage: 'Heading scale', key: 'studio.reference/heading-scale' },
    },
  ],
  id: 'studio.reference/theme',
  kind: 'theme',
  label: { defaultMessage: 'Reference theme', key: 'studio.reference/theme' },
  owner: { id: 'studio.reference/host', version: '0.1.0' },
  recipes: [
    {
      blockType: 'studio.core/section',
      designValues: { 'heading-scale': 'display', 'surface-tone': 'tinted' },
      id: 'section-card',
      label: { defaultMessage: 'Section card', key: 'studio.reference/section-card' },
    },
  ],
  renderers: [
    {
      exactPreview: false,
      id: 'studio.renderer/reference',
      surfaces: ['preview'],
      version: '0.1.0',
    },
  ],
  revision: 'theme-r1',
  version: '1.0.0',
  viewports: [
    {
      base: true,
      id: 'compact',
      label: { defaultMessage: 'Compact', key: 'studio.reference/viewport-compact' },
      order: 0,
      previewWidth: 360,
    },
    {
      base: false,
      id: 'medium',
      label: { defaultMessage: 'Medium', key: 'studio.reference/viewport-medium' },
      order: 1,
      previewWidth: 768,
    },
    {
      base: false,
      id: 'expanded',
      label: { defaultMessage: 'Expanded', key: 'studio.reference/viewport-expanded' },
      order: 2,
      previewWidth: 1440,
    },
  ],
};
