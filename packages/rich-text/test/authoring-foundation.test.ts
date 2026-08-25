import { describe, expect, it } from 'vitest';
import type {
  StudioRichTextDocument,
  StudioRichTextSurface,
  StudioRichTextSurfaceAdapter,
  StudioRichTextSurfaceOptions,
} from '../src/index.js';
import {
  exportStudioMarkdown,
  importSafeHtml,
  importStudioMarkdown,
  resolveContainerRichTextProfile,
  resolveRichTextProfile,
  StudioRichTextEditorFactory,
} from '../src/index.js';

const INITIAL: StudioRichTextDocument = {
  content: [{ content: [{ text: 'Initial', type: 'text' }], type: 'paragraph' }],
  type: 'doc',
};

class TestSurface implements StudioRichTextSurface {
  public readonly options: StudioRichTextSurfaceOptions;
  public value: unknown;

  public constructor(value: StudioRichTextDocument, options: StudioRichTextSurfaceOptions) {
    this.options = options;
    this.value = structuredClone(value);
  }

  public destroy(): void {
    return undefined;
  }

  public focus(): void {
    return undefined;
  }

  public read(): Promise<unknown> {
    return Promise.resolve(structuredClone(this.value));
  }

  public replace(value: StudioRichTextDocument): Promise<void> {
    this.value = structuredClone(value);
    return Promise.resolve();
  }
}

class TestSurfaceAdapter implements StudioRichTextSurfaceAdapter {
  public surface?: TestSurface;

  public mount(options: StudioRichTextSurfaceOptions): Promise<StudioRichTextSurface> {
    this.surface = new TestSurface(options.initialValue, options);
    return Promise.resolve(this.surface);
  }
}

describe('Studio rich-text authoring foundation', () => {
  it('round-trips portable Markdown without persisting parser state', () => {
    const document = importStudioMarkdown(
      '## Heading\n\nText with **bold** and `code`.\n\n- One\n- Two',
    );

    expect(document.content.map((node) => node.type)).toEqual([
      'heading',
      'paragraph',
      'bulletList',
    ]);
    expect(exportStudioMarkdown(document)).toBe(
      '## Heading\n\nText with **bold** and `code`.\n\n- One\n- Two',
    );
  });

  it('imports only the fixed safe HTML ceiling and removes executable content and attributes', () => {
    const document = importSafeHtml(
      '<h2 onclick="bad()">Safe <em>heading</em></h2><script>alert(1)</script><p style="color:red">Body <a href="javascript:bad()">link</a></p>',
    );

    expect(document).toEqual({
      content: [
        {
          attrs: { level: 2 },
          content: [
            { text: 'Safe ', type: 'text' },
            { marks: [{ type: 'italic' }], text: 'heading', type: 'text' },
          ],
          type: 'heading',
        },
        { content: [{ text: 'Body link', type: 'text' }], type: 'paragraph' },
      ],
      type: 'doc',
    });
    expect(JSON.stringify(document)).not.toMatch(/onclick|javascript|script|style/u);
  });

  it('fails closed for unknown profiles', () => {
    expect(() => resolveRichTextProfile('host/rich' as never)).toThrow(/Unknown Studio/u);
    expect(() => resolveContainerRichTextProfile('host/container' as never)).toThrow(
      /Unknown Studio/u,
    );
  });

  it.each([
    'studio.core/accordion-item',
    'studio.core/dialog',
    'studio.core/notice',
    'studio.core/popover',
    'studio.core/tab',
  ] as const)('authors canonical content inside the %s control', async (containerType) => {
    const adapter = new TestSurfaceAdapter();
    const editor = await new StudioRichTextEditorFactory(adapter).create({
      containerType,
      holder: document.createElement('div'),
      value: INITIAL,
    });

    expect(editor.readOnly).toBe(false);
    expect(await editor.save()).toEqual(INITIAL);
  });

  it('keeps dynamic bindings read-only and never exposes editor-native state', async () => {
    const adapter = new TestSurfaceAdapter();
    const editor = await new StudioRichTextEditorFactory(adapter).create({
      binding: {
        onError: 'error',
        onNull: 'empty',
        source: { key: 'host/current-user', kind: 'context-value' },
        transforms: [],
      },
      holder: document.createElement('div'),
      value: INITIAL,
    });

    expect(editor.readOnly).toBe(true);
    expect(adapter.surface?.options.readOnly).toBe(true);
    expect(await editor.save()).toEqual(INITIAL);
  });

  it('preserves the last canonical value when transient editor state is invalid', async () => {
    const adapter = new TestSurfaceAdapter();
    const changes: unknown[] = [];
    const editor = await new StudioRichTextEditorFactory(adapter).create({
      holder: document.createElement('div'),
      onChange: (change) => changes.push(change),
      value: INITIAL,
    });
    if (adapter.surface === undefined) throw new Error('Missing test surface.');
    adapter.surface.value = { blocks: [{ type: 'editor-native' }] };
    adapter.surface.options.onChange();
    await Promise.resolve();
    await Promise.resolve();

    expect(await editor.save()).toEqual(INITIAL);
    expect(changes).toEqual([expect.objectContaining({ valid: false, value: INITIAL })]);
  });
});
