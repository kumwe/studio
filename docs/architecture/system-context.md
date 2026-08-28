# System context

## Purpose

Studio is the central contextual editor product for host content. Any eligible core surface or host extension
must be able to declare and launch the same Studio workspace for that exact context, rather than sending the
author through a separate schema editor, layout builder, and value form. The target workspace coordinates a
schema-aware canvas, model designer, Blueprint designer, in-context Entry editor, media experience, preview,
command history, and extension surfaces while keeping their artifacts and authority separate
(`STUDIO-PROD-001`, `STUDIO-PROD-003`, and `STUDIO-PROD-008`). The normative product requirements live only in
the [product contract](../product-contract.md).

Studio does not replace the host application's domain, security, workflow, persistence, rendering, or media
services. The host resolves the launch target, authenticates and authorizes the actor, supplies exact artifact
and value context, and accepts or refuses every durable effect (`STUDIO-PROD-010`).

### Current Studio-side implementation boundary

The repository implements an additive `openContextualStudioSession` coordinator, a contextual browser shell,
blank/from-type/existing starts, separate Model/Blueprint/Entry draft state, four presentation states, and the
three explicit save intents. The configured browser runtime binds those components to exact host operations;
standalone mode instead opens a blank in-memory project with built-in blocks and patterns. The older
`openStudioSession` API remains a deliberately bounded Blueprint-only compatibility profile.

These Studio-side components do not prove a completed host product. Kumwe App integration, complete Model and
Entry authoring breadth, real-host persistence and rendering, the full `authoring-web` assertion set, manual
accessibility work, and the single acceptance journey remain subject to the authoritative status and evidence
gates (`STUDIO-PROD-014` and `STUDIO-PROD-015`).

## Participants

| Participant    | Owns                                                                                                               | Must not own                                                     |
| -------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| Studio core    | Artifact validation, deterministic commands, selection, history, registries, compatibility diagnostics             | Authentication, persistence, network policy, template execution  |
| Studio UI      | Canvas overlays, palette, outline, inspector, keyboard interaction, responsive preview controls                    | Authoritative domain validation, direct database access          |
| Host adapter   | Authenticated transport, permissions, persistence, publication, preview, content/model discovery, media operations | Private mutations of Studio state outside commands               |
| Renderer       | Trusted transformation from validated artifacts and data to output                                                 | Authoring state or editor-only metadata                          |
| Theme          | Design tokens, recipes, responsive roles, block render mappings and preview surfaces                               | Arbitrary document-authored code                                 |
| Plugin         | Namespaced blocks, field adapters, inspectors, patterns, commands, locales and optional UI assets                  | Undeclared host access, global mutation, trust escalation        |
| Host extension | Declared contextual authoring targets and contribution ownership                                                   | Authentication, persistence, or authority granted by declaration |
| Content author | Entry values and permitted composition choices                                                                     | Schema or blueprint changes without permission                   |
| Designer       | Blueprint composition and theme-approved appearance                                                                | Executable template source in a blueprint                        |
| Model designer | Versioned content-model drafts                                                                                     | Silent mutation of published models                              |

## Trust boundaries

Studio crosses five explicit trust boundaries:

1. **Artifact boundary.** All loaded JSON is untrusted until schema, semantic, limit, ownership, and compatibility validation succeeds.
2. **Plugin boundary.** A plugin is executable code. The host decides which signed or bundled plugin assets may execute. A manifest never grants trust by itself.
3. **Host boundary.** Requests leave Studio only through host ports. The host authenticates, authorizes, applies CSRF or equivalent protections, and returns structured errors.
4. **Preview boundary.** Preview messages cross a narrowly scoped, origin-checked channel. Rendered markup is presentation evidence, not authoritative state.
5. **Publication boundary.** Draft artifacts become public only through the host's validation, workflow, revision, audit, and publication transaction.

## Reference flows

### Contextual coordinated authoring target

The Studio-side coordinator and shell implement this flow's bounded browser/runtime mechanics. The sequence is
still the required end-to-end host acceptance flow, not a claim that a real host has executed and qualified it
(`STUDIO-PROD-001`–`STUDIO-PROD-008`, `STUDIO-PROD-012`, and `STUDIO-PROD-015`).

1. A resolved core or extension-owned host target invokes Studio with the authenticated actor and exact item,
   reusable-type, revision, locale, workflow, and surface context that the host authorizes.
2. The author starts from a host-authorized blank definition or one exact reusable definition version. The host
   supplies or coordinates the necessary draft identities; the author is not required to pre-create companion
   records, copy values between tools, or reconcile duplicate drafts manually.
3. One contextual canvas exposes compatible blocks, typed fields, and Entry values. Model, Blueprint, and Entry
   changes remain distinguishable even when the experience presents them together.
4. Moving among inline, minimized, maximized, and fullscreen presentation preserves the logical authoring
   session, selection, unsaved work, undo state, and host context.
5. The author explicitly chooses **save item**, **save as new type**, or **save new type version**. The latter two
   affect separately versioned Model and Blueprint definitions, while Entry values remain excluded from the
   reusable content type.
6. The host authoritatively validates, persists, versions, audits, and returns the accepted result or structured
   refusal. Studio never treats a browser draft as durable merely because the UI changed.

### Blueprint design

1. The host opens a session with an actor, resource context, permissions, supported document contract revisions and wire protocol versions, a model revision, a theme revision, block definitions, and resource limits.
2. Studio validates every input and builds a capability-resolved registry.
3. A designer issues commands against a blueprint draft.
4. Studio emits deterministic state changes and requests a preview for the resulting revision.
5. The host validates and renders the preview through its trusted renderer.
6. Studio saves with an expected revision; a conflict never overwrites remote work silently.

### Entry authoring

1. The host provides an immutable model revision, a compatible blueprint revision, and an entry draft.
2. Studio exposes editable fields according to both permissions and blueprint bindings.
3. Field and layout commands are validated locally, then authoritatively by the host.
4. Media operations use the host media port and store stable asset references.
5. Publication remains an explicit host use case.

### Public rendering

1. The host loads a published entry, pinned blueprint, pinned model, and compatible theme.
2. The host validates or retrieves previously validated artifacts.
3. A trusted renderer maps typed nodes and semantic design choices to output.
4. Optional progressive enhancement loads independently of Studio.

## Kumwe App as reference host

Kumwe App should implement the host and renderer contracts while preserving its own inward dependency direction. Studio packages must not import Kumwe App PHP, Twig, route, database, or extension types. Kumwe App should adapt its content definitions, business definitions, contribution registry, media service, authorization, workflows, revisions, and Twig presentation into the public Studio contracts.

For business records, a blueprint binds to typed fields and authorized query or action references. The blueprint is presentation metadata; it is not the authoritative business record store.

Kumwe App's PHP application services, exposed through PHP HTTP endpoints, remain authoritative for every
contextual launch and save outcome. Studio is delivered to the browser as compiled assets; neither Node.js nor
npm is a Kumwe App production-runtime dependency (`STUDIO-PROD-010` and `STUDIO-PROD-011`).
