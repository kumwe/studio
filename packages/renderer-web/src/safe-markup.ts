import type { SafeMarkupElement, SafeMarkupFragment, SafeMarkupNode } from './types.js';

const ALLOWED_TAGS = new Set([
  'a',
  'abbr',
  'blockquote',
  'br',
  'code',
  'del',
  'em',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'li',
  'mark',
  'ol',
  'p',
  'pre',
  'strong',
  'sub',
  'sup',
  'table',
  'tbody',
  'td',
  'th',
  'thead',
  'tr',
  'ul',
]);
const VOID_TAGS = new Set(['br', 'hr']);
const GLOBAL_ATTRIBUTES = new Set(['aria-label', 'dir', 'lang', 'title']);
const TAG_ATTRIBUTES: Readonly<Record<string, ReadonlySet<string>>> = Object.freeze({
  a: new Set(['href']),
  ol: new Set(['start']),
  td: new Set(['colspan', 'rowspan']),
  th: new Set(['colspan', 'rowspan', 'scope']),
});

/** Render an already structural safe fragment, failing closed on unknown HTML vocabulary. */
export function renderSafeMarkupFragment(fragment: Readonly<SafeMarkupFragment>): string {
  if (!/^[a-z][a-z0-9.-]{0,126}\/[a-z][a-z0-9.-]{0,126}$/u.test(fragment.policy)) {
    throw new TypeError('Safe markup requires a qualified policy identifier.');
  }
  return fragment.nodes.map((node) => renderNode(node, 1)).join('');
}

function renderNode(node: Readonly<SafeMarkupNode>, depth: number): string {
  if (depth > 64) throw new RangeError('Safe markup exceeds 64 levels.');
  if (node.kind === 'text') return escapeHtml(node.value);
  return renderElement(node, depth);
}

function renderElement(node: Readonly<SafeMarkupElement>, depth: number): string {
  if (!ALLOWED_TAGS.has(node.tag))
    throw new TypeError(`Safe markup tag ${node.tag} is not allowed.`);
  if (node.children.length > 10_000)
    throw new RangeError('Safe markup element exceeds its child limit.');
  const allowed = TAG_ATTRIBUTES[node.tag] ?? new Set<string>();
  const attributes = Object.entries(node.attributes ?? {})
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, value]) => {
      if (!GLOBAL_ATTRIBUTES.has(name) && !allowed.has(name))
        throw new TypeError(`Attribute ${name} is not allowed on ${node.tag}.`);
      if (name === 'href' && !safeHref(value))
        throw new TypeError('Safe markup link uses a forbidden URL.');
      return ` ${name}="${escapeAttribute(value)}"`;
    })
    .join('');
  if (VOID_TAGS.has(node.tag)) {
    if (node.children.length > 0) throw new TypeError(`Void tag ${node.tag} cannot have children.`);
    return `<${node.tag}${attributes}>`;
  }
  return `<${node.tag}${attributes}>${node.children.map((child) => renderNode(child, depth + 1)).join('')}</${node.tag}>`;
}

function safeHref(value: string): boolean {
  return (
    value.startsWith('/') ||
    value.startsWith('#') ||
    /^https:\/\/[A-Za-z0-9.-]+(?::[0-9]+)?(?:[/#?]|$)/u.test(value)
  );
}

export function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

export function escapeAttribute(value: string): string {
  return escapeHtml(value).replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}
