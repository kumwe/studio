---
'@kumwe/studio-protocol': minor
'@kumwe/studio-testkit': minor
---

The published corpus becomes verifiable. `corpus-manifest.json` ships in `@kumwe/studio-testkit`
carrying the sha256 digest of all 178 files across the seven corpus groups — fixtures, command, media,
host and canonical vectors, negative fixtures and renderer conformance — with
`corpus-manifest.schema.json` fixing its shape. A host that vendors the corpus verifies its copy
against the manifest, so a stale or altered fixture is detected before it silently changes what a
conformance claim means. The contracts lane regenerates and verifies the manifest, so it cannot drift
from what actually ships.
