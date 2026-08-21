---
'@kumwe/studio-protocol': minor
'@kumwe/studio-core': minor
'@kumwe/studio-testkit': minor
---

Declare and implement `studio.profile/schema-property`, the portable alpha boundary for contributed
block property schemas. Property schemas now require a closed object root, local non-recursive JSON
Pointer references, non-empty enum and composition arrays, unique required/dependent names, canonical
UTF-8 byte limits, exact decimal multiples, deterministic member precedence, and no format or
implementation-specific keywords. Core exposes an eval-free compiler plus stable admission codes and
schema pointers; validation memoizes reference-DAG evaluations and publishes every distinct diagnostic
in deterministic order without duplicate fan-out amplification. Admission arbitrates root,
structural, reference, and recursion failures in one token-wise document order. Protocol and testkit
publish a language-neutral admission/instance corpus with exact boundary pairs for every limit,
combined-depth, competing-failure, forward-reference-path, and reference-fan-out adversarial cases, a
runner, and digest-manifest coverage so another runtime can prove agreement without executing Studio
TypeScript.
