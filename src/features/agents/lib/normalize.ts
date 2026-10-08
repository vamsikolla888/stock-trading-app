import type {
  ActivityEvent,
  AgentKey,
  AgentsSummary,
  AgentTone,
  Confidence,
  EvidenceQuality,
  HoldingHistoryEntry,
  HoldingSummary,
  IndexRunBrief,
  IndexTradingSummary,
  NewsTone,
  PortfolioReview,
  Requester,
  ResearchDetail,
  ResearchFinding,
  ResearchItem,
  ResearchPage,
  ResearchResult,
  ResearchRunStats,
  ResearchSource,
  ResearchStats,
  ResearchSummary,
  ReviewAction,
  ReviewBookStatus,
  ReviewBroker,
  ReviewCounts,
  ReviewEvidence,
  ReviewLevels,
  ReviewResult,
  ReviewRunResult,
  RunOutcome,
  SourceRef,
  TechnicalStance,
  Trend,
} from '../types';

/**
 * Every /agents payload is parsed once here into a shape where every field exists, so a server a
 * version behind (no analyst note on older reviews, no `pendingDeadlineMinutes`, a research row
 * without a requester) or an ai-service answer in an unexpected shape never throws mid-render.
 * Rows without an identity (a holding without a symbol, a run without a job id) are dropped.
 */

type Json = Record<string, unknown>;

const isObj = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const obj = (value: unknown): Json => (isObj(value) ? value : {});
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;
const strings = (value: unknown): string[] =>
  list(value)
    .map((item) => text(item))
    .filter((item): item is string => item !== null);
const num = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;
const count = (value: unknown): number => {
  const n = num(value);
  return n !== null && n > 0 ? Math.round(n) : 0;
};
const bool = (value: unknown): boolean => value === true;

function oneOf<T extends string>(value: unknown, options: readonly T[]): T | null {
  return typeof value === 'string' && (options as readonly string[]).includes(value)
    ? (value as T)
    : null;
}

/** An http(s) link, or null — a page link is only ever opened when it is one. */
export function webUrl(value: unknown): string | null {
  const raw = text(value);
  return raw && /^https?:\/\//i.test(raw) ? raw : null;
}

export const REVIEW_ACTIONS: readonly ReviewAction[] = [
  'CONSIDER_ADD',
  'HOLD',
  'CONSIDER_SELL',
  'NEEDS_REVIEW',
];
const CONFIDENCES: readonly Confidence[] = ['high', 'medium', 'low'];
const TONES: readonly AgentTone[] = ['ok', 'warn', 'err', 'run', 'idle'];
const AGENTS: readonly AgentKey[] = ['index-trading', 'portfolio', 'web-research'];

const action = (value: unknown) => oneOf(value, REVIEW_ACTIONS);
const confidence = (value: unknown) => oneOf(value, CONFIDENCES);

/* ───────────────────────── portfolio review ───────────────────────── */

function levels(value: unknown): ReviewLevels | null {
  if (!isObj(value)) return null;
  return {
    lastPrice: num(value.lastPrice),
    averagePrice: num(value.averagePrice),
    support: num(value.support),
    resistance: num(value.resistance),
    sma20: num(value.sma20),
    sma50: num(value.sma50),
  };
}

/** One saved review result; null when it carries no verdict. */
export function normalizeReviewResult(value: unknown): ReviewResult | null {
  if (!isObj(value)) return null;
  const verdict = action(value.action);
  if (!verdict) return null;
  const research = obj(value.research);
  const technical = obj(value.technicalView);
  const fundamental = obj(value.fundamentalView);
  const news = obj(value.newsFlow);
  const technicalSummary = text(technical.summary);
  const fundamentalSummary = text(fundamental.summary);
  const newsSummary = text(news.summary);
  return {
    action: verdict,
    thesis: text(value.thesis),
    bullCase: strings(value.bullCase),
    bearCase: strings(value.bearCase),
    whatWouldChangeMind: strings(value.whatWouldChangeMind),
    riskNotes: strings(value.riskNotes),
    horizon: text(value.horizon),
    evidenceQuality: oneOf<EvidenceQuality>(value.evidenceQuality, [
      'adequate',
      'limited',
      'unavailable',
    ]),
    research: {
      summary: text(research.summary),
      sources: list(research.sources).flatMap((row) => {
        const source = obj(row);
        const url = webUrl(source.url);
        return url
          ? [{ url, title: text(source.title), publishedAt: text(source.publishedAt) }]
          : [];
      }),
      findings: list(research.findings).flatMap((row) => {
        const finding = obj(row);
        const claim = text(finding.claim);
        return claim
          ? [
              {
                claim,
                confidence: confidence(finding.confidence) ?? 'low',
                urls: list(finding.urls)
                  .map(webUrl)
                  .filter((u): u is string => u !== null),
              },
            ]
          : [];
      }),
      openQuestions: strings(research.openQuestions),
    },
    limitations: strings(value.limitations),
    conviction: confidence(value.conviction),
    riskLevel: oneOf(value.riskLevel, ['low', 'moderate', 'high'] as const),
    executiveSummary: text(value.executiveSummary),
    technicalView: technicalSummary
      ? {
          stance: oneOf<TechnicalStance>(technical.stance, ['bullish', 'neutral', 'bearish']),
          summary: technicalSummary,
        }
      : null,
    fundamentalView: fundamentalSummary ? { summary: fundamentalSummary } : null,
    newsFlow: newsSummary
      ? {
          tone: oneOf<NewsTone>(news.tone, ['positive', 'neutral', 'negative', 'mixed']),
          summary: newsSummary,
        }
      : null,
    positionView: text(value.positionView),
    actionPlan: strings(value.actionPlan),
    catalysts: strings(value.catalysts),
    levels: levels(value.levels),
  };
}

/** The evidence packet a review was written from; null when the review has none. */
export function normalizeEvidence(value: unknown): ReviewEvidence | null {
  if (!isObj(value)) return null;
  const holding = isObj(value.holding) ? value.holding : null;
  const technical = isObj(value.technical) ? value.technical : null;
  return {
    companyName: text(value.companyName),
    holding: holding
      ? {
          quantity: num(holding.quantity),
          averagePrice: num(holding.averagePrice),
          lastPrice: num(holding.lastPrice),
          invested: num(holding.invested),
          value: num(holding.value),
          portfolioWeightPct: num(holding.portfolioWeightPct),
        }
      : null,
    technical: technical
      ? {
          trend: oneOf<Trend>(technical.trend, ['up', 'down', 'mixed', 'unknown']) ?? 'unknown',
          rsi14: num(technical.rsi14),
          sma20: num(technical.sma20),
          sma50: num(technical.sma50),
          return20dPct: num(technical.return20dPct),
          volumeRatio20: num(technical.volumeRatio20),
          high20: num(technical.high20),
          low20: num(technical.low20),
          dailyBars: num(technical.dailyBars),
          patternNotes: strings(technical.patternNotes),
        }
      : null,
    news: list(value.news).flatMap((row) => {
      const item = obj(row);
      const title = text(item.title);
      return title
        ? [
            {
              title,
              url: webUrl(item.url),
              publishedAt: text(item.publishedAt),
              sentiment: text(item.sentiment),
              eventType: text(item.eventType),
            },
          ]
        : [];
    }),
    dataWarnings: strings(value.dataWarnings),
  };
}

function history(value: unknown): HoldingHistoryEntry[] {
  return list(value).flatMap((row) => {
    const entry = obj(row);
    const at = text(entry.at);
    if (!at) return [];
    return [
      {
        slot: num(entry.slot) ?? 0,
        at,
        status: text(entry.status) ?? 'UNKNOWN',
        action: action(entry.action),
      },
    ];
  });
}

export function normalizeHolding(value: unknown): HoldingSummary | null {
  if (!isObj(value)) return null;
  const symbol = text(value.symbol);
  if (!symbol) return null;
  const exchange = text(value.exchange) ?? 'NSE';
  const current = obj(value.current);
  const currentAction = action(current.action);
  const currentAt = text(current.at);
  const inFlight = obj(value.inFlight);
  const failure = obj(value.lastFailure);
  const change = obj(value.lastChange);
  const from = action(change.from);
  const to = action(change.to);
  const changeAt = text(change.at);
  const evidence = currentAction ? normalizeEvidence(current.evidence) : null;
  return {
    key: text(value.key) ?? `${exchange}:${symbol}`,
    exchange,
    symbol,
    companyName: text(value.companyName) ?? evidence?.companyName ?? null,
    current:
      currentAction && currentAt
        ? {
            id: text(current.id) ?? currentAt,
            at: currentAt,
            asOf: text(current.asOf),
            action: currentAction,
            result: normalizeReviewResult(current.result),
            evidence,
          }
        : null,
    inFlight: text(inFlight.at)
      ? { status: text(inFlight.status) ?? 'PENDING', at: text(inFlight.at) ?? '' }
      : null,
    lastFailure: text(failure.at)
      ? { at: text(failure.at) ?? '', error: text(failure.error) }
      : null,
    lastChange: from && to && changeAt ? { from, to, at: changeAt } : null,
    changed: bool(value.changed),
    history: history(value.history),
    brokers: brokers(value.brokers),
  };
}

const BROKERS: readonly ReviewBroker[] = ['groww', 'mstock'];
const BOOK_STATES = ['ok', 'not-connected', 'error'] as const;

/** Known books only, each once, Groww first (the server's REVIEW_BOOK_ORDER). */
function brokers(value: unknown): ReviewBroker[] {
  const named = new Set(list(value).map((b) => (typeof b === 'string' ? b.toLowerCase() : null)));
  return BROKERS.filter((b) => named.has(b));
}

export function normalizeBook(value: unknown): ReviewBookStatus | null {
  if (!isObj(value)) return null;
  const broker = oneOf(
    typeof value.broker === 'string' ? value.broker.toLowerCase() : null,
    BROKERS,
  );
  if (!broker) return null;
  const state = oneOf(value.state, BOOK_STATES) ?? 'error';
  return {
    broker,
    label: text(value.label) ?? (broker === 'groww' ? 'Groww' : 'mStock'),
    state,
    error: text(value.error),
    holdings: state === 'ok' ? num(value.holdings) : null,
    asOf: text(value.asOf),
  };
}

/** The headline counts, computed the server's way — used when the server sent none. */
export function countsOf(holdings: readonly HoldingSummary[]): ReviewCounts {
  const byAction: Record<ReviewAction, number> = {
    CONSIDER_ADD: 0,
    HOLD: 0,
    CONSIDER_SELL: 0,
    NEEDS_REVIEW: 0,
  };
  let withVerdict = 0;
  let adequate = 0;
  let latestAt: string | null = null;
  for (const holding of holdings) {
    if (!holding.current) continue;
    withVerdict++;
    byAction[holding.current.action]++;
    if (holding.current.result?.evidenceQuality === 'adequate') adequate++;
    if (!latestAt || holding.current.at > latestAt) latestAt = holding.current.at;
  }
  return {
    holdings: holdings.length,
    withVerdict,
    byAction,
    changed: holdings.filter((h) => h.changed).length,
    inFlight: holdings.filter((h) => h.inFlight).length,
    failed: holdings.filter((h) => h.lastFailure).length,
    adequateEvidencePct: withVerdict ? Math.round((adequate / withVerdict) * 10_000) / 100 : null,
    latestAt,
  };
}

export function normalizeCounts(value: unknown, fallback: ReviewCounts): ReviewCounts {
  if (!isObj(value)) return fallback;
  const byAction = obj(value.byAction);
  return {
    holdings: count(value.holdings),
    withVerdict: count(value.withVerdict),
    byAction: {
      CONSIDER_ADD: count(byAction.CONSIDER_ADD),
      HOLD: count(byAction.HOLD),
      CONSIDER_SELL: count(byAction.CONSIDER_SELL),
      NEEDS_REVIEW: count(byAction.NEEDS_REVIEW),
    },
    changed: count(value.changed),
    inFlight: count(value.inFlight),
    failed: count(value.failed),
    adequateEvidencePct: num(value.adequateEvidencePct),
    latestAt: text(value.latestAt),
  };
}

export function normalizePortfolioReview(value: unknown): PortfolioReview {
  const data = obj(value);
  const settings = obj(data.settings);
  const holdings = list(data.holdings)
    .map(normalizeHolding)
    .filter((h): h is HoldingSummary => h !== null);
  return {
    enabled: bool(settings.enabled),
    lastError: text(settings.lastError),
    ready: bool(data.ready),
    readinessReason: text(data.readinessReason),
    cadenceMinutes: num(data.cadenceMinutes),
    broker: text(data.broker),
    books: Array.isArray(data.books)
      ? data.books.map(normalizeBook).filter((b): b is ReviewBookStatus => b !== null)
      : null,
    portfolioAsOf: text(data.portfolioAsOf),
    portfolioStale: bool(data.portfolioStale),
    portfolioError: text(data.portfolioError),
    windowDays: num(data.windowDays),
    pendingDeadlineMinutes: num(data.pendingDeadlineMinutes),
    holdings,
    counts: normalizeCounts(data.counts, countsOf(holdings)),
    note: text(data.note),
  };
}

export function normalizeRunResult(value: unknown): ReviewRunResult {
  const data = obj(value);
  return {
    submitted: count(data.submitted),
    skipped: count(data.skipped),
    failed: count(data.failed),
    reason: text(data.reason),
  };
}

/* ───────────────────────── web research ───────────────────────── */

const API_REQUESTER: Requester = { kind: 'api', label: 'API client', detail: null, to: null };

export function normalizeRequester(value: unknown): Requester {
  if (!isObj(value)) return API_REQUESTER;
  const kind = oneOf(value.kind, ['ipo', 'manual', 'api'] as const) ?? 'api';
  return {
    kind,
    label:
      text(value.label) ??
      (kind === 'ipo' ? 'IPO report' : kind === 'manual' ? 'Manual' : 'API client'),
    detail: text(value.detail),
    to: text(value.to),
  };
}

export function normalizeResearchStats(value: unknown): ResearchStats {
  const data = obj(value);
  return {
    runs: count(data.runs),
    completed: count(data.completed),
    running: count(data.running),
    failed: count(data.failed),
    medianDurationMs: num(data.medianDurationMs),
    avgFindings: num(data.avgFindings),
    avgSources: num(data.avgSources),
  };
}

export function normalizeResearchItem(value: unknown): ResearchItem | null {
  if (!isObj(value)) return null;
  const jobId = text(value.jobId);
  if (!jobId) return null;
  return {
    jobId,
    status: text(value.status)?.toUpperCase() ?? 'PENDING',
    query: text(value.query) ?? '',
    depth: text(value.depth),
    summary: text(value.summary),
    findings: num(value.findings),
    sources: num(value.sources),
    createdAt: text(value.createdAt),
    completedAt: text(value.completedAt),
    requester: normalizeRequester(value.requester),
  };
}

export function normalizeResearchPage(value: unknown): ResearchPage {
  const data = obj(value);
  return {
    ready: data.ready !== false,
    items: list(data.items)
      .map(normalizeResearchItem)
      .filter((item): item is ResearchItem => item !== null),
    stats: normalizeResearchStats(data.stats),
    nextBefore: text(data.nextBefore),
  };
}

function sourceRef(value: unknown): SourceRef | null {
  const data = obj(value);
  const url = webUrl(data.url);
  const ref = text(data.ref);
  if (!url || !ref) return null;
  return { ref, url, title: text(data.title), domain: text(data.domain) ?? hostOf(url) };
}

function researchSource(value: unknown): ResearchSource | null {
  const ref = sourceRef(value);
  if (!ref) return null;
  const data = obj(value);
  return {
    ...ref,
    publishedAt: text(data.publishedAt),
    credibility: num(data.credibility),
    cited: bool(data.cited),
    excerpt: text(data.excerpt),
  };
}

function runStats(value: unknown): ResearchRunStats | null {
  if (!isObj(value)) return null;
  return {
    modelTurns: num(value.modelTurns),
    searches: num(value.searches),
    pagesFetched: num(value.pagesFetched),
    pagesFailed: num(value.pagesFailed),
    durationMs: num(value.durationMs),
    model: text(value.model),
    forcedFinish: bool(value.forcedFinish),
  };
}

export function normalizeResearchResult(value: unknown): ResearchResult | null {
  if (!isObj(value)) return null;
  return {
    answer: text(value.answer),
    summary: text(value.summary),
    keyFindings: list(value.keyFindings).flatMap((row): ResearchFinding[] => {
      const finding = obj(row);
      const claim = text(finding.claim);
      if (!claim) return [];
      return [
        {
          claim,
          confidence: confidence(finding.confidence) ?? 'low',
          modelConfidence: confidence(finding.modelConfidence),
          corroboration: num(finding.corroboration),
          unverifiedNumbers: strings(finding.unverifiedNumbers),
          sources: list(finding.sources)
            .map(sourceRef)
            .filter((s): s is SourceRef => s !== null),
        },
      ];
    }),
    rejectedClaims: list(value.rejectedClaims).flatMap((row) => {
      const rejected = obj(row);
      const claim = text(rejected.claim);
      return claim ? [{ claim, reason: text(rejected.reason) }] : [];
    }),
    sources: list(value.sources)
      .map(researchSource)
      .filter((s): s is ResearchSource => s !== null),
    openQuestions: strings(value.openQuestions),
    stats: runStats(value.stats),
    generatedAt: text(value.generatedAt),
  };
}

export function normalizeResearchDetail(value: unknown, jobId: string): ResearchDetail {
  const data = obj(value);
  const progress = isObj(data.progress) ? data.progress : null;
  const error = isObj(data.error) ? data.error : null;
  return {
    jobId: text(data.jobId) ?? jobId,
    query: text(data.query) ?? '',
    status: text(data.status)?.toUpperCase() ?? 'PENDING',
    progress: progress
      ? {
          stage: text(progress.stage),
          percent: num(progress.percent),
          message: text(progress.message),
        }
      : null,
    error: error ? { code: text(error.code), message: text(error.message) } : null,
    result: normalizeResearchResult(data.result),
    sources: list(data.sources)
      .map(researchSource)
      .filter((s): s is ResearchSource => s !== null),
    requester: normalizeRequester(data.requester),
  };
}

export function normalizeAskResult(value: unknown): { jobId: string; status: string } {
  const data = obj(value);
  const jobId = text(data.jobId);
  if (!jobId) throw new Error('The server did not return a research job id.');
  return { jobId, status: text(data.status) ?? 'PENDING' };
}

/* ───────────────────────── the hub ───────────────────────── */

function runBrief(value: unknown): IndexRunBrief | null {
  if (!isObj(value)) return null;
  const at = text(value.at);
  if (!at) return null;
  return {
    at,
    outcome: oneOf<RunOutcome>(value.outcome, ['ordered', 'hold', 'error', 'running']) ?? 'hold',
    reason: text(value.reason) ?? '',
    action: oneOf(value.action, ['BUY_CALL', 'BUY_PUT', 'HOLD'] as const),
    underlying: text(value.underlying),
  };
}

function indexTrading(value: unknown): IndexTradingSummary | null {
  if (!isObj(value)) return null;
  const settings = obj(value.settings);
  const today = obj(value.today);
  const month = obj(value.month);
  return {
    enabled: bool(settings.enabled),
    mode: settings.mode === 'live' ? 'live' : 'paper',
    cadenceMinutes: num(settings.cadenceMinutes),
    today: { entries: count(today.entries), net: num(today.net) },
    month: { closed: count(month.closed), net: num(month.net), winRate: num(month.winRate) },
    open: count(value.open),
    attention: count(value.attention),
    scansToday: count(value.scansToday),
    latestRun: runBrief(value.latestRun),
  };
}

function research(value: unknown): ResearchSummary | null {
  if (!isObj(value)) return null;
  const latest = obj(value.latest);
  const query = text(latest.query);
  return {
    ready: bool(value.ready),
    error: text(value.error),
    stats: normalizeResearchStats(value.stats),
    latest: query ? { query, status: text(latest.status) ?? '', at: text(latest.at) } : null,
  };
}

function activity(value: unknown): ActivityEvent[] {
  return list(value).flatMap((row) => {
    const event = obj(row);
    const agent = oneOf(event.agent, AGENTS);
    const at = text(event.at);
    const title = text(event.title);
    if (!agent || !at || !title) return [];
    return [
      {
        agent,
        at,
        title,
        detail: text(event.detail),
        tone: oneOf(event.tone, TONES) ?? 'idle',
        to: text(event.to),
      },
    ];
  });
}

export function normalizeSummary(value: unknown): AgentsSummary {
  const data = obj(value);
  const portfolio = obj(data.portfolio);
  const empty = countsOf([]);
  return {
    admin: bool(data.admin),
    indexTrading: indexTrading(data.indexTrading),
    portfolio: {
      enabled: bool(portfolio.enabled),
      lastError: text(portfolio.lastError),
      ready: bool(portfolio.ready),
      counts: normalizeCounts(portfolio.counts, empty),
    },
    research: research(data.research),
    activity: activity(data.activity),
  };
}

/** "economictimes.indiatimes.com" from a page URL; the URL itself when it does not parse. */
export function hostOf(url: string): string {
  const match = /^https?:\/\/([^/?#:]+)/i.exec(url.trim());
  return match?.[1] ? match[1].replace(/^www\./i, '').toLowerCase() : url;
}
