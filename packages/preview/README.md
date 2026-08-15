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
counter.

The handshake and request flow is announce → ready → render → rendered:

1. The host constructs a `PreviewHost` with its renderer id, viewport inventory, and a render
   callback, then calls `announce()` to post `studio.preview/ready`.
2. Studio awaits `client.ready()`, which resolves with the announced payload — immediately when the
   announcement already arrived — and rejects on timeout, abort, or disposal.
3. Studio requests `studio.preview/render` via `client.render()`. The host invokes its render
   callback and replies with `studio.preview/rendered` carrying the same draft digest as the
   request. A newer request supersedes an in-flight one on both sides, so a stale result is never
   posted or resolved.
4. A failed render is answered with `studio.preview/error` (code `studio.preview/render-failed`, the
   draft digest as `correlationId`, `retryable: true`) and a generic message — renderer failure
   details never cross the channel.
5. `client.select()` forwards `studio.preview/select` to the host's `onSelect` listeners.

Version negotiation currently requires the exact draft wire version on both sides: schema filtering
accepts only `STUDIO_WIRE_PROTOCOL_VERSION`, so a ready announcement from a host speaking any other
version is discarded and `ready()` times out instead of resolving against an incompatible host.
