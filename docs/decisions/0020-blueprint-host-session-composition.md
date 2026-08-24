# ADR 0020: Blueprint host sessions compose through one headless handle

- Status: proposed
- Scope: resolved configuration, artifact persistence, failure containment, recovery access, and local lifecycle

## Context

The protocol already defines a resolved `StudioConfiguration`, a typed `HostAdapter`, capability
negotiation, optimistic revisions, idempotent mutations, and a DOM-free `StudioSession`. Integrators
nevertheless had to assemble those pieces themselves. Different callers could load the wrong artifact
kind, omit the configured history limit, generate request envelopes inconsistently, mark a newer local
draft saved when an older snapshot completed, treat every `invalid-request` as a stale session, or
invent recovery and teardown behavior that no port contract defines.

The generic core also supports several session modes, while its recorded history currently owns only
a Blueprint document. Treating that implementation fact as permission to fabricate a Blueprint for a
model or entry would erase artifact identity and blur authority. Similarly, a resolved configuration
is the output of the host handshake; the core has no transport operation from which it could safely
reconstruct that handshake.

Host-port failures had a canonical JSON document but no canonical JavaScript rejection value. The
reference testbed wrapped that document in a test-only error class, leaving production adapters and
callers to guess whether a rejected promise contained a raw document, an `Error`, or a private
transport exception. Session-generation rejection was also only the broad `invalid-request`
category, which is insufficient to decide whether every later operation on a handle must stop.

## Decision

`@kumwe/studio-core` exposes `openStudioSession(hostAdapter, options)` as the bounded composition entry
point for the current headless profile. `OpenStudioSessionOptions` contains a host-supplied, already
resolved `StudioConfiguration` and caller-injected `StudioHostSessionIdentifierFactories`; the adapter
is a separate runtime dependency. The two factory methods are `requestId(operationId)` and
`idempotencyKey(operationId)`. The entry point does not discover configuration, authenticate an actor,
select a resource context, mint identifiers from ambient randomness, or perform network work directly.

Opening a handle first requires `mode: blueprint`, `composite: single`, either canonical
`sessionState`, and an explicit Blueprint locked reference. It negotiates the configured wire protocol
and required artifact port before performing I/O, loads that exact reference through `artifact.load`,
and refuses a non-Blueprint result. It passes the resolved Blueprint/read-only session mode, immutable
session generation, and `limits.maxHistoryEntries` into `StudioSession`. Additional model or theme
references may remain configuration dependencies, but this profile does not separately load them.
There is no model, entry, or empty Blueprint fabrication path. Model, Content, and hybrid host-session
composition require their own state, persistence, and history contracts before they can become
additive profiles.

`OpenStudioSessionOptions.optionalPorts` adds non-blocking capability requests. Their absence is
retained in the negotiation result and handle diagnostics but does not prevent the Blueprint session
from opening. It does not grant a port the adapter does not implement or widen actor authority.

The returned `StudioHostSessionHandle` owns only the coordination state needed around the headless
session: its `session`, capability `negotiation` and `diagnostics`, latest host-accepted `revision`,
persistence sequencing, `invalidated` state, and `disposed` state. Local composition or lifecycle
misuse fails as `StudioHostSessionError`; host rejection remains `HostPortFailure`. The handle does not
own host authentication, storage, transport, workflow, or publication policy.

### Failure value and stale generation

`@kumwe/studio-protocol` defines `HostPortFailure`, an `Error` whose `error` member is a canonical
`HostPortError`, and `isHostPortFailure` as its public guard. A conforming JavaScript `HostAdapter`
rejects port promises with that wrapper. The composition boundary converts any non-conforming thrown
value to a safe non-retryable `internal` host failure; it never exposes transport messages, stack
traces, or private exception members.

A stale session generation remains in the canonical `invalid-request` category and additionally
carries the stable diagnostic code `studio.host/stale-session-generation`, exported as
`STUDIO_STALE_SESSION_GENERATION_DIAGNOSTIC_CODE`. Only that explicit diagnostic identifies generation
invalidation; an unrelated `invalid-request` does not. Once an operation observes it, the entire
handle is invalid. Later save or recovery calls fail locally with the same safe stale-generation
meaning and do not invoke another host port. Opening a new resolved configuration and session
generation is the only way to resume host work.

### Request identity and persistence

Identifier factories are injected because request correlation and mutation replay are observable
protocol behavior. Every port attempt obtains a request ID from the request-ID factory. Mutations also
obtain an idempotency key, with the following persistence rules:

1. saves are serialized in invocation order so two local requests never race the same accepted
   revision;
2. concurrent calls for the same current save intent coalesce onto one in-flight operation;
3. a save snapshots the Blueprint and sends the handle's latest accepted revision as
   `expectedRevision`;
4. an exact retry of a failed intent reuses its idempotency key, while a changed document, accepted
   revision, locale, protocol version, resource context, generation, or operation receives a new key;
5. a successful response advances the handle's accepted revision exactly once and rebases the
   revision member of every current, past, and future local snapshot without changing history topology,
   selection, or local state version; and
6. the `StudioSession` records the state version captured with the saved snapshot. It becomes clean only
   when that version is still current. Edits made while a save is in flight remain dirty on the newly
   accepted base and are saved by a later intent against that revision.

The exact intent comparison uses Studio's canonical JSON profile and the host contract's idempotency
preimage. A conflict, validation failure, disconnect, or other refusal does not change the local
document, history, selection, dirty state, or saved baseline. A safe host revision carried by a
conflict is diagnostic input, not permission to rebase, overwrite, or mark the draft durable. The
caller decides whether and when to retry.

### Recovery and disposal

When the optional recovery port is present, the handle exposes `recovery` as a
`StudioHostSessionRecovery` with the port's existing `store`, `load`, and `discard` operations. When
the port is absent, `recovery` is `undefined` and the opening diagnostics retain that negotiated
absence. The methods pass bounded JSON recovery data through the typed port with the same request,
generation, error, and idempotency rules. They do not create a recovery-envelope format, apply a
loaded value to `StudioSession`, infer a command log, validate plugin compatibility, merge revisions,
or choose a reconciliation path. Those behaviors require separately ratified artifact and recovery
contracts. Absence of the optional recovery port is never an implicit browser-storage fallback.

`dispose()` is local and idempotent. It prevents later work through that handle and releases its local
coordination state. No host teardown, logout, lease release, preview disposal, or recovery deletion is
implied because the current `HostAdapter` declares no such session-lifecycle operation.

## Consequences

Kumwe App and generic hosts can now compose the same deterministic Blueprint load/edit/save lifecycle
without importing UI code or duplicating envelope, revision, stale-generation, and retry decisions.
The core remains DOM-free and transport-neutral, and a test host can make every identifier and
settlement reproducible.

An accepted revision is consequently coherent across the whole bounded local timeline. Undo, redo,
subsequent expected-revision checks, and exact preview staging do not expose the pre-save revision after
success, while a late acknowledgement cannot hide newer changes. This is a revision rebase, not a remote
merge: snapshot content and local state versions are unchanged.

This is deliberately narrower than a complete Studio application. The current handle does not stage
preview drafts, reconcile recovery data, fabricate missing artifacts, persist Model or Entry history,
publish, or tear down host sessions. UI shells remain responsible for accessible progress, conflict,
offline, and recovery affordances, while the host remains authoritative for every port operation.

The new runtime failure wrapper is additive for consumers but normative for adapter implementations.
Adapters that previously rejected raw `HostPortError` documents or private exceptions must wrap them
at their boundary. The serialized host-error schema is unchanged; the stale-generation meaning uses
the existing bounded diagnostics collection.

No serialized configuration, artifact, request, result, or host-error shape changes. Existing hosts
migrate by wrapping their JavaScript rejection value and adding the stable diagnostic when their
generation check fails; transports in other languages continue to send the same canonical error
document. The reference testbed exercises the wrapper and diagnostic, while core integration tests
cover capability refusal, save concurrency, conflict preservation, exact retry identity, recovery
pass-through, invalidation, and disposal. These tests are implementation evidence, not a new portable
conformance profile or a Gate A completion claim.

## Rejected alternatives

Letting core perform the handshake was rejected because no handshake transport is defined and actor
evidence is adapter-owned. Supporting all configured artifact modes by creating a Blueprint, model, or
entry was rejected because it would invent identity and persistence semantics. Treating every
`invalid-request` as stale was rejected because malformed input and changed idempotent intent use the
same category without invalidating the session.

Parallel saves and a new key for every retry were rejected because they defeat optimistic sequencing
and exact-intent replay. Marking the current session saved whenever any older snapshot completes was
rejected because it can hide edits made during I/O. Automatic conflict or recovery reconciliation was
rejected because the available port returns data, not a host-approved merge policy. Preview staging
and host teardown were rejected because neither operation belongs to this bounded composition
surface.
