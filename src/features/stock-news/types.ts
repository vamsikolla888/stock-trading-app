// A company's news — GET /stocks/:symbol/news (server: modules/stock-news, stock-news.view.ts and
// stock-news.read.ts; web mirror: stock-analysis/services/stockNews.service.ts). Two pipelines in
// one list: `search` rows were found FOR the company by the daily web search (sentiment from the
// headline and snippet); `feed` rows are articles whose full-text analysis named the company.

export type NewsSentiment = 'Positive' | 'Neutral' | 'Negative';
export type NewsSentimentFilter = 'all' | NewsSentiment;
export type NewsWindow = 7 | 30 | 90;

export type NewsEventType =
  | 'earnings'
  | 'guidance'
  | 'order_win'
  | 'corporate_action'
  | 'deal'
  | 'management'
  | 'regulatory'
  | 'legal'
  | 'rating'
  | 'capital'
  | 'operations'
  | 'price_move'
  | 'sector_macro'
  | 'other';

export interface StockNewsItem {
  id: string;
  origin: 'search' | 'feed';
  title: string;
  url: string;
  publisher: string;
  publishedAt: string | null;
  /** exact · day (a date only) · relative ("2 days ago" — approximate). */
  publishedPrecision: 'exact' | 'day' | 'relative' | null;
  foundAt: string;
  snippet: string;
  analysisStatus: 'pending' | 'analyzed' | 'failed';
  relevance: 'about' | 'mentions' | null;
  sentiment: NewsSentiment | null;
  /** 0–100: how sure the model is of the label. */
  sentimentScore: number | null;
  /** 0–100: how material the story is to the price, either direction. */
  impactScore: number | null;
  eventType: NewsEventType | null;
  reason: string | null;
  /** The in-app analysis for a feed row (its news id), else null. */
  newsId: string | null;
}

export interface StockNewsSummary {
  total: number;
  analyzed: number;
  pending: number;
  positive: number;
  neutral: number;
  negative: number;
  highImpact: number;
  models: string[];
  latestAt: string | null;
}

/** 0–100 with 50 neutral: the weighted balance of positive against negative stories (impact ×
 *  confidence × recency) over the last 30 days. */
export interface NewsScore {
  value: number | null;
  label: NewsSentiment | null;
  /** Points against the score a week earlier. */
  change7d: number | null;
  /** The score as of each of the last 30 days, oldest first. */
  series: { date: string; value: number | null; stories: number }[];
  stories: number;
  evidence: 'thin' | 'moderate' | 'solid';
}

export interface NewsRiskDriver {
  id: string;
  title: string;
  url: string;
  eventType: NewsEventType | null;
  impact: number | null;
  at: string;
}

/** 0–100, higher = more adverse news, over the last 30 days. */
export interface NewsRisk {
  value: number | null;
  level: 'low' | 'moderate' | 'high' | null;
  components: { adverseShare: number; adverseEvents: number; conflict: number } | null;
  drivers: NewsRiskDriver[];
  stories: number;
  evidence: 'thin' | 'moderate' | 'solid';
}

export interface StockNewsCoverage {
  tracked: boolean;
  lastCheckedAt: string | null;
  lastOutcome: 'ok' | 'empty' | 'outage' | 'failed' | null;
  nextRunAt: string | null;
}

export interface StockNewsPage {
  coverage: StockNewsCoverage;
  summary: StockNewsSummary;
  /** Over a fixed 30-day lookback, whatever window the list shows. */
  signals: { score: NewsScore; risk: NewsRisk };
  items: StockNewsItem[];
  page: number;
  totalFiltered: number;
  hasMore: boolean;
}
