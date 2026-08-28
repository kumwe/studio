# `@kumwe/studio`

Status: governed beta development, not an RC or production-supported release. The contextual
Model/Blueprint/Entry runtime and standalone browser distribution are implemented; complete host integration,
profile evidence, and release qualification remain open. The exact coordinated version is in the workspace
`studio-release.json`.

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

Importing the package has no registration or mounting side effect. Normal integrations use `mountStudio()` or
the explicit `autoMountStudio()` scan described below. Direct custom-element registration and coordinator
wiring remain advanced composition APIs for applications that already own a live Studio session.

## One browser deployment path

Every normal browser integration starts with the same public API:

- `mountStudio(target)` mounts local Studio into one exact element or selector;
- `mountStudio(target, configuration)` mounts one canonical local or hosted deployment into that target;
- `mountStudio(configuration)` resolves the configuration's unique `mount` selector; and
- `autoMountStudio()` explicitly discovers opted-in `[data-kumwe-studio]` elements and returns successful
  handles plus per-target failures.

Each explicit mount call creates an independent runtime and returns a handle whose idempotent `dispose()`
affects only that mount. The auto-mount report can dispose all of its successful handles together. A page may
therefore run several local and hosted instances at once without shared draft, history, selection,
authentication, or transport state; a failed mount is reported without rolling back its siblings.
Failure records expose only the target, configuration-element ID, safe instance correlation, phase, and error;
they never copy the deployment document or its authentication material.

### Backendless local workspace

`mountStudioStandalone(target)` opens the same contextual Model/Blueprint/Entry builder with the complete
first-party block and pattern catalog but no `HostAdapter`, endpoint, authentication claim, or persistence.
Each mount owns isolated in-element state and loses that state when the page reloads or closes. Its accessible
toolbar imports/downloads a lossless canonical `AuthoringSessionSnapshot` project separately from the exact,
outcome-specific `AuthoringSaveIntent` dataset that host mode would submit. Downloading an intent does not save,
authorize, version, or publish it. See the [standalone local integration guide](../../docs/integration/standalone-local.md).

### Configuration-driven browser mounting

`mountStudio(target)` opens blank standalone Studio in an ordinary element or exact selector. Pass a canonical
`StudioDeploymentConfiguration` as the second argument to add declared launch/transport behavior; if that
configuration also carries `mount`, it must resolve to the same target. The configuration-only overload uses
its `mount` selector. Every call returns an isolated handle whose idempotent `dispose()` removes only its own
runtime.

For server-rendered HTML, an empty `<div data-kumwe-studio></div>` is an explicitly opted-in local mount. A
non-empty value names one inert `<script type="application/json" id="…">` configuration block associated with
that target. Every non-empty configuration ID must be unique in the discovery scope and referenced by exactly
one target. `autoMountStudio()` performs the scan only when called; package import has no DOM side effect.
`mountStudioFromConfigElement()` handles a single script whose configuration supplies `mount`.

The bounded strict JSON parser rejects duplicate members before native parsing, never uses string-to-code
compilation, and rejects executable/external script elements, invalid canonical configuration, more than
2,097,152 UTF-8 bytes, JSON depth above 16, and missing or ambiguous selectors before starting any runtime. No
transport means no fetch and a local blank project. A configured HTTP refusal is propagated and never
converted to local work. See the
[deployment contract](../../docs/contracts/studio-deployment.md) and
[prebuilt asset guide](../../docs/integration/prebuilt-browser-assets.md).

### Configuration-driven HTTP host binding

For hosted mode, the canonical `StudioDeploymentConfiguration` supplies a complete PHP/host-resolved
`session`, exact launch values, and an HTTP transport. Routing is either a closed per-operation URL map or one
configured dispatcher URL with the fixed `X-Studio-Operation` discriminator. Authentication is one declared
profile: same-origin HttpOnly session cookie plus CSRF header, short-lived bearer token, or short-lived custom
header token. Both token profiles require an exact `issuedAt <= now < expiresAt` window with positive duration
no greater than 15 minutes; invalid windows fail before fetch. Studio never derives a base URL, probes a
conventional path, or invents a missing operation.

The shipped mount runtime validates the deployment before any request, constructs the browser adapter, and
resolves the contextual target. Existing/edit launches start directly. Create launches render the authorized
blank/reusable-type choice in the same mount, using the configured `authoring/list-types` route for exact type
search and pagination before one exact start. The contextual shell replaces the chooser in place; no detached
page, pre-creation, copy/paste handoff, or local fallback exists. Its Return control emits
`studio-contextual-return-request` with exactly the host-issued `{ returnContext }`; the host owns dirty-work
confirmation and navigation. PHP or another backend validates and reauthorizes every operation and owns
disclosure, persistence, revisions, transactions, audit, workflow, rendering, and webhooks. A configured 401,
403, conflict, timeout, malformed response, or unavailable operation is authoritative and never activates the
local profile.

The ordinary mount API also accepts bounded trusted browser-only seams without replacing Studio's runtime
resolver. Routes, static authentication, session data, permissions, and capabilities still come exclusively
from the inert deployment JSON:

```ts
await mountStudio(deployment, {
  hosted: {
    adapter: { resolveAuthentication: refreshShortLivedAuthentication },
    authoringControlRegistry: precompiledFieldControls,
    mediaGrantTransfer: { transfer: transferChunkToIssuedGrant },
    saveConfirmationHandler: confirmServerConsequences,
  },
});
```

`autoMountStudio({ hosted: (target, deployment) => … })` allocates live seams per discovered mount; using the
factory form prevents one stateful browser object from being shared between instances. Every instance keeps
its own configured routes, static authentication, session, and state. Resource search is automatically bound
when `studio.port/resource` advertises `resource.search`; the allowed type inventory comes from the resolved
target. Media `get` plus `list` automatically backs first-party browse/select controls, and a browse-only media
host leaves file, paste, and drop intake disabled. For upload, Studio always calls the configured adapter's
`authorize-upload`, `complete-upload`, and `abort-upload` routes. The optional precompiled seam receives only
the validated short-lived host-issued grant plus bytes and grant-relative offset; local Studio session identity
never crosses that seam. Both the requested size and grant plan are bounded by the exact resolved
`limits.maxMediaUploadBytes`. Grant receipt is its browser-visible issuance point and `issuedAt <= now <
expiresAt` is enforced with a maximum 15-minute lifetime. Transfer headers retain the schema's 20-header,
100-character name, and 2,000-character value bounds. Terminal transfer/completion failure best-effort aborts
the host grant, clears local authority, and requires retry to obtain a fresh grant. Until a separate file-upload
feature flag is standardized, resolved `clipboardMediaUpload` gates all file, paste, and drop byte intake.
External import is not exposed unless `externalMediaImport` is enabled, and the current first-party control
does not yet provide an external-URL authoring surface.

Normal configured HTTP mounting currently refuses enabled preview. The present preview port can render and
cancel an already staged digest but has no operation that accepts and authorizes the complete draft, so an
opaque `StudioPreviewBinding.stage()` would create an unconfigured endpoint track. The advanced direct element
API remains available to hosts that already own and prove that complete live binding. Incomplete service
claims, unsupported enabled preview, or an advertised operation missing from an operation-map route fail the
mount before authoring is exposed. The active Model is already returned and validated by `authoring/start`;
Studio does not invent a second Model request.

The normal contextual mount currently consumes the complete authoring route family, `resource/search`, media
`get`/`list`, and the three upload lifecycle routes above. Media `upload-status` and `import-external`, plus
artifact, localization, model-discovery, permission, recovery, and telemetry ports, remain lower-level
`HostAdapter` operations until a first-party contextual surface adopts them; advertising them does not make
Studio call them. This boundary is explicit so a PHP integration does not mistake protocol availability for a
finished browser workflow.

See the [deployment contract](../../docs/contracts/studio-deployment.md),
[transport contract](../../docs/contracts/host-transport.md), and
[generic host guide](../../docs/integration/generic-host.md) for the exact documents and round trip. The
backend implements those language-neutral schemas in PHP or another host language; Node.js/npm is a build-time
concern only.

### Advanced direct adapter API

Applications that deliberately compose a live session themselves may call
`createBrowserHttpHostAdapter(httpTransportConfiguration, options)` from `@kumwe/studio/http`, then use the
headless contextual coordinator and custom elements. This lower-level API accepts the same explicit routing
and authentication document as the normal deployment path. Production adapters do not accept a base URL or
infer routes; conventional path expansion is a testkit-only fixture helper. Direct integrations must not
manually assign element session properties in place of `mountStudio()`.

### Built-in and host-contributed tools

Local mode always opens with Studio's compiled first-party definitions and compatible starter patterns. A
hosted deployment does not inherit that complete local catalog. It exposes exactly the block type/version/
revision locks in the resolved Studio session: a lock may resolve to a compiled first-party definition, or to an
extension block that the resolved target also admits in the immutable contribution generation returned by
`authoring/start`. Target-admitted patterns are available only when every exact block dependency matches a
session lock. The opened Blueprint's dependency locks must be an exact subset of that session catalog, and
every node must use a session-locked type/version. Missing, duplicate, stale, or mismatched locks fail the
mount; neither the full catalog nor default patterns become a hosted fallback. The other declarative
contribution families remain limited to the resolved target's admitted generation. Dynamic entity blocks
declare typed resource/query ports; their data still comes from separately configured, server-authorized
operations.

Applications using the advanced backendless composition API may call
`createStudioStandaloneSetup(session, extensions)` for the deterministic local catalogue assembly. It is not a
hosted-policy shortcut. Hosted integrations use `mountStudio()` so the shipped resolver can enforce the exact
session locks and target admission; hosts must not rebuild, privately copy, or replace Studio's first-party
page-building catalogue.

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

Editor.js remains Studio's private default rich-text surface. A host enforcing strict style CSP and
Trusted Types without a `default` policy selects Studio's feature-capable sink-free surface without
learning an editor-specific API:

```ts
studio.authoringControlRegistry = new StudioAuthoringControlRegistry({
  strictContentSecurityPolicy: true,
});
```

Both surfaces read and write the same governed `StudioRichTextDocument`; this option neither changes
the artifact contract nor weakens the host policy.

Scoped CSS is the deliberate exception to property persistence: its control
emits `studio-scoped-style-change` with `{ nodeId, value }`, and the host may
apply that structured sheet as trusted renderer context. It is never written to
the Blueprint.

## Resource browser

Resource-valued ports use Studio's own browser rather than a raw binding JSON
input. Make it available only with the negotiated resource search capability,
then adapt the session's detached result value to the host-neutral service:

```ts
const resources = session.resources;
if (resources !== undefined) {
  studio.resourceSearchService = {
    resourceTypes: authorizedResourceTypes,
    search: async (query) => (await resources.search(query)).value,
  };
}
```

The browser supports explicit and debounced search, cancellation, pagination,
retry, empty states, and keyboard selection. Studio's first-party content
reference/collection ports are intentionally inspect-only because they declare
`authoring.readOnly: true`. An extension port that omits that flag may select,
replace, or clear only a canonical `resource-reference` binding. Non-resource
dynamic sources remain read-only, and adapter errors or private entity data are
never surfaced.

## Localization

The shell exports `studioMessageCatalog`, `studioMessages`, `messageText`, and their associated
types. The canonical, versioned English catalog is also available as
`@kumwe/studio/catalogs/en.json`. Hosts can supply typed message overrides without persisting
translated labels in Studio documents. Each catalog entry declares the named parameters its text
uses; the default formatter implements deterministic named interpolation and leaves missing values
visible.

## Preview surface (advanced direct composition)

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
between collections). Pointer ranking prefers the deeper semantic destination when two valid boundaries
are at exactly the same measured distance, so a coincident parent and only child do not make the child's
owning slot unreachable. Candidates at the same depth retain deterministic semantic order. `Escape` and
`pointercancel` are exact no-ops. Geometry is volatile: call the public
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
