import { describe, expect, it } from 'vitest';
import type { MediaProvider } from '@kumwe/studio-media';
import type { MediaAsset, MediaPage, MediaQuery, MediaReference } from '@kumwe/studio-protocol';
import { StudioAuthoringControlRegistry } from '../src/index.js';

const FIRST_ASSET: MediaAsset = {
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

const SECOND_ASSET: MediaAsset = {
  ...FIRST_ASSET,
  filename: 'swakopmund.jpg',
  id: 'media-2',
  metadata: { altText: 'Atlantic coast' },
  revision: 'media-r2',
};

class Provider implements MediaProvider {
  public readonly queries: MediaQuery[] = [];
  public missing = false;

  public get(assetId: string): Promise<MediaAsset | null> {
    if (this.missing) return Promise.resolve(null);
    return Promise.resolve(assetId === SECOND_ASSET.id ? SECOND_ASSET : FIRST_ASSET);
  }

  public list(query: MediaQuery): Promise<MediaPage> {
    this.queries.push(structuredClone(query));
    return Promise.resolve({ assets: [FIRST_ASSET, SECOND_ASSET] });
  }

  public upload(): Promise<MediaAsset> {
    return Promise.resolve(FIRST_ASSET);
  }
}

function root(): HTMLDivElement {
  const element = document.createElement('div');
  document.body.append(element);
  return element;
}

function reference(asset: MediaAsset): MediaReference {
  return {
    accessibility: { altText: asset.metadata.altText ?? asset.filename, mode: 'informative' },
    assetId: asset.id,
    assetRevision: asset.revision,
    contractVersion: '0.1-draft',
    kind: 'media-reference',
    usage: 'studio.media/gallery',
  };
}

async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('Studio media authoring controls', () => {
  it('browses through the host and keeps only an accessible canonical reference', async () => {
    const provider = new Provider();
    const holder = root();
    const changes: unknown[] = [];
    const control = await new StudioAuthoringControlRegistry({ media: { provider } }).mount(
      'studio.control/media-reference',
      {
        holder,
        mediaTypes: ['image/jpeg'],
        onChange: (change) => changes.push(change),
        usage: 'studio.media/hero',
        value: undefined,
      },
    );
    await settle();

    holder.querySelector<HTMLButtonElement>('[aria-label="Select windhoek.jpg (image)"]')?.click();
    const alt = holder.querySelector<HTMLInputElement>('[aria-label="Media alternative text"]');
    if (alt === null) throw new Error('Missing media alternative-text control.');
    alt.value = 'City at sunset';
    alt.dispatchEvent(new InputEvent('input', { bubbles: true }));

    expect(control.value()).toMatchObject({
      accessibility: { altText: 'City at sunset', mode: 'informative' },
      assetId: 'media-1',
      kind: 'media-reference',
      usage: 'studio.media/hero',
    });
    expect(JSON.stringify(control.value())).not.toMatch(/byteSize|filename|https?:|renditions/u);
    expect(provider.queries).toEqual([{ limit: 40, mediaTypes: ['image/jpeg'] }]);
    expect(changes).not.toHaveLength(0);
    control.destroy();
    holder.remove();
  });

  it('preserves orphan references and offers an explicit replacement path', async () => {
    const provider = new Provider();
    provider.missing = true;
    const holder = root();
    const stored = reference(FIRST_ASSET);
    const control = await new StudioAuthoringControlRegistry({ media: { provider } }).mount(
      'studio.control/media-reference',
      { holder, value: stored },
    );
    await settle();

    expect(holder.textContent).toContain('Select a replacement');
    expect(holder.querySelector('[aria-label="Replace media"]')).not.toBeNull();
    expect(control.value()).toEqual(stored);
    control.destroy();
    holder.remove();
  });

  it('adds, reorders, describes, and removes carousel media without library state', async () => {
    const provider = new Provider();
    const holder = root();
    const control = await new StudioAuthoringControlRegistry({ media: { provider } }).mount(
      'studio.control/media-collection',
      { holder, value: [reference(FIRST_ASSET), reference(SECOND_ASSET)] },
    );

    holder.querySelector<HTMLButtonElement>('[aria-label="Move media 1 down"]')?.click();
    expect(control.value()).toEqual([reference(SECOND_ASSET), reference(FIRST_ASSET)]);
    const alt = holder.querySelector<HTMLInputElement>('[aria-label="Media 1 alternative text"]');
    if (alt === null) throw new Error('Missing collection alternative-text control.');
    alt.value = 'Coastal city';
    alt.dispatchEvent(new Event('change', { bubbles: true }));
    expect((control.value() as readonly MediaReference[])[0]?.accessibility).toEqual({
      altText: 'Coastal city',
      mode: 'informative',
    });
    holder.querySelector<HTMLButtonElement>('[aria-label="Remove media 2"]')?.click();
    expect(control.value()).toHaveLength(1);
    control.destroy();
    holder.remove();
  });

  it('keeps every media affordance read-only for dynamic bindings', async () => {
    const holder = root();
    const control = await new StudioAuthoringControlRegistry({
      media: { provider: new Provider() },
    }).mount('studio.control/media-reference', {
      binding: {
        onError: 'error',
        onNull: 'empty',
        source: { id: 'product-image', kind: 'resource-reference', resourceType: 'app/product' },
        transforms: [],
      },
      holder,
      value: reference(FIRST_ASSET),
    });
    await settle();

    expect(control.readOnly).toBe(true);
    expect(
      [...holder.querySelectorAll<HTMLInputElement | HTMLButtonElement>('input,button')].every(
        (element) => element.disabled,
      ),
    ).toBe(true);
    control.destroy();
    holder.remove();
  });

  it('requires host-injected media custody services', async () => {
    const holder = root();
    await expect(
      new StudioAuthoringControlRegistry().mount('studio.control/media-reference', {
        holder,
        value: undefined,
      }),
    ).rejects.toThrow(/host-injected media services/u);
    holder.remove();
  });

  it('rejects asset bytes, URLs, and unknown media-reference members', async () => {
    const holder = root();
    await expect(
      new StudioAuthoringControlRegistry({ media: { provider: new Provider() } }).mount(
        'studio.control/media-reference',
        {
          holder,
          value: { ...reference(FIRST_ASSET), url: 'https://assets.invalid/media-1' },
        },
      ),
    ).rejects.toThrow(/unknown member url/u);
    holder.remove();
  });
});
