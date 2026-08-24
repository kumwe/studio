import { CORE_LAYOUT_BLOCK_TYPES, CORE_LAYOUT_THEME_CONTROLS } from '@kumwe/studio-core';
import { STUDIO_CONTRACT_VERSION, type ThemeDocument } from '@kumwe/studio-protocol';

const REFERENCE_RENDERER = 'studio.renderer/reference' as const;

/**
 * The theme document the reference host locks in its demo blueprint
 * (`dependencyLock.theme` names the same id/version/revision). It declares
 * the renderer the demo blocks require, the three preview viewports the
 * shell's switcher offers, and the design-control vocabulary the reference
 * renderer projects onto CSS custom properties.
 */
export const referenceTheme: ThemeDocument = {
  blockSupport: [
    ...Object.values(CORE_LAYOUT_BLOCK_TYPES).map((type) => ({
      renderer: REFERENCE_RENDERER,
      type,
      versions: '^1.0.0',
    })),
    { renderer: REFERENCE_RENDERER, type: 'studio.core/text', versions: '^1.0.0' },
  ],
  contractVersion: STUDIO_CONTRACT_VERSION,
  designControls: [
    {
      choices: [
        { id: 'start', label: { defaultMessage: 'Start', key: 'studio.reference/align-start' } },
        { id: 'center', label: { defaultMessage: 'Centre', key: 'studio.reference/align-center' } },
        { id: 'end', label: { defaultMessage: 'End', key: 'studio.reference/align-end' } },
        {
          id: 'stretch',
          label: { defaultMessage: 'Stretch', key: 'studio.reference/align-stretch' },
        },
      ],
      id: CORE_LAYOUT_THEME_CONTROLS.alignment,
      kind: 'enum',
      label: { defaultMessage: 'Layout alignment', key: 'studio.reference/layout-alignment' },
    },
    {
      choices: [
        { id: 'none', label: { defaultMessage: 'None', key: 'studio.reference/spacing-none' } },
        {
          id: 'compact',
          label: { defaultMessage: 'Compact', key: 'studio.reference/spacing-compact' },
        },
        {
          id: 'comfortable',
          label: { defaultMessage: 'Comfortable', key: 'studio.reference/spacing-comfortable' },
        },
        {
          id: 'spacious',
          label: { defaultMessage: 'Spacious', key: 'studio.reference/spacing-spacious' },
        },
      ],
      id: CORE_LAYOUT_THEME_CONTROLS.spacing,
      kind: 'spacing-role',
      label: { defaultMessage: 'Layout spacing', key: 'studio.reference/layout-spacing' },
    },
    {
      choices: [
        { id: 'visible', label: { defaultMessage: 'Visible', key: 'studio.reference/visible' } },
        { id: 'hidden', label: { defaultMessage: 'Hidden', key: 'studio.reference/hidden' } },
      ],
      id: CORE_LAYOUT_THEME_CONTROLS.visibility,
      kind: 'enum',
      label: { defaultMessage: 'Viewport visibility', key: 'studio.reference/visibility' },
    },
    {
      choices: [
        {
          id: 'block',
          label: { defaultMessage: 'Block', key: 'studio.reference/direction-block' },
        },
        {
          id: 'inline',
          label: { defaultMessage: 'Inline', key: 'studio.reference/direction-inline' },
        },
      ],
      id: CORE_LAYOUT_THEME_CONTROLS.direction,
      kind: 'enum',
      label: { defaultMessage: 'Stack direction', key: 'studio.reference/layout-direction' },
    },
    {
      choices: [
        {
          id: 'preserve',
          label: { defaultMessage: 'Preserve', key: 'studio.reference/collapse-preserve' },
        },
        { id: 'wrap', label: { defaultMessage: 'Wrap', key: 'studio.reference/collapse-wrap' } },
        { id: 'stack', label: { defaultMessage: 'Stack', key: 'studio.reference/collapse-stack' } },
      ],
      id: CORE_LAYOUT_THEME_CONTROLS.collapse,
      kind: 'enum',
      label: { defaultMessage: 'Collapse behaviour', key: 'studio.reference/layout-collapse' },
    },
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
    {
      blockType: CORE_LAYOUT_BLOCK_TYPES.grid,
      designValues: { alignment: 'stretch', collapse: 'stack', spacing: 'comfortable' },
      id: 'responsive-grid',
      label: { defaultMessage: 'Responsive grid', key: 'studio.reference/responsive-grid' },
    },
    {
      blockType: CORE_LAYOUT_BLOCK_TYPES.stack,
      designValues: { alignment: 'stretch', direction: 'block', spacing: 'compact' },
      id: 'content-stack',
      label: { defaultMessage: 'Content stack', key: 'studio.reference/content-stack' },
    },
  ],
  renderers: [
    {
      exactPreview: false,
      id: REFERENCE_RENDERER,
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
