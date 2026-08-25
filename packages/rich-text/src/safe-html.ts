import {
  parseRichTextDocument,
  type StudioRichTextDocument,
  type StudioRichTextMark,
  type StudioRichTextNode,
} from './index.js';
import { resolveRichTextProfile, type StudioRichTextProfileId } from './profiles.js';

const SAFE_TAG_CEILING = Object.freeze([
  'b',
  'blockquote',
  'br',
  'code',
  'del',
  'em',
  'h2',
  'h3',
  'h4',
  'hr',
  'i',
  'li',
  'ol',
  'p',
  's',
  'strong',
  'ul',
]);
const DROP_WITH_CONTENT = new Set([
  'canvas',
  'embed',
  'iframe',
  'math',
  'noscript',
  'object',
  'script',
  'style',
  'svg',
  'template',
]);

export interface SafeHtmlImportPolicy {
  allowedTags?: readonly string[];
  maximumInputCharacters?: number;
  profile?: StudioRichTextProfileId;
  unknownElements?: 'drop' | 'unwrap';
}

export const STUDIO_SAFE_HTML_POLICY: Readonly<Required<Omit<SafeHtmlImportPolicy, 'profile'>>> =
  Object.freeze({
    allowedTags: SAFE_TAG_CEILING,
    maximumInputCharacters: 1_000_000,
    unknownElements: 'unwrap',
  });

/**
 * Import inert HTML into canonical rich text. The DOM is only a parser: no
 * parsed node is connected, no handler/URL/style survives, and `innerHTML` is
 * never read or assigned.
 */
export function importSafeHtml(
  source: string,
  policy: SafeHtmlImportPolicy = {},
): StudioRichTextDocument {
  const normalized = normalizePolicy(policy);
  if (source.length > normalized.maximumInputCharacters) {
    throw new RangeError('HTML input exceeds its configured character limit.');
  }
  if (typeof DOMParser !== 'function') {
    throw new Error('Safe HTML import requires a standards-compatible DOMParser.');
  }
  const parsed = new DOMParser().parseFromString(source, 'text/html');
  const blocks: StudioRichTextNode[] = [];
  let looseInline: StudioRichTextNode[] = [];

  const flushLoose = (): void => {
    const content = compactInline(looseInline);
    if (content.length > 0) {
      blocks.push({ content, type: 'paragraph' });
    }
    looseInline = [];
  };

  for (const child of parsed.body.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      looseInline.push(...inlineNodes(child, [], normalized));
      continue;
    }
    if (!(child instanceof Element)) {
      continue;
    }
    const converted = blockNode(child, normalized);
    if (converted === undefined) {
      if (!DROP_WITH_CONTENT.has(child.localName)) {
        looseInline.push(...inlineNodes(child, [], normalized));
      }
      continue;
    }
    flushLoose();
    blocks.push(converted);
  }
  flushLoose();

  return parseRichTextDocument(
    { content: blocks.length > 0 ? blocks : [{ type: 'paragraph' }], type: 'doc' },
    resolveRichTextProfile(policy.profile),
  );
}

interface NormalizedPolicy {
  allowedTags: ReadonlySet<string>;
  maximumInputCharacters: number;
  unknownElements: 'drop' | 'unwrap';
}

function normalizePolicy(policy: SafeHtmlImportPolicy): NormalizedPolicy {
  const maximumInputCharacters =
    policy.maximumInputCharacters ?? STUDIO_SAFE_HTML_POLICY.maximumInputCharacters;
  if (
    !Number.isSafeInteger(maximumInputCharacters) ||
    maximumInputCharacters < 1 ||
    maximumInputCharacters > 10_000_000
  ) {
    throw new RangeError('maximumInputCharacters must be between 1 and 10000000.');
  }
  const tags = policy.allowedTags ?? STUDIO_SAFE_HTML_POLICY.allowedTags;
  const normalized = tags.map((tag) => tag.toLowerCase());
  if (
    new Set(normalized).size !== normalized.length ||
    normalized.some((tag) => !SAFE_TAG_CEILING.includes(tag))
  ) {
    throw new TypeError('Safe HTML policy may only narrow the Studio tag ceiling.');
  }
  return {
    allowedTags: new Set(normalized),
    maximumInputCharacters,
    unknownElements: policy.unknownElements ?? STUDIO_SAFE_HTML_POLICY.unknownElements,
  };
}

function blockNode(element: Element, policy: NormalizedPolicy): StudioRichTextNode | undefined {
  const tag = element.localName;
  if (!policy.allowedTags.has(tag)) {
    return undefined;
  }
  if (tag === 'p') {
    return { content: compactInline(inlineNodes(element, [], policy)), type: 'paragraph' };
  }
  if (tag === 'h2' || tag === 'h3' || tag === 'h4') {
    return {
      attrs: { level: Number(tag.slice(1)) },
      content: compactInline(inlineNodes(element, [], policy)),
      type: 'heading',
    };
  }
  if (tag === 'hr') {
    return { type: 'horizontalRule' };
  }
  if (tag === 'blockquote') {
    const content = childBlocks(element, policy);
    return {
      content:
        content.length > 0
          ? content
          : [{ content: compactInline(inlineNodes(element, [], policy)), type: 'paragraph' }],
      type: 'blockquote',
    };
  }
  if (tag === 'ul' || tag === 'ol') {
    const items = [...element.children]
      .filter((child) => child.localName === 'li' && policy.allowedTags.has('li'))
      .map((child) => listItem(child, policy));
    if (items.length === 0) {
      return undefined;
    }
    const list: StudioRichTextNode = {
      content: items,
      type: tag === 'ol' ? 'orderedList' : 'bulletList',
    };
    if (tag === 'ol') {
      const start = Number(element.getAttribute('start') ?? '1');
      if (Number.isSafeInteger(start) && start > 1 && start <= 1_000_000) {
        list.attrs = { start };
      }
    }
    return list;
  }
  return undefined;
}

function childBlocks(element: Element, policy: NormalizedPolicy): StudioRichTextNode[] {
  const blocks: StudioRichTextNode[] = [];
  for (const child of element.children) {
    const converted = blockNode(child, policy);
    if (converted !== undefined) {
      blocks.push(converted);
    }
  }
  return blocks;
}

function listItem(element: Element, policy: NormalizedPolicy): StudioRichTextNode {
  const nested: StudioRichTextNode[] = [];
  const inline: StudioRichTextNode[] = [];
  for (const child of element.childNodes) {
    if (child instanceof Element && (child.localName === 'ul' || child.localName === 'ol')) {
      const converted = blockNode(child, policy);
      if (converted !== undefined) {
        nested.push(converted);
      }
    } else {
      inline.push(...inlineNodes(child, [], policy));
    }
  }
  return {
    content: [{ content: compactInline(inline), type: 'paragraph' }, ...nested],
    type: 'listItem',
  };
}

function inlineNodes(
  node: Node,
  marks: readonly StudioRichTextMark[],
  policy: NormalizedPolicy,
): StudioRichTextNode[] {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.nodeValue ?? '';
    return text.length === 0
      ? []
      : [{ ...(marks.length > 0 ? { marks: [...marks] } : {}), text, type: 'text' }];
  }
  if (!(node instanceof Element)) {
    return [];
  }
  const tag = node.localName;
  if (
    DROP_WITH_CONTENT.has(tag) ||
    (!policy.allowedTags.has(tag) && policy.unknownElements === 'drop')
  ) {
    return [];
  }
  if (tag === 'br' && policy.allowedTags.has(tag)) {
    return [{ type: 'hardBreak' }];
  }
  const markType = markForTag(tag, policy);
  const nextMarks = markType === undefined ? marks : mergeMark(marks, markType);
  return [...node.childNodes].flatMap((child) => inlineNodes(child, nextMarks, policy));
}

function markForTag(tag: string, policy: NormalizedPolicy): string | undefined {
  if (!policy.allowedTags.has(tag)) {
    return undefined;
  }
  if (tag === 'b' || tag === 'strong') return 'bold';
  if (tag === 'em' || tag === 'i') return 'italic';
  if (tag === 'del' || tag === 's') return 'strike';
  if (tag === 'code') return 'code';
  return undefined;
}

function mergeMark(marks: readonly StudioRichTextMark[], type: string): StudioRichTextMark[] {
  if (type === 'code') {
    return [{ type: 'code' }];
  }
  if (marks.some((mark) => mark.type === 'code')) {
    return [...marks];
  }
  return marks.some((mark) => mark.type === type) ? [...marks] : [...marks, { type }];
}

function compactInline(nodes: readonly StudioRichTextNode[]): StudioRichTextNode[] {
  const result: StudioRichTextNode[] = [];
  for (const node of nodes) {
    if (node.type === 'text') {
      const text = (node.text ?? '').replaceAll(/\s+/gu, ' ');
      if (text.length === 0) continue;
      const previous = result.at(-1);
      if (
        previous?.type === 'text' &&
        JSON.stringify(previous.marks ?? []) === JSON.stringify(node.marks ?? [])
      ) {
        previous.text = `${previous.text ?? ''}${text}`;
        continue;
      }
      result.push({ ...node, text });
      continue;
    }
    result.push(node);
  }
  if (result[0]?.type === 'text') result[0].text = (result[0].text ?? '').trimStart();
  const last = result.at(-1);
  if (last?.type === 'text') last.text = (last.text ?? '').trimEnd();
  return result.filter((node) => node.type !== 'text' || (node.text ?? '').length > 0);
}
