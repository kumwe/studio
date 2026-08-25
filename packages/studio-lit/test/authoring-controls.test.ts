import { describe, expect, it } from 'vitest';
import {
  parseScopedCss,
  serializeScopedCss,
  StudioAuthoringControlRegistry,
  type StudioSourcePreviewAdapter,
} from '../src/index.js';

function holder(): HTMLDivElement {
  const element = document.createElement('div');
  document.body.append(element);
  return element;
}

describe('first-party page authoring controls', () => {
  it('mounts the source control behind a CodeMirror-neutral seam and previews lazily', async () => {
    const renders: string[] = [];
    const preview: StudioSourcePreviewAdapter = {
      render(value): Promise<Node> {
        renders.push(value.language);
        const output = document.createElement('pre');
        output.textContent = `trusted:${value.source}`;
        return Promise.resolve(output);
      },
    };
    const root = holder();
    const control = await new StudioAuthoringControlRegistry({ sourcePreview: preview }).mount(
      'studio.control/source',
      {
        holder: root,
        profile: 'studio.source/mermaid',
        value: 'graph TD; A-->B',
      },
    );

    expect(renders).toEqual([]);
    root.querySelector<HTMLButtonElement>('[aria-label="Preview source"]')?.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(renders).toEqual(['mermaid']);
    expect(root.textContent).toContain('trusted:graph TD; A-->B');
    expect(control.value()).toBe('graph TD; A-->B');
    control.destroy();
    root.remove();
  });

  it('authors chart data through a guided accessible table', async () => {
    const root = holder();
    const changes: unknown[] = [];
    const control = await new StudioAuthoringControlRegistry().mount('studio.control/chart', {
      holder: root,
      onChange: (change) => changes.push(change),
      value: {
        datasets: [{ label: 'Sales', values: [10] }],
        labels: ['January'],
        title: 'Revenue',
        type: 'bar',
      },
    });

    root.querySelector<HTMLButtonElement>('[aria-label="Add chart row"]')?.click();
    root.querySelector<HTMLButtonElement>('[aria-label="Add chart dataset"]')?.click();

    expect(control.value()).toMatchObject({
      datasets: [
        { label: 'Sales', values: [10, 0] },
        { label: 'Dataset 2', values: [0, 0] },
      ],
      labels: ['January', 'Label 2'],
    });
    expect(changes).not.toHaveLength(0);
    expect(root.querySelector('table[aria-label="Chart data"]')).not.toBeNull();
    control.destroy();
    root.remove();
  });

  it('keeps exact decimal money and preserves the last canonical value during invalid input', async () => {
    const root = holder();
    const changes: { valid: boolean }[] = [];
    const control = await new StudioAuthoringControlRegistry().mount('studio.control/money', {
      holder: root,
      onChange: (change) => changes.push({ valid: change.valid }),
      value: { amount: '19.95', currency: 'NAD' },
    });
    const amount = root.querySelector<HTMLInputElement>('[aria-label="Exact decimal amount"]');
    if (amount === null) throw new Error('Missing amount input.');
    amount.value = '19.9999999';
    amount.dispatchEvent(new InputEvent('input', { bubbles: true }));

    expect(changes.at(-1)?.valid).toBe(false);
    expect(control.value()).toEqual({ amount: '19.95', currency: 'NAD' });
    control.destroy();
    root.remove();
  });

  it('parses only structured scoped CSS and rejects active or escaping values', async () => {
    const sheet = parseScopedCss(
      'self { color: var(--studio-text); padding-block: 1rem; }\nheading { text-align: center; }',
    );
    expect(serializeScopedCss(sheet)).toContain('heading {');
    expect(() => parseScopedCss('self { background-image: url(https://bad.test/x); }')).toThrow();
    expect(() => parseScopedCss('body { color: red; }')).toThrow(/invalid near character/u);

    const root = holder();
    const control = await new StudioAuthoringControlRegistry().mount('studio.control/scoped-css', {
      holder: root,
      value: sheet,
    });
    const source = root.querySelector<HTMLTextAreaElement>('[aria-label="Scoped CSS source"]');
    if (source === null) throw new Error('Missing scoped CSS source.');
    source.value = 'self { color: red; }';
    source.dispatchEvent(new InputEvent('input', { bubbles: true }));
    expect(control.value()).toEqual({
      rules: [{ declarations: { color: 'red' }, target: 'self' }],
    });
    control.destroy();
    root.remove();
  });

  it('disables page controls for dynamic bindings', async () => {
    const root = holder();
    const control = await new StudioAuthoringControlRegistry().mount('studio.control/money', {
      binding: {
        onError: 'error',
        onNull: 'empty',
        source: {
          kind: 'query-reference',
          parameters: {},
          query: 'app/order-total',
          version: '1.0.0',
        },
        transforms: [],
      },
      holder: root,
      value: { amount: '100', currency: 'NAD' },
    });

    expect(control.readOnly).toBe(true);
    expect(
      [...root.querySelectorAll<HTMLInputElement>('input')].every((input) => input.disabled),
    ).toBe(true);
    control.destroy();
    root.remove();
  });

  it('fails closed for unknown source and rich-text profiles', async () => {
    const root = holder();
    await expect(
      new StudioAuthoringControlRegistry().mount('studio.control/source', {
        holder: root,
        profile: 'host/source',
        value: 'text',
      }),
    ).rejects.toThrow(/Unknown Studio source profile/u);
    await expect(
      new StudioAuthoringControlRegistry().mount('studio.control/rich-text', {
        holder: root,
        profile: 'studio.rich-text/full',
        value: { content: [], type: 'doc' },
      }),
    ).rejects.toThrow(/Unknown Studio rich-text profile/u);
    root.remove();
  });
});
