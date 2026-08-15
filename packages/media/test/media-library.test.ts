import { describe, expect, it } from 'vitest';
import type { MediaAsset, MediaPage } from '@kumwe/studio-protocol';
import { MediaLibrary, selectBestRendition, type MediaProvider } from '../src/index.js';

const asset: MediaAsset = {
  byteSize: 450_000,
  contractVersion: '0.1-draft',
  filename: 'windhoek-skyline.jpg',
  id: 'asset-1',
  kind: 'media-asset',
  mediaKind: 'image',
  mediaType: 'image/jpeg',
  metadata: { altText: 'Windhoek skyline' },
  renditions: [
    { height: 400, id: 'small', mediaType: 'image/jpeg', width: 400 },
    { height: 800, id: 'medium', mediaType: 'image/jpeg', width: 800 },
  ],
  revision: 'asset-r1',
  state: 'ready',
};

class Provider implements MediaProvider {
  public get(): Promise<MediaAsset | null> {
    return Promise.resolve(asset);
  }

  public list(): Promise<MediaPage> {
    return Promise.resolve({ assets: [asset] });
  }

  public upload(): Promise<MediaAsset> {
    return Promise.resolve(asset);
  }
}

describe('MediaLibrary', () => {
  it('loads assets through a host provider', async () => {
    const library = new MediaLibrary(new Provider());
    await expect(library.search({ limit: 25, search: 'skyline' })).resolves.toEqual(
      expect.objectContaining({ assets: [asset], status: 'ready' }),
    );
    library.dispose();
  });

  it('chooses the smallest rendition at or above the target width', () => {
    expect(selectBestRendition(asset, 500)?.width).toBe(800);
    expect(selectBestRendition(asset, 1_000)?.width).toBe(800);
  });

  it('does not expose provider exception details through observable state', async () => {
    const secret = 'Bearer secret-token from /srv/private/media'; // studio-secret-scan:allow
    const provider = new Provider();
    provider.list = (): Promise<MediaPage> => Promise.reject(new Error(secret));
    const library = new MediaLibrary(provider);

    const state = await library.search({ limit: 25 });

    expect(state.status).toBe('error');
    expect(state.error).toEqual({
      defaultMessage: 'The media library could not be loaded.',
      key: 'studio.media/provider-failed',
    });
    expect(JSON.stringify(state)).not.toContain(secret);
    library.dispose();
  });
});
