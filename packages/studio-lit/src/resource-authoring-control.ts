import type {
  FieldBinding,
  MessageReference,
  QualifiedName,
  ResourceReferenceBindingSource,
  ResourceSearchHit,
  ResourceSearchPage,
  ResourceSearchQuery,
} from '@kumwe/studio-protocol';

const SEARCH_DELAY_MILLISECONDS = 300;
const SEARCH_LIMIT = 20;

export interface StudioResourceTypeOption {
  id: QualifiedName;
  label: MessageReference;
}

/**
 * Host-neutral, read-only resource discovery. A host-session handle or any
 * other transport adapts to this seam without exposing its authority model to
 * the Studio element.
 */
export interface StudioResourceSearchService {
  readonly resourceTypes: readonly StudioResourceTypeOption[];
  search(query: Readonly<ResourceSearchQuery>, signal: AbortSignal): Promise<ResourceSearchPage>;
}

export interface StudioResourceBindingChange {
  source?: ResourceReferenceBindingSource;
}

export interface StudioResourceBindingControlOptions {
  binding?: FieldBinding;
  holder: HTMLElement;
  label: string;
  multiple: boolean;
  onChange?: (change: StudioResourceBindingChange) => void;
  readOnly: boolean;
  service: StudioResourceSearchService;
}

export interface StudioResourceBindingControlHandle {
  current(): ResourceReferenceBindingSource | undefined;
  destroy(): void;
  focus(): void;
  readonly readOnly: boolean;
}

/** Mount Studio's accessible resource browser and optional canonical picker. */
export function mountStudioResourceBindingControl(
  options: StudioResourceBindingControlOptions,
): StudioResourceBindingControlHandle {
  return new StudioResourceBindingControl(options);
}

/** Runtime guard for the only binding source this picker may persist. */
export function isStudioResourceReference(value: unknown): value is ResourceReferenceBindingSource {
  if (!isRecord(value) || !hasOnly(value, ['id', 'kind', 'resourceType'])) return false;
  return (
    value.kind === 'resource-reference' &&
    isStableId(value.id) &&
    isQualifiedName(value.resourceType)
  );
}

class StudioResourceBindingControl implements StudioResourceBindingControlHandle {
  readonly #cancel: HTMLButtonElement;
  readonly #clear: HTMLButtonElement;
  readonly #currentRegion: HTMLElement;
  readonly #holder: HTMLElement;
  readonly #loadMore: HTMLButtonElement;
  readonly #onChange: StudioResourceBindingControlOptions['onChange'];
  readonly #results: HTMLUListElement;
  readonly #retry: HTMLButtonElement;
  readonly #search: HTMLInputElement;
  readonly #searchButton: HTMLButtonElement;
  readonly #service: StudioResourceSearchService;
  readonly #status: HTMLElement;
  readonly #type: HTMLSelectElement;
  readonly #types: readonly StudioResourceTypeOption[];
  public readonly readOnly: boolean;
  #abort: AbortController | undefined;
  #current: ResourceReferenceBindingSource | undefined;
  #debounce: ReturnType<typeof setTimeout> | undefined;
  #destroyed = false;
  #items: ResourceSearchHit[] = [];
  #nextCursor: string | undefined;
  #requestSequence = 0;
  #retryQuery: ResourceSearchQuery | undefined;

  public constructor(options: StudioResourceBindingControlOptions) {
    this.readOnly = options.readOnly || nonResourceBinding(options.binding);
    this.#current = resourceSource(options.binding);
    this.#holder = document.createElement('section');
    this.#holder.className = 'studio-resource-binding-control';
    this.#holder.setAttribute('aria-label', `Resource browser for ${options.label}`);
    this.#onChange = options.onChange;
    this.#service = options.service;
    this.#types = parseResourceTypes(options.service.resourceTypes);

    this.#currentRegion = document.createElement('p');
    this.#currentRegion.className = 'studio-resource-current';
    this.#currentRegion.setAttribute('aria-live', 'polite');

    this.#type = document.createElement('select');
    this.#type.setAttribute('aria-label', 'Resource type');
    for (const type of this.#types) {
      const choice = document.createElement('option');
      choice.value = type.id;
      choice.textContent = messageText(type.label);
      choice.selected = type.id === this.#current?.resourceType;
      this.#type.append(choice);
    }
    this.#type.disabled = this.#types.length === 0;
    this.#type.addEventListener('change', () => this.#resetSearch());

    this.#search = document.createElement('input');
    this.#search.type = 'search';
    this.#search.maxLength = 160;
    this.#search.setAttribute('aria-label', 'Search authorized resources');
    this.#search.disabled = this.#types.length === 0;
    this.#search.addEventListener('input', () => this.#scheduleSearch());
    this.#search.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        void this.#runSearch(undefined, false);
      }
    });

    this.#searchButton = actionButton('Search resources', () => {
      void this.#runSearch(undefined, false);
    });
    this.#searchButton.disabled = this.#types.length === 0;
    this.#cancel = actionButton('Cancel resource search', () => this.#cancelSearch(true));
    this.#cancel.hidden = true;
    this.#retry = actionButton('Retry resource search', () => {
      const query = this.#retryQuery;
      if (query !== undefined) void this.#runSearch(query.cursor, query.cursor !== undefined);
    });
    this.#retry.hidden = true;
    this.#clear = actionButton('Clear selected resource', () => this.#clearSelection());
    this.#clear.disabled = this.readOnly || this.#current === undefined;

    this.#status = document.createElement('p');
    this.#status.className = 'studio-resource-status';
    this.#status.setAttribute('aria-live', 'polite');
    this.#status.textContent =
      this.#types.length === 0
        ? 'No authorized resource types are available.'
        : 'Enter a search term or browse all authorized resources.';

    this.#results = document.createElement('ul');
    this.#results.className = 'studio-resource-results';
    this.#results.setAttribute('aria-label', 'Authorized resource results');
    this.#loadMore = actionButton('Load more resources', () => {
      if (this.#nextCursor !== undefined) void this.#runSearch(this.#nextCursor, true);
    });
    this.#loadMore.hidden = true;

    const searchGroup = document.createElement('div');
    searchGroup.className = 'studio-resource-search';
    searchGroup.append(this.#type, this.#search, this.#searchButton, this.#cancel, this.#retry);
    this.#holder.append(
      this.#currentRegion,
      searchGroup,
      this.#status,
      this.#results,
      this.#loadMore,
      this.#clear,
    );
    options.holder.append(this.#holder);
    this.#renderCurrent(options.binding, options.multiple);
  }

  public current(): ResourceReferenceBindingSource | undefined {
    return this.#current === undefined ? undefined : structuredClone(this.#current);
  }

  public destroy(): void {
    this.#destroyed = true;
    this.#cancelSearch(false);
    this.#holder.remove();
  }

  public focus(): void {
    this.#search.focus();
  }

  #cancelSearch(announce: boolean): void {
    if (this.#debounce !== undefined) {
      clearTimeout(this.#debounce);
      this.#debounce = undefined;
    }
    this.#abort?.abort();
    this.#abort = undefined;
    this.#requestSequence += 1;
    this.#setBusy(false);
    if (announce && !this.#destroyed) this.#status.textContent = 'Resource search cancelled.';
  }

  #clearSelection(): void {
    if (this.readOnly || this.#current === undefined) return;
    this.#current = undefined;
    this.#clear.disabled = true;
    this.#currentRegion.textContent = 'No resource selected.';
    this.#onChange?.({});
  }

  #renderCurrent(binding: FieldBinding | undefined, multiple: boolean): void {
    if (this.#current !== undefined) {
      this.#currentRegion.textContent = `Selected ${this.#current.resourceType}: ${this.#current.id}.`;
    } else if (binding !== undefined) {
      this.#currentRegion.textContent = `This ${binding.source.kind} binding is host-managed.`;
    } else {
      this.#currentRegion.textContent = 'No resource selected.';
    }
    if (this.readOnly) {
      this.#currentRegion.append(
        document.createTextNode(
          ` Selection is read-only${multiple ? ' for this collection port' : ''}.`,
        ),
      );
    }
  }

  #renderResults(): void {
    const rows = this.#items.map((hit) => {
      const row = document.createElement('li');
      const label = messageText(hit.label);
      const summary = document.createElement('span');
      summary.textContent = `${label} (${hit.id})`;
      row.append(summary);
      if (!this.readOnly) {
        row.append(
          actionButton(
            this.#current?.id === hit.id && this.#current.resourceType === hit.resourceType
              ? `Selected ${label}`
              : this.#current === undefined
                ? `Select ${label}`
                : `Replace with ${label}`,
            () => this.#select(hit),
            this.#current?.id === hit.id && this.#current.resourceType === hit.resourceType,
          ),
        );
      }
      return row;
    });
    this.#results.replaceChildren(...rows);
    this.#loadMore.hidden = this.#nextCursor === undefined;
  }

  #resetSearch(): void {
    this.#cancelSearch(false);
    this.#items = [];
    this.#nextCursor = undefined;
    this.#retryQuery = undefined;
    this.#renderResults();
    this.#status.textContent = 'Enter a search term or browse all authorized resources.';
  }

  async #runSearch(cursor: string | undefined, append: boolean): Promise<void> {
    if (this.#destroyed || this.#type.value === '') return;
    this.#cancelSearch(false);
    const controller = new AbortController();
    this.#abort = controller;
    const sequence = ++this.#requestSequence;
    const query: ResourceSearchQuery = {
      ...(cursor === undefined ? {} : { cursor }),
      limit: SEARCH_LIMIT,
      resourceType: this.#type.value as QualifiedName,
      ...(this.#search.value === '' ? {} : { search: this.#search.value }),
    };
    Object.freeze(query);
    this.#retryQuery = query;
    this.#retry.hidden = true;
    this.#status.textContent = append ? 'Loading more authorized resources…' : 'Searching…';
    this.#setBusy(true);
    try {
      const page = parseStudioResourceSearchPage(
        await this.#service.search(query, controller.signal),
        query,
      );
      if (controller.signal.aborted || this.#destroyed || sequence !== this.#requestSequence)
        return;
      this.#items = append ? appendPage(this.#items, page.items) : page.items;
      this.#nextCursor = page.nextCursor;
      this.#retryQuery = undefined;
      this.#renderResults();
      this.#status.textContent =
        this.#items.length === 0
          ? 'No authorized resources match this search.'
          : `${this.#items.length} authorized resource${this.#items.length === 1 ? '' : 's'} shown.`;
    } catch {
      if (controller.signal.aborted || this.#destroyed || sequence !== this.#requestSequence)
        return;
      this.#retry.hidden = false;
      this.#status.textContent = 'Resource search is unavailable. No selection was changed.';
    } finally {
      if (sequence === this.#requestSequence) {
        this.#abort = undefined;
        this.#setBusy(false);
      }
    }
  }

  #scheduleSearch(): void {
    if (this.#debounce !== undefined) clearTimeout(this.#debounce);
    this.#debounce = setTimeout(() => {
      this.#debounce = undefined;
      void this.#runSearch(undefined, false);
    }, SEARCH_DELAY_MILLISECONDS);
  }

  #select(hit: ResourceSearchHit): void {
    if (this.readOnly) return;
    this.#current = {
      id: hit.id,
      kind: 'resource-reference',
      resourceType: hit.resourceType,
    };
    this.#clear.disabled = false;
    this.#currentRegion.textContent = `Selected ${hit.resourceType}: ${hit.id}.`;
    this.#renderResults();
    this.#onChange?.({ source: structuredClone(this.#current) });
  }

  #setBusy(busy: boolean): void {
    this.#cancel.hidden = !busy;
    this.#searchButton.disabled = this.#types.length === 0;
    this.#type.disabled = this.#types.length === 0;
    this.#search.disabled = this.#types.length === 0;
    this.#loadMore.disabled = busy;
    this.#results.setAttribute('aria-busy', String(busy));
  }
}

function actionButton(label: string, action: () => void, disabled = false): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.setAttribute('aria-label', label);
  button.disabled = disabled;
  button.addEventListener('click', action);
  return button;
}

function appendPage(
  current: readonly ResourceSearchHit[],
  next: readonly ResourceSearchHit[],
): ResourceSearchHit[] {
  const seen = new Set(current.map((hit) => `${hit.resourceType}\u0000${hit.id}`));
  for (const hit of next) {
    const key = `${hit.resourceType}\u0000${hit.id}`;
    if (seen.has(key)) throw new TypeError('Resource search repeated an existing item.');
    seen.add(key);
  }
  return [...current, ...next];
}

function messageText(message: MessageReference): string {
  return message.defaultMessage ?? message.key;
}

function nonResourceBinding(binding: FieldBinding | undefined): boolean {
  return binding !== undefined && binding.source.kind !== 'resource-reference';
}

/** Validate and detach one host resource page before it enters a control. */
export function parseStudioResourceSearchPage(
  page: ResourceSearchPage,
  query: Readonly<ResourceSearchQuery>,
): ResourceSearchPage {
  if (!isRecord(page) || !hasOnly(page, ['items', 'nextCursor']) || !Array.isArray(page.items)) {
    throw new TypeError('Resource search returned an invalid page.');
  }
  if (page.items.length > query.limit) {
    throw new RangeError('Resource search returned too many items.');
  }
  const items = page.items.map((hit) => parseResourceHit(hit, query.resourceType));
  const identities = new Set(items.map((hit) => `${hit.resourceType}\u0000${hit.id}`));
  if (identities.size !== items.length) {
    throw new TypeError('Resource search returned duplicate items.');
  }
  const nextCursor = page.nextCursor;
  if (
    nextCursor !== undefined &&
    (typeof nextCursor !== 'string' || nextCursor.length === 0 || nextCursor.length > 500)
  ) {
    throw new TypeError('Resource search returned an invalid cursor.');
  }
  return {
    items,
    ...(nextCursor === undefined ? {} : { nextCursor }),
  };
}

function parseResourceHit(hit: unknown, resourceType: QualifiedName): ResourceSearchHit {
  if (
    !isRecord(hit) ||
    !hasOnly(hit, ['id', 'label', 'resourceType']) ||
    !isStableId(hit.id) ||
    hit.resourceType !== resourceType ||
    !isMessageReference(hit.label)
  ) {
    throw new TypeError('Resource search returned an invalid item.');
  }
  return {
    id: hit.id,
    label: structuredClone(hit.label),
    resourceType,
  };
}

function parseResourceTypes(
  options: readonly StudioResourceTypeOption[],
): readonly StudioResourceTypeOption[] {
  if (options.length > 100) throw new RangeError('Resource type inventory exceeds 100 entries.');
  const seen = new Set<string>();
  return options.map((option) => {
    if (
      !isRecord(option) ||
      !hasOnly(option, ['id', 'label']) ||
      !isQualifiedName(option.id) ||
      !isMessageReference(option.label) ||
      seen.has(option.id)
    ) {
      throw new TypeError('Resource type inventory is invalid or duplicated.');
    }
    seen.add(option.id);
    return structuredClone(option);
  });
}

function resourceSource(
  binding: FieldBinding | undefined,
): ResourceReferenceBindingSource | undefined {
  if (binding?.source.kind !== 'resource-reference') return undefined;
  if (!isStudioResourceReference(binding.source)) {
    throw new TypeError('Resource binding is not canonical.');
  }
  return structuredClone(binding.source);
}

function hasOnly(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length <= allowed.length && keys.every((key) => allowed.includes(key));
}

function isMessageReference(value: unknown): value is MessageReference {
  if (
    !isRecord(value) ||
    !hasOnly(value, ['key', 'defaultMessage']) ||
    !isQualifiedName(value.key)
  ) {
    return false;
  }
  return (
    value.defaultMessage === undefined ||
    (typeof value.defaultMessage === 'string' &&
      value.defaultMessage.length >= 1 &&
      value.defaultMessage.length <= 500)
  );
}

function isQualifiedName(value: unknown): value is QualifiedName {
  return (
    typeof value === 'string' &&
    value.length <= 160 &&
    /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*\/[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/u.test(value)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

function isStableId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= 240 &&
    !['__proto__', 'prototype', 'constructor'].includes(value) &&
    /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/u.test(value)
  );
}
