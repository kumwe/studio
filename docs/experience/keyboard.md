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

## Command palette

The palette is a labelled region containing a labelled filter input and a list of real buttons —
deliberately not an ARIA combobox. Tab enters and leaves it in document order; the keys below are
layered on top. Every entry dispatches the same canonical command as its outline or block-palette
counterpart, with identical disabled and read-only rules. Filtering is a case-insensitive
substring match on the localized entry label.

| Keys                | Operation                                                            |
| ------------------- | -------------------------------------------------------------------- |
| `Ctrl+K` / `Meta+K` | Open or close the palette (also available as the `Commands` button)  |
| `Arrow Down`        | From the input, focus the first enabled result; then the next result |
| `Arrow Up`          | Focus the previous result; from the first, return to the input       |
| `Enter`             | Run the focused result; from the input, run the first enabled result |
| `Escape`            | Close the palette and return focus to the invoking element           |

## Canvas pointer drag

Dragging a canvas chip with the pointer is a pure enhancement over the paths above (SR-017): it
dispatches the same `reorder-children` command as `Alt+Arrow`, adds no capability the outline
lacks, and is inert in read-only sessions. A drag reorders only within the chip's own collection —
cross-slot reparenting stays on the outline and palette paths in this pass. While dragging, a
textual drop-position indicator names the target position; `Escape` or `pointercancel` abandons
the drag with no document change. Drops and cancellations are announced through the polite live
region.

## Global

| Keys                                                                     | Operation |
| ------------------------------------------------------------------------ | --------- |
| Undo control (`Undo` button; browser shortcut forwarding is host policy) | `undo`    |
| Redo control (`Redo` button; browser shortcut forwarding is host policy) | `redo`    |

## Conformance

These interactions are executable assertions in
`packages/studio-lit/test/kumwe-studio.test.ts` and
`packages/studio-lit/test/command-surfaces.test.ts`: keyboard dispatch, disabled states at
collection edges and in read-only sessions, live-region announcements, pointer-drag reordering and
cancellation, and the documented focus targets are all verified there. A change to this table
without a matching assertion change is a contract violation.
