import { normalizeRegime } from '@/features/strategies/lib/houseNormalize';

import type {
  AnalyticsEntry,
  GenerateStrongPicksResult,
  MarketSegment,
  MonitorSweepResult,
  OpenStructure,
  OutcomeStatus,
  PickCategory,
  PickContract,
  PickMonitor,
  PickNews,
  PickOutcome,
  PickState,
  PickSuggestion,
  ScoreLine,
  SegmentVerdict,
  StrongPick,
  StrongPickAnalytics,
  StrongPickRun,
  StrongPickRunStatus,
  StrongPicksResponse,
} from '../types';

/**
 * Every strong-picks payload is parsed once here into a shape where every field exists. The
 * server sends each pick as it was stored, so a day published before a field existed (reachable
 * through "Last published" or the day strip) lacks it — the per-segment verdicts on the oldest
 * days, the v2 category/outcome/evidence on anything before 2026-10-04 — and an older server
 * sends no `active`, `regime` or analytics at all. Rows without a symbol are dropped.
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
const num = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;
const count = (value: unknown): number => Math.max(0, Math.round(num(value) ?? 0));

function oneOf<T extends string>(value: unknown, options: readonly T[], fallback: T): T {
  return typeof value === 'string' && (options as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

const SEGMENTS: readonly MarketSegment[] = ['equity', 'intraday', 'fno'];
const STRUCTURES: readonly OpenStructure[] = ['holding', 'extended', 'breaking-down', 'unclear'];
const STATES: readonly PickState[] = [
  'unpriced',
  'awaiting-entry',
  'in-band',
  'above-band',
  'working',
  'target-hit',
  'stop-hit',
];
const SUGGESTIONS: readonly PickSuggestion[] = [
  'NO_PRICE',
  'WAIT',
  'ENTER',
  'HOLD',
  'TAKE_PROFIT',
  'EXIT',
];
export const PICK_CATEGORIES: readonly PickCategory[] = [
  'equity',
  'intraday',
  'futures',
  'options',
];
const OUTCOMES: readonly OutcomeStatus[] = ['open', 'target', 'stop', 'time', 'not-triggered'];
const RUN_STATUSES: readonly StrongPickRunStatus[] = [
  'published',
  'nothing-survived-open',
  'nothing-cleared-floor',
  'no-candidates',
  'analysis-failed',
  'not-configured',
  'not-run-yet',
];

function verdicts(value: unknown): SegmentVerdict[] {
  return list(value).flatMap((item) => {
    const v = obj(item);
    const segment = oneOf<MarketSegment | ''>(v.segment, SEGMENTS, '');
    if (!segment) return [];
    return [
      {
        segment,
        suitable: v.suitable === true,
        reason: str(v.reason),
        confidence: oneOf(v.confidence, ['exact', 'inferred'] as const, 'inferred'),
      },
    ];
  });
}

function monitor(value: unknown): PickMonitor | null {
  if (!isObj(value)) return null;
  const v = obj(value.verdict);
  return {
    verdict: {
      state: oneOf(v.state, STATES, 'unpriced'),
      suggestion: oneOf(v.suggestion, SUGGESTIONS, 'NO_PRICE'),
      headline: str(v.headline),
      detail: str(v.detail),
      progressToTarget: num(v.progressToTarget),
      movePct: num(v.movePct),
      stale: v.stale === true,
      spannedBothLevels: v.spannedBothLevels === true,
    },
    lastPrice: num(value.lastPrice),
    priceAsOf: text(value.priceAsOf),
    highSincePublish: num(value.highSincePublish),
    lowSincePublish: num(value.lowSincePublish),
    targetHitAt: text(value.targetHitAt),
    stopHitAt: text(value.stopHitAt),
    lastSampledAt: text(value.lastSampledAt),
    minutesSinceSample: num(value.minutesSinceSample),
    samples: count(value.samples),
  };
}

function contract(value: unknown): PickContract | null {
  const v = obj(value);
  const tradingSymbol = text(v.tradingSymbol);
  const kind = oneOf<PickContract['kind'] | ''>(v.kind, ['FUT', 'CE', 'PE'], '');
  const lotSize = num(v.lotSize);
  if (!tradingSymbol || !kind || lotSize === null || lotSize <= 0) return null;
  return {
    tradingSymbol,
    kind,
    strike: num(v.strike),
    expiry: str(v.expiry),
    lotSize,
    ltp: num(v.ltp),
    lotValue: num(v.lotValue),
  };
}

function outcome(value: unknown): PickOutcome | null {
  if (!isObj(value)) return null;
  const status = oneOf<OutcomeStatus | ''>(value.status, OUTCOMES, '');
  if (!status) return null;
  return {
    status,
    entryPrice: num(value.entryPrice),
    exitPrice: num(value.exitPrice),
    returnPct: num(value.returnPct),
    progressToTarget: num(value.progressToTarget),
    resolved: value.resolved === true,
    resolvedAt: text(value.resolvedAt),
  };
}

function news(value: unknown): PickNews[] {
  return list(value).flatMap((item) => {
    const v = obj(item);
    const title = text(v.title);
    return title
      ? [
          {
            title,
            sentiment: text(v.sentiment),
            at: text(v.at),
            url: text(v.url),
            publisher: text(v.publisher),
          },
        ]
      : [];
  });
}

/** One pick, every field present. `fallbackDate` stands in for a pick stored before `date`. */
export function normalizePick(value: unknown, fallbackDate: string): StrongPick | null {
  const v = obj(value);
  const symbol = text(v.symbol);
  if (!symbol) return null;
  const swing = isObj(v.swing) ? v.swing : null;
  const fundamentals = isObj(v.fundamentals) ? v.fundamentals : null;
  const source = str(v.source);
  const sources = strings(v.sources);
  return {
    symbol,
    exchange: text(v.exchange) ?? 'NSE',
    name: str(v.name),
    rank: count(v.rank),
    segments: list(v.segments).filter((s): s is MarketSegment =>
      (SEGMENTS as readonly unknown[]).includes(s),
    ),
    segmentVerdicts: verdicts(v.segmentVerdicts),
    openPrice: num(v.openPrice),
    priceAtDecision: num(v.priceAtDecision),
    windowHigh: num(v.windowHigh),
    windowLow: num(v.windowLow),
    gapPct: num(v.gapPct),
    openMovePct: num(v.openMovePct),
    volumeShareOfTypicalDay: num(v.volumeShareOfTypicalDay),
    structure: oneOf(v.structure, STRUCTURES, 'unclear'),
    observationSummary: str(v.observationSummary),
    source,
    entryLow: num(v.entryLow),
    entryHigh: num(v.entryHigh),
    targetPrice: num(v.targetPrice),
    stopPrice: num(v.stopPrice),
    rewardRisk: num(v.rewardRisk),
    atr: num(v.atr),
    stopClamped: oneOf(v.stopClamped, ['none', 'widened-to-min', 'tightened-to-max'], 'none'),
    monitor: monitor(v.monitor),
    modelSetupScore: num(v.modelSetupScore) ?? 0,
    winProbability: num(v.winProbability),
    probabilitySampleSize: count(v.probabilitySampleSize),
    probabilityBasis: oneOf(
      v.probabilityBasis,
      ['target-before-stop', 'insufficient-history'],
      'insufficient-history',
    ),
    conviction: Math.min(5, Math.max(0, count(v.conviction))),
    rationale: str(v.rationale),
    invalidation: str(v.invalidation),
    caveat: str(v.caveat),

    date: text(v.date) ?? fallbackDate,
    category: oneOf<PickCategory | ''>(v.category, PICK_CATEGORIES, '') || null,
    direction: 'long',
    entryMode: oneOf(v.entryMode, ['band', 'trigger'], 'band'),
    horizonDays: Math.max(1, count(v.horizonDays) || 1),
    sessionsElapsed: count(v.sessionsElapsed),
    sources: sources.length ? sources : source ? [source] : [],
    swing: swing
      ? {
          grade: str(swing.grade),
          score: num(swing.score),
          trigger: str(swing.trigger),
          passed: strings(swing.passed),
          warnings: strings(swing.warnings),
        }
      : null,
    news: news(v.news),
    fundamentals: fundamentals
      ? { verdict: text(fundamentals.verdict), ratingPct: num(fundamentals.ratingPct) }
      : null,
    contract: contract(v.contract),
    riskNote: str(v.riskNote),
    outcome: outcome(v.outcome),
    triggeredAt: text(v.triggeredAt),
  };
}

function picks(value: unknown, fallbackDate: string): StrongPick[] {
  return list(value)
    .map((item) => normalizePick(item, fallbackDate))
    .filter((p): p is StrongPick => p !== null);
}

function run(value: unknown): StrongPickRun {
  const v = obj(value);
  return {
    status: oneOf(v.status, RUN_STATUSES, 'not-run-yet'),
    verdict: str(v.verdict),
    considered: count(v.considered),
    consideredBySource: list(v.consideredBySource).flatMap((item) => {
      const row = obj(item);
      const source = text(row.source);
      return source ? [{ source, count: count(row.count) }] : [];
    }),
    survivedOpen: count(v.survivedOpen),
    reachedModel: count(v.reachedModel),
    published: count(v.published),
    rejections: list(v.rejections).flatMap((item) => {
      const row = obj(item);
      const symbol = text(row.symbol);
      return symbol
        ? [
            {
              symbol,
              exchange: text(row.exchange) ?? 'NSE',
              stage: str(row.stage) || 'model',
              reason: str(row.reason),
            },
          ]
        : [];
    }),
    minSetupScore: num(v.minSetupScore) ?? 0,
    minCalibratedWinRate: num(v.minCalibratedWinRate) ?? 0,
    unavailableSources: list(v.unavailableSources).flatMap((item) => {
      const row = obj(item);
      const source = text(row.source);
      return source ? [{ source, reason: str(row.reason) }] : [];
    }),
    finishedAt: text(v.finishedAt),
  };
}

/** GET /recommendations/strong-picks — today's read, or one day's. */
export function normalizeStrongPicks(value: unknown): StrongPicksResponse {
  const v = obj(value);
  const date = text(v.date) ?? '';
  const last = obj(v.lastPublished);
  const lastDate = text(last.date);
  const nextRunAt = text(v.nextRunAt);
  return {
    date,
    picks: picks(v.picks, date),
    generatedAt: text(v.generatedAt),
    run: run(v.run),
    lastPublished: lastDate ? { date: lastDate, count: count(last.count) } : null,
    active: picks(v.active, date),
    regime: normalizeRegime(v.regime),
    marketOpen: v.marketOpen === true,
    caveats: strings(v.caveats),
    ...(nextRunAt ? { nextRunAt } : {}),
  };
}

function scoreLine(value: unknown): ScoreLine {
  const v = obj(value);
  return {
    picks: count(v.picks),
    open: count(v.open),
    notTriggered: count(v.notTriggered),
    targets: count(v.targets),
    stops: count(v.stops),
    timeExits: count(v.timeExits),
    profitable: count(v.profitable),
    closed: count(v.closed),
    successRate: num(v.successRate),
    targetHitRate: num(v.targetHitRate),
    avgReturnPct: num(v.avgReturnPct),
    openInProfitPct: num(v.openInProfitPct),
  };
}

function entry(value: unknown): AnalyticsEntry | null {
  const v = obj(value);
  const symbol = text(v.symbol);
  const date = text(v.date);
  const category = oneOf<PickCategory | ''>(v.category, PICK_CATEGORIES, '');
  if (!symbol || !date || !category) return null;
  return {
    date,
    symbol,
    name: str(v.name),
    category,
    status: oneOf(v.status, OUTCOMES, 'open'),
    entryPrice: num(v.entryPrice),
    exitPrice: num(v.exitPrice),
    lastPrice: num(v.lastPrice),
    returnPct: num(v.returnPct),
    progressToTarget: num(v.progressToTarget),
    horizonDays: Math.max(1, count(v.horizonDays) || 1),
  };
}

/** GET /recommendations/strong-picks/analytics — the track record over a window. */
export function normalizeAnalytics(value: unknown): StrongPickAnalytics {
  const v = obj(value);
  const today = isObj(v.today) && text(v.today.date) ? v.today : null;
  return {
    days: count(v.days),
    since: str(v.since),
    sessionClosed: v.sessionClosed !== false,
    today: today
      ? {
          ...scoreLine(today),
          date: str(today.date),
          entries: list(today.entries)
            .map(entry)
            .filter((e): e is AnalyticsEntry => e !== null),
        }
      : null,
    overall: scoreLine(v.overall),
    byCategory: list(v.byCategory).flatMap((item) => {
      const row = obj(item);
      const category = oneOf<PickCategory | ''>(row.category, PICK_CATEGORIES, '');
      return category ? [{ ...scoreLine(row), category }] : [];
    }),
    byDay: list(v.byDay).flatMap((item) => {
      const row = obj(item);
      const date = text(row.date);
      return date ? [{ ...scoreLine(row), date }] : [];
    }),
  };
}

export function normalizeSweep(value: unknown): MonitorSweepResult {
  const v = obj(value);
  return {
    date: str(v.date),
    picks: count(v.picks),
    sampled: count(v.sampled),
    unpriced: count(v.unpriced),
    newTargetHits: count(v.newTargetHits),
    newStopHits: count(v.newStopHits),
    skipped: text(v.skipped),
  };
}

export function normalizeGenerate(value: unknown): GenerateStrongPicksResult {
  const v = obj(value);
  return { jobId: str(v.jobId), alreadyRunning: v.alreadyRunning === true, date: str(v.date) };
}
