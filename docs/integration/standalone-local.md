# Standalone local Studio

Standalone local mode mounts the same contextual Model/Blueprint/Entry page builder without creating a
`HostAdapter`, calling a route, or inventing a server identity. It is a browser-session workspace for trying the
built-in block catalog and patterns. It is not an authenticated content session and cannot save, publish, upload,
resolve protected resources, or make any other durable change.

Normal integrations enter local mode through the same canonical deployment API as hosted Studio. Omitting the
configuration selects the blank standalone profile:

```ts
import { mountStudio } from '@kumwe/studio';

const target = document.querySelector<HTMLElement>('#studio');
if (target !== null) {
  await mountStudio(target);
}
```

An external browser module may instead call `autoMountStudio()` for explicitly opted-in
`<div data-kumwe-studio></div>` elements. Each canonical mount creates an isolated blank page with the full
contextual Model, Blueprint, and Entry surfaces. State is kept only by that mounted element. Reloading or
closing the page, replacing the mount target, or disposing the handle discards it. Local mode deliberately does
not use `localStorage`, cookies, IndexedDB, a service worker, or a hidden in-memory `HostAdapter`.

## Two JSON downloads with different purposes

The local toolbar labels the two formats separately:

| Action                    | Canonical root             | Contents                                                                | Reopenable | Durable effect |
| ------------------------- | -------------------------- | ----------------------------------------------------------------------- | ---------- | -------------- |
| Download project JSON     | `AuthoringSessionSnapshot` | Model, Blueprint, Entry, coordinates, dirty state, presentation, target | Yes        | None           |
| Download save-intent JSON | `AuthoringSaveIntent`      | Exactly one selected host save outcome                                  | No         | None           |

`Download project JSON` is the lossless local checkpoint. `Import project JSON` accepts that same canonical
snapshot after schema, relationship, size, depth, and complete built-in-catalog validation. Importing replaces
only the current element's in-memory project.

`Download save-intent JSON` demonstrates the exact dataset host mode would submit for the selected outcome. A
new blank local project exposes only `save-as-new-type`, because it has neither an existing Entry nor a reusable
type to update. A canonical imported from-type or existing project may expose only the additional outcomes that
its start state and artifact relationships can represent. The outcomes are intentionally not merged:
`save-item` carries Entry data and an authorized item Blueprint when applicable, while the reusable-type
outcomes carry Model and Blueprint data. Generating or downloading an intent does not plan, confirm, persist,
version, authorize, or publish anything.

The contextual shell's existing Save buttons have the same local behavior: the wrapper captures the exact emitted
intent and downloads it instead of forwarding it to a host. The permanent no-persistence notice and live status
region make that boundary explicit to keyboard, screen-reader, touch, and pointer users.

## Programmatic interchange

`mountStudioStandalone()` and `createStudioStandaloneRuntime()` are advanced direct-composition APIs for an
application that intentionally owns the local runtime lifecycle. Normal deployment uses `mountStudio()` or
`autoMountStudio()` above. The lower-level runtime exposes the same canonical interchange operations:

```ts
import {
  createStudioStandaloneRuntime,
  parseStudioStandaloneProject,
  serializeStudioStandaloneProject,
} from '@kumwe/studio';

const studio = createStudioStandaloneRuntime();
document.querySelector('#studio')?.append(studio);

const json = studio.exportProjectJson();
studio.importProjectJson(parseStudioStandaloneProject(json));

const saveIntent = studio.exportSaveIntentJson('save-as-new-type');
```

Serialization is deterministic canonical JSON. Node and command allocation is instance-local and deterministic,
so identical actions on separate blank mounts produce identical portable projects without sharing state.
