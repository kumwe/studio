# Keyboard reference

This table is normative for the reference web shell. Every structural operation listed here is a
keyboard path to the same canonical command a pointer gesture dispatches; none of them is an
alternative semantics. Shortcuts are announced in the outline's visible hint line, so discovery
does not depend on this document.

## Outline

| Keys                    | Operation                                                            |
| ----------------------- | -------------------------------------------------------------------- |
| `Tab`                   | Enter and leave the outline region in document order                 |
| `Arrow Up / Arrow Down` | Move focus between outline entries                                   |
| `Enter` / `Space`       | Select the focused entry                                             |
| `Alt+Arrow Up`          | Move the focused node earlier in its collection (`reorder-children`) |
| `Alt+Arrow Down`        | Move the focused node later in its collection (`reorder-children`)   |
| `Ctrl+D` / `Meta+D`     | Duplicate the focused node (`duplicate-node`)                        |
| `Delete`                | Delete the focused node (`remove-node`)                              |

After a deletion, focus moves to the previous sibling entry, then the parent, then the first
entry; after duplication, focus moves to the copy. The polite live region announces every outcome,
including failures.

## Global

| Keys                                                                     | Operation |
| ------------------------------------------------------------------------ | --------- |
| Undo control (`Undo` button; browser shortcut forwarding is host policy) | `undo`    |
| Redo control (`Redo` button; browser shortcut forwarding is host policy) | `redo`    |

## Conformance

These interactions are executable assertions in
`packages/studio-lit/test/kumwe-studio.test.ts`: keyboard dispatch, disabled states at collection
edges and in read-only sessions, live-region announcements, and the documented focus targets are
all verified there. A change to this table without a matching assertion change is a contract
violation.
