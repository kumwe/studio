import { describe, expect, it } from 'vitest';
import {
  parseStudioChartSpec,
  parseStudioDrawingDocument,
  parseStudioMoneyValue,
} from '../src/index.js';

describe('canonical production values', () => {
  it('detaches a bounded chart and requires label/value parity', () => {
    const source = {
      datasets: [{ label: 'Sales', values: [3, 5] }],
      labels: ['A', 'B'],
      type: 'bar',
    };
    const parsed = parseStudioChartSpec(source);
    source.datasets[0]?.values.push(8);
    expect(parsed.datasets[0]?.values).toEqual([3, 5]);
    expect(() => parseStudioChartSpec({ ...source, labels: ['A'] })).toThrow(
      /one value per label/u,
    );
    expect(() => parseStudioChartSpec({ ...source, options: { onClick: 'script' } })).toThrow(
      /unknown member options/u,
    );
  });

  it('accepts bounded drawing strokes and rejects executable color payloads and out-of-bounds points', () => {
    expect(
      parseStudioDrawingDocument({
        alt: 'Line',
        height: 100,
        strokes: [{ color: '#112233', points: [{ x: 1, y: 2 }], width: 2 }],
        width: 100,
      }),
    ).toMatchObject({ alt: 'Line' });
    expect(() =>
      parseStudioDrawingDocument({
        alt: 'Bad',
        height: 100,
        strokes: [{ color: 'url(javascript:1)', points: [{ x: 1, y: 2 }], width: 2 }],
        width: 100,
      }),
    ).toThrow(/color token/u);
    expect(() =>
      parseStudioDrawingDocument({
        alt: 'Bad',
        height: 100,
        strokes: [{ color: '#112233', points: [{ x: 101, y: 2 }], width: 2 }],
        width: 100,
      }),
    ).toThrow(/inside the drawing bounds/u);
  });

  it('keeps canonical money decimal strings exact', () => {
    expect(parseStudioMoneyValue({ amount: '900719925474099999.123456', currency: 'NAD' })).toEqual(
      { amount: '900719925474099999.123456', currency: 'NAD' },
    );
    expect(() => parseStudioMoneyValue({ amount: 19.99, currency: 'USD' })).toThrow(
      /decimal string/u,
    );
    expect(() => parseStudioMoneyValue({ amount: '01.00', currency: 'usd' })).toThrow();
  });
});
