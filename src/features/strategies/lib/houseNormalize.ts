import {
  BB_KEY,
  HOUSE_STRATEGY_KEYS,
  SWING_KEY,
  type BacktestTrade,
  type CheckGroup,
  type CheckStatus,
  type EquityPoint,
  type HouseBacktest,
  type HouseDeploymentRef,
  type HouseJobResult,
  type HouseMetrics,
  type HouseReplay,
  type HouseStockCounts,
  type HouseStrategyDetail,
  type HouseStrategyKey,
  type HouseStrategySummary,
  type MarketRegime,
  type RegimeState,
  type ReplayLine,
  type ReplaySetup,
  type ScanDay,
  type ScanStatus,
  type SectorState,
  type SectorStrength,
  type SetupCounts,
  type SetupStatus,
  type SplitVerdict,
  type StrategyRun,
  type SwingCheck,
  type SwingConfig,
  type SwingGrade,
  type SwingNearMiss,
  type SwingPlan,
  type SwingScan,
  type SwingSetup,
  type SwingSetupMetrics,
  type SwingTrigger,
  type SymbolStats,
  type WorksOnStock,
} from '../types';
import {
  bool,
  count,
  isObj,
  list,
  num,
  numbers,
  obj,
  oneOf,
  rows,
  str,
  strings,
  text,
} from './parse';

/**
 * Every /strategies/house payload is parsed once here into a shape where every field exists —
 * arrays are arrays, numbers are finite or null, enums fall back to a neutral value — so a server
 * that lags the app (or a replay stored before a field existed) can never throw mid-render. The
 * intraday strategy's detail is parsed in intradayNormalize.ts, on top of the summary here.
 */

const REGIMES: readonly RegimeState[] = ['risk-on', 'cautious', 'risk-off', 'unknown'];
const SCAN_STATUSES: readonly ScanStatus[] = ['completed', 'no-data', 'failed'];
const GRADES: readonly SwingGrade[] = ['A', 'B', 'C'];
const TRIGGERS: readonly SwingTrigger[] = ['breakout', 'pullback'];
const SETUP_STATUSES: readonly SetupStatus[] = [
  'target',
  'stop',
  'time',
  'not-triggered',
  'gapped',
  'invalidated',
  'open',
  'pending',
];
const CHECK_STATUSES: readonly CheckStatus[] = ['pass', 'warn', 'fail', 'na'];
const CHECK_GROUPS: readonly CheckGroup[] = ['liquidity', 'move', 'trend', 'catalyst', 'plan'];
const SECTOR_STATES: readonly SectorState[] = ['strong', 'neutral', 'weak', 'unknown'];

export function isHouseStrategyKey(value: unknown): value is HouseStrategyKey {
  return typeof value === 'string' && (HOUSE_STRATEGY_KEYS as readonly string[]).includes(value);
}

/** The market regime, from a scan or from the strong-picks read (which adds `asOf`). */
export function normalizeRegime(value: unknown): MarketRegime | null {
  if (!isObj(value)) return null;
  return {
    state: oneOf(value.state, REGIMES, 'unknown'),
    close: num(value.close),
    dma50: num(value.dma50),
    dma200: num(value.dma200),
    vix: num(value.vix),
    return21Pct: num(value.return21Pct),
    return63Pct: num(value.return63Pct),
    detail: str(value.detail),
    asOf: text(value.asOf),
  };
}

function scanDay(value: unknown): ScanDay | null {
  const v = obj(value);
  const date = text(v.date);
  if (!date) return null;
  return {
    date,
    status: oneOf(v.status, SCAN_STATUSES, 'failed'),
    setups: count(v.setups),
    gradeA: count(v.gradeA),
    regime: oneOf(v.regime, REGIMES, 'unknown'),
  };
}

function verdict(value: unknown): SplitVerdict | null {
  const v = obj(value);
  const words = text(v.text);
  if (!words) return null;
  return {
    tone: oneOf(v.tone, ['good', 'warn', 'bad', 'unknown'] as const, 'unknown'),
    text: words,
  };
}

function metrics(value: unknown): HouseMetrics | null {
  const v = obj(value);
  const totalTrades = num(v.totalTrades);
  if (totalTrades === null) return null;
  return {
    totalTrades,
    winRate: num(v.winRate) ?? 0,
    profitFactor: num(v.profitFactor),
    maxDrawdownPct: num(v.maxDrawdownPct) ?? 0,
    cagrPct: num(v.cagrPct),
    totalReturnPct: num(v.totalReturnPct) ?? 0,
    expectancyPct: num(v.expectancyPct) ?? 0,
    wins: count(v.wins),
    losses: count(v.losses),
    symbolsWithTrades: count(v.symbolsWithTrades),
    firstTradeAt: num(v.firstTradeAt),
    lastTradeAt: num(v.lastTradeAt),
  };
}

function backtest(value: unknown): HouseBacktest | null {
  if (!isObj(value)) return null;
  return {
    status: oneOf(value.status, SCAN_STATUSES, 'failed'),
    ranAt: text(value.ranAt),
    from: text(value.from),
    to: text(value.to),
    sessions: count(value.sessions),
    metrics: metrics(value.metrics),
    equitySpark: numbers(value.equitySpark),
    verdict: verdict(value.verdict),
  };
}

const NAMES: Record<HouseStrategyKey, string> = {
  [SWING_KEY]: 'Institutional Breakout Swing',
  [BB_KEY]: 'Bollinger Mid-Band Thrust',
};

function worksOnStock(value: unknown): WorksOnStock | null {
  const v = obj(value);
  const symbol = text(v.symbol);
  const avgReturnPct = num(v.avgReturnPct);
  if (!symbol || avgReturnPct === null) return null;
  return {
    symbol,
    trades: count(v.trades),
    winRate: num(v.winRate) ?? 0,
    avgReturnPct,
    profitFactor: num(v.profitFactor),
  };
}

function stockCounts(value: unknown): HouseStockCounts | null {
  if (!isObj(value)) return null;
  return {
    tested: count(value.tested),
    traded: count(value.traded),
    works: count(value.works),
    avoid: count(value.avoid),
  };
}

/** A deployment with a mode this app doesn't know is dropped — a wrong chip is worse than none. */
function deploymentRef(value: unknown): HouseDeploymentRef | null {
  const v = obj(value);
  const id = text(v.id);
  if (!id || (v.mode !== 'paper' && v.mode !== 'live')) return null;
  return { id, mode: v.mode, status: oneOf(v.status, ['active', 'paused', 'stopped'], 'active') };
}

/** One platform strategy's card fields — the list row, and the base of either detail. */
export function normalizeHouseSummary(value: unknown): HouseStrategySummary | null {
  const v = obj(value);
  if (!isHouseStrategyKey(v.key)) return null;
  return {
    key: v.key,
    kind: oneOf(v.kind, ['daily-swing', 'intraday'], v.key === BB_KEY ? 'intraday' : 'daily-swing'),
    name: text(v.name) ?? NAMES[v.key],
    short: str(v.short),
    description: str(v.description),
    timeframe: str(v.timeframe),
    holding: str(v.holding),
    schedule: str(v.schedule),
    universe: str(v.universe),
    latestScan: scanDay(v.latestScan),
    backtest: backtest(v.backtest),
    worksOn: rows(v.worksOn, worksOnStock),
    stocks: stockCounts(v.stocks),
    deployments: rows(v.deployments, deploymentRef),
  };
}

/** GET /strategies/house → the platform strategies this app knows how to show. */
export function normalizeHouseList(value: unknown): HouseStrategySummary[] {
  return rows(obj(value).strategies, normalizeHouseSummary);
}

const CONFIG_KEYS: readonly (keyof SwingConfig)[] = [
  'minAvgTradedValueCr',
  'minPrice',
  'minDayMovePct',
  'idealMaxDayMovePct',
  'maxDayMovePct',
  'minCloseLocation',
  'minVolumeRatio',
  'strongVolumeRatio',
  'breakoutLookback',
  'longBreakoutLookback',
  'pullbackTolerancePct',
  'minRiskPct',
  'maxRiskPct',
  'targetR',
  'extendedFromEma20Pct',
  'horizonDays',
  'maxChasePct',
  'lookbackBars',
];

/** All thresholds or none — a rule worded with a missing number would read "undefined%". */
function config(value: unknown): SwingConfig | null {
  const v = obj(value);
  const out: Partial<Record<keyof SwingConfig, number>> = {};
  for (const key of CONFIG_KEYS) {
    const n = num(v[key]);
    if (n === null) return null;
    out[key] = n;
  }
  return out as SwingConfig;
}

function replayLine(value: unknown): ReplayLine {
  const v = obj(value);
  return {
    setups: count(v.setups),
    trades: count(v.trades),
    winRate: num(v.winRate),
    expectancyPct: num(v.expectancyPct),
    avgR: num(v.avgR),
  };
}

function counts(value: unknown): SetupCounts {
  const v = obj(value);
  const out = { setups: count(v.setups), triggered: count(v.triggered) } as SetupCounts;
  for (const status of SETUP_STATUSES) out[status] = count(v[status]);
  return out;
}

function replaySetup(value: unknown): ReplaySetup | null {
  const v = obj(value);
  const symbol = text(v.symbol);
  const date = text(v.date);
  if (!symbol || !date) return null;
  return {
    symbol,
    date,
    grade: oneOf(v.grade, GRADES, 'C'),
    score: num(v.score),
    trigger: oneOf(v.trigger, TRIGGERS, 'breakout'),
    entry: num(v.entry),
    stop: num(v.stop),
    target: num(v.target),
    riskPct: num(v.riskPct),
    regime: oneOf(v.regime, REGIMES, 'unknown'),
    status: oneOf(v.status, SETUP_STATUSES, 'pending'),
    entryDate: text(v.entryDate),
    exitDate: text(v.exitDate),
    entryPrice: num(v.entryPrice),
    exitPrice: num(v.exitPrice),
    returnPct: num(v.returnPct),
    r: num(v.r),
  };
}

function trade(value: unknown): BacktestTrade | null {
  const v = obj(value);
  const symbol = text(v.symbol);
  const entryTime = num(v.entryTime);
  const exitTime = num(v.exitTime);
  const entryPrice = num(v.entryPrice);
  const exitPrice = num(v.exitPrice);
  const returnPct = num(v.returnPct);
  if (!symbol || entryTime === null || exitTime === null) return null;
  if (entryPrice === null || exitPrice === null || returnPct === null) return null;
  return {
    exchange: text(v.exchange) ?? 'NSE',
    symbol,
    entryTime,
    exitTime,
    entryPrice,
    exitPrice,
    barsHeld: count(v.barsHeld),
    returnPct,
    exitReason: oneOf(
      v.exitReason,
      ['target', 'stop', 'signal', 'timeStop', 'endOfData'],
      'signal',
    ),
  };
}

function symbolStat(value: unknown): SymbolStats | null {
  const v = obj(value);
  const symbol = text(v.symbol);
  if (!symbol) return null;
  return {
    exchange: text(v.exchange) ?? 'NSE',
    symbol,
    trades: count(v.trades),
    winRate: num(v.winRate) ?? 0,
    profitFactor: num(v.profitFactor),
    totalReturnPct: num(v.totalReturnPct) ?? 0,
  };
}

/**
 * The replay's backtest, in a saved strategy's run shape. Arrays are made arrays and broken rows
 * dropped; the analysis is kept as sent when it is an object (the equity/trade components read
 * it defensively already), and a run without metrics is no run.
 */
export function normalizeRun(value: unknown): StrategyRun | null {
  if (!isObj(value)) return null;
  const m = metrics(value.metrics);
  if (!m) return null;
  const v = value;
  const vm = obj(v.metrics);
  return {
    runId: str(v.runId),
    ranAt: str(v.ranAt),
    metrics: { ...m, avgWinPct: num(vm.avgWinPct) ?? 0, avgLossPct: num(vm.avgLossPct) ?? 0 },
    analysis: isObj(v.analysis) ? (v.analysis as unknown as StrategyRun['analysis']) : null,
    trades: list(v.trades)
      .map(trade)
      .filter((t): t is BacktestTrade => t !== null),
    equityCurve: list(v.equityCurve).filter(
      (p): p is EquityPoint => isObj(p) && num(p.t) !== null && num(p.v) !== null,
    ),
    symbolStats: list(v.symbolStats)
      .map(symbolStat)
      .filter((s): s is SymbolStats => s !== null),
    universeSize: count(v.universeSize),
    skippedForInsufficientBars: count(v.skippedForInsufficientBars),
    durationMs: count(v.durationMs),
    costBps: num(v.costBps) ?? 15,
    maxOpenPositions: num(v.maxOpenPositions) ?? 8,
    fellBack: strings(v.fellBack),
  };
}

function replay(value: unknown): HouseReplay | null {
  if (!isObj(value)) return null;
  const universe = obj(value.universe);
  const byGrade = obj(value.byGrade);
  const byTrigger = obj(value.byTrigger);
  return {
    status: oneOf(value.status, SCAN_STATUSES, 'failed'),
    runAt: text(value.runAt),
    durationMs: num(value.durationMs),
    from: text(value.from),
    to: text(value.to),
    sessions: count(value.sessions),
    universe: {
      label: str(universe.label),
      size: count(universe.size),
      withBars: count(universe.withBars),
    },
    counts: counts(value.counts),
    byGrade: { A: replayLine(byGrade.A), B: replayLine(byGrade.B), C: replayLine(byGrade.C) },
    byTrigger: {
      breakout: replayLine(byTrigger.breakout),
      pullback: replayLine(byTrigger.pullback),
    },
    error: text(value.error),
    run: normalizeRun(value.run),
    setups: list(value.setups)
      .map(replaySetup)
      .filter((s): s is ReplaySetup => s !== null),
  };
}

/**
 * GET /strategies/house/institutional-breakout-swing → `{ strategy }`; null when it does not
 * describe the daily swing (the intraday strategy has its own parser).
 */
export function normalizeHouseDetail(value: unknown): HouseStrategyDetail | null {
  const raw = obj(value).strategy;
  const summary = normalizeHouseSummary(raw);
  if (!summary || summary.key !== SWING_KEY) return null;
  const v = obj(raw);
  return {
    ...summary,
    config: config(v.config),
    scanDays: list(v.scanDays)
      .map(scanDay)
      .filter((d): d is ScanDay => d !== null),
    replay: replay(v.replay),
    caveats: strings(v.caveats),
  };
}

function check(value: unknown): SwingCheck | null {
  const v = obj(value);
  const label = text(v.label);
  if (!label) return null;
  return {
    key: text(v.key) ?? label,
    label,
    group: oneOf(v.group, CHECK_GROUPS, 'plan'),
    status: oneOf(v.status, CHECK_STATUSES, 'na'),
    hard: bool(v.hard),
    detail: str(v.detail),
  };
}

function plan(value: unknown, trigger: SwingTrigger): SwingPlan {
  const v = obj(value);
  return {
    trigger: oneOf(v.trigger, TRIGGERS, trigger),
    entry: num(v.entry),
    stop: num(v.stop),
    target: num(v.target),
    target3R: num(v.target3R),
    riskPerShare: num(v.riskPerShare),
    riskPct: num(v.riskPct),
    rewardRisk: num(v.rewardRisk),
    atr: num(v.atr),
    horizonDays: num(v.horizonDays),
  };
}

function setupMetrics(value: unknown): SwingSetupMetrics {
  const v = obj(value);
  return {
    close: num(v.close),
    dayChangePct: num(v.dayChangePct),
    closeLocation: num(v.closeLocation),
    volumeRatio: num(v.volumeRatio),
    avgTradedValueCr: num(v.avgTradedValueCr),
    ema20: num(v.ema20),
    ema50: num(v.ema50),
    ema200: num(v.ema200),
    high20: num(v.high20),
    high50: num(v.high50),
    rs21Pct: num(v.rs21Pct),
    rs63Pct: num(v.rs63Pct),
    distanceFromEma20Pct: num(v.distanceFromEma20Pct),
  };
}

function setup(value: unknown): SwingSetup | null {
  const v = obj(value);
  const symbol = text(v.symbol);
  if (!symbol) return null;
  const trigger = oneOf(v.trigger, TRIGGERS, 'breakout');
  return {
    symbol,
    exchange: text(v.exchange) ?? 'NSE',
    name: str(v.name),
    sector: text(v.sector),
    fno: bool(v.fno),
    score: num(v.score),
    grade: oneOf(v.grade, GRADES, 'C'),
    trigger,
    plan: plan(v.plan, trigger),
    metrics: setupMetrics(v.metrics),
    checks: list(v.checks)
      .map(check)
      .filter((c): c is SwingCheck => c !== null),
  };
}

function sector(value: unknown): SectorStrength | null {
  const v = obj(value);
  const key = text(v.key);
  if (!key) return null;
  return {
    key,
    label: text(v.label) ?? key,
    members: count(v.members),
    medianReturn21Pct: num(v.medianReturn21Pct),
    breadthAboveEma50Pct: num(v.breadthAboveEma50Pct),
    state: oneOf(v.state, SECTOR_STATES, 'unknown'),
  };
}

function nearMiss(value: unknown): SwingNearMiss | null {
  const v = obj(value);
  const symbol = text(v.symbol);
  if (!symbol) return null;
  return { symbol, name: str(v.name), score: num(v.score), failedOn: str(v.failedOn) };
}

const UNKNOWN_REGIME: MarketRegime = {
  state: 'unknown',
  close: null,
  dma50: null,
  dma200: null,
  vix: null,
  return21Pct: null,
  return63Pct: null,
  detail: '',
  asOf: null,
};

/** GET /strategies/house/:key/scan → `{ scan }`; null before the first run (or for that day). */
export function normalizeScan(value: unknown): SwingScan | null {
  const raw = obj(value).scan;
  if (!isObj(raw)) return null;
  const date = text(raw.date);
  if (!date) return null;
  const universe = obj(raw.universe);
  return {
    date,
    status: oneOf(raw.status, SCAN_STATUSES, 'failed'),
    runAt: text(raw.runAt),
    durationMs: num(raw.durationMs),
    regime: normalizeRegime(raw.regime) ?? UNKNOWN_REGIME,
    sectors: list(raw.sectors)
      .map(sector)
      .filter((s): s is SectorStrength => s !== null),
    universe: {
      label: str(universe.label),
      size: count(universe.size),
      withBars: count(universe.withBars),
      current: count(universe.current),
    },
    funnel: list(raw.funnel).flatMap((f) => {
      const row = obj(f);
      const label = text(row.label);
      return label ? [{ key: text(row.key) ?? label, label, remaining: count(row.remaining) }] : [];
    }),
    setups: list(raw.setups)
      .map(setup)
      .filter((s): s is SwingSetup => s !== null),
    nearMisses: list(raw.nearMisses)
      .map(nearMiss)
      .filter((m): m is SwingNearMiss => m !== null),
    error: text(raw.error),
  };
}

/** POST …/scan and …/replay → `{ jobId, alreadyQueued }`. */
export function normalizeJobResult(value: unknown): HouseJobResult {
  const v = obj(value);
  return { jobId: str(v.jobId), alreadyQueued: bool(v.alreadyQueued) };
}
