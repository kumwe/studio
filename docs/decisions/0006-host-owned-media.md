# ADR 0006: Host-owned media with Studio-owned experience

- Status: proposed
- Scope: media integration

## Context

Image selection and upload are central to content authoring, but binary custody, processing, quotas, access control and public delivery belong to the embedding system.

## Decision

Provide `@kumwe/studio-media` for accessible browse, upload, progress, metadata, focal point, rendition and alternative-text experiences. Access every operation through a host media port. Persist opaque stable asset references and semantic rendition intent.

Do not create an independent media service repository as part of the initial architecture. A host implements
the port using its own media application services. For Kumwe App, Producer realizes the exact pinned Studio
media contract in PHP while App-owned media services retain authority, policy, and binary storage.

## Consequences

Studio can solve the author experience comprehensively without duplicating media custody. Host adapters must implement a substantial, secure media contract. Cross-host artifact transfer requires explicit asset export/import mapping.
