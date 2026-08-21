# Runtime boundaries

## Three runtimes

Studio has three distinct runtimes that must not be collapsed.

### Authoring runtime

The authoring runtime is a browser application composed of the DOM-free core, Lit UI, trusted plugins, and a host adapter. It may maintain unsaved state, selection, overlays, panels, history, and preview coordination. It has no direct authority over persisted or published data.

### Host runtime

The host runtime authenticates the actor, authorizes operations, owns storage and workflows, validates artifacts, resolves resources, processes media, renders previews, and publishes revisions. The reference Kumwe App host uses PHP application services and Twig, but the public host contract is transport-neutral.

### Delivery runtime

The delivery runtime renders published artifacts for visitors or downstream clients. It must operate without Studio UI or authoring plugins. A host may implement it in PHP/Twig, another server language, static generation, or a native client renderer, provided it passes contract conformance for the supported block set.

## Source of truth

The command-applied artifact state is the authoring source of truth. Rendered DOM is disposable output. Studio must never scrape preview markup to reconstruct a blueprint or entry.

The host's accepted revision is the persistence source of truth. Local state becomes durable only after the host returns an accepted revision. Optimistic concurrency uses an expected revision; conflicts produce structured reconciliation data and do not trigger last-write-wins behavior.

## Rendering boundary

A renderer consumes validated artifacts and resolved values. It does not receive arbitrary callbacks from the document. Renderer selection is controlled by trusted block and theme registrations.

Each rendered node exposes the canonical draft-scoped preview marker in authoring preview mode. Its digest and
preorder ordinal map a DOM region through the exact response inventory without exposing private model values.
Production output need not contain preview markers.

## Network boundary

Studio core performs no network calls. The UI invokes typed host ports. An adapter may use HTTP, postMessage, an in-process API, or a native bridge, but it must preserve request IDs, selected wire version, session generation, verified resource context, cancellation, timeouts, structured errors, and capability checks. Authenticated actor evidence remains transport-owned rather than browser-authored configuration.

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

## Recovery

The browser periodically exports a bounded recovery envelope containing the base revision, deterministic command log or current draft, plugin and contract inventory, and checksum. Recovery envelopes are host-encrypted or stored according to host policy. Reopening requires full validation and compatibility resolution before commands can continue.
