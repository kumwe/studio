# Studio contracts

This directory contains the normative contracts between Studio core, user interfaces, hosts, renderers, themes, blocks, and plugins. Implementations may differ internally while preserving these observable rules.

## Contract index

- [Normative language](normative-language.md)
- [Studio configuration](studio-configuration.md)
- [Schema profile](schema-profile.md)
- [Blueprints](blueprint.md)
- [Content models and entries](content-and-entries.md)
- [Themes](theme.md)
- [Blocks](block.md)
- [Plugins](plugin.md)
- [Host adapters](host-adapter.md)
- [Host transport binding](host-transport.md)
- [Commands and history](commands.md)
- [Preview](preview.md)
- [Media](media.md)
- [Rich text](rich-text.md)
- [Semantic web renderer](renderer-web.md)
- [Localization](localization.md)
- [Versioning and migrations](versioning-and-migrations.md)
- [Extension lifecycle](extension-lifecycle.md)
- [Compatibility](compatibility.md)
- [Conformance profiles](conformance-profiles.md)
- [Security](security.md)
- [Threat enforcement registry](security-threats.md)
- [Accessibility](accessibility.md)

Machine-readable artifact shapes live in [`schemas/`](../../schemas/README.md). Schema validation is necessary but not sufficient: implementations must also enforce the semantic rules in these documents.

## Conformance classes

An implementation claims only the classes it passes:

| Class             | Required behavior                                                                              |
| ----------------- | ---------------------------------------------------------------------------------------------- |
| Artifact producer | Emits schema-valid, semantically valid and canonically serializable artifacts                  |
| Core engine       | Applies commands deterministically and enforces tree, binding, registry and history invariants |
| Authoring UI      | Provides the required interaction, accessibility, diagnostics and host-port behavior           |
| Host adapter      | Implements negotiated ports with authorization, revision and error guarantees                  |
| Renderer          | Safely renders its declared block/theme capability set from validated inputs                   |
| Plugin            | Registers namespaced contributions within declared capabilities and lifecycle rules            |
| Native projection | Reproduces supported protocol behavior in a non-browser environment                            |

Conformance is versioned and capability-specific. Passing one class does not imply another.

## Contract status

The contracts describe the intended Gate A foundation. They become stable only when the roadmap's Gate A ratification criteria are met. Gate B requires implemented runtime behavior and release evidence. Until ratification, consumers should pin exact prerelease versions.
