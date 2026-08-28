---
'@kumwe/studio-core': minor
'@kumwe/studio-protocol': minor
---

Add the canonical configuration-first browser deployment contract, safe declarative contribution bundle,
standalone defaults, full host-operation routing and CSP-safe runtime validation.

BREAKING: every emitted deployment object now requires `kind`, `mount`, and `release`; `release` must exactly
copy `{ version, corpusManifestDigest }` from the verified `studio-assets.json`. Configless standalone remains
available only by omitting the configuration document and mounting an explicit/associated DOM target—`{}` and
`{ "mount": "…" }` are no longer valid emitted documents. Standalone documents may request a bounded top-level
`locale`; hosted documents continue to carry locale only in `session.locale`.

Host migration: load the verified browser asset manifest before rendering HTML, copy its `release` object into
each deployment, and always emit the frozen `kind` plus an exact mount selector. PHP hosts must construct
`StudioDeploymentEmitter($schemas, $browserRelease)` (optionally deriving the second argument with
`releaseFromAssetManifestFile()`); the emitter rejects a stale or missing release before schema evaluation.
