import type { JsonObject, JsonValue } from '@kumwe/studio-protocol';

export {
  EditorJsRichTextEditorFactory,
  StudioRichTextEditorFactory,
  type StudioRichTextEditor,
  type StudioRichTextEditorChange,
  type StudioRichTextEditorOptions,
  type StudioRichTextSurface,
  type StudioRichTextSurfaceAdapter,
  type StudioRichTextSurfaceOptions,
} from './studio-rich-text-editor.js';
export {
  exportStudioMarkdown,
  importStudioMarkdown,
  type StudioMarkdownOptions,
} from './markdown.js';
export { importSafeHtml, STUDIO_SAFE_HTML_POLICY, type SafeHtmlImportPolicy } from './safe-html.js';
export {
  DOCUMENTATION_RICH_TEXT_PROFILE,
  MARKETING_RICH_TEXT_PROFILE,
  PORTABLE_RICH_TEXT_PROFILE,
  resolveContainerRichTextProfile,
  resolveRichTextProfile,
  type StudioRichTextContainerType,
  type StudioRichTextProfileId,
} from './profiles.js';

export interface StudioRichTextMark {
  attrs?: JsonObject;
  type: string;
}

export interface StudioRichTextNode {
  attrs?: JsonObject;
  content?: StudioRichTextNode[];
  marks?: StudioRichTextMark[];
  text?: string;
  type: string;
}

export interface StudioRichTextDocument extends StudioRichTextNode {
  content: StudioRichTextNode[];
  type: 'doc';
}

export interface RichTextSpanProjection {
  end: number;
  marks: string[];
  start: number;
}

export interface RichTextEmbedProjection {
  index: number;
  kind: string;
}

export interface RichTextBlockProjection {
  embeds: RichTextEmbedProjection[];
  spans: RichTextSpanProjection[];
  text: string;
  type: string;
}

export interface StudioRichTextAttributeLimits {
  maximumDepth: number;
  maximumItemsPerArray: number;
  maximumPropertiesPerObject: number;
  maximumStringLength: number;
  maximumTotalBytes: number;
}

export interface StudioRichTextProfile {
  allowedAttributes: Readonly<Record<string, readonly string[]>>;
  allowedMarks: readonly string[];
  allowedNodes: readonly string[];
  attributeLimits?: Readonly<Partial<StudioRichTextAttributeLimits>>;
  headingLevels?: readonly (1 | 2 | 3 | 4 | 5 | 6)[];
  maximumDepth: number;
  maximumDocumentBytes?: number;
  maximumMarks?: number;
  maximumMarksPerNode?: number;
  maximumNodes: number;
  maximumTextLength: number;
}

const PORTABLE_MARKS = Object.freeze(['bold', 'code', 'highlight', 'italic', 'strike']);
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
const DEFAULT_HEADING_LEVELS = Object.freeze([2, 3, 4] as const);
const DEFAULT_MAXIMUM_DOCUMENT_BYTES = 1_048_576;
const DEFAULT_MAXIMUM_MARKS = 20_000;
const DEFAULT_MAXIMUM_MARKS_PER_NODE = PORTABLE_MARKS.length;
const RICH_TEXT_HARD_LIMITS = Object.freeze({
  maximumDepth: 128,
  maximumDocumentBytes: 10_485_760,
  maximumMarks: 400_000,
  maximumMarksPerNode: PORTABLE_MARKS.length,
  maximumNodes: 100_000,
  maximumTextLength: 10_485_760,
});
const ATTRIBUTE_HARD_LIMITS: Readonly<StudioRichTextAttributeLimits> = Object.freeze({
  maximumDepth: 32,
  maximumItemsPerArray: 10_000,
  maximumPropertiesPerObject: 1_000,
  maximumStringLength: 1_048_576,
  maximumTotalBytes: RICH_TEXT_HARD_LIMITS.maximumDocumentBytes,
});

export const DEFAULT_RICH_TEXT_ATTRIBUTE_LIMITS: Readonly<StudioRichTextAttributeLimits> =
  Object.freeze({
    maximumDepth: 8,
    maximumItemsPerArray: 256,
    maximumPropertiesPerObject: 64,
    maximumStringLength: 4_096,
    maximumTotalBytes: 65_536,
  });

export const DEFAULT_RICH_TEXT_PROFILE: Readonly<StudioRichTextProfile> = Object.freeze({
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
  attributeLimits: DEFAULT_RICH_TEXT_ATTRIBUTE_LIMITS,
  headingLevels: DEFAULT_HEADING_LEVELS,
  maximumDepth: 32,
  maximumDocumentBytes: DEFAULT_MAXIMUM_DOCUMENT_BYTES,
  maximumMarks: DEFAULT_MAXIMUM_MARKS,
  maximumMarksPerNode: DEFAULT_MAXIMUM_MARKS_PER_NODE,
  maximumNodes: 5_000,
  maximumTextLength: 250_000,
});

interface ParseState {
  attributeBytes: number;
  markCount: number;
  nodeCount: number;
  textLength: number;
}

export function parseRichTextDocument(
  value: unknown,
  profile: Readonly<StudioRichTextProfile> = DEFAULT_RICH_TEXT_PROFILE,
): StudioRichTextDocument {
  validateProfile(profile);
  const state: ParseState = { attributeBytes: 0, markCount: 0, nodeCount: 0, textLength: 0 };
  const attributeLimits = resolveAttributeLimits(profile);
  const node = parseNode(value, '$', 1, profile, attributeLimits, state);
  if (node.type !== 'doc') {
    throw new TypeError('Rich-text document root must have type "doc".');
  }
  const document = { ...node, content: node.content ?? [], type: 'doc' } as const;
  const serialized = JSON.stringify(document);
  if (utf8ByteLength(serialized) > maximumDocumentBytes(profile)) {
    throw new RangeError('Rich-text document exceeds its total-byte limit.');
  }
  return document;
}

export function isRichTextDocumentEmpty(document: StudioRichTextDocument): boolean {
  return document.content.every((node) => nodeText(node).trim().length === 0);
}

export function projectRichText(document: StudioRichTextDocument): RichTextBlockProjection[] {
  const projections: RichTextBlockProjection[] = [];
  for (const block of document.content) {
    collectBlockProjections(block, projections);
  }
  return projections;
}

function collectBlockProjections(
  node: StudioRichTextNode,
  projections: RichTextBlockProjection[],
): void {
  switch (node.type) {
    case 'checklistItem':
    case 'heading':
    case 'paragraph':
    case 'tableCell':
      projections.push(projectLeafBlock(node));
      break;
    case 'codeBlock':
      projections.push({ embeds: [], spans: [], text: node.text ?? '', type: 'codeBlock' });
      break;
    case 'horizontalRule':
      projections.push({ embeds: [], spans: [], text: '', type: 'horizontalRule' });
      break;
    case 'blockquote':
    case 'bulletList':
    case 'callout':
    case 'checklist':
    case 'listItem':
    case 'orderedList':
    case 'table':
    case 'tableRow':
      for (const child of node.content ?? []) {
        collectBlockProjections(child, projections);
      }
      break;
    default:
      throw new TypeError(`Node type "${node.type}" has no renderer projection.`);
  }
}

function projectLeafBlock(node: StudioRichTextNode): RichTextBlockProjection {
  const embeds: RichTextEmbedProjection[] = [];
  const spans: RichTextSpanProjection[] = [];
  let text = '';
  let offset = 0;
  for (const inline of node.content ?? []) {
    if (inline.type === 'text') {
      const value = inline.text ?? '';
      const length = codePointLength(value);
      const marks = (inline.marks ?? []).map((mark) => mark.type).sort();
      if (marks.length > 0 && length > 0) {
        const previous = spans.at(-1);
        if (previous?.end === offset && sameMarkNames(previous.marks, marks)) {
          previous.end = offset + length;
        } else {
          spans.push({ end: offset + length, marks, start: offset });
        }
      }
      text += value;
      offset += length;
    } else {
      embeds.push({ index: offset, kind: inline.type });
    }
  }
  return { embeds, spans, text, type: node.type };
}

function sameMarkNames(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((name, index) => name === right[index]);
}

function codePointLength(value: string): number {
  let length = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        index += 1;
      }
    }
    length += 1;
  }
  return length;
}

function parseNode(
  value: unknown,
  path: string,
  depth: number,
  profile: Readonly<StudioRichTextProfile>,
  attributeLimits: Readonly<StudioRichTextAttributeLimits>,
  state: ParseState,
): StudioRichTextNode {
  if (!isRecord(value)) {
    throw new TypeError(`${path} must be a rich-text node with a non-empty type.`);
  }
  assertKnownKeys(value, path, ['attrs', 'content', 'marks', 'text', 'type']);
  if (typeof value.type !== 'string' || value.type.length === 0) {
    throw new TypeError(`${path} must be a rich-text node with a non-empty type.`);
  }
  if (!profile.allowedNodes.includes(value.type)) {
    throw new TypeError(`${path} uses disallowed node type "${value.type}".`);
  }
  if (depth > profile.maximumDepth) {
    throw new RangeError(`${path} exceeds the rich-text depth limit.`);
  }
  state.nodeCount += 1;
  if (state.nodeCount > profile.maximumNodes) {
    throw new RangeError('Rich-text document exceeds its node limit.');
  }

  const node: StudioRichTextNode = { type: value.type };
  if (value.text !== undefined) {
    if (typeof value.text !== 'string') {
      throw new TypeError(`${path}.text must be a string.`);
    }
    node.text = value.text;
    state.textLength += value.text.length;
    if (state.textLength > profile.maximumTextLength) {
      throw new RangeError('Rich-text document exceeds its text-length limit.');
    }
  }
  if (value.attrs !== undefined) {
    node.attrs = parseAttributes(
      value.attrs,
      `${path}.attrs`,
      value.type,
      profile,
      attributeLimits,
      state,
    );
  }
  if (value.content !== undefined) {
    if (!Array.isArray(value.content)) {
      throw new TypeError(`${path}.content must be an array.`);
    }
    assertStructuralArray(value.content, `${path}.content`);
    node.content = value.content.map((child, index) =>
      parseNode(child, `${path}.content[${index}]`, depth + 1, profile, attributeLimits, state),
    );
  }
  if (value.marks !== undefined) {
    if (!Array.isArray(value.marks)) {
      throw new TypeError(`${path}.marks must be an array.`);
    }
    assertStructuralArray(value.marks, `${path}.marks`);
    const maximumPerNode = profile.maximumMarksPerNode ?? DEFAULT_MAXIMUM_MARKS_PER_NODE;
    const maximumMarks = profile.maximumMarks ?? DEFAULT_MAXIMUM_MARKS;
    if (value.marks.length > maximumPerNode) {
      throw new RangeError(`${path}.marks exceeds the per-node mark limit.`);
    }
    if (state.markCount + value.marks.length > maximumMarks) {
      throw new RangeError('Rich-text document exceeds its aggregate mark limit.');
    }
    state.markCount += value.marks.length;
    node.marks = value.marks.map((mark, index) =>
      parseMark(mark, `${path}.marks[${index}]`, profile, attributeLimits, state),
    );
    assertPortableMarkSet(node.marks, `${path}.marks`);
  }
  assertNodeGrammar(node, path, profile);
  return node;
}

function parseMark(
  value: unknown,
  path: string,
  profile: Readonly<StudioRichTextProfile>,
  attributeLimits: Readonly<StudioRichTextAttributeLimits>,
  state: ParseState,
): StudioRichTextMark {
  if (!isRecord(value)) {
    throw new TypeError(`${path} must be a mark with a non-empty type.`);
  }
  assertKnownKeys(value, path, ['attrs', 'type']);
  if (typeof value.type !== 'string' || value.type.length === 0) {
    throw new TypeError(`${path} must be a mark with a non-empty type.`);
  }
  if (!profile.allowedMarks.includes(value.type)) {
    throw new TypeError(`${path} uses disallowed mark type "${value.type}".`);
  }
  const mark: StudioRichTextMark = { type: value.type };
  if (value.attrs !== undefined) {
    mark.attrs = parseAttributes(
      value.attrs,
      `${path}.attrs`,
      `mark:${value.type}`,
      profile,
      attributeLimits,
      state,
    );
  }
  if (mark.type === 'highlight') {
    const tone = mark.attrs?.tone;
    if (
      typeof tone !== 'string' ||
      !['accent', 'danger', 'info', 'success', 'warning'].includes(tone)
    ) {
      throw new TypeError(`${path}.attrs.tone must be a configured highlight tone.`);
    }
  } else if (mark.attrs !== undefined) {
    throw new TypeError(`${path} cannot carry attributes in the portable rich-text grammar.`);
  }
  return mark;
}

function assertNodeGrammar(
  node: StudioRichTextNode,
  path: string,
  profile: Readonly<StudioRichTextProfile>,
): void {
  switch (node.type) {
    case 'doc':
      assertNoNodeFields(node, path, ['attrs', 'marks', 'text']);
      if (node.content === undefined || node.content.length === 0) {
        throw new TypeError(`${path}.content must contain at least one block node.`);
      }
      assertChildTypes(node.content, path, blockNodeTypes);
      break;
    case 'text':
      assertNoNodeFields(node, path, ['attrs', 'content']);
      if (node.text === undefined) {
        throw new TypeError(`${path}.text is required for a text node.`);
      }
      if (node.text.length === 0) {
        throw new TypeError(`${path}.text cannot be empty.`);
      }
      break;
    case 'paragraph':
      assertNoNodeFields(node, path, ['attrs', 'marks', 'text']);
      assertChildTypes(node.content ?? [], path, inlineNodeTypes);
      break;
    case 'heading': {
      assertNoNodeFields(node, path, ['marks', 'text']);
      assertChildTypes(node.content ?? [], path, inlineNodeTypes);
      const level = node.attrs?.level;
      const levels = profile.headingLevels ?? DEFAULT_HEADING_LEVELS;
      if (
        typeof level !== 'number' ||
        !Number.isInteger(level) ||
        !(levels as readonly number[]).includes(level)
      ) {
        throw new TypeError(`${path}.attrs.level must be a configured heading level.`);
      }
      break;
    }
    case 'orderedList': {
      assertNoNodeFields(node, path, ['marks', 'text']);
      assertNonEmptyChildTypes(node.content, path, listItemNodeTypes);
      const start = node.attrs?.start;
      if (start !== undefined && (!Number.isSafeInteger(start) || Number(start) < 1)) {
        throw new TypeError(`${path}.attrs.start must be a positive integer.`);
      }
      break;
    }
    case 'bulletList':
      assertNoNodeFields(node, path, ['attrs', 'marks', 'text']);
      assertNonEmptyChildTypes(node.content, path, listItemNodeTypes);
      break;
    case 'listItem':
      assertNoNodeFields(node, path, ['attrs', 'marks', 'text']);
      assertNonEmptyChildTypes(node.content, path, blockNodeTypes);
      if (node.content?.[0]?.type !== 'paragraph') {
        throw new TypeError(`${path}.content must begin with a paragraph node.`);
      }
      break;
    case 'blockquote':
      assertNoNodeFields(node, path, ['attrs', 'marks', 'text']);
      assertNonEmptyChildTypes(node.content, path, blockNodeTypes);
      break;
    case 'callout':
      assertNoNodeFields(node, path, ['marks', 'text']);
      assertNonEmptyChildTypes(node.content, path, blockNodeTypes);
      if (
        typeof node.attrs?.tone !== 'string' ||
        !['danger', 'info', 'success', 'warning'].includes(node.attrs.tone)
      ) {
        throw new TypeError(`${path}.attrs.tone must be a configured callout tone.`);
      }
      break;
    case 'checklist':
      assertNoNodeFields(node, path, ['attrs', 'marks', 'text']);
      assertNonEmptyChildTypes(node.content, path, checklistItemNodeTypes);
      break;
    case 'checklistItem':
      assertNoNodeFields(node, path, ['marks', 'text']);
      assertChildTypes(node.content ?? [], path, inlineNodeTypes);
      if (typeof node.attrs?.checked !== 'boolean') {
        throw new TypeError(`${path}.attrs.checked must be a boolean.`);
      }
      if (
        !Number.isSafeInteger(node.attrs.level) ||
        Number(node.attrs.level) < 0 ||
        Number(node.attrs.level) > 4
      ) {
        throw new TypeError(`${path}.attrs.level must be an integer from zero through four.`);
      }
      break;
    case 'table':
      assertNoNodeFields(node, path, ['marks', 'text']);
      assertNonEmptyChildTypes(node.content, path, tableRowNodeTypes);
      if (typeof node.attrs?.header !== 'boolean') {
        throw new TypeError(`${path}.attrs.header must be a boolean.`);
      }
      assertRectangularTable(node.content, path);
      break;
    case 'tableRow':
      assertNoNodeFields(node, path, ['attrs', 'marks', 'text']);
      assertNonEmptyChildTypes(node.content, path, tableCellNodeTypes);
      break;
    case 'tableCell':
      assertNoNodeFields(node, path, ['attrs', 'marks', 'text']);
      assertChildTypes(node.content ?? [], path, inlineNodeTypes);
      break;
    case 'codeBlock':
      assertNoNodeFields(node, path, ['content', 'marks']);
      if (node.text === undefined) {
        throw new TypeError(`${path}.text is required for a code block.`);
      }
      if (
        typeof node.attrs?.language !== 'string' ||
        !/^[A-Za-z0-9][A-Za-z0-9+_.#-]{0,63}$/u.test(node.attrs.language)
      ) {
        throw new TypeError(`${path}.attrs.language must be a bounded language identifier.`);
      }
      break;
    case 'hardBreak':
    case 'horizontalRule':
      assertNoNodeFields(node, path, ['attrs', 'content', 'marks', 'text']);
      break;
    default:
      throw new TypeError(`${path} uses a node without a portable grammar.`);
  }
}

function assertPortableMarkSet(marks: readonly StudioRichTextMark[], path: string): void {
  const types = new Set<string>();
  for (const mark of marks) {
    if (types.has(mark.type)) {
      throw new TypeError(`${path} cannot contain duplicate ${mark.type} marks.`);
    }
    types.add(mark.type);
  }
  if (types.has('code') && types.size > 1) {
    throw new TypeError(`${path} cannot combine code with another mark.`);
  }
}

const blockNodeTypes = new Set([
  'blockquote',
  'bulletList',
  'callout',
  'checklist',
  'codeBlock',
  'heading',
  'horizontalRule',
  'orderedList',
  'paragraph',
  'table',
]);
const inlineNodeTypes = new Set(['hardBreak', 'text']);
const listItemNodeTypes = new Set(['listItem']);
const checklistItemNodeTypes = new Set(['checklistItem']);
const tableRowNodeTypes = new Set(['tableRow']);
const tableCellNodeTypes = new Set(['tableCell']);

function assertRectangularTable(
  rows: readonly StudioRichTextNode[] | undefined,
  path: string,
): void {
  const width = rows?.[0]?.content?.length ?? 0;
  const invalid = rows?.findIndex((row) => row.content?.length !== width) ?? -1;
  if (width < 1 || invalid >= 0) {
    throw new TypeError(`${path}.content must be a non-empty rectangular table.`);
  }
}

function assertNoNodeFields(
  node: StudioRichTextNode,
  path: string,
  fields: readonly ('attrs' | 'content' | 'marks' | 'text')[],
): void {
  const present = fields.find((field) => node[field] !== undefined);
  if (present !== undefined) {
    throw new TypeError(`${path}.${present} is not valid on a ${node.type} node.`);
  }
}

function assertChildTypes(
  content: readonly StudioRichTextNode[],
  path: string,
  allowed: ReadonlySet<string>,
): void {
  const invalidIndex = content.findIndex((child) => !allowed.has(child.type));
  if (invalidIndex >= 0) {
    throw new TypeError(`${path}.content[${invalidIndex}] is not valid inside this node.`);
  }
}

function assertNonEmptyChildTypes(
  content: readonly StudioRichTextNode[] | undefined,
  path: string,
  allowed: ReadonlySet<string>,
): void {
  if (content === undefined || content.length === 0) {
    throw new TypeError(`${path}.content must contain at least one child node.`);
  }
  assertChildTypes(content, path, allowed);
}

function parseAttributes(
  value: unknown,
  path: string,
  ownerType: string,
  profile: Readonly<StudioRichTextProfile>,
  limits: Readonly<StudioRichTextAttributeLimits>,
  state: ParseState,
): JsonObject {
  const attributes = parseJsonObject(value, path, 1, limits, state);
  const allowed = profile.allowedAttributes[ownerType] ?? [];
  for (const key of Object.keys(attributes)) {
    if (!allowed.includes(key)) {
      throw new TypeError(`${path}.${key} is not allowed for ${ownerType}.`);
    }
  }
  return attributes;
}

function parseJsonObject(
  value: unknown,
  path: string,
  depth: number,
  limits: Readonly<StudioRichTextAttributeLimits>,
  state: ParseState,
): JsonObject {
  if (!isRecord(value)) {
    throw new TypeError(`${path} must be an object.`);
  }
  assertAttributeDepth(depth, path, limits);
  const entries = Object.entries(value);
  if (entries.length > limits.maximumPropertiesPerObject) {
    throw new RangeError(`${path} exceeds the attribute property limit.`);
  }

  addAttributeBytes(state, limits, 2);
  const parsed: JsonObject = {};
  for (const [index, [key, entry]] of entries.entries()) {
    assertAttributeKey(key, path, limits);
    addAttributeBytes(state, limits, (index === 0 ? 0 : 1) + jsonByteLength(key) + 1);
    parsed[key] = parseJsonValue(entry, `${path}.${key}`, depth + 1, limits, state);
  }
  return parsed;
}

function parseJsonValue(
  value: unknown,
  path: string,
  depth: number,
  limits: Readonly<StudioRichTextAttributeLimits>,
  state: ParseState,
): JsonValue {
  if (typeof value === 'string') {
    if (value.length > limits.maximumStringLength) {
      throw new RangeError(`${path} exceeds the attribute string limit.`);
    }
    addAttributeBytes(state, limits, jsonByteLength(value));
    return value;
  }
  if (value === null || typeof value === 'boolean') {
    addAttributeBytes(state, limits, jsonByteLength(value));
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    addAttributeBytes(state, limits, jsonByteLength(value));
    return value;
  }
  if (Array.isArray(value)) {
    assertAttributeDepth(depth, path, limits);
    assertJsonArray(value, path, limits);
    addAttributeBytes(state, limits, 2);
    return value.map((entry, index) => {
      if (index > 0) {
        addAttributeBytes(state, limits, 1);
      }
      return parseJsonValue(entry, `${path}[${index}]`, depth + 1, limits, state);
    });
  }
  if (isRecord(value)) {
    return parseJsonObject(value, path, depth, limits, state);
  }
  throw new TypeError(`${path} is not JSON-compatible.`);
}

function addAttributeBytes(
  state: ParseState,
  limits: Readonly<StudioRichTextAttributeLimits>,
  count: number,
): void {
  state.attributeBytes += count;
  if (state.attributeBytes > limits.maximumTotalBytes) {
    throw new RangeError('Rich-text attributes exceed the total-byte limit.');
  }
}

function assertAttributeDepth(
  depth: number,
  path: string,
  limits: Readonly<StudioRichTextAttributeLimits>,
): void {
  if (depth > limits.maximumDepth) {
    throw new RangeError(`${path} exceeds the attribute depth limit.`);
  }
}

function assertAttributeKey(
  key: string,
  path: string,
  limits: Readonly<StudioRichTextAttributeLimits>,
): void {
  if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
    throw new TypeError(`${path}.${key} is a forbidden object key.`);
  }
  if (key.length > limits.maximumStringLength) {
    throw new RangeError(`${path} contains an attribute key that exceeds the string limit.`);
  }
}

function assertJsonArray(
  value: unknown[],
  path: string,
  limits: Readonly<StudioRichTextAttributeLimits>,
): void {
  if (value.length > limits.maximumItemsPerArray) {
    throw new RangeError(`${path} exceeds the attribute item limit.`);
  }
  const keys = Object.keys(value);
  for (const key of keys) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      throw new TypeError(`${path}.${key} is a forbidden object key.`);
    }
  }
  if (keys.length !== value.length || keys.some((key, index) => key !== String(index))) {
    throw new TypeError(`${path} must be a dense JSON array without extra properties.`);
  }
}

function assertStructuralArray(value: unknown[], path: string): void {
  if (
    Object.getPrototypeOf(value) !== Array.prototype ||
    Object.getOwnPropertySymbols(value).length
  ) {
    throw new TypeError(`${path} must be a dense JSON array without extra properties.`);
  }
  const names = Object.getOwnPropertyNames(value);
  if (
    names.length !== value.length + 1 ||
    names[value.length] !== 'length' ||
    names.slice(0, -1).some((name, index) => name !== String(index))
  ) {
    throw new TypeError(`${path} must be a dense JSON array without extra properties.`);
  }
}

function assertKnownKeys(
  value: Record<string, unknown>,
  path: string,
  allowedKeys: readonly string[],
): void {
  const allowed = new Set(allowedKeys);
  const unknown = Object.keys(value).find((key) => !allowed.has(key));
  if (unknown !== undefined) {
    throw new TypeError(`${path}.${unknown} is not a recognized rich-text key.`);
  }
}

function jsonByteLength(value: boolean | null | number | string): number {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new TypeError('Attribute value is not JSON-compatible.');
  }
  return utf8ByteLength(serialized);
}

function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x7f) {
      bytes += 1;
    } else if (code <= 0x7ff) {
      bytes += 2;
    } else if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        index += 1;
      } else {
        bytes += 3;
      }
    } else {
      bytes += 3;
    }
  }
  return bytes;
}

function nodeText(node: StudioRichTextNode): string {
  return `${node.text ?? ''}${(node.content ?? []).map((child) => nodeText(child)).join('')}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

function validateProfile(profile: Readonly<StudioRichTextProfile>): void {
  for (const [name, value] of [
    ['maximumDepth', profile.maximumDepth],
    ['maximumNodes', profile.maximumNodes],
    ['maximumTextLength', profile.maximumTextLength],
  ] as const) {
    assertBoundedProfileLimit(name, value, RICH_TEXT_HARD_LIMITS[name]);
  }
  for (const [name, value] of [
    ['maximumDocumentBytes', maximumDocumentBytes(profile)],
    ['maximumMarks', profile.maximumMarks ?? DEFAULT_MAXIMUM_MARKS],
    ['maximumMarksPerNode', profile.maximumMarksPerNode ?? DEFAULT_MAXIMUM_MARKS_PER_NODE],
  ] as const) {
    assertBoundedProfileLimit(name, value, RICH_TEXT_HARD_LIMITS[name]);
  }
  if (
    (profile.maximumMarksPerNode ?? DEFAULT_MAXIMUM_MARKS_PER_NODE) >
    (profile.maximumMarks ?? DEFAULT_MAXIMUM_MARKS)
  ) {
    throw new RangeError('maximumMarksPerNode cannot exceed maximumMarks.');
  }
  if (!profile.allowedNodes.includes('doc') || !profile.allowedNodes.includes('text')) {
    throw new TypeError('Rich-text profile must allow doc and text nodes.');
  }
  if (new Set(profile.allowedNodes).size !== profile.allowedNodes.length) {
    throw new TypeError('Rich-text profile node names must be unique.');
  }
  if (new Set(profile.allowedMarks).size !== profile.allowedMarks.length) {
    throw new TypeError('Rich-text profile mark names must be unique.');
  }
  const unsupportedNode = profile.allowedNodes.find((name) => !PORTABLE_NODES.includes(name));
  if (unsupportedNode !== undefined) {
    throw new TypeError(`Rich-text profile node "${unsupportedNode}" has no portable grammar.`);
  }
  const unsupportedMark = profile.allowedMarks.find((name) => !PORTABLE_MARKS.includes(name));
  if (unsupportedMark !== undefined) {
    throw new TypeError(`Rich-text profile mark "${unsupportedMark}" has no portable grammar.`);
  }
  validateHeadingLevels(profile.headingLevels ?? DEFAULT_HEADING_LEVELS);
  resolveAttributeLimits(profile);
}

function assertBoundedProfileLimit(name: string, value: number, hardMaximum: number): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError(`${name} must be a positive integer.`);
  }
  if (value > hardMaximum) {
    throw new RangeError(`${name} exceeds the immutable safety ceiling of ${hardMaximum}.`);
  }
}

function validateHeadingLevels(levels: readonly number[]): void {
  if (
    levels.length === 0 ||
    new Set(levels).size !== levels.length ||
    levels.some((level) => !Number.isInteger(level) || level < 1 || level > 6)
  ) {
    throw new RangeError('headingLevels must contain unique integer levels from 1 through 6.');
  }
}

function maximumDocumentBytes(profile: Readonly<StudioRichTextProfile>): number {
  return profile.maximumDocumentBytes ?? DEFAULT_MAXIMUM_DOCUMENT_BYTES;
}

function resolveAttributeLimits(
  profile: Readonly<StudioRichTextProfile>,
): Readonly<StudioRichTextAttributeLimits> {
  const limits = { ...DEFAULT_RICH_TEXT_ATTRIBUTE_LIMITS, ...profile.attributeLimits };
  for (const [name, value] of Object.entries(limits)) {
    assertBoundedProfileLimit(
      name,
      value,
      ATTRIBUTE_HARD_LIMITS[name as keyof StudioRichTextAttributeLimits],
    );
  }
  return limits;
}
