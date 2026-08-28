---
'@kumwe/studio-protocol': minor
'@kumwe/studio-renderer-web': minor
'@kumwe/studio': minor
'@kumwe/studio-testkit': minor
---

Ship the closed eight-family public enhancement runtime as one deterministic, minified, content-hashed,
SRI-bound browser asset. Publish its renderer-driven need signal, data-attribute activation contract, exact
size budget, and deferred loading metadata beside the prebuilt authoring module while retaining semantic
no-JavaScript output.

**BREAKING release-consumer change:** `studio-release.json` now requires `browserArtifacts`, and
`studio-assets.json` now requires the enhancement runtime plus release-gated metadata for every deployable
script and the `publicRenderer.style` materialization policy. Producer and any other digest-pinned consumer must update its parser before adopting this generation,
then atomically re-pin the coordinated release record, schema closure, corpus manifest and vectors, asset
manifest, authoring archive, renderer-web package, and enhancement bytes. A partial upgrade, a filename-only
match, or an old manifest paired with new package bytes is invalid.

The fixed `@kumwe/studio/browser-bundle` subpath is removed because a fixed export cannot identify immutable
content-hashed release bytes. Consumers must resolve the authoring module through
`@kumwe/studio/browser-assets` / `dist/browser/studio-assets.json`, verify its recorded hash, SRI, size and
release identity, and load the exact `module.entryPoint`. Build-time source composition remains available from
the packages' ordinary public entry points; the repository's static-host fixture uses an explicitly internal
alias solely to exercise the manifest-selected prebuilt module. Production hosts serve only that
manifest-pinned module.

**BREAKING renderer-vector change:** every renderer-web expectation now requires the complete
`activationMarkers`, `htmlBytes`, `htmlSha256`, `cssBytes`, `cssSha256`, and `publicStyleAsset` members. The byte/digest pairs bind
the exact canonical HTML topology and compact CSS, so a server renderer cannot pass by scattering marker names
or matching selected fragments. Producer must update its vector parser and prove these exact bytes before the
deliberate re-pin. `publicStyleAsset` is the exact cross-field materialization vector for the output path,
full hash, SRI, bytes, fixed budget, media type, role, and minification flag.

Package publication now treats each content-hashed `.tgz` as the governed package artifact: every contained
JavaScript/CSS file is deterministically minified, runtime JavaScript/CSS source maps are excluded, and the envelope records exact hashes,
integrity, size, and a fixed budget after two isolated clean build/pack passes. Browser-loadable deployment
assets additionally retain the stricter per-file content-hashed name, SRI, byte, and budget contract.
