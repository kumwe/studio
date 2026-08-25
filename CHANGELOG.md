# Changelog

All notable delivered changes to the Studio workspace are recorded here, grouped by the roadmap
work packages they advance. An entry records implemented, repository-verified behaviour; formal
work-package acceptance and gate outcomes remain governed by
[`docs/roadmap/STATUS.md`](docs/roadmap/STATUS.md) and the
[evidence model](docs/roadmap/evidence.md), and are never implied by an entry here.

## Unreleased

### Deterministic visual-canvas placement (M4-01, M4-05)

- Measured pointer placement now resolves an exact-distance tie in favor of the deeper semantic
  destination. A parent and its only rendered child may legitimately expose coincident rectangles;
  dragging to their shared boundary now reaches the child's owning slot instead of silently selecting
  the document-root boundary enumerated first. The candidate set, command dispatcher, protocol shape,
  keyboard paths, and host authority remain unchanged.

### Gate evidence authenticity (M1-04)

- Stable IDs and required evidence-class mappings now cover all 14 Gate A and 18 Gate B criteria.
  Closed bundle, registry, and multi-bundle gate schemas distinguish mechanical evidence modality,
  pending/reproduced human review, and per-criterion gate outcomes without creating a gate claim.
- Strict semantic checks reject fabricated or unreachable commits, nonexistent/sample/source-mismatched
  bundles, stale reviews, retries, uncovered criteria, invalid profile partitions, reviewer/sign-off
  defects, path traversal, symlinks, checksum drift, and passing records with high-risk defects. With no
  gate record, all criteria are explicitly reported uncovered and both gates remain unassessed.
- Bundle generation validates inputs before filesystem access, uses fixed argument vectors, runs the
  complete quality/contract/test/build/Chromium lane with zero retries, captures bounded scanned logs,
  and atomically writes a schema-valid pending bundle. Immutable, credential-free workflows upload only
  that exact directory and keep release publication disabled.

### Version 2 web scope and coordinated release family (M1-03, M1-05, M2-06)

- Version 2 now qualifies the explicit web profile target set. Dart generation, cross-runtime parity,
  and native Flutter profiles remain mandatory Version 3 targets instead of unrelated Version 2 gate
  blockers. ADR 0019 records the scope decision; Gate A and Gate B remain unassessed/blocked, and no
  profile is claimed without reproduced evidence.
- The seven public npm packages are one Changesets fixed group. A closed canonical
  `studio-release.json` records their exact versions, the wire protocol, corpus-manifest digest, and
  evidence-backed profile identifiers; protocol and testkit ship byte-identical exported copies.
- Deterministic sync/check/version commands, packaging checks, a publication guard, post-publish npm
  verification, and regression tests prevent a stale, partial, or staggered family from being
  published as one Studio release. The initial record describes the existing staggered alpha baseline;
  the next version run advances the complete family before publication is permitted.

### Stateful host conformance (M3-03, M2-04)

- `studio.profile/host-baseline-v2` adds nine portable sequence vectors without widening the original
  baseline. They execute in-flight and completed idempotent replay, changed argument/context refusal,
  canonical numeric intent, resource-scope separation, wrong-operation refusal, fixed-window reset and
  failed-attempt retry, plus matching and cross-context preview cancellation with an explicit late
  renderer completion.
- The sequence schema now carries the exact idempotency scope and intent preimage, explicit logical
  clock and renderer controls, and assertion tags. Contract semantic guards reject duplicate seeds or
  rate policies, invalid/double settlements, unclosed pending work, wrong renderer releases, and bad
  final revision references; embedded negative drills keep those checks live.
- The deterministic reference host preserves supplied artifact revisions, kinds, statuses, and session
  generation, then advances new revisions predictably. Its runtime, public replay tests, generated
  schemas/corpora, integrity manifest, ADR, evidence guidance, and release changeset move together.
  Gate counts remain unchanged until independent evidence is reproduced.

### Portable preview draft identity and lifecycle (M3-04, M2-06, M2-07)

- The negotiated preview wire advances to `0.1.0-draft.2`: a draft digest is SHA-256 over the
  canonical UTF-8 artifact bytes, and the portable preview corpus fixes that digest plus the
  deterministic, digest-scoped marker preorder. Every rendered result carries an exact one-to-one
  marker map; activation and measurement accept only the latest live inventory.
- Render attempts carry session-unique request IDs as well as private generations. Supersession,
  matching disposal, reload, teardown, local cancellation, and viewport changes abort the callback
  and invalidate its generation, so a late or same-digest settlement cannot satisfy a newer attempt or
  publish stale geometry. The responder remains DOM-free and exposes cancellation through
  `AbortSignal` without trusting callback cooperation.
- The closed draft.2 schemas, guards, reference host, ADR, contract, fixtures, and release changeset
  move together. The reference host stages only a semantically valid artifact whose ID, revision, and
  canonical digest agree with the request; this implementation and corpus do not by themselves
  advance the programme gate.

### Portable property-schema profile (M2-01, M2-03, M2-06, M2-07)

- `studio.profile/schema-property` defines the language-neutral admission and instance boundary for a
  contributed block's canonical `propertySchema`. It fixes a closed object root, local non-recursive
  JSON Pointer references, exact decimal `multipleOf`, deterministic diagnostic precedence, canonical
  UTF-8 size accounting, bounded schema and embedded-JSON depth and size, and the supported keyword
  vocabulary.
- Core exposes an eval-free compiler with stable codes and schema pointers. Admission measures
  canonical bytes iteratively before sorting attacker-controlled maps, bounds the admitted graph, and
  memoizes reference-DAG evaluation, so shared or adversarial references cannot amplify validation
  without limit while distinct diagnostics remain deterministic.
- The published profile schema, exact-limit and one-over corpus pairs, hostile fan-out/combined-depth
  cases, runner, ADR, documentation, tests, and changeset are versioned together. Cross-runtime replay
  and independent evidence are still required before a conformance or gate claim is accepted.

### One-command standalone reference host (M4-01, M3-04)

- A clean checkout now has standard root entry points for the runnable product slice: `npm run dev`
  starts the live Vite reference host, while `npm start` builds the complete workspace and serves the
  generated bundle under the pinned Content Security Policy. The setup documentation uses the
  lockfile-reproducible `npm ci` path and distinguishes this local development harness from the
  authoritative services an integrating host must supply.

### Kumwe App reference-host identity (M3-05)

- Studio now names its first-party reference host **Kumwe App** and links to its canonical
  [`kumwe/app`](https://github.com/kumwe/app) repository throughout the current architecture,
  governance, media, roadmap, and integration guidance. The integration profile is `kumwe-app`, and
  its playbook is `docs/integration/kumwe-app.md`; no current Studio contract or guide retains the
  superseded product or repository name.
- Canonical example capabilities and session configuration use the matching owner-scoped host
  identifier `org.kumwe/app`. This is an example/corpus identity correction only: Studio remains
  host-neutral and no generic package imports Kumwe App implementation types.
- The Kumwe App playbook records the downstream contract mismatch found in the renamed core: frozen
  manifest 5 / SPI 3 paraphrases all six contribution families through host-native declarations, not
  canonical Studio resources. Kumwe App must preserve that legacy generation and add manifest 6 /
  SPI 4 carrying canonical `block-definition`, `pattern`, `field-adapter`, `inspector`,
  `design-vocabulary`, and `migration` documents, with host bindings kept separate, exact schema and
  corpus validation, and only deterministic lossless legacy adaptation.

### A verifiable corpus (M1-04, M2-06)

- The published corpus becomes verifiable rather than assumed. `corpus-manifest.json` ships in
  `@kumwe/studio-testkit` carrying the SHA-256 digest of all 260 files across 10 groups: 26 fixtures,
  60 command vectors, 11 media vectors, 29 host vectors, 9 host-sequence vectors, 2 preview vectors,
  62 schema-profile vectors, 12 canonical vectors, 42 invalid fixtures, and 7 rich-text-conformance
  fixtures. `corpus-manifest.schema.json` fixes the manifest shape. A host that vendors the corpus
  verifies its copy against the manifest, so a stale or altered fixture is detected before it silently
  changes what a conformance claim means, and a claim is made against a corpus the claimant confirmed.
- The contracts lane regenerates the manifest and verifies every digest against what actually ships,
  so it cannot drift from the corpus it describes.

### Canonical serialization as an executable corpus (M2-06, M3-01)

- Twelve canonical serialization vectors publish what was previously only prose and reference code:
  member ordering by code unit, minimal escaping with the short forms where they exist, the number
  grammar including negative-zero canonicalization, UTF-8 emission of non-ASCII and astral text, the
  depth bound, and the forbidden member names — each carrying the exact canonical string and the
  SRI-style digest of its bytes.
- Every checksum in the contract is computed over exactly those bytes, so an implementation that
  reproduces the corpus computes the same digests as every other. That is what makes a host's
  vendored-corpus integrity check and a stored document's round-trip comparison meaningful across
  languages rather than per-runtime.
- The expectations were produced by an independent canonicalizer rather than recorded from the
  reference implementation, so the reference replaying them is a genuine cross-implementation check
  rather than a restatement of its own output.

### Every declaration kind schema-backed (M3-05, M2-01, M2-03)

- The last two contribution kinds a downstream Gate A freeze names gain canonical payload schemas.
  `inspector.schema.json` declares the block types a contributed panel applies to and whether it
  augments or replaces the built-in inspector for them — replacement never removing the host's own
  policy and accessibility surfaces. `field-adapter.schema.json` declares the control identifier a
  field's authoring metadata names, the field kinds it accepts, and the bounded option schema an author
  configures it through.
- Both are executable surfaces, so each declares the capability its executable half requires: a
  declaration without one is inspectable but never executed, which is what lets an administrator review
  a plugin's contributions without running its code. Every kind a host freezes against is now validated
  against a published schema rather than a paraphrase.

### Authorized mutations in the reference host (M3-03, M2-07)

- The reference host authorizes artifact mutations, closing the largest recorded limitation of the
  host baseline profile. A save or a publication the acting identity does not hold the permission for
  is refused as `forbidden` before the artifact is touched, and the refusal does not disclose whether
  it exists; save authority and publication authority are distinct, so holding one never grants the
  other. Two conformance vectors fix the behaviour, so a host proves its authorization gate from the
  published corpus rather than being trusted to have one.
- That increment narrowed the original baseline's remaining limits to state that needed more than one
  exchange: idempotent replay, rate limiting, and cancellation. The additive stateful profile above
  now executes those obligations without changing the original baseline assertion set.

### The Gate A preview vocabulary (M3-04, M4-06)

- The preview channel's three Gate A messages are canonical and implemented, so a host building an
  authenticated preview endpoint has the whole vocabulary rather than seven families and a list of
  intentions. `studio.preview/activated` lets a renderer report a trusted interaction with a marked
  region — `activate`, `context-menu` or `focus`, intent rather than raw input events, with the marker
  carrying nothing beyond the node identity the render already published.
- `studio.preview/viewport` drives the surface to a theme-declared semantic role **or** to bounded
  explicit dimensions, as alternatives rather than a merge: each schema branch is closed, so a payload
  naming both matches neither, and the client refuses the combination before it reaches the channel.
- `studio.preview/dispose` revokes the resources a renderer holds for a superseded draft while the
  channel stays open, and the contract now states the distinction it had left implicit: teardown ends
  the session, dispose frees a superseded render within one that continues. Naming a digest revokes
  that render; omitting it revokes every draft resource held.
- The client gains `onActivated`, `setViewport` and `disposeDraft`; the host gains
  `announceActivation`, `onViewport` and `onDispose`. The canonical guard and schema refuse an
  invented interaction, an out-of-bounds dimension, a role-and-dimensions merge, and a malformed
  digest, with negative fixtures for the two that a schema alone can catch.

### The media upload lifecycle on the wire (M5-01, M2-05, M2-04)

- The media port gains `authorize-upload`, `complete-upload`, `abort-upload`, `upload-status` and
  `import-external` beside `get` and `list`. The contract described a full upload lifecycle while the
  wire carried only reads, so a host had nothing to implement and Studio's upload orchestration had no
  published shape to bind to; it now has one.
- Bytes never cross the JSON port. `authorize-upload` applies host policy before any byte moves and
  returns a bounded, expiring grant naming an https destination the host controls, with the chunk plan
  and any headers the client sends verbatim; the client transfers directly there, so custody, quotas
  and storage placement stay host-owned and a large body never traverses the port transport. A grant is
  a capability scoped to one declared upload, never a reusable credential (ADR 0015).
- The host verifies what it received rather than trusting a declared media type or checksum, so an
  accepted identity may still be processing or quarantined and `upload-status` polls it. Seven
  conformance vectors fix the behaviour, including refusal of an oversized upload, a filename carrying
  a path separator, and an external candidate resolving to a private address — each refused without
  echoing the offending value.

### The host transport boundary (M2-04, M3-03)

- The wire boundary is published rather than implied. A closed operation registry
  (`host-operations.schema.json`) binds every port operation's three names — the typed method
  `artifact.load`, the route segment `artifact/load`, and the capability identifier
  `studio.operation/artifact.load` — one to one, and records per operation whether it mutates host
  state, whether it is concurrency-protected through `expectedRevision`, and whether its port is
  required for an editable session. The capability document's port and operation vocabularies now
  reference the registry, so a host can no longer advertise an operation that is not on the wire; the
  canonical example had been advertising exactly such an operation and is corrected.
- The request and result envelopes gain canonical schemas. `host-request.schema.json` fixes the
  `{ arguments, context }` call body and the envelope members a host validates before dispatching;
  `host-result.schema.json` fixes the success body, where `value` is always present and `revision`
  accompanies every concurrency-protected operation so a client never re-reads to learn what it wrote.
- The HTTP binding becomes normative documentation instead of a comment inside a test helper: the
  `POST {baseUrl}/ports/{port}/{operation}` route scheme, the body shapes, the bidirectional
  category-to-status table, the rule that a canonical error body always wins over a status code, and
  the concurrency and idempotency obligations. A drift guard asserts the registry still covers exactly
  the typed port surface, so the published names cannot rot away from the code.

### Conformance profiles and the host assertion corpus (M3-03, M2-04, M1-03)

- Conformance profiles are named, versioned, and executable. `studio.profile/host-baseline` is declared
  first and ships its assertion set as a new canonical vector kind: `host-vector.schema.json`, published
  as `vectors/host/` through `@kumwe/studio-testkit`. Each vector fixes reproducible host state, the
  request envelope and argument, and the required outcome — an accepted result with its revision
  behaviour, or one category of the closed error taxonomy with its retry classification and
  non-disclosure obligations. Every precondition is a condition a real host reproduces rather than a
  test double, so an adapter in any language replays the corpus without executing Studio code
  (ADR 0014).
- The baseline profile asserts persistence and optimistic concurrency (an accepted mutation advances the
  revision; a stale one conflicts and returns the safe current revision so a client resolves without a
  second read), the request-envelope guards for wire version, session generation and structural
  validity, bounded queries that refuse rather than clamp, absence that resolves empty where the
  contract says empty and refuses without disclosure where it says refuse, authority explained rather
  than silently granted, and primitive-only telemetry attributes. The reference host claims the profile
  by replaying the corpus, and the profile records the obligations it does not yet assert instead of
  implying them.
- Release channels now bind to profiles: `beta` means feature-complete against a declared, executable
  profile claimed with reproduced evidence, and `rc` requires every advertised profile claimed at the
  exact candidate commit. The release policy also records what is actually true today — the `alpha`
  channel publishes from the release train with provenance, while `beta`, `rc` and stable stay closed
  until the evidence system is accepted.

### The declaration surface a host freezes against (M3-05, M4-03, M3-01, M2-01)

- The plugin manifest accepts `design-vocabulary` and `migration` contributions, each backed by a
  canonical payload schema with wire types, a canonical example, and a negative fixture, so every
  declaration kind the downstream Gate A freeze names is validated against a published schema
  rather than a paraphrase. A design vocabulary offers controls and recipes in the shapes a theme
  already owns — adoption stays a theme decision — and a migration declaration carries the portable
  descriptor the deterministic runner validates, while the transformation stays trusted package
  code. The unresolved-contribution vocabulary and the authoring SDK accept both kinds (ADR 0012).
- The editing-mode boundary is portable conformance behavior: a command vector may declare the
  session mode, the reference runner replays such vectors through a session fixed to that mode, and
  sixteen mode vectors cover every mode's foreign-vocabulary refusal, the read-only guard, and the
  hybrid bounds — allowed insertion and reordering around a locked sibling, and the designer-slot,
  disallowed-type, locked-subtree, document-roots, atomic-batch, and property-editing rejections —
  with `mode-forbidden` added to the vector schema's expected-code enumeration exactly as ADR 0011
  deferred. The corpus stands at 60 command vectors and 29 negative fixtures.
- The per-slot composition marker landed: a node's authoring policy may name individual slots as
  hybrid-composable regions without making the whole node structural. The marker only ever grants —
  a revoking form does not validate — its allowed-blocks list bounds its slot ahead of the
  node-level list, and the hybrid gate now tracks the source slot of removals, moves, duplications,
  and reorders so the rule holds for every affected collection (ADR 0013).
- The deterministic core's generative coverage broadened to the session, history, and migration
  surfaces: seeded lanes drive random command, undo, redo, and selection sequences proving
  state-version monotonicity, byte-identical rollback on every rejection across the closed failure
  union, selection pruning, and the history bound; generated migration descriptors and documents
  prove deterministic planning, copy-on-migrate, lossy confirmation, and classification; and the
  canonical serializer's round-trip lane widened to surrogate, control-character, edge-number, and
  depth-limit inputs with byte-level UTF-8 agreement.

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
