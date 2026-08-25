# ADR 0034: Keep Editor.js behind the Studio authoring boundary

- Status: proposed
- Date: 2026-08-25
- Owners: Studio architecture and security

## Context

Studio needs a capable, open-source structured-content editor inside page-builder blocks without making an
editor vendor's model part of the page artifact or host integration API. Hosts must be able to render the same
canonical content in Twig, native clients and other delivery stacks without loading the browser editor.

Editor.js 2.31.6 provides a block-oriented authoring core under Apache-2.0. Its tool ecosystem is useful input,
but third-party tool output, configuration and trust assumptions vary. Directly persisting Editor.js output would
couple migrations and renderers to that ecosystem and let optional tools widen Studio's contract silently.

## Decision

Use the exact `@editorjs/editorjs` 2.31.6 release only as the private browser implementation of Studio's rich-text
editor seam. Studio owns tool profiles, canonical codecs, validation, resource limits, read-only behaviour,
accessibility controls and host-port mediation. An editor instance receives and emits only through those adapters.

The public API exposes Studio factories and canonical values. It does not expose Editor.js constructors, tool
classes, configuration, callbacks or output JSON. An optional tool is enabled only when a Studio profile defines
its canonical shape and trust behaviour. Raw authored JavaScript is not a supported content capability.

The page builder remains a separate structural layer. Editor.js edits bounded leaf content; Studio commands own
sections, responsive layout, placement, resources, history and persistence.

Dependency notices and exact license texts travel in affected package tarballs. The unresolved Kumwe App
`GPL-2.0-only` combination is tracked as a release decision in
[`../governance/dependency-licenses.md`](../governance/dependency-licenses.md); this ADR makes no legal conclusion
and does not relicense either repository.

## Consequences

- Studio can replace the editor implementation without a protocol migration when canonical behaviour is stable.
- Hosts integrate with Studio conventions and never need Editor.js-specific code.
- Tool adoption requires schema, codec, threat, accessibility and conformance work rather than a configuration
  entry alone.
- Paste, HTML, media and resource operations remain governed Studio capabilities.
- The browser bundle and transitive dependency closure require reproducible supply-chain evidence.

## Rejected alternatives

- Persist Editor.js output as the Studio artifact: rejected because it transfers model ownership and migrations
  to an implementation dependency.
- Let hosts configure Editor.js directly: rejected because it creates non-portable artifacts and inconsistent
  security policy.
- Treat the page builder as an Editor.js document: rejected because responsive structure, host resources and
  delivery rendering have different contracts.
- Infer downstream license compatibility from package boundaries alone: rejected because the distribution model
  and applicable rights require an explicit project decision.

## Verification

- Public-export tests reject Editor.js types and values at Studio boundaries.
- Canonical round-trip and hostile-input fixtures exercise every enabled tool profile.
- Package checks verify exact production pins, lock-derived notice inventory and tarball contents.
- Release evidence links the recorded Kumwe App distribution/licensing decision before an affected integration is
  promoted.
