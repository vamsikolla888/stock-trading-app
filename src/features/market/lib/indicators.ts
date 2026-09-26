// Ported from the web client (client/src/shared/lib/indicators.ts) so both apps report
// identical readings for the same bars.

/** Simple moving average — null until `period` values have accumulated. */
export function sma(values: readonly number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i]!;
    if (i >= period) sum -= values[i - period]!;
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

function rsiFromAverages(avgGain: number, avgLoss: number): number {
  if (avgGain === 0 && avgLoss === 0) return 50;
  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

/** Wilder's RSI (smoothed averages), as every charting platform computes RSI(14). */
export function rsi(closes: readonly number[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(closes.length).fill(null);
  if (closes.length <= period) return out;

  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const delta = closes[i]! - closes[i - 1]!;
    if (delta > 0) avgGain += delta;
    else avgLoss -= delta;
  }
  avgGain /= period;
  avgLoss /= period;
  out[period] = rsiFromAverages(avgGain, avgLoss);

  for (let i = period + 1; i < closes.length; i++) {
    const delta = closes[i]! - closes[i - 1]!;
    avgGain = (avgGain * (period - 1) + Math.max(delta, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-delta, 0)) / period;
    out[i] = rsiFromAverages(avgGain, avgLoss);
  }
  return out;
}

export function lastValue(series: readonly (number | null)[]): number | null {
  for (let i = series.length - 1; i >= 0; i--) {
    const value = series[i];
    if (value !== null && value !== undefined) return value;
  }
  return null;
}
