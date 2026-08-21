# System context

## Purpose

Studio is an embeddable visual composition environment. It coordinates a schema-aware canvas, model designer, blueprint designer, in-context entry editor, media experience, preview, command history, and extension surfaces. It does not replace the host application's domain, security, workflow, persistence, rendering, or media services.

## Participants

| Participant    | Owns                                                                                                               | Must not own                                                    |
| -------------- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| Studio core    | Artifact validation, deterministic commands, selection, history, registries, compatibility diagnostics             | Authentication, persistence, network policy, template execution |
| Studio UI      | Canvas overlays, palette, outline, inspector, keyboard interaction, responsive preview controls                    | Authoritative domain validation, direct database access         |
| Host adapter   | Authenticated transport, permissions, persistence, publication, preview, content/model discovery, media operations | Private mutations of Studio state outside commands              |
| Renderer       | Trusted transformation from validated artifacts and data to output                                                 | Authoring state or editor-only metadata                         |
| Theme          | Design tokens, recipes, responsive roles, block render mappings and preview surfaces                               | Arbitrary document-authored code                                |
| Plugin         | Namespaced blocks, inspectors, patterns, commands, locales and optional UI assets                                  | Undeclared host access, global mutation, trust escalation       |
| Content author | Entry values and permitted composition choices                                                                     | Schema or blueprint changes without permission                  |
| Designer       | Blueprint composition and theme-approved appearance                                                                | Executable template source in a blueprint                       |
| Model designer | Versioned content-model drafts                                                                                     | Silent mutation of published models                             |

## Trust boundaries

Studio crosses five explicit trust boundaries:

1. **Artifact boundary.** All loaded JSON is untrusted until schema, semantic, limit, ownership, and compatibility validation succeeds.
2. **Plugin boundary.** A plugin is executable code. The host decides which signed or bundled plugin assets may execute. A manifest never grants trust by itself.
3. **Host boundary.** Requests leave Studio only through host ports. The host authenticates, authorizes, applies CSRF or equivalent protections, and returns structured errors.
4. **Preview boundary.** Preview messages cross a narrowly scoped, origin-checked channel. Rendered markup is presentation evidence, not authoritative state.
5. **Publication boundary.** Draft artifacts become public only through the host's validation, workflow, revision, audit, and publication transaction.

## Reference flows

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
