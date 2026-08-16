/**
 * Computes the lowercase SHA-256 hex digest of a serialized draft — the exact
 * `draftDigest` shape (`/^[a-f0-9]{64}$/`) the canonical preview message
 * schema demands on render requests and responses.
 */
export async function computeDraftDigest(serialized: string): Promise<string> {
  const bytes = new TextEncoder().encode(serialized);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
