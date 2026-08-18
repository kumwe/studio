---
'@kumwe/studio-protocol': minor
'@kumwe/studio-testkit': minor
---

Conformance profiles become named, versioned, and executable. `studio.profile/host-baseline` is
declared first and ships its assertion set as a new canonical vector kind: `host-vector.schema.json`
with the corpus published as `vectors/host/` in `@kumwe/studio-testkit`. Each vector fixes reproducible
host state, the request envelope and argument, and the required outcome — an accepted result with its
revision behaviour, or one category of the closed error taxonomy with its retry classification and
non-disclosure obligations — so a host adapter in any language proves persistence, optimistic
concurrency, envelope negotiation, bounded queries, absence handling, authority and telemetry
discipline without executing Studio code. The reference host claims the profile by replaying the
corpus. Profiles bind to release channels: `beta` now means feature-complete against a declared,
executable profile, claimed with evidence.
