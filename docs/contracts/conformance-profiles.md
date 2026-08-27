# Conformance profiles

Product conformance is governed by the [Studio product contract](../product-contract.md). The
`STUDIO-PROD-*` requirements are product outcomes, not claims that the current protocol or shell implements
them. In particular, `STUDIO-PROD-014` requires every profile and evidence record to distinguish current
Blueprint-only behavior from the planned coordinated contextual profile.

## Purpose

A conformance profile is a named, versioned set of assertions an implementation must satisfy before it
may claim that profile. Profiles exist so that "conforming" and "feature-complete" are measurable
rather than asserted: a claim is a corpus an implementation replays, not a paragraph it agrees with.

The [compatibility contract](../governance/compatibility.md) records the conformance-profile version as
its own axis — independent of document contract revision, wire protocol version, and package version.
The [release policy](../governance/releases.md) keeps beta development separate from conformance claims. A
beta package may be incomplete and claims no profile. Before RC preparation, all 15 product requirements must
be repository-verified; every profile the resulting RC advertises must then be reproduced and accepted before
official RC publication.

## Profile identity

A profile is identified by a qualified name in the `studio.profile` namespace and carries the exact
assertion set required to claim it. Adding an assertion to an existing profile is a breaking change to
that profile; a widened assertion set is published as a new profile name. A profile never weakens: an
implementation that claimed a profile keeps claiming it for the version it passed.

## Declared profiles

| Profile                                | Claimed by                        | Executable assertion set                                                       | State                |
| -------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------ | -------------------- |
| `studio.profile/host-baseline`         | A host adapter                    | `vectors/host/` replayed through the adapter                                   | Declared, executable |
| `studio.profile/host-baseline-v2`      | A host adapter                    | `host-baseline` plus `vectors/host-sequence/`                                  | Declared, executable |
| `studio.profile/engine-core`           | A protocol engine                 | `vectors/command/` and `vectors/canonical/`                                    | Declared, executable |
| `studio.profile/binding-projection-v1` | A model-binding client or host    | `vectors/binding-projection/`                                                  | Declared, executable |
| `studio.profile/media-policy`          | A host media pipeline             | `vectors/media/`                                                               | Declared, executable |
| `studio.profile/preview-identity-v1`   | A preview client/host             | `vectors/preview/`                                                             | Declared, executable |
| `studio.profile/schema-property`       | A property-schema validator       | `vectors/schema-profile/`                                                      | Declared, executable |
| `studio.profile/renderer-web`          | A trusted renderer                | `conformance/renderer-web/`, rich text, preview, CSP and accessibility lanes   | Declared, executable |
| `studio.profile/authoring-web`         | An authoring client               | `conformance/authoring-web/`, the requirement registry and accessibility lanes | Target               |
| `studio.profile/engine-dart`           | A Dart protocol engine            | Version 3 canonical, command, migration, and host-port replay                  | Version 3 target     |
| `studio.profile/renderer-flutter`      | A native Flutter renderer         | Version 3 block, theme, preview, and accessibility assertions                  | Version 3 target     |
| `studio.profile/authoring-flutter`     | A native Flutter authoring client | Version 3 interaction and accessibility assertions                             | Version 3 target     |

The Version 2 qualification target comprises the eight declared executable profiles plus
`authoring-web` when its assertion set becomes executable. The three Dart/Flutter
profiles are Version 3 targets and do not block Version 2. A target row is not a support or conformance
claim. The abandoned `0.1.0-rc.1` release record listed nine profile coordinates, including `authoring-web`.
Those proposed claims are withdrawn with that candidate and generated beta versioning clears them.

A profile marked **Target** is named so that consumers can see the intended boundary. It is not
claimable: its assertion set is not yet complete and executable, and no implementation may advertise it.
An executable profile is likewise not advertised until an immutable evidence bundle records an accepted
claim. Gate A and Gate B have not accepted the nine candidate profile coordinates; their presence in
`studio-release.json` alone is not an accepted conformance claim.

The target `studio.profile/authoring-web` is not claimable until its executable assertion set covers the full
contextual journey required by `STUDIO-PROD-001` through `STUDIO-PROD-015`. Passing the existing Blueprint
interaction vectors alone cannot be presented as evidence that Studio is the default content editor, edits
Model/Blueprint/Entry together, saves reusable types, or preserves inline/fullscreen continuity.

## `studio.profile/host-baseline`

The assertions a host adapter must satisfy before an editing session may open against it. The corpus
ships as `vectors/host/*.json` in `@kumwe/studio-testkit`, conforms to
[`host-vector.schema.json`](../../schemas/host-vector.schema.json), and is replayable without executing
Studio code — every precondition is a condition a real host reproduces (a stored revision, a withheld
permission, an unknown identifier, an unsupported wire version), never a test double.

Each vector fixes the host state (`given`), the request envelope and argument Studio sends (`context`,
`argument`), and the required outcome (`expect`) — an accepted result with its revision behaviour, or
one category from the closed error taxonomy with its retry classification and non-disclosure
obligations.

The profile currently asserts:

- **Persistence and optimistic concurrency.** A load returns the artifact at its stored revision; an
  accepted mutation advances the revision; a mutation against a superseded revision conflicts and
  returns the safe current revision, so a client resolves without a second read. Publication and
  unpublication are revision-checked exactly like a save.
- **The request envelope.** An unsupported wire version is refused as `incompatible` before any work; a
  superseded session generation and a structurally invalid envelope are refused as `invalid-request`.
- **Bounded queries.** A page size outside the declared bound and a cursor the host did not mint are
  refused rather than silently clamped or treated as an offset.
- **Absence versus failure.** An unknown media asset and an unstored recovery envelope resolve empty;
  an unknown artifact and an uncarried locale are refused as `not-found` without disclosing existence.
- **Authority.** Every mutation is authorized: a save or a publication the acting identity does not
  hold the permission for is refused as `forbidden` before the artifact is touched, and the refusal
  does not disclose whether it exists. Save authority and publication authority are distinct, so
  holding one never grants the other. A withheld operation is also explained as disallowed rather than
  silently succeeding, and refreshing authority answers with the held permissions and the live session
  generation.
- **Telemetry discipline.** Primitive-only attributes are accepted; a non-primitive attribute is
  refused, keeping the cardinality discipline enforceable.
- **Read-only model discovery.** `model.get` resolves an exact content-model coordinate and
  `model.list` returns authorized model projections without granting a definition mutation path.

The TypeScript reference host in `@kumwe/studio-testkit` claims this profile, proven by
`packages/testkit/test/host-vectors.test.ts`.

### Recorded limitations

These are obligations the host contract states that the baseline corpus does not yet assert. They are
recorded rather than implied, and a host must still satisfy them:

- **Idempotent replay.** The envelope carries an idempotency key and the contract requires retryable
  mutations to be idempotent. A vector states one exchange, so replaying a key twice is not
  expressible in this vector shape; the additive profile below uses a sequence-carrying vector kind.
- **Rate limiting and cancellation.** `rate-limited` and `cancelled` are declared categories with no
  reproducible precondition a single exchange can state — a rate limit needs a request count and a
  cancellation needs an in-flight request to cancel.
- **Coordinated contextual transactions.** The current host vectors exercise one artifact operation at a time.
  They do not prove the target **save item**, **save new type version**, or **save as new type** outcomes across
  separately versioned Model, Blueprint, and Entry artifacts (`STUDIO-PROD-004`, `STUDIO-PROD-006`). A future
  additive executable assertion set must define the host transaction and rollback expectations before such an
  outcome can be claimed; the current corpus must not be cited as that proof.

Those limitations remain part of `host-baseline`. Integrations that depend on their executable
assertions claim the additive profile below rather than retroactively widening this one.

## `studio.profile/host-baseline-v2`

The complete `host-baseline` assertion set plus the language-neutral sequence corpus in
`vectors/host-sequence/*.json`, conforming to
[`host-sequence-vector.schema.json`](../../schemas/host-sequence-vector.schema.json). Its nine vectors
carry exact artifact kind/revision/status and session-generation seeds, ordered invocations and
settlements, explicit logical-clock advances, explicit renderer completions, and observable final
state. Control steps are reproducible harness preconditions, not host operations or HTTP behavior.

The schema makes the idempotency rule machine-readable. The record scope is the key, operation
capability, resource-context key, and session generation. Intent is canonical JSON over the operation
argument plus `expectedRevision`, `locale`, and `protocolVersion`; absent optional fields are omitted,
negative zero uses canonical JSON's zero form, and `requestId` plus `traceContext` are excluded.

The executable sequence assertions are:

- **Replay and refusal.** A pending accepted publication coalesces with a matching retry, a completed
  retry returns the same result without another revision or rate-limit unit, a changed argument or
  semantic context is `invalid-request`, negative zero and zero are one canonical intent, and a failed
  rate-limited attempt does not poison its later retry.
- **Scope and identity.** The same key and intent are independently accepted in two resource contexts.
  A registered capability that does not match the invoked port operation is refused as
  `invalid-request`; every other invocation carries the exact closed-registry capability.
- **Deterministic rate limiting.** A declared fixed-window bound returns `rate-limited` with the exact
  retry delay and no side effect; an explicit logical-clock advance resets the window and permits the
  exact failed intent.
- **Preview cancellation.** A matching cancel settles an in-flight render as non-retryable
  `cancelled`; an explicitly released late renderer result is discarded. A cancel in another resource
  context does not affect the render, which completes and is delivered once. Each explicit completion
  repeats the originating draft.2 render attempt's exact `requestId` and draft digest.

The corpus directly exercises resource-context separation. Operation and session-generation
separation are normative scope fields and are covered by the TypeScript reference unit suite, but this
first portable sequence set does not yet carry host-owned session-rotation or cross-operation control
steps. A v2 replay must not be cited as portable proof of those two collision drills. Likewise, the
profile does not claim production rate-policy choice, authentication implementation, transport
security, renderer fidelity, or an accepted evidence result.

The TypeScript reference replay is
`packages/testkit/test/host-sequence-vectors.test.ts`. A profile claim still requires an immutable,
independently reproduced evidence bundle; a green repository run is implementation proof only.

## `studio.profile/engine-core`

The assertions a protocol engine must satisfy: the command corpus in `vectors/command/` replayed
through the reducer and, for a mode-carrying vector, through a session; and the canonical
serialization corpus in `vectors/canonical/`, which fixes member ordering by code unit, minimal
escaping, the number grammar including negative-zero canonicalization, UTF-8 emission of non-ASCII
and astral text, the depth bound, and the forbidden member names — each with the exact canonical
string and the SRI-style digest of its bytes.

The canonical corpus matters beyond the engine: every checksum in the contract is computed over
exactly these bytes, so an implementation that reproduces the corpus computes the same digests as
every other. That is what makes a host's vendored-corpus integrity check and a stored document's
round-trip comparison meaningful across languages rather than per-runtime.

## `studio.profile/binding-projection-v1`

The portable assertion set for binding an exact Blueprint revision to an authorized host content model.
The corpus ships as `vectors/binding-projection/*.json`, conforms to
[`binding-projection-vector.schema.json`](../../schemas/binding-projection-vector.schema.json), and carries
complete schema-valid Blueprints, content models and block definitions. Each expected result is normalized to
stable model/field/port coordinates, declared control IDs, binding outcomes and diagnostic code/severity/
location. Localized labels, prose and UI markup are deliberately excluded.

The profile asserts exact model ID/version/revision locking; deterministic node preorder and field authoring
order; field-ID paths including single-object nesting; exact cardinality; the portable `text` and `number`
kind aliases; collection `itemKind`; omission of authoring-hidden candidates; preservation of existing
entry-field and non-field bindings; declared authoring controls including namespaced host controls; and
fail-closed diagnostics for removed fields, changed ports/kinds/cardinality and model-coordinate drift.
Projection MUST NOT mutate any input or define model/workflow/translation policy.

`@kumwe/studio-testkit` publishes `runBindingProjectionVector` as the TypeScript reference convenience and
replays the corpus in `packages/testkit/test/binding-projection-vectors.test.ts`. A second host replays the
same JSON directly; it does not need the TypeScript runner. The corpus proves only projection semantics. It
does not claim host authorization implementation, entry writes, model-definition mutation, custom control
implementation, renderer fidelity or independent acceptance evidence.

## `studio.profile/preview-identity-v1`

The portable identity assertions a preview client, host, and renderer share under wire protocol
`0.1.0-draft.2`. The corpus ships as `vectors/preview/*.json`, conforms to
[`preview-vector.schema.json`](../../schemas/preview-vector.schema.json), and contains complete
schema-valid Blueprint drafts. Each vector fixes the lowercase SHA-256 digest of the canonical UTF-8
artifact bytes, the exact artifact/revision/digest render tuple with a session-unique attempt ID, and
the deterministic marker preorder plus one-to-one marker map.

The profile asserts the draft-digest preimage, UTF-8 handling, root order, node-before-descendant order,
UTF-16 slot-name order, child array order, empty-draft inventory, marker grammar, embedded digest,
contiguous zero-based ordinals, exact map parity, and request-level correlation shape. The TypeScript reference claim is replayed by
`packages/testkit/test/preview-vectors.test.ts`; the protocol and preview suites additionally reject
malformed, cross-draft, reordered, duplicate, incomplete, invented, and revoked inventories, plus
stale same-digest callback and measurement generations.

This narrow profile does not claim renderer visual fidelity, CSP deployment, accessibility output, or
the complete preview lifecycle; those remain part of the wider `renderer-web` assertion set. It makes
the portable identity boundary executable without overstating the wider renderer.

## `studio.profile/schema-property`

The assertions a validator must satisfy before it admits a contributed block's property schema. The
profile is intentionally narrow for the prerelease boundary: a closed object root, the published keyword
and operand grammar, bounded canonical UTF-8 size and structural complexity, same-document JSON
Pointer references, no recursion, no `format`, and no code-generating or implementation-specific
keywords.

The language-neutral corpus ships as `vectors/schema-profile/*.json` in
`@kumwe/studio-testkit` and conforms to
[`schema-profile-vector.schema.json`](../../schemas/schema-profile-vector.schema.json). An accepted
vector fixes instance verdicts and the first keyword/instance-pointer diagnostic; a rejected vector
fixes one stable admission code and schema pointer. A runtime replays the JSON directly. The public
TypeScript reference runner, `runSchemaProfileVector`, is a convenience and is not required by the
profile.

Every key in the profile meta-schema's `$defs/limits` object has exactly two corpus entries. Their
machine-readable `boundary` members identify the exact limit and exact-plus-one values, and the
contract checker refuses missing, duplicate, mislabeled, or outcome-inverted pairs. The corpus also
includes repeated acyclic-reference fan-out and simultaneous maximum schema/JSON depth so a claim
cannot hide an exponential evaluator or a smaller implementation-only depth ceiling.

The corpus is distinct from the recursive profile meta-schema. The meta-schema proves portable shape
where JSON Schema can express it; the vectors additionally prove resolution, recursion refusal,
canonical byte limits, and stable diagnostics. A profile claim must replay both accepted and rejected
vectors from a digest-verified corpus. The reference tests establish an implementation result but are
not independent acceptance evidence.

## Web profile corpus increments

The eight `conformance/renderer-web/*.json` vectors fix portable first-party renderer inputs and observable
HTML, CSS, enhancement, and fail-closed security expectations. Their machine-checked coverage is exhaustive
across all 45 canonical block types, nine progressive-behavior families, ten presentation capabilities, and
five security fallbacks. `@kumwe/studio-renderer-web` supplies the reference replay, while the browser lanes
exercise progressive behavior, CSP, reduced motion, responsive output, and accessibility. A PHP/Twig or other
host-native renderer still has to replay the same corpus, and accepted visual/accessibility/environment
evidence is still required before a release claims the profile.

`conformance/authoring-web/*.json` fixes semantic browser lanes independently of CSS selectors or a
particular component implementation. Each lane starts from a fresh Blueprint and compares the exact
document, selected/focused node, dispatched command intent, dirty state and live-region keys. The
first vector proves the portable runner and the required equivalence shape for keyboard, pointer and
explicit structural-control moves. A conforming authoring client still needs a browser adapter that
drives the real shell plus the complete interaction registry, touch, RTL, 400% zoom/reflow, reduced
motion, automated accessibility and manual assistive-technology lanes.

`renderer-web` is therefore declared and executable but unclaimed. `authoring-web` remains **Target**: its
digest-pinned runner increment is not the complete browser assertion set. Neither repository tests nor an
executable profile are by themselves a product conformance claim, Gate A/B evidence, or authority to promote
a package into RC.

### Required contextual-authoring increment

The complete `authoring-web` target MUST add an executable end-to-end journey that begins at both a core and an
extension-declared host target and proves all of the following (`STUDIO-PROD-008`, `STUDIO-PROD-009`,
`STUDIO-PROD-015`):

1. Studio is offered in the resource's normal content workflow, with no prerequisite type-creation screen,
   copy-paste, or manual reconciliation (`STUDIO-PROD-001`, `STUDIO-PROD-012`).
2. A new item can begin blank or from an existing reusable type, while an existing item hydrates its exact type
   version and Entry revision (`STUDIO-PROD-002`, `STUDIO-PROD-005`).
3. The author adds layout blocks and typed fields and enters actual values in the same coordinated session;
   extension blocks, field adapters, and patterns obey enable/disable/upgrade lifecycle rules
   (`STUDIO-PROD-003`, `STUDIO-PROD-009`).
4. Inline, minimized, maximized, and fullscreen presentations preserve the same artifact coordinates, draft,
   selection, history, dirty state, validation, and return context (`STUDIO-PROD-007`).
5. **Save item**, **save new type version**, and **save as new type** produce their distinct host-authoritative
   results and never leak Entry values into the reusable Model/Blueprint pair (`STUDIO-PROD-004`,
   `STUDIO-PROD-006`, `STUDIO-PROD-010`).
6. Pointer, keyboard, touch, focus, announcement, zoom/reflow, directionality, and assistive-technology lanes
   provide equivalent outcomes (`STUDIO-PROD-013`).
7. The production host runs the authoritative API, persistence, validation, authorization, and transactions;
   the delivered Studio UI is precompiled browser code and the production server installs or runs neither Node
   nor npm (`STUDIO-PROD-010`, `STUDIO-PROD-011`).

This journey is a required target. No such complete executable corpus or accepted evidence bundle exists in the
current repository (`STUDIO-PROD-014`).

## Claiming a profile

A claim is made against a verified corpus. `corpus-manifest.json` in `@kumwe/studio-testkit` carries
the digest of every published fixture and vector, so an implementation confirms it replayed the
contract rather than a stale or altered fork of it before making any claim.

An implementation claims a profile by replaying its assertion set and publishing the result as evidence
under the [evidence model](../roadmap/evidence.md). A claim names the profile, the exact corpus version
replayed, and the commit it was replayed at. A green run of a subset is not a claim.

## Profiles and channels

| Channel | Profile obligation                                                                                                       |
| ------- | ------------------------------------------------------------------------------------------------------------------------ |
| `beta`  | No profile claim. Contract and assertion sets may change through reviewed Changesets while product completion continues. |
| `rc`    | Every advertised profile is executable; official publication requires accepted exact-candidate evidence for all of them. |
| Stable  | Gate B qualification, which includes every advertised profile plus the host and client matrices.                         |

Moving a package from `beta` to `rc` requires all `STUDIO-PROD-001`–`015` rows to be
`repository-verified` and the complete fixed Version 2 profile set to be executable. That implementation
guard does not replace the evidence-backed profile claims required before the official `rc` channel moves.
