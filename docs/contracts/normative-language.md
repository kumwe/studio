# Normative language

The key words **MUST**, **MUST NOT**, **REQUIRED**, **SHOULD**, **SHOULD NOT**, **MAY**, and **OPTIONAL** are to be interpreted as described by RFC 2119 and RFC 8174 when, and only when, they appear in uppercase.

## Terms

- **Artifact:** a persisted, portable Studio JSON document.
- **Host:** the embedding application that owns identity, authorization, persistence, publication, media, and rendering services.
- **Session:** one negotiated authoring context with immutable capability, plugin, model, theme, and limit inventories.
- **Schema epoch URI:** the major compatibility family encoded in a canonical schema `$id`, currently the unratified `/studio/v1/` target.
- **Document contract revision:** the exact, not necessarily SemVer discriminator carried in a canonical document's `contractVersion`.
- **Wire protocol version:** the SemVer identifier negotiated for host-port and preview-channel behavior.
- **Revision:** an immutable exact state assigned by the host.
- **Version:** a semantic compatibility identifier assigned by an artifact owner.
- **Integrity:** an exact `sha256`, `sha384`, or `sha512` digest using canonical padded base64 and the hash algorithm's required decoded length; it verifies bytes but does not establish owner trust or grant authority.
- **Definition:** a contract describing a type, block, theme, plugin, command, operator, or host capability.
- **Node:** an instance of a block definition in a blueprint.
- **Binding:** a declarative connection from a block port to typed data.
- **Port:** a typed host operation exposed to Studio.
- **Renderer:** trusted code that transforms validated artifacts and resolved data into an output surface.
- **Capability:** a versioned statement of supported behavior, not an authorization grant.
- **Permission:** host-issued authority for the current actor and resource context.
- **Resource context:** a bounded, non-secret host-minted key and safe identifier projection that describes the session's surface, scopes, and optional active resource; it is not authority.
- **Diagnostic:** structured, localized information with a stable code, severity, location, and remediation metadata.

## Sources of truth

Authority is divided by concern rather than resolved by a silent override hierarchy:

- Canonical JSON Schemas govern serialized shape: required members, data types, closed/open objects, lexical constraints, and structural alternatives.
- Ratified normative contract prose governs meaning and behavior: invariants, state transitions, authorization, lifecycle, compatibility, failure, security, and accessibility semantics.
- Executable conformance fixtures must instantiate and prove both sources for the applicable schema epoch and document contract revision.
- Generated language bindings, implementation code, examples, ADR rationale, and explanatory prose do not redefine either source.

When a schema and normative contract overlap, they MUST agree. A contradiction or material ambiguity is a contract defect that blocks package or contract release until the schema, prose, and fixtures are deliberately reconciled in the same change. Neither source silently overrides the other, and implementations MUST NOT guess in ways that could execute code, publish invalid content, lose data, or weaken authorization.

## Validation layers

Validation runs in this order:

1. Decode valid UTF-8 JSON and enforce byte/depth limits.
2. Validate the selected schema and reject ambiguous contract-version selection.
3. Enforce namespacing, ownership, references, tree, type, permission and capability semantics.
4. Apply host domain and publication policy.

Client-side acceptance is advisory. The host MUST repeat all validation relevant to persistence, rendering, or publication.
