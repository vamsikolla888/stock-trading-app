// Response shapes mirrored from the web client (stocks-advisory-platform/client/src:
// shared/api/market.service.ts, features/explore/services/explore.service.ts,
// features/screeners/services/screeners.service.ts). Keep field names identical.

export type Exchange = 'NSE' | 'BSE';

export interface IndexTag {
  key: string;
  label: string;
  shortLabel: string;
  category: string;
}

export interface StockIndexTags {
  primary: IndexTag | null;
  sectors: IndexTag[];
  all: IndexTag[];
}

export interface MaybeIndexTagged {
  indices?: StockIndexTags;
}

/** GET /market/indices and the /indices socket. `change` is in index points, not ₹. */
export interface IndexQuote {
  exchange: string;
  symbol: string;
  label?: string;
  ltp: number | null;
  prevClose: number | null;
  change?: number | null;
  changePct?: number | null;
}

export interface IndicesResponse {
  indices: IndexQuote[];
  asOf: string;
  stale: boolean;
}

export interface IndexSnapshot {
  indices: IndexQuote[];
  asOf: string;
  marketOpen: boolean;
}

/** GET /stocks/top-gainers | top-losers. `close` is the PREVIOUS close. */
export interface Mover extends MaybeIndexTagged {
  symbol: string;
  companyName: string | null;
  exchange: string;
  ltp: number | null;
  changeAbs?: number | null;
  changePct: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume?: number | null;
  /** Paise. Present only on cap-band responses. */
  marketCap?: number | null;
}

export interface MoversResponse {
  movers: Mover[];
}

export type MoverKind = 'gainers' | 'losers' | 'volume';
export type CapBand = 'small' | 'mid' | 'large';

export interface SearchResult extends MaybeIndexTagged {
  symbol: string;
  companyName: string | null;
  exchange: string;
  ltp: number | null;
  changePct: number | null;
}

export interface SearchResponse {
  results: SearchResult[];
}

export interface RecentlyViewedItem extends MaybeIndexTagged {
  symbol: string;
  companyName: string | null;
  exchange: string;
  ltp: number | null;
  changePct: number | null;
  viewedAt: string;
}

export interface StockListing {
  exchange: Exchange;
  symbol: string;
  displaySymbol: string;
  isin?: string | null;
  ltp: number | null;
  changePct: number | null;
}

/** GET /stocks/{symbol}?exchange=. Works without a broker; `marketCap` is in paise. */
export interface StockDetail extends MaybeIndexTagged {
  symbol: string;
  exchange: string;
  companyName: string | null;
  isin: string | null;
  segment: string | null;
  lotSize: number | null;
  tickSize: number | null;
  isActive: boolean;
  ltp: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  prevClose: number | null;
  volume: number | null;
  changeAbs: number | null;
  changePct: number | null;
  lastUpdatedAt: string | null;
  priceSource?: 'broker' | 'snapshot' | null;
  priceAsOf?: string | null;
  /** When `volume` was last refreshed — the snapshot keeps it current for ~105 names only. */
  volumeAsOf?: string | null;
  marketCap: number | null;
  yearlyHigh: number | null;
  yearlyLow: number | null;
  /** `daily-bars`: measured from stored bars; `catalog`: the seeded value. */
  yearlyRangeSource?: 'daily-bars' | 'catalog' | null;
  industry?: string | null;
  sector?: string | null;
  listings?: StockListing[];
}

export interface Candle {
  /** Unix seconds. */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface CandlesResponse {
  candles: Candle[];
}

export interface SentimentSummary {
  symbols: string[];
  days: number;
  articles: number;
  positive: number;
  neutral: number;
  negative: number;
  /** −1 … +1; null with no articles. */
  net: number | null;
  latestAt: string | null;
  models: string[];
}

export interface ScreenerCondition {
  field: string;
  op: string;
  value: string;
}

export interface ScreenerSummary {
  id: string;
  label: string;
  conditions: ScreenerCondition[];
  timeframe: string;
  matchCount: number;
  universeSize: number;
  /** Null until the first scan — render "Not scanned yet", never 0. */
  runAt: string | null;
}

export interface ScreenerMatch extends MaybeIndexTagged {
  exchange: string;
  symbol: string;
  companyName: string | null;
  ltp: number | null;
  changePct: number | null;
  metrics: Record<string, number>;
  score: number;
  recentCloses: number[];
}

export interface ScreenerDetail extends ScreenerSummary {
  matches: ScreenerMatch[];
}

export type Sentiment = 'Positive' | 'Neutral' | 'Negative';

export interface AnalyzedArticleListItem {
  newsId: string;
  title: string;
  source: string;
  link: string;
  publishedAtDate: string | null;
  sentiment: Sentiment | null;
  effectivenessScore: number | null;
  stockSymbol: string | null;
  symbolVerified: boolean;
}

export interface AnalyzedArticleListResponse {
  items: AnalyzedArticleListItem[];
  total: number;
  page: number;
  pageSize: number;
}
