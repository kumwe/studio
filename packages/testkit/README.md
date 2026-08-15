# `@kumwe/studio-testkit`

Status: pre-Gate-A foundation alpha. Its conformance helpers do not by themselves constitute gate evidence.

The current alpha exports three builders—`createBlueprintFixture`, `defineTestBlock`, and
`createStudioConfigurationFixture`—plus `assertBlueprintConforms` and its structured
`StudioConformanceError`. The assertion checks a Blueprint against supplied block definitions through
the current core validator. It does not yet prove host, plugin, theme, preview, media, accessibility,
security, lifecycle, or cross-language conformance.

Package subpaths under `@kumwe/studio-testkit/fixtures/<filename>` contain byte-identical copies of the
canonical valid examples, including separate MediaAsset and persisted MediaReference examples. There
is no aggregate runtime `fixtures` export. The helpers do not depend on Vitest or another test runner,
so consumers may call the current assertion from any JavaScript test environment.

## Host testbed

`createTestbedHost(options)` builds a deterministic, fully in-memory `HostAdapter` reference host
for conformance and failure testing. Every standard port except `model` is implemented against
seeded fixtures (`documents`, `resources`, `mediaAssets`, `messages`, `permissions`, and an
optional preview `render` callback). Each operation first checks connectivity and injected
failures, then validates the `HostRequestContext` envelope structurally (wrong wire protocol
versions reject as `incompatible`), then enforces the current session generation. Every failure
rejects with `TestbedHostError`, whose `error` document satisfies `isHostPortError`; `not-found`
messages never disclose which identifiers exist. Revisions advance as deterministic counters
(`<id>-r<n>`), optimistic-concurrency conflicts return the safe current revision without changing
stored state, and search/media pagination uses opaque cursors. The returned `controls` drive
failure scenarios: `disconnect()`/`reconnect()` for retryable `unavailable` outages,
`failNext(port, operation, category)` for exactly one injected failure (retryable only for
`unavailable` and `rate-limited`), and `setPermissions(...)`, which replaces the permission list
and bumps the session generation so stale contexts reject as `invalid-request`. `revisionOf(id)`,
the `sessionGeneration` getter, and the recorded `telemetryEvents` support assertions.
`createHostRequestContextFixture` builds conforming request envelopes. The testbed uses no clocks,
randomness, or timers, so runs are fully reproducible.

Gate A requires valid and invalid fixture corpora plus runner-neutral assertions for block, theme,
plugin, host-port, command, preview, media, compatibility, migration, lifecycle, security,
accessibility, localization, and TypeScript/Dart equivalence. Those remain target deliverables; this
foundation alpha must not be cited as their evidence.
