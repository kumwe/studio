import {
  STUDIO_CONTRACT_VERSION,
  type BlockDefinition,
  type BlockSlotDefinition,
  type BlockType,
  type BlueprintNode,
  type JsonObject,
  type JsonSchema,
  type LocalName,
  type RendererRequirement,
  type ThemeDocument,
  type ThemeViewport,
} from '@kumwe/studio-protocol';
import { cloneContractValue } from './clone.js';

/** The portable layout block family shipped by Studio. */
export const CORE_LAYOUT_BLOCK_TYPES: Readonly<{
  columns: 'studio.core/columns';
  grid: 'studio.core/grid';
  section: 'studio.core/section';
  stack: 'studio.core/stack';
}> = Object.freeze({
  columns: 'studio.core/columns',
  grid: 'studio.core/grid',
  section: 'studio.core/section',
  stack: 'studio.core/stack',
});

export type CoreLayoutBlockType =
  (typeof CORE_LAYOUT_BLOCK_TYPES)[keyof typeof CORE_LAYOUT_BLOCK_TYPES];

/** Canonical theme-control identifiers understood by every core layout block. */
export const CORE_LAYOUT_THEME_CONTROLS: Readonly<{
  alignment: 'layout-alignment';
  collapse: 'layout-collapse';
  direction: 'layout-direction';
  spacing: 'layout-spacing';
  visibility: 'layout-visibility';
}> = Object.freeze({
  alignment: 'layout-alignment',
  collapse: 'layout-collapse',
  direction: 'layout-direction',
  spacing: 'layout-spacing',
  visibility: 'layout-visibility',
});

export type CoreLayoutAlignment = 'center' | 'end' | 'start' | 'stretch';
export type CoreLayoutCollapse = 'preserve' | 'stack' | 'wrap';
export type CoreLayoutDirection = 'block' | 'inline';
export type CoreLayoutSpacing = 'comfortable' | 'compact' | 'none' | 'spacious';
export type CoreLayoutVisibility = 'hidden' | 'visible';

export interface CoreLayoutBlockDefinitionOptions {
  /** Additional host block types admitted into every composable layout slot. */
  acceptedChildTypes?: readonly BlockType[];
  /** Trusted renderer capabilities required for this definition family. */
  rendererRequirements?: readonly RendererRequirement[];
}

export interface CoreLayoutPropertyResolution<T> {
  source: 'base' | 'default' | 'viewport';
  value: T;
  viewport?: LocalName;
}

export interface CoreLayoutIntent {
  alignment: CoreLayoutPropertyResolution<CoreLayoutAlignment>;
  collapse?: CoreLayoutPropertyResolution<CoreLayoutCollapse>;
  columns?: CoreLayoutPropertyResolution<number>;
  direction?: CoreLayoutPropertyResolution<CoreLayoutDirection>;
  spacing: CoreLayoutPropertyResolution<CoreLayoutSpacing>;
  visibility: CoreLayoutPropertyResolution<CoreLayoutVisibility>;
}

export type CoreLayoutErrorCode =
  | 'invalid-layout-property'
  | 'theme-choice-missing'
  | 'theme-control-missing'
  | 'unsupported-layout-block'
  | 'viewport-missing';

/** Stable fail-closed error for renderer and authoring layout resolution. */
export class CoreLayoutError extends Error {
  public readonly code: CoreLayoutErrorCode;

  public constructor(code: CoreLayoutErrorCode, message: string) {
    super(message);
    this.name = 'CoreLayoutError';
    this.code = code;
  }
}

const DEFAULT_RENDERER_REQUIREMENTS: readonly RendererRequirement[] = Object.freeze([
  { capability: 'studio.renderer/layout', surface: 'preview', versions: '^1.0.0' },
  { capability: 'studio.renderer/layout', surface: 'web', versions: '^1.0.0' },
]);

const ALIGNMENTS: readonly CoreLayoutAlignment[] = ['center', 'end', 'start', 'stretch'];
const COLLAPSE_BEHAVIOURS: readonly CoreLayoutCollapse[] = ['preserve', 'stack', 'wrap'];
const DIRECTIONS: readonly CoreLayoutDirection[] = ['block', 'inline'];
const SPACING_ROLES: readonly CoreLayoutSpacing[] = ['comfortable', 'compact', 'none', 'spacious'];
const VISIBILITY_ROLES: readonly CoreLayoutVisibility[] = ['hidden', 'visible'];

/** True only for the four canonical Studio layout block types. */
export function isCoreLayoutBlockType(type: BlockType): type is CoreLayoutBlockType {
  return (Object.values(CORE_LAYOUT_BLOCK_TYPES) as BlockType[]).includes(type);
}

/**
 * Creates the canonical section, stack, grid, and columns definitions. The
 * family owns its bounded semantic properties while the host explicitly adds
 * content block types and trusted renderer capabilities; no wildcard slot or
 * renderer authority is invented.
 */
export function createCoreLayoutBlockDefinitions(
  options: Readonly<CoreLayoutBlockDefinitionOptions> = {},
): BlockDefinition[] {
  const acceptedTypes = stableUniqueBlockTypes([
    ...Object.values(CORE_LAYOUT_BLOCK_TYPES),
    ...(options.acceptedChildTypes ?? []),
  ]);
  const rendererRequirements = cloneContractValue(
    options.rendererRequirements ?? DEFAULT_RENDERER_REQUIREMENTS,
  );
  if (rendererRequirements.length === 0) {
    throw new RangeError('Core layout blocks require at least one trusted renderer capability.');
  }

  return [
    definition('section', acceptedTypes, rendererRequirements),
    definition('stack', acceptedTypes, rendererRequirements),
    definition('grid', acceptedTypes, rendererRequirements),
    definition('columns', acceptedTypes, rendererRequirements),
  ];
}

/** Minimal persisted properties for a newly inserted core layout node. */
export function coreLayoutInitialProperties(type: CoreLayoutBlockType): JsonObject {
  switch (type) {
    case CORE_LAYOUT_BLOCK_TYPES.section:
      return {};
    case CORE_LAYOUT_BLOCK_TYPES.stack:
      return { direction: 'block' };
    case CORE_LAYOUT_BLOCK_TYPES.grid:
    case CORE_LAYOUT_BLOCK_TYPES.columns:
      return { collapse: 'stack', columns: 1 };
  }
}

/**
 * Resolves one layout node for a named theme viewport. Responsive values use
 * the active viewport override when present and otherwise inherit the base
 * value, with defaults remaining runtime semantics rather than stored noise.
 * Every token reference must be declared by the active theme.
 */
export function resolveCoreLayoutIntent(
  node: Readonly<BlueprintNode>,
  viewport: Readonly<ThemeViewport>,
  theme: Readonly<ThemeDocument>,
): CoreLayoutIntent {
  if (!isCoreLayoutBlockType(node.type)) {
    throw new CoreLayoutError(
      'unsupported-layout-block',
      `Block ${node.type} is not a canonical Studio layout block.`,
    );
  }
  if (!theme.viewports.some((candidate) => candidate.id === viewport.id)) {
    throw new CoreLayoutError(
      'viewport-missing',
      `Theme ${theme.id} does not declare viewport ${viewport.id}.`,
    );
  }

  const alignment = tokenProperty(
    node,
    viewport,
    theme,
    'alignment',
    CORE_LAYOUT_THEME_CONTROLS.alignment,
    ALIGNMENTS,
    'stretch',
  );
  const spacing = tokenProperty(
    node,
    viewport,
    theme,
    'spacing',
    CORE_LAYOUT_THEME_CONTROLS.spacing,
    SPACING_ROLES,
    'comfortable',
  );
  const visibility = tokenProperty(
    node,
    viewport,
    theme,
    'visibility',
    CORE_LAYOUT_THEME_CONTROLS.visibility,
    VISIBILITY_ROLES,
    'visible',
  );
  const resolved: CoreLayoutIntent = { alignment, spacing, visibility };

  if (node.type === CORE_LAYOUT_BLOCK_TYPES.stack) {
    resolved.direction = tokenProperty(
      node,
      viewport,
      theme,
      'direction',
      CORE_LAYOUT_THEME_CONTROLS.direction,
      DIRECTIONS,
      'block',
    );
  }
  if (node.type === CORE_LAYOUT_BLOCK_TYPES.grid || node.type === CORE_LAYOUT_BLOCK_TYPES.columns) {
    resolved.collapse = tokenProperty(
      node,
      viewport,
      theme,
      'collapse',
      CORE_LAYOUT_THEME_CONTROLS.collapse,
      COLLAPSE_BEHAVIOURS,
      'stack',
    );
    resolved.columns = numericProperty(node, viewport, 'columns', 1, 12, 1);
  }
  return resolved;
}

function definition(
  name: keyof typeof CORE_LAYOUT_BLOCK_TYPES,
  acceptedTypes: BlockType[],
  rendererRequirements: readonly RendererRequirement[],
): BlockDefinition {
  const type = CORE_LAYOUT_BLOCK_TYPES[name];
  const title = `${name.charAt(0).toUpperCase()}${name.slice(1)}`;
  const themeControls: LocalName[] = [
    CORE_LAYOUT_THEME_CONTROLS.alignment,
    CORE_LAYOUT_THEME_CONTROLS.spacing,
    CORE_LAYOUT_THEME_CONTROLS.visibility,
  ];
  if (name === 'stack') {
    themeControls.push(CORE_LAYOUT_THEME_CONTROLS.direction);
  }
  if (name === 'grid' || name === 'columns') {
    themeControls.push(CORE_LAYOUT_THEME_CONTROLS.collapse);
  }
  return {
    accessibility: {
      accessibleName: name === 'section' ? 'derived' : 'not-applicable',
      category: name === 'section' ? 'landmark' : 'structural',
      keyboard: {
        defaultMessage: 'Use the outline commands to insert, move, and reorder layout children.',
        key: 'studio.blocks/layout-keyboard',
      },
      outputChecks: ['studio.check/reading-order', 'studio.check/reflow'],
      reducedMotion: 'not-applicable',
    },
    category: 'studio.category/layout',
    contractVersion: STUDIO_CONTRACT_VERSION,
    editingModes: ['blueprint', 'content'],
    icon: { kind: 'symbol', value: name },
    kind: 'block-definition',
    label: { defaultMessage: title, key: `studio.blocks/${name}` },
    owner: { id: 'studio.core/blocks', version: '1.0.0' },
    ports: [],
    propertyControls: themeControls.map((control) => ({
      control: `studio.control/${control}`,
      property: propertyForControl(control),
    })),
    propertySchema: propertySchema(name),
    rendererRequirements: cloneContractValue([...rendererRequirements]),
    revision: `layout-${name}-r1`,
    slots: [layoutSlot(name, acceptedTypes)],
    themeControls,
    type,
    version: '1.0.0',
  };
}

function layoutSlot(
  name: keyof typeof CORE_LAYOUT_BLOCK_TYPES,
  acceptedTypes: BlockType[],
): BlockSlotDefinition {
  const id = name === 'section' ? 'content' : 'items';
  return {
    accepts: { types: cloneContractValue(acceptedTypes) },
    id,
    label: {
      defaultMessage: name === 'section' ? 'Content' : 'Items',
      key: name === 'section' ? 'studio.blocks/section-content' : 'studio.blocks/layout-items',
    },
    maximum: 100,
    minimum: 0,
    ordered: true,
  };
}

function propertySchema(name: keyof typeof CORE_LAYOUT_BLOCK_TYPES): JsonSchema {
  const properties: Record<string, JsonSchema> = {
    alignment: { enum: [...ALIGNMENTS] },
    spacing: { enum: [...SPACING_ROLES] },
    visibility: { enum: [...VISIBILITY_ROLES] },
  };
  if (name === 'stack') {
    properties.direction = { enum: [...DIRECTIONS] };
  }
  if (name === 'grid' || name === 'columns') {
    properties.collapse = { enum: [...COLLAPSE_BEHAVIOURS] };
    properties.columns = { maximum: 12, minimum: 1, type: 'integer' };
  }
  return { additionalProperties: false, properties, type: 'object' };
}

function propertyForControl(control: LocalName): LocalName {
  switch (control) {
    case CORE_LAYOUT_THEME_CONTROLS.alignment:
      return 'alignment';
    case CORE_LAYOUT_THEME_CONTROLS.collapse:
      return 'collapse';
    case CORE_LAYOUT_THEME_CONTROLS.direction:
      return 'direction';
    case CORE_LAYOUT_THEME_CONTROLS.spacing:
      return 'spacing';
    case CORE_LAYOUT_THEME_CONTROLS.visibility:
      return 'visibility';
    default:
      throw new RangeError(`Unknown core layout control ${control}.`);
  }
}

function stableUniqueBlockTypes(values: readonly BlockType[]): BlockType[] {
  const unique = [...new Set(values)];
  unique.sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  if (unique.length === 0) {
    throw new RangeError('A core layout slot requires at least one accepted block type.');
  }
  return unique;
}

function responsiveValue(
  node: Readonly<BlueprintNode>,
  viewport: Readonly<ThemeViewport>,
  property: LocalName,
): { source: 'base' | 'default' | 'viewport'; value: unknown; viewport?: LocalName } {
  const override = node.responsive?.[property]?.[viewport.id];
  if (override !== undefined) {
    return { source: 'viewport', value: override, viewport: viewport.id };
  }
  const base = node.properties[property];
  return base === undefined
    ? { source: 'default', value: undefined }
    : { source: 'base', value: base };
}

function tokenProperty<T extends string>(
  node: Readonly<BlueprintNode>,
  viewport: Readonly<ThemeViewport>,
  theme: Readonly<ThemeDocument>,
  property: LocalName,
  controlId: LocalName,
  vocabulary: readonly T[],
  fallback: T,
): CoreLayoutPropertyResolution<T> {
  const effective = responsiveValue(node, viewport, property);
  const value = effective.value ?? fallback;
  if (typeof value !== 'string' || !vocabulary.includes(value as T)) {
    throw new CoreLayoutError(
      'invalid-layout-property',
      `Property ${property} on node ${node.id} is not a supported layout token.`,
    );
  }
  const control = theme.designControls.find((candidate) => candidate.id === controlId);
  if (control === undefined) {
    throw new CoreLayoutError(
      'theme-control-missing',
      `Theme ${theme.id} does not declare required layout control ${controlId}.`,
    );
  }
  if (!control.choices.some((choice) => choice.id === value)) {
    throw new CoreLayoutError(
      'theme-choice-missing',
      `Theme ${theme.id} does not declare ${value} for layout control ${controlId}.`,
    );
  }
  return {
    source: effective.source,
    value: value as T,
    ...(effective.viewport === undefined ? {} : { viewport: effective.viewport }),
  };
}

function numericProperty(
  node: Readonly<BlueprintNode>,
  viewport: Readonly<ThemeViewport>,
  property: LocalName,
  minimum: number,
  maximum: number,
  fallback: number,
): CoreLayoutPropertyResolution<number> {
  const effective = responsiveValue(node, viewport, property);
  const value = effective.value ?? fallback;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < minimum || value > maximum) {
    throw new CoreLayoutError(
      'invalid-layout-property',
      `Property ${property} on node ${node.id} must be an integer from ${minimum} through ${maximum}.`,
    );
  }
  return {
    source: effective.source,
    value,
    ...(effective.viewport === undefined ? {} : { viewport: effective.viewport }),
  };
}
