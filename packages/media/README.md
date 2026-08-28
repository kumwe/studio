# `@kumwe/studio-media`

Status: governed beta development, still pre-Gate-A and not production-supported. The exact coordinated
version is in the workspace `studio-release.json`; this package supplies orchestration primitives, not a
production media backend.

Host-neutral media orchestration. Hosts provide authentication, storage, upload, processing, and
authorization through this package's runtime `MediaProvider`; the package supplies cancellation-safe
browsing state and deterministic responsive-rendition selection.

Studio artifacts store the protocol's usage-specific `MediaReference`, while `MediaAsset` is the
host's library projection. URLs are delivery details returned by the receiving host and belong in
neither persisted contract.

`StudioMediaFieldController` provides the reusable browse/search/page/select/replace and
paste/drop/upload workflow, including progress, cancel/retry, alternative text, decorative mode,
caption, focal point, rendition intent, and orphan recovery. Inject a `MediaProvider` and, for
host-authorized chunked uploads, a `MediaUploadTransport`. Dynamic host bindings are read-only.

The controller's observable value contains only the stable `MediaReference`; asset projections,
bytes, paths, delivery URLs, credentials, and upload grants never enter the artifact.

## Upload orchestration

`MediaUploadController` drives the canonical media-upload-session state machine —
`requested → authorized → transferring → verifying → complete`, with `failed` and `cancelled`
terminals — over a host-implemented `MediaUploadTransport` (`authorize`, `transfer`, `finalize`,
and best-effort `abort`). Chunking follows the host's authorized plan, and every emitted snapshot
conforms to the protocol's `media-upload-session` schema. A file larger than the plan's
`maximumBytes` fails before any transfer with a `studio.media/upload-too-large` diagnostic;
transport rejections surface as a generic `studio.media/upload-failed` diagnostic and never leak
raw error text. `cancel()` aborts in-flight work and requests best-effort server-side
cancellation, and `retry()` restarts a failed session from authorization under a fresh session id.
