import type {
  CitedPoint,
  GmpPoint,
  IpoAnalytics,
  IpoIssueType,
  IpoListResult,
  IpoRecord,
  IpoReports,
  IpoReportStatus,
  IpoReportSummary,
  IpoReportView,
  IpoResearchSummaries,
  IpoStatus,
  IpoValuation,
  PostListingContent,
  PreListingContent,
  ReportBase,
  ReportEligibility,
  ReportEvidence,
  ReportFactor,
  TradePlan,
  VerifiedSubscription,
} from '../types';

/**
 * Every /ipo payload is parsed once here into a shape where every field exists — arrays are
 * arrays, numbers are finite or null — so a gap in the scraped feed (or a report written by an
 * older server) can never throw mid-render. Rows without an id or a company name are dropped.
 */

type Json = Record<string, unknown>;

const obj = (value: unknown): Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Json) : {};
const isObj = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;
const str = (value: unknown): string => text(value) ?? '';
const strings = (value: unknown): string[] =>
  list(value).filter((item): item is string => typeof item === 'string' && item.trim() !== '');

export function num(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = Number(value.replace(/[₹,%xX\s]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

const STATUSES: readonly IpoStatus[] = ['upcoming', 'open', 'closed', 'listed'];
const REPORT_STATUSES: readonly IpoReportStatus[] = ['queued', 'running', 'ready', 'failed'];

function status(value: unknown): IpoStatus {
  const raw = text(value)?.toLowerCase() ?? '';
  return (STATUSES as readonly string[]).includes(raw) ? (raw as IpoStatus) : 'unknown';
}

function issueType(value: unknown): IpoIssueType {
  const raw = text(value)?.toLowerCase() ?? '';
  if (raw.includes('sme')) return 'sme';
  if (raw.includes('main')) return 'mainboard';
  return 'unknown';
}

function rating(value: unknown): number | null {
  const n = num(value);
  return n == null || n <= 0 ? null : Math.min(5, Math.max(1, Math.round(n)));
}

function bool(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function reportStatus(value: unknown): IpoReportStatus | null {
  const raw = text(value);
  return raw && (REPORT_STATUSES as readonly string[]).includes(raw)
    ? (raw as IpoReportStatus)
    : null;
}

export function reportSummary(value: unknown): IpoReportSummary | null {
  if (!isObj(value)) return null;
  const s = reportStatus(value.status);
  if (!s) return null;
  return {
    status: s,
    composite: num(value.composite),
    verdict: text(value.verdict),
    headline: text(value.headline),
    generatedAt: text(value.generatedAt),
  };
}

function research(value: unknown): IpoResearchSummaries | null {
  if (!isObj(value)) return null;
  const preListing = reportSummary(value.preListing);
  const postListing = reportSummary(value.postListing);
  return preListing || postListing ? { preListing, postListing } : null;
}

function oneOf<T extends string>(value: unknown, options: readonly T[]): T | null {
  return typeof value === 'string' && (options as readonly string[]).includes(value)
    ? (value as T)
    : null;
}

/**
 * The server's fair value, defensively: an unknown shape is null (the screens show nothing),
 * never a crash, and a "valued" record without both of its levels is shown as not valued.
 */
export function normalizeValuation(value: unknown): IpoValuation | null {
  if (!isObj(value)) return null;
  const state = oneOf(value.status, ['valued', 'not-valued'] as const);
  if (!state) return null;
  const vs = obj(value.versusListing);
  const vsPrice = num(vs.price);
  const vsUpside = num(vs.upsidePct);
  const vsKind = oneOf(vs.kind, ['listing', 'estimated'] as const);
  const vsZone = oneOf(vs.zone, ['below-good', 'between', 'above-fair'] as const);
  const source = obj(value.source);
  const sourceUrl = text(source.url);
  const fairValue = num(value.fairValue);
  const goodUpTo = num(value.goodUpTo);
  return {
    status: state === 'valued' && fairValue != null && goodUpTo != null ? 'valued' : 'not-valued',
    reason: text(value.reason),
    issuePrice: num(value.issuePrice),
    epsPost: num(value.epsPost),
    epsAnnualised: value.epsAnnualised === true,
    issuePe: num(value.issuePe),
    peerPe: num(value.peerPe),
    peerPb: num(value.peerPb),
    peerRonw: num(value.peerRonw),
    peersUsed: num(value.peersUsed) ?? 0,
    postIssueRonw: num(value.postIssueRonw),
    qualityFactor: num(value.qualityFactor),
    bookValuePost: num(value.bookValuePost),
    fairValuePe: num(value.fairValuePe),
    fairValuePb: num(value.fairValuePb),
    fairValue,
    goodUpTo,
    marginOfSafetyPct: num(value.marginOfSafetyPct) ?? 0,
    confidence: oneOf(value.confidence, ['high', 'medium', 'low'] as const),
    premiumToPeersPct: num(value.premiumToPeersPct),
    upsideFromIssuePct: num(value.upsideFromIssuePct),
    versusListing:
      vsPrice != null && vsPrice > 0 && vsUpside != null && vsKind && vsZone
        ? { price: vsPrice, kind: vsKind, upsidePct: vsUpside, zone: vsZone }
        : null,
    method: strings(value.method),
    caveats: strings(value.caveats),
    source: sourceUrl ? { url: sourceUrl, fetchedAt: text(source.fetchedAt) } : null,
    error: text(value.error),
  };
}

export function normalizeIpo(value: unknown): IpoRecord | null {
  if (!isObj(value)) return null;
  const id = text(value.id);
  const companyName = text(value.companyName);
  if (!id || !companyName) return null;
  const source = obj(value.source);
  return {
    id,
    companyName,
    issueType: issueType(value.issueType),
    status: status(value.status),
    exchange: text(value.exchange),
    openDate: text(value.openDate),
    closeDate: text(value.closeDate),
    allotmentDate: text(value.allotmentDate),
    listingDate: text(value.listingDate),
    priceMin: num(value.priceMin),
    priceMax: num(value.priceMax),
    lotSize: num(value.lotSize),
    issueSizeCrore: num(value.issueSizeCrore),
    logoUrl: text(value.logoUrl),
    rating: rating(value.rating),
    anchorAvailable: bool(value.anchorAvailable),
    gmp: num(value.gmp),
    gmpPercent: num(value.gmpPercent),
    estimatedListingPrice: num(value.estimatedListingPrice),
    totalSubscription: num(value.totalSubscription),
    sourceUrl: text(source.url),
    observedAt: text(source.observedAt) ?? text(value.updatedAt),
    research: research(value.research),
    valuation: normalizeValuation(value.valuation),
  };
}

function records(value: unknown): IpoRecord[] {
  return list(obj(value).items)
    .map(normalizeIpo)
    .filter((item): item is IpoRecord => item !== null);
}

export function normalizeIpoList(payload: unknown): IpoListResult {
  const raw = obj(payload);
  const items = records(raw);
  const counts = obj(raw.counts);
  return {
    items,
    counts: {
      all: num(counts.all) ?? items.length,
      open: num(counts.open),
      upcoming: num(counts.upcoming),
      closed: num(counts.closed),
      listed: num(counts.listed),
    },
    updatedAt: text(raw.updatedAt),
  };
}

export function normalizeLiveGmp(payload: unknown): IpoRecord[] {
  return records(payload);
}

export function normalizeGmpHistory(payload: unknown): GmpPoint[] {
  return list(obj(payload).history).flatMap((row) => {
    const point = obj(row);
    const observedAt = text(point.observedAt);
    return observedAt ? [{ observedAt, gmp: num(point.gmp) }] : [];
  });
}

export function normalizeAnalytics(payload: unknown): IpoAnalytics {
  const raw = obj(payload);
  const trend = text(raw.gmpTrend);
  return {
    demandLabel: text(raw.demandLabel),
    gmpTrend: trend === 'up' || trend === 'down' || trend === 'flat' ? trend : 'unknown',
    gmpChange: num(raw.gmpChange),
    estimatedGainPercent: num(raw.estimatedGainPercent),
    riskNotes: strings(raw.riskNotes),
  };
}

/* ───────────────────────── reports ───────────────────────── */

function cited(value: unknown): CitedPoint[] {
  return list(value).flatMap((item) => {
    const raw = obj(item);
    const point = text(raw.point);
    return point
      ? [
          {
            point,
            sources: list(raw.sources).filter((n): n is number => typeof n === 'number'),
          },
        ]
      : [];
  });
}

function factor(value: unknown): ReportFactor | null {
  const raw = obj(value);
  const key = text(raw.key);
  if (!key) return null;
  return {
    key,
    label: str(raw.label) || key,
    weight: num(raw.weight) ?? 0,
    score: num(raw.score),
    detail: str(raw.detail),
  };
}

function evidence(value: unknown): ReportEvidence | null {
  const raw = obj(value);
  const id = num(raw.id);
  const url = text(raw.url);
  if (id == null || !url) return null;
  const tier = text(raw.tier);
  const confidence = text(raw.confidence);
  return {
    id,
    title: str(raw.title) || url,
    url,
    domain: str(raw.domain),
    publisher: text(raw.publisher),
    publishedAt: text(raw.publishedAt),
    snippet: str(raw.snippet),
    tier:
      tier === 'exchange' ||
      tier === 'major-media' ||
      tier === 'ipo-data' ||
      tier === 'broker-research'
        ? tier
        : 'other',
    origin: raw.origin === 'agent' ? 'agent' : 'search',
    confidence:
      confidence === 'high' || confidence === 'medium' || confidence === 'low' ? confidence : null,
  };
}

function base(raw: Json): ReportBase | null {
  const quant = obj(raw.quant);
  const methodology = obj(raw.methodology);
  if (!isObj(raw.quant)) return null;
  const facts = obj(raw.facts);
  const band = obj(raw.band);
  const r = obj(raw.research);
  const agent = obj(r.agent);
  const agentStatus = text(agent.status);
  return {
    facts: {
      companyName: str(facts.companyName),
      issueType: facts.issueType === 'sme' ? 'sme' : 'mainboard',
      priceMax: num(facts.priceMax),
      lotSize: num(facts.lotSize),
      listingDate: text(facts.listingDate),
      estimatedListingPrice: num(facts.estimatedListingPrice),
    },
    band: {
      bandPct: num(band.bandPct),
      tradeForTrade: band.tradeForTrade === true,
      note: str(band.note),
    },
    quant: {
      score: num(quant.score),
      coverage: num(quant.coverage) ?? 0,
      factors: list(quant.factors)
        .map(factor)
        .filter((f): f is ReportFactor => f !== null),
    },
    analystScore: num(raw.analystScore),
    composite: num(raw.composite),
    evidence: list(raw.evidence)
      .map(evidence)
      .filter((e): e is ReportEvidence => e !== null),
    research: {
      searches: num(r.searches) ?? 0,
      failedSearches: num(r.failedSearches) ?? 0,
      results: num(r.results) ?? 0,
      kept: num(r.kept) ?? 0,
      searchError: text(r.searchError),
      agent: {
        status:
          agentStatus === 'used' ||
          agentStatus === 'skipped' ||
          agentStatus === 'failed' ||
          agentStatus === 'timeout'
            ? agentStatus
            : 'not-configured',
        findings: num(agent.findings) ?? 0,
        detail: text(agent.detail),
      },
    },
    aiError: text(raw.aiError),
    model: text(raw.model),
    provider: text(raw.provider),
    durationMs: num(raw.durationMs) ?? 0,
    methodology: {
      analystWeight: num(methodology.analystWeight) ?? 0,
      minCoverage: num(methodology.minCoverage) ?? 0,
      note: str(methodology.note),
    },
  };
}

function subscription(value: unknown): VerifiedSubscription | null {
  if (!isObj(value)) return null;
  return {
    qib: num(value.qib),
    nii: num(value.nii),
    retail: num(value.retail),
    employee: num(value.employee),
    total: num(value.total),
    verified: strings(value.verified),
    unverified: strings(value.unverified),
    stale: strings(value.stale),
  };
}

function preListing(value: unknown): PreListingContent | null {
  const raw = obj(value);
  const b = base(raw);
  if (!b) return null;
  const ai = isObj(raw.ai) ? raw.ai : null;
  const verdict = text(raw.verdict);
  return {
    ...b,
    kind: 'pre-listing',
    verdict:
      verdict === 'favourable' || verdict === 'mixed' || verdict === 'weak'
        ? verdict
        : 'insufficient',
    subscription: subscription(raw.subscription),
    ai: ai
      ? {
          headline: str(ai.headline),
          summary: str(ai.summary),
          business: str(ai.business),
          issueStructure: str(ai.issueStructure),
          financials: str(ai.financials),
          valuation: str(ai.valuation),
          valuationView: (['attractive', 'fair', 'stretched'] as const).includes(
            ai.valuationView as 'fair',
          )
            ? (ai.valuationView as 'attractive' | 'fair' | 'stretched')
            : 'unclear',
          demandRead: str(ai.demandRead),
          anchorRead: str(ai.anchorRead),
          greyMarketRead: str(ai.greyMarketRead),
          newsSentiment:
            ai.newsSentiment === 'Positive' || ai.newsSentiment === 'Negative'
              ? ai.newsSentiment
              : 'Neutral',
          newsRead: str(ai.newsRead),
          strengths: cited(ai.strengths),
          risks: cited(ai.risks),
          redFlags: cited(ai.redFlags),
          listingView: (['strong-premium', 'modest-premium', 'flat', 'discount'] as const).includes(
            ai.listingView as 'flat',
          )
            ? (ai.listingView as 'strong-premium' | 'modest-premium' | 'flat' | 'discount')
            : 'unclear',
          listingViewReason: str(ai.listingViewReason),
          afterListingPlaybook: str(ai.afterListingPlaybook),
          enterIf: strings(ai.enterIf),
          avoidIf: strings(ai.avoidIf),
          analystScore: num(ai.analystScore) ?? 0,
          confidence:
            ai.confidence === 'high' || ai.confidence === 'medium' ? ai.confidence : 'low',
          dataGaps: strings(ai.dataGaps),
        }
      : null,
  };
}

function plan(value: unknown): TradePlan | null {
  if (!isObj(value)) return null;
  const entryLow = num(value.entryLow);
  const entryHigh = num(value.entryHigh);
  const stop = num(value.stop);
  const target1 = num(value.target1);
  const target2 = num(value.target2);
  if (entryLow == null || entryHigh == null || stop == null || target1 == null || target2 == null)
    return null;
  const sizing = obj(value.sizing);
  const boundBy = text(sizing.boundBy);
  return {
    trigger: value.trigger === 'reclaim' ? 'reclaim' : 'pullback',
    entryLow,
    entryHigh,
    stop,
    stopBasis: value.stopBasis === 'max-risk' ? 'max-risk' : 'listing-day-low',
    target1,
    target2,
    riskPct: num(value.riskPct) ?? 0,
    timeStopSessions: num(value.timeStopSessions) ?? 0,
    sizing: {
      capital: num(sizing.capital) ?? 0,
      riskPct: num(sizing.riskPct) ?? 0,
      quantity: num(sizing.quantity) ?? 0,
      maxLoss: num(sizing.maxLoss) ?? 0,
      boundBy: boundBy === 'capital' || boundBy === 'lot' ? boundBy : 'risk',
    },
    notes: strings(value.notes),
  };
}

function postListing(value: unknown): PostListingContent | null {
  const raw = obj(value);
  const b = base(raw);
  if (!b) return null;
  const market = obj(raw.market);
  const listed = obj(market.listed);
  const quote = obj(market.quote);
  const circuit = obj(market.circuit);
  const ai = isObj(raw.ai) ? raw.ai : null;
  const verdict = text(raw.verdict);
  const listingSource = text(market.listingPriceSource);
  const listedSymbol = text(listed.symbol);
  return {
    ...b,
    kind: 'post-listing',
    verdict:
      verdict === 'favourable' || verdict === 'wait' || verdict === 'unfavourable'
        ? verdict
        : 'insufficient',
    plan: plan(raw.plan),
    market: {
      listed:
        listedSymbol && (listed.exchange === 'NSE' || listed.exchange === 'BSE')
          ? { exchange: listed.exchange, symbol: listedSymbol, name: str(listed.name) }
          : null,
      quote: isObj(market.quote)
        ? {
            ltp: num(quote.ltp),
            asOf: str(quote.asOf),
            provider: str(quote.provider),
          }
        : null,
      listingPrice: num(market.listingPrice),
      listingPriceSource:
        listingSource === 'broker' || listingSource === 'carried' || listingSource === 'reported'
          ? listingSource
          : null,
      expectedListingPrice: num(market.expectedListingPrice),
      circuit: {
        lockedUp: circuit.lockedUp === true,
        lockedDown: circuit.lockedDown === true,
        upperBand: num(circuit.upperBand),
        lowerBand: num(circuit.lowerBand),
      },
    },
    ai: ai
      ? {
          headline: str(ai.headline),
          summary: str(ai.summary),
          listingRead: str(ai.listingRead),
          priceActionRead: str(ai.priceActionRead),
          entryView:
            ai.entryView === 'favourable' || ai.entryView === 'unfavourable'
              ? ai.entryView
              : 'wait',
          entryReason: str(ai.entryReason),
          planCommentary: str(ai.planCommentary),
          enterIf: strings(ai.enterIf),
          exitIf: strings(ai.exitIf),
          weekPlan: strings(ai.weekPlan),
          risks: cited(ai.risks),
          analystScore: num(ai.analystScore) ?? 0,
          confidence:
            ai.confidence === 'high' || ai.confidence === 'medium' ? ai.confidence : 'low',
        }
      : null,
  };
}

function reportView<C>(
  value: unknown,
  kind: 'pre-listing' | 'post-listing',
  content: (raw: unknown) => C | null,
): IpoReportView<C> | null {
  if (!isObj(value)) return null;
  const s = reportStatus(value.status);
  if (!s) return null;
  const previous = isObj(value.previous) ? value.previous : null;
  return {
    kind,
    status: s,
    stage: text(value.stage),
    trigger: value.trigger === 'scheduled' ? 'scheduled' : 'manual',
    generatedAt: text(value.generatedAt),
    error: text(value.error),
    previous: previous
      ? {
          composite: num(previous.composite),
          verdict: str(previous.verdict),
          generatedAt: text(previous.generatedAt),
        }
      : null,
    content: content(value.content),
  };
}

function eligibility(value: unknown): ReportEligibility {
  const raw = obj(value);
  return { available: raw.available === true, reason: text(raw.reason) };
}

export function normalizeReports(payload: unknown): IpoReports {
  const raw = obj(payload);
  const elig = obj(raw.eligibility);
  const schedule = obj(raw.schedule);
  return {
    ipoId: str(raw.ipoId),
    preListing: reportView(raw.preListing, 'pre-listing', preListing),
    postListing: reportView(raw.postListing, 'post-listing', postListing),
    eligibility: {
      preListing: eligibility(elig.preListing),
      postListing: eligibility(elig.postListing),
    },
    schedule: {
      preListingDueBy: text(schedule.preListingDueBy),
      postListingFrom: text(schedule.postListingFrom),
      schedulerEnabled: schedule.schedulerEnabled === true,
    },
    agentConfigured: raw.agentConfigured === true,
  };
}
