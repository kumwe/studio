# Preview contract

## Purpose

Preview displays a host-rendered projection of the current draft while Studio remains the authoritative authoring state. Messages conform to [`preview-message.schema.json`](../../schemas/preview-message.schema.json).

## Preview session

The host creates a short-lived preview session bound to actor, Studio session generation, `resourceContext.key`, selected wire protocol version, artifact, allowed origin, renderer/theme revision, permissions and expiry. The key is routing context, not a preview credential; the host resolves it within the authenticated session. Credentials are not placed in the URL. Preview responses are private, non-cacheable and excluded from search indexing.

## Channel

Browser preview uses a sandboxed iframe and an origin-checked `postMessage` channel or an equivalently isolated host mechanism. Both sides exchange a random channel ID and wire protocol version during handshake. The `studio.preview/ready` payload's `protocolVersion` MUST equal the resolved StudioConfig `protocolVersion`; advertising support for a different version does not renegotiate an active session. Once accepted, that wire version is an immutable channel property, so subsequent `0.1-draft` envelopes do not repeat it. The message envelope's `contractVersion` selects its canonical JSON shape and MUST NOT be interpreted as the wire version. A ready message with the wrong wire version, or any message with the wrong source window, origin, channel, session generation, sequence, or schema, is ignored and reported according to policy.

Wildcard target origins are prohibited outside isolated local development explicitly marked non-production.

### Authoring-shell binding

The browser shell consumes preview only when all three authorities agree: resolved session policy has
`preview.enabled`, the negotiated `studio.port/preview` advertises both
`studio.operation/preview.render` and `studio.operation/preview.cancel`, and the embedding host supplies a
`StudioPreviewBinding`. The binding transfers one session-bound `PreviewClient` to the shell and supplies a
host-owned `stage(draft, { signal })` callback. Staging validates, authorizes and stores the exact complete
draft and returns only its artifact ID, host revision and canonical digest. The callback does not move
persistence, authorization, credentials, grants or renderer routing into the shell.

The host supplies the visual surface through the shell's `preview` slot. A browser host normally supplies a
same-origin, descriptively titled, minimally sandboxed frame whose `contentWindow` is the target already
pinned by its `PreviewClient`. An equivalently isolated host mechanism remains conforming under the Channel
section above. Slot contents are presentation only: the shell accepts renderer state exclusively through the
bound client and never reads, scrapes or mutates the supplied preview DOM.

When a current render also supplies geometry, that same slotted surface is the shell's visual canvas. The
shell draws a CSP-safe SVG overlay from measured rectangles; it does not create a second renderer or infer
structure from slotted nodes. The overlay is pointer-inert in operate mode so trusted preview controls remain
usable. An explicit pressed-state control enters canvas edit mode for selection and direct manipulation.
Outline and command-palette destinations remain available independently of geometry and dispatch the same
commands as the overlay.

The shell waits for `ready` before staging or rendering. Synchronous document and viewport changes coalesce at
one microtask boundary into the last complete snapshot; there is no timer-dependent debounce interval. A new
intent aborts every older staging/render attempt, disposes an accepted superseded draft, and receives a new
session-unique request ID. Marker authority changes only when the matching latest render resolves. A staging
or render callback that ignores its abort signal cannot publish a stale marker map.

Reload revokes marker authority, preserves focus and authoring state, awaits the next ready handshake and
resends the latest complete snapshot. Teardown closes the client and removes the surface without changing the
document. When any required authority is absent or a request fails, the region remains present with explicit
unavailable, stale or disconnected text while outline, palette, inspector, commands, validation and save
remain governed solely by their normal session policy.

## Message families

The `0.1-draft` canonical schema defines these message payloads:

- `studio.preview/ready`: renderer inventory and viewport capabilities.
- `studio.preview/render`: request with artifact, revision, digest, semantic viewport and a
  session-unique render-attempt identifier.
- `studio.preview/rendered`: accepted render attempt, diagnostics and node-marker inventory; it
  echoes the exact request identifier and digest.
- `studio.preview/select`: Studio asks preview to reveal a node.
- `studio.preview/measure`: Studio requests on-screen geometry for a bounded list of render markers.
- `studio.preview/measurements`: volatile marker rectangles and viewport metrics for overlay positioning, bound to a render digest.
- `studio.preview/error`: structured rendering or protocol failure.

This draft.2 vocabulary is closed. An unknown message type is schema-invalid and requires a newly
negotiated protocol revision; it is not an implicit extension point.

The Gate A vocabulary is canonical and implemented:

- `studio.preview/activated`: the renderer reports a trusted interaction with a marked region.
  It reports intent — `activate`, `context-menu`, or `focus` — never raw input events, and the marker
  carries nothing beyond the node identity the render already published.
- `studio.preview/viewport`: the client drives the surface to a theme-declared semantic viewport role
  **or** to bounded explicit dimensions. The two are alternatives, never a merge; a payload carrying
  both is refused before it reaches the channel. Roles use the safe `localName` grammar and each
  supplied dimension is an integer from 240 through 10000 CSS pixels.
- `studio.preview/dispose`: the client instructs the renderer to revoke the resources it holds for a
  superseded draft **while the channel stays open**. Naming a `draftDigest` revokes that render's
  resources; omitting it revokes every draft resource the renderer holds.

`dispose` and `teardown` are distinct and must not be conflated. `teardown` ends the session: the
channel closes and no further message is honoured. `dispose` frees a superseded render's resources
within a session that continues — after switching artifacts or viewports, Studio tells the renderer to
drop what it no longer needs without renegotiating the channel.

## Ordering and cancellation

Every render request has a monotonically increasing envelope sequence and a session-unique
`requestId`. A retry uses a new identifier even when artifact, digest, revision and viewport are
unchanged. `rendered` and `render-failed` correlate by that request identifier; a digest alone cannot
distinguish two attempts or two viewports of identical bytes. Reusing any render or measurement
request identifier in one channel is refused with `studio.preview/request-id-reused`.

The responder assigns every render callback a private generation and an `AbortSignal`. Starting a
new render, receiving a matching `dispose`, reload, teardown, or local disposal aborts the old signal
and invalidates that generation. Callback settlement compares both generation and request identity,
so a callback that ignores cancellation still cannot publish or reactivate inventory. A client-side
render abort or timeout sends a matching `dispose`; the local promise is invalidated before that
best-effort revocation crosses the channel. Preview rendering is debounced/coalesced without losing
the command history.

## Draft identity

`draftDigest` is the lowercase hexadecimal SHA-256 digest of exactly the canonical UTF-8 bytes of the
complete, schema-valid Studio artifact being previewed. Canonical serialization is the form fixed by
the canonical corpus: object members sorted by ascending Unicode/UTF-16 code unit, arrays in semantic
order, minimal JSON escaping, the canonical finite-number grammar, and no unsafe object member names.
The digest preimage contains the artifact and nothing else — no digest prefix, transport envelope,
session, actor, artifact-reference wrapper, viewport, BOM, or trailing newline.

Studio computes the digest after applying the current command and stages that exact artifact with the
host. The host resolves the staged or persisted draft inside the authenticated actor, site,
`resourceContext.key`, artifact, revision, digest, and Studio-session scope, validates the complete
artifact, recomputes the digest from its canonical bytes, and refuses a mismatch before rendering.
A caller-supplied digest is an identity value; it is never authentication, authorization, proof of
persistence, permission to read an artifact, or a sufficient render-attempt correlation key.

The portable helpers `canonicalPreviewDraftBytes` and `computePreviewDraftDigest` implement the
preimage and digest. The assertion set in `vectors/preview/` fixes complete drafts and the exact
digests another runtime must reproduce.

## Markers

The canonical marker grammar is:

```text
studio.preview/node/<draftDigest>/<ordinal>
```

`draftDigest` is the 64-character digest of the rendered draft and `ordinal` is a canonical decimal
integer from `0` through `99999`, with no leading zero. The marker inventory is rebuilt for every
accepted render. Ordinals follow one deterministic Blueprint preorder: roots in array order; each node
before its descendants; slot names in ascending Unicode/UTF-16 code-unit order; and children in their
array order. Marker generation therefore carries no renderer-local counter or DOM traversal state.

`studio.preview/rendered` MUST carry both `markers` and `markerMap`. `markers` is the exact preorder,
with no duplicate or skipped ordinal. `markerMap` has exactly the same keys, maps each marker to one
unique Blueprint node ID, and contains neither missing nor additional entries. A responder refuses a
renderer result whose digest, grammar, contiguous ordinal order, uniqueness, or map parity fails
rather than repairing it on the wire. Those payload-internal checks cannot prove that an opaque node
ID is the correct Blueprint node for an ordinal when the generic channel does not hold the draft.
The authoritative renderer MUST compare its output with `createPreviewMarkerInventory` or an
equivalent traversal of the validated draft. The reference renderer performs that comparison before
returning.

Only markers in the latest accepted render inventory are live. A new render, reload, matching
`dispose`, or teardown revokes the old inventory. The host refuses an `activated` event for an
invented or revoked marker, and the client independently drops one that is absent from its latest
inventory. Marker data contains no field values, permissions, queries, plugin internals, or database
keys beyond the Blueprint node ID.

Studio may draw overlays using returned measurements. It MUST NOT edit the iframe DOM as a persistence mechanism.

## Marker geometry

Studio obtains overlay geometry (selection outlines, drop indicators) exclusively through the measurement channel; it never reads the preview DOM itself.

`studio.preview/measure` carries a non-empty bounded, explicit list of markers (at most 1000) plus a
session-unique request identifier. There is no "measure everything" form: Studio names the markers it
needs. Every marker MUST belong to the latest accepted inventory and embed that render's current
digest. The client refuses a foreign or stale marker before posting; the responder independently
answers one with `studio.preview/measure-stale-marker` and never invokes the measurer.
`studio.preview/measurements` answers with, per measured marker, one or more axis-aligned rectangles
(`x`, `y`, `width`, `height`) in CSS pixels relative to the preview viewport origin — one marker may
produce several rectangles because inline content fragments across line boxes — plus a viewport
record (`width`, `height`, `scrollX`, `scrollY`, `devicePixelRatio`). Measured and unknown keys exactly
partition the requested marker list.

Requested markers the renderer cannot associate with any on-screen geometry are reported in the response's distinct `unknown` list. An unknown marker is a normal outcome, never an exception, and is never silently dropped. Markers a measurer volunteers beyond the request are discarded by the responder.

Geometry is a volatile measurement, not document state. Every response carries the `draftDigest` of
the render it was measured against. The responder captures both digest and a private measurement
generation before invoking the callback; a new render (including the same digest at another
viewport), newer measurement, viewport instruction, matching disposal, reload or teardown invalidates
it. Before posting a viewport instruction, the client rejects and clears its pending measurement with
`studio.preview/measure-viewport-changed`; the responder aborts and generation-invalidates its callback
before notifying viewport listeners. A late callback therefore cannot publish pre-resize geometry.
Measurements are never persisted, never serialized into an artifact, and are silently invalidated by
scroll, resize, zoom, or late-loading assets — Studio re-measures instead of caching.

The channel responder does not touch the DOM. The embedding renderer supplies the measurer — a function from marker IDs to raw rectangles and viewport metrics. A responder without a measurer answers measure requests with the qualified error `studio.preview/measure-unavailable`; a responder whose surface has not completed a render answers the same code marked retryable. A throwing or rejecting measurer is answered with `studio.preview/measure-failed`; measurer failure details never cross the channel.

The reference shell requests the complete accepted inventory in sequential chunks of at most 1000 markers
and projects results from marker IDs back to node IDs. A newer refresh aborts and generation-invalidates the
older refresh even when both address the same render digest. Render replacement, viewport change, reload,
error, disposal and teardown clear the overlay. The embedding host invokes the shell's
`refreshPreviewGeometry()` method after it observes scroll, resize, zoom or late asset settlement; geometry
failure degrades only the overlay and never revokes a valid render or a non-pointer authoring path.

Placement semantics never come from geometry. The shell derives compatible collections and exact positions
from the Blueprint, block slot declarations, session permissions, mode policy and hybrid composition bounds,
then uses measured rectangles only to rank and draw those already-valid candidates. Pointer reordering and
reparenting therefore dispatch the same `reorder-children` or `move-node` command as their outline and
keyboard equivalents. `Escape` or `pointercancel` revokes the transient gesture without dispatching.

## Security policy

Preview sandbox permissions are minimal and declared in session policy. Navigation, popups, downloads, forms, top-level access, storage, clipboard, camera, microphone, geolocation and cross-origin requests are denied unless a specific block-preview capability requires and the host authorizes them.

Renderer assets are same-origin or integrity-pinned according to host CSP. Preview must not weaken the security headers of normal administrator or public responses globally; it uses a dedicated route and policy.

## Compatibility and host migration

Canonical draft identity, required attempt-level correlation, required marker-map parity, and the marker grammar are wire-incompatible
with `0.1.0-draft.1`, so they are negotiated as `0.1.0-draft.2`. There is no in-band migration for an
open channel: both sides negotiate `.2` when creating a new Studio session, or the session remains
incompatible. A host upgrading from `.1` must replace lexical `JSON.stringify` hashing with canonical
artifact bytes, scope and verify its draft store by artifact/revision/digest, issue a new request ID
per attempt, reset markers per render, emit canonical preorder, reject stale activation and
measurement, and generation-check callback settlement before advertising `.2`.

## Degraded mode

When preview is unavailable, Studio retains outline, palette, inspector, command, validation and save capabilities according to host policy. It clearly marks preview as disconnected or stale. A preview failure never reports a save or publish success.
