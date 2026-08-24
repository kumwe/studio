# Keyboard reference

This table is normative for the reference web shell. Every structural operation listed here is a
keyboard path to the same canonical command a pointer gesture dispatches; none of them is an
alternative semantics. Shortcuts are announced in the outline's visible hint line, so discovery
does not depend on this document.

## Outline

| Keys                    | Operation                                                                |
| ----------------------- | ------------------------------------------------------------------------ |
| `Tab`                   | Enter and leave the outline region in document order                     |
| `Arrow Up / Arrow Down` | Move focus between outline entries                                       |
| `Enter` / `Space`       | Select the focused entry                                                 |
| `Alt+Arrow Up`          | Move the focused node earlier in its collection (`reorder-children`)     |
| `Alt+Arrow Down`        | Move the focused node later in its collection (`reorder-children`)       |
| `Ctrl+D` / `Meta+D`     | Duplicate the focused node (`duplicate-node`)                            |
| `Delete`                | Delete the focused node (`remove-node`)                                  |
| Destination selector    | Move to any valid root/slot position (`move-node` or `reorder-children`) |

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

## Visual canvas direct manipulation

The current host-rendered preview is the visual canvas when measured geometry is available. Its
`Select and move rendered blocks` pressed-state control creates an explicit edit/operate boundary:
operate mode leaves trusted preview links and controls reachable; edit mode exposes measured selection,
hover and drop regions. A pointer press selects. Movement of at least four CSS pixels begins a drag;
same-collection destinations dispatch `reorder-children`, while cross-root or cross-slot destinations
dispatch `move-node`.

Dragging is a pure enhancement (SR-017). The selected outline entry exposes a native destination selector
containing every valid root/slot position, and the command palette exposes the same destinations. All three
paths use the same candidate set and semantic dispatcher. Candidate labels name the parent node ID as well
as the slot and exact position, so no spatial inference is required. Slot accepts/cardinality, source-slot
minimums, session permissions, modes, locked subtrees and hybrid composition boundaries remove invalid
choices before geometry is considered.

The SVG drop indicator is paired with a textual status naming the destination. `Escape` is captured for an
active drag even if pointer capture or rerender changed focus; `pointercancel` has the same effect. Either
path releases capture, announces cancellation and dispatches no command. Read-only and mode-forbidden
sessions expose no move target. The structural chip canvas retains its tested same-collection drag only as
the degraded fallback when no bound preview is available.

## Inspector

The inspector edits the selected node without leaving the keyboard. Every value input holds the
JSON serialization of its property or override, and every control is a native input,
select, or button, so `Tab` moves through them in one documented order: the recipe selector when
the active theme offers a matching recipe; declared Design token selectors and their `Remove`
buttons; base property rows (value input, then `Unset`); the add-property row (name, value,
`Add property`); model field selectors and their `Remove` buttons, or the legacy binding rows and
set-binding form when no model port is negotiated; then — when the host supplies viewports — the responsive rows for the active
viewport and the add-override form; and finally the Layout size-role section. In read-only or
mode-incompatible sessions the corresponding controls are disabled.

Every responsive value carries its provenance as text, never as color or position alone: an
override row states `Overridden for the {viewport} viewport: {value}`, a property the active
viewport does not override states `Inherited from base: {value}`, and base property rows are
marked `Base value`.

| Keys              | Operation                                                               |
| ----------------- | ----------------------------------------------------------------------- |
| `Tab`             | Move through the inspector controls in the documented order             |
| `Enter`           | In a value input, parse the text as JSON and commit it                  |
| `Escape`          | In a value input, revert to the committed value and announce the cancel |
| `Enter` / `Space` | Activate the focused unset, add, set-binding, or remove button          |

Property commits dispatch `set-property`, unset buttons `unset-property`, a model field selection or the
legacy binding form dispatches `set-binding`, and binding removal dispatches `remove-binding`. A model field
selector contains only compatible, visible fields from the Blueprint's exact locked model and uses native
select keyboard behavior; its adjacent disabled control preview is not an entry-value editor. When model
reads are advertised but the projection is unavailable or mismatched, Studio offers no free-form substitute.
Override rows dispatch the same property
commands carrying the active viewport of the viewport switcher, and their announcements name that
viewport — this is the non-visual path to responsive resize work. Invalid JSON never dispatches:
the polite live region announces the invalid value and the text stays in the input for
correction. A command the session rejects as stale, conflicting, or read-only is announced with
recovery guidance, focus stays on the triggering control, and the inputs revert to the document's
committed values.

Each property with responsive overrides also has a `Reset inheritance` button. It dispatches the
top-level `reset-inherited-property` command, removes every viewport override for that property, leaves the
base value untouched, and announces the result. It is disabled when no override exists or the session mode
forbids the command.

## Patterns and restoration

Hosts may supply active, validated patterns. Each appears as a real button in the block palette and command
palette; activating it dispatches `apply-pattern` after the shell resolves a valid destination and complete
ID map. `Restore last deleted block` dispatches `restore-node` for the newest currently valid entry in the
bounded shell restore journal. Both controls are keyboard-native, obey the same mode/read-only rules as
their commands, and announce success through the polite live region.

### Design tokens and recipes

The Design section is present when the selected block names controls supplied by the active
`ThemeDocument`. Each native selector contains only the theme's declared choices. On the base viewport
it dispatches `set-property` for the base token; on another viewport it dispatches the same command with
that viewport, and the adjacent text states whether the value is inherited or overridden. `Remove`
dispatches the matching `unset-property`. A recipe selector is present only for recipes targeting the
selected block. Choosing one expands the recipe through the core's deterministic operation generator and
dispatches one atomic `batch`; it never mutates styles outside the command history.

### Layout size roles

The Layout section edits the named size role of each layout axis (`inline` and `block`) for the
selected node. Its rows render the base assignment (`Base: half` or `Base: none`) and, while the
viewport switcher is on a non-base viewport, that viewport's provenance (`Overridden for the
Narrow viewport: full` or `Inherited from base: half`) as text. The role control targets the base
assignment while the switcher is on the base viewport (or the host supplies no viewports),
dispatching `set-size-role` without a viewport; on any other viewport it targets that viewport's
override and the command carries the viewport — the same base-versus-override split the
responsive property editor dispatches with. The `Remove` button dispatches `unset-size-role` for
the same context and is disabled while the targeted assignment is absent. Announcements name the
axis, the role, and — for overrides — the viewport.

The role control is a native `<select>` populated from the active theme's declared size-role
vocabulary — the choices of its `size-role` design controls, supplied to the shell by the host
alongside the theme's viewports. Operating the select is native keyboard interaction (arrow keys,
`Enter`, `Escape` to close without choosing); committing a choice dispatches immediately, and the
placeholder entry is disabled so closing the picker without a choice dispatches nothing. When the
active theme declares no size roles, the section states that textually and offers no controls —
never a free-text input. Only when no theme vocabulary is available at all does the control fall
back to a validated identifier input:

| Keys     | Operation                                                                        |
| -------- | -------------------------------------------------------------------------------- |
| `Enter`  | In the fallback role input, validate the lower-case identifier and commit it     |
| `Escape` | In the fallback role input, revert to the committed role and announce the cancel |

An identifier that fails validation is announced through the polite live region and dispatches
nothing; the text stays in the input for correction.

## Global

| Keys                                                                     | Operation |
| ------------------------------------------------------------------------ | --------- |
| Undo control (`Undo` button; browser shortcut forwarding is host policy) | `undo`    |
| Redo control (`Redo` button; browser shortcut forwarding is host policy) | `redo`    |

## Conformance

These interactions are executable assertions in
`packages/studio-lit/test/kumwe-studio.test.ts`,
`packages/studio-lit/test/command-surfaces.test.ts`,
`packages/studio-lit/test/layout-blocks.test.ts`,
`packages/studio-lit/test/inspector.test.ts`, and
`packages/studio-lit/test/model-bindings.test.ts`,
`packages/studio-lit/test/layout-editing.test.ts`: keyboard dispatch, disabled states at
collection edges and in read-only sessions, live-region announcements, pointer-drag reordering and
cancellation, measured reparenting parity, inspector editing with its Tab order and conflict recovery,
inheritance reset, size-role editing with its provenance, pattern/restoration surfaces, and the documented
focus targets are all verified there. The browser assertion in `e2e/specs/visual-canvas.spec.ts` proves the
real SVG hit target, pointer/keyboard `move-node` identity, cancelled-drag no-op and zero CSP violations. A
change to this table without a matching assertion change is a contract violation.
