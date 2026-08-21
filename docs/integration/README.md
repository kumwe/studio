# Host integration

Studio is embedded through a versioned host contract. It does not assume a CMS, database, server language,
HTTP framework, renderer, media store, identity provider, or publication workflow.

Start with:

- [`generic-host.md`](generic-host.md) for the implementation-neutral integration sequence and conformance
  obligations;
- [`kumwe-app.md`](kumwe-app.md) for the first-party Kumwe App profile;
- [`../portability/README.md`](../portability/README.md) for language/runtime rules; and
- [`../media/README.md`](../media/README.md) for the media ownership boundary.

## Integration principle

Studio owns authoring intent and deterministic composition operations. The host owns authority and durable
effects.

| Studio owns                                           | Host owns                                                      |
| ----------------------------------------------------- | -------------------------------------------------------------- |
| Local command application and history                 | Authentication and authoritative authorization                 |
| Selection, canvas, outline, inspector and diagnostics | Content/business definitions and workflow policy               |
| Blueprint, entry and theme protocol validation        | Accepted revisions, persistence and transactions               |
| Capability-aware authoring behaviour                  | Capability grant and independent enforcement                   |
| Preview coordination and node selection               | Trusted rendering and preview data resolution                  |
| Media browsing/upload interaction                     | Media identity, storage, processing, access and retention      |
| Plugin/session registry compilation                   | Plugin trust, installation, ownership and lifecycle            |
| Portable recovery-envelope creation                   | Encryption, storage, expiry and authorization of recovery data |
| Localized diagnostic identifiers and arguments        | Translation catalogues, locale policy and host messages        |
| Telemetry events defined by the public contract       | Consent, collection, redaction, export and retention policy    |

Studio never treats a successful local command as a successful save or publish. Only an accepted host revision
makes a draft durable; only an authorized host publication makes it public.

## Required host capabilities

A writable Studio session requires ports for:

1. session and capability negotiation;
2. identity and permission context;
3. model, Blueprint, entry and theme load;
4. validation and optimistic-concurrency save;
5. preview/render coordination;
6. localization;
7. structured diagnostics; and
8. lifecycle/teardown.

Media, publication, model design, extension discovery, recovery, collaboration, external references,
telemetry, and offline operation are negotiated capabilities. A mode that needs one of them fails session
creation or becomes explicitly read-only when the capability is absent; Studio does not emulate host
authority.

## Integration profiles

| Profile                   | Required outcome                                                                                 |
| ------------------------- | ------------------------------------------------------------------------------------------------ |
| `headless-authoring`      | Load, validate, mutate, migrate and serialize through the command API without a DOM              |
| `web-authoring`           | Lit/Web Component shell, preview bridge, keyboard/touch access, host persistence and recovery    |
| `server-rendered-preview` | Host-rendered preview with opaque node markers and no reverse parsing of DOM                     |
| `media`                   | Browse/upload/process/select flows through stable asset references                               |
| `extensions`              | Owner-aware contribution generation with lifecycle and unresolved-node handling                  |
| `native-dart`             | Generated Dart models and equivalent applicable commands/fixtures                                |
| `flutter-authoring`       | Native Flutter shell using the portable protocol and host ports, not a hidden browser dependency |
| `kumwe-app`               | Kumwe App-specific security, Twig, KIS, extension, revision, translation and recovery rules      |

A host publishes the profiles and capability versions it supports. Marketing language must not imply a profile
that has not passed its conformance suite.

## Gate relationship

Before Gate A, integrations are discovery spikes. Gate A permits durable integration against the frozen
release-candidate boundary. Gate B qualifies the published packages and named host profiles for release. See
the [delivery programme](../roadmap/README.md).
