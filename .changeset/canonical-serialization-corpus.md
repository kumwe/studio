---
'@kumwe/studio-protocol': minor
'@kumwe/studio-testkit': minor
---

Canonical serialization becomes an executable corpus. `canonical-vector.schema.json` and the twelve
vectors published as `vectors/canonical/` in `@kumwe/studio-testkit` fix member ordering by code unit,
minimal escaping, the number grammar including negative-zero canonicalization, UTF-8 emission of
non-ASCII and astral text, the depth bound, and the forbidden member names — each with the exact
canonical string and the SRI-style digest of its bytes. Every checksum in the contract is computed over
exactly those bytes, so an implementation reproducing the corpus computes the same digests as every
other, which is what makes a vendored-corpus integrity check and a stored-document round-trip
comparable across languages. The expectations were produced by an independent canonicalizer rather
than recorded from the reference, so the reference replaying them is a genuine cross-implementation
check.
