import type { Candle } from '@/features/market/types';

import {
  candleWindows,
  FNO_MAX_DAYS,
  indexUnderlying,
  lastSession,
  toCandles,
  underlyingRange,
  UNDERLYING_RANGES,
} from '../lib/underlying';
import type { FnoCandle } from '../types';

const DAY = 86_400;
/** Unix seconds for an IST wall-clock time (IST is UTC+5:30, no DST). */
const ist = (y: number, m: number, d: number, hh: number, mm: number) =>
  Date.UTC(y, m - 1, d, hh, mm) / 1000 - 19_800;

function bar(time: number, close: number): Candle {
  return { time, open: close, high: close, low: close, close, volume: 0 };
}

describe('indexUnderlying', () => {
  it('maps the index quotes that have derivatives, in any case', () => {
    expect(indexUnderlying('NSE', 'NIFTY 50')).toEqual({ exchange: 'NFO', underlying: 'NIFTY' });
    expect(indexUnderlying('nse', 'Nifty Bank')).toEqual({
      exchange: 'NFO',
      underlying: 'BANKNIFTY',
    });
    expect(indexUnderlying('BSE', 'SENSEX')).toEqual({ exchange: 'BFO', underlying: 'SENSEX' });
  });

  it('has nothing for an index without derivatives, or on the wrong exchange', () => {
    expect(indexUnderlying('NSE', 'NIFTY IT')).toBeNull();
    expect(indexUnderlying('BSE', 'NIFTY 50')).toBeNull();
  });
});

describe('candleWindows', () => {
  const now = ist(2026, 10, 1, 12, 0);

  it('is one window when the span fits the cap', () => {
    expect(candleWindows(5, '5minute', now)).toEqual([{ from: now - 5 * DAY, to: now }]);
  });

  it('splits a longer span into contiguous capped windows, newest first', () => {
    const windows = candleWindows(365, '1day', now);
    expect(windows).toHaveLength(3);
    expect(windows[0]).toEqual({ from: now - 180 * DAY, to: now });
    expect(windows[1]).toEqual({ from: now - 360 * DAY, to: now - 180 * DAY });
    expect(windows[2]).toEqual({ from: now - 365 * DAY, to: now - 360 * DAY });
    for (const w of windows) {
      expect(w.to - w.from).toBeLessThanOrEqual(FNO_MAX_DAYS['1day'] * DAY);
    }
  });

  it('asks for every range within the server caps', () => {
    for (const range of UNDERLYING_RANGES) {
      for (const w of candleWindows(range.days, range.interval, now)) {
        expect(w.to - w.from).toBeLessThanOrEqual(FNO_MAX_DAYS[range.interval] * DAY);
      }
    }
  });

  it('is empty for no span', () => {
    expect(candleWindows(0, '1day', now)).toEqual([]);
  });
});

describe('toCandles', () => {
  const raw = (time: number, close: number, extra: Partial<FnoCandle> = {}): FnoCandle =>
    ({ time, open: close, high: close, low: close, close, volume: 10, ...extra }) as FnoCandle;

  it('merges pages ascending, the later page winning a duplicate time', () => {
    const out = toCandles([
      [raw(300, 3), raw(200, 2)],
      [raw(100, 1), raw(200, 2.5)],
    ]);
    expect(out.map((c) => [c.time, c.close])).toEqual([
      [100, 1],
      [200, 2.5],
      [300, 3],
    ]);
  });

  it('drops malformed bars and zeroes an unknown volume', () => {
    const out = toCandles([
      [
        raw(100, 1, { volume: null as unknown as number }),
        raw(200, 0),
        raw(Number.NaN, 5),
        raw(300, 3, { low: -1 }),
      ],
    ]);
    expect(out).toEqual([{ time: 100, open: 1, high: 1, low: 1, close: 1, volume: 0 }]);
  });
});

describe('lastSession', () => {
  it("splits at the last IST day and takes the previous day's last close", () => {
    const bars = [
      bar(ist(2026, 9, 29, 15, 25), 100),
      bar(ist(2026, 9, 30, 9, 15), 101),
      bar(ist(2026, 9, 30, 15, 25), 102),
      bar(ist(2026, 10, 1, 9, 15), 103),
      bar(ist(2026, 10, 1, 9, 20), 104),
    ];
    const { session, prevClose } = lastSession(bars);
    expect(session.map((b) => b.close)).toEqual([103, 104]);
    expect(prevClose).toBe(102);
  });

  it('keeps an early-morning bar on its IST day, not the UTC one', () => {
    // 09:15 IST is 03:45 UTC the same date; 05:00 IST would be the previous UTC date.
    const bars = [bar(ist(2026, 9, 30, 15, 25), 50), bar(ist(2026, 10, 1, 5, 0), 51)];
    expect(lastSession(bars).prevClose).toBe(50);
  });

  it('has no previous close when every bar is one session', () => {
    const bars = [bar(ist(2026, 10, 1, 9, 15), 1), bar(ist(2026, 10, 1, 9, 20), 2)];
    expect(lastSession(bars)).toEqual({ session: bars, prevClose: null });
    expect(lastSession([])).toEqual({ session: [], prevClose: null });
  });
});

describe('underlyingRange', () => {
  it('finds each range by key', () => {
    expect(underlyingRange('1D')).toMatchObject({ interval: '5minute', intraday: true });
    expect(underlyingRange('1Y')).toMatchObject({ interval: '1day', days: 365, intraday: false });
  });
});
