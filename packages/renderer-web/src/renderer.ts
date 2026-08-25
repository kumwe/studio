import {
  CORE_PRODUCTION_BLOCK_TYPES,
  parseStudioChartSpec,
  parseStudioDrawingDocument,
  parseStudioMoneyValue,
  parseStudioPresentationIntent,
  parseStudioTableDocument,
} from '@kumwe/studio-core';
import type {
  BlueprintDocument,
  BlueprintNode,
  JsonValue,
  MediaReference,
  StudioChartSpec,
  StudioDrawingDocument,
  StudioPresentationIntent,
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
.studio-visually-hidden{block-size:1px;clip-path:inset(50%);inline-size:1px;overflow:hidden;position:absolute;white-space:nowrap}
[data-studio-align="center"]{text-align:center}[data-studio-align="end"]{text-align:end}[data-studio-align="stretch"]{align-self:stretch}
[data-studio-height="content"]{block-size:fit-content}[data-studio-height="full"]{block-size:100%}[data-studio-height="viewport"]{min-block-size:100dvb}
[data-studio-inverse="true"]{background:var(--studio-inverse-background,CanvasText);color:var(--studio-inverse-foreground,Canvas)}
[data-studio-margin="none"]{margin:0}[data-studio-margin="compact"]{margin:.5rem}[data-studio-margin="comfortable"]{margin:1rem}[data-studio-margin="spacious"]{margin:2rem}
[data-studio-padding="none"]{padding:0}[data-studio-padding="compact"]{padding:.5rem}[data-studio-padding="comfortable"]{padding:1rem}[data-studio-padding="spacious"]{padding:2rem}
[data-studio-marker="none"]{list-style:none}[data-studio-marker="disc"]{list-style:disc}[data-studio-marker="decimal"]{list-style:decimal}[data-studio-marker="check"]{list-style:"✓  "}
[data-studio-position="relative"]{position:relative}[data-studio-position="sticky"]{inset-block-start:0;position:sticky;z-index:10}
[data-studio-scroll="auto"]{overflow:auto}[data-studio-scroll="clip"]{overflow:clip}[data-studio-scroll="snap"]{overflow:auto;scroll-snap-type:block mandatory}
[data-studio-width="content"]{inline-size:fit-content;max-inline-size:100%}[data-studio-width="full"]{inline-size:100%}
[data-studio-print="only"]{display:none}[data-studio-visible-compact="hidden"]{display:none}
[data-studio-motion]{opacity:0;transition:opacity .25s ease,transform .25s ease}[data-studio-motion="scale"]{transform:scale(.98)}[data-studio-motion="slide"]{transform:translateY(1rem)}[data-studio-motion-visible]{opacity:1;transform:none}[data-studio-motion="parallax"]{opacity:1;transform:translateY(var(--studio-parallax-offset,0))}
@media (min-width:48rem){[data-studio-visible-medium="hidden"]{display:none}[data-studio-visible-medium="visible"]{display:block}}
@media (min-width:75rem){[data-studio-visible-expanded="hidden"]{display:none}[data-studio-visible-expanded="visible"]{display:block}}
@media print{[data-studio-print="hide"]{display:none!important}[data-studio-print="only"]{display:block}}
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
[data-studio-dialog],[data-studio-popover]{position:relative}
[data-studio-dialog] summary,[data-studio-popover] summary{cursor:pointer}
[data-studio-dialog-panel],[data-studio-popover-panel]{background:Canvas;border:1px solid currentColor;color:CanvasText;max-block-size:min(80vh,50rem);max-inline-size:min(90vw,50rem);overflow:auto;padding:1rem}
[data-studio-dialog][open][data-studio-dialog-modal="true"] [data-studio-dialog-panel]{inset:50% auto auto 50%;position:fixed;transform:translate(-50%,-50%);z-index:1000}
[data-studio-dialog-presentation="offcanvas"][open] [data-studio-dialog-panel]{block-size:100dvb;inset:0 0 0 auto;max-block-size:none;max-inline-size:min(90vw,30rem);position:fixed;transform:none;z-index:1000}
[data-studio-dialog-presentation="overlay"][open] [data-studio-dialog-panel]{inset:auto 1rem 1rem;max-inline-size:none;position:fixed;z-index:1000}
[data-studio-popover-panel]{inset-block-start:100%;inset-inline-start:0;position:absolute;z-index:100}
[data-studio-popover-placement="top"] [data-studio-popover-panel]{inset-block:auto 100%}
[data-studio-notice]{border-inline-start:.25rem solid currentColor;padding:.75rem 1rem}
[data-studio-cover]{display:grid;isolation:isolate;min-block-size:20rem;overflow:hidden;place-items:center;position:relative}[data-studio-cover] img{block-size:100%;inline-size:100%;inset:0;object-fit:cover;position:absolute;z-index:-2}[data-studio-cover]::after{background:rgb(0 0 0/var(--studio-cover-overlay,.35));content:"";inset:0;position:absolute;z-index:-1}
[data-studio-navigation] ul{display:flex;flex-wrap:wrap;gap:.75rem;list-style:none;margin:0;padding:0}[data-studio-navigation="breadcrumbs"] li+li::before{content:"/";margin-inline-end:.75rem}[data-studio-navigation="navbar"]{align-items:center;display:flex;justify-content:space-between}
[data-studio-badge],[data-studio-label]{border-radius:.25rem;display:inline-block;padding:.15em .5em}[data-studio-badge="soft"]{opacity:.85}[data-studio-badge="outline"]{border:1px solid currentColor}
[data-studio-spinner]{animation:studio-spin 1s linear infinite;border:.2em solid currentColor;border-inline-end-color:transparent;border-radius:50%;block-size:1.5em;display:inline-block;inline-size:1.5em}@keyframes studio-spin{to{transform:rotate(1turn)}}
[data-studio-lightbox-dialog]{background:Canvas;color:CanvasText;inline-size:min(90vw,70rem);max-block-size:90dvb;padding:1rem}[data-studio-lightbox-dialog] img{block-size:auto;max-block-size:75dvb;max-inline-size:100%}
[data-studio-chart-table]{border-collapse:collapse;inline-size:100%}
[data-studio-chart-table] th,[data-studio-chart-table] td{border:1px solid currentColor;padding:.35rem;text-align:end}
[data-studio-chart-table] th:first-child{text-align:start}
@media (prefers-reduced-motion:reduce){[data-studio-gallery="slideshow"] [data-studio-part="content"]{scroll-behavior:auto}[data-studio-motion]{opacity:1!important;transform:none!important;transition:none!important}}
`.trim();

interface RenderState {
  context: Readonly<StudioWebRenderContext>;
  css: string[];
  enhancements: StudioWebEnhancement[];
}

/** Render a Blueprint through the portable semantic web profile. */
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
  const presentation = presentationAttributes(node, scope, state);
  return `<div data-studio-block="${escapeAttribute(blockName(node.type))}" data-studio-node="${escapeAttribute(node.id)}" data-studio-scope="${scope}"${presentation}>${content}</div>`;
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
    case CORE_PRODUCTION_BLOCK_TYPES.dialog:
      return dialog(node, scope, state);
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
    case CORE_PRODUCTION_BLOCK_TYPES.notice:
      return notice(node, scope, state);
    case CORE_PRODUCTION_BLOCK_TYPES.popover:
      return popover(node, scope, state);
    case CORE_PRODUCTION_BLOCK_TYPES.article:
      return article(node, state);
    case CORE_PRODUCTION_BLOCK_TYPES.badge:
      return badge(node, state);
    case CORE_PRODUCTION_BLOCK_TYPES.countdown:
      return countdown(node, scope, state);
    case CORE_PRODUCTION_BLOCK_TYPES.cover:
      return cover(node, scope, state);
    case CORE_PRODUCTION_BLOCK_TYPES.descriptionItem:
      return descriptionItem(node, state);
    case CORE_PRODUCTION_BLOCK_TYPES.descriptionList:
      return descriptionList(node, state);
    case CORE_PRODUCTION_BLOCK_TYPES.divider:
      return divider(node, state);
    case CORE_PRODUCTION_BLOCK_TYPES.icon:
      return icon(node, state);
    case CORE_PRODUCTION_BLOCK_TYPES.label:
      return label(node, state);
    case CORE_PRODUCTION_BLOCK_TYPES.navigation:
      return navigation(node, state);
    case CORE_PRODUCTION_BLOCK_TYPES.navigationItem:
      return navigationItem(node, state);
    case CORE_PRODUCTION_BLOCK_TYPES.progress:
      return progress(node, state);
    case CORE_PRODUCTION_BLOCK_TYPES.search:
      return search(node, state);
    case CORE_PRODUCTION_BLOCK_TYPES.spinner:
      return spinner(node, state);
    case CORE_PRODUCTION_BLOCK_TYPES.table:
      return table(node, state);
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
  const lightbox = node.properties.lightbox === true;
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
  if (lightbox && media.length > 0) {
    state.enhancements.push({ kind: 'lightbox', nodeId: node.id, scope });
  }
  const items = media
    .map(
      (item, index) =>
        `<figure data-studio-slide="${index}">${lightbox ? `<a data-studio-lightbox-open="${index}" href="${escapeAttribute(item.src)}">` : ''}<img data-studio-part="media" src="${escapeAttribute(item.src)}" alt="${escapeAttribute(item.altText)}"${mediaDimensions(item)}>${lightbox ? '</a>' : ''}${item.caption === undefined ? '' : `<figcaption>${escapeHtml(item.caption)}</figcaption>`}</figure>`,
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

async function dialog(
  node: Readonly<BlueprintNode>,
  scope: string,
  state: RenderState,
): Promise<string> {
  const trigger = stringValue(await bindingValue(node, 'triggerLabel', state)) || 'Open dialog';
  const title = stringValue(await bindingValue(node, 'title', state)) || 'Dialog';
  const modal = node.properties.modal !== false;
  const candidatePresentation = stringProperty(node.properties.presentation, '');
  const presentation = ['modal', 'offcanvas', 'overlay'].includes(candidatePresentation)
    ? candidatePresentation
    : 'modal';
  state.enhancements.push({ kind: 'dialog', modal, nodeId: node.id, scope });
  return `<details data-studio-dialog data-studio-dialog-modal="${String(modal)}" data-studio-dialog-presentation="${presentation}"><summary data-studio-dialog-trigger>${escapeHtml(trigger)}</summary><section data-studio-dialog-panel role="dialog" aria-modal="${String(modal)}" aria-labelledby="${scope}-dialog-title" tabindex="-1"><h2 data-studio-part="heading" id="${scope}-dialog-title">${escapeHtml(title)}</h2><div data-studio-part="content">${await children(node, 'content', state)}</div><button type="button" data-studio-dialog-close>Close</button></section></details>`;
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

async function notice(
  node: Readonly<BlueprintNode>,
  scope: string,
  state: RenderState,
): Promise<string> {
  const title = stringValue(await bindingValue(node, 'title', state));
  const content = await bindingValue(node, 'content', state);
  const candidate = typeof node.properties.tone === 'string' ? node.properties.tone : '';
  const tone = ['comment', 'error', 'information', 'success', 'warning'].includes(candidate)
    ? candidate
    : 'information';
  const assertive = tone === 'error' || tone === 'warning';
  const dismissible = node.properties.dismissible === true;
  if (dismissible) state.enhancements.push({ kind: 'notice', nodeId: node.id, scope });
  let body: string;
  try {
    body = renderRichText(parseRichTextDocument(content));
  } catch {
    body = escapeHtml(stringValue(content));
  }
  return `<aside data-studio-notice data-studio-tone="${tone}" role="${assertive ? 'alert' : 'status'}" aria-live="${assertive ? 'assertive' : 'polite'}">${title.length === 0 ? '' : `<h3 data-studio-part="heading">${escapeHtml(title)}</h3>`}<div data-studio-part="content">${body}</div>${dismissible ? '<button type="button" data-studio-notice-dismiss>Dismiss</button>' : ''}</aside>`;
}

async function popover(
  node: Readonly<BlueprintNode>,
  scope: string,
  state: RenderState,
): Promise<string> {
  const trigger = stringValue(await bindingValue(node, 'triggerLabel', state)) || 'Show details';
  const title = stringValue(await bindingValue(node, 'title', state));
  const candidate = typeof node.properties.placement === 'string' ? node.properties.placement : '';
  const placement = ['auto', 'bottom', 'left', 'right', 'top'].includes(candidate)
    ? candidate
    : 'auto';
  const candidatePresentation = stringProperty(node.properties.presentation, '');
  const presentation =
    candidatePresentation === 'dropbar' ||
    candidatePresentation === 'dropdown' ||
    candidatePresentation === 'tooltip'
      ? candidatePresentation
      : 'popover';
  state.enhancements.push({
    dismissOnBlur: node.properties.dismissOnBlur !== false,
    kind: 'popover',
    nodeId: node.id,
    presentation,
    scope,
  });
  return `<details data-studio-popover data-studio-popover-placement="${placement}" data-studio-popover-presentation="${presentation}"><summary data-studio-popover-trigger>${escapeHtml(trigger)}</summary><aside data-studio-popover-panel role="${presentation === 'tooltip' ? 'tooltip' : 'region'}" aria-labelledby="${scope}-popover-title" tabindex="-1">${title.length === 0 ? `<span class="studio-visually-hidden" id="${scope}-popover-title">${escapeHtml(trigger)}</span>` : `<h3 data-studio-part="heading" id="${scope}-popover-title">${escapeHtml(title)}</h3>`}<div data-studio-part="content">${await children(node, 'content', state)}</div></aside></details>`;
}

async function article(node: Readonly<BlueprintNode>, state: RenderState): Promise<string> {
  const title = stringValue(await bindingValue(node, 'title', state));
  return `<article>${title.length === 0 ? '' : `<h2 data-studio-part="heading">${escapeHtml(title)}</h2>`}<div data-studio-part="content">${await children(node, 'content', state)}</div></article>`;
}

async function badge(node: Readonly<BlueprintNode>, state: RenderState): Promise<string> {
  const appearance = ['outline', 'soft', 'solid'].includes(
    stringProperty(node.properties.appearance, ''),
  )
    ? stringProperty(node.properties.appearance, '')
    : 'solid';
  return `<span data-studio-badge="${appearance}" data-studio-tone="${toneProperty(node.properties.tone)}">${escapeHtml(stringValue(await bindingValue(node, 'label', state)))}</span>`;
}

async function countdown(
  node: Readonly<BlueprintNode>,
  scope: string,
  state: RenderState,
): Promise<string> {
  const target = stringValue(await bindingValue(node, 'target', state));
  const timestamp = Date.parse(target);
  if (!Number.isFinite(timestamp)) return '<span role="status">Countdown unavailable</span>';
  const targetIso = new Date(timestamp).toISOString();
  const completionMessage = stringValue(await bindingValue(node, 'completionMessage', state));
  const display = node.properties.display === 'compact' ? 'compact' : 'detailed';
  const expiredBehavior = ['hide', 'message', 'zero'].includes(
    stringProperty(node.properties.expiredBehavior, ''),
  )
    ? (stringProperty(node.properties.expiredBehavior, '') as 'hide' | 'message' | 'zero')
    : 'zero';
  state.enhancements.push({
    completionMessage,
    display,
    expiredBehavior,
    kind: 'countdown',
    nodeId: node.id,
    scope,
    target: targetIso,
  });
  return `<time data-studio-countdown datetime="${targetIso}" aria-live="polite"><span data-studio-countdown-value>${escapeHtml(targetIso)}</span><span data-studio-countdown-complete hidden>${escapeHtml(completionMessage)}</span></time>`;
}

async function cover(
  node: Readonly<BlueprintNode>,
  scope: string,
  state: RenderState,
): Promise<string> {
  const background = await resolvedMedia(await bindingValue(node, 'background', state), state);
  const overlay = stringProperty(node.properties.overlay, 'medium');
  const opacity =
    overlay === 'none' ? 0 : overlay === 'light' ? 0.2 : overlay === 'strong' ? 0.65 : 0.4;
  state.css.push(`[data-studio-scope="${scope}"]{--studio-cover-overlay:${opacity}}`);
  const alignment = ['center', 'end', 'start'].includes(
    stringProperty(node.properties.alignment, ''),
  )
    ? stringProperty(node.properties.alignment, '')
    : 'center';
  return `<section data-studio-cover data-studio-cover-align="${alignment}">${background === undefined ? '' : `<img src="${escapeAttribute(background.src)}" alt="" aria-hidden="true"${mediaDimensions(background)}>`}<div data-studio-part="content">${await children(node, 'content', state)}</div></section>`;
}

async function descriptionItem(node: Readonly<BlueprintNode>, state: RenderState): Promise<string> {
  const term = stringValue(await bindingValue(node, 'term', state));
  const description = await bindingValue(node, 'description', state);
  let body: string;
  try {
    body = renderRichText(parseRichTextDocument(description));
  } catch {
    body = escapeHtml(stringValue(description));
  }
  return `<div data-studio-description-item><dt>${escapeHtml(term)}</dt><dd>${body}</dd></div>`;
}

async function descriptionList(node: Readonly<BlueprintNode>, state: RenderState): Promise<string> {
  const title = stringValue(await bindingValue(node, 'title', state));
  const items = await Promise.all(
    (node.slots.items ?? []).map((item) => descriptionItem(item, state)),
  );
  return `${title.length === 0 ? '' : `<h3 data-studio-part="heading">${escapeHtml(title)}</h3>`}<dl>${items.join('')}</dl>`;
}

async function divider(node: Readonly<BlueprintNode>, state: RenderState): Promise<string> {
  const style = ['dashed', 'dotted', 'solid'].includes(stringProperty(node.properties.style, ''))
    ? stringProperty(node.properties.style, '')
    : 'solid';
  const label = stringValue(await bindingValue(node, 'label', state));
  return `<hr data-studio-divider="${style}"${label.length === 0 ? '' : ` aria-label="${escapeAttribute(label)}"`}>`;
}

async function icon(node: Readonly<BlueprintNode>, state: RenderState): Promise<string> {
  const candidate = stringProperty(node.properties.name, 'symbol');
  const name = /^[a-z][a-z0-9-]{0,62}(?:\/[a-z][a-z0-9-]{0,62})?$/u.test(candidate)
    ? candidate
    : 'symbol';
  const decorative = node.properties.decorative !== false;
  const alternative = stringValue(await bindingValue(node, 'alternativeText', state)) || 'Icon';
  return `<span data-studio-icon="${escapeAttribute(name)}" aria-hidden="true"></span>${decorative ? '' : `<span class="studio-visually-hidden">${escapeHtml(alternative)}</span>`}`;
}

async function label(node: Readonly<BlueprintNode>, state: RenderState): Promise<string> {
  return `<span data-studio-label data-studio-tone="${toneProperty(node.properties.tone)}">${escapeHtml(stringValue(await bindingValue(node, 'text', state)))}</span>`;
}

async function navigation(node: Readonly<BlueprintNode>, state: RenderState): Promise<string> {
  const candidate = stringProperty(node.properties.presentation, '');
  const presentation = [
    'breadcrumbs',
    'dotnav',
    'dropnav',
    'navbar',
    'nav',
    'pagination',
    'subnav',
    'thumbnav',
  ].includes(candidate)
    ? candidate
    : 'nav';
  const accessibleLabel = stringValue(await bindingValue(node, 'label', state)) || 'Navigation';
  const items = await Promise.all(
    (node.slots.items ?? []).map((item) => navigationItem(item, state)),
  );
  return `<nav data-studio-navigation="${presentation}" aria-label="${escapeAttribute(accessibleLabel)}"><ul>${items.join('')}</ul></nav>`;
}

async function navigationItem(node: Readonly<BlueprintNode>, state: RenderState): Promise<string> {
  const labelValue = stringValue(await bindingValue(node, 'label', state));
  const href = safeUrl(stringProperty(node.properties.href, ''));
  const labelMarkup =
    href === undefined
      ? `<span>${escapeHtml(labelValue)}</span>`
      : `<a href="${escapeAttribute(href)}"${node.properties.current === true ? ' aria-current="page"' : ''}>${escapeHtml(labelValue)}</a>`;
  const childItems = await Promise.all(
    (node.slots.children ?? []).map((item) => navigationItem(item, state)),
  );
  return `<li data-studio-navigation-item data-studio-node="${escapeAttribute(node.id)}">${labelMarkup}${childItems.length === 0 ? '' : `<ul>${childItems.join('')}</ul>`}</li>`;
}

async function progress(node: Readonly<BlueprintNode>, state: RenderState): Promise<string> {
  const maximum = integerProperty(node.properties.maximum, 1, 1_000_000, 100);
  const candidate = await bindingValue(node, 'value', state);
  const value =
    typeof candidate === 'number' && Number.isFinite(candidate)
      ? Math.max(0, Math.min(maximum, candidate))
      : 0;
  const labelValue = stringValue(await bindingValue(node, 'label', state)) || 'Progress';
  return `<label>${escapeHtml(labelValue)} <progress max="${maximum}" value="${value}">${value} / ${maximum}</progress></label>`;
}

async function search(node: Readonly<BlueprintNode>, state: RenderState): Promise<string> {
  const action = safeUrl(stringProperty(node.properties.action, ''));
  const candidate = stringProperty(node.properties.queryParameter, 'q');
  const parameter = /^[A-Za-z][A-Za-z0-9_-]{0,99}$/u.test(candidate) ? candidate : 'q';
  const labelValue = stringValue(await bindingValue(node, 'label', state)) || 'Search';
  const placeholder = stringValue(await bindingValue(node, 'placeholder', state));
  return `<form role="search" method="get"${action === undefined ? '' : ` action="${escapeAttribute(action)}"`}><label>${escapeHtml(labelValue)} <input type="search" name="${parameter}"${placeholder.length === 0 ? '' : ` placeholder="${escapeAttribute(placeholder)}"`}></label><button type="submit">Search</button></form>`;
}

async function spinner(node: Readonly<BlueprintNode>, state: RenderState): Promise<string> {
  const labelValue = stringValue(await bindingValue(node, 'label', state)) || 'Loading';
  if (node.properties.active === false)
    return `<span role="status">${escapeHtml(labelValue)}</span>`;
  const size = ['large', 'medium', 'small'].includes(stringProperty(node.properties.size, ''))
    ? stringProperty(node.properties.size, '')
    : 'medium';
  return `<span role="status"><span data-studio-spinner data-studio-spinner-size="${size}" aria-hidden="true"></span><span class="studio-visually-hidden">${escapeHtml(labelValue)}</span></span>`;
}

async function table(node: Readonly<BlueprintNode>, state: RenderState): Promise<string> {
  try {
    const value = parseStudioTableDocument(await bindingValue(node, 'table', state));
    const headings = value.columns
      .map((column) => `<th scope="col">${escapeHtml(column)}</th>`)
      .join('');
    const rows = value.rows
      .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`)
      .join('');
    return `<table data-studio-table>${value.caption === undefined ? '' : `<caption>${escapeHtml(value.caption)}</caption>`}<thead><tr>${headings}</tr></thead><tbody>${rows}</tbody></table>`;
  } catch {
    return '<p role="status">Table data unavailable</p>';
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
  const src = safeMediaUrl(media, state.context.allowBlobMedia === true);
  return src === undefined ? undefined : { ...media, src };
}

function safeMediaUrl(media: Readonly<ResolvedWebMedia>, allowBlob: boolean): string | undefined {
  const ordinary = safeUrl(media.src);
  if (ordinary !== undefined) return ordinary;
  if (
    !allowBlob ||
    !/^blob:https?:\/\/[A-Za-z0-9.-]+(?::[0-9]+)?\/[A-Za-z0-9._~-]+$/u.test(media.src)
  ) {
    return undefined;
  }
  const mediaType = media.mediaType?.toLowerCase();
  if (
    mediaType === 'image/svg+xml' ||
    mediaType === 'text/html' ||
    mediaType === 'application/xhtml+xml'
  ) {
    return undefined;
  }
  return media.src;
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

function toneProperty(value: JsonValue | undefined): string {
  const candidate = stringProperty(value, 'neutral');
  return ['error', 'information', 'neutral', 'success', 'warning'].includes(candidate)
    ? candidate
    : 'neutral';
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

function presentationAttributes(
  node: Readonly<BlueprintNode>,
  scope: string,
  state: RenderState,
): string {
  if (node.properties.design === undefined) return '';
  let intent: StudioPresentationIntent;
  try {
    intent = parseStudioPresentationIntent(node.properties.design);
  } catch {
    return '';
  }
  if (intent.animation !== undefined && intent.animation !== 'none') {
    state.enhancements.push({
      animation: intent.animation,
      kind: 'motion',
      nodeId: node.id,
      scope,
    });
  }
  const attributes: [string, boolean | string | undefined][] = [
    ['align', intent.align],
    ['animation', intent.animation],
    ['height', intent.height],
    ['inverse', intent.inverse],
    ['margin', intent.margin],
    ['marker', intent.marker],
    ['padding', intent.padding],
    ['position', intent.position],
    ['print', intent.print],
    ['scroll', intent.scrolling],
    ['visible-compact', intent.visibility?.compact],
    ['visible-medium', intent.visibility?.medium],
    ['visible-expanded', intent.visibility?.expanded],
    ['width', intent.width],
  ];
  return attributes
    .filter(([, value]) => value !== undefined)
    .map(([name, value]) => ` data-studio-${name}="${escapeAttribute(String(value))}"`)
    .join('');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
