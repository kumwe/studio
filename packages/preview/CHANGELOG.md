# @kumwe/studio-preview

## 0.1.0-beta.2

### Patch Changes

- Ship deterministic minified JavaScript in the coordinated beta.2 package layer; publication now verifies the
  packed bytes, size budget, and reproducibility before registry upload.

- Updated dependencies [[`e82d4fa`](https://github.com/kumwe/studio/commit/e82d4fa28160205db6a0b34a6955a0f7d71ccca9), [`d20928d`](https://github.com/kumwe/studio/commit/d20928d00ec4e2126122e09345b28c3861583d25)]:
  - @kumwe/studio-protocol@0.1.0-beta.2
  - @kumwe/studio-core@0.1.0-beta.2

## 0.1.0-rc.1

### Release Candidate

- Promote the reviewed coordinated package family from `0.1.0-alpha.10` to the first immutable release candidate. Runtime behavior is unchanged by this version transform.

## 0.1.0-alpha.10

### Patch Changes

- [#41](https://github.com/kumwe/studio/pull/41) [`f0a6fb8`](https://github.com/kumwe/studio/commit/f0a6fb8527846da0d5d6f204edf06159e72f2510) Thanks [@Llewellynvdm](https://github.com/Llewellynvdm)! - Bind Gate A and Gate B evidence to an exact all-gates proof registry, registered runs, checksum-retained
  artifact producers and roles, closed manual procedures, and authenticated external subjects. Human bundle,
  manual, and gate decisions now require detached SSH signatures from reviewer authorities whose registry has an
  exact checked-in structural pin and a separately matching protected release digest. RC publication is controlled
  by the exact current-main verifier/publisher and external dependency closure, with live-main checks before each
  registry or channel mutation. RC and stable promotion require the complete fixed nine-profile Version 2 claim
  set, including `authoring-web`; specialized proofs remain target-only until their real producers, Kumwe App
  grounding, and independently signed records exist.
- Updated dependencies [[`f0a6fb8`](https://github.com/kumwe/studio/commit/f0a6fb8527846da0d5d6f204edf06159e72f2510), [`c55a995`](https://github.com/kumwe/studio/commit/c55a99565aede83fff5b8097cba97d94dc2b006a)]:
  - @kumwe/studio-core@0.1.0-alpha.10
  - @kumwe/studio-protocol@0.1.0-alpha.10

## 0.1.0-alpha.9

### Minor Changes

- [#34](https://github.com/kumwe/studio/pull/34) [`2a1d3e1`](https://github.com/kumwe/studio/commit/2a1d3e1b6d88d771beca97744294ed77d237b66e) Thanks [@Llewellynvdm](https://github.com/Llewellynvdm)! - Define the Version 2 web scope and publish the eight Studio packages as one fixed, machine-verifiable release family.

### Patch Changes

- [#34](https://github.com/kumwe/studio/pull/34) [`1d2c89e`](https://github.com/kumwe/studio/commit/1d2c89eb580df1b2924681148f7688c376a7a3a5) Thanks [@Llewellynvdm](https://github.com/Llewellynvdm)! - Harden the coordinated Studio release evidence boundary with stable gate criteria, strict source and artifact verification, safe complete bundle generation, and immutable review workflows.

- [#34](https://github.com/kumwe/studio/pull/34) [`1d2c89e`](https://github.com/kumwe/studio/commit/1d2c89eb580df1b2924681148f7688c376a7a3a5) Thanks [@Llewellynvdm](https://github.com/Llewellynvdm)! - Ship deterministic, lock-derived third-party notices and exact dependency license texts in every package tarball.
- Updated dependencies [[`d82f974`](https://github.com/kumwe/studio/commit/d82f97469fc216d85b9986d17cd48f423a6fae1c), [`fbdda1e`](https://github.com/kumwe/studio/commit/fbdda1e1ece32680be6b93b993d7a8dedee98a26), [`3697049`](https://github.com/kumwe/studio/commit/36970498f532288aa7ff747f7eddcf47432abdb3), [`2a1d3e1`](https://github.com/kumwe/studio/commit/2a1d3e1b6d88d771beca97744294ed77d237b66e), [`6ca9916`](https://github.com/kumwe/studio/commit/6ca9916c06390834a4a7aa62e6f0587f29d4926e), [`1d2c89e`](https://github.com/kumwe/studio/commit/1d2c89eb580df1b2924681148f7688c376a7a3a5), [`a21706a`](https://github.com/kumwe/studio/commit/a21706a1d5bf3d790b79c46250b17d90a42f49ae), [`884bffc`](https://github.com/kumwe/studio/commit/884bffc53b27c78955f77e2e77cc3f7d6b6c778e), [`dc3119c`](https://github.com/kumwe/studio/commit/dc3119c678f3e944de913701adcc4b754b01f4e3), [`2ef0ce2`](https://github.com/kumwe/studio/commit/2ef0ce27759782a67731fcb8c6dbd1636a1eaccb), [`dcad5c8`](https://github.com/kumwe/studio/commit/dcad5c83a8b1756323e2b6890b36d68399554967), [`5786796`](https://github.com/kumwe/studio/commit/57867967fe443173eeeda209df30a796bc9c311d), [`bf09a2f`](https://github.com/kumwe/studio/commit/bf09a2f6337f22921409c4fe4e7e5e5435d40fd7), [`bda990a`](https://github.com/kumwe/studio/commit/bda990abbccaae2b1d0386279b9ffbd8d561da8f), [`1d2c89e`](https://github.com/kumwe/studio/commit/1d2c89eb580df1b2924681148f7688c376a7a3a5), [`11943aa`](https://github.com/kumwe/studio/commit/11943aac68d2c59b141a38f2e1bf323db38885b1)]:
  - @kumwe/studio-core@0.1.0-alpha.9
  - @kumwe/studio-protocol@0.1.0-alpha.9

## 0.1.0-alpha.6

### Minor Changes

- [#24](https://github.com/kumwe/studio/pull/24) [`ee13122`](https://github.com/kumwe/studio/commit/ee13122787e11c56924173790b6742231eddd3a0) Thanks [@Llewellynvdm](https://github.com/Llewellynvdm)! - Define portable preview draft identity and marker semantics for wire protocol `0.1.0-draft.2`:
  canonical artifact SHA-256 helpers, deterministic draft-scoped marker preorder, exact marker-map parity,
  inventory-safe activation and measurement, session-unique render correlation, generation-checked abort
  and disposal handling, viewport-safe geometry invalidation, a closed message vocabulary, exact
  viewport guards, validated artifact/revision/digest staging, and a published cross-runtime preview
  identity corpus.

### Patch Changes

- Updated dependencies [[`ee13122`](https://github.com/kumwe/studio/commit/ee13122787e11c56924173790b6742231eddd3a0), [`ee13122`](https://github.com/kumwe/studio/commit/ee13122787e11c56924173790b6742231eddd3a0), [`ee13122`](https://github.com/kumwe/studio/commit/ee13122787e11c56924173790b6742231eddd3a0)]:
  - @kumwe/studio-protocol@0.1.0-alpha.6
  - @kumwe/studio-core@0.1.0-alpha.8

## 0.1.0-alpha.5

### Minor Changes

- [#22](https://github.com/kumwe/studio/pull/22) [`7895dae`](https://github.com/kumwe/studio/commit/7895dae03b6ca4b44c8c10e64c1f17291ef5fd44) Thanks [@Llewellynvdm](https://github.com/Llewellynvdm)! - The preview channel's Gate A vocabulary is canonical and implemented. `studio.preview/activated` lets a
  renderer report a trusted interaction with a marked region — intent, never raw input events —
  `studio.preview/viewport` drives the surface to a semantic role or to bounded explicit dimensions as
  alternatives rather than a merge, and `studio.preview/dispose` revokes the resources held for a
  superseded draft while the channel stays open. Dispose and teardown are now explicitly distinct:
  teardown ends the session, dispose frees a superseded render within one that continues. The client
  gains `onActivated`, `setViewport` and `disposeDraft`; the host gains `announceActivation`,
  `onViewport` and `onDispose`; and the canonical guard and schema refuse an invented interaction, an
  out-of-bounds dimension, a role-and-dimensions merge, and a malformed digest.

### Patch Changes

- Updated dependencies [[`51e0423`](https://github.com/kumwe/studio/commit/51e0423c857840367e1d18f598665fd228a7a4b7), [`85bb979`](https://github.com/kumwe/studio/commit/85bb9795c49a75070e52169eb82a27c7613ffab1), [`abe6baf`](https://github.com/kumwe/studio/commit/abe6baf6fcfb7ec5df7425b69d34136c4b51f157), [`9f4f95e`](https://github.com/kumwe/studio/commit/9f4f95e208dceca97046af8d1f18c113ff95746e), [`3f89d04`](https://github.com/kumwe/studio/commit/3f89d0446cb8c02fb3cc15e0fe2fd3ae79351004), [`87eb8bf`](https://github.com/kumwe/studio/commit/87eb8bf7a944ee1ca682cf5085456c2e89a967e2), [`7895dae`](https://github.com/kumwe/studio/commit/7895dae03b6ca4b44c8c10e64c1f17291ef5fd44)]:
  - @kumwe/studio-protocol@0.1.0-alpha.5

## 0.1.0-alpha.4

### Patch Changes

- Updated dependencies [[`b9fade8`](https://github.com/kumwe/studio/commit/b9fade8dcd35670773f696d9c9a93e9c499b480d)]:
  - @kumwe/studio-protocol@0.1.0-alpha.4

## 0.1.0-alpha.3

### Patch Changes

- Updated dependencies [[`b1132d6`](https://github.com/kumwe/studio/commit/b1132d6c5fe040085f780102c984160638d1dd04)]:
  - @kumwe/studio-protocol@0.1.0-alpha.3

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

### Patch Changes

- Updated dependencies [[`084dc0b`](https://github.com/kumwe/studio/commit/084dc0bd7248264a50728c6f38d06eb7c6dc6a8e)]:
  - @kumwe/studio-protocol@0.1.0-alpha.2

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

### Patch Changes

- Updated dependencies [[`73fdadd`](https://github.com/kumwe/studio/commit/73fdadd44e31e101e12788f00417b6c259c77afd)]:
  - @kumwe/studio-protocol@0.1.0-alpha.1
