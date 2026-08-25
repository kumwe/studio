import { fileURLToPath } from 'node:url';
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
 * - require-trusted-types-for 'script' + the exact lit-html/studio-renderer
 *   policy list: every HTML/script sink takes a typed value. The renderer
 *   policy receives only escaped output from `renderStudioWeb`.
 * - style-src 'self' plus one pinned nonce: bundled host styles remain the
 *   default; the semantic renderer may emit its deterministic scoped sheet.
 * - img-src 'self' data:: bundled assets plus data: icon payloads; no remote
 *   image hosts.
 * - font-src/connect-src 'self': system-ui fonts and same-origin fetches
 *   only.
 * - media-src 'self': reference audio/video assets are host-resolved. Workers,
 *   frames, manifests, plugin documents, and arbitrary media origins remain
 *   refused.
 * - frame-ancestors 'self' keeps the chrome out of foreign frames; base-uri
 *   and form-action 'none' close base hijacking and form exfiltration.
 */
export const contentSecurityPolicy = [
  "default-src 'none'",
  "script-src 'self'",
  "require-trusted-types-for 'script'",
  'trusted-types lit-html studio-renderer',
  "style-src 'self' 'nonce-studio-reference-style-v1'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "media-src 'self'",
  "worker-src 'none'",
  "frame-src 'none'",
  "manifest-src 'none'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

export default defineConfig({
  // The reference host is a workspace integration harness, so it always
  // exercises the source in this checkout rather than a stale package link
  // left by another worktree or a globally cached install.
  resolve: {
    alias: {
      '@kumwe/studio': source('studio-lit'),
      '@kumwe/studio-core': source('core'),
      '@kumwe/studio-media': source('media'),
      '@kumwe/studio-preview': source('preview'),
      '@kumwe/studio-protocol': source('protocol'),
      '@kumwe/studio-renderer-web': source('renderer-web'),
      '@kumwe/studio-rich-text': source('rich-text'),
    },
  },
  preview: {
    headers: {
      'Content-Security-Policy': contentSecurityPolicy,
    },
  },
});

function source(packageDirectory: string): string {
  return fileURLToPath(new URL(`../../packages/${packageDirectory}/src/index.ts`, import.meta.url));
}
