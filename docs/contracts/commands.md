# Commands and history contract

## Command model

All persistent authoring changes are expressed as commands conforming to [`command.schema.json`](../../schemas/command.schema.json). Pointer gestures, keyboard actions, inspector edits, automation, collaboration, and accessibility alternatives dispatch the same commands.

A command contains an ID, command type, artifact ID, base revision or local state version, actor/session generation, payload, and optional grouping metadata. Commands do not contain functions.

## Current canonical subset

The `0.1-draft` canonical schema supplies payload contracts and portable reducer expectations for
sixteen commands:

- `studio.command/insert-node` (rejects with `duplicate-node` when any identifier of the inserted
  subtree — root or descendant — is already present in the document);
- `studio.command/remove-node` (its verified inverse is `restore-node`);
- `studio.command/restore-node` (same payload as insert-node; validates every identifier of the
  restored subtree against the document; batchable; its verified inverse is `remove-node`);
- `studio.command/move-node`;
- `studio.command/duplicate-node` (deterministic ID remapping through a caller-allocated map);
- `studio.command/reorder-children` (roots or one named slot);
- `studio.command/set-property` (base value or one responsive viewport override);
- `studio.command/unset-property` (base value or one responsive viewport override);
- `studio.command/reset-inherited-property` (removes every responsive viewport override for one
  property on one node so each viewport inherits the base value again; the base value is
  untouched; never nested inside a batch because its inverse is itself a batch);
- `studio.command/set-size-role` (assigns the named size role for one layout axis — `inline` or
  `block` — as the base assignment or one responsive viewport override; batchable);
- `studio.command/unset-size-role` (removes the base size-role assignment or one viewport
  override for one axis; fails with `property-not-found` when the addressed assignment is
  absent; batchable);
- `studio.command/set-binding` and `studio.command/remove-binding`;
- `studio.command/apply-pattern` (deterministic multi-root fragment application with ID remapping
  and per-root pattern provenance stamping; never nested inside a batch because its inverse is
  itself a batch);
- `studio.command/batch` (an atomic ordered sequence of the commands above, excluding
  apply-pattern and reset-inherited-property);
- `studio.command/set-field-value` (locale-guarded entry reducer); and
- `studio.command/add-model-field` (adds a declared field to a draft content model; published and
  retired models reject with `artifact-not-draft`).

Restoration is first-class: the verified inverse of `remove-node` is the host-facing
`restore-node` command, so undo, collaboration compensation, and host-driven restoration flows all
dispatch the same portable command. Because a restore reinserts a whole recorded subtree, both
`restore-node` and `insert-node` validate the complete subtree for identifier collisions and fail
with `duplicate-node` naming the colliding identifier.

Explicit inheritance reset is top-level only. `reset-inherited-property` fails with
`node-not-found` when the node is missing and with `property-not-found` when the node has no
responsive overrides for the property. Its inverse restores the removed overrides as one atomic
batch of viewport-scoped `set-property` operations in ascending sorted viewport-name order,
collapsing to a single `set-property` command when exactly one override existed — the same
single-operation collapse `apply-pattern` uses.

Named size roles are first-class layout semantics, distinct from per-viewport property values.
A node stores at most one role per layout axis under the reserved `sizeRoles` member, plus
responsive overrides under `responsiveSizeRoles`, mirroring exactly how responsive property
overrides cascade from a base value; both records obey canonical minimal form and are never
stored empty. The command layer validates a role only as a bounded lower-case identifier —
whether it names a declared choice of the active theme's `size-role` design controls is a
diagnostics-level concern, so reducers stay registry-independent and themes can remap role
meanings without migrating documents. Inverses mirror the set/unset-property precedent: a set
inverts to a set of the previous role or to an unset when none existed, and an unset inverts to
a set of the removed role. Unsetting an absent assignment fails with the existing
`property-not-found` code because size roles address named per-node values exactly as
properties do, keeping the closed failure taxonomy unchanged.

Recipe and semantic design-value selection is deliberately resolved without a dedicated command:
a selection expands into one atomic batch of `set-property` operations — every design value of the
recipe in sorted member order, then the reserved `studio.recipe` marker property recording the
selection. The expansion is canonical in `recipeSelectionOperations`, inherits batch atomicity and
verified inverses, and a theme switch can locate recipe-derived state through the marker.

Other namespaced commands are accepted by the generic envelope only when the active immutable registry supplies their payload schema, reducer contract, permission operation, migration behavior and conformance fixtures. Envelope acceptance alone does not make a command portable or part of Studio core.

## Blueprint shell command coverage

The reference Blueprint shell exposes every canonical command applicable to Blueprint composition. A
surface is an intent projection only; every row still passes through the same headless session and reducer.

| Command                             | Reference shell path                                                                           |
| ----------------------------------- | ---------------------------------------------------------------------------------------------- |
| `insert-node`                       | Block palette and command palette                                                              |
| `remove-node`                       | Outline action, Delete key and command palette                                                 |
| `restore-node`                      | Restore-last-deleted command-palette action backed by a journal bounded to `maxHistoryEntries` |
| `move-node`                         | Measured canvas reparent, outline destination selector and command-palette destination         |
| `duplicate-node`                    | Outline action, Ctrl/Meta+D and command palette                                                |
| `reorder-children`                  | Measured canvas reorder, Alt+Arrow, outline actions/destination selector and command palette   |
| `set-property` / `unset-property`   | Inspector base and responsive controls                                                         |
| `reset-inherited-property`          | Inspector responsive-property reset action                                                     |
| `set-size-role` / `unset-size-role` | Inspector Layout controls                                                                      |
| `set-binding` / `remove-binding`    | Inspector binding controls                                                                     |
| `apply-pattern`                     | Host-supplied validated pattern palette and command palette                                    |
| `batch`                             | Theme recipe selector                                                                          |

The host supplies only active, schema-validated `PatternDocument` contributions. Before dispatch, the shell
requires exact active block definitions for the complete fragment, allocates a deterministic collision-free
ID map, and resolves a slot/root destination through current mode and hybrid policy. The restore surface
records only successful shell deletions, revalidates the recorded subtree and destination against current
state, and drops entries outside the configured bound. The journal is not persisted or treated as host
recovery authority.

`set-field-value` and `add-model-field` belong to entry and content-model authoring surfaces respectively;
they are intentionally not represented as Blueprint controls.

## Canonical vectors

Every implemented command carries canonical vectors in [`schemas/vectors/command/`](../../schemas/vectors/command/), published verbatim through `@kumwe/studio-testkit` under `vectors/command/`. A vector fixes one initial document, one command, and either the exact expected document or a stable failure code, plus the inverse command for successful transitions. The TypeScript reference replays the whole corpus (`packages/core/test/command-vectors.test.ts`); every conforming implementation, in any language, MUST reproduce the same results and MUST compute the same inverse commands.

A vector may additionally declare a session `mode` (`blueprint`, `content`, `hybrid`, `model`, or `read-only`). A mode-carrying vector is replayed through a session fixed to that mode rather than through the bare reducer, so the editing-mode permission table, the hybrid composition bounds, and the read-only guard of [ADR 0011](../decisions/0011-editing-modes.md) are themselves portable conformance behavior: a rejected command leaves the document and state version untouched. Vectors without a `mode` remain pure reducer fixtures.

Failure codes are closed and stable: `artifact-not-draft`, `binding-not-found`, `duplicate-field`, `duplicate-node`, `illegal-move`, `invalid-batch`, `invalid-id-map`, `invalid-index`, `invalid-order`, `locale-mismatch`, `mode-forbidden`, `node-not-found`, `parent-not-found`, `property-not-found`, `read-only-session`, `stale-generation`, `stale-state`, `unsupported-command`. Adding a code is an additive protocol change; renaming or removing one is breaking. `mode-forbidden` was added under exactly that additive rule: it is the session-level rejection for a command outside the active editing mode's permitted set, including a hybrid structure command that leaves its bounded composition region ([ADR 0011](../decisions/0011-editing-modes.md)). A read-only session keeps rejecting every persistent command with the pre-existing `read-only-session` code.

## Canonical minimal form

Reducers keep documents in canonical minimal form: an empty slot collection, an empty responsive
viewport map, and an empty responsive record are never stored. Inserting into an unmaterialised
slot creates its collection; removing or moving the last child drops it again. This keeps every
successful command byte-invertible and keeps serialization canonical across runtimes.

## Gate A target vocabulary

The Gate A contract is required to add or deliberately resolve the following vocabulary before claiming integration stability:

- restore node — deliberately resolved: the verified inverse of `remove-node` is promoted to the
  first-class host-facing command `studio.command/restore-node` with full-subtree identifier
  validation, batch participation, and `remove-node` as its own verified inverse
  ([ADR 0009](../decisions/0009-restore-and-inheritance-reset.md));
- set and reset inherited property — deliberately resolved: base and per-viewport set/unset were
  already delivered, and explicit inheritance reset is delivered as the top-level-only command
  `studio.command/reset-inherited-property` whose inverse is a sorted batch of viewport-scoped
  `set-property` operations ([ADR 0009](../decisions/0009-restore-and-inheritance-reset.md));
- resize responsive-role overrides beyond per-viewport property overrides — deliberately
  resolved: named size roles are first-class data through the batchable commands
  `studio.command/set-size-role` and `studio.command/unset-size-role`, stored per layout axis
  under the reserved `sizeRoles` member with responsive overrides under `responsiveSizeRoles`
  ([ADR 0010](../decisions/0010-responsive-role-resize.md)).

No target item remains open — the list above is fully resolved and the Gate A command
vocabulary is complete. Every command of the canonical subset carries a payload schema, reducer
semantics, permission mapping, inverse/compensation behavior, fixtures and migration rules;
future vocabulary additions follow the additive protocol-change rules rather than this list.

Plugins may add namespaced commands with schema, authorization operation, deterministic reducer, inverse/compensation behavior, and migration rules.

## Determinism

Given the same valid state, registry generation and command, core implementations MUST produce equivalent state and diagnostics. Reducers do not read clocks, random generators, DOM, network, locale formatting, global state, or host services.

IDs and timestamps needed by a command are allocated before reduction through explicit injected services and become command data. Floating-point arithmetic is prohibited for exact domain values.

## Validation and atomicity

Command processing performs:

1. envelope and payload schema validation;
2. session generation and permission validation;
3. reference and type resolution;
4. invariant and limit validation against proposed state;
5. deterministic reduction;
6. diagnostic calculation;
7. history recording.

A rejected command produces no partial state. A batch is atomic unless explicitly declared a non-persistent UI macro; persistent batch commands succeed or fail together.

## History

Undo and redo operate on semantic commands or verified inverse patches, not DOM snapshots. History preserves enough information to restore removed nodes and bindings within configured limits. It MUST NOT retain field values the actor no longer has permission to access after a session-generation refresh.

An editable session configures a positive `maxHistoryEntries`; the core retains at most that many accepted state transitions. A read-only session may instantiate the same bounded history for inspection but never adds a persistent command. Disabling undo requires a future explicit capability and interaction contract rather than setting the limit to zero.

Remote accepted revisions form synchronization boundaries. Undoing across a published revision, model migration, permission change, plugin-generation change, or collaborative merge requires explicit host-supported semantics and cannot be assumed.

A successful save acknowledgement rebases the revision member of the current, undo, and redo
Blueprint snapshots onto the host-accepted revision without changing their semantic content, history
topology, selection, or local `stateVersion`. The acknowledgement records the `stateVersion` of the
snapshot that was saved. When that version is still current the session becomes clean; when newer
edits exist, the accepted base advances but the current session remains dirty. Undo and redo after
either case continue to carry the new accepted base revision. A conflict or other refusal never
performs this rebase.

## Conflicts

Saving sends an expected host revision. On conflict, the host returns a safe current revision reference and conflict diagnostics. Studio may offer rebase only when every intervening and local command is available and compatible. Otherwise it preserves the local recovery envelope and asks the actor to choose a host-approved reconciliation path.

Last-write-wins is not a compliant default for persisted artifacts.

## Clipboard and duplication

Copied nodes use a typed Studio clipboard envelope with contract/version metadata and no secrets. Paste validates block availability, fields, permissions, limits, namespaces and media/resource references, and allocates new node IDs. Plain HTML or script on the system clipboard is never interpreted as a Blueprint without an explicit sanitized importer capability.
