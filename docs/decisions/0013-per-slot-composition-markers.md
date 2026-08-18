# ADR 0013: Per-slot composition markers

- Status: proposed
- Scope: Blueprint authoring policy and the hybrid composition boundary

## Context

ADR 0011 bounded hybrid composition to named slots of nodes whose authoring policy mode is
`structural`, and deliberately deferred "per-slot composition markers beyond the node-level
structural policy" to the schema wave. The node-level rule is coarse: a designer node with five
slots either exposes all of them to hybrid composition by becoming structural, or none. Real
compositions want one editable region inside an otherwise designed shell — a card rail inside a
hero, an accordion body inside a fixed frame — without surrendering the node's other slots.
Because the gate starts closed, granting composability slot by slot later is additive; inventing
a revoking flag would be breaking.

## Decision

A node's authoring policy gains an optional `slots` member: a map from slot local name to a
per-slot composition policy `{ composable: true, allowedBlocks? }`. The marker only ever grants:
a collection is hybrid-composable when its parent declares structural authoring **or** when the
parent's marker names the slot. `composable` is schema-fixed to `true` — a revoking marker does
not validate — so the marker can never tighten what the node-level policy already permits, and
pre-marker documents keep their exact behavior.

The marker's `allowedBlocks`, when declared, bounds its slot ahead of the node-level list; an
unmarked slot of a non-structural node stays out of bounds, locked subtrees stay untouchable,
and document roots stay out of bounds. The hybrid gate tracks the source slot of removals,
moves, duplications, and reorders, so the rule holds for every affected collection, not only
insertion destinations. Canonical mode vectors fix the grant, the slot-level bound, and the
unmarked-sibling rejection as portable conformance behavior.

## Consequences

Blueprint authors can open exactly one region of a designed shell to entry authors, with its
own allowed-block list, while the shell itself stays out of bounds. The schema change is
additive, so every existing document, vector, and fixture validates unchanged. Property and
variant editing inside composable regions and pattern application in hybrid mode remain
deferred exactly as ADR 0011 recorded.

## Rejected alternatives

A `composable: false` form was rejected because it would tighten the structural rule for
existing documents, which ADR 0011 classifies as a breaking change. Declaring markers in the
block definition instead of the Blueprint was rejected: composability is a policy of one
composition, not of a block type, and the Blueprint already owns the authoring policy the gate
reads. A separate top-level regions artifact was rejected as a second source of truth for what
the node policy already expresses.
