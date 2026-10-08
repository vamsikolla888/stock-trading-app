/**
 * Scale helpers for the dashboard charts. Pure, so the axis maths is tested rather than eyeballed.
 */

/** The smallest "nice" number (1, 2, 2.5, 5 × 10ⁿ) at or above `value` — a readable axis top. */
export function niceCeil(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const exponent = Math.floor(Math.log10(value));
  const base = 10 ** exponent;
  for (const step of [1, 2, 2.5, 5, 10]) {
    const candidate = step * base;
    if (candidate >= value - base * 1e-9) return candidate;
  }
  return 10 * base;
}

/**
 * Per-index tops and bases of each series. Stacked: each series sits on the ones before it, so
 * the last series' tops are the totals. Missing or negative values count as zero (the charts
 * draw counts, which never go below zero).
 */
export function stackTops(
  series: readonly (readonly number[])[],
  stacked: boolean,
): { tops: number[][]; bases: number[][]; max: number } {
  const length = Math.max(0, ...series.map((values) => values.length));
  const clean = series.map((values) =>
    Array.from({ length }, (_, i) => {
      const v = values[i];
      return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0;
    }),
  );
  const running = new Array<number>(length).fill(0);
  const tops: number[][] = [];
  const bases: number[][] = [];
  for (const values of clean) {
    const base = stacked ? [...running] : new Array<number>(length).fill(0);
    const top = values.map((v, i) => base[i]! + v);
    if (stacked) top.forEach((v, i) => (running[i] = v));
    tops.push(top);
    bases.push(base);
  }
  const max = Math.max(0, ...tops.flat());
  return { tops, bases, max };
}

/** Index of the point nearest an x position across `count` evenly spaced points. */
export function nearestIndex(x: number, width: number, count: number): number {
  if (count <= 1 || width <= 0) return 0;
  const step = width / (count - 1);
  return Math.min(count - 1, Math.max(0, Math.round(x / step)));
}

/**
 * An axis value as a short label: the chart's own format with a zero decimal part dropped
 * ("500.0k" → "500k", "1.00M" → "1M"), since gridlines sit on round numbers anyway.
 */
export function axisLabel(text: string): string {
  return text.replace(/(\d)\.0+(?!\d)/g, '$1');
}
