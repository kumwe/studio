import type { BlueprintNode, JsonValue } from '@kumwe/studio-protocol';
import { renderStudioWeb } from './renderer.js';
import type { ResolvedWebMedia } from './types.js';

export interface RendererWebVectorBinding {
  nodeId: string;
  port: string;
  value: JsonValue;
}

export interface RendererWebVectorMedia extends ResolvedWebMedia {
  assetId: string;
}

export interface RendererWebVectorExpectation {
  cssContains: string[];
  enhancements: string[];
  htmlContains: string[];
  htmlExcludes: string[];
}

export interface RendererWebVector {
  bindings: RendererWebVectorBinding[];
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
  for (const value of vector.expect.htmlContains) {
    if (!output.html.includes(value))
      failures.push(`HTML does not contain ${JSON.stringify(value)}.`);
  }
  for (const value of vector.expect.htmlExcludes) {
    if (output.html.includes(value))
      failures.push(`HTML contains forbidden ${JSON.stringify(value)}.`);
  }
  for (const value of vector.expect.cssContains) {
    if (!output.css.includes(value))
      failures.push(`CSS does not contain ${JSON.stringify(value)}.`);
  }
  const actualKinds = output.enhancements.map((enhancement) => enhancement.kind);
  if (actualKinds.join('\n') !== vector.expect.enhancements.join('\n')) {
    failures.push(
      `Enhancements ${JSON.stringify(actualKinds)} do not equal ${JSON.stringify(vector.expect.enhancements)}.`,
    );
  }
  return { failures, id: vector.id, passed: failures.length === 0 };
}
