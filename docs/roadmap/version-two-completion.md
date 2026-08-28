# Version 2 completion track: Kumwe App integration and qualification

**Objective.** Carry the implemented Studio browser/runtime boundary through one real Kumwe App PHP
integration, one reproducible acceptance journey, and the governed beta-to-RC qualification path. This is a
delivery sequence, not a second product specification or implementation-status ledger.

The [Studio product contract](../product-contract.md) is the sole authority for the target and stable
`STUDIO-PROD-001`–`015` identifiers. [`STATUS.md`](STATUS.md) is the sole authority for current implementation,
profile, release, Gate A, and Gate B state. Canonical shape and behavior live in
[`schemas/`](../../schemas/README.md) and [`docs/contracts/`](../contracts/README.md). The exact cross-repository
boundary is [`docs/integration/version-two-joint-plan.md`](../integration/version-two-joint-plan.md).

## Fixed boundary

Version 2 is the compiled browser authoring product. Dart and Flutter remain Version 3 targets. Kumwe App is
the first real host, not a dependency embedded in Studio packages.

- Studio mounts in the exact content context, either inline or on a context-preserving route.
- A mount with no transport opens isolated blank local authoring with the compiled built-in catalog, zero
  network requests, and project/save-intent JSON interchange.
- A hosted mount uses only the exact declared routes, authentication projection, resolved session locks, and
  target-admitted contributions. Missing or refused host work never becomes local success.
- Kumwe App owns identity, authorization, disclosure, persistence, validation, revisions, transactions,
  workflow, audit, webhooks, preview, publication, and public rendering through PHP application services and
  PHP HTTP endpoints.
- Node.js, npm, Vite, and server-side JavaScript remain build/test/release tools only. Production deploys
  verified prebuilt browser assets.
- Beta remains the development channel until implementation and qualification are complete. A green repository
  or reference demo is not an RC, conformance, support, or production claim.

## Do not rebuild the landed Studio boundary

The Studio repository now contains the public browser deployment contract, isolated local and hosted mounts,
the contextual target/start coordinator, separate Model/Blueprint/Entry drafts, blank/from-type/existing
starts, the three explicit save outcomes, presentation-state continuity, the six-kind contribution lifecycle,
the production browser archive, and the PHP-neutral HTTP contract. Those surfaces still require the exact
verification and status treatment recorded in `STATUS.md`, but they are the integration boundary—not a new
backlog to reimplement under host-private shapes.

An implementation agent starts from these canonical entry points:

| Concern                                                           | Canonical entry point                                                                                                          |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Browser mounting and local/hosted selection                       | [Studio browser deployment](../contracts/studio-deployment.md)                                                                 |
| Exact HTTP requests, results, errors, routing, and authentication | [Host transport](../contracts/host-transport.md)                                                                               |
| Contextual target, type selection, session, and save semantics    | [Studio configuration](../contracts/studio-configuration.md) and [content/entry contract](../contracts/content-and-entries.md) |
| Host/session catalog locks and contribution admission             | [Extension lifecycle](../contracts/extension-lifecycle.md)                                                                     |
| Generic server responsibilities                                   | [Generic host guide](../integration/generic-host.md)                                                                           |
| Kumwe PHP mapping                                                 | [Kumwe App guide](../integration/kumwe-app.md)                                                                                 |
| Executable PHP boundary example                                   | [`examples/php-authoring-host`](../../examples/php-authoring-host/README.md)                                                   |
| Prebuilt asset/archive consumption                                | [Prebuilt browser assets](../integration/prebuilt-browser-assets.md)                                                           |
| Current gaps and evidence state                                   | [`STATUS.md`](STATUS.md)                                                                                                       |

Do not create a second route vocabulary, copy the built-in catalog into Kumwe App, configure Editor.js from the
host, assign private custom-element properties, or replace the public coordinator with a host-specific editor.
A Studio-side change is warranted only when the public contract or a reproducible integration test exposes a
generic defect.

## One dependency-ordered completion sequence

### Goal 1 — Freeze one consumable Studio beta input

1. Complete the repository gate for the exact Studio commit.
2. Build the self-contained browser archive and verify its manifest, checksums, schema closure, PHP reference,
   and zero runtime-package-manager declaration.
3. Run the local mount, hosted transport, multi-mount isolation, contribution lifecycle, browser, accessibility,
   and PHP reference lanes.
4. Merge the generated beta version operation and record one exact eight-package coordinate, release record,
   browser-archive digest, and corpus digest for the App integration branch.

**Done when:** the App can consume one immutable beta family and archive without a workspace checkout or a
production Node/npm install. This goal does not claim a supported host or RC.

### Goal 2 — Implement the Kumwe App PHP adapter

For each eligible core or extension-owned content surface, Kumwe App PHP:

1. resolves the target and exact resource context;
2. emits one inert, bounded deployment document beside the ordinary mount;
3. supplies exact operation routes plus one supported authentication/CSRF projection;
4. returns authorized type choices and one exact Model/Blueprint/Entry session;
5. enforces the session block/plugin locks and target-admitted contribution generation;
6. implements plan-save, save-item, save-new-type-version, and save-as-new-type as independently authorized,
   validated, revisioned, audited transactions;
7. maps resource, media, preview, localization, workflow, publication, and renderer seams to existing PHP
   application services; and
8. emits webhooks/outbox events only after an accepted server transaction.

The App may use one controller/dispatcher or an operation map. Both must preserve the same canonical bodies,
error taxonomy, idempotency, expected-revision, origin/CSRF, and authorization behavior. The browser is never
the authority merely because it received configuration.

**Done when:** compiled Studio mounts from normal App create/edit flows, every server effect terminates in PHP,
configured denials remain denials, and neither deployment nor operation requires server-side JavaScript.

### Goal 3 — Prove the real contextual journey

Run `STUDIO-PROD-015` against the exact pinned Studio beta and real Kumwe App adapter. The recorded journey must
cover two isolated mounts, backendless import/export, configured denial, core and extension targets, existing
exact-version hydration, blank and from-type creation, fields/layout/values in one session, all three save
outcomes, reopen/revision reconciliation, presentation continuity, extension block/field/pattern lifecycle,
semantic PHP/Twig rendering, and pointer/keyboard/structural-control parity.

Add adversarial lanes for authentication expiry, CSRF/origin refusal, malformed and oversized JSON, missing
routes, conflict/idempotent retry, contribution-generation drift, permission reduction, media/preview failure,
restart/recovery, and two simultaneous hosted mounts with distinct routes and session state. A test must use the
compiled browser artifact and real PHP HTTP boundary; a JavaScript mock plus a separate handcrafted PHP request
is useful unit coverage but not this integration proof.

**Done when:** the exact integrated system produces reproducible repository evidence for every journey step and
leaves manual/external requirements explicitly pending rather than inferred.

### Goal 4 — Qualify, review, and promote

1. Complete the selector-neutral `authoring-web` assertion set and supported browser/accessibility/security/
   recovery/performance matrices.
2. Replay the portable host, HTTP, contribution, preview, media, binding, schema, and renderer corpora through
   Kumwe App and the required independent host/renderer.
3. Record implementation state only through the exact-commit process in `STATUS.md`.
4. Prepare a new immutable RC only after all 15 implementation rows and all fixed profile assertion sets are
   repository-executable.
5. Reproduce and accept Gate A evidence before publishing the official `rc`; complete Gate B before stable.

Any changed candidate receives a new coordinate and affected evidence. Historical `0.1.0-rc.1`, a workspace
tree, a mixed package family, a profile label, or a reference-host screenshot cannot substitute for this path.

## Commit and review discipline

Keep the work in one reviewable integration PR when practical, using dependency-ordered commits that each
leave the branch testable:

1. exact beta/archive pin and PHP bootstrap;
2. target/type/start endpoints;
3. save transactions and revision reconciliation;
4. contributions plus resource/media/preview services;
5. compiled-browser-to-real-PHP journey and negative cases;
6. qualification evidence and truthful documentation.

Each commit uses the existing contracts and adds the lowest responsible tests. Do not mark a later goal done
because an earlier unit test is green, and do not update gate or profile status without the immutable evidence
fields required by `STATUS.md`.

## Completion boundary

Version 2 is complete only when the same immutable candidate has the contextual implementation, real Kumwe App
PHP/Twig journey, required independent replay, supported manual accessibility and production matrices, exact
package/provenance/clean-consumer evidence, accepted gate decisions, and truthful release/support language.
Until then, it remains governed beta work with no official RC, stable, production-host, or conformance claim.
