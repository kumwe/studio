# @kumwe/studio-protocol

## 0.1.0-alpha.5

### Minor Changes

- [#22](https://github.com/kumwe/studio/pull/22) [`51e0423`](https://github.com/kumwe/studio/commit/51e0423c857840367e1d18f598665fd228a7a4b7) Thanks [@Llewellynvdm](https://github.com/Llewellynvdm)! - Canonical serialization becomes an executable corpus. `canonical-vector.schema.json` and the twelve
  vectors published as `vectors/canonical/` in `@kumwe/studio-testkit` fix member ordering by code unit,
  minimal escaping, the number grammar including negative-zero canonicalization, UTF-8 emission of
  non-ASCII and astral text, the depth bound, and the forbidden member names — each with the exact
  canonical string and the SRI-style digest of its bytes. Every checksum in the contract is computed over
  exactly those bytes, so an implementation reproducing the corpus computes the same digests as every
  other, which is what makes a vendored-corpus integrity check and a stored-document round-trip
  comparable across languages. The expectations were produced by an independent canonicalizer rather
  than recorded from the reference, so the reference replaying them is a genuine cross-implementation
  check.

- [#22](https://github.com/kumwe/studio/pull/22) [`85bb979`](https://github.com/kumwe/studio/commit/85bb9795c49a75070e52169eb82a27c7613ffab1) Thanks [@Llewellynvdm](https://github.com/Llewellynvdm)! - The published corpus becomes verifiable. `corpus-manifest.json` ships in `@kumwe/studio-testkit`
  carrying the sha256 digest of all 178 files across the seven corpus groups — fixtures, command, media,
  host and canonical vectors, negative fixtures and renderer conformance — with
  `corpus-manifest.schema.json` fixing its shape. A host that vendors the corpus verifies its copy
  against the manifest, so a stale or altered fixture is detected before it silently changes what a
  conformance claim means. The contracts lane regenerates and verifies the manifest, so it cannot drift
  from what actually ships.

- [#22](https://github.com/kumwe/studio/pull/22) [`abe6baf`](https://github.com/kumwe/studio/commit/abe6baf6fcfb7ec5df7425b69d34136c4b51f157) Thanks [@Llewellynvdm](https://github.com/Llewellynvdm)! - Conformance profiles become named, versioned, and executable. `studio.profile/host-baseline` is
  declared first and ships its assertion set as a new canonical vector kind: `host-vector.schema.json`
  with the corpus published as `vectors/host/` in `@kumwe/studio-testkit`. Each vector fixes reproducible
  host state, the request envelope and argument, and the required outcome — an accepted result with its
  revision behaviour, or one category of the closed error taxonomy with its retry classification and
  non-disclosure obligations — so a host adapter in any language proves persistence, optimistic
  concurrency, envelope negotiation, bounded queries, absence handling, authority and telemetry
  discipline without executing Studio code. The reference host claims the profile by replaying the
  corpus. Profiles bind to release channels: `beta` now means feature-complete against a declared,
  executable profile, claimed with evidence.

- [#22](https://github.com/kumwe/studio/pull/22) [`9f4f95e`](https://github.com/kumwe/studio/commit/9f4f95e208dceca97046af8d1f18c113ff95746e) Thanks [@Llewellynvdm](https://github.com/Llewellynvdm)! - The host transport boundary is published rather than implied. A closed operation registry
  (`host-operations.schema.json`) binds every port operation's three names — the typed method, the route
  segment, and the capability identifier — one to one, and the capability document's port and operation
  vocabularies now reference it, so a host can no longer advertise an operation that is not on the wire.
  The request and result envelopes gain canonical schemas (`host-request.schema.json`,
  `host-result.schema.json`), and the HTTP binding — route scheme, body shapes, and the bidirectional
  category-to-status table — becomes the normative `docs/contracts/host-transport.md` instead of a comment
  inside a test helper. A drift guard asserts the registry still covers exactly the typed port surface.

- [#22](https://github.com/kumwe/studio/pull/22) [`3f89d04`](https://github.com/kumwe/studio/commit/3f89d0446cb8c02fb3cc15e0fe2fd3ae79351004) Thanks [@Llewellynvdm](https://github.com/Llewellynvdm)! - The last two declaration kinds a host freezes against gain canonical payload schemas.
  `inspector.schema.json` declares the block types a contributed panel applies to and whether it augments
  or replaces the built-in inspector for them; `field-adapter.schema.json` declares the control
  identifier a field's authoring metadata names, the field kinds it accepts, and the bounded option
  schema an author configures it through. Both declare the capability their executable half requires, so
  a declaration without one is inspectable but never executed. Every contribution kind a downstream Gate
  A freeze names is now validated against a published schema rather than a paraphrase.

- [#22](https://github.com/kumwe/studio/pull/22) [`87eb8bf`](https://github.com/kumwe/studio/commit/87eb8bf7a944ee1ca682cf5085456c2e89a967e2) Thanks [@Llewellynvdm](https://github.com/Llewellynvdm)! - The media port gains its upload lifecycle. `authorize-upload`, `complete-upload`, `abort-upload`,
  `upload-status` and `import-external` join `get` and `list`, so a host has operations to implement
  where the contract previously described a lifecycle the wire could not express. Bytes never cross the
  JSON port: `authorize-upload` applies host policy before any byte moves and returns a short-lived,
  bounded grant naming an https destination the host controls, and the client transfers directly to it.
  The host verifies what it received rather than trusting a declared media type, so an accepted asset may
  still be processing or quarantined. Seven conformance vectors fix the authorization, completion,
  abortion, status and external-import behaviour, including refusal of an oversized upload, a filename
  carrying a path separator, and an external candidate resolving to a private address.

- [#22](https://github.com/kumwe/studio/pull/22) [`7895dae`](https://github.com/kumwe/studio/commit/7895dae03b6ca4b44c8c10e64c1f17291ef5fd44) Thanks [@Llewellynvdm](https://github.com/Llewellynvdm)! - The preview channel's Gate A vocabulary is canonical and implemented. `studio.preview/activated` lets a
  renderer report a trusted interaction with a marked region — intent, never raw input events —
  `studio.preview/viewport` drives the surface to a semantic role or to bounded explicit dimensions as
  alternatives rather than a merge, and `studio.preview/dispose` revokes the resources held for a
  superseded draft while the channel stays open. Dispose and teardown are now explicitly distinct:
  teardown ends the session, dispose frees a superseded render within one that continues. The client
  gains `onActivated`, `setViewport` and `disposeDraft`; the host gains `announceActivation`,
  `onViewport` and `onDispose`; and the canonical guard and schema refuse an invented interaction, an
  out-of-bounds dimension, a role-and-dimensions merge, and a malformed digest.

## 0.1.0-alpha.4

### Minor Changes

- [#20](https://github.com/kumwe/studio/pull/20) [`b9fade8`](https://github.com/kumwe/studio/commit/b9fade8dcd35670773f696d9c9a93e9c499b480d) Thanks [@Llewellynvdm](https://github.com/Llewellynvdm)! - The declaration surface a host freezes against is now complete and portable. The plugin manifest
  accepts `design-vocabulary` and `migration` contribution kinds, each backed by a canonical schema
  (`design-vocabulary.schema.json`, `migration.schema.json`) with wire types, examples, and negative
  fixtures, so a host validates every composition declaration kind against a published schema instead
  of a paraphrase. The command-vector schema carries an optional session `mode` with the
  `mode-forbidden` expectation, and a mode-boundary corpus replays the editing-mode permission matrix
  and the hybrid composition bounds through the session. The Blueprint authoring policy gains the
  per-slot composition marker: a named slot may be declared composable on its own, bounded by
  slot-level allowed blocks, and the hybrid gate enforces it.

## 0.1.0-alpha.3

### Minor Changes

- [#17](https://github.com/kumwe/studio/pull/17) [`b1132d6`](https://github.com/kumwe/studio/commit/b1132d6c5fe040085f780102c984160638d1dd04) Thanks [@lemuelvdm](https://github.com/lemuelvdm)! - Publish the size-role command vocabulary in the wire types: the axis union, the set and unset
  payloads and commands, and the reserved node members for base assignments and responsive
  overrides, completing the Gate A command surface in the protocol projection.

## 0.1.0-alpha.2

### Minor Changes

- [#9](https://github.com/kumwe/studio/pull/9) [`084dc0b`](https://github.com/kumwe/studio/commit/084dc0bd7248264a50728c6f38d06eb7c6dc6a8e) Thanks [@lemuelvdm](https://github.com/lemuelvdm)! - Resolve the last open Gate A command-vocabulary items and extend the executable contract surface:
  promote `restore-node` to a first-class batchable command with full-subtree duplicate validation
  (now also enforced for `insert-node`), add the top-level `reset-inherited-property` command whose
  inverse is a sorted batch of viewport-scoped `set-property` operations, add the preview marker
  geometry and measurement channel with digest-bound stale handling, publish the rich-text renderer
  conformance projection corpus through the testkit, make the inspector a keyboard-complete editor
  with conflict-survival announcements, and enforce changesets plus an automated accessibility lane
  in the delivery controls.

## 0.1.0-alpha.1

### Minor Changes

- [#6](https://github.com/kumwe/studio/pull/6) [`73fdadd`](https://github.com/kumwe/studio/commit/73fdadd44e31e101e12788f00417b6c259c77afd) Thanks [@lemuelvdm](https://github.com/lemuelvdm)! - First implementation wave of the Gate A foundation: the canonical command vocabulary with 29
  published command vectors and computed inverse commands, canonical minimal document form and
  cross-language serialization, the deterministic editing session with selection and fail-closed
  guards, the owner-aware contribution runtime with immutable registry generations, fail-closed
  capability negotiation, the preview host responder and ready handshake, typed host ports with the
  stable error taxonomy, the portable rich-text grammar, the media upload-session lifecycle and
  crop semantics, the negative-fixture corpus, the schema digest manifest, the accessible outline
  with full keyboard parity and host-overridable localization, and the deterministic in-memory host
  testbed. All packages remain pre-Gate-A alpha; contracts stay `0.1-draft`.
