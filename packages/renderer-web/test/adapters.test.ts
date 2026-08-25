import { describe, expect, it, vi } from 'vitest';
import { createChartJsAdapter } from '../src/adapters/chart-js.js';
import { createKatexAdapter } from '../src/adapters/katex.js';
import { createMermaidAdapter } from '../src/adapters/mermaid.js';

describe('optional exact advanced adapters', () => {
  it('maps canonical chart data and disposes Chart.js 4.5.1', async () => {
    const destroy = vi.fn();
    const constructor = vi.fn(function Chart(this: { destroy: typeof destroy }) {
      this.destroy = destroy;
    });
    Object.assign(constructor, { version: '4.5.1' });
    const canvas = document.createElement('canvas');
    const dispose = await createChartJsAdapter(() =>
      Promise.resolve({ Chart: constructor }),
    ).enhance(canvas, {
      datasets: [{ label: 'A', values: [1] }],
      labels: ['One'],
      type: 'bar',
    });
    expect(constructor).toHaveBeenCalledOnce();
    dispose();
    expect(destroy).toHaveBeenCalledOnce();
    await expect(
      createChartJsAdapter(() =>
        Promise.resolve({ Chart: Object.assign(constructor, { version: '4.4.0' }) }),
      ).enhance(canvas, {
        datasets: [{ label: 'A', values: [1] }],
        labels: ['One'],
        type: 'bar',
      }),
    ).rejects.toThrow(/4\.5\.1/u);
  });

  it('runs KaTeX 0.18.4 with trust disabled', async () => {
    const render = vi.fn(
      (source: string, element: HTMLElement, options: Readonly<Record<string, unknown>>) => {
        void options;
        element.textContent = source;
      },
    );
    const node = await createKatexAdapter(() =>
      Promise.resolve({ render, version: '0.18.4' }),
    ).render({
      displayMode: true,
      source: 'x^2',
    });
    expect(node.textContent).toBe('x^2');
    expect(render.mock.calls[0]?.[2]).toMatchObject({ strict: 'error', trust: false });
  });

  it('accepts strict Mermaid SVG and rejects executable markup', async () => {
    const initialize = vi.fn();
    const good = createMermaidAdapter(() =>
      Promise.resolve({
        initialize,
        render: () =>
          Promise.resolve({
            svg: '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"></path></svg>',
          }),
      }),
    );
    expect((await good.render('graph TD')).nodeName.toLowerCase()).toBe('svg');
    expect(initialize).toHaveBeenCalledWith({ securityLevel: 'strict', startOnLoad: false });
    const hostile = createMermaidAdapter(() =>
      Promise.resolve({
        initialize,
        render: () =>
          Promise.resolve({
            svg: '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
          }),
      }),
    );
    await expect(hostile.render('graph TD')).rejects.toThrow(/unsafe/u);
  });
});
