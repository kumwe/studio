# Keyboard reference

This table is normative for the reference web shell. Every structural operation listed here is a
keyboard path to the same canonical command a pointer gesture dispatches; none of them is an
alternative semantics. Shortcuts are announced in the outline's visible hint line, so discovery
does not depend on this document.

## Outline

| Keys                                                                             | Operation                                                                                                                                                                                                          |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Tab`                                                                            | Enter and leave the outline region in document order                                                                                                                                                               |
| `Arrow Up / Arrow Down`                                                          | Move focus between outline entries                                                                                                                                                                                 |
| `Enter` / `Space`                                                                | Select the focused entry                                                                                                                                                                                           |
| `Alt+Arrow Up`                                                                   | Move the focused node earlier in its collection (`reorder-children`)                                                                                                                                               |
| `Alt+Arrow Down`                                                                 | Move the focused node later in its collection (`reorder-children`)                                                                                                                                                 |
| `Ctrl+D` / `Meta+D`                                                              | Duplicate the focused node (`duplicate-node`)                                                                                                                                                                      |
| `Delete`                                                                         | Delete the focused node (`remove-node`)                                                                                                                                                                            |
| `Arrow Right`                                                                    | Open the focused container as the panel's current level; on a block without children, open its details and focus its first control. A modified arrow is not consumed                                               |
| `Arrow Left`                                                                     | Return to the parent level; the container that was opened takes focus. At the page level, or with a modifier, the key is not consumed                                                                              |
| `Escape`                                                                         | In the details view return to the structure with the selected entry focused (or the Outline region when nothing is selected); in an opened level return to its parent                                              |
| `Back` / `Show whole tree`                                                       | The same returns as buttons in the panel header; `Edit` and `Open` under the selected entry are the pointer paths                                                                                                  |
| `Add to page` / `Add block into {slot}` / `Add block before` / `Add block after` | Native buttons at the end of the page level, at the end of each slot of an opened level and under the selected row; each opens the add layer for that exact parent, slot and position and focuses its search field |
| Destination selector                                                             | Move to any valid root/slot position (`move-node` or `reorder-children`)                                                                                                                                           |

After a deletion, focus moves to the previous sibling entry, then the parent, then the first
entry; after duplication, focus moves to the copy. The polite live region announces every outcome,
including failures.

The panel header names where the author is: `Back to Page` or `Back to {parent}` beside `Add blocks`, then
the level's name beside `Show whole tree`, on an opened level; `Back` with the selection path on the details
view. `Escape` reaches the panel only after an active drag cancel, the command palette and a pending add
destination have had their turn (drag cancel, then palette close, then clearing the add destination, then
the panel unwind), only when it originates in the panel's own chrome — a text input, select, editable region
or imperatively mounted control keeps its own `Escape` — and not in the contextual Content and Model modes,
where the docked panel is the details view, no `Back` is rendered and the `Blueprint` tab returns. Each
layer change, and a new block shown in the details view, is announced once; hover is not.

Every add control names its destination before a block is chosen. The add layer's header reads
`Adding to {collection}, position n of m` for the destination chosen through a `+` and describes the search
field, which takes focus; the block cards, command-palette inserts and patterns that the destination refuses
are disabled, and an add control with no admissible block is itself disabled. `Escape` inside the add layer
(from its cards and chrome, or from the search field while it is empty) clears the destination without closing
the layer or moving focus; a changed selection (the author's, or a host's through `selectNode()`), closing the
layer, leaving the structure view or any change to the destination's own collection (a move, an undo or redo,
a removal) also clears it. The empty page and every empty container offer the same destinations as native
buttons: `Add to page` in the empty-page zone, and `Add block into {slot} of {parent} ({id})` in the
`Empty containers` group under the page, whose names always differ because they carry the parent's id. The
column cards (`2 columns`, `3 columns`, `4 columns`) insert a columns block with that many stack children as
one undoable step, announced once, and those stacks' entries read `Stack, column n of N`.

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
operate mode leaves trusted preview links and controls reachable and already shows measured hover and
activation-reported single-click selection; edit mode additionally exposes drop regions and dragging, where
a pointer press selects and movement of at least four CSS pixels begins a drag; same-collection destinations
dispatch `reorder-children`, while cross-root or cross-slot destinations dispatch `move-node`. Edit mode also
draws a dashed band in each empty slot of a pure container (a block with slots and no content ports) that
may receive a block, in that slot's share of the container (the local canvas always draws them). The band
itself is pointer-transparent, so a press anywhere else in the empty container still selects or drags it and
a double-click still activates it; only the `+` disc at the band's centre takes the pointer, and releasing
the primary pointer button on it opens the add layer for that slot, the same destination as its button in
the `Empty containers` list under the page. A drag that ends over the disc keeps its own outcome. A content
block with an empty slot (a card without actions, for instance) draws no band over its content; its button
in the list is the way in.

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

A block-palette entry can also be carried onto the measured canvas. A press stays an ordinary click; four
CSS pixels of movement begin the carry, the same drop indicator and textual status name the destination,
and the drop dispatches `insert-node` at the geometry-ranked position among the destinations the palette
click, command palette, and outline already admit (document roots outside hybrid composition, plus every
slot whose accepted types, hybrid bounds, and cardinality allow the block). `Escape` and `pointercancel`
change nothing and the compatibility click that follows a carry inserts nothing. The non-drag paths to the
identical placement are an add control naming that destination followed by the palette click, or a palette
click followed by the outline destination selector.

The workspace is one container-queried grid. Below its narrow breakpoint the `Workspace panels`
navigation shows `Canvas`, `Blocks`, `Outline`, and `Inspector` as pressed-state buttons over mutually
exclusive sheets; an add control brings the `Blocks` sheet forward and a completed insertion returns to the
canvas sheet. Selection, history, and the rendered page persist across sheets. The command palette is a
workspace-level layer, so `Ctrl+K` reaches it from any sheet and `Escape` returns focus to the invoking
control.

## Inspector

The inspector edits the selected node without leaving the keyboard. Every control is a native
input, select, button, or disclosure, so `Tab` moves through them in one documented order. Ordinary
typed controls come first: native text, multi-line, number, integer, and switch controls for the
block's declared scalar ports (an Entry-bound port edits the Entry value through the guarded value
adapter and never replaces the binding); Studio-owned authoring controls; typed controls for scalar
property schemas; the recipe selector when the active theme offers a matching recipe; declared
Design token selectors and their `Remove` buttons; the Layout size-role section; then resource
binding controls. The `Advanced properties and bindings` disclosure follows and holds the raw
editors: identifier and type facts, base property rows whose value inputs hold the JSON
serialization of the property (value input, then `Unset`); the add-property row (name, value,
`Add property`); model field selectors and their `Remove` buttons, or the legacy binding rows and
set-binding form when no model port is negotiated; and — when the host supplies viewports — the
responsive rows for the active viewport and the add-override form. In read-only or
mode-incompatible sessions the corresponding controls are disabled.

A single click on a rendered block selects it, reveals its outline entry and opens the details view without
moving focus to any control; `Back` returns to the structure view with that entry focused and scrolled into
view. Activating a rendered block on the visual canvas — a double-click on its measured region, or
`Enter`/`F2` while the canvas stage has focus and a block is selected — keeps the page visible, opens the
details view and moves focus to that block's first enabled typed control in the inspector (or to the
header's `Back` control when no typed control can take focus). Value editing remains a canonical command
over the Entry or Blueprint draft; the rendered markup is never edited in place.

Every responsive value carries its provenance as text, never as color or position alone: an
override row states `Overridden for the {viewport} viewport: {value}`, a property the active
viewport does not override states `Inherited from base: {value}`, and base property rows are
marked `Base value`.

| Keys              | Operation                                                                                                                             |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `Tab`             | Move through the inspector controls in the documented order                                                                           |
| `Enter`           | In a value input, parse the text as JSON and commit it                                                                                |
| `Escape`          | In a value input, revert to the committed value and announce the cancel                                                               |
| `Escape`          | From `Back` or another button, switch or disclosure of the panel chrome, return to the structure view with the selected entry focused |
| `Enter` / `Space` | Activate the focused unset, add, set-binding, or remove button                                                                        |

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
`packages/studio-lit/test/layout-editing.test.ts`,
`packages/studio-lit/test/local-canvas.test.ts`, and
`packages/studio-lit/test/preview-surface.test.ts`: keyboard dispatch, disabled states at
collection edges and in read-only sessions, live-region announcements, pointer-drag reordering and
cancellation, measured reparenting parity, inspector editing with its Tab order and conflict recovery,
inheritance reset, size-role editing with its provenance, pattern/restoration surfaces, single-click
selection that reveals the outline entry without moving focus to a control (SR-032), layered structure
navigation with its returns, focus targets and single announcements (SR-035), explicit insertion
destinations carried by every add control with their non-drag parity (SR-036), columns created as one batch
and one undo step (SR-037), holder stability of imperatively mounted controls across layers (SR-038), and
the documented focus targets are all verified there. The browser assertion in
`e2e/specs/visual-canvas.spec.ts` proves the real SVG hit target, pointer/keyboard `move-node` identity,
cancelled-drag no-op and zero CSP violations. A change to this table without a matching assertion change is
a contract violation.
