import { describe, expect, it } from 'vitest';
import { CORE_PRODUCTION_BLOCK_TYPES, coreProductionInitialProperties } from '@kumwe/studio-core';
import {
  STUDIO_CONTRACT_VERSION,
  type BlueprintNode,
  type FieldBinding,
  type JsonObject,
  type JsonValue,
} from '@kumwe/studio-protocol';
import {
  compileStudioScopedStyleSheet,
  renderSafeMarkupFragment,
  renderStudioWeb,
} from '../src/index.js';

const richText: JsonObject = {
  content: [
    { content: [{ marks: [{ type: 'bold' }], text: '<safe>', type: 'text' }], type: 'paragraph' },
  ],
  type: 'doc',
};

const media: JsonObject = {
  accessibility: { altText: 'A sample', mode: 'informative' },
  assetId: 'asset-1',
  contractVersion: STUDIO_CONTRACT_VERSION,
  kind: 'media-reference',
  usage: 'studio.media/content',
};

function staticBinding(value: JsonValue): FieldBinding {
  return {
    onError: 'error',
    onNull: 'empty',
    source: { kind: 'static-value', value },
    transforms: [],
  };
}

function node(
  id: string,
  type: (typeof CORE_PRODUCTION_BLOCK_TYPES)[keyof typeof CORE_PRODUCTION_BLOCK_TYPES],
  bindings: Record<string, JsonValue> = {},
  slots: Record<string, BlueprintNode[]> = {},
): BlueprintNode {
  return {
    authoring: { mode: Object.keys(slots).length > 0 ? 'structural' : 'content' },
    bindings: Object.fromEntries(
      Object.entries(bindings).map(([port, value]) => [port, staticBinding(value)]),
    ),
    id,
    properties: coreProductionInitialProperties(type),
    slots,
    type,
    version: '1.0.0',
  };
}

describe('semantic web renderer', () => {
  it('renders every first-party block type through a semantic or explicit fallback path', async () => {
    const roots = Object.values(CORE_PRODUCTION_BLOCK_TYPES).map((type, index) =>
      node(`node-${index}`, type),
    );
    const output = await renderStudioWeb({ roots });
    for (const type of Object.values(CORE_PRODUCTION_BLOCK_TYPES)) {
      expect(output.html).toContain(`data-studio-block="${type.slice(type.indexOf('/') + 1)}"`);
    }
    expect(output.html).not.toContain('undefined');
    expect(output.css).toContain('prefers-reduced-motion');
  });

  it('escapes rich content, projects media/resources/money, and emits advanced enhancement jobs', async () => {
    const grid = node(
      'grid',
      CORE_PRODUCTION_BLOCK_TYPES.grid,
      {},
      {
        items: [
          node('heading', CORE_PRODUCTION_BLOCK_TYPES.heading, { text: '<Heading>' }),
          node('rich', CORE_PRODUCTION_BLOCK_TYPES.richText, { content: richText }),
          node('image', CORE_PRODUCTION_BLOCK_TYPES.image, { asset: media }),
          node('chart', CORE_PRODUCTION_BLOCK_TYPES.chart, {
            chart: {
              datasets: [{ label: 'Revenue', values: [4, 8] }],
              labels: ['A', 'B'],
              title: 'Revenue',
              type: 'bar',
            },
          }),
          node('math', CORE_PRODUCTION_BLOCK_TYPES.math, { source: 'x^2' }),
          node('diagram', CORE_PRODUCTION_BLOCK_TYPES.diagram, { source: 'graph TD; A-->B' }),
          node('money', CORE_PRODUCTION_BLOCK_TYPES.money, {
            amount: { amount: '19.99', currency: 'NAD' },
          }),
        ],
      },
    );
    grid.responsive = { columns: { expanded: 4, medium: 2 } };
    const output = await renderStudioWeb(
      { roots: [grid] },
      {
        cspNonce: 'abcDEF12+/=',
        resolveMedia: () => ({
          altText: 'A <sample>',
          src: 'https://cdn.example.test/a.jpg',
          width: 640,
        }),
        scopedStyles: {
          heading: {
            rules: [{ declarations: { color: 'var(--studio-color-primary)' }, target: 'heading' }],
          },
        },
      },
    );
    expect(output.html).toContain('&lt;Heading&gt;');
    expect(output.html).toContain('<strong>&lt;safe&gt;</strong>');
    expect(output.html).toContain('alt="A &lt;sample&gt;"');
    expect(output.html).toContain('<table data-studio-chart-table>');
    expect(output.html).toContain('19.99 NAD');
    expect(output.html).not.toMatch(/<script|javascript:/iu);
    expect(output.css).toContain('--studio-columns-medium:2');
    expect(output.css).toContain('--studio-columns-expanded:4');
    expect(output.styleElement).toContain('nonce="abcDEF12+/="');
    expect(output.enhancements.map((item) => item.kind)).toEqual(['chart', 'math', 'diagram']);
  });

  it('renders only structural allowlisted HTML and policy-scoped CSS', () => {
    expect(
      renderSafeMarkupFragment({
        kind: 'safe-markup-fragment',
        nodes: [
          {
            attributes: { href: 'https://example.test' },
            children: [{ kind: 'text', value: '<open>' }],
            kind: 'element',
            tag: 'a',
          },
        ],
        policy: 'studio.markup/content',
      }),
    ).toBe('<a href="https://example.test">&lt;open&gt;</a>');
    expect(() =>
      renderSafeMarkupFragment({
        kind: 'safe-markup-fragment',
        nodes: [{ children: [], kind: 'element', tag: 'script' }],
        policy: 'studio.markup/content',
      }),
    ).toThrow(/tag script/u);
    expect(
      compileStudioScopedStyleSheet('s1', {
        rules: [{ declarations: { color: '#112233' }, target: 'self' }],
      }),
    ).toBe('[data-studio-scope="s1"]{color:#112233}');
    expect(() =>
      compileStudioScopedStyleSheet('s1', {
        rules: [{ declarations: { background: 'url(javascript:1)' }, target: 'self' }],
      }),
    ).toThrow();
  });

  it('keeps a slideshow usable before enhancement and describes trusted behavior separately', async () => {
    const gallery = node('gallery', CORE_PRODUCTION_BLOCK_TYPES.gallery, { items: [media, media] });
    gallery.properties = { autoplay: true, columns: 2, presentation: 'slideshow' };
    const output = await renderStudioWeb(
      { roots: [gallery] },
      { resolveMedia: () => ({ altText: 'Slide', src: 'https://cdn.example.test/slide.jpg' }) },
    );
    expect(output.html.match(/<figure data-studio-slide=/gu)).toHaveLength(2);
    expect(output.html).toContain('Previous');
    expect(output.html).toContain('Next');
    expect(output.enhancements).toEqual([
      expect.objectContaining({ autoplay: true, kind: 'slideshow', nodeId: 'gallery' }),
    ]);
  });

  it('renders progressive dialog, popover, and notice variants with semantic accessibility', async () => {
    const dialog = node(
      'dialog',
      CORE_PRODUCTION_BLOCK_TYPES.dialog,
      { title: 'Delete item', 'trigger-label': 'Review deletion' },
      {
        content: [node('dialog-copy', CORE_PRODUCTION_BLOCK_TYPES.richText, { content: richText })],
      },
    );
    const popover = node(
      'popover',
      CORE_PRODUCTION_BLOCK_TYPES.popover,
      { title: 'More information', 'trigger-label': 'Learn more' },
      {
        content: [
          node('popover-copy', CORE_PRODUCTION_BLOCK_TYPES.richText, { content: richText }),
        ],
      },
    );
    const notice = node('notice', CORE_PRODUCTION_BLOCK_TYPES.notice, {
      content: richText,
      title: 'Check this field',
    });
    notice.properties = { dismissible: true, tone: 'warning' };
    const output = await renderStudioWeb({ roots: [dialog, popover, notice] });
    expect(output.html).toContain('<details data-studio-dialog');
    expect(output.html).toContain('role="dialog" aria-modal="true"');
    expect(output.html).toContain('<details data-studio-popover');
    expect(output.html).toContain('data-studio-tone="warning" role="alert"');
    expect(output.enhancements.map((item) => item.kind)).toEqual(['dialog', 'popover', 'notice']);
  });

  it('projects bounded presentation intent and schedules trusted motion', async () => {
    const heading = node('presented', CORE_PRODUCTION_BLOCK_TYPES.heading, { text: 'Visible' });
    heading.properties = {
      design: {
        align: 'center',
        animation: 'fade',
        position: 'sticky',
        visibility: { compact: 'hidden', medium: 'visible' },
        width: 'full',
      },
      level: 2,
    };
    const output = await renderStudioWeb({ roots: [heading] });
    expect(output.html).toContain('data-studio-align="center"');
    expect(output.html).toContain('data-studio-position="sticky"');
    expect(output.html).toContain('data-studio-visible-compact="hidden"');
    expect(output.html).not.toContain('style=');
    expect(output.enhancements).toContainEqual(
      expect.objectContaining({ animation: 'fade', kind: 'motion', nodeId: 'presented' }),
    );
  });

  it('renders semantic navigation, descriptions, tables, forms, progress, and cover media', async () => {
    const navigation = node(
      'navigation',
      CORE_PRODUCTION_BLOCK_TYPES.navigation,
      { label: 'Primary' },
      {
        items: [node('nav-home', CORE_PRODUCTION_BLOCK_TYPES.navigationItem, { label: 'Home' })],
      },
    );
    navigation.properties = { presentation: 'breadcrumbs' };
    const navItem = navigation.slots.items?.[0];
    if (navItem !== undefined) navItem.properties = { current: true, href: '/home' };
    const descriptions = node(
      'descriptions',
      CORE_PRODUCTION_BLOCK_TYPES.descriptionList,
      { title: 'Details' },
      {
        items: [
          node('description', CORE_PRODUCTION_BLOCK_TYPES.descriptionItem, {
            description: richText,
            term: 'Name',
          }),
        ],
      },
    );
    const tableNode = node('table', CORE_PRODUCTION_BLOCK_TYPES.table, {
      table: { columns: ['Name'], rows: [['<safe>']] },
    });
    const searchNode = node('search', CORE_PRODUCTION_BLOCK_TYPES.search, { label: 'Find' });
    searchNode.properties = { action: 'javascript:alert(1)', 'query-parameter': 'query' };
    const progressNode = node('progress', CORE_PRODUCTION_BLOCK_TYPES.progress, {
      label: 'Complete',
      value: 75,
    });
    const coverNode = node(
      'cover',
      CORE_PRODUCTION_BLOCK_TYPES.cover,
      { background: media },
      { content: [] },
    );
    const output = await renderStudioWeb(
      { roots: [navigation, descriptions, tableNode, searchNode, progressNode, coverNode] },
      {
        resolveMedia: () => ({ altText: 'Background', src: 'https://cdn.example.test/cover.jpg' }),
      },
    );
    expect(output.html).toContain('<nav data-studio-navigation="breadcrumbs"');
    expect(output.html).toContain('aria-current="page"');
    expect(output.html).toContain('<dl>');
    expect(output.html).toContain('<table data-studio-table>');
    expect(output.html).toContain('&lt;safe&gt;');
    expect(output.html).toContain('<form role="search" method="get">');
    expect(output.html).not.toContain('javascript:');
    expect(output.html).toContain('<progress max="100" value="75">');
    expect(output.html).toContain('data-studio-cover');
  });

  it('allows only explicit non-active blob media preview authority', async () => {
    const imageNode = node('blob-image', CORE_PRODUCTION_BLOCK_TYPES.image, { asset: media });
    const resolveMedia = () => ({
      altText: 'Local preview',
      mediaType: 'image/png',
      src: 'blob:https://studio.example.test/123e4567-e89b-12d3-a456-426614174000',
    });
    expect((await renderStudioWeb({ roots: [imageNode] }, { resolveMedia })).html).toContain(
      'Image unavailable',
    );
    expect(
      (await renderStudioWeb({ roots: [imageNode] }, { allowBlobMedia: true, resolveMedia })).html,
    ).toContain('blob:https://studio.example.test/123e4567-e89b-12d3-a456-426614174000');
    expect(
      (
        await renderStudioWeb(
          { roots: [imageNode] },
          {
            allowBlobMedia: true,
            resolveMedia: () => ({ ...resolveMedia(), mediaType: 'image/svg+xml' }),
          },
        )
      ).html,
    ).toContain('Image unavailable');
  });
});
