import { KumweStudioElement } from './kumwe-studio.js';

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

export function defineKumweStudio(tagName = 'kumwe-studio'): void {
  if (customElements.get(tagName) === undefined) {
    customElements.define(tagName, KumweStudioElement);
  }
}

export {
  KumweStudioElement,
  type StudioDirtyChangedDetail,
  type StudioDocumentChangeDetail,
  type StudioInsertRequestDetail,
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
