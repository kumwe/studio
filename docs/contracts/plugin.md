# Plugin contract

## Purpose

Plugins extend Studio through explicit, namespaced contribution points. A plugin may contribute block definitions, patterns, inspectors, commands, panels, field adapters, transforms, render capability metadata, locales, or test fixtures. A plugin never receives ambient host authority.

Plugin manifests conform to [`plugin-manifest.schema.json`](../../schemas/plugin-manifest.schema.json).

## Manifest and code

The manifest is declarative and safe to inspect without executing plugin code. In `0.1-draft` it declares identity, plugin semantic version, exact document contract revision, activation class, entry modules, integrity metadata, contributions, required and optional capabilities, dependencies, permissions, and bundled locales.

The removed name `studioVersions` is not an alias for any current field. It was ambiguous between document contract, wire protocol, npm package, and release-set versions, and is therefore not accepted by the closed schema. Before Gate A, a host pins the exact tested Studio package/release set and separately checks `contractVersion`, dependencies, and required capabilities.

Gate A must define a separately identified and versioned public plugin API before adding a compatibility range for it. A plugin that contributes wire behavior must also declare the applicable wire requirement through a ratified capability or wire contract; neither value may be inferred from the plugin version or npm package version.

Per-plugin requested resource limits and explicit lifecycle-compatibility declarations are also Gate A manifest targets and are not accepted fields in the current closed schema. The resolved StudioConfig and canonical schema maxima bound plugins in `0.1-draft`, while the [extension lifecycle contract](extension-lifecycle.md) governs behavior. Gate A must add or deliberately reject manifest-level limits and lifecycle declarations before claiming that plugins can negotiate them. Namespaced extension data may support experiments but does not establish canonical plugin behavior.

A manifest does not make code trusted. The host separately verifies package provenance, signature or integrity, owner, allowlist policy, dependencies, and deployment generation.

Entry modules and contribution resources use the same restricted package-relative path primitive as bundled block icon assets and require canonical integrity digests. They are resolved only inside the verified owning package; they are never author-controlled URLs or filesystem traversal instructions.

## Namespacing and ownership

Every contribution ID begins with a namespace owned by the plugin. The `studio.*` namespace is reserved. A plugin cannot replace another owner's contribution. Overrides require an explicit host composition mapping and do not change ownership.

Duplicate IDs, undeclared registrations, registrations exceeding limits, incompatible contract versions, circular required dependencies, or privilege requirements absent from the manifest reject the entire plugin registration transaction.

## Registration

Plugins register against a scoped registrar during session compilation. Registration is atomic and produces an immutable session-generation registry. A plugin MUST NOT retain a registrar, mutate another generation, access a service container, or register during command execution.

The registrar exposes only the contribution kinds declared and permitted for that plugin. Most plugins SHOULD be declarative and require no JavaScript initialization.

## Authoring SDK

`@kumwe/studio-core` exports `defineStudioPlugin` as the typed authoring surface for plugin packages. At compile time it is an identity function over the closed manifest and block-definition types, so a misspelled or missing field is an editor error. At runtime it front-loads activation and nothing else. It checks:

- the manifest against the canonical `plugin-manifest.schema.json`;
- namespace ownership: every contribution ID sits in the plugin's namespace or a dotted sub-namespace of it;
- duplicate declarations: the same contribution ID may recur only at distinct versions;
- declaration coverage: every bundled block definition must be declared as a `block` contribution at the same ID and version;
- capability coverage: every renderer capability a bundled block requires must appear among the declared required or optional capabilities, and a contribution marked `executable` requires the manifest to declare `executable` activation;
- the contribution runtime's own activation transaction, applied as a dry run — owner match, per-owner duplicate rules, and the Studio Schema Profile check on property schemas are reused from the runtime, not reimplemented.

The SDK is a front-loaded mirror of activation and adds no invariant of its own: everything it rejects would be rejected identically by the extension lifecycle's activation step, and a violation throws the runtime's error shape — `StudioContributionError` carrying blocking diagnostics. A valid definition is deep-frozen and returned unchanged.

```ts
import { defineStudioPlugin } from '@kumwe/studio-core';

export default defineStudioPlugin({
  blocks: [priceBlockDefinition],
  manifest: {
    activation: 'declarative',
    contractVersion: '0.1-draft',
    contributions: [
      {
        executable: false,
        id: 'org.example.catalog/price',
        integrity: 'sha256-…',
        kind: 'block',
        resource: 'blocks/price.json',
        version: '1.0.0',
      },
    ],
    dependencies: [],
    entryModules: [],
    id: 'org.example/catalog-plugin',
    kind: 'plugin-manifest',
    label: { key: 'org.example.catalog/plugin' },
    optionalCapabilities: [],
    owner: { id: 'org.example/catalog', version: '1.0.0' },
    permissions: [],
    requiredCapabilities: [{ id: 'studio.renderer/web', versions: '^1.0.0' }],
    version: '1.0.0',
  },
});
```

Two companions keep hosts on the same single authority: `activateStudioPlugin` runs the same coherence checks and then hands the definition to the contribution runtime's transactional activation, and `unresolvedDeclaredContributions` projects the runtime's unresolved-reason vocabulary (`not-installed`, `incompatible`, `owner-disabled`, `owner-revoked`) onto declared non-block contributions so inactive-owner surfaces stay diagnosable without executing plugin code.

## Dependencies

Dependencies are identified by plugin ID and semantic version range. Required dependencies must be active and compatible before registration. Optional dependencies may enrich behavior through negotiated capabilities but their absence cannot invalidate the plugin's base contract.

Dependency resolution is deterministic. Hosts reject ambiguous duplicate versions unless the contract explicitly permits isolated multi-version execution.

## Executable surfaces

Custom panels, inspectors, transforms, or commands are executable and require a declared capability. The host decides whether they run in the application realm, isolated worker, sandboxed frame, or not at all. Plugins MUST support a declarative inspection mode in which administrators can inspect manifest contributions without executing code.

## Public API discipline

Plugins import only documented package exports. They MUST NOT:

- reach private DOM or internal state;
- patch prototypes or globals;
- access authentication material;
- call host endpoints outside ports;
- persist artifacts independently;
- generate executable output from author values;
- rely on registration order beyond documented deterministic ordering.

## Failure behavior

A failing plugin cannot leave partial registrations. Required-plugin failure prevents write mode for affected artifacts. Optional-plugin failure yields a typed diagnostic and preserves its namespaced data. The host records owner, version, integrity, rejection reason, and affected dependencies.

## Distribution

Official plugins are npm packages with provenance, lockfile evidence, generated type declarations, schema files, conformance tests, and an SBOM. Remote runtime imports are disabled by default. Hosts SHOULD bundle approved plugin assets into an immutable same-origin deployment.
