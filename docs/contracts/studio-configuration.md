# Studio configuration contract

## Purpose

A resolved Studio configuration describes one authoring session and its policy. It does not contain secrets, bearer tokens, executable callbacks in serialized form, or persistent artifacts.

The serializable portion conforms to [`studio-config.schema.json`](../../schemas/studio-config.schema.json). JavaScript host-port implementations remain separate from that document. A `createStudio(config, hostAdapter)`-style composition API is a Gate A target, not a current export or stable function name. The present foundation alpha exposes `defineKumweStudio()` to register the experimental custom-element shell, whose limited surface accepts `ExperimentalShellConfiguration`; it does not yet consume the complete canonical Studio configuration or host-adapter contract.

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

## Contract and protocol selection

`contractVersion` selects the StudioConfig document shape and semantics. In the current draft it is `0.1-draft`; it is not SemVer. `protocolVersion` is the single SemVer wire version selected during negotiation from the versions supported by Studio and `hostCapabilities.protocolVersions`. In the current alpha, the only supported wire version is `0.1.0-draft.1`.

The schema epoch in the StudioConfig schema `$id`, currently `/studio/v1/`, names the intended major schema family. It is not a session field and does not mean that Studio has reached version 1. Implementations MUST NOT derive any one of these three values from another. The complete mapping is defined by the [versioning and migration contract](versioning-and-migrations.md).

## Resource context

`resourceContext` is a portable, immutable description of what the session is editing:

- `key` is an opaque host-minted context identifier;
- `surface` identifies the embedding or authoring surface using a qualified name;
- optional `revision` identifies the host context snapshot used to resolve the session;
- `scopes` carries a bounded set of non-sensitive typed identifiers such as tenant, site, workspace, or organization; and
- optional `resource` identifies the active typed resource, such as a product or service.

The key and projected identifiers are correlation and routing data, not credentials, bearer authority, permission claims, or proof that a resource exists. They MUST NOT contain secrets, policy internals, personal attributes, or signed authorization material. The trusted host adapter resolves the key, binds the authenticated actor and independently authorizes every operation. A stale, altered, unknown, or session-mismatched context fails closed.

## Artifact references

Versioned definition artifacts—model, Blueprint, and theme—use locked references containing semantic version and host revision. An existing entry uses a `resolvedEntryReference` containing `id` and required host `revision`, with optional integrity for cache or transport verification. Entries do not acquire an invented semantic version: their model reference supplies schema compatibility, while their host revision supplies optimistic concurrency and exact-state identity. Integrity never replaces the authoritative revision or grants access.

## Immutability

Configuration is immutable after session compilation, except locale, writing direction, preview viewport, theme preview choice, and user preferences explicitly marked dynamic. A change to editing mode, composition, session state, resource context, permissions, blocks, plugins, resource limits, contract or protocol version, model revision, or trust state requires a new session generation.

The UI MUST NOT infer permission from hidden controls. Every command and host call carries an operation identifier that the core checks against session permissions; the host authorizes independently.

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

`maxHistoryEntries` is a positive integer because every editable command session provides bounded undo history; zero is not a hidden way to disable the invariant. The Gate A composition API MUST pass the resolved value to the core history engine. The experimental alpha shell does not yet consume canonical StudioConfig and currently uses the core's explicit default, so it does not claim this pass-through is implemented.

## Feature policy

Features are deny-by-default. Examples include executable plugins, cross-origin preview, external media import, clipboard image upload, collaboration, offline recovery, custom inspectors, and host queries. Enabling a feature never bypasses permission, capability, or content-policy checks.

## Configuration layers

Hosts MAY build a session from layered configuration, but MUST produce and expose one resolved immutable configuration. Merge order and provenance are host-owned. Arrays and security policy MUST NOT use implicit deep-merge rules; the host resolves them explicitly so a less trusted layer cannot append authority.

## Diagnostics

Session creation fails with stable diagnostics for unsupported protocol, invalid configuration, unavailable required plugin, incompatible theme, unresolved required block, insufficient host capability, invalid limits, or denied mode. A host MAY open a safe read-only recovery session when artifacts remain inspectable.
