import type { StudioRichTextDocument, StudioRichTextNode } from './index.js';
import {
  STUDIO_EDITOR_JS_TOOL_NAMES,
  studioEditorJsTools,
  toStudioEditorJsBlocks,
  type StudioEditorJsBlock,
  type StudioEditorJsToolName,
} from './first-party-tools.js';
import type {
  StudioRichTextSurface,
  StudioRichTextSurfaceAdapter,
  StudioRichTextSurfaceOptions,
} from './studio-rich-text-editor.js';

interface MountedStrictBlock {
  tool: {
    render(): HTMLElement;
    save(): { node: StudioRichTextNode };
  };
  type: StudioEditorJsToolName;
}

type InlineAction = 'bold' | 'code' | 'hard-break' | 'highlight' | 'italic' | 'strike';
type HighlightTone = 'accent' | 'danger' | 'info' | 'success' | 'warning';

/**
 * Sink-free authoring surface for hosts enforcing strict style CSP and
 * Trusted Types. It shares Studio's canonical first-party tools but never
 * creates style elements, style attributes, or HTML-string sinks.
 */
export class StudioStrictCspRichTextSurfaceAdapter implements StudioRichTextSurfaceAdapter {
  public mount(options: StudioRichTextSurfaceOptions): Promise<StudioRichTextSurface> {
    return Promise.resolve(new StrictCspRichTextSurface(options));
  }
}

class StrictCspRichTextSurface implements StudioRichTextSurface {
  readonly #blocks = document.createElement('div');
  readonly #options: StudioRichTextSurfaceOptions;
  readonly #root = document.createElement('section');
  #mounted: MountedStrictBlock[] = [];

  public constructor(options: StudioRichTextSurfaceOptions) {
    this.#options = options;
    this.#root.className = 'studio-rich-text-strict-surface';
    this.#root.dataset.studioRichTextSurface = 'strict-csp';
    this.#root.setAttribute(
      'aria-label',
      options.readOnly ? 'Rich text preview' : 'Rich text editor',
    );
    this.#root.setAttribute('role', 'region');
    this.#blocks.className = 'studio-rich-text-strict-blocks';
    this.#blocks.addEventListener('change', this.#notifyChange);
    this.#blocks.addEventListener('input', this.#notifyChange);
    this.#render(options.initialValue);
    options.holder.replaceChildren(this.#root);
  }

  public destroy(): void {
    this.#blocks.removeEventListener('change', this.#notifyChange);
    this.#blocks.removeEventListener('input', this.#notifyChange);
    this.#mounted = [];
    this.#root.remove();
  }

  public focus(): void {
    const target = this.#root.querySelector<HTMLElement>(
      '[contenteditable="true"], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), button:not(:disabled)',
    );
    if (target !== null) {
      target.focus();
      return;
    }
    this.#root.tabIndex = -1;
    this.#root.focus();
  }

  public read(): Promise<StudioRichTextDocument> {
    return Promise.resolve(structuredClone(this.#snapshot()));
  }

  public replace(value: StudioRichTextDocument): Promise<void> {
    this.#render(value);
    return Promise.resolve();
  }

  readonly #notifyChange = (): void => {
    this.#options.onChange();
  };

  #add(type: StudioEditorJsToolName): void {
    const document = this.#snapshot();
    document.content.push(defaultNode(type));
    this.#render(document);
    this.#options.onChange();
  }

  #move(index: number, delta: -1 | 1): void {
    const document = this.#snapshot();
    const target = index + delta;
    if (target < 0 || target >= document.content.length) return;
    const [node] = document.content.splice(index, 1);
    if (node === undefined) return;
    document.content.splice(target, 0, node);
    this.#render(document);
    this.#options.onChange();
    this.#focusBlock(target);
  }

  #remove(index: number): void {
    const document = this.#snapshot();
    document.content.splice(index, 1);
    if (document.content.length === 0) document.content.push(defaultNode('paragraph'));
    this.#render(document);
    this.#options.onChange();
    this.#focusBlock(Math.min(index, document.content.length - 1));
  }

  #focusBlock(index: number): void {
    this.#blocks
      .querySelector<HTMLElement>(`[data-studio-rich-text-index="${String(index)}"]`)
      ?.querySelector<HTMLElement>(
        '[contenteditable="true"], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), button:not(:disabled)',
      )
      ?.focus();
  }

  #render(value: StudioRichTextDocument): void {
    const tools = studioEditorJsTools();
    const blocks = toStudioEditorJsBlocks(value);
    this.#mounted = blocks.map((block) => {
      const Tool = tools[block.type];
      return {
        tool: new Tool({ data: block.data, readOnly: this.#options.readOnly }),
        type: block.type,
      };
    });

    this.#root.replaceChildren();
    if (!this.#options.readOnly) this.#root.append(this.#createToolbar());
    this.#blocks.replaceChildren(
      ...this.#mounted.map((block, index) => this.#renderBlock(block, index)),
    );
    this.#root.append(this.#blocks);
  }

  #renderBlock(block: MountedStrictBlock, index: number): HTMLElement {
    const group = document.createElement('section');
    const title = studioEditorJsTools()[block.type].toolbox.title;
    group.className = 'studio-rich-text-strict-block';
    group.dataset.studioRichTextIndex = String(index);
    group.setAttribute('aria-label', `${title} block ${String(index + 1)}`);
    group.setAttribute('role', 'group');

    if (!this.#options.readOnly) {
      const controls = document.createElement('div');
      controls.className = 'studio-rich-text-strict-block-controls';
      controls.setAttribute('aria-label', `${title} block actions`);
      controls.setAttribute('role', 'toolbar');
      controls.append(
        actionButton('Move block up', () => this.#move(index, -1), index === 0),
        actionButton(
          'Move block down',
          () => this.#move(index, 1),
          index === this.#mounted.length - 1,
        ),
        actionButton('Remove block', () => this.#remove(index)),
      );
      group.append(controls);
    }
    group.append(block.tool.render());
    return group;
  }

  #createToolbar(): HTMLElement {
    const tools = studioEditorJsTools();
    const toolbar = document.createElement('div');
    const select = document.createElement('select');
    select.setAttribute('aria-label', 'Rich text block type');
    for (const type of STUDIO_EDITOR_JS_TOOL_NAMES) {
      const option = document.createElement('option');
      option.textContent = tools[type].toolbox.title;
      option.value = type;
      select.append(option);
    }
    toolbar.className = 'studio-rich-text-strict-toolbar';
    toolbar.setAttribute('aria-label', 'Rich text tools');
    toolbar.setAttribute('role', 'toolbar');
    toolbar.append(
      select,
      actionButton('Add rich text block', () => {
        if (isToolName(select.value)) this.#add(select.value);
      }),
    );

    const tone = highlightToneControl();
    toolbar.append(
      inlineActionButton('Bold selected text', () => this.#formatInline('bold')),
      inlineActionButton('Italicize selected text', () => this.#formatInline('italic')),
      inlineActionButton('Strike selected text', () => this.#formatInline('strike')),
      inlineActionButton('Format selected text as code', () => this.#formatInline('code')),
      tone,
      inlineActionButton('Highlight selected text', () =>
        this.#formatInline('highlight', highlightTone(tone.value)),
      ),
      inlineActionButton('Insert line break', () => this.#formatInline('hard-break')),
    );
    return toolbar;
  }

  #formatInline(action: InlineAction, tone: HighlightTone = 'accent'): void {
    const selection = globalThis.getSelection();
    if (selection === null || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    const start = closestEditable(range.startContainer, this.#root);
    const end = closestEditable(range.endContainer, this.#root);
    if (start === undefined || start !== end) return;

    if (action === 'hard-break') {
      range.deleteContents();
      const lineBreak = document.createElement('br');
      range.insertNode(lineBreak);
      range.setStartAfter(lineBreak);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      this.#options.onChange();
      return;
    }
    if (range.collapsed) return;

    const localName = inlineElementName(action);
    const existing = closestInlineElement(range.commonAncestorContainer, start, localName);
    if (existing !== undefined) {
      const parent = existing.parentNode;
      while (existing.firstChild !== null) parent?.insertBefore(existing.firstChild, existing);
      existing.remove();
      this.#options.onChange();
      return;
    }

    const wrapper = document.createElement(localName);
    if (action === 'highlight') wrapper.dataset.studioTone = tone;
    wrapper.append(range.extractContents());
    range.insertNode(wrapper);
    range.selectNodeContents(wrapper);
    selection.removeAllRanges();
    selection.addRange(range);
    this.#options.onChange();
  }

  #snapshot(): StudioRichTextDocument {
    return {
      content: this.#mounted.map((block) => block.tool.save().node),
      type: 'doc',
    };
  }
}

function actionButton(label: string, action: () => void, disabled = false): HTMLButtonElement {
  const button = document.createElement('button');
  button.disabled = disabled;
  button.textContent = label;
  button.type = 'button';
  button.setAttribute('aria-label', label);
  button.addEventListener('click', action);
  return button;
}

function inlineActionButton(label: string, action: () => void): HTMLButtonElement {
  const button = actionButton(label, action);
  button.addEventListener('mousedown', (event) => event.preventDefault());
  return button;
}

function highlightToneControl(): HTMLSelectElement {
  const select = document.createElement('select');
  select.setAttribute('aria-label', 'Highlight tone');
  for (const tone of ['accent', 'info', 'success', 'warning', 'danger'] as const) {
    const option = document.createElement('option');
    option.textContent = tone;
    option.value = tone;
    select.append(option);
  }
  return select;
}

function closestEditable(node: Node, root: HTMLElement): HTMLElement | undefined {
  let candidate = node instanceof HTMLElement ? node : node.parentElement;
  while (candidate !== null) {
    if (candidate.getAttribute('contenteditable') === 'true') return candidate;
    if (candidate === root) return undefined;
    candidate = candidate.parentElement;
  }
  return undefined;
}

function closestInlineElement(
  node: Node,
  boundary: HTMLElement,
  localName: string,
): HTMLElement | undefined {
  let candidate = node instanceof HTMLElement ? node : node.parentElement;
  while (candidate !== null && candidate !== boundary) {
    if (candidate.localName === localName) return candidate;
    candidate = candidate.parentElement;
  }
  return undefined;
}

function inlineElementName(action: Exclude<InlineAction, 'hard-break'>): string {
  if (action === 'bold') return 'strong';
  if (action === 'italic') return 'em';
  if (action === 'strike') return 's';
  if (action === 'code') return 'code';
  return 'mark';
}

function isToolName(value: string): value is StudioEditorJsToolName {
  return STUDIO_EDITOR_JS_TOOL_NAMES.some((name) => name === value);
}

function highlightTone(value: string): HighlightTone {
  return ['accent', 'danger', 'info', 'success', 'warning'].includes(value)
    ? (value as HighlightTone)
    : 'accent';
}

function defaultNode(type: StudioEditorJsBlock['type']): StudioRichTextNode {
  switch (type) {
    case 'callout':
      return { attrs: { tone: 'info' }, content: [{ type: 'paragraph' }], type: 'callout' };
    case 'checklist':
      return {
        content: [{ attrs: { checked: false, level: 0 }, type: 'checklistItem' }],
        type: 'checklist',
      };
    case 'code':
      return { attrs: { language: 'text' }, type: 'codeBlock' };
    case 'delimiter':
      return { type: 'horizontalRule' };
    case 'header':
      return { attrs: { level: 2 }, type: 'heading' };
    case 'list':
      return {
        content: [{ content: [{ type: 'paragraph' }], type: 'listItem' }],
        type: 'bulletList',
      };
    case 'paragraph':
      return { type: 'paragraph' };
    case 'quote':
      return { content: [{ type: 'paragraph' }], type: 'blockquote' };
    case 'table':
      return {
        attrs: { header: false },
        content: [
          {
            content: [{ type: 'tableCell' }, { type: 'tableCell' }],
            type: 'tableRow',
          },
          {
            content: [{ type: 'tableCell' }, { type: 'tableCell' }],
            type: 'tableRow',
          },
        ],
        type: 'table',
      };
  }
}
