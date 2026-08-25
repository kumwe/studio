import { expect, test } from '@playwright/test';
import { openShell } from '../support/shell.js';

test('core layout blocks compose and reflow four-to-two-to-one', async ({ page }) => {
  const shell = await openShell(page);
  // The host-owned renderer remains a light-DOM slotted surface. Address it
  // directly instead of assuming the shell's SVG overlay wrapper is a DOM
  // ancestor across the slot boundary.
  const surface = page.locator('.preview-surface');
  await expect(surface.locator('.preview-empty')).toBeVisible();

  await shell
    .getByRole('complementary', { name: 'Block palette' })
    .getByRole('button', { name: 'Grid', exact: true })
    .click();
  await shell
    .getByRole('complementary', { name: 'Outline' })
    .getByRole('button', { name: 'Grid', exact: true })
    .click();
  for (let index = 0; index < 4; index += 1) {
    await shell
      .getByRole('complementary', { name: 'Block palette' })
      .getByRole('button', { name: 'Stack', exact: true })
      .click();
  }

  const grid = surface.locator('[data-studio-block="grid"]');
  const layout = grid.locator(':scope > [data-studio-layout="grid"]');
  await expect(layout.locator(':scope > [data-studio-block="stack"]')).toHaveCount(4);

  const renderedColumns = async (): Promise<number> =>
    layout.evaluate((element) => {
      const tracks = getComputedStyle(element).gridTemplateColumns.trim();
      return tracks === '' || tracks === 'none' ? 0 : tracks.split(/\s+/u).length;
    });

  await expect(surface).toHaveAttribute('data-preview-viewport', 'compact');
  expect(await renderedColumns()).toBe(1);

  await shell
    .getByRole('region', { name: 'Preview width' })
    .getByRole('button', { name: 'Medium' })
    .click();
  await expect(surface).toHaveAttribute('data-preview-viewport', 'medium');
  expect(await renderedColumns()).toBe(2);

  await shell
    .getByRole('region', { name: 'Preview width' })
    .getByRole('button', { name: 'Expanded' })
    .click();
  await expect(surface).toHaveAttribute('data-preview-viewport', 'expanded');
  expect(await renderedColumns()).toBe(4);

  const persisted = await shell.evaluate((element) => {
    const studio = element as HTMLElement & {
      document?: { roots: { properties: unknown; responsive?: unknown }[] };
    };
    return studio.document?.roots[0];
  });
  expect(persisted).toMatchObject({
    properties: { collapse: 'stack', columns: 1 },
    responsive: { columns: { expanded: 4, medium: 2 } },
  });
  expect(JSON.stringify(persisted)).not.toMatch(/(?:<style|className|cssText|style=)/iu);
});
