// Response shapes of /market/daily-brief (stocks-advisory-platform/server/src/modules/daily-brief,
// daily-brief.service.ts buildBrief). Historical briefs are stored snapshots and can predate
// fields added later, so every payload goes through lib/normalize.ts before a screen reads it.

export type DailyBriefRiskProfile = 'conservative' | 'moderate' | 'aggressive';

export type DailyBriefSection =
  | 'summary'
  | 'outlook'
  | 'indices'
  | 'ipo'
  | 'breadth'
  | 'sectors'
  | 'movers'
  | 'derivatives'
  | 'portfolio'
  | 'watchlist'
  | 'technical'
  | 'attention'
  | 'news'
  | 'calendar';

export type MarketStatus = 'PRE_MARKET' | 'OPEN' | 'CLOSED';

export interface DataMeta {
  source: string;
  timestamp: string | null;
  isDelayed: boolean;
  availability: 'live' | 'cached' | 'unavailable';
  message?: string;
}

export interface BriefIndex {
  exchange: string;
  symbol: string;
  /** What the app shows — `label ?? symbol`, resolved once in normalize. */
  name: string;
  ltp: number | null;
  change: number | null;
  changePct: number | null;
  meta: DataMeta;
}

export interface BriefMover {
  symbol: string;
  companyName: string | null;
  exchange: string;
  ltp: number | null;
  changePct: number | null;
  volume: number | null;
}

export interface BriefSector {
  name: string;
  changePct: number;
  advances: number;
  declines: number;
  breadthPct: number | null;
  strength: string;
}

export interface BriefBreadth {
  advances: number;
  declines: number;
  unchanged: number;
  unavailable: number;
  ratio: number | null;
  meta: DataMeta;
}

export interface BriefSentiment {
  score: number | null;
  label: string;
  breadthRatio: number | null;
  factors: { label: string; value: string }[];
  caveat: string;
}

export interface BriefDerivatives {
  available: boolean;
  underlying: string | null;
  expiry: string | null;
  spot: number | null;
  spotSource: string | null;
  atmStrike: number | null;
  /** Put premium ÷ call premium across the window — not an open-interest PCR. */
  premiumRatio: number | null;
  futuresBasis: number | null;
  caveats: string[];
  meta: DataMeta;
}

export type TechnicalAction = 'BUY' | 'SELL' | 'WATCH';

export interface TechnicalSignal {
  id: string;
  symbol: string;
  exchange: string;
  screenerName: string;
  action: TechnicalAction;
  conviction: number | null;
  rationale: string;
  invalidation: string | null;
  hitRatePct: number | null;
  sampleTrades: number | null;
  avgReturnPct: number | null;
  holdDays: number | null;
}

export interface BriefTechnicalRadar {
  available: boolean;
  signals: TechnicalSignal[];
  meta: DataMeta;
}

export interface BriefPortfolio {
  available: boolean;
  value: number | null;
  todayPnl: number | null;
  todayPct: number | null;
  unrealizedPnl: number | null;
  contributors: {
    symbol: string;
    exchange: string;
    contribution: number;
    changePct: number | null;
  }[];
  meta: DataMeta;
}

export interface WatchlistAttention {
  symbol: string;
  exchange: string;
  watchlist: string;
  changePct: number | null;
  note: string | null;
}

export interface BriefWatchlist {
  available: boolean;
  listCount: number | null;
  stockCount: number | null;
  advancing: number | null;
  declining: number | null;
  averageChangePct: number | null;
  attention: WatchlistAttention[];
  meta: DataMeta;
}

export interface BriefNewsItem {
  id: string;
  title: string;
  source: string;
  link: string | null;
  publishedAt: string | null;
  sentiment: string | null;
  effectivenessScore: number | null;
  symbol: string | null;
  analysisAvailable: boolean;
}

export interface AttentionItem {
  symbol: string | null;
  title: string;
  whatHappened: string;
  whyItMatters: string;
  risk: string;
}

export interface BriefAi {
  marketBias: string;
  conviction: number | null;
  summary: string;
  supportingFactors: { factor: string; explanation: string }[];
  riskFactors: string[];
  attention: AttentionItem[];
  provider: string;
  model: string;
  caveat: string;
}

export interface DailyBrief {
  date: string;
  generatedAt: string | null;
  marketStatus: MarketStatus;
  title: string;
  riskProfile: DailyBriefRiskProfile;
  stale: boolean;
  partialFailures: string[];
  unavailableSources: { key: string; label: string; reason: string }[];
  summary: { bias: string; text: string; source: 'calculated' | 'ai-with-evidence' };
  sentiment: BriefSentiment;
  indices: BriefIndex[];
  breadth: BriefBreadth;
  sectors: BriefSector[];
  movers: { gainers: BriefMover[]; losers: BriefMover[]; volume: BriefMover[] };
  /** The server's note on how the volume leaders were ranked (from `unusualActivity`). */
  volumeNote: string | null;
  derivatives: BriefDerivatives;
  technicalRadar: BriefTechnicalRadar;
  portfolio: BriefPortfolio;
  watchlist: BriefWatchlist;
  news: BriefNewsItem[];
  /** IPOs listing on the brief's date — empty on most days, and on briefs stored before it existed. */
  ipoListings: { available: boolean; items: BriefIpoListing[] };
  ai: BriefAi | null;
  aiStatus: 'ready' | 'not-generated' | 'unavailable';
  aiStale: boolean;
}

/** A research report's headline numbers (server ipo-report.summary.ts). */
export interface BriefIpoReport {
  status: 'queued' | 'running' | 'ready' | 'failed';
  composite: number | null;
  verdict: string | null;
  headline: string | null;
  generatedAt: string | null;
}

/** An IPO listing on the brief's date (server ipo-report.service.ts ipoListingsOn). */
export interface BriefIpoListing {
  id: string;
  companyName: string;
  issueType: 'mainboard' | 'sme';
  exchange: string | null;
  issuePrice: number | null;
  gmpPercent: number | null;
  estimatedListingPrice: number | null;
  totalSubscription: number | null;
  preListing: BriefIpoReport | null;
  postListing: BriefIpoReport | null;
}

export interface DailyBriefPreferences {
  riskProfile: DailyBriefRiskProfile;
  audioEnabled: boolean;
  visibleSections: DailyBriefSection[];
  sectionOrder: DailyBriefSection[];
  preferredIndices: string[];
  preferredSectors: string[];
}

export interface DailyBriefAudio {
  date: string;
  version: string;
  transcript: string;
}
