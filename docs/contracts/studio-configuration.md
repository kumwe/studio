# Studio configuration contract

This configuration contract is subordinate to the [Studio product contract](../product-contract.md).
`STUDIO-PROD-001` through `STUDIO-PROD-013` define the contextual product outcome; this document defines only
configuration behavior that has an accepted protocol shape.

## Purpose

Studio has two deliberately separate serializable configuration layers:

- [`StudioDeploymentConfiguration`](studio-deployment.md) is the small browser bootstrap. It selects an
  exact mount, binds it to the verified browser asset release, selects standalone or HTTP transport, launch request, transient authentication
  projection, and optional safe declarative contribution bundle. An HTTP deployment includes the complete
  host-resolved session configuration below.
- `StudioConfiguration`, defined here, describes one resolved authoring session and its host policy. It contains
  no secret, bearer token, executable callback, or persistent artifact body.

The resolved session portion conforms to
[`studio-config.schema.json`](../../schemas/studio-config.schema.json). JavaScript host-port implementations,
authentication refresh callbacks, and deterministic identifier factories remain separate from that document.
The browser MUST NOT synthesize its actor, session generation, permissions, limits, host capabilities, protocol,
or resource authority from deployment defaults. A PHP or other authoritative host emits it for HTTP deployment,
and the core consumes that exact value.

The deployment launch repeats only the resource context needed in the canonical resolve/start request. The two
resource contexts MUST be canonically equal before any request is sent. Launch does not repeat mode, session
state, permissions, or host capabilities: those have one source in this resolved configuration. The later
`AuthoringSessionSnapshot` returned by `authoring/start` remains the single source for admitted target modes,
presentation states, save outcomes, artifacts, and contribution generation.

## Required configuration

A session MUST define:

- session ID, immutable session generation, exact document contract revision, and selected wire protocol version;
- locale, writing direction, time zone, calendar, numbering system, hour cycle, and optional measurement-system preference;
- active editing mode: `model`, `blueprint`, or `content`;
- composition: `single` or the bounded `hybrid` composite of Blueprint and Content operations;
- session state: `editable` or `read-only`;
- actor display metadata and opaque actor ID;
- a bounded resource context and permissions resolved for that context;
- model, blueprint and theme revision references as applicable;
- an entry ID and exact host revision when editing an existing entry;
- enabled block and plugin inventories;
- negotiated host capabilities;
- finite resource limits;
- feature policy and preview policy.

`hybrid` is not a fourth editing mode. It coordinates only the authorized Blueprint and Content operations and is invalid with Model mode. `read-only` is not a mode: it is a session state that rejects every persistent command regardless of the visible editing mode or declared permissions.

The headless session flattens the three members above into one session mode — `model`, `blueprint`, `content`, `hybrid`, or `read-only` — fixed at session creation: a read-only session state always flattens to `read-only`, the hybrid composite flattens to `hybrid`, and every other session keeps its editing mode. One deterministic mode-to-permitted-command table decides every dispatch; a command outside the active mode's permitted set fails closed with the stable `mode-forbidden` code, while a read-only session keeps rejecting with `read-only-session`. UIs MUST derive disabled affordances from the same exported table rather than duplicating it, and MUST NOT treat a hidden or disabled control as a substitute for the session-level check ([ADR 0011](../decisions/0011-editing-modes.md)).

## Advanced headless Blueprint composition profile

`openStudioSession` accepts a host-supplied `StudioConfiguration` only after the host has completed
layering, authority resolution, and protocol selection. The core does not fetch, merge, or repair
configuration and does not attach authentication evidence. The caller separately supplies the typed
host adapter and `StudioHostSessionIdentifierFactories`, whose deterministic methods are
`requestId(operationId)` and `idempotencyKey(operationId)`; those executable values are runtime
dependencies and MUST NOT be serialized into this document.

The current profile requires `mode: blueprint`, `composite: single`, either `editable` or `read-only`
session state, and `artifacts.blueprint`. It negotiates the configured protocol and artifact port and
loads that exact reference; the result MUST be a Blueprint. Extra model or theme references may remain
configuration dependencies but are not separately loaded by this profile. A model, content, or hybrid
configuration remains a valid configuration document but is unsupported by this composition profile
until the core has corresponding artifact state, persistence, and history. Opening MUST fail with a
stable diagnostic; it MUST NOT create an empty Blueprint, substitute a related artifact, or infer
identifiers.

The resulting handle fixes the configuration's generation, resource-context key, locale, resolved
session mode, and maximum history length for its lifetime. Changing any of those members requires a
new resolved configuration and handle. Host calls carry the generation, resource-context key, locale,
and protocol unchanged in the request envelope; the resolved `blueprint` or `read-only` mode and
history limit govern the local session. A host failure carrying diagnostic code
`studio.host/stale-session-generation` invalidates the whole handle; an unrelated `invalid-request`
does not.

Blueprint saves use the latest accepted host revision as the optimistic `expectedRevision`. They are
serialized, and identical concurrent save intents coalesce. An exact failed-intent retry keeps its
idempotency key, while a changed semantic intent receives a new one. A success marks the snapshot
durable only if the local session is still at that snapshot; edits made during the request remain
dirty. Conflict and failure never rewrite the draft or select a reconciliation policy.

If the optional recovery port was negotiated, `StudioHostSessionHandle.recovery` is a
`StudioHostSessionRecovery` exposing only raw `store`, `load`, and `discard` calls; otherwise it is
`undefined`, with the absence available in negotiation diagnostics. A loaded object is not applied
automatically. Recovery validation, compatibility, reconciliation, and UI remain host/application
concerns. Synchronous `dispose()` is a local idempotent lifecycle boundary and does not claim host
teardown ([ADR 0020](../decisions/0020-blueprint-host-session-composition.md)).

## Hosted coordinated contextual profile

The product target requires one contextual Studio session to coordinate separately versioned Model,
Blueprint, and Entry artifacts while the author composes layout, defines permitted fields, and enters actual
values in one continuous experience (`STUDIO-PROD-003`, `STUDIO-PROD-004`). A host launch for new content
resolves either authorized empty draft artifacts or an existing reusable content type; a launch for existing
content resolves the exact resource and its accepted artifact revisions (`STUDIO-PROD-001`,
`STUDIO-PROD-002`, `STUDIO-PROD-005`). It MUST NOT require a prerequisite type-creation screen, copy-paste, or
manual reconciliation (`STUDIO-PROD-012`).

The target also requires explicit, distinct **save item**, **save new type version**, and **save as new type**
outcomes (`STUDIO-PROD-006`). The last two coordinate Model and Blueprint revisions but exclude Entry values.
The host owns identifiers, authorization, validation, transactions, migration policy, persistence, and accepted
revisions (`STUDIO-PROD-010`). Its save plan also mints the exact bounded successor return context: every save
request binds it through the complete plan reference, and only an accepted result carrying that same context
advances the live session. A refusal or mismatch retains the prior host return context.

`StudioConfiguration` and the lower-level `openStudioSession` Blueprint API do not by themselves define that
multi-artifact composition. The normal browser deployment combines this resolved configuration with the
canonical `authoring-target`, `reusable-content-type`, `authoring-session`, and `authoring-save` schemas plus
the typed `AuthoringPort`. A
contextual start returns complete, separately identified Model, Blueprint, and Entry documents with exact
coordinates; it never relies on hidden adapter binding. Implementations MUST NOT overload the current
single-artifact `artifact.save` behavior or infer an undocumented transaction (`STUDIO-PROD-014`).

## Contract and protocol selection

`contractVersion` selects the StudioConfig document shape and semantics. In the current draft it is `0.1-draft`; it is not SemVer. `protocolVersion` is the single SemVer wire version selected during negotiation from the versions supported by Studio and `hostCapabilities.protocolVersions`. In the current beta-development implementation, the only supported wire version is `0.1.0-draft.2`.

The schema epoch in the StudioConfig schema `$id`, currently `/studio/v1/`, names the intended major schema family. It is not a session field and does not mean that Studio has reached version 1. Implementations MUST NOT derive any one of these three values from another. The complete mapping is defined by the [versioning and migration contract](versioning-and-migrations.md).

## Resource context

`resourceContext` is a portable, immutable description of what the session is editing:

- `key` is an opaque host-minted context identifier;
- `surface` identifies the embedding or authoring surface using a qualified name;
- optional `revision` identifies the host context snapshot used to resolve the session;
- `scopes` carries a bounded set of non-sensitive typed identifiers such as tenant, site, workspace, or organization; and
- optional `resource` identifies the active typed resource, such as a product or service.

The key and projected identifiers are correlation and routing data, not credentials, bearer authority, permission claims, or proof that a resource exists. They MUST NOT contain secrets, policy internals, personal attributes, or signed authorization material. The trusted host adapter resolves the key, binds the authenticated actor and independently authorizes every operation. A stale, altered, unknown, or session-mismatched context fails closed.

### Target declaration, launch, and presentation continuity

Core surfaces and authorized extensions use the same canonical `AuthoringTargetDeclaration` to make a typed host
resource Studio-authorable; the host decides whether that declaration is active and mints the resource context
(`STUDIO-PROD-008`, `STUDIO-PROD-009`). A contribution is discovery metadata, not permission or a transport
credential. The declaration remains separate from StudioConfig and is resolved for one explicit
`StudioResourceContext` through the authoring port.

Inline, minimized, maximized, and fullscreen are presentations of the same contextual session where the host
offers them (`STUDIO-PROD-007`). Moving between them MUST preserve the resource and artifact coordinates,
drafts, history, selection, focus intent, dirty and validation state, locale, authority, and deterministic
return context. It MUST NOT create a new item, silently save, or convert the work into another artifact. The
contextual session snapshot carries the current presentation and a non-secret host-minted return-context
key. That serialized state does not by itself implement the shell transition lifecycle; the UI MUST NOT claim
continuity until it preserves the full live state listed above (`STUDIO-PROD-014`).

## Artifact references

Versioned definition artifacts—model, Blueprint, and theme—use locked references containing semantic version and host revision. An existing entry uses a `resolvedEntryReference` containing `id` and required host `revision`, with optional integrity for cache or transport verification. Entries do not acquire an invented semantic version: their model reference supplies schema compatibility, while their host revision supplies optimistic concurrency and exact-state identity. Integrity never replaces the authoritative revision or grants access.

A target reusable content type coordinates the exact Model and Blueprint locks through host-owned authoring
policy; it does not merge those artifacts or add Entry values to either one (`STUDIO-PROD-004`). An
existing-item launch MUST hydrate the exact accepted type version and Entry values rather than select a newer
compatible definition (`STUDIO-PROD-005`). The resolved configuration provides pre-request policy and locked
references; the accepted contextual start snapshot provides the complete coordinated live state.

## Immutability

Configuration is immutable after session compilation, except locale, writing direction, preview viewport, theme preview choice, and user preferences explicitly marked dynamic. A change to editing mode, composition, session state, resource context, permissions, blocks, plugins, resource limits, contract or protocol version, model revision, or trust state requires a new session generation.

The UI MUST NOT infer permission from hidden controls. The Lit shell resolves the same flattened mode at session creation and derives each mutating affordance from the core's exported command table; it does not coerce every editable configuration to Blueprint mode. Hybrid insert, remove, duplicate, and reorder affordances are additionally bounded to the same structural or per-slot composable regions as the headless session. The core checks every local command against the resolved mode, state, generation, artifact fence, and any `BlueprintNode.authoring.requiredPermission`. A structural command must satisfy protected nodes in the touched subtree and protected source or destination parents; inserting a node cannot mint authority by declaring a permission the resolved session does not hold. This browser check is deterministic defense in depth, not authorization: every host call carries its exact operation identifier, and the authenticated host independently re-authorizes the operation instead of trusting the browser-readable `permissions` projection.

## Resource limits

At minimum, a host specifies limits for:

- blueprint nodes and maximum depth;
- slots and children per slot;
- property and extension-data bytes;
- command batch size and history length;
- rich-text document size and nesting;
- preview request rate and response bytes;
- media upload count and bytes;
- plugin count, contributions per plugin, and locale bytes.

A missing limit is a configuration error. Protocol releases publish safe maxima; a host MAY lower them. Raising a security-critical maximum beyond the protocol maximum requires a new negotiated capability version.

The core evaluates the complete projected artifact before committing a command. A rejection advances neither
history nor artifact state version and leaves the document, dirty state, and selection unchanged. `maxNodes`
counts all Blueprint nodes, root depth is one, `maxSlotsPerNode` applies to each node, and
`maxChildrenPerSlot` applies to each named slot. `maxCommandBatch` counts operations in one batch (the closed
command schema MAY impose a lower release-specific ceiling). `maxPropertyBytes` is the aggregate UTF-8 JSON
member payload of base and responsive property maps across Blueprint nodes; empty maps consume zero.
`maxExtensionBytes` is the corresponding aggregate across the artifact's declared extension envelopes.
`maxRichTextBytes` measures each canonical `{ "type": "doc", "content": [...] }` value as serialized UTF-8
JSON, and `maxRichTextDepth` counts its document root as depth one. Entry and Model commands apply the same
extension and rich-text checks before replacing their independent drafts.

Hosted and contextual opening validates the complete host-accepted Blueprint, Entry, and Model against the
exact resolved limits before exposing a draft or mounting a UI, then passes those limits and permissions into
the command boundary. A direct low-level `StudioSession` with no host configuration retains compatibility by
using the published protocol maxima, while omitted permissions grant no protected-node permission. It never
invents a host policy.

`maxHistoryEntries` is a positive integer because every editable command session provides bounded undo
history; zero is not a hidden way to disable the invariant. Headless and mounted sessions pass the resolved
value to the same core history boundary.

## Feature policy

Features are deny-by-default. Examples include executable plugins, cross-origin preview, external media import, clipboard image upload, collaboration, offline recovery, custom inspectors, and host queries. Enabling a feature never bypasses permission, capability, or content-policy checks.

## Configuration layers

Hosts MAY build a session from layered configuration, but MUST produce and expose one resolved immutable configuration. Merge order and provenance are host-owned. Arrays and security policy MUST NOT use implicit deep-merge rules; the host resolves them explicitly so a less trusted layer cannot append authority.

## Diagnostics

Session creation fails with stable diagnostics for unsupported protocol, invalid configuration, unavailable required plugin, incompatible theme, unresolved required block, insufficient host capability, invalid limits, or denied mode. A host MAY open a safe read-only recovery session when artifacts remain inspectable.
