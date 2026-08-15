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

Gate A requires valid and invalid fixture corpora plus runner-neutral assertions for block, theme,
plugin, host-port, command, preview, media, compatibility, migration, lifecycle, security,
accessibility, localization, and TypeScript/Dart equivalence. Those remain target deliverables; this
foundation alpha must not be cited as their evidence.
