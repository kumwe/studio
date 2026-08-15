export const STUDIO_CONTRACT_VERSION = '0.1-draft' as const;

export type StudioContractVersion = typeof STUDIO_CONTRACT_VERSION;

export const STUDIO_WIRE_PROTOCOL_VERSION = '0.1.0-draft.1' as const;

export type StudioWireProtocolVersion = typeof STUDIO_WIRE_PROTOCOL_VERSION;

export type JsonPrimitive = boolean | null | number | string;

export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];

export interface JsonObject {
  [key: string]: JsonValue;
}

export interface JsonSchema extends JsonObject {
  $id?: string;
  $schema?: string;
}

export type StableId = string;

export type Revision = string;

export type SemanticVersion = string;

export type QualifiedName = `${string}/${string}`;

export type LocalName = string;

export type PackageRelativePath = string;

export type NodeId = StableId;

export type BlockType = QualifiedName;

export interface MessageReference {
  defaultMessage?: string;
  key: QualifiedName;
}

export interface OwnerReference {
  id: QualifiedName;
  version: SemanticVersion;
}

export interface ArtifactReference {
  id: StableId;
  integrity?: string;
  revision?: Revision;
  version: SemanticVersion;
}

export interface LockedArtifactReference extends ArtifactReference {
  revision: Revision;
}

export interface ResolvedEntryReference {
  id: StableId;
  integrity?: string;
  revision: Revision;
}

export interface DiagnosticLocation {
  artifactId?: StableId;
  fieldPath?: LocalName[];
  jsonPointer?: string;
  nodeId?: NodeId;
}

export interface StudioDiagnostic {
  code: QualifiedName;
  location?: DiagnosticLocation;
  message: MessageReference;
  parameters?: Record<string, JsonPrimitive>;
  remediations?: QualifiedName[];
  severity: 'blocking' | 'error' | 'information' | 'warning';
}

export interface EntryFieldBindingSource {
  fieldPath: LocalName[];
  kind: 'entry-field';
}

export interface ContextValueBindingSource {
  key: QualifiedName;
  kind: 'context-value';
}

export interface StaticValueBindingSource {
  kind: 'static-value';
  value: JsonValue;
}

export interface ResourceReferenceBindingSource {
  id: StableId;
  kind: 'resource-reference';
  resourceType: QualifiedName;
}

export interface QueryReferenceBindingSource {
  kind: 'query-reference';
  parameters: JsonObject;
  query: QualifiedName;
  version: SemanticVersion;
}

export type BindingSource =
  | ContextValueBindingSource
  | EntryFieldBindingSource
  | QueryReferenceBindingSource
  | ResourceReferenceBindingSource
  | StaticValueBindingSource;

export interface BindingTransform {
  arguments: JsonObject;
  operator: QualifiedName;
  version: SemanticVersion;
}

export interface FieldBinding {
  fallback?: JsonValue;
  onError: 'error' | 'fallback' | 'hide';
  onNull: 'empty' | 'error' | 'fallback' | 'hide';
  source: BindingSource;
  transforms: BindingTransform[];
}

export interface NodeAuthoringPolicy {
  allowedBlocks?: BlockType[];
  mode: 'content' | 'designer' | 'locked' | 'structural' | 'variant';
  requiredPermission?: QualifiedName;
}

export interface BlueprintNode {
  authoring: NodeAuthoringPolicy;
  bindings: Record<LocalName, FieldBinding>;
  extensions?: Record<QualifiedName, JsonValue>;
  id: NodeId;
  properties: JsonObject;
  responsive?: Record<LocalName, Record<LocalName, JsonValue>>;
  slots: Record<LocalName, BlueprintNode[]>;
  type: BlockType;
  version: SemanticVersion;
}

export interface BlueprintBlockLock {
  integrity?: string;
  revision: Revision;
  type: BlockType;
  version: SemanticVersion;
}

export interface BlueprintDependencyLock {
  blocks: BlueprintBlockLock[];
  plugins?: LockedArtifactReference[];
  theme: LockedArtifactReference;
}

export interface BlueprintDocument {
  contractVersion: StudioContractVersion;
  dependencyLock: BlueprintDependencyLock;
  description?: MessageReference;
  extensions?: Record<QualifiedName, JsonValue>;
  id: StableId;
  kind: 'blueprint';
  label: MessageReference;
  model: LockedArtifactReference;
  owner: OwnerReference;
  revision: Revision;
  roots: BlueprintNode[];
  status: 'draft' | 'published' | 'retired';
  version: SemanticVersion;
}

export interface BlockSlotAcceptance {
  types: BlockType[];
}

export interface BlockSlotDefinition {
  accepts: BlockSlotAcceptance;
  id: LocalName;
  label: MessageReference;
  maximum: number;
  minimum: number;
  ordered: boolean;
}

export interface BlockPortDefinition {
  id: LocalName;
  label: MessageReference;
  multiple: boolean;
  required: boolean;
  valueType: string;
}

export interface RendererRequirement {
  capability: QualifiedName;
  surface: 'document' | 'email' | 'native' | 'preview' | 'web';
  versions: string;
}

export interface BlockAccessibilityContract {
  accessibleName: 'derived' | 'not-applicable' | 'required-binding' | 'required-property';
  category:
    | 'composite'
    | 'data-display'
    | 'decorative'
    | 'interactive'
    | 'landmark'
    | 'media'
    | 'structural'
    | 'text';
  keyboard: MessageReference;
  outputChecks: QualifiedName[];
  reducedMotion: 'disable-motion' | 'not-applicable' | 'required';
}

export type BlockIcon =
  | { kind: 'asset'; integrity: string; path: PackageRelativePath }
  // Schema validation distinguishes local and qualified symbol names at runtime.
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
  | { kind: 'symbol'; value: LocalName | QualifiedName };

export interface BlockPropertyControl {
  control: QualifiedName;
  help?: MessageReference;
  label?: MessageReference;
  property: LocalName;
}

export interface BlockFallback {
  lossless: true;
  type: BlockType;
  versions: string;
}

export interface BlockDefinition {
  accessibility: BlockAccessibilityContract;
  category: QualifiedName;
  contractVersion: StudioContractVersion;
  description?: MessageReference;
  extensions?: Record<QualifiedName, JsonValue>;
  fallback?: BlockFallback;
  icon?: BlockIcon;
  kind: 'block-definition';
  label: MessageReference;
  editingModes: ('blueprint' | 'content')[];
  owner: OwnerReference;
  ports: BlockPortDefinition[];
  propertyControls?: BlockPropertyControl[];
  propertySchema: JsonSchema;
  rendererRequirements: RendererRequirement[];
  revision: Revision;
  slots: BlockSlotDefinition[];
  themeControls: LocalName[];
  type: BlockType;
  version: SemanticVersion;
}

export interface HostPortCapability {
  id: QualifiedName;
  operations: QualifiedName[];
  version: SemanticVersion;
}

export interface HostFeatureCapability {
  configuration?: JsonValue;
  id: QualifiedName;
  version: SemanticVersion;
}

export interface HostCapabilities {
  capabilities: HostFeatureCapability[];
  contractVersion: StudioContractVersion;
  extensions?: Record<QualifiedName, JsonValue>;
  host: {
    generation: Revision;
    id: QualifiedName;
    version: SemanticVersion;
  };
  kind: 'host-capabilities';
  ports: HostPortCapability[];
  protocolVersions: SemanticVersion[];
}

export type ContentFieldKind =
  | 'boolean'
  | 'collection'
  | 'date'
  | 'date-time'
  | 'decimal'
  | 'enum'
  | 'integer'
  | 'media'
  | 'money'
  | 'object'
  | 'resource'
  | 'rich-text'
  | 'string'
  | QualifiedName;

export interface FieldAuthoringMetadata {
  control?: QualifiedName;
  group?: LocalName;
  hidden?: boolean;
  order?: number;
  placeholder?: MessageReference;
  readOnly?: boolean;
  width?: 'full' | 'half' | 'third' | 'two-thirds';
}

export interface FieldConstraints {
  allowedMediaKinds?: MediaAsset['mediaKind'][];
  maxItems?: number;
  maxLength?: number;
  maximum?: string;
  minItems?: number;
  minLength?: number;
  minimum?: string;
  scale?: number;
  validator?: QualifiedName;
  validatorArguments?: Record<string, JsonValue>;
}

export interface ContentModelEnumValue {
  label: MessageReference;
  value: LocalName;
}

export interface FieldDefinition {
  authoring?: FieldAuthoringMetadata;
  cardinality: 'many' | 'one';
  constraints?: FieldConstraints;
  defaultValue?: JsonValue;
  description?: MessageReference;
  enumValues?: ContentModelEnumValue[];
  extensions?: Record<QualifiedName, JsonValue>;
  fields?: FieldDefinition[];
  id: LocalName;
  itemKind?: Exclude<ContentFieldKind, 'collection'>;
  kind: ContentFieldKind;
  label: MessageReference;
  localized: boolean;
  required: boolean;
  semanticRole?: QualifiedName;
}

export interface RelationshipAuthoringMetadata {
  allowCreate: boolean;
  control: QualifiedName;
  displayField?: LocalName;
  searchProvider?: QualifiedName;
}

export interface RelationshipDefinition {
  authoring?: RelationshipAuthoringMetadata;
  extensions?: Record<QualifiedName, JsonValue>;
  id: LocalName;
  kind: 'many-to-many' | 'many-to-one' | 'one-to-many' | 'one-to-one';
  label: MessageReference;
  onDelete: 'detach' | 'nullify' | 'restrict';
  required: boolean;
  sourceField: LocalName;
  targetField?: LocalName;
  targetModel: ArtifactReference;
}

export interface ContentModelDocument {
  contractVersion: StudioContractVersion;
  description?: MessageReference;
  extensions?: Record<QualifiedName, JsonValue>;
  fields: FieldDefinition[];
  id: StableId;
  kind: 'content-model';
  label: MessageReference;
  owner: OwnerReference;
  relationships: RelationshipDefinition[];
  revision: Revision;
  status: 'draft' | 'published' | 'retired';
  version: SemanticVersion;
}

export type StudioAuthoringMode = 'blueprint' | 'content' | 'model';

export interface StudioDisplayPreferences {
  calendar: LocalName;
  hourCycle: 'h11' | 'h12' | 'h23' | 'h24';
  measurementSystem?: 'metric' | 'uk' | 'us';
  numberingSystem: LocalName;
}

export interface StudioResourceScope {
  id: StableId;
  kind: QualifiedName;
}

export interface StudioResourceContext {
  key: StableId;
  resource?: { id: StableId; type: QualifiedName };
  revision?: Revision;
  scopes: StudioResourceScope[];
  surface: QualifiedName;
}

export interface StudioLimits {
  maxChildrenPerSlot: number;
  maxCommandBatch: number;
  maxContributionsPerPlugin: number;
  maxDepth: number;
  maxExtensionBytes: number;
  maxHistoryEntries: number;
  maxLocaleBytes: number;
  maxMediaBatch: number;
  maxMediaUploadBytes: number;
  maxNodes: number;
  maxPluginCount: number;
  maxPreviewBytes: number;
  maxPreviewRequestsPerMinute: number;
  maxPropertyBytes: number;
  maxRichTextBytes: number;
  maxRichTextDepth: number;
  maxSlotsPerNode: number;
}

export interface StudioConfiguration {
  actor: { displayName: string; id: StableId };
  artifacts: {
    blueprint?: LockedArtifactReference;
    entry?: ResolvedEntryReference;
    model?: LockedArtifactReference;
    theme?: LockedArtifactReference;
  };
  blocks: BlueprintBlockLock[];
  composite: 'hybrid' | 'single';
  contractVersion: StudioContractVersion;
  displayPreferences: StudioDisplayPreferences;
  extensions?: Record<QualifiedName, JsonValue>;
  features: {
    clipboardMediaUpload: boolean;
    collaboration: boolean;
    customInspectors: boolean;
    executablePlugins: boolean;
    externalMediaImport: boolean;
    offlineRecovery: boolean;
  };
  hostCapabilities: HostCapabilities;
  limits: StudioLimits;
  locale: {
    direction: 'ltr' | 'rtl';
    fallbacks: string[];
    requested: string;
    resolved: string;
    timeZone: string;
  };
  mode: StudioAuthoringMode;
  permissions: QualifiedName[];
  plugins: LockedArtifactReference[];
  protocolVersion: StudioWireProtocolVersion;
  preview: {
    allowApproximateRenderer: boolean;
    enabled: boolean;
    initialViewport?: LocalName;
    sameOriginRequired: boolean;
  };
  sessionGeneration: Revision;
  sessionId: StableId;
  sessionState: 'editable' | 'read-only';
  resourceContext: StudioResourceContext;
}

export interface ExperimentalShellConfiguration {
  blockDefinitions: BlockDefinition[];
  session: StudioConfiguration;
}

export interface CommandDestination {
  parentNodeId?: NodeId;
  position: number;
  slot?: LocalName;
}

export interface CommandBase<TType extends QualifiedName, TPayload extends object> {
  artifactId: StableId;
  baseStateVersion: number;
  contractVersion: StudioContractVersion;
  expectedRevision?: Revision;
  groupId?: StableId;
  id: StableId;
  kind: 'command';
  payload: TPayload;
  sessionGeneration: Revision;
  type: TType;
}

export interface InsertNodePayload {
  destination: CommandDestination;
  node: BlueprintNode;
}

export type InsertNodeCommand = CommandBase<'studio.command/insert-node', InsertNodePayload>;

export interface RemoveNodePayload {
  nodeId: NodeId;
}

export type RemoveNodeCommand = CommandBase<'studio.command/remove-node', RemoveNodePayload>;

export interface MoveNodePayload {
  destination: CommandDestination;
  nodeId: NodeId;
}

export type MoveNodeCommand = CommandBase<'studio.command/move-node', MoveNodePayload>;

export interface SetPropertyPayload {
  nodeId: NodeId;
  property: LocalName;
  value: JsonValue;
  viewport?: LocalName;
}

export type SetPropertyCommand = CommandBase<'studio.command/set-property', SetPropertyPayload>;

export interface DuplicateNodePayload {
  destination?: CommandDestination;
  idMap: Record<NodeId, NodeId>;
  nodeId: NodeId;
}

export type DuplicateNodeCommand = CommandBase<
  'studio.command/duplicate-node',
  DuplicateNodePayload
>;

export interface ReorderChildrenPayload {
  order: NodeId[];
  parentNodeId?: NodeId;
  slot?: LocalName;
}

export type ReorderChildrenCommand = CommandBase<
  'studio.command/reorder-children',
  ReorderChildrenPayload
>;

export interface UnsetPropertyPayload {
  nodeId: NodeId;
  property: LocalName;
  viewport?: LocalName;
}

export type UnsetPropertyCommand = CommandBase<
  'studio.command/unset-property',
  UnsetPropertyPayload
>;

export interface SetBindingPayload {
  binding: FieldBinding;
  nodeId: NodeId;
  port: LocalName;
}

export type SetBindingCommand = CommandBase<'studio.command/set-binding', SetBindingPayload>;

export interface RemoveBindingPayload {
  nodeId: NodeId;
  port: LocalName;
}

export type RemoveBindingCommand = CommandBase<
  'studio.command/remove-binding',
  RemoveBindingPayload
>;

export interface SetFieldValuePayload {
  fieldPath: LocalName[];
  locale?: string;
  value: JsonValue;
}

export type SetFieldValueCommand = CommandBase<
  'studio.command/set-field-value',
  SetFieldValuePayload
>;

export interface BatchOperation<TType extends QualifiedName, TPayload extends object> {
  payload: TPayload;
  type: TType;
}

export type BlueprintBatchOperation =
  | BatchOperation<'studio.command/duplicate-node', DuplicateNodePayload>
  | BatchOperation<'studio.command/insert-node', InsertNodePayload>
  | BatchOperation<'studio.command/move-node', MoveNodePayload>
  | BatchOperation<'studio.command/remove-binding', RemoveBindingPayload>
  | BatchOperation<'studio.command/remove-node', RemoveNodePayload>
  | BatchOperation<'studio.command/reorder-children', ReorderChildrenPayload>
  | BatchOperation<'studio.command/set-binding', SetBindingPayload>
  | BatchOperation<'studio.command/set-property', SetPropertyPayload>
  | BatchOperation<'studio.command/unset-property', UnsetPropertyPayload>;

export interface BatchPayload {
  operations: BlueprintBatchOperation[];
}

export type BatchCommand = CommandBase<'studio.command/batch', BatchPayload>;

export type BlueprintCommand =
  | BatchCommand
  | DuplicateNodeCommand
  | InsertNodeCommand
  | MoveNodeCommand
  | RemoveBindingCommand
  | RemoveNodeCommand
  | ReorderChildrenCommand
  | SetBindingCommand
  | SetPropertyCommand
  | UnsetPropertyCommand;

export type StudioCommand = BlueprintCommand | SetFieldValueCommand;

export interface PreviewMessageBase<TType extends QualifiedName, TPayload extends object> {
  channelId: StableId;
  contractVersion: StudioContractVersion;
  kind: 'preview-message';
  payload: TPayload;
  sequence: number;
  sessionGeneration: Revision;
  type: TType;
}

export interface PreviewReadyPayload {
  protocolVersion: StudioWireProtocolVersion;
  renderer: QualifiedName;
  viewports: LocalName[];
}

export interface PreviewRenderPayload {
  artifactId: StableId;
  draftDigest: string;
  draftRevision?: Revision;
  viewport: LocalName;
}

export interface PreviewRenderedPayload {
  diagnostics: StudioDiagnostic[];
  draftDigest: string;
  markers: StableId[];
}

export interface PreviewSelectPayload {
  nodeId: NodeId;
  reveal?: boolean;
}

export interface PreviewErrorPayload {
  code: QualifiedName;
  correlationId?: StableId;
  message: MessageReference;
  retryable: boolean;
}

export type PreviewReadyMessage = PreviewMessageBase<'studio.preview/ready', PreviewReadyPayload>;

export type PreviewRenderMessage = PreviewMessageBase<
  'studio.preview/render',
  PreviewRenderPayload
>;

export type PreviewRenderedMessage = PreviewMessageBase<
  'studio.preview/rendered',
  PreviewRenderedPayload
>;

export type PreviewSelectMessage = PreviewMessageBase<
  'studio.preview/select',
  PreviewSelectPayload
>;

export type PreviewErrorMessage = PreviewMessageBase<'studio.preview/error', PreviewErrorPayload>;

export type PreviewMessage =
  | PreviewErrorMessage
  | PreviewReadyMessage
  | PreviewRenderMessage
  | PreviewRenderedMessage
  | PreviewSelectMessage;

export interface MediaRendition {
  height: number;
  id: LocalName;
  mediaType: string;
  width: number;
}

export interface MediaMetadata {
  altText?: string;
  caption?: string;
  credit?: string;
  decorative?: boolean;
  durationMilliseconds?: number;
  focalPoint?: { x: number; y: number };
  height?: number;
  license?: string;
  width?: number;
}

export interface MediaRenditionIntent {
  fit?: 'contain' | 'cover' | 'fill' | 'scale-down';
  preferredMediaTypes?: string[];
  role: LocalName;
}

export type MediaCropIntent =
  | {
      height: number;
      mode: 'aspect-ratio';
      width: number;
    }
  | {
      height: number;
      mode: 'rectangle';
      width: number;
      x: number;
      y: number;
    };

export type MediaAccessibility =
  | {
      altFieldPath: LocalName[];
      captionFieldPath?: LocalName[];
      mode: 'bound';
    }
  | {
      mode: 'decorative';
    }
  | {
      altText: string;
      caption?: string;
      mode: 'informative';
    };

export interface MediaReference {
  accessibility: MediaAccessibility;
  assetId: StableId;
  assetRevision?: Revision;
  contractVersion: StudioContractVersion;
  cropIntent?: MediaCropIntent;
  focalPoint?: { x: number; y: number };
  kind: 'media-reference';
  renditionIntent?: MediaRenditionIntent;
  usage: QualifiedName;
}

export interface MediaAsset {
  byteSize: number;
  contractVersion: StudioContractVersion;
  extensions?: Record<QualifiedName, JsonValue>;
  filename: string;
  id: StableId;
  kind: 'media-asset';
  mediaKind: 'archive' | 'audio' | 'document' | 'image' | 'other' | 'video';
  mediaType: string;
  metadata: MediaMetadata;
  renditions?: MediaRendition[];
  revision: Revision;
  state: 'archived' | 'processing' | 'quarantined' | 'ready' | 'rejected';
}

export interface MediaQuery {
  cursor?: string;
  limit: number;
  mediaTypes?: string[];
  search?: string;
}

export interface MediaPage {
  assets: MediaAsset[];
  nextCursor?: string;
}
