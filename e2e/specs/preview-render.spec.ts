import { expect, test } from '@playwright/test';
import { isPreviewMarker } from '@kumwe/studio-protocol';
import { openShell } from '../support/shell.js';

/**
 * M3-04/M4-01: the reference renderer behind the preview bridge. The host
 * page runs the shell-owned preview surface over PreviewClient and PreviewHost
 * joined by a MessageChannel with the contract's origin/channel/generation/
 * sequence filtering. The spec drives insertion, selection in both
 * directions through the canonical marker map, and a viewport re-render,
 * all under the pinned CSP with zero violations.
 */

interface RecordedViolation {
  blockedURI: string;
  directive: string;
  sample: string;
}

declare global {
  interface Window {
    __cspViolations?: RecordedViolation[];
  }
}

test.beforeEach(async ({ page }) => {
  // Same listener pattern as the csp spec: registered before any document
  // script runs so violations raised during boot and during the preview
  // channel handshake are recorded too.
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

test('the production renderer renders and keeps canonical two-way selection', async ({ page }) => {
  const shell = await openShell(page);
  const pane = shell.getByRole('region', { name: 'Rendered preview' });
  const surface = page.locator('.preview-surface');
  const status = pane.locator('.preview-status');

  // The channel handshake completed and the empty draft rendered.
  await expect(status).toHaveText('Preview is current.');
  await expect(surface.locator('.preview-empty')).toBeVisible();

  // Inserting from the palette flows through the production semantic-web
  // renderer to a canonical wrapper with explicit layout intent.
  await shell
    .getByRole('complementary', { name: 'Block palette' })
    .getByRole('button', { name: 'Section', exact: true })
    .click();
  const renderedSection = surface.locator('[data-studio-block="section"]');
  await expect(renderedSection).toHaveCount(1);
  await expect(renderedSection.locator('[data-studio-layout="section"]')).toHaveCount(1);
  expect(isPreviewMarker(await renderedSection.getAttribute('data-marker'))).toBe(true);

  // Selecting in the shell's outline corresponds to a rendered region: the
  // shell admits only a node present in the latest marker map and sends the
  // selection through PreviewClient.
  await shell
    .getByRole('complementary', { name: 'Outline' })
    .getByRole('button', { name: 'Section', exact: true })
    .click();
  const highlighted = surface.locator('[data-selected="true"]');
  await expect(highlighted).toHaveCount(1);
  const marker = await highlighted.getAttribute('data-marker');
  expect(isPreviewMarker(marker)).toBe(true);

  // Trusted activation travels the other way. Add a visibly rendered
  // semantic divider, keep the Section selected, then click it and verify
  // that the shell resolves its marker back to the exact outline node. Empty
  // prose intentionally has no public placeholder or click target.
  await shell
    .getByRole('complementary', { name: 'Block palette' })
    .getByRole('button', { name: 'Divider', exact: true })
    .click();
  const renderedDivider = surface.locator('[data-studio-block="divider"]');
  await expect(renderedDivider).toHaveCount(1);
  await shell
    .getByRole('complementary', { name: 'Outline' })
    .getByRole('button', { name: 'Section', exact: true })
    .click();
  await renderedDivider.click();
  await expect(
    shell
      .getByRole('complementary', { name: 'Outline' })
      .getByRole('button', { name: 'Divider', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');

  // A viewport switch re-renders the same canonical page and the selection
  // map is rebuilt from the new renderer output rather than reused by index.
  await expect(surface).toHaveAttribute('data-preview-viewport', 'compact');
  await shell
    .getByRole('region', { name: 'Preview width' })
    .getByRole('button', { name: 'Expanded' })
    .click();
  await expect(surface).toHaveAttribute('data-preview-viewport', 'expanded');

  // The selection affordance survived the re-render: the highlight was
  // re-applied to the marker of the fresh render.
  await expect(surface.locator('[data-selected="true"]')).toHaveCount(1);

  // The whole pass ran under the pinned policy without a single violation.
  expect(await page.evaluate(() => window.__cspViolations)).toEqual([]);
});
