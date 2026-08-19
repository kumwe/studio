---
'@kumwe/studio-testkit': minor
---

The reference host now authorizes artifact mutations, closing the largest recorded limitation of
`studio.profile/host-baseline`. A save or a publication the acting identity does not hold the
permission for is refused as `forbidden` before the artifact is touched, and the refusal does not
disclose whether it exists; save authority and publication authority are distinct, so holding one never
grants the other. Two conformance vectors fix the behaviour, so a host adapter proves its authorization
gate from the published corpus rather than being trusted to have one. The reference host declares its
own permission names, as any host does — what the profile fixes is that a mutation is authorized and
that a withheld permission is `forbidden`.
