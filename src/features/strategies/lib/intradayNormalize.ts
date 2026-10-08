import {
  BB_KEY,
  type AblationLine,
  type IntradayAnalytics,
  type IntradayBucket,
  type IntradayData,
  type IntradayFunnel,
  type IntradayStockRow,
  type IntradayStrategyDetail,
  type IntradayTrade,
  type IntradayVariant,
  type LineStats,
  type RefreshJob,
  type Rejection,
  type ScanStatus,
  type StockTradesResult,
  type UniverseKey,
  type VariantKey,
  type VariantRules,
} from '../types';
import { normalizeHouseSummary, normalizeRun } from './houseNormalize';
import { count, isObj, num, obj, oneOf, rows, str, strings, text, type Json } from './parse';

/**
 * The intraday platform strategy's payloads (GET /strategies/house/bb-midband-5m?u=… and its
 * per-stock trades), parsed once into shapes where every field exists. A variant without a
 * readable run is left out — the screen then says "Not tested yet" instead of drawing zeros.
 */

export const UNIVERSE_KEYS: readonly UniverseKey[] = ['nifty50', 'nifty500'];
export const UNIVERSE_LABEL: Record<UniverseKey, string> = {
  nifty50: 'Nifty 50',
  nifty500: 'Nifty 500',
};
export const VARIANT_KEYS: readonly VariantKey[] = ['improved', 'base'];
const VARIANT_LABEL: Record<VariantKey, string> = { improved: 'Improved', base: 'Your rules' };
const REJECTIONS: readonly Rejection[] = [
  'window',
  'volume',
  'trend',
  'vwap',
  'room',
  'limit',
  'risk',
];
const VERDICTS = ['works', 'mixed', 'avoid', 'thin'] as const;
const STATUSES: readonly ScanStatus[] = ['completed', 'no-data', 'failed'];

export function isUniverseKey(value: unknown): value is UniverseKey {
  return value === 'nifty50' || value === 'nifty500';
}

export function normalizeIntradayTrade(value: unknown): IntradayTrade | null {
  const v = obj(value);
  const symbol = text(v.symbol);
  const day = text(v.day);
  const entryTime = num(v.entryTime);
  const exitTime = num(v.exitTime);
  const entryPrice = num(v.entryPrice);
  const exitPrice = num(v.exitPrice);
  const returnPct = num(v.returnPct);
  if (!symbol || !day || entryTime === null || exitTime === null) return null;
  if (entryPrice === null || exitPrice === null || returnPct === null) return null;
  return {
    symbol,
    day,
    entryTime,
    exitTime,
    entryPrice,
    exitPrice,
    stop: num(v.stop),
    qty: count(v.qty),
    grossPnl: num(v.grossPnl) ?? 0,
    charges: num(v.charges) ?? 0,
    slippage: num(v.slippage) ?? 0,
    netPnl: num(v.netPnl) ?? 0,
    returnPct,
    exit: text(v.exit) ?? 'end-of-data',
    holdMinutes: num(v.holdMinutes) ?? 0,
    volumeRatio: num(v.volumeRatio),
    mfePct: num(v.mfePct) ?? 0,
    maePct: num(v.maePct) ?? 0,
  };
}

function stockRow(value: unknown): IntradayStockRow | null {
  const v = obj(value);
  const symbol = text(v.symbol);
  if (!symbol) return null;
  return {
    symbol,
    trades: count(v.trades),
    wins: count(v.wins),
    winRate: num(v.winRate) ?? 0,
    avgReturnPct: num(v.avgReturnPct) ?? 0,
    totalReturnPct: num(v.totalReturnPct) ?? 0,
    netPnl: num(v.netPnl) ?? 0,
    profitFactor: num(v.profitFactor),
    avgWinPct: num(v.avgWinPct) ?? 0,
    avgLossPct: num(v.avgLossPct) ?? 0,
    avgHoldMinutes: num(v.avgHoldMinutes) ?? 0,
    maxLosingStreak: count(v.maxLosingStreak),
    firstHalfPct: num(v.firstHalfPct),
    secondHalfPct: num(v.secondHalfPct),
    // An unknown verdict makes no claim: "too few trades to judge".
    verdict: oneOf(v.verdict, VERDICTS, 'thin'),
    score: num(v.score) ?? 0,
  };
}

function funnel(value: unknown): IntradayFunnel {
  const v = obj(value);
  const rejected = obj(v.rejected);
  return {
    crosses: count(v.crosses),
    green: count(v.green),
    rejected: Object.fromEntries(REJECTIONS.map((r) => [r, count(rejected[r])])) as Record<
      Rejection,
      number
    >,
    taken: count(v.taken),
  };
}

function bucket(value: unknown): IntradayBucket | null {
  const v = obj(value);
  const key = text(v.key);
  if (!key) return null;
  return {
    key,
    label: text(v.label) ?? key,
    trades: count(v.trades),
    winRate: num(v.winRate),
    avgReturnPct: num(v.avgReturnPct),
    totalReturnPct: num(v.totalReturnPct) ?? 0,
  };
}

function bestDay(value: unknown): { day: string; netPnl: number } | null {
  const v = obj(value);
  const day = text(v.day);
  const netPnl = num(v.netPnl);
  return day && netPnl !== null ? { day, netPnl } : null;
}

function analytics(value: unknown): IntradayAnalytics {
  const v = obj(value);
  const costs = obj(v.costs);
  const hold = obj(v.hold);
  const excursion = obj(v.excursion);
  const days = obj(v.days);
  return {
    byHour: rows(v.byHour, bucket),
    byExit: rows(v.byExit, (item) => {
      const b = bucket(item);
      return b ? { ...b, sharePct: num(obj(item).sharePct) ?? 0 } : null;
    }),
    byWeekday: rows(v.byWeekday, bucket),
    costs: {
      grossPnl: num(costs.grossPnl) ?? 0,
      charges: num(costs.charges) ?? 0,
      slippage: num(costs.slippage) ?? 0,
      netPnl: num(costs.netPnl) ?? 0,
      perTrade: num(costs.perTrade) ?? 0,
      shareOfGrossPct: num(costs.shareOfGrossPct),
    },
    hold: {
      avgMinutes: num(hold.avgMinutes) ?? 0,
      winnersMinutes: num(hold.winnersMinutes) ?? 0,
      losersMinutes: num(hold.losersMinutes) ?? 0,
    },
    excursion: {
      avgMfePct: num(excursion.avgMfePct) ?? 0,
      avgMaePct: num(excursion.avgMaePct) ?? 0,
      winnersGaveBackPct: num(excursion.winnersGaveBackPct),
    },
    days: {
      traded: count(days.traded),
      positive: count(days.positive),
      positivePct: num(days.positivePct),
      best: bestDay(days.best),
      worst: bestDay(days.worst),
    },
  };
}

function lineStats(v: Json): LineStats {
  return {
    trades: count(v.trades),
    winRate: num(v.winRate),
    avgReturnPct: num(v.avgReturnPct),
    profitFactor: num(v.profitFactor),
    totalReturnPct: num(v.totalReturnPct) ?? 0,
    netPnl: num(v.netPnl) ?? 0,
    stocksWorking: count(v.stocksWorking),
  };
}

function ablation(value: unknown): AblationLine | null {
  const v = obj(value);
  const key = text(v.key);
  if (!key) return null;
  return {
    ...lineStats(v),
    key,
    label: text(v.label) ?? key,
    addsAvgReturnPct: num(v.addsAvgReturnPct),
    addsWinRate: num(v.addsWinRate),
    addsTrades: num(v.addsTrades) ?? 0,
  };
}

function ruleLines(value: unknown): { entry: string[]; exit: string[] } {
  const v = obj(value);
  return { entry: strings(v.entry), exit: strings(v.exit) };
}

function variant(key: VariantKey, value: unknown): IntradayVariant | null {
  if (!isObj(value)) return null;
  const run = normalizeRun(value.run);
  if (!run) return null;
  return {
    key,
    label: text(value.label) ?? VARIANT_LABEL[key],
    line: lineStats(obj(value.line)),
    run,
    funnel: funnel(value.funnel),
    analytics: analytics(value.analytics),
    stocks: rows(value.stocks, stockRow),
    recentTrades: rows(value.recentTrades, normalizeIntradayTrade),
    rules: ruleLines(value.rules),
  };
}

function job(value: unknown): RefreshJob | null {
  if (!isObj(value)) return null;
  const workers = num(value.workers);
  return {
    state: text(value.state),
    queuedAt: text(value.queuedAt),
    finishedAt: text(value.finishedAt),
    failedReason: text(value.failedReason),
    workers: workers === null ? null : Math.max(0, Math.round(workers)),
  };
}

function data(value: unknown): IntradayData | null {
  if (!isObj(value)) return null;
  const universe = obj(value.universe);
  return {
    universe: { label: str(universe.label), size: count(universe.size) },
    stocks: count(value.stocks),
    sessions: count(value.sessions),
    bars: count(value.bars),
    from: text(value.from),
    to: text(value.to),
  };
}

/**
 * GET /strategies/house/bb-midband-5m?u=… → `{ strategy }`. `universe` is the one asked for —
 * the answer's own `universeKey` wins when it names a known universe. Null when it does not
 * describe the intraday strategy.
 */
export function normalizeIntradayDetail(
  value: unknown,
  universe: UniverseKey,
): IntradayStrategyDetail | null {
  const raw = obj(value).strategy;
  const summary = normalizeHouseSummary(raw);
  if (!summary || summary.key !== BB_KEY) return null;
  const v = obj(raw);
  const variants: IntradayStrategyDetail['variants'] = {};
  const sent = obj(v.variants);
  for (const key of VARIANT_KEYS) {
    const parsed = variant(key, sent[key]);
    if (parsed) variants[key] = parsed;
  }
  const rulesSent = obj(v.rules);
  const rules = Object.fromEntries(
    VARIANT_KEYS.map((key): [VariantKey, VariantRules] => {
      const r = obj(rulesSent[key]);
      return [key, { label: text(r.label) ?? VARIANT_LABEL[key], ...ruleLines(r) }];
    }),
  ) as Record<VariantKey, VariantRules>;
  const universes = rows(v.universes, (item) => {
    const u = obj(item);
    return isUniverseKey(u.key)
      ? { key: u.key, label: text(u.label) ?? UNIVERSE_LABEL[u.key] }
      : null;
  });
  const costs = obj(v.costs);
  const sync = isObj(v.sync) ? { at: text(v.sync.at), error: text(v.sync.error) } : null;
  return {
    ...summary,
    kind: 'intraday',
    universeKey: isUniverseKey(v.universeKey) ? v.universeKey : universe,
    universes: universes.length
      ? universes
      : UNIVERSE_KEYS.map((key) => ({ key, label: UNIVERSE_LABEL[key] })),
    job: job(v.job),
    status: v.status == null ? null : oneOf<ScanStatus>(v.status, STATUSES, 'failed'),
    runAt: text(v.runAt),
    durationMs: count(v.durationMs),
    error: text(v.error),
    data: data(v.data),
    costs:
      num(costs.notionalInr) !== null
        ? { notionalInr: num(costs.notionalInr)!, slippageBps: num(costs.slippageBps) ?? 0 }
        : null,
    variants,
    rules,
    ablations: rows(v.ablations, ablation),
    sync,
    caveats: strings(v.caveats),
  };
}

/** GET …/stocks/:symbol → every backtested trade of the stock, newest first. */
export function normalizeStockTrades(
  value: unknown,
  fallback: { symbol: string; variant: VariantKey; universe: UniverseKey },
): StockTradesResult {
  const v = obj(value);
  return {
    symbol: text(v.symbol) ?? fallback.symbol,
    variant: oneOf(v.variant, VARIANT_KEYS, fallback.variant),
    universe: isUniverseKey(v.universe) ? v.universe : fallback.universe,
    trades: rows(v.trades, normalizeIntradayTrade).sort((a, b) => b.entryTime - a.entryTime),
  };
}
