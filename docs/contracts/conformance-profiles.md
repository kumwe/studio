# Conformance profiles

## Purpose

A conformance profile is a named, versioned set of assertions an implementation must satisfy before it
may claim that profile. Profiles exist so that "conforming" and "feature-complete" are measurable
rather than asserted: a claim is a corpus an implementation replays, not a paragraph it agrees with.

The [compatibility contract](../governance/compatibility.md) records the conformance-profile version as
its own axis — independent of document contract revision, wire protocol version, and package version.
The [release policy](../governance/releases.md) binds channels to profiles: the `beta` channel means a
feature-complete candidate **for a declared profile**, so a profile must be declared and executable
before any package may leave `alpha`.

## Profile identity

A profile is identified by a qualified name in the `studio.profile` namespace and carries the exact
assertion set required to claim it. Adding an assertion to an existing profile is a breaking change to
that profile; a widened assertion set is published as a new profile name. A profile never weakens: an
implementation that claimed a profile keeps claiming it for the version it passed.

## Declared profiles

| Profile                              | Claimed by                        | Executable assertion set                                      | State                |
| ------------------------------------ | --------------------------------- | ------------------------------------------------------------- | -------------------- |
| `studio.profile/host-baseline`       | A host adapter                    | `vectors/host/` replayed through the adapter                  | Declared, executable |
| `studio.profile/host-baseline-v2`    | A host adapter                    | `host-baseline` plus `vectors/host-sequence/`                 | Declared, executable |
| `studio.profile/engine-core`         | A protocol engine                 | `vectors/command/` and `vectors/canonical/`                   | Declared, executable |
| `studio.profile/media-policy`        | A host media pipeline             | `vectors/media/`                                              | Declared, executable |
| `studio.profile/preview-identity-v1` | A preview client/host             | `vectors/preview/`                                            | Declared, executable |
| `studio.profile/schema-property`     | A property-schema validator       | `vectors/schema-profile/`                                     | Declared, executable |
| `studio.profile/renderer-web`        | A trusted renderer                | `conformance/rich-text/` and the preview channel obligations  | Target               |
| `studio.profile/authoring-web`       | An authoring client               | The interaction requirement registry and accessibility lanes  | Target               |
| `studio.profile/engine-dart`         | A Dart protocol engine            | Version 3 canonical, command, migration, and host-port replay | Version 3 target     |
| `studio.profile/renderer-flutter`    | A native Flutter renderer         | Version 3 block, theme, preview, and accessibility assertions | Version 3 target     |
| `studio.profile/authoring-flutter`   | A native Flutter authoring client | Version 3 interaction and accessibility assertions            | Version 3 target     |

The Version 2 qualification target comprises the six declared executable profiles plus
`renderer-web` and `authoring-web` when their assertion sets become executable. The three Dart/Flutter
profiles are Version 3 targets and do not block Version 2. A target row is not a support or conformance
claim; the current release record claims no profiles.

A profile marked **Target** is named so that consumers can see the intended boundary. It is not
claimable: its assertion set is not yet executable, and no implementation may advertise it.

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
the complete preview lifecycle; those remain part of the target `renderer-web` assertion set. It makes
the portable identity boundary executable without overstating the wider renderer.

## `studio.profile/schema-property`

The assertions a validator must satisfy before it admits a contributed block's property schema. The
profile is intentionally narrow for the alpha boundary: a closed object root, the published keyword
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

## Claiming a profile

A claim is made against a verified corpus. `corpus-manifest.json` in `@kumwe/studio-testkit` carries
the digest of every published fixture and vector, so an implementation confirms it replayed the
contract rather than a stale or altered fork of it before making any claim.

An implementation claims a profile by replaying its assertion set and publishing the result as evidence
under the [evidence model](../roadmap/evidence.md). A claim names the profile, the exact corpus version
replayed, and the commit it was replayed at. A green run of a subset is not a claim.

## Profiles and channels

| Channel | Profile obligation                                                                               |
| ------- | ------------------------------------------------------------------------------------------------ |
| `alpha` | No profile claim. Contract and assertion sets may change with a changeset.                       |
| `beta`  | Feature-complete against at least one declared, executable profile, claimed with evidence.       |
| `rc`    | Every profile the release advertises is claimed at the exact candidate commit.                   |
| Stable  | Gate B qualification, which includes every advertised profile plus the host and client matrices. |

Moving a package from `alpha` to `beta` therefore requires a declared profile it is feature-complete
against, an evidence-backed claim, and acceptance that further contract changes are release blockers
rather than routine changesets.
