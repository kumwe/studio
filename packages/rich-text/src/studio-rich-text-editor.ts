import type { FieldBinding, StudioDiagnostic } from '@kumwe/studio-protocol';
import { parseRichTextDocument, type StudioRichTextDocument } from './index.js';
import { resolveRichTextProfile, type StudioRichTextProfileId } from './profiles.js';
import {
  fromStudioEditorJsBlocks,
  StudioMarkerTool,
  studioEditorJsTools,
  toStudioEditorJsBlocks,
} from './first-party-tools.js';

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

interface EditorJsSnapshot {
  blocks: ReturnType<typeof toStudioEditorJsBlocks>;
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
      inlineToolbar: ['bold', 'italic', 'marker'],
      minHeight: 0,
      onChange: options.onChange,
      placeholder: options.placeholder ?? '',
      readOnly: options.readOnly,
      tools: { ...studioEditorJsTools(), marker: StudioMarkerTool },
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

function toEditorJs(document: StudioRichTextDocument): EditorJsSnapshot {
  return {
    blocks: toStudioEditorJsBlocks(document),
    version: '2.31.6',
  };
}

function fromEditorJs(value: unknown): StudioRichTextDocument {
  return fromStudioEditorJsBlocks(value);
}
