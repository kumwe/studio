# Interaction requirement registry

Each interaction and accessibility obligation carries a stable identifier so conformance
assertions, evidence bundles, and reviews can reference it without quoting prose. The
`Enforcement` column is machine-checked by `scripts/check-requirements.mjs`: a repository path must
exist, `manual:` names a documented human procedure, and `open` is an honest gap that blocks the
relevant work package. Removing or renumbering an identifier is a breaking change to recorded
evidence.

The sole normative product requirements are `STUDIO-PROD-001` through `STUDIO-PROD-015` in the
[product contract](../product-contract.md). This interaction registry supplies lower-level evidence; it neither
redefines those requirements nor turns an existing Blueprint-shell assertion into proof of the target
contextual product (`STUDIO-PROD-014`).

| ID     | Requirement                                                                                         | Source               | Enforcement                                        |
| ------ | --------------------------------------------------------------------------------------------------- | -------------------- | -------------------------------------------------- |
| SR-001 | Every structural operation is achievable without dragging                                           | interaction-model.md | packages/studio-lit/test/kumwe-studio.test.ts      |
| SR-002 | Outline entries are focus-navigable with Arrow keys                                                 | keyboard.md          | packages/studio-lit/test/kumwe-studio.test.ts      |
| SR-003 | A focused node moves within its collection with Alt+Arrow                                           | keyboard.md          | packages/studio-lit/test/kumwe-studio.test.ts      |
| SR-004 | A focused node duplicates with Ctrl+D or Meta+D                                                     | keyboard.md          | packages/studio-lit/test/kumwe-studio.test.ts      |
| SR-005 | Delete removes the focused node and moves focus to its documented target                            | keyboard.md          | packages/studio-lit/test/kumwe-studio.test.ts      |
| SR-006 | Operation outcomes and failures are announced through one polite live region                        | accessibility.md     | packages/studio-lit/test/kumwe-studio.test.ts      |
| SR-007 | Focus stays on a surviving node across undo and redo                                                | interaction-model.md | packages/studio-lit/test/kumwe-studio.test.ts      |
| SR-008 | Read-only sessions permit inspection but disable every mutation control                             | workspace.md         | packages/studio-lit/test/kumwe-studio.test.ts      |
| SR-009 | Every chrome string is host-overridable through the message catalog                                 | localization.md      | packages/studio-lit/test/kumwe-studio.test.ts      |
| SR-010 | Unresolved blocks are marked textually, never by color alone                                        | accessibility.md     | packages/studio-lit/test/kumwe-studio.test.ts      |
| SR-011 | Diagnostics are ordered by severity and severity is rendered as text                                | accessibility.md     | packages/studio-lit/test/workspace-regions.test.ts |
| SR-012 | Activating a located diagnostic selects and focuses the offending node                              | workspace.md         | packages/studio-lit/test/workspace-regions.test.ts |
| SR-013 | Viewport switching exposes pressed state and fires a change event                                   | workspace.md         | packages/studio-lit/test/workspace-regions.test.ts |
| SR-014 | The breadcrumb exposes selected-node ancestry with aria-current on the leaf                         | workspace.md         | packages/studio-lit/test/workspace-regions.test.ts |
| SR-015 | Unsaved state is visible and surfaced to hosts as an event                                          | workspace.md         | packages/studio-lit/test/kumwe-studio.test.ts      |
| SR-016 | Selection only ever references nodes present in the document                                        | interaction-model.md | packages/core/test/session.test.ts                 |
| SR-017 | Canvas pointer dragging is an enhancement layered over the non-drag paths                           | interaction-model.md | packages/studio-lit/test/command-surfaces.test.ts  |
| SR-018 | Supported screen-reader matrix passes the manual authoring workflow procedures                      | accessibility.md     | manual:screen-reader-matrix                        |
| SR-019 | Reduced-motion preferences disable non-essential motion                                             | accessibility.md     | e2e/specs/reduced-motion.spec.ts                   |
| SR-020 | Authoring surfaces reflow at 400% zoom without loss of function                                     | accessibility.md     | e2e/specs/reflow.spec.ts                           |
| SR-021 | The command palette exposes every structural operation of the current selection, keyboard-navigable | keyboard.md          | packages/studio-lit/test/command-surfaces.test.ts  |
| SR-022 | A cancelled canvas drag leaves the document unchanged                                               | interaction-model.md | packages/studio-lit/test/command-surfaces.test.ts  |
| SR-023 | Property, binding, and responsive-override editing is keyboard-complete through the inspector       | keyboard.md          | packages/studio-lit/test/inspector.test.ts         |
| SR-024 | Conflict and failure announcements preserve focus and speak through the polite live region          | accessibility.md     | packages/studio-lit/test/inspector.test.ts         |
| SR-025 | Authoring chrome passes the automated WCAG 2.1 AA scan                                              | accessibility.md     | e2e/specs/wcag-scan.spec.ts                        |
| SR-026 | Announcements and focus survive preview renderer reload and teardown                                | accessibility.md     | packages/studio-lit/test/preview-lifecycle.test.ts |
| SR-027 | Layout size roles are editable and their inheritance provenance is textually perceivable            | keyboard.md          | packages/studio-lit/test/layout-editing.test.ts    |
| SR-028 | Visual selection, hover and drop geometry comes only from the latest accepted preview measurement   | preview.md           | packages/studio-lit/test/preview-surface.test.ts   |
| SR-029 | Measured pointer reparenting and the outline path dispatch the identical semantic move command      | keyboard.md          | e2e/specs/visual-canvas.spec.ts                    |
| SR-030 | Blueprint surfaces expose restore, reparent, inheritance-reset and pattern-application commands     | commands.md          | packages/studio-lit/test/command-surfaces.test.ts  |

## Product-contract evidence relationship

The descriptions below are navigation summaries only; the linked product contract remains authoritative and
[`docs/roadmap/STATUS.md`](../roadmap/STATUS.md) remains the sole gate/status authority. “Implemented” here
identifies a repository component, never a profile, host-support, or acceptance claim.

| Product IDs                          | Interaction evidence needed                                                                                    | Current relationship                                                                                                                       |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `STUDIO-PROD-001`, `STUDIO-PROD-008` | Contextual launch from every eligible core or extension-owned target                                           | Target schema, owner-aware resolution, hosted mount, and contextual shell implemented; core/extension real-host journey evidence open      |
| `STUDIO-PROD-002`, `STUDIO-PROD-012` | Blank/from-type start without pre-creation, copy/paste, or manual reconciliation                               | Blank standalone plus blank/from-type/existing coordinator starts implemented; authoritative host replay and acceptance open               |
| `STUDIO-PROD-003`                    | Blocks, typed fields, bindings, and Entry values authored in one continuous canvas                             | Contextual shell composes Blueprint, field-add, binding, and Entry-value controls; complete field lifecycle and qualification open         |
| `STUDIO-PROD-004`–`STUDIO-PROD-006`  | Separate artifacts, exact type-version hydration, and the three explicit save choices                          | Separate snapshot, save schemas, plan/submit/reconcile coordinator, and shell choices implemented; real-host atomic transaction proof open |
| `STUDIO-PROD-007`                    | Inline, minimized, maximized, and fullscreen continuity                                                        | One-session presentation state implemented; route/frame handoff, manual accessibility, and integrated continuity proof open                |
| `STUDIO-PROD-009`                    | Extension block, field-adapter, and pattern lifecycle throughout the contextual journey                        | Six-kind owner-aware admission and hosted-shell wiring implemented; full disable/upgrade/migration journey evidence open                   |
| `STUDIO-PROD-010`, `STUDIO-PROD-011` | Host-authoritative acceptance with compiled browser assets and no production Node.js/npm dependency            | Configured HTTP runtime, prebuilt static assets, and PHP reference boundary implemented; Kumwe App and independent-host evidence open      |
| `STUDIO-PROD-013`                    | Complete keyboard, focus, announcement, reflow, and assistive-technology parity for the new journeys           | Component and browser assertions exist; complete `authoring-web` plus manual AT/touch/zoom/RTL qualification remains open                  |
| `STUDIO-PROD-014`                    | Truthful distinction among implemented components, integrated behavior, required target, and accepted claims   | Implemented components are documented separately from integrated journeys and accepted claims; this row is not acceptance evidence         |
| `STUDIO-PROD-015`                    | Executable end-to-end acceptance across launch, authoring, continuity, save/refusal, reload, and accepted data | Open; repository unit/browser/reference-host assertions do not constitute the required real-host acceptance journey                        |

## Manual procedures

- `manual:screen-reader-matrix` — the qualification-time procedure walking the representative
  authoring journeys with NVDA, JAWS, VoiceOver, and TalkBack; recorded per the evidence model
  with reviewer identity and observations. Not yet executed for any release.
