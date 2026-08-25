import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FieldBinding, ResourceSearchPage, ResourceSearchQuery } from '@kumwe/studio-protocol';
import {
  mountStudioResourceBindingControl,
  type StudioResourceBindingChange,
  type StudioResourceSearchService,
} from '../src/index.js';

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

function holder(): HTMLDivElement {
  const element = document.createElement('div');
  document.body.append(element);
  return element;
}

function service(search: StudioResourceSearchService['search']): StudioResourceSearchService {
  return {
    resourceTypes: [
      {
        id: 'kumwe.app/content-entry',
        label: { defaultMessage: 'Content entries', key: 'kumwe.app/content-entries' },
      },
    ],
    search,
  };
}

describe('Studio resource binding control', () => {
  it('searches explicit pages and emits only canonical resource-reference selections', async () => {
    const queries: ResourceSearchQuery[] = [];
    const changes: StudioResourceBindingChange[] = [];
    const resourceService = service((query): Promise<ResourceSearchPage> => {
      queries.push(structuredClone(query));
      return Promise.resolve(
        query.cursor === undefined
          ? {
              items: [
                {
                  id: 'content-entry:first',
                  label: { defaultMessage: 'First article', key: 'kumwe.app/resource-label' },
                  resourceType: 'kumwe.app/content-entry',
                },
              ],
              nextCursor: 'page-two',
            }
          : {
              items: [
                {
                  id: 'content-entry:second',
                  label: { defaultMessage: 'Second article', key: 'kumwe.app/resource-label' },
                  resourceType: 'kumwe.app/content-entry',
                },
              ],
            },
      );
    });
    const root = holder();
    const control = mountStudioResourceBindingControl({
      holder: root,
      label: 'Content item',
      multiple: false,
      onChange: (change) => changes.push(change),
      readOnly: false,
      service: resourceService,
    });

    root.querySelector<HTMLButtonElement>('[aria-label="Search resources"]')?.click();
    await vi.waitFor(() => expect(root.textContent).toContain('1 authorized resource shown.'));
    root.querySelector<HTMLButtonElement>('[aria-label="Select First article"]')?.click();
    expect(control.current()).toEqual({
      id: 'content-entry:first',
      kind: 'resource-reference',
      resourceType: 'kumwe.app/content-entry',
    });
    expect(changes).toEqual([{ source: control.current() }]);

    root.querySelector<HTMLButtonElement>('[aria-label="Load more resources"]')?.click();
    await vi.waitFor(() => expect(root.textContent).toContain('2 authorized resources shown.'));
    expect(queries).toEqual([
      { limit: 20, resourceType: 'kumwe.app/content-entry' },
      { cursor: 'page-two', limit: 20, resourceType: 'kumwe.app/content-entry' },
    ]);
    root.querySelector<HTMLButtonElement>('[aria-label="Replace with Second article"]')?.click();
    expect(control.current()?.id).toBe('content-entry:second');

    root.querySelector<HTMLButtonElement>('[aria-label="Clear selected resource"]')?.click();
    expect(changes.at(-1)).toEqual({});
    expect(control.current()).toBeUndefined();
    control.destroy();
  });

  it('debounces input and cancels an in-flight search without accepting stale results', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    let settle: ((page: ResourceSearchPage) => void) | undefined;
    const root = holder();
    mountStudioResourceBindingControl({
      holder: root,
      label: 'Content item',
      multiple: false,
      readOnly: false,
      service: service((_query, currentSignal) => {
        signal = currentSignal;
        return new Promise<ResourceSearchPage>((resolve) => {
          settle = resolve;
        });
      }),
    });
    const search = root.querySelector<HTMLInputElement>(
      '[aria-label="Search authorized resources"]',
    );
    if (search === null) throw new Error('Missing resource search input.');
    search.value = 'article';
    search.dispatchEvent(new InputEvent('input', { bubbles: true }));

    await vi.advanceTimersByTimeAsync(299);
    expect(signal).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    expect(signal?.aborted).toBe(false);
    root.querySelector<HTMLButtonElement>('[aria-label="Cancel resource search"]')?.click();
    expect(signal?.aborted).toBe(true);
    settle?.({
      items: [
        {
          id: 'content-entry:stale',
          label: { defaultMessage: 'Stale article', key: 'kumwe.app/resource-label' },
          resourceType: 'kumwe.app/content-entry',
        },
      ],
    });
    await Promise.resolve();
    expect(root.textContent).toContain('Resource search cancelled.');
    expect(root.textContent).not.toContain('Stale article');
  });

  it('keeps first-party and non-resource dynamic bindings inspect-only while browsing', async () => {
    const dynamic: FieldBinding = {
      onError: 'error',
      onNull: 'empty',
      source: {
        kind: 'query-reference',
        parameters: {},
        query: 'kumwe.app/recent-content',
        version: '1.0.0',
      },
      transforms: [],
    };
    const changes: StudioResourceBindingChange[] = [];
    const root = holder();
    const control = mountStudioResourceBindingControl({
      binding: dynamic,
      holder: root,
      label: 'Content collection',
      multiple: true,
      onChange: (change) => changes.push(change),
      readOnly: false,
      service: service(() =>
        Promise.resolve({
          items: [
            {
              id: 'content-entry:visible',
              label: { defaultMessage: 'Visible article', key: 'kumwe.app/resource-label' },
              resourceType: 'kumwe.app/content-entry',
            },
          ],
        }),
      ),
    });

    expect(control.readOnly).toBe(true);
    expect(root.textContent).toContain('query-reference binding is host-managed');
    expect(root.textContent).toContain('Selection is read-only for this collection port');
    root.querySelector<HTMLButtonElement>('[aria-label="Search resources"]')?.click();
    await vi.waitFor(() => expect(root.textContent).toContain('Visible article'));
    expect(root.querySelector('[aria-label="Select Visible article"]')).toBeNull();
    expect(changes).toEqual([]);
  });

  it('announces empty and recoverable error states without disclosing adapter errors', async () => {
    let attempts = 0;
    const root = holder();
    mountStudioResourceBindingControl({
      holder: root,
      label: 'Content item',
      multiple: false,
      readOnly: false,
      service: service(() => {
        attempts += 1;
        return attempts === 1
          ? Promise.reject(new Error('private transport details'))
          : Promise.resolve({ items: [] });
      }),
    });

    root.querySelector<HTMLButtonElement>('[aria-label="Search resources"]')?.click();
    await vi.waitFor(() => expect(root.textContent).toContain('Resource search is unavailable.'));
    expect(root.textContent).not.toContain('private transport details');
    root.querySelector<HTMLButtonElement>('[aria-label="Retry resource search"]')?.click();
    await vi.waitFor(() =>
      expect(root.textContent).toContain('No authorized resources match this search.'),
    );
    expect(attempts).toBe(2);
  });

  it('rejects duplicate or cross-type host results before rendering them', async () => {
    const root = holder();
    mountStudioResourceBindingControl({
      holder: root,
      label: 'Content item',
      multiple: false,
      readOnly: false,
      service: service(() =>
        Promise.resolve({
          items: [
            {
              id: 'content-entry:duplicate',
              label: { defaultMessage: 'Duplicate', key: 'kumwe.app/resource-label' },
              resourceType: 'kumwe.app/content-entry',
            },
            {
              id: 'content-entry:duplicate',
              label: { defaultMessage: 'Duplicate again', key: 'kumwe.app/resource-label' },
              resourceType: 'kumwe.app/content-entry',
            },
          ],
        }),
      ),
    });

    root.querySelector<HTMLButtonElement>('[aria-label="Search resources"]')?.click();
    await vi.waitFor(() => expect(root.textContent).toContain('Resource search is unavailable.'));
    expect(root.textContent).not.toContain('Duplicate again');
    expect(root.querySelector('[aria-label="Select Duplicate"]')).toBeNull();
  });
});
