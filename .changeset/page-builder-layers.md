---
'@kumwe/studio': patch
'@kumwe/studio-testkit': patch
---

The Blueprint workspace's left column now navigates in layers. The structure view opens with the whole page
tree and can open one container at a time into its own level under a header that names the parent (`Back to
Page`, `Back to {parent}`, `Show whole tree`); the details view shows the selected block's inspector sections
and the docked Model and Content panels under a `Back` control and the selection path, which moves from the
page column into that header (in the contextual Content and Model modes the docked panel is the details view
and the `Blueprint` tab returns, so no `Back` is rendered there). A single click on a rendered block opens
the details view without moving focus; `Edit` and `Open` under the selected entry, `Arrow Right`, `Enter`,
`F2` and double-click are the other ways in, and `Back`, `Arrow Left` and `Escape` return with focus placed
on a visible control. Each layer change, and a new block shown in the details view, is announced once; hover
is not. Layers change visibility only, so
imperatively mounted authoring controls keep their holder elements. Narrow sheets are unchanged (`Outline`
and `Inspector` are the two layers). No protocol, schema or host-adapter shape changes; the English authoring
catalog gains `studio.shell/announce-panel-layer`, `studio.shell/outline-edit`, `studio.shell/outline-open`,
`studio.shell/outline-whole-tree`, `studio.shell/panel-back`, `studio.shell/panel-back-to` and
`studio.shell/panel-page`, and extends `studio.shell/outline-hint` (catalog 1.10.0; the testkit fixture copy
moves with it). The release-asset builders (`scripts/studio-browser-artifacts.mjs`,
`scripts/studio-enhancement-artifacts.mjs`, `scripts/build-standalone-static-host.mjs`) pin the bundler to
production bytes for the duration of each build regardless of the invoking process's `NODE_ENV`, so the
static-delivery budget test measures the bytes a release ships.
