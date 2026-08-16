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

An ADR becomes accepted only with reviewer approval, corresponding contract updates, and a conformance strategy. A superseding record links both directions and preserves historical context.
