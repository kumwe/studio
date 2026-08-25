import {
  STUDIO_CONTRACT_VERSION,
  type FieldBinding,
  type MediaAsset,
  type MediaReference,
  type MediaRenditionIntent,
  type MediaUploadSession,
  type StudioDiagnostic,
} from '@kumwe/studio-protocol';
import { MediaLibrary, type MediaLibraryState, type MediaProvider } from './media-library.js';
import { MediaUploadController, type MediaUploadTransport } from './upload-controller.js';
import { validateMediaReference } from './validate-media-reference.js';

export interface StudioMediaFieldOptions {
  binding?: FieldBinding;
  mediaTypes?: string[];
  onChange?: (state: StudioMediaFieldState) => void;
  provider: MediaProvider;
  readOnly?: boolean;
  uploadTransport?: MediaUploadTransport;
  usage: `${string}/${string}`;
  value?: MediaReference;
}

export type StudioMediaFieldStatus =
  'browsing' | 'empty' | 'error' | 'orphaned' | 'ready' | 'uploading';

export interface StudioMediaFieldState {
  asset?: MediaAsset;
  diagnostics: StudioDiagnostic[];
  library: MediaLibraryState;
  readOnly: boolean;
  status: StudioMediaFieldStatus;
  upload?: MediaUploadSession;
  value?: MediaReference;
}

export type StudioMediaFieldListener = (state: StudioMediaFieldState) => void;

/**
 * Host-neutral media-field state machine. It coordinates the complete author
 * journey while persisting only a canonical MediaReference — never bytes,
 * delivery URLs, upload grants, Editor state, or catalogue projections.
 */
export class StudioMediaFieldController {
  readonly #library: MediaLibrary;
  readonly #listeners = new Set<StudioMediaFieldListener>();
  readonly #mediaTypes: string[] | undefined;
  readonly #onChange: StudioMediaFieldOptions['onChange'] | undefined;
  readonly #provider: MediaProvider;
  readonly #readOnly: boolean;
  readonly #upload: MediaUploadController | undefined;
  readonly #usage: `${string}/${string}`;
  #asset: MediaAsset | undefined;
  #libraryState: MediaLibraryState = { assets: [], status: 'idle' };
  #status: StudioMediaFieldStatus;
  #uploadState: MediaUploadSession | undefined;
  #value: MediaReference | undefined;

  public constructor(options: StudioMediaFieldOptions) {
    this.#provider = options.provider;
    this.#usage = options.usage;
    this.#mediaTypes = options.mediaTypes === undefined ? undefined : [...options.mediaTypes];
    this.#onChange = options.onChange;
    this.#readOnly =
      options.readOnly === true ||
      (options.binding !== undefined && options.binding.source.kind !== 'static-value');
    this.#value = options.value === undefined ? undefined : structuredClone(options.value);
    this.#upload =
      options.uploadTransport === undefined
        ? undefined
        : new MediaUploadController(options.uploadTransport);
    this.#status = this.#value === undefined ? 'empty' : 'browsing';
    this.#library = new MediaLibrary(options.provider);
    this.#library.subscribe((library) => {
      this.#libraryState = library;
      if (library.status === 'error') this.#status = 'error';
      this.#emit(false);
    });
    if (this.#upload !== undefined) {
      this.#upload.subscribe((upload) => {
        this.#uploadState = upload;
        this.#status =
          upload.state === 'failed'
            ? 'error'
            : upload.state === 'complete'
              ? 'browsing'
              : 'uploading';
        this.#emit(false);
      });
    }
  }

  public get state(): StudioMediaFieldState {
    const state: StudioMediaFieldState = {
      diagnostics: this.#value === undefined ? [] : validateMediaReference(this.#value),
      library: structuredClone(this.#libraryState),
      readOnly: this.#readOnly,
      status: this.#status,
    };
    if (this.#asset !== undefined) state.asset = structuredClone(this.#asset);
    if (this.#uploadState !== undefined) state.upload = structuredClone(this.#uploadState);
    if (this.#value !== undefined) state.value = structuredClone(this.#value);
    return state;
  }

  public cancelUpload(): void {
    this.#assertMutable();
    this.#upload?.cancel();
  }

  public clear(): void {
    this.#assertMutable();
    this.#asset = undefined;
    this.#value = undefined;
    this.#status = 'empty';
    this.#emit(true);
  }

  public dispose(): void {
    this.#library.dispose();
    this.#listeners.clear();
  }

  public async drop(files: FileList | readonly File[]): Promise<StudioMediaFieldState> {
    return this.#uploadFiles([...files]);
  }

  public async loadNext(): Promise<StudioMediaFieldState> {
    this.#status = 'browsing';
    await this.#library.loadNext();
    return this.state;
  }

  public async open(): Promise<StudioMediaFieldState> {
    return this.search('');
  }

  public async paste(
    items: DataTransferItemList | readonly DataTransferItem[],
  ): Promise<StudioMediaFieldState> {
    const files = [...items]
      .filter((item) => item.kind === 'file')
      .map((item) => item.getAsFile())
      .filter((file): file is File => file !== null);
    return this.#uploadFiles(files);
  }

  public async resolve(): Promise<StudioMediaFieldState> {
    if (this.#value === undefined) return this.state;
    this.#status = 'browsing';
    this.#emit(false);
    try {
      const asset = await this.#provider.get(this.#value.assetId);
      if (asset === null) {
        this.#asset = undefined;
        this.#status = 'orphaned';
      } else {
        this.#asset = asset;
        this.#status =
          asset.state === 'rejected' || asset.state === 'quarantined' ? 'error' : 'ready';
      }
    } catch {
      this.#status = 'error';
    }
    this.#emit(false);
    return this.state;
  }

  public async retryUpload(): Promise<StudioMediaFieldState> {
    this.#assertMutable();
    if (this.#upload === undefined) throw new Error('This media field has no upload transport.');
    const result = await this.#upload.retry();
    await this.#acceptCompletedUpload(result);
    return this.state;
  }

  public async search(search: string): Promise<StudioMediaFieldState> {
    this.#status = 'browsing';
    await this.#library.search({
      limit: 40,
      ...(this.#mediaTypes === undefined ? {} : { mediaTypes: this.#mediaTypes }),
      ...(search.trim().length === 0 ? {} : { search: search.trim().slice(0, 500) }),
    });
    return this.state;
  }

  public select(asset: MediaAsset): void {
    this.#assertMutable();
    this.#asset = structuredClone(asset);
    const alt = asset.metadata.altText?.trim();
    this.#value = {
      accessibility: {
        altText: alt === undefined || alt.length === 0 ? asset.filename : alt,
        ...(asset.metadata.caption === undefined ? {} : { caption: asset.metadata.caption }),
        mode: 'informative',
      },
      assetId: asset.id,
      assetRevision: asset.revision,
      contractVersion: STUDIO_CONTRACT_VERSION,
      kind: 'media-reference',
      usage: this.#usage,
    };
    this.#status =
      asset.state === 'ready' ? 'ready' : asset.state === 'processing' ? 'uploading' : 'error';
    this.#emit(true);
  }

  public setAltText(altText: string): void {
    this.#assertMutable();
    const value = this.#requireValue();
    const caption =
      value.accessibility.mode === 'informative' ? value.accessibility.caption : undefined;
    value.accessibility = {
      altText: altText.trim().slice(0, 5_000),
      ...(caption === undefined ? {} : { caption }),
      mode: 'informative',
    };
    this.#emit(true);
  }

  public setCaption(caption: string | undefined): void {
    this.#assertMutable();
    const value = this.#requireValue();
    if (value.accessibility.mode !== 'informative') return;
    value.accessibility = {
      ...value.accessibility,
      ...(caption === undefined || caption.length === 0
        ? {}
        : { caption: caption.slice(0, 20_000) }),
    };
    this.#emit(true);
  }

  public setDecorative(decorative: boolean): void {
    this.#assertMutable();
    const value = this.#requireValue();
    if (decorative) {
      value.accessibility = { mode: 'decorative' };
    } else {
      const metadataAlt = this.#asset?.metadata.altText?.trim() ?? '';
      const filename = this.#asset?.filename ?? '';
      const suggested =
        metadataAlt.length > 0 ? metadataAlt : filename.length > 0 ? filename : 'Media';
      value.accessibility = { altText: suggested, mode: 'informative' };
    }
    this.#emit(true);
  }

  public setFocalPoint(point: { x: number; y: number } | undefined): void {
    this.#assertMutable();
    const value = this.#requireValue();
    if (point === undefined) {
      delete value.focalPoint;
    } else {
      value.focalPoint = { x: clampUnit(point.x), y: clampUnit(point.y) };
    }
    this.#emit(true);
  }

  public setRenditionIntent(intent: MediaRenditionIntent | undefined): void {
    this.#assertMutable();
    const value = this.#requireValue();
    if (intent === undefined) {
      delete value.renditionIntent;
    } else {
      value.renditionIntent = structuredClone(intent);
    }
    this.#emit(true);
  }

  public subscribe(listener: StudioMediaFieldListener): () => void {
    this.#listeners.add(listener);
    listener(this.state);
    return (): void => {
      this.#listeners.delete(listener);
    };
  }

  public async upload(file: File): Promise<StudioMediaFieldState> {
    return this.#uploadFiles([file]);
  }

  #assertMutable(): void {
    if (this.#readOnly) throw new Error('Dynamic and read-only media fields cannot be mutated.');
  }

  async #acceptCompletedUpload(session: MediaUploadSession): Promise<void> {
    if (session.state !== 'complete' || session.asset === undefined) return;
    const asset = await this.#provider.get(session.asset.id);
    if (asset === null) {
      this.#value = {
        accessibility: { altText: session.request.filename, mode: 'informative' },
        assetId: session.asset.id,
        assetRevision: session.asset.revision,
        contractVersion: STUDIO_CONTRACT_VERSION,
        kind: 'media-reference',
        usage: this.#usage,
      };
      this.#asset = undefined;
      this.#status = 'orphaned';
      this.#emit(true);
      return;
    }
    this.select(asset);
  }

  #emit(changed: boolean): void {
    const state = this.state;
    if (changed) this.#onChange?.(state);
    for (const listener of this.#listeners) listener(state);
  }

  #requireValue(): MediaReference {
    if (this.#value === undefined) throw new Error('Select media before editing its usage.');
    return this.#value;
  }

  async #uploadFiles(files: readonly File[]): Promise<StudioMediaFieldState> {
    this.#assertMutable();
    const file = files[0];
    if (file === undefined) return this.state;
    if (this.#mediaTypes !== undefined && !this.#mediaTypes.includes(file.type)) {
      throw new TypeError(`Media type "${file.type}" is not accepted by this field.`);
    }
    this.#status = 'uploading';
    this.#emit(false);
    if (this.#upload === undefined) {
      const asset = await this.#provider.upload({ alt: file.name, file });
      this.select(asset);
      return this.state;
    }
    const result = await this.#upload.upload(file, {
      filename: file.name,
      mediaType: file.type || 'application/octet-stream',
      purpose: this.#usage,
    });
    await this.#acceptCompletedUpload(result);
    return this.state;
  }
}

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) throw new TypeError('Focal coordinates must be finite numbers.');
  return Math.max(0, Math.min(1, value));
}
