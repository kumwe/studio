# ADR 0012: Canonical design-vocabulary and migration declaration kinds

- Status: proposed
- Scope: plugin manifest contribution kinds and their declarative payload schemas

Runtime activation of these payloads is extended by
[ADR 0021](0021-kind-scoped-composition-registries.md).

## Context

Kumwe App's programme freezes the contract an extension declares composition contributions through
at its own Gate A. Its criterion names six declaration kinds — composition blocks, patterns,
inspectors or field controls, design vocabulary including size roles, and composition
migrations — each "validated at admission and at install against the published composition
schemas". Four of those kinds already existed in the closed plugin-manifest enum with canonical
payload schemas; design vocabulary and migrations did not. The theme contract deliberately
refused namespaced experiments as canonical conformance, and the versioning contract required a
migration to be declared before it runs, so a host had no published schema to validate the two
remaining kinds against. A host freezing against a paraphrase would drift from the contract the
runtime enforces — exactly the failure the downstream commitment exists to prevent.

## Decision

The plugin manifest's closed contribution-kind enum gains `design-vocabulary` and `migration`.
Both are resource-backed, declarative contributions: the manifest entry stays the existing
`{kind, id, version, resource, integrity, executable}` shape, and the resource payload conforms
to a new canonical schema.

`design-vocabulary.schema.json` declares the design controls and recipes an extension offers.
Its control and recipe shapes are byte-compatible with the theme document's own `designControls`
and `recipes` members, so a theme adopts or remaps contributed vocabulary through the
declarations it already owns — including `size-role` controls, whose choices bound the role
names layout commands store. The vocabulary carries no CSS and no executable values; a theme
that ignores it loses nothing, which keeps design authority with the theme per ADR 0005.

`migration.schema.json` declares the portable half of a migration: owner, namespaced ID,
affected artifact kinds, source version range, target version, and loss classification —
the same fields the deterministic migration runner validates at registration. The
transformation itself remains trusted package code the host binds separately; artifacts never
carry executable migration source, and a declaration is safe to validate at admission and
install without executing anything.

The unresolved-contribution reference vocabulary accepts both kinds, so an inactive owner's
design vocabulary or migration is represented and diagnosable exactly like every other
declared contribution.

## Consequences

Every declaration kind the downstream freeze names now has a published schema, wire types, a
canonical example, and a negative fixture; the authoring SDK accepts the kinds through the same
manifest validation the runtime applies. The declarations are inert until a host implements
the consuming surface: nothing activates design vocabulary into a theme or executes a declared
migration in this repository. Changing either payload schema after the downstream freeze is a
breaking change to published extensions, measured against the consuming programme's gate date.

## Rejected alternatives

Folding design vocabulary into `theme.schema.json` was rejected: a contribution is owned by an
extension, versioned and lifecycle-managed independently of any theme, and themes must remain
free to ignore it. Reusing the `transform` kind for migrations was rejected because a migration
carries version-range semantics and a loss classification a generic transform does not, and the
runner's registration checks depend on them. Leaving both kinds to namespaced extension data
was rejected because the downstream freeze requires canonical schemas a host can validate
against.
