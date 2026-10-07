import { expect, type Locator, type Page } from '@playwright/test';

export type WorkspacePane = 'Blocks' | 'Canvas' | 'Inspector' | 'Outline';

/**
 * The structure column shows one layer at a time. When the details view is
 * showing, its header's "Back" control returns to the structure view with the
 * selected entry focused. Role queries exclude a hidden header, so this is a
 * no-op in the structure view, on a sheet other than the Inspector, and in the
 * contextual Content and Model modes, where the shell renders no Back and the
 * Blueprint tab is the return.
 */
export async function returnToStructure(shell: Locator): Promise<void> {
  const back = shell
    .getByRole('complementary', { name: 'Inspector' })
    .getByRole('button', { name: 'Back', exact: true });
  if ((await back.count()) > 0 && (await back.isVisible())) {
    await back.click();
    await expect(shell.locator('.workspace')).toHaveAttribute('data-panel-view', 'structure');
  }
}

/**
 * At wide widths the block palette sits behind the Outline's "Add blocks"
 * disclosure, which the shell closes on a non-empty document and hides with
 * the structure view while the details view shows. Opening it here is
 * idempotent: the details view is left first, an already-open disclosure (a
 * blank document, or a library that keeps keyboard focus across a session
 * rebuild) is left alone, and the narrow sheets, where the toggle is a sheet
 * switch, go through `showPane`.
 */
export async function openBlocks(shell: Locator): Promise<void> {
  await returnToStructure(shell);
  const toggle = shell.getByRole('button', { name: 'Add blocks', exact: true });
  if (
    (await toggle.count()) > 0 &&
    (await toggle.isVisible()) &&
    (await toggle.getAttribute('aria-expanded')) === 'false'
  ) {
    await toggle.click();
  }
}

/**
 * Below the workspace's container breakpoint the Library, Outline, and
 * Inspector are mutually exclusive sheets behind the visible pane switcher;
 * the Outline and Inspector sheets are the structure and details views. Wide
 * layouts show the page beside one layer of the structure column, so the
 * switcher is absent: `Blocks` opens the structure view's disclosure and
 * `Outline` returns from the details view, while `Inspector` is reached only
 * through a page click, `Enter` on the stage or the selected entry's `Edit`,
 * which a spec drives itself. Specs always reach a pane through a visible
 * control, never through a hidden DOM mutation.
 */
export async function showPane(shell: Locator, name: WorkspacePane): Promise<void> {
  const switcher = shell.getByRole('navigation', { name: 'Workspace panels' });
  if (await switcher.isVisible()) {
    await switcher.getByRole('button', { name, exact: true }).click();
  } else if (name === 'Blocks') {
    await openBlocks(shell);
  } else if (name === 'Outline') {
    await returnToStructure(shell);
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
 * inserted, that block selected and its details view open so the inspector
 * shows its editors, and the command palette open. Checks that follow
 * therefore cover the populated chrome — outline entries, outline controls,
 * inspector forms, and palette results — rather than the empty shell.
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
  // At wide widths the details view opens through the selected entry's
  // visible `Edit` control; on the narrow sheets the Inspector sheet is the
  // details view itself.
  const switcher = shell.getByRole('navigation', { name: 'Workspace panels' });
  if (!(await switcher.isVisible())) {
    await shell
      .getByRole('group', { name: 'Block actions' })
      .getByRole('button', { name: 'Edit', exact: true })
      .click();
  }
  await showPane(shell, 'Inspector');
  await expect(shell.getByRole('complementary', { name: 'Inspector' })).toContainText('Identifier');
  await page.keyboard.press('Control+k');
  await expect(shell.getByRole('textbox', { name: 'Filter commands' })).toBeFocused();
}
