# ADR 0010: Responsive size roles as first-class command vocabulary

- Status: proposed
- Scope: command vocabulary and layout sizing semantics

## Context

The last open Gate A vocabulary item asked for resize responsive-role overrides beyond
per-viewport property overrides. Authors could already store any JSON value per viewport
through `set-property`, but sizing intent expressed that way is indistinguishable from
arbitrary block configuration: hosts cannot tell which stored values are layout roles, and a
theme cannot remap its sizing vocabulary without rewriting property values inside every stored
document. The bounded design language (ADR 0005) forbids Blueprints from storing CSS, and the
theme contract already declares `size-role` design controls whose choices enumerate the
bounded role names — the missing piece was a first-class place and command pair for assigning
those roles per node, per axis, and per responsive context.

## Decision

Named size roles become first-class document data with two batchable commands.
`studio.command/set-size-role` assigns one role for one layout axis — `inline` or `block` —
either as the base assignment or as one responsive viewport override;
`studio.command/unset-size-role` removes exactly one such assignment. A node stores the base
assignment under the reserved `sizeRoles` member (axis to role) and overrides under
`responsiveSizeRoles` (axis to viewport to role), mirroring the properties/responsive split,
and canonical minimal form (ADR 0008) extends to both members: empty role records are never
stored, so the containers materialise on first assignment and drop with the last removal.

Inverses follow the set/unset-property precedent exactly: a set inverts to a set of the
previous role, or to an unset when none existed — including a duplicate set, which inverts to
a set of the same role and round-trips to byte equality — and an unset inverts to a set of the
removed role. Unsetting an absent assignment fails with the existing `property-not-found`
code: size roles address named per-node values exactly as properties do, so reusing the code
keeps the closed failure taxonomy closed instead of growing it for a structurally identical
condition.

The command layer validates a role only as a bounded lower-case identifier (the shared
local-name shape); the axis member set is closed by the schema. Whether a role names a choice
of the active theme's `size-role` design controls is deliberately a diagnostics-level concern:
reducers stay registry-independent and deterministic, and a theme can remap or alias role
meanings without a document migration.

## Consequences

Sizing intent is now addressable data: hosts and renderers resolve an axis, role, and viewport
triple through the theme, theme-switch reports can cover role vocabulary, and a role that no
longer matches the active theme surfaces as diagnostics rather than reducer failure, so stored
documents never break when themes evolve. This closes the Gate A command vocabulary — no
target item remains open. The cost is two more commands to keep conformant across runtimes —
both ship canonical vectors, including the duplicate-set byte-invertibility case and the
absent-assignment failure — and one more reserved member pair every implementation must keep
in canonical minimal form.
