# @kumwe/studio-rich-text

## 0.1.0-alpha.6

### Patch Changes

- Updated dependencies [[`ee13122`](https://github.com/kumwe/studio/commit/ee13122787e11c56924173790b6742231eddd3a0), [`ee13122`](https://github.com/kumwe/studio/commit/ee13122787e11c56924173790b6742231eddd3a0), [`ee13122`](https://github.com/kumwe/studio/commit/ee13122787e11c56924173790b6742231eddd3a0)]:
  - @kumwe/studio-protocol@0.1.0-alpha.6

## 0.1.0-alpha.5

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
