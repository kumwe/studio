import {
  css,
  html,
  LitElement,
  nothing,
  type CSSResult,
  type PropertyValues,
  type TemplateResult,
} from 'lit';
import type {
  StudioContextualHostSessionHandle,
  StudioContextualPreflightHandle,
} from '@kumwe/studio-core';
import type {
  AuthoringReturnContext,
  AuthoringStartRequest,
  AuthoringStartSource,
  AuthoringTypeListPage,
  AuthoringTypeSummary,
  MessageReference,
  ReusableContentTypeReference,
} from '@kumwe/studio-protocol';
import { messageText } from './messages.js';
import { dispatchStudioContextualReturnRequest } from './hosted-return.js';

const START_REQUEST_EVENT = 'studio-internal-start-request';
const TYPE_SEARCH_EVENT = 'studio-internal-type-search';
const TYPE_MORE_EVENT = 'studio-internal-type-more';

interface HostedStartRequestDetail {
  readonly source: AuthoringStartSource;
}

interface HostedTypeSearchDetail {
  readonly search?: string;
}

/** One accessible, in-context create-source chooser; it never persists or grants authority. */
export class KumweStudioHostedStartElement extends LitElement {
  public static override properties = {
    availableStarts: { attribute: false },
    hasMore: { attribute: false },
    loading: { attribute: false },
    preferred: { attribute: false },
    returnContext: { attribute: false },
    starting: { attribute: false },
    targetLabel: { attribute: false },
    types: { attribute: false },
    selected: { state: true },
  };

  public static override styles: CSSResult = css`
    :host {
      color: #18202a;
      display: block;
      font:
        400 0.9375rem/1.45 system-ui,
        sans-serif;
    }

    .start-surface {
      background: #fff;
      border: 1px solid #d7dce2;
      border-radius: 0.375rem;
      display: grid;
      gap: 1rem;
      padding: 1rem;
    }

    h1,
    p {
      margin: 0;
    }

    .choices {
      border: 0;
      display: grid;
      gap: 0.5rem;
      margin: 0;
      padding: 0;
    }

    .choice {
      align-items: start;
      border: 1px solid #d7dce2;
      border-radius: 0.25rem;
      cursor: pointer;
      display: grid;
      gap: 0.125rem 0.5rem;
      grid-template-columns: auto 1fr;
      padding: 0.625rem;
    }

    .choice small {
      color: #5d6671;
      grid-column: 2;
      overflow-wrap: anywhere;
    }

    .type-search,
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
    }

    input[type='search'] {
      flex: 1 1 14rem;
      min-inline-size: 0;
    }

    button,
    input {
      font: inherit;
      min-block-size: 2.75rem;
    }

    button {
      cursor: pointer;
      padding-inline: 0.875rem;
    }

    .primary {
      background: #3157d5;
      border: 1px solid #3157d5;
      color: white;
    }

    .status {
      color: #5d6671;
    }
  `;

  declare public availableStarts: readonly AuthoringStartSource['kind'][];
  declare public hasMore: boolean;
  declare public loading: boolean;
  declare public preferred: AuthoringStartSource | undefined;
  declare public returnContext: AuthoringReturnContext | undefined;
  declare public starting: boolean;
  declare public targetLabel: MessageReference | undefined;
  declare public types: readonly AuthoringTypeSummary[];
  declare protected selected: string;
  #selectionTouched = false;

  public constructor() {
    super();
    this.availableStarts = [];
    this.hasMore = false;
    this.loading = false;
    this.preferred = undefined;
    this.returnContext = undefined;
    this.selected = '';
    this.starting = false;
    this.targetLabel = undefined;
    this.types = [];
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (
      !this.#selectionTouched &&
      (changed.has('availableStarts') || changed.has('preferred') || changed.has('types'))
    ) {
      this.selected = this.#preferredSelection();
    } else if (this.selected !== '' && !this.#selectionExists(this.selected)) {
      this.selected = '';
    }
  }

  protected override render(): TemplateResult {
    const supportsBlank = this.availableStarts.includes('blank');
    const supportsTypes = this.availableStarts.includes('from-type');
    const busy = this.loading || this.starting;
    return html`
      <section class="start-surface" aria-labelledby="studio-start-heading">
        <header>
          <h1 id="studio-start-heading">${messageText('studio.contextual/choose-start')}</h1>
          <p>${referenceText(this.targetLabel)}</p>
        </header>

        ${
          supportsTypes
            ? html`<form class="type-search" @submit=${this.#requestSearch}>
                <label for="studio-type-search" class="status"
                  >${messageText('studio.contextual/type-search')}</label
                >
                <input
                  id="studio-type-search"
                  name="search"
                  type="search"
                  maxlength="500"
                  ?disabled=${busy}
                />
                <button type="submit" ?disabled=${busy}>
                  ${messageText('studio.contextual/search')}
                </button>
              </form>`
            : nothing
        }

        <fieldset class="choices" ?disabled=${busy}>
          <legend>${messageText('studio.contextual/start-source')}</legend>
          ${
            supportsBlank
              ? this.#choice(
                  'blank',
                  messageText('studio.contextual/start-blank'),
                  messageText('studio.contextual/start-blank-help'),
                )
              : nothing
          }
          ${this.types.map((type) => {
            const key = typeKey(type.reference);
            return this.#choice(
              key,
              referenceText(type.label),
              `${type.reference.id}@${type.reference.version}#${type.reference.revision}`,
            );
          })}
        </fieldset>

        ${
          this.loading
            ? html`<p class="status" role="status">
                ${messageText('studio.contextual/types-loading')}
              </p>`
            : supportsTypes && this.types.length === 0
              ? html`<p class="status">${messageText('studio.contextual/types-empty')}</p>`
              : nothing
        }

        <div class="actions">
          <button
            class="primary"
            type="button"
            ?disabled=${busy || this.selected === ''}
            @click=${this.#requestStart}
          >
            ${
              this.starting
                ? messageText('studio.contextual/starting')
                : messageText('studio.contextual/start')
            }
          </button>
          ${
            this.hasMore
              ? html`<button type="button" ?disabled=${busy} @click=${this.#requestMore}>
                  ${messageText('studio.contextual/load-more-types')}
                </button>`
              : nothing
          }
          ${
            this.returnContext === undefined
              ? nothing
              : html`<button type="button" ?disabled=${busy} @click=${this.#requestReturn}>
                  ${messageText('studio.contextual/return', undefined, {
                    destination:
                      referenceText(this.returnContext.label) ||
                      messageText('studio.contextual/return-destination'),
                  })}
                </button>`
          }
        </div>
      </section>
    `;
  }

  #choice(value: string, label: string, description: string): TemplateResult {
    return html`<label class="choice">
      <input
        type="radio"
        name="studio-start-source"
        .value=${value}
        .checked=${this.selected === value}
        @change=${(): void => {
          this.#selectionTouched = true;
          this.selected = value;
        }}
      />
      <strong>${label}</strong>
      <small>${description}</small>
    </label>`;
  }

  #preferredSelection(): string {
    if (this.preferred?.kind === 'blank' && this.availableStarts.includes('blank')) return 'blank';
    if (this.preferred?.kind === 'from-type') {
      const key = typeKey(this.preferred.type);
      if (this.types.some((type) => typeKey(type.reference) === key)) return key;
    }
    return '';
  }

  #selectionExists(value: string): boolean {
    return (
      (value === 'blank' && this.availableStarts.includes('blank')) ||
      this.types.some((type) => typeKey(type.reference) === value)
    );
  }

  readonly #requestSearch = (event: SubmitEvent): void => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!(form instanceof HTMLFormElement)) return;
    const value = new FormData(form).get('search');
    const search = typeof value === 'string' ? value.trim() : '';
    this.dispatchEvent(
      new CustomEvent<HostedTypeSearchDetail>(TYPE_SEARCH_EVENT, {
        detail: search === '' ? {} : { search },
      }),
    );
  };

  readonly #requestMore = (): void => {
    this.dispatchEvent(new CustomEvent(TYPE_MORE_EVENT));
  };

  readonly #requestReturn = (): void => {
    if (this.returnContext !== undefined) {
      dispatchStudioContextualReturnRequest(this, this.returnContext);
    }
  };

  readonly #requestStart = (): void => {
    if (this.selected === 'blank') {
      this.dispatchEvent(
        new CustomEvent<HostedStartRequestDetail>(START_REQUEST_EVENT, {
          detail: { source: { kind: 'blank' } },
        }),
      );
      return;
    }
    const selected = this.types.find((type) => typeKey(type.reference) === this.selected);
    if (selected !== undefined) {
      this.dispatchEvent(
        new CustomEvent<HostedStartRequestDetail>(START_REQUEST_EVENT, {
          detail: { source: { kind: 'from-type', type: structuredClone(selected.reference) } },
        }),
      );
    }
  };
}

/**
 * Resolve a normal create choice inside the current mount and start exactly
 * that host-authorized source. Existing/edit sessions bypass this chooser.
 */
export async function startHostedCreateSession(
  target: HTMLElement,
  preflight: StudioContextualPreflightHandle,
  preferred: AuthoringStartSource,
  presentation: AuthoringStartRequest['presentation'],
): Promise<StudioContextualHostSessionHandle> {
  const availableStarts = preflight.resolution.availableStarts.filter(
    (kind): kind is 'blank' | 'from-type' => kind === 'blank' || kind === 'from-type',
  );
  if (availableStarts.length === 0) {
    throw new TypeError('The resolved create target offers no blank or reusable-type start.');
  }
  if (availableStarts.length === 1 && availableStarts[0] === 'blank') {
    return preflight.start(startRequest(preflight, { kind: 'blank' }, presentation));
  }
  if (preflight.types === undefined) {
    throw new TypeError('The resolved from-type start has no authorized reusable-type catalogue.');
  }

  defineHostedStartElement();
  const element = document.createElement('kumwe-studio-hosted-start');
  if (!(element instanceof KumweStudioHostedStartElement)) {
    throw new TypeError('The registered hosted start element has an incompatible class.');
  }
  element.availableStarts = availableStarts;
  element.loading = true;
  element.preferred = structuredClone(preferred);
  element.returnContext = structuredClone(preflight.resolution.returnContext);
  element.targetLabel = structuredClone(preflight.resolution.target.label);
  target.append(element);

  let currentSearch: string | undefined;
  let nextCursor: string | undefined;
  const load = async (append: boolean): Promise<void> => {
    element.loading = true;
    try {
      const page = (
        await preflight.types?.list({
          ...(append && nextCursor !== undefined ? { cursor: nextCursor } : {}),
          limit: 100,
          resourceContext: structuredClone(preflight.resolution.resourceContext),
          ...(currentSearch === undefined ? {} : { search: currentSearch }),
          targetId: preflight.resolution.target.id,
        })
      )?.value;
      if (page === undefined) {
        throw new TypeError('The reusable-type catalogue became unavailable during preflight.');
      }
      element.types = append ? mergeTypePages(element.types, page) : structuredClone(page.items);
      nextCursor = page.nextCursor;
      element.hasMore = nextCursor !== undefined;
    } finally {
      element.loading = false;
    }
  };

  try {
    await load(false);
    const source = await waitForStartChoice(
      element,
      async (search) => {
        currentSearch = search;
        nextCursor = undefined;
        await load(false);
      },
      async () => load(true),
    );
    element.starting = true;
    return await preflight.start(startRequest(preflight, source, presentation));
  } finally {
    element.remove();
  }
}

function waitForStartChoice(
  element: KumweStudioHostedStartElement,
  search: (value: string | undefined) => Promise<void>,
  more: () => Promise<void>,
): Promise<AuthoringStartSource> {
  return new Promise((resolve, reject) => {
    const cleanup = (): void => {
      element.removeEventListener(START_REQUEST_EVENT, onStart);
      element.removeEventListener(TYPE_SEARCH_EVENT, onSearch);
      element.removeEventListener(TYPE_MORE_EVENT, onMore);
    };
    const fail = (error: unknown): void => {
      cleanup();
      reject(error instanceof Error ? error : new Error('Hosted type discovery failed.'));
    };
    const onStart = (event: Event): void => {
      cleanup();
      resolve((event as CustomEvent<HostedStartRequestDetail>).detail.source);
    };
    const onSearch = (event: Event): void => {
      const detail = (event as CustomEvent<HostedTypeSearchDetail>).detail;
      void search(detail.search).catch(fail);
    };
    const onMore = (): void => {
      void more().catch(fail);
    };
    element.addEventListener(START_REQUEST_EVENT, onStart);
    element.addEventListener(TYPE_SEARCH_EVENT, onSearch);
    element.addEventListener(TYPE_MORE_EVENT, onMore);
  });
}

function startRequest(
  preflight: StudioContextualPreflightHandle,
  source: AuthoringStartSource,
  presentation: AuthoringStartRequest['presentation'],
): AuthoringStartRequest {
  return {
    ...(presentation === undefined ? {} : { presentation }),
    resourceContext: structuredClone(preflight.resolution.resourceContext),
    source: structuredClone(source),
    targetId: preflight.resolution.target.id,
  };
}

function mergeTypePages(
  current: readonly AuthoringTypeSummary[],
  page: AuthoringTypeListPage,
): AuthoringTypeSummary[] {
  const merged = [...structuredClone(current), ...structuredClone(page.items)];
  const keys = new Set<string>();
  for (const type of merged) {
    const key = typeKey(type.reference);
    if (keys.has(key)) {
      throw new TypeError('The host repeated a reusable-type coordinate across catalogue pages.');
    }
    keys.add(key);
  }
  return merged;
}

function typeKey(reference: ReusableContentTypeReference): string {
  return `${reference.id}\u0000${reference.version}\u0000${reference.revision}`;
}

function referenceText(reference: MessageReference | undefined): string {
  return reference?.defaultMessage ?? reference?.key ?? '';
}

export function defineHostedStartElement(): void {
  if (customElements.get('kumwe-studio-hosted-start') === undefined) {
    customElements.define('kumwe-studio-hosted-start', KumweStudioHostedStartElement);
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'kumwe-studio-hosted-start': KumweStudioHostedStartElement;
  }
}
