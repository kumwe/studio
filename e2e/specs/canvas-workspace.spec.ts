import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { openPublicStudio, showWorkspacePane } from '../support/public-studio.js';

test('the public canvas stays live while typed content, layout and presentation controls change', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 400 });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const studio = await openPublicStudio(page);
  // Inline presentation clamps the workspace to a minimum height, so the
  // overflow premise below runs in Fullscreen, where the workspace follows
  // the (short) viewport.
  await studio.getByRole('button', { name: 'Fullscreen', exact: true }).click();
  const stage = studio.getByRole('group', { name: 'Page canvas', exact: true });
  await stage.focus();
  await expect(stage).toBeFocused();
  // A blank outline still contains instructions that overflow a short workspace.
  // It must be reachable and scrollable before it has any interactive tree entries.
  const outline = studio.getByRole('complementary', { name: 'Outline' });
  expect(await outline.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(
    true,
  );
  await outline.focus();
  await expect(outline).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(outline).not.toBeFocused();
  await page.keyboard.press('Tab');
  await expect(outline).toBeFocused();
  await page.keyboard.press('End');
  await expect.poll(() => outline.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  const blankScan = await new AxeBuilder({ page })
    .withRules(['scrollable-region-focusable'])
    .analyze();
  expect(blankScan.violations, JSON.stringify(blankScan.violations, null, 2)).toEqual([]);
  await page.setViewportSize({ width: 1600, height: 1000 });

  // Wide layout: the structure column shows one layer at a time and opens on
  // the structure view, so the Outline sits entirely to the left of the page
  // while the Inspector waits behind the details view; the page column fills
  // the workspace height, and nothing overflows the viewport horizontally.
  const workspace = studio.locator('.workspace');
  const pageBox = await studio.locator('.local-canvas-region').boundingBox();
  const workspaceBox = await workspace.boundingBox();
  const canvasBox = await studio.getByRole('main', { name: 'Blueprint structure' }).boundingBox();
  expect(pageBox).not.toBeNull();
  expect(workspaceBox).not.toBeNull();
  expect(canvasBox).not.toBeNull();
  if (pageBox === null || workspaceBox === null || canvasBox === null) return;
  await expect(workspace).toHaveAttribute('data-panel-view', 'structure');
  const outlineLandmark = studio.getByRole('complementary', { name: 'Outline', exact: true });
  const inspectorLandmark = studio.getByRole('complementary', { name: 'Inspector', exact: true });
  const outlineBox = await outlineLandmark.boundingBox();
  expect(outlineBox).not.toBeNull();
  if (outlineBox === null) return;
  expect(outlineBox.x + outlineBox.width).toBeLessThanOrEqual(pageBox.x + 1);
  await expect(inspectorLandmark).toBeHidden();
  expect(Math.abs(canvasBox.height - workspaceBox.height)).toBeLessThanOrEqual(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );

  await studio.locator('button.pattern-apply[data-pattern-id="studio.pattern/hero"]').click();
  const canvas = studio.locator('.local-canvas-host');
  const heading = canvas.getByRole('heading', { name: 'Build something meaningful' });
  await expect(heading).toBeVisible();
  // The local canvas keeps its truthful caption in real layout while its
  // heading is demoted to assistive text.
  const caption = studio.locator('.local-canvas-region .preview-status');
  await expect(caption).toBeVisible();
  await expect(caption).toHaveText(/not an authoritative host preview/);
  await expect(studio.locator('.local-canvas-region > h2')).toHaveClass(/assistive/);
  const nodeId = await heading.locator('..').getAttribute('data-studio-node');
  expect(nodeId).not.toBeNull();
  const region = studio.locator(`.preview-canvas-region[data-node-id="${nodeId ?? ''}"]`).first();
  await region.click();
  // A single click on the page opens the details view: the Inspector takes the
  // structure column, left of the page, with the selection path in its
  // header, while the Outline waits behind "Back".
  await expect(workspace).toHaveAttribute('data-panel-view', 'details');
  await expect(outlineLandmark).toBeHidden();
  const inspectorBox = await inspectorLandmark.boundingBox();
  expect(inspectorBox).not.toBeNull();
  if (inspectorBox === null) return;
  expect(inspectorBox.x + inspectorBox.width).toBeLessThanOrEqual(pageBox.x + 1);
  await expect(inspectorLandmark.getByRole('navigation', { name: 'Selection path' })).toBeVisible();
  const input = studio.locator('[data-scalar-key="port:text"] input');
  await expect(input).toHaveValue('Build something meaningful');
  // A single click selects and reveals; it never moves keyboard focus.
  await expect(input).not.toBeFocused();
  // Hovering the rendered block marks its outline entry; leaving clears it.
  await region.hover();
  await expect(studio.locator('button.outline-entry[data-hovered="true"]')).toHaveCount(1);
  await page.mouse.move(5, 5);
  await expect(studio.locator('button.outline-entry[data-hovered="true"]')).toHaveCount(0);
  // "Back" returns to the structure view with the selected entry focused.
  await inspectorLandmark.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(workspace).toHaveAttribute('data-panel-view', 'structure');
  const entry = studio.locator(`button.outline-entry[data-node-id="${nodeId ?? ''}"]`);
  await expect(entry).toBeFocused();
  // Clicking the outline entry selects and focuses it at once: the rect
  // carries both states and selection keeps its solid stroke.
  await entry.click();
  await expect(entry).toBeFocused();
  await expect(region).toHaveAttribute('data-selected', 'true');
  await expect(region).toHaveAttribute('data-focused', 'true');
  expect(await region.evaluate((element) => getComputedStyle(element).strokeDasharray)).toBe(
    'none',
  );
  await stage.focus();
  await page.keyboard.press('Enter');
  await expect(input).toBeFocused();
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
  await showWorkspacePane(studio, 'Blocks');
  await expect(workspace).toHaveAttribute('data-panel-view', 'structure');
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
