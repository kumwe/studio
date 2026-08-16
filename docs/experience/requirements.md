# Interaction requirement registry

Each interaction and accessibility obligation carries a stable identifier so conformance
assertions, evidence bundles, and reviews can reference it without quoting prose. The
`Enforcement` column is machine-checked by `scripts/check-requirements.mjs`: a repository path must
exist, `manual:` names a documented human procedure, and `open` is an honest gap that blocks the
relevant work package. Removing or renumbering an identifier is a breaking change to recorded
evidence.

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
| SR-019 | Reduced-motion preferences disable non-essential motion                                             | accessibility.md     | open                                               |
| SR-020 | Authoring surfaces reflow at 400% zoom without loss of function                                     | accessibility.md     | open                                               |
| SR-021 | The command palette exposes every structural operation of the current selection, keyboard-navigable | keyboard.md          | packages/studio-lit/test/command-surfaces.test.ts  |
| SR-022 | A cancelled canvas drag leaves the document unchanged                                               | interaction-model.md | packages/studio-lit/test/command-surfaces.test.ts  |
| SR-023 | Property, binding, and responsive-override editing is keyboard-complete through the inspector       | keyboard.md          | packages/studio-lit/test/inspector.test.ts         |
| SR-024 | Conflict and failure announcements preserve focus and speak through the polite live region          | accessibility.md     | packages/studio-lit/test/inspector.test.ts         |

## Manual procedures

- `manual:screen-reader-matrix` — the qualification-time procedure walking the representative
  authoring journeys with NVDA, JAWS, VoiceOver, and TalkBack; recorded per the evidence model
  with reviewer identity and observations. Not yet executed for any release.
