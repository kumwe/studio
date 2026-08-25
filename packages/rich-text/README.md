# `@kumwe/studio-rich-text`

Status: integration-candidate implementation. Gate claims still require the evidence ledger.

A bounded Studio-owned rich-text authoring boundary backed internally by Editor.js `2.31.6`. It supplies a
deliberate Studio tool profile for structured-content leaf fields; it is not a second page-layout model.
Consumers use `StudioRichTextEditorFactory`, named Studio profiles, and canonical
`StudioRichTextDocument` values. Editor.js output and plugin configuration are deliberately not public API or
persisted state.

The package also provides deterministic Markdown import/export and policy-sanitized HTML import.
HTML import can only narrow the fixed portable tag ceiling; it never persists HTML, event handlers,
styles, URLs, scripts, or editor-native data. Dynamic host bindings are displayed read-only.

Hosts remain responsible for authoritative validation and for rendering canonical JSON with their
own escaping server-side presenter.
