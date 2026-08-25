import {
  STUDIO_AUTHORING_CONTROL_IDS,
  StudioAuthoringControlRegistry,
  type KumweStudioElement,
  type StudioAuthoringControlHandle,
} from '@kumwe/studio';
import type { MediaProvider } from '@kumwe/studio-media';
import {
  STUDIO_CONTRACT_VERSION,
  type BlueprintNode,
  type FieldBinding,
  type JsonValue,
  type MediaAsset,
  type MediaPage,
  type MediaQuery,
} from '@kumwe/studio-protocol';

const referenceAssets: readonly MediaAsset[] = [
  asset('studio.reference/hero', 'hero.svg', 'Studio page composition flowing to the web'),
  asset('studio.reference/gallery-one', 'gallery-one.svg', 'Structured page blocks'),
  asset('studio.reference/gallery-two', 'gallery-two.svg', 'Dynamic host resources'),
  asset('studio.reference/gallery-three', 'gallery-three.svg', 'Responsive delivery'),
];

/**
 * Mounts real Studio-owned controls without importing Editor.js or a media
 * widget. The host supplies only canonical values, a MediaProvider, and the
 * command that persists a valid change back into the Blueprint.
 */
export async function mountReferenceAuthoringControls(
  studio: KumweStudioElement,
  holder: HTMLElement,
): Promise<() => void> {
  const registry = new StudioAuthoringControlRegistry({
    media: { provider: new ReferenceMediaProvider() },
    strictContentSecurityPolicy: true,
  });
  studio.authoringControlRegistry = registry;
  const handles: StudioAuthoringControlHandle[] = [];
  const richTextNode = requireNode(studio, 'faq-editor-answer');
  const richTextBinding = requireStaticBinding(richTextNode, 'content');
  const proseHolder = requireControlHolder(holder, 'rich-text');
  handles.push(
    await registry.mount(STUDIO_AUTHORING_CONTROL_IDS.richText, {
      binding: richTextBinding,
      holder: proseHolder,
      onChange: (change) => {
        if (change.valid) setStaticBinding(studio, richTextNode.id, 'content', change.value);
      },
      profile: 'studio.rich-text/marketing',
      value: richTextBinding.source.value,
    }),
  );

  const imageNode = requireNode(studio, 'hero-image');
  const mediaBinding = requireStaticBinding(imageNode, 'asset');
  const mediaHolder = requireControlHolder(holder, 'media');
  handles.push(
    await registry.mount(STUDIO_AUTHORING_CONTROL_IDS.mediaReference, {
      binding: mediaBinding,
      holder: mediaHolder,
      mediaTypes: ['image/svg+xml'],
      onChange: (change) => {
        if (change.valid && change.value !== undefined) {
          setStaticBinding(studio, imageNode.id, 'asset', change.value);
        }
      },
      usage: 'studio.reference/hero',
      value: mediaBinding.source.value,
    }),
  );

  const drawingNode = requireNode(studio, 'drawing');
  const drawingBinding = requireStaticBinding(drawingNode, 'drawing');
  const drawingHolder = requireControlHolder(holder, 'drawing');
  handles.push(
    await registry.mount(STUDIO_AUTHORING_CONTROL_IDS.drawing, {
      binding: drawingBinding,
      holder: drawingHolder,
      onChange: (change) => {
        if (change.valid) setStaticBinding(studio, drawingNode.id, 'drawing', change.value);
      },
      profile: 'studio.drawing/canonical',
      value: drawingBinding.source.value,
    }),
  );

  const tableNode = requireNode(studio, 'reference-table');
  const tableBinding = requireStaticBinding(tableNode, 'table');
  const tableHolder = requireControlHolder(holder, 'table');
  handles.push(
    await registry.mount(STUDIO_AUTHORING_CONTROL_IDS.table, {
      binding: tableBinding,
      holder: tableHolder,
      onChange: (change) => {
        if (change.valid) setStaticBinding(studio, tableNode.id, 'table', change.value);
      },
      profile: 'studio.table/canonical',
      value: tableBinding.source.value,
    }),
  );

  return (): void => {
    handles.forEach((handle) => handle.destroy());
    if (studio.authoringControlRegistry === registry) studio.authoringControlRegistry = undefined;
  };
}

class ReferenceMediaProvider implements MediaProvider {
  public get(assetId: string, signal?: AbortSignal): Promise<MediaAsset | null> {
    signal?.throwIfAborted();
    return Promise.resolve(referenceAssets.find((candidate) => candidate.id === assetId) ?? null);
  }

  public list(query: MediaQuery, signal?: AbortSignal): Promise<MediaPage> {
    signal?.throwIfAborted();
    const search = query.search?.trim().toLocaleLowerCase('en') ?? '';
    const accepted = new Set(query.mediaTypes ?? []);
    const assets = referenceAssets
      .filter((candidate) => accepted.size === 0 || accepted.has(candidate.mediaType))
      .filter(
        (candidate) =>
          search.length === 0 || candidate.filename.toLocaleLowerCase('en').includes(search),
      )
      .slice(0, query.limit);
    return Promise.resolve({ assets: structuredClone(assets) });
  }

  public upload(): Promise<MediaAsset> {
    // This deterministic browser-only host demonstrates the Studio upload UX
    // and stable-reference handoff. Production custody and verification stay
    // with a real host media service.
    const accepted = referenceAssets.find(() => true);
    if (accepted === undefined) throw new Error('Reference media catalogue is empty.');
    return Promise.resolve(structuredClone(accepted));
  }
}

function asset(id: string, filename: string, altText: string): MediaAsset {
  return {
    byteSize: 4_096,
    contractVersion: STUDIO_CONTRACT_VERSION,
    filename,
    id,
    kind: 'media-asset',
    mediaKind: 'image',
    mediaType: 'image/svg+xml',
    metadata: { altText },
    revision: 'reference-media-r1',
    state: 'ready',
  };
}

function setStaticBinding(
  studio: KumweStudioElement,
  nodeId: string,
  port: string,
  value: unknown,
): void {
  studio.execute({
    artifactId: studio.document?.id ?? 'reference.home',
    baseStateVersion: studio.stateVersion,
    contractVersion: STUDIO_CONTRACT_VERSION,
    id: crypto.randomUUID(),
    kind: 'command',
    payload: {
      binding: {
        onError: 'error',
        onNull: 'empty',
        source: { kind: 'static-value', value: structuredClone(value) as JsonValue },
        transforms: [],
      },
      nodeId,
      port,
    },
    sessionGeneration: 'session-r1',
    type: 'studio.command/set-binding',
  });
}

function requireStaticBinding(
  node: BlueprintNode,
  port: string,
): FieldBinding & {
  source: Extract<FieldBinding['source'], { kind: 'static-value' }>;
} {
  const binding = node.bindings[port];
  if (binding?.source.kind !== 'static-value') {
    throw new Error(`Reference node ${node.id} requires a static ${port} binding.`);
  }
  return binding as FieldBinding & {
    source: Extract<FieldBinding['source'], { kind: 'static-value' }>;
  };
}

function requireNode(studio: KumweStudioElement, id: string): BlueprintNode {
  const stack = [...(studio.document?.roots ?? [])];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node === undefined) break;
    if (node.id === id) return node;
    for (const children of Object.values(node.slots)) stack.push(...children);
  }
  throw new Error(`Reference authoring node ${id} is unavailable.`);
}

function requireControlHolder(holder: HTMLElement, control: string): HTMLElement {
  const element = holder.querySelector<HTMLElement>(`[data-reference-control="${control}"]`);
  if (element === null) throw new Error(`Reference authoring holder ${control} is unavailable.`);
  return element;
}
