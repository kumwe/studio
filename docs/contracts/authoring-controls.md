# Advanced authoring controls contract

## Stable control boundary

`@kumwe/studio` resolves first-party port controls through
`StudioAuthoringControlRegistry`. A host supplies an HTML holder, a canonical
value, the port's named profile, and an optional field binding. The returned
handle exposes only `focus`, `destroy`, `readOnly`, and a detached canonical
value. Editor.js, CodeMirror, Chart.js, Mermaid, KaTeX, canvas objects, DOM
nodes, and library configuration are not part of this boundary.

The registered identifiers in this release family are:

- `studio.control/rich-text`
- `studio.control/media-reference`
- `studio.control/media-collection`
- `studio.control/source`
- `studio.control/chart`
- `studio.control/drawing`
- `studio.control/money`
- `studio.control/scoped-css`

Profiles are closed. Rich text accepts only the named profiles exported by
`@kumwe/studio-rich-text`. Source accepts `studio.source/code`,
`studio.source/latex`, or `studio.source/mermaid`; its canonical value remains
plain bounded text and its mode comes only from the profile. Unknown control or
profile input fails closed.

## Implemented guided controls

The source control uses a Studio-neutral code-field adapter, with an accessible
textarea fallback. A trusted preview adapter is invoked only after an explicit
Preview action, receives an abort signal, and cannot change the canonical
source. Code is inert text. LaTeX and Mermaid are rendered only by trusted,
lazy renderer adapters.

The chart control edits the canonical chart schema through a keyboard-operable
table. Chart type, title, labels, series, and finite values retain the protocol
limits. It never exposes Chart.js options. The money control edits an exact
decimal string and an uppercase three-letter currency without a binary-float
conversion. Invalid transient input preserves and reports the last valid
canonical value.

`studio.control/scoped-css` is a trusted host styling control, not a Blueprint
field. It parses only named node parts and the renderer's fixed property/value
ceiling into `StudioScopedStyleSheet`. Selectors, at-rules, URLs, active values,
and arbitrary declarations are rejected before compilation. Portable persisted
appearance remains semantic design intent governed by the theme contract.

Media and drawing controls use the same registry identifiers but require their
dedicated Studio-owned services. Media persists only canonical references;
asset bytes and delivery URLs remain host-owned. Drawing persists only the
bounded canonical vector document and never SVG, canvas commands, or data URLs.

## Binding and accessibility rules

Only a `static-value` binding is mutable. Entry, context, resource, and query
bindings are read-only regardless of a host's requested option. Every guided
operation has a labelled native control and a keyboard path. Read-only controls
remain inspectable, previews are opt-in, destructive actions are explicit, and
invalid input never replaces the last valid value.
