# ADR 0009: First-class restoration and explicit inheritance reset

- Status: proposed
- Scope: command vocabulary and inverse semantics

## Context

Two Gate A vocabulary items remained open. Restoration existed only implicitly: undoing a
`remove-node` replayed an `insert-node` carrying the recorded subtree, so hosts had no named
command for "bring this removed fragment back", and the insert reducer validated only the root
identifier of the incoming subtree even though a restore reinserts descendants too. Separately,
authors could unset a single responsive override per command, but no command expressed "make this
property inherit its base value on every viewport again", forcing hosts to synthesize per-viewport
batches from private knowledge of the document.

## Decision

The verified inverse of `remove-node` is promoted to the first-class command
`studio.command/restore-node`. It shares the insert-node payload — a destination and the recorded
subtree — participates in batches, and inverts to `remove-node`; `remove-node` now computes
`restore-node` as its verified inverse. Both `restore-node` and `insert-node` validate the whole
incoming subtree: every identifier, root or descendant, must be absent from the document, and a
collision fails with `duplicate-node` naming the colliding identifier.

Explicit inheritance reset is the top-level-only command
`studio.command/reset-inherited-property`. It removes every responsive viewport override for one
property on one node, leaving the base value untouched, and keeps canonical minimal form by
dropping the emptied responsive record. A missing node fails with `node-not-found`; a property
with no responsive overrides fails with `property-not-found`. Following the apply-pattern
precedent, its inverse is an atomic batch of viewport-scoped `set-property` operations in
ascending sorted viewport-name order, collapsing to a single `set-property` command when exactly
one override existed — and because its inverse is itself a batch, the command is rejected inside
batches with `invalid-batch` and excluded from the batch-operation schema.

## Consequences

Undo, collaboration compensation, and host restoration flows dispatch one portable restore command
instead of overloading insertion, and the strengthened subtree validation closes the descendant
identifier collision hole for both commands. Inheritance reset becomes a deterministic,
invertible, schema-validated operation rather than a host-side macro. The cost is two more
commands to keep conformant across runtimes — both ship canonical vectors, including inner
duplicate failures and the batch-versus-single inverse collapse — and one more type excluded from
batches that every implementation must reject.
