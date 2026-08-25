# Architecture decision records

These records capture foundational decisions whose reversal would materially affect public contracts. Statuses are `proposed`, `accepted`, `superseded`, or `rejected`. Initial records remain **proposed** until Gate A ratification; documentation does not imply implementation.

| ADR                                                | Decision                                                       | Status   |
| -------------------------------------------------- | -------------------------------------------------------------- | -------- |
| [0001](0001-typescript-lit-web-components.md)      | Strict TypeScript and Lit Web Components for browser authoring | Proposed |
| [0002](0002-neutral-typed-artifacts.md)            | Vendor-neutral typed artifacts are authoritative               | Proposed |
| [0003](0003-host-ports-and-adapters.md)            | Hosts integrate through least-authority ports                  | Proposed |
| [0004](0004-server-rendered-preview.md)            | Preview uses the trusted delivery renderer                     | Proposed |
| [0005](0005-bounded-design-language.md)            | Blueprints store semantic design intent, not CSS               | Proposed |
| [0006](0006-host-owned-media.md)                   | Studio owns media UX; hosts own media custody                  | Proposed |
| [0007](0007-portable-flutter-projection.md)        | Flutter uses shared protocols, not a coupled JS core           | Proposed |
| [0008](0008-canonical-vectors-and-minimal-form.md) | Canonical command vectors and minimal document form            | Proposed |
| [0009](0009-restore-and-inheritance-reset.md)      | First-class restoration and explicit inheritance reset         | Proposed |
| [0010](0010-responsive-role-resize.md)             | Responsive size roles as first-class command vocabulary        | Proposed |
| [0011](0011-editing-modes.md)                      | Deterministic editing-mode permission boundaries               | Proposed |
| [0012](0012-composition-declaration-kinds.md)      | Canonical design-vocabulary and migration declaration kinds    | Proposed |
| [0013](0013-per-slot-composition-markers.md)       | Per-slot composition markers for hybrid regions                | Proposed |
| [0014](0014-conformance-profiles.md)               | Named conformance profiles with executable assertion sets      | Proposed |
| [0015](0015-media-upload-grants.md)                | Host-issued upload grants keep bytes off the JSON port         | Proposed |
| [0016](0016-portable-property-schema-profile.md)   | Portable property-schema profile and stable diagnostics        | Proposed |
| [0017](0017-host-sequence-conformance.md)          | Stateful host obligations use deterministic sequence vectors   | Proposed |
| [0018](0018-preview-draft-identity-and-markers.md) | Canonical preview digest and deterministic marker preorder     | Proposed |
| [0019](0019-version-two-web-profile-scope.md)      | Version 2 qualifies the web profile set                        | Proposed |
| [0020](0020-blueprint-host-session-composition.md) | One headless handle composes resolved Blueprint host sessions  | Proposed |
| [0021](0021-kind-scoped-composition-registries.md) | Kind-scoped registries for all composition payloads            | Proposed |
| [0022](0022-core-layout-block-family.md)           | Core layout blocks store bounded responsive intent             | Proposed |
| [0023](0023-shell-preview-surface-binding.md)      | Shell preview binds a host-staged canonical channel            | Proposed |
| [0024](0024-read-only-model-binding-projection.md) | Host models project into read-only field-binding affordances   | Proposed |
| [0025](0025-measured-preview-visual-canvas.md)     | Direct manipulation uses measured preview geometry             | Proposed |
| [0026](0026-production-block-catalog.md)           | Studio owns a portable production block catalog                | Proposed |
| [0027](0027-studio-owned-rich-text-authoring.md)   | Studio owns Editor.js behind canonical rich-text profiles      | Proposed |
| [0028](0028-portable-semantic-web-renderer.md)     | One portable semantic web renderer with optional adapters      | Proposed |
| [0034](0034-editorjs-private-authoring-adapter.md) | Editor.js stays behind Studio's canonical authoring boundary   | Proposed |

An ADR becomes accepted only with reviewer approval, corresponding contract updates, and a conformance strategy. A superseding record links both directions and preserves historical context.
