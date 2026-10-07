# ADR 0037: The authoring workspace is a structure panel beside a live page

- Status: proposed
- Scope: workspace composition, structure navigation, hover and selection linkage, insertion destinations,
  column creation

## Context

The shell's wide layout is a four-region editor grid: a permanent block palette above a fully expanded
outline on the left, the canvas in the centre, the inspector on the right, diagnostics and a status bar
below. Each region is correct in isolation (ADR 0025 measured overlay, ADR 0036 local canvas), but together
they read as a form arranged around a small preview rather than as a page builder. Authors expect the shape
that page builders share as common practice: one narrow panel that represents the page as its blocks and
holds the editing details of the selected block, the real page at full size beside it, hover and click
linked in both directions, insertion through an explicit add control at every level, and drag-and-drop with
keyboard and structural-control equivalents.

Measured against today's shell, the gaps are specific. Hover tints only the overlay rectangle and never
reaches an outline entry. A single click selects a block but does not reveal its editing details; focusing a
control needs a double-click, Enter or F2, and on narrow widths that hides the page. The palette is always
visible and inserts into an implicit destination. The inspector lives in a third column. The page sits
scaled inside a bordered well under a heading and a status sentence, inside a fixed-height box. Columns are
one block whose count is edited afterwards, so an empty column has no row, no drop zone and no rectangle.
On the reference host the overlay rectangles are drawn beside the rendered blocks because the measured
surface is centred while the overlay is anchored to the stage origin.

The product contract already fixes the constraints: every pointer gesture needs keyboard and explicit
structural-control parity (`STUDIO-PROD-013`), the host stays authoritative for every durable effect
(`STUDIO-PROD-010`), rendered markup is never edited in place, the local canvas must stay labelled as
non-authoritative (`STUDIO-PROD-014`), and requirement rows are never renumbered.

## Decision

1. **Two regions on wide layouts.** The workspace is one narrow left column and one page column. The left
   column holds the structure, the selected block's details and the add surface; the page column holds the
   rendered page at the full workspace height under a slim toolbar that does not scroll away (preview
   widths, commands, undo and redo, the rendered-preview edit control). Existing region landmarks keep their
   accessible names, and the narrow-container sheet mode with its pane switcher is unchanged.
2. **A layered structure panel.** The left column shows one layer at a time: the structure layer lists the
   page's blocks as rows with open and settings actions; the details layer shows the selected block's
   existing inspector sections and the docked Model and Content panels; the add layer is the searchable
   library of blocks and patterns. A layer header carries a Back control and the selection path. ArrowRight
   opens a container, ArrowLeft, Back and Escape return, and each layer change is announced politely. Every
   existing outline operation (move up, down, in and out, duplicate, delete, move to a listed destination)
   stays available on the rows, so no operation depends on a pointer. Layers change visibility, never the
   template identity of the inspector, so imperatively mounted authoring controls keep their holder elements
   and never remount mid-edit.
3. **Hover and selection linked both ways.** One reactive hovered node is shared by the overlay, the panel
   rows and the local canvas. Keyboard focus on a row draws its own dashed indicator on the page, so
   selection, hover and focus remain three distinct, non-colour states; focus is the non-pointer way to find
   a row's block, not a hover alias. A single click on a rendered block selects it, scrolls its row into view
   and opens the details layer without moving focus; Enter, F2 and double-click keep focusing the first typed
   control. On a host-rendered preview the shell obtains hover from passive pointer listeners on its own
   stage that hit-test the latest accepted measurements with the overlay's ancestor-first order and never
   prevent the trusted surface's default action; single-click selection there is the renderer's trusted
   activation report, which the shell routes through the same reveal path, so neither needs edit mode. A
   surface inside a frame delivers no pointer events to the shell, so hover there waits for the preview
   channel to carry it. Moving blocks by drag stays behind the explicit pressed control of ADR 0025, now in
   the toolbar, so links and controls inside the trusted preview remain reachable.
4. **Insertion with an explicit destination.** Every add control (page level, each declared slot, before
   and after the selected row, and the dashed zone drawn in an empty container on the page) opens the add
   layer with a declared parent, slot and position. The insertion request a host may intercept gains an
   optional position; a host that ignores it keeps today's end-of-slot behaviour. The on-page zone is an
   enhancement; the panel control is the parity path.
5. **Columns from existing types.** Column creation inserts a columns block with the chosen number of stack
   children as one batch, so it is one undo step and emits only existing block types; no renderer, host or
   wire change is needed. A model-level column block is a separate future decision.
6. **Honest page region.** The local canvas keeps its visible non-authoritative caption, demoted to a line
   beside the page rather than a heading above it. The measurement origin is the slotted preview surface's
   top-left corner. A host measurer reports rectangles relative to the slotted surface it measures, so the
   host anchors that surface at the stage's start edge instead of centring it; the reference host does so. A
   shell-owned frame that centres surface and overlay together, instead of assuming a stage-anchored
   surface, is a later slice.

## Consequences

ADR 0025 is narrowed, not reversed: hover and selection no longer require the edit control, movement still
does, and geometry still comes only from accepted measurements. The outline, inspector and command palette
keep exposing the complete semantic tree and destination set, so keyboard and assistive-technology users
reach every operation without the layered view. New message keys move the catalog digest and therefore the
release record, the vendored corpus of the PHP realization and the host's translation files. New
requirement rows are appended for mirrored hover, click-to-reveal, layered keyboard navigation, explicit
insertion destinations and holder stability; no existing row changes meaning. The block palette becomes an
`Add blocks` disclosure of the structure panel that opens by default on an empty document and is re-derived
whenever the shell receives a replaced document or session, never closing a library that holds keyboard
focus; narrow sheets are unaffected.

The composition lands in slices on the existing shell element, each shippable and each labelled truthfully:
the frame with hover and click linkage first, then layered navigation, then explicit insertion and columns,
then drag on panel rows. Whether an existing host item opens with its content depends on that host's
composition and policy; for Kumwe App that is an App-side decision inside the boundary of its own ADR 0020
and is tracked there, not here.

## Rejected alternatives

Re-styling the pinned shell from the host was rejected: the host cannot re-lay out the shell's shadow DOM
and the App forbids a host-local page builder. A second shell element built in parallel was rejected
because it duplicates behaviour, message keys and documentation until retirement. Making the host-preview
overlay always enter edit mode was rejected because it intercepts tabs, dialogs and links inside the trusted
preview; hover is obtained from measurements and single-click selection from the renderer's activation
report instead. Carrying hover through the preview protocol and staging unsaved drafts in the host preview
was deferred because it changes the closed message vocabulary and forces a major PHP realization release
before anything is visible. A new column block type was deferred because stack children already give
columns identity, rows and rectangles. Editing rendered markup in place was rejected by the existing
contract boundary.

## Implementation note

Slice 1 (frame, hover and click linkage, origin fix) is recorded in `CHANGELOG.md`; layers, explicit
insertion, columns and panel drag follow as separate slices, each with its own requirement rows. Slice 1
implements Decision 1 and the hover, focus, click-reveal and activation-reported selection of Decision 3, plus
the host-side half of Decision 6 (the measured surface anchored at the stage origin); Decision 3's "opens the
details layer" and Decision 2 are slice S3; Decisions 4 and 5 are S4; the shell-side half of Decision 6 is S6.
