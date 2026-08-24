# ADR 0024: Project host models into read-only field-binding affordances

- Status: proposed
- Scope: model-port consumption, Blueprint field bindings, authoring controls and portability

## Context

The protocol already declares `model.list` and `model.get`, `content-model` documents, field-binding
sources and block ports. The headless host-session handle nevertheless exposed only Blueprint persistence
and recovery, while the shell accepted arbitrary binding JSON. A host could project a real content type but
Studio had no public route to read it and no deterministic rule for deciding which fields a block port could
bind. A removed or changed field consequently had no binding-specific diagnostic.

The model document is host-owned policy output. Its field visibility has already been authorized, its exact
revision is immutable, and its workflow and translation rules remain in the host domain. Making Studio a
model-definition editor as a side effect of Blueprint authoring would cross that boundary. Inferring controls
from labels, storage names or runtime values would also make two hosts project different authoring behavior.

## Decision

An opened Blueprint host-session exposes a read-only `models` surface only when capability negotiation and
the adapter both provide `studio.operation/model.list` and `studio.operation/model.get`. Calls use the normal
session envelope with the exact operation ID, protocol, locale, resource context and generation. The boundary
schema-validates returned content models, checks the requested ID/version/revision, rejects duplicate list
coordinates, returns detached snapshots and shares the handle's stale-generation invalidation. It never
invents model create, save, migrate or publish behavior.

Core publishes a pure `projectBlueprintFieldBindings` operation. It compares the supplied model with the
Blueprint's exact locked ID, semantic version and revision, then projects each node's declared block ports in
node preorder. Candidate fields follow declared authoring order, then declaration order. A candidate must
match the port's cardinality and value type: exact kinds match; `text` additionally accepts `string` and
`enum`; `number` additionally accepts `integer` and `decimal`; a collection matches through its declared
`itemKind`. Single-cardinality object children have stable nested field paths. Authoring-hidden fields are
not offered. All coordinates use field IDs, never labels or host storage names.

Existing bindings are preserved byte-for-byte. Missing fields, incompatible kind/cardinality, removed ports
and model-coordinate drift produce stable `studio.binding/*` diagnostics and an invalid projection; no
binding is repaired or discarded. Non-field sources remain visible as such. Required unbound ports warn.
Every input and output is detached, so a shell or caller cannot mutate the host projection through aliasing.

The Lit shell receives the already-authorized active `ContentModelDocument` as a public property and renders
field choices from that projection. Selecting a field dispatches the existing canonical `set-binding`
command. The selected field's declared `authoring.control` is shown exactly. Built-in controls receive a
non-editing preview; a namespaced control reports that the host must provide its field-adapter contribution.
The shell does not infer a replacement control, edit an entry value, or change model/workflow/translation
policy. When a negotiated model port has no active projection, free-form binding JSON stays disabled.

The language-neutral `studio.profile/binding-projection-v1` corpus fixes complete Blueprint/model/block
inputs and normalized candidate, control, status and diagnostic output. It intentionally excludes localized
prose so a second host can reproduce semantics in another language.

## Consequences

Blueprint composition can bind to a real host content type without importing host code into Studio. A model
change is visible and migratable instead of silently destructive, and the same portable vectors constrain
another host. Older generic shells retain their legacy binding editor only when no model port is advertised.

The host remains responsible for authorization before projection, omission of non-disclosable fields,
definition lifecycle, migrations, workflows, translations and entry writes. The current seam reads content
models; business-record projection remains a host-specific parallel adapter and cannot be inferred from a
content model.

## Rejected alternatives

Letting the shell call a `HostAdapter` directly was rejected because it would duplicate negotiation,
context, error and invalidation rules. Adding model mutations to the read seam was rejected because no
authorized publication use case or concurrency contract is present. Matching fields by label or storage name
was rejected because those coordinates are unstable and host-specific. Silently dropping invalid bindings
was rejected because it destroys migration evidence. Treating every namespaced control as a text input was
rejected because that fabricates host field policy.
