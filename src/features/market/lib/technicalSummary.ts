import { formatINR } from '@/lib/utils/formatters';

import type { Candle } from '../types';

import { lastValue, rsi, sma } from './indicators';

// Ported from the web client (features/stock-analysis/lib/technicalSummary.ts). Computed on
// the device from real daily bars; a reading the history can't support says so instead of
// printing a number.

export interface TechReading {
  label: string;
  /** Null when the history is too short for this reading. */
  value: string | null;
  note: string;
  tone: 'up' | 'down' | 'neutral';
}

export interface Cross {
  kind: 'golden' | 'death';
  /** Daily sessions since the cross; 0 is the latest session. */
  sessionsAgo: number;
}

export function lastCross(fast: (number | null)[], slow: (number | null)[]): Cross | null {
  const n = Math.min(fast.length, slow.length);
  for (let i = n - 1; i > 0; i--) {
    const now = fast[i];
    const nowSlow = slow[i];
    const prev = fast[i - 1];
    const prevSlow = slow[i - 1];
    if (now == null || nowSlow == null || prev == null || prevSlow == null) break;
    const above = now > nowSlow;
    if (above !== prev > prevSlow)
      return { kind: above ? 'golden' : 'death', sessionsAgo: n - 1 - i };
  }
  return null;
}

function versus(
  price: number | null,
  average: number,
): { note: string; tone: TechReading['tone'] } {
  if (price == null) return { note: 'Latest close unknown', tone: 'neutral' };
  const pct = ((price - average) / average) * 100;
  return {
    note: `Price ${Math.abs(pct).toFixed(1)}% ${pct >= 0 ? 'above' : 'below'}`,
    tone: pct >= 0 ? 'up' : 'down',
  };
}

const sessions = (n: number) => `${n} session${n === 1 ? '' : 's'}`;

/** `price` is the live price when known; the last bar's close otherwise. */
export function technicalSummary(daily: readonly Candle[], price: number | null): TechReading[] {
  const closes = daily.map((candle) => candle.close);
  const latest = price ?? closes[closes.length - 1] ?? null;
  const rsiNow = lastValue(rsi(closes, 14));
  const fast = sma(closes, 50);
  const slow = sma(closes, 200);
  const ma50 = lastValue(fast);
  const ma200 = lastValue(slow);
  const cross = lastCross(fast, slow);

  const rsiReading: TechReading = {
    label: 'RSI (14)',
    value: rsiNow != null ? rsiNow.toFixed(1) : null,
    note:
      rsiNow == null
        ? 'Needs 15 sessions of history'
        : rsiNow >= 70
          ? 'Overbought territory'
          : rsiNow <= 30
            ? 'Oversold territory'
            : 'Neither overbought nor oversold',
    tone: rsiNow == null ? 'neutral' : rsiNow >= 70 ? 'down' : rsiNow <= 30 ? 'up' : 'neutral',
  };

  const ma50Versus = ma50 != null ? versus(latest, ma50) : null;
  const ma200Versus = ma200 != null ? versus(latest, ma200) : null;

  const trendNote =
    ma50 == null || ma200 == null
      ? 'Needs 200 sessions of history'
      : cross
        ? `${cross.kind === 'golden' ? 'Golden' : 'Death'} cross ${
            cross.sessionsAgo === 0 ? 'in the latest session' : `${sessions(cross.sessionsAgo)} ago`
          }`
        : `50-DMA ${ma50 > ma200 ? 'above' : 'below'} the 200-DMA throughout this history`;

  return [
    rsiReading,
    {
      label: '50-DMA',
      value: ma50 != null ? formatINR(ma50) : null,
      note: ma50Versus?.note ?? 'Needs 50 sessions of history',
      tone: ma50Versus?.tone ?? 'neutral',
    },
    {
      label: '200-DMA',
      value: ma200 != null ? formatINR(ma200) : null,
      note: ma200Versus?.note ?? 'Needs 200 sessions of history',
      tone: ma200Versus?.tone ?? 'neutral',
    },
    {
      label: 'Trend',
      value: ma50 == null || ma200 == null ? null : ma50 > ma200 ? 'Uptrend' : 'Downtrend',
      note: trendNote,
      tone: ma50 == null || ma200 == null ? 'neutral' : ma50 > ma200 ? 'up' : 'down',
    },
  ];
}

/** One-line headline for the insight card, from the readings. */
export function technicalHeadline(readings: readonly TechReading[]): string | null {
  const ma50 = readings.find((reading) => reading.label === '50-DMA');
  const trend = readings.find((reading) => reading.label === 'Trend');
  if (!ma50?.value) return null;
  const position = ma50.tone === 'up' ? 'above' : 'below';
  const trendText = trend?.value ? ` · ${trend.value.toLowerCase()} on the 50/200-DMA` : '';
  return `Price is ${position} its 50-day average${trendText}`;
}
