import type { Candle } from '@/features/market/types';

import {
  buildCandlestickGeometry,
  candleGroupSize,
  groupCandles,
  MIN_CANDLE_SLOT,
} from '../candleLayout';

/** 09:15 IST on 1 Oct 2026, unix seconds. */
const OPEN = Date.UTC(2026, 9, 1, 3, 45) / 1000;

const bar = (time: number, open: number, close: number, volume = 100): Candle => ({
  time,
  open,
  high: Math.max(open, close) + 1,
  low: Math.min(open, close) - 1,
  close,
  volume,
});

/** One NSE session of 5-minute bars (09:15–15:30). */
const session = (start: number, from = 100) =>
  Array.from({ length: 75 }, (_, i) => bar(start + i * 300, from + i, from + i + 0.5));

describe('candleGroupSize', () => {
  it('keeps bars as they are when they already fit', () => {
    expect(candleGroupSize(30, 350)).toBe(1);
  });

  it('merges just enough bars for each candle to get its minimum width', () => {
    expect(candleGroupSize(75, 350)).toBe(2); // 75 × 7 / 350 = 1.5 → 2
    expect(candleGroupSize(250, 350)).toBe(5);
    expect(candleGroupSize(0, 350)).toBe(1);
    expect(candleGroupSize(80, 0)).toBe(1);
  });
});

describe('groupCandles', () => {
  it('merges OHLC correctly: first open and time, last close, extremes, summed volume', () => {
    const [merged] = groupCandles([bar(OPEN, 100, 105), bar(OPEN + 300, 105, 98)], 2);
    expect(merged).toEqual({ time: OPEN, open: 100, high: 106, low: 97, close: 98, volume: 200 });
  });

  it('returns the same array when no merging is needed', () => {
    const bars = session(OPEN);
    expect(groupCandles(bars, 1)).toBe(bars);
  });

  it('never merges intraday bars across a trading day', () => {
    const day1 = session(OPEN).slice(-3); // 15:15, 15:20, 15:25
    const day2 = session(OPEN + 86_400).slice(0, 3);
    const grouped = groupCandles([...day1, ...day2], 2);
    // [15:15+15:20] [15:25] | [09:15+09:20] [09:25] — the overnight gap is never inside a candle.
    expect(grouped.map((c) => c.time)).toEqual([
      day1[0]!.time,
      day1[2]!.time,
      day2[0]!.time,
      day2[2]!.time,
    ]);
  });

  it('groups daily bars straight through', () => {
    const daily = Array.from({ length: 10 }, (_, i) => bar(OPEN + i * 86_400, 100, 101));
    expect(groupCandles(daily, 5)).toHaveLength(2);
  });
});

describe('readable candles on a phone', () => {
  it('a 1D chart of 5-minute bars draws bodies about 5 pt wide, not 3', () => {
    const width = 350;
    const bars = session(OPEN);
    const before = buildCandlestickGeometry(bars, width, 240)!;
    const drawn = groupCandles(bars, candleGroupSize(bars.length, width));
    const after = buildCandlestickGeometry(drawn, width, 240)!;
    expect(before.bodyWidth).toBeLessThan(3.5);
    expect(after.slotWidth).toBeGreaterThanOrEqual(MIN_CANDLE_SLOT);
    expect(after.bodyWidth).toBeGreaterThanOrEqual(4.9);
  });

  it('keeps candles above the volume strip', () => {
    const geometry = buildCandlestickGeometry(session(OPEN), 350, 240)!;
    const lowest = Math.max(...geometry.candlesGeo.map((c) => c.lowY));
    const tallestVolume = Math.max(...geometry.candlesGeo.map((c) => c.volHeight));
    expect(lowest).toBeLessThanOrEqual(240 - tallestVolume);
  });
});
