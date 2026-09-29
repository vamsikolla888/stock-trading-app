import {
  candlesErrorMessage,
  candlesToPoints,
  formatPointTime,
  sessionCandles,
} from '@/features/market/lib/chartRanges';
import { rsi, sma } from '@/features/market/lib/indicators';
import { lastCross, technicalSummary } from '@/features/market/lib/technicalSummary';
import type { Candle } from '@/features/market/types';
import { ApiError } from '@/types/api';

const candle = (time: number, close: number): Candle => ({
  time,
  open: close,
  high: close,
  low: close,
  close,
  volume: 0,
});

describe('candlesToPoints', () => {
  it('keeps only the latest IST session on 1D', () => {
    // 2026-09-24 15:25 IST and 2026-09-25 09:20 / 09:25 IST.
    const candles = [
      candle(1_758_707_700, 100),
      candle(1_758_772_200, 101),
      candle(1_758_772_500, 102),
    ];
    const points = candlesToPoints(candles, '1D');
    expect(points.map((point) => point.value)).toEqual([101, 102]);
    expect(points[0]?.time).toBe(1_758_772_200_000);
  });

  it('keeps every bar on longer ranges', () => {
    const candles = [candle(1_758_707_700, 100), candle(1_758_772_200, 101)];
    expect(candlesToPoints(candles, '1Y')).toHaveLength(2);
  });
});

describe('sessionCandles', () => {
  it('gives the candle chart the same latest-session bars as the line chart on 1D', () => {
    const candles = [
      candle(1_758_707_700, 100),
      candle(1_758_772_200, 101),
      candle(1_758_772_500, 102),
    ];
    expect(sessionCandles(candles, '1D').map((bar) => bar.close)).toEqual([101, 102]);
    expect(sessionCandles(candles, '1M')).toHaveLength(3);
  });

  it('drops bars with a missing price instead of plotting NaN', () => {
    const broken = { ...candle(1_758_772_500, 102), high: Number.NaN };
    expect(sessionCandles([candle(1_758_772_200, 101), broken], '1W')).toHaveLength(1);
    expect(sessionCandles([], '1D')).toEqual([]);
  });
});

describe('formatPointTime', () => {
  it('formats in IST regardless of device zone', () => {
    // 03:50 UTC = 09:20 IST
    expect(formatPointTime(Date.UTC(2026, 8, 25, 3, 50), '1D')).toMatch(/9:20/);
  });

  it('returns nothing for an invalid time rather than throwing', () => {
    expect(formatPointTime(Number.NaN, '1D')).toBe('');
  });
});

describe('candlesErrorMessage', () => {
  it('explains a missing broker session instead of echoing the server', () => {
    const noBroker = new ApiError({
      status: 404,
      code: 'NOT_FOUND',
      message: 'No connected broker',
    });
    const expired = new ApiError({ status: 409, code: 'BROKER_SESSION_EXPIRED', message: 'x' });
    expect(candlesErrorMessage(noBroker)).toMatch(/needs a live broker session/);
    expect(candlesErrorMessage(expired)).toMatch(/needs a live broker session/);
  });

  it('passes other API messages through and has a fallback for anything else', () => {
    const limited = new ApiError({
      status: 429,
      code: 'RATE_LIMITED',
      message: 'Too many attempts.',
    });
    expect(candlesErrorMessage(limited)).toBe('Too many attempts.');
    expect(candlesErrorMessage(new Error('boom'))).toMatch(/couldn’t be loaded/);
  });
});

describe('indicators', () => {
  it('computes a simple moving average', () => {
    expect(sma([1, 2, 3, 4], 2)).toEqual([null, 1.5, 2.5, 3.5]);
  });

  it('reads RSI 100 on a straight rise and 50 on a flat line', () => {
    const rising = Array.from({ length: 20 }, (_, i) => 100 + i);
    expect(rsi(rising, 14)[19]).toBe(100);
    expect(rsi(new Array(20).fill(100), 14)[19]).toBe(50);
    expect(rsi(rising.slice(0, 10), 14).every((value) => value === null)).toBe(true);
  });
});

describe('technicalSummary', () => {
  it('says what history is missing instead of inventing numbers', () => {
    const readings = technicalSummary(
      Array.from({ length: 10 }, (_, i) => candle(i, 100 + i)),
      null,
    );
    expect(readings.map((reading) => reading.value)).toEqual([null, null, null, null]);
    expect(readings[1]?.note).toBe('Needs 50 sessions of history');
  });

  it('detects the most recent 50/200 cross', () => {
    expect(lastCross([1, 1, 3], [2, 2, 2])).toEqual({ kind: 'golden', sessionsAgo: 0 });
    expect(lastCross([3, 1, 1], [2, 2, 2])).toEqual({ kind: 'death', sessionsAgo: 1 });
    expect(lastCross([3, 3], [2, 2])).toBeNull();
  });
});
