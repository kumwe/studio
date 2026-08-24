# ADR 0023: Bind the shell preview to host-staged canonical channels

- Status: proposed
- Scope: authoring-shell preview surface, host authority and CSP boundary

## Context

Studio already publishes a replay-resistant preview protocol and `PreviewClient`, while the Lit shell had no
surface that consumed them. The standalone reference host duplicated ready/render scheduling, watched private
shadow-DOM selection state, and rendered outside the shell. A real host could build a renderer endpoint but
could not attach it through a public shell contract.

The protocol intentionally carries only a bounded artifact/revision/digest reference. The shell cannot stage
the complete draft through `PreviewClient`, and the headless `openStudioSession` handle deliberately does not
invent staging semantics. Adding the artifact to a render message or calling the generic `PreviewPort`
directly would either change the closed wire vocabulary or bypass the origin-pinned browser channel.

There is also a repository policy conflict: the desired production shape is a same-origin sandboxed frame,
but the reference host's exact security baseline pins `frame-src 'none'`. Weakening that policy merely to make
the example framed would invalidate its existing security assertion. The preview contract already permits an
equivalently isolated host mechanism.

## Decision

The shell accepts a `StudioPreviewBinding` only when resolved feature policy and the negotiated preview port
also authorize render and cancellation. The binding contains the already-origin-pinned `PreviewClient` and a
host-owned staging callback. The host supplies the visual surface through a named slot, normally a
same-origin, descriptively titled frame. The shell does not create a frame from an untrusted URL and does not
receive credentials, renderer internals or authority through slot content.

One microtask is the deterministic coalescing boundary. The shell waits for ready, snapshots the final draft,
stages it through the host callback, sends the semantic viewport, then renders through `PreviewClient`. A new
intent aborts older staging/render attempts and disposes an accepted superseded digest. Private generations
guard settlement in addition to the client's request identity, so a callback that ignores cancellation cannot
replace the latest marker map. Selection travels only when that map proves a live node/marker association;
trusted renderer activation resolves the marker back through the same map.

Reload clears marker authority, preserves focus, waits for the renewed ready handshake and resends the latest
snapshot. Teardown closes the channel and leaves the document untouched. Missing authority or channel failure
renders explicit unavailable, stale or disconnected text while normal authoring remains available according
to session mode.

The reference host keeps its pinned CSP unchanged and exercises the same shell binding with its existing real
`MessageChannel`, which is an equivalently isolated mechanism under the preview contract. It does not claim to
prove the iframe deployment path. A host that uses a frame must separately resolve the policy contradiction
for its dedicated authoring response; this ADR does not silently relax the canonical reference baseline.

## Consequences

Browser hosts have one public end-to-end composition seam without moving staging or rendering authority into
Studio. Preview behavior is deterministic and independently testable, the shell no longer observes its own
shadow DOM to infer selection, and read-only sessions receive the same visual projection without gaining a
mutation path.

The binding is browser-specific composition, not a language-neutral serialized contract. Flutter and other
clients continue to implement the protocol against their native transport. Host code must construct and own
the isolated surface, exact origin, sandbox, staging store and session lifetime.

The unresolved `frame-src 'none'` versus framed-production-profile question remains a release qualification
item. It cannot be closed by the reference harness until the security contract defines a dedicated framed
authoring policy without weakening normal administrator or public responses.

## Rejected alternatives

Embedding complete artifacts in `studio.preview/render` was rejected because it changes the closed wire
vocabulary and makes the channel an accidental persistence boundary. Calling `PreviewPort.render` from the
shell was rejected because it bypasses ready, origin, source, sequence, activation and viewport semantics.
Reading or mutating the slotted renderer DOM was rejected because preview is disposable presentation, never
document state. Timer-based debounce was rejected because its observable batching is clock-dependent.
Weakening the pinned CSP to `frame-src 'self'` was rejected because the task requires preserving that policy
and the repository currently has no separately ratified framed policy.
