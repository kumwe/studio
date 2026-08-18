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
| `studio.profile/engine-core`   | A protocol engine     | `vectors/command/` and the canonical serialization rules     | Declared, executable |
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
- **Authority.** A withheld operation is explained as disallowed rather than silently succeeding, and
  refreshing authority answers with the held permissions and the live session generation.
- **Telemetry discipline.** Primitive-only attributes are accepted; a non-primitive attribute is
  refused, keeping the cardinality discipline enforceable.

The TypeScript reference host in `@kumwe/studio-testkit` claims this profile, proven by
`packages/testkit/test/host-vectors.test.ts`.

### Recorded limitations

These are obligations the host contract states that the baseline corpus does not yet assert. They are
recorded rather than implied, and a host must still satisfy them:

- **Artifact-level authorization.** The contract requires every mutation to be authenticated and
  authorized. The reference host models authority through the permission port rather than rejecting
  unauthorized artifact writes, so no vector yet fixes `forbidden` or `unauthenticated` on the artifact
  port. A production host rejects them; the corpus does not yet prove it.
- **Idempotent replay.** The envelope carries an idempotency key and the contract requires retryable
  mutations to be idempotent. No vector yet replays the same key twice against a mutation.
- **Rate limiting and cancellation.** `rate-limited` and `cancelled` are declared categories with no
  reproducible precondition in the corpus.

## Claiming a profile

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
