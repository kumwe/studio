import { describe, expect, it } from 'vitest';
import type { StudioDrawingDocument, StudioTableDocument } from '@kumwe/studio-protocol';
import {
  parseScopedCss,
  serializeScopedCss,
  STUDIO_AUTHORING_CONTROL_IDS,
  StudioAuthoringControlRegistry,
  type StudioSourcePreviewAdapter,
} from '../src/index.js';

function holder(): HTMLDivElement {
  const element = document.createElement('div');
  document.body.append(element);
  return element;
}

describe('first-party page authoring controls', () => {
  it('exports the canonical drawing and table control identifiers', () => {
    expect(STUDIO_AUTHORING_CONTROL_IDS.drawing).toBe('studio.control/drawing');
    expect(STUDIO_AUTHORING_CONTROL_IDS.table).toBe('studio.control/table');
  });

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

  it('authors bounded drawing strokes through keyboard and pointer paths', async () => {
    const root = holder();
    const changes: { valid: boolean; value: unknown }[] = [];
    const control = await new StudioAuthoringControlRegistry().mount('studio.control/drawing', {
      holder: root,
      onChange: (change) => changes.push(change),
      value: { alt: 'A route sketch', height: 100, strokes: [], width: 200 },
    });
    const canvas = root.querySelector<SVGSVGElement>('svg[aria-label="A route sketch"]');
    if (canvas === null) throw new Error('Missing drawing canvas.');

    canvas.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: ' ' }));
    canvas.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowRight' }));
    canvas.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowDown' }));
    canvas.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: ' ' }));
    canvas.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
    expect((control.value() as StudioDrawingDocument).strokes[0]?.points).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ]);

    Object.defineProperty(canvas, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        bottom: 100,
        height: 100,
        left: 0,
        right: 200,
        toJSON: () => ({}),
        top: 0,
        width: 200,
        x: 0,
        y: 0,
      }),
    });
    canvas.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        button: 0,
        clientX: 20,
        clientY: 30,
        pointerId: 7,
      }),
    );
    canvas.dispatchEvent(
      new PointerEvent('pointermove', {
        bubbles: true,
        clientX: 40,
        clientY: 50,
        pointerId: 7,
      }),
    );
    canvas.dispatchEvent(
      new PointerEvent('pointerup', {
        bubbles: true,
        button: 0,
        clientX: 60,
        clientY: 70,
        pointerId: 7,
      }),
    );
    expect((control.value() as StudioDrawingDocument).strokes[1]?.points).toEqual([
      { x: 20, y: 30 },
      { x: 40, y: 50 },
      { x: 60, y: 70 },
    ]);

    root.querySelector<HTMLButtonElement>('[aria-label="Remove last drawing stroke"]')?.click();
    expect((control.value() as StudioDrawingDocument).strokes).toHaveLength(1);
    expect(changes.filter((change) => change.valid)).toHaveLength(3);
    const color = root.querySelector<HTMLInputElement>('[aria-label="Drawing color token"]');
    if (color === null) throw new Error('Missing drawing color control.');
    color.value = 'url(javascript:alert(1))';
    color.dispatchEvent(new InputEvent('input', { bubbles: true }));
    expect(changes.at(-1)?.valid).toBe(false);
    expect((control.value() as StudioDrawingDocument).strokes).toHaveLength(1);
    control.destroy();
    root.remove();
  });

  it('edits canonical text tables and preserves the last valid value', async () => {
    const root = holder();
    const changes: { valid: boolean }[] = [];
    const control = await new StudioAuthoringControlRegistry().mount('studio.control/table', {
      holder: root,
      onChange: (change) => changes.push({ valid: change.valid }),
      profile: 'studio.table/canonical',
      value: { caption: 'Totals', columns: ['Name'], rows: [['One']] },
    });
    const heading = root.querySelector<HTMLInputElement>('[aria-label="Table column 1 heading"]');
    const cell = root.querySelector<HTMLTextAreaElement>('[aria-label="Table row 1, column 1"]');
    if (heading === null || cell === null) throw new Error('Missing canonical table fields.');
    heading.value = 'Item';
    heading.dispatchEvent(new InputEvent('input', { bubbles: true }));
    cell.value = 'First';
    cell.dispatchEvent(new InputEvent('input', { bubbles: true }));
    root.querySelector<HTMLButtonElement>('[aria-label="Add table column"]')?.click();
    root.querySelector<HTMLButtonElement>('[aria-label="Add table row"]')?.click();

    expect(control.value()).toEqual({
      caption: 'Totals',
      columns: ['Item', 'Column 2'],
      rows: [
        ['First', ''],
        ['', ''],
      ],
    });
    const currentCell = root.querySelector<HTMLTextAreaElement>(
      '[aria-label="Table row 1, column 1"]',
    );
    if (currentCell === null) throw new Error('Missing rerendered table cell.');
    currentCell.value = 'x'.repeat(5_001);
    currentCell.dispatchEvent(new InputEvent('input', { bubbles: true }));
    expect(changes.at(-1)?.valid).toBe(false);
    expect((control.value() as StudioTableDocument).rows[0]?.[0]).toBe('First');
    expect(root.querySelector('table[aria-label="Table data"]')).not.toBeNull();
    control.destroy();
    root.remove();
  });

  it('keeps drawing and table controls inspectable but immutable in read-only mode', async () => {
    const root = holder();
    const drawing = await new StudioAuthoringControlRegistry().mount('studio.control/drawing', {
      holder: root,
      readOnly: true,
      value: { alt: 'Read-only drawing', height: 10, strokes: [], width: 10 },
    });
    const table = await new StudioAuthoringControlRegistry().mount('studio.control/table', {
      holder: root,
      readOnly: true,
      value: { columns: ['A'], rows: [['B']] },
    });

    expect(drawing.readOnly).toBe(true);
    expect(table.readOnly).toBe(true);
    expect(
      [...root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input,textarea')].every(
        (input) => input.disabled,
      ),
    ).toBe(true);
    expect(root.querySelector<HTMLButtonElement>('[aria-label="Add table row"]')).toBeNull();
    drawing.destroy();
    table.destroy();
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

  it("selects Studio's canonical sink-free rich-text surface for strict security policies", async () => {
    const root = holder();
    const value = {
      content: [
        {
          content: [{ text: 'Strict authoring', type: 'text' }],
          type: 'paragraph',
        },
      ],
      type: 'doc',
    } as const;
    const control = await new StudioAuthoringControlRegistry({
      strictContentSecurityPolicy: true,
    }).mount('studio.control/rich-text', {
      holder: root,
      profile: 'studio.rich-text/portable',
      value,
    });

    expect(root.querySelector('[data-studio-rich-text-surface="strict-csp"]')).not.toBeNull();
    expect(root.querySelector('style,script,[style]')).toBeNull();
    expect(control.value()).toEqual(value);
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
    await expect(
      new StudioAuthoringControlRegistry().mount('studio.control/drawing', {
        holder: root,
        profile: 'host/drawing',
        value: { alt: 'Drawing', height: 10, strokes: [], width: 10 },
      }),
    ).rejects.toThrow(/Unknown Studio drawing profile/u);
    await expect(
      new StudioAuthoringControlRegistry().mount('studio.control/table', {
        holder: root,
        profile: 'host/table',
        value: { columns: ['A'], rows: [] },
      }),
    ).rejects.toThrow(/Unknown Studio table profile/u);
    root.remove();
  });
});
