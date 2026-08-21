# ADR 0016: Portable property-schema profile with stable admission diagnostics

- Status: proposed
- Scope: contributed block property schemas, cross-runtime admission, and profile conformance

## Context

A contributed block declaration carries a JSON Schema for its property bag. Studio already constrained
that document through a meta-schema and a TypeScript admission walk, but another runtime could not
prove agreement without reimplementing prose. Worse, the two executable layers disagreed at their
edges: empty composition arrays and duplicate required names were admitted by the meta-schema but
refused by the interpreter, annotations had limits in only one layer, and malformed JSON Pointer
escapes were not rejected consistently. An empty `enum` could reach a validator even though Draft
2020-12 requires at least one member.

The consuming host freezes contribution declarations before it integrates the complete Studio
runtime. A validator disagreement at that boundary either admits unbounded data into an immutable
generation or rejects an extension another conforming client accepts. TypeScript-only parity tests do
not give PHP, Dart, Go, or another implementation an executable contract.

## Decision

Declare `studio.profile/schema-property` as a separately named executable profile. Its assertion set is
the language-neutral `schema-profile-vector` corpus published under `vectors/schema-profile/`. Each
vector carries a candidate schema and either stable admission failure (`code` plus schema JSON Pointer)
or accepted instance verdicts with the first keyword and instance JSON Pointer. Human-readable error
messages are intentionally outside conformance.

The alpha profile is deliberately smaller than general Draft 2020-12. A property schema has an exact
closed object root, accepts only the published keyword grammar, resolves valid JSON Pointer fragments
within the same document, rejects every recursive reference graph, and publishes no `format` registry.
Schema size is measured over canonical UTF-8 bytes. Empty `enum` and composition arrays, duplicate
`required`/`dependentRequired` names, unsafe members, invalid or unresolved references, and exceeded
budgets fail during admission. The meta-schema and runtime enforce the same portable operand rules;
vectors cover semantic rules a recursive meta-schema cannot express safely.

Local references additionally resolve only to positions identified as schemas by the profile grammar,
not merely to any object found by a JSON Pointer. Object and boolean schemas both consume the node
budget. JSON-valued operands share the meta-schema's per-container limits. Decimal `multipleOf` uses
exact arithmetic over the canonical base-10 coefficient and exponent, avoiding both binary division
rounding and implementation-chosen epsilon tolerances. Portable vectors pin these rules and every
published ceiling with an exact-boundary and exact-plus-one pair. Schema depth and JSON-value depth
compose without a smaller serializer ceiling. Boundary metadata makes omissions and
off-by-more-than-one fixtures fail the contract checker.

The local-reference grammar intentionally chooses a raw ASCII JSON Pointer subset rather than asking
each URI library to percent-decode fragments. Schema and schema-map members are traversed in ascending
UTF-16 code-unit order so equivalent JSON objects produce the same first admission diagnostic
regardless of parser insertion order. Root invariants and reference-graph traversal retain that order
rather than introducing semantic-pass precedence. Instance object checks follow the same ordering
rule.

Forward references must resolve before every target has been structurally visited. The reference
implementation therefore classifies a target position directly from the schema grammar while walking
its pointer, then arbitrates the first structural, reference/recursion, and root-invariant candidates
with one token-wise document-order comparator. Missing root invariants are virtual members. Object
tokens compare by UTF-16 code unit, array tokens numerically, and ancestors precede descendants;
internal pass timing is never observable precedence.

Reference analysis retains actual document pointers rather than projecting target members beneath a
referring `$ref`. The implementation resolves every site, classifies cyclic edges from the bounded
schema dependency graph, and then selects the earliest unresolved or cyclic reference site by the same
document comparator. This prevents forward or shared graph traversal order from becoming a second,
implementation-specific precedence.

Canonical byte length and map cardinality are preflight budgets: an implementation checks them before
sorting or compiling untrusted members. The reference interpreter memoizes each verdict and its full
deterministic diagnostic slice by schema, instance location, and instance identity/value. It collapses
exact duplicate diagnostics while retaining every distinct failure. Cached speculative failures
therefore remain fully diagnostic when reused by a non-speculative branch. The compound key preserves
distinct `propertyNames` checks while
making repeated acyclic `$ref` fan-out linear in the actually visited schema/location pairs instead of
exponential in the number of paths through the reference DAG.

The public core exposes a compiled eval-free validator and `StudioSchemaProfileError` with the closed
admission taxonomy. The testkit exposes `runSchemaProfileVector`, while non-TypeScript runtimes replay
the JSON without executing Studio code. The corpus joins the digest-verified testkit manifest.

## Consequences

A host can validate a contribution before freezing its generation and demonstrate byte-for-byte
agreement with the reference contract. Stable codes make incompatibility actionable without making
English messages or a particular validator library public API. Closing the root also prevents a block
definition from silently accepting misspelled or undeclared properties.

Cross-document references, recursive schemas, contributed regular expressions, and formats remain
unavailable in this profile. Adding any of them widens the assertion set and therefore requires a new
profile name under ADR 0014, compatibility guidance, and portable positive and negative vectors.
Existing alpha contributions that omitted `additionalProperties: false` must close their root before
admission; this is a prerelease correction recorded in the package changesets.

The reference test run is reproducible implementation evidence, not an independent profile claim.
Promotion or a gate decision still requires a clean-commit evidence bundle and reviewer reproduction
under the evidence model.

## Rejected alternatives

Publishing the TypeScript validator as the conformance mechanism was rejected because it makes a
language-neutral protocol depend on executing one implementation. Treating unknown `format` values as
annotations was rejected because validators disagree by configuration and installed plugins. Allowing
bounded recursion was rejected for this alpha because the bound and progress rules were not yet
portable. Silently tightening `studio.profile/engine-core` was rejected because ADR 0014 requires a
new profile when its assertion set widens.
