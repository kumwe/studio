import type { BlueprintNode, JsonValue } from '@kumwe/studio-protocol';
import { renderStudioWeb } from './renderer.js';
import type { ResolvedWebMedia, StudioScopedStyleSheet } from './types.js';

export interface RendererWebVectorBinding {
  nodeId: string;
  port: string;
  value: JsonValue;
}

export interface RendererWebVectorMedia extends ResolvedWebMedia {
  assetId: string;
}

export interface RendererWebVectorExpectation {
  activationMarkers: string[];
  cssBytes: number;
  cssContains: string[];
  cssSha256: string;
  enhancements: string[];
  htmlBytes: number;
  htmlContains: string[];
  htmlExcludes: string[];
  htmlSha256: string;
  publicStyleAsset: {
    budgetBytes: 262144;
    bytes: number;
    contentHash: string;
    integrity: string;
    mediaType: 'text/css';
    minified: true;
    path: string;
    role: 'public-style';
  };
}

export interface RendererWebVectorCoverage {
  behaviors: string[];
  blockTypes: string[];
  presentation: string[];
  security: string[];
}

export interface RendererWebVector {
  bindings: RendererWebVectorBinding[];
  context?: {
    allowBlobMedia?: boolean;
    scopedStyles?: Readonly<Record<string, StudioScopedStyleSheet>>;
  };
  coverage: RendererWebVectorCoverage;
  expect: RendererWebVectorExpectation;
  id: string;
  media: RendererWebVectorMedia[];
  roots: BlueprintNode[];
}

export interface RendererWebVectorResult {
  failures: string[];
  id: string;
  passed: boolean;
}

/** Replay one portable renderer vector without any host- or test-framework dependency. */
export async function runRendererWebVector(
  vector: Readonly<RendererWebVector>,
): Promise<RendererWebVectorResult> {
  const bindingMap = new Map(
    vector.bindings.map((binding) => [`${binding.nodeId}\u0000${binding.port}`, binding.value]),
  );
  const mediaMap = new Map(vector.media.map((media) => [media.assetId, media]));
  const output = await renderStudioWeb(
    { roots: vector.roots },
    {
      ...(vector.context?.allowBlobMedia === undefined
        ? {}
        : { allowBlobMedia: vector.context.allowBlobMedia }),
      ...(vector.context?.scopedStyles === undefined
        ? {}
        : { scopedStyles: vector.context.scopedStyles }),
      resolveBinding: (node, port) => bindingMap.get(`${node.id}\u0000${port}`),
      resolveMedia: (reference) => {
        const resolved = mediaMap.get(reference.assetId);
        if (resolved === undefined)
          throw new Error(`Vector ${vector.id} lacks media ${reference.assetId}.`);
        return resolved;
      },
    },
  );
  const failures: string[] = [];
  for (const marker of vector.expect.activationMarkers) {
    if (!hasHtmlAttribute(output.html, marker)) {
      failures.push(`HTML does not carry activation marker ${JSON.stringify(marker)}.`);
    }
  }
  for (const value of vector.expect.htmlContains) {
    if (!output.html.includes(value))
      failures.push(`HTML does not contain ${JSON.stringify(value)}.`);
  }
  for (const value of vector.expect.htmlExcludes) {
    if (output.html.includes(value))
      failures.push(`HTML contains forbidden ${JSON.stringify(value)}.`);
  }
  const htmlBytes = new TextEncoder().encode(output.html);
  if (htmlBytes.byteLength !== vector.expect.htmlBytes) {
    failures.push(
      `HTML byte length ${htmlBytes.byteLength} does not equal ${vector.expect.htmlBytes}.`,
    );
  }
  const htmlSha256 = await sha256Hex(htmlBytes);
  if (htmlSha256 !== vector.expect.htmlSha256) {
    failures.push(`HTML SHA-256 ${htmlSha256} does not equal ${vector.expect.htmlSha256}.`);
  }
  for (const value of vector.expect.cssContains) {
    if (!output.css.includes(value))
      failures.push(`CSS does not contain ${JSON.stringify(value)}.`);
  }
  const cssBytes = new TextEncoder().encode(output.css);
  if (cssBytes.byteLength !== vector.expect.cssBytes) {
    failures.push(
      `CSS byte length ${cssBytes.byteLength} does not equal ${vector.expect.cssBytes}.`,
    );
  }
  const cssSha256 = await sha256Hex(cssBytes);
  if (cssSha256 !== vector.expect.cssSha256) {
    failures.push(`CSS SHA-256 ${cssSha256} does not equal ${vector.expect.cssSha256}.`);
  }
  const publicStyleAsset = {
    budgetBytes: 262_144,
    bytes: cssBytes.byteLength,
    contentHash: cssSha256,
    integrity: `sha256-${hexDigestToBase64(cssSha256)}`,
    mediaType: 'text/css',
    minified: true,
    path: `assets/studio-public-${cssSha256.slice(0, 16)}.min.css`,
    role: 'public-style',
  } as const;
  if (!equalClosedRecord(publicStyleAsset, vector.expect.publicStyleAsset)) {
    failures.push(
      `Public style asset ${JSON.stringify(publicStyleAsset)} does not equal ${JSON.stringify(vector.expect.publicStyleAsset)}.`,
    );
  }
  const actualKinds = output.enhancements.map((enhancement) => enhancement.kind);
  if (actualKinds.join('\n') !== vector.expect.enhancements.join('\n')) {
    failures.push(
      `Enhancements ${JSON.stringify(actualKinds)} do not equal ${JSON.stringify(vector.expect.enhancements)}.`,
    );
  }
  return { failures, id: vector.id, passed: failures.length === 0 };
}

function hasHtmlAttribute(html: string, name: string): boolean {
  let offset = 0;
  while ((offset = html.indexOf(name, offset)) !== -1) {
    const before = offset === 0 ? '' : html[offset - 1];
    const after = html[offset + name.length] ?? '';
    if ((before === ' ' || before === '\n' || before === '\t') && /[\s=>]/u.test(after)) {
      return true;
    }
    offset += name.length;
  }
  return false;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const input = new Uint8Array(bytes.byteLength);
  input.set(bytes);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', input.buffer);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

function hexDigestToBase64(hex: string): string {
  let binary = '';
  for (let offset = 0; offset < hex.length; offset += 2) {
    binary += String.fromCharCode(Number.parseInt(hex.slice(offset, offset + 2), 16));
  }
  return globalThis.btoa(binary);
}

function equalClosedRecord(
  left: Readonly<Record<string, unknown>>,
  right: Readonly<Record<string, unknown>>,
): boolean {
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return (
    leftKeys.join('\n') === rightKeys.join('\n') &&
    leftKeys.every((key) => left[key] === right[key])
  );
}
