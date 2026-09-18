# ADR 0036: Public standalone mounting owns its rendered canvas

- Status: proposed
- Scope: standalone authoring, insertion ownership, local rendering, preview isolation

## Context

The standalone mount composed valid Model, Blueprint, and Entry state but did not bind a rendered
surface. Only a separately assembled reference host supplied visual geometry. Consequently a passing
mount/import test could coexist with a structural list presented where the page canvas belonged.
The public hosted mount also exposed palette clicks without the insertion listener supplied by the
reference and older App adapters.

## Decision

The standalone runtime explicitly enables a local projection using the existing semantic web renderer.
It does not enable a host preview capability, invent a host adapter, or claim persistence. The local
canvas has its own shadow root, constructed stylesheets, responsive target width, render generation,
abort lifecycle, and measured node inventory. It renders only the canonical renderer's freshly escaped
output through Lit's existing Trusted Types policy. There is no public HTML setter and no second block
renderer. Local CSS adapts the renderer's declared responsive widths into an isolated named container;
no editor geometry or CSS is stored in a Blueprint.

The shell consumes local measurements through the same node-oriented selection and movement overlay as
an authoritative preview. Geometry never determines permissions or valid slots. Entry-field bindings
resolve against a detached Entry snapshot; updating a value does not convert a binding to a static
Blueprint value. Unsupported host queries and transforms are not executed locally.

A local canvas is an explicit browser context, never a fallback for an enabled or failed hosted preview.
Host preview continues to require its configured capabilities and exact binding. Disposal, a newer
draft, or rendering failure invalidates geometry, and late asynchronous work cannot restore it. The
configured hosted runtime supplies the same explicit context only when the resolved session has preview
disabled, because the normal configuration-first HTTP mount declares no host preview; it changes no
route, admission, or draft identity, and a session that enables preview keeps the host channel.

Palette insertion gains a measured carry-and-drop gesture over the same overlay. Its destinations are the
semantically valid insertion collections the click path already derives from; geometry only ranks them,
and the drop dispatches the canonical `insert-node` command. Activating a rendered block focuses its typed
inspector control rather than editing rendered markup. The workspace collapses into pane sheets below a
container breakpoint with the canvas central; the command palette is a workspace-level layer.

Palette clicks dispatch a cancelable insertion request before the shell's canonical insertion command.
A listener may take ownership with `preventDefault()`. Existing synchronous adapters remain compatible:
if they already changed the current command session, the shell does not insert a duplicate. Without a
listener the normal palette is functional, not dependent on reference-host-only behavior.

## Consequences and proof

Standalone public mounting gains a visible page without changing wire shape or persistence authority.
The public shell gains an explicit local context and a `canvasReady` settlement promise. Required
coverage includes rendered content, escaping, independent mounts, Entry-bound value changes,
import/export, selection, insertion cancellation/legacy compatibility, and the compiled distribution
under restrictive CSP with zero runtime network. This increment does not claim complete canvas UX,
qualified hosted preview, conformance profiles, or Gate A/B acceptance.
