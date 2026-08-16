import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { openShell, populateShell } from '../support/shell.js';

/**
 * SR-025: the authoring chrome passes the automated WCAG 2.1 A/AA axe scan
 * with zero violations. axe-core walks open shadow roots, so the scan covers
 * the shell's shadow DOM as well as the host document around it.
 */
test('the authoring chrome passes the WCAG 2.1 AA axe scan', async ({ page }) => {
  const shell = await openShell(page);
  await populateShell(page, shell);

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();

  expect(
    results.violations.map((violation) => ({
      help: violation.help,
      id: violation.id,
      impact: violation.impact,
      nodes: violation.nodes.map((node) => node.target.join(' ')),
    })),
  ).toEqual([]);
});
