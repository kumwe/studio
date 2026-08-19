---
'@kumwe/studio-protocol': minor
'@kumwe/studio-preview': minor
---

The preview channel's Gate A vocabulary is canonical and implemented. `studio.preview/activated` lets a
renderer report a trusted interaction with a marked region — intent, never raw input events —
`studio.preview/viewport` drives the surface to a semantic role or to bounded explicit dimensions as
alternatives rather than a merge, and `studio.preview/dispose` revokes the resources held for a
superseded draft while the channel stays open. Dispose and teardown are now explicitly distinct:
teardown ends the session, dispose frees a superseded render within one that continues. The client
gains `onActivated`, `setViewport` and `disposeDraft`; the host gains `announceActivation`,
`onViewport` and `onDispose`; and the canonical guard and schema refuse an invented interaction, an
out-of-bounds dimension, a role-and-dimensions merge, and a malformed digest.
