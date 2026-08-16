import { defineConfig } from 'vite';

/**
 * The Content-Security-Policy the preview server attaches to every response.
 * The TH-013 lane in e2e/specs/csp.spec.ts pins this exact string, so the
 * header, the spec, and the baseline recorded in docs/contracts/security.md
 * change only together.
 *
 * Directive rationale — nothing here is looser than the app demonstrably
 * needs:
 * - script-src-elem 'self': only bundled same-origin script elements load;
 *   inline <script> is refused (no 'unsafe-inline', no hashes, no nonces).
 * - script-src-attr 'none': inline event-handler attributes never run; the
 *   shell binds listeners programmatically.
 * - style-src 'self': the host stylesheet is a bundled asset and the Lit
 *   shell adopts constructed stylesheets, so inline styles stay refused.
 * - img-src 'self' data:: bundled assets plus data: icon payloads; no remote
 *   image hosts.
 * - font-src/connect-src 'self': system-ui fonts and same-origin fetches
 *   only.
 * - media-src/worker-src/frame-src/manifest-src/object-src 'none': the shell
 *   embeds no media, workers, frames, manifests, or plugin documents.
 * - frame-ancestors 'self' keeps the chrome out of foreign frames; base-uri
 *   and form-action 'none' close base hijacking and form exfiltration.
 *
 * Known gap (TH-013 note): the contract baseline is `default-src 'none';
 * script-src 'self'`, but @kumwe/core compiles JSON Schemas through Ajv's
 * Function-constructor codegen at runtime, so any policy that governs string
 * compilation (a script-src or default-src fallback without 'unsafe-eval')
 * stops the shell from booting. Until core validation is eval-free, the
 * policy therefore enumerates every other directive explicitly and leaves
 * only string compilation ungoverned instead of granting 'unsafe-eval'.
 * Restore `default-src 'none'; script-src 'self'` when that lands. The same
 * Ajv sink stops `require-trusted-types-for 'script'` (verified empirically:
 * the shell fails to boot; Lit itself is compatible through its `lit-html`
 * policy), so Trusted Types stays an open follow-up as well.
 */
export const contentSecurityPolicy = [
  "script-src-elem 'self'",
  "script-src-attr 'none'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "media-src 'none'",
  "worker-src 'none'",
  "frame-src 'none'",
  "manifest-src 'none'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

export default defineConfig({
  preview: {
    headers: {
      'Content-Security-Policy': contentSecurityPolicy,
    },
  },
});
