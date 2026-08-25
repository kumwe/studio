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
- `studio.control/table`

Profiles are closed. Rich text accepts only the named profiles exported by
`@kumwe/studio-rich-text`. Source accepts `studio.source/code`,
`studio.source/latex`, or `studio.source/mermaid`; drawing and table accept only
`studio.drawing/canonical` and `studio.table/canonical` when a profile is
declared. Source canonical value remains plain bounded text and its mode comes
only from the profile. Unknown control or profile input fails closed.

## Shell discovery and lifecycle

The Studio shell discovers controls only from the active `BlockDefinition`:
`propertyControls` address canonical node properties and `ports[].authoring`
addresses canonical field bindings. The shell mounts a supported control after
Lit has committed its holder, passes the definition's exact profile and current
canonical value, and destroys the handle when the target, registry, selected
node, or shell connection changes. Mount errors and invalid changes produce
stable `studio.authoring/*` diagnostics; they never fall back to a raw
editor-native JSON field.

A valid property change is applied through `studio.command/set-property`. A
valid port change creates or updates a `static-value` binding through
`studio.command/set-binding`; clearing an optional value uses
`studio.command/remove-binding`. This command path preserves Studio validation,
history, dirty state, preview scheduling, and host change events. Non-static
bindings are always mounted read-only. A custom registry may inject host media
and trusted-preview services, but it cannot bypass those rules.

`studio.control/scoped-css` is the sole non-persisting property-control
exception. Its valid change emits `studio-scoped-style-change` with the target
node ID and structured sheet. The host may place that sheet in trusted renderer
context; the shell never dispatches `set-property` for it and never stores it in
the Blueprint.

When the experimental shell configuration omits `blockDefinitions`, the shell
uses Studio's full first-party production catalog. When `patterns` is also
absent, it uses the compatible first-party starter patterns. Explicit arrays
are exact overrides, and an explicit catalog does not implicitly acquire
first-party patterns. `createStudioStandaloneSetup` is the supported additive
bootstrap for hosts: first-party entries lead, host contributions append, and
duplicate identities fail closed.

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

The drawing control is a native SVG value editor. Pointer strokes and its
labelled point-coordinate/keyboard path both produce only bounded canonical
points, color tokens, and stroke widths. The SVG is a disposable view; SVG
markup, canvas commands, scripts, and data URLs never become values. Alternative
text and dimensions retain their protocol ceilings. Committing or removing a
stroke calls `onChange` with one detached canonical document, so the shell's
ordinary command history owns undo and redo. Pointer cancellation and Escape
discard only the uncommitted stroke.

The table control edits the canonical caption, column headings, and text cells
through a labelled native table. It preserves exact row/column parity, the
50-column and 1000-row ceilings, and the text-length bounds. Add/remove actions
are explicit and keyboard-operable. It never parses or persists HTML table
markup. Every accepted cell or structural edit calls `onChange`, so the shell's
canonical history remains the only undo authority.

`studio.control/scoped-css` is a trusted host styling control, not a Blueprint
field. It parses only named node parts and the renderer's fixed property/value
ceiling into `StudioScopedStyleSheet`. Selectors, at-rules, URLs, active values,
and arbitrary declarations are rejected before compilation. Portable persisted
appearance remains semantic design intent governed by the theme contract.

Media controls use the same registry identifiers but require dedicated
Studio-owned services over host ports. Media persists only canonical
references; asset bytes and delivery URLs remain host-owned. Drawing and table
are dependency-free first-party value editors and persist only their bounded
canonical documents.

## Binding and accessibility rules

Only a `static-value` binding is mutable. Entry, context, resource, and query
bindings are read-only regardless of a host's requested option. Every guided
operation has a labelled native control and a keyboard path. Read-only controls
remain inspectable, previews are opt-in, destructive actions are explicit, and
invalid input never replaces the last valid value.
