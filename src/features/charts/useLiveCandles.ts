import { useEffect, useState, useSyncExternalStore } from 'react';

import type { Candle } from '@/features/market/types';

import { LiveCandleSeries } from './lib/liveCandles';

const nowSec = () => Math.floor(Date.now() / 1000);

/**
 * `serverBars` with the live price folded into its forming candle while `live`. Pass a stable
 * `serverBars` (a query result or a memo) — a new array each render would re-sync every render.
 * `seriesKey` names what the bars are (instrument + interval); see LiveCandleSeries.
 */
export function useLiveCandles(
  serverBars: readonly Candle[],
  ltp: number | null | undefined,
  bucketSec: number,
  live: boolean,
  seriesKey: string,
): readonly Candle[] {
  const [series] = useState(() => new LiveCandleSeries(serverBars, seriesKey));

  useEffect(() => {
    series.setHistory(serverBars, seriesKey, nowSec());
  }, [series, serverBars, seriesKey]);

  useEffect(() => {
    series.tick(live && ltp != null ? ltp : null, nowSec(), bucketSec);
  }, [series, ltp, live, bucketSec]);

  return useSyncExternalStore(series.subscribe, series.getBars, series.getBars);
}
