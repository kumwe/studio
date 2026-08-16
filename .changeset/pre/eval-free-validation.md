---
'@kumwe/studio-core': minor
---

Make runtime schema validation eval-free: Blueprint, block property, and plugin-manifest
documents are now checked by a pure interpreting validator for the Studio Schema Profile
(`profile-validator.ts`) instead of code-generating compilation, removing ajv from the
package's runtime dependencies (it remains a dev-only reference implementation pinned by a
seeded agreement suite). With no string-to-code compilation left on the boot path, the
reference host's pinned Content-Security-Policy tightens to `default-src 'none'; script-src
'self'` and now enforces Trusted Types with `lit-html` as the only allowed policy, all
verified by the TH-013 e2e lane.
