import {
  StudioMediaFieldController,
  type MediaProvider,
  type MediaUploadTransport,
  type StudioMediaFieldState,
} from '@kumwe/studio-media';
import type { MediaAsset, MediaReference } from '@kumwe/studio-protocol';
import { validateMediaReference } from '@kumwe/studio-media';
import type {
  StudioAuthoringControlHandle,
  StudioAuthoringControlOptions,
} from './authoring-controls.js';

export interface StudioMediaAuthoringServices {
  provider: MediaProvider;
  uploadTransport?: MediaUploadTransport;
}

export function mountStudioMediaReferenceControl(
  options: StudioAuthoringControlOptions,
  services: StudioMediaAuthoringServices,
): StudioAuthoringControlHandle<MediaReference | undefined> {
  return new StudioMediaReferenceControl(options, services);
}

export function mountStudioMediaCollectionControl(
  options: StudioAuthoringControlOptions,
  services: StudioMediaAuthoringServices,
): StudioAuthoringControlHandle<readonly MediaReference[]> {
  return new StudioMediaCollectionControl(options, services);
}

class StudioMediaReferenceControl implements StudioAuthoringControlHandle<
  MediaReference | undefined
> {
  readonly #controller: StudioMediaFieldController;
  readonly #holder: HTMLElement;
  readonly #onChange: StudioAuthoringControlOptions['onChange'];
  readonly #unsubscribe: () => void;
  public readonly readOnly: boolean;
  #error: string | undefined;
  #lastValid: MediaReference | undefined;

  public constructor(
    options: StudioAuthoringControlOptions,
    services: StudioMediaAuthoringServices,
  ) {
    this.#holder = group(options.holder, 'Media picker');
    this.#onChange = options.onChange;
    this.#lastValid = optionalReference(options.value);
    this.#controller = new StudioMediaFieldController({
      ...(options.binding === undefined ? {} : { binding: options.binding }),
      ...(options.mediaTypes === undefined ? {} : { mediaTypes: [...options.mediaTypes] }),
      onChange: (state) => this.#acceptChange(state),
      provider: services.provider,
      ...(options.readOnly === undefined ? {} : { readOnly: options.readOnly }),
      ...(services.uploadTransport === undefined
        ? {}
        : { uploadTransport: services.uploadTransport }),
      usage: options.usage ?? this.#lastValid?.usage ?? 'studio.media/content',
      ...(this.#lastValid === undefined ? {} : { value: this.#lastValid }),
    });
    this.readOnly = this.#controller.state.readOnly;
    this.#holder.addEventListener('dragover', (event) => {
      if (!this.readOnly) event.preventDefault();
    });
    this.#holder.addEventListener('drop', (event) => {
      if (this.readOnly || event.dataTransfer === null) return;
      event.preventDefault();
      void this.#run(() => this.#controller.drop(event.dataTransfer?.files ?? []));
    });
    this.#holder.addEventListener('paste', (event) => {
      if (this.readOnly || event.clipboardData === null) return;
      void this.#run(() => this.#controller.paste(event.clipboardData?.items ?? []));
    });
    this.#unsubscribe = this.#controller.subscribe(() => this.#render());
    if (this.#lastValid === undefined) void this.#run(() => this.#controller.open());
    else void this.#run(() => this.#controller.resolve());
  }

  public destroy(): void {
    this.#unsubscribe();
    this.#controller.dispose();
    this.#holder.remove();
  }

  public focus(): void {
    this.#holder.querySelector<HTMLElement>('[aria-label="Search media"]')?.focus();
  }

  public value(): MediaReference | undefined {
    return this.#lastValid === undefined ? undefined : structuredClone(this.#lastValid);
  }

  #acceptChange(state: StudioMediaFieldState): void {
    let valid = !state.diagnostics.some((diagnostic) => diagnostic.severity === 'error');
    if (valid && state.value !== undefined) {
      try {
        this.#lastValid = canonicalReference(state.value);
      } catch {
        valid = false;
      }
    } else if (valid) {
      this.#lastValid = undefined;
    }
    this.#onChange?.({ valid, value: this.value() });
  }

  #render(): void {
    const state = this.#controller.state;
    const browser = document.createElement('section');
    browser.setAttribute('aria-label', 'Media library');
    const search = input('Search media', '', this.readOnly);
    const searchButton = button('Search media library', () => {
      void this.#run(() => this.#controller.search(search.value));
    });
    searchButton.disabled = this.readOnly;
    browser.append(search, searchButton);
    for (const asset of state.library.assets) {
      browser.append(
        button(
          `Select ${mediaAssetLabel(asset)}`,
          () => this.#controller.select(asset),
          this.readOnly,
        ),
      );
    }
    if (state.library.nextCursor !== undefined) {
      browser.append(
        button(
          'Load more media',
          () => {
            void this.#run(() => this.#controller.loadNext());
          },
          this.readOnly,
        ),
      );
    }

    const upload = document.createElement('input');
    upload.type = 'file';
    upload.setAttribute('aria-label', 'Upload media');
    upload.disabled = this.readOnly;
    if (state.library.query?.mediaTypes !== undefined) {
      upload.accept = state.library.query.mediaTypes.join(',');
    }
    upload.addEventListener('change', () => {
      const file = upload.files?.[0];
      if (file !== undefined) void this.#run(() => this.#controller.upload(file));
    });
    browser.append(upload);

    const status = document.createElement('p');
    status.setAttribute('role', state.status === 'error' ? 'alert' : 'status');
    status.setAttribute('aria-live', 'polite');
    status.textContent = this.#statusText(state);
    browser.append(status);
    if (state.upload?.state === 'failed') {
      browser.append(
        button(
          'Retry media upload',
          () => {
            void this.#run(() => this.#controller.retryUpload());
          },
          this.readOnly,
        ),
      );
    }
    if (
      state.upload !== undefined &&
      !['cancelled', 'complete', 'failed'].includes(state.upload.state)
    ) {
      browser.append(button('Cancel media upload', () => this.#controller.cancelUpload()));
    }

    const usage = document.createElement('section');
    usage.setAttribute('aria-label', 'Selected media usage');
    if (state.value === undefined) {
      usage.append(document.createTextNode('No media selected.'));
    } else {
      this.#renderUsage(usage, state);
    }
    this.#holder.replaceChildren(browser, usage);
  }

  #renderUsage(holder: HTMLElement, state: StudioMediaFieldState): void {
    const value = state.value;
    if (value === undefined) return;
    const selected = document.createElement('p');
    selected.textContent =
      state.status === 'orphaned'
        ? `Missing media ${value.assetId}. Select a replacement.`
        : `Selected media ${state.asset?.filename ?? value.assetId}.`;
    holder.append(selected);
    const decorative = document.createElement('input');
    decorative.type = 'checkbox';
    decorative.checked = value.accessibility.mode === 'decorative';
    decorative.disabled = this.readOnly;
    decorative.setAttribute('aria-label', 'Media is decorative');
    decorative.addEventListener('change', () => this.#controller.setDecorative(decorative.checked));
    holder.append(decorative);
    const accessibility = value.accessibility;
    const informative = accessibility.mode === 'informative';
    const alt = input(
      'Media alternative text',
      accessibility.mode === 'informative' ? accessibility.altText : '',
      this.readOnly || !informative,
    );
    alt.maxLength = 5_000;
    alt.addEventListener('input', () => this.#controller.setAltText(alt.value));
    const caption = input(
      'Media caption',
      accessibility.mode === 'informative' ? (accessibility.caption ?? '') : '',
      this.readOnly || !informative,
    );
    caption.maxLength = 20_000;
    caption.addEventListener('input', () => this.#controller.setCaption(caption.value));
    holder.append(alt, caption);

    const focalX = numberInput('Media focal point x', value.focalPoint?.x ?? 0.5, this.readOnly);
    const focalY = numberInput('Media focal point y', value.focalPoint?.y ?? 0.5, this.readOnly);
    const setFocal = (): void => {
      this.#controller.setFocalPoint({ x: focalX.valueAsNumber, y: focalY.valueAsNumber });
    };
    focalX.addEventListener('change', setFocal);
    focalY.addEventListener('change', setFocal);
    holder.append(focalX, focalY);

    const role = input(
      'Media rendition role',
      value.renditionIntent?.role ?? 'content',
      this.readOnly,
    );
    role.maxLength = 64;
    const fit = select(
      'Media rendition fit',
      ['contain', 'cover', 'fill', 'scale-down'],
      value.renditionIntent?.fit ?? 'cover',
      this.readOnly,
    );
    const setRendition = (): void => {
      this.#controller.setRenditionIntent({
        fit: fit.value as 'contain' | 'cover' | 'fill' | 'scale-down',
        role: role.value.trim() || 'content',
      });
    };
    role.addEventListener('change', setRendition);
    fit.addEventListener('change', setRendition);
    holder.append(role, fit);
    holder.append(
      button('Replace media', () => this.focus(), this.readOnly),
      button('Clear media', () => this.#controller.clear(), this.readOnly),
    );
  }

  async #run(action: () => Promise<unknown>): Promise<void> {
    try {
      this.#error = undefined;
      await action();
    } catch (error) {
      this.#error = error instanceof Error ? error.message : 'Media operation failed.';
      this.#render();
    }
  }

  #statusText(state: StudioMediaFieldState): string {
    if (this.#error !== undefined) return this.#error;
    if (state.upload !== undefined && state.status === 'uploading') {
      const { totalBytes, transferredBytes } = state.upload.progress;
      return `Uploading media: ${transferredBytes} of ${totalBytes} bytes.`;
    }
    switch (state.status) {
      case 'browsing':
        return 'Browse, search, paste, drop, or upload media.';
      case 'empty':
        return 'No media selected.';
      case 'error':
        return 'The media operation needs attention.';
      case 'orphaned':
        return 'The stored media reference is missing. Select a replacement.';
      case 'ready':
        return 'Media is ready.';
      case 'uploading':
        return 'Media is processing.';
    }
  }
}

class StudioMediaCollectionControl implements StudioAuthoringControlHandle<
  readonly MediaReference[]
> {
  readonly #holder: HTMLElement;
  readonly #list: HTMLElement;
  readonly #onChange: StudioAuthoringControlOptions['onChange'];
  readonly #picker: StudioAuthoringControlHandle<MediaReference | undefined>;
  public readonly readOnly: boolean;
  #lastValid: MediaReference[];

  public constructor(
    options: StudioAuthoringControlOptions,
    services: StudioMediaAuthoringServices,
  ) {
    this.#holder = group(options.holder, 'Media collection editor');
    this.#list = document.createElement('ol');
    this.#list.setAttribute('aria-label', 'Selected media order');
    this.#onChange = options.onChange;
    this.#lastValid = referenceCollection(options.value);
    this.readOnly = readOnly(options);
    const pickerHolder = document.createElement('div');
    this.#picker = new StudioMediaReferenceControl(
      {
        ...(options.binding === undefined ? {} : { binding: options.binding }),
        holder: pickerHolder,
        ...(options.mediaTypes === undefined ? {} : { mediaTypes: options.mediaTypes }),
        onChange: (change) => {
          if (change.valid && change.value !== undefined) {
            this.#append(canonicalReference(change.value));
          }
        },
        readOnly: this.readOnly,
        usage: options.usage ?? 'studio.media/collection',
        value: undefined,
      },
      services,
    );
    this.#holder.append(pickerHolder, this.#list);
    this.#render();
  }

  public destroy(): void {
    this.#picker.destroy();
    this.#holder.remove();
  }

  public focus(): void {
    this.#picker.focus();
  }

  public value(): readonly MediaReference[] {
    return structuredClone(this.#lastValid);
  }

  #append(value: MediaReference): void {
    if (this.readOnly || this.#lastValid.length >= 100) return;
    if (this.#lastValid.some((item) => item.assetId === value.assetId)) return;
    this.#commit([...this.#lastValid, canonicalReference(value)]);
  }

  #commit(value: readonly MediaReference[]): void {
    try {
      this.#lastValid = referenceCollection(value);
      this.#onChange?.({ valid: true, value: this.value() });
      this.#render();
    } catch {
      this.#onChange?.({ valid: false, value: this.value() });
    }
  }

  #move(index: number, delta: -1 | 1): void {
    const target = index + delta;
    if (this.readOnly || target < 0 || target >= this.#lastValid.length) return;
    const next = [...this.#lastValid];
    const current = next[index];
    const other = next[target];
    if (current === undefined || other === undefined) return;
    next[index] = other;
    next[target] = current;
    this.#commit(next);
  }

  #render(): void {
    this.#list.replaceChildren();
    for (const [index, reference] of this.#lastValid.entries()) {
      const item = document.createElement('li');
      const label = document.createElement('p');
      label.textContent = `${index + 1}. ${reference.assetId}`;
      item.append(label);
      const decorative = document.createElement('input');
      decorative.type = 'checkbox';
      decorative.checked = reference.accessibility.mode === 'decorative';
      decorative.disabled = this.readOnly;
      decorative.setAttribute('aria-label', `Media ${index + 1} is decorative`);
      decorative.addEventListener('change', () => {
        const next = structuredClone(this.#lastValid);
        const selected = next[index];
        if (selected === undefined) return;
        selected.accessibility = decorative.checked
          ? { mode: 'decorative' }
          : { altText: selected.assetId, mode: 'informative' };
        this.#commit(next);
      });
      item.append(decorative);
      const alt = input(
        `Media ${index + 1} alternative text`,
        reference.accessibility.mode === 'informative' ? reference.accessibility.altText : '',
        this.readOnly || reference.accessibility.mode !== 'informative',
      );
      alt.addEventListener('change', () => {
        const next = structuredClone(this.#lastValid);
        const selected = next[index];
        if (selected?.accessibility.mode !== 'informative') return;
        selected.accessibility.altText = alt.value;
        this.#commit(next);
      });
      item.append(alt);
      item.append(
        button(
          `Move media ${index + 1} up`,
          () => this.#move(index, -1),
          this.readOnly || index === 0,
        ),
        button(
          `Move media ${index + 1} down`,
          () => this.#move(index, 1),
          this.readOnly || index === this.#lastValid.length - 1,
        ),
        button(
          `Remove media ${index + 1}`,
          () => this.#commit(this.#lastValid.filter((_, itemIndex) => itemIndex !== index)),
          this.readOnly,
        ),
      );
      this.#list.append(item);
    }
  }
}

function optionalReference(value: unknown): MediaReference | undefined {
  if (value === undefined || value === null) return undefined;
  return canonicalReference(value);
}

function referenceCollection(value: unknown): MediaReference[] {
  if (!Array.isArray(value) || value.length > 100) {
    throw new RangeError('Media collection must contain at most 100 references.');
  }
  return value.map(canonicalReference);
}

function canonicalReference(value: unknown): MediaReference {
  const record = exactObject(
    value,
    [
      'accessibility',
      'assetId',
      'assetRevision',
      'contractVersion',
      'cropIntent',
      'focalPoint',
      'kind',
      'renditionIntent',
      'usage',
    ],
    'Media reference',
  );
  if (record.contractVersion !== '0.1-draft' || record.kind !== 'media-reference') {
    throw new TypeError('Media reference has an unsupported contract or kind.');
  }
  const assetId = boundedName(record.assetId, /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/u, 240, 'asset id');
  const usage = boundedName(
    record.usage,
    /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*\/[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/u,
    160,
    'usage',
  ) as `${string}/${string}`;
  const candidate: MediaReference = {
    accessibility: parseAccessibility(record.accessibility),
    assetId,
    contractVersion: '0.1-draft',
    kind: 'media-reference',
    usage,
  };
  if (record.assetRevision !== undefined) {
    candidate.assetRevision = boundedName(record.assetRevision, /^.{1,200}$/u, 200, 'revision');
  }
  if (record.focalPoint !== undefined) candidate.focalPoint = parseFocalPoint(record.focalPoint);
  if (record.cropIntent !== undefined) candidate.cropIntent = parseCropIntent(record.cropIntent);
  if (record.renditionIntent !== undefined) {
    candidate.renditionIntent = parseRenditionIntent(record.renditionIntent);
  }
  const diagnostics = validateMediaReference(candidate);
  if (diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
    throw new TypeError('Media value must be a canonical Studio media reference.');
  }
  return candidate;
}

function parseAccessibility(value: unknown): MediaReference['accessibility'] {
  const record = exactObject(
    value,
    ['altFieldPath', 'altText', 'caption', 'captionFieldPath', 'mode'],
    'Media accessibility',
  );
  switch (record.mode) {
    case 'decorative':
      exactKeys(record, ['mode'], 'Decorative media accessibility');
      return { mode: 'decorative' };
    case 'informative': {
      exactKeys(record, ['altText', 'caption', 'mode'], 'Informative media accessibility');
      const altText = boundedText(record.altText, 1, 5_000, 'Media alternative text');
      const caption =
        record.caption === undefined
          ? undefined
          : boundedText(record.caption, 0, 20_000, 'Media caption');
      return { altText, ...(caption === undefined ? {} : { caption }), mode: 'informative' };
    }
    case 'bound': {
      exactKeys(record, ['altFieldPath', 'captionFieldPath', 'mode'], 'Bound media accessibility');
      const altFieldPath = localPath(record.altFieldPath, 'Alternative-text field path');
      const captionFieldPath =
        record.captionFieldPath === undefined
          ? undefined
          : localPath(record.captionFieldPath, 'Caption field path');
      return {
        altFieldPath,
        ...(captionFieldPath === undefined ? {} : { captionFieldPath }),
        mode: 'bound',
      };
    }
    default:
      throw new TypeError('Media accessibility mode is invalid.');
  }
}

function parseFocalPoint(value: unknown): { x: number; y: number } {
  const record = exactObject(value, ['x', 'y'], 'Media focal point');
  return { x: unit(record.x, 'Focal x'), y: unit(record.y, 'Focal y') };
}

function parseCropIntent(value: unknown): NonNullable<MediaReference['cropIntent']> {
  const record = exactObject(value, ['height', 'mode', 'width', 'x', 'y'], 'Media crop intent');
  if (record.mode === 'aspect-ratio') {
    exactKeys(record, ['height', 'mode', 'width'], 'Aspect-ratio crop');
    return {
      height: boundedInteger(record.height, 1, 10_000, 'Crop height'),
      mode: 'aspect-ratio',
      width: boundedInteger(record.width, 1, 10_000, 'Crop width'),
    };
  }
  if (record.mode === 'rectangle') {
    exactKeys(record, ['height', 'mode', 'width', 'x', 'y'], 'Rectangle crop');
    const width = unit(record.width, 'Crop width');
    const height = unit(record.height, 'Crop height');
    if (width === 0 || height === 0) throw new RangeError('Crop dimensions must be positive.');
    return {
      height,
      mode: 'rectangle',
      width,
      x: unit(record.x, 'Crop x'),
      y: unit(record.y, 'Crop y'),
    };
  }
  throw new TypeError('Media crop mode is invalid.');
}

function parseRenditionIntent(value: unknown): NonNullable<MediaReference['renditionIntent']> {
  const record = exactObject(
    value,
    ['fit', 'preferredMediaTypes', 'role'],
    'Media rendition intent',
  );
  const role = boundedName(
    record.role,
    /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/u,
    100,
    'rendition role',
  );
  const fit = record.fit;
  if (
    fit !== undefined &&
    fit !== 'contain' &&
    fit !== 'cover' &&
    fit !== 'fill' &&
    fit !== 'scale-down'
  ) {
    throw new TypeError('Media rendition fit is invalid.');
  }
  let preferredMediaTypes: string[] | undefined;
  if (record.preferredMediaTypes !== undefined) {
    if (!Array.isArray(record.preferredMediaTypes) || record.preferredMediaTypes.length > 10) {
      throw new RangeError('Preferred media types exceed their item limit.');
    }
    preferredMediaTypes = record.preferredMediaTypes.map((item) =>
      boundedName(item, /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/u, 200, 'preferred media type'),
    );
    if (new Set(preferredMediaTypes).size !== preferredMediaTypes.length) {
      throw new TypeError('Preferred media types must be unique.');
    }
  }
  return {
    ...(fit === undefined ? {} : { fit }),
    ...(preferredMediaTypes === undefined ? {} : { preferredMediaTypes }),
    role,
  };
}

function localPath(value: unknown, name: string): string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 32) {
    throw new RangeError(`${name} must have 1 through 32 segments.`);
  }
  return value.map((segment) =>
    boundedName(segment, /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/u, 100, `${name} segment`),
  );
}

function exactObject(
  value: unknown,
  keys: readonly string[],
  name: string,
): Record<string, unknown> {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new TypeError(`${name} must be a plain JSON object.`);
  }
  const record = value as Record<string, unknown>;
  exactKeys(record, keys, name);
  return record;
}

function exactKeys(record: Record<string, unknown>, keys: readonly string[], name: string): void {
  const allowed = new Set(keys);
  const unknown = Object.keys(record).find((key) => !allowed.has(key));
  if (unknown !== undefined) throw new TypeError(`${name} contains unknown member ${unknown}.`);
}

function boundedName(value: unknown, pattern: RegExp, maximum: number, name: string): string {
  if (
    typeof value !== 'string' ||
    value.length > maximum ||
    ['__proto__', 'constructor', 'prototype'].includes(value) ||
    !pattern.test(value)
  ) {
    throw new TypeError(`Media ${name} is invalid.`);
  }
  return value;
}

function boundedText(value: unknown, minimum: number, maximum: number, name: string): string {
  if (typeof value !== 'string' || value.length < minimum || value.length > maximum) {
    throw new RangeError(`${name} must contain ${minimum} through ${maximum} characters.`);
  }
  return value;
}

function boundedInteger(value: unknown, minimum: number, maximum: number, name: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`${name} must be an integer from ${minimum} through ${maximum}.`);
  }
  return value;
}

function unit(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`${name} must be a finite number from 0 through 1.`);
  }
  return value;
}

function readOnly(options: StudioAuthoringControlOptions): boolean {
  return (
    options.readOnly === true ||
    (options.binding !== undefined && options.binding.source.kind !== 'static-value')
  );
}

function group(holder: HTMLElement, label: string): HTMLElement {
  const element = document.createElement('section');
  element.className = 'studio-authoring-control studio-media-control';
  element.setAttribute('aria-label', label);
  holder.append(element);
  return element;
}

function input(label: string, value: string, disabled: boolean): HTMLInputElement {
  const element = document.createElement('input');
  element.type = 'text';
  element.value = value;
  element.disabled = disabled;
  element.setAttribute('aria-label', label);
  return element;
}

function numberInput(label: string, value: number, disabled: boolean): HTMLInputElement {
  const element = document.createElement('input');
  element.type = 'number';
  element.min = '0';
  element.max = '1';
  element.step = '0.01';
  element.value = String(value);
  element.disabled = disabled;
  element.setAttribute('aria-label', label);
  return element;
}

function select(
  label: string,
  values: readonly string[],
  selected: string,
  disabled: boolean,
): HTMLSelectElement {
  const element = document.createElement('select');
  element.disabled = disabled;
  element.setAttribute('aria-label', label);
  for (const value of values) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    option.selected = value === selected;
    element.append(option);
  }
  return element;
}

function button(label: string, action: () => void, disabled = false): HTMLButtonElement {
  const element = document.createElement('button');
  element.type = 'button';
  element.textContent = label;
  element.disabled = disabled;
  element.setAttribute('aria-label', label);
  element.addEventListener('click', action);
  return element;
}

function mediaAssetLabel(asset: Readonly<MediaAsset>): string {
  return `${asset.filename} (${asset.mediaKind})`;
}
