import { KumweStudioElement } from './kumwe-studio.js';

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
