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

## Host conformance corpus

`@kumwe/studio-testkit/vectors/host/<filename>` publishes the executable assertion set for
`studio.profile/host-baseline`. Each vector is language-neutral JSON conforming to
`host-vector.schema.json`: it fixes the host state to seed (`given`), the request envelope and
argument to send (`context`, `argument`), and the required outcome (`expect`) — an accepted result
with its revision behaviour, or one category of the closed error taxonomy with its retry
classification and non-disclosure obligations. Every precondition is a condition a real host
reproduces, never a test double, so an adapter written in any language replays the corpus in its own
test suite without executing Studio code. The reference host's own claim against the profile is
`test/host-vectors.test.ts`. The profile records the obligations it does not yet assert; consult
`docs/contracts/conformance-profiles.md` before treating a green replay as complete coverage.

Gate A requires valid and invalid fixture corpora plus runner-neutral assertions for block, theme,
plugin, host-port, command, preview, media, compatibility, migration, lifecycle, security,
accessibility, localization, and TypeScript/Dart equivalence. The host-port corpus above is the first
of those to land; the remainder are target deliverables and this foundation alpha must not be cited as
their evidence.
