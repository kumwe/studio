import { expect, type Locator, type Page } from '@playwright/test';

export type WorkspacePane = 'Blocks' | 'Canvas' | 'Inspector' | 'Outline';

/**
 * Below the workspace's container breakpoint the Library, Outline, and
 * Inspector are mutually exclusive sheets behind the visible pane switcher.
 * Wide layouts show every region at once, so the switcher is absent and this
 * helper is a no-op there. Specs always reach a pane through this control,
 * never through a hidden DOM mutation.
 */
export async function showPane(shell: Locator, name: WorkspacePane): Promise<void> {
  const switcher = shell.getByRole('navigation', { name: 'Workspace panels' });
  if (await switcher.isVisible()) {
    await switcher.getByRole('button', { name, exact: true }).click();
  }
}

/**
 * Raw JSON property, binding, and responsive-override editing lives behind
 * the inspector's "Advanced properties and bindings" disclosure so ordinary
 * typed controls come first. Specs that exercise those editors open it here.
 */
export async function openAdvancedInspector(shell: Locator): Promise<void> {
  const disclosure = shell
    .getByRole('complementary', { name: 'Inspector' })
    .locator('details.inspector-advanced');
  await expect(disclosure).toHaveCount(1);
  const open = await disclosure.evaluate((element) => (element as HTMLDetailsElement).open);
  if (!open) {
    await disclosure.locator('summary').click();
  }
}

/**
 * Navigates to the reference host and waits until the shell chrome is
 * interactive, signalled by the block palette offering its first block.
 */
export async function openShell(page: Page): Promise<Locator> {
  await page.goto('/');
  const shell = page.locator('kumwe-studio');
  // Role queries exclude a hidden sheet, so wait for the rendered workspace
  // itself before choosing the pane.
  await expect(shell.locator('.workspace')).toBeAttached();
  await showPane(shell, 'Blocks');
  await expect(
    shell.getByRole('complementary', { name: 'Block palette' }).getByRole('button', {
      name: 'Section',
      exact: true,
    }),
  ).toBeVisible();
  // Mutation-focused specs start from the explicit blank-page action. The
  // default route remains the representative 45-block production page for
  // demo and delivery coverage.
  await page.locator('.reference-new').click();
  await showPane(shell, 'Canvas');
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
  await showPane(shell, 'Blocks');
  await shell
    .getByRole('complementary', { name: 'Block palette' })
    .getByRole('button', { name: 'Section', exact: true })
    .click();
  await showPane(shell, 'Outline');
  const outlineEntry = shell
    .getByRole('complementary', { name: 'Outline' })
    .getByRole('button', { name: 'Section', exact: true })
    .last();
  await outlineEntry.click();
  await showPane(shell, 'Inspector');
  await expect(shell.getByRole('complementary', { name: 'Inspector' })).toContainText('Identifier');
  await page.keyboard.press('Control+k');
  await expect(shell.getByRole('textbox', { name: 'Filter commands' })).toBeFocused();
}
