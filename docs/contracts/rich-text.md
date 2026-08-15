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

## Evolution

Adding a node, mark, or attribute is an additive protocol change gated on renderer capability
negotiation; removing or renaming one is breaking. Link marks, schema-aware embeds, and localized
quotations are declared future work (`M5-02`) and are absent from this profile rather than
implicitly allowed.
