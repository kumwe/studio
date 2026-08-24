# `@kumwe/studio`

Status: pre-Gate-A foundation alpha. The shell demonstrates contract integration and is not a finished UX.

The Lit Web Component authoring shell for Studio. It renders a block palette, structural canvas,
selection inspector, command history, and a host-rendered preview region. Persistence, authenticated
draft staging, renderer routing, media, permissions, and the preview sandbox remain the embedding host's
responsibility.

The shell resolves the canonical session mode from its experimental wire configuration and passes it
unchanged to the headless session. Every mutating affordance is disabled from the core's exported
mode-to-command table, and hybrid structure controls are additionally bounded to structural or explicitly
composable slots. These UI checks are explanatory only: programmatic commands still pass through the
headless session's fail-closed mode and hybrid-boundary guards.

Supplying a complete `ThemeDocument` feeds the viewport switcher, typed design-token controls, and
block recipes from one immutable source. Recipes dispatch as canonical atomic batches. The four core
layout definitions insert structural nodes with their declared slots and bounded defaults; responsive
token edits state whether their value is base, inherited, or overridden for the active viewport.

Importing the package has no registration side effect. Call `defineKumweStudio()` once, then use the
`<kumwe-studio>` custom element or register the class under a host-specific tag.

## Localization

The shell exports `studioMessageCatalog`, `studioMessages`, `messageText`, and their associated
types. The canonical, versioned English catalog is also available as
`@kumwe/studio/catalogs/en.json`. Hosts can supply typed message overrides without persisting
translated labels in Studio documents. Each catalog entry declares the named parameters its text
uses; the default formatter implements deterministic named interpolation and leaves missing values
visible.

## Preview surface

Preview is deny-by-default. The resolved configuration must enable preview and advertise the canonical
preview port with render and cancel operations. The host then assigns a session-bound binding and supplies
the visual surface through the `preview` slot:

```ts
studio.previewBinding = {
  client: previewClient,
  stage: (draft, { signal }) => hostDraftStore.stage(draft, { signal }),
};
```

```html
<kumwe-studio>
  <iframe slot="preview" title="Rendered page preview"></iframe>
</kumwe-studio>
```

Construct `PreviewClient` only after pinning that frame's exact origin, `contentWindow`, unpredictable channel
ID and Studio session generation. A same-origin host may instead supply an equivalently isolated mechanism as
defined by the preview contract. The shell never stages implicitly, never reads the frame DOM, and never
treats a digest as authorization.

The shell waits for `studio.preview/ready`, coalesces synchronous changes, stages and renders the exact latest
snapshot, aborts and disposes superseded work, drives semantic viewports, and maps selection in both
directions through the latest accepted marker map. Reload and teardown preserve authoring focus and state.
Without every required capability and binding, the preview region states that it is unavailable and all
permitted non-preview authoring paths remain usable. Read-only sessions render preview identically while
mutation controls remain disabled.
