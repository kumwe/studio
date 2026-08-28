# Runtime boundaries

## Three runtimes

Studio has three distinct runtimes that must not be collapsed. The required contextual product behavior is
defined in the [product contract](../product-contract.md); this document distinguishes implemented
Studio-side mechanics from an integrated and qualified host product (`STUDIO-PROD-014`).

### Authoring runtime

The authoring runtime is a browser application composed of the DOM-free core, Lit UI, trusted precompiled
controls, declarative contributions, and an optional host adapter. `openContextualStudioSession` resolves one
eligible core or extension target and coordinates separate Model, Blueprint, and Entry drafts, independent
dirty/state versions, presentation state, save planning, and all three save outcomes. The contextual Lit shell
projects that same resource-bound session through Model, Blueprint, and Content modes. The legacy
`openStudioSession` handle remains available for bounded Blueprint-only composition, read-only model
projection, recovery access, and compatibility use.

With no transport, the browser mount creates a blank in-memory contextual project with the built-in catalog
and JSON interchange. With configured HTTP transport, every load and durable effect uses only the declared
host operations, and a refusal never becomes local success. In either mode the runtime may maintain selection,
overlays, panels, history, and preview coordination, but it has no direct authority over persisted or published
data (`STUDIO-PROD-001`, `STUDIO-PROD-003`, `STUDIO-PROD-007`, and `STUDIO-PROD-008`).

### Host runtime

The host runtime authenticates the actor, resolves the contextual launch target, authorizes operations, owns
storage and workflows, validates artifacts, resolves resources, processes media, renders previews, and publishes
revisions. It alone accepts item saves and new or updated reusable-type revisions. The reference Kumwe App host
consumes Studio through one exact, digest-pinned Producer release: Producer realizes the wire/rendering contract
in PHP, while App-owned PHP application services, PHP HTTP endpoints, and Twig/KIS chrome retain authority and
storage. Studio remains host-neutral and the public host contract is transport-neutral
(`STUDIO-PROD-006` and `STUDIO-PROD-010`).

### Delivery runtime

The delivery runtime renders published artifacts for visitors or downstream clients. It must operate without Studio UI or authoring plugins. A host may implement it in PHP/Twig, another server language, static generation, or a native client renderer, provided it passes contract conformance for the supported block set.

Browser authoring assets are compiled before deployment. Node.js and npm are build, test, and release tools, not
production services or requirements of the PHP host or delivery runtime (`STUDIO-PROD-011`).

## Source of truth

The command-applied artifact state is the authoring source of truth. Rendered DOM is disposable output. Studio must never scrape preview markup to reconstruct a blueprint or entry.

The host's accepted revision is the persistence source of truth. Local state becomes durable only after the host returns an accepted revision for the exact snapshot sent. Optimistic concurrency uses the handle's latest accepted revision as `expectedRevision`; conflicts produce structured diagnostic data and do not trigger last-write-wins behavior. Saves are serialized, and matching concurrent intents coalesce. When edits occur during a save, that accepted revision becomes the base for the next save while the newer local state remains dirty.

## Rendering boundary

A renderer consumes validated artifacts and resolved values. It does not receive arbitrary callbacks from the document. Renderer selection is controlled by trusted block and theme registrations.

Each rendered node exposes the canonical draft-scoped preview marker in authoring preview mode. Its digest and
preorder ordinal map a DOM region through the exact response inventory without exposing private model values.
Production output need not contain preview markers.

## Network boundary

Studio's deterministic reducers and headless session coordinator perform no ambient network calls. They invoke
typed host ports through an injected adapter. The core package's optional DOM- and Node-free HTTP client is one
such adapter: it may call only the fetch-like function supplied by its caller, against exact configured routes.
Other adapters may use `postMessage`, an in-process API, or a native bridge. Every adapter must preserve request
IDs, selected wire version, session generation, verified resource context, cancellation, deadlines, bounded
responses, structured errors, and capability checks. Authenticated actor evidence remains transport-owned
rather than browser-authored configuration; the client adapter is not a persistence or authorization runtime.

JavaScript port rejections cross this boundary as `HostPortFailure`, carrying one canonical and safe
`HostPortError`. A private transport exception is not a protocol value. Request-ID and idempotency-key
factories are injected runtime services, not serialized configuration or ambient authority. Each
attempt receives a request ID; an exact failed mutation intent retains its key for retry.

## Plugin boundary

Plugins register through a scoped registrar during session compilation. Registrations are immutable for the resulting session generation. A plugin receives only declared APIs, never the host service container or unrestricted global registry.

Code isolation levels are host policy:

- bundled trusted plugin: executes in the Studio realm;
- isolated trusted plugin: executes in a worker or sandbox and contributes serializable behavior;
- declarative plugin: contributes only schema, metadata, patterns, and assets interpreted by trusted core code.

Declarative contributions are preferred. A host may prohibit executable plugins entirely.

## Failure containment

- A failed optional plugin is disabled and reported; it cannot partially register.
- A failed required plugin prevents opening the affected artifact in write mode.
- A preview timeout leaves the artifact editable in outline/inspector mode and reports stale preview state.
- A failed or abandoned upload does not create a valid asset reference; a reference becomes possible only after the host accepts a stable asset identity, while later use and publication remain gated by asset state and host policy.
- A validation failure does not mutate the accepted local state.
- A host disconnect changes the session to explicit offline or read-only state according to declared host capability; it never implies a successful save.
- A conflict or refused save preserves the local document, history, selection, dirty state, and saved baseline; no automatic rebase or overwrite occurs.
- A host error carrying `studio.host/stale-session-generation` invalidates the complete host-session handle. Later persistence or recovery calls fail locally without crossing the host boundary.

## Recovery

An application may periodically export a bounded recovery envelope containing the base revision, deterministic command log or current draft, plugin and contract inventory, and checksum. Recovery envelopes are host-encrypted or stored according to host policy. The current headless handle only delegates bounded JSON to the optional recovery port's `store`, `load`, and `discard` operations. It does not define the envelope, interpret a loaded value, apply it to the session, or select a merge. Reopening requires full validation and compatibility resolution before commands can continue.

## Session lifecycle boundary

Disposing the headless handle is a local, idempotent operation. It prevents later work through that
handle and releases local coordination state, but it does not log out the actor, discard recovery,
dispose preview state, release a host lease, or invoke a host teardown endpoint. Those effects require
separately declared and authorized port operations; none is inferred from local disposal.

The contextual session and shell implement inline, minimized, maximized, and fullscreen as state changes on the
same authorized drafts; they do not create a second session or persistence workflow. Closing or abandoning the
authoring context remains a distinct, explicit host-governed lifecycle decision. A host that moves Studio to a
different route or frame must preserve and prove target coordinates, selection/focus recovery, dirty state,
history, authority, and return context; local component state alone is not that integrated handoff evidence
(`STUDIO-PROD-007`, `STUDIO-PROD-013`, and `STUDIO-PROD-014`).
