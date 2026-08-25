---
'@kumwe/studio-core': minor
'@kumwe/studio-protocol': minor
'@kumwe/studio-testkit': minor
---

Add the bounded headless Blueprint host-session composition. `openStudioSession` now consumes a
resolved single-composition Blueprint configuration and deterministic identifier factories,
negotiates and loads the configured Blueprint, then returns a handle with serialized/coalesced
optimistic saves, exact-intent idempotency retry, raw optional recovery access, stale-generation
invalidation, and local idempotent disposal. The protocol publishes `HostPortFailure`, its guard, and
the stable `studio.host/stale-session-generation` diagnostic; the deterministic testbed uses that
public failure surface.
