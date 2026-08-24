# ADR 0025: Direct manipulation uses measured preview geometry

- Status: proposed
- Scope: visual canvas, placement semantics, command-surface completeness

## Context

The shell already bound a host-rendered preview through the canonical preview channel, but its
authoring canvas remained a parallel list of label chips. That list could demonstrate selection and
same-collection reordering, but it was not the rendered composition authors were arranging. Reading or
mutating the slotted renderer DOM would couple Studio to one web renderer, cross the frame boundary in
production, and make presentation state an accidental persistence mechanism.

The preview protocol already provides the necessary safe seam: an accepted render publishes a
digest-bound marker map, and `studio.preview/measure` returns volatile rectangles for an explicit,
bounded marker list. Geometry alone cannot decide whether a move is legal. Slot type/cardinality,
editing mode, hybrid composition boundaries, locked subtrees, and session permissions remain semantic
tree policy.

Interactive rendered content also requires an explicit edit/operate boundary. An always-active overlay
would make links and controls in the trusted preview unreachable, while allowing raw preview activation
to mutate the document would make pointer behavior differ from the outline and keyboard paths.

## Decision

The host-rendered preview is the shell's primary visual canvas whenever a bound preview is current. The
structural chip tree remains only an honest degraded fallback when preview authority is unavailable.
After accepting a render, `StudioPreviewSurface` measures every marker through `PreviewClient` in
sequential chunks of at most 1000. It converts the marker-oriented wire result to a node-oriented,
read-only `StudioPreviewGeometry` projection. Every refresh has a private generation and aborts the
previous one; a late measurement, including one for the same render digest, cannot replace newer
geometry. Render change, viewport change, reload, error, teardown, or channel replacement revokes the
projection. Hosts call `refreshPreviewGeometry()` after observing scroll, resize, zoom, or late asset
settlement.

The shell draws selection, hover regions, and live insertion indicators in an SVG overlay whose
coordinates come only from that projection. Dynamic geometry uses SVG attributes under the shell's
static constructed stylesheet; it does not create style attributes, HTML strings, script, or persisted
layout data. Missing geometry removes visual manipulation without removing the outline, inspector, or
command palette.

The overlay is pointer-inert by default. A pressed-state `Select and move rendered blocks` control
enters edit mode; leaving it restores normal trusted-preview interaction. A four-CSS-pixel activation
threshold distinguishes selection from drag. `Escape` and `pointercancel` release capture and make no
document change.

Every placement is derived first from the canonical Blueprint and active configuration. The candidate
set excludes self/descendant targets, incompatible or full slots, moves that violate a source-slot
minimum, session-forbidden roots, and hybrid destinations outside composable/allowed/unlocked bounds.
Measured child rectangles place ordered boundaries; an empty compatible slot receives a deterministic
band within its measured parent. Geometry ranks candidates but never creates one. Pointer, outline
destination selector, and command-palette destination entries all call the same semantic dispatcher:
same-collection moves use `reorder-children`; cross-collection moves use `move-node`.

The Blueprint shell also exposes the remaining applicable first-class commands. Successful shell
deletions enter a restore journal bounded by `maxHistoryEntries`, and restoration dispatches
`restore-node` only after revalidating identifiers and destination policy. Responsive inspector rows
dispatch `reset-inherited-property`. Hosts may supply active, schema-validated `PatternDocument`
contributions; the shell requires exact block definitions, allocates a complete deterministic ID map,
validates a destination, and dispatches `apply-pattern`. Recipe selection continues to dispatch
`batch`. Entry and content-model commands remain outside the Blueprint shell rather than receiving
misleading controls.

## Consequences

The canvas now represents the host's real rendering without making the DOM authoritative. Pointer and
non-pointer movement share command identity, validation, history, diagnostics, and cancellation
semantics. Renderer-specific layouts remain possible because Studio consumes rectangles rather than
markup conventions.

The embedding host must provide correct preview-viewport-relative measurements and arrange to refresh
them after volatile layout changes. The reference renderer proves the equivalently isolated
`MessageChannel` path and the shell's CSP/keyboard browser lane. It does not close the separately
tracked dedicated framed-authoring CSP policy, independent renderer reproduction, or the manual
screen-reader, touch, zoom, and RTL qualification matrix.

## Rejected alternatives

DOM scraping and DOM mutation were rejected because they violate the preview authority boundary and do
not work across a production frame. A second renderer inside the shell was rejected because it would
drift from the host delivery renderer. HTML or dynamically styled overlay fragments were rejected by
the CSP contract. Pointer-only drag was rejected by the inclusive-authoring standard. Free-form
coordinates were rejected because Blueprint stores semantic composition, not spatial presentation.
