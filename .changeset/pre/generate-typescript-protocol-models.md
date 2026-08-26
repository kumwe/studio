---
'@kumwe/studio-protocol': minor
---

Publish deterministic schema-generated TypeScript models for all 47 Version 2 protocol schemas and their
reusable definitions. Bind the generated surface to the exact schema-manifest digest, epoch, document
contract revision, and generator version; expose a schema-validated JSON round-trip boundary; and fail CI
when schemas, the complete runtime registry, or checked-in generated sources drift.
Use locale-independent ordering, model array minimum/prefix and open-member semantics without excluding valid
documents, fail closed on regex-key schemas, and directly compile the applicable corpus against exact roots
within an explicit TypeScript recursion boundary.
Normalize the two remaining presentation/table schema identifiers into the declared `/studio/v1/` epoch so
the recorded coordinate describes every generated model truthfully.
