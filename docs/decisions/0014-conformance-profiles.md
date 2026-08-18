# ADR 0014: Named conformance profiles with executable assertion sets

- Status: proposed
- Scope: conformance vocabulary, host-port assertion corpus, and the channel policy that consumes it

## Context

The compatibility contract has always carried a conformance-profile version as its own axis — "exact
assertions required to claim a host/client/renderer profile" — and the release policy defines the
`beta` channel as a "feature-complete candidate for a declared profile". Neither had a referent: no
profile was declared, no assertion set was executable, and no implementation could claim one. That left
two holes at once. A package could not honestly leave `alpha`, because "feature-complete for a declared
profile" was unmeasurable. And a host could not prove its adapter correct, because the only executable
corpora covered the command engine and media policy — both of which run inside Studio — while the host
boundary, where an integration actually fails, had none.

The consuming programme feels the second hole directly: its host adapter must return the right error
category, the right retry classification, and the safe current revision on a stale write, and its test
suite asserts exactly that. Without a published corpus it would have to infer those obligations from
prose and from reading TypeScript internals, which is how two implementations drift.

## Decision

Conformance profiles become first-class, named, and versioned. A profile is a qualified name in the
`studio.profile` namespace bound to an exact assertion set; declaring one states what claiming it
requires, and claiming one means replaying its corpus and publishing the result as evidence. Adding an
assertion to a published profile is a breaking change to that profile, so a widened set is a new
profile name.

`studio.profile/host-baseline` is declared and made executable first, because it is the boundary a host
integration is built against. Its corpus is a new canonical vector kind,
`host-vector.schema.json`, shipped as `vectors/host/` through `@kumwe/studio-testkit`. Each vector
fixes reproducible host state, the request envelope and argument, and the required outcome — an
accepted result with its revision behaviour, or one category of the closed error taxonomy with its
retry classification and non-disclosure obligations. Nothing in a vector is a test double: every
precondition is a condition a real host reproduces, so a PHP, Dart, or Go adapter replays the identical
JSON without executing Studio code.

Profiles bind to release channels. `beta` requires feature-completeness against at least one declared,
executable profile, claimed with evidence; `rc` requires every advertised profile claimed at the exact
candidate commit. This makes the alpha-to-beta promotion a decision about evidence rather than about
confidence.

## Consequences

The host boundary gains the same conformance discipline the command engine has had since ADR 0008, and
the reference host's claim is proven by replaying the corpus rather than asserted by its own unit
tests. A downstream host now has an executable definition of a correct adapter before it writes one,
and a contract change that would break an adapter is visible as a corpus change.

The declared limitations are recorded rather than implied: the baseline corpus does not yet fix
artifact-level `forbidden`/`unauthenticated`, idempotent replay, rate limiting, or cancellation,
because the reference host models authority through the permission port and has no reproducible
precondition for the rest. Those remain host obligations, and closing them widens the profile — which,
by this decision, means a new profile name rather than a silent tightening.

## Rejected alternatives

Asserting host conformance only through the TypeScript testbed was rejected: it proves the reference
implementation, not the contract, and a non-TypeScript host cannot run it. Expressing host vectors
through fault injection was rejected because an injected failure is not a precondition another
implementation can reproduce — the corpus would have described the testbed rather than the contract.
Deferring profile declaration until Gate A was rejected because the channel policy already depends on
it and the consuming host is building now; declaring the profile early is what lets its assertion set
be criticised while changing it is still cheap.
