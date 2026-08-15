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
  messageText,
  studioMessages,
  type StudioMessage,
  type StudioMessageKey,
  type StudioMessageOverrides,
} from './messages.js';

declare global {
  interface HTMLElementTagNameMap {
    'kumwe-studio': KumweStudioElement;
  }
}
