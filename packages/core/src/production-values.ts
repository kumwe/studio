import type {
  StudioChartDataset,
  StudioChartSpec,
  StudioDrawingDocument,
  StudioDrawingPoint,
  StudioDrawingStroke,
  StudioMoneyValue,
} from '@kumwe/studio-protocol';

const CHART_TYPES = new Set(['bar', 'doughnut', 'line', 'pie']);
const MONEY_AMOUNT = /^-?(?:0|[1-9][0-9]{0,17})(?:\.[0-9]{1,6})?$/u;
const CURRENCY = /^[A-Z]{3}$/u;
const DRAWING_COLOR = /^(?:#[0-9A-Fa-f]{6}|[a-z][a-z0-9-]{0,62}\/[a-z][a-z0-9-]{0,62})$/u;

/** Parse and detach one canonical chart spec, refusing library-specific configuration. */
export function parseStudioChartSpec(value: unknown): StudioChartSpec {
  const record = exactRecord(value, ['datasets', 'labels', 'title', 'type'], 'Chart');
  if (typeof record.type !== 'string' || !CHART_TYPES.has(record.type)) {
    throw new TypeError('Chart type must be bar, doughnut, line, or pie.');
  }
  const labels = stringArray(record.labels, 200, 500, 'Chart labels');
  if (
    !Array.isArray(record.datasets) ||
    record.datasets.length < 1 ||
    record.datasets.length > 20
  ) {
    throw new RangeError('Chart datasets must contain between 1 and 20 datasets.');
  }
  const datasets: StudioChartDataset[] = record.datasets.map((candidate, index) => {
    const dataset = exactRecord(candidate, ['label', 'values'], `Chart dataset ${index}`);
    if (typeof dataset.label !== 'string' || dataset.label.length > 500) {
      throw new TypeError(`Chart dataset ${index} label must be a bounded string.`);
    }
    if (!Array.isArray(dataset.values) || dataset.values.length > 200) {
      throw new RangeError(`Chart dataset ${index} values exceed the 200-value limit.`);
    }
    const values = dataset.values.map((item) => {
      if (typeof item !== 'number' || !Number.isFinite(item) || Math.abs(item) > 1e15) {
        throw new TypeError(`Chart dataset ${index} contains an invalid finite number.`);
      }
      return item;
    });
    if (values.length !== labels.length) {
      throw new RangeError(`Chart dataset ${index} must have one value per label.`);
    }
    return { label: dataset.label, values };
  });
  const result: StudioChartSpec = {
    datasets,
    labels,
    type: record.type as StudioChartSpec['type'],
  };
  if (record.title !== undefined) {
    if (typeof record.title !== 'string' || record.title.length > 500) {
      throw new TypeError('Chart title must be a bounded string.');
    }
    result.title = record.title;
  }
  return result;
}

/** Parse bounded vector strokes and reject SVG, data URLs, and canvas commands. */
export function parseStudioDrawingDocument(value: unknown): StudioDrawingDocument {
  const record = exactRecord(value, ['alt', 'height', 'strokes', 'width'], 'Drawing');
  const width = integer(record.width, 1, 4096, 'Drawing width');
  const height = integer(record.height, 1, 4096, 'Drawing height');
  if (typeof record.alt !== 'string' || record.alt.length < 1 || record.alt.length > 5000) {
    throw new TypeError('Drawing alternative text must contain between 1 and 5000 characters.');
  }
  if (!Array.isArray(record.strokes) || record.strokes.length > 5000) {
    throw new RangeError('Drawing strokes exceed the 5000-stroke limit.');
  }
  const strokes: StudioDrawingStroke[] = record.strokes.map((candidate, strokeIndex) => {
    const stroke = exactRecord(
      candidate,
      ['color', 'points', 'width'],
      `Drawing stroke ${strokeIndex}`,
    );
    if (typeof stroke.color !== 'string' || !DRAWING_COLOR.test(stroke.color)) {
      throw new TypeError(`Drawing stroke ${strokeIndex} uses an invalid color token.`);
    }
    if (
      typeof stroke.width !== 'number' ||
      !Number.isFinite(stroke.width) ||
      stroke.width < 0.25 ||
      stroke.width > 64
    ) {
      throw new RangeError(`Drawing stroke ${strokeIndex} width is outside 0.25 through 64.`);
    }
    if (
      !Array.isArray(stroke.points) ||
      stroke.points.length < 1 ||
      stroke.points.length > 10_000
    ) {
      throw new RangeError(`Drawing stroke ${strokeIndex} must contain 1 through 10000 points.`);
    }
    const points: StudioDrawingPoint[] = stroke.points.map((candidatePoint, pointIndex) => {
      const point = exactRecord(candidatePoint, ['x', 'y'], `Drawing point ${pointIndex}`);
      const x = coordinate(point.x, width, `Drawing point ${pointIndex} x`);
      const y = coordinate(point.y, height, `Drawing point ${pointIndex} y`);
      return { x, y };
    });
    return { color: stroke.color, points, width: stroke.width };
  });
  return { alt: record.alt, height, strokes, width };
}

/** Parse exact decimal money without converting through a binary float. */
export function parseStudioMoneyValue(value: unknown): StudioMoneyValue {
  const record = exactRecord(value, ['amount', 'currency'], 'Money');
  if (typeof record.amount !== 'string' || !MONEY_AMOUNT.test(record.amount)) {
    throw new TypeError('Money amount must be a canonical decimal string with at most six places.');
  }
  if (typeof record.currency !== 'string' || !CURRENCY.test(record.currency)) {
    throw new TypeError('Money currency must be an uppercase ISO-style three-letter code.');
  }
  return { amount: record.amount, currency: record.currency };
}

function exactRecord(
  value: unknown,
  keys: readonly string[],
  name: string,
): Record<string, unknown> {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new TypeError(`${name} must be a plain JSON object.`);
  }
  const record = value as Record<string, unknown>;
  const allowed = new Set(keys);
  const unknown = Object.keys(record).find((key) => !allowed.has(key));
  if (unknown !== undefined) throw new TypeError(`${name} contains unknown member ${unknown}.`);
  return record;
}

function stringArray(
  value: unknown,
  maximumItems: number,
  maximumLength: number,
  name: string,
): string[] {
  if (!Array.isArray(value) || value.length > maximumItems)
    throw new RangeError(`${name} exceed their item limit.`);
  return value.map((item) => {
    if (typeof item !== 'string' || item.length > maximumLength)
      throw new TypeError(`${name} must be bounded strings.`);
    return item;
  });
}

function integer(value: unknown, minimum: number, maximum: number, name: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`${name} must be an integer from ${minimum} through ${maximum}.`);
  }
  return value;
}

function coordinate(value: unknown, maximum: number, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > maximum) {
    throw new RangeError(`${name} must be a finite coordinate inside the drawing bounds.`);
  }
  return value;
}
