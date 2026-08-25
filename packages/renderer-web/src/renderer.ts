import {
  CORE_PRODUCTION_BLOCK_TYPES,
  parseStudioChartSpec,
  parseStudioDrawingDocument,
  parseStudioMoneyValue,
} from '@kumwe/studio-core';
import type {
  BlueprintDocument,
  BlueprintNode,
  JsonValue,
  MediaReference,
  StudioChartSpec,
  StudioDrawingDocument,
} from '@kumwe/studio-protocol';
import {
  parseRichTextDocument,
  type StudioRichTextDocument,
  type StudioRichTextNode,
} from '@kumwe/studio-rich-text';
import { assertCspNonce, compileStudioScopedStyleSheet } from './scoped-css.js';
import { escapeAttribute, escapeHtml, renderSafeMarkupFragment } from './safe-markup.js';
import type {
  ResolvedWebMedia,
  ResolvedWebResource,
  SafeMarkupFragment,
  StudioWebEnhancement,
  StudioWebRenderContext,
  StudioWebRenderResult,
} from './types.js';

const BASE_CSS = `
[data-studio-block]{box-sizing:border-box;min-inline-size:0}
[data-studio-layout="section"]{inline-size:100%}
[data-studio-layout="stack"]{display:flex;flex-direction:column;gap:var(--studio-space,1rem)}
[data-studio-layout="grid"],[data-studio-layout="columns"]{display:grid;gap:var(--studio-space,1rem);grid-template-columns:repeat(var(--studio-columns-compact,1),minmax(0,1fr))}
@media (min-width:48rem){[data-studio-layout="grid"],[data-studio-layout="columns"]{grid-template-columns:repeat(var(--studio-columns-medium,var(--studio-columns-compact,1)),minmax(0,1fr))}}
@media (min-width:75rem){[data-studio-layout="grid"],[data-studio-layout="columns"]{grid-template-columns:repeat(var(--studio-columns-expanded,var(--studio-columns-medium,var(--studio-columns-compact,1))),minmax(0,1fr))}}
[data-studio-gallery="grid"]{display:grid;gap:1rem;grid-template-columns:repeat(var(--studio-gallery-columns,1),minmax(0,1fr))}
[data-studio-gallery="slideshow"] [data-studio-slide]{scroll-snap-align:start}
[data-studio-gallery="slideshow"] [data-studio-part="content"]{display:flex;overflow-x:auto;scroll-snap-type:x mandatory}
[data-studio-gallery] figure{margin:0}
[data-studio-block="drawing"] svg,[data-studio-part="media"]{block-size:auto;max-inline-size:100%}
[data-studio-block="tabs"] [data-studio-tab-list][hidden]{display:none}
[data-studio-chart-table]{border-collapse:collapse;inline-size:100%}
[data-studio-chart-table] th,[data-studio-chart-table] td{border:1px solid currentColor;padding:.35rem;text-align:end}
[data-studio-chart-table] th:first-child{text-align:start}
@media (prefers-reduced-motion:reduce){[data-studio-gallery="slideshow"] [data-studio-part="content"]{scroll-behavior:auto}}
`.trim();

interface RenderState {
  context: Readonly<StudioWebRenderContext>;
  css: string[];
  enhancements: StudioWebEnhancement[];
}

/** Render a Blueprint through the portable 27-block semantic web profile. */
export async function renderStudioWeb(
  document: Pick<BlueprintDocument, 'roots'>,
  context: Readonly<StudioWebRenderContext> = {},
): Promise<StudioWebRenderResult> {
  const state: RenderState = { context, css: [], enhancements: [] };
  const html = (await Promise.all(document.roots.map((node) => renderNode(node, state)))).join('');
  const css = [BASE_CSS, ...state.css].filter((value) => value.length > 0).join('\n');
  let nonce = '';
  if (context.cspNonce !== undefined) {
    assertCspNonce(context.cspNonce);
    nonce = ` nonce="${escapeAttribute(context.cspNonce)}"`;
  }
  return {
    css,
    enhancements: state.enhancements,
    html,
    styleElement: `<style${nonce} data-studio-renderer="semantic-web">${css}</style>`,
  };
}

async function renderNode(node: Readonly<BlueprintNode>, state: RenderState): Promise<string> {
  const scope = scopeFor(node.id);
  const scopedSheet = state.context.scopedStyles?.[node.id];
  if (scopedSheet !== undefined) state.css.push(compileStudioScopedStyleSheet(scope, scopedSheet));
  const content = await renderType(node, scope, state);
  return `<div data-studio-block="${escapeAttribute(blockName(node.type))}" data-studio-node="${escapeAttribute(node.id)}" data-studio-scope="${scope}">${content}</div>`;
}

async function renderType(
  node: Readonly<BlueprintNode>,
  scope: string,
  state: RenderState,
): Promise<string> {
  switch (node.type) {
    case CORE_PRODUCTION_BLOCK_TYPES.section:
      return layout(node, 'section', state);
    case CORE_PRODUCTION_BLOCK_TYPES.stack:
      return layout(node, 'stack', state);
    case CORE_PRODUCTION_BLOCK_TYPES.grid:
      return responsiveLayout(node, 'grid', scope, state);
    case CORE_PRODUCTION_BLOCK_TYPES.columns:
      return responsiveLayout(node, 'columns', scope, state);
    case CORE_PRODUCTION_BLOCK_TYPES.heading:
      return heading(node, state);
    case CORE_PRODUCTION_BLOCK_TYPES.richText:
      return richText(node, state);
    case CORE_PRODUCTION_BLOCK_TYPES.image:
      return image(node, state);
    case CORE_PRODUCTION_BLOCK_TYPES.gallery:
      return gallery(node, scope, state);
    case CORE_PRODUCTION_BLOCK_TYPES.video:
      return video(node, state);
    case CORE_PRODUCTION_BLOCK_TYPES.audio:
      return audio(node, state);
    case CORE_PRODUCTION_BLOCK_TYPES.attachment:
      return attachment(node, state);
    case CORE_PRODUCTION_BLOCK_TYPES.code:
      return source(node, 'code', state);
    case CORE_PRODUCTION_BLOCK_TYPES.math:
      return math(node, scope, state);
    case CORE_PRODUCTION_BLOCK_TYPES.diagram:
      return diagram(node, scope, state);
    case CORE_PRODUCTION_BLOCK_TYPES.chart:
      return chart(node, scope, state);
    case CORE_PRODUCTION_BLOCK_TYPES.drawing:
      return drawing(node, state);
    case CORE_PRODUCTION_BLOCK_TYPES.embed:
      return embed(node, state);
    case CORE_PRODUCTION_BLOCK_TYPES.callToAction:
      return callToAction(node, state);
    case CORE_PRODUCTION_BLOCK_TYPES.card:
      return card(node, state);
    case CORE_PRODUCTION_BLOCK_TYPES.accordion:
      return children(node, 'items', state);
    case CORE_PRODUCTION_BLOCK_TYPES.accordionItem:
      return accordionItem(node, state);
    case CORE_PRODUCTION_BLOCK_TYPES.tabs:
      return tabs(node, scope, state);
    case CORE_PRODUCTION_BLOCK_TYPES.tab:
      return tab(node, state);
    case CORE_PRODUCTION_BLOCK_TYPES.callout:
      return callout(node, state);
    case CORE_PRODUCTION_BLOCK_TYPES.contentReference:
      return contentReference(node, state);
    case CORE_PRODUCTION_BLOCK_TYPES.contentCollection:
      return contentCollection(node, scope, state);
    case CORE_PRODUCTION_BLOCK_TYPES.money:
      return money(node, state);
    default:
      return `<p role="status">Unsupported Studio block ${escapeHtml(node.type)}</p>`;
  }
}

async function layout(
  node: Readonly<BlueprintNode>,
  kind: string,
  state: RenderState,
): Promise<string> {
  return `<div data-studio-layout="${kind}" data-studio-part="content">${await children(node, kind === 'section' ? 'content' : 'items', state)}</div>`;
}

async function responsiveLayout(
  node: Readonly<BlueprintNode>,
  kind: 'columns' | 'grid',
  scope: string,
  state: RenderState,
): Promise<string> {
  const compact = integerProperty(node.properties.columns, 1, 12, 1);
  const medium = integerProperty(node.responsive?.columns?.medium, 1, 12, compact);
  const expanded = integerProperty(node.responsive?.columns?.expanded, 1, 12, medium);
  state.css.push(
    `[data-studio-scope="${scope}"]{--studio-columns-compact:${compact};--studio-columns-medium:${medium};--studio-columns-expanded:${expanded}}`,
  );
  return `<div data-studio-layout="${kind}" data-studio-part="content">${await children(node, 'items', state)}</div>`;
}

async function heading(node: Readonly<BlueprintNode>, state: RenderState): Promise<string> {
  const level = integerProperty(node.properties.level, 1, 6, 2);
  const text = stringValue(await bindingValue(node, 'text', state));
  return `<h${level} data-studio-part="heading">${escapeHtml(text)}</h${level}>`;
}

async function richText(node: Readonly<BlueprintNode>, state: RenderState): Promise<string> {
  const value = await bindingValue(node, 'content', state);
  if (isSafeMarkupFragment(value)) {
    return `<div data-studio-part="content">${renderSafeMarkupFragment(value)}</div>`;
  }
  try {
    return `<div data-studio-part="content">${renderRichText(parseRichTextDocument(value))}</div>`;
  } catch {
    return '<div data-studio-part="content"></div>';
  }
}

async function image(node: Readonly<BlueprintNode>, state: RenderState): Promise<string> {
  const media = await resolvedMedia(await bindingValue(node, 'asset', state), state);
  if (media === undefined) return '<p role="status">Image unavailable</p>';
  const dimensions = mediaDimensions(media);
  const caption =
    media.caption === undefined ? '' : `<figcaption>${escapeHtml(media.caption)}</figcaption>`;
  return `<figure><img data-studio-part="media" src="${escapeAttribute(media.src)}" alt="${escapeAttribute(media.altText)}" loading="${node.properties.loading === 'eager' ? 'eager' : 'lazy'}"${dimensions}>${caption}</figure>`;
}

async function gallery(
  node: Readonly<BlueprintNode>,
  scope: string,
  state: RenderState,
): Promise<string> {
  const value = await bindingValue(node, 'items', state);
  const references = Array.isArray(value) ? value : [];
  const media = (
    await Promise.all(references.map((reference) => resolvedMedia(reference, state)))
  ).filter((item): item is ResolvedWebMedia => item !== undefined);
  const presentation = node.properties.presentation === 'slideshow' ? 'slideshow' : 'grid';
  const columns = integerProperty(node.properties.columns, 1, 12, 4);
  state.css.push(`[data-studio-scope="${scope}"]{--studio-gallery-columns:${columns}}`);
  if (presentation === 'slideshow') {
    state.enhancements.push({
      autoplay: node.properties.autoplay === true,
      kind: 'slideshow',
      nodeId: node.id,
      scope,
    });
  }
  const items = media
    .map(
      (item, index) =>
        `<figure data-studio-slide="${index}"><img data-studio-part="media" src="${escapeAttribute(item.src)}" alt="${escapeAttribute(item.altText)}"${mediaDimensions(item)}>${item.caption === undefined ? '' : `<figcaption>${escapeHtml(item.caption)}</figcaption>`}</figure>`,
    )
    .join('');
  return `<section data-studio-gallery="${presentation}" aria-label="Media gallery"><div data-studio-part="content">${items}</div>${presentation === 'slideshow' ? '<p><button type="button" data-studio-slide-previous>Previous</button><button type="button" data-studio-slide-next>Next</button></p>' : ''}</section>`;
}

async function video(node: Readonly<BlueprintNode>, state: RenderState): Promise<string> {
  const media = await resolvedMedia(await bindingValue(node, 'asset', state), state);
  if (media === undefined) return '<p role="status">Video unavailable</p>';
  const poster = await resolvedMedia(await bindingValue(node, 'poster', state), state);
  const flags = `${node.properties.controls === false ? '' : ' controls'}${node.properties.autoplay === true ? ' autoplay' : ''}${node.properties.muted === true ? ' muted' : ''}`;
  return `<video data-studio-part="media" src="${escapeAttribute(media.src)}"${poster === undefined ? '' : ` poster="${escapeAttribute(poster.src)}"`}${flags}>${escapeHtml(stringValue(await bindingValue(node, 'captions', state)))}</video>`;
}

async function audio(node: Readonly<BlueprintNode>, state: RenderState): Promise<string> {
  const media = await resolvedMedia(await bindingValue(node, 'asset', state), state);
  if (media === undefined) return '<p role="status">Audio unavailable</p>';
  const flags = `${node.properties.controls === false ? '' : ' controls'}${node.properties.autoplay === true ? ' autoplay' : ''}`;
  const transcript = stringValue(await bindingValue(node, 'transcript', state));
  return `<audio data-studio-part="media" src="${escapeAttribute(media.src)}"${flags}></audio>${transcript.length === 0 ? '' : `<details><summary>Transcript</summary><p>${escapeHtml(transcript)}</p></details>`}`;
}

async function attachment(node: Readonly<BlueprintNode>, state: RenderState): Promise<string> {
  const media = await resolvedMedia(await bindingValue(node, 'asset', state), state);
  if (media === undefined) return '<p role="status">Attachment unavailable</p>';
  const label = stringValue(await bindingValue(node, 'label', state)) || 'Download attachment';
  return `<a data-studio-part="action" href="${escapeAttribute(media.src)}"${node.properties.download === false ? '' : ' download'}>${escapeHtml(label)}</a>`;
}

async function source(
  node: Readonly<BlueprintNode>,
  language: string,
  state: RenderState,
): Promise<string> {
  const value = stringValue(await bindingValue(node, 'source', state));
  const selected = stringProperty(node.properties.language, language);
  return `<pre data-studio-part="content"><code data-language="${escapeAttribute(selected)}">${escapeHtml(value)}</code></pre>`;
}

async function math(
  node: Readonly<BlueprintNode>,
  scope: string,
  state: RenderState,
): Promise<string> {
  const sourceValue = stringValue(await bindingValue(node, 'source', state));
  const displayMode = node.properties.displayMode !== false;
  state.enhancements.push({
    displayMode,
    kind: 'math',
    nodeId: node.id,
    scope,
    source: sourceValue,
  });
  return `<code data-studio-math-source>${escapeHtml(sourceValue)}</code>`;
}

async function diagram(
  node: Readonly<BlueprintNode>,
  scope: string,
  state: RenderState,
): Promise<string> {
  const sourceValue = stringValue(await bindingValue(node, 'source', state));
  state.enhancements.push({ kind: 'diagram', nodeId: node.id, scope, source: sourceValue });
  return `<pre data-studio-diagram-source><code>${escapeHtml(sourceValue)}</code></pre>`;
}

async function chart(
  node: Readonly<BlueprintNode>,
  scope: string,
  state: RenderState,
): Promise<string> {
  let spec: StudioChartSpec;
  try {
    spec = parseStudioChartSpec(await bindingValue(node, 'chart', state));
  } catch {
    return '<p role="status">Chart data unavailable</p>';
  }
  state.enhancements.push({ kind: 'chart', nodeId: node.id, scope, spec });
  const head = spec.labels.map((label) => `<th scope="col">${escapeHtml(label)}</th>`).join('');
  const rows = spec.datasets
    .map(
      (dataset) =>
        `<tr><th scope="row">${escapeHtml(dataset.label)}</th>${dataset.values.map((value) => `<td>${escapeHtml(String(value))}</td>`).join('')}</tr>`,
    )
    .join('');
  return `${spec.title === undefined ? '' : `<h3 data-studio-part="heading">${escapeHtml(spec.title)}</h3>`}<div data-studio-chart-visual aria-hidden="true"></div><table data-studio-chart-table><thead><tr><th scope="col">Series</th>${head}</tr></thead><tbody>${rows}</tbody></table>`;
}

async function drawing(node: Readonly<BlueprintNode>, state: RenderState): Promise<string> {
  let value: StudioDrawingDocument;
  try {
    value = parseStudioDrawingDocument(await bindingValue(node, 'drawing', state));
  } catch {
    return '<p role="status">Drawing unavailable</p>';
  }
  const strokes = value.strokes
    .map(
      (stroke) =>
        `<polyline fill="none" stroke="${stroke.color.startsWith('#') ? stroke.color : 'currentColor'}" stroke-width="${stroke.width}" points="${stroke.points.map((point) => `${point.x},${point.y}`).join(' ')}"></polyline>`,
    )
    .join('');
  return `<svg data-studio-part="media" viewBox="0 0 ${value.width} ${value.height}" role="img" aria-label="${escapeAttribute(value.alt)}" xmlns="http://www.w3.org/2000/svg">${strokes}</svg>`;
}

async function embed(node: Readonly<BlueprintNode>, state: RenderState): Promise<string> {
  const resource = parseResource(await bindingValue(node, 'resource', state));
  return resource === undefined
    ? '<p role="status">Embedded resource unavailable</p>'
    : renderResource(resource, true);
}

async function callToAction(node: Readonly<BlueprintNode>, state: RenderState): Promise<string> {
  const label = stringValue(await bindingValue(node, 'label', state));
  const href = safeUrl(stringProperty(node.properties.href, ''));
  return href === undefined
    ? `<span data-studio-part="action">${escapeHtml(label)}</span>`
    : `<a data-studio-part="action" href="${escapeAttribute(href)}">${escapeHtml(label)}</a>`;
}

async function card(node: Readonly<BlueprintNode>, state: RenderState): Promise<string> {
  const media = await resolvedMedia(await bindingValue(node, 'media', state), state);
  const title = stringValue(await bindingValue(node, 'title', state));
  const summary = await bindingValue(node, 'summary', state);
  let body: string;
  try {
    body = renderRichText(parseRichTextDocument(summary));
  } catch {
    body = escapeHtml(stringValue(summary));
  }
  return `<article>${media === undefined ? '' : `<img data-studio-part="media" src="${escapeAttribute(media.src)}" alt="${escapeAttribute(media.altText)}"${mediaDimensions(media)}>`}<h3 data-studio-part="heading">${escapeHtml(title)}</h3><div data-studio-part="content">${body}</div><div data-studio-part="action">${await children(node, 'actions', state)}</div></article>`;
}

async function accordionItem(node: Readonly<BlueprintNode>, state: RenderState): Promise<string> {
  const title = stringValue(await bindingValue(node, 'title', state));
  return `<details${node.properties.expanded === true ? ' open' : ''}><summary>${escapeHtml(title)}</summary><div data-studio-part="content">${await children(node, 'content', state)}</div></details>`;
}

async function tabs(
  node: Readonly<BlueprintNode>,
  scope: string,
  state: RenderState,
): Promise<string> {
  const activation = node.properties.activation === 'manual' ? 'manual' : 'automatic';
  state.enhancements.push({ activation, kind: 'tabs', nodeId: node.id, scope });
  const tabNodes = node.slots.items ?? [];
  const buttons = await Promise.all(
    tabNodes.map(
      async (tabNode, index) =>
        `<button type="button" data-studio-tab="${index}">${escapeHtml(stringValue(await bindingValue(tabNode, 'title', state)))}</button>`,
    ),
  );
  return `<div data-studio-tabs><div data-studio-tab-list hidden>${buttons.join('')}</div><div data-studio-part="content">${(await Promise.all(tabNodes.map((tabNode) => renderNode(tabNode, state)))).join('')}</div></div>`;
}

async function tab(node: Readonly<BlueprintNode>, state: RenderState): Promise<string> {
  const title = stringValue(await bindingValue(node, 'title', state));
  return `<section data-studio-tab-panel><h3 data-studio-part="heading">${escapeHtml(title)}</h3><div data-studio-part="content">${await children(node, 'content', state)}</div></section>`;
}

async function callout(node: Readonly<BlueprintNode>, state: RenderState): Promise<string> {
  const title = stringValue(await bindingValue(node, 'title', state));
  const content = await bindingValue(node, 'content', state);
  let body: string;
  try {
    body = renderRichText(parseRichTextDocument(content));
  } catch {
    body = escapeHtml(stringValue(content));
  }
  const candidateTone = typeof node.properties.tone === 'string' ? node.properties.tone : '';
  const tone = ['danger', 'information', 'success', 'warning'].includes(candidateTone)
    ? candidateTone
    : 'information';
  return `<aside role="note" data-studio-tone="${tone}"><h3 data-studio-part="heading">${escapeHtml(title)}</h3><div data-studio-part="content">${body}</div></aside>`;
}

async function contentReference(
  node: Readonly<BlueprintNode>,
  state: RenderState,
): Promise<string> {
  const resource = parseResource(await bindingValue(node, 'item', state));
  return resource === undefined
    ? '<p role="status">Content unavailable</p>'
    : renderResource(resource, node.properties.presentation !== 'title');
}

async function contentCollection(
  node: Readonly<BlueprintNode>,
  scope: string,
  state: RenderState,
): Promise<string> {
  const value = await bindingValue(node, 'items', state);
  const resources = (Array.isArray(value) ? value : [])
    .map(parseResource)
    .filter((item): item is ResolvedWebResource => item !== undefined)
    .slice(0, integerProperty(node.properties.limit, 1, 100, 12));
  const candidatePresentation =
    typeof node.properties.presentation === 'string' ? node.properties.presentation : '';
  const presentation = ['cards', 'grid', 'list', 'slideshow'].includes(candidatePresentation)
    ? candidatePresentation
    : 'cards';
  if (presentation === 'slideshow')
    state.enhancements.push({ autoplay: false, kind: 'slideshow', nodeId: node.id, scope });
  return `<div data-studio-collection="${presentation}" data-studio-part="content">${resources.map((resource, index) => `<article${presentation === 'slideshow' ? ` data-studio-slide="${index}"` : ''}>${renderResource(resource, true)}</article>`).join('')}</div>`;
}

async function money(node: Readonly<BlueprintNode>, state: RenderState): Promise<string> {
  try {
    const value = parseStudioMoneyValue(await bindingValue(node, 'amount', state));
    return `<data value="${escapeAttribute(`${value.currency} ${value.amount}`)}">${escapeHtml(`${value.amount} ${value.currency}`)}</data>`;
  } catch {
    return '<span role="status">Amount unavailable</span>';
  }
}

async function children(
  node: Readonly<BlueprintNode>,
  slot: string,
  state: RenderState,
): Promise<string> {
  return (
    await Promise.all((node.slots[slot] ?? []).map((child) => renderNode(child, state)))
  ).join('');
}

function bindingValue(node: Readonly<BlueprintNode>, port: string, state: RenderState): unknown {
  if (state.context.resolveBinding !== undefined) return state.context.resolveBinding(node, port);
  const binding = node.bindings[port];
  return binding?.source.kind === 'static-value' ? binding.source.value : undefined;
}

async function resolvedMedia(
  value: unknown,
  state: RenderState,
): Promise<ResolvedWebMedia | undefined> {
  if (!isMediaReference(value) || state.context.resolveMedia === undefined) return undefined;
  const media = await state.context.resolveMedia(value);
  const src = safeUrl(media.src);
  return src === undefined ? undefined : { ...media, src };
}

function isMediaReference(value: unknown): value is MediaReference {
  return isRecord(value) && value.kind === 'media-reference' && typeof value.assetId === 'string';
}

function parseResource(value: unknown): ResolvedWebResource | undefined {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.label !== 'string')
    return undefined;
  const result: ResolvedWebResource = { id: value.id, label: value.label };
  if (typeof value.summary === 'string') result.summary = value.summary;
  if (typeof value.url === 'string') {
    const url = safeUrl(value.url);
    if (url !== undefined) result.url = url;
  }
  return result;
}

function renderResource(resource: Readonly<ResolvedWebResource>, summary: boolean): string {
  const content = `<span>${escapeHtml(resource.label)}</span>${summary && resource.summary !== undefined ? `<p>${escapeHtml(resource.summary)}</p>` : ''}`;
  return resource.url === undefined
    ? content
    : `<a href="${escapeAttribute(resource.url)}">${content}</a>`;
}

function renderRichText(document: Readonly<StudioRichTextDocument>): string {
  return document.content.map(renderRichTextNode).join('');
}

function renderRichTextNode(node: Readonly<StudioRichTextNode>): string {
  const childrenValue = (node.content ?? []).map(renderRichTextNode).join('');
  switch (node.type) {
    case 'doc':
      return childrenValue;
    case 'paragraph':
      return `<p>${childrenValue}</p>`;
    case 'heading':
      return `<h${headingLevel(node.attrs?.level)}>${childrenValue}</h${headingLevel(node.attrs?.level)}>`;
    case 'blockquote':
      return `<blockquote>${childrenValue}</blockquote>`;
    case 'bulletList':
      return `<ul>${childrenValue}</ul>`;
    case 'orderedList':
      return `<ol${typeof node.attrs?.start === 'number' ? ` start="${node.attrs.start}"` : ''}>${childrenValue}</ol>`;
    case 'listItem':
      return `<li>${childrenValue}</li>`;
    case 'horizontalRule':
      return '<hr>';
    case 'hardBreak':
      return '<br>';
    case 'text':
      return applyMarks(escapeHtml(node.text ?? ''), node.marks?.map((mark) => mark.type) ?? []);
    default:
      return '';
  }
}

function applyMarks(value: string, marks: readonly string[]): string {
  const order = ['bold', 'italic', 'strike', 'code'];
  return order.reduce(
    (current, mark) =>
      marks.includes(mark)
        ? `<${mark === 'bold' ? 'strong' : mark === 'italic' ? 'em' : mark === 'strike' ? 'del' : 'code'}>${current}</${mark === 'bold' ? 'strong' : mark === 'italic' ? 'em' : mark === 'strike' ? 'del' : 'code'}>`
        : current,
    value,
  );
}

function headingLevel(value: JsonValue | undefined): 2 | 3 | 4 {
  return value === 3 || value === 4 ? value : 2;
}

function isSafeMarkupFragment(value: unknown): value is SafeMarkupFragment {
  return (
    isRecord(value) &&
    value.kind === 'safe-markup-fragment' &&
    Array.isArray(value.nodes) &&
    typeof value.policy === 'string'
  );
}

function mediaDimensions(media: Readonly<ResolvedWebMedia>): string {
  return `${media.width === undefined ? '' : ` width="${positiveInteger(media.width)}"`}${media.height === undefined ? '' : ` height="${positiveInteger(media.height)}"`}`;
}

function positiveInteger(value: number): number {
  return Number.isInteger(value) && value > 0 && value <= 100_000 ? value : 1;
}

function integerProperty(
  value: JsonValue | undefined,
  minimum: number,
  maximum: number,
  fallback: number,
): number {
  return typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= minimum &&
    value <= maximum
    ? value
    : fallback;
}

function stringProperty(value: JsonValue | undefined, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function safeUrl(value: string): string | undefined {
  if (value.startsWith('/') || value.startsWith('#')) return value;
  return /^https:\/\/[A-Za-z0-9.-]+(?::[0-9]+)?(?:[/#?]|$)/u.test(value) ? value : undefined;
}

function blockName(type: string): string {
  return type.slice(type.indexOf('/') + 1);
}

function scopeFor(nodeId: string): string {
  let hash = 2_166_136_261;
  for (const character of nodeId) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16_777_619);
  }
  return `s${(hash >>> 0).toString(36)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
