# @kumwe/studio-testkit

## 0.1.0-beta.11

### Patch Changes

- [#75](https://github.com/kumwe/studio/pull/75) [`ebd7f89`](https://github.com/kumwe/studio/commit/ebd7f89a22b0dff56052e79948c654b7399c34af) Thanks [@Llewellynvdm](https://github.com/Llewellynvdm)! - Give a host-extended core layout family its own derived revision and let an authoring target supply the
  family's options. `createCoreLayoutBlockDefinitions` now stamps `layout-<name>-h<16 hex>` derived from the
  canonical bytes of the built family without its revision, and rejects more than 64 listed types (layout types
  included), duplicates, and reserved `studio.*` types other than the layout family; the production catalog keeps
  its published `layout-<name>-r1` bytes. The authoring-target schema gains the optional `coreLayout` member,
  whose entries are layout types or names outside the reserved `studio.*` namespace (protocol models regenerated;
  the testkit fixture and negative-fixture copies move with it). Hosted Studio replaces the four production layout
  definitions with the target's family, requires every listed host type to be a resolved required block-definition
  dependency of the target, and leaves exact lock matching unchanged. See ADR 0038.

- [#75](https://github.com/kumwe/studio/pull/75) [`c5d4cc7`](https://github.com/kumwe/studio/commit/c5d4cc7c226b6b6da6508bcde6e0456f7125080b) Thanks [@Llewellynvdm](https://github.com/Llewellynvdm)! - Compose the Blueprint workspace as one narrow structure-and-details column beside a full-height page. The
  Outline leads the left column and opens the block palette through an `Add blocks` disclosure (open by default
  on an empty document); the Inspector and the docked Model and Content panels sit beneath it; the page fills
  the right column under a sticky toolbar with the local-canvas caption kept visible as a slim strip at the
  top of the page column. Hovering a rendered block highlights its Outline entry and hovering or focusing an
  entry marks the block on the page with distinct indicators; a single click on the page selects the block and
  reveals its entry without moving focus to a control, while double-click, Enter and F2 still focus its first
  control. Host previews stay pointer-inert in operate mode: hover derives from accepted measurements through
  the shell's own stage, selection stays the renderer's activation report, and dragging still requires the
  edit control, which now sits in the page toolbar. The reference host anchors its measured surface at the stage's start edge so overlay rectangles
  align. A hosted local canvas opens at its desktop width on wide screens when the host sets no initial
  viewport, as the standalone host already does; the base viewport, and therefore where responsive edits are
  written, is unchanged. No protocol, schema or host-adapter shape changes; the English authoring catalog gains
  `studio.shell/add-blocks-toggle` (catalog 1.9.0; the testkit fixture copy moves with it).

- [#75](https://github.com/kumwe/studio/pull/75) [`98cdf61`](https://github.com/kumwe/studio/commit/98cdf61f72dafe79579884bd7a39b12dbd8c00de) Thanks [@Llewellynvdm](https://github.com/Llewellynvdm)! - Every add control of the Blueprint workspace now names its destination. `Add to page` ends the page level
  (also on a blank document), `Add block into {slot}` ends each declared slot of an opened level and is offered
  for each declared slot under a selected container, `Add block before` and `Add block after` sit under the
  selected row, the empty page is a dashed zone with its own `Add to page`, and every empty container that may
  receive a block is offered by a visible `Empty containers` list of `Add block into {slot} of {parent} ({id})`
  buttons under the page; an empty slot of a pure container also shows a dashed band on the page (always on the
  local canvas, in edit mode on a host preview) whose centred `+` disc alone takes the pointer, so the container
  stays selectable and draggable there. Each control is disabled where no active block may go; otherwise it
  opens the `Add blocks` layer with `Adding to {collection}, position n of m` in its header and focuses the
  search field, which that line describes. Blocks, command-palette inserts and patterns the destination refuses
  are disabled rather than redirected. `Escape` in the layer (outside a search field that has text), a changed
  selection (the author's, or a host's through `selectNode()`), closing the layer, leaving the structure view or
  any change to the destination's own collection (a move, an undo or redo, a removal) clears the destination,
  so a stored position never inserts anywhere the `+` did not name. The cancelable
  `studio-insert-request` detail gains an optional `position`, which the shell always sets, and, for composite
  insertions, `operations`; the standalone and reference hosts clamp `position` into the collection and execute
  `operations` as one batch, and a host that ignores them keeps end-of-slot placement. `2 columns`, `3 columns`
  and `4 columns` cards (and command palette entries) insert a `studio.core/columns` block with that many
  `studio.core/stack` children as one batch and one undo step through the new `planColumnsInsertion` helper of
  `@kumwe/studio-core` (whose optional `stackVersion` names the stack definition's own version), and the
  structure rows of those stacks read `Stack, column n of N`. No wire, schema or renderer change; the English
  authoring catalog gains `studio.shell/add-block-after`, `studio.shell/add-block-before`,
  `studio.shell/add-block-into`, `studio.shell/add-columns`, `studio.shell/add-destination`,
  `studio.shell/add-to-page`, `studio.shell/canvas-add-into`, `studio.shell/canvas-add-zones` and
  `studio.shell/outline-column-of` (catalog 1.11.0; the testkit fixture copy moves with it). The standalone
  and reference hosts now select the block they inserted (the columns block for a column card) through
  `selectNode()`. When a host inserts synchronously, the shell completes that insertion as it does its own: the
  one block the host added is selected, its row takes focus, the insertion is announced once by name and a
  narrow layout returns to the canvas sheet. A press on a page block that has nowhere to move opens the details
  view like any other page click.

  `@kumwe/studio-protocol` ships its copy of the release record (`studio-release.json`), whose corpus manifest
  digest moves because the authoring catalog fixture in the corpus changed.

  The authoring browser module's release budget rises from 1,048,576 to 1,114,112 bytes by the maintainer's
  release-policy decision, so a consumer that bounds Studio package-file reads at 1,048,576 bytes must raise
  that bound when it re-pins.

- [#75](https://github.com/kumwe/studio/pull/75) [`3fd4187`](https://github.com/kumwe/studio/commit/3fd4187d43a03b6dfc628c9ee68438dadf1fb301) Thanks [@Llewellynvdm](https://github.com/Llewellynvdm)! - The Blueprint workspace's left column now navigates in layers. The structure view opens with the whole page
  tree and can open one container at a time into its own level under a header that names the parent (`Back to
Page`, `Back to {parent}`, `Show whole tree`); the details view shows the selected block's inspector sections
  and the docked Model and Content panels under a `Back` control and the selection path, which moves from the
  page column into that header (in the contextual Content and Model modes the docked panel is the details view
  and the `Blueprint` tab returns, so no `Back` is rendered there). A single click on a rendered block opens
  the details view without moving focus; `Edit` and `Open` under the selected entry, `Arrow Right`, `Enter`,
  `F2` and double-click are the other ways in, and `Back`, `Arrow Left` and `Escape` return with focus placed
  on a visible control. Each layer change, and a new block shown in the details view, is announced once; hover
  is not. Layers change visibility only, so
  imperatively mounted authoring controls keep their holder elements. Narrow sheets are unchanged (`Outline`
  and `Inspector` are the two layers). No protocol, schema or host-adapter shape changes; the English authoring
  catalog gains `studio.shell/announce-panel-layer`, `studio.shell/outline-edit`, `studio.shell/outline-open`,
  `studio.shell/outline-whole-tree`, `studio.shell/panel-back`, `studio.shell/panel-back-to` and
  `studio.shell/panel-page`, and extends `studio.shell/outline-hint` (catalog 1.10.0; the testkit fixture copy
  moves with it). The release-asset builders (`scripts/studio-browser-artifacts.mjs`,
  `scripts/studio-enhancement-artifacts.mjs`, `scripts/build-standalone-static-host.mjs`) pin the bundler to
  production bytes for the duration of each build regardless of the invoking process's `NODE_ENV`, so the
  static-delivery budget test measures the bytes a release ships.
- Updated dependencies [[`ebd7f89`](https://github.com/kumwe/studio/commit/ebd7f89a22b0dff56052e79948c654b7399c34af), [`98cdf61`](https://github.com/kumwe/studio/commit/98cdf61f72dafe79579884bd7a39b12dbd8c00de)]:
  - @kumwe/studio-protocol@0.1.0-beta.11
  - @kumwe/studio-core@0.1.0-beta.11

## 0.1.0-beta.10

### Patch Changes

- Updated dependencies [[`c9093f1`](https://github.com/kumwe/studio/commit/c9093f17ae0158520db3cd6a810199a39c27cd61)]:
  - @kumwe/studio-protocol@0.1.0-beta.10
  - @kumwe/studio-core@0.1.0-beta.10

## 0.1.0-beta.9

### Patch Changes

- Updated dependencies []:
  - @kumwe/studio-core@0.1.0-beta.9
  - @kumwe/studio-protocol@0.1.0-beta.9

## 0.1.0-beta.8

### Patch Changes

- Updated dependencies []:
  - @kumwe/studio-core@0.1.0-beta.8
  - @kumwe/studio-protocol@0.1.0-beta.8

## 0.1.0-beta.7

### Patch Changes

- [#68](https://github.com/kumwe/studio/pull/68) [`130cb5f`](https://github.com/kumwe/studio/commit/130cb5f61981bc069b74f73be021b8f7bdbd9465) Thanks [@Llewellynvdm](https://github.com/Llewellynvdm)! - Apply one per-mount message catalog to the hosted start chooser, contextual editor, and save confirmation.
  Publish the confirmation labels as translatable messages while preserving host-authored consequences and
  isolating each mount's overrides.
- Updated dependencies [[`214b2cc`](https://github.com/kumwe/studio/commit/214b2cc533031cbc315dd039204cca2550a3f859), [`130cb5f`](https://github.com/kumwe/studio/commit/130cb5f61981bc069b74f73be021b8f7bdbd9465)]:
  - @kumwe/studio-core@0.1.0-beta.7
  - @kumwe/studio-protocol@0.1.0-beta.7

## 0.1.0-beta.6

### Patch Changes

- [#62](https://github.com/kumwe/studio/pull/62) [`6420d43`](https://github.com/kumwe/studio/commit/6420d43de9e8e7a25702d66dc4fa70910402e0dc) Thanks [@Llewellynvdm](https://github.com/Llewellynvdm)! - Carry block-palette entries onto the measured canvas and drop them through the canonical insert-node command at a geometry-ranked valid destination, with Escape and pointercancel as no-ops and a palette-click plus outline-destination path to the identical placement. Activate a rendered block by double-click or Enter/F2 to focus its typed inspector control. Render the isolated local canvas for hosted sessions that declare no host preview, using the renderer's responsive widths, without changing routes, admission, or authority. Make the command palette a workspace-level layer reachable from every narrow-screen pane, and publish the insertion status message.

- [#62](https://github.com/kumwe/studio/pull/62) [`b08774d`](https://github.com/kumwe/studio/commit/b08774df3038bc844afc183d69842607ccacd6b1) Thanks [@Llewellynvdm](https://github.com/Llewellynvdm)! - Render an isolated, responsive local page canvas in public standalone mounts using the canonical web renderer. Preserve Entry bindings, selection, independent lifecycle and restrictive CSP without host or runtime network requirements. Make ordinary palette clicks perform canonical insertion when no host listener handles them, with cancellation and synchronous adapter compatibility. Publish the corresponding local-rendering status messages.
- Updated dependencies [[`6420d43`](https://github.com/kumwe/studio/commit/6420d43de9e8e7a25702d66dc4fa70910402e0dc), [`b08774d`](https://github.com/kumwe/studio/commit/b08774df3038bc844afc183d69842607ccacd6b1)]:
  - @kumwe/studio-protocol@0.1.0-beta.6
  - @kumwe/studio-core@0.1.0-beta.6

## 0.1.0-beta.5

### Patch Changes

- [#60](https://github.com/kumwe/studio/pull/60) [`f248f0f`](https://github.com/kumwe/studio/commit/f248f0f2bb37a452133ef7ec8bf208e80e42f09b) Thanks [@Llewellynvdm](https://github.com/Llewellynvdm)! - Document live beta versions, current installation and the continuing host integration contract in each
  published package README. Preserve the exact coordinated release pins, runtime contracts, profile claims
  and qualification requirements.
- Updated dependencies [[`f248f0f`](https://github.com/kumwe/studio/commit/f248f0f2bb37a452133ef7ec8bf208e80e42f09b)]:
  - @kumwe/studio-core@0.1.0-beta.5
  - @kumwe/studio-protocol@0.1.0-beta.5

## 0.1.0-beta.4

### Patch Changes

- [#55](https://github.com/kumwe/studio/pull/55) [`30c2f82`](https://github.com/kumwe/studio/commit/30c2f8246a346da554bb974842fbc71dde2685b4) Thanks [@Llewellynvdm](https://github.com/Llewellynvdm)! - Refuse malformed upload plans before transferring bytes and inspect Mermaid SVG root attributes alongside
  descendants. Add package-owned regressions for these boundaries and Testkit's public conformance error,
  and document executable test ownership across all eight packages.
- Updated dependencies []:
  - @kumwe/studio-core@0.1.0-beta.4
  - @kumwe/studio-protocol@0.1.0-beta.4

## 0.1.0-beta.3

### Patch Changes

- Updated dependencies []:
  - @kumwe/studio-core@0.1.0-beta.3
  - @kumwe/studio-protocol@0.1.0-beta.3

## 0.1.0-beta.2

### Minor Changes

- Publish the PHP-replayable deployment, authoring transport, successor-context, renderer-web, rich-text, and
  eight-family interactive-behavior vectors behind the coordinated corpus manifest. Digest-pinned realization
  layers can verify the complete beta.2 contract without executing Studio TypeScript.

- [#48](https://github.com/kumwe/studio/pull/48) [`f78b000`](https://github.com/kumwe/studio/commit/f78b00006a58222f2b28621fc5c5d963e2f865f4) Thanks [@Llewellynvdm](https://github.com/Llewellynvdm)! - Add the fixture-driven contextual authoring host port and HTTP mapping, plus a selector-neutral first-stride
  runner for exact launches, coordinated Model/Blueprint/Entry commands, and host-authoritative save boundaries.
  The runner explicitly remains partial and does not make a complete authoring-web conformance claim.

### Patch Changes

- Updated dependencies [[`e82d4fa`](https://github.com/kumwe/studio/commit/e82d4fa28160205db6a0b34a6955a0f7d71ccca9), [`d20928d`](https://github.com/kumwe/studio/commit/d20928d00ec4e2126122e09345b28c3861583d25)]:
  - @kumwe/studio-protocol@0.1.0-beta.2
  - @kumwe/studio-core@0.1.0-beta.2

## 0.1.0-rc.1

### Release Candidate

- Promote the reviewed coordinated package family from `0.1.0-alpha.10` to the first immutable release candidate. Runtime behavior is unchanged by this version transform.

## 0.1.0-alpha.10

### Patch Changes

- [#38](https://github.com/kumwe/studio/pull/38) [`dadb69a`](https://github.com/kumwe/studio/commit/dadb69a904ef774e974fc614832c5b6b01d1f6f1) Thanks [@Llewellynvdm](https://github.com/Llewellynvdm)! - Preserve every governed rich-text node through first-party editing, render the complete portable rich-text contract, and make scoped CSS plus trusted enhancement output collision-free and deterministic. Extend the portable renderer corpus to cover the advanced first-party rich-text projection.

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

- [#34](https://github.com/kumwe/studio/pull/34) [`fbdda1e`](https://github.com/kumwe/studio/commit/fbdda1e1ece32680be6b93b993d7a8dedee98a26) Thanks [@Llewellynvdm](https://github.com/Llewellynvdm)! - Add the bounded headless Blueprint host-session composition. `openStudioSession` now consumes a
  resolved single-composition Blueprint configuration and deterministic identifier factories,
  negotiates and loads the configured Blueprint, then returns a handle with serialized/coalesced
  optimistic saves, exact-intent idempotency retry, raw optional recovery access, stale-generation
  invalidation, and local idempotent disposal. The protocol publishes `HostPortFailure`, its guard, and
  the stable `studio.host/stale-session-generation` diagnostic; the deterministic testbed uses that
  public failure surface.

- [#34](https://github.com/kumwe/studio/pull/34) [`2a1d3e1`](https://github.com/kumwe/studio/commit/2a1d3e1b6d88d771beca97744294ed77d237b66e) Thanks [@Llewellynvdm](https://github.com/Llewellynvdm)! - Define the Version 2 web scope and publish the eight Studio packages as one fixed, machine-verifiable release family.

- [#34](https://github.com/kumwe/studio/pull/34) [`dc3119c`](https://github.com/kumwe/studio/commit/dc3119c678f3e944de913701adcc4b754b01f4e3) Thanks [@Llewellynvdm](https://github.com/Llewellynvdm)! - Publish the portable authoring-web interaction vector schema, digest-pinned corpus, and implementation-neutral lane runner for keyboard, pointer, and explicit structural-control parity.

- [#34](https://github.com/kumwe/studio/pull/34) [`dcad5c8`](https://github.com/kumwe/studio/commit/dcad5c83a8b1756323e2b6890b36d68399554967) Thanks [@Llewellynvdm](https://github.com/Llewellynvdm)! - Publish the versioned, machine-readable English authoring message catalog, derive the shell's typed
  message keys from it, and verify catalog copies, keys, and named parameters as part of the contract
  gate.

- [#34](https://github.com/kumwe/studio/pull/34) [`5786796`](https://github.com/kumwe/studio/commit/57867967fe443173eeeda209df30a796bc9c311d) Thanks [@Llewellynvdm](https://github.com/Llewellynvdm)! - Add read-only model `list`/`get` to the public Blueprint host-session seam; immutable exact-coordinate
  field-binding projection with stable diagnostics; model-driven shell selectors that preserve each field's
  declared authoring control; and a portable binding-projection schema, corpus, reference runner, host vectors,
  HTTP mapping, and reference-host example.

### Patch Changes

- [#34](https://github.com/kumwe/studio/pull/34) [`1d2c89e`](https://github.com/kumwe/studio/commit/1d2c89eb580df1b2924681148f7688c376a7a3a5) Thanks [@Llewellynvdm](https://github.com/Llewellynvdm)! - Harden the coordinated Studio release evidence boundary with stable gate criteria, strict source and artifact verification, safe complete bundle generation, and immutable review workflows.

- [#34](https://github.com/kumwe/studio/pull/34) [`1d2c89e`](https://github.com/kumwe/studio/commit/1d2c89eb580df1b2924681148f7688c376a7a3a5) Thanks [@Llewellynvdm](https://github.com/Llewellynvdm)! - Ship deterministic, lock-derived third-party notices and exact dependency license texts in every package tarball.
- Updated dependencies [[`d82f974`](https://github.com/kumwe/studio/commit/d82f97469fc216d85b9986d17cd48f423a6fae1c), [`fbdda1e`](https://github.com/kumwe/studio/commit/fbdda1e1ece32680be6b93b993d7a8dedee98a26), [`3697049`](https://github.com/kumwe/studio/commit/36970498f532288aa7ff747f7eddcf47432abdb3), [`2a1d3e1`](https://github.com/kumwe/studio/commit/2a1d3e1b6d88d771beca97744294ed77d237b66e), [`6ca9916`](https://github.com/kumwe/studio/commit/6ca9916c06390834a4a7aa62e6f0587f29d4926e), [`1d2c89e`](https://github.com/kumwe/studio/commit/1d2c89eb580df1b2924681148f7688c376a7a3a5), [`a21706a`](https://github.com/kumwe/studio/commit/a21706a1d5bf3d790b79c46250b17d90a42f49ae), [`884bffc`](https://github.com/kumwe/studio/commit/884bffc53b27c78955f77e2e77cc3f7d6b6c778e), [`dc3119c`](https://github.com/kumwe/studio/commit/dc3119c678f3e944de913701adcc4b754b01f4e3), [`2ef0ce2`](https://github.com/kumwe/studio/commit/2ef0ce27759782a67731fcb8c6dbd1636a1eaccb), [`dcad5c8`](https://github.com/kumwe/studio/commit/dcad5c83a8b1756323e2b6890b36d68399554967), [`5786796`](https://github.com/kumwe/studio/commit/57867967fe443173eeeda209df30a796bc9c311d), [`bf09a2f`](https://github.com/kumwe/studio/commit/bf09a2f6337f22921409c4fe4e7e5e5435d40fd7), [`bda990a`](https://github.com/kumwe/studio/commit/bda990abbccaae2b1d0386279b9ffbd8d561da8f), [`1d2c89e`](https://github.com/kumwe/studio/commit/1d2c89eb580df1b2924681148f7688c376a7a3a5), [`11943aa`](https://github.com/kumwe/studio/commit/11943aac68d2c59b141a38f2e1bf323db38885b1)]:
  - @kumwe/studio-core@0.1.0-alpha.9
  - @kumwe/studio-protocol@0.1.0-alpha.9

## 0.1.0-alpha.8

### Minor Changes

- [#24](https://github.com/kumwe/studio/pull/24) [`ee13122`](https://github.com/kumwe/studio/commit/ee13122787e11c56924173790b6742231eddd3a0) Thanks [@Llewellynvdm](https://github.com/Llewellynvdm)! - Declare `studio.profile/host-baseline-v2` and publish its nine-vector portable host sequence corpus.
  The versioned schema fixes exact seed replay, the canonical idempotency scope/preimage, explicit
  logical-clock and renderer controls, semantic closure guards, and the assertion inventory for replay,
  changed intent, scope separation, operation identity, fixed-window reset, failed-attempt retry, and
  preview cancellation/isolation. The reference testbed now preserves authoritative seed revisions and
  session generations, enforces exact operation capabilities, retains accepted mutation outcomes by
  canonical intent, and implements deterministic rate and asynchronous preview cancellation semantics.

- [#24](https://github.com/kumwe/studio/pull/24) [`ee13122`](https://github.com/kumwe/studio/commit/ee13122787e11c56924173790b6742231eddd3a0) Thanks [@Llewellynvdm](https://github.com/Llewellynvdm)! - Define portable preview draft identity and marker semantics for wire protocol `0.1.0-draft.2`:
  canonical artifact SHA-256 helpers, deterministic draft-scoped marker preorder, exact marker-map parity,
  inventory-safe activation and measurement, session-unique render correlation, generation-checked abort
  and disposal handling, viewport-safe geometry invalidation, a closed message vocabulary, exact
  viewport guards, validated artifact/revision/digest staging, and a published cross-runtime preview
  identity corpus.

- [#24](https://github.com/kumwe/studio/pull/24) [`ee13122`](https://github.com/kumwe/studio/commit/ee13122787e11c56924173790b6742231eddd3a0) Thanks [@Llewellynvdm](https://github.com/Llewellynvdm)! - Declare and implement `studio.profile/schema-property`, the portable alpha boundary for contributed
  block property schemas. Property schemas now require a closed object root, local non-recursive JSON
  Pointer references, non-empty enum and composition arrays, unique required/dependent names, canonical
  UTF-8 byte limits, exact decimal multiples, deterministic member precedence, and no format or
  implementation-specific keywords. Core exposes an eval-free compiler plus stable admission codes and
  schema pointers; validation memoizes reference-DAG evaluations and publishes every distinct diagnostic
  in deterministic order without duplicate fan-out amplification. Admission arbitrates root,
  structural, reference, and recursion failures in one token-wise document order. Protocol and testkit
  publish a language-neutral admission/instance corpus with exact boundary pairs for every limit,
  combined-depth, competing-failure, forward-reference-path, and reference-fan-out adversarial cases, a
  runner, and digest-manifest coverage so another runtime can prove agreement without executing Studio
  TypeScript.

### Patch Changes

- [#24](https://github.com/kumwe/studio/pull/24) [`ee13122`](https://github.com/kumwe/studio/commit/ee13122787e11c56924173790b6742231eddd3a0) Thanks [@Llewellynvdm](https://github.com/Llewellynvdm)! - Align the published reference-host fixtures and integration documentation with the renamed Kumwe App
  core at `kumwe/app`. Example capability and session documents now identify the host as
  `org.kumwe/app`, and the first-party integration profile is named `kumwe-app`. The integration
  playbook also records that frozen manifest 5 / SPI 3 paraphrases all six contribution families rather
  than carrying canonical Studio resources. Kumwe App must preserve that legacy boundary and add
  manifest 6 / SPI 4 with canonical `block-definition`, `pattern`, `field-adapter`, `inspector`,
  `design-vocabulary`, and `migration` documents, separate host binding metadata, exact schema/corpus
  validation, and only deterministic lossless legacy adaptation.
- Updated dependencies [[`ee13122`](https://github.com/kumwe/studio/commit/ee13122787e11c56924173790b6742231eddd3a0), [`ee13122`](https://github.com/kumwe/studio/commit/ee13122787e11c56924173790b6742231eddd3a0), [`ee13122`](https://github.com/kumwe/studio/commit/ee13122787e11c56924173790b6742231eddd3a0)]:
  - @kumwe/studio-protocol@0.1.0-alpha.6
  - @kumwe/studio-core@0.1.0-alpha.8

## 0.1.0-alpha.7

### Minor Changes

- [#22](https://github.com/kumwe/studio/pull/22) [`473338a`](https://github.com/kumwe/studio/commit/473338aa46fdf681ffeae44286d7ef7941e6897c) Thanks [@Llewellynvdm](https://github.com/Llewellynvdm)! - The reference host now authorizes artifact mutations, closing the largest recorded limitation of
  `studio.profile/host-baseline`. A save or a publication the acting identity does not hold the
  permission for is refused as `forbidden` before the artifact is touched, and the refusal does not
  disclose whether it exists; save authority and publication authority are distinct, so holding one never
  grants the other. Two conformance vectors fix the behaviour, so a host adapter proves its authorization
  gate from the published corpus rather than being trusted to have one. The reference host declares its
  own permission names, as any host does — what the profile fixes is that a mutation is authorized and
  that a withheld permission is `forbidden`.

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

### Patch Changes

- Updated dependencies [[`51e0423`](https://github.com/kumwe/studio/commit/51e0423c857840367e1d18f598665fd228a7a4b7), [`85bb979`](https://github.com/kumwe/studio/commit/85bb9795c49a75070e52169eb82a27c7613ffab1), [`abe6baf`](https://github.com/kumwe/studio/commit/abe6baf6fcfb7ec5df7425b69d34136c4b51f157), [`9f4f95e`](https://github.com/kumwe/studio/commit/9f4f95e208dceca97046af8d1f18c113ff95746e), [`3f89d04`](https://github.com/kumwe/studio/commit/3f89d0446cb8c02fb3cc15e0fe2fd3ae79351004), [`87eb8bf`](https://github.com/kumwe/studio/commit/87eb8bf7a944ee1ca682cf5085456c2e89a967e2), [`7895dae`](https://github.com/kumwe/studio/commit/7895dae03b6ca4b44c8c10e64c1f17291ef5fd44)]:
  - @kumwe/studio-protocol@0.1.0-alpha.5
  - @kumwe/studio-core@0.1.0-alpha.7

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
