import type { FieldBinding, StudioDiagnostic } from '@kumwe/studio-protocol';
import {
  parseRichTextDocument,
  type StudioRichTextDocument,
  type StudioRichTextNode,
} from './index.js';
import { resolveRichTextProfile, type StudioRichTextProfileId } from './profiles.js';

export interface StudioRichTextEditorChange {
  diagnostics: StudioDiagnostic[];
  valid: boolean;
  value: StudioRichTextDocument;
}

export interface StudioRichTextEditorOptions {
  binding?: FieldBinding;
  holder: HTMLElement;
  onChange?: (change: StudioRichTextEditorChange) => void;
  placeholder?: string;
  profile?: StudioRichTextProfileId;
  readOnly?: boolean;
  value: StudioRichTextDocument;
}

export interface StudioRichTextEditor {
  destroy(): void;
  focus(): void;
  readonly readOnly: boolean;
  replace(value: StudioRichTextDocument): Promise<void>;
  save(): Promise<StudioRichTextDocument>;
}

export interface StudioRichTextSurfaceOptions {
  holder: HTMLElement;
  initialValue: StudioRichTextDocument;
  onChange: () => void;
  placeholder?: string;
  readOnly: boolean;
}

/** Editor-neutral surface seam used by Studio's factory and deterministic tests. */
export interface StudioRichTextSurface {
  destroy(): void;
  focus(): void;
  read(): Promise<unknown>;
  replace(value: StudioRichTextDocument): Promise<void>;
}

export interface StudioRichTextSurfaceAdapter {
  mount(options: StudioRichTextSurfaceOptions): Promise<StudioRichTextSurface>;
}

/**
 * The only public construction path for block prose. Hosts configure Studio
 * profiles and canonical values; the selected editor remains an implementation
 * detail and can never leak its document shape into an artifact.
 */
export class StudioRichTextEditorFactory {
  readonly #surfaceAdapter: StudioRichTextSurfaceAdapter;

  public constructor(surfaceAdapter: StudioRichTextSurfaceAdapter = new EditorJsSurfaceAdapter()) {
    this.#surfaceAdapter = surfaceAdapter;
  }

  public async create(options: StudioRichTextEditorOptions): Promise<StudioRichTextEditor> {
    const profile = resolveRichTextProfile(options.profile);
    let lastValid = parseRichTextDocument(options.value, profile);
    const readOnly =
      options.readOnly === true ||
      (options.binding !== undefined && options.binding.source.kind !== 'static-value');
    const mounted: { surface?: StudioRichTextSurface } = {};
    let changeQueue = Promise.resolve();

    const readCanonical = async (): Promise<StudioRichTextDocument> => {
      if (mounted.surface === undefined) {
        return lastValid;
      }
      const candidate = await mounted.surface.read();
      lastValid = parseRichTextDocument(candidate, profile);
      return lastValid;
    };

    mounted.surface = await this.#surfaceAdapter.mount({
      holder: options.holder,
      initialValue: lastValid,
      onChange: (): void => {
        changeQueue = changeQueue.then(async () => {
          try {
            const value = await readCanonical();
            options.onChange?.({ diagnostics: [], valid: true, value });
          } catch {
            options.onChange?.({
              diagnostics: [invalidEditorDiagnostic()],
              valid: false,
              value: lastValid,
            });
          }
        });
      },
      ...(options.placeholder === undefined ? {} : { placeholder: options.placeholder }),
      readOnly,
    });

    return {
      destroy: (): void => mounted.surface?.destroy(),
      focus: (): void => mounted.surface?.focus(),
      readOnly,
      replace: async (value): Promise<void> => {
        const canonical = parseRichTextDocument(value, profile);
        await mounted.surface?.replace(canonical);
        lastValid = canonical;
      },
      save: async (): Promise<StudioRichTextDocument> => {
        await changeQueue;
        try {
          return await readCanonical();
        } catch {
          return lastValid;
        }
      },
    };
  }
}

/** Backward-readable explicit name; it still exposes only the neutral factory contract. */
export const EditorJsRichTextEditorFactory: typeof StudioRichTextEditorFactory =
  StudioRichTextEditorFactory;

function invalidEditorDiagnostic(): StudioDiagnostic {
  return {
    code: 'studio.rich-text/invalid-editor-state',
    message: {
      defaultMessage: 'The latest edit is not valid for this rich-text profile.',
      key: 'studio.rich-text/invalid-editor-state',
    },
    severity: 'error',
  };
}

interface EditorJsBlock {
  data: { node: StudioRichTextNode };
  type: 'studioCanonical';
}

interface EditorJsSnapshot {
  blocks: EditorJsBlock[];
  version?: string;
}

interface EditorJsRuntime {
  caret?: { focus(position?: boolean): boolean };
  destroy(): void;
  isReady: Promise<void>;
  render(data: EditorJsSnapshot): Promise<void>;
  save(): Promise<unknown>;
}

type EditorJsConstructor = new (configuration: Record<string, unknown>) => EditorJsRuntime;

class EditorJsSurfaceAdapter implements StudioRichTextSurfaceAdapter {
  public async mount(options: StudioRichTextSurfaceOptions): Promise<StudioRichTextSurface> {
    const imported = (await import('@editorjs/editorjs')) as unknown as {
      default: EditorJsConstructor;
    };
    const Runtime = imported.default;
    const runtime = new Runtime({
      data: toEditorJs(options.initialValue),
      holder: options.holder,
      minHeight: 0,
      onChange: options.onChange,
      placeholder: options.placeholder ?? '',
      readOnly: options.readOnly,
      tools: { studioCanonical: StudioCanonicalTool },
    });
    await runtime.isReady;
    return {
      destroy: (): void => runtime.destroy(),
      focus: (): void => {
        runtime.caret?.focus(true);
      },
      read: async (): Promise<unknown> => fromEditorJs(await runtime.save()),
      replace: async (value): Promise<void> => runtime.render(toEditorJs(value)),
    };
  }
}

interface CanonicalToolConstructorOptions {
  data?: { node?: StudioRichTextNode };
  readOnly?: boolean;
}

/** Minimal canonical fallback tool; richer first-party tools replace it by profile. */
class StudioCanonicalTool {
  public static readonly isReadOnlySupported: boolean = true;

  public static readonly toolbox: { icon: string; title: string } = {
    icon: '¶',
    title: 'Text',
  };

  readonly #node: StudioRichTextNode;
  readonly #readOnly: boolean;
  #input?: HTMLTextAreaElement;

  public constructor(options: CanonicalToolConstructorOptions) {
    this.#node = structuredClone(options.data?.node ?? { type: 'paragraph' });
    this.#readOnly = options.readOnly === true;
  }

  public render(): HTMLElement {
    if (this.#node.type === 'horizontalRule') {
      const separator = document.createElement('hr');
      separator.setAttribute('aria-label', 'Separator');
      return separator;
    }
    const input = document.createElement('textarea');
    input.setAttribute('aria-label', this.#node.type === 'heading' ? 'Heading' : 'Text');
    input.disabled = this.#readOnly;
    input.rows = this.#node.type === 'paragraph' ? 3 : 2;
    input.value = nodeText(this.#node);
    this.#input = input;
    return input;
  }

  public save(): { node: StudioRichTextNode } {
    if (this.#input === undefined || this.#node.type === 'horizontalRule') {
      return { node: structuredClone(this.#node) };
    }
    const node = structuredClone(this.#node);
    const text = this.#input.value;
    if (node.type === 'heading' || node.type === 'paragraph') {
      node.content = text.length > 0 ? [{ text, type: 'text' }] : [];
    }
    return { node };
  }
}

function toEditorJs(document: StudioRichTextDocument): EditorJsSnapshot {
  return {
    blocks: document.content.map((node) => ({
      data: { node: structuredClone(node) },
      type: 'studioCanonical',
    })),
    version: '2.31.6',
  };
}

function fromEditorJs(value: unknown): StudioRichTextDocument {
  if (!isRecord(value) || !Array.isArray(value.blocks)) {
    throw new TypeError('Editor surface returned an invalid block collection.');
  }
  const content = value.blocks.map((block, index) => {
    if (
      !isRecord(block) ||
      block.type !== 'studioCanonical' ||
      !isRecord(block.data) ||
      !isRecord(block.data.node)
    ) {
      throw new TypeError(`Editor block ${index} is not a Studio canonical block.`);
    }
    return structuredClone(block.data.node) as unknown as StudioRichTextNode;
  });
  return { content: content.length > 0 ? content : [{ type: 'paragraph' }], type: 'doc' };
}

function nodeText(node: StudioRichTextNode): string {
  return `${node.text ?? ''}${(node.content ?? []).map((child) => nodeText(child)).join('\n')}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
