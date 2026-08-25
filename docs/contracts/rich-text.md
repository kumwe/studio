# Rich text contract

## Canonical grammar

Bounded structured rich text is stored as JSON conforming to
[`rich-text.schema.json`](../../schemas/rich-text.schema.json). The portable `0.1-draft` profile is
closed:

- block nodes: `paragraph`, `heading` (levels 2–4), `blockquote`, `bulletList`, `orderedList`
  (positive `start`), `listItem`, `horizontalRule`;
- inline nodes: `text` and `hardBreak`;
- marks: `bold`, `code`, `italic`, `strike`.

No other node, mark, or attribute is portable. Editor-specific state, raw HTML, CSS, URLs of
executable schemes, and unknown attributes MUST NOT be stored. A profile may narrow this grammar
through capability negotiation; it cannot widen it without a new contract revision.

## Limits

Schema validation bounds shape; runtimes additionally enforce the resource limits of the reference
profile (`@kumwe/studio-rich-text`): document bytes, node and mark counts, marks per text node, text
length, and nesting depth. Limits are validated before recursive parsing, and hard ceilings cannot
be raised by configuration.

## Responsibilities

- **Studio** guarantees only schema-valid, profile-valid documents are produced by the editor,
  normalizes pasted content into the portable grammar, and drops anything it cannot represent.
- **Hosts** treat stored rich text as untrusted input: they re-validate on save and render through
  a server-side renderer that emits sanitized markup. Browser editor output is never trusted as
  render-ready HTML.
- **Renderers** map nodes and marks to their output medium and MUST NOT execute or interpolate
  document content as code, templates, or unescaped markup.

## Authoring boundary

`@kumwe/studio-rich-text` owns Editor.js `2.31.6` behind `StudioRichTextEditorFactory`. Hosts pass a
canonical `StudioRichTextDocument`, a named Studio profile, and an HTML holder. They do not receive,
store, render, or migrate Editor.js `OutputData`, plugin configuration, timestamps, block IDs, or
HTML fragments. An invalid transient editor result leaves the last canonical value intact and
returns `studio.rich-text/invalid-editor-state`.

The default, marketing, and documentation profiles currently narrow the same portable grammar with
different resource bounds. An unknown profile fails closed. Rich-text ports backed by a
`static-value` are mutable; host-resolved entry, context, resource, and query bindings are read-only.

Markdown and safe HTML are explicit import/export formats. Safe HTML import uses a fixed Studio tag
ceiling (`p`, headings 2–4, blockquote, lists, separator, line break and portable inline marks),
ignores attributes except a bounded ordered-list start, and drops active elements with their
content. A caller may narrow that ceiling but cannot add tags. Imported HTML is converted into the
canonical grammar and never stored or rendered directly.

## Renderer conformance

Renderer conformance is defined against a canonical, language-neutral projection — never against
HTML or any other target format. For a document, the canonical renderer projection is the array of
its leaf block projections in document order: container blocks (`blockquote`, `bulletList`,
`orderedList`, `listItem`) contribute no entries of their own and are traversed into, while every
leaf block (`paragraph`, `heading`, `horizontalRule`) projects to
`{ type, text, spans, embeds }`:

- `text` is the concatenation of the block's text-node contents; non-text inline nodes contribute
  no characters.
- Every offset counts Unicode code points, never UTF-16 code units or bytes.
- `spans` lists the maximal runs of identically marked characters as half-open `[start, end)`
  ranges with `marks` sorted lexicographically. Zero-length spans are forbidden, adjacent text
  nodes carrying the same mark set merge into one span, an inline embed does not interrupt a
  span, and spans are sorted by `(start, end, marks)`.
- `embeds` lists non-text inline nodes as `{ index, kind }`, where `index` is the code-point
  offset in `text` at which the embed is anchored. `hardBreak` is the only portable embed kind in
  this profile; future media and link embeds project the same way.

The executable corpus lives in
[`schemas/conformance/rich-text/`](../../schemas/conformance/rich-text/): each fixture pairs a
schema-valid document with its canonical projection and validates against
[`rich-text-projection.schema.json`](../../schemas/rich-text-projection.schema.json). The corpus
is mirrored into `@kumwe/studio-testkit` and replayed against the reference implementation
(`projectRichText` in `@kumwe/studio-rich-text`). A conforming renderer MUST be able to reproduce
the projection of every fixture exactly, and MUST apply its target format's encoding and escaping
on output — the projection carries unencoded text only, and target-format markup is never
canonical.

## Evolution

Adding a node, mark, or attribute is an additive protocol change gated on renderer capability
negotiation; removing or renaming one is breaking. Link marks, schema-aware embeds, and localized
quotations are declared future work (`M5-02`) and are absent from this profile rather than
implicitly allowed.
