import { KumweStudioElement } from './kumwe-studio.js';

export function defineKumweStudio(tagName = 'kumwe-studio'): void {
  if (customElements.get(tagName) === undefined) {
    customElements.define(tagName, KumweStudioElement);
  }
}

export {
  KumweStudioElement,
  type StudioDocumentChangeDetail,
  type StudioInsertRequestDetail,
} from './kumwe-studio.js';

declare global {
  interface HTMLElementTagNameMap {
    'kumwe-studio': KumweStudioElement;
  }
}
