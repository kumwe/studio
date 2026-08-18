# @kumwe/studio-testkit

## 0.1.0-alpha.6

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

### Patch Changes

- Updated dependencies [[`b9fade8`](https://github.com/kumwe/studio/commit/b9fade8dcd35670773f696d9c9a93e9c499b480d)]:
  - @kumwe/studio-protocol@0.1.0-alpha.4
  - @kumwe/studio-core@0.1.0-alpha.6

## 0.1.0-alpha.5

### Patch Changes

- Updated dependencies [[`b1132d6`](https://github.com/kumwe/studio/commit/b1132d6c5fe040085f780102c984160638d1dd04)]:
  - @kumwe/studio-protocol@0.1.0-alpha.3
  - @kumwe/studio-core@0.1.0-alpha.5

## 0.1.0-alpha.4

### Patch Changes

- Updated dependencies [[`4bb7480`](https://github.com/kumwe/studio/commit/4bb74808bd58c31728f9643f0e11a6e0ff250f00)]:
  - @kumwe/studio-core@0.1.0-alpha.4

## 0.1.0-alpha.3

### Minor Changes

- [#13](https://github.com/kumwe/studio/pull/13) [`a2975b3`](https://github.com/kumwe/studio/commit/a2975b36300121f1826e1e2f0627e4720f4b2159) Thanks [@lemuelvdm](https://github.com/lemuelvdm)! - Close the threat enforcement registry at fourteen of fourteen and extend the canonical corpus:
  the core gains the deterministic external-URL policy hosts must apply before fetching media or
  embed sources, the testkit gains the non-disclosing external-import drill, the reference host is
  served and verified under a pinned content security policy with no unsafe-inline or unsafe-eval,
  eleven canonical media policy vectors replay against the real upload controller through the
  testkit, and the shell announces preview reload and teardown with a deterministic live-region
  queue while never touching focus.

### Patch Changes

- Updated dependencies [[`a2975b3`](https://github.com/kumwe/studio/commit/a2975b36300121f1826e1e2f0627e4720f4b2159)]:
  - @kumwe/studio-core@0.1.0-alpha.3

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
  - @kumwe/studio-core@0.1.0-alpha.2

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
  - @kumwe/studio-core@0.1.0-alpha.1
