import { describe, expect, it } from 'vitest';
import type {
  MediaAsset,
  MediaPage,
  MediaQuery,
  MediaUploadAcceptedAsset,
  MediaUploadPlan,
} from '@kumwe/studio-protocol';
import {
  StudioMediaFieldController,
  type MediaProvider,
  type MediaUploadTransport,
} from '../src/index.js';

const ASSET: MediaAsset = {
  byteSize: 1_024,
  contractVersion: '0.1-draft',
  filename: 'windhoek.jpg',
  id: 'media-1',
  kind: 'media-asset',
  mediaKind: 'image',
  mediaType: 'image/jpeg',
  metadata: { altText: 'Windhoek skyline', caption: 'Namibia' },
  revision: 'media-r1',
  state: 'ready',
};

class Provider implements MediaProvider {
  public asset: MediaAsset | null = ASSET;
  public readonly queries: MediaQuery[] = [];
  public uploads = 0;

  public get(): Promise<MediaAsset | null> {
    return Promise.resolve(this.asset);
  }

  public list(query: MediaQuery): Promise<MediaPage> {
    this.queries.push(structuredClone(query));
    return Promise.resolve({ assets: this.asset === null ? [] : [this.asset] });
  }

  public upload(): Promise<MediaAsset> {
    this.uploads += 1;
    if (this.asset === null) throw new Error('No test asset.');
    return Promise.resolve(this.asset);
  }
}

class UploadTransport implements MediaUploadTransport {
  public abort(): Promise<void> {
    return Promise.resolve();
  }

  public authorize(): Promise<MediaUploadPlan> {
    return Promise.resolve({ chunkBytes: 2, maximumBytes: 1_000, resumable: true });
  }

  public finalize(): Promise<MediaUploadAcceptedAsset> {
    return Promise.resolve({ id: ASSET.id, revision: ASSET.revision, state: 'ready' });
  }

  public transfer(): Promise<void> {
    return Promise.resolve();
  }
}

describe('StudioMediaFieldController', () => {
  it('browses/searches through the host and stores only a stable canonical reference', async () => {
    const provider = new Provider();
    const changes: unknown[] = [];
    const field = new StudioMediaFieldController({
      mediaTypes: ['image/jpeg'],
      onChange: (state) => changes.push(state.value),
      provider,
      usage: 'studio.media/hero',
    });

    await field.search(' skyline ');
    field.select(ASSET);

    expect(provider.queries).toEqual([
      { limit: 40, mediaTypes: ['image/jpeg'], search: 'skyline' },
    ]);
    expect(field.state.value).toEqual({
      accessibility: {
        altText: 'Windhoek skyline',
        caption: 'Namibia',
        mode: 'informative',
      },
      assetId: 'media-1',
      assetRevision: 'media-r1',
      contractVersion: '0.1-draft',
      kind: 'media-reference',
      usage: 'studio.media/hero',
    });
    expect(JSON.stringify(changes)).not.toMatch(/byteSize|filename|renditions|url/u);
    field.dispose();
  });

  it('authors usage-specific accessibility, focal point and rendition intent', () => {
    const field = new StudioMediaFieldController({
      provider: new Provider(),
      usage: 'studio.media/card',
    });
    field.select(ASSET);
    field.setAltText('A city skyline');
    field.setCaption('At sunset');
    field.setFocalPoint({ x: 1.4, y: -0.5 });
    field.setRenditionIntent({ fit: 'cover', role: 'card' });

    expect(field.state.value).toMatchObject({
      accessibility: { altText: 'A city skyline', caption: 'At sunset', mode: 'informative' },
      focalPoint: { x: 1, y: 0 },
      renditionIntent: { fit: 'cover', role: 'card' },
    });

    field.setDecorative(true);
    expect(field.state.value?.accessibility).toEqual({ mode: 'decorative' });
    field.dispose();
  });

  it('keeps every non-static binding read-only', () => {
    const field = new StudioMediaFieldController({
      binding: {
        onError: 'error',
        onNull: 'empty',
        source: { id: 'product-image', kind: 'resource-reference', resourceType: 'app/product' },
        transforms: [],
      },
      provider: new Provider(),
      usage: 'studio.media/product',
    });

    expect(field.state.readOnly).toBe(true);
    expect(() => field.select(ASSET)).toThrow(/cannot be mutated/u);
    field.dispose();
  });

  it('reports an orphan without deleting the stable reference', async () => {
    const provider = new Provider();
    provider.asset = null;
    const value = {
      accessibility: { altText: 'Historical image', mode: 'informative' as const },
      assetId: 'missing-1',
      contractVersion: '0.1-draft' as const,
      kind: 'media-reference' as const,
      usage: 'studio.media/archive' as const,
    };
    const field = new StudioMediaFieldController({ provider, usage: value.usage, value });

    await field.resolve();

    expect(field.state.status).toBe('orphaned');
    expect(field.state.value).toEqual(value);
    field.dispose();
  });

  it('integrates host-authorized upload progress and selects the accepted asset', async () => {
    const provider = new Provider();
    const field = new StudioMediaFieldController({
      provider,
      uploadTransport: new UploadTransport(),
      usage: 'studio.media/upload',
    });
    const file = new File([new Uint8Array([1, 2, 3, 4, 5])], 'windhoek.jpg', {
      type: 'image/jpeg',
    });

    await field.upload(file);

    expect(field.state.status).toBe('ready');
    expect(field.state.upload).toMatchObject({
      progress: { totalBytes: 5, transferredBytes: 5 },
      state: 'complete',
    });
    expect(field.state.value?.assetId).toBe('media-1');
    field.dispose();
  });
});
