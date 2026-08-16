import { expect, test } from '@playwright/test';
import { openShell, populateShell } from '../support/shell.js';

/**
 * SR-019: a reduced-motion preference disables non-essential motion. The
 * shell and the host stylesheet both carry a prefers-reduced-motion media
 * query zeroing every animation and transition duration, so under emulation
 * no element inside the host document or the shell's shadow DOM may keep a
 * running animation or a non-zero transition.
 */
test('reduced motion zeroes every animation and transition in the chrome', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const shell = await openShell(page);
  await populateShell(page, shell);

  const emulated = await page.evaluate(
    () => matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  expect(emulated).toBe(true);

  const offenders = await page.evaluate(() => {
    const found: string[] = [];
    const describe = (element: Element): string =>
      `${element.tagName.toLowerCase()}${element.className === '' ? '' : `.${element.className}`}`;
    const inspect = (root: Document | ShadowRoot): void => {
      for (const element of root.querySelectorAll('*')) {
        const style = getComputedStyle(element);
        const durations = [
          ...style.transitionDuration.split(','),
          ...style.animationDuration.split(','),
        ].map((value) => value.trim());
        if (durations.some((value) => value !== '0s')) {
          found.push(
            `${describe(element)} transition:${style.transitionDuration} animation:${style.animationDuration}`,
          );
        }
        if (style.animationName !== 'none' && style.animationIterationCount === 'infinite') {
          found.push(`${describe(element)} animation:${style.animationName} loops forever`);
        }
        if (element.shadowRoot !== null) {
          inspect(element.shadowRoot);
        }
      }
    };
    inspect(document);
    return found;
  });

  expect(offenders).toEqual([]);
});
