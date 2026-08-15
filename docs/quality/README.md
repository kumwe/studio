# Quality and qualification strategy

Studio quality is an observable product property, not a count of features, tests, files or screenshots. A
release must protect typed content, host authority, portability, accessibility, security, resilience and
replaceability across the exact profiles it claims.

The current repository is a foundation programme. The initial CI workflow is not Gate A or Gate B evidence by
itself. Qualification grows in the dependency order defined by the [roadmap](../roadmap/README.md), and status
changes only through the [evidence model](../roadmap/evidence.md).

## Definition of done

A change is complete only when:

1. normative prose, schemas, generated types, fixtures and implementation agree;
2. compatibility and migration impact is classified;
3. deterministic failure behaviour and stable diagnostics are specified;
4. tests cover the lowest responsible package and every affected public boundary;
5. security, privacy, accessibility, localization, portability and host-authority impacts are exercised;
6. TypeScript and Dart impact is accounted for;
7. documentation covers users, host integrators and extension/theme authors as applicable;
8. package/release metadata and changesets are correct; and
9. reproducible evidence is attached before any programme or support claim changes.

Merged code that lacks integration/gate evidence may be foundation implementation, but it is not a qualified
capability.

## Quality attributes

| Attribute            | Required guarantee                                                                                                                               | Representative evidence                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Integrity            | Commands, revisions, validation, migration and canonical bytes are deterministic; conflict never becomes silent data loss                        | Golden/property transitions, concurrency, corruption, migration and recovery                |
| Security/privacy     | Bounded inert artifacts, least-authority ports, trusted contributions, isolated preview, hostile media/rich text handling and redacted telemetry | Threat matrix, negative corpus, CSP/message tests, dependency/supply-chain review           |
| Accessibility        | Complete non-drag operation, semantic UI, error prevention, output assistance and equivalent web/Flutter operation                               | Automated checks plus keyboard, touch, screen-reader, zoom/reflow and authoring-task review |
| Portability          | Schemas/commands/errors/capabilities have consistent TypeScript and Dart meaning                                                                 | Cross-runtime canonical fixtures, clean consumers and alternative host/renderer             |
| Extensibility        | Namespaced owner-aware immutable registries survive lifecycle changes without data loss                                                          | Third-party block/theme/host, collision, disable/revoke/reactivate/upgrade fixtures         |
| Replaceability       | No canonical DOM/vendor project state; hosts/renderers depend only on public contracts                                                           | Second host, non-Twig renderer and preview-rebuild proof                                    |
| Resilience           | Timeouts, stale revisions, disconnects, crashes and invalid plugins degrade explicitly and recover safely                                        | Failure injection, restart, recovery-envelope and interrupted-upgrade drills                |
| Internationalization | Locale-independent artifacts; localized/RTL/pseudolocale UI and diagnostics                                                                      | Catalogue checks, long-label/RTL/plural/date/number fixtures and locale switch              |
| Performance          | Finite limits, responsive core/UI, cancellable/coalesced preview/media operations                                                                | Reproducible benchmarks and enforced regression budgets                                     |
| Observability        | Correlated safe diagnostics and lifecycle events without hidden content or secrets                                                               | Trace schemas, redaction tests, failure/operator runbook proof                              |
| Release integrity    | Reviewed sources and dependencies produce the published bits                                                                                     | Clean rebuild, SBOM, provenance, signature/checksum and registry reinstall                  |

## Test architecture

### Contract and schema

- Meta-validate every schema and prohibit unresolved references.
- Maintain valid, invalid, boundary, malicious, prior-version and migration fixtures.
- Generate TypeScript and Dart models and verify a clean regeneration diff.
- Validate examples and documentation snippets against the exact schema/version they describe.
- Run public API/schema compatibility diff against every supported release.
- Map each normative `MUST`/`MUST NOT` statement to an executable assertion or an identified manual procedure.

### Headless core

- Unit-test each invariant and stable diagnostic.
- Property-test arbitrary valid trees, commands and transactions; preserve IDs, ordering and unaffected data.
- Fuzz parsers, validators, canonicalization, paths, prototype-like keys, deep/wide trees and extension envelopes.
- Prove apply/reject/undo/redo/transaction semantics, including command failure atomicity.
- Run deterministic tests with randomized object insertion order and repeated clean processes.
- Mutation-test high-risk command, migration, permission and canonicalization logic; surviving relevant mutants
  are test gaps, not accepted noise.

### Host, preview and contributions

- Test public ports with real transports/persistence boundaries, not only in-memory doubles.
- Exercise expected-revision conflict, idempotent retry, timeout, cancellation, permission reduction, expired
  session, stale contribution generation and partial capability.
- Pin preview origin/session/protocol/revision; reject malformed, oversized, replayed and unsolicited messages.
- Prove extension/theme collision, trust failure, optional/required failure, disable, revoke, reactivate,
  upgrade, fallback and unresolved-node behaviour.
- Prove authoritative host validation can reject a locally valid command without corrupting local accepted
  state.

### Authoring interfaces

- Component tests cover semantics, focus, keyboard, pointer/touch, localization and state changes.
- End-to-end scenarios use real built packages and a reference host.
- Every drag/resize/nest/reorder action has a tested outline/inspector/keyboard equivalent.
- Browser and Flutter flows cover start, resume, save, conflict, preview failure, upload failure, permission
  reduction, plugin disappearance, migration and recovery.
- Visual regression supplements semantic/interaction assertions; a matching screenshot never proves behaviour
  or accessibility by itself.
- JavaScript-disabled qualification applies to host/public output and host recovery; the Studio web authoring
  shell itself may require JavaScript but must fail clearly and preserve a non-Studio host fallback.

### Media and rich text

- Use real streaming/upload adapters for size, cancellation, retry, deduplication and processing-state tests.
- Test malicious/ambiguous MIME, oversized dimensions, active formats, unsafe filenames, private metadata,
  quarantine and cross-owner reference attempts.
- Paste fixtures cover office/web markup, Unicode, bidi, links, unsupported nodes and size/depth limits.
- Stored rich text is validated structured data; sanitization and server-renderer output receive independent
  XSS tests.
- Media/rich-text public output is accessible without editor-only markup or runtime.

### Portability

- TypeScript and Dart consume the same fixture bytes and emit identical canonical results/checksums.
- Each language applies supported command and migration vectors to the same result or stable error.
- Unknown optional/required capabilities and extension data test lossless preservation/read-only negotiation.
- npm and Dart packages install in clean projects without workspace paths or undeclared tools.
- Generic/Kumwe and server/native renderer profiles prove no route/class/Twig/Flutter implementation leaks
  into portable artifacts.

## Accessibility and authoring quality

WCAG 2.2 AA and applicable ATAG 2.0 requirements are the floor, not the ceiling. Studio maintains a stronger
authoring quality profile that includes:

- all structure, sizing, binding and configuration operations without dragging or fine pointer movement;
- discoverable keyboard commands and persistent outline/inspector alternatives;
- semantic landmarks, names, roles, states, descriptions, errors and progress;
- focus preservation/return across preview reload, dialogs, undo, deletion, conflict, permission change and
  asynchronous media/rich-text operations;
- high contrast, visible focus, 200% text scaling, 400% reflow/zoom, reduced motion, RTL and long translations;
- pointer/touch target and gesture alternatives on supported mobile/desktop profiles;
- author assistance for headings, alternative/decorative text, captions, link purpose, contrast, motion,
  language, label association and accessible interactive blocks;
- prevention or explicit confirmation of destructive/migration/publication actions; and
- accessible output templates/blocks with server-rendered no-JavaScript semantics.

Automated axe/semantics checks are necessary but insufficient. Release evidence includes human keyboard,
screen-reader, touch, zoom/reflow, high-contrast and representative authoring-task reviews on the supported
matrix. A platform limitation narrows the published support profile; it does not justify disabling a test while
claiming support.

## Supported environment matrix

Exact versions are recorded in each release manifest. Gate B covers at least:

- current and preceding stable Chromium, Firefox and WebKit/Safari desktop engines;
- current stable Android Chrome and iOS Safari for supported web-authoring workflows;
- supported Windows, macOS and Linux desktop environments for browser and Flutter desktop claims;
- supported Android/iOS versions for Flutter mobile claims;
- current supported stable Dart/Flutter line plus the preceding line when the SDK's language constraints permit;
- clean npm consumers on the repository-declared Node/npm versions;
- generic reference host and Kumwe profile; and
- Kumwe's supported PHP and MariaDB/MySQL/PostgreSQL matrix for its adapter.

An environment is removed only through compatibility/release policy and published migration/support dates.

## Performance and resource budgets

Security-critical maxima for nodes, depth, slots, property bytes, rich text, commands, history, plugins,
preview payload/rate and media batch/bytes are part of session negotiation and cannot be absent.

The reference performance floor is:

- a command affecting one node completes headless state update in under 16 ms at p95 for a 1,000-node
  Blueprint on published reference hardware;
- selection, keyboard movement and local inspector edits remain responsive without waiting for preview;
- pointer/keyboard input-to-visible local response remains below 100 ms at p95 in representative documents;
- preview updates are revision-labelled, cancellable and coalesced so a stale result never replaces a newer
  state;
- opening or scrolling a large palette/media collection uses bounded rendering/virtualization; and
- optional rich-text, media and plugin code is lazy-loaded and does not enter the base shell bundle by default.

`M1-04` defines reference hardware and benchmark method; `M6-04` publishes measured package/startup/large-
document/media/Flutter budgets and converts them into regression thresholds before Gate B. A threshold change
requires evidence and release-note classification, not a quiet test edit.

## Execution lanes

| Lane              | Trigger                | Required scope                                                                                                                                                                           |
| ----------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local             | Before handoff         | Formatting, lint, type, schemas/contracts, affected unit/property tests, build                                                                                                           |
| Pull request      | Every change           | Clean install, local lane, architecture/public-API checks, affected integration, package pack/install, secret scan                                                                       |
| Main              | Every merge            | Pull-request lane plus reference-host, browser smoke and generated-source verification                                                                                                   |
| Nightly           | Scheduled/current main | Full browsers, Dart/Flutter, property/fuzz/mutation, dependency scan, integration failures, localization/RTL, accessibility automation, compatibility matrix, benchmarks                 |
| Release candidate | Immutable RC           | Full supported matrix, manual accessibility/security/usability, generic/Kumwe lifecycles, migrations/recovery, reproducible builds, SBOM/provenance/signatures, registry clean consumers |

Skipped tests are failures unless the environment is outside the published profile and the skip is validated by
the matrix manifest. A test that cannot execute on its claimed platform must be corrected or the claim narrowed;
it is not repeatedly retried until green.

## Flake, retries and failure ownership

- A retry is recorded as flake evidence; it never hides the first result.
- Release/gate evidence contains no unexplained retry.
- Quarantine has a named owner, defect, impact, expiry and profile effect. Mandatory security, accessibility,
  integrity, compatibility or core conformance tests cannot be quarantined for release.
- Timeouts use observable conditions and bounded waits, not arbitrary sleeps.
- Browser/Flutter failures retain trace, screenshot/video where useful, console/network logs and accessibility
  tree/semantics evidence with secrets removed.
- A false-positive test is repaired with a fixture/rationale; it is not deleted merely because implementation
  repeatedly fails it.

## Coverage and traceability

Line coverage is diagnostic, not the release objective. Quality reports include:

- normative-contract-to-test mapping;
- command/error/schema variant coverage;
- branch and mutation coverage for high-risk core logic;
- supported profile/environment coverage;
- accessibility interaction matrix;
- threat/control/test mapping;
- migration version-pair coverage; and
- work-package/gate-to-evidence mapping.

Any critical invariant without executable or explicit manual evidence blocks its package acceptance.

## Test data and privacy

Fixtures are deterministic, synthetic, minimal and clearly non-secret. No customer content, production URL,
credential, access token, private media or personal information enters source, snapshots, traces or evidence.
Security vectors derive readable fixed values rather than random-looking secrets. Logs and screenshots are
redacted at capture and scanned before publication.

## Documentation quality

Documentation checks verify internal/external links, heading anchors, code snippets, schemas, package exports,
version references, generated API docs, glossary terms and absence of unsupported implementation claims. A
clean-room host/plugin/theme integration is the decisive documentation test before Gate B.

## Release qualification

Gate A quality proves the declared integration boundary is complete, internally consistent, machine-checkable,
portable to generated TypeScript/Dart models, threat-reviewed and executable as conformance fixtures.

Gate B quality proves those contracts are implemented and supportable in published artifacts. It includes real
generic/Kumwe hosts, web/Flutter interfaces, extension/theme/media lifecycles, accessibility/security/performance
matrices, migration/rollback/recovery, reproducible releases and clean-registry consumers.

The exact evidence schema and reviewer rules are in [`../roadmap/evidence.md`](../roadmap/evidence.md); release
construction is in [`../governance/releases.md`](../governance/releases.md).
