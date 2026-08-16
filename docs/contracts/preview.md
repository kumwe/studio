# Preview contract

## Purpose

Preview displays a host-rendered projection of the current draft while Studio remains the authoritative authoring state. Messages conform to [`preview-message.schema.json`](../../schemas/preview-message.schema.json).

## Preview session

The host creates a short-lived preview session bound to actor, Studio session generation, `resourceContext.key`, selected wire protocol version, artifact, allowed origin, renderer/theme revision, permissions and expiry. The key is routing context, not a preview credential; the host resolves it within the authenticated session. Credentials are not placed in the URL. Preview responses are private, non-cacheable and excluded from search indexing.

## Channel

Browser preview uses a sandboxed iframe and an origin-checked `postMessage` channel or an equivalently isolated host mechanism. Both sides exchange a random channel ID and wire protocol version during handshake. The `studio.preview/ready` payload's `protocolVersion` MUST equal the resolved StudioConfig `protocolVersion`; advertising support for a different version does not renegotiate an active session. Once accepted, that wire version is an immutable channel property, so subsequent `0.1-draft` envelopes do not repeat it. The message envelope's `contractVersion` selects its canonical JSON shape and MUST NOT be interpreted as the wire version. A ready message with the wrong wire version, or any message with the wrong source window, origin, channel, session generation, sequence, or schema, is ignored and reported according to policy.

Wildcard target origins are prohibited outside isolated local development explicitly marked non-production.

## Message families

The `0.1-draft` canonical schema defines these message payloads:

- `studio.preview/ready`: renderer inventory and viewport capabilities.
- `studio.preview/render`: request with artifact revision/digest or bounded draft payload reference.
- `studio.preview/rendered`: accepted render sequence, diagnostics and node-marker inventory.
- `studio.preview/select`: Studio asks preview to reveal a node.
- `studio.preview/measure`: Studio requests on-screen geometry for a bounded list of render markers.
- `studio.preview/measurements`: volatile marker rectangles and viewport metrics for overlay positioning, bound to a render digest.
- `studio.preview/error`: structured rendering or protocol failure.

Gate A must add canonical payloads and conformance behavior for this target vocabulary:

- `studio.preview/activated`: preview reports a trusted node marker interaction.
- `studio.preview/viewport`: set semantic role or bounded dimensions.
- `studio.preview/dispose`: terminate channel and revoke resources.

Until those target messages are added, an implementation may use a namespaced negotiated extension with its own registered schema, but cannot claim canonical preview conformance for that behavior. The generic envelope does not make an unregistered payload safe.

## Ordering and cancellation

Every render request has a monotonically increasing sequence and draft digest. Studio discards stale responses. Newer requests cancel or supersede older work. Preview rendering is debounced/coalesced without losing the command history.

## Markers

In preview mode, trusted renderers associate output regions with opaque node IDs using a host-approved marker mechanism. Marker data contains no field values, permissions, queries, plugin internals, or database keys beyond the Blueprint node ID.

Studio may draw overlays using returned measurements. It MUST NOT edit the iframe DOM as a persistence mechanism.

## Marker geometry

Studio obtains overlay geometry (selection outlines, drop indicators) exclusively through the measurement channel; it never reads the preview DOM itself.

`studio.preview/measure` carries a bounded, explicit list of markers (at most 1000) plus a request identifier. There is no "measure everything" form: Studio names the markers it needs. `studio.preview/measurements` answers with, per measured marker, one or more axis-aligned rectangles (`x`, `y`, `width`, `height`) in CSS pixels relative to the preview viewport origin — one marker may produce several rectangles because inline content fragments across line boxes — plus a viewport record (`width`, `height`, `scrollX`, `scrollY`, `devicePixelRatio`).

Requested markers the renderer cannot associate with any on-screen geometry are reported in the response's distinct `unknown` list. An unknown marker is a normal outcome, never an exception, and is never silently dropped. Markers a measurer volunteers beyond the request are discarded by the responder.

Geometry is a volatile measurement, not document state. Every response carries the `draftDigest` of the render it was measured against; Studio discards geometry whose digest does not match its latest accepted render and surfaces it as a typed stale outcome, not an error. A reload voids in-flight measurements exactly like it voids renders. Measurements are never persisted, never serialized into an artifact, and are silently invalidated by scroll, resize, zoom, or late-loading assets — Studio re-measures instead of caching.

The channel responder does not touch the DOM. The embedding renderer supplies the measurer — a function from marker IDs to raw rectangles and viewport metrics. A responder without a measurer answers measure requests with the qualified error `studio.preview/measure-unavailable`; a responder whose surface has not completed a render answers the same code marked retryable. A throwing or rejecting measurer is answered with `studio.preview/measure-failed`; measurer failure details never cross the channel.

## Security policy

Preview sandbox permissions are minimal and declared in session policy. Navigation, popups, downloads, forms, top-level access, storage, clipboard, camera, microphone, geolocation and cross-origin requests are denied unless a specific block-preview capability requires and the host authorizes them.

Renderer assets are same-origin or integrity-pinned according to host CSP. Preview must not weaken the security headers of normal administrator or public responses globally; it uses a dedicated route and policy.

## Degraded mode

When preview is unavailable, Studio retains outline, palette, inspector, command, validation and save capabilities according to host policy. It clearly marks preview as disconnected or stale. A preview failure never reports a save or publish success.
