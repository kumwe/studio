# Host adapter contract

## Purpose

The host adapter is the only route from Studio to host-owned authority. It exposes typed asynchronous ports and a negotiated capability inventory. Studio core performs no network, authentication, storage, media, or template operations itself.

Host capability documents conform to [`host-capabilities.schema.json`](../../schemas/host-capabilities.schema.json).

## Session handshake

Before opening an artifact, host and Studio negotiate:

- supported document contract revisions and SemVer wire protocol versions within the selected schema epoch;
- host identity and deployment generation;
- supported ports and versions;
- actor/session context and permissions;
- limits and feature policy;
- block, theme, renderer and plugin inventories;
- locale, direction, time zone and formatting capabilities;
- offline, recovery and collaboration behavior.

Capabilities state technical support. Permissions state actor authority. Studio requires both.

Negotiation produces one resolved StudioConfig. Its `contractVersion` selects that configuration document's shape, while its `protocolVersion` is the one wire version selected from Studio support and `hostCapabilities.protocolVersions`. The schema epoch is identified by canonical schema `$id`; it is not transmitted as a substitute for either value. No common wire version or unsupported document revision prevents an editable session.

The headless Blueprint composition entry point consumes that resolved configuration; it does not
perform or simulate this handshake. Before loading, it verifies the selected protocol and negotiates
the required artifact port against the capability inventory. The host still checks the exact operation
capability, resource context, generation, and authority on every request. The current composition
profile requires `mode: blueprint`, `composite: single`, and a configured Blueprint reference. It
refuses other modes, hybrid composition, or a loaded model or entry rather than fabricating a
different artifact kind ([ADR 0020](../decisions/0020-blueprint-host-session-composition.md)).

## Standard ports

| Port           | Responsibility                                                             |
| -------------- | -------------------------------------------------------------------------- |
| `artifact`     | Load, validate, save, version, publish, unpublish and inspect dependencies |
| `model`        | Discover authorized models and fields through read-only `list` and `get`   |
| `resource`     | Search and resolve authorized resources and registered queries             |
| `preview`      | Render, cancel and diagnose authenticated previews                         |
| `media`        | Browse, upload, process, annotate and select stable media assets           |
| `localization` | Load message bundles and host display vocabularies                         |
| `permission`   | Explain or refresh scoped actor authority                                  |
| `recovery`     | Store, load and discard protected recovery envelopes                       |
| `telemetry`    | Emit allowlisted, redacted operational events when policy permits          |

Hosts MAY omit optional ports. A plugin cannot add host authority by declaring a required port.

## Request envelope

Every port operation carries a unique request ID, selected wire protocol version, session generation, operation ID, the opaque `resourceContext.key`, expected revision when mutating, idempotency key when retryable, locale, cancellation signal in-process, and trace context allowed by privacy policy. A transport MAY carry the bounded scope/resource projection for diagnostics or routing, but the host resolves and verifies the canonical context from the key rather than trusting client-supplied scope values.

Actor identity and authorization evidence are attached by the trusted adapter transport. Studio-supplied actor IDs are display/context values and MUST NOT authenticate a request.

The resource-context key is non-secret and non-bearer. It is bound to the authenticated actor, session generation, selected surface, and host policy at the trusted boundary. Changing context creates a new session generation; stale, altered, or cross-session keys are rejected without disclosing private resource existence.

## Response and errors

Success returns the accepted resource revision and normalized result. Failures use stable error categories:

- `invalid-request`
- `unauthenticated`
- `forbidden`
- `not-found`
- `conflict`
- `validation-failed`
- `incompatible`
- `limit-exceeded`
- `rate-limited`
- `unavailable`
- `cancelled`
- `internal`

Errors include a correlation ID, safe localized message key, retry classification, and structured field/node diagnostics where disclosure is authorized. Stack traces, SQL, secrets, filesystem paths, and private resource existence are not returned to untrusted clients.

The error document shape is canonical in [`host-error.schema.json`](../../schemas/host-error.schema.json), projected as `HostPortError` with the `isHostPortError` guard, and the port surface above is executable as the typed `HostAdapter` port interfaces in `@kumwe/studio-protocol`.

In JavaScript, a conforming port promise rejects with `HostPortFailure`, whose public `error` member is
that canonical `HostPortError`. Consumers use `isHostPortFailure` instead of depending on an adapter's
private exception class or accepting a structurally similar transport exception. A boundary receiving
any other thrown value converts it to a safe, non-retryable `internal` failure and does not expose the
original message or stack.

Rejection of a stale session generation uses category `invalid-request` and includes a diagnostic with
the exact code `studio.host/stale-session-generation`. That code, not the broad category by itself,
invalidates a composed host-session handle. Once observed, the handle makes no more host calls; a new
resolved configuration and generation are required. Other `invalid-request` failures remain scoped to
their attempted operation.

## Mutation guarantees

A host mutation MUST be authenticated, authorized, schema- and domain-validated, audited according to host policy, concurrency-protected, and atomic for its declared unit. Retryable mutations require idempotency. Browser transports apply CSRF or equivalent same-origin protections.

An idempotency record is scoped by `idempotencyKey`, operation capability, resolved
`resourceContextKey`, and `sessionGeneration`. Within that scope, its exact intent preimage is the
operation argument plus `expectedRevision`, `locale`, and `protocolVersion`, serialized with Studio's
canonical JSON profile. Optional semantic fields that are absent are omitted rather than encoded as
null; canonical number rules apply, including negative-zero normalization. The per-attempt `requestId`
and privacy-filtered `traceContext` are correlation only and MUST NOT change intent. A no-argument
mutation supplies the operation's declared JSON null argument rather than inventing an absent-field
spelling.

A retry of an accepted intent returns the original result exactly, including its revision; it does
not repeat the mutation or consume another rate-limit unit. Reusing the scoped key for different
intent is `invalid-request` before optimistic-concurrency evaluation. A failed attempt is not retained
as an accepted result.

Rate-limit errors carry `retryable: true` and `retryAfterMilliseconds` when the host can safely disclose
the remaining delay. Refused work has no mutation side effect. Preview cancellation is scoped to the
resolved session, resource context, and draft digest; cancel returns null, the in-flight render settles
as `cancelled`, and a renderer result arriving after cancellation is discarded.

The Blueprint host-session handle serializes saves and coalesces concurrent requests for the same
current intent. Each attempt has a new caller-supplied request ID. An exact retry of a failed intent
reuses its caller-supplied idempotency key; any semantic change to the intent receives a new key. A save
uses the latest host-accepted revision as `expectedRevision`. If the actor edits while that snapshot is
in flight, a success advances the handle's accepted revision but does not mark the newer local state
saved. The success rebases the revision carried by the current, undo, and redo Blueprint snapshots
without advancing local state or replacing selection; the saved snapshot's captured `stateVersion`
decides whether the current state is clean. Conflict or refusal leaves the local document, history,
selection, dirty state, and saved baseline unchanged.

The optional recovery port remains a raw storage boundary. Composition may invoke `store`, `load`, or
`discard` with bounded JSON, but it neither synthesizes a recovery format nor applies, merges, or
reconciles loaded data. Local handle disposal is idempotent and does not imply a host call: the adapter
currently declares no session-teardown operation.

The optional model read seam follows the same rule. When `studio.port/model` advertises and implements
both `studio.operation/model.list` and `studio.operation/model.get`, the Blueprint handle exposes
`models.list()` and `models.get(reference)`. Omitting either operation, or advertising the port without an
adapter implementation, disables the whole surface with an information diagnostic; Studio does not pretend
that a partial model catalog is safe for binding. A caller reference is validated before a request ID is
allocated. `get` carries the requested ID and semantic version, plus the immutable revision when supplied;
the returned document must match that coordinate. `list` refuses a malformed document or duplicate exact
ID/version/revision coordinate and the composed handle normalizes accepted results by ID, version, then
revision using code-unit order.

Both reads carry the negotiated operation ID, protocol, locale, resource-context key and session generation.
They return detached `content-model` snapshots validated against the canonical schema. An adapter result
outside that shape becomes the safe, non-retryable `internal` failure diagnostic
`studio.host/unexpected-model-result`; private adapter data is not echoed. A stale-generation error
invalidates the entire composed handle before any later model, recovery or artifact call. These operations
do not grant or imply model creation, migration, persistence or publication authority
([ADR 0024](../decisions/0024-read-only-model-binding-projection.md)).

## Query guarantees

Resource search, counts, facets, pagination, relations and projections enforce authorization inside the host query. Studio never post-filters unauthorized results. Opaque cursors are preferred over client-constructed offsets for mutable datasets.

## Transport

The ports above are behaviour, not a wire format. The normative HTTP binding — route scheme, request and result bodies, and the bidirectional category-to-status table — is the [host transport binding](host-transport.md), and the closed registry that maps each operation's typed method, route segment and capability identifier one to one is [`host-operations.schema.json`](../../schemas/host-operations.schema.json). A capability document may only advertise operations the registry defines, so a host cannot claim an operation that is not on the wire.

## Proving conformance

A host adapter claims [`studio.profile/host-baseline`](conformance-profiles.md) by replaying the
canonical single-exchange corpus published as `vectors/host/` in `@kumwe/studio-testkit`. It claims
`studio.profile/host-baseline-v2` by replaying that corpus plus `vectors/host-sequence/`. Each vector
fixes reproducible host state, requests, ordered settlement, explicit logical-clock or renderer
controls where needed, and required final state. The exact portable assertions and their recorded
limits are enumerated in the profile; a replay does not imply unlisted transport, security, renderer,
or production-policy coverage.

## Reference implementation requirements

The Kumwe App adapter must call application services rather than querying Doctrine, resolving the DI container dynamically, or putting business rules in TypeScript. Twig renderers remain server-side. Flutter and other hosts can implement the same behavior through HTTP or a native bridge.
