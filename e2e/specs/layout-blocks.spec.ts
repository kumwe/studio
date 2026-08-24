import { expect, test } from '@playwright/test';
import { openShell } from '../support/shell.js';

test('core layout blocks compose and reflow four-to-two-to-one', async ({ page }) => {
  const shell = await openShell(page);
  const surface = page.getByRole('region', { name: 'Preview' }).locator('.preview-surface');
  await expect(surface.locator('.preview-empty')).toBeVisible();

  await shell
    .getByRole('complementary', { name: 'Block palette' })
    .getByRole('button', { name: 'Grid' })
    .click();
  await shell
    .getByRole('complementary', { name: 'Outline' })
    .getByRole('button', { name: 'Grid' })
    .click();
  for (let index = 0; index < 4; index += 1) {
    await shell
      .getByRole('complementary', { name: 'Block palette' })
      .getByRole('button', { name: 'Stack' })
      .click();
  }

  const grid = surface.locator('.preview-grid-block');
  const slot = grid.locator(':scope > .preview-slot');
  await expect(slot.locator(':scope > .preview-stack')).toHaveCount(4);

  const renderedColumns = async (): Promise<number> =>
    slot.evaluate((element) => {
      const tracks = getComputedStyle(element).gridTemplateColumns.trim();
      return tracks === '' || tracks === 'none' ? 0 : tracks.split(/\s+/u).length;
    });

  await expect(surface).toHaveAttribute('data-preview-viewport', 'compact');
  await expect(grid).toHaveAttribute('data-layout-columns', '1');
  expect(await renderedColumns()).toBe(1);

  await shell
    .getByRole('region', { name: 'Preview width' })
    .getByRole('button', { name: 'Medium' })
    .click();
  await expect(surface).toHaveAttribute('data-preview-viewport', 'medium');
  await expect(grid).toHaveAttribute('data-layout-columns', '2');
  expect(await renderedColumns()).toBe(2);

  await shell
    .getByRole('region', { name: 'Preview width' })
    .getByRole('button', { name: 'Expanded' })
    .click();
  await expect(surface).toHaveAttribute('data-preview-viewport', 'expanded');
  await expect(grid).toHaveAttribute('data-layout-columns', '4');
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
