import { expect, test } from '@playwright/test';
import { openShell, populateShell } from '../support/shell.js';

/**
 * TH-013: the authoring chrome operates under the strict Content-Security-
 * Policy the reference host serves (examples/reference-host/vite.config.ts).
 * The spec pins the exact policy string so any drift fails the lane, drives
 * the populated chrome while listening for securitypolicyviolation events,
 * and proves the policy is genuinely enforced with negative controls: an
 * injected inline script, a raw string written to a Trusted Types-governed
 * sink, and a rogue trusted-types policy registration.
 *
 * Core validation is interpreted (packages/core/src/profile-validator.ts),
 * so the policy carries the contract's `default-src 'none'; script-src
 * 'self'` baseline with no 'unsafe-eval', and Trusted Types is enforced with
 * `lit-html` as the only allowed policy (Lit parses its static template
 * strings through it; the shell itself creates no other policy).
 */
const PINNED_POLICY = [
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

interface RecordedViolation {
  blockedURI: string;
  directive: string;
  sample: string;
}

declare global {
  interface Window {
    __cspViolations?: RecordedViolation[];
    __inlineExecuted?: boolean;
  }
}

test.beforeEach(async ({ page }) => {
  // The listener must exist before any document script runs so violations
  // fired during boot are recorded too. securitypolicyviolation events are
  // composed, so a capturing document listener also sees violations raised
  // inside the shell's shadow DOM. The demo session embeds no frames, which
  // the first test asserts, so the document listener covers the whole page.
  await page.addInitScript(() => {
    window.__cspViolations = [];
    document.addEventListener(
      'securitypolicyviolation',
      (event) => {
        window.__cspViolations?.push({
          blockedURI: event.blockedURI,
          directive: event.effectiveDirective,
          sample: event.sample,
        });
      },
      true,
    );
  });
});

test('the chrome completes an authoring pass under the pinned policy without violations', async ({
  page,
}) => {
  const response = await page.goto('/');
  expect(response).not.toBeNull();
  expect(response?.headers()['content-security-policy']).toBe(PINNED_POLICY);

  const shell = page.locator('kumwe-studio');
  await expect(
    shell.getByRole('complementary', { name: 'Block palette' }).getByRole('button', {
      name: 'Section',
    }),
  ).toBeVisible();
  await populateShell(page, shell);

  // Close the command palette and edit through the inspector so the pass
  // covers form interaction in addition to insertion and selection.
  await page.keyboard.press('Escape');
  const inspector = shell.getByRole('complementary', { name: 'Inspector' });
  const addPropertyName = inspector.getByRole('textbox', { name: 'New property name' });
  await addPropertyName.fill('note');
  await expect(addPropertyName).toHaveValue('note');

  // The policy relies on a document-level listener, so the demo session must
  // stay frameless; a frame would need its own listener registration.
  expect(page.frames().length).toBe(1);

  expect(await page.evaluate(() => window.__cspViolations)).toEqual([]);

  // The eval-free claim itself cannot be probed through page.evaluate:
  // DevTools-protocol evaluation is exempt from the page's eval directive
  // (CDP's allowUnsafeEvalBlockedByCSP), so an eval() here would succeed
  // regardless of policy. The claim is carried by the pinned header (a bare
  // `script-src 'self'` with no 'unsafe-eval') plus the clean authoring pass
  // above: the shell's own bundled code IS governed by the directive, and
  // before core validation went eval-free this exact boot demonstrably
  // failed under it.

  // Negative control for Trusted Types: a raw string written to a governed
  // sink must be refused and reported, because only the `lit-html` policy
  // exists and no default policy is registered.
  const rawSinkRefused = await page.evaluate(() => {
    try {
      document.createElement('div').innerHTML = '<img alt="">';
      return false;
    } catch {
      return true;
    }
  });
  expect(rawSinkRefused).toBe(true);

  // A page script also cannot mint itself an escape hatch: the policy list
  // admits `lit-html` only, so creating any other policy is refused.
  const roguePolicyRefused = await page.evaluate(() => {
    const factory = (
      window as unknown as {
        trustedTypes?: {
          createPolicy: (name: string, rules: { createHTML: (input: string) => string }) => unknown;
        };
      }
    ).trustedTypes;
    if (factory === undefined) {
      return false;
    }
    try {
      factory.createPolicy('rogue', { createHTML: (value: string) => value });
      return false;
    } catch {
      return true;
    }
  });
  expect(roguePolicyRefused).toBe(true);

  await expect
    .poll(async () => await page.evaluate(() => window.__cspViolations?.length ?? 0))
    .toBeGreaterThanOrEqual(2);
  const directives = await page.evaluate(() =>
    (window.__cspViolations ?? []).map((violation) => violation.directive),
  );
  expect(directives).toContain('require-trusted-types-for');
  expect(directives).toContain('trusted-types');
});

test('an injected inline script does not run and raises a violation event', async ({ page }) => {
  await openShell(page);

  // Negative control, mirroring the reduced-motion spec's pattern: prove the
  // listener and the policy both work by injecting markup the policy must
  // refuse. The script must neither execute nor stay silent. Under Trusted
  // Types a direct `textContent` assignment already throws at the sink, so
  // the injection stages its payload through a text node — the one route
  // that reaches script-preparation — where enforcement must still refuse
  // to execute it and must report the violation.
  const executed = await page.evaluate(() => {
    window.__inlineExecuted = false;
    const script = document.createElement('script');
    script.appendChild(document.createTextNode('window.__inlineExecuted = true;'));
    document.body.append(script);
    return window.__inlineExecuted;
  });
  expect(executed).toBe(false);

  await expect
    .poll(async () => await page.evaluate(() => window.__cspViolations?.length ?? 0))
    .toBeGreaterThan(0);
  const violations = await page.evaluate(() => window.__cspViolations ?? []);
  expect(violations.map((violation) => violation.directive)).toContain('require-trusted-types-for');
  expect(violations.map((violation) => violation.blockedURI)).toContain('trusted-types-sink');
});
