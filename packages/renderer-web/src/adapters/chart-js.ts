import type { StudioChartEnhancer } from '../types.js';

type ModuleLoader = () => Promise<unknown>;

interface ChartInstance {
  destroy(): void;
}

interface ChartConstructor {
  new (canvas: HTMLCanvasElement, configuration: unknown): ChartInstance;
  version: string;
}

/** Lazy exact-version adapter. Chart.js never appears in Studio's document contract. */
export function createChartJsAdapter(loader: ModuleLoader = loadChartJs): StudioChartEnhancer {
  return {
    async enhance(canvas, spec): Promise<() => void> {
      const loaded = await loader();
      const Chart = chartConstructor(loaded);
      if (Chart.version !== '4.5.1')
        throw new Error(`Chart.js 4.5.1 is required; loaded ${Chart.version}.`);
      const chart = new Chart(canvas, {
        data: {
          datasets: spec.datasets.map((dataset, index) => ({
            backgroundColor: palette(index, 0.35),
            borderColor: palette(index, 1),
            data: [...dataset.values],
            label: dataset.label,
          })),
          labels: [...spec.labels],
        },
        options: {
          animation: false,
          parsing: false,
          plugins: { title: { display: spec.title !== undefined, text: spec.title ?? '' } },
          responsive: true,
        },
        type: spec.type,
      });
      return () => chart.destroy();
    },
  };
}

async function loadChartJs(): Promise<unknown> {
  const specifier = 'chart.js/auto';
  return import(specifier);
}

function chartConstructor(value: unknown): ChartConstructor {
  if (value === null || typeof value !== 'object')
    throw new TypeError('Chart.js module is invalid.');
  const record = value as Record<string, unknown>;
  const candidate = record.Chart ?? record.default;
  if (
    typeof candidate !== 'function' ||
    typeof (candidate as { version?: unknown }).version !== 'string'
  ) {
    throw new TypeError('Chart.js module does not expose its Chart constructor and version.');
  }
  return candidate as ChartConstructor;
}

function palette(index: number, alpha: number): string {
  const hues = [210, 15, 135, 280, 50, 175, 330, 95];
  return `hsla(${hues[index % hues.length] ?? 210},70%,45%,${alpha})`;
}
