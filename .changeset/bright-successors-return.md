---
'@kumwe/studio-protocol': minor
'@kumwe/studio-core': minor
'@kumwe/studio': minor
'@kumwe/studio-testkit': minor
---

Bind every contextual save to a required host-minted successor return context. The complete
`{ id, revision, successorContext }` plan reference now crosses each request and result, core adopts the exact
host-returned context only after acceptance, and the portable HTTP vector proves advancement plus mismatch
refusal.

**BREAKING host integration change:** `savePlan.successorContext` and
`planReference.successorContext` are now required. A host pinned to an earlier authoring-save schema digest
must update all plan, request, result, replay, and fixture producers before re-pinning. The accepted result's
`session.presentation.returnContext` must exactly equal the planned successor; a two-member `{ id, revision }`
reference or a different returned context is rejected. Migrate and validate the whole host generation, then
atomically re-pin the release record, schema manifest, and corpus; do not synthesize a browser default or mix
old and new producers.
