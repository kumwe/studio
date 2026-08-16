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

## Inspector

The inspector edits the selected node without leaving the keyboard. Every value input holds the
JSON serialization of its property, binding, or override, and every control is a native input or
button, so `Tab` moves through them in one documented order: base property rows (value input,
then its `Unset` button), the add-property row (name, value, `Add property`), binding rows (one
`Remove` button per port), the set-binding form (port, value, `Set binding`), then — when the
host supplies viewports — the active-viewport override rows (value input, `Remove`) and the
add-override form (name, value, `Add override`). In read-only sessions every editing control is
disabled and the inspector states the reason textually.

| Keys              | Operation                                                               |
| ----------------- | ----------------------------------------------------------------------- |
| `Tab`             | Move through the inspector controls in the documented order             |
| `Enter`           | In a value input, parse the text as JSON and commit it                  |
| `Escape`          | In a value input, revert to the committed value and announce the cancel |
| `Enter` / `Space` | Activate the focused unset, add, set-binding, or remove button          |

Property commits dispatch `set-property`, unset buttons `unset-property`, the binding form
`set-binding`, and binding removal `remove-binding`. Override rows dispatch the same property
commands carrying the active viewport of the viewport switcher, and their announcements name that
viewport — this is the non-visual path to responsive resize work. Invalid JSON never dispatches:
the polite live region announces the invalid value and the text stays in the input for
correction. A command the session rejects as stale, conflicting, or read-only is announced with
recovery guidance, focus stays on the triggering control, and the inputs revert to the document's
committed values.

## Global

| Keys                                                                     | Operation |
| ------------------------------------------------------------------------ | --------- |
| Undo control (`Undo` button; browser shortcut forwarding is host policy) | `undo`    |
| Redo control (`Redo` button; browser shortcut forwarding is host policy) | `redo`    |

## Conformance

These interactions are executable assertions in
`packages/studio-lit/test/kumwe-studio.test.ts`,
`packages/studio-lit/test/command-surfaces.test.ts`, and
`packages/studio-lit/test/inspector.test.ts`: keyboard dispatch, disabled states at
collection edges and in read-only sessions, live-region announcements, pointer-drag reordering and
cancellation, inspector editing with its Tab order and conflict recovery, and the documented focus
targets are all verified there. A change to this table without a matching assertion change is a
contract violation.
