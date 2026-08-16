# ADR 0011: Deterministic editing-mode permission boundaries

- Status: proposed
- Scope: session-level command permission model for the editing modes

## Context

The configuration contract already fixes three orthogonal members per session — the editing
mode (`model`, `blueprint`, or `content`), the composition (`single` or the bounded `hybrid`
composite), and the session state (`editable` or `read-only`) — and requires that hidden UI
controls never substitute for a real permission check. The headless core, however, enforced
only the read-only axis: any UI holding an editable session could dispatch any canonical
command, so mode boundaries lived in whichever affordances a shell chose to render. M4-03
requires the opposite: content authors cannot change locked structure and designers cannot
bypass business-field policy even when a command is issued programmatically, which means the
boundary must be deterministic session substrate, not UI convention.

## Decision

The protocol gains one additive type, `StudioSessionMode` — `model`, `blueprint`, `content`,
`hybrid`, or `read-only` — as the single permission determinant of a headless session, fixed
at creation. It is a deterministic flattening of the existing configuration triple, exposed
by the core as `resolveSessionMode`: a read-only session state always flattens to
`read-only`, the hybrid composite flattens to `hybrid` (and stays invalid with Model mode,
mirroring the configuration schema), and every other session keeps its editing mode. The
configuration document is unchanged: `hybrid` remains a composite rather than a fourth
editing mode, and `read-only` remains a session state whose canonical session-mode spelling
is `read-only`. `StudioSession` accepts the new optional `mode` member alongside the legacy
`sessionState` member; a legacy `read-only` state opens the `read-only` mode, a legacy
`editable` state opens the full-structure `blueprint` mode the session historically
provided, contradictory members fail construction, and the existing read-only guard is not
duplicated — mode `read-only` is that guard, still rejecting with `read-only-session`.

Permissions live in one deterministic table, not scattered conditionals. The pure exported
`permittedCommandTypes(mode)` returns a shared immutable set per mode, total over the five
modes and the canonical command vocabulary, so UIs render disabled affordances from the same
source the session enforces: `blueprint` permits the fifteen Blueprint structure command
types; `content` permits `set-field-value` and nothing that mutates structure; `model`
permits `add-model-field` (and future model commands); `hybrid` permits `set-field-value`
plus the composition subset — insert, remove, restore, move, duplicate, reorder, and batch;
`read-only` permits nothing. A command outside the active mode's set fails closed with the
new stable `mode-forbidden` code — an additive change to the closed failure taxonomy — with
no partial state, an untouched history, and a preserved selection. Entry and model commands
dispatch through session wrappers (`executeEntryCommand`, `executeModelCommand`) that run
the same generation, revision, read-only, and mode guards before the pure reducers, so no
dispatch path bypasses the boundary; their results stay host-owned and are not recorded in
the Blueprint history, whose undo integration for non-Blueprint artifacts is deferred.

Hybrid is bounded by markers the Blueprint schema already declares — no new flag is
invented. The blueprint schema's node authoring policy enumerates `locked`, `content`,
`variant`, `structural`, and `designer`, and the Blueprint contract assigns `structural` the
entry-author grant to reorder children and insert allowed blocks. Hybrid structure commands
are therefore in bounds only when every affected collection is a named slot of a node whose
authoring mode is `structural`; inserted block types must satisfy the governing node's
`allowedBlocks` when declared; subtrees containing a `locked` node are never inserted,
removed, moved, or duplicated (reordering around a locked sibling stays legal because
ordering belongs to the structural parent); and document roots are never in bounds. Batches
are validated operation by operation against a sequential trial state, so a later operation
may compose nodes an earlier one introduced, and one violation rejects the whole batch
before anything applies. The gate rejects only provable violations: a reference it cannot
resolve falls through to the reducer's canonical failure code, keeping `node-not-found`,
`parent-not-found`, and `invalid-batch` semantics identical across modes. Guard order is
deterministic: read-only, stale generation, mode permission, hybrid bounds, expected
revision, then state-version and reduction.

Undo and redo cannot cross a mode boundary by construction: session history replays only
states that permitted commands produced, and the table is closed under command inversion —
every verified inverse of a permitted command type is itself a permitted type, and a hybrid
inverse targets exactly the collections and subtrees its forward command proved in bounds.

## Consequences

Mode boundaries are now headless invariants with one table to read and one code to handle,
so shells in any framework render affordances and rejections consistently without policy
forks, and programmatic dispatch is exactly as bounded as pointer gestures. The costs are an
additive taxonomy entry every conforming implementation must recognize, and a deliberately
conservative hybrid core: per-slot composition markers beyond the node-level `structural`
policy, property or variant editing inside structural regions, pattern application in
hybrid, and hybrid canonical vectors (including the `mode-forbidden` entry in the
command-vector schema's expected-code enumeration) are deferred to the schema wave rather
than invented here. Relaxing any of these bounds later is additive; tightening them again
would be breaking, which is why the core starts closed.
