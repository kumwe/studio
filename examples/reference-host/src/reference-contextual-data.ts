import {
  STUDIO_CONTRACT_VERSION,
  type BlueprintDocument,
  type ContentModelDocument,
  type EntryDocument,
  type FieldDefinition,
} from '@kumwe/studio-protocol';

const HOST_OWNER = { id: 'studio.reference/host', version: '1.0.0' } as const;

const referenceFields: readonly FieldDefinition[] = [
  {
    authoring: {
      control: 'studio.control/single-line-text',
      order: 0,
      placeholder: {
        defaultMessage: 'Entry title',
        key: 'studio.reference/model-title-placeholder',
      },
    },
    cardinality: 'one',
    id: 'title',
    kind: 'string',
    label: { defaultMessage: 'Title', key: 'studio.reference/model-title' },
    localized: true,
    required: true,
  },
  {
    authoring: { control: 'studio.control/select', order: 1 },
    cardinality: 'one',
    enumValues: [
      {
        label: { defaultMessage: 'Guide', key: 'studio.reference/category-guide' },
        value: 'guide',
      },
      {
        label: { defaultMessage: 'News', key: 'studio.reference/category-news' },
        value: 'news',
      },
    ],
    id: 'category',
    kind: 'enum',
    label: { defaultMessage: 'Category', key: 'studio.reference/model-category' },
    localized: false,
    required: false,
  },
  {
    authoring: { control: 'studio.control/switch', order: 2 },
    cardinality: 'one',
    id: 'featured',
    kind: 'boolean',
    label: { defaultMessage: 'Featured', key: 'studio.reference/model-featured' },
    localized: false,
    required: false,
  },
];

/**
 * Builds the exact host-owned model revision paired with the representative
 * Blueprint. Keeping this fixture outside the browser bootstrap lets the
 * reference authoring port prove that it hydrates a coordinated artifact set
 * instead of manufacturing a detached read-only model projection.
 */
export function createReferenceContentModel(
  blueprint: Readonly<BlueprintDocument>,
  options: {
    readonly fields?: readonly FieldDefinition[];
    readonly status?: 'draft' | 'published';
  } = {},
): ContentModelDocument {
  return {
    contractVersion: STUDIO_CONTRACT_VERSION,
    fields: structuredClone([...(options.fields ?? referenceFields)]),
    id: blueprint.model.id,
    kind: 'content-model',
    label: { defaultMessage: 'Reference content', key: 'studio.reference/model' },
    owner: HOST_OWNER,
    relationships: [],
    revision: blueprint.model.revision,
    status: options.status ?? 'published',
    version: blueprint.model.version,
  };
}

/** An existing item whose non-empty values make exact hydration observable. */
export function createReferenceEntry(
  model: Readonly<ContentModelDocument>,
  options: {
    readonly id?: string;
    readonly revision?: string;
    readonly values?: EntryDocument['values'];
  } = {},
): EntryDocument {
  return {
    contractVersion: STUDIO_CONTRACT_VERSION,
    id: options.id ?? 'content/reference-guide',
    kind: 'entry',
    locale: 'en',
    model: { id: model.id, revision: model.revision, version: model.version },
    revision: options.revision ?? 'entry-r7',
    status: 'draft',
    values: structuredClone(
      options.values ?? {
        category: 'guide',
        featured: true,
        title: 'Building pages with contextual Studio',
      },
    ),
    workflowState: 'studio.reference/draft',
  };
}

/**
 * Creates an empty item for a selected reusable type. Definition artifacts
 * remain exact clones; only the new Entry values are empty.
 */
export function createEmptyReferenceEntry(
  model: Readonly<ContentModelDocument>,
  id = 'content/new-reference-item',
): EntryDocument {
  return createReferenceEntry(model, { id, revision: 'entry-new-r0', values: {} });
}

/**
 * Creates the host-authorized blank-start draft set. It deliberately uses new
 * Model, Blueprint, and Entry identities so a blank launch never mutates the
 * representative reusable type.
 */
export function createBlankReferenceArtifacts(
  source: Readonly<BlueprintDocument>,
  entryId = 'content/new-blank-item',
): {
  readonly blueprint: BlueprintDocument;
  readonly entry: EntryDocument;
  readonly model: ContentModelDocument;
} {
  const model: ContentModelDocument = {
    contractVersion: STUDIO_CONTRACT_VERSION,
    fields: [],
    id: 'studio.reference/model-new',
    kind: 'content-model',
    label: { defaultMessage: 'Untitled content type', key: 'studio.reference/model-new' },
    owner: HOST_OWNER,
    relationships: [],
    revision: 'model-new-r0',
    status: 'draft',
    version: '0.1.0',
  };
  const blueprint: BlueprintDocument = {
    ...structuredClone(source),
    id: 'studio.reference/blueprint-new',
    label: { defaultMessage: 'Untitled page', key: 'studio.reference/blueprint-new' },
    model: { id: model.id, revision: model.revision, version: model.version },
    revision: 'blueprint-new-r0',
    roots: [],
    status: 'draft',
    version: '0.1.0',
  };
  return {
    blueprint,
    entry: createEmptyReferenceEntry(model, entryId),
    model,
  };
}
