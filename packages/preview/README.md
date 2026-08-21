# `@kumwe/studio-preview`

Status: pre-Gate-A foundation alpha. The channel is an executable contract spike, not a qualified adapter.

An exact-origin, typed request channel between Studio and a host-rendered preview surface. A host can
render Twig, Liquid, JSX, or another server template without teaching the canvas to reproduce its
markup. Wildcard target origins are rejected.

The channel handles correlation, timeouts, abort signals, protocol filtering, and disposal. The host
still owns authentication, authorization, CSP, sandboxing, and rendering.

## Host responder and handshake

`PreviewClient` is the Studio half of the channel; `PreviewHost` is the preview-surface half. Both
pin an exact target origin and drop any inbound message whose source window, origin, schema, channel
ID, session generation, or sequence does not match; each direction stamps its own monotonic sequence
counter. Outbound client messages cross the same canonical guard before posting, and the draft.2
message vocabulary is closed.

The handshake and request flow is announce → ready → render → rendered:

1. The host constructs a `PreviewHost` with its renderer id, viewport inventory, and a render
   callback, then calls `announce()` to post `studio.preview/ready`.
2. Studio awaits `client.ready()`, which resolves with the announced payload — immediately when the
   announcement already arrived — and rejects on timeout, abort, or disposal.
3. Studio requests `studio.preview/render` via `client.render()` with a session-unique `requestId`.
   The host invokes its render callback with an `AbortSignal` and replies with
   `studio.preview/rendered` carrying the same request ID and draft digest. A newer request aborts and
   generation-invalidates in-flight work on both sides, so a stale result is never posted or resolved
   even when a retry uses the same digest at another viewport.
4. A failed render is answered with `studio.preview/error` (code `studio.preview/render-failed`, the
   request ID as `correlationId`, `retryable: true`) and a generic message — renderer failure
   details never cross the channel.
5. `client.select()` forwards `studio.preview/select` to the host's `onSelect` listeners.

## Portable draft identity and markers

`canonicalPreviewDraftBytes(draft)` returns exactly the canonical UTF-8 bytes of a complete Studio
artifact. `computePreviewDraftDigest(draft)` hashes those bytes as lowercase hexadecimal SHA-256; it
does not add an envelope, prefix, viewport, BOM, or newline. The host still validates and authorizes
the staged draft, recomputes its digest, and compares it before rendering — the digest is never a
credential.

`createPreviewMarker(digest, ordinal)` implements the canonical
`studio.preview/node/<digest>/<ordinal>` grammar. `createPreviewMarkerInventory(blueprint, digest)`
enumerates roots, each node before descendants, sorted slot names, then child arrays. Every rendered
response requires an exact one-to-one `markerMap`; the generic responder refuses a mismatched digest,
grammar, contiguous order, duplicate, or incomplete map. Because the channel does not hold the draft,
the authoritative renderer additionally compares node mapping with `createPreviewMarkerInventory`;
the standalone reference renderer does so. `announceActivation()` accepts only a marker from the
currently accepted inventory, and the client independently drops invented or revoked activation
traffic.

These semantics require wire protocol `0.1.0-draft.2`. A `.1` peer is incompatible rather than
silently accepted. Portable implementations replay `@kumwe/studio-testkit/vectors/preview/` against
their own canonicalizer and traversal.

## Marker geometry

`client.measure()` posts `studio.preview/measure` with a non-empty bounded marker list and resolves with the
`studio.preview/measurements` answer: per marker, one or more CSS-pixel rectangles relative to the
preview viewport origin (inline content fragments across lines), plus viewport metrics. Markers the
renderer cannot place are returned in a distinct `unknown` list, never thrown. A marker outside the
latest digest-bound inventory is rejected locally with `PreviewChannelError` code
`studio.preview/measure-stale-marker`; the host independently rejects raw stale traffic without
invoking the measurer.

The host never reads the DOM. The embedding renderer passes a `measure` callback in
`PreviewHostOptions`; without one, measure requests are answered with the qualified
`studio.preview/measure-unavailable` error, and a throwing measurer is answered with
`studio.preview/measure-failed` — measurer failure details never cross the channel.

Geometry is volatile, not document state: each response is stamped with the digest of the render it
was measured against. The host captures that digest and a private generation before invoking the
callback. A same-digest rerender, newer measurement, disposal, reload or teardown aborts and
invalidates the prior measurement. A viewport instruction also rejects the client's pending
measurement with `PreviewChannelError` code `studio.preview/measure-viewport-changed` and aborts the
host callback before viewport listeners run, so pre-resize geometry cannot settle late. Measured and
unknown entries must exactly partition the requested markers.

Version negotiation currently requires the exact draft wire version on both sides: schema filtering
accepts only `STUDIO_WIRE_PROTOCOL_VERSION`, so a ready announcement from a host speaking any other
version is discarded and `ready()` times out instead of resolving against an incompatible host.
