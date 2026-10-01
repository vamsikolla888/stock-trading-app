// Mirrored from the web client (features/fundamentals/services/fundamentals.service.ts), which
// mirrors server/src/modules/fundamentals/fundamentals-view.ts and fundamentals-list.ts.
//
// MONEY IS IN ₹ CRORE unless a field says otherwise. A missing value is null — rendered "—",
// never 0 — and the scoring framework is the server's: the client never re-scores.

export type Band = 'strong' | 'average' | 'weak' | 'not_available';
export type Verdict =
  'strong_bullish' | 'bullish' | 'neutral' | 'bearish' | 'strong_bearish' | 'insufficient_data';
export type Confidence = 'high' | 'medium' | 'low' | 'insufficient';
export type JobStage = 'queued' | 'fetching_data' | 'scoring' | 'ai_analysis' | 'saving';
export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'dead';
export type ViewState =
  | 'ready'
  | 'refreshing'
  | 'queued'
  | 'running'
  | 'scheduled'
  | 'partial'
  | 'insufficient_data'
  | 'not_applicable'
  | 'delisted'
  | 'failed'
  | 'rate_limited';

export interface CheckResult {
  key: string;
  label: string;
  value: number | string | null;
  unit: string | null;
  band: Band;
  points: number;
  maxPoints: number;
  status: 'scored' | 'not_meaningful' | 'not_available';
  rationale: string;
  source: 'code' | 'ai' | 'code+ai';
  period?: string | null;
}

export interface SectionResult {
  key: string;
  title: string;
  earned: number;
  max: number;
  available: number;
  checks: CheckResult[];
}

export interface KeyNumbersRow {
  fiscalYear: number;
  sales: number | null;
  ebitda: number | null;
  opmPct: number | null;
  pat: number | null;
  eps: number | null;
  rocePct: number | null;
  roePct: number | null;
  debtToEquity: number | null;
  cfo: number | null;
  fcf: number | null;
  preListing: boolean;
}

export interface ShareholdingRow {
  periodEnd: string;
  promoter: number | null;
  pledge: number | null;
  fii: number | null;
  dii: number | null;
  public: number | null;
}

export interface ValuationDetail {
  pe: number | null;
  peMedian: number | null;
  industryPe: number | null;
  pb: number | null;
  peg: number | null;
  evToEbitda: number | null;
  intrinsicValue: number | null;
  marginOfSafetyPct: number | null;
  earningsYieldPct: number | null;
  gsec10y: number | null;
  impliedGrowthPct: number | null;
  historicalGrowthPct: number | null;
  expensiveByReverseDcf: boolean | null;
  normalisedForCycle: boolean;
}

export interface AnalysisReport {
  header: {
    companyName: string;
    nseSymbol: string | null;
    bseSymbol: string | null;
    isin: string;
    sector: string | null;
    industry: string | null;
    marketCapCr: number | null;
    price: number | null;
    week52High: number | null;
    week52Low: number | null;
    pe: number | null;
    bookValue: number | null;
  };
  business: string | null;
  keyNumbers: KeyNumbersRow[];
  shareholding: ShareholdingRow[];
  valuation: ValuationDetail;
  strengths: string[];
  risks: string[];
  triggers: string[];
  whatWouldChange: string[];
  redFlags: { type: string; description: string; evidence: string[] }[];
  screen: { passed: boolean | null; failed: string[]; unknown: string[] };
  peers: {
    name: string;
    isin: string | null;
    pe: number | null;
    pb: number | null;
    marketCapCr: number | null;
  }[];
}

export interface AnalysisView {
  id: string;
  isin: string;
  symbol: string;
  exchange: 'NSE' | 'BSE';
  companyName: string;
  sector: string | null;
  industry: string | null;
  companyType: 'standard' | 'bank' | 'nbfc' | 'insurer_life' | 'insurer_general';
  weekKey: string;
  frameworkVersion: string;
  model: string | null;
  status: 'completed' | 'partial' | 'insufficient_data' | 'failed' | 'not_applicable';
  source: string;
  isNewListing: boolean;
  listingDate: string | null;
  financialsBasis: 'consolidated' | 'standalone';
  dataCoverage: { annualYears: number; quarters: number; shareholdingQuarters: number };
  dataSources: {
    fundamentals: string;
    price: string;
    snapshotFetchedAt: string | null;
    fallbackUsed: boolean;
  };
  confidence: Confidence;
  sections: SectionResult[];
  earned: number;
  availableMax: number;
  ratingPct: number | null;
  qualityPct: number | null;
  valuationPct: number | null;
  verdict: Verdict;
  verdictLabel: string;
  uncappedVerdict: Verdict;
  knockouts: { rule: string; evidence: string; source: string }[];
  tags: string[];
  notes: string[];
  report: AnalysisReport | null;
  priceAsOf: string | null;
  dataAsOf: string | null;
  generatedAt: string;
  validUntil: string;
  previousRatingPct: number | null;
  ratingDelta: number | null;
  message: string | null;
  isStale: boolean;
  disclaimer: string;
}

export interface JobView {
  id: string;
  isin: string;
  status: JobStatus;
  stage: JobStage;
  priority: 'HIGH' | 'NORMAL' | 'LOW';
  queuePosition: number | null;
  etaSeconds: number | null;
  scheduled: boolean;
  requestCount: number;
  attempts: number;
  maxAttempts: number;
  message: string | null;
  retryable: boolean | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  analysisId: string | null;
}

/** GET /stocks/{symbol}/analysis — `state` carries what the status code does. */
export interface AnalysisResponse {
  state: ViewState;
  isin: string | null;
  symbol: string;
  exchange: 'NSE' | 'BSE';
  companyName: string;
  analysis: AnalysisView | null;
  job: JobView | null;
  isStale: boolean;
  message: string | null;
  frameworkVersion: string;
}

export interface HistoryPoint {
  weekKey: string;
  ratingPct: number | null;
  qualityPct: number | null;
  valuationPct: number | null;
  verdict: Verdict;
  status: string;
  frameworkVersion: string;
  generatedAt: string;
}

// ── The Stock analysis list (GET /fundamentals/analyses) ─────────────────────────────────

export type ListSort =
  'rating' | 'change' | 'quality' | 'valuation' | 'marketCap' | 'pe' | 'mos' | 'name' | 'updated';

export interface AnalysisListItem {
  id: string;
  isin: string;
  symbol: string;
  exchange: 'NSE' | 'BSE';
  companyName: string;
  sector: string | null;
  industry: string | null;
  status: 'completed' | 'partial' | 'insufficient_data';
  verdict: Verdict;
  confidence: Confidence;
  ratingPct: number | null;
  qualityPct: number | null;
  valuationPct: number | null;
  earned: number;
  availableMax: number;
  ratingDelta: number | null;
  marketCapCr: number | null;
  price: number | null;
  pe: number | null;
  marginOfSafetyPct: number | null;
  knockouts: string[];
  tags: string[];
  indexKeys: string[];
  weekKey: string;
  generatedAt: string;
  isStale: boolean;
}

export interface AnalysisListQuery {
  verdict?: Verdict[];
  index?: string | null;
  sector?: string | null;
  q?: string;
  sort?: ListSort;
  dir?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export interface AnalysisListResponse {
  items: AnalysisListItem[];
  total: number;
  page: number;
  pages: number;
  limit: number;
  facets: {
    verdict: Record<Verdict, number>;
    confidence: Record<Confidence, number>;
    sectors: { name: string; count: number }[];
    indices: { key: string; label: string; count: number }[];
  };
  totals: { analysed: number; universe: number; byVerdict: Record<Verdict, number> };
  /** As a worker registered it; null = no worker has scheduled the weekly run. */
  schedule: { pattern: string; nextRunAt: string | null } | null;
  windowDays: number;
  frameworkVersion: string;
  asOf: string;
  disclaimer: string;
}
