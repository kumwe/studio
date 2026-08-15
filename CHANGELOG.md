# Changelog

All notable delivered changes to the Studio workspace are recorded here, grouped by the roadmap
work packages they advance. An entry records implemented, repository-verified behaviour; formal
work-package acceptance and gate outcomes remain governed by
[`docs/roadmap/STATUS.md`](docs/roadmap/STATUS.md) and the
[evidence model](docs/roadmap/evidence.md), and are never implied by an entry here.

## Unreleased

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
