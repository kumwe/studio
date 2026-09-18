import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { openPublicStudio, showWorkspacePane } from '../support/public-studio.js';

test('the public canvas stays live while typed content, layout and presentation controls change', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const studio = await openPublicStudio(page);
  await studio.getByRole('button', { name: 'Fullscreen', exact: true }).click();
  await studio.locator('button.pattern-apply[data-pattern-id="studio.pattern/hero"]').click();
  const canvas = studio.locator('.local-canvas-host');
  const heading = canvas.getByRole('heading', { name: 'Build something meaningful' });
  await expect(heading).toBeVisible();
  const nodeId = await heading.locator('..').getAttribute('data-studio-node');
  expect(nodeId).not.toBeNull();
  const region = studio.locator(`.preview-canvas-region[data-node-id="${nodeId ?? ''}"]`).first();
  await region.click();
  const input = studio.locator('[data-scalar-key="port:text"] input');
  await expect(input).toHaveValue('Build something meaningful');
  await input.fill('A page built on the canvas');
  await expect(canvas.getByRole('heading', { name: 'A page built on the canvas' })).toBeVisible();
  await studio.getByRole('tab', { name: 'Content', exact: true }).click();
  await expect(canvas).toBeVisible();
  await expect(canvas.getByRole('heading', { name: 'A page built on the canvas' })).toBeVisible();
  await studio.getByRole('tab', { name: 'Model', exact: true }).click();
  await expect(canvas).toBeVisible();
  await expect(studio.getByRole('heading', { name: 'Add typed field' })).toBeVisible();
  await studio.getByRole('tab', { name: 'Blueprint', exact: true }).click();
  await expect(input).toHaveValue('A page built on the canvas');
  await studio.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(heading).toBeVisible();
  await studio.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(canvas.getByRole('heading', { name: 'A page built on the canvas' })).toBeVisible();
  await studio.getByRole('button', { name: 'Inline', exact: true }).click();
  await expect(canvas.getByRole('heading', { name: 'A page built on the canvas' })).toBeVisible();

  // Activating a rendered block moves the author to its typed control while
  // the page stays visible; value editing never edits the rendered markup.
  await region.dblclick();
  await expect(input).toBeFocused();
  await expect(canvas.getByRole('heading', { name: 'A page built on the canvas' })).toBeVisible();

  // Palette-to-canvas insertion is an enhancement over the click path: a
  // cancelled carry changes nothing, and a drop dispatches the same
  // insert-node command at the geometry-ranked destination.
  const divider = studio
    .getByRole('complementary', { name: 'Block palette' })
    .getByRole('button', { name: 'Divider', exact: true });
  await divider.scrollIntoViewIfNeeded();
  // Dropping just under the heading ranks the boundary after it inside the
  // hero section above any document-root boundary.
  const headingBox = await region.boundingBox();
  const dividerBox = await divider.boundingBox();
  expect(headingBox).not.toBeNull();
  expect(dividerBox).not.toBeNull();
  if (headingBox === null || dividerBox === null) return;
  const dropPoint = {
    x: headingBox.x + headingBox.width / 2,
    y: headingBox.y + headingBox.height + 2,
  };
  await page.mouse.move(dividerBox.x + dividerBox.width / 2, dividerBox.y + dividerBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(dropPoint.x, dropPoint.y, { steps: 8 });
  await expect(studio.locator('.preview-canvas-drop-indicator')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(canvas.locator('[data-studio-block="divider"]')).toHaveCount(0);
  await page.mouse.move(dividerBox.x + dividerBox.width / 2, dividerBox.y + dividerBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(dropPoint.x, dropPoint.y, { steps: 8 });
  await expect(studio.locator('.preview-canvas-drop-indicator')).toBeVisible();
  await page.mouse.up();
  await expect(
    canvas.locator('[data-studio-block="section"] [data-studio-block="divider"]'),
  ).toHaveCount(1);
  await expect(canvas.locator('[data-studio-block="divider"]')).toHaveCount(1);
  const orderAfterDrop = await canvas
    .locator('[data-studio-block="section"] [data-studio-block]')
    .evaluateAll((elements) =>
      elements.map((element) => element.getAttribute('data-studio-block')),
    );
  expect(orderAfterDrop.indexOf('divider')).toBe(orderAfterDrop.indexOf('heading') + 1);

  // Responsive widths represent the authored page, not the editor width, and
  // switching them keeps selection and the rendered content.
  await studio.getByRole('button', { name: 'Mobile', exact: true }).click();
  await expect(canvas.locator('.canvas-viewport')).toHaveCSS('inline-size', '360px');
  await expect(canvas.getByRole('heading', { name: 'A page built on the canvas' })).toBeVisible();
  await studio.getByRole('button', { name: 'Desktop', exact: true }).click();
  await expect(canvas.locator('.canvas-viewport')).toHaveCSS('inline-size', '1440px');
  expect(errors).toEqual([]);
  const scan = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(scan.violations, JSON.stringify(scan.violations, null, 2)).toEqual([]);
  await test.info().attach('canvas-workspace-desktop', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
});

test('small-screen sheets preserve a rendered page and expose the same typed controls', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const studio = await openPublicStudio(page);
  await showWorkspacePane(studio, 'Blocks');
  await studio.getByLabel('Search blocks and patterns').fill('heading');
  await studio
    .getByRole('complementary', { name: 'Block palette' })
    .getByRole('button', { name: 'Heading', exact: true })
    .click();
  // A completed insertion brings the user back to the page instead of hiding the result.
  await showWorkspacePane(studio, 'Canvas');
  const canvas = studio.locator('.local-canvas-host');
  await expect(canvas).toBeVisible();
  await showWorkspacePane(studio, 'Outline');
  await studio.locator('.outline-entry').first().click();
  await showWorkspacePane(studio, 'Inspector');
  await studio.locator('[data-scalar-key="port:text"] input').fill('Mobile authoring');
  await showWorkspacePane(studio, 'Canvas');
  await expect(canvas.getByRole('heading', { name: 'Mobile authoring' })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
  await test.info().attach('canvas-workspace-mobile', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
});
