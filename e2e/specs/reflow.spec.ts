import { expect, test, type Page } from '@playwright/test';
import { openAdvancedInspector, openShell, showPane } from '../support/shell.js';

/**
 * SR-020: authoring surfaces reflow at 400% zoom without loss of function.
 * WCAG 1.4.10 defines the reflow envelope as content usable at 320 CSS px of
 * width without two-dimensional scrolling, so the spec runs the workspace in
 * a 320x256 viewport, forbids horizontal overflow, and proves the core
 * authoring functions stay reachable. At this width the Library, Outline, and
 * Inspector are mutually exclusive sheets behind the visible pane switcher;
 * the canvas remains central and the command palette is a workspace-level
 * layer reachable from every pane.
 */
test.use({ viewport: { height: 256, width: 320 } });

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const document_ = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(document_.scrollWidth).toBeLessThanOrEqual(document_.clientWidth);
  // The host clips the shell, so overflow inside it would hide chrome rather
  // than scroll the page; measure the element's own content width as well.
  const shell = await page.locator('kumwe-studio').evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(shell.scrollWidth).toBeLessThanOrEqual(shell.clientWidth);
}

test('the workspace reflows at 320 CSS px without losing core functions', async ({ page }) => {
  const shell = await openShell(page);
  await expectNoHorizontalOverflow(page);
  await expect(shell.getByRole('navigation', { name: 'Workspace panels' })).toBeVisible();

  // Inserting from the block palette still works, and a completed insertion
  // returns the author to the rendered page.
  await showPane(shell, 'Blocks');
  await shell
    .getByRole('complementary', { name: 'Block palette' })
    .getByRole('button', { name: 'Section' })
    .click();
  await expect(page.locator('.preview-surface [data-studio-block="section"]')).toHaveCount(1);

  // The outline region remains reachable and its entry takes focus.
  await showPane(shell, 'Outline');
  const outlineEntry = shell
    .getByRole('complementary', { name: 'Outline' })
    .getByRole('button', { name: 'Section' });
  await outlineEntry.click();
  await expect(outlineEntry).toBeFocused();
  await expect(outlineEntry).toHaveAttribute('aria-pressed', 'true');

  // The inspector region remains reachable and its editors accept focus.
  await showPane(shell, 'Inspector');
  const inspector = shell.getByRole('complementary', { name: 'Inspector' });
  await expect(inspector).toContainText('Identifier');
  await openAdvancedInspector(shell);
  const addPropertyName = inspector.getByRole('textbox', { name: 'New property name' });
  await addPropertyName.focus();
  await expect(addPropertyName).toBeFocused();

  // The command palette still opens from the keyboard and takes focus, even
  // while a sheet other than the canvas is showing.
  await showPane(shell, 'Outline');
  await outlineEntry.focus();
  await page.keyboard.press('Control+k');
  await expect(shell.getByRole('textbox', { name: 'Filter commands' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(outlineEntry).toBeFocused();

  await expectNoHorizontalOverflow(page);
});
