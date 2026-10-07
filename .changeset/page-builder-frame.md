---
'@kumwe/studio': patch
'@kumwe/studio-testkit': patch
---

Compose the Blueprint workspace as one narrow structure-and-details column beside a full-height page. The
Outline leads the left column and opens the block palette through an `Add blocks` disclosure (open by default
on an empty document); the Inspector and the docked Model and Content panels sit beneath it; the page fills
the right column under a sticky toolbar with the local-canvas caption kept visible as a slim strip at the
top of the page column. Hovering a rendered block highlights its Outline entry and hovering or focusing an
entry marks the block on the page with distinct indicators; a single click on the page selects the block and
reveals its entry without moving focus to a control, while double-click, Enter and F2 still focus its first
control. Host previews stay pointer-inert in operate mode: hover derives from accepted measurements through
the shell's own stage, selection stays the renderer's activation report, and dragging still requires the
edit control, which now sits in the page toolbar. The reference host anchors its measured surface at the stage's start edge so overlay rectangles
align. A hosted local canvas opens at its desktop width on wide screens when the host sets no initial
viewport, as the standalone host already does; the base viewport, and therefore where responsive edits are
written, is unchanged. No protocol, schema or host-adapter shape changes; the English authoring catalog gains
`studio.shell/add-blocks-toggle` (catalog 1.9.0; the testkit fixture copy moves with it).
