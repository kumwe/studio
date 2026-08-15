# ADR 0008: Canonical command vectors and minimal document form

- Status: proposed
- Scope: protocol determinism and portability

## Context

The command contract requires deterministic reducers, verified inverse operations, stable failure
codes, and cross-language equivalence, but until now those requirements lived in prose and in the
TypeScript implementation only. Two representational ambiguities blocked byte-level equivalence:
a slot with no children could be stored either as an empty collection or as an absent member, and
responsive override maps could linger empty after their last value was removed. Either ambiguity
makes command inversion and canonical checksums unreliable.

## Decision

Documents are kept in canonical minimal form: an empty slot collection, an empty responsive
viewport map, and an empty responsive record are never stored. Reducers create these containers
lazily on insertion and drop them when the last member is removed.

Every implemented command ships canonical vectors under `schemas/vectors/command/`, published
verbatim through `@kumwe/studio-testkit`. A vector fixes one initial document, one command, and
either the exact expected document or a stable failure code, plus the inverse command for
successful transitions. The reference implementation replays the corpus, verifies inverse
round-trips to byte equality through canonical serialization, and computes inverse commands that
must match the published ones. Failure codes form a closed taxonomy in the command-vector schema;
adding a code is additive, renaming or removing one is breaking.

Canonical serialization for checksums sorts object members by Unicode code unit, keeps arrays in
semantic order, canonicalizes negative zero, forbids non-finite numbers and prototype-polluting
member names, and is bounded by an explicit depth limit.

## Consequences

Any runtime, in any language, can prove command equivalence by replaying the vector corpus; the
Dart SDK gains an executable conformance target before it exists. Undo can rely on verified
inverse commands rather than opaque snapshots. The cost is that reducers must maintain minimal
form invariants, and every new command must land with vectors before it may claim the canonical
subset.
