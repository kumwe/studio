import { expect, test } from '@playwright/test';

test('the representative page renders every node and supports disclosure keyboards', async ({
  page,
}) => {
  await page.goto('/');
  const shell = page.locator('kumwe-studio');
  const surface = page.locator('.preview-surface');
  await expect(shell.locator('.preview-status')).toHaveText('Preview is current.');

  const documentNodeIds = await shell.evaluate((element) => {
    const roots =
      (element as HTMLElement & { document?: { roots?: { id: string; slots: object }[] } }).document
        ?.roots ?? [];
    const ids: string[] = [];
    const visit = (node: { id: string; slots: object }): void => {
      ids.push(node.id);
      for (const children of Object.values(node.slots) as { id: string; slots: object }[][]) {
        children.forEach(visit);
      }
    };
    roots.forEach(visit);
    return ids;
  });
  await expect(surface.locator('[data-marker]')).toHaveCount(documentNodeIds.length);
  const renderedNodeIds = await surface
    .locator('[data-marker]')
    .evaluateAll((elements) =>
      elements.map((element) => (element as HTMLElement).dataset.studioNode ?? ''),
    );
  expect(new Set(renderedNodeIds)).toEqual(new Set(documentNodeIds));

  const tabs = surface.getByRole('tab');
  await expect(tabs).toHaveCount(2);
  await tabs.first().focus();
  await page.keyboard.press('ArrowRight');
  await expect(tabs.nth(1)).toBeFocused();
  await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');

  const dialogTrigger = surface.locator('[data-studio-dialog-trigger]');
  await dialogTrigger.click();
  await expect(surface.locator('[data-studio-dialog]')).toHaveAttribute('open', '');
  await surface.locator('[data-studio-dialog-close]').click();
  await expect(surface.locator('[data-studio-dialog]')).not.toHaveAttribute('open', '');
  await expect(dialogTrigger).toBeFocused();

  const popoverTrigger = surface.locator('[data-studio-popover-trigger]');
  await popoverTrigger.click();
  await expect(surface.locator('[data-studio-popover]')).toHaveAttribute('open', '');
  await page.keyboard.press('Escape');
  await expect(surface.locator('[data-studio-popover]')).not.toHaveAttribute('open', '');
  await expect(popoverTrigger).toBeFocused();

  const navigationToggle = surface.locator('[data-studio-navigation-toggle]');
  await navigationToggle.click();
  await expect(navigationToggle).toHaveAttribute('aria-expanded', 'true');
  await navigationToggle.press('Escape');
  await expect(navigationToggle).toHaveAttribute('aria-expanded', 'false');
  await expect(navigationToggle).toBeFocused();

  const notice = surface.locator('[data-studio-notice]');
  await notice.getByRole('button', { name: 'Dismiss' }).click();
  await expect(notice).toBeHidden();
});

test('Studio controls edit, upload, save, reload, and render canonical values', async ({
  page,
}) => {
  await page.goto('/');
  const shell = page.locator('kumwe-studio');
  const surface = page.locator('.preview-surface');
  await expect(shell.locator('.preview-status')).toHaveText('Preview is current.');

  const paragraph = page.locator(
    '[data-reference-control="rich-text"] [role="textbox"][aria-label="Paragraph"]',
  );
  await expect(paragraph).toBeVisible();
  await paragraph.fill('Studio persists only canonical rich text across a browser draft reload.');
  await expect(surface.locator('[data-studio-node="faq-editor-answer"]')).toContainText(
    'Studio persists only canonical rich text across a browser draft reload.',
  );

  const media = page.locator('[data-reference-control="media"]');
  await media.getByRole('button', { name: 'Search media library' }).click();
  await media.getByRole('button', { name: 'Select gallery-two.svg (image)' }).click();
  await expect(surface.locator('[data-studio-node="hero-image"] img')).toHaveAttribute(
    'src',
    '/reference-media/gallery-two.svg',
  );

  await page.locator('.reference-save').click();
  await expect(page.locator('.reference-session-status')).toHaveText('Browser draft saved.');
  const serialized = await page.evaluate(() => localStorage.getItem('studio.reference/draft-v1'));
  expect(serialized).toContain('Studio persists only canonical rich text');
  expect(serialized).not.toMatch(/editorjs|codex|tunes/iu);

  await media.getByLabel('Upload media').setInputFiles({
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
    mimeType: 'image/svg+xml',
    name: 'replacement.svg',
  });
  await expect(surface.locator('[data-studio-node="hero-image"] img')).toHaveAttribute(
    'src',
    '/reference-media/hero.svg',
  );

  await page.locator('.reference-reload').click();
  await expect(page.locator('.reference-session-status')).toHaveText('Browser draft reloaded.');
  await expect(surface.locator('[data-studio-node="hero-image"] img')).toHaveAttribute(
    'src',
    '/reference-media/gallery-two.svg',
  );
  await expect(surface.locator('[data-studio-node="faq-editor-answer"]')).toContainText(
    'Studio persists only canonical rich text across a browser draft reload.',
  );
});

test.describe('touch and right-to-left delivery', () => {
  test.use({ hasTouch: true, viewport: { height: 844, width: 390 } });

  test('touch disclosure remains operable in an RTL preview', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      document.documentElement.dir = 'rtl';
    });
    const surface = page.locator('.preview-surface');
    const navigation = surface.getByRole('navigation', { name: 'Reference page' });
    await expect(navigation).toHaveCSS('direction', 'rtl');
    const toggle = navigation.getByRole('button', { name: 'Toggle Guides navigation' });
    await toggle.tap();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await toggle.tap();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });
});
