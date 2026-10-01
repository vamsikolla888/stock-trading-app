import type { Candle } from '@/features/market/types';

/**
 * Keeping candles readable on a phone. A candle needs room for a body and a gap: below about
 * 7 pt a slot the bodies shrink to slivers (80 five-minute bars across a 350 pt chart is 4 pt
 * each). So when a range has more bars than fit, neighbouring bars merge into wider candles —
 * the way a terminal shows 10-minute candles when 5-minute ones would not fit.
 */

/** Width one drawn candle needs: a ~5 pt body plus its gap. */
export const MIN_CANDLE_SLOT = 7;

const IST_OFFSET_S = 19_800;
const istDay = (sec: number) => Math.floor((sec + IST_OFFSET_S) / 86_400);

/** How many source bars merge into one drawn candle so each gets at least `minSlot` points. */
export function candleGroupSize(count: number, width: number, minSlot = MIN_CANDLE_SLOT): number {
  if (count <= 0 || width <= 0) return 1;
  return Math.max(1, Math.ceil((count * minSlot) / width));
}

/**
 * Bars merged `size` at a time: the first bar's open and time, the last's close, the extremes
 * of all, their volumes summed. Intraday bars never merge across an IST trading day — each
 * day's groups start at its own first bar, so a candle never spans an overnight gap.
 */
export function groupCandles(candles: readonly Candle[], size: number): readonly Candle[] {
  if (size <= 1 || candles.length < 2) return candles;
  const intraday = candles[1]!.time - candles[0]!.time < 86_400;
  const out: Candle[] = [];
  let count = 0;
  for (const bar of candles) {
    const group = out[out.length - 1];
    const sameDay = !intraday || (group !== undefined && istDay(group.time) === istDay(bar.time));
    if (group && count < size && sameDay) {
      out[out.length - 1] = {
        time: group.time,
        open: group.open,
        high: Math.max(group.high, bar.high),
        low: Math.min(group.low, bar.low),
        close: bar.close,
        volume: group.volume + bar.volume,
      };
      count += 1;
    } else {
      out.push({ ...bar });
      count = 1;
    }
  }
  return out;
}

// ── Geometry ─────────────────────────────────────────────────────────────────────────────

const PAD_Y = 16;
/** Space between the lowest candle and the volume strip. */
const VOLUME_GAP = 6;

export interface CandleGeometry {
  x: number;
  highY: number;
  lowY: number;
  openY: number;
  closeY: number;
  topY: number;
  bottomY: number;
  bodyHeight: number;
  isBullish: boolean;
  volHeight: number;
  candle: Candle;
}

export interface ChartGeometry {
  candlesGeo: CandleGeometry[];
  slotWidth: number;
  bodyWidth: number;
  baselineY: number | null;
}

export function buildCandlestickGeometry(
  candles: readonly Candle[],
  width: number,
  height: number,
  baseline?: number | null,
): ChartGeometry | null {
  if (width <= 0 || candles.length < 2) return null;

  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);
  const volumes = candles.map((c) => c.volume || 0);

  if (typeof baseline === 'number' && Number.isFinite(baseline)) {
    highs.push(baseline);
    lows.push(baseline);
  }

  const minPrice = Math.min(...lows);
  const maxPrice = Math.max(...lows.concat(highs));
  const priceRange = maxPrice - minPrice || 1;

  const maxVolume = Math.max(...volumes) || 1;
  // Volume gets its own strip under the candles rather than painting over the lowest ones.
  const maxVolHeight = height * 0.18;
  const priceHeight = height - maxVolHeight - PAD_Y * 2 - VOLUME_GAP;

  const slotWidth = width / candles.length;
  const bodyWidth = Math.max(2, Math.min(14, slotWidth * 0.7));

  const toY = (price: number) => PAD_Y + (1 - (price - minPrice) / priceRange) * priceHeight;

  const candlesGeo: CandleGeometry[] = candles.map((candle, index) => {
    const x = index * slotWidth + slotWidth / 2;
    const highY = toY(candle.high);
    const lowY = toY(candle.low);
    const openY = toY(candle.open);
    const closeY = toY(candle.close);
    const topY = Math.min(openY, closeY);
    const bottomY = Math.max(openY, closeY);
    const bodyHeight = Math.max(1.2, bottomY - topY);
    const isBullish = candle.close >= candle.open;
    const volHeight = ((candle.volume || 0) / maxVolume) * maxVolHeight;

    return {
      x,
      highY,
      lowY,
      openY,
      closeY,
      topY,
      bottomY,
      bodyHeight,
      isBullish,
      volHeight,
      candle,
    };
  });

  return {
    candlesGeo,
    slotWidth,
    bodyWidth,
    baselineY: typeof baseline === 'number' && Number.isFinite(baseline) ? toY(baseline) : null,
  };
}
