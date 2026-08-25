# ADR 0027: Studio owns rich-text authoring behind a canonical boundary

- Status: proposed
- Date: 2026-08-25

## Context

Studio needs a capable block-oriented prose editor without making a host application understand an
editor vendor's state, plugins, migrations, or security model. Editor.js is available under the
Apache-2.0 license and returns an editor-specific block result. That result is useful inside the
adapter, but it is not a Studio contract and cannot safely become stored content.

## Decision

`@kumwe/studio-rich-text` owns Editor.js `2.31.6` behind `StudioRichTextEditorFactory`. The public
factory accepts and returns only a profile-valid `StudioRichTextDocument`. Editor.js output, tool
configuration, callbacks, timestamps, IDs, HTML fragments, and plugin data stay private to the
adapter. Invalid transient editor output preserves the last canonical value and emits a stable
diagnostic.

Named Studio profiles are closed and fail unknown identifiers. Markdown and safe HTML are import
and export formats, never alternative stored models. Safe HTML import may only narrow Studio's
fixed tag ceiling and discards active content, handlers, styles, URLs, and unknown attributes.

A block port bound to a `static-value` may be edited. Context, entry-field, resource, and query
bindings are host-resolved projections and therefore read-only in the inline editor.

## Consequences

- Hosts integrate Studio conventions and canonical JSON; they neither import nor migrate Editor.js.
- Replacing or upgrading Editor.js changes an internal adapter, not persisted artifacts.
- Additional tools require a canonical Studio mapping, a named profile, accessible authoring
  behavior, renderer support, and hostile-input tests before activation.
- Hosts still validate canonical rich text authoritatively and render it with an escaping presenter.

## Rejected alternatives

- Persisting Editor.js `OutputData`: it couples every host and renderer to editor internals.
- Exposing arbitrary Editor.js tool configuration: it bypasses profile and supply-chain governance.
- Storing pasted HTML: it creates a second executable content model and widens the trust boundary.
