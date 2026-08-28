# `@kumwe/studio-rich-text`

Status: governed beta development, not an RC or production-supported release. The exact coordinated version
is in the workspace `studio-release.json`; gate claims still require the evidence ledger.

A bounded Studio-owned rich-text authoring boundary backed internally by Editor.js `2.31.6`. It supplies a
deliberate Studio tool profile for structured-content leaf fields; it is not a second page-layout model.
Consumers use `StudioRichTextEditorFactory`, named Studio profiles, and canonical
`StudioRichTextDocument` values. Editor.js output and plugin configuration are deliberately not public API or
persisted state.

Editor.js remains the private default surface. Strict style-CSP/Trusted-Types hosts can instead pass
Studio's `StudioStrictCspRichTextSurfaceAdapter` to the factory, or select the corresponding Studio
registry policy through `@kumwe/studio`. The sink-free surface retains the same first-party structured
blocks, semantic inline formatting, read-only rules, and canonical JSON; it does not inject styles or
write HTML strings.

The package also provides deterministic Markdown import/export and policy-sanitized HTML import.
HTML import can only narrow the fixed portable tag ceiling; it never persists HTML, event handlers,
styles, URLs, scripts, or editor-native data. Dynamic host bindings are displayed read-only.

Hosts remain responsible for authoritative validation and for rendering canonical JSON with their
own escaping server-side presenter.
