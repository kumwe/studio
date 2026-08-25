import {
  STUDIO_CONTRACT_VERSION,
  type BindingSource,
  type BlockAccessibilityContract,
  type BlockDefinition,
  type BlockPortDefinition,
  type BlockType,
  type BlueprintNode,
  type FieldBinding,
  type JsonObject,
  type JsonSchema,
  type JsonValue,
  type LocalName,
  type PatternDocument,
  type QualifiedName,
  type RendererRequirement,
} from '@kumwe/studio-protocol';
import { cloneContractValue } from './clone.js';
import {
  CORE_LAYOUT_BLOCK_TYPES,
  coreLayoutInitialProperties,
  createCoreLayoutBlockDefinitions,
  isCoreLayoutBlockType,
} from './layout.js';

/** The host-neutral first-party blocks shipped by every Studio installation. */
export interface CoreProductionBlockTypeMap {
  readonly accordion: 'studio.core/accordion';
  readonly accordionItem: 'studio.core/accordion-item';
  readonly attachment: 'studio.core/attachment';
  readonly audio: 'studio.core/audio';
  readonly callToAction: 'studio.core/call-to-action';
  readonly callout: 'studio.core/callout';
  readonly card: 'studio.core/card';
  readonly chart: 'studio.core/chart';
  readonly code: 'studio.core/code';
  readonly columns: 'studio.core/columns';
  readonly contentCollection: 'studio.core/content-collection';
  readonly contentReference: 'studio.core/content-reference';
  readonly diagram: 'studio.core/diagram';
  readonly dialog: 'studio.core/dialog';
  readonly drawing: 'studio.core/drawing';
  readonly embed: 'studio.core/embed';
  readonly gallery: 'studio.core/gallery';
  readonly grid: 'studio.core/grid';
  readonly heading: 'studio.core/heading';
  readonly image: 'studio.core/image';
  readonly math: 'studio.core/math';
  readonly money: 'studio.core/money';
  readonly notice: 'studio.core/notice';
  readonly popover: 'studio.core/popover';
  readonly richText: 'studio.core/rich-text';
  readonly section: 'studio.core/section';
  readonly stack: 'studio.core/stack';
  readonly tab: 'studio.core/tab';
  readonly tabs: 'studio.core/tabs';
  readonly video: 'studio.core/video';
}

export const CORE_PRODUCTION_BLOCK_TYPES: Readonly<CoreProductionBlockTypeMap> = Object.freeze({
  ...CORE_LAYOUT_BLOCK_TYPES,
  accordion: 'studio.core/accordion',
  accordionItem: 'studio.core/accordion-item',
  attachment: 'studio.core/attachment',
  audio: 'studio.core/audio',
  callToAction: 'studio.core/call-to-action',
  callout: 'studio.core/callout',
  card: 'studio.core/card',
  chart: 'studio.core/chart',
  code: 'studio.core/code',
  contentCollection: 'studio.core/content-collection',
  contentReference: 'studio.core/content-reference',
  diagram: 'studio.core/diagram',
  dialog: 'studio.core/dialog',
  drawing: 'studio.core/drawing',
  embed: 'studio.core/embed',
  gallery: 'studio.core/gallery',
  heading: 'studio.core/heading',
  image: 'studio.core/image',
  math: 'studio.core/math',
  money: 'studio.core/money',
  notice: 'studio.core/notice',
  popover: 'studio.core/popover',
  richText: 'studio.core/rich-text',
  tab: 'studio.core/tab',
  tabs: 'studio.core/tabs',
  video: 'studio.core/video',
});

export type CoreProductionBlockType =
  (typeof CORE_PRODUCTION_BLOCK_TYPES)[keyof typeof CORE_PRODUCTION_BLOCK_TYPES];

/** Stable control identifiers. Hosts register ports; they do not know editor implementations. */
export interface CoreProductionControlIdMap {
  readonly chart: 'studio.control/chart';
  readonly drawing: 'studio.control/drawing';
  readonly mediaCollection: 'studio.control/media-collection';
  readonly mediaReference: 'studio.control/media-reference';
  readonly money: 'studio.control/money';
  readonly richText: 'studio.control/rich-text';
  readonly scopedCss: 'studio.control/scoped-css';
  readonly source: 'studio.control/source';
}

export const CORE_PRODUCTION_CONTROL_IDS: Readonly<CoreProductionControlIdMap> = Object.freeze({
  chart: 'studio.control/chart',
  drawing: 'studio.control/drawing',
  mediaCollection: 'studio.control/media-collection',
  mediaReference: 'studio.control/media-reference',
  money: 'studio.control/money',
  richText: 'studio.control/rich-text',
  scopedCss: 'studio.control/scoped-css',
  source: 'studio.control/source',
});

/** The ten reusable compositions distributed with the production catalog. */
export const CORE_PRODUCTION_PATTERN_IDS: readonly [
  'studio.pattern/article',
  'studio.pattern/collection-index',
  'studio.pattern/document-header',
  'studio.pattern/faq',
  'studio.pattern/feature-grid',
  'studio.pattern/hero',
  'studio.pattern/media-gallery',
  'studio.pattern/pricing',
  'studio.pattern/product',
  'studio.pattern/tabbed-content',
] = Object.freeze([
  'studio.pattern/article',
  'studio.pattern/collection-index',
  'studio.pattern/document-header',
  'studio.pattern/faq',
  'studio.pattern/feature-grid',
  'studio.pattern/hero',
  'studio.pattern/media-gallery',
  'studio.pattern/pricing',
  'studio.pattern/product',
  'studio.pattern/tabbed-content',
]);

const VERSION = '1.0.0';
const OWNER = Object.freeze({ id: 'studio.core/blocks', version: VERSION });
const WEB_RENDERERS: readonly RendererRequirement[] = Object.freeze([
  {
    capability: 'studio.renderer/semantic-web',
    surface: 'preview' as const,
    versions: '^1.0.0',
  },
  {
    capability: 'studio.renderer/semantic-web',
    surface: 'web' as const,
    versions: '^1.0.0',
  },
]);

const ALL_TYPES = Object.freeze(Object.values(CORE_PRODUCTION_BLOCK_TYPES));
const CONTENT_TYPES = Object.freeze(
  ALL_TYPES.filter(
    (type) =>
      type !== CORE_PRODUCTION_BLOCK_TYPES.accordionItem &&
      type !== CORE_PRODUCTION_BLOCK_TYPES.tab,
  ),
);

type DefinitionName = Exclude<
  keyof typeof CORE_PRODUCTION_BLOCK_TYPES,
  keyof typeof CORE_LAYOUT_BLOCK_TYPES
>;

interface ProductionDefinitionSpec {
  accessibility: BlockAccessibilityContract['category'];
  controls?: Readonly<Record<LocalName, QualifiedName>>;
  defaults: JsonObject;
  ports?: readonly BlockPortDefinition[];
  properties?: Readonly<Record<LocalName, JsonSchema>>;
  required?: readonly LocalName[];
  slots?: readonly {
    accepts: readonly BlockType[];
    id: LocalName;
    maximum?: number;
    minimum?: number;
  }[];
}

const textPort = (id: LocalName, required = false): BlockPortDefinition => ({
  authoring: { control: 'studio.control/single-line-text' },
  id,
  label: message(`port-${id}`, title(id)),
  multiple: false,
  required,
  valueType: 'text',
});

const richTextPort = (id = 'content'): BlockPortDefinition => ({
  authoring: { control: CORE_PRODUCTION_CONTROL_IDS.richText, profile: 'studio.rich-text/full' },
  id,
  label: message(`port-${id}`, title(id)),
  multiple: false,
  required: false,
  valueType: 'rich-text',
});

const mediaPort = (id: LocalName, multiple = false): BlockPortDefinition => ({
  authoring: {
    control: multiple
      ? CORE_PRODUCTION_CONTROL_IDS.mediaCollection
      : CORE_PRODUCTION_CONTROL_IDS.mediaReference,
  },
  id,
  label: message(`port-${id}`, title(id)),
  multiple,
  required: false,
  valueType: 'media',
});

const sourcePort = (profile: QualifiedName): BlockPortDefinition => ({
  authoring: { control: CORE_PRODUCTION_CONTROL_IDS.source, profile },
  id: 'source',
  label: message('port-source', 'Source'),
  multiple: false,
  required: true,
  valueType: 'text',
});

const resourcePort = (id: LocalName, multiple: boolean): BlockPortDefinition => ({
  authoring: { readOnly: true },
  id,
  label: message(`port-${id}`, title(id)),
  multiple,
  required: true,
  valueType: 'resource',
});

const stringSchema = (maximum = 20_000): JsonSchema => ({ maxLength: maximum, type: 'string' });
const booleanSchema = (): JsonSchema => ({ type: 'boolean' });
const enumSchema = (...values: string[]): JsonSchema => ({ enum: values });
const integerSchema = (minimum: number, maximum: number): JsonSchema => ({
  maximum,
  minimum,
  type: 'integer',
});

const SPECS: Readonly<Record<DefinitionName, ProductionDefinitionSpec>> = Object.freeze({
  accordion: {
    accessibility: 'composite',
    controls: { allowMultiple: 'studio.control/switch' },
    defaults: { allowMultiple: false },
    properties: { allowMultiple: booleanSchema() },
    slots: [{ accepts: [CORE_PRODUCTION_BLOCK_TYPES.accordionItem], id: 'items', maximum: 50 }],
  },
  accordionItem: {
    accessibility: 'composite',
    controls: { expanded: 'studio.control/switch' },
    defaults: { expanded: false },
    ports: [textPort('title', true)],
    properties: { expanded: booleanSchema() },
    slots: [{ accepts: CONTENT_TYPES, id: 'content', maximum: 100 }],
  },
  attachment: {
    accessibility: 'media',
    controls: { download: 'studio.control/switch' },
    defaults: { download: true },
    ports: [mediaPort('asset'), textPort('label')],
    properties: { download: booleanSchema() },
  },
  audio: {
    accessibility: 'media',
    controls: { autoplay: 'studio.control/switch', controls: 'studio.control/switch' },
    defaults: { autoplay: false, controls: true },
    ports: [mediaPort('asset'), textPort('transcript')],
    properties: { autoplay: booleanSchema(), controls: booleanSchema() },
  },
  callToAction: {
    accessibility: 'interactive',
    controls: { appearance: 'studio.control/select', href: 'studio.control/single-line-text' },
    defaults: { appearance: 'primary', href: '' },
    ports: [textPort('label', true)],
    properties: {
      appearance: enumSchema('primary', 'secondary', 'link'),
      href: stringSchema(2_048),
    },
  },
  callout: {
    accessibility: 'composite',
    controls: { tone: 'studio.control/select' },
    defaults: { tone: 'information' },
    ports: [textPort('title'), richTextPort()],
    properties: { tone: enumSchema('information', 'success', 'warning', 'danger') },
  },
  card: {
    accessibility: 'composite',
    controls: { appearance: 'studio.control/select' },
    defaults: { appearance: 'plain' },
    ports: [mediaPort('media'), textPort('title'), richTextPort('summary')],
    properties: { appearance: enumSchema('plain', 'bordered', 'elevated') },
    slots: [{ accepts: CONTENT_TYPES, id: 'actions', maximum: 5 }],
  },
  chart: {
    accessibility: 'data-display',
    defaults: {},
    ports: [
      {
        authoring: {
          control: CORE_PRODUCTION_CONTROL_IDS.chart,
          profile: 'studio.chart/canonical',
        },
        id: 'chart',
        label: message('port-chart', 'Chart'),
        multiple: false,
        required: true,
        valueType: 'studio.value/chart',
      },
    ],
  },
  code: {
    accessibility: 'text',
    controls: {
      language: 'studio.control/single-line-text',
      showLineNumbers: 'studio.control/switch',
    },
    defaults: { language: 'text', showLineNumbers: false },
    ports: [sourcePort('studio.source/code')],
    properties: { language: stringSchema(100), showLineNumbers: booleanSchema() },
  },
  contentCollection: {
    accessibility: 'data-display',
    controls: { limit: 'studio.control/integer', presentation: 'studio.control/select' },
    defaults: { limit: 12, presentation: 'cards' },
    ports: [resourcePort('items', true)],
    properties: {
      limit: integerSchema(1, 100),
      presentation: enumSchema('cards', 'grid', 'list', 'slideshow'),
    },
  },
  contentReference: {
    accessibility: 'data-display',
    controls: { presentation: 'studio.control/select' },
    defaults: { presentation: 'summary' },
    ports: [resourcePort('item', false)],
    properties: { presentation: enumSchema('full', 'summary', 'title') },
  },
  diagram: {
    accessibility: 'data-display',
    controls: { theme: 'studio.control/select' },
    defaults: { theme: 'neutral' },
    ports: [sourcePort('studio.source/mermaid')],
    properties: { theme: enumSchema('dark', 'forest', 'neutral') },
  },
  dialog: {
    accessibility: 'interactive',
    controls: { modal: 'studio.control/switch' },
    defaults: { modal: true },
    ports: [textPort('triggerLabel', true), textPort('title', true)],
    properties: { modal: booleanSchema() },
    slots: [{ accepts: CONTENT_TYPES, id: 'content', maximum: 100 }],
  },
  drawing: {
    accessibility: 'media',
    defaults: {},
    ports: [
      {
        authoring: {
          control: CORE_PRODUCTION_CONTROL_IDS.drawing,
          profile: 'studio.drawing/canonical',
        },
        id: 'drawing',
        label: message('port-drawing', 'Drawing'),
        multiple: false,
        required: true,
        valueType: 'studio.value/drawing',
      },
    ],
  },
  embed: {
    accessibility: 'media',
    controls: { aspectRatio: 'studio.control/select' },
    defaults: { aspectRatio: '16:9' },
    ports: [resourcePort('resource', false)],
    properties: { aspectRatio: enumSchema('1:1', '4:3', '16:9', '21:9') },
  },
  gallery: {
    accessibility: 'composite',
    controls: {
      autoplay: 'studio.control/switch',
      columns: 'studio.control/integer',
      presentation: 'studio.control/select',
    },
    defaults: { autoplay: false, columns: 4, presentation: 'grid' },
    ports: [mediaPort('items', true)],
    properties: {
      autoplay: booleanSchema(),
      columns: integerSchema(1, 12),
      presentation: enumSchema('grid', 'slideshow'),
    },
  },
  heading: {
    accessibility: 'text',
    controls: { level: 'studio.control/select' },
    defaults: { level: 2 },
    ports: [textPort('text', true)],
    properties: { level: integerSchema(1, 6) },
  },
  image: {
    accessibility: 'media',
    controls: { fit: 'studio.control/select', loading: 'studio.control/select' },
    defaults: { fit: 'cover', loading: 'lazy' },
    ports: [mediaPort('asset')],
    properties: {
      fit: enumSchema('contain', 'cover', 'fill', 'scale-down'),
      loading: enumSchema('eager', 'lazy'),
    },
  },
  math: {
    accessibility: 'text',
    controls: { displayMode: 'studio.control/switch' },
    defaults: { displayMode: true },
    ports: [sourcePort('studio.source/latex')],
    properties: { displayMode: booleanSchema() },
  },
  money: {
    accessibility: 'data-display',
    defaults: {},
    ports: [
      {
        authoring: {
          control: CORE_PRODUCTION_CONTROL_IDS.money,
          profile: 'studio.money/canonical',
        },
        id: 'amount',
        label: message('port-amount', 'Amount'),
        multiple: false,
        required: true,
        valueType: 'money',
      },
    ],
  },
  notice: {
    accessibility: 'composite',
    controls: { dismissible: 'studio.control/switch', tone: 'studio.control/select' },
    defaults: { dismissible: false, tone: 'information' },
    ports: [textPort('title'), richTextPort()],
    properties: {
      dismissible: booleanSchema(),
      tone: enumSchema('comment', 'error', 'information', 'success', 'warning'),
    },
  },
  popover: {
    accessibility: 'interactive',
    controls: {
      dismissOnBlur: 'studio.control/switch',
      placement: 'studio.control/select',
    },
    defaults: { dismissOnBlur: true, placement: 'auto' },
    ports: [textPort('triggerLabel', true), textPort('title')],
    properties: {
      dismissOnBlur: booleanSchema(),
      placement: enumSchema('auto', 'bottom', 'left', 'right', 'top'),
    },
    slots: [{ accepts: CONTENT_TYPES, id: 'content', maximum: 100 }],
  },
  richText: {
    accessibility: 'text',
    defaults: {},
    ports: [richTextPort()],
  },
  tab: {
    accessibility: 'composite',
    defaults: {},
    ports: [textPort('title', true)],
    slots: [{ accepts: CONTENT_TYPES, id: 'content', maximum: 100 }],
  },
  tabs: {
    accessibility: 'composite',
    controls: { activation: 'studio.control/select' },
    defaults: { activation: 'automatic' },
    properties: { activation: enumSchema('automatic', 'manual') },
    slots: [{ accepts: [CORE_PRODUCTION_BLOCK_TYPES.tab], id: 'items', maximum: 30 }],
  },
  video: {
    accessibility: 'media',
    controls: {
      autoplay: 'studio.control/switch',
      controls: 'studio.control/switch',
      muted: 'studio.control/switch',
    },
    defaults: { autoplay: false, controls: true, muted: false },
    ports: [mediaPort('asset'), mediaPort('poster'), textPort('captions')],
    properties: { autoplay: booleanSchema(), controls: booleanSchema(), muted: booleanSchema() },
  },
});

/** Build the entire canonical catalog with explicit allowlists and no host imports. */
export function createCoreProductionBlockDefinitions(): BlockDefinition[] {
  const layouts = createCoreLayoutBlockDefinitions({
    acceptedChildTypes: CONTENT_TYPES,
    rendererRequirements: WEB_RENDERERS,
  });
  const content = (Object.keys(SPECS) as DefinitionName[]).map((name) =>
    createDefinition(name, SPECS[name]),
  );
  return [...layouts, ...content];
}

/** Minimal schema-valid persisted properties for a newly inserted production node. */
export function coreProductionInitialProperties(type: CoreProductionBlockType): JsonObject {
  if (isCoreLayoutBlockType(type)) {
    return coreLayoutInitialProperties(type);
  }
  const name = productionName(type);
  return cloneContractValue(SPECS[name].defaults);
}

export function isCoreProductionBlockType(type: BlockType): type is CoreProductionBlockType {
  return ALL_TYPES.includes(type as CoreProductionBlockType);
}

/** Create the ten deterministic, schema-valid starter patterns. */
export function createCoreProductionPatterns(): PatternDocument[] {
  return [
    pattern('article', [
      node('article', 'stack', {}, [
        node('article-title', 'heading', { text: 'Article title' }),
        node('article-body', 'richText', { content: richText('Start writing…') }),
      ]),
    ]),
    pattern('collection-index', [
      node('collection-index', 'section', {}, [
        node('collection-heading', 'heading', { text: 'Latest content' }),
        node('collection', 'contentCollection', {}, undefined, {
          items: query('studio.query/content'),
        }),
      ]),
    ]),
    pattern('document-header', [
      node('document-header', 'columns', {}, [
        node('document-logo', 'image'),
        node('document-title', 'heading', { text: 'Document title' }),
      ]),
    ]),
    pattern('faq', [
      node('faq', 'accordion', {}, [
        node('faq-item', 'accordionItem', { title: 'Question' }, [
          node('faq-answer', 'richText', { content: richText('Answer') }),
        ]),
      ]),
    ]),
    pattern('feature-grid', [
      node('features', 'grid', {}, [
        node('feature-one', 'card', { title: 'Feature one' }),
        node('feature-two', 'card', { title: 'Feature two' }),
        node('feature-three', 'card', { title: 'Feature three' }),
      ]),
    ]),
    pattern('hero', [
      node('hero', 'section', {}, [
        node('hero-stack', 'stack', {}, [
          node('hero-title', 'heading', { text: 'Build something meaningful' }),
          node('hero-copy', 'richText', { content: richText('A portable Studio page.') }),
          node('hero-action', 'callToAction', { label: 'Get started' }),
        ]),
      ]),
    ]),
    pattern('media-gallery', [node('media-gallery', 'gallery')]),
    pattern('pricing', [
      node('pricing', 'card', { title: 'Plan' }, [
        node('price', 'money', { amount: { amount: '0.00', currency: 'USD' } }),
        node('price-action', 'callToAction', { label: 'Choose plan' }),
      ]),
    ]),
    pattern('product', [
      node('product', 'columns', {}, [
        node('product-media', 'gallery'),
        node('product-copy', 'stack', {}, [
          node('product-title', 'heading', { text: 'Product' }),
          node('product-description', 'richText', { content: richText('Product description') }),
          node('product-price', 'money', {}, undefined, {
            amount: resource('catalog/product-price', 'studio.resource/money'),
          }),
        ]),
      ]),
    ]),
    pattern('tabbed-content', [
      node('tabbed-content', 'tabs', {}, [
        node('tab-one', 'tab', { title: 'First' }, [
          node('tab-one-copy', 'richText', { content: richText('First panel') }),
        ]),
        node('tab-two', 'tab', { title: 'Second' }, [
          node('tab-two-copy', 'richText', { content: richText('Second panel') }),
        ]),
      ]),
    ]),
  ];
}

function createDefinition(name: DefinitionName, spec: ProductionDefinitionSpec): BlockDefinition {
  const type = CORE_PRODUCTION_BLOCK_TYPES[name];
  return {
    accessibility: {
      accessibleName:
        spec.accessibility === 'decorative' || spec.accessibility === 'structural'
          ? 'not-applicable'
          : 'derived',
      category: spec.accessibility,
      keyboard: message('block-keyboard', 'Use Studio controls to edit and reorder this block.'),
      outputChecks: ['studio.check/accessible-name', 'studio.check/reflow'],
      reducedMotion: ['audio', 'gallery', 'video'].includes(name)
        ? 'disable-motion'
        : 'not-applicable',
    },
    category: `studio.category/${categoryFor(spec.accessibility)}`,
    contractVersion: STUDIO_CONTRACT_VERSION,
    editingModes: ['blueprint', 'content'],
    icon: { kind: 'symbol', value: kebab(name) },
    kind: 'block-definition',
    label: message(`block-${kebab(name)}`, title(name)),
    owner: OWNER,
    ports: cloneContractValue([...(spec.ports ?? [])]),
    propertyControls: Object.entries(spec.controls ?? {}).map(([property, control]) => ({
      control,
      property,
    })),
    propertySchema: {
      additionalProperties: false,
      properties: cloneContractValue({ ...(spec.properties ?? {}) }),
      ...(spec.required === undefined ? {} : { required: [...spec.required] }),
      type: 'object',
    },
    rendererRequirements: cloneContractValue([...WEB_RENDERERS]),
    revision: `production-${kebab(name)}-r1`,
    slots: (spec.slots ?? []).map((slot) => ({
      accepts: { types: cloneContractValue([...slot.accepts]) },
      id: slot.id,
      label: message(`slot-${slot.id}`, title(slot.id)),
      maximum: slot.maximum ?? 100,
      minimum: slot.minimum ?? 0,
      ordered: true,
    })),
    themeControls: [],
    type,
    version: VERSION,
  };
}

function pattern(id: string, roots: BlueprintNode[]): PatternDocument {
  const definitions = new Map(
    createCoreProductionBlockDefinitions().map((item) => [item.type, item]),
  );
  const used = new Set<BlockType>();
  const visit = (current: BlueprintNode): void => {
    used.add(current.type);
    Object.values(current.slots).flat().forEach(visit);
  };
  roots.forEach(visit);
  return {
    blockDependencies: [...used].sort().map((type) => {
      const definition = definitions.get(type);
      if (definition === undefined) throw new Error(`Pattern ${id} uses unknown block ${type}.`);
      return { revision: definition.revision, type, version: definition.version };
    }),
    contractVersion: STUDIO_CONTRACT_VERSION,
    id: `studio.pattern/${id}`,
    kind: 'pattern',
    label: message(`pattern-${id}`, title(id)),
    owner: OWNER,
    revision: `production-pattern-${id}-r1`,
    roots,
    version: VERSION,
  };
}

function node(
  id: string,
  name: keyof typeof CORE_PRODUCTION_BLOCK_TYPES,
  staticBindings: Readonly<Record<string, JsonValue>> = {},
  children?: BlueprintNode[],
  dynamicBindings: Readonly<Record<string, BindingSource>> = {},
): BlueprintNode {
  const type = CORE_PRODUCTION_BLOCK_TYPES[name];
  const slot =
    name === 'section' ||
    name === 'accordionItem' ||
    name === 'dialog' ||
    name === 'popover' ||
    name === 'tab'
      ? 'content'
      : name === 'card'
        ? 'actions'
        : 'items';
  const bindings: Record<LocalName, FieldBinding> = {};
  for (const [port, value] of Object.entries(staticBindings)) {
    bindings[port] = binding({ kind: 'static-value', value });
  }
  for (const [port, source] of Object.entries(dynamicBindings)) {
    bindings[port] = binding(source);
  }
  const result: BlueprintNode = {
    authoring: {
      mode: isCoreLayoutBlockType(type) || children !== undefined ? 'structural' : 'content',
    },
    bindings,
    id,
    properties: coreProductionInitialProperties(type),
    slots: children === undefined ? {} : { [slot]: children },
    type,
    version: VERSION,
  };
  if (name === 'grid') {
    result.responsive = { columns: { expanded: 4, medium: 2 } };
  }
  return result;
}

function binding(source: BindingSource): FieldBinding {
  return { onError: 'error' as const, onNull: 'empty' as const, source, transforms: [] };
}

function query(queryName: QualifiedName): BindingSource {
  return { kind: 'query-reference', parameters: {}, query: queryName, version: VERSION };
}

function resource(id: string, resourceType: QualifiedName): BindingSource {
  return { id, kind: 'resource-reference', resourceType };
}

function richText(text: string): JsonObject {
  return { content: [{ content: [{ text, type: 'text' }], type: 'paragraph' }], type: 'doc' };
}

function productionName(type: CoreProductionBlockType): DefinitionName {
  const entry = (
    Object.entries(CORE_PRODUCTION_BLOCK_TYPES) as [
      keyof typeof CORE_PRODUCTION_BLOCK_TYPES,
      CoreProductionBlockType,
    ][]
  ).find(([, candidate]) => candidate === type);
  if (entry === undefined || isCoreLayoutBlockType(type))
    throw new TypeError(`Unsupported production block ${type}.`);
  return entry[0] as DefinitionName;
}

function message(id: string, defaultMessage: string) {
  return { defaultMessage, key: `studio.blocks/${id}` as QualifiedName };
}

function title(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/gu, '$1 $2')
    .replaceAll('-', ' ')
    .replace(/^./u, (character) => character.toUpperCase());
}

function kebab(value: string): string {
  return value.replace(/([a-z])([A-Z])/gu, '$1-$2').toLowerCase();
}

function categoryFor(category: BlockAccessibilityContract['category']): string {
  return category === 'structural' || category === 'landmark' ? 'layout' : category;
}
