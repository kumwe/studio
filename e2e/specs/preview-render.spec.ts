import { expect, test } from '@playwright/test';
import { openShell } from '../support/shell.js';

/**
 * M3-04/M4-01: the reference renderer behind the preview bridge. The host
 * page runs the real preview channel — PreviewClient and PreviewHost joined
 * over a MessageChannel with the contract's origin/channel/generation/
 * sequence filtering — and the renderer projects the draft into semantic DOM.
 * The spec drives insertion, selection correspondence through the marker-map
 * affordance, and the size-role-driven four-to-two-to-one reflow across the
 * viewport switcher, all under the pinned CSP with zero violations.
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

test('the reference renderer renders, tracks selection, and reflows by size role', async ({
  page,
}) => {
  const shell = await openShell(page);
  const pane = page.getByRole('region', { name: 'Preview' });
  const surface = pane.locator('.preview-surface');
  const status = pane.locator('.preview-status');
  const selection = pane.locator('.preview-selection');

  // The channel handshake completed and the empty draft rendered.
  await expect(status).toContainText('studio.renderer/reference');
  await expect(surface.locator('.preview-empty')).toBeVisible();

  // Inserting from the palette flows through the render path to real
  // semantic DOM: a <section> landmark-free region with a heading.
  await shell
    .getByRole('complementary', { name: 'Block palette' })
    .getByRole('button', { name: 'Section' })
    .click();
  const renderedSection = surface.locator('section.preview-section');
  await expect(renderedSection).toHaveCount(1);
  await expect(renderedSection.locator('h3')).toHaveText('Section');
  await expect(renderedSection).toHaveAttribute('data-marker', /^markers\/m\d+$/u);

  // Selecting in the shell's outline corresponds to a rendered region: the
  // host resolves the node through the returned marker map, the renderer
  // highlights that marker, and the textual affordance names the same marker
  // with real measured geometry.
  await shell
    .getByRole('complementary', { name: 'Outline' })
    .getByRole('button', { name: 'Section' })
    .click();
  const highlighted = surface.locator('[data-selected="true"]');
  await expect(highlighted).toHaveCount(1);
  const marker = await highlighted.getAttribute('data-marker');
  expect(marker).toMatch(/^markers\/m\d+$/u);
  await expect(selection).toContainText(`Selected marker ${marker ?? ''}`);
  // The geometry in the affordance comes from the measurer over the channel:
  // real, non-degenerate CSS-pixel rectangles.
  await expect(selection).toContainText(/— [1-9]\d*×[1-9]\d* CSS px at \(\d+, \d+\)\./u);

  // Size-role reflow: the inserted section carries the `quarter` inline size
  // role. At the compact base viewport the single-column grid gives it the
  // full row; switching to the expanded viewport gives the grid four columns,
  // so the same block drops to roughly a quarter of the surface. Assert the
  // computed-width relation, not exact pixels.
  const widthRatio = async (): Promise<number> =>
    page.evaluate(() => {
      const grid = document.querySelector('.preview-grid');
      const block = document.querySelector('.preview-section');
      if (grid === null || block === null) {
        return -1;
      }
      const gridWidth = grid.getBoundingClientRect().width;
      const blockWidth = block.getBoundingClientRect().width;
      return gridWidth === 0 ? -1 : blockWidth / gridWidth;
    });

  await expect(surface).toHaveAttribute('data-preview-viewport', 'compact');
  const compactRatio = await widthRatio();
  expect(compactRatio).toBeGreaterThan(0.85);

  await shell
    .getByRole('region', { name: 'Preview width' })
    .getByRole('button', { name: 'Expanded' })
    .click();
  await expect(surface).toHaveAttribute('data-preview-viewport', 'expanded');
  const expandedRatio = await widthRatio();
  expect(expandedRatio).toBeGreaterThan(0);
  expect(expandedRatio).toBeLessThan(0.35);
  expect(expandedRatio).toBeLessThan(compactRatio);

  // The selection affordance survived the re-render: the highlight was
  // re-applied to the marker of the fresh render.
  await expect(surface.locator('[data-selected="true"]')).toHaveCount(1);

  // The whole pass ran under the pinned policy without a single violation.
  expect(await page.evaluate(() => window.__cspViolations)).toEqual([]);
});
