---
'@kumwe/studio-core': patch
'@kumwe/studio-protocol': patch
'@kumwe/studio': patch
'@kumwe/studio-testkit': patch
---

Every add control of the Blueprint workspace now names its destination. `Add to page` ends the page level
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
