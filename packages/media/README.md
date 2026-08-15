# `@kumwe/studio-media`

Status: pre-Gate-A foundation alpha. It supplies orchestration primitives, not a production media backend.

Host-neutral media orchestration. Hosts provide authentication, storage, upload, processing, and
authorization through this package's runtime `MediaProvider`; the package supplies cancellation-safe
browsing state and deterministic responsive-rendition selection.

Studio artifacts store the protocol's usage-specific `MediaReference`, while `MediaAsset` is the
host's library projection. URLs are delivery details returned by the receiving host and belong in
neither persisted contract.
