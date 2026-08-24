# Studio completion plan for Kumwe App Version 2

**Objective.** Take Studio from its current state — a proven contract, a headless engine, and an
outline-shaped authoring shell — to a **wired, visual page builder that Kumwe App can integrate and
ship inside Version 2**.

**Companion documents.**

- The host's own steps: [`kumwe/app` → `docs/roadmap/studio-completion.md`](https://github.com/kumwe/app/blob/master/docs/roadmap/studio-completion.md)
- The joint sequence binding both: [`docs/integration/version-two-joint-plan.md`](../integration/version-two-joint-plan.md)

This file holds forward work only. Each step names what to build, why it unblocks the objective, the
acceptance test that proves it, and where the existing roadmap already defines the scope so nothing is
restated twice. Steps are ordered: a later step assumes every earlier one landed.

---

## Scope decision recorded before anything else

**Version 2 is the web interface only.** Studio ships and is qualified inside Kumwe App's administrator
as a web authoring surface. Dart and Flutter parity is _not_ Version 2 scope: it becomes critical when
the App runs in a client and pages must be built there, which is Version 3 of the core.

The earlier programme contradicted this scope through Gate A criterion 9 and Gate B criteria 2, 3, 4
and 9, which required Dart. **`ST-0` resolves that contradiction before any other work starts**, so
later packages are judged against the product profile they actually ship.

---

## The five blockers this plan clears

Verified against `origin/main`. These are the reasons a host cannot integrate today, in dependency
order:

| #   | Blocker                                                                                                             | Step           |
| --- | ------------------------------------------------------------------------------------------------------------------- | -------------- |
| 1   | Nothing in Studio ever calls a host — `HostAdapter` has no consumer, and no public API binds a configuration to one | `ST-2`         |
| 2   | The contribution runtime activates blocks only, while a host legitimately declares six canonical kinds              | `ST-3`         |
| 3   | There is no preview surface — zero frames; the shell only announces reload and teardown                             | `ST-4`         |
| 4   | There is no visual canvas and no layout blocks; the canvas is a list of label chips                                 | `ST-6`, `ST-7` |
| 5   | The published packages have no coherent released set a host can pin as one                                          | `ST-1`         |

---

## Phase 1 — Make the contract integrable

### `ST-0` — Amend the programme for the Version 2 scope decision

**Repository state:** implemented as a proposed programme decision. This does not accept either gate
or create a profile claim; those remain evidence-review actions.

**Do this first.** Split the Dart obligation out of the Version 2 path so it stops blocking a gate the
product needs now.

1. In [`docs/roadmap/README.md`](README.md), rewrite Gate A criterion 9 to require **TypeScript models
   compile and round-trip the canonical corpus**, and move Dart round-trip into a named Version 3
   criterion under the Flutter profile. Do the same for Gate B criteria 2, 3, 4 and 9: each keeps its
   web obligation and defers its Flutter half.
2. Declare the Version 2 supported profile set explicitly: `studio.profile/engine-core`,
   `host-baseline`, `host-baseline-v2`, `media-policy`, `preview-identity-v1`, `schema-property`,
   plus `renderer-web` and `authoring-web` once `ST-4` and `ST-7` deliver them. `flutter` profiles are
   declared as Version 3 targets.
3. Record the decision as an ADR in [`docs/decisions/`](../decisions/) in the existing style, naming
   the rejected alternative (hold Version 2 until Dart parity exists) and its cost.
4. Update [`STATUS.md`](STATUS.md): the six-month board, the gate summary, and the M2-06/M3-06/M4-06
   rows, which become Version 3 scope rather than open Version 2 blockers.

**Acceptance.** No Version 2 gate criterion names Dart, no roadmap row implies Dart blocks Version 2,
and the deferral is recorded as a decision rather than an omission.

### `ST-1` — Publish one coherent, pinnable release set

**Repository state:** the fixed-family configuration, generated record, drift checks, and guarded
version/publish workflow are implemented. The checked-in record describes the current staggered alpha
baseline; it is not a publication claim. The first version workflow run must advance all seven packages
to one coordinate before the publication guard permits a release.

Today the packages carry staggered versions, so a host cannot say "we integrate Studio _x_". Give the
seven packages a single release coordinate.

1. Add a workspace-level release identifier — a `studio-release.json` at the repository root carrying
   the release name, the exact version of each of the seven packages, the protocol wire version, the
   corpus manifest digest, and the profile identifiers claimed at that release.
2. Publish it inside `@kumwe/studio-protocol` and `@kumwe/studio-testkit` so a host vendors it with the
   corpus it already verifies.
3. Extend the contracts lane to regenerate and verify it, so it cannot drift from the versions actually
   published.
4. Extend the release workflow so a publish always emits a complete set: every package advances to the
   release coordinate even when its own content did not change, or the release fails.

**Acceptance.** `npm view @kumwe/studio-protocol@<release>` and every sibling resolve to versions the
release record names; a host pins one identifier; the digest check fails when a package drifts.

### `ST-2` — Bind the host adapter into a real session API _(blocker 1)_

The single largest integration blocker. Studio defines nine ports and 24 operations, negotiation, an
error taxonomy and a reference testbed — and never calls any of it.

Ports and operations as published today:

| Port           | Operations                                                                                               |
| -------------- | -------------------------------------------------------------------------------------------------------- |
| `artifact`     | `load`, `save`, `publish`, `unpublish`, `dependencies`                                                   |
| `model`        | `get`, `list`                                                                                            |
| `media`        | `authorize-upload`, `upload-status`, `complete-upload`, `abort-upload`, `get`, `list`, `import-external` |
| `preview`      | `render`, `cancel`                                                                                       |
| `permission`   | `explain`, `refresh`                                                                                     |
| `recovery`     | `store`, `load`, `discard`                                                                               |
| `resource`     | `search`                                                                                                 |
| `localization` | `messages`                                                                                               |
| `telemetry`    | `emit`                                                                                                   |

1. Add `packages/core/src/host-session.ts` exporting `openStudioSession(adapter, options)`: negotiate
   capabilities through the existing `negotiation.ts`, load the artifact through the `artifact` port,
   construct a `StudioSession` bound to the returned revision and session generation, and return a
   handle exposing the session, the negotiated capabilities, `save()`, recovery reconciliation and
   `dispose()`.
2. Fail closed exactly as [`docs/contracts/host-adapter.md`](../contracts/host-adapter.md) requires: no
   common wire version or a missing required port yields no editable session; missing optional ports
   degrade with informational diagnostics.
3. Enforce session-generation invalidation centrally: once any port reports a stale generation, every
   later operation through the handle fails closed with the canonical category.
4. Carry expected revisions on mutating operations; a conflict surfaces the host's safe current
   revision and diagnostics and never overwrites.
5. Carry idempotency keys per the scope rules the host contract and the testbed already fix.
6. Keep it DOM-free and Node-free — `scripts/check-boundaries.mjs` governs; the adapter is injected and
   core never constructs a transport.

**Acceptance.** A suite drives the real testbed from `@kumwe/studio-testkit` through open, edit, save,
conflict-with-safe-revision, recovery reconciliation, permission change invalidating the generation,
missing required port refusing to open, missing optional port degrading, disconnect and single-shot
failures mapping to canonical categories, and idempotent replay producing one effect.

### `ST-3` — Activate every contribution kind _(blocker 2)_

Kumwe App's manifest 6 / SPI 4 declares six canonical kinds — `block-definition`, `pattern`,
`field-adapter`, `inspector`, `design-vocabulary`, `migration`. Studio's runtime activates **blocks
only**, so the host can legitimately declare contributions Studio cannot consume. This mismatch is live
today.

1. Extend `ContributionRuntime` so every declared kind activates through the same transactional
   discipline blocks use: sealed immutable generations, owner-namespace enforcement, duplicate and
   cross-owner collision refusal, invalid-definition refusal that never disturbs the active generation,
   disable and trust revocation leaving documents diagnosable, per-kind unresolved reasons, and stale
   generations refused.
2. Validate each kind against its own published schema — `pattern`, `field-adapter`, `inspector`,
   `design-vocabulary`, `migration` all exist in [`schemas/`](../../schemas/). Reuse the profile
   validator; never hand-roll a second one and never weaken a published schema to make a kind fit.
3. Add per-kind registry lookups so a consumer can resolve the inspector for a field type, or the
   migrations for an artifact kind.
4. Extend `defineStudioPlugin` to mirror the new rules exactly — it adds no invariant the runtime does
   not enforce, and its rejections stay byte-identical to a real activation rejection.

**Acceptance.** For each non-block kind: activation into a sealed generation, duplicate and cross-owner
collision failing closed, invalid document refused against its canonical schema, disable and revocation
leaving the right unresolved reason, atomic upgrade retiring the previous version, stale-generation
refusal, and SDK parity.

### `ST-4` — A real preview surface _(blocker 3)_

Studio has a complete preview protocol and no surface that uses it.

1. Add a preview region to the shell hosting the renderer in a same-origin frame, driven by the
   existing `PreviewClient` — never ad-hoc messaging. Perform the ready handshake before any render.
2. Push the artifact on change, coalesced deterministically, honouring supersession so a late
   settlement cannot publish stale output.
3. Map selection both ways through the marker map: selecting a node highlights its rendered region, and
   a marker resolves back to a node.
4. Drive the preview viewport from the existing viewport switcher so responsive composition is visible.
5. Handle reload and teardown per [`docs/contracts/preview.md`](../contracts/preview.md), keeping the
   existing announcements and never moving focus.
6. Degrade honestly: with no preview capability negotiated the region says so textually and the rest of
   the shell stays fully usable. Preview is an enhancement over the keyboard paths, never a requirement.
7. Everything holds under the pinned policy — `default-src 'none'; script-src 'self'` with Trusted
   Types — so build DOM through templates, never markup strings.
8. Wire the existing reference renderer in `examples/reference-host` to run inside that frame, so
   `npm run dev` shows a live rendered composition beside the outline.

**Acceptance.** Handshake precedes render; one artifact change produces one coalesced request;
supersession discards a late settlement; selection maps both ways; a viewport change re-renders;
reload and teardown announce without moving focus; absent capability renders the fallback and editing
still works; the accessibility and CSP lane stays green.

---

## Phase 2 — Make it a page builder

### `ST-5` — Session modes on the wire

The core enforces five editing modes; the host contract cannot express them —
`StudioConfiguration` carries only `editable | read-only`, and the shell never sets a mode. A content
author therefore cannot be given a content-only session.

1. Add the mode to the negotiated session configuration in the protocol, with the closed vocabulary the
   core already implements: `model`, `blueprint`, `content`, `hybrid`, `read-only`.
2. Resolve it in `openStudioSession` from what the host declares, and refuse a mode the host is not
   authorized to grant.
3. Surface it in the shell: the mode is visible, affordances a mode forbids are disabled with a textual
   reason rather than hidden, and `permittedCommandTypes` drives that rendering so the interface can
   never disagree with the engine.
4. Add canonical vectors for the mode boundaries, including the `mode-forbidden` code, so the rules are
   portable rather than TypeScript-only.

**Acceptance.** Each mode grants exactly its command set through a real host session; a forbidden
command fails closed leaving document, history and selection untouched; the shell renders the same
boundary the engine enforces.

### `ST-6` — Layout blocks and responsive composition _(blocker 4, part one)_

No `section`, `stack`, `grid` or `columns` block exists anywhere in runtime code, so there is nothing to
compose a page _from_. This is `M4-02` in [`README.md`](README.md) — scope is defined there and not
restated here.

1. Ship the layout block family as first-class block definitions with bounded, theme-driven properties:
   section, stack, grid, columns, plus slots and constrained sizing.
2. Complete the layout vocabulary beyond the two size-role axes already delivered: alignment, spacing,
   visibility per viewport, and breakpoint inheritance — all as bounded token references, never stored
   CSS.
3. Reach the token recipes already implemented in core from the inspector, which currently has no path
   to them.
4. Prove the four-to-two-to-one responsive behaviour in two unrelated themes, which is `M4-02`'s stated
   acceptance.

**Acceptance.** A page composed of nested layout blocks reflows four-to-two-to-one across viewports in
two themes with no stored CSS and no viewport-specific markup, driven entirely by declared vocabulary.

### `ST-7` — The visual canvas and direct manipulation _(blocker 4, part two)_

The canvas is a list of label chips. This is what stands between the current shell and the draggable,
dynamic page builder the product is for.

1. Render the composition visually in the canvas region using the preview surface from `ST-4` as the
   visual substrate, with selection, hover and drop targets resolved through the marker map and its
   measured geometry.
2. Add direct manipulation over that substrate: drag to reorder and to reparent into slots, with live
   drop indicators derived from measured rectangles.
3. Keep every operation reachable without pointer input — drag remains a strict enhancement over the
   existing keyboard and outline paths, dispatching the identical commands, and a cancelled drag
   provably changes nothing. This is `M4-05`'s standing rule.
4. Close the command surface: the shell currently dispatches ten of seventeen command types. Add the
   missing ones, including reparenting moves, so every semantic operation has an interface path.

**Acceptance.** An author builds a nested, responsive page by direct manipulation; every one of those
operations is also achievable by keyboard; the accessibility lane stays at zero violations; cancelled
drags change nothing.

**Implemented increment (`5da6ef8`).** The bound ST-4 preview is now the visual canvas: accepted markers
are measured with generation-safe bounded requests, and a CSP-safe SVG overlay supplies selection, hover,
reorder/reparent targets and live indicators. Pointer and outline/command-palette destinations use the same
semantic dispatcher; cancellation is a tested no-op. The Blueprint command surface now includes
`move-node`, `restore-node`, `reset-inherited-property` and host-supplied validated `apply-pattern` paths in
addition to the previously exposed commands. Unit and Chromium browser assertions cover stale geometry,
hybrid/cardinality bounds, pointer/keyboard command identity, cancellation and CSP. This repository-verified
increment does not itself satisfy acceptance: independent evidence review and the manual assistive-
technology/touch/zoom/RTL matrix remain open, and the reference host still proves the equivalently isolated
channel rather than the unresolved dedicated framed-authoring CSP policy.

### `ST-8` — Bind composition to host content types

**Repository state:** implemented as a Studio integration increment. The public host-session consumes
read-only model `list`/`get`; core projects exact locked fields, controls and invalidation diagnostics; the
shell binds through canonical commands; and `studio.profile/binding-projection-v1` is executable. This is not
joint acceptance: it still needs a coordinated published Studio release, Kumwe App AP-2 on that coordinate,
a real adapter/session replay, an independent second-host replay and evidence review. BusinessRecord
projection remains a separate App adapter rather than an inferred Content mapping.

This is what makes the builder _the App's_ builder rather than a generic one: blocks bind to real
content, not to invented fields.

1. Implement the `model` port consumption: `list` and `get` project the host's content and business
   definitions into Studio content models. The `content-model` and `entry` schemas already carry
   `fields`, `relationships`, `values`, `compositionOverrides`, `translationOf` and `workflowState`,
   which is the shape the App's `ContentTypeDefinition`, `FieldDefinition`, `ContentEntry` and
   `TranslationGroup` map onto.
2. Drive binding affordances from the projected models: an author binds a block property to a real
   field on a real content type, with the inspector rendering the field's declared control.
3. Enforce the boundary: Studio reads projections and never writes a definition; field policy,
   translation state and workflow remain the host's.
4. Publish binding vectors so the mapping is portable and a second host implements the same semantics.

**Acceptance.** A block binds to a host content-type field through the `model` port; the inspector shows
the declared control; changing the host definition surfaces as a diagnosable binding rather than silent
breakage.

---

## Phase 3 — Make it claimable

### `ST-9` — Publish the authoring message catalogue

The shell's message keys are not published, so a host cannot feed them from its own translation chain or
prove coverage.

1. Publish the complete key catalogue as a versioned artifact in `@kumwe/studio`, with a lane that fails
   when a key is added without entering it.
2. Document the override contract so a host maps keys into its compiled catalogues, and state that a
   missing key falls back rather than throwing.

**Acceptance.** A host enumerates every key, supplies overrides for all of them, and a lane proves no
unpublished key reaches the interface.

### `ST-10` — Close the evidence lane's holes

**Repository state:** implemented as evidence infrastructure only. The registry, strict semantic
validator, safe complete generator lane, negative regression suite, and immutable workflows are present.
No real bundle has been reproduced, no gate record exists, and neither gate or profile status changed.

The earlier lane accepted evidence it should refuse. These controls are now required before any gate
claim rests on it.

1. `check-evidence.mjs` resolves every referenced non-sample bundle, refuses unknown or mismatched source
   commits, authenticates exact files and checksums, and verifies per-criterion evidence-class coverage;
   the former fabricated zero-commit record is a negative regression case.
2. The generator writes nonempty mechanical criterion/class entries plus an explicit pending review,
   schema-validates before an atomic create, and never records a gate outcome or reproduction.
3. All fourteen Gate A and eighteen Gate B criteria have stable identifiers and evidence-class mappings;
   document/registry drift fails and an absent record prints every criterion as uncovered.
4. The bundle lane includes format, lint, typecheck, build, every governance script, the complete unit
   command, and Chromium accessibility with zero retries and bounded credential-scanned logs.
5. `evidence/README.md` carries the exact clean-room procedure, human review boundary, freshness rules,
   and durable-retention requirement.

**Acceptance.** A fabricated gate record fails; the generator emits a schema-valid bundle; every
criterion is either covered or named as uncovered.

### `ST-11` — Ratify the contract and open the beta channel

1. Replace the `0.1-draft` discriminator with the ratified epoch, declare the supported wire-version
   range, and record the compatibility policy — this is `M2-08`'s scope.
2. Produce the Gate A evidence bundle at one commit and route it through review. **This step needs a
   second human**: the evidence model requires two reviewers, one independent of the work-package
   owners, and states that an automated contributor is never a reviewer. Today the repository has one
   human author. No amount of implementation removes this.
3. On acceptance, promote the release channel from `alpha` to `beta` and publish the supported profile
   set at that release coordinate.

**Acceptance.** A ratified protocol version, an accepted Gate A bundle with two reviewer attestations,
and a `beta` channel a host can depend on.

---

## What is deliberately not in this plan

- **Dart and Flutter parity** — Version 3, per the scope decision above.
- **Months 5 and 6 breadth** beyond what integration needs: the ecosystem, marketplace and
  second-vertical packages stay on the roadmap and block nothing here.
- **A public composition editing surface** — Version 2 composes in the administrator only.
- **Gate B qualification itself**, which is the host's release gate and runs in the App's phase 7.
