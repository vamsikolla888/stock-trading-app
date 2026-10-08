import { niceCeil } from '@/components/charts/chartScale';

/**
 * Scale maths for the cumulative P&L curve, which — unlike the dashboard's count charts — goes
 * below zero. The axis always includes zero, each side rounded out to a "nice" bound, so a small
 * loss is never drawn as a cliff and the zero line is where the eye expects it.
 */
export function signedDomain(values: readonly number[]): { lo: number; hi: number } {
  const finite = values.filter((v) => Number.isFinite(v));
  const max = Math.max(0, ...finite);
  const min = Math.min(0, ...finite);
  if (max === 0 && min === 0) return { lo: 0, hi: 1 };
  return { lo: min < 0 ? -niceCeil(-min) : 0, hi: max > 0 ? niceCeil(max) : 0 };
}

/** The y pixel of a value in a plot `height` tall over [lo, hi] (top = hi). */
export function yOf(value: number, lo: number, hi: number, height: number, padTop = 0): number {
  const span = hi - lo || 1;
  return padTop + ((hi - value) / span) * height;
}

/** Gridline values: the bounds and zero, without repeats, top first. */
export function gridValues(lo: number, hi: number): number[] {
  return [...new Set([hi, 0, lo])].sort((a, b) => b - a);
}

/** The line and the area between it and zero, as SVG path data. */
export function curvePaths(
  values: readonly number[],
  width: number,
  height: number,
  domain: { lo: number; hi: number },
  padTop = 0,
): { line: string; area: string } {
  const n = values.length;
  if (n < 2 || width <= 0) return { line: '', area: '' };
  const x = (i: number) => (i / (n - 1)) * width;
  const y = (v: number) => yOf(v, domain.lo, domain.hi, height, padTop);
  const line = values
    .map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(Number.isFinite(v) ? v : 0).toFixed(1)}`)
    .join(' ');
  const zero = y(0).toFixed(1);
  const area = `${line} L${x(n - 1).toFixed(1)} ${zero} L${x(0).toFixed(1)} ${zero} Z`;
  return { line, area };
}
