# `@kumwe/studio`

Status: pre-Gate-A foundation alpha. The shell demonstrates contract integration and is not a finished UX.

The Lit Web Component authoring shell for Studio. It renders a block palette, structural canvas,
selection inspector, and command history. Persistence, rendering, media, and permissions remain the
embedding host's responsibility; this alpha does not yet implement the canonical host-adapter API.

The shell resolves the canonical session mode from its experimental wire configuration and passes it
unchanged to the headless session. Every mutating affordance is disabled from the core's exported
mode-to-command table, and hybrid structure controls are additionally bounded to structural or explicitly
composable slots. These UI checks are explanatory only: programmatic commands still pass through the
headless session's fail-closed mode and hybrid-boundary guards.

Importing the package has no registration side effect. Call `defineKumweStudio()` once, then use the
`<kumwe-studio>` custom element or register the class under a host-specific tag.

## Localization

The shell exports `studioMessageCatalog`, `studioMessages`, `messageText`, and their associated
types. The canonical, versioned English catalog is also available as
`@kumwe/studio/catalogs/en.json`. Hosts can supply typed message overrides without persisting
translated labels in Studio documents. Each catalog entry declares the named parameters its text
uses; the default formatter implements deterministic named interpolation and leaves missing values
visible.
