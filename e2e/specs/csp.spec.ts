import { expect, test } from '@playwright/test';
import { openShell, populateShell } from '../support/shell.js';

/**
 * TH-013: the authoring chrome operates under the strict Content-Security-
 * Policy the reference host serves (examples/reference-host/vite.config.ts).
 * The spec pins the exact policy string so any drift fails the lane, drives
 * the populated chrome while listening for securitypolicyviolation events,
 * and proves the policy is genuinely enforced with an inline-script negative
 * control.
 *
 * Known, deliberately pinned gaps (recorded in the TH-013 registry note):
 * string-to-code compilation stays ungoverned and Trusted Types stays off
 * because @kumwe/core compiles JSON Schemas through Ajv's Function
 * constructor at runtime — under `script-src 'self'` or
 * `require-trusted-types-for 'script'` the shell fails to boot. When core
 * validation goes eval-free, tighten the policy back to the contract's
 * `default-src 'none'; script-src 'self'` target and revisit Trusted Types.
 */
const PINNED_POLICY = [
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

  // Pins the known gap: Ajv-based validation in @kumwe/core needs runtime
  // string compilation, so the policy cannot govern eval yet. Flip this
  // expectation to a rejection when core validation goes eval-free and the
  // policy gains `default-src 'none'; script-src 'self'`.
  expect(await page.evaluate(() => eval('6 * 7') as number)).toBe(42);
});

test('an injected inline script does not run and raises a violation event', async ({ page }) => {
  await openShell(page);

  // Negative control, mirroring the reduced-motion spec's pattern: prove the
  // listener and the policy both work by injecting markup the policy must
  // refuse. The script must neither execute nor stay silent.
  const executed = await page.evaluate(() => {
    window.__inlineExecuted = false;
    const script = document.createElement('script');
    script.textContent = 'window.__inlineExecuted = true;';
    document.body.append(script);
    return window.__inlineExecuted;
  });
  expect(executed).toBe(false);

  await expect
    .poll(async () => await page.evaluate(() => window.__cspViolations?.length ?? 0))
    .toBeGreaterThan(0);
  const violations = await page.evaluate(() => window.__cspViolations ?? []);
  expect(violations.map((violation) => violation.directive)).toContain('script-src-elem');
  expect(violations.map((violation) => violation.blockedURI)).toContain('inline');
});
