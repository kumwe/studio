import {
  css,
  html,
  LitElement,
  nothing,
  svg,
  type CSSResult,
  type PropertyValues,
  type TemplateResult,
} from 'lit';
import {
  BlockRegistry,
  CORE_LAYOUT_BLOCK_TYPES,
  RECIPE_MARKER_PROPERTY,
  coreProductionInitialProperties,
  createCoreProductionBlockDefinitions,
  createCoreProductionPatterns,
  isCoreProductionBlockType,
  permittedCommandTypes,
  planColumnsInsertion,
  projectBlueprintFieldBindings,
  recipeSelectionOperations,
  resolveSessionMode,
  StudioCommandError,
  StudioSession,
  validateBlueprint,
  type StudioCommandErrorCode,
  type StudioSessionOptions,
  type BlueprintFieldBindingProjection,
  type FieldBindingCandidate,
  type FieldBindingPortProjection,
} from '@kumwe/studio-core';
import type {
  BlockDefinition,
  ApplyPatternCommand,
  BatchCommand,
  BlueprintBatchOperation,
  BlueprintCommand,
  BlueprintDocument,
  BlueprintNode,
  BlockType,
  CommandDestination,
  ContentModelDocument,
  DuplicateNodeCommand,
  ExperimentalShellConfiguration,
  FieldBinding,
  FieldDefinition,
  InsertNodeCommand,
  JsonValue,
  JsonSchema,
  LocalName,
  MessageReference,
  MoveNodeCommand,
  NodeId,
  PatternDocument,
  PreviewMarkerRect,
  PreviewMessage,
  QualifiedName,
  RemoveBindingCommand,
  RemoveNodeCommand,
  ReorderChildrenCommand,
  ReorderChildrenPayload,
  ResourceReferenceBindingSource,
  ResetInheritedPropertyCommand,
  RestoreNodeCommand,
  Revision,
  SetBindingCommand,
  SetPropertyCommand,
  SetPropertyPayload,
  SetSizeRoleCommand,
  SetSizeRolePayload,
  SizeRoleAxis,
  StudioContractVersion,
  StudioDiagnostic,
  StudioCommand,
  StudioSessionMode,
  ThemeDesignChoice,
  ThemeDesignControl,
  ThemeDocument,
  ThemeViewport,
  UnsetPropertyCommand,
  UnsetPropertyPayload,
  UnsetSizeRoleCommand,
  UnsetSizeRolePayload,
} from '@kumwe/studio-protocol';
import { StudioLocalCanvas, type StudioLocalCanvasContext } from './local-canvas.js';
import {
  isScalarControlSchema,
  renderScalarControl,
  type StudioEntryValueAdapter,
} from './scalar-controls.js';
import { canvasWorkspaceStyles } from './workspace-styles.js';
import { messageText, type StudioMessageKey, type StudioMessageOverrides } from './messages.js';
import {
  allocateDuplicateIdMap,
  collectDocumentIds,
  findAncestry,
  findOutlineLocation,
} from './outline.js';
import {
  afterDestination,
  beforeDestination,
  columnPosition,
  destinationEntries,
  emptySlotBand,
  emptySlots,
  insertedRootIds,
  isDestinationCurrent,
  levelSlots,
  pageEndDestination,
  slotEndDestination,
} from './insertion-destinations.js';
import {
  hasListedChildren,
  isNodeListed,
  listedAncestorOf,
  listingScopeFor,
  parentScopeOf,
  scopeChildren,
} from './panel-navigation.js';
import {
  StudioPreviewSurface,
  type StudioPreviewBinding,
  type StudioPreviewGeometry,
  type StudioPreviewState,
} from './preview-surface.js';
import {
  STUDIO_AUTHORING_CONTROL_IDS,
  StudioAuthoringControlRegistry,
  type StudioAuthoringControlChange,
  type StudioAuthoringControlHandle,
  type StudioAuthoringControlId,
  type StudioAuthoringControlOptions,
} from './authoring-controls.js';
import {
  isStudioResourceReference,
  mountStudioResourceBindingControl,
  type StudioResourceBindingChange,
  type StudioResourceBindingControlHandle,
  type StudioResourceSearchService,
} from './resource-authoring-control.js';

export interface StudioDocumentChangeDetail {
  command: BlueprintCommand | null;
  document: BlueprintDocument;
  source: 'command' | 'redo' | 'undo';
}

export interface StudioInsertRequestDetail {
  definition: BlockDefinition;
  parentId: string | null;
  /**
   * Present for a composite insertion (the column cards): the shell's default
   * action is one `studio.command/batch` of exactly these operations. A host
   * that inserts only `definition` produces a single block.
   */
  operations?: BlueprintBatchOperation[];
  /**
   * The explicit index inside the parent slot (or the document roots). The
   * shell always sets it; a host that ignores it keeps end-of-slot placement.
   */
  position?: number;
  slot?: string;
}

/** One empty container slot the page offers an add control for. */
interface AddZone {
  destination: CommandDestination;
  node: BlueprintNode;
  slot: string;
}

export interface StudioDirtyChangedDetail {
  dirty: boolean;
}

export interface StudioViewportChangeDetail {
  viewport: ThemeViewport;
}

/** Trusted styling remains host context and is never written to a Blueprint. */
export interface StudioScopedStyleChangeDetail {
  nodeId: NodeId;
  value: JsonValue;
}

interface ShellCommandEnvelope {
  artifactId: string;
  baseStateVersion: number;
  contractVersion: StudioContractVersion;
  id: string;
  kind: 'command';
  sessionGeneration: Revision;
}

interface CommandPaletteEntry {
  disabled: boolean;
  id: string;
  label: string;
  run: () => void;
}

interface CanvasDragState {
  active: boolean;
  capture?: Element;
  label: string;
  nodeId: NodeId;
  order: NodeId[];
  parentNodeId?: NodeId;
  pointerId: number;
  slot?: string;
  sourceIndex: number;
  targetIndex: number;
}

interface RemovedNodeRecord {
  destination: CommandDestination;
  label: string;
  node: BlueprintNode;
}

interface MoveDestinationOption {
  destination: CommandDestination;
  id: string;
  label: string;
  order?: NodeId[];
}

interface MoveCollection {
  collection: readonly BlueprintNode[];
  label: string;
  parentNodeId?: NodeId;
  slot?: string;
  specificity: number;
}

interface CanvasDropTarget extends MoveDestinationOption {
  distanceX: number;
  distanceY: number;
  indicator: PreviewMarkerRect;
  specificity: number;
}

interface PreviewCanvasDragState {
  active: boolean;
  capture?: Element;
  label: string;
  nodeId: NodeId;
  originX: number;
  originY: number;
  pointerId: number;
  target?: CanvasDropTarget;
}

/**
 * A palette block being carried onto the measured canvas. The gesture is an
 * enhancement over palette clicks and the outline destination selector: it
 * ranks the same insert-node destinations by geometry and dispatches the same
 * canonical command, so a drop never creates an otherwise invalid placement.
 */
interface PaletteDragState {
  active: boolean;
  cancelled: boolean;
  capture?: Element;
  definition: BlockDefinition;
  label: string;
  originX: number;
  originY: number;
  pointerId: number;
  target?: CanvasDropTarget;
}

interface MountedAuthoringControl {
  handle: StudioAuthoringControlHandle;
  holder: HTMLElement;
  signature: string;
}

interface MountedResourceBindingControl {
  handle: StudioResourceBindingControlHandle;
  holder: HTMLElement;
  signature: string;
}

interface InspectorAuthoringTarget {
  binding?: FieldBinding;
  control: QualifiedName;
  key: string;
  kind: 'port' | 'property';
  label: string;
  name: string;
  nodeId: NodeId;
  profile?: string;
  readOnly: boolean;
  value: unknown;
}

interface InspectorResourceBindingTarget {
  binding?: FieldBinding;
  key: string;
  label: string;
  multiple: boolean;
  nodeId: NodeId;
  port: string;
  readOnly: boolean;
}

export class KumweStudioElement extends LitElement {
  public static override properties = {
    announcement: { attribute: false, state: true },
    authoringControlRegistry: { attribute: false },
    canvasDirectManipulation: { attribute: false, state: true },
    canvasGeometry: { attribute: false, state: true },
    commandSession: { attribute: false },
    configuration: { attribute: false },
    contentModel: { attribute: false },
    designControls: { attribute: false },
    document: { attribute: false },
    inspectorMode: { attribute: false },
    entryValues: { attribute: false },
    focusedEntryNodeId: { attribute: false, state: true },
    hoveredNodeId: { attribute: false, state: true },
    libraryOpen: { attribute: false, state: true },
    libraryQuery: { attribute: false, state: true },
    activePane: { attribute: false, state: true },
    localCanvasContext: { attribute: false },
    localCanvasState: { attribute: false, state: true },
    messages: { attribute: false },
    patterns: { attribute: false },
    paletteFilter: { attribute: false, state: true },
    paletteOpen: { attribute: false, state: true },
    panelScopeId: { attribute: false, state: true },
    panelView: { attribute: false, state: true },
    pendingInsertDestination: { attribute: false, state: true },
    previewBinding: { attribute: false },
    previewState: { attribute: false, state: true },
    resourceSearchService: { attribute: false },
    selectedNodeId: { attribute: false, state: true },
    theme: { attribute: false },
    viewports: { attribute: false },
  };

  public static override styles: CSSResult = css`
    :host {
      --studio-border: #d7dce2;
      --studio-panel: #f7f8fa;
      --studio-primary: #3157d5;
      color: #18202a;
      display: block;
      font:
        400 0.9375rem/1.45 system-ui,
        sans-serif;
      min-height: 30rem;
    }

    .workspace {
      display: grid;
      grid-template-columns:
        minmax(10rem, 13rem) minmax(18rem, 1fr) minmax(11rem, 15rem)
        minmax(12rem, 16rem);
      min-height: inherit;
    }

    .panel,
    .canvas {
      border: 1px solid var(--studio-border);
      min-inline-size: 0;
      padding: 1rem;
    }

    .panel {
      background: var(--studio-panel);
    }

    h2 {
      font-size: 0.8125rem;
      letter-spacing: 0.05em;
      margin: 0 0 0.75rem;
      text-transform: uppercase;
    }

    button {
      background: white;
      border: 1px solid var(--studio-border);
      border-radius: 0.375rem;
      color: inherit;
      cursor: pointer;
      font: inherit;
      padding: 0.5rem 0.625rem;
      text-align: left;
    }

    button:disabled {
      cursor: not-allowed;
      opacity: 0.55;
    }

    button:focus-visible {
      outline: 0.1875rem solid color-mix(in srgb, var(--studio-primary), transparent 55%);
      outline-offset: 0.125rem;
    }

    /* The structure panel's focused row is its cursor: after a pointer-driven
       layer change the row is focused by script, which the platform does not
       paint as :focus-visible, so it carries the same dashed focused
       indicator the page shows for it. */
    button.outline-entry:focus:not(:focus-visible) {
      outline: 0.125rem dashed var(--studio-primary);
      outline-offset: -0.125rem;
    }

    button[aria-pressed='true'] {
      border-color: var(--studio-primary);
      box-shadow: inset 0.1875rem 0 0 var(--studio-primary);
    }

    .palette,
    .tree {
      display: grid;
      gap: 0.5rem;
      list-style: none;
      margin: 0;
      padding: 0;
    }

    .toolbar {
      display: flex;
      gap: 0.5rem;
      justify-content: flex-end;
      margin-bottom: 1rem;
    }

    .command-palette-toggle {
      font-size: 0.8125rem;
      margin-bottom: 0.75rem;
      padding: 0.375rem 0.5rem;
    }

    .command-palette {
      background: var(--studio-panel);
      border: 1px solid var(--studio-border);
      border-radius: 0.375rem;
      display: grid;
      gap: 0.5rem;
      margin-bottom: 1rem;
      padding: 0.75rem;
    }

    .command-palette input {
      border: 1px solid var(--studio-border);
      border-radius: 0.375rem;
      box-sizing: border-box;
      font: inherit;
      inline-size: 100%;
      min-inline-size: 0;
      padding: 0.5rem 0.625rem;
    }

    .command-palette .hint {
      margin: 0;
    }

    .command-results {
      display: grid;
      gap: 0.375rem;
      list-style: none;
      margin: 0;
      padding: 0;
    }

    .command-empty {
      color: #5d6671;
      margin: 0;
    }

    .canvas-chip {
      touch-action: none;
    }

    .drop-indicator {
      border: 1px dashed var(--studio-primary);
      border-radius: 0.375rem;
      font-weight: 600;
      margin: 0 0 0.75rem;
      padding: 0.375rem 0.5rem;
    }

    .node-children {
      border-inline-start: 1px solid var(--studio-border);
      margin: 0.5rem 0 0 0.75rem;
      padding-inline-start: 0.75rem;
    }

    .empty {
      color: #5d6671;
      padding: 3rem 1rem;
      text-align: center;
    }

    .hint {
      color: #5d6671;
      font-size: 0.75rem;
      margin: 0 0 0.75rem;
      overflow-wrap: anywhere;
    }

    /* The header stays in view while the tree scrolls, so the disclosure
       control is reachable from any entry the panel has scrolled to. */
    .panel-header {
      align-items: center;
      background: var(--studio-panel);
      /* A sticky box holds at the scrollport's content edge, so the panel's
         own top padding is painted by the shadow rather than pulled over by
         a negative margin, which would only push the header onto the row
         below it. */
      box-shadow: 0 -0.875rem 0 0 var(--studio-panel);
      display: flex;
      gap: 0.5rem;
      inset-block-start: 0;
      justify-content: space-between;
      padding-block: 0 0.25rem;
      position: sticky;
      z-index: 1;
    }

    .panel-header > h2 {
      margin: 0;
    }

    .add-blocks-toggle,
    .panel-back,
    .outline-whole-tree {
      font-size: 0.8125rem;
    }

    .panel-back-glyph {
      margin-inline-end: 0.25rem;
    }

    /* An opened level lays its header out as two lines: the way back beside
       the disclosure, then the level's name beside the way to the whole tree. */
    .panel-header[data-scope] {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      justify-items: start;
    }

    .panel-header[data-scope] > .add-blocks-toggle,
    .panel-header[data-scope] > .outline-whole-tree {
      justify-self: end;
    }

    .outline-scope-heading {
      overflow-wrap: anywhere;
    }

    /* The inset ring is the non-colour hover indicator, mirrored by the page
       rect; it composes with the pressed bar so a hovered selected entry
       still shows both states. */
    .outline-entry[data-hovered='true'] {
      background: color-mix(in srgb, var(--studio-primary), transparent 92%);
      box-shadow: inset 0 0 0 1px var(--studio-primary);
    }

    .outline-entry[data-hovered='true'][aria-pressed='true'] {
      box-shadow:
        inset 0.1875rem 0 0 var(--studio-primary),
        inset 0 0 0 1px var(--studio-primary);
    }

    .unresolved {
      background: #fbe9e9;
      border: 1px solid #e5b6b6;
      border-radius: 0.25rem;
      color: #7c1d1d;
      font-size: 0.75rem;
      padding: 0 0.25rem;
    }

    .outline-controls {
      display: flex;
      flex-wrap: wrap;
      gap: 0.375rem;
      margin-top: 0.375rem;
    }

    .outline-controls button,
    .outline-level-add button,
    .canvas-add-zones button {
      font-size: 0.8125rem;
      padding: 0.375rem 0.5rem;
    }

    .outline-move-destination-label {
      display: grid;
      flex-basis: 100%;
      font-size: 0.75rem;
      gap: 0.25rem;
      min-inline-size: 0;
    }

    .outline-move-destination {
      border: 1px solid var(--studio-border);
      border-radius: 0.375rem;
      box-sizing: border-box;
      font: inherit;
      inline-size: 100%;
      max-inline-size: 100%;
      min-inline-size: 0;
      padding: 0.375rem 0.5rem;
    }

    .viewport-switcher {
      display: flex;
      flex-wrap: wrap;
      gap: 0.375rem;
      margin-bottom: 0.75rem;
    }

    .viewport-switcher button {
      font-size: 0.8125rem;
      padding: 0.375rem 0.5rem;
    }

    .preview-region {
      background: white;
      border: 0;
      border-radius: 0;
      display: flex;
      flex: 1 0 auto;
      flex-direction: column;
      margin: 0;
      padding: 0;
    }

    .preview-status {
      background: #f6f8fb;
      border-block-end: 1px solid var(--studio-border);
      color: var(--studio-muted, #5d6671);
      font-size: 0.75rem;
      margin: 0;
      padding: 0.25rem 0.75rem;
    }

    .preview-surface-slot {
      display: block;
      max-inline-size: 100%;
      overflow: visible;
    }

    .preview-stage {
      flex: 1 0 auto;
      isolation: isolate;
      overflow: auto;
      position: relative;
    }

    .preview-stage:focus-visible {
      outline: 0.1875rem solid color-mix(in srgb, var(--studio-primary), transparent 55%);
      outline-offset: 0.125rem;
    }

    .preview-surface-slot::slotted(iframe) {
      border: 0;
      display: block;
      inline-size: 100%;
      min-block-size: 20rem;
    }

    .preview-canvas-overlay {
      inset-block-start: 0;
      inset-inline-start: 0;
      max-inline-size: none;
      overflow: hidden;
      pointer-events: none;
      position: absolute;
      z-index: 1;
    }

    .preview-canvas-region {
      fill: transparent;
      pointer-events: all;
      stroke: transparent;
      stroke-width: 2;
      vector-effect: non-scaling-stroke;
    }

    .preview-canvas-overlay[data-interactive='false'] .preview-canvas-region {
      pointer-events: none;
    }

    .preview-canvas-overlay[data-interactive='true'] {
      pointer-events: auto;
    }

    .canvas-edit-toggle {
      margin: 0;
    }

    .preview-canvas-region[data-hovered='true'] {
      fill: color-mix(in srgb, var(--studio-primary), transparent 92%);
      stroke: color-mix(in srgb, var(--studio-primary), transparent 35%);
    }

    .preview-canvas-region[data-focused='true'] {
      stroke: var(--studio-primary);
      stroke-dasharray: 6 4;
      stroke-width: 2;
    }

    /* Selection keeps its solid stroke while the entry also holds focus. */
    .preview-canvas-region[data-selected='true'] {
      fill: color-mix(in srgb, var(--studio-primary), transparent 88%);
      stroke: var(--studio-primary);
      stroke-dasharray: none;
      stroke-width: 3;
    }

    .preview-canvas-drop-indicator {
      fill: color-mix(in srgb, var(--studio-primary), transparent 72%);
      pointer-events: none;
      stroke: var(--studio-primary);
      stroke-width: 2;
      vector-effect: non-scaling-stroke;
    }

    .preview-canvas-status {
      background: white;
      border: 1px dashed var(--studio-primary);
      border-radius: 0.375rem;
      font-size: 0.8125rem;
      font-weight: 600;
      margin: 0.5rem 0 0;
      padding: 0.375rem 0.5rem;
    }

    .breadcrumb ol {
      align-items: center;
      display: flex;
      flex-wrap: wrap;
      gap: 0.375rem;
      list-style: none;
      margin: 0 0 0.75rem;
      padding: 0;
    }

    .breadcrumb li + li::before {
      content: '\\203A';
      margin-inline-end: 0.375rem;
    }

    .breadcrumb button {
      font-size: 0.8125rem;
      padding: 0.25rem 0.375rem;
    }

    .breadcrumb-current {
      font-weight: 600;
    }

    .diagnostics {
      grid-column: 1 / -1;
    }

    .diagnostics-list {
      display: grid;
      gap: 0.5rem;
      list-style: none;
      margin: 0;
      padding: 0;
    }

    .diagnostics-empty {
      color: #5d6671;
      margin: 0;
    }

    .diagnostic-severity {
      font-size: 0.75rem;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }

    .diagnostic-severity::after {
      content: ':';
    }

    .statusbar {
      align-items: center;
      border: 1px solid var(--studio-border);
      display: flex;
      gap: 0.5rem;
      grid-column: 1 / -1;
      padding: 0.5rem 1rem;
    }

    .save-state[data-dirty='true'] {
      color: #7c4a03;
    }

    .assistive {
      block-size: 1px;
      clip-path: inset(50%);
      inline-size: 1px;
      margin: -1px;
      overflow: hidden;
      padding: 0;
      position: absolute;
      white-space: nowrap;
    }

    dl {
      display: grid;
      gap: 0.75rem;
      margin: 0;
    }

    dt {
      color: #5d6671;
      font-size: 0.75rem;
      text-transform: uppercase;
    }

    dd {
      margin: 0.125rem 0 0;
      overflow-wrap: anywhere;
    }

    .inspector-section {
      margin-top: 1rem;
    }

    .inspector-section h3 {
      font-size: 0.75rem;
      letter-spacing: 0.05em;
      margin: 0 0 0.5rem;
      text-transform: uppercase;
    }

    .inspector-rows {
      display: grid;
      gap: 0.5rem;
      list-style: none;
      margin: 0 0 0.5rem;
      padding: 0;
    }

    .inspector-row {
      align-items: center;
      display: flex;
      flex-wrap: wrap;
      gap: 0.375rem;
    }

    .inspector-authoring-row {
      display: grid;
      gap: 0.375rem;
    }

    .inspector-authoring-control,
    .inspector-resource-control {
      border: 1px solid var(--studio-border);
      border-radius: 0.375rem;
      min-inline-size: 0;
      overflow: auto;
      padding: 0.5rem;
    }

    .inspector-authoring-control :is(input, select, textarea, button),
    .inspector-resource-control :is(input, select, textarea, button) {
      font: inherit;
      max-inline-size: 100%;
    }

    .inspector-authoring-control textarea {
      box-sizing: border-box;
      inline-size: 100%;
    }

    .studio-resource-search {
      display: grid;
      gap: 0.375rem;
      grid-template-columns: minmax(0, 1fr);
    }

    .studio-resource-current,
    .studio-resource-status {
      color: #5d6671;
      font-size: 0.75rem;
      overflow-wrap: anywhere;
    }

    .studio-resource-results {
      display: grid;
      gap: 0.375rem;
      list-style: none;
      padding: 0;
    }

    .studio-resource-results li {
      align-items: center;
      display: flex;
      flex-wrap: wrap;
      gap: 0.375rem;
      justify-content: space-between;
      overflow-wrap: anywhere;
    }

    .inspector-name {
      font-size: 0.8125rem;
      font-weight: 600;
      overflow-wrap: anywhere;
    }

    .inspector input {
      border: 1px solid var(--studio-border);
      border-radius: 0.375rem;
      flex: 1 1 6rem;
      font: inherit;
      min-inline-size: 0;
      padding: 0.375rem 0.5rem;
    }

    .inspector input:disabled {
      background: var(--studio-panel);
      cursor: not-allowed;
      opacity: 0.55;
    }

    .inspector select {
      border: 1px solid var(--studio-border);
      border-radius: 0.375rem;
      flex: 1 1 6rem;
      font: inherit;
      min-inline-size: 0;
      padding: 0.375rem 0.5rem;
    }

    .inspector select:disabled {
      background: var(--studio-panel);
      cursor: not-allowed;
      opacity: 0.55;
    }

    .inspector textarea {
      border: 1px solid var(--studio-border);
      border-radius: 0.375rem;
      flex: 1 1 6rem;
      font: inherit;
      min-block-size: 3rem;
      min-inline-size: 0;
      padding: 0.375rem 0.5rem;
      resize: vertical;
    }

    .inspector-binding-model {
      border: 1px solid var(--studio-border);
      border-radius: 0.375rem;
      display: grid;
      gap: 0.375rem;
      padding: 0.5rem;
    }

    .inspector-binding-control {
      align-items: center;
      background: white;
      border-inline-start: 0.1875rem solid var(--studio-border);
      display: grid;
      flex-basis: 100%;
      gap: 0.25rem;
      padding: 0.375rem 0.5rem;
    }

    .inspector-binding-control > :is(input, select, textarea) {
      inline-size: 100%;
    }

    .inspector-binding-path,
    .inspector-binding-status {
      color: #5d6671;
      flex-basis: 100%;
      font-size: 0.75rem;
      overflow-wrap: anywhere;
    }

    .inspector-provenance {
      color: #5d6671;
      flex-basis: 100%;
      font-size: 0.75rem;
    }

    .outline-slot-label {
      color: #5d6671;
      display: block;
      font-size: 0.75rem;
      margin: 0.25rem 0;
    }

    .inspector button {
      font-size: 0.8125rem;
      padding: 0.375rem 0.5rem;
    }

    .inspector-binding-value {
      font-size: 0.75rem;
      overflow-wrap: anywhere;
    }

    .inspector-empty {
      color: #5d6671;
      margin: 0 0 0.5rem;
    }

    @media (max-width: 60rem) {
      .workspace {
        grid-template-columns: minmax(16rem, 1fr);
      }
    }

    ${canvasWorkspaceStyles}

    /* SR-019: no chrome motion is essential, so a reduced-motion preference
       zeroes every animation and transition the shell declares now or later. */
    @media (prefers-reduced-motion: reduce) {
      :host,
      *,
      *::before,
      *::after {
        animation-delay: 0s !important;
        animation-duration: 0s !important;
        animation-iteration-count: 1 !important;
        scroll-behavior: auto !important;
        transition-delay: 0s !important;
        transition-duration: 0s !important;
      }
    }
  `;

  declare public configuration: ExperimentalShellConfiguration | undefined;
  declare public authoringControlRegistry: StudioAuthoringControlRegistry | undefined;
  /**
   * Optional pre-existing core session used by a composed host runtime. When
   * present, commands and history operate on that exact session instead of a
   * second shell-owned draft.
   */
  declare public commandSession: StudioSession | undefined;
  declare public contentModel: ContentModelDocument | undefined;
  declare public designControls: ThemeDesignControl[] | undefined;
  declare public document: BlueprintDocument | undefined;
  /** Presentation only; command policy remains owned by the configured session. */
  declare public inspectorMode: 'blueprint' | 'content' | 'model' | undefined;
  declare public entryValues: StudioEntryValueAdapter | undefined;
  declare protected libraryQuery: string;
  #lastEmittedSelection: NodeId | undefined;
  declare protected activePane: 'canvas' | 'library' | 'outline' | 'inspector';
  /** Explicit local projection. It never enables or substitutes for a host preview. */
  declare public localCanvasContext: StudioLocalCanvasContext | undefined;
  declare protected localCanvasState: 'current' | 'rendering' | 'unavailable' | undefined;
  #localCanvas: StudioLocalCanvas | undefined;
  #localCanvasHolder: HTMLElement | undefined;
  #localCanvasViewport: string | undefined;
  declare public messages: StudioMessageOverrides | undefined;
  declare public patterns: PatternDocument[] | undefined;
  declare public theme: ThemeDocument | undefined;
  declare public previewBinding: StudioPreviewBinding | undefined;
  declare public resourceSearchService: StudioResourceSearchService | undefined;
  declare public viewports: ThemeViewport[] | undefined;
  declare protected announcement: string | undefined;
  declare protected canvasDirectManipulation: boolean | undefined;
  declare protected canvasGeometry: StudioPreviewGeometry | undefined;
  /** The outline entry that holds keyboard focus; drawn as a dashed page rect, distinct from hover. */
  declare protected focusedEntryNodeId: NodeId | undefined;
  /** Shared by overlay rects and outline entries so hovering either surface marks the other. */
  declare protected hoveredNodeId: NodeId | undefined;
  /** Whether the block library disclosure is open at wide widths. */
  declare protected libraryOpen: boolean;
  declare protected paletteFilter: string | undefined;
  declare protected paletteOpen: boolean | undefined;
  /**
   * The container the structure view is opened into; `undefined` is the page
   * level, which lists the whole tree. A scope survives a details round trip.
   */
  declare protected panelScopeId: NodeId | undefined;
  /** Which layer the structure column shows: the tree or the selected block's details. */
  declare protected panelView: 'structure' | 'details';
  /**
   * The explicit destination chosen through a `+` control, which the add
   * layer names and every card, command-palette insert and pattern honours
   * until a block is inserted or the author's intent ends.
   */
  declare protected pendingInsertDestination: CommandDestination | undefined;
  declare protected previewState: StudioPreviewState | 'unavailable' | undefined;
  declare protected selectedNodeId: string | undefined;

  #activeViewportId: string | undefined;
  /** The empty-container zones of the render in progress, shared by the list and the bands. */
  #addZoneCache: AddZone[] | undefined;
  readonly #authoringControls = new Map<string, MountedAuthoringControl>();
  #authoringControlsReady: Promise<void> = Promise.resolve();
  readonly #authoringDiagnostics = new Map<string, StudioDiagnostic>();
  readonly #defaultAuthoringControlRegistry = new StudioAuthoringControlRegistry();
  #announcementPending = false;
  #commandSequence = 0;
  #bindingProjection: BlueprintFieldBindingProjection | undefined;
  readonly #defaultDefinitions = createCoreProductionBlockDefinitions();
  readonly #defaultPatterns = createCoreProductionPatterns();
  #diagnostics: StudioDiagnostic[] = [];
  #drag: CanvasDragState | undefined;
  #internalDocumentUpdate = false;
  #lastDirty = false;
  #libraryWasOpen = false;
  /** The last layer announced, so a repeated transition to the same layer stays silent. */
  #announcedLayer: string | undefined;
  /** The row the hover indicator marks in the current structure listing (computed per render). */
  #hoveredRowId: NodeId | undefined;
  #paletteInvoker: HTMLElement | undefined;
  #pendingFocusNodeId: NodeId | undefined;
  /** The entries of the pending destination's collection when the `+` chose it. */
  #pendingInsertEntries: readonly NodeId[] | undefined;
  #pendingPaletteFocus = false;
  readonly #onDocumentKeydown = (event: KeyboardEvent): void => {
    if (
      event.key === 'Escape' &&
      (this.#drag !== undefined ||
        this.#previewDrag !== undefined ||
        this.#paletteDrag !== undefined) &&
      this.#cancelDrag()
    ) {
      event.preventDefault();
      event.stopPropagation();
    }
  };
  readonly #pendingPreviewAnnouncements: string[] = [];
  #activePreviewBinding: StudioPreviewBinding | undefined;
  #previewBindingGeneration: Revision | undefined;
  #previewSurface: StudioPreviewSurface | undefined;
  #previewDrag: PreviewCanvasDragState | undefined;
  #paletteDrag: PaletteDragState | undefined;
  /** A completed palette drop must not also run the button's click insertion. */
  #suppressPaletteClick = false;
  readonly #removedNodes: RemovedNodeRecord[] = [];
  #registry: BlockRegistry | undefined;
  readonly #resourceBindingControls = new Map<string, MountedResourceBindingControl>();
  #session: StudioSession | undefined;
  #sessionGeneration: Revision = '';

  public constructor() {
    super();
    this.libraryQuery = '';
    this.activePane = 'canvas';
    this.libraryOpen = true;
    this.panelView = 'structure';
    this.panelScopeId = undefined;
    this.pendingInsertDestination = undefined;
  }

  public get activeViewport(): ThemeViewport | undefined {
    const ordered = this.#orderedViewports();
    if (ordered.length === 0) {
      return undefined;
    }
    const chosen = ordered.find((viewport) => viewport.id === this.#activeViewportId);
    const initial = ordered.find(
      (viewport) => viewport.id === this.configuration?.session.preview.initialViewport,
    );
    return chosen ?? initial ?? ordered.find((viewport) => viewport.base) ?? ordered[0];
  }

  public get stateVersion(): number {
    return this.#session?.stateVersion ?? 0;
  }

  /** Detached dirty projection for composed shells; host authority is unchanged. */
  public get dirty(): boolean {
    return this.#session?.dirty ?? false;
  }

  /** Detached validation projection for composed shells and host status chrome. */
  public get diagnostics(): readonly StudioDiagnostic[] {
    return [...this.#diagnostics, ...this.#authoringDiagnostics.values()].map((entry) =>
      structuredClone(entry),
    );
  }

  /** Detached selection projection retained by the existing Blueprint session. */
  public get selection(): readonly NodeId[] {
    return this.#session?.selection ?? [];
  }

  /** Resolves after the latest imperative custom-field lifecycle pass settles. */
  public get authoringReady(): Promise<void> {
    return this.#authoringControlsReady;
  }

  /** Resolves when the latest local visual projection has settled. */
  public get canvasReady(): Promise<void> {
    return this.#localCanvas?.ready ?? Promise.resolve();
  }

  /** The single mode resolved from the wire configuration for this session. */
  public get sessionMode(): StudioSessionMode | undefined {
    return this.#session?.mode;
  }

  public execute(command: BlueprintCommand): BlueprintDocument {
    if (this.configuration?.session.sessionState === 'read-only') {
      const message = 'The current Studio session is read-only.';
      this.#announce('studio.shell/announce-conflict', { message });
      throw new Error(message);
    }
    const session = this.#session;
    if (session === undefined) {
      throw new Error('Load a blueprint document before executing a command.');
    }
    let next: BlueprintDocument;
    try {
      next = session.execute(command);
    } catch (error) {
      if (error instanceof StudioCommandError && CONFLICT_ERROR_CODES.has(error.code)) {
        this.#announce('studio.shell/announce-conflict', { message: error.message });
      } else {
        this.#announce('studio.shell/announce-command-failed', {
          message: error instanceof Error ? error.message : String(error),
        });
      }
      throw error;
    }
    this.#assignInternalDocument(next);
    this.selectedNodeId = session.selection[0];
    this.#emitDocumentChange({ command, document: next, source: 'command' });
    this.#syncDirty();
    return next;
  }

  /**
   * Select one host-known document node, or clear selection after a host-owned interaction.
   *
   * Hosts that allocate node identifiers execute the accepted command through `execute()` and then
   * use this seam to give palette insertion the same Inspector, outline and preview-selection parity
   * as commands Studio can construct locally. Invalid identifiers are refused by the core session.
   */
  public revealInspector(): void {
    // Host-driven and silent: a host that completes an insertion after
    // `preventDefault` announces it itself. Focus that
    // sits in a region the details view hides moves to the Back control.
    const leaving = this.#focusInsideStructureRegions();
    this.activePane = 'inspector';
    this.panelView = 'details';
    if (leaving) {
      void this.updateComplete.then(() => {
        if (this.panelView === 'details') {
          this.#focusPanelBack();
        }
      });
    }
  }

  public selectNode(nodeId: NodeId | undefined): void {
    const session = this.#session;
    if (session === undefined) {
      throw new Error('Load a blueprint document before selecting a node.');
    }
    if (nodeId === undefined) {
      session.clearSelection();
    } else {
      session.select([nodeId]);
    }
    if (nodeId !== this.selectedNodeId) {
      // As for a selection the author makes: a `+` destination never
      // outlives the selection it was chosen under.
      this.#clearInsertDestination();
    }
    this.selectedNodeId = nodeId;
    this.#previewSurface?.selectNode(nodeId);
  }

  /**
   * Accept a host save acknowledgement without replacing the local session.
   * Pass the state version captured with the saved snapshot when the host can
   * settle after newer edits; those edits remain dirty on the accepted base.
   */
  public markSaved(revision?: Revision, stateVersion?: number): void {
    const session = this.#session;
    if (session === undefined) {
      return;
    }
    session.markSaved(revision ?? session.savedRevision, stateVersion);
    this.#assignInternalDocument(session.document);
    this.#syncDirty();
  }

  /**
   * Ask the bound preview channel to refresh volatile marker geometry after
   * a host-observed resize, scroll, zoom or late-loading asset settlement.
   */
  public refreshPreviewGeometry(): void {
    this.#previewSurface?.refreshGeometry();
    this.#localCanvas?.refreshGeometry();
  }

  /**
   * Closes the bound preview channel without changing authoring state or
   * focus. A later preview session requires a fresh binding.
   */
  public teardownPreview(reason: QualifiedName): void {
    if (this.#previewSurface === undefined) {
      return;
    }
    this.#queuePreviewAnnouncement('studio.shell/announce-preview-torn-down', { reason });
    this.#previewSurface.teardown(reason);
  }

  public override disconnectedCallback(): void {
    this.#disposeLocalCanvas();
    this.#destroyAuthoringControls();
    this.#destroyResourceBindingControls();
    this.ownerDocument.removeEventListener('keydown', this.#onDocumentKeydown, true);
    this.teardownPreview('studio.preview/surface-disconnected');
    super.disconnectedCallback();
  }

  public override connectedCallback(): void {
    super.connectedCallback();
    this.ownerDocument.addEventListener('keydown', this.#onDocumentKeydown, true);
    this.requestUpdate();
  }

  /**
   * Consumes preview channel messages a host forwards (for example from
   * `PreviewClient.onMessage`). Renderer reload and channel teardown are
   * announced through the single polite live region with their qualified
   * reason, via the message catalog. The handler never moves focus and never
   * touches the document or session: a preview restart is presentation-only.
   * Read-only sessions announce identically. All other message types are
   * ignored here.
   */
  public notifyPreviewMessage(message: PreviewMessage): void {
    if (message.type === 'studio.preview/reload') {
      this.#queuePreviewAnnouncement('studio.shell/announce-preview-reloaded', {
        reason: message.payload.reason,
      });
    } else if (message.type === 'studio.preview/teardown') {
      this.#queuePreviewAnnouncement('studio.shell/announce-preview-torn-down', {
        reason: message.payload.reason,
      });
    }
  }

  public redo(): BlueprintDocument | undefined {
    const session = this.#session;
    if (this.#isReadOnly() || session?.canRedo !== true) {
      return this.document;
    }
    this.#captureOutlineFocus();
    const next = session.redo();
    this.#assignInternalDocument(next);
    this.selectedNodeId = session.selection[0];
    this.#emitDocumentChange({ command: null, document: next, source: 'redo' });
    this.#syncDirty();
    this.#announce('studio.shell/announce-redid');
    return next;
  }

  public undo(): BlueprintDocument | undefined {
    const session = this.#session;
    if (this.#isReadOnly() || session?.canUndo !== true) {
      return this.document;
    }
    this.#captureOutlineFocus();
    const next = session.undo();
    this.#assignInternalDocument(next);
    this.selectedNodeId = session.selection[0];
    this.#emitDocumentChange({ command: null, document: next, source: 'undo' });
    this.#syncDirty();
    this.#announce('studio.shell/announce-undid');
    return next;
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('viewports') || changed.has('theme')) {
      this.#activeViewportId = undefined;
    }
    this.#alignPanelToPendingFocus();
    if (changed.has('inspectorMode') && this.inspectorMode !== undefined) {
      // Model and Content controls dock in the inspector, so choosing one of
      // those modes on a narrow screen brings that sheet forward; Blueprint
      // returns to the page. Wide layouts show every region regardless.
      this.activePane = this.inspectorMode === 'blueprint' ? 'canvas' : 'inspector';
    }
    // The pane is protected state, outside `keyof this` as Lit types it.
    const changedKeys: ReadonlyMap<PropertyKey, unknown> = changed;
    if (
      changedKeys.has('activePane') ||
      (changed.has('inspectorMode') && this.inspectorMode !== undefined)
    ) {
      // The Outline and Inspector sheets are the structure and details layers,
      // and the contextual tabs follow the same rule: docked Content and Model
      // panels live in the details layer, Blueprint returns to the structure.
      const previous = this.panelView;
      if (this.activePane === 'outline') {
        this.panelView = 'structure';
      } else if (this.activePane === 'inspector') {
        this.panelView = 'details';
      } else if (changed.has('inspectorMode') && this.inspectorMode === 'blueprint') {
        this.panelView = 'structure';
      }
      if (this.panelView !== previous) {
        this.#announcedLayer = undefined;
      }
    }
    if (changed.has('configuration')) {
      this.#rebuildRegistry();
    }
    if (changed.has('configuration') || changed.has('previewBinding')) {
      this.#synchronizePreviewSurface();
    }
    if (changed.has('document') || changed.has('configuration') || changed.has('commandSession')) {
      if (this.#internalDocumentUpdate) {
        this.#internalDocumentUpdate = false;
      } else {
        this.#rebuildSession();
      }
    }
    if (changed.has('document') || changed.has('configuration') || changed.has('contentModel')) {
      this.#revalidate();
    }
    // A destination chosen through a `+` is shown by the add layer, which the
    // structure view holds; it ends when that view leaves, and it ends when
    // its collection changes in any way (a move, an undo or redo, a removal,
    // a host update), so a stored position never reaches an insertion
    // anywhere other than the place the `+` named.
    const destination = this.pendingInsertDestination;
    if (
      destination !== undefined &&
      (this.panelView !== 'structure' ||
        !isDestinationCurrent(this.document?.roots ?? [], destination) ||
        (changed.has('document') && !this.#pendingInsertEntriesUnchanged(destination)))
    ) {
      this.pendingInsertDestination = undefined;
    }
  }

  protected override updated(changed: PropertyValues<this>): void {
    this.#synchronizeLocalCanvas(changed);
    if (this.selectedNodeId !== this.#lastEmittedSelection) {
      this.#lastEmittedSelection = this.selectedNodeId;
      this.dispatchEvent(
        new CustomEvent<{ nodeId: NodeId | undefined }>('studio-selection-change', {
          bubbles: true,
          composed: true,
          detail: { nodeId: this.selectedNodeId },
        }),
      );
    }
    if (changed.has('authoringControlRegistry')) {
      this.#destroyAuthoringControls();
    }
    if (changed.has('resourceSearchService')) {
      this.#destroyResourceBindingControls();
    }
    for (const select of this.shadowRoot?.querySelectorAll<HTMLSelectElement>(
      'select[data-current-value]',
    ) ?? []) {
      const current = select.dataset.currentValue;
      if (current !== undefined && select.value !== current) {
        select.value = current;
      }
    }
    // The announcement rendered; a preview lifecycle announcement deferred
    // behind it now takes the slot on the next update, so both are spoken.
    this.#announcementPending = false;
    const deferred = this.#pendingPreviewAnnouncements.shift();
    if (deferred !== undefined && deferred !== this.announcement) {
      this.announcement = deferred;
      this.#announcementPending = true;
    }
    if (this.#pendingPaletteFocus) {
      this.#pendingPaletteFocus = false;
      this.shadowRoot?.querySelector<HTMLInputElement>('.command-palette input')?.focus();
    }
    if (this.libraryOpen && !this.#libraryWasOpen) {
      // A reopened disclosure starts at its heading and search field.
      const library = this.shadowRoot?.querySelector('aside.library');
      if (library !== null && library !== undefined) {
        library.scrollTop = 0;
      }
    }
    this.#libraryWasOpen = this.libraryOpen;
    // Entries are rendered in place, so a focused entry can be re-bound to
    // another node without a focus event; the page indicator follows the
    // node the focused entry now shows.
    const activeEntry = this.#shadowActiveElement();
    const focusedId =
      activeEntry instanceof HTMLElement && activeEntry.classList.contains('outline-entry')
        ? activeEntry.dataset.nodeId
        : undefined;
    if (focusedId !== this.focusedEntryNodeId) {
      this.focusedEntryNodeId = focusedId;
    }
    // A select's user-chosen value survives re-renders, so every update
    // re-aligns each size-role select with the assignment it renders.
    for (const select of this.shadowRoot?.querySelectorAll<HTMLSelectElement>(
      'select.layout-role-select',
    ) ?? []) {
      select.value = select.dataset.role ?? '';
    }
    if (
      changed.has('document') ||
      changed.has('configuration') ||
      changed.has('previewBinding') ||
      changed.has('theme') ||
      changed.has('viewports')
    ) {
      this.#schedulePreview();
    }
    this.#authoringControlsReady = this.#authoringControlsReady
      .catch(() => undefined)
      .then(async () => {
        await this.#synchronizeAuthoringControls();
        this.#synchronizeResourceBindingControls();
      });
    const nodeId = this.#pendingFocusNodeId;
    if (nodeId === undefined) {
      return;
    }
    this.#pendingFocusNodeId = undefined;
    this.#focusOutlineEntry(nodeId);
  }

  protected override render(): TemplateResult {
    this.#addZoneCache = undefined;
    const session = this.#session;
    const readOnly = this.#isReadOnly();
    const roots = this.document?.roots ?? [];
    const selected =
      this.document === undefined || this.selectedNodeId === undefined
        ? undefined
        : findOutlineLocation(this.document.roots, this.selectedNodeId)?.node;
    const diagnostics = [...this.#diagnostics, ...this.#authoringDiagnostics.values()].sort(
      (left, right) => SEVERITY_RANK[left.severity] - SEVERITY_RANK[right.severity],
    );
    const listed = this.#activeDefinitions().filter((entry) =>
      this.#matchesLibrary(referenceText(entry.label)),
    );
    // The column cards follow the Columns card, or end the list when a
    // search hides it.
    const columnsCards = this.#renderColumnsCards();

    return html`
      <div
        class="workspace"
        data-pane=${this.activePane}
        data-contextual=${this.inspectorMode === undefined ? 'false' : 'true'}
        data-library=${this.libraryOpen ? 'open' : 'closed'}
        data-panel-view=${this.panelView}
        data-panel-scope=${this.panelScopeId ?? nothing}
        @keydown=${(event: KeyboardEvent): void => {
          this.#onWorkspaceKeydown(event);
        }}
      >
        <nav class="pane-switcher" aria-label=${this.#text('studio.shell/workspace-panels')}>
          ${(['canvas', 'library', 'outline', 'inspector'] as const).map(
            (pane) =>
              html` <button
                type="button"
                aria-pressed=${this.activePane === pane ? 'true' : 'false'}
                @click=${(): void => {
                  this.activePane = pane;
                }}
              >
                ${this.#text(PANE_LABELS[pane])}
              </button>`,
          )}
        </nav>
        ${this.#renderCommandPalette()}
        <aside
          class="panel outline"
          aria-label=${this.#text('studio.shell/outline-heading')}
          tabindex="0"
        >
          ${this.#renderPanelHeader('structure')}
          <p class="hint">${this.#text('studio.shell/outline-hint')}</p>
          ${this.#renderOutline(roots)}
        </aside>

        <aside
          class="panel library"
          id="library"
          aria-label=${this.#text('studio.shell/palette-label')}
        >
          <h2>${this.#text('studio.shell/palette-heading')}</h2>
          ${this.#renderLibraryDestination()}
          <label class="library-search">
            ${this.#text('studio.shell/library-search')}
            <input
              type="search"
              aria-describedby=${this.pendingInsertDestination === undefined ? nothing : 'library-destination'}
              .value=${this.libraryQuery}
              @input=${(event: Event): void => {
                if (event.currentTarget instanceof HTMLInputElement)
                  this.libraryQuery = event.currentTarget.value;
              }}
            />
          </label>
          <ul class="palette">
            ${listed.map(
              (definition) => html`
                <li>
                  <button
                    type="button"
                    class="palette-block"
                    data-block-type=${definition.type}
                    ?disabled=${!this.#canInsertDefinition(definition)}
                    @click=${(): void => this.#requestInsert(definition)}
                    @pointerdown=${(event: PointerEvent): void => {
                      this.#onPaletteBlockPointerDown(event, definition);
                    }}
                    @pointermove=${(event: PointerEvent): void => {
                      this.#onPaletteBlockPointerMove(event);
                    }}
                    @pointerup=${(event: PointerEvent): void => {
                      this.#onPaletteBlockPointerUp(event);
                    }}
                    @pointercancel=${(event: PointerEvent): void => {
                      this.#onPaletteBlockPointerCancel(event);
                    }}
                  >
                    <span class="block-symbol" aria-hidden="true"
                      >${definition.slots.length > 0 ? '⊞' : referenceText(definition.label).slice(0, 1)}</span
                    >
                    ${referenceText(definition.label)}
                  </button>
                </li>
                ${definition.type === CORE_LAYOUT_BLOCK_TYPES.columns ? columnsCards : nothing}
              `,
            )}
            ${listed.some((entry) => entry.type === CORE_LAYOUT_BLOCK_TYPES.columns) ? nothing : columnsCards}
          </ul>
          ${
            this.#activePatterns().length === 0
              ? nothing
              : html`
                  <h2 class="pattern-heading">${this.#text('studio.shell/patterns-heading')}</h2>
                  <ul class="palette pattern-palette">
                    ${this.#activePatterns()
                      .filter((entry) => this.#matchesLibrary(referenceText(entry.label)))
                      .map(
                        (pattern) => html`
                          <li>
                            <button
                              type="button"
                              class="pattern-apply"
                              data-pattern-id=${pattern.id}
                              ?disabled=${this.#patternDestination(pattern) === undefined}
                              @click=${(): void => {
                                this.#applyPattern(pattern);
                              }}
                            >
                              ${referenceText(pattern.label)}
                            </button>
                          </li>
                        `,
                      )}
                  </ul>
                `
          }
        </aside>

        <aside
          class="panel inspector"
          aria-label=${this.#text('studio.shell/inspector-heading')}
          tabindex="-1"
        >
          ${this.#renderPanelHeader('details')} ${this.#renderBreadcrumb()}
          <slot class="inspector-slot" name="contextual-inspector"></slot>
          <div
            class="inspector-default"
            ?hidden=${this.inspectorMode !== undefined && this.inspectorMode !== 'blueprint'}
          >
            ${
              selected === undefined
                ? html`<p>${this.#text('studio.shell/inspector-empty')}</p>`
                : this.#renderInspector(selected)
            }
          </div>
        </aside>

        <main
          class="canvas"
          aria-label=${this.#text('studio.shell/canvas-label')}
          data-empty=${roots.length === 0 ? 'true' : 'false'}
          data-viewport=${this.activeViewport?.id ?? nothing}
          @pointermove=${(event: PointerEvent): void => {
            this.#onCanvasPointerMove(event);
          }}
          @pointerup=${(event: PointerEvent): void => {
            this.#onCanvasPointerUp(event);
          }}
          @pointercancel=${(event: PointerEvent): void => {
            this.#onCanvasPointerCancel(event);
          }}
        >
          <div class="canvas-toolbar">
            ${this.#renderViewportSwitcher()}
            <button
              type="button"
              class="command-palette-toggle"
              aria-expanded=${this.paletteOpen === true ? 'true' : 'false'}
              @click=${(event: Event): void => {
                this.#togglePalette(event);
              }}
            >
              ${this.#text('studio.shell/command-palette-toggle')}
            </button>
            <div
              class="toolbar"
              role="group"
              aria-label=${this.#text('studio.shell/history-label')}
            >
              <button
                type="button"
                ?disabled=${session?.canUndo !== true || readOnly}
                @click=${(): void => {
                  this.undo();
                }}
              >
                ${this.#text('studio.shell/undo')}
              </button>
              <button
                type="button"
                ?disabled=${session?.canRedo !== true || readOnly}
                @click=${(): void => {
                  this.redo();
                }}
              >
                ${this.#text('studio.shell/redo')}
              </button>
            </div>
            ${this.#renderCanvasEditToggle()}
          </div>
          ${roots.length === 0 ? this.#renderEmptyPageZone() : nothing} ${this.#renderPreview()}
          ${this.#renderAddZoneList()} ${this.#renderDropIndicator()}
          ${
            roots.length === 0
              ? nothing
              : this.#usesLocalCanvas() ||
                  (this.#previewCapabilityAvailable() && this.previewBinding !== undefined)
                ? nothing
                : html`<ul class="tree structural-canvas-fallback">
                    ${roots.map((node) => this.#renderCanvasNode(node))}
                  </ul>`
          }
        </main>

        <section
          class="panel diagnostics"
          data-empty=${diagnostics.length === 0 ? 'true' : 'false'}
          aria-label=${this.#text('studio.shell/diagnostics-heading')}
        >
          <h2>${this.#text('studio.shell/diagnostics-heading')}</h2>
          ${
            diagnostics.length === 0
              ? html`<p class="diagnostics-empty">
                  ${this.#text('studio.shell/diagnostics-empty')}
                </p>`
              : html`<ul class="diagnostics-list">
                  ${diagnostics.map((entry) => this.#renderDiagnostic(entry))}
                </ul>`
          }
        </section>

        <footer class="statusbar" aria-label=${this.#text('studio.shell/status-label')}>
          ${
            session === undefined
              ? nothing
              : html`<span class="save-state" data-dirty=${session.dirty ? 'true' : 'false'}>
                  ${this.#text(
                    session.dirty
                      ? 'studio.shell/save-state-unsaved'
                      : 'studio.shell/save-state-saved',
                  )}
                </span>`
          }
          <p class="assistive" aria-live="polite">${this.announcement ?? ''}</p>
        </footer>
      </div>
    `;
  }

  #matchesLibrary(label: string): boolean {
    return label.toLocaleLowerCase().includes(this.libraryQuery.trim().toLocaleLowerCase());
  }

  #addOverride(node: BlueprintNode, viewport: ThemeViewport): void {
    const nameInput =
      this.shadowRoot?.querySelector<HTMLInputElement>('input.inspector-add-override-name') ?? null;
    const valueInput =
      this.shadowRoot?.querySelector<HTMLInputElement>('input.inspector-add-override-value') ??
      null;
    if (nameInput === null || valueInput === null) {
      return;
    }
    const property = nameInput.value.trim();
    if (property.length === 0) {
      this.#announce('studio.shell/announce-name-required');
      return;
    }
    const parsed = this.#parseJsonInput(valueInput.value, property);
    if (parsed === undefined) {
      return;
    }
    if (this.#setNodeProperty(node, property, parsed.value, viewport)) {
      nameInput.value = '';
      valueInput.value = '';
    }
  }

  #addProperty(node: BlueprintNode): void {
    const nameInput =
      this.shadowRoot?.querySelector<HTMLInputElement>('input.inspector-add-property-name') ?? null;
    const valueInput =
      this.shadowRoot?.querySelector<HTMLInputElement>('input.inspector-add-property-value') ??
      null;
    if (nameInput === null || valueInput === null) {
      return;
    }
    const property = nameInput.value.trim();
    if (property.length === 0) {
      this.#announce('studio.shell/announce-name-required');
      return;
    }
    const parsed = this.#parseJsonInput(valueInput.value, property);
    if (parsed === undefined) {
      return;
    }
    if (this.#setNodeProperty(node, property, parsed.value, undefined)) {
      nameInput.value = '';
      valueInput.value = '';
    }
  }

  #announce(key: StudioMessageKey, parameters?: Readonly<Record<string, string>>): void {
    this.announcement = messageText(key, this.messages, parameters);
    this.#announcementPending = true;
  }

  #assignInternalDocument(document: BlueprintDocument): void {
    this.#internalDocumentUpdate = true;
    this.document = document;
  }

  /**
   * The size role assigned in the targeted responsive context: the base
   * assignment without a viewport, the viewport override otherwise.
   */
  #assignedSizeRole(
    node: BlueprintNode,
    axis: SizeRoleAxis,
    viewport: ThemeViewport | undefined,
  ): string | undefined {
    return viewport === undefined
      ? node.sizeRoles?.[axis]
      : node.responsiveSizeRoles?.[axis]?.[viewport.id];
  }

  #axisText(axis: SizeRoleAxis): string {
    return this.#text(AXIS_MESSAGE_KEYS[axis]);
  }

  /**
   * Abandons an in-progress canvas drag without touching the document.
   * Returns whether a drag was actually pending, so keyboard handling can
   * consume the Escape key only when it cancelled something.
   */
  #cancelDrag(): boolean {
    const previewDrag = this.#previewDrag;
    if (previewDrag !== undefined) {
      this.#previewDrag = undefined;
      this.#releasePreviewDragCapture(previewDrag);
      if (previewDrag.active) {
        this.#announce('studio.shell/announce-drag-cancelled', { label: previewDrag.label });
      }
      this.requestUpdate();
      return true;
    }
    const paletteDrag = this.#paletteDrag;
    if (paletteDrag !== undefined && !paletteDrag.cancelled) {
      // The state survives until pointerup so the click that completes the
      // cancelled gesture is recognised and does not insert.
      paletteDrag.cancelled = true;
      delete paletteDrag.target;
      this.#releasePaletteDragCapture(paletteDrag);
      if (paletteDrag.active) {
        this.#announce('studio.shell/announce-drag-cancelled', { label: paletteDrag.label });
      }
      this.requestUpdate();
      return true;
    }
    const drag = this.#drag;
    if (drag === undefined) {
      return false;
    }
    this.#drag = undefined;
    this.#releaseDragCapture(drag);
    if (drag.active) {
      this.#announce('studio.shell/announce-drag-cancelled', { label: drag.label });
    }
    this.requestUpdate();
    return true;
  }

  #captureOutlineFocus(): void {
    const active = this.shadowRoot?.activeElement;
    if (
      active instanceof HTMLElement &&
      active.classList.contains('outline-entry') &&
      active.dataset.nodeId !== undefined
    ) {
      this.#pendingFocusNodeId = active.dataset.nodeId;
    }
  }

  #closePalette(restoreFocus: boolean): void {
    this.paletteOpen = false;
    this.paletteFilter = '';
    const invoker = this.#paletteInvoker;
    this.#paletteInvoker = undefined;
    if (restoreFocus && invoker?.isConnected === true) {
      invoker.focus();
    }
  }

  #commandEnvelope(document: BlueprintDocument, session: StudioSession): ShellCommandEnvelope {
    this.#commandSequence += 1;
    return {
      artifactId: document.id,
      baseStateVersion: session.stateVersion,
      contractVersion: document.contractVersion,
      id: `studio-shell-command-${this.#commandSequence}`,
      kind: 'command',
      sessionGeneration: this.#sessionGeneration,
    };
  }

  #currentInspectorNode(nodeId: NodeId): BlueprintNode | undefined {
    return this.document === undefined
      ? undefined
      : findOutlineLocation(this.document.roots, nodeId)?.node;
  }

  #deleteNode(node: BlueprintNode): void {
    const session = this.#session;
    const document = this.document;
    if (
      session === undefined ||
      document === undefined ||
      !this.#canMutateNode(node, 'studio.command/remove-node')
    ) {
      return;
    }
    const location = findOutlineLocation(document.roots, node.id);
    if (location === undefined) {
      return;
    }
    const previousSiblingId =
      location.index > 0 ? location.collection[location.index - 1]?.id : undefined;
    const parentId = location.parentNodeId;
    const label = this.#nodeLabel(node);
    const destination: CommandDestination = { position: location.index };
    if (location.parentNodeId !== undefined && location.slot !== undefined) {
      destination.parentNodeId = location.parentNodeId;
      destination.slot = location.slot;
    }
    const removedNode = structuredClone(location.node);
    const command: RemoveNodeCommand = {
      ...this.#commandEnvelope(document, session),
      payload: { nodeId: node.id },
      type: 'studio.command/remove-node',
    };
    if (this.#runShellCommand(command)) {
      this.#removedNodes.push({ destination, label, node: removedNode });
      const maximumHistoryEntries = this.configuration?.session.limits.maxHistoryEntries ?? 100;
      if (this.#removedNodes.length > maximumHistoryEntries) {
        this.#removedNodes.splice(0, this.#removedNodes.length - maximumHistoryEntries);
      }
      const focusTarget = previousSiblingId ?? parentId ?? this.document?.roots[0]?.id;
      if (focusTarget !== undefined) {
        this.#selectNode(focusTarget);
        this.#pendingFocusNodeId = focusTarget;
      }
      this.#announce('studio.shell/announce-deleted', { label });
    }
  }

  #restoreLastNode(): void {
    const session = this.#session;
    const document = this.document;
    const record = this.#lastRestorableNode();
    const destination = record === undefined ? undefined : this.#restoreDestination(record);
    if (
      session === undefined ||
      document === undefined ||
      record === undefined ||
      destination === undefined ||
      !this.#permits('studio.command/restore-node')
    ) {
      return;
    }
    const command: RestoreNodeCommand = {
      ...this.#commandEnvelope(document, session),
      payload: {
        destination,
        node: structuredClone(record.node),
      },
      type: 'studio.command/restore-node',
    };
    if (this.#runShellCommand(command)) {
      this.#removedNodes.splice(this.#removedNodes.lastIndexOf(record), 1);
      this.#selectNode(record.node.id);
      this.#pendingFocusNodeId = record.node.id;
      this.#announce('studio.shell/announce-restored', { label: record.label });
    }
  }

  #lastRestorableNode(): RemovedNodeRecord | undefined {
    const document = this.document;
    if (document === undefined) {
      return undefined;
    }
    const ids = collectDocumentIds(document.roots);
    for (let index = this.#removedNodes.length - 1; index >= 0; index -= 1) {
      const record = this.#removedNodes[index];
      if (
        record === undefined ||
        [...collectDocumentIds([record.node])].some((id) => ids.has(id))
      ) {
        continue;
      }
      if (this.#restoreDestination(record) === undefined) {
        continue;
      }
      return record;
    }
    return undefined;
  }

  #restoreDestination(record: RemovedNodeRecord): CommandDestination | undefined {
    const document = this.document;
    if (document === undefined) {
      return undefined;
    }
    const parentId = record.destination.parentNodeId;
    if (parentId === undefined) {
      if (this.#session?.mode === 'hybrid') {
        return undefined;
      }
      return { position: Math.min(record.destination.position, document.roots.length) };
    }
    const slotName = record.destination.slot;
    const parent = findOutlineLocation(document.roots, parentId)?.node;
    const declared = this.#findDefinition(parent ?? record.node)?.slots.find(
      (slot) => slot.id === slotName,
    );
    if (
      parent === undefined ||
      slotName === undefined ||
      declared?.accepts.types.includes(record.node.type) !== true
    ) {
      return undefined;
    }
    const children = parent.slots[slotName] ?? [];
    if (children.length >= declared.maximum) {
      return undefined;
    }
    if (this.#session?.mode === 'hybrid') {
      const allowed =
        parent.authoring.slots?.[slotName]?.allowedBlocks ?? parent.authoring.allowedBlocks;
      if (
        !this.#isComposableSlot(parent, slotName) ||
        allowed?.includes(record.node.type) === false
      ) {
        return undefined;
      }
    }
    return {
      parentNodeId: parentId,
      position: Math.min(record.destination.position, children.length),
      slot: slotName,
    };
  }

  #duplicateNode(node: BlueprintNode): void {
    const session = this.#session;
    const document = this.document;
    if (
      session === undefined ||
      document === undefined ||
      !this.#canMutateNode(node, 'studio.command/duplicate-node')
    ) {
      return;
    }
    const idMap = allocateDuplicateIdMap(document.roots, node);
    const copyId = idMap[node.id];
    if (copyId === undefined) {
      return;
    }
    const command: DuplicateNodeCommand = {
      ...this.#commandEnvelope(document, session),
      payload: { idMap, nodeId: node.id },
      type: 'studio.command/duplicate-node',
    };
    if (this.#runShellCommand(command)) {
      this.#selectNode(copyId);
      this.#pendingFocusNodeId = copyId;
      this.#announce('studio.shell/announce-duplicated', { label: this.#nodeLabel(node) });
    }
  }

  #emitDocumentChange(detail: StudioDocumentChangeDetail): void {
    this.dispatchEvent(
      new CustomEvent<StudioDocumentChangeDetail>('studio-document-change', {
        bubbles: true,
        composed: true,
        detail,
      }),
    );
  }

  #filteredPaletteEntries(): CommandPaletteEntry[] {
    const filter = (this.paletteFilter ?? '').trim().toLowerCase();
    const entries = this.#paletteEntries();
    if (filter.length === 0) {
      return entries;
    }
    return entries.filter((entry) => entry.label.toLowerCase().includes(filter));
  }

  #activeDefinitions(): readonly BlockDefinition[] {
    return this.configuration?.blockDefinitions ?? this.#defaultDefinitions;
  }

  #activePatterns(): readonly PatternDocument[] {
    return (
      this.patterns ??
      (this.configuration?.blockDefinitions === undefined ? this.#defaultPatterns : [])
    );
  }

  #findDefinition(node: BlueprintNode): BlockDefinition | undefined {
    return this.#activeDefinitions().find(
      (candidate) => candidate.type === node.type && candidate.version === node.version,
    );
  }

  #focusOutlineEntry(nodeId: NodeId): void {
    const entries = this.shadowRoot?.querySelectorAll<HTMLButtonElement>('button.outline-entry');
    if (entries === undefined) {
      return;
    }
    for (const entry of entries) {
      if (entry.dataset.nodeId === nodeId) {
        entry.focus();
        return;
      }
    }
  }

  /**
   * Inserts a fresh node for a palette block definition: at the destination a
   * `+` control chose when one is pending, otherwise into the selected node's
   * first declared slot when its definition declares slots, otherwise at the
   * end of the document roots — the same placement an outline insert
   * resolves to.
   */
  #insertDefinition(definition: BlockDefinition, explicit?: CommandDestination): void {
    const session = this.#session;
    const document = this.document;
    const destination = explicit ?? this.#resolveInsertDestination(definition);
    if (session === undefined || document === undefined || destination === undefined) {
      return;
    }
    const base = definition.type.slice(definition.type.indexOf('/') + 1);
    const nodeId = this.#allocateNodeId(base, collectDocumentIds(document.roots));
    const node: BlueprintNode = {
      authoring: {
        mode:
          isCoreProductionBlockType(definition.type) && definition.slots.length > 0
            ? 'structural'
            : 'content',
      },
      bindings: {},
      id: nodeId,
      properties: isCoreProductionBlockType(definition.type)
        ? coreProductionInitialProperties(definition.type)
        : {},
      slots: Object.fromEntries(definition.slots.map((slot) => [slot.id, []])),
      type: definition.type,
      version: definition.version,
    };
    const command: InsertNodeCommand = {
      ...this.#commandEnvelope(document, session),
      payload: { destination, node },
      type: 'studio.command/insert-node',
    };
    if (this.#runShellCommand(command)) {
      this.#completeInsert(nodeId, referenceText(definition.label));
    }
  }

  /** After a shell-run insertion: select and focus the new block, announce it once and end the destination. */
  #completeInsert(nodeId: NodeId, label: string): void {
    this.#selectNode(nodeId);
    this.activePane = 'canvas';
    this.#pendingFocusNodeId = nodeId;
    this.#announce('studio.shell/announce-inserted', { label });
    this.#clearInsertDestination();
  }

  #isReadOnly(): boolean {
    return (
      this.configuration?.session.sessionState === 'read-only' ||
      this.#session?.sessionState === 'read-only'
    );
  }

  #canInsertDefinition(definition: BlockDefinition): boolean {
    return this.#resolveInsertDestination(definition) !== undefined;
  }

  #canMutateNode(
    node: BlueprintNode,
    type:
      | 'studio.command/duplicate-node'
      | 'studio.command/remove-node'
      | 'studio.command/reorder-children',
  ): boolean {
    if (!this.#permits(type)) {
      return false;
    }
    const session = this.#session;
    if (session?.mode !== 'hybrid') {
      return true;
    }
    const document = this.document;
    if (document === undefined) {
      return false;
    }
    const location = findOutlineLocation(document.roots, node.id);
    if (
      location?.parentNodeId === undefined ||
      location.slot === undefined ||
      this.#subtreeContainsLockedNode(node)
    ) {
      return false;
    }
    const parent = findOutlineLocation(document.roots, location.parentNodeId)?.node;
    if (parent === undefined || !this.#isComposableSlot(parent, location.slot)) {
      return false;
    }
    const allowed =
      parent.authoring.slots?.[location.slot]?.allowedBlocks ?? parent.authoring.allowedBlocks;
    return type !== 'studio.command/duplicate-node' || allowed?.includes(node.type) !== false;
  }

  #insertionDestination(definition: BlockDefinition): CommandDestination | undefined {
    if (!this.#permits('studio.command/insert-node')) {
      return undefined;
    }
    const document = this.document;
    if (document === undefined) {
      return undefined;
    }
    const selected =
      this.selectedNodeId === undefined
        ? undefined
        : findOutlineLocation(document.roots, this.selectedNodeId)?.node;
    const selectedDefinition = selected === undefined ? undefined : this.#findDefinition(selected);
    if (selected === undefined || selectedDefinition === undefined) {
      return this.#session?.mode === 'hybrid' ? undefined : { position: document.roots.length };
    }
    for (const slot of selectedDefinition.slots) {
      if (!slot.accepts.types.includes(definition.type)) {
        continue;
      }
      if (this.#session?.mode === 'hybrid') {
        if (!this.#isComposableSlot(selected, slot.id)) {
          continue;
        }
        const allowed =
          selected.authoring.slots?.[slot.id]?.allowedBlocks ?? selected.authoring.allowedBlocks;
        if (allowed?.includes(definition.type) === false) {
          continue;
        }
      }
      return {
        parentNodeId: selected.id,
        position: selected.slots[slot.id]?.length ?? 0,
        slot: slot.id,
      };
    }
    return this.#session?.mode === 'hybrid' ? undefined : { position: document.roots.length };
  }

  /**
   * Whether a fresh node of this definition may be inserted at exactly this
   * destination. It applies the one rule `#insertCollections` lists the valid
   * collections by (permit, hybrid roots exclusion, accepted types,
   * composability, allowed blocks, slot maximum), so geometry, the `+`
   * controls, the cards and the command palette can never disagree.
   */
  #canInsertAt(definition: BlockDefinition, destination: CommandDestination): boolean {
    const roots = this.document?.roots;
    const target = this.#slotTarget(destination);
    return (
      roots !== undefined &&
      this.#permits('studio.command/insert-node') &&
      isDestinationCurrent(roots, destination) &&
      (destination.parentNodeId === undefined
        ? this.#session?.mode !== 'hybrid'
        : target !== undefined && this.#slotAdmits(target.parent, target.slot, definition))
    );
  }

  /** The parent node and its declared slot that a slot destination names, when both exist. */
  #slotTarget(
    destination: CommandDestination,
  ): { parent: BlueprintNode; slot: BlockDefinition['slots'][number] } | undefined {
    const { parentNodeId } = destination;
    const parent =
      parentNodeId === undefined
        ? undefined
        : findOutlineLocation(this.document?.roots ?? [], parentNodeId)?.node;
    const slot =
      parent === undefined
        ? undefined
        : this.#findDefinition(parent)?.slots.find(
            (candidate) => candidate.id === destination.slot,
          );
    return parent === undefined || slot === undefined ? undefined : { parent, slot };
  }

  /** The per-slot half of the insertion rule shared by `#insertCollections` and `#canInsertAt`. */
  #slotAdmits(
    parent: BlueprintNode,
    slot: BlockDefinition['slots'][number],
    definition: BlockDefinition,
  ): boolean {
    if (!slot.accepts.types.includes(definition.type)) {
      return false;
    }
    if (this.#session?.mode === 'hybrid') {
      if (!this.#isComposableSlot(parent, slot.id)) {
        return false;
      }
      const allowed =
        parent.authoring.slots?.[slot.id]?.allowedBlocks ?? parent.authoring.allowedBlocks;
      if (allowed?.includes(definition.type) === false) {
        return false;
      }
    }
    const entries = parent.slots[slot.id] ?? [];
    return typeof slot.maximum !== 'number' || entries.length < slot.maximum;
  }

  /**
   * The destination a card, a command-palette insert or the insertion
   * request uses for this definition: the pending `+` destination when it
   * admits the definition, nothing when it refuses it (the card is disabled,
   * never silently redirected while the add layer names the destination),
   * otherwise the selection-derived default.
   */
  #resolveInsertDestination(definition: BlockDefinition): CommandDestination | undefined {
    const pending = this.pendingInsertDestination;
    if (pending === undefined) {
      return this.#insertionDestination(definition);
    }
    return this.#canInsertAt(definition, pending) ? pending : undefined;
  }

  /**
   * The destination if at least one active definition may be inserted there.
   * The contextual Content and Model views offer no `+`: the add layer
   * belongs to the structure view, which they never show.
   */
  #offeredDestination(destination: CommandDestination | undefined): CommandDestination | undefined {
    return destination !== undefined &&
      this.inspectorMode !== 'content' &&
      this.inspectorMode !== 'model' &&
      this.#activeDefinitions().some((definition) => this.#canInsertAt(definition, destination))
      ? destination
      : undefined;
  }

  /** `Add to page`: the end of the document roots, when anything may go there. */
  #pageDestination(): CommandDestination | undefined {
    const roots = this.document?.roots;
    return roots === undefined ? undefined : this.#offeredDestination(pageEndDestination(roots));
  }

  /** `Add block into {slot}`: the end of a node's slot, when anything may go there. */
  #slotDestination(node: BlueprintNode, slot: string): CommandDestination | undefined {
    return this.#offeredDestination(slotEndDestination(node, slot));
  }

  /**
   * Every empty container slot on the page that may receive at least one
   * active definition, in depth-first document order; computed once per
   * render for the button list and the bands.
   */
  #addZones(): AddZone[] {
    this.#addZoneCache ??= emptySlots(this.document?.roots ?? [], (node) =>
      this.#findDefinition(node),
    ).flatMap(({ node, slot }) => {
      const destination = this.#slotDestination(node, slot);
      return destination === undefined ? [] : [{ destination, node, slot }];
    });
    return this.#addZoneCache;
  }

  /** Allocates `${base}-${n}` outside `taken` and records it there. */
  #allocateNodeId(base: string, taken: Set<NodeId>): NodeId {
    let counter = 1;
    let nodeId = `${base}-${counter}`;
    while (taken.has(nodeId)) {
      counter += 1;
      nodeId = `${base}-${counter}`;
    }
    taken.add(nodeId);
    return nodeId;
  }

  #clearInsertDestination(): void {
    this.pendingInsertDestination = undefined;
  }

  /** Whether the pending destination's collection still lists exactly the entries it did when chosen. */
  #pendingInsertEntriesUnchanged(destination: CommandDestination): boolean {
    const recorded = this.#pendingInsertEntries;
    const current = destinationEntries(this.document?.roots ?? [], destination);
    return (
      recorded !== undefined &&
      current?.length === recorded.length &&
      current.every((id, index) => id === recorded[index])
    );
  }

  /**
   * The text the add layer names a destination by: the collection's move
   * label ("Section (section-1): Content slot" or "document roots") and the
   * one-based position among the collection's entries plus the new one.
   */
  #destinationText(destination: CommandDestination): string | undefined {
    const roots = this.document?.roots;
    if (roots === undefined) {
      return undefined;
    }
    let collection: string;
    let length: number;
    if (destination.parentNodeId === undefined || destination.slot === undefined) {
      collection = this.#text('studio.shell/document-roots');
      length = roots.length;
    } else {
      const parent = findOutlineLocation(roots, destination.parentNodeId)?.node;
      if (parent === undefined) {
        return undefined;
      }
      collection = this.#text('studio.shell/move-slot-collection', {
        parent: `${this.#nodeLabel(parent)} (${parent.id})`,
        slot: this.#slotName(parent, destination.slot),
      });
      length = parent.slots[destination.slot]?.length ?? 0;
    }
    return this.#text('studio.shell/move-destination-option', {
      collection,
      count: String(length + 1),
      position: String(destination.position + 1),
    });
  }

  /** The declared slot label ("Content"), or the raw slot name when undeclared. */
  #slotName(node: BlueprintNode, slot: string): string {
    const declared = this.#findDefinition(node)?.slots.find((candidate) => candidate.id === slot);
    return declared === undefined ? slot : referenceText(declared.label);
  }

  #isComposableSlot(parent: BlueprintNode, slot: string): boolean {
    return (
      parent.authoring.mode === 'structural' || parent.authoring.slots?.[slot]?.composable === true
    );
  }

  #subtreeContainsLockedNode(node: BlueprintNode): boolean {
    const stack = [node];
    while (stack.length > 0) {
      const current = stack.pop();
      if (current === undefined) {
        break;
      }
      if (current.authoring.mode === 'locked') {
        return true;
      }
      for (const children of Object.values(current.slots)) {
        stack.push(...children);
      }
    }
    return false;
  }

  #moveNode(node: BlueprintNode, direction: -1 | 1): void {
    const session = this.#session;
    const document = this.document;
    if (
      session === undefined ||
      document === undefined ||
      !this.#canMutateNode(node, 'studio.command/reorder-children')
    ) {
      return;
    }
    const location = findOutlineLocation(document.roots, node.id);
    if (location === undefined) {
      return;
    }
    const targetIndex = location.index + direction;
    if (targetIndex < 0 || targetIndex >= location.collection.length) {
      return;
    }
    const order = location.collection.map((sibling) => sibling.id);
    const [movedId] = order.splice(location.index, 1);
    if (movedId === undefined) {
      return;
    }
    order.splice(targetIndex, 0, movedId);
    const payload: ReorderChildrenPayload = { order };
    if (location.parentNodeId !== undefined && location.slot !== undefined) {
      payload.parentNodeId = location.parentNodeId;
      payload.slot = location.slot;
    }
    const command: ReorderChildrenCommand = {
      ...this.#commandEnvelope(document, session),
      payload,
      type: 'studio.command/reorder-children',
    };
    if (this.#runShellCommand(command)) {
      this.#pendingFocusNodeId = node.id;
      this.#announce(
        direction === -1 ? 'studio.shell/announce-moved-up' : 'studio.shell/announce-moved-down',
        { label: this.#nodeLabel(node) },
      );
    }
  }

  #moveDestinations(node: BlueprintNode): MoveDestinationOption[] {
    const document = this.document;
    const source =
      document === undefined ? undefined : findOutlineLocation(document.roots, node.id);
    if (
      document === undefined ||
      source === undefined ||
      !this.#permits('studio.command/move-node')
    ) {
      return [];
    }
    const destinations: MoveDestinationOption[] = [];
    for (const target of this.#moveCollections(node)) {
      const sameCollection =
        source.parentNodeId === target.parentNodeId && source.slot === target.slot;
      const collection = target.collection.filter((candidate) => candidate.id !== node.id);
      for (let position = 0; position <= collection.length; position += 1) {
        if (sameCollection && position === source.index) {
          continue;
        }
        const destination: CommandDestination = { position };
        if (target.parentNodeId !== undefined && target.slot !== undefined) {
          destination.parentNodeId = target.parentNodeId;
          destination.slot = target.slot;
        }
        if (!this.#canMoveNodeTo(node, destination)) {
          continue;
        }
        const option: MoveDestinationOption = {
          destination,
          id: `${target.parentNodeId ?? 'document'}--${target.slot ?? 'roots'}--${position}`,
          label: this.#text('studio.shell/move-destination-option', {
            collection: target.label,
            count: String(collection.length + 1),
            position: String(position + 1),
          }),
        };
        if (sameCollection) {
          const order = collection.map((candidate) => candidate.id);
          order.splice(position, 0, node.id);
          option.order = order;
        }
        destinations.push(option);
      }
    }
    return destinations;
  }

  #moveCollections(node: BlueprintNode): MoveCollection[] {
    const document = this.document;
    if (document === undefined) {
      return [];
    }
    const collections: MoveCollection[] = [
      {
        collection: document.roots,
        label: this.#text('studio.shell/document-roots'),
        specificity: 0,
      },
    ];
    const stack = document.roots.map((node) => ({ node, specificity: 1 }));
    while (stack.length > 0) {
      const current = stack.shift();
      if (current === undefined) {
        break;
      }
      const { node: parent, specificity } = current;
      const definition = this.#findDefinition(parent);
      for (const children of Object.values(parent.slots)) {
        stack.push(...children.map((node) => ({ node, specificity: specificity + 1 })));
      }
      for (const slot of definition?.slots ?? []) {
        if (!slot.accepts.types.includes(node.type)) {
          continue;
        }
        collections.push({
          collection: parent.slots[slot.id] ?? [],
          label: this.#text('studio.shell/move-slot-collection', {
            parent: `${this.#nodeLabel(parent)} (${parent.id})`,
            slot: referenceText(slot.label),
          }),
          parentNodeId: parent.id,
          slot: slot.id,
          specificity,
        });
      }
    }
    return collections;
  }

  #canMoveNodeTo(node: BlueprintNode, destination: CommandDestination): boolean {
    const document = this.document;
    const source =
      document === undefined ? undefined : findOutlineLocation(document.roots, node.id);
    if (
      document === undefined ||
      source === undefined ||
      !this.#permits('studio.command/move-node')
    ) {
      return false;
    }
    const parentId = destination.parentNodeId;
    if (
      parentId === node.id ||
      (parentId !== undefined && findAncestry([node], parentId).length > 0)
    ) {
      return false;
    }
    const sameCollection =
      source.parentNodeId === destination.parentNodeId && source.slot === destination.slot;
    if (!sameCollection && source.parentNodeId !== undefined && source.slot !== undefined) {
      const sourceParent = findOutlineLocation(document.roots, source.parentNodeId)?.node;
      const sourceSlot = this.#findDefinition(sourceParent ?? node)?.slots.find(
        (candidate) => candidate.id === source.slot,
      );
      if (
        sourceParent === undefined ||
        sourceSlot === undefined ||
        source.collection.length - 1 < sourceSlot.minimum
      ) {
        return false;
      }
    }
    if (parentId === undefined) {
      const postMoveLength = document.roots.length - (source.parentNodeId === undefined ? 1 : 0);
      return this.#session?.mode !== 'hybrid' && destination.position <= postMoveLength;
    }
    if (destination.slot === undefined) {
      return false;
    }
    const parent = findOutlineLocation(document.roots, parentId)?.node;
    const definition = parent === undefined ? undefined : this.#findDefinition(parent);
    const slot = definition?.slots.find((candidate) => candidate.id === destination.slot);
    if (parent === undefined || slot?.accepts.types.includes(node.type) !== true) {
      return false;
    }
    const children = parent.slots[destination.slot] ?? [];
    const postMoveLength = children.length - (sameCollection ? 1 : 0);
    if (destination.position > postMoveLength || postMoveLength + 1 > slot.maximum) {
      return false;
    }
    if (this.#session?.mode !== 'hybrid') {
      return true;
    }
    if (
      source.parentNodeId === undefined ||
      source.slot === undefined ||
      this.#subtreeContainsLockedNode(node) ||
      !this.#isComposableSlot(parent, destination.slot)
    ) {
      return false;
    }
    const sourceParent = findOutlineLocation(document.roots, source.parentNodeId)?.node;
    if (sourceParent === undefined || !this.#isComposableSlot(sourceParent, source.slot)) {
      return false;
    }
    const allowed =
      parent.authoring.slots?.[destination.slot]?.allowedBlocks ?? parent.authoring.allowedBlocks;
    return allowed?.includes(node.type) !== false;
  }

  #moveNodeToOption(node: BlueprintNode, option: MoveDestinationOption): void {
    const session = this.#session;
    const document = this.document;
    if (
      session === undefined ||
      document === undefined ||
      !this.#canMoveNodeTo(node, option.destination)
    ) {
      return;
    }
    let command: MoveNodeCommand | ReorderChildrenCommand;
    if (option.order === undefined) {
      command = {
        ...this.#commandEnvelope(document, session),
        payload: { destination: structuredClone(option.destination), nodeId: node.id },
        type: 'studio.command/move-node',
      };
    } else {
      const payload: ReorderChildrenPayload = { order: [...option.order] };
      if (option.destination.parentNodeId !== undefined && option.destination.slot !== undefined) {
        payload.parentNodeId = option.destination.parentNodeId;
        payload.slot = option.destination.slot;
      }
      command = {
        ...this.#commandEnvelope(document, session),
        payload,
        type: 'studio.command/reorder-children',
      };
    }
    if (this.#runShellCommand(command)) {
      this.#selectNode(node.id);
      this.#pendingFocusNodeId = node.id;
      this.#announce('studio.shell/announce-moved-to', {
        destination: option.label,
        label: this.#nodeLabel(node),
      });
    }
  }

  #moveOutlineFocus(origin: EventTarget | null, direction: -1 | 1): void {
    const entries = [
      ...(this.shadowRoot?.querySelectorAll<HTMLButtonElement>('button.outline-entry') ?? []),
    ];
    const index = entries.findIndex((entry) => entry === origin);
    if (index === -1) {
      return;
    }
    entries[index + direction]?.focus();
  }

  /**
   * The one label of a block in rows, crumbs, headings, destinations and
   * announcements. A stack that is a column of a columns block reads
   * "Stack, column n of N"; the derived text is presentation only and is
   * never written to the document.
   */
  #nodeLabel(node: BlueprintNode): string {
    const definition = this.#findDefinition(node);
    const base = definition === undefined ? node.type : referenceText(definition.label);
    const column = columnPosition(this.document?.roots ?? [], node.id);
    return column === undefined
      ? base
      : this.#text('studio.shell/outline-column-of', {
          count: String(column.count),
          label: base,
          position: String(column.position),
        });
  }

  #onCanvasPointerCancel(event: PointerEvent): void {
    if (this.#drag?.pointerId === event.pointerId) {
      this.#cancelDrag();
    }
  }

  #onCanvasPointerMove(event: PointerEvent): void {
    const drag = this.#drag;
    if (drag === undefined) {
      return;
    }
    if (event.pointerId !== drag.pointerId) {
      return;
    }
    drag.active = true;
    const index = this.#resolveDragIndex(event, drag);
    if (index !== undefined) {
      drag.targetIndex = index;
    }
    this.requestUpdate();
  }

  #onCanvasPointerUp(event: PointerEvent): void {
    const drag = this.#drag;
    if (drag === undefined) {
      return;
    }
    if (event.pointerId !== drag.pointerId) {
      return;
    }
    this.#drag = undefined;
    this.#releaseDragCapture(drag);
    if (!drag.active) {
      // A plain press stays a click; selection is handled by the click path.
      return;
    }
    this.requestUpdate();
    if (drag.targetIndex === drag.sourceIndex) {
      this.#announce('studio.shell/announce-drag-cancelled', { label: drag.label });
      return;
    }
    const session = this.#session;
    const document = this.document;
    const dragged =
      document === undefined ? undefined : findOutlineLocation(document.roots, drag.nodeId)?.node;
    if (
      session === undefined ||
      document === undefined ||
      dragged === undefined ||
      !this.#canMutateNode(dragged, 'studio.command/reorder-children')
    ) {
      return;
    }
    const order = [...drag.order];
    const [movedId] = order.splice(drag.sourceIndex, 1);
    if (movedId === undefined) {
      return;
    }
    order.splice(drag.targetIndex, 0, movedId);
    const payload: ReorderChildrenPayload = { order };
    if (drag.parentNodeId !== undefined && drag.slot !== undefined) {
      payload.parentNodeId = drag.parentNodeId;
      payload.slot = drag.slot;
    }
    const command: ReorderChildrenCommand = {
      ...this.#commandEnvelope(document, session),
      payload,
      type: 'studio.command/reorder-children',
    };
    if (this.#runShellCommand(command)) {
      this.#selectNode(drag.nodeId);
      this.#announce('studio.shell/announce-dropped', {
        count: String(drag.order.length),
        label: drag.label,
        position: String(drag.targetIndex + 1),
      });
    }
  }

  /**
   * Starts tracking a possible chip drag. The drag only becomes active on the
   * first pointer move, so a plain press-and-release stays an ordinary click.
   * Read-only sessions and single-child collections never start tracking.
   */
  #onChipPointerDown(event: PointerEvent, node: BlueprintNode): void {
    const document = this.document;
    if (
      document === undefined ||
      this.#session === undefined ||
      !this.#canMutateNode(node, 'studio.command/reorder-children') ||
      event.button !== 0 ||
      this.#drag !== undefined
    ) {
      return;
    }
    const location = findOutlineLocation(document.roots, node.id);
    if (location === undefined || location.collection.length < 2) {
      return;
    }
    const drag: CanvasDragState = {
      active: false,
      label: this.#nodeLabel(node),
      nodeId: node.id,
      order: location.collection.map((sibling) => sibling.id),
      pointerId: event.pointerId,
      sourceIndex: location.index,
      targetIndex: location.index,
    };
    if (location.parentNodeId !== undefined && location.slot !== undefined) {
      drag.parentNodeId = location.parentNodeId;
      drag.slot = location.slot;
    }
    const chip = event.currentTarget;
    if (chip instanceof Element) {
      drag.capture = chip;
      try {
        chip.setPointerCapture(event.pointerId);
      } catch {
        // Pointer capture is a progressive nicety; tracking works without it.
      }
    }
    this.#drag = drag;
  }

  /**
   * The shared keyboard contract of every inspector value input: Enter parses
   * the text as JSON and commits it through set-property (with the viewport
   * when the input edits an override); Escape reverts to the committed value
   * and announces the cancellation. Both success and failure re-align the
   * input with the document, so a rejected command never leaves optimistic
   * text behind while focus stays on the input.
   */
  #onInspectorValueKeydown(
    event: KeyboardEvent,
    node: BlueprintNode,
    property: string,
    viewport: ThemeViewport | undefined,
  ): void {
    const input = event.currentTarget;
    if (!(input instanceof HTMLInputElement)) {
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const parsed = this.#parseJsonInput(input.value, property);
      if (parsed === undefined) {
        return;
      }
      this.#setNodeProperty(node, property, parsed.value, viewport);
      const current = this.#currentInspectorNode(node.id) ?? node;
      input.value = this.#serializedInspectorValue(current, property, viewport);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      const current = this.#currentInspectorNode(node.id) ?? node;
      input.value = this.#serializedInspectorValue(current, property, viewport);
      this.#announce('studio.shell/announce-edit-cancelled', { property });
    }
  }

  /**
   * A size-role select commits on change: the chosen role dispatches
   * set-size-role for the targeted context immediately. The placeholder is a
   * disabled option, so closing the picker without choosing — or choosing the
   * already-assigned role — dispatches nothing, and a rejected command snaps
   * the select back to the committed assignment.
   */
  #onLayoutRoleChange(event: Event, node: BlueprintNode, axis: SizeRoleAxis): void {
    const select = event.currentTarget;
    if (!(select instanceof HTMLSelectElement)) {
      return;
    }
    const role = select.value;
    const viewport = this.#sizeRoleTargetViewport();
    if (role.length === 0 || role === this.#assignedSizeRole(node, axis, viewport)) {
      return;
    }
    if (!this.#setSizeRole(node, axis, role)) {
      const current = this.#currentInspectorNode(node.id) ?? node;
      select.value = this.#assignedSizeRole(current, axis, viewport) ?? '';
    }
  }

  /**
   * The fallback identifier input used when no theme size-role vocabulary is
   * available. Enter validates the text as a bounded lower-case identifier
   * and dispatches set-size-role; an invalid identifier announces the
   * rejection and dispatches nothing. Escape reverts to the committed
   * assignment and announces the cancellation.
   */
  #onLayoutRoleInputKeydown(event: KeyboardEvent, node: BlueprintNode, axis: SizeRoleAxis): void {
    const input = event.currentTarget;
    if (!(input instanceof HTMLInputElement)) {
      return;
    }
    const viewport = this.#sizeRoleTargetViewport();
    if (event.key === 'Enter') {
      event.preventDefault();
      const role = input.value.trim();
      if (!isSizeRoleIdentifier(role)) {
        this.#announce('studio.shell/announce-size-role-invalid', { axis: this.#axisText(axis) });
        return;
      }
      this.#setSizeRole(node, axis, role);
      const current = this.#currentInspectorNode(node.id) ?? node;
      input.value = this.#assignedSizeRole(current, axis, viewport) ?? '';
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      const current = this.#currentInspectorNode(node.id) ?? node;
      input.value = this.#assignedSizeRole(current, axis, viewport) ?? '';
      this.#announce('studio.shell/announce-edit-cancelled', { property: this.#axisText(axis) });
    }
  }

  #onOutlineKeydown(event: KeyboardEvent, node: BlueprintNode): void {
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      const direction: -1 | 1 = event.key === 'ArrowUp' ? -1 : 1;
      if (event.altKey) {
        this.#moveNode(node, direction);
      } else {
        this.#moveOutlineFocus(event.currentTarget, direction);
      }
      return;
    }
    // The layer keys are the plain horizontal arrows: a modified arrow is
    // left to the platform (Alt+Arrow is the move modifier of the vertical pair).
    const modified = event.altKey || event.ctrlKey || event.metaKey || event.shiftKey;
    if (event.key === 'ArrowRight' && !modified) {
      // A container opens as the panel's current level; a block without
      // children opens its details with the first control focused.
      event.preventDefault();
      if (hasListedChildren(node)) {
        this.#openScope(node.id);
      } else {
        this.#activateNodeEditing(node.id);
      }
      return;
    }
    if (event.key === 'ArrowLeft' && !modified) {
      if (this.panelScopeId !== undefined) {
        event.preventDefault();
        this.#closeScope();
      }
      return;
    }
    if (event.key === 'Delete') {
      event.preventDefault();
      this.#deleteNode(node);
      return;
    }
    if ((event.key === 'd' || event.key === 'D') && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      this.#duplicateNode(node);
    }
  }

  #onPaletteEntryKeydown(event: KeyboardEvent): void {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') {
      return;
    }
    event.preventDefault();
    const buttons = this.#paletteResultButtons();
    const index = buttons.findIndex((button) => button === event.currentTarget);
    if (index === -1) {
      return;
    }
    if (event.key === 'ArrowDown') {
      buttons[index + 1]?.focus();
      return;
    }
    if (index === 0) {
      this.shadowRoot?.querySelector<HTMLInputElement>('.command-palette input')?.focus();
      return;
    }
    buttons[index - 1]?.focus();
  }

  #onPaletteInputKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.#paletteResultButtons()[0]?.focus();
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const first = this.#filteredPaletteEntries().find((entry) => !entry.disabled);
      if (first !== undefined) {
        this.#runPaletteEntry(first);
      }
    }
  }

  #onWorkspaceKeydown(event: KeyboardEvent): void {
    if ((event.key === 'k' || event.key === 'K') && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      this.#togglePalette(event);
      return;
    }
    if (event.key === 'Escape') {
      if (this.#cancelDrag()) {
        event.preventDefault();
        return;
      }
      if (this.paletteOpen === true) {
        event.preventDefault();
        this.#closePalette(true);
      }
      // Precedence: drag cancel, then the command palette, then the add
      // destination, then the panel unwind, which only a key from the
      // panel's own chrome may trigger.
      if (!event.defaultPrevented && this.#libraryEscapeClearsDestination(event)) {
        event.preventDefault();
        this.#clearInsertDestination();
        return;
      }
      if (
        event.defaultPrevented ||
        this.inspectorMode === 'content' ||
        this.inspectorMode === 'model' ||
        this.#panelEscapeOrigin(event) === null
      ) {
        return;
      }
      if (this.panelView === 'details') {
        event.preventDefault();
        this.#showStructure();
      } else if (this.panelScopeId !== undefined) {
        event.preventDefault();
        this.#closeScope();
      }
    }
  }

  /**
   * Escape inside the add layer clears a pending destination without closing
   * the layer or moving focus. The search field keeps the platform's Escape
   * (clearing its text) while it has text.
   */
  #libraryEscapeClearsDestination(event: KeyboardEvent): boolean {
    if (this.pendingInsertDestination === undefined) {
      return false;
    }
    const origin = event.composedPath()[0];
    if (
      !(origin instanceof Element) ||
      this.shadowRoot?.querySelector('aside.library')?.contains(origin) !== true
    ) {
      return false;
    }
    return !(origin instanceof HTMLInputElement && origin.value !== '');
  }

  #orderedViewports(): ThemeViewport[] {
    return [...(this.viewports ?? this.theme?.viewports ?? [])].sort(
      (left, right) => left.order - right.order,
    );
  }

  #activeDesignControls(): ThemeDesignControl[] | undefined {
    return this.designControls ?? this.theme?.designControls;
  }

  #propertyTargetViewport(): ThemeViewport | undefined {
    const viewport = this.activeViewport;
    return viewport === undefined || viewport.base ? undefined : viewport;
  }

  #designControlProperty(definition: BlockDefinition, control: ThemeDesignControl): string {
    return (
      definition.propertyControls?.find((entry) => entry.control.endsWith(`/${control.id}`))
        ?.property ?? control.id
    );
  }

  #applyRecipe(node: BlueprintNode, recipeId: string): void {
    const document = this.document;
    const session = this.#session;
    const theme = this.theme;
    if (
      document === undefined ||
      session === undefined ||
      theme === undefined ||
      !this.#permits('studio.command/batch')
    ) {
      return;
    }
    let operations;
    try {
      operations = recipeSelectionOperations(node, theme, recipeId);
    } catch (error) {
      this.#announce('studio.shell/announce-command-failed', {
        message: error instanceof Error ? error.message : String(error),
      });
      return;
    }
    const command: BlueprintCommand = {
      ...this.#commandEnvelope(document, session),
      payload: { operations },
      type: 'studio.command/batch',
    };
    if (!this.#runShellCommand(command)) {
      return;
    }
    const recipe = theme.recipes.find((candidate) => candidate.id === recipeId);
    this.#announce('studio.shell/announce-recipe-applied', {
      recipe: recipe === undefined ? recipeId : referenceText(recipe.label),
    });
  }

  #applyPattern(pattern: PatternDocument): void {
    const session = this.#session;
    const document = this.document;
    const destination = this.#patternDestination(pattern);
    if (session === undefined || document === undefined || destination === undefined) {
      return;
    }
    const command: ApplyPatternCommand = {
      ...this.#commandEnvelope(document, session),
      payload: {
        destination,
        idMap: this.#allocatePatternIdMap(pattern),
        nodes: structuredClone(pattern.roots),
        pattern: { id: pattern.id, revision: pattern.revision, version: pattern.version },
      },
      type: 'studio.command/apply-pattern',
    };
    if (this.#runShellCommand(command)) {
      this.#clearInsertDestination();
      const first = command.payload.idMap[pattern.roots[0]?.id ?? ''];
      if (first !== undefined) {
        this.#selectNode(first);
        this.#pendingFocusNodeId = first;
      }
      this.#announce('studio.shell/announce-pattern-applied', {
        pattern: referenceText(pattern.label),
      });
    }
  }

  #allocatePatternIdMap(pattern: PatternDocument): Record<NodeId, NodeId> {
    const taken = collectDocumentIds(this.document?.roots ?? []);
    const idMap: Record<NodeId, NodeId> = {};
    const queue = [...pattern.roots];
    while (queue.length > 0) {
      const current = queue.shift();
      if (current === undefined) {
        break;
      }
      let counter = 1;
      let candidate = `${current.id}-pattern-${counter}`;
      while (taken.has(candidate)) {
        counter += 1;
        candidate = `${current.id}-pattern-${counter}`;
      }
      taken.add(candidate);
      Object.defineProperty(idMap, current.id, {
        configurable: true,
        enumerable: true,
        value: candidate,
        writable: true,
      });
      for (const children of Object.values(current.slots)) {
        queue.push(...children);
      }
    }
    return idMap;
  }

  #patternDestination(pattern: PatternDocument): CommandDestination | undefined {
    if (!this.#permits('studio.command/apply-pattern') || pattern.roots.length === 0) {
      return undefined;
    }
    const definitions = this.#activeDefinitions();
    const pending = [...pattern.roots];
    while (pending.length > 0) {
      const node = pending.pop();
      if (
        node === undefined ||
        !definitions.some(
          (definition) => definition.type === node.type && definition.version === node.version,
        )
      ) {
        return undefined;
      }
      for (const children of Object.values(node.slots)) {
        pending.push(...children);
      }
    }
    const document = this.document;
    if (document === undefined) {
      return undefined;
    }
    const chosen = this.pendingInsertDestination;
    if (chosen !== undefined) {
      // A destination chosen through a `+` is honoured exactly, or the
      // pattern is unavailable there; it is never silently redirected.
      return this.#patternFitsAt(pattern, chosen) ? chosen : undefined;
    }
    const selected =
      this.selectedNodeId === undefined
        ? undefined
        : findOutlineLocation(document.roots, this.selectedNodeId)?.node;
    const selectedDefinition = selected === undefined ? undefined : this.#findDefinition(selected);
    if (selected !== undefined && selectedDefinition !== undefined) {
      for (const slot of selectedDefinition.slots) {
        const children = selected.slots[slot.id] ?? [];
        if (
          pattern.roots.every((root) => slot.accepts.types.includes(root.type)) &&
          children.length + pattern.roots.length <= slot.maximum &&
          (this.#session?.mode !== 'hybrid' ||
            (this.#isComposableSlot(selected, slot.id) &&
              pattern.roots.every((root) => {
                const allowed =
                  selected.authoring.slots?.[slot.id]?.allowedBlocks ??
                  selected.authoring.allowedBlocks;
                return allowed?.includes(root.type) !== false;
              })))
        ) {
          return { parentNodeId: selected.id, position: children.length, slot: slot.id };
        }
      }
    }
    return this.#session?.mode === 'hybrid' ? undefined : { position: document.roots.length };
  }

  /** Whether every root of the pattern may be inserted together at this destination. */
  #patternFitsAt(pattern: PatternDocument, destination: CommandDestination): boolean {
    const definitions = this.#activeDefinitions();
    const target = this.#slotTarget(destination);
    return (
      pattern.roots.every((root) => {
        const definition = definitions.find(
          (candidate) => candidate.type === root.type && candidate.version === root.version,
        );
        return definition !== undefined && this.#canInsertAt(definition, destination);
      }) &&
      (destination.parentNodeId === undefined ||
        (target !== undefined &&
          (target.parent.slots[target.slot.id]?.length ?? 0) + pattern.roots.length <=
            target.slot.maximum))
    );
  }

  /**
   * The executable command list for the palette. Selection-scoped structural
   * entries reuse the outline's dispatch paths and its exact disabled rules;
   * insert entries mirror the block palette. Labels are catalog strings so the
   * case-insensitive filter operates on localized text.
   */
  #paletteEntries(): CommandPaletteEntry[] {
    const session = this.#session;
    const document = this.document;
    const readOnly = this.#isReadOnly();
    const entries: CommandPaletteEntry[] = [];
    const location =
      document === undefined || this.selectedNodeId === undefined
        ? undefined
        : findOutlineLocation(document.roots, this.selectedNodeId);
    if (location !== undefined) {
      const node = location.node;
      const first = location.index === 0;
      const last = location.index === location.collection.length - 1;
      entries.push(
        {
          disabled: !this.#canMutateNode(node, 'studio.command/reorder-children') || first,
          id: 'move-up',
          label: this.#text('studio.shell/move-up'),
          run: (): void => {
            this.#moveNode(node, -1);
          },
        },
        {
          disabled: !this.#canMutateNode(node, 'studio.command/reorder-children') || last,
          id: 'move-down',
          label: this.#text('studio.shell/move-down'),
          run: (): void => {
            this.#moveNode(node, 1);
          },
        },
        {
          disabled: !this.#canMutateNode(node, 'studio.command/duplicate-node'),
          id: 'duplicate',
          label: this.#text('studio.shell/duplicate'),
          run: (): void => {
            this.#duplicateNode(node);
          },
        },
        {
          disabled: !this.#canMutateNode(node, 'studio.command/remove-node'),
          id: 'delete',
          label: this.#text('studio.shell/delete'),
          run: (): void => {
            this.#deleteNode(node);
          },
        },
      );
      for (const destination of this.#moveDestinations(node)) {
        entries.push({
          disabled: false,
          id: `move-to-${destination.id}`,
          label: this.#text('studio.shell/command-move-to', {
            destination: destination.label,
          }),
          run: (): void => {
            this.#moveNodeToOption(node, destination);
          },
        });
      }
    }
    entries.push(
      {
        disabled:
          readOnly ||
          !this.#permits('studio.command/restore-node') ||
          this.#lastRestorableNode() === undefined,
        id: 'restore-last-deleted',
        label: this.#text('studio.shell/restore-last-deleted'),
        run: (): void => {
          this.#restoreLastNode();
        },
      },
      {
        disabled: readOnly || session?.canUndo !== true,
        id: 'undo',
        label: this.#text('studio.shell/undo'),
        run: (): void => {
          this.undo();
        },
      },
      {
        disabled: readOnly || session?.canRedo !== true,
        id: 'redo',
        label: this.#text('studio.shell/redo'),
        run: (): void => {
          this.redo();
        },
      },
      {
        disabled: location === undefined,
        id: 'clear-selection',
        label: this.#text('studio.shell/command-clear-selection'),
        run: (): void => {
          this.#session?.clearSelection();
          this.selectedNodeId = undefined;
          this.#previewSurface?.selectNode(undefined);
          this.#announce('studio.shell/announce-selection-cleared');
        },
      },
    );
    for (const definition of this.#activeDefinitions()) {
      entries.push({
        disabled: !this.#canInsertDefinition(definition),
        id: `insert-${definition.type}@${definition.version}`,
        label: this.#text('studio.shell/command-insert', {
          label: referenceText(definition.label),
        }),
        run: (): void => {
          this.#insertDefinition(definition);
        },
      });
    }
    // The column cards' counterparts, under the same disabled rule.
    const columns = this.#columnsCatalog()?.columns;
    const columnsDisabled = columns === undefined || !this.#canInsertDefinition(columns);
    for (const count of columns === undefined ? [] : COLUMN_COUNTS) {
      entries.push({
        disabled: columnsDisabled,
        id: `insert-columns-${count}`,
        label: this.#text('studio.shell/command-insert', {
          label: this.#text('studio.shell/add-columns', { count: String(count) }),
        }),
        run: (): void => {
          this.#requestColumnsInsert(count);
        },
      });
    }
    for (const pattern of this.#activePatterns()) {
      entries.push({
        disabled: this.#patternDestination(pattern) === undefined,
        id: `apply-pattern-${pattern.id}`,
        label: this.#text('studio.shell/command-apply-pattern', {
          pattern: referenceText(pattern.label),
        }),
        run: (): void => {
          this.#applyPattern(pattern);
        },
      });
    }
    return entries;
  }

  #paletteResultButtons(): HTMLButtonElement[] {
    return [
      ...(this.shadowRoot?.querySelectorAll<HTMLButtonElement>('button.command-entry') ?? []),
    ].filter((button) => !button.disabled);
  }

  /**
   * Parses one inspector input as JSON. A parse failure announces the
   * invalid-value message naming the edited field and returns undefined so
   * the caller dispatches nothing; the wrapper object distinguishes a parsed
   * null from a failed parse.
   */
  #parseJsonInput(text: string, label: string): { value: JsonValue } | undefined {
    try {
      return { value: JSON.parse(text) as JsonValue };
    } catch {
      this.#announce('studio.shell/announce-invalid-value', { label });
      return undefined;
    }
  }

  /**
   * Announces a preview lifecycle message through the single polite live
   * region. The region is a single slot, so deterministic ordering matters:
   * when an operation-outcome announcement from the same tick is still
   * waiting to render, the lifecycle text is queued and takes the slot on
   * the update after the outcome has rendered — queued after, never instead.
   * With no announcement in flight it is announced immediately. A queued
   * text identical to the one already showing is dropped, since re-rendering
   * identical text would not be re-announced anyway.
   */
  #queuePreviewAnnouncement(
    key: StudioMessageKey,
    parameters: Readonly<Record<string, string>>,
  ): void {
    if (this.#announcementPending && this.isUpdatePending) {
      this.#pendingPreviewAnnouncements.push(messageText(key, this.messages, parameters));
      return;
    }
    this.#announce(key, parameters);
  }

  #rebuildRegistry(): void {
    const registry = new BlockRegistry();
    for (const definition of this.#activeDefinitions()) {
      try {
        registry.register(definition);
      } catch {
        // An unregistrable definition surfaces as block-unavailable diagnostics.
      }
    }
    this.#registry = registry;
  }

  #rebuildSession(): void {
    this.hoveredNodeId = undefined;
    this.focusedEntryNodeId = undefined;
    this.pendingInsertDestination = undefined;
    // A replaced document or session starts at the page level. The layer is
    // re-derived from the contextual mode rather than reset: the docked
    // Content and Model panels live in the details layer and must survive the
    // wrapper's first update and every save reconciliation.
    const previousView = this.panelView;
    const detailsHeldFocus = this.#inspectorHoldsFocus();
    this.panelScopeId = undefined;
    this.#announcedLayer = undefined;
    this.panelView =
      this.inspectorMode === 'content' || this.inspectorMode === 'model' ? 'details' : 'structure';
    if (previousView === 'details' && this.panelView === 'structure') {
      // The details layer closes under the author (the selection it showed
      // is cleared below): the layer change is announced like any other, and
      // focus that sat in the closing layer lands on the structure region.
      if (detailsHeldFocus) {
        void this.updateComplete.then(() => {
          if (this.panelView === 'structure' && this.#shadowActiveElement() === null) {
            this.shadowRoot?.querySelector<HTMLElement>('aside.outline')?.focus();
          }
        });
      }
      this.#announceLayer('structure', undefined);
    }
    // The library opens on a blank document and collapses on a non-empty one,
    // but a library that holds keyboard focus is never hidden by a host
    // snapshot: that would drop focus to the body while the author is typing.
    const empty = (this.document?.roots.length ?? 0) === 0;
    if (empty || !this.#libraryHoldsFocus()) {
      this.libraryOpen = empty;
    }
    if (this.commandSession !== undefined) {
      this.#session = this.commandSession;
      this.#sessionGeneration =
        this.configuration?.session.sessionGeneration ?? this.document?.revision ?? '';
    } else if (this.document === undefined) {
      this.#session = undefined;
      this.#sessionGeneration = '';
    } else {
      const generation = this.configuration?.session.sessionGeneration ?? this.document.revision;
      const options: StudioSessionOptions = {
        document: this.document,
        sessionGeneration: generation,
        sessionState: this.configuration?.session.sessionState ?? 'editable',
      };
      if (this.configuration !== undefined) {
        options.mode = resolveSessionMode(this.configuration.session);
      }
      const maximumHistoryEntries = this.configuration?.session.limits.maxHistoryEntries;
      if (maximumHistoryEntries !== undefined) {
        options.maximumHistoryEntries = maximumHistoryEntries;
      }
      this.#session = new StudioSession(options);
      this.#sessionGeneration = generation;
    }
    this.#drag = undefined;
    this.selectedNodeId = undefined;
    this.#previewSurface?.selectNode(undefined);
    this.#syncDirty();
  }

  #permits(type: StudioCommand['type']): boolean {
    const session = this.#session;
    return session !== undefined && permittedCommandTypes(session.mode).has(type);
  }

  #releaseDragCapture(drag: CanvasDragState): void {
    try {
      drag.capture?.releasePointerCapture(drag.pointerId);
    } catch {
      // The capture may already have been released by the platform.
    }
  }

  #removeBinding(node: BlueprintNode, port: string): void {
    const session = this.#session;
    const document = this.document;
    if (
      session === undefined ||
      document === undefined ||
      !this.#permits('studio.command/remove-binding')
    ) {
      return;
    }
    const command: RemoveBindingCommand = {
      ...this.#commandEnvelope(document, session),
      payload: { nodeId: node.id, port },
      type: 'studio.command/remove-binding',
    };
    if (this.#runShellCommand(command)) {
      this.#announce('studio.shell/announce-binding-removed', { port });
    }
  }

  #resetInheritedProperty(node: BlueprintNode, property: string): void {
    const session = this.#session;
    const document = this.document;
    if (
      session === undefined ||
      document === undefined ||
      !this.#permits('studio.command/reset-inherited-property') ||
      Object.keys(node.responsive?.[property] ?? {}).length === 0
    ) {
      return;
    }
    const command: ResetInheritedPropertyCommand = {
      ...this.#commandEnvelope(document, session),
      payload: { nodeId: node.id, property },
      type: 'studio.command/reset-inherited-property',
    };
    if (this.#runShellCommand(command)) {
      this.#announce('studio.shell/announce-inheritance-reset', { property });
    }
  }

  #renderBreadcrumb(): TemplateResult | typeof nothing {
    const roots = this.document?.roots;
    if (roots === undefined || this.selectedNodeId === undefined) {
      return nothing;
    }
    const ancestry = findAncestry(roots, this.selectedNodeId);
    if (ancestry.length === 0) {
      return nothing;
    }
    return html`
      <nav class="breadcrumb" aria-label=${this.#text('studio.shell/breadcrumb-label')}>
        <ol>
          ${ancestry.map((node, index) =>
            index === ancestry.length - 1
              ? html`<li>
                  <span class="breadcrumb-current" aria-current="true">
                    ${this.#nodeLabel(node)}
                  </span>
                </li>`
              : html`<li>
                  <button
                    type="button"
                    class="breadcrumb-entry"
                    data-node-id=${node.id}
                    @click=${(): void => {
                      this.#selectNode(node.id);
                    }}
                  >
                    ${this.#nodeLabel(node)}
                  </button>
                </li>`,
          )}
        </ol>
      </nav>
    `;
  }

  #renderCanvasNode(node: BlueprintNode): TemplateResult {
    const definition = this.#findDefinition(node);
    const nested = Object.entries(node.slots);
    return html`
      <li>
        <button
          type="button"
          class="canvas-chip"
          data-node-id=${node.id}
          aria-pressed=${this.selectedNodeId === node.id ? 'true' : 'false'}
          @click=${(): void => {
            this.#selectNode(node.id);
          }}
          @pointerdown=${(event: PointerEvent): void => {
            this.#onChipPointerDown(event, node);
          }}
        >
          ${definition === undefined ? node.type : referenceText(definition.label)}
        </button>
        ${nested.map(
          ([slot, children]) => html`
            <section class="node-children" aria-label=${slot}>
              <ul class="tree">
                ${children.map((child) => this.#renderCanvasNode(child))}
              </ul>
            </section>
          `,
        )}
      </li>
    `;
  }

  /**
   * The palette is deliberately not an ARIA combobox: it is a labelled region
   * holding a labelled filter input and a list of real, natively focusable
   * buttons. Arrow keys move between the input and the enabled results, Enter
   * activates, Tab leaves in document order — behavior documented in
   * docs/experience/keyboard.md.
   */
  #renderCommandPalette(): TemplateResult | typeof nothing {
    if (this.paletteOpen !== true) {
      return nothing;
    }
    const entries = this.#filteredPaletteEntries();
    return html`
      <section
        class="command-palette"
        aria-label=${this.#text('studio.shell/command-palette-label')}
      >
        <input
          type="text"
          aria-label=${this.#text('studio.shell/command-palette-input-label')}
          .value=${this.paletteFilter ?? ''}
          @input=${(event: Event): void => {
            const target = event.currentTarget;
            if (target instanceof HTMLInputElement) {
              this.paletteFilter = target.value;
            }
          }}
          @keydown=${(event: KeyboardEvent): void => {
            this.#onPaletteInputKeydown(event);
          }}
        />
        <p class="hint">${this.#text('studio.shell/command-palette-hint')}</p>
        ${
          entries.length === 0
            ? html`<p class="command-empty">${this.#text('studio.shell/command-palette-empty')}</p>`
            : html`
                <ul
                  class="command-results"
                  aria-label=${this.#text('studio.shell/command-palette-results-label')}
                >
                  ${entries.map(
                    (entry) => html`
                      <li>
                        <button
                          type="button"
                          class="command-entry"
                          data-command-id=${entry.id}
                          ?disabled=${entry.disabled}
                          @click=${(): void => {
                            this.#runPaletteEntry(entry);
                          }}
                          @keydown=${(event: KeyboardEvent): void => {
                            this.#onPaletteEntryKeydown(event);
                          }}
                        >
                          ${entry.label}
                        </button>
                      </li>
                    `,
                  )}
                </ul>
              `
        }
      </section>
    `;
  }

  #renderDiagnostic(entry: StudioDiagnostic): TemplateResult {
    const severity = html`<span class="diagnostic-severity">
      ${this.#text(SEVERITY_MESSAGE_KEYS[entry.severity])}
    </span>`;
    const message = diagnosticText(entry);
    const nodeId = entry.location?.nodeId;
    return html`
      <li data-diagnostic-code=${entry.code}>
        ${
          nodeId === undefined
            ? html`<span class="diagnostic-text">${severity} ${message}</span>`
            : html`
                <button
                  type="button"
                  class="diagnostic-entry"
                  data-node-id=${nodeId}
                  @click=${(): void => {
                    this.#revealDiagnosticNode(nodeId);
                  }}
                >
                  ${severity} ${message}
                </button>
              `
        }
      </li>
    `;
  }

  /** Textual drop-position readout shown while a canvas chip drag is active. */
  #renderDropIndicator(): TemplateResult | typeof nothing {
    const drag = this.#drag;
    if (drag?.active !== true) {
      return nothing;
    }
    return html`
      <p class="drop-indicator">
        ${this.#text('studio.shell/drag-drop-position', {
          count: String(drag.order.length),
          label: drag.label,
          position: String(drag.targetIndex + 1),
        })}
      </p>
    `;
  }

  /**
   * The editable inspector: contract facts, then keyboard-complete editors
   * for base properties, bindings, and active-viewport overrides. Tab order
   * follows the DOM order documented in docs/experience/keyboard.md. Each
   * mutating section derives its disabled state from the canonical session
   * mode; read-only sessions additionally state the reason textually.
   */
  #renderInspector(node: BlueprintNode): TemplateResult {
    const readOnly = this.#isReadOnly();
    return html`
      <h3 class="inspector-selection">${this.#nodeLabel(node)}</h3>
      ${readOnly ? html`<p class="hint inspector-read-only">${this.#text('studio.shell/inspector-read-only')}</p>` : nothing}
      ${this.#renderScalarPorts(node, readOnly)}
      ${this.#renderInspectorAuthoringControls(node, readOnly)}
      ${this.#renderScalarProperties(node, !this.#permits('studio.command/set-property'))}
      ${this.#renderInspectorRecipes(node, !this.#permits('studio.command/batch'))}
      ${this.#renderInspectorDesign(node, !this.#permits('studio.command/set-property'))}
      ${this.#renderInspectorLayout(node, !this.#permits('studio.command/set-size-role'))}
      ${this.#renderInspectorResourceBindings(node, !this.#permits('studio.command/set-binding'))}
      <details class="inspector-advanced">
        <summary>${this.#text('studio.shell/inspector-advanced')}</summary>
        <p class="hint">${this.#text('studio.shell/inspector-hint')}</p>
        <dl>
          <div>
            <dt>${this.#text('studio.shell/inspector-identifier')}</dt>
            <dd>${node.id}</dd>
          </div>
          <div>
            <dt>${this.#text('studio.shell/inspector-type')}</dt>
            <dd>${node.type}@${node.version}</dd>
          </div>
        </dl>
        ${this.#renderInspectorProperties(node, !this.#permits('studio.command/set-property'))}
        ${this.#renderInspectorBindings(node, !this.#permits('studio.command/set-binding'))}
        ${this.#renderInspectorOverrides(node, !this.#permits('studio.command/set-property'))}
      </details>
    `;
  }

  #renderScalarProperties(node: BlueprintNode, readOnly: boolean): TemplateResult {
    const definition = this.#findDefinition(node);
    const properties = definition?.propertySchema.properties;
    const registry = this.authoringControlRegistry ?? this.#defaultAuthoringControlRegistry;
    const schemaMap =
      properties !== null && typeof properties === 'object' && !Array.isArray(properties)
        ? properties
        : {};
    return html`<section class="scalar-properties">
      ${(definition?.propertyControls ?? [])
        .filter((metadata) => !registry.supports(metadata.control))
        .map((metadata) => {
          const schema = schemaMap[metadata.property];
          if (!isScalarControlSchema(schema)) return nothing;
          const viewport = this.#propertyTargetViewport();
          const value =
            viewport === undefined
              ? node.properties[metadata.property]
              : (node.responsive?.[metadata.property]?.[viewport.id] ??
                node.properties[metadata.property]);
          return renderScalarControl({
            key: 'property:' + metadata.property,
            label:
              metadata.label === undefined
                ? metadata.property.replaceAll('-', ' ')
                : referenceText(metadata.label),
            schema,
            value,
            readOnly,
            onChange: (next) => {
              this.#setNodeProperty(node, metadata.property, next, viewport);
            },
          });
        })}
    </section>`;
  }

  #renderScalarPorts(node: BlueprintNode, readOnly: boolean): TemplateResult {
    return html`<section class="scalar-ports">
      ${(this.#findDefinition(node)?.ports ?? []).map((port) => {
        const control = port.authoring?.control;
        if (
          port.multiple ||
          ![
            'studio.control/single-line-text',
            'studio.control/multi-line-text',
            'studio.control/switch',
            'studio.control/number',
            'studio.control/integer',
          ].includes(control ?? '')
        )
          return nothing;
        const binding = node.bindings[port.id];
        const entry = binding?.source.kind === 'entry-field' ? binding.source : undefined;
        const editableEntry = entry !== undefined && this.#canEditEntryField(entry.fieldPath);
        const value = entry
          ? this.entryValues?.read(entry.fieldPath)
          : binding?.source.kind === 'static-value'
            ? binding.source.value
            : undefined;
        const schema: JsonSchema = {
          type:
            port.valueType === 'boolean'
              ? 'boolean'
              : port.valueType === 'integer'
                ? 'integer'
                : port.valueType === 'number'
                  ? 'number'
                  : 'string',
        };
        return renderScalarControl({
          key: 'port:' + port.id,
          label: referenceText(port.label),
          schema,
          value,
          multiline: control === 'studio.control/multi-line-text',
          readOnly:
            readOnly ||
            port.authoring?.readOnly === true ||
            (binding !== undefined && binding.source.kind !== 'static-value' && !editableEntry) ||
            (!entry && !this.#permits('studio.command/set-binding')),
          onChange: (next) => {
            this.#setAuthoringPortValue(node, port.id, next);
          },
        });
      })}
    </section>`;
  }

  #canEditEntryField(path: readonly LocalName[]): boolean {
    if (this.entryValues === undefined || this.#isReadOnly()) return false;
    let fields = this.contentModel?.fields;
    let field: FieldDefinition | undefined;
    for (const id of path) {
      field = fields?.find((candidate) => candidate.id === id);
      if (
        field === undefined ||
        field.authoring?.readOnly === true ||
        field.authoring?.hidden === true
      )
        return false;
      fields = field.fields;
    }
    return field !== undefined;
  }

  /**
   * Studio-owned custom fields are rendered as stable holders and mounted in
   * `updated()`. The imperative editor/library lifecycle therefore remains
   * behind the authoring registry instead of becoming part of Lit templates or
   * the public shell contract.
   */
  #renderInspectorAuthoringControls(
    node: BlueprintNode,
    readOnly: boolean,
  ): TemplateResult | typeof nothing {
    const targets = this.#inspectorAuthoringTargets(node, readOnly);
    if (targets.length === 0) return nothing;
    return html`
      <section class="inspector-section inspector-authoring" aria-label="Studio authoring controls">
        <h3>Authoring</h3>
        <ul class="inspector-rows">
          ${targets.map(
            (target) => html`
              <li
                class="inspector-authoring-row"
                data-authoring-kind=${target.kind}
                data-authoring-name=${target.name}
              >
                <span class="inspector-name">${target.label}</span>
                <div
                  class="inspector-authoring-control"
                  data-authoring-key=${target.key}
                  data-authoring-control=${target.control}
                ></div>
              </li>
            `,
          )}
        </ul>
      </section>
    `;
  }

  #inspectorAuthoringTargets(node: BlueprintNode, readOnly: boolean): InspectorAuthoringTarget[] {
    const definition = this.#findDefinition(node);
    if (definition === undefined) return [];
    const registry = this.authoringControlRegistry ?? this.#defaultAuthoringControlRegistry;
    const targets: InspectorAuthoringTarget[] = [];
    for (const propertyControl of definition.propertyControls ?? []) {
      if (!registry.supports(propertyControl.control)) continue;
      const value =
        propertyControl.control === STUDIO_AUTHORING_CONTROL_IDS.scopedCss
          ? defaultAuthoringControlValue(propertyControl.control)
          : (node.properties[propertyControl.property] ??
            (isStudioAuthoringControlId(propertyControl.control)
              ? defaultAuthoringControlValue(propertyControl.control)
              : undefined));
      targets.push({
        control: propertyControl.control,
        key: `${node.id}:property:${propertyControl.property}`,
        kind: 'property',
        label:
          propertyControl.label === undefined
            ? propertyControl.help === undefined
              ? propertyControl.property
              : referenceText(propertyControl.help)
            : referenceText(propertyControl.label),
        name: propertyControl.property,
        nodeId: node.id,
        readOnly,
        value,
      });
    }
    for (const port of definition.ports) {
      const metadata = port.authoring;
      if (metadata?.control === undefined || !registry.supports(metadata.control)) {
        continue;
      }
      const binding = node.bindings[port.id];
      const value =
        binding?.source.kind === 'entry-field' && this.entryValues !== undefined
          ? this.entryValues.read(binding.source.fieldPath)
          : binding?.source.kind === 'static-value'
            ? binding.source.value
            : isStudioAuthoringControlId(metadata.control)
              ? defaultAuthoringControlValue(metadata.control)
              : undefined;
      targets.push({
        ...(binding === undefined ? {} : { binding }),
        control: metadata.control,
        key: `${node.id}:port:${port.id}`,
        kind: 'port',
        label: referenceText(port.label) || port.id,
        name: port.id,
        nodeId: node.id,
        ...(metadata.profile === undefined ? {} : { profile: metadata.profile }),
        readOnly:
          readOnly ||
          metadata.readOnly === true ||
          (binding !== undefined &&
            binding.source.kind !== 'static-value' &&
            !(
              binding.source.kind === 'entry-field' &&
              this.#canEditEntryField(binding.source.fieldPath)
            )),
        value,
      });
    }
    return targets;
  }

  async #synchronizeAuthoringControls(): Promise<void> {
    if (!this.isConnected || this.shadowRoot === null) {
      this.#destroyAuthoringControls();
      return;
    }
    const node =
      this.document === undefined || this.selectedNodeId === undefined
        ? undefined
        : this.#currentInspectorNode(this.selectedNodeId);
    const targets =
      node === undefined ? [] : this.#inspectorAuthoringTargets(node, this.#isReadOnly());
    const holders = new Map<string, HTMLElement>();
    for (const holder of this.shadowRoot.querySelectorAll<HTMLElement>('[data-authoring-key]')) {
      const key = holder.dataset.authoringKey;
      if (key !== undefined) holders.set(key, holder);
    }
    const expected = new Set(targets.map((target) => target.key));
    for (const [key, mounted] of this.#authoringControls) {
      if (!expected.has(key) || holders.get(key) !== mounted.holder) {
        this.#destroyAuthoringControl(key, mounted);
      }
    }
    for (const key of [...this.#authoringDiagnostics.keys()]) {
      if (!expected.has(key)) this.#authoringDiagnostics.delete(key);
    }

    const registry = this.authoringControlRegistry ?? this.#defaultAuthoringControlRegistry;
    for (const target of targets) {
      const holder = holders.get(target.key);
      if (holder === undefined) continue;
      const signature = authoringTargetSignature(target);
      const mounted = this.#authoringControls.get(target.key);
      if (mounted?.holder === holder && mounted.signature === signature) continue;
      const restoreFocus =
        mounted !== undefined &&
        this.shadowRoot.activeElement !== null &&
        mounted.holder.contains(this.shadowRoot.activeElement);
      if (mounted !== undefined) this.#destroyAuthoringControl(target.key, mounted);
      holder.replaceChildren();
      try {
        const options: StudioAuthoringControlOptions = {
          ...(target.binding === undefined ? {} : { binding: target.binding }),
          holder,
          onChange: (change): void => {
            this.#acceptAuthoringControlChange(target, change);
          },
          ...(target.profile === undefined ? {} : { profile: target.profile }),
          readOnly: target.readOnly,
          usage: 'studio.media/content',
          value: structuredClone(target.value),
        };
        const handle = await registry.mount(target.control, options);
        const currentNode = this.#currentInspectorNode(target.nodeId);
        const currentTarget = currentNode
          ? this.#inspectorAuthoringTargets(currentNode, this.#isReadOnly()).find(
              (candidate) => candidate.key === target.key,
            )
          : undefined;
        if (
          !holder.isConnected ||
          currentTarget === undefined ||
          authoringTargetSignature(currentTarget) !== signature
        ) {
          handle.destroy();
          continue;
        }
        this.#authoringControls.set(target.key, { handle, holder, signature });
        this.#setAuthoringDiagnostic(target.key, undefined);
        if (restoreFocus) handle.focus();
      } catch (error) {
        holder.replaceChildren(
          document.createTextNode(
            error instanceof Error
              ? `Control unavailable: ${error.message}`
              : 'Control unavailable.',
          ),
        );
        this.#setAuthoringDiagnostic(target.key, {
          code: 'studio.authoring/control-unavailable',
          location: { nodeId: target.nodeId },
          message: {
            defaultMessage: `The ${target.label} authoring control is unavailable.`,
            key: 'studio.authoring/control-unavailable',
          },
          parameters: { control: target.control, name: target.name },
          severity: 'error',
        });
      }
    }
  }

  #acceptAuthoringControlChange(
    target: InspectorAuthoringTarget,
    change: StudioAuthoringControlChange,
  ): void {
    const node = this.#currentInspectorNode(target.nodeId);
    if (node === undefined || target.readOnly) return;
    if (!change.valid) {
      this.#setAuthoringDiagnostic(target.key, {
        code: 'studio.authoring/invalid-control-value',
        location: { nodeId: node.id },
        message: {
          defaultMessage: `${target.label} contains an invalid value.`,
          key: 'studio.authoring/invalid-control-value',
        },
        parameters: { control: target.control, name: target.name },
        severity: 'error',
      });
      return;
    }
    let applied: boolean;
    if (target.kind === 'property') {
      const value = toJsonValue(change.value);
      if (value === undefined) {
        this.#setAuthoringValueDiagnostic(target, node.id);
        return;
      }
      if (target.control === STUDIO_AUTHORING_CONTROL_IDS.scopedCss) {
        this.dispatchEvent(
          new CustomEvent<StudioScopedStyleChangeDetail>('studio-scoped-style-change', {
            bubbles: true,
            composed: true,
            detail: { nodeId: node.id, value },
          }),
        );
        applied = true;
      } else {
        applied = this.#setNodeProperty(node, target.name, value, undefined);
      }
    } else {
      applied = this.#setAuthoringPortValue(node, target.name, change.value);
    }
    if (!applied) return;
    this.#setAuthoringDiagnostic(target.key, undefined);
    const current = this.#currentInspectorNode(node.id);
    const updatedTarget = current
      ? this.#inspectorAuthoringTargets(current, this.#isReadOnly()).find(
          (candidate) => candidate.key === target.key,
        )
      : undefined;
    const mounted = this.#authoringControls.get(target.key);
    if (mounted !== undefined && updatedTarget !== undefined) {
      mounted.signature = authoringTargetSignature(updatedTarget);
    }
  }

  #setAuthoringPortValue(node: BlueprintNode, port: string, input: unknown): boolean {
    const current = node.bindings[port];
    if (current?.source.kind === 'entry-field') {
      const value = toJsonValue(input);
      if (value === undefined || !this.#canEditEntryField(current.source.fieldPath)) return false;
      try {
        this.entryValues?.write(current.source.fieldPath, value);
        return true;
      } catch (error) {
        this.#announce('studio.shell/announce-command-failed', {
          message: error instanceof Error ? error.message : String(error),
        });
        return false;
      }
    }
    if (current !== undefined && current.source.kind !== 'static-value') return false;
    if (input === undefined) {
      if (current === undefined) return true;
      this.#removeBinding(node, port);
      return this.#currentInspectorNode(node.id)?.bindings[port] === undefined;
    }
    const value = toJsonValue(input);
    if (value === undefined) return false;
    const session = this.#session;
    const document = this.document;
    if (
      session === undefined ||
      document === undefined ||
      !this.#permits('studio.command/set-binding')
    ) {
      return false;
    }
    const binding: FieldBinding =
      current === undefined
        ? {
            onError: 'error',
            onNull: 'empty',
            source: { kind: 'static-value', value },
            transforms: [],
          }
        : { ...current, source: { kind: 'static-value', value } };
    const command: SetBindingCommand = {
      ...this.#commandEnvelope(document, session),
      payload: { binding, nodeId: node.id, port },
      type: 'studio.command/set-binding',
    };
    if (!this.#runShellCommand(command)) return false;
    this.#announce('studio.shell/announce-binding-set', { port });
    return true;
  }

  #setAuthoringValueDiagnostic(target: InspectorAuthoringTarget, nodeId: NodeId): void {
    this.#setAuthoringDiagnostic(target.key, {
      code: 'studio.authoring/non-canonical-control-value',
      location: { nodeId },
      message: {
        defaultMessage: `${target.label} did not produce bounded canonical JSON.`,
        key: 'studio.authoring/non-canonical-control-value',
      },
      parameters: { control: target.control, name: target.name },
      severity: 'error',
    });
  }

  #setAuthoringDiagnostic(key: string, diagnostic: StudioDiagnostic | undefined): void {
    const previous = this.#authoringDiagnostics.get(key);
    if (diagnostic === undefined) {
      if (previous === undefined) return;
      this.#authoringDiagnostics.delete(key);
      this.requestUpdate();
      return;
    }
    if (
      previous?.code === diagnostic.code &&
      previous.message.defaultMessage === diagnostic.message.defaultMessage
    ) {
      return;
    }
    this.#authoringDiagnostics.set(key, diagnostic);
    this.requestUpdate();
  }

  #destroyAuthoringControl(key: string, mounted: MountedAuthoringControl): void {
    try {
      mounted.handle.destroy();
    } catch {
      // A third-party adapter may have already released its browser resources.
    }
    this.#authoringControls.delete(key);
  }

  #destroyAuthoringControls(): void {
    for (const [key, mounted] of this.#authoringControls) {
      this.#destroyAuthoringControl(key, mounted);
    }
    this.#authoringDiagnostics.clear();
  }

  /**
   * Resource-valued ports use a dedicated search/browser surface rather than
   * the legacy raw binding field. Discovery stays useful in read-only mode;
   * only a port that explicitly permits authoring can select a canonical
   * resource reference.
   */
  #renderInspectorResourceBindings(
    node: BlueprintNode,
    readOnly: boolean,
  ): TemplateResult | typeof nothing {
    const targets = this.#inspectorResourceBindingTargets(node, readOnly);
    if (targets.length === 0) return nothing;
    const browserAvailable =
      this.resourceSearchService !== undefined && this.#resourcePortAdvertised();
    return html`
      <section class="inspector-section inspector-resource-bindings" aria-label="Resource bindings">
        <h3>Resources</h3>
        <ul class="inspector-rows">
          ${targets.map(
            (target) => html`
              <li class="inspector-row" data-resource-port=${target.port}>
                <span class="inspector-name">${target.label}</span>
                ${
                  browserAvailable
                    ? html`<div
                        class="inspector-resource-control"
                        data-resource-authoring-key=${target.key}
                      ></div>`
                    : html`<p class="inspector-binding-status resource-browser-unavailable">
                        Resource browsing is unavailable in this
                        session.${
                          target.binding === undefined
                            ? ''
                            : ` The stored ${target.binding.source.kind} binding remains unchanged.`
                        }
                      </p>`
                }
              </li>
            `,
          )}
        </ul>
      </section>
    `;
  }

  #inspectorResourceBindingTargets(
    node: BlueprintNode,
    readOnly: boolean,
  ): InspectorResourceBindingTarget[] {
    const definition = this.#findDefinition(node);
    if (definition === undefined) return [];
    return definition.ports
      .filter((port) => port.valueType === 'resource')
      .map((port) => {
        const binding = node.bindings[port.id];
        return {
          ...(binding === undefined ? {} : { binding }),
          key: `resource:${node.id}:${port.id}`,
          label: referenceText(port.label) || port.id,
          multiple: port.multiple,
          nodeId: node.id,
          port: port.id,
          readOnly:
            readOnly ||
            port.authoring?.readOnly === true ||
            (binding !== undefined && binding.source.kind !== 'resource-reference'),
        };
      });
  }

  #synchronizeResourceBindingControls(): void {
    const service = this.resourceSearchService;
    if (
      !this.isConnected ||
      this.shadowRoot === null ||
      service === undefined ||
      !this.#resourcePortAdvertised()
    ) {
      this.#destroyResourceBindingControls();
      return;
    }
    const node =
      this.document === undefined || this.selectedNodeId === undefined
        ? undefined
        : this.#currentInspectorNode(this.selectedNodeId);
    const targets =
      node === undefined ? [] : this.#inspectorResourceBindingTargets(node, this.#isReadOnly());
    const holders = new Map<string, HTMLElement>();
    for (const holder of this.shadowRoot.querySelectorAll<HTMLElement>(
      '[data-resource-authoring-key]',
    )) {
      const key = holder.dataset.resourceAuthoringKey;
      if (key !== undefined) holders.set(key, holder);
    }
    const expected = new Set(targets.map((target) => target.key));
    for (const [key, mounted] of this.#resourceBindingControls) {
      if (!expected.has(key) || holders.get(key) !== mounted.holder) {
        this.#destroyResourceBindingControl(key, mounted);
      }
    }
    let removedDiagnostic = false;
    for (const key of [...this.#authoringDiagnostics.keys()]) {
      if (key.startsWith('resource:') && !expected.has(key)) {
        this.#authoringDiagnostics.delete(key);
        removedDiagnostic = true;
      }
    }
    if (removedDiagnostic) this.requestUpdate();
    for (const target of targets) {
      const holder = holders.get(target.key);
      if (holder === undefined) continue;
      const signature = resourceBindingTargetSignature(target);
      const mounted = this.#resourceBindingControls.get(target.key);
      if (mounted?.holder === holder && mounted.signature === signature) continue;
      const restoreFocus =
        mounted !== undefined &&
        this.shadowRoot.activeElement !== null &&
        mounted.holder.contains(this.shadowRoot.activeElement);
      if (mounted !== undefined) this.#destroyResourceBindingControl(target.key, mounted);
      holder.replaceChildren();
      try {
        const handle = mountStudioResourceBindingControl({
          ...(target.binding === undefined ? {} : { binding: target.binding }),
          holder,
          label: target.label,
          multiple: target.multiple,
          onChange: (change): void => this.#acceptResourceBindingChange(target, change),
          readOnly: target.readOnly,
          service,
        });
        const currentNode = this.#currentInspectorNode(target.nodeId);
        const currentTarget = currentNode
          ? this.#inspectorResourceBindingTargets(currentNode, this.#isReadOnly()).find(
              (candidate) => candidate.key === target.key,
            )
          : undefined;
        if (
          !holder.isConnected ||
          currentTarget === undefined ||
          resourceBindingTargetSignature(currentTarget) !== signature
        ) {
          handle.destroy();
          continue;
        }
        this.#resourceBindingControls.set(target.key, { handle, holder, signature });
        this.#setAuthoringDiagnostic(target.key, undefined);
        if (restoreFocus) handle.focus();
      } catch {
        holder.replaceChildren(document.createTextNode('Resource browser is unavailable.'));
        this.#setAuthoringDiagnostic(target.key, {
          code: 'studio.authoring/resource-control-unavailable',
          location: { nodeId: target.nodeId },
          message: {
            defaultMessage: `The ${target.label} resource browser is unavailable.`,
            key: 'studio.authoring/resource-control-unavailable',
          },
          parameters: { port: target.port },
          severity: 'error',
        });
      }
    }
  }

  #acceptResourceBindingChange(
    target: InspectorResourceBindingTarget,
    change: StudioResourceBindingChange,
  ): void {
    const node = this.#currentInspectorNode(target.nodeId);
    if (node === undefined || target.readOnly) return;
    const currentTarget = this.#inspectorResourceBindingTargets(node, this.#isReadOnly()).find(
      (candidate) => candidate.key === target.key,
    );
    if (currentTarget === undefined || currentTarget.readOnly) return;
    let applied: boolean;
    if (change.source === undefined) {
      if (node.bindings[target.port] === undefined) return;
      this.#removeBinding(node, target.port);
      applied = this.#currentInspectorNode(node.id)?.bindings[target.port] === undefined;
    } else {
      applied = this.#setResourceReferenceBinding(node, target.port, change.source);
    }
    if (!applied) return;
    this.#setAuthoringDiagnostic(target.key, undefined);
    const updatedNode = this.#currentInspectorNode(node.id);
    const updatedTarget = updatedNode
      ? this.#inspectorResourceBindingTargets(updatedNode, this.#isReadOnly()).find(
          (candidate) => candidate.key === target.key,
        )
      : undefined;
    const mounted = this.#resourceBindingControls.get(target.key);
    if (mounted !== undefined && updatedTarget !== undefined) {
      mounted.signature = resourceBindingTargetSignature(updatedTarget);
    }
  }

  #setResourceReferenceBinding(
    node: BlueprintNode,
    port: string,
    source: ResourceReferenceBindingSource,
  ): boolean {
    if (!isStudioResourceReference(source)) return false;
    const current = node.bindings[port];
    if (current !== undefined && current.source.kind !== 'resource-reference') return false;
    const session = this.#session;
    const document = this.document;
    if (
      session === undefined ||
      document === undefined ||
      !this.#permits('studio.command/set-binding')
    ) {
      return false;
    }
    const binding: FieldBinding = {
      onError: 'error',
      onNull: 'empty',
      source: structuredClone(source),
      transforms: [],
    };
    const command: SetBindingCommand = {
      ...this.#commandEnvelope(document, session),
      payload: { binding, nodeId: node.id, port },
      type: 'studio.command/set-binding',
    };
    if (!this.#runShellCommand(command)) return false;
    this.#announce('studio.shell/announce-binding-set', { port });
    return true;
  }

  #destroyResourceBindingControl(key: string, mounted: MountedResourceBindingControl): void {
    try {
      mounted.handle.destroy();
    } catch {
      // An injected adapter may have already released its browser resources.
    }
    this.#resourceBindingControls.delete(key);
  }

  #destroyResourceBindingControls(): void {
    for (const [key, mounted] of this.#resourceBindingControls) {
      this.#destroyResourceBindingControl(key, mounted);
    }
    let removedDiagnostic = false;
    for (const key of [...this.#authoringDiagnostics.keys()]) {
      if (key.startsWith('resource:')) {
        this.#authoringDiagnostics.delete(key);
        removedDiagnostic = true;
      }
    }
    if (removedDiagnostic && this.isConnected) this.requestUpdate();
  }

  /** Theme recipes are atomic command batches, never an untracked style mutation. */
  #renderInspectorRecipes(node: BlueprintNode, disabled: boolean): TemplateResult | typeof nothing {
    const theme = this.theme;
    if (theme === undefined) {
      return nothing;
    }
    const recipes = theme.recipes.filter((recipe) => recipe.blockType === node.type);
    if (recipes.length === 0) {
      return nothing;
    }
    const selected = node.properties[RECIPE_MARKER_PROPERTY];
    return html`
      <section
        class="inspector-section inspector-recipes"
        aria-label=${this.#text('studio.shell/inspector-recipes-heading')}
      >
        <h3>${this.#text('studio.shell/inspector-recipes-heading')}</h3>
        <label class="inspector-row">
          <span class="inspector-name">${this.#text('studio.shell/inspector-recipe-label')}</span>
          <select
            class="inspector-recipe-select"
            data-current-value=${typeof selected === 'string' ? selected : ''}
            ?disabled=${disabled}
            @change=${(event: Event): void => {
              const target = event.currentTarget;
              if (target instanceof HTMLSelectElement && target.value !== '') {
                this.#applyRecipe(node, target.value);
              }
            }}
          >
            <option value="" disabled .selected=${typeof selected !== 'string'}>
              ${this.#text('studio.shell/inspector-recipe-placeholder')}
            </option>
            ${recipes.map(
              (recipe) => html`
                <option value=${recipe.id} .selected=${selected === recipe.id}>
                  ${referenceText(recipe.label)}
                </option>
              `,
            )}
          </select>
        </label>
      </section>
    `;
  }

  /** Typed theme controls bound to this block definition's declared vocabulary. */
  #renderInspectorDesign(node: BlueprintNode, disabled: boolean): TemplateResult | typeof nothing {
    const definition = this.#findDefinition(node);
    const controls = this.#activeDesignControls();
    if (definition === undefined || controls === undefined) {
      return nothing;
    }
    const declared = definition.themeControls
      .map((id) => controls.find((control) => control.id === id))
      .filter((control): control is ThemeDesignControl => control !== undefined);
    if (declared.length === 0) {
      return nothing;
    }
    const viewport = this.#propertyTargetViewport();
    return html`
      <section
        class="inspector-section inspector-design"
        aria-label=${this.#text('studio.shell/inspector-design-heading')}
      >
        <h3>${this.#text('studio.shell/inspector-design-heading')}</h3>
        <ul class="inspector-rows">
          ${declared.map((control) => {
            const property = this.#designControlProperty(definition, control);
            const base = node.properties[property];
            const override =
              viewport === undefined ? undefined : node.responsive?.[property]?.[viewport.id];
            const effective = override ?? base;
            return html`
              <li class="inspector-row" data-control=${control.id}>
                <label class="inspector-name" for=${`design-${node.id}-${control.id}`}>
                  ${referenceText(control.label)}
                </label>
                <span class="inspector-provenance">
                  ${
                    viewport === undefined
                      ? this.#text('studio.shell/inspector-provenance-base')
                      : override === undefined
                        ? this.#text('studio.shell/inspector-provenance-inherited', {
                            value: JSON.stringify(base),
                          })
                        : this.#text('studio.shell/inspector-provenance-overridden', {
                            value: JSON.stringify(override),
                            viewport: referenceText(viewport.label),
                          })
                  }
                </span>
                <select
                  id=${`design-${node.id}-${control.id}`}
                  class="inspector-design-select"
                  data-current-value=${typeof effective === 'string' ? effective : ''}
                  data-property=${property}
                  ?disabled=${disabled}
                  @change=${(event: Event): void => {
                    const target = event.currentTarget;
                    if (target instanceof HTMLSelectElement && target.value !== '') {
                      this.#setNodeProperty(node, property, target.value, viewport);
                    }
                  }}
                >
                  <option value="" disabled .selected=${typeof effective !== 'string'}>
                    ${this.#text('studio.shell/inspector-design-placeholder')}
                  </option>
                  ${control.choices.map(
                    (choice) => html`
                      <option value=${choice.id} .selected=${effective === choice.id}>
                        ${referenceText(choice.label)}
                      </option>
                    `,
                  )}
                </select>
                <button
                  type="button"
                  class="inspector-design-unset"
                  data-property=${property}
                  ?disabled=${disabled || (viewport === undefined ? base : override) === undefined}
                  @click=${(): void => {
                    this.#unsetNodeProperty(node, property, viewport);
                  }}
                >
                  ${this.#text('studio.shell/inspector-design-unset')}
                </button>
              </li>
            `;
          })}
        </ul>
      </section>
    `;
  }

  #renderInspectorBindings(node: BlueprintNode, readOnly: boolean): TemplateResult {
    const projection = this.#bindingProjection?.nodes.find((entry) => entry.nodeId === node.id);
    if (projection === undefined) {
      if (this.#modelPortAdvertised()) {
        return html`
          <section
            class="inspector-section inspector-bindings"
            aria-label=${this.#text('studio.shell/inspector-bindings-heading')}
          >
            <h3>${this.#text('studio.shell/inspector-bindings-heading')}</h3>
            <p class="inspector-empty inspector-binding-model-unavailable">
              ${this.#text('studio.shell/inspector-binding-model-unavailable')}
            </p>
          </section>
        `;
      }
      return this.#renderLegacyInspectorBindings(node, readOnly);
    }
    const modelCompatible = !this.#bindingProjection?.diagnostics.some((entry) =>
      entry.code.startsWith('studio.binding/model-'),
    );
    const resourcePorts = new Set(
      (this.#findDefinition(node)?.ports ?? [])
        .filter((port) => port.valueType === 'resource')
        .map((port) => port.id),
    );
    const projectedPorts = projection.ports.filter((port) => !resourcePorts.has(port.port));
    return html`
      <section
        class="inspector-section inspector-bindings"
        aria-label=${this.#text('studio.shell/inspector-bindings-heading')}
      >
        <h3>${this.#text('studio.shell/inspector-bindings-heading')}</h3>
        <p class="hint inspector-binding-model">
          ${this.#text('studio.shell/inspector-binding-model', {
            model: `${this.contentModel?.id ?? ''}@${this.contentModel?.version ?? ''}#${
              this.contentModel?.revision ?? ''
            }`,
          })}
        </p>
        ${
          !modelCompatible
            ? html`<p class="inspector-empty inspector-binding-model-mismatch">
                ${this.#text('studio.shell/inspector-binding-model-mismatch')}
              </p>`
            : projectedPorts.length === 0
              ? html`<p class="inspector-empty">
                  ${this.#text('studio.shell/inspector-bindings-empty')}
                </p>`
              : html`<ul class="inspector-rows">
                  ${projectedPorts.map((port) =>
                    this.#renderProjectedBindingPort(node, port, readOnly),
                  )}
                </ul>`
        }
      </section>
    `;
  }

  #renderProjectedBindingPort(
    node: BlueprintNode,
    projection: FieldBindingPortProjection,
    readOnly: boolean,
  ): TemplateResult {
    const definition = this.#findDefinition(node);
    const declared = definition?.ports.find((candidate) => candidate.id === projection.port);
    const boundPath = projection.boundFieldPath;
    const selectedValue = boundPath === undefined ? '' : JSON.stringify(boundPath);
    const selected = projection.candidates.find(
      (candidate) => JSON.stringify(candidate.fieldPath) === selectedValue,
    );
    const label = declared === undefined ? projection.port : referenceText(declared.label);
    return html`
      <li class="inspector-row inspector-binding-model" data-port=${projection.port}>
        <label class="inspector-name" for=${`binding-${node.id}-${projection.port}`}>
          ${label}
          ${
            projection.required === true
              ? this.#text('studio.shell/inspector-binding-required')
              : nothing
          }
        </label>
        ${
          projection.valueType === undefined
            ? nothing
            : html`<span class="inspector-binding-status">
                ${this.#text('studio.shell/inspector-binding-accepts', {
                  cardinality: projection.multiple === true ? 'many' : 'one',
                  'value-type': projection.valueType,
                })}
              </span>`
        }
        ${
          projection.status === 'non-field-source'
            ? html`<span class="inspector-binding-status">
                ${this.#text('studio.shell/inspector-binding-non-field-source')}
              </span>`
            : projection.status === 'invalid'
              ? html`<span class="inspector-binding-status">
                  ${this.#text('studio.shell/inspector-binding-invalid')}
                </span>`
              : nothing
        }
        <select
          id=${`binding-${node.id}-${projection.port}`}
          class="inspector-binding-field"
          data-port=${projection.port}
          data-current-value=${selectedValue}
          data-authoring-control=${selected?.control ?? nothing}
          ?disabled=${
            readOnly || projection.valueType === undefined || projection.candidates.length === 0
          }
          @change=${(event: Event): void => {
            const target = event.currentTarget;
            if (!(target instanceof HTMLSelectElement) || target.value === '') {
              return;
            }
            const candidate = projection.candidates.find(
              (entry) => JSON.stringify(entry.fieldPath) === target.value,
            );
            if (candidate !== undefined) {
              this.#setFieldBinding(node, projection.port, candidate);
            }
          }}
        >
          <option value="" .selected=${selected === undefined}>
            ${
              projection.candidates.length === 0
                ? this.#text('studio.shell/inspector-binding-no-compatible-fields')
                : this.#text('studio.shell/inspector-binding-field-placeholder')
            }
          </option>
          ${projection.candidates.map(
            (candidate) => html`
              <option
                value=${JSON.stringify(candidate.fieldPath)}
                data-authoring-control=${candidate.control ?? nothing}
                .selected=${JSON.stringify(candidate.fieldPath) === selectedValue}
              >
                ${referenceText(candidate.label)} (${candidate.fieldPath.join('.')})
              </option>
            `,
          )}
        </select>
        ${
          boundPath === undefined
            ? nothing
            : html`<code class="inspector-binding-path">${boundPath.join('.')}</code>`
        }
        ${selected === undefined ? nothing : this.#renderDeclaredFieldControl(selected)}
        ${
          projection.binding === undefined
            ? nothing
            : html`<button
                type="button"
                class="inspector-binding-remove"
                data-port=${projection.port}
                aria-label=${this.#text('studio.shell/inspector-remove-binding-label', {
                  port: projection.port,
                })}
                ?disabled=${readOnly}
                @click=${(): void => {
                  this.#removeBinding(node, projection.port);
                }}
              >
                ${this.#text('studio.shell/inspector-remove-binding')}
              </button>`
        }
      </li>
    `;
  }

  #renderDeclaredFieldControl(candidate: FieldBindingCandidate): TemplateResult {
    const field = this.#fieldAtPath(candidate.fieldPath);
    const control = candidate.control;
    if (field === undefined || control === undefined) {
      return html`<div class="inspector-binding-control">
        <span class="inspector-binding-status">
          ${this.#text('studio.shell/inspector-binding-control-undeclared')}
        </span>
      </div>`;
    }
    const label = referenceText(field.label);
    const controlLabel = this.#text('studio.shell/inspector-binding-control-label', {
      control,
      field: label,
    });
    let rendered: TemplateResult;
    switch (control) {
      case 'studio.control/date':
        rendered = html`<input type="date" aria-label=${controlLabel} disabled />`;
        break;
      case 'studio.control/date-time':
        rendered = html`<input type="datetime-local" aria-label=${controlLabel} disabled />`;
        break;
      case 'studio.control/number':
        rendered = html`<input type="number" aria-label=${controlLabel} disabled />`;
        break;
      case 'studio.control/select':
        rendered = html`<select aria-label=${controlLabel} disabled>
          <option>${this.#text('studio.shell/inspector-binding-control-preview')}</option>
          ${(field.enumValues ?? []).map(
            (value) => html`<option value=${value.value}>${referenceText(value.label)}</option>`,
          )}
        </select>`;
        break;
      case 'studio.control/switch':
        rendered = html`<input type="checkbox" aria-label=${controlLabel} disabled />`;
        break;
      case 'studio.control/multi-line-text':
        rendered = html`<textarea aria-label=${controlLabel} disabled></textarea>`;
        break;
      case 'studio.control/single-line-text':
        rendered = html`<input
          type="text"
          aria-label=${controlLabel}
          placeholder=${
            field.authoring?.placeholder === undefined
              ? nothing
              : referenceText(field.authoring.placeholder)
          }
          disabled
        />`;
        break;
      default:
        rendered = html`<span class="inspector-binding-status">
          ${this.#text('studio.shell/inspector-binding-control-unavailable', { control })}
        </span>`;
        break;
    }
    return html`<div
      class="inspector-binding-control"
      data-authoring-control=${control}
      aria-label=${controlLabel}
    >
      <span class="inspector-binding-status">${control}</span>
      ${rendered}
    </div>`;
  }

  #renderLegacyInspectorBindings(node: BlueprintNode, readOnly: boolean): TemplateResult {
    const declaredPorts = this.#findDefinition(node)?.ports ?? [];
    const resourcePorts = new Set(
      declaredPorts.filter((port) => port.valueType === 'resource').map((port) => port.id),
    );
    const entries = Object.entries(node.bindings).filter(([port]) => !resourcePorts.has(port));
    const showRawBindingForm =
      declaredPorts.length === 0 || declaredPorts.some((port) => port.valueType !== 'resource');
    return html`
      <section
        class="inspector-section inspector-bindings"
        aria-label=${this.#text('studio.shell/inspector-bindings-heading')}
      >
        <h3>${this.#text('studio.shell/inspector-bindings-heading')}</h3>
        ${
          entries.length === 0
            ? html`<p class="inspector-empty">
                ${this.#text('studio.shell/inspector-bindings-empty')}
              </p>`
            : html`
                <ul class="inspector-rows">
                  ${entries.map(
                    ([port, binding]) => html`
                      <li class="inspector-row">
                        <span class="inspector-name">${port}</span>
                        <code class="inspector-binding-value">${JSON.stringify(binding)}</code>
                        <button
                          type="button"
                          class="inspector-binding-remove"
                          data-port=${port}
                          aria-label=${this.#text('studio.shell/inspector-remove-binding-label', {
                            port,
                          })}
                          ?disabled=${readOnly}
                          @click=${(): void => {
                            this.#removeBinding(node, port);
                          }}
                        >
                          ${this.#text('studio.shell/inspector-remove-binding')}
                        </button>
                      </li>
                    `,
                  )}
                </ul>
              `
        }
        ${
          showRawBindingForm
            ? html`<div class="inspector-row inspector-set-binding-form">
                <input
                  type="text"
                  class="inspector-binding-port"
                  aria-label=${this.#text('studio.shell/inspector-binding-port-label')}
                  ?disabled=${readOnly}
                />
                <input
                  type="text"
                  class="inspector-binding-value-input"
                  aria-label=${this.#text('studio.shell/inspector-binding-value-label')}
                  ?disabled=${readOnly}
                />
                <button
                  type="button"
                  class="inspector-binding-set"
                  ?disabled=${readOnly}
                  @click=${(): void => {
                    this.#setBinding(node);
                  }}
                >
                  ${this.#text('studio.shell/inspector-set-binding')}
                </button>
              </div>`
            : nothing
        }
      </section>
    `;
  }

  /**
   * The layout section: one row per layout axis showing the base size-role
   * assignment, the active-viewport inheritance provenance, and the role
   * control. The role vocabulary comes from the theme document's `size-role`
   * design controls, fed to the shell over the same host path as the
   * viewport switcher. A theme that declares no size roles is stated
   * textually with no controls; with no theme vocabulary available at all
   * the editor falls back to a validated identifier input.
   */
  #renderInspectorLayout(node: BlueprintNode, readOnly: boolean): TemplateResult {
    const vocabulary = this.#sizeRoleVocabulary();
    return html`
      <section
        class="inspector-section inspector-layout"
        aria-label=${this.#text('studio.shell/inspector-layout-heading')}
      >
        <h3>${this.#text('studio.shell/inspector-layout-heading')}</h3>
        ${
          vocabulary?.length === 0
            ? html`<p class="inspector-empty layout-no-roles">
                ${this.#text('studio.shell/inspector-layout-no-roles')}
              </p>`
            : html`
                ${
                  vocabulary === undefined
                    ? html`<p class="hint layout-fallback-hint">
                        ${this.#text('studio.shell/inspector-layout-fallback-hint')}
                      </p>`
                    : nothing
                }
                <ul class="inspector-rows">
                  ${SIZE_ROLE_AXES.map((axis) =>
                    this.#renderLayoutAxis(node, axis, vocabulary, readOnly),
                  )}
                </ul>
              `
        }
      </section>
    `;
  }

  /**
   * The per-viewport override editor for the active viewport of the switcher.
   * Overrides dispatch the same set-property and unset-property commands as
   * base properties, carrying the viewport, and every announcement names the
   * viewport — the keyboard path that stands in for visual resize work.
   * Every listed value carries textual provenance: an overridden row names
   * the supplying viewport, and a base property without an override for the
   * active viewport is listed as inheriting from base.
   */
  #renderInspectorOverrides(
    node: BlueprintNode,
    readOnly: boolean,
  ): TemplateResult | typeof nothing {
    const viewport = this.activeViewport;
    if (viewport === undefined) {
      return nothing;
    }
    const viewportLabel = referenceText(viewport.label);
    interface ResponsiveRow {
      base: JsonValue | undefined;
      override: JsonValue | undefined;
      property: string;
    }
    const rows: ResponsiveRow[] = [];
    for (const [property, base] of Object.entries(node.properties)) {
      rows.push({ base, override: node.responsive?.[property]?.[viewport.id], property });
    }
    for (const [property, values] of Object.entries(node.responsive ?? {})) {
      if (Object.hasOwn(node.properties, property)) {
        continue;
      }
      const override = values[viewport.id];
      if (override !== undefined) {
        rows.push({ base: undefined, override, property });
      }
    }
    return html`
      <section
        class="inspector-section inspector-overrides"
        aria-label=${this.#text('studio.shell/inspector-overrides-heading', {
          viewport: viewportLabel,
        })}
      >
        <h3>
          ${this.#text('studio.shell/inspector-overrides-heading', { viewport: viewportLabel })}
        </h3>
        ${
          rows.length === 0
            ? html`<p class="inspector-empty">
                ${this.#text('studio.shell/inspector-overrides-empty', {
                  viewport: viewportLabel,
                })}
              </p>`
            : html`
                <ul class="inspector-rows">
                  ${rows.map(({ base, override, property }) =>
                    override === undefined
                      ? html`
                          <li class="inspector-row inspector-inherited" data-property=${property}>
                            <span class="inspector-name">${property}</span>
                            <span class="inspector-provenance">
                              ${this.#text('studio.shell/inspector-provenance-inherited', {
                                value: JSON.stringify(base),
                              })}
                            </span>
                            <button
                              type="button"
                              class="inspector-inheritance-reset"
                              data-property=${property}
                              ?disabled=${
                                readOnly ||
                                !this.#permits('studio.command/reset-inherited-property') ||
                                Object.keys(node.responsive?.[property] ?? {}).length === 0
                              }
                              @click=${(): void => {
                                this.#resetInheritedProperty(node, property);
                              }}
                            >
                              ${this.#text('studio.shell/inspector-reset-inheritance')}
                            </button>
                          </li>
                        `
                      : html`
                          <li class="inspector-row">
                            <span class="inspector-name">${property}</span>
                            <span class="inspector-provenance">
                              ${this.#text('studio.shell/inspector-provenance-overridden', {
                                value: JSON.stringify(override),
                                viewport: viewportLabel,
                              })}
                            </span>
                            <input
                              type="text"
                              class="inspector-override-input"
                              data-property=${property}
                              aria-label=${this.#text(
                                'studio.shell/inspector-override-value-label',
                                {
                                  property,
                                  viewport: viewportLabel,
                                },
                              )}
                              .value=${JSON.stringify(override)}
                              ?disabled=${readOnly}
                              @keydown=${(event: KeyboardEvent): void => {
                                this.#onInspectorValueKeydown(event, node, property, viewport);
                              }}
                            />
                            <button
                              type="button"
                              class="inspector-override-remove"
                              data-property=${property}
                              aria-label=${this.#text(
                                'studio.shell/inspector-remove-override-label',
                                {
                                  property,
                                  viewport: viewportLabel,
                                },
                              )}
                              ?disabled=${readOnly}
                              @click=${(): void => {
                                this.#unsetNodeProperty(node, property, viewport);
                              }}
                            >
                              ${this.#text('studio.shell/inspector-remove-override')}
                            </button>
                            <button
                              type="button"
                              class="inspector-inheritance-reset"
                              data-property=${property}
                              ?disabled=${
                                readOnly ||
                                !this.#permits('studio.command/reset-inherited-property')
                              }
                              @click=${(): void => {
                                this.#resetInheritedProperty(node, property);
                              }}
                            >
                              ${this.#text('studio.shell/inspector-reset-inheritance')}
                            </button>
                          </li>
                        `,
                  )}
                </ul>
              `
        }
        <div class="inspector-row inspector-add-override-form">
          <input
            type="text"
            class="inspector-add-override-name"
            aria-label=${this.#text('studio.shell/inspector-add-override-name-label')}
            ?disabled=${readOnly}
          />
          <input
            type="text"
            class="inspector-add-override-value"
            aria-label=${this.#text('studio.shell/inspector-add-override-value-label')}
            ?disabled=${readOnly}
          />
          <button
            type="button"
            class="inspector-add-override-submit"
            ?disabled=${readOnly}
            @click=${(): void => {
              this.#addOverride(node, viewport);
            }}
          >
            ${this.#text('studio.shell/inspector-add-override')}
          </button>
        </div>
      </section>
    `;
  }

  #renderInspectorProperties(node: BlueprintNode, readOnly: boolean): TemplateResult {
    const registry = this.authoringControlRegistry ?? this.#defaultAuthoringControlRegistry;
    const customProperties = new Set(
      (this.#findDefinition(node)?.propertyControls ?? [])
        .filter((entry) => registry.supports(entry.control))
        .map((entry) => entry.property),
    );
    const entries = Object.entries(node.properties).filter(
      ([property]) => !customProperties.has(property),
    );
    return html`
      <section
        class="inspector-section inspector-properties"
        aria-label=${this.#text('studio.shell/inspector-properties')}
      >
        <h3>${this.#text('studio.shell/inspector-properties')}</h3>
        ${
          entries.length === 0
            ? html`<p class="inspector-empty">
                ${this.#text('studio.shell/inspector-properties-empty')}
              </p>`
            : html`
                <ul class="inspector-rows">
                  ${entries.map(
                    ([property, value]) => html`
                      <li class="inspector-row">
                        <span class="inspector-name">${property}</span>
                        <span class="inspector-provenance">
                          ${this.#text('studio.shell/inspector-provenance-base')}
                        </span>
                        <input
                          type="text"
                          class="inspector-property-input"
                          data-property=${property}
                          aria-label=${this.#text('studio.shell/inspector-property-value-label', {
                            property,
                          })}
                          .value=${JSON.stringify(value)}
                          ?disabled=${readOnly}
                          @keydown=${(event: KeyboardEvent): void => {
                            this.#onInspectorValueKeydown(event, node, property, undefined);
                          }}
                        />
                        <button
                          type="button"
                          class="inspector-property-unset"
                          data-property=${property}
                          aria-label=${this.#text('studio.shell/inspector-unset-label', {
                            property,
                          })}
                          ?disabled=${readOnly}
                          @click=${(): void => {
                            this.#unsetNodeProperty(node, property, undefined);
                          }}
                        >
                          ${this.#text('studio.shell/inspector-unset')}
                        </button>
                      </li>
                    `,
                  )}
                </ul>
              `
        }
        <div class="inspector-row inspector-add-property-form">
          <input
            type="text"
            class="inspector-add-property-name"
            aria-label=${this.#text('studio.shell/inspector-add-property-name-label')}
            ?disabled=${readOnly}
          />
          <input
            type="text"
            class="inspector-add-property-value"
            aria-label=${this.#text('studio.shell/inspector-add-property-value-label')}
            ?disabled=${readOnly}
          />
          <button
            type="button"
            class="inspector-add-property-submit"
            ?disabled=${readOnly}
            @click=${(): void => {
              this.#addProperty(node);
            }}
          >
            ${this.#text('studio.shell/inspector-add-property')}
          </button>
        </div>
      </section>
    `;
  }

  /**
   * One layout row: the axis name, the base assignment as text, the
   * active-viewport provenance (overridden for that viewport, or inherited
   * from base) when the switcher is on a non-base viewport, then the role
   * control and its remove button. The control targets the base assignment
   * while the switcher is on the base viewport (or no viewports exist) and
   * the active viewport's override otherwise — the same base-versus-viewport
   * split the responsive property editor dispatches with.
   */
  #renderLayoutAxis(
    node: BlueprintNode,
    axis: SizeRoleAxis,
    vocabulary: ThemeDesignChoice[] | undefined,
    readOnly: boolean,
  ): TemplateResult {
    const axisLabel = this.#axisText(axis);
    const baseRole = node.sizeRoles?.[axis];
    const viewport = this.#sizeRoleTargetViewport();
    const assigned = this.#assignedSizeRole(node, axis, viewport);
    const viewportLabel = viewport === undefined ? undefined : referenceText(viewport.label);
    const controlLabel =
      viewportLabel === undefined
        ? this.#text('studio.shell/inspector-layout-role-label-base', { axis: axisLabel })
        : this.#text('studio.shell/inspector-layout-role-label-viewport', {
            axis: axisLabel,
            viewport: viewportLabel,
          });
    const unsetLabel =
      viewportLabel === undefined
        ? this.#text('studio.shell/inspector-layout-unset-label-base', { axis: axisLabel })
        : this.#text('studio.shell/inspector-layout-unset-label-viewport', {
            axis: axisLabel,
            viewport: viewportLabel,
          });
    return html`
      <li class="inspector-row layout-axis" data-axis=${axis}>
        <span class="inspector-name">${axisLabel}</span>
        <span class="inspector-provenance layout-base-state" data-axis=${axis}>
          ${
            baseRole === undefined
              ? this.#text('studio.shell/inspector-layout-base-none')
              : this.#text('studio.shell/inspector-layout-base-role', { role: baseRole })
          }
        </span>
        ${
          viewportLabel === undefined
            ? nothing
            : html`
                <span class="inspector-provenance layout-viewport-state" data-axis=${axis}>
                  ${
                    assigned !== undefined
                      ? this.#text('studio.shell/inspector-provenance-overridden', {
                          value: assigned,
                          viewport: viewportLabel,
                        })
                      : baseRole !== undefined
                        ? this.#text('studio.shell/inspector-provenance-inherited', {
                            value: baseRole,
                          })
                        : this.#text('studio.shell/inspector-provenance-inherited-none')
                  }
                </span>
              `
        }
        ${
          vocabulary === undefined
            ? html`
                <input
                  type="text"
                  class="layout-role-input"
                  data-axis=${axis}
                  aria-label=${controlLabel}
                  .value=${assigned ?? ''}
                  ?disabled=${readOnly}
                  @keydown=${(event: KeyboardEvent): void => {
                    this.#onLayoutRoleInputKeydown(event, node, axis);
                  }}
                />
              `
            : html`
                <select
                  class="layout-role-select"
                  data-axis=${axis}
                  data-role=${assigned ?? ''}
                  aria-label=${controlLabel}
                  ?disabled=${readOnly}
                  @change=${(event: Event): void => {
                    this.#onLayoutRoleChange(event, node, axis);
                  }}
                >
                  <option value="" disabled ?selected=${assigned === undefined}>
                    ${this.#text('studio.shell/inspector-layout-role-placeholder')}
                  </option>
                  ${vocabulary.map(
                    (choice) => html`
                      <option value=${choice.id} ?selected=${assigned === choice.id}>
                        ${referenceText(choice.label)}
                      </option>
                    `,
                  )}
                </select>
              `
        }
        <button
          type="button"
          class="layout-role-unset"
          data-axis=${axis}
          aria-label=${unsetLabel}
          ?disabled=${readOnly || assigned === undefined}
          @click=${(): void => {
            this.#unsetSizeRole(node, axis);
          }}
        >
          ${this.#text('studio.shell/inspector-layout-unset')}
        </button>
      </li>
    `;
  }

  #renderOutlineControls(node: BlueprintNode): TemplateResult {
    const roots = this.document?.roots ?? [];
    const location = findOutlineLocation(roots, node.id);
    const reorderDisabled = !this.#canMutateNode(node, 'studio.command/reorder-children');
    const first = location === undefined || location.index === 0;
    const last = location === undefined || location.index === location.collection.length - 1;
    const destinations = this.#moveDestinations(node);
    return html`
      <div
        class="outline-controls"
        role="group"
        aria-label=${this.#text('studio.shell/block-actions')}
      >
        <button
          type="button"
          class="outline-move-up"
          ?disabled=${reorderDisabled || first}
          @click=${(): void => {
            this.#moveNode(node, -1);
          }}
        >
          ${this.#text('studio.shell/move-up')}
        </button>
        <button
          type="button"
          class="outline-move-down"
          ?disabled=${reorderDisabled || last}
          @click=${(): void => {
            this.#moveNode(node, 1);
          }}
        >
          ${this.#text('studio.shell/move-down')}
        </button>
        <button
          type="button"
          class="outline-duplicate"
          ?disabled=${!this.#canMutateNode(node, 'studio.command/duplicate-node')}
          @click=${(): void => {
            this.#duplicateNode(node);
          }}
        >
          ${this.#text('studio.shell/duplicate')}
        </button>
        <button
          type="button"
          class="outline-delete"
          ?disabled=${!this.#canMutateNode(node, 'studio.command/remove-node')}
          @click=${(): void => {
            this.#deleteNode(node);
          }}
        >
          ${this.#text('studio.shell/delete')}
        </button>
        <button
          type="button"
          class="outline-edit"
          @click=${(): void => {
            this.#activateNodeEditing(node.id);
          }}
        >
          ${this.#text('studio.shell/outline-edit')}
        </button>
        ${
          hasListedChildren(node)
            ? html`<button
                type="button"
                class="outline-open"
                @click=${(): void => {
                  this.#openScope(node.id);
                }}
              >
                ${this.#text('studio.shell/outline-open')}
              </button>`
            : nothing
        }
        ${this.#renderAddButton(
          'outline-add-before',
          this.#text('studio.shell/add-block-before'),
          this.#offeredDestination(beforeDestination(roots, node.id)),
        )}
        ${this.#renderAddButton(
          'outline-add-after',
          this.#text('studio.shell/add-block-after'),
          this.#offeredDestination(afterDestination(roots, node.id)),
        )}
        ${(this.#findDefinition(node)?.slots ?? []).map((slot) =>
          this.#renderAddButton(
            'outline-add-into',
            this.#text('studio.shell/add-block-into', { slot: referenceText(slot.label) }),
            this.#slotDestination(node, slot.id),
            slot.id,
          ),
        )}
        <label class="outline-move-destination-label">
          <span>${this.#text('studio.shell/move-destination-label')}</span>
          <select
            class="outline-move-destination"
            ?disabled=${destinations.length === 0}
            @change=${(event: Event): void => {
              const target = event.currentTarget;
              if (!(target instanceof HTMLSelectElement)) {
                return;
              }
              const option = destinations.find((candidate) => candidate.id === target.value);
              if (option !== undefined) {
                this.#moveNodeToOption(node, option);
              }
              target.value = '';
            }}
          >
            <option value="" selected disabled>
              ${this.#text('studio.shell/move-destination-placeholder')}
            </option>
            ${destinations.map(
              (destination) => html`
                <option value=${destination.id}>${destination.label}</option>
              `,
            )}
          </select>
        </label>
      </div>
    `;
  }

  /**
   * The structure listing: the whole tree at the page level, or one opened
   * container's non-empty slots with their direct children. The whole tree
   * is the default and the complete accessible representation; a level only
   * narrows what is listed.
   */
  #renderOutline(roots: readonly BlueprintNode[]): TemplateResult {
    const scopeId = this.panelScopeId;
    const hovered = this.hoveredNodeId;
    this.#hoveredRowId =
      hovered === undefined || scopeId === undefined
        ? hovered
        : listedAncestorOf(roots, scopeId, hovered);
    const empty = html`<p class="empty">${this.#text('studio.shell/outline-empty')}</p>`;
    if (scopeId === undefined) {
      // The page level ends with its own `+`, also on a blank document.
      const addToPage = html`<div class="outline-level-add">
        ${this.#renderAddButton(
          'outline-add-page',
          this.#text('studio.shell/add-to-page'),
          this.#pageDestination(),
        )}
      </div>`;
      return roots.length === 0
        ? html`${empty}${addToPage}`
        : html`<ul class="tree">
              ${roots.map((node) => this.#renderOutlineNode(node, { nested: true }))}
            </ul>
            ${addToPage}`;
    }
    const scope = findOutlineLocation(roots, scopeId)?.node;
    if (scope === undefined || scopeChildren(roots, scopeId).length === 0) {
      return empty;
    }
    // An opened level lists every declared slot, an empty one included, so
    // each slot ends with its own `+`.
    return html`${levelSlots(scope, this.#findDefinition(scope)).map(({ slot, children }) =>
      this.#renderSlotSection(scope, slot, children, false, { add: true }),
    )}`;
  }

  /**
   * One explicit add control: a native button whose visible text names what
   * it adds, with a decorative `+`. Activating it opens the add layer for
   * that exact destination; without one it is disabled.
   */
  #renderAddButton(
    className: string,
    label: string,
    destination: CommandDestination | undefined,
    slot?: string,
    parentId?: NodeId,
  ): TemplateResult {
    return html`<button
      type="button"
      class=${className}
      data-parent-id=${parentId ?? nothing}
      data-slot=${slot ?? nothing}
      ?disabled=${destination === undefined}
      @click=${(): void => {
        if (destination !== undefined) this.#beginInsert(destination);
      }}
    >
      <span class="add-glyph" aria-hidden="true">+</span>${label}
    </button>`;
  }

  /** The hover indicator marks the listed row that stands for the hovered node. */
  #entryHovered(node: BlueprintNode): boolean {
    return this.#hoveredRowId !== undefined && this.#hoveredRowId === node.id;
  }

  /**
   * The sticky header of each layer. The structure header names the level
   * (the page, or an opened container with the way back to its parent); the
   * details header carries `Back`, except in the contextual Content and Model
   * modes, where the wrapper's Blueprint tab is the return.
   */
  #renderPanelHeader(view: 'structure' | 'details'): TemplateResult {
    if (view === 'details') {
      const returnable = this.inspectorMode === undefined || this.inspectorMode === 'blueprint';
      return html`
        <div class="panel-header">
          ${
            returnable
              ? html`<button
                  type="button"
                  class="panel-back"
                  @click=${(): void => {
                    this.#showStructure();
                  }}
                >
                  <span class="panel-back-glyph" aria-hidden="true">&lsaquo;</span>
                  ${this.#text('studio.shell/panel-back')}
                </button>`
              : nothing
          }
          <h2>${this.#text('studio.shell/inspector-heading')}</h2>
        </div>
      `;
    }
    const roots = this.document?.roots ?? [];
    const scope =
      this.panelScopeId === undefined
        ? undefined
        : findOutlineLocation(roots, this.panelScopeId)?.node;
    const addBlocks = html`<button
      type="button"
      class="add-blocks-toggle"
      aria-expanded=${this.libraryOpen ? 'true' : 'false'}
      aria-controls="library"
      @click=${(): void => {
        this.#toggleLibrary();
      }}
    >
      ${this.#text('studio.shell/add-blocks-toggle')}
    </button>`;
    if (scope === undefined) {
      return html`
        <div class="panel-header">
          <h2>${this.#text('studio.shell/outline-heading')}</h2>
          ${addBlocks}
        </div>
      `;
    }
    const parentId = parentScopeOf(roots, scope.id);
    const parent = parentId === undefined ? undefined : findOutlineLocation(roots, parentId)?.node;
    const parentLabel =
      parent === undefined ? this.#text('studio.shell/panel-page') : this.#nodeLabel(parent);
    return html`
      <div class="panel-header" data-scope=${scope.id}>
        <button
          type="button"
          class="panel-back"
          @click=${(): void => {
            this.#closeScope();
          }}
        >
          <span class="panel-back-glyph" aria-hidden="true">&lsaquo;</span>
          ${this.#text('studio.shell/panel-back-to', { label: parentLabel })}
        </button>
        ${addBlocks}
        <h2 class="outline-scope-heading">${this.#nodeLabel(scope)}</h2>
        <button
          type="button"
          class="outline-whole-tree"
          @click=${(): void => {
            this.#showWholeTree();
          }}
        >
          ${this.#text('studio.shell/outline-whole-tree')}
        </button>
      </div>
    `;
  }

  #renderSlotSection(
    node: BlueprintNode,
    slot: string,
    children: readonly BlueprintNode[],
    nested: boolean,
    options: { add?: boolean } = {},
  ): TemplateResult {
    // The slot name is visible text, not only a region label, so the
    // composition structure stays perceivable in the outline.
    const slotText = this.#slotLabel(node, slot);
    return html`
      <section class="node-children" aria-label=${slotText}>
        <span class="outline-slot-label">${slotText}</span>
        ${
          children.length === 0
            ? nothing
            : html`<ul class="tree">
                ${children.map((child) => this.#renderOutlineNode(child, { nested }))}
              </ul>`
        }
        ${
          options.add === true
            ? html`<div class="outline-level-add">
                ${this.#renderAddButton(
                  'outline-add-into',
                  this.#text('studio.shell/add-block-into', { slot: this.#slotName(node, slot) }),
                  this.#slotDestination(node, slot),
                  slot,
                )}
              </div>`
            : nothing
        }
      </section>
    `;
  }

  #renderOutlineNode(node: BlueprintNode, options: { nested: boolean }): TemplateResult {
    const definition = this.#findDefinition(node);
    const selected = this.selectedNodeId === node.id;
    const nested = options.nested ? Object.entries(node.slots) : [];
    return html`
      <li>
        <button
          type="button"
          class="outline-entry"
          data-node-id=${node.id}
          data-hovered=${this.#entryHovered(node) ? 'true' : 'false'}
          aria-pressed=${selected ? 'true' : 'false'}
          @click=${(): void => {
            this.#selectNode(node.id);
          }}
          @keydown=${(event: KeyboardEvent): void => {
            this.#onOutlineKeydown(event, node);
          }}
          @pointerenter=${(): void => {
            this.hoveredNodeId = node.id;
          }}
          @pointerleave=${(): void => {
            if (this.hoveredNodeId === node.id) this.hoveredNodeId = undefined;
          }}
          @focus=${(): void => {
            this.focusedEntryNodeId = node.id;
          }}
          @blur=${(): void => {
            if (this.focusedEntryNodeId === node.id) this.focusedEntryNodeId = undefined;
          }}
        >
          ${
            definition === undefined
              ? html`${node.type}
                  <span class="unresolved">${this.#text('studio.shell/unresolved-block')}</span>`
              : this.#nodeLabel(node)
          }
        </button>
        ${selected ? this.#renderOutlineControls(node) : nothing}
        ${nested.map(([slot, children]) =>
          children.length === 0 ? nothing : this.#renderSlotSection(node, slot, children, true),
        )}
      </li>
    `;
  }

  /**
   * The rendered-preview edit control lives in the sticky toolbar. It keeps
   * its class, accessible name and pressed state; the local canvas, which
   * forces direct manipulation on, renders none.
   */
  #renderCanvasEditToggle(): TemplateResult | typeof nothing {
    if (this.#usesLocalCanvas()) return nothing;
    const available = this.#previewCapabilityAvailable() && this.previewBinding !== undefined;
    const state = available ? (this.previewState ?? 'connecting') : 'unavailable';
    if (!available || state !== 'current' || this.canvasGeometry === undefined) {
      return nothing;
    }
    return html`
      <button
        type="button"
        class="canvas-edit-toggle"
        aria-pressed=${this.canvasDirectManipulation === true ? 'true' : 'false'}
        @click=${(): void => {
          this.canvasDirectManipulation = this.canvasDirectManipulation !== true;
          if (!this.canvasDirectManipulation && this.#previewDrag !== undefined) {
            this.#cancelDrag();
          }
          this.#announce('studio.shell/announce-canvas-mode', {
            state: this.#text(
              this.canvasDirectManipulation
                ? 'studio.shell/canvas-mode-editing'
                : 'studio.shell/canvas-mode-interacting',
            ),
          });
        }}
      >
        ${this.#text('studio.shell/canvas-edit-toggle')}
      </button>
    `;
  }

  #renderPreview(): TemplateResult {
    if (this.#usesLocalCanvas()) return this.#renderLocalCanvas();
    const available = this.#previewCapabilityAvailable() && this.previewBinding !== undefined;
    const state = available ? (this.previewState ?? 'connecting') : 'unavailable';
    const statusKey: StudioMessageKey =
      state === 'closed'
        ? 'studio.shell/preview-closed'
        : state === 'connecting'
          ? 'studio.shell/preview-connecting'
          : state === 'current'
            ? 'studio.shell/preview-current'
            : state === 'rendering'
              ? 'studio.shell/preview-rendering'
              : state === 'stale'
                ? 'studio.shell/preview-stale'
                : 'studio.shell/preview-unavailable';
    return html`
      <section
        class="preview-region"
        data-preview-state=${state}
        aria-label=${this.#text('studio.shell/preview-label')}
      >
        <h2 class="assistive">${this.#text('studio.shell/preview-heading')}</h2>
        <p class="preview-status">${this.#text(statusKey)}</p>
        ${
          available && state !== 'closed'
            ? html`
                <div
                  class="preview-stage"
                  role="group"
                  aria-label=${this.#text('studio.shell/preview-label')}
                  tabindex="0"
                  @keydown=${(event: KeyboardEvent): void => {
                    this.#onPreviewStageKeydown(event);
                  }}
                  @pointermove=${(event: PointerEvent): void => {
                    this.#onPreviewStagePointerMove(event);
                  }}
                  @pointerleave=${(): void => {
                    this.#onPreviewStagePointerLeave();
                  }}
                >
                  <slot
                    class="preview-surface-slot"
                    name="preview"
                    @slotchange=${(): void => {
                      queueMicrotask(() => {
                        this.refreshPreviewGeometry();
                      });
                    }}
                  ></slot>
                  ${this.#renderPreviewCanvasOverlay()}
                </div>
                ${this.#renderPreviewCanvasStatus()}
              `
            : nothing
        }
      </section>
    `;
  }

  #renderPreviewCanvasOverlay(): TemplateResult | typeof nothing {
    const geometry = this.canvasGeometry;
    if (geometry === undefined || geometry.viewport.width <= 0 || geometry.viewport.height <= 0) {
      return nothing;
    }
    const indicator =
      this.#previewDrag?.active === true
        ? this.#previewDrag.target?.indicator
        : this.#paletteDrag?.active === true && !this.#paletteDrag.cancelled
          ? this.#paletteDrag.target?.indicator
          : undefined;
    const measurements = Object.entries(geometry.measurements).sort(([left], [right]) => {
      // Paint ancestors before descendants. Bringing the selected parent to
      // the front would make every nested block impossible to click.
      const roots = this.document?.roots ?? [];
      return findAncestry(roots, left).length - findAncestry(roots, right).length;
    });
    return html`
      <svg
        class="preview-canvas-overlay"
        data-interactive=${this.canvasDirectManipulation === true ? 'true' : 'false'}
        width=${String(geometry.viewport.width)}
        height=${String(geometry.viewport.height)}
        viewBox=${`0 0 ${geometry.viewport.width} ${geometry.viewport.height}`}
        preserveAspectRatio="xMinYMin meet"
        aria-hidden="true"
        @pointermove=${(event: PointerEvent): void => {
          this.#onPreviewCanvasPointerMove(event);
        }}
        @pointerup=${(event: PointerEvent): void => {
          this.#onPreviewCanvasPointerUp(event);
        }}
        @pointercancel=${(event: PointerEvent): void => {
          this.#onPreviewCanvasPointerCancel(event);
        }}
      >
        ${measurements.flatMap(([nodeId, rects]) =>
          rects.map(
            (rect, index) => svg`
              <rect
                class="preview-canvas-region"
                data-node-id=${nodeId}
                data-rect-index=${String(index)}
                data-hovered=${this.hoveredNodeId === nodeId ? 'true' : 'false'}
                data-focused=${this.focusedEntryNodeId === nodeId ? 'true' : 'false'}
                data-selected=${this.selectedNodeId === nodeId ? 'true' : 'false'}
                x=${String(rect.x)}
                y=${String(rect.y)}
                width=${String(rect.width)}
                height=${String(rect.height)}
                @pointerenter=${(): void => {
                  this.hoveredNodeId = nodeId;
                }}
                @pointerleave=${(): void => {
                  if (this.hoveredNodeId === nodeId) this.hoveredNodeId = undefined;
                }}
                @pointerdown=${(event: PointerEvent): void => {
                  this.#onPreviewCanvasPointerDown(event, nodeId);
                }}
                @dblclick=${(event: MouseEvent): void => {
                  event.preventDefault();
                  this.#activateNodeEditing(nodeId);
                }}
              ></rect>
            `,
          ),
        )}
        ${this.#renderAddZoneBands(geometry)}
        ${
          indicator === undefined
            ? nothing
            : svg`
                <rect
                  class="preview-canvas-drop-indicator"
                  x=${String(indicator.x)}
                  y=${String(indicator.y)}
                  width=${String(indicator.width)}
                  height=${String(indicator.height)}
                ></rect>
              `
        }
      </svg>
    `;
  }

  /**
   * The dashed band of every empty slot of a pure container (a block with
   * slots and no content ports) with a measured parent, in that slot's share
   * of the parent (the drop-indicator formula), painted above the region
   * rects. The band is pointer-transparent, so the container under it keeps
   * selection, drag and double-click; only its centred `+` disc takes a
   * pointer. Presentation only (the overlay is `aria-hidden`): the native
   * button list under the stage offers the same destinations, also for the
   * empty slots of content blocks, which draw no band over their content.
   * Drawn always on the local canvas, and on a host preview only in edit
   * mode, where the overlay takes pointer input.
   */
  #renderAddZoneBands(geometry: StudioPreviewGeometry): TemplateResult[] | typeof nothing {
    if (!this.#usesLocalCanvas() && this.canvasDirectManipulation !== true) {
      return nothing;
    }
    return this.#addZones().flatMap(({ destination, node, slot }) => {
      const parentRect = boundingPreviewRect(geometry.measurements[node.id] ?? []);
      const definition = this.#findDefinition(node);
      const slots = definition?.ports.length === 0 ? definition.slots : [];
      const index = slots.findIndex((candidate) => candidate.id === slot);
      if (parentRect === undefined || index < 0) {
        return [];
      }
      const { height, width, x, y } = emptySlotBand(parentRect, index, slots.length);
      const enter = (): void => {
        this.hoveredNodeId = node.id;
      };
      const leave = (): void => {
        if (this.hoveredNodeId === node.id) this.hoveredNodeId = undefined;
      };
      // pointerup, not pointerdown: a drag that ends over the disc keeps its own outcome.
      const add = (event: PointerEvent): void => {
        if (
          event.button === 0 &&
          this.#previewDrag?.active !== true &&
          this.#paletteDrag?.active !== true
        ) {
          this.#beginInsert(destination);
        }
      };
      const cx = String(x + width / 2);
      const cy = String(y + height / 2);
      return [
        svg`<g class="preview-canvas-add-zone" data-parent-id=${node.id} data-slot=${slot}><rect x=${String(x)} y=${String(y)} width=${String(width)} height=${String(height)}></rect><circle cx=${cx} cy=${cy} r="16" @pointerenter=${enter} @pointerleave=${leave} @pointerup=${add}></circle><text x=${cx} y=${cy}>+</text></g>`,
      ];
    });
  }

  /**
   * The parity path of the on-page bands: one native button per empty
   * container, rendered once under the stage whatever the preview state, so
   * adding into an empty container never needs geometry or a pointer. Each
   * name carries the parent's id, so two equal containers never share one.
   */
  #renderAddZoneList(): TemplateResult | typeof nothing {
    const zones = this.#addZones();
    const name = this.#text('studio.shell/canvas-add-zones');
    return zones.length === 0
      ? nothing
      : html`<div class="canvas-add-zones" role="group" aria-label=${name}>
          <span>${name}</span>${zones.map(({ destination, node, slot }) =>
            this.#renderAddButton(
              'canvas-add-into',
              this.#text('studio.shell/canvas-add-into', {
                parent: `${this.#nodeLabel(node)} (${node.id})`,
                slot: this.#slotName(node, slot),
              }),
              destination,
              slot,
              node.id,
            ),
          )}
        </div>`;
  }

  /** The empty page: a dashed zone with the canvas-empty text and a real `Add to page` button. */
  #renderEmptyPageZone(): TemplateResult {
    return html`<div class="canvas-add-zone">
      <p>${this.#text('studio.shell/canvas-empty')}</p>
      ${this.#renderAddButton(
        'canvas-add-page',
        this.#text('studio.shell/add-to-page'),
        this.#pageDestination(),
      )}
    </div>`;
  }

  /** The add layer's header line naming a destination chosen through a `+`. */
  #renderLibraryDestination(): TemplateResult | typeof nothing {
    const destination = this.pendingInsertDestination;
    const text = destination === undefined ? undefined : this.#destinationText(destination);
    return text === undefined
      ? nothing
      : html`<p class="library-destination" id="library-destination">
          ${this.#text('studio.shell/add-destination', { destination: text })}
        </p>`;
  }

  /**
   * The `2 columns`, `3 columns` and `4 columns` cards: a columns block with
   * that many stack children as one batch. Hidden unless the active catalog
   * has both core layout definitions and the columns slot accepts stacks.
   */
  #renderColumnsCards(): TemplateResult[] | typeof nothing {
    const catalog = this.#columnsCatalog();
    if (catalog === undefined) {
      return nothing;
    }
    const disabled = !this.#canInsertDefinition(catalog.columns);
    return COLUMN_COUNTS.flatMap((count) => {
      const label = this.#text('studio.shell/add-columns', { count: String(count) });
      return this.#matchesLibrary(label)
        ? [
            html`<li>
              <button
                type="button"
                class="palette-columns"
                data-columns=${String(count)}
                ?disabled=${disabled}
                @click=${(): void => {
                  this.#requestColumnsInsert(count);
                }}
              >
                <span class="block-symbol" aria-hidden="true">${String(count)}</span>${label}
              </button>
            </li>`,
          ]
        : [];
    });
  }

  #renderPreviewCanvasStatus(): TemplateResult | typeof nothing {
    const drag = this.#previewDrag;
    if (drag?.active === true && drag.target !== undefined) {
      return html`
        <p class="preview-canvas-status">
          ${this.#text('studio.shell/visual-drop-target', {
            destination: drag.target.label,
            label: drag.label,
          })}
        </p>
      `;
    }
    const insertion = this.#paletteDrag;
    if (insertion?.active !== true || insertion.cancelled || insertion.target === undefined) {
      return nothing;
    }
    return html`
      <p class="preview-canvas-status">
        ${this.#text('studio.shell/visual-insert-target', {
          destination: insertion.target.label,
          label: insertion.label,
        })}
      </p>
    `;
  }

  #onPreviewCanvasPointerDown(event: PointerEvent, nodeId: NodeId): void {
    if (
      this.canvasDirectManipulation !== true ||
      event.button !== 0 ||
      this.#previewDrag !== undefined
    ) {
      return;
    }
    const document = this.document;
    const node =
      document === undefined ? undefined : findOutlineLocation(document.roots, nodeId)?.node;
    if (node === undefined) {
      return;
    }
    const destinations = this.#moveDestinations(node);
    if (destinations.length === 0) {
      // Nothing to drag (a lone root, for example): the press is a page click,
      // which selects, reveals the entry and opens the details view, exactly
      // as a press released without a drag does for a movable block.
      this.#selectFromPage(nodeId);
      return;
    }
    this.#selectNode(nodeId, { revealOnCanvas: false });
    const drag: PreviewCanvasDragState = {
      active: false,
      label: this.#nodeLabel(node),
      nodeId,
      originX: event.clientX,
      originY: event.clientY,
      pointerId: event.pointerId,
    };
    const target = event.currentTarget;
    if (target instanceof Element) {
      drag.capture = target;
      try {
        target.setPointerCapture(event.pointerId);
      } catch {
        // Capture is progressive; the overlay-level handlers remain active.
      }
    }
    this.#previewDrag = drag;
  }

  #onPreviewCanvasPointerMove(event: PointerEvent): void {
    const drag = this.#previewDrag;
    if (drag?.pointerId !== event.pointerId) {
      return;
    }
    if (
      !drag.active &&
      Math.hypot(event.clientX - drag.originX, event.clientY - drag.originY) < 4
    ) {
      return;
    }
    drag.active = true;
    const point = this.#previewCanvasPoint(event);
    const document = this.document;
    const node =
      document === undefined ? undefined : findOutlineLocation(document.roots, drag.nodeId)?.node;
    if (point !== undefined && node !== undefined) {
      const target = this.#resolvePreviewDropTarget(node, point.x, point.y);
      if (target === undefined) {
        delete drag.target;
      } else {
        drag.target = target;
      }
    }
    this.requestUpdate();
  }

  #onPreviewCanvasPointerUp(event: PointerEvent): void {
    const drag = this.#previewDrag;
    if (drag?.pointerId !== event.pointerId) {
      return;
    }
    this.#previewDrag = undefined;
    this.#releasePreviewDragCapture(drag);
    this.requestUpdate();
    if (!drag.active) {
      this.#selectFromPage(drag.nodeId);
      return;
    }
    const document = this.document;
    const node =
      document === undefined ? undefined : findOutlineLocation(document.roots, drag.nodeId)?.node;
    if (node === undefined || drag.target === undefined) {
      this.#announce('studio.shell/announce-drag-cancelled', { label: drag.label });
      return;
    }
    this.#moveNodeToOption(node, drag.target);
  }

  #onPreviewCanvasPointerCancel(event: PointerEvent): void {
    if (this.#previewDrag?.pointerId === event.pointerId) {
      this.#cancelDrag();
    }
  }

  #releasePreviewDragCapture(drag: PreviewCanvasDragState): void {
    try {
      if (drag.capture?.hasPointerCapture(drag.pointerId) === true) {
        drag.capture.releasePointerCapture(drag.pointerId);
      }
    } catch {
      // The capture may already have been revoked by disconnection.
    }
  }

  #previewCanvasPoint(event: PointerEvent): { x: number; y: number } | undefined {
    const geometry = this.canvasGeometry;
    const target = event.currentTarget;
    if (geometry === undefined || !(target instanceof SVGElement)) {
      return undefined;
    }
    const svg = target instanceof SVGSVGElement ? target : target.ownerSVGElement;
    if (svg === null) {
      return undefined;
    }
    const bounds = svg.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) {
      return { x: event.clientX, y: event.clientY };
    }
    return {
      x: ((event.clientX - bounds.left) / bounds.width) * geometry.viewport.width,
      y: ((event.clientY - bounds.top) / bounds.height) * geometry.viewport.height,
    };
  }

  #resolvePreviewDropTarget(
    node: BlueprintNode,
    x: number,
    y: number,
  ): CanvasDropTarget | undefined {
    return this.#rankDropTarget(this.#previewDropTargets(node), x, y);
  }

  /**
   * Geometry ranks the already-valid destinations by distance; an exact tie
   * resolves toward the most specific (deepest) collection, then enumeration
   * order. Ranking never adds a destination the semantic layer refused.
   */
  #rankDropTarget(
    targets: readonly CanvasDropTarget[],
    x: number,
    y: number,
  ): CanvasDropTarget | undefined {
    let chosen: CanvasDropTarget | undefined;
    let distance = Number.POSITIVE_INFINITY;
    for (const target of targets) {
      const current = Math.hypot(target.distanceX - x, target.distanceY - y);
      if (
        current < distance ||
        (current === distance && (chosen === undefined || target.specificity > chosen.specificity))
      ) {
        chosen = target;
        distance = current;
      }
    }
    return chosen;
  }

  #previewDropTargets(node: BlueprintNode): CanvasDropTarget[] {
    return this.#dropTargetsFor(
      this.#moveDestinations(node),
      this.#moveCollections(node),
      node.type,
      node.id,
    );
  }

  /**
   * Every collection that may receive a fresh node of this definition: the
   * document roots outside hybrid composition, plus each slot whose accepted
   * types, hybrid bounds, and cardinality admit it. This is the same rule the
   * palette click, command palette, and outline paths derive their single
   * default destination from; the drop gesture only chooses among them.
   */
  #insertCollections(definition: BlockDefinition): MoveCollection[] {
    const document = this.document;
    if (document === undefined || !this.#permits('studio.command/insert-node')) {
      return [];
    }
    const hybrid = this.#session?.mode === 'hybrid';
    const collections: MoveCollection[] = [];
    if (!hybrid) {
      collections.push({
        collection: document.roots,
        label: this.#text('studio.shell/document-roots'),
        specificity: 0,
      });
    }
    const stack = document.roots.map((node) => ({ node, specificity: 1 }));
    while (stack.length > 0) {
      const current = stack.shift();
      if (current === undefined) {
        break;
      }
      const { node: parent, specificity } = current;
      const parentDefinition = this.#findDefinition(parent);
      for (const children of Object.values(parent.slots)) {
        stack.push(...children.map((node) => ({ node, specificity: specificity + 1 })));
      }
      for (const slot of parentDefinition?.slots ?? []) {
        if (!this.#slotAdmits(parent, slot, definition)) {
          continue;
        }
        collections.push({
          collection: parent.slots[slot.id] ?? [],
          label: this.#text('studio.shell/move-slot-collection', {
            parent: `${this.#nodeLabel(parent)} (${parent.id})`,
            slot: referenceText(slot.label),
          }),
          parentNodeId: parent.id,
          slot: slot.id,
          specificity,
        });
      }
    }
    return collections;
  }

  #insertDestinations(definition: BlockDefinition): MoveDestinationOption[] {
    const destinations: MoveDestinationOption[] = [];
    for (const target of this.#insertCollections(definition)) {
      for (let position = 0; position <= target.collection.length; position += 1) {
        const destination: CommandDestination = { position };
        if (target.parentNodeId !== undefined && target.slot !== undefined) {
          destination.parentNodeId = target.parentNodeId;
          destination.slot = target.slot;
        }
        destinations.push({
          destination,
          id: `${target.parentNodeId ?? 'document'}--${target.slot ?? 'roots'}--${position}`,
          label: this.#text('studio.shell/move-destination-option', {
            collection: target.label,
            count: String(target.collection.length + 1),
            position: String(position + 1),
          }),
        });
      }
    }
    return destinations;
  }

  #insertDropTargets(definition: BlockDefinition): CanvasDropTarget[] {
    return this.#dropTargetsFor(
      this.#insertDestinations(definition),
      this.#insertCollections(definition),
      definition.type,
      undefined,
    );
  }

  /**
   * Converts semantic destinations into measured indicators. Ordered
   * boundaries come from sibling rectangles; an empty compatible slot receives
   * a deterministic band inside its measured parent; an empty document offers
   * the whole canvas as its first position for insertion only.
   */
  #dropTargetsFor(
    options: readonly MoveDestinationOption[],
    collections: readonly MoveCollection[],
    type: BlockType,
    excluded: NodeId | undefined,
  ): CanvasDropTarget[] {
    const geometry = this.canvasGeometry;
    const document = this.document;
    if (geometry === undefined || document === undefined) {
      return [];
    }
    const targets: CanvasDropTarget[] = [];
    for (const option of options) {
      const collection = collections.find(
        (candidate) =>
          candidate.parentNodeId === option.destination.parentNodeId &&
          candidate.slot === option.destination.slot,
      );
      if (collection === undefined) {
        continue;
      }
      const children = collection.collection.filter((candidate) => candidate.id !== excluded);
      const childRects = children.map((child) =>
        boundingPreviewRect(geometry.measurements[child.id] ?? []),
      );
      if (
        childRects.every((rect): rect is PreviewMarkerRect => rect !== undefined) &&
        childRects.length > 0
      ) {
        const target = collectionPositionTarget(childRects, option.destination.position);
        targets.push({
          ...option,
          distanceX: target.x + target.width / 2,
          distanceY: target.y + target.height / 2,
          indicator: target,
          specificity: collection.specificity,
        });
        continue;
      }
      if (children.length !== 0) {
        continue;
      }
      if (collection.parentNodeId === undefined) {
        if (excluded !== undefined) {
          continue;
        }
        const indicator: PreviewMarkerRect = {
          height: Math.max(4, geometry.viewport.height - 8),
          width: Math.max(4, geometry.viewport.width - 8),
          x: 4,
          y: 4,
        };
        targets.push({
          ...option,
          distanceX: indicator.x + indicator.width / 2,
          distanceY: indicator.y + indicator.height / 2,
          indicator,
          specificity: collection.specificity,
        });
        continue;
      }
      const parentRect = boundingPreviewRect(geometry.measurements[collection.parentNodeId] ?? []);
      const parent = findOutlineLocation(document.roots, collection.parentNodeId)?.node;
      if (parentRect === undefined || parent === undefined) {
        continue;
      }
      const slots =
        this.#findDefinition(parent)?.slots.filter((slot) => {
          const entries = parent.slots[slot.id] ?? [];
          return entries.length === 0 && slot.accepts.types.includes(type);
        }) ?? [];
      const slotIndex = Math.max(
        0,
        slots.findIndex((slot) => slot.id === collection.slot),
      );
      const indicator = emptySlotBand(parentRect, slotIndex, slots.length);
      targets.push({
        ...option,
        distanceX: indicator.x + indicator.width / 2,
        distanceY: indicator.y + indicator.height / 2,
        indicator,
        specificity: collection.specificity,
      });
    }
    return targets;
  }

  /**
   * Palette-to-canvas insertion is an enhancement (SR-017): a press stays an
   * ordinary click, four CSS pixels of movement begin carrying the block, and
   * the drop dispatches the same insert-node command the click would, at the
   * geometry-ranked destination. Escape and pointercancel change nothing.
   */
  #onPaletteBlockPointerDown(event: PointerEvent, definition: BlockDefinition): void {
    if (
      event.button !== 0 ||
      this.#previewDrag !== undefined ||
      (this.#paletteDrag !== undefined && !this.#paletteDrag.cancelled) ||
      this.canvasGeometry === undefined ||
      !this.#permits('studio.command/insert-node')
    ) {
      return;
    }
    const drag: PaletteDragState = {
      active: false,
      cancelled: false,
      definition,
      label: referenceText(definition.label),
      originX: event.clientX,
      originY: event.clientY,
      pointerId: event.pointerId,
    };
    const capture = event.currentTarget;
    if (capture instanceof Element) {
      try {
        capture.setPointerCapture(event.pointerId);
        drag.capture = capture;
      } catch {
        // Pointer capture is unavailable in some embedding contexts; the
        // gesture then completes only while the pointer stays over the button.
      }
    }
    this.#paletteDrag = drag;
  }

  #onPaletteBlockPointerMove(event: PointerEvent): void {
    const drag = this.#paletteDrag;
    if (drag?.pointerId !== event.pointerId || drag.cancelled) {
      return;
    }
    if (
      !drag.active &&
      Math.hypot(event.clientX - drag.originX, event.clientY - drag.originY) < 4
    ) {
      return;
    }
    drag.active = true;
    const point = this.#paletteCanvasPoint(event);
    const target =
      point === undefined
        ? undefined
        : this.#rankDropTarget(this.#insertDropTargets(drag.definition), point.x, point.y);
    if (target === undefined) {
      delete drag.target;
    } else {
      drag.target = target;
    }
    this.requestUpdate();
  }

  #onPaletteBlockPointerUp(event: PointerEvent): void {
    const drag = this.#paletteDrag;
    if (drag?.pointerId !== event.pointerId) {
      return;
    }
    this.#paletteDrag = undefined;
    this.#releasePaletteDragCapture(drag);
    this.requestUpdate();
    if (!drag.active && !drag.cancelled) {
      // A plain press stays a click; the click path performs the insertion
      // and still offers host adapters their cancelable insert request.
      return;
    }
    this.#suppressFollowingPaletteClick();
    if (drag.cancelled) {
      return;
    }
    if (drag.target === undefined) {
      this.#announce('studio.shell/announce-drag-cancelled', { label: drag.label });
      return;
    }
    this.#insertDefinition(drag.definition, drag.target.destination);
  }

  #onPaletteBlockPointerCancel(event: PointerEvent): void {
    if (this.#paletteDrag?.pointerId === event.pointerId) {
      this.#cancelDrag();
    }
  }

  #suppressFollowingPaletteClick(): void {
    this.#suppressPaletteClick = true;
    // The browser dispatches the compatibility click in the same input task;
    // anything later is a new, deliberate activation.
    this.ownerDocument.defaultView?.setTimeout(() => {
      this.#suppressPaletteClick = false;
    }, 0);
  }

  #releasePaletteDragCapture(drag: PaletteDragState): void {
    try {
      if (drag.capture?.hasPointerCapture(drag.pointerId) === true) {
        drag.capture.releasePointerCapture(drag.pointerId);
      }
    } catch {
      // The capture may already have been revoked by disconnection.
    }
  }

  /** Maps a captured pointer onto the overlay's geometry viewport coordinates. */
  #paletteCanvasPoint(event: PointerEvent): { x: number; y: number } | undefined {
    const geometry = this.canvasGeometry;
    const overlay = this.shadowRoot?.querySelector<SVGSVGElement>('.preview-canvas-overlay');
    if (geometry === undefined || overlay === null || overlay === undefined) {
      return undefined;
    }
    const bounds = overlay.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) {
      // Without layout (test DOM) the raw coordinates stand in for geometry;
      // a canvas hidden behind another narrow-screen sheet offers no target.
      return this.activePane === 'canvas' ? { x: event.clientX, y: event.clientY } : undefined;
    }
    if (
      event.clientX < bounds.left ||
      event.clientX > bounds.right ||
      event.clientY < bounds.top ||
      event.clientY > bounds.bottom
    ) {
      return undefined;
    }
    return {
      x: ((event.clientX - bounds.left) / bounds.width) * geometry.viewport.width,
      y: ((event.clientY - bounds.top) / bounds.height) * geometry.viewport.height,
    };
  }

  /**
   * Activating a rendered block (double-click, or Enter/F2 on the focused
   * canvas stage) keeps the page visible and moves the author to the block's
   * first typed control in the docked inspector. Value editing therefore stays
   * a canonical command over the Entry or Blueprint draft, never an edit of
   * the rendered markup.
   */
  #activateNodeEditing(nodeId: NodeId): void {
    if (
      this.document === undefined ||
      findOutlineLocation(this.document.roots, nodeId) === undefined
    ) {
      return;
    }
    this.#selectNode(nodeId);
    this.activePane = 'inspector';
    this.#openDetails(nodeId, { focus: 'control' });
  }

  #onPreviewStageKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Enter' && event.key !== 'F2') {
      return;
    }
    if (event.currentTarget !== event.target || this.selectedNodeId === undefined) {
      return;
    }
    event.preventDefault();
    this.#activateNodeEditing(this.selectedNodeId);
  }

  #renderViewportSwitcher(): TemplateResult | typeof nothing {
    const ordered = this.#orderedViewports();
    if (ordered.length === 0) {
      return nothing;
    }
    const active = this.activeViewport;
    return html`
      <section class="viewport-switcher" aria-label=${this.#text('studio.shell/viewport-label')}>
        ${ordered.map(
          (viewport) => html`
            <button
              type="button"
              class="viewport-option"
              data-viewport-id=${viewport.id}
              aria-pressed=${active?.id === viewport.id ? 'true' : 'false'}
              @click=${(): void => {
                this.#selectViewport(viewport);
              }}
            >
              ${referenceText(viewport.label)}
            </button>
          `,
        )}
      </section>
    `;
  }

  #requestInsert(definition: BlockDefinition): void {
    if (this.#suppressPaletteClick) {
      // The click completing (or following a cancelled) palette drop already
      // had its outcome; a second insertion would duplicate or resurrect it.
      this.#suppressPaletteClick = false;
      return;
    }
    const destination = this.#resolveInsertDestination(definition);
    if (destination === undefined) {
      return;
    }
    const insertItself = this.#dispatchInsertRequest(
      this.#insertRequestDetail(definition, destination),
      referenceText(definition.label),
    );
    if (insertItself) {
      // The request and the default insertion never diverge: both use the
      // resolved destination.
      this.#insertDefinition(definition, destination);
    }
    // The request is the destination's outcome, whoever performed it.
    this.#clearInsertDestination();
  }

  #insertRequestDetail(
    definition: BlockDefinition,
    destination: CommandDestination,
  ): StudioInsertRequestDetail {
    const detail: StudioInsertRequestDetail = {
      definition,
      parentId: destination.parentNodeId ?? null,
      position: destination.position,
    };
    if (destination.slot !== undefined) {
      detail.slot = destination.slot;
    }
    return detail;
  }

  /**
   * Dispatches the cancelable insertion request and answers whether the
   * shell must now insert itself: not when a host took ownership with
   * `preventDefault`, and not when a synchronous host already changed the
   * session. A synchronous host's insertion is completed like the shell's
   * own: the one block it added is selected, focused and announced once by
   * `label`.
   */
  #dispatchInsertRequest(detail: StudioInsertRequestDetail, label: string): boolean {
    const session = this.#session;
    const stateVersion = session?.stateVersion;
    const before = collectDocumentIds(this.document?.roots ?? []);
    const request = new CustomEvent<StudioInsertRequestDetail>('studio-insert-request', {
      bubbles: true,
      cancelable: true,
      composed: true,
      detail,
    });
    this.dispatchEvent(request);
    if (this.#session === session && session?.stateVersion !== stateVersion) {
      this.activePane = 'canvas';
      const inserted = request.defaultPrevented
        ? []
        : insertedRootIds(before, this.document?.roots ?? []);
      const [nodeId] = inserted;
      if (inserted.length === 1 && nodeId !== undefined) {
        this.#completeInsert(nodeId, label);
      }
    }
    // Existing synchronous host adapters may already have inserted. Async
    // adapters take ownership with preventDefault; otherwise Studio supplies
    // its own canonical command, including on an ordinary hosted mount.
    return (
      !request.defaultPrevented &&
      this.#session === session &&
      session?.stateVersion === stateVersion
    );
  }

  /** The active columns and stack definitions, when the columns slot accepts stacks. */
  #columnsCatalog(): { columns: BlockDefinition; stack: BlockDefinition } | undefined {
    const definitions = this.#activeDefinitions();
    const columns = definitions.find(
      (definition) => definition.type === CORE_LAYOUT_BLOCK_TYPES.columns,
    );
    const stack = definitions.find(
      (definition) => definition.type === CORE_LAYOUT_BLOCK_TYPES.stack,
    );
    if (
      columns === undefined ||
      stack === undefined ||
      columns.slots.find((slot) => slot.id === 'items')?.accepts.types.includes(stack.type) !== true
    ) {
      return undefined;
    }
    return { columns, stack };
  }

  /**
   * A column card: one `studio.core/columns` block with `count` stack
   * children, planned by `planColumnsInsertion` as one batch (one undo step)
   * and offered to the host through the same cancelable request, which then
   * carries the complete operation list.
   */
  #requestColumnsInsert(count: number): void {
    const catalog = this.#columnsCatalog();
    const session = this.#session;
    const document = this.document;
    const destination =
      catalog === undefined ? undefined : this.#resolveInsertDestination(catalog.columns);
    if (
      catalog === undefined ||
      destination === undefined ||
      session === undefined ||
      document === undefined
    ) {
      return;
    }
    const taken = collectDocumentIds(document.roots);
    const plan = planColumnsInsertion({
      allocateId: (base) => this.#allocateNodeId(base, taken),
      count,
      destination,
      stackVersion: catalog.stack.version,
      version: catalog.columns.version,
    });
    const detail: StudioInsertRequestDetail = {
      ...this.#insertRequestDetail(catalog.columns, destination),
      operations: structuredClone(plan.command.payload.operations),
    };
    const label = this.#text('studio.shell/add-columns', { count: String(count) });
    if (this.#dispatchInsertRequest(detail, label)) {
      const command: BatchCommand = {
        ...this.#commandEnvelope(document, session),
        ...plan.command,
      };
      if (this.#runShellCommand(command)) {
        this.#completeInsert(plan.columnsNodeId, label);
      }
    }
    this.#clearInsertDestination();
  }

  /**
   * Maps a pointer position onto a target position within the dragged node's
   * own collection. Chips with measurable geometry are hit-tested by their
   * vertical extent; environments without layout (such as the test DOM) fall
   * back to the event's composed path. Only the source collection's chips are
   * considered — cross-slot reparenting is out of scope for pointer drag.
   */
  #resolveDragIndex(event: PointerEvent, drag: CanvasDragState): number | undefined {
    const chips = [
      ...(this.shadowRoot?.querySelectorAll<HTMLButtonElement>('button.canvas-chip') ?? []),
    ].filter((chip) => {
      const nodeId = chip.dataset.nodeId;
      return nodeId !== undefined && drag.order.includes(nodeId);
    });
    let nearestIndex: number | undefined;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const chip of chips) {
      const rect = chip.getBoundingClientRect();
      if (rect.height <= 0) {
        continue;
      }
      const nodeId = chip.dataset.nodeId;
      if (nodeId === undefined) {
        continue;
      }
      if (event.clientY >= rect.top && event.clientY <= rect.bottom) {
        return drag.order.indexOf(nodeId);
      }
      const distance = Math.abs(event.clientY - (rect.top + rect.height / 2));
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = drag.order.indexOf(nodeId);
      }
    }
    if (nearestIndex !== undefined) {
      return nearestIndex;
    }
    for (const hop of event.composedPath()) {
      if (hop instanceof HTMLElement) {
        const nodeId = hop.dataset.nodeId;
        if (nodeId !== undefined && drag.order.includes(nodeId)) {
          return drag.order.indexOf(nodeId);
        }
      }
    }
    return undefined;
  }

  #revalidate(): void {
    if (this.document === undefined) {
      this.#diagnostics = [];
      this.#bindingProjection = undefined;
      return;
    }
    const registry = this.#registry ?? new BlockRegistry();
    const result = validateBlueprint(this.document, registry);
    this.#bindingProjection =
      this.contentModel === undefined
        ? undefined
        : projectBlueprintFieldBindings(
            this.document,
            this.contentModel,
            this.#activeDefinitions(),
          );
    this.#diagnostics = [
      ...result.diagnostics,
      ...(this.#bindingProjection?.diagnostics ?? []),
    ].sort((left, right) => SEVERITY_RANK[left.severity] - SEVERITY_RANK[right.severity]);
  }

  #revealDiagnosticNode(nodeId: NodeId): void {
    this.#selectNode(nodeId);
    this.#pendingFocusNodeId = nodeId;
    this.requestUpdate();
  }

  #runPaletteEntry(entry: CommandPaletteEntry): void {
    if (entry.disabled) {
      return;
    }
    const invoker = this.#paletteInvoker;
    this.#closePalette(false);
    entry.run();
    if (this.#pendingFocusNodeId === undefined && invoker?.isConnected === true) {
      invoker.focus();
    }
  }

  #runShellCommand(command: BlueprintCommand): boolean {
    try {
      this.execute(command);
      // Entries are re-bound in place after a structural change, so the row
      // under a resting pointer may now show another node; the next pointer
      // movement re-establishes hover.
      this.hoveredNodeId = undefined;
      return true;
    } catch {
      // execute() has already announced the failure through the live region.
      return false;
    }
  }

  #selectNode(
    nodeId: NodeId,
    options: { notifyPreview?: boolean; revealOnCanvas?: boolean; revealEntry?: boolean } = {},
  ): void {
    const { notifyPreview = true, revealOnCanvas = true, revealEntry = false } = options;
    const session = this.#session;
    if (session === undefined) {
      return;
    }
    try {
      session.select([nodeId]);
    } catch {
      return;
    }
    if (nodeId !== this.selectedNodeId) {
      // A `+` destination overrides the selection-derived default and must
      // not outlive the context it was chosen in.
      this.#clearInsertDestination();
    }
    this.selectedNodeId = nodeId;
    if (notifyPreview) {
      this.#previewSurface?.selectNode(nodeId);
    }
    if (revealOnCanvas) {
      this.#localCanvas?.reveal(nodeId);
    }
    if (revealEntry) {
      void this.updateComplete.then(() => {
        this.#revealOutlineEntry(nodeId);
      });
    }
  }

  /**
   * A selection that originates on the page: the outline entry scrolls into
   * view without taking focus, and the page itself is never re-scrolled.
   */
  #selectFromPage(nodeId: NodeId, options: { notifyPreview?: boolean } = {}): void {
    this.#selectNode(nodeId, {
      notifyPreview: options.notifyPreview ?? true,
      revealOnCanvas: false,
      revealEntry: true,
    });
    // A click on the page opens the details layer without moving focus.
    this.#openDetails(nodeId, { focus: 'none' });
  }

  /** Non-focusing sibling of #focusOutlineEntry; reduced motion needs no smooth scroll. */
  #revealOutlineEntry(nodeId: NodeId): void {
    const entries = this.shadowRoot?.querySelectorAll<HTMLButtonElement>('button.outline-entry');
    if (entries === undefined) {
      return;
    }
    for (const entry of entries) {
      if (entry.dataset.nodeId === nodeId) {
        entry.scrollIntoView?.({ block: 'nearest' });
        return;
      }
    }
  }

  /**
   * Resolves the deepest accepted measurement under a client point. Geometry
   * comes only from the host's accepted measurements; no slotted node is read.
   */
  #hitTestMeasurements(clientX: number, clientY: number): NodeId | undefined {
    const geometry = this.canvasGeometry;
    if (geometry === undefined) {
      return undefined;
    }
    const bounds = this.shadowRoot
      ?.querySelector('.preview-canvas-overlay')
      ?.getBoundingClientRect();
    const scaled = bounds !== undefined && bounds.width > 0 && bounds.height > 0;
    const x = scaled ? ((clientX - bounds.left) / bounds.width) * geometry.viewport.width : clientX;
    const y = scaled
      ? ((clientY - bounds.top) / bounds.height) * geometry.viewport.height
      : clientY;
    const roots = this.document?.roots ?? [];
    let deepest: NodeId | undefined;
    let depth = -1;
    for (const [nodeId, rects] of Object.entries(geometry.measurements)) {
      const hit = rects.some(
        (rect) =>
          x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height,
      );
      if (!hit) continue;
      const candidateDepth = findAncestry(roots, nodeId).length;
      if (candidateDepth > depth) {
        deepest = nodeId;
        depth = candidateDepth;
      }
    }
    return deepest;
  }

  /**
   * Passive hover on a host preview while the overlay stays pointer-inert:
   * the stage listens, never prevents default, and only marks the hovered
   * node. Selection stays the host's trusted activation report.
   */
  #onPreviewStagePointerMove(event: PointerEvent): void {
    if (this.canvasDirectManipulation === true) return;
    const nodeId = this.#hitTestMeasurements(event.clientX, event.clientY);
    if (nodeId !== this.hoveredNodeId) this.hoveredNodeId = nodeId;
  }

  #onPreviewStagePointerLeave(): void {
    if (this.canvasDirectManipulation !== true) this.hoveredNodeId = undefined;
  }

  #libraryHoldsFocus(): boolean {
    const active = this.#shadowActiveElement();
    return (
      active !== null && this.shadowRoot?.querySelector('aside.library')?.contains(active) === true
    );
  }

  #outlineHoldsFocus(): boolean {
    const active = this.#shadowActiveElement();
    return (
      active !== null && this.shadowRoot?.querySelector('aside.outline')?.contains(active) === true
    );
  }

  #inspectorHoldsFocus(): boolean {
    const active = this.#shadowActiveElement();
    return (
      active !== null &&
      this.shadowRoot?.querySelector('aside.inspector')?.contains(active) === true
    );
  }

  /** The focused element inside the shadow tree, or null when none resolves. */
  #shadowActiveElement(): Element | null {
    const root = this.shadowRoot;
    if (root === null || !this.isConnected) {
      return null;
    }
    try {
      return root.activeElement;
    } catch {
      // A DOM implementation may fail to resolve focus across a detached
      // tree; an unresolved focus is treated as none.
      return null;
    }
  }

  /**
   * Opens a container as the structure view's current level. The first listed
   * row takes focus. A level that is empty by the time it renders has already
   * fallen back to its parent (`#alignPanelToPendingFocus`), which lists the
   * container and focuses it, so focus is never dropped into a hidden region.
   */
  #openScope(nodeId: NodeId): void {
    const roots = this.document?.roots;
    if (roots === undefined) {
      return;
    }
    const node = findOutlineLocation(roots, nodeId)?.node;
    if (node === undefined || !hasListedChildren(node)) {
      return;
    }
    this.panelScopeId = nodeId;
    this.panelView = 'structure';
    if (this.activePane === 'inspector') {
      this.activePane = 'outline';
    }
    void this.updateComplete.then(() => {
      if (this.panelScopeId !== nodeId || this.panelView !== 'structure') {
        return;
      }
      const outline = this.shadowRoot?.querySelector('aside.outline');
      const target =
        outline?.querySelector<HTMLElement>('button.outline-entry') ??
        outline?.querySelector<HTMLElement>('button.panel-back') ??
        null;
      target?.focus();
    });
    this.#announceLayer('structure', nodeId);
  }

  /** Returns one level up; the container that was opened is listed there and takes focus. */
  #closeScope(): void {
    const previous = this.panelScopeId;
    const roots = this.document?.roots;
    if (previous === undefined || roots === undefined) {
      return;
    }
    const parent = parentScopeOf(roots, previous);
    this.panelScopeId = parent;
    this.#pendingFocusNodeId = previous;
    this.#announceLayer('structure', parent);
  }

  /** Returns to the page level; the container that was opened takes focus. */
  #showWholeTree(): void {
    const previous = this.panelScopeId;
    this.panelScopeId = undefined;
    this.#pendingFocusNodeId = previous;
    this.#announceLayer('structure', undefined);
  }

  /**
   * Shows the selected block's details. `control` focuses the first typed
   * control, as `Enter`, `F2`, double-click and `Edit` do; `none` leaves focus
   * alone, as a page click does. Either way focus that would otherwise sit in
   * a region the details view hides moves to the `Back` control.
   */
  #openDetails(nodeId: NodeId, options: { focus: 'control' | 'none' }): void {
    if (this.selectedNodeId !== nodeId) {
      this.#selectNode(nodeId);
    }
    const leaving = this.#focusInsideStructureRegions();
    this.panelView = 'details';
    if (this.activePane === 'outline') {
      this.activePane = 'inspector';
    }
    void this.updateComplete.then(() => {
      if (this.panelView !== 'details') {
        return;
      }
      if (options.focus === 'control') {
        if (this.selectedNodeId !== nodeId) {
          return;
        }
        const control = this.#firstDetailsControl();
        control?.focus();
        if (control === null || !this.#holdsFocus(control)) {
          // A candidate inside a closed disclosure ignores focus(); the
          // header control is the visible fallback.
          this.#focusPanelBack();
        }
      } else if (leaving) {
        this.#focusPanelBack();
      }
    });
    this.#announceLayer('details', nodeId);
  }

  /**
   * Returns from the details to the structure view with the selected entry
   * focused and listed. A no-op in the contextual Content and Model modes,
   * where the docked panel is the details view and the Blueprint tab returns.
   */
  #showStructure(): void {
    if (this.inspectorMode === 'content' || this.inspectorMode === 'model') {
      return;
    }
    const roots = this.document?.roots ?? [];
    const active = this.#shadowActiveElement();
    const fromInspector =
      active !== null &&
      this.shadowRoot?.querySelector('aside.inspector')?.contains(active) === true;
    this.panelView = 'structure';
    if (this.activePane === 'inspector') {
      this.activePane = 'outline';
    }
    const selected = this.selectedNodeId;
    if (selected !== undefined && findOutlineLocation(roots, selected) !== undefined) {
      if (!isNodeListed(roots, this.panelScopeId, selected)) {
        this.panelScopeId = listingScopeFor(roots, selected);
      }
      this.#pendingFocusNodeId = selected;
    } else if (fromInspector) {
      void this.updateComplete.then(() => {
        if (this.panelView === 'structure') {
          this.shadowRoot?.querySelector<HTMLElement>('aside.outline')?.focus();
        }
      });
    }
    this.#announceLayer('structure', this.panelScopeId);
  }

  /** Announces a layer change once through the polite live region. */
  #announceLayer(view: 'structure' | 'details', subjectId: NodeId | undefined): void {
    const key = `${view}:${subjectId ?? ''}`;
    if (key === this.#announcedLayer) {
      return;
    }
    this.#announcedLayer = key;
    const subject =
      subjectId === undefined || this.document === undefined
        ? undefined
        : findOutlineLocation(this.document.roots, subjectId)?.node;
    this.#announce('studio.shell/announce-panel-layer', {
      label:
        subject === undefined ? this.#text('studio.shell/panel-page') : this.#nodeLabel(subject),
      layer: this.#text(
        view === 'structure' ? 'studio.shell/outline-heading' : 'studio.shell/inspector-heading',
      ),
    });
  }

  /**
   * Runs before every render: a level whose container left the document falls
   * back to the page, a level that lost its last child falls back to its
   * parent (which lists the container), and a pending focus target (after
   * insert, delete, duplicate, move, restore, undo or redo) is always listed
   * in the structure view, which is the layer that shows it. Silent: each of
   * those actions announces its own outcome. In the contextual Content and
   * Model modes the docked panel stays: the structure view would hide it with
   * no `Back` and no `Escape` unwind, so the target is only listed for the
   * return through the wrapper's `Blueprint` tab.
   */
  #alignPanelToPendingFocus(): void {
    const roots = this.document?.roots;
    if (roots === undefined) {
      return;
    }
    const scope = this.panelScopeId;
    if (scope !== undefined && findOutlineLocation(roots, scope) === undefined) {
      this.panelScopeId = undefined;
      this.#announcedLayer = undefined;
    } else if (scope !== undefined && scopeChildren(roots, scope).length === 0) {
      this.panelScopeId = parentScopeOf(roots, scope);
      this.#announcedLayer = undefined;
      const target = this.#pendingFocusNodeId;
      if (
        (target === undefined || findOutlineLocation(roots, target) === undefined) &&
        this.#outlineHoldsFocus()
      ) {
        // The focused row leaves with the level; the container that held it
        // is listed one level up and takes its place.
        this.#pendingFocusNodeId = scope;
      }
    }
    const pending = this.#pendingFocusNodeId;
    if (pending === undefined || findOutlineLocation(roots, pending) === undefined) {
      return;
    }
    if (!isNodeListed(roots, this.panelScopeId, pending)) {
      this.panelScopeId = listingScopeFor(roots, pending);
      this.#announcedLayer = undefined;
    }
    const contextual = this.inspectorMode === 'content' || this.inspectorMode === 'model';
    if (!contextual && this.panelView !== 'structure') {
      this.panelView = 'structure';
      if (this.activePane === 'inspector') {
        this.activePane = 'outline';
      }
      this.#announcedLayer = undefined;
    }
  }

  /**
   * The element an Escape may unwind the panel from: a control of the panel's
   * own chrome inside the outline or the inspector. Text entry, selects,
   * editable regions and imperatively mounted controls keep their Escape.
   */
  #panelEscapeOrigin(event: KeyboardEvent): Element | null {
    const origin = event.composedPath()[0];
    const root = this.shadowRoot;
    if (!(origin instanceof Element) || root === null) {
      return null;
    }
    const outline = root.querySelector('aside.outline');
    const inspector = root.querySelector('aside.inspector');
    if (outline?.contains(origin) !== true && inspector?.contains(origin) !== true) {
      return null;
    }
    if (
      origin.closest(
        '[data-authoring-key], [data-resource-authoring-key], [data-entry-control-key], [contenteditable]',
      ) !== null
    ) {
      return null;
    }
    const name = origin.localName;
    if (name === 'textarea' || name === 'select') {
      return null;
    }
    if (name === 'input') {
      const type = origin.getAttribute('type') ?? 'text';
      if (!['button', 'submit', 'reset', 'checkbox', 'radio'].includes(type)) {
        return null;
      }
    }
    return origin;
  }

  /** The first enabled typed control of the details view, in the order `Enter` on the stage uses. */
  #firstDetailsControl(): HTMLElement | null {
    const selector = ':is(input, select, textarea):not(:disabled)';
    const shadowDefault = this.shadowRoot?.querySelector<HTMLElement>('.inspector-default');
    return (
      (shadowDefault?.hasAttribute('hidden') === false
        ? shadowDefault.querySelector<HTMLElement>(`.scalar-control ${selector}`)
        : null) ??
      this.querySelector<HTMLElement>(`[slot="contextual-inspector"] ${selector}`) ??
      this.shadowRoot?.querySelector<HTMLElement>(`.inspector-default:not([hidden]) ${selector}`) ??
      null
    );
  }

  /** Whether `element` is the focused element of its own tree (shadow or light). */
  #holdsFocus(element: Element): boolean {
    const tree = element.getRootNode();
    const active =
      tree instanceof Document || tree instanceof ShadowRoot ? tree.activeElement : null;
    return active === element;
  }

  /** Whether focus sits in a region the details view hides at wide widths. */
  #focusInsideStructureRegions(): boolean {
    const active = this.#shadowActiveElement();
    if (active === null) {
      return false;
    }
    const root = this.shadowRoot;
    return (
      root?.querySelector('aside.outline')?.contains(active) === true ||
      root?.querySelector('aside.library')?.contains(active) === true
    );
  }

  /**
   * Focuses the details header's `Back` control, or the details region itself
   * in the contextual Content and Model modes, which render no `Back`: focus
   * that leaves a hiding region always lands on something visible.
   */
  #focusPanelBack(): void {
    const inspector = this.shadowRoot?.querySelector<HTMLElement>('aside.inspector');
    const back = inspector?.querySelector<HTMLButtonElement>('button.panel-back');
    (back ?? inspector)?.focus();
  }

  #toggleLibrary(): void {
    if (this.libraryOpen && this.activePane !== 'library' && this.#sheetsActive()) {
      // Narrow sheets ignore the disclosure: an open library behind another
      // sheet is brought forward rather than closed.
      this.activePane = 'library';
      return;
    }
    if (this.libraryOpen && this.#libraryHoldsFocus()) {
      // Hiding the panel would drop its focus to the body; the control that
      // closes the disclosure takes it instead.
      this.shadowRoot?.querySelector<HTMLButtonElement>('button.add-blocks-toggle')?.focus();
    }
    this.libraryOpen = !this.libraryOpen;
    if (this.libraryOpen) {
      this.activePane = 'library';
    } else {
      // The header naming a pending destination closes with the layer.
      this.#clearInsertDestination();
      if (this.activePane === 'library') {
        this.activePane = 'outline';
      }
    }
  }

  /**
   * Every `+` control: records the explicit destination, makes sure the add
   * layer is showing (it belongs to the structure view, which is hidden with
   * it at wide widths) and moves focus to its search field, which the
   * destination line describes. One opened level is kept.
   */
  #beginInsert(destination: CommandDestination): void {
    this.pendingInsertDestination = destination;
    this.#pendingInsertEntries = destinationEntries(this.document?.roots ?? [], destination);
    // The contextual Content and Model views offer no `+` (`#offeredDestination`).
    if (this.panelView !== 'structure') {
      this.panelView = 'structure';
      if (this.activePane === 'inspector') this.activePane = 'outline';
      this.#announceLayer('structure', this.panelScopeId);
    }
    if (!this.libraryOpen || (this.#sheetsActive() && this.activePane !== 'library')) {
      this.#toggleLibrary();
    }
    void this.updateComplete.then(() => {
      if (this.pendingInsertDestination === destination) {
        this.shadowRoot?.querySelector<HTMLElement>('aside.library input')?.focus();
      }
    });
  }

  /** Whether the workspace currently shows one sheet at a time (its pane switcher is laid out). */
  #sheetsActive(): boolean {
    const switcher = this.shadowRoot?.querySelector('nav.pane-switcher');
    return (
      switcher !== null && switcher !== undefined && switcher.getBoundingClientRect().height > 0
    );
  }

  #selectViewport(viewport: ThemeViewport): void {
    if (this.activeViewport?.id === viewport.id) {
      return;
    }
    this.#activeViewportId = viewport.id;
    this.dispatchEvent(
      new CustomEvent<StudioViewportChangeDetail>('studio-viewport-change', {
        bubbles: true,
        composed: true,
        detail: { viewport },
      }),
    );
    this.#announce('studio.shell/announce-viewport-changed', {
      label: referenceText(viewport.label),
    });
    this.#schedulePreview();
    this.requestUpdate();
  }

  /**
   * Preview is deny-by-default: feature policy, the canonical preview port
   * with render and cancellation operations, and a concrete browser binding
   * must all agree before the shell opens a channel.
   */
  #usesLocalCanvas(): boolean {
    // A failed configured preview must not become local output. Local mode
    // is explicit, with host preview disabled and no pending binding.
    return (
      this.localCanvasContext !== undefined &&
      this.previewBinding === undefined &&
      this.configuration?.session.preview.enabled !== true
    );
  }

  #renderLocalCanvas(): TemplateResult {
    const state = this.localCanvasState ?? 'rendering';
    return html`
      <section
        class="preview-region local-canvas-region"
        data-local-canvas-state=${state}
        aria-label=${this.#text('studio.shell/local-canvas-label')}
      >
        <h2 class="assistive">${this.#text('studio.shell/local-canvas-label')}</h2>
        <p class="preview-status">
          ${this.#text(state === 'unavailable' ? 'studio.shell/local-canvas-unavailable' : 'studio.shell/local-canvas-description')}
        </p>
        <div
          class="preview-stage"
          role="group"
          aria-label=${this.#text('studio.shell/local-canvas-label')}
          tabindex="0"
          @keydown=${(event: KeyboardEvent): void => {
            this.#onPreviewStageKeydown(event);
          }}
        >
          <div class="local-canvas-host"></div>
          ${this.#renderPreviewCanvasOverlay()}
        </div>
        ${this.#renderPreviewCanvasStatus()}
      </section>
    `;
  }

  #synchronizeLocalCanvas(changed: PropertyValues<this>): void {
    const holder = this.#usesLocalCanvas()
      ? this.shadowRoot?.querySelector<HTMLElement>('.local-canvas-host')
      : undefined;
    const draft = this.document;
    const context = this.localCanvasContext;
    if (holder == null || draft === undefined || context === undefined) {
      this.#disposeLocalCanvas();
      return;
    }
    let created = false;
    if (this.#localCanvasHolder !== holder || this.#localCanvas === undefined) {
      this.#disposeLocalCanvas();
      this.#localCanvasHolder = holder;
      this.#localCanvas = new StudioLocalCanvas(holder, {
        onActivated: (nodeId): void => {
          this.#selectFromPage(nodeId, { notifyPreview: false });
        },
        onGeometry: (geometry): void => {
          this.canvasGeometry = geometry;
          if (geometry === undefined) {
            this.hoveredNodeId = undefined;
            this.#cancelDrag();
          }
        },
        onState: (state): void => {
          this.localCanvasState = state;
        },
      });
      this.canvasDirectManipulation = true;
      created = true;
    }
    const viewport = this.activeViewport;
    if (
      created ||
      changed.has('document') ||
      changed.has('localCanvasContext') ||
      this.#localCanvasViewport !== viewport?.id
    ) {
      this.#localCanvasViewport = viewport?.id;
      void this.#localCanvas.update(draft, context, viewport?.previewWidth ?? 1440);
    }
  }

  #disposeLocalCanvas(): void {
    this.#localCanvas?.dispose();
    this.#localCanvas = undefined;
    this.#localCanvasHolder = undefined;
    this.#localCanvasViewport = undefined;
  }

  #previewCapabilityAvailable(): boolean {
    const session = this.configuration?.session;
    if (session?.preview.enabled !== true) {
      return false;
    }
    return session.hostCapabilities.ports.some(
      (port) =>
        port.id === 'studio.port/preview' &&
        port.operations.includes('studio.operation/preview.render') &&
        port.operations.includes('studio.operation/preview.cancel'),
    );
  }

  #schedulePreview(): void {
    const surface = this.#previewSurface;
    const document = this.document;
    if (surface === undefined || document === undefined) {
      return;
    }
    surface.update(
      document,
      this.activeViewport?.id ?? this.configuration?.session.preview.initialViewport,
    );
  }

  #synchronizePreviewSurface(): void {
    const binding = this.previewBinding;
    const generation = this.configuration?.session.sessionGeneration;
    const available = this.#previewCapabilityAvailable();
    if (!available || binding === undefined || generation === undefined) {
      if (this.#previewSurface !== undefined) {
        this.#previewSurface.teardown('studio.preview/capability-revoked');
      }
      this.#previewSurface = undefined;
      this.#activePreviewBinding = undefined;
      this.#previewBindingGeneration = undefined;
      this.previewState = 'unavailable';
      this.canvasGeometry = undefined;
      return;
    }
    if (
      this.#previewSurface !== undefined &&
      this.#activePreviewBinding === binding &&
      this.#previewBindingGeneration === generation
    ) {
      return;
    }
    this.#previewSurface?.teardown('studio.preview/session-replaced');
    this.#activePreviewBinding = binding;
    this.#previewBindingGeneration = generation;
    this.#previewSurface = new StudioPreviewSurface(binding, {
      onActivated: (nodeId): void => {
        this.#selectFromPage(nodeId, { notifyPreview: false });
      },
      onGeometry: (geometry): void => {
        this.canvasGeometry = geometry;
        if (geometry === undefined) {
          this.hoveredNodeId = undefined;
          if (this.#previewDrag !== undefined) {
            this.#cancelDrag();
          }
        }
      },
      onMessage: (message): void => {
        this.notifyPreviewMessage(message);
      },
      onState: (state): void => {
        this.previewState = state;
      },
    });
  }

  #serializedInspectorValue(
    node: BlueprintNode,
    property: string,
    viewport: ThemeViewport | undefined,
  ): string {
    const value =
      viewport === undefined
        ? node.properties[property]
        : node.responsive?.[property]?.[viewport.id];
    return value === undefined ? '' : JSON.stringify(value);
  }

  #fieldAtPath(fieldPath: readonly string[]): FieldDefinition | undefined {
    let fields = this.contentModel?.fields;
    let resolved: FieldDefinition | undefined;
    for (const member of fieldPath) {
      resolved = fields?.find((field) => field.id === member);
      if (resolved === undefined) {
        return undefined;
      }
      fields = resolved.fields;
    }
    return resolved;
  }

  #modelPortAdvertised(): boolean {
    return (
      this.configuration?.session.hostCapabilities.ports.some(
        (port) => port.id === 'studio.port/model',
      ) ?? false
    );
  }

  #resourcePortAdvertised(): boolean {
    return (
      this.configuration?.session.hostCapabilities.ports.some(
        (port) =>
          port.id === 'studio.port/resource' &&
          port.operations.includes('studio.operation/resource.search'),
      ) ?? false
    );
  }

  #setFieldBinding(node: BlueprintNode, port: string, candidate: FieldBindingCandidate): void {
    const session = this.#session;
    const document = this.document;
    if (
      session === undefined ||
      document === undefined ||
      !this.#permits('studio.command/set-binding')
    ) {
      return;
    }
    const current = node.bindings[port];
    const binding: FieldBinding =
      current?.source.kind === 'entry-field'
        ? {
            ...current,
            source: { fieldPath: [...candidate.fieldPath], kind: 'entry-field' },
          }
        : {
            onError: 'error',
            onNull: 'empty',
            source: { fieldPath: [...candidate.fieldPath], kind: 'entry-field' },
            transforms: [],
          };
    const command: SetBindingCommand = {
      ...this.#commandEnvelope(document, session),
      payload: { binding, nodeId: node.id, port },
      type: 'studio.command/set-binding',
    };
    if (this.#runShellCommand(command)) {
      this.#announce('studio.shell/announce-field-bound', {
        field: candidate.fieldPath.join('.'),
        port,
      });
    }
  }

  #setBinding(node: BlueprintNode): void {
    const session = this.#session;
    const document = this.document;
    const portInput =
      this.shadowRoot?.querySelector<HTMLInputElement>('input.inspector-binding-port') ?? null;
    const valueInput =
      this.shadowRoot?.querySelector<HTMLInputElement>('input.inspector-binding-value-input') ??
      null;
    if (
      session === undefined ||
      document === undefined ||
      !this.#permits('studio.command/set-binding') ||
      portInput === null ||
      valueInput === null
    ) {
      return;
    }
    const port = portInput.value.trim();
    if (port.length === 0) {
      this.#announce('studio.shell/announce-name-required');
      return;
    }
    if (
      this.#findDefinition(node)?.ports.some(
        (entry) => entry.id === port && entry.valueType === 'resource',
      )
    ) {
      this.#announce('studio.shell/announce-invalid-value', { label: port });
      return;
    }
    const parsed = this.#parseJsonInput(valueInput.value, port);
    if (parsed === undefined) {
      return;
    }
    const value = parsed.value;
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      this.#announce('studio.shell/announce-invalid-value', { label: port });
      return;
    }
    const command: SetBindingCommand = {
      ...this.#commandEnvelope(document, session),
      payload: { binding: value as unknown as FieldBinding, nodeId: node.id, port },
      type: 'studio.command/set-binding',
    };
    if (this.#runShellCommand(command)) {
      portInput.value = '';
      valueInput.value = '';
      this.#announce('studio.shell/announce-binding-set', { port });
    }
  }

  /**
   * Dispatches set-property for a base value or, with a viewport, for a
   * responsive override, and announces the outcome — naming the viewport for
   * overrides. Returns whether the command applied.
   */
  #setNodeProperty(
    node: BlueprintNode,
    property: string,
    value: JsonValue,
    viewport: ThemeViewport | undefined,
  ): boolean {
    const session = this.#session;
    const document = this.document;
    if (
      session === undefined ||
      document === undefined ||
      !this.#permits('studio.command/set-property')
    ) {
      return false;
    }
    const payload: SetPropertyPayload = { nodeId: node.id, property, value };
    if (viewport !== undefined) {
      payload.viewport = viewport.id;
    }
    const command: SetPropertyCommand = {
      ...this.#commandEnvelope(document, session),
      payload,
      type: 'studio.command/set-property',
    };
    if (!this.#runShellCommand(command)) {
      return false;
    }
    if (viewport === undefined) {
      this.#announce('studio.shell/announce-property-set', { property });
    } else {
      this.#announce('studio.shell/announce-override-set', {
        property,
        viewport: referenceText(viewport.label),
      });
    }
    return true;
  }

  /**
   * Dispatches set-size-role for one axis, targeting the base assignment or
   * the active viewport's override per `#sizeRoleTargetViewport`, and
   * announces the outcome naming the axis, the role, and — for overrides —
   * the viewport. Returns whether the command applied.
   */
  #setSizeRole(node: BlueprintNode, axis: SizeRoleAxis, role: string): boolean {
    const session = this.#session;
    const document = this.document;
    if (
      session === undefined ||
      document === undefined ||
      !this.#permits('studio.command/set-size-role')
    ) {
      return false;
    }
    const viewport = this.#sizeRoleTargetViewport();
    const payload: SetSizeRolePayload = { axis, nodeId: node.id, role };
    if (viewport !== undefined) {
      payload.viewport = viewport.id;
    }
    const command: SetSizeRoleCommand = {
      ...this.#commandEnvelope(document, session),
      payload,
      type: 'studio.command/set-size-role',
    };
    if (!this.#runShellCommand(command)) {
      return false;
    }
    if (viewport === undefined) {
      this.#announce('studio.shell/announce-size-role-set', {
        axis: this.#axisText(axis),
        role,
      });
    } else {
      this.#announce('studio.shell/announce-size-role-set-viewport', {
        axis: this.#axisText(axis),
        role,
        viewport: referenceText(viewport.label),
      });
    }
    return true;
  }

  /**
   * The responsive context size-role edits target: the active viewport when
   * the switcher is on a non-base viewport, otherwise the base assignment —
   * the same base-versus-viewport split responsive property dispatch uses,
   * resolved from the viewport switcher.
   */
  #sizeRoleTargetViewport(): ThemeViewport | undefined {
    const viewport = this.activeViewport;
    return viewport === undefined || viewport.base ? undefined : viewport;
  }

  /**
   * The declared size-role vocabulary of the active theme: the choices of
   * every `size-role` design control the host feeds through
   * `designControls`, deduplicated by identifier in declaration order.
   * Undefined when the host supplies no theme design controls at all —
   * the layout editor then falls back to a validated identifier input.
   */
  #sizeRoleVocabulary(): ThemeDesignChoice[] | undefined {
    const controls = this.#activeDesignControls();
    if (controls === undefined) {
      return undefined;
    }
    const choices: ThemeDesignChoice[] = [];
    const seen = new Set<string>();
    for (const control of controls) {
      if (control.kind !== 'size-role') {
        continue;
      }
      for (const choice of control.choices) {
        if (!seen.has(choice.id)) {
          seen.add(choice.id);
          choices.push(choice);
        }
      }
    }
    return choices;
  }

  /**
   * The visible outline label for a slot: the declared slot label from the
   * parent's block definition when resolvable, otherwise the raw slot name,
   * rendered through the catalog's slot template.
   */
  #slotLabel(node: BlueprintNode, slot: string): string {
    const declared = this.#findDefinition(node)?.slots.find((candidate) => candidate.id === slot);
    return this.#text('studio.shell/outline-slot', {
      slot: declared === undefined ? slot : referenceText(declared.label),
    });
  }

  #syncDirty(): void {
    const dirty = this.#session?.dirty ?? false;
    if (dirty === this.#lastDirty) {
      return;
    }
    this.#lastDirty = dirty;
    this.dispatchEvent(
      new CustomEvent<StudioDirtyChangedDetail>('studio-dirty-changed', {
        bubbles: true,
        composed: true,
        detail: { dirty },
      }),
    );
  }

  #text(key: StudioMessageKey, parameters?: Readonly<Record<string, string>>): string {
    return messageText(key, this.messages, parameters);
  }

  #togglePalette(event?: Event): void {
    if (this.paletteOpen === true) {
      this.#closePalette(true);
      return;
    }
    const origin = event?.composedPath()[0];
    this.#paletteInvoker = origin instanceof HTMLElement ? origin : undefined;
    this.paletteOpen = true;
    this.paletteFilter = '';
    this.#pendingPaletteFocus = true;
  }

  #unsetNodeProperty(
    node: BlueprintNode,
    property: string,
    viewport: ThemeViewport | undefined,
  ): void {
    const session = this.#session;
    const document = this.document;
    if (
      session === undefined ||
      document === undefined ||
      !this.#permits('studio.command/unset-property')
    ) {
      return;
    }
    const payload: UnsetPropertyPayload = { nodeId: node.id, property };
    if (viewport !== undefined) {
      payload.viewport = viewport.id;
    }
    const command: UnsetPropertyCommand = {
      ...this.#commandEnvelope(document, session),
      payload,
      type: 'studio.command/unset-property',
    };
    if (!this.#runShellCommand(command)) {
      return;
    }
    if (viewport === undefined) {
      this.#announce('studio.shell/announce-property-unset', { property });
    } else {
      this.#announce('studio.shell/announce-override-removed', {
        property,
        viewport: referenceText(viewport.label),
      });
    }
  }

  /**
   * Dispatches unset-size-role for one axis against the context
   * `#sizeRoleTargetViewport` resolves, announcing the removal with the
   * axis and — for overrides — the viewport.
   */
  #unsetSizeRole(node: BlueprintNode, axis: SizeRoleAxis): void {
    const session = this.#session;
    const document = this.document;
    if (
      session === undefined ||
      document === undefined ||
      !this.#permits('studio.command/unset-size-role')
    ) {
      return;
    }
    const viewport = this.#sizeRoleTargetViewport();
    const payload: UnsetSizeRolePayload = { axis, nodeId: node.id };
    if (viewport !== undefined) {
      payload.viewport = viewport.id;
    }
    const command: UnsetSizeRoleCommand = {
      ...this.#commandEnvelope(document, session),
      payload,
      type: 'studio.command/unset-size-role',
    };
    if (!this.#runShellCommand(command)) {
      return;
    }
    if (viewport === undefined) {
      this.#announce('studio.shell/announce-size-role-removed', {
        axis: this.#axisText(axis),
      });
    } else {
      this.#announce('studio.shell/announce-size-role-removed-viewport', {
        axis: this.#axisText(axis),
        viewport: referenceText(viewport.label),
      });
    }
  }
}

/**
 * Session-level rejections meaning the document/session pairing is stale or
 * non-writable rather than the command being malformed. They surface through
 * the conflict announcement, which carries recovery guidance.
 */
const CONFLICT_ERROR_CODES: ReadonlySet<StudioCommandErrorCode> = new Set([
  'read-only-session',
  'stale-generation',
  'stale-state',
]);

const AXIS_MESSAGE_KEYS: Record<SizeRoleAxis, StudioMessageKey> = {
  block: 'studio.shell/inspector-layout-axis-block',
  inline: 'studio.shell/inspector-layout-axis-inline',
};

/** Both layout axes in the order the layout section renders them. */
const SIZE_ROLE_AXES: readonly SizeRoleAxis[] = ['inline', 'block'];

/**
 * The canonical bounded lower-case identifier shape (the shared local-name
 * pattern of the command schema) the fallback role input validates against
 * before dispatching, with the prototype-polluting names the schema also
 * excludes.
 */
const SIZE_ROLE_IDENTIFIER = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;

const FORBIDDEN_ROLE_IDENTIFIERS: ReadonlySet<string> = new Set([
  '__proto__',
  'constructor',
  'prototype',
]);

const SEVERITY_MESSAGE_KEYS: Record<StudioDiagnostic['severity'], StudioMessageKey> = {
  blocking: 'studio.shell/severity-blocking',
  error: 'studio.shell/severity-error',
  information: 'studio.shell/severity-information',
  warning: 'studio.shell/severity-warning',
};

const SEVERITY_RANK: Record<StudioDiagnostic['severity'], number> = {
  blocking: 0,
  error: 1,
  information: 3,
  warning: 2,
};

const STUDIO_AUTHORING_CONTROLS: ReadonlySet<string> = new Set(
  Object.values(STUDIO_AUTHORING_CONTROL_IDS),
);

function isStudioAuthoringControlId(value: string): value is StudioAuthoringControlId {
  return STUDIO_AUTHORING_CONTROLS.has(value);
}

function defaultAuthoringControlValue(control: StudioAuthoringControlId): unknown {
  switch (control) {
    case 'studio.control/rich-text':
      return { content: [], type: 'doc' };
    case 'studio.control/source':
      return '';
    case 'studio.control/chart':
      return {
        datasets: [{ label: 'Series 1', values: [0] }],
        labels: ['Label 1'],
        type: 'bar',
      };
    case 'studio.control/drawing':
      return { alt: 'Drawing', height: 600, strokes: [], width: 800 };
    case 'studio.control/money':
      return { amount: '0', currency: 'USD' };
    case 'studio.control/media-collection':
      return [];
    case 'studio.control/media-reference':
      return undefined;
    case 'studio.control/scoped-css':
      return { rules: [] };
    case 'studio.control/table':
      return { columns: ['Column 1'], rows: [['']] };
  }
}

function authoringTargetSignature(target: InspectorAuthoringTarget): string {
  return JSON.stringify({
    bindingKind: target.binding?.source.kind,
    control: target.control,
    kind: target.kind,
    name: target.name,
    profile: target.profile,
    readOnly: target.readOnly,
    value: target.value,
  });
}

function resourceBindingTargetSignature(target: InspectorResourceBindingTarget): string {
  return JSON.stringify({
    binding: target.binding,
    multiple: target.multiple,
    readOnly: target.readOnly,
  });
}

/**
 * Copy an editor-produced value into the bounded language-neutral JSON
 * domain. Unsupported objects, non-finite numbers and excessive structures
 * fail closed instead of being coerced into persisted protocol data.
 */
function toJsonValue(value: unknown, depth = 0): JsonValue | undefined {
  if (depth > 32) return undefined;
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string') return value.length <= 1_000_000 ? value : undefined;
  if (Array.isArray(value)) {
    if (value.length > 10_000) return undefined;
    const result: JsonValue[] = [];
    for (const item of value) {
      const parsed = toJsonValue(item, depth + 1);
      if (parsed === undefined) return undefined;
      result.push(parsed);
    }
    return result;
  }
  if (typeof value !== 'object' || value === undefined) return undefined;
  const prototype = Object.getPrototypeOf(value) as unknown;
  if (prototype !== Object.prototype && prototype !== null) return undefined;
  const entries = Object.entries(value);
  if (entries.length > 1_000) return undefined;
  const result: Record<string, JsonValue> = {};
  for (const [key, item] of entries) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') return undefined;
    const parsed = toJsonValue(item, depth + 1);
    if (parsed === undefined) return undefined;
    result[key] = parsed;
  }
  return result;
}

function diagnosticText(entry: StudioDiagnostic): string {
  const template = referenceText(entry.message);
  if (entry.parameters === undefined) {
    return template;
  }
  let text = template;
  for (const [name, value] of Object.entries(entry.parameters)) {
    text = text.replaceAll(`{${name}}`, String(value));
  }
  return text;
}

function boundingPreviewRect(rects: readonly PreviewMarkerRect[]): PreviewMarkerRect | undefined {
  const visible = rects.filter((rect) => rect.width > 0 && rect.height > 0);
  const first = visible[0];
  if (first === undefined) {
    return undefined;
  }
  let left = first.x;
  let top = first.y;
  let right = first.x + first.width;
  let bottom = first.y + first.height;
  for (const rect of visible.slice(1)) {
    left = Math.min(left, rect.x);
    top = Math.min(top, rect.y);
    right = Math.max(right, rect.x + rect.width);
    bottom = Math.max(bottom, rect.y + rect.height);
  }
  return { height: bottom - top, width: right - left, x: left, y: top };
}

/** A CSP-safe SVG indicator for one ordered insertion boundary. */
function collectionPositionTarget(
  rects: readonly PreviewMarkerRect[],
  position: number,
): PreviewMarkerRect {
  const first = rects[0];
  const last = rects.at(-1);
  if (first === undefined || last === undefined) {
    return { height: 4, width: 4, x: 0, y: 0 };
  }
  const bounds = boundingPreviewRect(rects) ?? first;
  const xSpread = Math.abs(last.x + last.width / 2 - (first.x + first.width / 2));
  const ySpread = Math.abs(last.y + last.height / 2 - (first.y + first.height / 2));
  const before = rects[Math.max(0, position - 1)] ?? first;
  const after = rects[Math.min(rects.length - 1, position)] ?? last;
  if (xSpread > ySpread) {
    const boundary =
      position === 0
        ? first.x
        : position >= rects.length
          ? last.x + last.width
          : (before.x + before.width + after.x) / 2;
    return {
      height: Math.max(4, bounds.height),
      width: 4,
      x: boundary - 2,
      y: bounds.y,
    };
  }
  const boundary =
    position === 0
      ? first.y
      : position >= rects.length
        ? last.y + last.height
        : (before.y + before.height + after.y) / 2;
  return {
    height: 4,
    width: Math.max(4, bounds.width),
    x: bounds.x,
    y: boundary - 2,
  };
}

function isSizeRoleIdentifier(text: string): boolean {
  return (
    text.length > 0 &&
    text.length <= 100 &&
    SIZE_ROLE_IDENTIFIER.test(text) &&
    !FORBIDDEN_ROLE_IDENTIFIERS.has(text)
  );
}

function referenceText(reference: MessageReference): string {
  return reference.defaultMessage ?? reference.key;
}

/** The column counts the add layer and the command palette offer as one batch each. */
const COLUMN_COUNTS = [2, 3, 4] as const;

const PANE_LABELS = {
  canvas: 'studio.shell/canvas-pane',
  library: 'studio.shell/palette-heading',
  outline: 'studio.shell/outline-heading',
  inspector: 'studio.shell/inspector-heading',
} as const satisfies Record<string, StudioMessageKey>;
