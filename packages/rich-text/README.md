# `@kumwe/studio-rich-text`

[![npm beta][version-badge]][package]
[![Build][build-badge]][build]
[![License][license-badge]][license]

For build-time beta evaluation, install an exact resolved version:

```sh
npm install --save-exact @kumwe/studio-rich-text@beta
```

Keep all Studio packages on the same coordinated release. Hosts deploy prebuilt browser assets;
Node.js and npm are contributor and build tools. [Integration guidance][integration] describes
host authority, the release pin and qualification requirements.

Status: governed beta development, not an RC or production-supported release. The exact coordinated version
is in the [coordinated release record](https://github.com/kumwe/studio/blob/main/studio-release.json); gate claims still require the evidence ledger.

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

[version-badge]: https://img.shields.io/npm/v/@kumwe/studio-rich-text/beta
[package]: https://www.npmjs.com/package/@kumwe/studio-rich-text
[build-badge]: https://github.com/kumwe/studio/actions/workflows/ci.yml/badge.svg?branch=main
[build]: https://github.com/kumwe/studio/actions/workflows/ci.yml?query=branch%3Amain
[license-badge]: https://img.shields.io/github/license/kumwe/studio
[license]: https://github.com/kumwe/studio/blob/main/LICENSE
[integration]: https://github.com/kumwe/studio/blob/main/docs/integration/README.md
