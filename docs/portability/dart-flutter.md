# Dart and Flutter plan

Kumwe App's future native Flutter client must be able to author the same Studio artifacts without making the web
implementation the hidden source of truth. This is Version 3 scope. The Dart track shares the language-neutral
contract, fixtures, and release discipline, but its delivery and qualification do not block Version 2 gates.

## Supported integration choices

### Native Flutter authoring

This is the target first-party profile. Flutter widgets implement the authoring shell over Dart protocol/core
APIs and the same host ports. It supports keyboard, pointer, touch and screen-reader operation without an
embedded browser.

### Hardened WebView authoring

A host may embed the published web-authoring build for faster third-party adoption. It remains a separate
profile and must use a typed bridge with strict origin, navigation, file-access, clipboard, upload, external
link, storage and token rules. No host credential appears in a URL or durable web storage.

Kumwe App does not use the WebView profile to claim its one-to-one native Flutter objective has been met.

### Native delivery rendering

A Flutter application may render published artifacts natively. It advertises supported block/theme/renderer
versions. Unsupported constructs show a safe diagnostic/fallback or defer to a host-rendered representation;
they are never silently omitted in writable mode.

## Package plan

The Dart release set contains:

| Package                 | Responsibility                                                                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `kumwe_studio_protocol` | Generated immutable models, enums, JSON codecs, schema/version metadata, canonicalization and safe diagnostics                             |
| `kumwe_studio_core`     | Deterministic commands, transactions, validation, selection/history semantics, migrations and contribution registry for the native profile |
| `kumwe_studio_host`     | Transport-neutral host ports, capability negotiation, cancellation, request IDs, idempotency, conflicts and recovery envelopes             |
| `kumwe_studio_flutter`  | Native canvas/outline/inspector/palette, responsive controls, media/rich-text adapters and accessible interactions                         |
| `kumwe_studio_testkit`  | Shared fixture runner, fake boundary adapters, host/plugin/renderer conformance and Flutter interaction harness                            |

Names are Version 3 release-policy inputs; final registry availability and collision checks precede any native
profile claim. Generated sources carry schema digest and generator version and are reproduced in CI.

## Generation and semantic parity

JSON Schema generation covers structural types only. Semantics that a generator cannot express—canonical
decimals, revision preconditions, move validity, permissions, migrations, unknown-extension preservation,
resource bounds and stable diagnostics—live in language-neutral fixtures and handwritten public runtime code.

For every portable command vector, CI records:

1. canonical starting artifact;
2. session capabilities and finite limits;
3. command or transaction;
4. accepted result or stable failure;
5. inverse/undo boundary where applicable;
6. canonical final bytes and checksum; and
7. TypeScript and Dart results.

Both runtimes must agree. Platform-specific stack traces, exception text, object hashes and map iteration order
are not part of the contract.

## Flutter authoring architecture

The native shell uses the same conceptual panes as the Lit shell but owns its widgets:

- palette of allowed blocks, fields and patterns;
- canvas or structured preview with selection overlays;
- outline/tree as a complete non-drag authoring route;
- schema-driven inspector and binding controls;
- viewport/design-profile controls;
- diagnostics, save/conflict/recovery and command palette;
- media browser/upload and bounded rich-text controls; and
- host-rendered or native preview selected by negotiated capability.

Flutter widgets dispatch semantic commands; they never mutate a JSON map directly. UI state such as hover,
selection geometry, panel position and zoom remains outside portable artifacts.

For a Twig-backed host, the Flutter shell can display authenticated server-rendered preview in a hardened view
or render a declared native preview profile. Editing state still comes from Dart core, never from scraping the
preview.

## Host transport

The Dart SDK accepts a host adapter. A Kumwe App client normally uses generated REST/OpenAPI transport, while an
embedded desktop/mobile host may use an in-process bridge. Both preserve:

- exact protocol/capability negotiation;
- actor/site/organization/resource context;
- request IDs, timeouts and cancellation;
- expected revisions and idempotency keys;
- structured validation, policy, conflict, unavailable and incompatible errors;
- upload streaming/progress/cancellation without buffering unbounded media; and
- reauthentication/step-up as a host-owned interaction rather than a credential field in Studio.

Offline authoring is deny-by-default. A host that enables it declares recovery/encryption, base-revision,
command-log limits, reference staleness, media staging, reconnect conflict and publication restrictions. Local
state never implies a durable server save.

## Accessibility and device behaviour

The Flutter profile must prove:

- keyboard navigation, focus visibility, shortcut discovery and non-drag commands on desktop;
- touch targets, scrolling, drag alternatives, orientation and responsive pane behaviour on mobile/tablet;
- semantic labels, roles, values, live announcements, ordering and screen-reader workflows on supported
  Android, iOS and desktop targets;
- text scaling/reflow, contrast, reduced motion, high contrast where available, and bidirectional layouts;
- error prevention/identification and focus return after preview refresh, dialog, undo, conflict and upload;
- no gesture that lacks an accessible command/menu equivalent.

Platform limitations are documented as support boundaries, not disabled tests. A target is supported only when
its required matrix passes.

## Version 3 delivery sequence

| Version 3 point      | Dart/Flutter outcome                                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Contract candidate   | Generator evaluation, package/API boundaries, Flutter interaction specification, and exact native profiles are reviewed  |
| Generated models     | Dart and TypeScript round-trip the applicable canonical corpus; capability and error mappings are frozen                 |
| Headless SDK         | Dart command, validation, migration, serialization, and host core pass `studio.profile/engine-dart`                      |
| Native shell         | Flutter completes the semantic command set, responsive layout, and accessible non-drag routes                            |
| Host integration     | Native media, rich text, extension/theme handling, preview, and a Kumwe App transport adapter are integrated             |
| Qualification        | Cross-runtime, supported-platform, accessibility, performance, upgrade/recovery, and clean-registry evidence is produced |
| Native profile claim | Dart/Flutter packages ship as one tested Version 3 set; unsupported capabilities remain explicit                         |

## Gate evidence

Version 3 contract evidence includes generated-source reproducibility, schema digest, valid/invalid round-trip corpus,
canonical bytes, feature negotiation and a clean Dart consumer build.

Version 3 release evidence includes command/migration parity, Flutter interaction and accessibility matrices, host
transport failure/retry/conflict, media streaming, lifecycle/unknown-data preservation, clean pub.dev install,
signed release provenance, and a Kumwe App end-to-end workflow using the same application semantics as the web
surface.
