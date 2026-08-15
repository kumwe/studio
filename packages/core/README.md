# `@kumwe/studio-core`

Status: pre-Gate-A foundation alpha. The implemented kernel does not claim production completeness.

The framework-neutral state engine for Studio. It registers versioned blocks, validates blueprint
documents, applies typed commands without mutating caller-owned data, and maintains bounded
undo/redo history.

The implemented surface covers:

- `applyCommand` / `invertCommand` — the deterministic reducers for the canonical command
  vocabulary (insert, remove, move, duplicate with ID remapping, reorder, property set/unset with
  responsive overrides, binding set/remove, and atomic batches), with computed inverse commands
  verified against the published command vectors;
- `applyEntryCommand` — the locale-guarded `set-field-value` reducer for entries;
- `StudioSession` — bounded history behind fail-closed session guards (read-only state, session
  generation, expected revision), dirty tracking, and a validated selection model;
- `ContributionRuntime` — owner-aware, transactional contribution activation into immutable
  registry generations with disable, reactivate, trust-revocation, stale-generation refusal, and
  inspectable unresolved nodes;
- `validateBlueprint` and `BlockRegistry` — schema, limit, lock, and registry validation with
  stable diagnostics;
- `canonicalStringify` / `canonicalUtf8Bytes` — the canonical cross-language serialization form
  used for checksums.

The package has no DOM dependency. Web Components, Flutter clients, command-line tools, and server
adapters can therefore share the same command and validation semantics through the protocol.
