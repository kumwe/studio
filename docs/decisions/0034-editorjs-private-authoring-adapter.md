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

Editor.js remains the default private surface, but its `2.31.6` distribution injects runtime CSS and uses raw HTML
sinks. It therefore cannot run under a host profile that rejects inline styles and enforces Trusted Types without a
`default` policy. Such a host explicitly selects Studio's sink-free rich-text surface through the Studio-neutral
`strictContentSecurityPolicy` registry option. That surface uses the same canonical codecs and complete first-party
tool suite, including structured blocks, semantic inline marks, line breaks, block insertion/removal/reordering and
read-only behavior. It creates DOM through typed node APIs and does not create style elements, style attributes,
scripts or HTML-string sinks. The persisted contract and host integration do not change.

Studio will not create a permissive Trusted Types `default` policy, add `unsafe-inline`, or expose a vendor policy
configuration to make the default surface run. A future vendor build can enter this strict path only after a complete
sink review and equivalent browser evidence.

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
- Strict-CSP hosts retain structured authoring rather than falling back to plain text or weakening policy.
- The two private surfaces must pass the same canonical round-trip, profile, read-only and accessibility contract.

## Rejected alternatives

- Persist Editor.js output as the Studio artifact: rejected because it transfers model ownership and migrations
  to an implementation dependency.
- Let hosts configure Editor.js directly: rejected because it creates non-portable artifacts and inconsistent
  security policy.
- Create a permissive Trusted Types `default` policy or allow inline styles: rejected because it turns an editor
  implementation detail into a page-wide security downgrade.
- Disable rich-text features under strict CSP: rejected because policy compatibility must not change the canonical
  content capability.
- Treat the page builder as an Editor.js document: rejected because responsive structure, host resources and
  delivery rendering have different contracts.
- Infer downstream license compatibility from package boundaries alone: rejected because the distribution model
  and applicable rights require an explicit project decision.

## Verification

- Public-export tests reject Editor.js types and values at Studio boundaries.
- Canonical round-trip and hostile-input fixtures exercise every enabled tool profile.
- Focused strict-surface tests exercise every first-party block, semantic inline formatting, mutation ordering,
  read-only bindings, and the absence of style/script/HTML-string sinks.
- Package checks verify exact production pins, lock-derived notice inventory and tarball contents.
- Release evidence links the recorded Kumwe App distribution/licensing decision before an affected integration is
  promoted.
