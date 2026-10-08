// Response shapes of /ipo (stocks-advisory-platform/server/src/modules/ipo: ipo.service.ts
// serializeIpo, ipo-report.service.ts getIpoReports). The board is fed by a scraped source
// (InvestorGain), so list and detail rows go through lib/normalize.ts before a screen reads them.

export type IpoStatus = 'upcoming' | 'open' | 'closed' | 'listed' | 'unknown';
export type IpoIssueType = 'mainboard' | 'sme' | 'unknown';
/** The board's status filters. "Listed" is listing TODAY: an IPO leaves the board the next day. */
export type IpoListFilter = 'all' | 'open' | 'upcoming' | 'closed' | 'listed';

export type IpoReportKind = 'pre-listing' | 'post-listing';
export type IpoReportStatus = 'queued' | 'running' | 'ready' | 'failed';

/** A report's headline numbers, carried on list rows and the daily brief. */
export interface IpoReportSummary {
  status: IpoReportStatus;
  composite: number | null;
  verdict: string | null;
  headline: string | null;
  generatedAt: string | null;
}

export interface IpoResearchSummaries {
  preListing: IpoReportSummary | null;
  postListing: IpoReportSummary | null;
}

export interface IpoRecord {
  id: string;
  companyName: string;
  issueType: IpoIssueType;
  status: IpoStatus;
  exchange: string | null;
  openDate: string | null;
  closeDate: string | null;
  allotmentDate: string | null;
  listingDate: string | null;
  priceMin: number | null;
  priceMax: number | null;
  lotSize: number | null;
  issueSizeCrore: number | null;
  logoUrl: string | null;
  /** Whole stars, 1–5; null when unrated. */
  rating: number | null;
  anchorAvailable: boolean | null;
  /** Grey-market premium in ₹ per share — unofficial. */
  gmp: number | null;
  gmpPercent: number | null;
  estimatedListingPrice: number | null;
  /** Times subscribed, all categories. */
  totalSubscription: number | null;
  sourceUrl: string | null;
  observedAt: string | null;
  research: IpoResearchSummaries | null;
  /**
   * Fair value from the offer document against its listed peers (server:
   * ipo-valuation.rules.ts); null from a server that predates it.
   */
  valuation: IpoValuation | null;
}

/* ───────────────────────── fair value ───────────────────────── */

export type ValuationZone = 'below-good' | 'between' | 'above-fair';
export type ValuationConfidence = 'high' | 'medium' | 'low';

/** Where the listing price (or, before listing, the grey-market estimate) sits against fair value. */
export interface VersusListing {
  price: number;
  kind: 'listing' | 'estimated';
  /** Fair value against that price, percent. */
  upsidePct: number;
  zone: ValuationZone;
}

/**
 * A model estimate from published figures, not advice. `valued` always carries both levels (the
 * normalizer downgrades a record without them); `not-valued` carries the `reason`.
 */
export interface IpoValuation {
  status: 'valued' | 'not-valued';
  reason: string | null;
  issuePrice: number | null;
  epsPost: number | null;
  epsAnnualised: boolean;
  issuePe: number | null;
  peerPe: number | null;
  peerPb: number | null;
  peerRonw: number | null;
  /** Peers whose P/E went into the median. */
  peersUsed: number;
  postIssueRonw: number | null;
  qualityFactor: number | null;
  bookValuePost: number | null;
  fairValuePe: number | null;
  fairValuePb: number | null;
  fairValue: number | null;
  /** Fair value less the margin of safety (15% mainboard, 25% SME). */
  goodUpTo: number | null;
  marginOfSafetyPct: number;
  confidence: ValuationConfidence | null;
  /** Issue P/E against the peers' median: +60 = priced 60% above them. */
  premiumToPeersPct: number | null;
  /** Fair value against the issue price, percent. */
  upsideFromIssuePct: number | null;
  versusListing: VersusListing | null;
  /** Every step of the arithmetic, in words. */
  method: string[];
  /** Figures checked and set aside or replaced, and why. */
  caveats: string[];
  source: { url: string; fetchedAt: string | null } | null;
  /** Why the offer document could not be read, when it could not. */
  error: string | null;
}

export interface IpoCounts {
  all: number;
  open: number | null;
  upcoming: number | null;
  closed: number | null;
  listed: number | null;
}

export interface IpoListResult {
  items: IpoRecord[];
  counts: IpoCounts;
  updatedAt: string | null;
}

export interface GmpPoint {
  observedAt: string;
  gmp: number | null;
}

export interface IpoAnalytics {
  demandLabel: string | null;
  gmpTrend: 'up' | 'down' | 'flat' | 'unknown';
  gmpChange: number | null;
  estimatedGainPercent: number | null;
  riskNotes: string[];
}

/* ───────────────────────── research reports ───────────────────────── */

export type SetupVerdict = 'favourable' | 'mixed' | 'weak' | 'insufficient';
export type EntryVerdict = 'favourable' | 'wait' | 'unfavourable' | 'insufficient';
export type Confidence = 'high' | 'medium' | 'low';

export interface ReportFactor {
  key: string;
  label: string;
  /** 0–1. */
  weight: number;
  /** 0–100; null when the input could not be measured. */
  score: number | null;
  detail: string;
}

export interface ReportEvidence {
  id: number;
  title: string;
  url: string;
  domain: string;
  publisher: string | null;
  publishedAt: string | null;
  snippet: string;
  tier: 'exchange' | 'major-media' | 'ipo-data' | 'broker-research' | 'other';
  origin: 'search' | 'agent';
  confidence?: Confidence | null;
}

export interface CitedPoint {
  point: string;
  sources: number[];
}

export interface ReportBase {
  facts: {
    companyName: string;
    issueType: 'mainboard' | 'sme';
    priceMax: number | null;
    lotSize: number | null;
    listingDate: string | null;
    estimatedListingPrice: number | null;
  };
  band: { bandPct: number | null; tradeForTrade: boolean; note: string };
  quant: { score: number | null; coverage: number; factors: ReportFactor[] };
  analystScore: number | null;
  composite: number | null;
  evidence: ReportEvidence[];
  research: {
    searches: number;
    failedSearches: number;
    results: number;
    kept: number;
    searchError: string | null;
    agent: {
      status: 'used' | 'not-configured' | 'skipped' | 'failed' | 'timeout';
      findings: number;
      detail: string | null;
    };
  };
  aiError: string | null;
  model: string | null;
  provider: string | null;
  durationMs: number;
  methodology: { analystWeight: number; minCoverage: number; note: string };
}

export interface VerifiedSubscription {
  qib: number | null;
  nii: number | null;
  retail: number | null;
  employee: number | null;
  total: number | null;
  verified: string[];
  unverified: string[];
  stale?: string[];
}

export interface PreListingAi {
  headline: string;
  summary: string;
  business: string;
  issueStructure: string;
  financials: string;
  valuation: string;
  valuationView: 'attractive' | 'fair' | 'stretched' | 'unclear';
  demandRead: string;
  anchorRead: string;
  greyMarketRead: string;
  newsSentiment: 'Positive' | 'Neutral' | 'Negative';
  newsRead: string;
  strengths: CitedPoint[];
  risks: CitedPoint[];
  redFlags: CitedPoint[];
  listingView: 'strong-premium' | 'modest-premium' | 'flat' | 'discount' | 'unclear';
  listingViewReason: string;
  afterListingPlaybook: string;
  enterIf: string[];
  avoidIf: string[];
  analystScore: number;
  confidence: Confidence;
  dataGaps: string[];
}

export interface PreListingContent extends ReportBase {
  kind: 'pre-listing';
  verdict: SetupVerdict;
  subscription: VerifiedSubscription | null;
  ai: PreListingAi | null;
}

export interface TradePlan {
  trigger: 'pullback' | 'reclaim';
  entryLow: number;
  entryHigh: number;
  stop: number;
  stopBasis: 'listing-day-low' | 'max-risk';
  target1: number;
  target2: number;
  riskPct: number;
  timeStopSessions: number;
  sizing: {
    capital: number;
    riskPct: number;
    quantity: number;
    maxLoss: number;
    boundBy: 'risk' | 'capital' | 'lot';
  };
  notes: string[];
}

export interface PostListingMarket {
  listed: { exchange: 'NSE' | 'BSE'; symbol: string; name: string } | null;
  quote: { ltp: number | null; asOf: string; provider: string } | null;
  listingPrice: number | null;
  listingPriceSource: 'broker' | 'carried' | 'reported' | null;
  expectedListingPrice: number | null;
  circuit: {
    lockedUp: boolean;
    lockedDown: boolean;
    upperBand: number | null;
    lowerBand: number | null;
  };
}

export interface PostListingAi {
  headline: string;
  summary: string;
  listingRead: string;
  priceActionRead: string;
  entryView: 'favourable' | 'wait' | 'unfavourable';
  entryReason: string;
  planCommentary: string;
  enterIf: string[];
  exitIf: string[];
  weekPlan: string[];
  risks: CitedPoint[];
  analystScore: number;
  confidence: Confidence;
}

export interface PostListingContent extends ReportBase {
  kind: 'post-listing';
  verdict: EntryVerdict;
  plan: TradePlan | null;
  market: PostListingMarket;
  ai: PostListingAi | null;
}

export interface IpoReportView<C> {
  kind: IpoReportKind;
  status: IpoReportStatus;
  /** What a running report is doing: searching → deep-research → market → writing. */
  stage: string | null;
  trigger: 'scheduled' | 'manual';
  generatedAt: string | null;
  error: string | null;
  previous: { composite: number | null; verdict: string; generatedAt: string | null } | null;
  /** A report being refreshed keeps its previous content until the new one is ready. */
  content: C | null;
}

export interface ReportEligibility {
  available: boolean;
  reason: string | null;
}

export interface IpoReports {
  ipoId: string;
  preListing: IpoReportView<PreListingContent> | null;
  postListing: IpoReportView<PostListingContent> | null;
  eligibility: { preListing: ReportEligibility; postListing: ReportEligibility };
  schedule: {
    preListingDueBy: string | null;
    postListingFrom: string | null;
    schedulerEnabled: boolean;
  };
  agentConfigured: boolean;
}

export interface ReportRequestResult {
  queued: boolean;
  reason: 'in-progress' | 'fresh' | null;
}
