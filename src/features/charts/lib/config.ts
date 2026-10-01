/**
 * What the advanced chart can show: intervals, chart types and studies. Pure data — the
 * screen renders it, the store persists the choice, the payload builder obeys it.
 */

export type ChartInterval = '1m' | '3m' | '5m' | '15m' | '30m' | '1h' | '1D' | '1W';

export interface IntervalSpec {
  key: ChartInterval;
  label: string;
  minutesPerBar: number;
  /** Bars per request (server cap 6000); older pages load as the user scrolls left. */
  count: number;
  intraday: boolean;
}

/**
 * Bars per request: enough to fill a phone at a comfortable zoom with room to scroll, one
 * request each — candles are rate-limited (30/min per user), so nothing here is chatty.
 */
export const CHART_INTERVALS: readonly IntervalSpec[] = [
  { key: '1m', label: '1m', minutesPerBar: 1, count: 750, intraday: true },
  { key: '3m', label: '3m', minutesPerBar: 3, count: 500, intraday: true },
  { key: '5m', label: '5m', minutesPerBar: 5, count: 600, intraday: true },
  { key: '15m', label: '15m', minutesPerBar: 15, count: 500, intraday: true },
  { key: '30m', label: '30m', minutesPerBar: 30, count: 500, intraday: true },
  { key: '1h', label: '1H', minutesPerBar: 60, count: 500, intraday: true },
  { key: '1D', label: '1D', minutesPerBar: 1440, count: 1000, intraday: false },
  { key: '1W', label: '1W', minutesPerBar: 10_080, count: 520, intraday: false },
];

export function intervalSpec(key: ChartInterval): IntervalSpec {
  return CHART_INTERVALS.find((spec) => spec.key === key) ?? CHART_INTERVALS[2]!;
}

export type ChartType = 'candles' | 'hollow' | 'heikinAshi' | 'bars' | 'line' | 'area';

export const CHART_TYPES: readonly { key: ChartType; label: string }[] = [
  { key: 'candles', label: 'Candles' },
  { key: 'hollow', label: 'Hollow candles' },
  { key: 'heikinAshi', label: 'Heikin Ashi' },
  { key: 'bars', label: 'Bars (OHLC)' },
  { key: 'line', label: 'Line' },
  { key: 'area', label: 'Area' },
];

export type StudyId =
  'volume' | 'sma20' | 'sma50' | 'sma200' | 'ema9' | 'ema21' | 'bb' | 'vwap' | 'rsi' | 'macd';

export interface StudySpec {
  id: StudyId;
  label: string;
  detail: string;
  /** Overlays share the price pane; oscillators get a pane of their own below it. */
  group: 'overlay' | 'oscillator';
  /** A session measure: meaningless on daily and weekly bars, so offered intraday only. */
  intradayOnly?: boolean;
}

export const STUDIES: readonly StudySpec[] = [
  { id: 'volume', label: 'Volume', detail: 'Traded quantity per bar', group: 'overlay' },
  { id: 'sma20', label: 'SMA 20', detail: 'Simple moving average', group: 'overlay' },
  { id: 'sma50', label: 'SMA 50', detail: 'Simple moving average', group: 'overlay' },
  { id: 'sma200', label: 'SMA 200', detail: 'Simple moving average', group: 'overlay' },
  { id: 'ema9', label: 'EMA 9', detail: 'Exponential moving average', group: 'overlay' },
  { id: 'ema21', label: 'EMA 21', detail: 'Exponential moving average', group: 'overlay' },
  {
    id: 'bb',
    label: 'Bollinger Bands',
    detail: '20 bars, 2 standard deviations',
    group: 'overlay',
  },
  {
    id: 'vwap',
    label: 'VWAP',
    detail: 'Volume-weighted average price, per session',
    group: 'overlay',
    intradayOnly: true,
  },
  { id: 'rsi', label: 'RSI 14', detail: 'Relative strength index', group: 'oscillator' },
  { id: 'macd', label: 'MACD', detail: '12, 26, 9', group: 'oscillator' },
];

export const DEFAULT_STUDIES: readonly StudyId[] = ['volume'];

/** The studies that apply on this interval — VWAP drops out on daily and weekly bars. */
export function activeStudies(selected: readonly StudyId[], intraday: boolean): StudyId[] {
  return STUDIES.filter((s) => selected.includes(s.id) && (intraday || !s.intradayOnly)).map(
    (s) => s.id,
  );
}

/** Line colours, chosen to read on both the light and the dark surface. */
export const STUDY_COLORS = {
  sma20: '#3b82f6',
  sma50: '#f59e0b',
  sma200: '#a855f7',
  ema9: '#ec4899',
  ema21: '#14b8a6',
  bb: '#6366f1',
  bbBand: '#818cf8',
  vwap: '#f97316',
  rsi: '#a855f7',
  macd: '#3b82f6',
  signal: '#f59e0b',
} as const;
