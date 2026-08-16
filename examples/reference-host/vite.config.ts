import { defineConfig } from 'vite';

/**
 * The Content-Security-Policy the preview server attaches to every response.
 * The TH-013 lane in e2e/specs/csp.spec.ts pins this exact string, so the
 * header, the spec, and the baseline recorded in docs/contracts/security.md
 * change only together.
 *
 * Directive rationale — nothing here is looser than the app demonstrably
 * needs:
 * - default-src 'none': every fetch directive without an explicit entry
 *   below falls back to a refusal.
 * - script-src 'self': only bundled same-origin scripts load; inline
 *   <script>, inline event-handler attributes, and string-to-code
 *   compilation (eval, Function) are all refused. Core validation is
 *   interpreted (packages/core/src/profile-validator.ts), so the shell needs
 *   no 'unsafe-eval'.
 * - require-trusted-types-for 'script' + trusted-types lit-html: every
 *   HTML/script sink takes a typed value. `lit-html` is the only policy the
 *   shell creates (Lit parses its static template strings through it);
 *   nothing else writes to a governed sink.
 * - style-src 'self': the host stylesheet is a bundled asset and the Lit
 *   shell adopts constructed stylesheets, so inline styles stay refused.
 * - img-src 'self' data:: bundled assets plus data: icon payloads; no remote
 *   image hosts.
 * - font-src/connect-src 'self': system-ui fonts and same-origin fetches
 *   only.
 * - media-src/worker-src/frame-src/manifest-src/object-src 'none': the shell
 *   embeds no media, workers, frames, manifests, or plugin documents
 *   (explicit even though default-src already refuses them).
 * - frame-ancestors 'self' keeps the chrome out of foreign frames; base-uri
 *   and form-action 'none' close base hijacking and form exfiltration.
 */
export const contentSecurityPolicy = [
  "default-src 'none'",
  "script-src 'self'",
  "require-trusted-types-for 'script'",
  'trusted-types lit-html',
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
