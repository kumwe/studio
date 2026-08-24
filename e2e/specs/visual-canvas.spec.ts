import { expect, test } from '@playwright/test';
import { openShell } from '../support/shell.js';

declare global {
  interface Window {
    __studioCanvasCommands?: string[];
    __studioCanvasViolations?: string[];
  }
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.__studioCanvasCommands = [];
    window.__studioCanvasViolations = [];
    document.addEventListener(
      'securitypolicyviolation',
      (event) => {
        window.__studioCanvasViolations?.push(event.effectiveDirective);
      },
      true,
    );
  });
});

test('measured visual drag reparents, cancels cleanly, and has the same keyboard command', async ({
  page,
}) => {
  const shell = await openShell(page);
  await shell.evaluate((element) => {
    element.addEventListener('studio-document-change', (event) => {
      const command = (event as CustomEvent<{ command: { type: string } | null }>).detail.command;
      if (command !== null) {
        window.__studioCanvasCommands?.push(command.type);
      }
    });
  });
  const blocks = shell.getByRole('complementary', { name: 'Block palette' });
  const outline = shell.getByRole('complementary', { name: 'Outline' });
  const preview = page.locator('.preview-surface');

  await blocks.getByRole('button', { name: 'Section' }).click();
  await expect(preview.locator('section.preview-section')).toHaveCount(1);
  await blocks.getByRole('button', { name: 'Section' }).click();
  await expect(preview.locator('section.preview-section')).toHaveCount(2);

  const sections = outline.locator('button.outline-entry', { hasText: 'Section' });
  const secondSectionId = await sections.nth(1).getAttribute('data-node-id');
  expect(secondSectionId).not.toBeNull();
  await sections.nth(0).click();
  await blocks.getByRole('button', { name: 'Text' }).click();
  await expect(
    preview.locator('section.preview-section').nth(0).locator('.preview-text'),
  ).toHaveCount(1);

  const textOutline = outline.locator('button.outline-entry', { hasText: 'Text' });
  const textId = await textOutline.getAttribute('data-node-id');
  expect(textId).not.toBeNull();
  const editToggle = shell.getByRole('button', { name: 'Select and move rendered blocks' });
  await expect(editToggle).toBeVisible();
  await editToggle.click();
  await expect(editToggle).toHaveAttribute('aria-pressed', 'true');

  const source = shell.locator(`.preview-canvas-region[data-node-id="${textId ?? ''}"]`).first();
  const target = preview.locator('section.preview-section').nth(1);
  await expect(source).toHaveCount(1);
  expect(Number(await source.getAttribute('width'))).toBeGreaterThan(0);
  expect(await source.evaluate((element) => getComputedStyle(element).pointerEvents)).toBe('all');
  const overlayBox = await shell.locator('.preview-canvas-overlay').boundingBox();
  expect(overlayBox).not.toBeNull();
  expect(overlayBox?.height ?? 0).toBeGreaterThan(0);
  const sourceBox = await preview.locator('.preview-text').boundingBox();
  const targetBox = await target.boundingBox();
  expect(sourceBox).not.toBeNull();
  expect(targetBox).not.toBeNull();
  if (sourceBox === null || targetBox === null) {
    return;
  }
  const sourcePoint = {
    x: sourceBox.x + sourceBox.width / 2,
    y: sourceBox.y + sourceBox.height / 2,
  };
  const targetPoint = {
    x: targetBox.x + targetBox.width / 2,
    y: targetBox.y + targetBox.height / 2,
  };
  const hitClasses = await shell.evaluate(
    (element, point) =>
      (element.shadowRoot?.elementsFromPoint(point.x, point.y) ?? []).map(
        (candidate) => candidate.getAttribute('class') ?? candidate.tagName,
      ),
    sourcePoint,
  );
  expect(hitClasses).toContain('preview-canvas-region');

  const commandCount = await page.evaluate(() => window.__studioCanvasCommands?.length ?? 0);
  await page.mouse.move(sourcePoint.x, sourcePoint.y);
  await page.mouse.down();
  await page.mouse.move(targetPoint.x, targetPoint.y, { steps: 6 });
  await expect(shell.locator('.preview-canvas-drop-indicator')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(
    preview.locator('section.preview-section').nth(0).locator('.preview-text'),
  ).toHaveCount(1);
  expect(await page.evaluate(() => window.__studioCanvasCommands?.length ?? 0)).toBe(commandCount);

  await page.mouse.move(sourcePoint.x, sourcePoint.y);
  await page.mouse.down();
  await page.mouse.move(targetPoint.x, targetPoint.y, { steps: 6 });
  await page.mouse.up();
  await expect(
    preview.locator('section.preview-section').nth(1).locator('.preview-text'),
  ).toHaveCount(1);
  expect(await page.evaluate(() => window.__studioCanvasCommands?.at(-1))).toBe(
    'studio.command/move-node',
  );

  await shell.getByRole('button', { name: 'Undo' }).click();
  await expect(
    preview.locator('section.preview-section').nth(0).locator('.preview-text'),
  ).toHaveCount(1);
  await textOutline.click();
  const destination = shell.locator('select.outline-move-destination');
  const options = destination.locator('option');
  let optionValue: string | null = null;
  for (let index = 0; index < (await options.count()); index += 1) {
    const option = options.nth(index);
    if ((await option.textContent())?.includes(secondSectionId ?? '') === true) {
      optionValue = await option.getAttribute('value');
      break;
    }
  }
  expect(optionValue).toBeTruthy();
  await destination.selectOption(String(optionValue));
  await expect(
    preview.locator('section.preview-section').nth(1).locator('.preview-text'),
  ).toHaveCount(1);
  expect(await page.evaluate(() => window.__studioCanvasCommands?.at(-1))).toBe(
    'studio.command/move-node',
  );
  expect(await page.evaluate(() => window.__studioCanvasViolations)).toEqual([]);
});
