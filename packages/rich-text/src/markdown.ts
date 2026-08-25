import {
  parseRichTextDocument,
  type StudioRichTextDocument,
  type StudioRichTextMark,
  type StudioRichTextNode,
} from './index.js';
import { resolveRichTextProfile, type StudioRichTextProfileId } from './profiles.js';

export interface StudioMarkdownOptions {
  maximumInputCharacters?: number;
  profile?: StudioRichTextProfileId;
}

const DEFAULT_INPUT_LIMIT = 1_000_000;
const HARD_INPUT_LIMIT = 10_000_000;
const ORDERED_ITEM = /^(\s{0,12})(\d{1,7})[.)]\s+(.+)$/u;
const BULLET_ITEM = /^(\s{0,12})[-+*]\s+(.+)$/u;
const HEADING = /^(#{2,4})\s+(.+)$/u;
const THEMATIC_BREAK = /^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/u;

/**
 * Convert bounded Markdown into Studio's canonical grammar. Markdown is an
 * import/export format only; parser state and source text are not canonical.
 */
export function importStudioMarkdown(
  source: string,
  options: StudioMarkdownOptions = {},
): StudioRichTextDocument {
  const limit = options.maximumInputCharacters ?? DEFAULT_INPUT_LIMIT;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > HARD_INPUT_LIMIT) {
    throw new RangeError(`maximumInputCharacters must be between 1 and ${HARD_INPUT_LIMIT}.`);
  }
  if (source.length > limit) {
    throw new RangeError('Markdown input exceeds its configured character limit.');
  }

  const lines = source.replaceAll('\r\n', '\n').replaceAll('\r', '\n').split('\n');
  const blocks: StudioRichTextNode[] = [];
  let paragraph: string[] = [];

  const flushParagraph = (): void => {
    if (paragraph.length === 0) {
      return;
    }
    blocks.push({ content: inlineLines(paragraph), type: 'paragraph' });
    paragraph = [];
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (line.trim().length === 0) {
      flushParagraph();
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading !== null) {
      flushParagraph();
      blocks.push({
        attrs: { level: heading[1]?.length ?? 2 },
        content: parseInline(heading[2] ?? ''),
        type: 'heading',
      });
      continue;
    }
    if (THEMATIC_BREAK.test(line)) {
      flushParagraph();
      blocks.push({ type: 'horizontalRule' });
      continue;
    }
    if (line.startsWith('> ')) {
      flushParagraph();
      const quoted: string[] = [];
      while (index < lines.length && (lines[index] ?? '').startsWith('> ')) {
        quoted.push((lines[index] ?? '').slice(2));
        index += 1;
      }
      index -= 1;
      blocks.push({
        content: [{ content: inlineLines(quoted), type: 'paragraph' }],
        type: 'blockquote',
      });
      continue;
    }
    const listMatch = ORDERED_ITEM.exec(line) ?? BULLET_ITEM.exec(line);
    if (listMatch !== null) {
      flushParagraph();
      const ordered = ORDERED_ITEM.test(line);
      const listLines: string[] = [];
      while (index < lines.length) {
        const candidate = lines[index] ?? '';
        if ((ordered ? ORDERED_ITEM : BULLET_ITEM).test(candidate)) {
          listLines.push(candidate);
          index += 1;
        } else {
          break;
        }
      }
      index -= 1;
      blocks.push(parseList(listLines, ordered));
      continue;
    }
    paragraph.push(line);
  }
  flushParagraph();

  const content = blocks.length > 0 ? blocks : [{ type: 'paragraph' }];
  return parseRichTextDocument({ content, type: 'doc' }, resolveRichTextProfile(options.profile));
}

/** Produce deterministic portable Markdown from a canonical Studio document. */
export function exportStudioMarkdown(document: StudioRichTextDocument): string {
  const canonical = parseRichTextDocument(document);
  return canonical.content.map((node) => blockMarkdown(node, 0)).join('\n\n');
}

function parseList(lines: readonly string[], ordered: boolean): StudioRichTextNode {
  const items: StudioRichTextNode[] = [];
  for (const line of lines) {
    const match = (ordered ? ORDERED_ITEM : BULLET_ITEM).exec(line);
    if (match === null) {
      continue;
    }
    items.push({
      content: [{ content: parseInline(match[ordered ? 3 : 2] ?? ''), type: 'paragraph' }],
      type: 'listItem',
    });
  }
  const node: StudioRichTextNode = {
    content: items,
    type: ordered ? 'orderedList' : 'bulletList',
  };
  if (ordered) {
    const first = ORDERED_ITEM.exec(lines[0] ?? '');
    const start = Number(first?.[2] ?? '1');
    if (start !== 1) {
      node.attrs = { start };
    }
  }
  return node;
}

function inlineLines(lines: readonly string[]): StudioRichTextNode[] {
  const content: StudioRichTextNode[] = [];
  for (const [index, raw] of lines.entries()) {
    const hardBreak = raw.endsWith('  ') || raw.endsWith('\\');
    const line = hardBreak ? raw.slice(0, -2) : raw;
    content.push(...parseInline(line));
    if (index < lines.length - 1) {
      if (hardBreak) {
        content.push({ type: 'hardBreak' });
      } else {
        content.push({ text: ' ', type: 'text' });
      }
    }
  }
  return coalesceText(content);
}

function parseInline(source: string): StudioRichTextNode[] {
  const result: StudioRichTextNode[] = [];
  let cursor = 0;
  let plain = '';
  const flush = (): void => {
    if (plain.length > 0) {
      result.push({ text: plain, type: 'text' });
      plain = '';
    }
  };
  while (cursor < source.length) {
    if (source[cursor] === '\\' && cursor + 1 < source.length) {
      plain += source[cursor + 1] ?? '';
      cursor += 2;
      continue;
    }
    const token = inlineTokenAt(source, cursor);
    if (token === undefined) {
      plain += source[cursor] ?? '';
      cursor += 1;
      continue;
    }
    const end = source.indexOf(token.marker, cursor + token.marker.length);
    if (end <= cursor + token.marker.length) {
      plain += token.marker;
      cursor += token.marker.length;
      continue;
    }
    flush();
    result.push({
      marks: [{ type: token.mark }],
      text: source.slice(cursor + token.marker.length, end),
      type: 'text',
    });
    cursor = end + token.marker.length;
  }
  flush();
  return coalesceText(result);
}

function inlineTokenAt(
  source: string,
  cursor: number,
): { mark: StudioRichTextMark['type']; marker: string } | undefined {
  for (const token of [
    { mark: 'bold', marker: '**' },
    { mark: 'strike', marker: '~~' },
    { mark: 'code', marker: '`' },
    { mark: 'italic', marker: '*' },
  ] as const) {
    if (source.startsWith(token.marker, cursor)) {
      return token;
    }
  }
  return undefined;
}

function coalesceText(nodes: readonly StudioRichTextNode[]): StudioRichTextNode[] {
  const result: StudioRichTextNode[] = [];
  for (const node of nodes) {
    if (node.type === 'text' && node.text === '') {
      continue;
    }
    const previous = result.at(-1);
    if (
      previous?.type === 'text' &&
      node.type === 'text' &&
      JSON.stringify(previous.marks ?? []) === JSON.stringify(node.marks ?? [])
    ) {
      previous.text = `${previous.text ?? ''}${node.text ?? ''}`;
    } else {
      result.push(node);
    }
  }
  return result;
}

function blockMarkdown(node: StudioRichTextNode, depth: number): string {
  switch (node.type) {
    case 'paragraph':
      return inlineMarkdown(node.content ?? []);
    case 'heading':
      return `${'#'.repeat(Number(node.attrs?.level ?? 2))} ${inlineMarkdown(node.content ?? [])}`;
    case 'horizontalRule':
      return '---';
    case 'blockquote':
      return (node.content ?? [])
        .map((child) => blockMarkdown(child, depth))
        .join('\n')
        .split('\n')
        .map((line) => `> ${line}`)
        .join('\n');
    case 'bulletList':
    case 'orderedList': {
      const start = node.type === 'orderedList' ? Number(node.attrs?.start ?? 1) : 1;
      return (node.content ?? [])
        .map((item, index) => {
          const marker = node.type === 'orderedList' ? `${start + index}.` : '-';
          return `${'  '.repeat(depth)}${marker} ${listItemMarkdown(item, depth + 1)}`;
        })
        .join('\n');
    }
    default:
      return '';
  }
}

function listItemMarkdown(node: StudioRichTextNode, depth: number): string {
  return (node.content ?? [])
    .map((child, index) => {
      const value = blockMarkdown(child, depth);
      return index === 0 ? value : `\n${value}`;
    })
    .join('');
}

function inlineMarkdown(nodes: readonly StudioRichTextNode[]): string {
  return nodes
    .map((node) => {
      if (node.type === 'hardBreak') {
        return '  \n';
      }
      if (node.type !== 'text') {
        return '';
      }
      let value = escapeMarkdown(node.text ?? '');
      for (const mark of node.marks ?? []) {
        const marker =
          mark.type === 'bold'
            ? '**'
            : mark.type === 'strike'
              ? '~~'
              : mark.type === 'code'
                ? '`'
                : '*';
        value = `${marker}${value}${marker}`;
      }
      return value;
    })
    .join('');
}

function escapeMarkdown(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll(/([*`~])/gu, '\\$1');
}
