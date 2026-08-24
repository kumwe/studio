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
- `openStudioSession` — capability-negotiated Blueprint loading and a headless host-session handle for
  serialized optimistic saves, raw optional recovery-port access, stale-generation invalidation, and
  local idempotent disposal;
- `ContributionRuntime` — owner-aware, transactional, schema-validated activation of block,
  pattern, design-vocabulary, migration, inspector, and field-adapter payloads into kind-scoped
  immutable generations, with disable, reactivate, trust-revocation, stale-generation refusal, and
  inspectable unresolved contributions;
- `validateBlueprint` and `BlockRegistry` — schema, limit, lock, and registry validation with
  stable diagnostics;
- `canonicalStringify` / `canonicalUtf8Bytes` — the canonical cross-language serialization form
  used for checksums.
- `compileStudioPropertySchema` / `assertStudioPropertySchema` — eval-free admission and validation
  for the closed, local-only `studio.profile/schema-property` surface, with stable
  `StudioSchemaProfileError` codes and schema pointers.

The package has no DOM dependency. Web Components, Flutter clients, command-line tools, and server
adapters can therefore share the same command and validation semantics through the protocol.

## Blueprint host-session composition

`openStudioSession(hostAdapter, options)` consumes a complete, host-resolved `StudioConfiguration` from
`OpenStudioSessionOptions`. Its injected `StudioHostSessionIdentifierFactories` provide deterministic
`requestId(operationId)` and `idempotencyKey(operationId)` values. Opening requires
`mode: blueprint`, `composite: single`, either session state, and the configured Blueprint reference;
it passes the resolved Blueprint/read-only mode, session generation, resource context, locale,
protocol, and history limit through the headless lifecycle. It does not perform the host handshake,
load additional model/theme dependencies, fabricate an artifact for model/content/hybrid
configuration, or provide a transport.

The returned handle serializes saves against the latest accepted host revision and coalesces matching
concurrent intents. An exact retry after failure retains its idempotency key. If the document changes
while a snapshot is saving, the success advances the accepted revision but the newer state remains
dirty. Conflicts and other refusals preserve the document, history, selection, and saved baseline.

`StudioHostSessionHandle.recovery` is a `StudioHostSessionRecovery` with direct `store`, `load`, and
`discard` calls when the optional port is present, and is `undefined` otherwise. The core does not
synthesize or reconcile recovery envelopes. A
`studio.host/stale-session-generation` diagnostic invalidates the complete handle. `dispose()` is
local and idempotent and does not imply host teardown or preview cleanup. See
[ADR 0020](../../docs/decisions/0020-blueprint-host-session-composition.md) for the deliberate scope.
