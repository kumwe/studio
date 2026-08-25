import type { BlueprintNode, MediaReference } from '@kumwe/studio-protocol';
import type {
  ResolvedWebMedia,
  SafeMarkupFragment,
  StudioScopedStyleSheet,
} from '@kumwe/studio-renderer-web';

const safeIntroduction: SafeMarkupFragment = {
  kind: 'safe-markup-fragment',
  nodes: [
    {
      children: [
        { kind: 'text', value: 'A standalone ' },
        {
          children: [{ kind: 'text', value: 'Studio contract' }],
          kind: 'element',
          tag: 'strong',
        },
        {
          kind: 'text',
          value: ' drives authoring, dynamic resources, media, and semantic delivery.',
        },
      ],
      kind: 'element',
      tag: 'p',
    },
  ],
  policy: 'studio.reference/sanitized-html-v1',
};

const resources: Readonly<Record<string, unknown>> = Object.freeze({
  'studio.reference/article-featured': {
    id: 'articles/portable-studio',
    label: 'Building a portable page system',
    summary: 'How canonical contracts keep the editor and delivery host independently replaceable.',
    url: '#capabilities',
  },
  'studio.reference/embed-guide': {
    id: 'guides/integration',
    label: 'Studio host integration guide',
    summary: 'A host-resolved resource rendered without an executable embed payload.',
    url: '#capabilities',
  },
  'studio.reference/product-price': { amount: '129.00', currency: 'USD' },
  'studio.reference/safe-intro': safeIntroduction,
});

const recentArticles = Object.freeze([
  {
    id: 'articles/editor-boundary',
    label: 'The editor-neutral boundary',
    summary: 'Editor.js stays private while canonical rich text stays portable.',
    url: '#capabilities',
  },
  {
    id: 'articles/media-custody',
    label: 'Media without lock-in',
    summary: 'Studio owns the UX and the host retains custody and delivery authority.',
    url: '#capabilities',
  },
  {
    id: 'articles/semantic-rendering',
    label: 'Semantic rendering first',
    summary: 'Usable HTML precedes optional progressive enhancements.',
    url: '#capabilities',
  },
]);

const media: Readonly<Record<string, ResolvedWebMedia>> = Object.freeze({
  'studio.reference/audio': {
    altText: '',
    mediaType: 'audio/mpeg',
    src: '/reference-media/reference-audio.mp3',
  },
  'studio.reference/gallery-one': image('gallery-one.svg', 'Structured page blocks'),
  'studio.reference/gallery-three': image('gallery-three.svg', 'Responsive delivery'),
  'studio.reference/gallery-two': image('gallery-two.svg', 'Dynamic host resources'),
  'studio.reference/guide': {
    altText: '',
    mediaType: 'text/plain',
    src: '/reference-media/integration-guide.txt',
  },
  'studio.reference/hero': image('hero.svg', 'Studio page composition flowing to the web'),
  'studio.reference/video': {
    altText: '',
    mediaType: 'video/mp4',
    src: '/reference-media/reference-video.mp4',
  },
  'studio.reference/video-poster': image('video-poster.svg', 'Reference video poster'),
});

export const referenceScopedStyles: Readonly<Record<string, StudioScopedStyleSheet>> =
  Object.freeze({
    'hero-heading': {
      rules: [
        {
          declarations: { color: '#173e8f', 'font-size': '3rem' },
          target: 'heading',
        },
      ],
    },
  });

export function resolveReferenceBinding(node: Readonly<BlueprintNode>, port: string): unknown {
  const source = node.bindings[port]?.source;
  if (source === undefined) return undefined;
  switch (source.kind) {
    case 'static-value':
      return structuredClone(source.value);
    case 'resource-reference':
      return structuredClone(resources[source.id]);
    case 'query-reference':
      return source.query === 'studio.reference/recent-articles'
        ? structuredClone(recentArticles)
        : [];
    case 'context-value':
    case 'entry-field':
      return undefined;
  }
}

export function resolveReferenceMedia(reference: Readonly<MediaReference>): ResolvedWebMedia {
  const resolved = media[reference.assetId];
  if (resolved === undefined) {
    throw new Error(`Reference host cannot resolve media asset ${reference.assetId}.`);
  }
  const accessibility = reference.accessibility;
  return {
    ...structuredClone(resolved),
    altText: accessibility.mode === 'informative' ? accessibility.altText : resolved.altText,
    ...(accessibility.mode === 'informative' && accessibility.caption !== undefined
      ? { caption: accessibility.caption }
      : {}),
  };
}

function image(filename: string, altText: string): ResolvedWebMedia {
  return {
    altText,
    height: 720,
    mediaType: 'image/svg+xml',
    src: `/reference-media/${filename}`,
    width: 1_280,
  };
}
