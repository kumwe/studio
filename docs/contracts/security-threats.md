# Threat enforcement registry

Each principal threat from the [security contract](security.md) carries a stable identifier bound
to a representative executable rejection — a negative fixture, a test suite, or a check-lane
script that must exist in the repository. `scripts/check-threats.mjs` verifies every enforcement
path; `open` is an honest gap that blocks `M2-07` acceptance. A row names one representative
artifact; related coverage is listed in the notes. Removing or renumbering an identifier is a
breaking change to recorded evidence.

| ID     | Threat                                    | Enforcement                                              |
| ------ | ----------------------------------------- | -------------------------------------------------------- |
| TH-001 | Stored or preview XSS                     | schemas/invalid/rich-text.embedded-html.json             |
| TH-002 | Privilege escalation through UI or ports  | packages/testkit/test/session-lifecycle.test.ts          |
| TH-003 | Data leakage through search/count/preview | packages/testkit/test/host-testbed.test.ts               |
| TH-004 | Prototype pollution and object confusion  | schemas/invalid/blueprint.forbidden-property-member.json |
| TH-005 | Resource exhaustion                       | packages/core/test/core.test.ts                          |
| TH-006 | Malicious plugin                          | packages/core/test/contributions.test.ts                 |
| TH-007 | Preview channel spoofing                  | packages/preview/test/preview-host.test.ts               |
| TH-008 | SSRF through media or embeds              | packages/core/test/url-policy.test.ts                    |
| TH-009 | Confused deputy                           | packages/testkit/test/host-testbed.test.ts               |
| TH-010 | Stale-write corruption                    | packages/testkit/test/session-lifecycle.test.ts          |
| TH-011 | Supply-chain substitution                 | scripts/check-contracts.mjs                              |
| TH-012 | Unsafe fallback                           | packages/core/test/contributions.test.ts                 |
| TH-013 | CSP and Trusted Types verification        | open                                                     |
| TH-014 | Parser and reducer fuzzing                | packages/core/test/fuzz-commands.test.ts                 |

## Notes

- TH-001 is additionally covered by the rich-text unknown-mark fixture, the theme raw-CSS
  rejection, the block icon symbol/asset negatives in `scripts/check-contracts.mjs`, and the
  rich-text contract's renderer responsibilities.
- TH-004 is additionally covered by the canonical `jsonValue` member-name rejections, the
  command identifier-map fixtures, the schema-profile meta-schema, and safe-map construction in
  the core and shell.
- TH-005 is additionally covered by the rich-text hard limits, canonical serialization depth
  bounds, and the schema-profile complexity limits.
- TH-007 is additionally covered by the preview client suite (replayed sequences, wrong origin,
  wrong channel) and the reload/teardown semantics.
- TH-008 is enforced by the canonical lexical external-URL policy in
  `packages/core/src/url-policy.ts` and additionally covered by the testbed external-import
  drill in `packages/testkit/test/media-import-policy.test.ts`; DNS-rebinding defence and
  redirect hardening remain host runtime obligations and are deliberately not claimed.
  Artifact schemas already store no URLs outside schema-defined safe fields.
- TH-011 is additionally covered by the lockfile, the schema digest manifest, the secret-scan
  lane, npm provenance publishing, and the SBOM lane in CI.
- TH-013 is a Gate B qualification lane (`M6-02`) and is deliberately not claimed.
- TH-014 is additionally covered by the rich-text structural-mutation and projection fuzz suite
  in `packages/rich-text/test/fuzz.test.ts`.
