# Media contract

## Responsibility split

Studio provides a coherent media user experience. The host owns media identity, binary custody, authorization, quotas, processing, malware scanning, metadata persistence, retention, URLs and publication policy.

The host's media catalogue projection conforms to [`media-asset.schema.json`](../../schemas/media-asset.schema.json). The much smaller value persisted in a Studio artifact conforms to [`media-reference.schema.json`](../../schemas/media-reference.schema.json). These are deliberately different contracts.

## Stable references

An artifact stores a closed, bounded media reference containing the opaque stable asset ID, optional pinned asset revision, semantic usage, optional rendition/focal/crop intent, and accessibility semantics for that particular use. It MUST NOT copy the MediaAsset catalogue projection into the entry or Blueprint.

The reference's accessibility value is exactly one of informative text with optional caption, explicit decorative state, or bindings to entry fields that supply alternative text and optional caption. This usage-specific value takes precedence over any catalogue default suggested by a MediaAsset projection. A crop rectangle uses normalized coordinates; semantic validation additionally requires it to remain inside the source bounds.

References MUST NOT store a URL, expiring signed URL, filesystem/object-store path, binary/base64 data, upload session, credential, arbitrary transform command, or delivery parameter. The host resolves delivery URLs and renderer resources at render time.

The safety-critical `0.1-draft` MediaReference has no generic extension map. Extension-specific presentation data belongs in the containing content field, block property, or other typed value whose registered schema can bound and validate it; it MUST NOT be smuggled into a media reference as arbitrary metadata.

A stable asset identity may be accepted while its binary is still being scanned or transformed. Identity, processing readiness, actor access, and permission to use an asset on a particular surface are separate decisions. Holding a reference never proves that preview, save, publication, or delivery is allowed.

## Standard operations

The media port supports negotiated subsets of:

- permission-aware browse, search, filter and cursor pagination;
- upload initialization, chunk transfer, resume, cancellation and completion;
- processing-status subscription or polling;
- asset metadata read and authorized update;
- rendition and crop/focal-point preview;
- replace-with-new-revision without silently changing historical output;
- explicit external import when host policy permits;
- usage/dependency inspection before archive or deletion.

## Upload lifecycle

1. Studio requests an upload with filename, declared media type, byte size and content purpose.
2. The host authorizes and returns a bounded upload plan.
3. Transfer follows the plan; browser-supplied media type is not trusted.
4. The host verifies size, signature/type, dimensions or duration, malware policy and processing constraints.
5. After durable commit, the host returns an accepted stable asset identity in `processing`, `ready`, `rejected`, or `quarantined` state. Processing may continue asynchronously under that identity.
6. Studio MAY preserve or create a binding to an accepted stable identity while it is `processing`, so work and references survive processing latency.
7. Before previewing a rendition, saving a use that requires readiness, publishing, or delivering, Studio asks the host to apply the current actor, field/block, processing, moderation, and surface policy. A stable identity does not bypass that decision.

Failed or abandoned upload sessions do not create an accepted asset identity. A rejected or quarantined accepted asset remains stably identifiable for diagnostics and authorized replacement, but is not thereby usable or publishable.

## Author assistance

For informative images, Studio requires an accessible text alternative or a binding to a field that will provide one. Decorative media requires an explicit decorative choice. Automated suggestions are labeled suggestions and require human confirmation where content meaning is involved.

Studio exposes focal point, crop previews, intrinsic dimensions, rendition warnings, caption and credit/license metadata when supported. It warns when chosen media is too small, excessively large, unsupported, still processing, or inaccessible to the publication context.

## Privacy and security

Media search results, thumbnails, metadata and counts are authorization-filtered by the host. Upload filenames are display metadata, not storage paths. SVG, HTML, PDF, video and other active formats follow host sanitization and content-disposition policy. EXIF/location and other sensitive metadata handling is explicit.

Remote URL import is disabled by default and, when enabled, is performed by a hardened host fetcher with SSRF, redirect, DNS rebinding, size, timeout and content checks. Studio never fetches arbitrary author URLs with privileged browser or host credentials.

## Repository boundary

In the current alpha, `@kumwe/studio-media` exposes a small `MediaProvider` interface for `get`, `list`, and `upload`, cancellation-safe `MediaLibrary` browse/search/pagination state, and deterministic rendition selection. Canonical MediaAsset and MediaReference schemas are owned and packaged by `@kumwe/studio-protocol`, not the media package. The complete media browser/upload UI, full lifecycle ports, diagnostics, and conformance surface are Gate A/B targets and are not claimed as implemented.

Kumwe CMS will implement the authoritative media operations with its media application services. A separate media repository is unnecessary unless a future independent media service develops a lifecycle and audience beyond Studio.
