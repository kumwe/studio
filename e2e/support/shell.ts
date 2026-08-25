import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Navigates to the reference host and waits until the shell chrome is
 * interactive, signalled by the block palette offering its first block.
 */
export async function openShell(page: Page): Promise<Locator> {
  await page.goto('/');
  const shell = page.locator('kumwe-studio');
  await expect(
    shell.getByRole('complementary', { name: 'Block palette' }).getByRole('button', {
      name: 'Section',
    }),
  ).toBeVisible();
  // Mutation-focused specs start from the explicit blank-page action. The
  // default route remains the representative 45-block production page for
  // demo and delivery coverage.
  await page.locator('.reference-new').click();
  await expect(page.locator('.preview-surface .preview-empty')).toBeVisible();
  return shell;
}

/**
 * Drives the demo session into a representative authoring state: one block
 * inserted, that block selected so the inspector shows its editors, and the
 * command palette open. Checks that follow therefore cover the populated
 * chrome — outline entries, outline controls, inspector forms, and palette
 * results — rather than the empty shell.
 */
export async function populateShell(page: Page, shell: Locator): Promise<void> {
  await shell
    .getByRole('complementary', { name: 'Block palette' })
    .getByRole('button', { name: 'Section' })
    .click();
  const outlineEntry = shell
    .getByRole('complementary', { name: 'Outline' })
    .getByRole('button', { name: 'Section' });
  await outlineEntry.click();
  await expect(shell.getByRole('complementary', { name: 'Inspector' })).toContainText('Identifier');
  await page.keyboard.press('Control+k');
  await expect(shell.getByRole('textbox', { name: 'Filter commands' })).toBeFocused();
}
