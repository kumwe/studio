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

| Profile                        | Claimed by            | Executable assertion set                                     | State                |
| ------------------------------ | --------------------- | ------------------------------------------------------------ | -------------------- |
| `studio.profile/host-baseline` | A host adapter        | `vectors/host/` replayed through the adapter                 | Declared, executable |
| `studio.profile/engine-core`   | A protocol engine     | `vectors/command/` and `vectors/canonical/`                  | Declared, executable |
| `studio.profile/media-policy`  | A host media pipeline | `vectors/media/`                                             | Declared, executable |
| `studio.profile/renderer-web`  | A trusted renderer    | `conformance/rich-text/` and the preview channel obligations | Target               |
| `studio.profile/authoring-web` | An authoring client   | The interaction requirement registry and accessibility lanes | Target               |

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
  expressible in the current vector shape; closing this needs a sequence-carrying vector kind.
- **Rate limiting and cancellation.** `rate-limited` and `cancelled` are declared categories with no
  reproducible precondition a single exchange can state — a rate limit needs a request count and a
  cancellation needs an in-flight request to cancel.

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
