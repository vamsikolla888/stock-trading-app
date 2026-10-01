import type { Candle } from '@/features/market/types';

import { STUDY_COLORS, type ChartType, type StudyId } from './config';
import { bollingerBands, ema, heikinAshi, macd, rsi, sma, vwap } from './indicators';

/**
 * Bars + settings → exactly what the chart page draws (web/bridge.js renders it verbatim). Every
 * number is computed here, in typed and tested code: studies always use the REAL bars (never
 * Heikin-Ashi-smoothed ones), and one computation feeds the full payload, each live tick and the
 * crosshair legend, so the three can never disagree.
 */

/** Colours the page needs, resolved from the app theme (TradingChart builds it). */
export interface ChartTheme {
  background: string;
  textMuted: string;
  grid: string;
  crosshair: string;
  labelBackground: string;
  up: string;
  down: string;
  accent: string;
  accentFillTop: string;
  accentFillBottom: string;
  volumeUp: string;
  volumeDown: string;
  prevClose: string;
}

export type PriceKind = 'candles' | 'hollow' | 'bars' | 'line' | 'area';

export interface OhlcPoint {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}
export interface ValuePoint {
  time: number;
  value: number;
}
export interface ColorPoint extends ValuePoint {
  color: string;
}

export interface PaneSeries {
  id: string;
  kind: 'line' | 'histogram';
  color?: string;
  data: (ValuePoint | ColorPoint)[];
  /** Reference levels (RSI 30 / 70). */
  levels?: number[];
}

export interface ChartPayload {
  price: { kind: PriceKind; data: (OhlcPoint | ValuePoint)[] };
  volume: ColorPoint[] | null;
  overlays: { id: string; color: string; width: number; data: ValuePoint[] }[];
  panes: { id: string; series: PaneSeries[] }[];
  priceLines: { price: number; color: string; title: string }[];
  /** More history exists to the left — the page asks for it when the user scrolls there. */
  hasMore: boolean;
}

export interface ChartTick {
  price: OhlcPoint | ValuePoint;
  /** The tick opened a new bar rather than updating the last. */
  appended: boolean;
  volume?: ColorPoint;
  overlays: Record<string, ValuePoint | undefined>;
  panes: Record<string, Record<string, ValuePoint | ColorPoint | undefined>>;
}

/** Every study series, aligned index-for-index with the bars; null where it has no value yet. */
export type StudyValues = Record<string, (number | null)[]>;

export function computeStudies(bars: readonly Candle[], studies: readonly StudyId[]): StudyValues {
  const closes = bars.map((bar) => bar.close);
  const out: StudyValues = {};
  for (const study of studies) {
    switch (study) {
      case 'sma20':
        out.sma20 = sma(closes, 20);
        break;
      case 'sma50':
        out.sma50 = sma(closes, 50);
        break;
      case 'sma200':
        out.sma200 = sma(closes, 200);
        break;
      case 'ema9':
        out.ema9 = ema(closes, 9);
        break;
      case 'ema21':
        out.ema21 = ema(closes, 21);
        break;
      case 'bb': {
        const bands = bollingerBands(closes, 20, 2);
        out['bb.upper'] = bands.upper;
        out['bb.middle'] = bands.middle;
        out['bb.lower'] = bands.lower;
        break;
      }
      case 'vwap':
        out.vwap = vwap(bars);
        break;
      case 'rsi':
        out.rsi = rsi(closes, 14);
        break;
      case 'macd': {
        const result = macd(closes);
        out['macd.line'] = result.macd;
        out['macd.signal'] = result.signal;
        out['macd.hist'] = result.histogram;
        break;
      }
      default:
        break;
    }
  }
  return out;
}

/** Overlay lines a study draws on the price pane: [series id, colour, width]. */
const OVERLAY_LINES: Partial<Record<StudyId, readonly (readonly [string, string, number])[]>> = {
  sma20: [['sma20', STUDY_COLORS.sma20, 2]],
  sma50: [['sma50', STUDY_COLORS.sma50, 2]],
  sma200: [['sma200', STUDY_COLORS.sma200, 2]],
  ema9: [['ema9', STUDY_COLORS.ema9, 2]],
  ema21: [['ema21', STUDY_COLORS.ema21, 2]],
  bb: [
    ['bb.upper', STUDY_COLORS.bbBand, 1],
    ['bb.middle', STUDY_COLORS.bb, 1],
    ['bb.lower', STUDY_COLORS.bbBand, 1],
  ],
  vwap: [['vwap', STUDY_COLORS.vwap, 2]],
};

function priceKindOf(type: ChartType): PriceKind {
  return type === 'heikinAshi' ? 'candles' : type;
}

function pricePoint(bar: Candle, kind: PriceKind): OhlcPoint | ValuePoint {
  return kind === 'line' || kind === 'area'
    ? { time: bar.time, value: bar.close }
    : { time: bar.time, open: bar.open, high: bar.high, low: bar.low, close: bar.close };
}

const valuePoints = (bars: readonly Candle[], values: readonly (number | null)[]): ValuePoint[] => {
  const out: ValuePoint[] = [];
  for (let i = 0; i < bars.length; i++) {
    const value = values[i];
    if (value != null && Number.isFinite(value)) out.push({ time: bars[i]!.time, value });
  }
  return out;
};

const volumePoint = (bar: Candle, theme: ChartTheme): ColorPoint => ({
  time: bar.time,
  value: bar.volume,
  color: bar.close >= bar.open ? theme.volumeUp : theme.volumeDown,
});

const histColor = (value: number, theme: ChartTheme) =>
  value >= 0 ? theme.volumeUp : theme.volumeDown;

export interface PayloadInput {
  bars: readonly Candle[];
  chartType: ChartType;
  studies: readonly StudyId[];
  theme: ChartTheme;
  /** Drawn as a dashed "Prev close" line (intraday charts). */
  prevClose?: number | null;
  hasMore?: boolean;
}

export function buildChartPayload(input: PayloadInput, values?: StudyValues): ChartPayload {
  const { bars, chartType, studies, theme } = input;
  const studyValues = values ?? computeStudies(bars, studies);
  const kind = priceKindOf(chartType);
  const drawn = chartType === 'heikinAshi' ? heikinAshi(bars) : bars;

  const overlays: ChartPayload['overlays'] = [];
  for (const study of studies) {
    for (const [id, color, width] of OVERLAY_LINES[study] ?? []) {
      overlays.push({ id, color, width, data: valuePoints(bars, studyValues[id] ?? []) });
    }
  }

  const panes: ChartPayload['panes'] = [];
  if (studies.includes('rsi')) {
    panes.push({
      id: 'rsi',
      series: [
        {
          id: 'rsi',
          kind: 'line',
          color: STUDY_COLORS.rsi,
          data: valuePoints(bars, studyValues.rsi ?? []),
          levels: [30, 70],
        },
      ],
    });
  }
  if (studies.includes('macd')) {
    const hist = valuePoints(bars, studyValues['macd.hist'] ?? []).map((p) => ({
      ...p,
      color: histColor(p.value, theme),
    }));
    panes.push({
      id: 'macd',
      series: [
        { id: 'macd.hist', kind: 'histogram', data: hist },
        {
          id: 'macd.line',
          kind: 'line',
          color: STUDY_COLORS.macd,
          data: valuePoints(bars, studyValues['macd.line'] ?? []),
        },
        {
          id: 'macd.signal',
          kind: 'line',
          color: STUDY_COLORS.signal,
          data: valuePoints(bars, studyValues['macd.signal'] ?? []),
        },
      ],
    });
  }

  return {
    price: { kind, data: drawn.map((bar) => pricePoint(bar, kind)) },
    volume: studies.includes('volume') ? bars.map((bar) => volumePoint(bar, theme)) : null,
    overlays,
    panes,
    priceLines:
      input.prevClose != null && input.prevClose > 0
        ? [{ price: input.prevClose, color: theme.prevClose, title: 'Prev close' }]
        : [],
    hasMore: input.hasMore ?? false,
  };
}

/** The last point of every series after a live tick — what the page `update()`s, nothing more. */
export function buildChartTick(
  input: PayloadInput,
  appended: boolean,
  values?: StudyValues,
): ChartTick | null {
  const { bars, chartType, studies, theme } = input;
  const last = bars.length - 1;
  if (last < 0) return null;
  const studyValues = values ?? computeStudies(bars, studies);
  const kind = priceKindOf(chartType);
  const lastBar = bars[last]!;
  const drawnLast = chartType === 'heikinAshi' ? heikinAshi(bars)[last]! : lastBar;
  const at = (id: string): ValuePoint | undefined => {
    const value = studyValues[id]?.[last];
    return value != null && Number.isFinite(value) ? { time: lastBar.time, value } : undefined;
  };

  const overlays: ChartTick['overlays'] = {};
  for (const study of studies) {
    for (const [id] of OVERLAY_LINES[study] ?? []) overlays[id] = at(id);
  }
  const panes: ChartTick['panes'] = {};
  if (studies.includes('rsi')) panes.rsi = { rsi: at('rsi') };
  if (studies.includes('macd')) {
    const hist = at('macd.hist');
    panes.macd = {
      'macd.hist': hist ? { ...hist, color: histColor(hist.value, theme) } : undefined,
      'macd.line': at('macd.line'),
      'macd.signal': at('macd.signal'),
    };
  }
  return {
    price: pricePoint(drawnLast, kind),
    appended,
    volume: studies.includes('volume') ? volumePoint(lastBar, theme) : undefined,
    overlays,
    panes,
  };
}

/** Index of the bar at `time` (unix seconds), or -1. Bars are ascending. */
export function barIndexAt(bars: readonly Candle[], time: number): number {
  let lo = 0;
  let hi = bars.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const t = bars[mid]!.time;
    if (t === time) return mid;
    if (t < time) lo = mid + 1;
    else hi = mid - 1;
  }
  return -1;
}

export interface LegendValue {
  label: string;
  value: number;
  color: string;
}

/** What the legend reads for the bar at `index`: each active study's value there. */
export function legendValues(
  studies: readonly StudyId[],
  values: StudyValues,
  index: number,
): LegendValue[] {
  const out: LegendValue[] = [];
  const push = (label: string, id: string, color: string) => {
    const value = values[id]?.[index];
    if (value != null && Number.isFinite(value)) out.push({ label, value, color });
  };
  for (const study of studies) {
    switch (study) {
      case 'sma20':
        push('SMA 20', 'sma20', STUDY_COLORS.sma20);
        break;
      case 'sma50':
        push('SMA 50', 'sma50', STUDY_COLORS.sma50);
        break;
      case 'sma200':
        push('SMA 200', 'sma200', STUDY_COLORS.sma200);
        break;
      case 'ema9':
        push('EMA 9', 'ema9', STUDY_COLORS.ema9);
        break;
      case 'ema21':
        push('EMA 21', 'ema21', STUDY_COLORS.ema21);
        break;
      case 'bb':
        push('BB upper', 'bb.upper', STUDY_COLORS.bbBand);
        push('BB lower', 'bb.lower', STUDY_COLORS.bbBand);
        break;
      case 'vwap':
        push('VWAP', 'vwap', STUDY_COLORS.vwap);
        break;
      case 'rsi':
        push('RSI', 'rsi', STUDY_COLORS.rsi);
        break;
      case 'macd':
        push('MACD', 'macd.line', STUDY_COLORS.macd);
        push('Signal', 'macd.signal', STUDY_COLORS.signal);
        break;
      default:
        break;
    }
  }
  return out;
}
