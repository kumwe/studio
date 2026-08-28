import { expect, test, type Locator, type Page } from '@playwright/test';

test.setTimeout(60_000);

interface ContextualObservation {
  blueprintRevision: string;
  blueprintStateVersion: number;
  dirty: { blueprint: boolean; entry: boolean; model: boolean };
  entryRevision: string;
  entryValues: Record<string, unknown>;
  history: { canRedo: boolean; canUndo: boolean };
  modelRevision: string;
  presentation: string;
  returnContext: string;
  selection: string[];
  start: string;
  type?: { id: string; revision: string; version: string };
}

async function openContextualReference(page: Page): Promise<Locator> {
  await page.goto('/');
  await expect(
    page.getByRole('status').filter({ hasText: 'opened in contextual Studio' }),
  ).toBeVisible();
  const studio = page.locator('kumwe-studio-contextual');
  await expect(studio.getByRole('tab', { name: 'Blueprint' })).toBeVisible();
  return studio;
}

async function observe(studio: Locator): Promise<ContextualObservation> {
  return studio.evaluate((element) => {
    const contextual = element as HTMLElement & {
      blueprintElement?: {
        historyState: { canRedo: boolean; canUndo: boolean };
        selection: string[];
        stateVersion: number;
      };
      currentPresentation: string;
      dirtyState: { blueprint: boolean; entry: boolean; model: boolean };
      snapshot?: {
        presentation: { returnContext: { key: string } };
        start: { kind: string };
        state: {
          coordinates: {
            blueprint: { revision: string };
            entry: { revision: string };
            model: { revision: string };
            type?: { id: string; revision: string; version: string };
          };
          entry: { values: Record<string, unknown> };
        };
      };
    };
    const snapshot = contextual.snapshot;
    const blueprint = contextual.blueprintElement;
    if (snapshot === undefined || blueprint === undefined) {
      throw new Error('The contextual shell has not finished opening.');
    }
    return {
      blueprintRevision: snapshot.state.coordinates.blueprint.revision,
      blueprintStateVersion: blueprint.stateVersion,
      dirty: structuredClone(contextual.dirtyState),
      entryRevision: snapshot.state.coordinates.entry.revision,
      entryValues: structuredClone(snapshot.state.entry.values),
      history: structuredClone(blueprint.historyState),
      modelRevision: snapshot.state.coordinates.model.revision,
      presentation: contextual.currentPresentation,
      returnContext: snapshot.presentation.returnContext.key,
      selection: structuredClone(blueprint.selection),
      start: snapshot.start.kind,
      ...(snapshot.state.coordinates.type === undefined
        ? {}
        : { type: structuredClone(snapshot.state.coordinates.type) }),
    };
  });
}

async function confirmSave(page: Page, outcome: string, expectInitialFocus = true): Promise<void> {
  const review = page.getByRole('heading', { name: `Confirm ${outcome}` });
  await expect(review).toBeVisible();
  if (expectInitialFocus) {
    await expect(page.getByRole('button', { name: 'Confirm with host' })).toBeFocused();
  }
  await page.getByRole('button', { name: 'Confirm with host' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: `${outcome} accepted by the host` }),
  ).toBeVisible();
  await expect(page.locator('.reference-save-result')).toContainText(`${outcome} accepted`);
}

test('the real contextual shell completes every standalone host-authoring outcome in one continuous journey', async ({
  page,
}) => {
  const studio = await openContextualReference(page);
  const existing = await observe(studio);
  expect(existing).toMatchObject({
    blueprintRevision: 'blueprint-r1',
    dirty: { blueprint: false, entry: false, model: false },
    entryRevision: 'entry-r7',
    entryValues: {
      category: 'guide',
      featured: true,
      title: 'Building pages with contextual Studio',
    },
    modelRevision: 'model-r1',
    presentation: 'inline',
    returnContext: 'returns/reference-content-list',
    start: 'existing',
    type: { id: 'studio.reference/page', revision: 'type-r1', version: '1.0.0' },
  });

  // The existing item remains pinned to v1 even though the host offers v2.
  await expect(page.locator('.reference-type-coordinate')).toHaveText(
    'studio.reference/page@1.0.0#type-r1',
  );

  await studio.getByRole('tab', { name: 'Content' }).click();
  const existingTitle = studio.getByRole('textbox', { name: 'Title' });
  await existingTitle.fill('Accepted contextual item');
  await existingTitle.blur();

  await studio.getByRole('tab', { name: 'Blueprint' }).click();
  const blueprint = studio.locator('kumwe-studio');
  await blueprint
    .getByRole('complementary', { name: 'Block palette' })
    .getByRole('button', { name: 'Section', exact: true })
    .click();
  const itemDraft = await observe(studio);
  expect(itemDraft.dirty).toEqual({ blueprint: true, entry: true, model: false });
  expect(itemDraft.entryValues.title).toBe('Accepted contextual item');

  await studio.getByRole('button', { name: 'Save item' }).click();
  await expect(page.locator('.reference-save-artifacts')).toContainText('Entry');
  await expect(page.locator('.reference-save-artifacts')).toContainText('Blueprint');
  await expect(page.locator('.reference-save-consequences')).toHaveText(
    'No reusable content type will be changed.',
  );
  await confirmSave(page, 'Save item');
  const itemAccepted = await observe(studio);
  expect(itemAccepted.entryRevision).not.toBe(existing.entryRevision);
  expect(itemAccepted.blueprintRevision).not.toBe(existing.blueprintRevision);
  expect(itemAccepted.modelRevision).toBe(existing.modelRevision);
  expect(itemAccepted.type).toEqual(existing.type);
  expect(itemAccepted.entryValues.title).toBe('Accepted contextual item');
  expect(itemAccepted.dirty).toEqual({ blueprint: false, entry: false, model: false });

  // Starting from a reusable type resolves the selected v2 artifacts while
  // deliberately creating an Entry with no copied values.
  await page.getByRole('button', { name: 'Start from Reference page 2.0.0' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'opened in contextual Studio' }),
  ).toBeVisible();
  const fromType = await observe(studio);
  expect(fromType).toMatchObject({
    blueprintRevision: 'blueprint-r2',
    entryValues: {},
    modelRevision: 'model-r2',
    start: 'from-type',
    type: { id: 'studio.reference/page', revision: 'type-r2', version: '2.0.0' },
  });

  await studio.getByRole('button', { name: 'Save new type version' }).click();
  await expect(page.locator('.reference-save-consequences')).toContainText(
    'New immutable Model, Blueprint, and reusable-content-type revisions',
  );
  await expect(page.locator('.reference-save-consequences')).toContainText('migrate this Entry');
  await confirmSave(page, 'Save new type version');
  const successor = await observe(studio);
  expect(successor.type?.version).toBe('2.0.1');
  expect(successor.type?.revision).not.toBe(fromType.type?.revision);
  expect(successor.entryRevision).not.toBe(fromType.entryRevision);
  expect(successor.modelRevision).not.toBe(fromType.modelRevision);
  expect(successor.blueprintRevision).not.toBe(fromType.blueprintRevision);

  // A blank contextual start creates Model, Blueprint, and Entry work in the
  // same shell without a prerequisite type-definition screen.
  await page.getByRole('button', { name: 'Start blank' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'opened in contextual Studio' }),
  ).toBeVisible();
  expect(await observe(studio)).toMatchObject({ entryValues: {}, start: 'blank' });

  await studio.getByRole('tab', { name: 'Model' }).click();
  await studio.getByRole('textbox', { name: 'Field identifier' }).fill('summary');
  await studio.getByRole('textbox', { name: 'Label' }).fill('Summary');
  await studio.getByRole('button', { name: 'Add field' }).click();
  await expect(studio.getByRole('heading', { name: 'Model fields' }).locator('..')).toContainText(
    'summary',
  );

  await studio.getByRole('tab', { name: 'Content' }).click();
  const summary = studio.getByRole('textbox', { name: 'Summary' });
  await summary.fill('Entry values stay outside reusable types');
  await summary.blur();
  await studio.getByRole('tab', { name: 'Blueprint' }).click();
  await studio
    .locator('kumwe-studio')
    .getByRole('complementary', { name: 'Block palette' })
    .getByRole('button', { name: 'Section', exact: true })
    .click();
  const blankDraft = await observe(studio);
  expect(blankDraft.dirty).toEqual({ blueprint: true, entry: true, model: true });
  expect(blankDraft.type).toBeUndefined();

  await studio.getByRole('button', { name: 'Save as new type' }).click();
  await expect(page.locator('.reference-save-consequences')).toContainText(
    'Entry’s values are excluded',
  );
  await confirmSave(page, 'Save as new type');
  const newType = await observe(studio);
  expect(newType.type).toMatchObject({ version: '1.0.0' });
  expect(newType.entryValues.summary).toBe('Entry values stay outside reusable types');
  // Save-as-type deliberately excludes Entry values, so the still-unsaved
  // item value survives reconciliation and remains visibly dirty.
  expect(newType.dirty).toEqual({ blueprint: false, entry: true, model: false });

  // Presentation is UI state over one session: no artifact, selection,
  // history, authority, return context, validation, or unsaved work changes.
  await studio.getByRole('tab', { name: 'Blueprint' }).click();
  const section = studio
    .locator('kumwe-studio')
    .getByRole('complementary', { name: 'Outline' })
    .getByRole('button', { name: 'Section', exact: true });
  await section.click();
  await studio
    .locator('kumwe-studio')
    .getByRole('complementary', { name: 'Block palette' })
    .getByRole('button', { name: 'Divider', exact: true })
    .click();
  const beforePresentations = await observe(studio);
  expect(beforePresentations.dirty.blueprint).toBe(true);
  for (const presentation of ['Maximized', 'Fullscreen', 'Minimized', 'Inline']) {
    await studio.getByRole('button', { name: presentation, exact: true }).click();
    const current = await observe(studio);
    expect({ ...current, presentation: beforePresentations.presentation }).toEqual(
      beforePresentations,
    );
  }

  // An edit made after planning is not silently marked durable when the
  // earlier save result returns; the local successor remains visible/dirty.
  await studio.getByRole('tab', { name: 'Content' }).click();
  await studio.getByRole('textbox', { name: 'Summary' }).fill('planned value');
  await studio.getByRole('textbox', { name: 'Summary' }).blur();
  await studio.getByRole('button', { name: 'Save item' }).click();
  await expect(page.getByRole('heading', { name: 'Confirm Save item' })).toBeVisible();
  await studio.getByRole('textbox', { name: 'Summary' }).fill('newer unsaved value');
  await studio.getByRole('textbox', { name: 'Summary' }).blur();
  await page.getByRole('button', { name: 'Confirm with host' }).click();
  await expect(page.getByRole('alert')).toContainText(
    'save intent no longer matches the current resource-bound drafts and revisions',
  );
  const conflicted = await observe(studio);
  expect(conflicted.entryValues.summary).toBe('newer unsaved value');
  expect(conflicted.dirty.entry).toBe(true);

  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Save cancelled. No host revisions changed.' }),
  ).toBeVisible();
  await studio.getByRole('button', { name: 'Save item' }).click();
  await confirmSave(page, 'Save item');
  const recovered = await observe(studio);
  expect(recovered.entryValues.summary).toBe('newer unsaved value');
  expect(recovered.dirty.entry).toBe(false);
});
