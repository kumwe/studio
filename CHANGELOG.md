# Changelog

All notable delivered changes to the Studio workspace are recorded here, grouped by the roadmap
work packages they advance. An entry records implemented, repository-verified behaviour; formal
work-package acceptance and gate outcomes remain governed by
[`docs/roadmap/STATUS.md`](docs/roadmap/STATUS.md) and the
[evidence model](docs/roadmap/evidence.md), and are never implied by an entry here.

## Unreleased

### Visual composition depth (M4-02, M4-03, M3-04, M3-03)

- Layout size roles are editable: per axis, the base role and the active viewport's assignment come
  from the theme-declared vocabulary, and every value states its provenance textually — base,
  overridden for the named viewport, or inherited from base — across the layout section and the
  responsive property editor (SR-027).
- Sessions carry one of five editing modes. Blueprint permits the structure commands, content permits
  field values, model permits draft model fields, hybrid bounds structure edits to slots governed by
  structural nodes and never moves locked subtrees, and read-only keeps its refusal. One frozen total
  table maps every command type per mode, exposed so interfaces render what the engine enforces;
  violations fail closed with the new `mode-forbidden` code leaving document, history and selection
  untouched (ADR 0011).
- The reference host renders compositions through the real preview channel: semantic DOM built without
  markup strings, theme tokens as custom properties, size-role-driven layout at the active viewport, a
  returned marker map and real measured geometry. The testkit gained an HTTP host adapter with an
  injected fetch, mapping transport refusals, error statuses and malformed bodies onto canonical
  non-disclosing host errors and exercised against a real server through the session lifecycle.

### Complete command vocabulary, eval-free validation, extension SDK (M2-02, M2-03, M6-02)

- The Gate A command vocabulary is complete. Size roles are first-class data: `set-size-role`
  and `unset-size-role` assign a named role per layout axis as the base assignment or a
  responsive viewport override, stored in reserved node members keeping canonical minimal form,
  so themes remap sizing vocabulary without migrating documents (ADR 0010). Sixteen commands,
  44 vectors, 26 negative fixtures; no target vocabulary item remains open.
- Core validation is eval-free: an interpreting validator covers exactly the schema profile's
  closed keyword set (in-registry references, code-point string bounds, mirrored numeric
  division, fail-closed cycle guard), proven by thousands of seeded agreement verdicts against
  the reference compiler, which left the runtime entirely; the boundary lane now forbids string
  compilation in core sources.
- That unlocked the full browser qualification claim: the pinned policy is `default-src 'none'`
  with a bare self `script-src`, and Trusted Types are enforced and claimed with the renderer's
  single policy name, proven by three negative controls (governed sink, rogue policy creation,
  staged inline script).
- The typed extension authoring surface landed: `defineStudioPlugin` front-loads activation —
  canonical manifest validation, namespace ownership, duplicate and coverage checks, and the
  contribution runtime's own rules through dry-run activation, byte-identical to registry
  rejections — and lifecycle conformance fixtures now cover field-adapter, pattern, transform,
  renderer-capability, and inspector contributions.

### Closed threat registry and media vectors (M2-07, M2-05, M4-05, M1-05)

- The threat enforcement registry closed at fourteen of fourteen. TH-008: a pure, deterministic
  external-URL policy in the core (https-only default, credentials rejected, private, loopback,
  link-local, unique-local, carrier-grade, and mapped hosts refused across decimal, octal,
  hexadecimal, dotted-partial, and IPv6 encodings) with a closed rejection vocabulary, exercised
  by a non-disclosing external-import drill in the host testbed; DNS rebinding, redirect
  re-validation, and response verification are recorded as host runtime obligations, not claimed.
  TH-013: the reference host is served and verified under a pinned content security policy with
  no unsafe-inline and no unsafe-eval — inline scripts and handlers blocked, every other fetch
  directive enumerated closed, zero violations across a real authoring pass, and an injected
  inline script proven both blocked and detected; the schema compiler's string-compilation
  dependency is the recorded gap before a bare script-src, and Trusted Types stay unclaimed.
- Eleven canonical media policy vectors fix host policy, request, and the exact accepted plan or
  stable rejection — byte boundaries, disallowed kinds, malformed filenames, cancellation
  legality per state, and fresh-session retry — mirrored through the testkit and replayed
  against the real upload controller; rejection vectors pin raw values the user-facing message
  must never echo.
- The shell announces preview renderer reload and channel teardown with qualified reasons
  through a deterministic single-slot live-region queue that never loses or reorders an
  in-flight outcome and never touches focus (SR-026).
- The changeset gate learned that the release train's version pull request consumes changesets —
  deleting them, or moving them into the pre directory in pre mode — and skips it, after the
  gate falsely failed the first version pull request's checks.

### Preview geometry, accessibility lane, and fuzzing (M3-04, M1-06, M2-07)

- The preview channel gained the marker geometry and measurement channel: bounded marker lists
  in, per-marker rectangle lists in CSS pixels relative to the preview viewport out, with a
  viewport record, an unknown-marker list, and digest binding so geometry from a superseded
  render surfaces as a typed stale outcome. The renderer supplies the measurer, keeping the
  responder DOM-free; reload, supersession, and disposal void in-flight measurements.
- An automated accessibility lane runs a WCAG 2.1 AA axe scan over the populated authoring
  chrome including shadow roots (zero violations, no rules disabled — the scan surfaced and
  fixed a prohibited aria-label on a role-generic toolbar), proves 320-pixel reflow keeps the
  outline, inspector, and palette functional, and proves reduced-motion collapses every
  animation to zero. SR-019, SR-020, and the new SR-025 move to enforced: the requirement
  registry has zero open rows.
- Seeded deterministic fuzz suites close TH-014: hundreds of generated document and command
  pairs prove the reducers fail only through the closed taxonomy, never mutate input, and stay
  byte-invertible in canonical minimal form, while structural mutations prove the rich-text
  parser rejects malformed and prototype-polluting input through deliberate diagnostics and
  the projection holds its invariants, including inert pass-through of markup payloads.
  TH-008 and TH-013 are the two remaining open threat rows.
- The release workflow verifies npm authentication before publishing, separating
  secret-delivery failures from token-permission failures.

### Command vocabulary resolution (M2-02)

- The two remaining open Gate A vocabulary items are deliberately resolved (ADR 0009). The
  verified inverse of `remove-node` is promoted to the first-class, batchable `restore-node`
  command with full-subtree duplicate validation — a check `insert-node` now also enforces — and
  the top-level `reset-inherited-property` command removes every responsive override for a
  property so all viewports inherit the base value again, inverting to a sorted batch of
  viewport-scoped `set-property` operations. Six new canonical vectors (38 total) and a new
  negative fixture (25 total) pin the semantics; only responsive-role resize remains open.

### Renderer conformance and delivery controls (M2-05, M1-05)

- Rich text gained a canonical renderer projection: per-block plain text with code-point
  offsets, sorted and merged mark spans, and embed anchors, published as a strict schema with
  seven conformance fixtures shipped through the testkit tarball. The pure `projectRichText`
  reference replays every fixture; conforming renderers must reproduce the projection and apply
  target-format encoding themselves — markup is never canonical.
- The contracts lane now enforces changesets: publishable-path changes relative to the release
  base without an unconsumed changeset fail the check with the changed paths and the one-line
  fix, and CI fetches full history so the merge-base is always computable.

### Inspector interaction parity (M4-05)

- The inspector became a keyboard-complete editor: per-property JSON editing with commit and
  revert semantics, unset and add-property controls, binding set and removal, and an
  active-viewport override editor whose announcements name the viewport. Invalid input announces
  without dispatching, read-only sessions disable every control with a textual explanation, and
  conflict-class failures (stale state, stale generation, read-only) announce recovery guidance
  while focus provably stays on the triggering control (SR-023, SR-024).

### Commands, provenance, and lifecycle proofs (M2-01, M2-02, M2-04, M2-07, M3-04)

- Recipe and semantic design-value selection is deliberately resolved as one atomic batch of
  `set-property` operations expanded by `recipeSelectionOperations` — sorted design values plus the
  reserved `studio.recipe` marker — inheriting batch atomicity and verified inverses. The
  `add-model-field` command adds declared fields to draft content models, failing closed on
  published models (`artifact-not-draft`) and duplicate identifiers (`duplicate-field`).
- Provenance became a portable artifact (host-recorded chains of authoring, migration, pattern,
  import, plugin, and system transitions), and unresolved contributions gained a canonical
  document with reason, owner, affected nodes, and diagnostics; the contribution runtime reports
  those reasons per node and aggregates schema-valid documents.
- A session-lifecycle integration suite drives the session and host testbed together through
  load, edit, optimistic save, a lost race with the safe conflict revision, recovery-envelope
  reconciliation, and permission changes invalidating a whole session generation.
- The rendered preview payload maps opaque markers to nodes; the strict guard bounds the map and
  rejects unsafe member names.
- Fourteen threats carry stable identifiers in a machine-checked enforcement registry
  (TH-001..TH-014); SSRF hardening, CSP verification, and fuzzing are recorded as open gaps.
- The changesets action's second renamed input (`publish` → `publish-script`) was fixed, restoring
  the version workflow on main.

### Authoring experience (M4-01, M4-05)

- The shell gained a command palette (Ctrl/Meta+K, filterable, arrow-navigable, focus-restoring,
  read-only-aware, with per-block insert entries) and canvas pointer drag as a pure enhancement
  over the keyboard paths — same `reorder-children` command, textual drop indicator, live-region
  announcements, and cancelled drags provably changing nothing. Requirements SR-017, SR-021, and
  SR-022 bind those behaviours to their suite, and the boundary scanner was fixed to stop
  string literals from tripping its import matcher.

### Versioning, migrations, and patterns (M3-01, M2-01, M2-02)

- The deterministic migration runner landed with strict SemVer parsing, precedence comparison,
  and the small negotiated range grammar (exact, caret, tilde, comparator conjunctions).
  Migrations register with namespaced identity, owner, artifact kinds, source range, declared
  target, and loss classification; application copies, validates, refuses lossy transforms
  without confirmation, and always rejects reapplication as already applied.
- Composition patterns became a first-class schema artifact, and `apply-pattern` joined the
  canonical command subset: deterministic multi-root ID remapping, per-root provenance stamping,
  batch exclusion (its inverse is itself a batch), and three new canonical vectors — 32 total.
- The Studio Schema Profile is machine-readable: the published meta-schema carries the exact
  keyword allowlist and complexity limits, with a parity suite pinning it to the reference
  validator.

### Preview, shell, and media (M3-04, M4-01, M5-01)

- The preview channel gained renderer reload and channel teardown announcements with qualified
  reasons: reload voids in-flight renders and re-announces readiness; teardown closes both
  endpoints and a disposed responder ignores all later traffic.
- The shell gained the viewport switcher (theme-fed, pressed states, change event), the
  breadcrumb (ancestry navigation with aria-current), and the diagnostics panel (severity-ordered,
  textual severities, activate-to-focus), all catalog-localized.
- Media uploads are orchestrated through the canonical session state machine with chunked
  progress, cancellation, retry under a fresh session, actionable oversize rejection, and no raw
  error leakage; every emitted snapshot is schema-valid by test.

### Foundation and release (M1-04, M1-05, M1-06)

- The supported environment matrix is a validated manifest; qualified claims require covering
  evidence lanes.
- Interaction requirements carry stable identifiers in a machine-checked registry binding each
  obligation to its executable assertion, manual procedure, or an honest open gap.
- The version workflow input rename that failed every Version Packages run was fixed; changesets
  pre mode opened the alpha release train, and the workflow now publishes versioned packages to
  npm with provenance under the alpha dist-tag once the version pull request merges.

### Foundation and delivery controls (M1-04, M1-05)

- The evidence system is machine-checkable: an evidence-bundle manifest schema, a gate decision
  record schema, and a strict validator run in the repository check lane. Non-sample bundles must
  match the checked-out commit, a clean tree, and content-addressed artifact checksums; a permanent
  failing sample bundle proves stale or missing evidence cannot pass, and the lane fails if that
  sample ever passes.
- The check lane gained a deterministic secret scanner with an embedded pattern self-check; CI
  additionally audits production dependencies at high severity and generates a CycloneDX SBOM.
- `CODEOWNERS` maps the governance stewardship areas, and the release-guard workflow step that
  failed on nested shell quoting before it could verify that publication stays disabled was fixed.

### Document and command protocol (M2-01, M2-02, M2-06)

- The canonical command vocabulary now covers duplicate-node with deterministic caller-allocated
  identifier remapping, reorder-children, unset-property (base and responsive viewport), binding
  set/remove, and an atomic batch envelope, alongside the existing insert, remove, move, and
  set-property commands.
- Twenty-nine canonical command vectors are published under `schemas/vectors/command/` and shipped
  verbatim through `@kumwe/studio-testkit`. Each fixes the initial document, the command, the exact
  expected document or stable failure code, and the inverse command; the reference core replays the
  corpus and proves inverse round-trips and input immutability. The stable failure-code taxonomy is
  closed and versioned (ADR 0008).
- Documents keep a canonical minimal form: empty slot and responsive collections are never stored,
  which makes every successful command byte-invertible (ADR 0008).
- A portable negative-fixture corpus (23 fixtures) proves the schemas reject unknown members,
  prototype-polluting and control-character member names, published-but-empty documents, malformed
  identifiers, nested and empty batches, non-canonical versions and locales, raw CSS and HTML
  smuggling, and digest and protocol-version violations.
- Canonical cross-language serialization landed in the core: sorted members, canonical numbers,
  bounded depth, and a dependency-free UTF-8 byte form for checksums, locked by a seeded generative
  suite.
- The published schema corpus carries a digest manifest (epoch, file, `$id`, sha256) that the
  contract lane recomputes from sources, and the common schema now defines the canonical scalar
  profiles: exact decimal strings, money values, and RFC 3339 date/instant forms.

### Extension, theme, host, media, and rich-text contracts (M2-03, M2-04, M2-05)

- Plugin manifests and theme design profiles gained TypeScript projections, with conformance tests
  proving type and schema agree; the portable extension lifecycle state vocabulary is part of the
  protocol.
- The host contract has an executable shape: the twelve stable error categories became
  `host-error.schema.json` with the `HostPortError` projection and a strict guard, and the nine
  standard host ports are typed asynchronous interfaces sharing one request envelope, aggregated
  as `HostAdapter`.
- The portable rich-text grammar is canonical in `rich-text.schema.json`, with a normative
  contract, a profile-sync test pinning the runtime editor profile to the schema vocabulary, and
  negative fixtures rejecting unknown marks and raw HTML.
- The media upload session lifecycle is canonical: bounded request, host-authorized plan, progress,
  and a closed state machine whose illegal states are unrepresentable. The crop-inside-bounds
  semantic rule the schema cannot express is enforced by `validateMediaReference`.

### Headless runtime (M3-01, M3-02, M3-04)

- `StudioSession` provides deterministic editing over one Blueprint: bounded history behind
  fail-closed guards (read-only sessions, stale session generations, expected-revision conflicts),
  dirty tracking against the last saved revision, and a validated selection model pruned across
  execute, undo, and redo. The locale-guarded `set-field-value` entry reducer landed with it.
- The owner-aware contribution runtime activates contributions transactionally into sealed,
  immutable registry generations: owner mismatches, duplicates, cross-owner collisions, and invalid
  definitions fail closed without disturbing a previously active extension; disable and trust
  revocation remove executable contributions immediately while documents stay diagnosable and
  unresolved nodes stay inspectable; stale generations are refused for execution.
- The preview channel gained its host-side responder and a ready handshake: renderer announcement,
  digest-stamped responses, error isolation that never leaks raw renderer failures, supersede and
  dispose semantics, and the same origin-pinning and replay-resistant sequencing on both ends.
- Capability negotiation is executable and fail-closed: without a common wire protocol version or a
  required host port there is no editable session, and missing optional ports degrade with
  informational diagnostics.
- The generic host testbed (M3-03) landed in `@kumwe/studio-testkit`: a deterministic in-memory
  `HostAdapter` with optimistic-concurrency conflicts carrying the safe current revision,
  permission changes that bump the session generation and invalidate every port, disconnect and
  single-shot failure injection across all twelve error categories, cursor pagination, recovery
  envelopes, telemetry with primitive-only attributes, and non-disclosing not-found messages —
  every produced failure satisfies the canonical host error guard.

### Authoring experience (M4-01, M4-05, M1-06)

- The Lit shell adopted the guarded session and gained a labelled, keyboard-complete outline:
  move, duplicate, and delete controls dispatching canonical commands, arrow navigation with
  Alt+Arrow moves, Ctrl/Meta+D duplicate and Delete, a visible shortcut hint line, one polite live
  region announcing outcomes and failures, documented focus targets that survive undo and redo, a
  save-state indicator with a dirty-changed event, and a host-overridable message catalog replacing
  every hardcoded chrome string. Unresolved blocks are marked textually, never by color alone.
- The normative keyboard reference (`docs/experience/keyboard.md`) is bound to its executable
  conformance assertions.
