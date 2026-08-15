# Commands and history contract

## Command model

All persistent authoring changes are expressed as commands conforming to [`command.schema.json`](../../schemas/command.schema.json). Pointer gestures, keyboard actions, inspector edits, automation, collaboration, and accessibility alternatives dispatch the same commands.

A command contains an ID, command type, artifact ID, base revision or local state version, actor/session generation, payload, and optional grouping metadata. Commands do not contain functions.

## Current canonical subset

The `0.1-draft` canonical schema supplies payload contracts and portable reducer expectations for:

- `studio.command/insert-node`;
- `studio.command/remove-node`;
- `studio.command/move-node`;
- `studio.command/set-property`; and
- `studio.command/set-field-value`.

Other namespaced commands are accepted by the generic envelope only when the active immutable registry supplies their payload schema, reducer contract, permission operation, migration behavior and conformance fixtures. Envelope acceptance alone does not make a command portable or part of Studio core.

## Gate A target vocabulary

The Gate A contract is required to add or deliberately resolve the following vocabulary before claiming integration stability:

- restore and duplicate node;
- reorder roots or slot children;
- set, unset and reset inherited property;
- bind, unbind and change binding;
- set localized field value;
- select recipe or semantic design value;
- add, remove and resize responsive-role overrides;
- apply a pattern with deterministic ID remapping;
- create a model-draft field through a host use case;
- batch compatible commands atomically.

Each target command must receive a canonical payload schema, reducer semantics, permission mapping, inverse/compensation behavior, fixtures and migration rules. Listing it here is a Gate A requirement, not a claim that the `0.1-draft` subset implements it.

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

## Conflicts

Saving sends an expected host revision. On conflict, the host returns a safe current revision reference and conflict diagnostics. Studio may offer rebase only when every intervening and local command is available and compatible. Otherwise it preserves the local recovery envelope and asks the actor to choose a host-approved reconciliation path.

Last-write-wins is not a compliant default for persisted artifacts.

## Clipboard and duplication

Copied nodes use a typed Studio clipboard envelope with contract/version metadata and no secrets. Paste validates block availability, fields, permissions, limits, namespaces and media/resource references, and allocates new node IDs. Plain HTML or script on the system clipboard is never interpreted as a Blueprint without an explicit sanitized importer capability.
