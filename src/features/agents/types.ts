/**
 * The Agents screens' data — `/api/v1/agents/*` and the portfolio-review agent's own
 * `/portfolio/holding-reviews/*` routes (server/src/modules/agents, modules/holding-review).
 * Every shape here is what lib/normalize.ts produces: arrays are arrays, numbers finite or null,
 * and the analyst-note sections added after the first reviews are null / empty when absent.
 * Money is rupees; rates are PERCENT (0–100).
 */

/** The server's activity / status tone. */
export type AgentTone = 'ok' | 'warn' | 'err' | 'run' | 'idle';
export type Confidence = 'high' | 'medium' | 'low';

/* ───────────────────────── portfolio review ───────────────────────── */

/** A research label — never an order. */
export type ReviewAction = 'CONSIDER_ADD' | 'HOLD' | 'CONSIDER_SELL' | 'NEEDS_REVIEW';
export type EvidenceQuality = 'adequate' | 'limited' | 'unavailable';
export type TechnicalStance = 'bullish' | 'neutral' | 'bearish';
export type NewsTone = 'positive' | 'neutral' | 'negative' | 'mixed';
export type Trend = 'up' | 'down' | 'mixed' | 'unknown';

export interface ReviewSource {
  url: string;
  title: string | null;
  publishedAt: string | null;
}

export interface ReviewFinding {
  claim: string;
  confidence: Confidence;
  urls: string[];
}

export interface ReviewLevels {
  lastPrice: number | null;
  averagePrice: number | null;
  support: number | null;
  resistance: number | null;
  sma20: number | null;
  sma50: number | null;
}

export interface ReviewResult {
  action: ReviewAction;
  thesis: string | null;
  bullCase: string[];
  bearCase: string[];
  whatWouldChangeMind: string[];
  riskNotes: string[];
  horizon: string | null;
  evidenceQuality: EvidenceQuality | null;
  research: {
    summary: string | null;
    sources: ReviewSource[];
    findings: ReviewFinding[];
    openQuestions: string[];
  };
  limitations: string[];
  // The analyst note — null / empty on reviews written before the ai-service added it.
  conviction: Confidence | null;
  riskLevel: 'low' | 'moderate' | 'high' | null;
  executiveSummary: string | null;
  technicalView: { stance: TechnicalStance | null; summary: string } | null;
  fundamentalView: { summary: string } | null;
  newsFlow: { tone: NewsTone | null; summary: string } | null;
  positionView: string | null;
  actionPlan: string[];
  catalysts: string[];
  levels: ReviewLevels | null;
}

export interface ReviewNewsItem {
  title: string;
  url: string | null;
  publishedAt: string | null;
  sentiment: string | null;
  eventType: string | null;
}

export interface ReviewEvidence {
  companyName: string | null;
  holding: {
    quantity: number | null;
    averagePrice: number | null;
    lastPrice: number | null;
    invested: number | null;
    value: number | null;
    portfolioWeightPct: number | null;
  } | null;
  technical: {
    trend: Trend;
    rsi14: number | null;
    sma20: number | null;
    sma50: number | null;
    return20dPct: number | null;
    volumeRatio20: number | null;
    high20: number | null;
    low20: number | null;
    dailyBars: number | null;
    patternNotes: string[];
  } | null;
  news: ReviewNewsItem[];
  dataWarnings: string[];
}

export interface HoldingHistoryEntry {
  slot: number;
  at: string;
  status: string;
  action: ReviewAction | null;
}

export interface HoldingSummary {
  /** "NSE:RELIANCE" — the holding's id in this response. */
  key: string;
  exchange: string;
  symbol: string;
  companyName: string | null;
  /** The newest completed review — the verdict in force. */
  current: {
    id: string;
    at: string;
    asOf: string | null;
    action: ReviewAction;
    result: ReviewResult | null;
    evidence: ReviewEvidence | null;
  } | null;
  /** A newer review still collecting data or queued in the AI service. */
  inFlight: { status: string; at: string } | null;
  /** The newest review failed after the verdict in force. */
  lastFailure: { at: string; error: string | null } | null;
  lastChange: { from: ReviewAction; to: ReviewAction; at: string } | null;
  /** The last flip happened in the last 24 hours. */
  changed: boolean;
  /** Up to 24 recent reviews, newest first. */
  history: HoldingHistoryEntry[];
  /**
   * The equity books that hold it now, Groww first — a stock held in both is ONE review of the
   * combined position. Empty from a server that does not say (it then reviewed Groww only).
   */
  brokers: ReviewBroker[];
}

/** The equity books the portfolio review covers. */
export type ReviewBroker = 'groww' | 'mstock';

/** One book's read on this request. */
export interface ReviewBookStatus {
  broker: ReviewBroker;
  label: string;
  /** `error`: connected, but the read failed just now — its holdings keep their last reviews. */
  state: 'ok' | 'not-connected' | 'error';
  error: string | null;
  /** Holdings in the book now; null unless it was read. */
  holdings: number | null;
  asOf: string | null;
}

export interface ReviewCounts {
  holdings: number;
  withVerdict: number;
  byAction: Record<ReviewAction, number>;
  changed: number;
  inFlight: number;
  failed: number;
  adequateEvidencePct: number | null;
  latestAt: string | null;
}

export interface PortfolioReview {
  enabled: boolean;
  lastError: string | null;
  ready: boolean;
  readinessReason: string | null;
  cadenceMinutes: number | null;
  broker: string | null;
  /** Each book the review covers and how its read went; null from an older (Groww-only) server. */
  books: ReviewBookStatus[] | null;
  /** The oldest book's read time — the review is only as fresh as its stalest input. */
  portfolioAsOf: string | null;
  /** A book answered from its last snapshot rather than a fresh read. */
  portfolioStale: boolean;
  /** Every failed book read, in the server's words. */
  portfolioError: string | null;
  windowDays: number | null;
  /** A review still queued after this long is cancelled and failed. */
  pendingDeadlineMinutes: number | null;
  holdings: HoldingSummary[];
  counts: ReviewCounts;
  note: string | null;
}

/** POST /portfolio/holding-reviews/run. */
export interface ReviewRunResult {
  submitted: number;
  skipped: number;
  failed: number;
  reason: string | null;
}

/* ───────────────────────── web research ───────────────────────── */

export type JobStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
export type ResearchDepth = 'quick' | 'standard' | 'deep';
export type ResearchTimeRange = 'day' | 'week' | 'month' | 'year';

/** Who asked: an IPO report, a person on the Web research screen, or another API client. */
export interface Requester {
  kind: 'ipo' | 'manual' | 'api';
  label: string;
  detail: string | null;
  /** A WEB path (see lib/links.ts). */
  to: string | null;
}

export interface ResearchItem {
  jobId: string;
  status: string;
  query: string;
  depth: string | null;
  summary: string | null;
  findings: number | null;
  sources: number | null;
  createdAt: string | null;
  completedAt: string | null;
  requester: Requester;
}

export interface ResearchStats {
  runs: number;
  completed: number;
  running: number;
  failed: number;
  medianDurationMs: number | null;
  avgFindings: number | null;
  avgSources: number | null;
}

export interface ResearchPage {
  /** False when the server has no AI-service connection configured (the list is then empty). */
  ready: boolean;
  items: ResearchItem[];
  stats: ResearchStats;
  /** Cursor for the next (older) page; null on the last one. */
  nextBefore: string | null;
}

export interface SourceRef {
  ref: string;
  url: string;
  title: string | null;
  domain: string;
}

export interface ResearchFinding {
  claim: string;
  /** After verification — never higher than the evidence supports. */
  confidence: Confidence;
  /** What the model said before verification. */
  modelConfidence: Confidence | null;
  /** Distinct source domains supporting it. */
  corroboration: number | null;
  /** Numbers in the claim no cited page states. */
  unverifiedNumbers: string[];
  sources: SourceRef[];
}

export interface ResearchSource extends SourceRef {
  publishedAt: string | null;
  /** 0–100 heuristic. */
  credibility: number | null;
  cited: boolean;
  excerpt: string | null;
}

export interface ResearchRunStats {
  modelTurns: number | null;
  searches: number | null;
  pagesFetched: number | null;
  pagesFailed: number | null;
  durationMs: number | null;
  model: string | null;
  forcedFinish: boolean;
}

export interface ResearchResult {
  answer: string | null;
  summary: string | null;
  keyFindings: ResearchFinding[];
  rejectedClaims: { claim: string; reason: string | null }[];
  sources: ResearchSource[];
  openQuestions: string[];
  stats: ResearchRunStats | null;
  generatedAt: string | null;
}

export interface ResearchDetail {
  jobId: string;
  query: string;
  status: string;
  progress: { stage: string | null; percent: number | null; message: string | null } | null;
  error: { code: string | null; message: string | null } | null;
  result: ResearchResult | null;
  /** The pages read so far (without their text). */
  sources: ResearchSource[];
  requester: Requester;
}

export interface ResearchRequest {
  query: string;
  depth: ResearchDepth;
  timeRange?: ResearchTimeRange;
  instructions?: string;
}

/* ───────────────────────── the hub ───────────────────────── */

export type AgentKey = 'index-trading' | 'portfolio' | 'web-research';
export type RunOutcome = 'ordered' | 'hold' | 'error' | 'running';

/** The index bot's latest scan, as the hub needs it. */
export interface IndexRunBrief {
  at: string;
  outcome: RunOutcome;
  reason: string;
  action: 'BUY_CALL' | 'BUY_PUT' | 'HOLD' | null;
  underlying: string | null;
}

export interface IndexTradingSummary {
  enabled: boolean;
  mode: 'paper' | 'live';
  cadenceMinutes: number | null;
  today: { entries: number; net: number | null };
  month: { closed: number; net: number | null; winRate: number | null };
  open: number;
  /** Entries whose outcome is uncertain — a person must check the book. */
  attention: number;
  scansToday: number;
  latestRun: IndexRunBrief | null;
}

export interface ResearchSummary {
  ready: boolean;
  error: string | null;
  stats: ResearchStats;
  latest: { query: string; status: string; at: string | null } | null;
}

export interface ActivityEvent {
  agent: AgentKey;
  at: string;
  title: string;
  detail: string | null;
  tone: AgentTone;
  /** A WEB path (see lib/links.ts). */
  to: string | null;
}

export interface AgentsSummary {
  admin: boolean;
  /** Admin-only; null for everyone else. */
  indexTrading: IndexTradingSummary | null;
  portfolio: { enabled: boolean; lastError: string | null; ready: boolean; counts: ReviewCounts };
  /** Admin-only; null for everyone else. */
  research: ResearchSummary | null;
  activity: ActivityEvent[];
}
