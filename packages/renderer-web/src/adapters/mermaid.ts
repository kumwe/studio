import type { StudioMarkupEnhancer } from '../types.js';

type ModuleLoader = () => Promise<unknown>;

interface MermaidModule {
  initialize(configuration: Readonly<Record<string, unknown>>): void;
  render(id: string, source: string): Promise<{ svg: string }>;
}

let sequence = 0;

/** Lazy Mermaid 11.17.1 peer adapter using strict security and an inspected SVG DOM. */
export function createMermaidAdapter(
  loader: ModuleLoader = loadMermaid,
): StudioMarkupEnhancer<string> {
  return {
    async render(source): Promise<Node> {
      const mermaid = mermaidModule(await loader());
      mermaid.initialize({ securityLevel: 'strict', startOnLoad: false });
      sequence += 1;
      const { svg } = await mermaid.render(`studio-mermaid-${sequence}`, source);
      return parseSafeSvg(svg);
    },
  };
}

async function loadMermaid(): Promise<unknown> {
  const specifier = 'mermaid';
  return import(specifier);
}

function mermaidModule(value: unknown): MermaidModule {
  if (value === null || typeof value !== 'object')
    throw new TypeError('Mermaid module is invalid.');
  const record = value as Record<string, unknown>;
  const candidate = (record.default ?? record) as Partial<MermaidModule>;
  if (typeof candidate.initialize !== 'function' || typeof candidate.render !== 'function') {
    throw new TypeError('Mermaid module does not expose initialize and render.');
  }
  return candidate as MermaidModule;
}

function parseSafeSvg(source: string): SVGElement {
  if (source.length > 2_000_000) throw new RangeError('Mermaid SVG exceeds two megabytes.');
  const parsed = new DOMParser().parseFromString(source, 'image/svg+xml');
  const root = parsed.documentElement;
  if (
    root.localName !== 'svg' ||
    parsed.querySelector('parsererror,script,foreignObject') !== null
  ) {
    throw new TypeError('Mermaid returned unsafe or malformed SVG.');
  }
  for (const element of [...root.querySelectorAll('*')]) {
    for (const attribute of [...element.attributes]) {
      if (/^on/iu.test(attribute.name))
        throw new TypeError('Mermaid SVG contains an event attribute.');
      if (
        (attribute.name === 'href' || attribute.name.endsWith(':href')) &&
        !attribute.value.startsWith('#')
      ) {
        throw new TypeError('Mermaid SVG contains an external reference.');
      }
    }
  }
  return document.importNode(root, true) as unknown as SVGElement;
}
