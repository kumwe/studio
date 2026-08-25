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
  serialized optimistic saves, raw optional recovery-port access, read-only model `list`/`get`,
  stale-generation invalidation, and local idempotent disposal;
- `projectBlueprintFieldBindings` — an immutable exact-model projection of compatible block-port field
  candidates, declared authoring controls and stable invalid-binding diagnostics;
- `ContributionRuntime` — owner-aware, transactional, schema-validated activation of block,
  pattern, design-vocabulary, migration, inspector, and field-adapter payloads into kind-scoped
  immutable generations, with disable, reactivate, trust-revocation, stale-generation refusal, and
  inspectable unresolved contributions;
- `validateBlueprint` and `BlockRegistry` — schema, limit, lock, and registry validation with
  stable diagnostics;
- `canonicalStringify` / `canonicalUtf8Bytes` — the canonical cross-language serialization form
  used for checksums.
- `createCoreLayoutBlockDefinitions` / `resolveCoreLayoutIntent` — first-party section, stack, grid,
  and columns definitions plus theme-validated responsive intent resolution, with no DOM or stored
  CSS;
- `createCoreProductionBlockDefinitions` / `createCoreProductionPatterns` — the standalone 30-block
  production catalog and ten portable starter compositions, including media, rich content,
  progressive composites including dialogs, popovers, and notices, data display, and
  host-authoritative resource/query projections;
- `coreProductionInitialProperties` — schema-valid defaults used by the Studio insertion path for
  every first-party type;
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
automatically load model/theme dependencies, fabricate an artifact for model/content/hybrid
configuration, or provide a transport.

The returned handle serializes saves against the latest accepted host revision and coalesces matching
concurrent intents. An exact retry after failure retains its idempotency key. If the document changes
while a snapshot is saving, the success advances the accepted revision but the newer state remains
dirty. Every current, undo, and redo snapshot carries that accepted revision without a local state-version
change, so later history and exact preview staging use one coherent base. Conflicts and other refusals
preserve the document, history, selection, and saved baseline.

`StudioHostSessionHandle.recovery` is a `StudioHostSessionRecovery` with direct `store`, `load`, and
`discard` calls when the optional port is present, and is `undefined` otherwise. The core does not
synthesize or reconcile recovery envelopes. A
`studio.host/stale-session-generation` diagnostic invalidates the complete handle. `dispose()` is
local and idempotent and does not imply host teardown or preview cleanup. See
[ADR 0020](../../docs/decisions/0020-blueprint-host-session-composition.md) for the deliberate scope.

`StudioHostSessionHandle.models` is present only when the negotiated model port and adapter both implement
`list` and `get`. Results are canonical-schema validated, exact-coordinate checked and detached before they
leave the boundary; stale generation invalidates the whole handle. The surface is deliberately read-only.
Pass an authorized active model to `projectBlueprintFieldBindings(blueprint, model, definitions)` to derive
portable candidates and diagnostics without changing any input. See
[ADR 0024](../../docs/decisions/0024-read-only-model-binding-projection.md).
