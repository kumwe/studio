import type { StudioScopedStyleSheet } from './types.js';

const TARGETS = Object.freeze({
  action: '[data-studio-part="action"]',
  content: '[data-studio-part="content"]',
  heading: '[data-studio-part="heading"]',
  media: '[data-studio-part="media"]',
  self: '',
} as const);

const ALLOWED_PROPERTIES = new Set([
  'background-color',
  'border-color',
  'border-radius',
  'border-style',
  'border-width',
  'color',
  'font-family',
  'font-size',
  'font-style',
  'font-weight',
  'gap',
  'letter-spacing',
  'line-height',
  'margin-block',
  'margin-inline',
  'max-inline-size',
  'min-block-size',
  'opacity',
  'padding-block',
  'padding-inline',
  'text-align',
  'text-decoration',
  'text-transform',
]);

const VALUE =
  /^(?:#[0-9A-Fa-f]{3,8}|-?[0-9]+(?:\.[0-9]+)?(?:ch|em|rem|%|px)?|[a-z][a-z0-9 -]{0,126}|var\(--studio-[a-z0-9-]{1,100}\))$/u;

/** Compile structured host style intent into one node-bounded stylesheet. */
export function compileStudioScopedStyleSheet(
  scope: string,
  sheet: Readonly<StudioScopedStyleSheet>,
): string {
  if (!/^[A-Za-z][A-Za-z0-9_-]{0,511}$/u.test(scope)) {
    throw new TypeError('Scoped CSS scope must be a bounded CSS-safe identifier.');
  }
  if (sheet.rules.length > 100) throw new RangeError('Scoped stylesheet exceeds 100 rules.');
  const base = `[data-studio-scope="${scope}"]`;
  return sheet.rules
    .map((rule) => {
      const entries = Object.entries(rule.declarations);
      if (entries.length > 50) throw new RangeError('Scoped style rule exceeds 50 declarations.');
      const declarations = entries
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([property, value]) => {
          if (!ALLOWED_PROPERTIES.has(property))
            throw new TypeError(`Scoped CSS property ${property} is not allowed.`);
          if (
            value.length > 256 ||
            !VALUE.test(value) ||
            /(?:url|expression|javascript|@|[;{}])/iu.test(value)
          ) {
            throw new TypeError(`Scoped CSS value for ${property} is not allowed.`);
          }
          return `${property}:${value}`;
        })
        .join(';');
      return `${base}${TARGETS[rule.target]}{${declarations}}`;
    })
    .join('');
}

export function assertCspNonce(nonce: string): void {
  if (!/^[A-Za-z0-9+/_=-]{8,256}$/u.test(nonce)) {
    throw new TypeError('CSP nonce must be an 8 through 256 character base64-style token.');
  }
}
