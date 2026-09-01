---
"@kumwe/studio": patch
---

Publish the coordinated beta from the current source head so the governed GitHub prerelease carries the verified browser archive and detached checksum. The previous beta's npm family is fully published and provenance-verified, but its prerelease reconciliation is blocked: the publication source commit is historical, and workflow tokens cannot create tags at historical commits whose workflow files differ from the current branch. Releasing from the current head lets the release controller tag its own publication source, closing the recovery gap without privileged credentials.
