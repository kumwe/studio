---
'@kumwe/studio-protocol': minor
'@kumwe/studio-testkit': minor
---

Declare `studio.profile/host-baseline-v2` and publish its nine-vector portable host sequence corpus.
The versioned schema fixes exact seed replay, the canonical idempotency scope/preimage, explicit
logical-clock and renderer controls, semantic closure guards, and the assertion inventory for replay,
changed intent, scope separation, operation identity, fixed-window reset, failed-attempt retry, and
preview cancellation/isolation. The reference testbed now preserves authoritative seed revisions and
session generations, enforces exact operation capabilities, retains accepted mutation outcomes by
canonical intent, and implements deterministic rate and asynchronous preview cancellation semantics.
