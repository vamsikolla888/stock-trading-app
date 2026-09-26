// Mirrored from the web client (client/src/features/news-center/services/news-analysis.service.ts)
// and checked against the server (modules/news-analysis/*.dto.ts, news-analysis.service.ts,
// modules/news/news.routes.ts). Field names are identical to the API's.

export type NewsAnalysisJobStatus = 'queued' | 'processing' | 'completed' | 'failed';
export type NewsSentiment = 'Positive' | 'Neutral' | 'Negative';

/** One row of GET /news/analysis. */
export interface AnalyzedArticleListItem {
  newsId: string;
  title: string;
  source: string;
  link: string;
  publishedAtDate: string | null;
  jobStatus: NewsAnalysisJobStatus | null;
  sentiment: NewsSentiment | null;
  /** 0–100: how much the article should move a decision. Null until scored. */
  effectivenessScore: number | null;
  stockSymbol: string | null;
  /** False when the matcher could not confirm the ticker — the attribution is a guess. */
  symbolVerified: boolean;
  lastError: string | null;
  env: 'local' | 'prod' | null;
}

export interface AnalyzedArticleListResponse {
  items: AnalyzedArticleListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export type NewsRange = 'today' | 'yesterday' | 'last7days';
export type NewsSort = 'date' | 'impact';

/** Query for GET /news/analysis (server listAnalysisQuerySchema — strict, pageSize ≤ 200). */
export interface NewsFilters {
  pageSize?: number;
  range?: NewsRange;
  /** ISO datetime; not combined with `range`. */
  from?: string;
  to?: string;
  sentiment?: NewsSentiment;
  status?: NewsAnalysisJobStatus;
  stockSymbol?: string;
  sortBy?: NewsSort;
}

/** GET /news/analysis/:newsId — the raw article, its job and its analysis. */
export interface AnalyzedArticleDetail {
  article: {
    _id: string;
    title: string;
    source: string;
    link: string;
    publishedAt: string;
    publishedAtDate: string | null;
    summary?: string | null;
  };
  job: {
    status: NewsAnalysisJobStatus;
    attempts: number;
    lastError: string | null;
    queuedAt: string;
    startedAt: string | null;
    finishedAt: string | null;
  } | null;
  analysis: {
    sentiment: NewsSentiment;
    sentimentScore: number;
    effectivenessScore: number;
    expectedMovementPercent: number;
    tip: string;
    reasoning: string;
    stockSymbol: string | null;
    exchange: 'NSE' | 'BSE' | null;
    symbolVerified: boolean;
    model: string;
    tokensUsed: number;
    analyzedAt: string;
  } | null;
}

export type NewsRunStatus = 'RUNNING' | 'COMPLETED' | 'FAILED';

/** GET /news/runs — one ingestion batch, trimmed to what a summary row needs. */
export interface NewsRunListItem {
  runId: string;
  status: NewsRunStatus;
  triggeredBy: 'MANUAL' | 'SCHEDULED';
  startedAt: string;
  finishedAt: string | null;
  counts: {
    fetched: number;
    inserted: number;
    duplicatesInRun: number;
    alsoSeenInEarlierRuns: number;
  };
  errorMessage: string | null;
}

export interface NewsRunListResponse {
  runs: NewsRunListItem[];
  total: number;
  page: number;
  pageSize: number;
}
