import type { StudioMarkupEnhancer } from '../types.js';

type ModuleLoader = () => Promise<unknown>;

interface KatexModule {
  render(source: string, element: HTMLElement, options: Readonly<Record<string, unknown>>): void;
  version: string;
}

/** Lazy exact KaTeX adapter with trust disabled and strict parsing. */
export function createKatexAdapter(
  loader: ModuleLoader = loadKatex,
): StudioMarkupEnhancer<{ displayMode: boolean; source: string }> {
  return {
    async render(value): Promise<Node> {
      const katex = katexModule(await loader());
      if (katex.version !== '0.18.4')
        throw new Error(`KaTeX 0.18.4 is required; loaded ${katex.version}.`);
      const element = document.createElement(value.displayMode ? 'div' : 'span');
      katex.render(value.source, element, {
        displayMode: value.displayMode,
        maxExpand: 1_000,
        strict: 'error',
        throwOnError: true,
        trust: false,
      });
      return element;
    },
  };
}

async function loadKatex(): Promise<unknown> {
  const specifier = 'katex';
  return import(specifier);
}

function katexModule(value: unknown): KatexModule {
  if (value === null || typeof value !== 'object') throw new TypeError('KaTeX module is invalid.');
  const record = value as Record<string, unknown>;
  const candidate = (record.default ?? record) as Partial<KatexModule>;
  if (typeof candidate.render !== 'function' || typeof candidate.version !== 'string') {
    throw new TypeError('KaTeX module does not expose render and version.');
  }
  return candidate as KatexModule;
}
