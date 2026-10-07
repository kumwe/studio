import { expect, test } from '@playwright/test';
import { isPreviewMarker } from '@kumwe/studio-protocol';
import { openShell, returnToStructure } from '../support/shell.js';

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
  const stage = pane.getByRole('group', { name: 'Rendered preview', exact: true });
  await stage.focus();
  await expect(stage).toBeFocused();

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
  // The activation opens the details view for the resolved node: the
  // selection path names it, and "Back" returns to the structure view.
  await expect(shell.locator('.workspace')).toHaveAttribute('data-panel-view', 'details');
  await expect(
    shell
      .getByRole('complementary', { name: 'Inspector' })
      .getByRole('navigation', { name: 'Selection path' }),
  ).toContainText('Divider');
  await shell.getByRole('button', { name: 'Back', exact: true }).click();
  const outline = shell.getByRole('complementary', { name: 'Outline' });
  const dividerEntry = outline.getByRole('button', { name: 'Divider', exact: true });
  await expect(dividerEntry).toHaveAttribute('aria-pressed', 'true');
  // The host's activation report also reveals the entry in the structure
  // panel: after "Back" it is focused and scrolled into view.
  await expect(dividerEntry).toBeFocused();
  await expect(dividerEntry).toBeInViewport();

  // With the edit control off, hovering the rendered block marks its outline
  // entry through the shell's passive stage listeners; leaving clears it.
  await renderedDivider.hover();
  await expect(outline.locator('button.outline-entry[data-hovered="true"]')).toHaveText(/Divider/);
  await page.mouse.move(5, 5);
  await expect(shell.locator('button.outline-entry[data-hovered="true"]')).toHaveCount(0);

  // The host measures against its surface's own edge, so the overlay rect the
  // shell paints from those measurements lines up with the rendered block.
  // Both boxes come from the DOM's own geometry: Playwright's boundingBox()
  // widens an SVG rect by its stroke, which would hide a half-stroke offset.
  const dividerId = await dividerEntry.getAttribute('data-node-id');
  expect(dividerId).not.toBeNull();
  const dividerRect = shell
    .locator(`.preview-canvas-region[data-node-id="${dividerId ?? ''}"]`)
    .first();
  const geometryX = (element: Element): number => element.getBoundingClientRect().x;
  const rectX = await dividerRect.evaluate(geometryX);
  const renderedX = await renderedDivider.evaluate(geometryX);
  expect(Math.abs(rectX - renderedX)).toBeLessThanOrEqual(1);

  // The rendered-preview edit control lives in the canvas toolbar and stays off.
  await expect(
    shell
      .locator('.canvas-toolbar')
      .getByRole('button', { name: 'Select and move rendered blocks' }),
  ).toHaveAttribute('aria-pressed', 'false');

  // Edit mode still gates dragging: with the control off, a drag across the
  // rendered divider arms no drop indicator and moves nothing.
  const entryOrder = (): Promise<(string | null)[]> =>
    outline
      .locator('button.outline-entry')
      .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-node-id')));
  const orderBefore = await entryOrder();
  const dividerBox = await renderedDivider.boundingBox();
  if (dividerBox === null) throw new Error('The rendered divider has no box');
  const dragStart = {
    x: dividerBox.x + dividerBox.width / 2,
    y: dividerBox.y + dividerBox.height / 2,
  };
  await page.mouse.move(dragStart.x, dragStart.y);
  await page.mouse.down();
  await page.mouse.move(dragStart.x + 40, dragStart.y, { steps: 6 });
  await expect(shell.locator('.preview-canvas-drop-indicator')).toHaveCount(0);
  await page.mouse.up();
  await expect(renderedDivider).toHaveCount(1);
  // With the control off the gesture is an ordinary click on the rendered
  // divider: the host reports an activation, which opens its details view
  // again, and the structure is unchanged once "Back" shows it.
  await expect(shell.locator('.workspace')).toHaveAttribute('data-panel-view', 'details');
  await returnToStructure(shell);
  expect(await entryOrder()).toEqual(orderBefore);

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
