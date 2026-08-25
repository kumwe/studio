import type { StudioRichTextProfile } from './index.js';

export type StudioRichTextProfileId =
  'studio.rich-text/documentation' | 'studio.rich-text/marketing' | 'studio.rich-text/portable';

/** Page controls whose authored content is provided by the Studio rich-text boundary. */
export type StudioRichTextContainerType =
  | 'studio.core/accordion-item'
  | 'studio.core/dialog'
  | 'studio.core/notice'
  | 'studio.core/popover'
  | 'studio.core/tab';

const PORTABLE_NODES = Object.freeze([
  'blockquote',
  'bulletList',
  'callout',
  'checklist',
  'checklistItem',
  'codeBlock',
  'doc',
  'hardBreak',
  'heading',
  'horizontalRule',
  'listItem',
  'orderedList',
  'paragraph',
  'table',
  'tableCell',
  'tableRow',
  'text',
]);
const PORTABLE_MARKS = Object.freeze(['bold', 'code', 'highlight', 'italic', 'strike']);
const ATTRIBUTE_LIMITS = Object.freeze({
  maximumDepth: 8,
  maximumItemsPerArray: 256,
  maximumPropertiesPerObject: 64,
  maximumStringLength: 4_096,
  maximumTotalBytes: 65_536,
});

function profile(maximumTextLength: number, maximumNodes: number): Readonly<StudioRichTextProfile> {
  return Object.freeze({
    allowedAttributes: Object.freeze({
      callout: Object.freeze(['tone']),
      checklistItem: Object.freeze(['checked', 'level']),
      codeBlock: Object.freeze(['language']),
      heading: Object.freeze(['level']),
      'mark:highlight': Object.freeze(['tone']),
      orderedList: Object.freeze(['start']),
      table: Object.freeze(['header']),
    }),
    allowedMarks: PORTABLE_MARKS,
    allowedNodes: PORTABLE_NODES,
    attributeLimits: ATTRIBUTE_LIMITS,
    headingLevels: Object.freeze([2, 3, 4] as const),
    maximumDepth: 32,
    maximumDocumentBytes: 1_048_576,
    maximumMarks: 20_000,
    maximumMarksPerNode: PORTABLE_MARKS.length,
    maximumNodes,
    maximumTextLength,
  });
}

/** Smallest interoperable profile and the fail-closed default. */
export const PORTABLE_RICH_TEXT_PROFILE: Readonly<StudioRichTextProfile> = profile(250_000, 5_000);

/** Content-page prose profile. It intentionally has the same closed grammar with a smaller bound. */
export const MARKETING_RICH_TEXT_PROFILE: Readonly<StudioRichTextProfile> = profile(100_000, 2_000);

/** Documentation profile. Code is an inert inline mark; executable code is never accepted. */
export const DOCUMENTATION_RICH_TEXT_PROFILE: Readonly<StudioRichTextProfile> = profile(
  500_000,
  10_000,
);

const PROFILES: Readonly<Record<StudioRichTextProfileId, Readonly<StudioRichTextProfile>>> =
  Object.freeze({
    'studio.rich-text/documentation': DOCUMENTATION_RICH_TEXT_PROFILE,
    'studio.rich-text/marketing': MARKETING_RICH_TEXT_PROFILE,
    'studio.rich-text/portable': PORTABLE_RICH_TEXT_PROFILE,
  });

/** Resolve only a Studio-owned, versioned profile. Unknown host input never widens the grammar. */
export function resolveRichTextProfile(
  id: StudioRichTextProfileId = 'studio.rich-text/portable',
): Readonly<StudioRichTextProfile> {
  const resolved: Readonly<StudioRichTextProfile> | undefined = PROFILES[id];
  if (resolved === undefined) {
    throw new TypeError(`Unknown Studio rich-text profile "${id}".`);
  }
  return resolved;
}

/**
 * Select the closed profile used for prose nested in first-party interactive
 * page controls. Unknown runtime input fails closed instead of silently
 * widening the editor grammar.
 */
export function resolveContainerRichTextProfile(
  containerType: StudioRichTextContainerType,
): StudioRichTextProfileId {
  switch (containerType) {
    case 'studio.core/accordion-item':
    case 'studio.core/dialog':
    case 'studio.core/notice':
    case 'studio.core/popover':
    case 'studio.core/tab':
      return 'studio.rich-text/marketing';
    default:
      throw new TypeError(`Unknown Studio rich-text container "${String(containerType)}".`);
  }
}
