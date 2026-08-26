# Rich text contract

## Canonical grammar

Bounded structured rich text is stored as JSON conforming to
[`rich-text.schema.json`](../../schemas/rich-text.schema.json). The portable `0.1-draft` profile is
closed:

- block nodes: `paragraph`, `heading` (levels 2–4), `blockquote`, `bulletList`, `orderedList`
  (positive `start`), `listItem`, `horizontalRule`, `checklist` with bounded-level
  `checklistItem`, rectangular `table`/`tableRow`/`tableCell`, semantic `callout`, and inert
  `codeBlock`;
- inline nodes: `text` and `hardBreak`;
- marks: `bold`, `code`, `italic`, `strike`, and `highlight` with a bounded semantic tone.

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

The built-in Editor.js toolbox maps one-to-one to canonical paragraph, heading, quote, separator,
bounded nested list, nested checklist, table, callout, and inert code nodes. List/checklist and table
tools expose explicit add, remove, reorder/indent, row, column, and header controls; all controls are
keyboard reachable and disabled in read-only mode. Nested-list actions operate on complete item
subtrees and preserve distinct list containers plus their position among other item blocks. A
render/read/save cycle preserves the exact canonical optional-field representation when no edit was
made. The semantic marker stores a named theme tone, not an arbitrary color. Tool registration is
closed: an Editor.js block with an unknown or mismatched type fails validation and cannot enter
canonical content.

Editor.js remains the default private browser surface. A host that enforces a style policy without
inline styles and Trusted Types without a `default` policy explicitly sets
`strictContentSecurityPolicy: true` on `StudioAuthoringControlRegistry`. Studio then selects its
sink-free surface internally; the host still supplies only Studio profiles and canonical values and
does not import, configure, or receive Editor.js. The strict surface uses the same closed first-party
tool set and supports semantic inline marks, line breaks, block insertion/removal/reordering,
structured list/checklist/table operations, focus, replacement, read-only inspection, and canonical
save. It creates no style element, style attribute, script, or HTML-string sink. This is an authoring
surface substitution, not a plain-text compatibility mode, and it does not change persisted JSON.

Editor.js `2.31.6` cannot be used by this strict profile as shipped: its distribution injects runtime
CSS and uses raw HTML sinks. Studio does not respond by weakening `style-src`, minting a permissive
Trusted Types `default` policy, or asking a host to grant Editor.js policy access. A later Editor.js
release may become eligible for the strict profile only after its complete sink behavior is reviewed
and covered by the same browser security tests.

## Renderer conformance

Renderer conformance is defined against a canonical, language-neutral projection — never against
HTML or any other target format. For a document, the canonical renderer projection is the array of
its leaf block projections in document order: container blocks (`blockquote`, `bulletList`,
`orderedList`, `listItem`) contribute no entries of their own and are traversed into, while every
leaf block (`paragraph`, `heading`, `horizontalRule`) projects to
`{ type, text, spans, embeds }`. Callouts, checklists, and tables are traversed as containers;
checklist items and table cells are leaves, and inert code projects as a `codeBlock` leaf:

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
