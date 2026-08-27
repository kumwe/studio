import { KumweStudioElement } from './kumwe-studio.js';
import { KumweStudioContextualElement } from './contextual-authoring.js';

export {
  createStudioStandaloneSetup,
  type StudioStandaloneExtensions,
  type StudioStandaloneSetup,
} from './bootstrap.js';

export {
  parseScopedCss,
  serializeScopedCss,
  STUDIO_AUTHORING_CONTROL_IDS,
  StudioAuthoringControlRegistry,
  type StudioAuthoringControlChange,
  type StudioAuthoringControlHandle,
  type StudioAuthoringControlId,
  type StudioAuthoringControlIdMap,
  type StudioAuthoringControlOptions,
  type StudioAuthoringControlServices,
  type StudioCodeFieldAdapter,
  type StudioCodeFieldHandle,
  type StudioCodeFieldOptions,
  type StudioSourcePreviewAdapter,
  type StudioSourcePreviewValue,
} from './authoring-controls.js';
export type { StudioMediaAuthoringServices } from './media-authoring-control.js';
export {
  isStudioResourceReference,
  mountStudioResourceBindingControl,
  type StudioResourceBindingChange,
  type StudioResourceBindingControlHandle,
  type StudioResourceBindingControlOptions,
  type StudioResourceSearchService,
  type StudioResourceTypeOption,
} from './resource-authoring-control.js';

export function defineKumweStudio(tagName = 'kumwe-studio'): void {
  if (customElements.get(tagName) === undefined) {
    customElements.define(tagName, KumweStudioElement);
  }
}

/** Register the canonical resource-bound shell and its internal Blueprint canvas. */
export function defineKumweStudioContextual(tagName = 'kumwe-studio-contextual'): void {
  defineKumweStudio();
  if (customElements.get(tagName) === undefined) {
    customElements.define(tagName, KumweStudioContextualElement);
  }
}

export {
  KumweStudioContextualElement,
  STUDIO_CONTEXTUAL_MODES,
  STUDIO_CONTEXTUAL_PRESENTATIONS,
  STUDIO_CONTEXTUAL_SAVE_OUTCOMES,
  type StudioContextualChangeDetail,
  type StudioContextualDirtyState,
  type StudioContextualModeChangeDetail,
  type StudioContextualPresentationChangeDetail,
  type StudioContextualSaveRequestDetail,
  type StudioContextualStateVersions,
} from './contextual-authoring.js';

export {
  KumweStudioElement,
  type StudioDirtyChangedDetail,
  type StudioDocumentChangeDetail,
  type StudioInsertRequestDetail,
  type StudioScopedStyleChangeDetail,
  type StudioViewportChangeDetail,
} from './kumwe-studio.js';
export {
  type StudioPreviewBinding,
  type StudioPreviewDraftIdentity,
  type StudioPreviewGeometry,
  type StudioPreviewStageOptions,
  type StudioPreviewState,
} from './preview-surface.js';
export {
  messageText,
  studioMessageCatalog,
  studioMessages,
  type StudioMessage,
  type StudioMessageCatalog,
  type StudioMessageCatalogEntry,
  type StudioMessageKey,
  type StudioMessageOverrides,
} from './messages.js';

declare global {
  interface HTMLElementTagNameMap {
    'kumwe-studio': KumweStudioElement;
  }
}
