import * as fs from 'fs';
import * as path from 'path';

import type { Candle } from '@/features/market/types';

import { activeStudies, CHART_INTERVALS, intervalSpec } from '../lib/config';
import { mergeHistory } from '../lib/history';
import { bollingerBands, ema, heikinAshi, macd, rsi, sma, vwap } from '../lib/indicators';
import { applyLiveTick, LiveCandleSeries, reconcileBars } from '../lib/liveCandles';
import {
  barIndexAt,
  buildChartPayload,
  buildChartTick,
  computeStudies,
  legendValues,
  type ChartTheme,
} from '../lib/payload';
import { classifyUpdate } from '../lib/updates';
import { CHART_HTML, CHART_LIBRARY_VERSION } from '../web/chartHtml.generated';

const bar = (time: number, close: number, extra: Partial<Candle> = {}): Candle => ({
  time,
  open: close,
  high: close + 1,
  low: close - 1,
  close,
  volume: 100,
  ...extra,
});

/** 09:15 IST on 1 Oct 2026, in unix seconds. */
const OPEN = Date.UTC(2026, 9, 1, 3, 45) / 1000;

const theme: ChartTheme = {
  background: '#fff',
  textMuted: '#666',
  grid: '#eee',
  crosshair: '#999',
  labelBackground: '#333',
  up: '#0f0',
  down: '#f00',
  accent: '#0a0',
  accentFillTop: 'rgba(0,0,0,0.3)',
  accentFillBottom: 'rgba(0,0,0,0)',
  volumeUp: 'up',
  volumeDown: 'down',
  prevClose: '#aaa',
};

describe('indicators', () => {
  it('sma and ema are null until seeded, then track', () => {
    expect(sma([1, 2, 3, 4], 2)).toEqual([null, 1.5, 2.5, 3.5]);
    const e = ema([1, 2, 3, 4, 5], 3);
    expect(e.slice(0, 2)).toEqual([null, null]);
    expect(e[2]).toBe(2); // seeded with the SMA of the first 3
    expect(e[3]).toBeCloseTo(3);
  });

  it('rsi stays within 0–100 and reads 50 on a flat run', () => {
    const rising = Array.from({ length: 30 }, (_, i) => 100 + i);
    expect(rsi(rising, 14)[29]).toBe(100);
    const flat = Array.from({ length: 20 }, () => 100);
    expect(rsi(flat, 14)[19]).toBe(50);
    const mixed = Array.from({ length: 40 }, (_, i) => 100 + Math.sin(i) * 5);
    for (const v of rsi(mixed, 14)) if (v !== null) expect(v).toBeGreaterThanOrEqual(0);
  });

  it('macd histogram is the line minus the signal', () => {
    const closes = Array.from({ length: 60 }, (_, i) => 100 + i * 0.5 + Math.sin(i));
    const m = macd(closes);
    const i = 59;
    expect(m.histogram[i]).toBeCloseTo(m.macd[i]! - m.signal[i]!);
  });

  it('bollinger bands bracket the middle band symmetrically', () => {
    const closes = Array.from({ length: 25 }, (_, i) => 100 + (i % 3));
    const b = bollingerBands(closes, 20, 2);
    const i = 24;
    expect(b.upper[i]! - b.middle[i]!).toBeCloseTo(b.middle[i]! - b.lower[i]!);
  });

  it('vwap resets at each IST session', () => {
    const day1 = [bar(OPEN, 100, { volume: 10 }), bar(OPEN + 300, 110, { volume: 10 })];
    const day2 = [bar(OPEN + 86_400, 200, { volume: 10 })];
    const v = vwap([...day1, ...day2]);
    expect(v[1]).toBeCloseTo(105);
    expect(v[2]).toBeCloseTo(200); // not blended with yesterday
  });

  it('heikin-ashi seeds from the first bar and smooths after it', () => {
    const ha = heikinAshi([bar(1, 100), bar(2, 110)]);
    expect(ha[0]!.open).toBe(100);
    expect(ha[1]!.open).toBeCloseTo((ha[0]!.open + ha[0]!.close) / 2);
  });
});

describe('live candles', () => {
  const bars = [bar(OPEN, 100), bar(OPEN + 300, 101)];

  it('folds a price into the forming bar', () => {
    const out = applyLiveTick(bars, 105, OPEN + 400, 300);
    expect(out[1]).toMatchObject({ close: 105, high: 105, low: 100 });
    expect(out[0]).toBe(bars[0]);
  });

  it('returns the same array when nothing changed', () => {
    const forming = [bar(OPEN, 100, { high: 105, low: 95 })];
    expect(applyLiveTick(forming, 100, OPEN + 10, 300)).toBe(forming);
  });

  it('opens the next bar on the series grid when the interval runs out', () => {
    const out = applyLiveTick(bars, 102, OPEN + 900 + 30, 300);
    expect(out).toHaveLength(3);
    expect(out[2]).toMatchObject({ time: OPEN + 900, open: 102, close: 102, volume: 0 });
  });

  it('never extends an intraday session into the next day, nor rewrites the past', () => {
    expect(applyLiveTick(bars, 102, OPEN + 86_400, 300)).toBe(bars);
    expect(applyLiveTick(bars, 102, OPEN + 100, 300)).toBe(bars);
  });

  it('reconciles a refetch: server history wins, live extremes and newer bars stay', () => {
    const live = [bar(OPEN, 100), bar(OPEN + 300, 101, { high: 109 }), bar(OPEN + 600, 103)];
    const server = [bar(OPEN, 100), bar(OPEN + 300, 102)];
    const out = reconcileBars(server, live);
    expect(out[1]).toMatchObject({ close: 102, high: 109 });
    expect(out[2]!.time).toBe(OPEN + 600);
  });

  it('a series remembers a live bar’s open across ticks, and forgets it for a new series', () => {
    const series = new LiveCandleSeries(bars, 'NSE:TCS:5m');
    series.tick(110, OPEN + 900 + 10, 300);
    series.tick(112, OPEN + 900 + 20, 300);
    expect(series.getBars()[2]).toMatchObject({ open: 110, close: 112, high: 112 });
    series.setHistory(bars, 'NSE:TCS:5m', OPEN + 900 + 30);
    // A refetch without that bar keeps it — its true open — with the last price re-applied.
    expect(series.getBars()[2]).toMatchObject({ open: 110, close: 112 });
    series.setHistory(bars, 'NSE:TCS:15m', OPEN + 900 + 30);
    expect(series.getBars()).toBe(bars);
  });
});

describe('chart payload', () => {
  const bars = Array.from({ length: 60 }, (_, i) =>
    bar(OPEN + i * 300, 100 + i, { open: 100 + i - (i % 2 ? 1 : -1) }),
  );

  it('draws line and area from closes, OHLC types from the bars', () => {
    const line = buildChartPayload({ bars, chartType: 'line', studies: [], theme });
    expect(line.price.data[0]).toEqual({ time: OPEN, value: 100 });
    const candles = buildChartPayload({ bars, chartType: 'hollow', studies: [], theme });
    expect(candles.price.kind).toBe('hollow');
    expect(candles.price.data[0]).toMatchObject({ open: 101, close: 100 });
    const ha = buildChartPayload({ bars, chartType: 'heikinAshi', studies: [], theme });
    expect(ha.price.kind).toBe('candles');
  });

  it('builds overlays, panes, volume and the previous-close line', () => {
    const p = buildChartPayload({
      bars,
      chartType: 'candles',
      studies: ['volume', 'sma20', 'bb', 'rsi', 'macd'],
      theme,
      prevClose: 99,
      hasMore: true,
    });
    expect(p.volume).toHaveLength(60);
    expect(p.overlays.map((o) => o.id)).toEqual(['sma20', 'bb.upper', 'bb.middle', 'bb.lower']);
    expect(p.overlays[0]!.data).toHaveLength(41); // nulls dropped
    expect(p.panes.map((pane) => pane.id)).toEqual(['rsi', 'macd']);
    expect(p.panes[0]!.series[0]!.levels).toEqual([30, 70]);
    expect(p.priceLines).toEqual([{ price: 99, color: '#aaa', title: 'Prev close' }]);
    expect(p.hasMore).toBe(true);
  });

  it('a tick carries exactly the last point of every series', () => {
    const studies = ['volume', 'sma20', 'macd'] as const;
    const t = buildChartTick({ bars, chartType: 'candles', studies: [...studies], theme }, false)!;
    const full = buildChartPayload({ bars, chartType: 'candles', studies: [...studies], theme });
    expect(t.price).toEqual(full.price.data[59]);
    expect(t.overlays.sma20).toEqual(full.overlays[0]!.data.at(-1));
    expect(t.volume).toEqual(full.volume![59]);
    expect(t.panes.macd!['macd.line']).toEqual(full.panes[0]!.series[1]!.data.at(-1));
  });

  it('legend and crosshair lookups agree with the studies', () => {
    const values = computeStudies(bars, ['sma20', 'rsi']);
    expect(barIndexAt(bars, OPEN + 300 * 30)).toBe(30);
    expect(barIndexAt(bars, OPEN + 1)).toBe(-1);
    const legend = legendValues(['sma20', 'rsi'], values, 30);
    expect(legend.map((l) => l.label)).toEqual(['SMA 20', 'RSI']);
    expect(legend[0]!.value).toBeCloseTo(values.sma20![30]!);
  });
});

describe('chart updates', () => {
  const base = [bar(1, 100), bar(2, 101)];
  const sent = { seriesKey: 'k', config: 'c', bars: base };

  it('a moved forming bar or one new bar is a tick', () => {
    expect(classifyUpdate(sent, { ...sent, bars: [bar(1, 100), bar(2, 105)] })).toEqual({
      kind: 'tick',
      appended: false,
    });
    expect(classifyUpdate(sent, { ...sent, bars: [...base, bar(3, 102)] })).toEqual({
      kind: 'tick',
      appended: true,
    });
  });

  it('older bars on the left redraw with the view held', () => {
    expect(classifyUpdate(sent, { ...sent, bars: [bar(-1, 98), bar(0, 99), ...base] })).toEqual({
      kind: 'data',
      prepended: 2,
    });
  });

  it('a new series or new settings redraw in full', () => {
    expect(classifyUpdate(null, sent)).toEqual({ kind: 'data', prepended: 0 });
    expect(classifyUpdate(sent, { ...sent, seriesKey: 'other' })).toEqual({
      kind: 'data',
      prepended: 0,
    });
    expect(classifyUpdate(sent, { ...sent, config: 'line' })).toEqual({
      kind: 'data',
      prepended: 0,
    });
  });
});

describe('chart config and history', () => {
  it('every interval asks within the server limits', () => {
    for (const spec of CHART_INTERVALS) {
      expect(spec.count).toBeLessThanOrEqual(6000); // market.dto candles count max
      expect(spec.minutesPerBar).toBeLessThanOrEqual(10_080);
    }
    expect(intervalSpec('1D').intraday).toBe(false);
  });

  it('VWAP applies to intraday intervals only', () => {
    expect(activeStudies(['vwap', 'rsi'], true)).toEqual(['vwap', 'rsi']);
    expect(activeStudies(['vwap', 'rsi'], false)).toEqual(['rsi']);
  });

  it('merges pages (newest first) into one ascending series without duplicates', () => {
    const newest = [bar(3, 103), bar(4, 104)];
    const older = [bar(1, 101), bar(2, 102), bar(3, 999)];
    const merged = mergeHistory([newest, older]);
    expect(merged.map((b) => b.time)).toEqual([1, 2, 3, 4]);
    expect(merged[2]!.close).toBe(103); // the newer page wins where they meet
  });
});

describe('chart page', () => {
  it('inlines the installed library and the current bridge (run `npm run build:chart`)', () => {
    const root = path.resolve(__dirname, '../../../..');
    const lib = JSON.parse(
      fs.readFileSync(path.join(root, 'node_modules/lightweight-charts/package.json'), 'utf8'),
    ) as { version: string };
    const bridge = fs.readFileSync(path.join(root, 'src/features/charts/web/bridge.js'), 'utf8');
    expect(CHART_LIBRARY_VERSION).toBe(lib.version);
    expect(CHART_HTML).toContain(bridge);
  });
});
