// Mirrored from the web client (client/src/features/market-heatmap/services/market-heatmap.service.ts)
// and the server (modules/indices/index.routes.ts, market-heatmap.service.ts).

export type HeatmapProvider = 'groww' | 'mstock';
export type HeatmapTimeframe = '1D' | '1W' | '1M' | '1Y';
export type IndexCategory = 'broad' | 'sectoral' | 'thematic';

/** One row of GET /indices. */
export interface HeatmapIndexSummary {
  key: string;
  label: string;
  shortLabel: string;
  category: IndexCategory;
  exchange: 'NSE' | 'BSE';
  constituentCount: number;
  caveat: string | null;
  /** No imported members — "membership unknown", not "an index with no members". */
  unavailable: boolean;
}

export interface HeatmapStock {
  exchange: 'NSE' | 'BSE';
  symbol: string;
  companyName: string | null;
  sector: string | null;
  ltp: number | null;
  /** Previous close on 1D; the close at the start of the window otherwise. */
  baseline: number | null;
  change: number | null;
  changePct: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  volume: number | null;
  /** Paise. */
  marketCap: number | null;
  lastUpdatedAt: string | null;
}

export interface HeatmapBreadth {
  advances: number;
  declines: number;
  unchanged: number;
  unavailable: number;
}

/** GET /indices/:indexKey/heatmap?timeframe&provider */
export interface MarketHeatmapResponse {
  index: {
    key: string;
    label: string;
    shortLabel: string;
    exchange: 'NSE' | 'BSE';
    category: string;
    constituentCount: number;
    caveat: string | null;
  };
  timeframe: HeatmapTimeframe;
  provider: {
    requested: HeatmapProvider;
    active: HeatmapProvider | 'snapshot';
    fallbackUsed: boolean;
    live: boolean;
  };
  indexLevel: {
    ltp: number | null;
    change: number | null;
    changePct: number | null;
    /** True when the move is the market-cap-weighted constituent move, not the index quote. */
    estimated: boolean;
  };
  breadth: HeatmapBreadth;
  stocks: HeatmapStock[];
  asOf: string;
  marketOpen: boolean;
}
