# `@kumwe/studio`

Status: pre-Gate-A foundation alpha. The shell demonstrates contract integration and is not a finished UX.

The Lit Web Component authoring shell for Studio. It renders a block/pattern palette, measured visual
canvas with a structural fallback, semantic outline, selection inspector, command history, and a
host-rendered preview region. Persistence, authenticated
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

Studio owns its production catalog. Omit both `configuration.blockDefinitions` and `patterns` to use the
complete first-party definitions and compatible starter patterns. An explicit array replaces the corresponding
default; an explicitly replaced catalog does not implicitly receive incompatible first-party patterns.
Embedding applications that extend Studio should call `createStudioStandaloneSetup(session,
extensions)`; it places first-party entries first, appends host contributions, and rejects duplicate
type/version or pattern/version identities. The host therefore contributes its dynamic entity blocks
without rebuilding or privately copying Studio's page-building catalog.

## Advanced authoring controls

`StudioAuthoringControlRegistry` mounts first-party page controls by the stable
identifiers in `STUDIO_AUTHORING_CONTROL_IDS`. It accepts canonical Studio
values and editor-neutral injected services; hosts never configure or receive
Editor.js, code-editor, chart, equation, or diagram runtime objects. Dynamic
bindings are read-only and invalid transient input preserves the last canonical
value. See the [normative control contract](../../docs/contracts/authoring-controls.md).

The live inspector mounts these controls directly from each block definition's
`propertyControls` and port `authoring` metadata. Static port edits dispatch the
canonical `set-binding` command, property edits dispatch `set-property`, and
dynamic bindings remain inspectable but disabled. The shell destroys stale
instances on selection, catalog, registry, and connection changes; preserves
focus across command-driven remounts; and turns mount or validation failures
into Studio diagnostics. Assign an application-specific registry only when the
host needs to inject media, upload, code-field, or trusted-preview services:

```ts
studio.authoringControlRegistry = new StudioAuthoringControlRegistry({
  media: { provider: mediaProvider, uploadTransport },
});
await studio.authoringReady;
```

Scoped CSS is the deliberate exception to property persistence: its control
emits `studio-scoped-style-change` with `{ nodeId, value }`, and the host may
apply that structured sheet as trusted renderer context. It is never written to
the Blueprint.

Drawing and table are complete first-party value editors. Drawing offers a
native SVG pointer surface plus labelled coordinates and keyboard actions; it
emits only canonical vector strokes and alternative text. Table offers labelled
caption, heading, cell, row, and column controls over the canonical text-only
table document. Both honor read-only bindings and route every accepted commit
through the registry's `onChange`, so shell command history provides undo/redo.
Neither control persists DOM, SVG, HTML, canvas commands, or executable source.

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
directions through the latest accepted marker map. It then measures that map through the canonical channel
in bounded chunks and draws selection, hover and semantic drop targets as a CSP-safe SVG overlay. The overlay
is pointer-inert until the author enables `Select and move rendered blocks`, preserving an explicit
edit/operate boundary for trusted preview controls. Its SVG is explicitly sized to the measured iframe
viewport and shares the iframe's overflow surface, so editor-column reflow and horizontal panning cannot
stretch or desynchronize marker geometry.

After persistence succeeds, call `studio.markSaved(acceptedRevision, savedStateVersion)`. The optional state
version is the value captured with the saved snapshot and is required when a save may settle after newer
edits. The shell rebases the existing session and its complete undo/redo timeline, retains selection, keeps
newer edits dirty, and supersedes preview work so the host next stages the exact accepted revision and digest.

Pointer reorder/reparent, the selected outline entry's destination selector, and command-palette
destinations use one candidate set and dispatcher (`reorder-children` within a collection, `move-node`
between collections). `Escape` and `pointercancel` are exact no-ops. Geometry is volatile: call the public
`refreshPreviewGeometry()` method after the embedding host observes preview scroll, resize, zoom, or late
asset settlement. A newer measurement generation wins even for the same render digest.

Hosts may assign active, schema-validated `PatternDocument[]` through the `patterns` property; applying one
uses the canonical `apply-pattern` command after exact definition/destination checks and deterministic ID
allocation. The inspector exposes `reset-inherited-property`, and successful shell deletions can be restored
through `restore-node` from an in-memory journal bounded by the session's `maxHistoryEntries`.

Reload and teardown preserve authoring focus and state. Without every required capability and binding, the
preview region states that it is unavailable and all permitted non-preview authoring paths remain usable
through the structural fallback, outline, inspector and palette. Read-only sessions render preview
identically while mutation controls remain disabled.

## Model-bound fields

When the resolved configuration advertises both model read operations, load the Blueprint's exact locked
model through the headless host-session seam and pass its detached projection to the shell:

```ts
const activeModel = await session.models?.get(session.session.document.model);
studio.contentModel = activeModel?.value;
```

The inspector then offers only block-port-compatible fields in deterministic authoring order. Choosing a
field dispatches the canonical `set-binding` command with an `entry-field` path; it never changes the supplied
model. The selected field's declared built-in control is shown as a non-editing preview. Namespaced controls
state that a host field-adapter contribution is required rather than falling back to an inferred input.

Model ID/version/revision drift, removed fields and kind/cardinality changes surface through exact
`studio.binding/*` diagnostics while preserving the stored binding. When model reads are advertised but no
active projection is supplied, field choices stay disabled and the shell does not reopen its legacy free-form
JSON binding editor. Read-only sessions show the same projection with every binding mutation disabled.
