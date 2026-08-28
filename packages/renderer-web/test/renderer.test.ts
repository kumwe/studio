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
  type StudioScopedStyleSheet,
} from '../src/index.js';

const richText: JsonObject = {
  content: [
    { content: [{ marks: [{ type: 'bold' }], text: '<safe>', type: 'text' }], type: 'paragraph' },
  ],
  type: 'doc',
};

const completeRichText: JsonObject = {
  content: [
    {
      attrs: { level: 3 },
      content: [{ marks: [{ type: 'italic' }], text: 'Heading', type: 'text' }],
      type: 'heading',
    },
    {
      content: [
        {
          content: [
            { marks: [{ type: 'strike' }], text: 'Quoted', type: 'text' },
            { type: 'hardBreak' },
            { marks: [{ type: 'code' }], text: 'line', type: 'text' },
          ],
          type: 'paragraph',
        },
      ],
      type: 'blockquote',
    },
    {
      content: [
        {
          content: [{ content: [{ text: 'Bullet', type: 'text' }], type: 'paragraph' }],
          type: 'listItem',
        },
      ],
      type: 'bulletList',
    },
    {
      attrs: { start: 2 },
      content: [
        {
          content: [{ content: [{ text: 'Ordered', type: 'text' }], type: 'paragraph' }],
          type: 'listItem',
        },
      ],
      type: 'orderedList',
    },
    { type: 'horizontalRule' },
    {
      attrs: { tone: 'warning' },
      content: [
        {
          content: [
            {
              marks: [{ attrs: { tone: 'danger' }, type: 'highlight' }],
              text: 'Callout',
              type: 'text',
            },
          ],
          type: 'paragraph',
        },
      ],
      type: 'callout',
    },
    {
      content: [
        {
          attrs: { checked: true, level: 2 },
          content: [{ text: 'Checked', type: 'text' }],
          type: 'checklistItem',
        },
      ],
      type: 'checklist',
    },
    {
      attrs: { header: true },
      content: [
        {
          content: [{ content: [{ text: 'Column', type: 'text' }], type: 'tableCell' }],
          type: 'tableRow',
        },
        {
          content: [{ content: [{ text: 'Value', type: 'text' }], type: 'tableCell' }],
          type: 'tableRow',
        },
      ],
      type: 'table',
    },
    { attrs: { language: 'html' }, text: '<script>', type: 'codeBlock' },
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
    expect(output.css).not.toMatch(/[\r\n]/u);
    expect(output.styleElement).toBe(
      `<style data-studio-renderer="semantic-web">${output.css}</style>`,
    );
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
    expect(output.css).not.toMatch(/\}\s+\[/u);
    expect(output.styleElement).toContain('nonce="abcDEF12+/="');
    expect(output.enhancements.map((item) => item.kind)).toEqual(['chart', 'math', 'diagram']);
  });

  it('renders every portable rich-text node and semantic highlight tone', async () => {
    const output = await renderStudioWeb({
      roots: [
        node('portable-rich-text', CORE_PRODUCTION_BLOCK_TYPES.richText, {
          content: completeRichText,
        }),
      ],
    });

    expect(output.html).toContain('<h3><em>Heading</em></h3>');
    expect(output.html).toContain(
      '<blockquote><p><del>Quoted</del><br><code>line</code></p></blockquote>',
    );
    expect(output.html).toContain('<ul><li><p>Bullet</p></li></ul>');
    expect(output.html).toContain('<ol start="2"><li><p>Ordered</p></li></ol>');
    expect(output.html).toContain('<hr>');
    expect(output.html).toContain(
      '<aside data-studio-rich-text-callout data-studio-tone="warning"><p><mark data-studio-tone="danger">Callout</mark></p></aside>',
    );
    expect(output.html).toContain('<ul data-studio-rich-text-checklist>');
    expect(output.html).toContain(
      'data-studio-rich-text-checklist-item data-studio-checked="true" data-studio-level="2" aria-level="3"',
    );
    expect(output.html).toContain(
      '<table data-studio-rich-text-table><thead><tr><th scope="col">Column</th></tr></thead>',
    );
    expect(output.html).toContain('<tbody><tr><td>Value</td></tr></tbody></table>');
    expect(output.html).toContain('<pre><code data-language="html">&lt;script&gt;</code></pre>');
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
    ).toBe('[data-studio-scope=s1]{color:#112233}');
    expect(() =>
      compileStudioScopedStyleSheet('s1', {
        rules: [{ declarations: { background: 'url(javascript:1)' }, target: 'self' }],
      }),
    ).toThrow();
    expect(() =>
      compileStudioScopedStyleSheet('x"]{}body{color:red}/*', {
        rules: [{ declarations: { color: '#112233' }, target: 'self' }],
      }),
    ).toThrow(/scope/u);
  });

  it.each(['body', 'toString', 'constructor', 'hasOwnProperty', '__proto__'])(
    'rejects non-own scoped CSS target %s at the compiler boundary',
    (target) => {
      expect(() =>
        compileStudioScopedStyleSheet('s1', {
          rules: [
            {
              declarations: { color: '#112233' },
              target,
            },
          ],
        } as unknown as StudioScopedStyleSheet),
      ).toThrow(/target .* is not allowed/u);
    },
  );

  it('rejects a scoped CSS target inherited through prototype pollution', () => {
    const target = 'pollutedScopedTarget';
    Object.defineProperty(Object.prototype, target, {
      configurable: true,
      value: ' body',
    });
    try {
      expect(() =>
        compileStudioScopedStyleSheet('s1', {
          rules: [{ declarations: { color: '#112233' }, target }],
        } as unknown as StudioScopedStyleSheet),
      ).toThrow(/target .* is not allowed/u);
    } finally {
      Reflect.deleteProperty(Object.prototype, target);
    }
  });

  it('accepts every own scoped CSS target in the compiler allowlist', () => {
    const output = compileStudioScopedStyleSheet('s1', {
      rules: (['self', 'heading', 'content', 'media', 'action'] as const).map((target) => ({
        declarations: { color: '#112233' },
        target,
      })),
    });

    expect(output).toBe(
      '[data-studio-scope=s1]{color:#112233}' +
        '[data-studio-scope=s1][data-studio-part="heading"]{color:#112233}' +
        '[data-studio-scope=s1][data-studio-part="content"]{color:#112233}' +
        '[data-studio-scope=s1][data-studio-part="media"]{color:#112233}' +
        '[data-studio-scope=s1][data-studio-part="action"]{color:#112233}',
    );
  });

  it('uses collision-free scopes to isolate CSS for formerly colliding schema-valid node ids', async () => {
    const firstId = 'nj6puezis73af';
    const secondId = 'n1ksfjywvqcv2';
    const output = await renderStudioWeb(
      {
        roots: [
          node(firstId, CORE_PRODUCTION_BLOCK_TYPES.heading, { text: 'First' }),
          node(secondId, CORE_PRODUCTION_BLOCK_TYPES.heading, { text: 'Second' }),
        ],
      },
      {
        scopedStyles: {
          [firstId]: { rules: [{ declarations: { color: '#112233' }, target: 'self' }] },
          [secondId]: { rules: [{ declarations: { color: '#445566' }, target: 'self' }] },
        },
      },
    );
    const host = document.createElement('div');
    host.innerHTML = output.html;
    const firstScope = host
      .querySelector(`[data-studio-node="${firstId}"]`)
      ?.getAttribute('data-studio-scope');
    const secondScope = host
      .querySelector(`[data-studio-node="${secondId}"]`)
      ?.getAttribute('data-studio-scope');

    expect(firstScope).toBeTruthy();
    expect(secondScope).toBeTruthy();
    expect(firstScope).not.toBe(secondScope);
    expect(output.css).toContain(`[data-studio-scope=${firstScope}]{color:#112233}`);
    expect(output.css).toContain(`[data-studio-scope=${secondScope}]{color:#445566}`);
  });

  it.each(['toString', 'hasOwnProperty', 'valueOf'])(
    'ignores inherited scoped-style members for schema-valid node id %s',
    async (id) => {
      const output = await renderStudioWeb(
        { roots: [node(id, CORE_PRODUCTION_BLOCK_TYPES.heading, { text: 'Visible' })] },
        { scopedStyles: {} },
      );

      expect(output.html).toContain(`data-studio-node="${id}"`);
      expect(output.css).not.toContain('#123456');
    },
  );

  it('applies an explicit own scoped-style entry whose id names an Object prototype member', async () => {
    const scopedStyles = {} as Record<string, StudioScopedStyleSheet>;
    Object.defineProperty(scopedStyles, 'toString', {
      enumerable: true,
      value: { rules: [{ declarations: { color: '#123456' }, target: 'self' }] },
    });
    const output = await renderStudioWeb(
      { roots: [node('toString', CORE_PRODUCTION_BLOCK_TYPES.heading, { text: 'Visible' })] },
      { scopedStyles },
    );
    const host = document.createElement('div');
    host.innerHTML = output.html;
    const scope = host
      .querySelector('[data-studio-node="toString"]')
      ?.getAttribute('data-studio-scope');

    expect(scope).toBeTruthy();
    expect(output.css).toContain(`[data-studio-scope=${scope}]{color:#123456}`);
  });

  it('keeps enhancement order equal to document order across delayed host resolution', async () => {
    const chartValue: JsonObject = {
      datasets: [{ label: 'Series', values: [1] }],
      labels: ['A'],
      type: 'bar',
    };
    const roots = [
      node('first', CORE_PRODUCTION_BLOCK_TYPES.chart),
      node('second', CORE_PRODUCTION_BLOCK_TYPES.chart),
    ];
    let inFlight = 0;
    let maximumInFlight = 0;
    const output = await renderStudioWeb(
      { roots },
      {
        resolveBinding: async (candidate, port) => {
          if (port !== 'chart') return undefined;
          inFlight += 1;
          maximumInFlight = Math.max(maximumInFlight, inFlight);
          if (candidate.id === 'first') {
            await new Promise((resolve) => setTimeout(resolve, 20));
          } else {
            await Promise.resolve();
          }
          inFlight -= 1;
          return chartValue;
        },
      },
    );

    expect(output.enhancements.map((item) => item.nodeId)).toEqual(['first', 'second']);
    expect(output.html.indexOf('data-studio-node="first"')).toBeLessThan(
      output.html.indexOf('data-studio-node="second"'),
    );
    expect(maximumInFlight).toBe(2);
  });

  it('collects parent and child enhancement jobs in Blueprint pre-order', async () => {
    const parent = node(
      'parent',
      CORE_PRODUCTION_BLOCK_TYPES.stack,
      {},
      { items: [node('child', CORE_PRODUCTION_BLOCK_TYPES.chart)] },
    );
    parent.properties.design = { animation: 'fade' };
    const output = await renderStudioWeb(
      {
        roots: [parent],
      },
      {
        resolveBinding: (_candidate, port) =>
          Promise.resolve(
            port === 'chart'
              ? {
                  datasets: [{ label: 'Series', values: [1] }],
                  labels: ['A'],
                  type: 'bar',
                }
              : undefined,
          ),
      },
    );

    expect(output.enhancements.map((item) => item.nodeId)).toEqual(['parent', 'child']);
    expect(output.enhancements.map((item) => item.kind)).toEqual(['motion', 'chart']);
  });

  it('renders checklist depth as nested semantic lists with accessible item levels', async () => {
    const checklist: JsonObject = {
      content: [
        {
          attrs: { checked: false, level: 0 },
          content: [{ text: 'Parent', type: 'text' }],
          type: 'checklistItem',
        },
        {
          attrs: { checked: true, level: 1 },
          content: [{ text: 'Child', type: 'text' }],
          type: 'checklistItem',
        },
        {
          attrs: { checked: false, level: 2 },
          content: [{ text: 'Grandchild', type: 'text' }],
          type: 'checklistItem',
        },
        {
          attrs: { checked: false, level: 1 },
          content: [{ text: 'Sibling child', type: 'text' }],
          type: 'checklistItem',
        },
        {
          attrs: { checked: false, level: 0 },
          content: [{ text: 'Root sibling', type: 'text' }],
          type: 'checklistItem',
        },
      ],
      type: 'checklist',
    };
    const output = await renderStudioWeb({
      roots: [
        node('nested-checklist', CORE_PRODUCTION_BLOCK_TYPES.richText, {
          content: { content: [checklist], type: 'doc' },
        }),
      ],
    });
    const host = document.createElement('div');
    host.innerHTML = output.html;
    const items = [...host.querySelectorAll<HTMLElement>('[data-studio-rich-text-checklist-item]')];

    expect(items.map((item) => item.getAttribute('aria-level'))).toEqual(['1', '2', '3', '2', '1']);
    expect(items[1]?.parentElement?.closest('[data-studio-rich-text-checklist-item]')).toBe(
      items[0],
    );
    expect(items[2]?.parentElement?.closest('[data-studio-rich-text-checklist-item]')).toBe(
      items[1],
    );
    expect(items[3]?.parentElement?.closest('[data-studio-rich-text-checklist-item]')).toBe(
      items[0],
    );
    expect(items[4]?.parentElement?.closest('[data-studio-rich-text-checklist-item]')).toBeNull();
    expect(items[1]?.querySelector('label')?.textContent).toBe('Child');
    expect(items[1]?.querySelector<HTMLInputElement>('input')?.checked).toBe(true);
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

  it('does not request the public runtime for empty interactive containers', async () => {
    const gallery = node('empty-gallery', CORE_PRODUCTION_BLOCK_TYPES.gallery, { items: [] });
    gallery.properties = { autoplay: true, presentation: 'slideshow' };
    const tabs = node('empty-tabs', CORE_PRODUCTION_BLOCK_TYPES.tabs, {}, { items: [] });
    const collection = node('empty-collection', CORE_PRODUCTION_BLOCK_TYPES.contentCollection, {
      items: [],
    });
    collection.properties = { presentation: 'slideshow' };

    const output = await renderStudioWeb({ roots: [gallery, tabs, collection] });

    expect(output.enhancements).toEqual([]);
    expect(output.html).not.toContain('data-studio-slide-previous');
    expect(output.html).not.toContain('data-studio-slide-next');
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
        items: [
          node(
            'nav-home',
            CORE_PRODUCTION_BLOCK_TYPES.navigationItem,
            { label: 'Home' },
            {
              children: [
                node('nav-child', CORE_PRODUCTION_BLOCK_TYPES.navigationItem, {
                  label: 'Child',
                }),
              ],
            },
          ),
        ],
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
    expect(output.html).toContain(
      '<ul><li data-studio-navigation-item data-studio-block="navigation-item" data-studio-node="nav-home"',
    );
    expect(output.html).toContain(
      '<ul data-studio-navigation-children><li data-studio-navigation-item data-studio-block="navigation-item" data-studio-node="nav-child"',
    );
    expect(output.html).toContain('aria-current="page"');
    expect(output.html).toContain(
      '<dl><div data-studio-description-item data-studio-block="description-item" data-studio-node="description"',
    );
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
