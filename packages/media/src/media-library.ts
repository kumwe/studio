import type {
  MediaAsset,
  MediaPage,
  MediaQuery,
  MediaRendition,
  MessageReference,
} from '@kumwe/studio-protocol';

export const MEDIA_PROVIDER_FAILURE: Readonly<MessageReference> = Object.freeze({
  defaultMessage: 'The media library could not be loaded.',
  key: 'studio.media/provider-failed',
});

export interface MediaUploadRequest {
  alt?: string;
  file: Blob;
  signal?: AbortSignal;
}

export interface MediaProvider {
  get(assetId: string, signal?: AbortSignal): Promise<MediaAsset | null>;
  list(query: MediaQuery, signal?: AbortSignal): Promise<MediaPage>;
  upload(request: MediaUploadRequest): Promise<MediaAsset>;
}

export type MediaLibraryStatus = 'error' | 'idle' | 'loading' | 'ready';

export interface MediaLibraryState {
  assets: MediaAsset[];
  error?: MessageReference;
  nextCursor?: string;
  query?: MediaQuery;
  status: MediaLibraryStatus;
}

export type MediaLibraryListener = (state: MediaLibraryState) => void;

export class MediaLibrary {
  readonly #listeners = new Set<MediaLibraryListener>();
  readonly #provider: MediaProvider;
  #abortController?: AbortController;
  #state: MediaLibraryState = { assets: [], status: 'idle' };

  public constructor(provider: MediaProvider) {
    this.#provider = provider;
  }

  public get state(): MediaLibraryState {
    return structuredClone(this.#state);
  }

  public dispose(): void {
    this.#abortController?.abort();
    this.#listeners.clear();
  }

  public async loadNext(): Promise<MediaLibraryState> {
    if (this.#state.query === undefined || this.#state.nextCursor === undefined) {
      return this.state;
    }

    return this.#load({ ...this.#state.query, cursor: this.#state.nextCursor }, [
      ...this.#state.assets,
    ]);
  }

  public async search(query: MediaQuery): Promise<MediaLibraryState> {
    const normalized: MediaQuery = {
      limit: Math.max(1, Math.min(100, Math.trunc(query.limit))),
    };
    if (query.mediaTypes !== undefined) {
      normalized.mediaTypes = [...query.mediaTypes];
    }
    if (query.search !== undefined) {
      normalized.search = query.search;
    }
    return this.#load(normalized, []);
  }

  public subscribe(listener: MediaLibraryListener): () => void {
    this.#listeners.add(listener);
    listener(this.state);
    return (): void => {
      this.#listeners.delete(listener);
    };
  }

  async #load(query: MediaQuery, existing: MediaAsset[]): Promise<MediaLibraryState> {
    this.#abortController?.abort();
    const controller = new AbortController();
    this.#abortController = controller;
    this.#setState({ assets: existing, query, status: 'loading' });

    try {
      const page: MediaPage = await this.#provider.list(query, controller.signal);
      if (controller.signal.aborted) {
        return this.state;
      }
      const next: MediaLibraryState = {
        assets: [...existing, ...page.assets],
        query,
        status: 'ready',
      };
      if (page.nextCursor !== undefined) {
        next.nextCursor = page.nextCursor;
      }
      this.#setState(next);
    } catch {
      if (!controller.signal.aborted) {
        this.#setState({
          assets: existing,
          error: { ...MEDIA_PROVIDER_FAILURE },
          query,
          status: 'error',
        });
      }
    }
    return this.state;
  }

  #setState(state: MediaLibraryState): void {
    this.#state = state;
    for (const listener of this.#listeners) {
      listener(this.state);
    }
  }
}

export function selectBestRendition(
  asset: MediaAsset,
  targetWidth: number,
): MediaRendition | undefined {
  if (asset.renditions === undefined || asset.renditions.length === 0) {
    return undefined;
  }
  const ordered = [...asset.renditions].sort((left, right) => left.width - right.width);
  return ordered.find((rendition) => rendition.width >= targetWidth) ?? ordered.at(-1);
}
