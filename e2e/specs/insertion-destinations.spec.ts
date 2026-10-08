import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Locator } from '@playwright/test';
import { openPublicStudio } from '../support/public-studio.js';
import { openShell } from '../support/shell.js';

declare global {
  interface Window {
    __studioInsertionViolations?: string[];
  }
}

/** The SVG geometry of a band, read from the DOM (a box would widen by the stroke). */
async function rectGeometry(
  rect: Locator,
): Promise<{ height: number; width: number; x: number; y: number }> {
  return rect.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return { height: box.height, width: box.width, x: box.x, y: box.y };
  });
}

/** The node identifier an exact outline row stands for. */
async function nodeIdOf(entry: Locator): Promise<string> {
  const nodeId = await entry.getAttribute('data-node-id');
  expect(nodeId).not.toBeNull();
  return nodeId ?? '';
}

test('every + names its destination, columns are one undo step and the empty container band is live on the local canvas', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const studio = await openPublicStudio(page);
  const workspace = studio.locator('.workspace');
  const main = studio.getByRole('main', { name: 'Blueprint structure' });
  const outline = studio.getByRole('complementary', { name: 'Outline', exact: true });
  const palette = studio.getByRole('complementary', { name: 'Block palette' });
  const canvas = studio.locator('.local-canvas-host');
  const destination = studio.locator('p.library-destination');
  const search = studio.getByLabel('Search blocks and patterns');
  // The Blueprint shell's own polite live region (the contextual wrapper
  // around it keeps a separate one).
  const liveRegion = studio.locator('kumwe-studio').locator('p.assistive[aria-live="polite"]');

  // The empty page is a dashed zone with a real `Add to page` control under
  // the stage; it opens the add layer for the document roots and moves focus
  // to the search field, which the destination line describes.
  await expect(studio.locator('main.canvas')).toHaveAttribute('data-empty', 'true');
  const pageZone = studio.locator('div.canvas-add-zone');
  await expect(pageZone).toBeVisible();
  await expect(pageZone).toContainText('Choose a block to begin composing.');
  await main.getByRole('button', { name: 'Add to page', exact: true }).click();
  await expect(workspace).toHaveAttribute('data-library', 'open');
  await expect(destination).toHaveText('Adding to document roots, position 1 of 1');
  await expect(search).toBeFocused();
  await expect(search).toHaveAttribute('aria-describedby', 'library-destination');

  // A column card inserts one columns block with three stack children; the
  // structure rows derive the column labels and the add layer's destination
  // is consumed by the insertion.
  await palette.getByRole('button', { name: '3 columns', exact: true }).click();
  const columns = canvas.locator('[data-studio-block="columns"]');
  await expect(
    columns.locator(':scope > [data-studio-layout="columns"] > [data-studio-block="stack"]'),
  ).toHaveCount(3);
  await expect(studio.locator('main.canvas')).toHaveAttribute('data-empty', 'false');
  await expect(pageZone).toHaveCount(0);
  await expect(destination).toHaveCount(0);
  // The standalone runtime inserts synchronously; the shell completes that
  // insertion as its own: the columns block is selected, its row takes focus
  // and the insertion is announced once by name.
  const columnsRow = outline.getByRole('button', { name: 'Columns', exact: true });
  await expect(columnsRow).toHaveAttribute('aria-pressed', 'true');
  await expect(columnsRow).toBeFocused();
  await expect(liveRegion).toHaveText('Inserted 3 columns');
  for (let index = 1; index <= 3; index += 1) {
    await expect(
      outline.getByRole('button', { name: `Stack, column ${String(index)} of 3`, exact: true }),
    ).toBeVisible();
  }
  const firstStackId = await nodeIdOf(
    outline.getByRole('button', { name: 'Stack, column 1 of 3', exact: true }),
  );

  // Every empty stack shows a dashed band inside its rendered box on the
  // local canvas, kept usable by the empty-container height rule, and a
  // mirrored native control under the stage with the same destination.
  const bands = studio.locator('g.preview-canvas-add-zone');
  await expect(bands).toHaveCount(3);
  const stackIds = await outline
    .locator('button.outline-entry', { hasText: 'Stack, column' })
    .evaluateAll((entries) => entries.map((entry) => entry.getAttribute('data-node-id') ?? ''));
  expect(stackIds).toHaveLength(3);
  for (const stackId of stackIds) {
    const bandBox = await rectGeometry(
      studio.locator(`g.preview-canvas-add-zone[data-parent-id="${stackId}"] > rect`),
    );
    const stackBox = await rectGeometry(canvas.locator(`[data-studio-node="${stackId}"]`));
    expect(bandBox.height).toBeGreaterThanOrEqual(40);
    expect(bandBox.width).toBeGreaterThanOrEqual(40);
    expect(bandBox.x).toBeGreaterThanOrEqual(stackBox.x - 1);
    expect(bandBox.y).toBeGreaterThanOrEqual(stackBox.y - 1);
    expect(bandBox.x + bandBox.width).toBeLessThanOrEqual(stackBox.x + stackBox.width + 1);
    expect(bandBox.y + bandBox.height).toBeLessThanOrEqual(stackBox.y + stackBox.height + 1);
  }
  const zoneList = studio.getByRole('group', { name: 'Empty containers', exact: true });
  const mirrors = zoneList.locator('button.canvas-add-into');
  await expect(mirrors).toHaveCount(3);
  await expect(mirrors.first()).toHaveAccessibleName(
    `Add block into Items of Stack, column 1 of 3 (${firstStackId})`,
  );
  await expect(mirrors.first()).toHaveAttribute('data-parent-id', firstStackId);
  await expect(mirrors.first()).toHaveAttribute('data-slot', 'items');

  // The band is pointer-transparent: a press inside an empty stack away from
  // its `+` still selects that stack from the page and opens no add layer.
  const secondStackId = stackIds[1] ?? '';
  const secondBand = studio.locator(
    `g.preview-canvas-add-zone[data-parent-id="${secondStackId}"] > rect`,
  );
  expect(await secondBand.evaluate((element) => getComputedStyle(element).pointerEvents)).toBe(
    'none',
  );
  const secondBox = await rectGeometry(secondBand);
  await page.mouse.click(secondBox.x + 6, secondBox.y + 6);
  await expect(workspace).toHaveAttribute('data-panel-view', 'details');
  await expect(studio.locator('.inspector-selection')).toHaveText('Stack, column 2 of 3');
  await expect(destination).toHaveCount(0);

  // The local canvas is always in edit mode, so the first band's `+` takes
  // the pointer and opens the add layer for the first column, back in the
  // structure view.
  const firstDisc = studio.locator(
    `g.preview-canvas-add-zone[data-parent-id="${firstStackId}"][data-slot="items"] > circle`,
  );
  await expect(firstDisc).toHaveCount(1);
  expect(await firstDisc.evaluate((element) => getComputedStyle(element).pointerEvents)).not.toBe(
    'none',
  );
  await firstDisc.click();
  await expect(workspace).toHaveAttribute('data-panel-view', 'structure');
  await expect(destination).toHaveText(
    `Adding to Stack, column 1 of 3 (${firstStackId}): Items slot, position 1 of 1`,
  );
  await expect(search).toBeFocused();
  const scan = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(scan.violations, JSON.stringify(scan.violations, null, 2)).toEqual([]);

  await palette.getByRole('button', { name: 'Heading', exact: true }).click();
  const firstStack = canvas.locator(`[data-studio-node="${firstStackId}"]`);
  await expect(firstStack.locator('[data-studio-block="heading"]')).toHaveCount(1);
  await expect(bands).toHaveCount(2);
  await expect(mirrors).toHaveCount(2);
  await expect(destination).toHaveCount(0);

  // The inserted heading is the selection, its row has focus and the
  // insertion is announced by name; the row offers `Add block after`, which
  // names the position after it inside the same column.
  const headingRow = outline.getByRole('button', { name: 'Heading', exact: true });
  await expect(headingRow).toHaveAttribute('aria-pressed', 'true');
  await expect(headingRow).toBeFocused();
  await expect(liveRegion).toHaveText('Inserted Heading');
  await studio
    .getByRole('group', { name: 'Block actions' })
    .getByRole('button', { name: 'Add block after', exact: true })
    .click();
  await expect(destination).toHaveText(
    `Adding to Stack, column 1 of 3 (${firstStackId}): Items slot, position 2 of 2`,
  );
  await expect(search).toBeFocused();
  await palette.getByRole('button', { name: 'Divider', exact: true }).click();
  await expect(firstStack.locator('[data-studio-block="divider"]')).toHaveCount(1);
  await expect(outline.getByRole('button', { name: 'Divider', exact: true })).toBeFocused();
  await expect(liveRegion).toHaveText('Inserted Divider');
  const order = await firstStack
    .locator('[data-studio-block]')
    .evaluateAll((elements) =>
      elements.map((element) => element.getAttribute('data-studio-block')),
    );
  expect(order).toEqual(['heading', 'divider']);

  // Undo removes the divider, then the heading, then the columns block and
  // all three stacks at once: the column card was one batch.
  const undo = studio.getByRole('button', { name: 'Undo', exact: true });
  await undo.click();
  await expect(canvas.locator('[data-studio-block="divider"]')).toHaveCount(0);
  await expect(firstStack.locator('[data-studio-block="heading"]')).toHaveCount(1);
  await undo.click();
  await expect(canvas.locator('[data-studio-block="heading"]')).toHaveCount(0);
  await expect(canvas.locator('[data-studio-block="stack"]')).toHaveCount(3);
  await undo.click();
  await expect(canvas.locator('[data-studio-block="columns"]')).toHaveCount(0);
  await expect(canvas.locator('[data-studio-block="stack"]')).toHaveCount(0);
  await expect(studio.locator('main.canvas')).toHaveAttribute('data-empty', 'true');

  // A content block with an empty slot draws no band over its content: its
  // empty Actions slot is offered by the mirrored list, and a press on the
  // card selects the card. The local canvas is always in edit mode, so the
  // press is a real pointer press on the page, which the overlay receives.
  await main.getByRole('button', { name: 'Add to page', exact: true }).click();
  await palette.getByRole('button', { name: 'Card', exact: true }).click();
  const card = canvas.locator('[data-studio-block="card"]');
  await expect(card).toHaveCount(1);
  const cardId = await nodeIdOf(outline.getByRole('button', { name: 'Card', exact: true }));
  await expect(studio.locator(`g.preview-canvas-add-zone[data-parent-id="${cardId}"]`)).toHaveCount(
    0,
  );
  await expect(
    zoneList.locator(`button.canvas-add-into[data-parent-id="${cardId}"][data-slot="actions"]`),
  ).toHaveAccessibleName(`Add block into Actions of Card (${cardId})`);
  const cardBox = await rectGeometry(card);
  await page.mouse.click(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2);
  await expect(workspace).toHaveAttribute('data-panel-view', 'details');
  await expect(studio.locator('.inspector-selection')).toHaveText('Card');
  await expect(destination).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('a host preview shows the band only in edit mode and the mirrored control reaches the same destination', async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.__studioInsertionViolations = [];
    document.addEventListener(
      'securitypolicyviolation',
      (event) => {
        window.__studioInsertionViolations?.push(event.effectiveDirective);
      },
      true,
    );
  });
  const shell = await openShell(page);
  const blocks = shell.getByRole('complementary', { name: 'Block palette' });
  const outline = shell.getByRole('complementary', { name: 'Outline' });
  const preview = page.locator('.preview-surface');

  await blocks.getByRole('button', { name: 'Section', exact: true }).click();
  const section = preview.locator('[data-studio-block="section"]');
  await expect(section).toHaveCount(1);
  const sectionId = await nodeIdOf(outline.locator('button.outline-entry', { hasText: 'Section' }));

  // Operate mode: no band on the rendered page, but the mirrored control
  // under the stage is always there.
  const editToggle = shell
    .locator('.canvas-toolbar')
    .getByRole('button', { name: 'Select and move rendered blocks' });
  await expect(editToggle).toHaveAttribute('aria-pressed', 'false');
  await expect(shell.locator('g.preview-canvas-add-zone')).toHaveCount(0);
  const mirror = shell.locator(
    `div.canvas-add-zones[role="group"] > button.canvas-add-into[data-parent-id="${sectionId}"]`,
  );
  await expect(mirror).toHaveCount(1);
  await expect(mirror).toHaveAccessibleName(`Add block into Content of Section (${sectionId})`);
  await expect(mirror).toHaveAttribute('data-slot', 'content');

  // Edit mode: the band is drawn inside the rendered empty section; only its
  // centred `+` takes the pointer.
  await editToggle.click();
  await expect(editToggle).toHaveAttribute('aria-pressed', 'true');
  const band = shell.locator(
    `g.preview-canvas-add-zone[data-parent-id="${sectionId}"][data-slot="content"] > rect`,
  );
  await expect(band).toHaveCount(1);
  expect(await band.evaluate((element) => getComputedStyle(element).pointerEvents)).toBe('none');
  const disc = shell.locator(
    `g.preview-canvas-add-zone[data-parent-id="${sectionId}"][data-slot="content"] > circle`,
  );
  expect(await disc.evaluate((element) => getComputedStyle(element).pointerEvents)).not.toBe(
    'none',
  );
  await expect.poll(async () => (await rectGeometry(band)).height).toBeGreaterThanOrEqual(20);
  const bandBox = await rectGeometry(band);
  const sectionBox = await rectGeometry(section);
  expect(bandBox.x).toBeGreaterThanOrEqual(sectionBox.x - 1);
  expect(bandBox.y).toBeGreaterThanOrEqual(sectionBox.y - 1);
  expect(bandBox.x + bandBox.width).toBeLessThanOrEqual(sectionBox.x + sectionBox.width + 1);
  expect(bandBox.y + bandBox.height).toBeLessThanOrEqual(sectionBox.y + sectionBox.height + 1);

  // The mirrored native control reaches the same destination without
  // geometry or a pointer on the page.
  await mirror.click();
  await expect(shell.locator('p.library-destination')).toHaveText(
    `Adding to Section (${sectionId}): Content slot, position 1 of 1`,
  );
  await expect(shell.getByLabel('Search blocks and patterns')).toBeFocused();
  await blocks.getByRole('button', { name: 'Divider', exact: true }).click();
  await expect(section.locator('[data-studio-block="divider"]')).toHaveCount(1);
  await expect(shell.locator('p.library-destination')).toHaveCount(0);
  await expect(mirror).toHaveCount(0);
  await expect(band).toHaveCount(0);

  // The reference host inserts synchronously and selects what it inserted
  // through `selectNode()`; the shell completes the insertion.
  const liveRegion = shell.locator('p.assistive[aria-live="polite"]');
  const dividerRow = outline.getByRole('button', { name: 'Divider', exact: true });
  await expect(dividerRow).toHaveAttribute('aria-pressed', 'true');
  await expect(liveRegion).toHaveText('Inserted Divider');

  // `Add block before` reaches the first position of a non-empty slot, and
  // the reference host honours that explicit position.
  await shell
    .getByRole('group', { name: 'Block actions' })
    .getByRole('button', { name: 'Add block before', exact: true })
    .click();
  await expect(shell.locator('p.library-destination')).toHaveText(
    `Adding to Section (${sectionId}): Content slot, position 1 of 2`,
  );
  await blocks.getByRole('button', { name: 'Heading', exact: true }).click();
  await expect(section.locator('[data-studio-block="heading"]')).toHaveCount(1);
  const order = await section
    .locator('[data-studio-block]')
    .evaluateAll((elements) =>
      elements.map((element) => element.getAttribute('data-studio-block')),
    );
  expect(order).toEqual(['heading', 'divider']);
  await expect(outline.getByRole('button', { name: 'Heading', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(liveRegion).toHaveText('Inserted Heading');

  // A column card carries its planned batch; the reference host executes it
  // as one command, selects the columns block, and one Undo removes the
  // columns block with both stacks.
  await blocks.getByRole('button', { name: '2 columns', exact: true }).click();
  const columns = preview.locator('[data-studio-block="columns"]');
  await expect(columns).toHaveCount(1);
  await expect(
    columns.locator(':scope > [data-studio-layout="columns"] > [data-studio-block="stack"]'),
  ).toHaveCount(2);
  await expect(outline.getByRole('button', { name: 'Columns', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(liveRegion).toHaveText('Inserted 2 columns');
  await shell.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(preview.locator('[data-studio-block="columns"]')).toHaveCount(0);
  await expect(preview.locator('[data-studio-block="stack"]')).toHaveCount(0);
  await expect(section.locator('[data-studio-block="heading"]')).toHaveCount(1);
  expect(await page.evaluate(() => window.__studioInsertionViolations)).toEqual([]);
});
