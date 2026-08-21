# ADR 0017: Stateful host obligations use deterministic sequence vectors

- Status: proposed
- Scope: host conformance profiles, idempotent mutations, fixed-window rate limits, and preview cancellation

## Context

`studio.profile/host-baseline` proves one host exchange at a time. That is enough for authorization,
optimistic concurrency, envelope validation, and bounded queries, but it cannot express a retry of an
accepted mutation, a second request inside one rate-limit window, or cancellation while a render is
still in flight. The host contract already requires those behaviours. Leaving them in prose makes a
green profile replay weaker than the boundary an integrating host must actually implement.

Adding the assertions to `host-baseline` would silently tighten a published profile. ADR 0014 forbids
that: an assertion set is part of profile identity, and widening it requires another profile name.
Fault injection or elapsed wall time would also make the corpus testbed-specific and non-portable.

The alpha single-exchange corpus also carried the placeholder `studio.host/operation` in twenty
otherwise valid vectors even though the already-published operation registry requires the exact
`studio.operation/{port}.{operation}` capability. No accepted evidence claim exists for those alpha
bytes. This is a contract erratum rather than a new assertion: the requests are corrected before Gate A
and guarded against the same closed registry every host already consumes.

## Decision

Declare `studio.profile/host-baseline-v2`. It includes the complete `host-baseline` single-exchange
corpus plus a distinct `host-sequence-vector` corpus. A sequence fixes exact seeded artifact
kind/revision/status, live session generation, optional fixed-window policies, ordered invocation and
settlement steps, explicit logical-clock advances, explicit renderer completions, and observable final
state. Everything is bounded JSON: another runtime supplies the named harness controls without a
hidden callback, wall-clock sleep, random input, or invented transport endpoint.

The first assertion set proves these bounded behaviours:

1. matching in-flight and completed publication retries observe one accepted result without another
   revision or rate-limit unit;
2. changed arguments and changed semantic context are `invalid-request` before concurrency checks;
3. resource contexts separate records that use the same key, while negative zero and zero have the
   same canonical numeric intent;
4. a registered capability for another operation is `invalid-request`, while exact capabilities pass;
5. a fixed-window recovery bound reports the exact delay with no side effect, an explicit clock
   advance resets it, and the exact failed attempt can then succeed; and
6. matching preview cancellation rejects render as `cancelled`, an explicitly released late result is
   discarded, and cancellation from another resource context leaves the render deliverable. Every
   explicit renderer completion carries the exact request identity and draft digest of its originating
   draft.2 render attempt.

The schema carries the idempotency policy rather than leaving a harness to guess it. Record scope is
`idempotencyKey`, `operationId`, `resourceContextKey`, and `sessionGeneration`. Intent is canonical JSON
of the operation argument plus `expectedRevision`, `locale`, and `protocolVersion`; absent optional
fields are omitted, canonical number normalization includes negative zero to zero, and `requestId`
plus `traceContext` are excluded. Only an accepted outcome is retained. A matching in-flight or
completed retry observes that same outcome; a failed attempt does not poison a future retry.

The TypeScript testbed implements those rules with a logical clock and fixed-window counters. Strict
operation-capability matching is the default; a separately named test-only wildcard option exists for
broad unit drills and is never enabled by a conformance replay.

Sequence validity includes semantic closure that JSON Schema cannot express alone. The contract lane
rejects duplicate artifact seeds or rate policies, unknown or repeated settlements, pending
invocations left unsettled, renderer releases for the wrong invocation/digest, and final revision
references that do not name a settled result. A preview render argument must satisfy the draft.2
payload contract, and its explicit completion must repeat the originating request identity as well as
the digest. Embedded negative drills keep those guards executable.

## Consequences

Hosts can prove the stateful boundary in any language from the published JSON. Existing
`host-baseline` claims remain valid and unchanged, while consumers that need retry, rate, and
cancellation guarantees require `host-baseline-v2`. Corpus integrity now includes a separate
`host-sequence-vectors` group, so vendored copies detect any byte drift.

The alpha operation-ID erratum changes corpus digests and therefore expires any unreproduced local
result against the placeholder bytes. It does not alter the baseline's behavioural assertion set, and
there are no accepted or supported profile claims to migrate. Consumers pin the resulting exact alpha
package and verify its corpus manifest before replay.

The profile specifies a fixed-window policy only where the vector declares one; it does not require a
production host to use that algorithm globally. A host maps its production policy onto the declared
reproducible precondition when replaying the corpus. Cancellation is scoped by session generation,
resource context, and draft digest, preventing one context from cancelling another. The first corpus
directly proves resource-context separation. Operation and session-generation idempotency separation
remain normative policy fields and reference-runtime unit assertions, but have no portable sequence
control in this version; profile documentation records that limit instead of treating it as executed
cross-runtime evidence.

## Rejected alternatives

Appending the steps to `host-vector` was rejected because its one-exchange shape is intentionally
simple and already published. Tightening `host-baseline` in place was rejected because it would make a
prior claim false retroactively. Fault injection was rejected because it proves a test hook rather than
host behaviour. Timers and sleeps were rejected because scheduler variance makes evidence flaky.
