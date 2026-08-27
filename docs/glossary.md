# Glossary

Terms are singular unless context requires otherwise. Public APIs and documentation should use these terms consistently.

| Term                 | Meaning                                                                                                                                                                            |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Artifact             | A portable or persisted JSON document or value governed by a Studio contract; its schema defines the applicable identity and version axes.                                         |
| Authoring definition | A host-owned association between a content-model revision, a default Blueprint revision, authoring policy, and host workflow; it coordinates artifacts without collapsing them.    |
| Binding              | A typed reference from a block port to a field, value, data source, or bounded formatter.                                                                                          |
| Block                | A namespaced, versioned semantic composition unit with typed properties, ports, slots, constraints, and render capability.                                                         |
| Blueprint            | An immutable published composition: a block tree, bindings, semantic design intent, responsive roles, and compatibility requirements.                                              |
| Canvas               | The visual workspace used to inspect and manipulate a blueprint or entry projection.                                                                                               |
| Capability           | A named, versioned behaviour that a host, block, profile, client, or plugin declares and negotiates.                                                                               |
| Command              | A deterministic, serializable request to change a draft state.                                                                                                                     |
| Composition          | The act and result of arranging typed blocks and bindings; it is not generated HTML.                                                                                               |
| Content mode         | The authoring mode for populating values permitted by a blueprint and host policy.                                                                                                 |
| Content model        | The canonical Studio field-and-constraint artifact to which a Blueprint may bind; hosts may map it from a Kumwe App content type, business definition, or equivalent domain model. |
| Contextual authoring | A Studio journey opened for one exact host resource in which authorized model, Blueprint, and entry work is coordinated without a manual cross-screen handoff.                     |
| Design profile       | A theme-owned declaration of tokens, semantic recipes, breakpoint roles, patterns, and renderer support.                                                                           |
| Draft                | A mutable, version-guarded working artifact not yet published as an immutable version.                                                                                             |
| Entry                | A host-governed set of content values associated with a content model.                                                                                                             |
| Gate A               | Integration Contract Ready: public contracts are stable enough for host integration to begin, without claiming full implementation.                                                |
| Gate B               | Production Foundation Ready: the declared foundation is implemented and qualified for stable release.                                                                              |
| Host                 | The integrating system that owns authority, data, persistence, policy, media storage, preview rendering, and publication.                                                          |
| Host adapter         | The implementation of Studio ports for one host; it translates without redefining the protocol.                                                                                    |
| Hybrid composition   | A session with `composite: hybrid`, combining a bounded subset of Blueprint and Content operations without merging their artifact authority.                                       |
| Inspector            | The property, binding, design, accessibility, and policy controls for the current selection.                                                                                       |
| Kumwe content type   | The host-facing reusable authoring choice associating a content-model revision, default Blueprint revision, and authoring policy; it is not one untyped portable artifact.         |
| Media asset          | A stable host-owned identity and typed metadata projection; it is not merely a URL.                                                                                                |
| Model mode           | The mode that coordinates an authorized draft content model; it cannot silently mutate a published model.                                                                          |
| Pattern              | A reusable, parameterized blueprint fragment composed from registered blocks.                                                                                                      |
| Plugin               | A package of declared Studio contributions. A plugin is not arbitrary code embedded in an artifact.                                                                                |
| Port                 | A framework-neutral interface through which Studio requests a host or optional service capability.                                                                                 |
| Preview              | A host-rendered, authenticated, non-authoritative visualization of the current draft.                                                                                              |
| Protocol             | The language-neutral schemas, commands, identifiers, errors, compatibility rules, and fixtures shared by clients and hosts.                                                        |
| Product contract     | The versioned normative statement of Studio's product intent and minimum acceptance journey in `docs/product-contract.md`; it does not assert implementation status.               |
| Recipe               | A named semantic appearance or layout option that a design profile knows how to render.                                                                                            |
| Registry             | A deterministic, owner-aware collection of active, compatible contributions.                                                                                                       |
| Responsive role      | Semantic behaviour across named width conditions, such as four/two/one columns; never a stored CSS class or pixel rule.                                                            |
| Read-only state      | A session with `sessionState: read-only` for non-mutating review, compatibility diagnostics, and recovery.                                                                         |
| Slot                 | A named location in a block that accepts children under declared cardinality and type constraints.                                                                                 |
| Studio               | The complete portable composition platform and its reference authoring experience.                                                                                                 |
| Token                | A design-profile value referenced by stable semantic identity rather than raw style text.                                                                                          |
