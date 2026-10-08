import type {
  ArgumentView,
  BacktestDays,
  BacktestPoint,
  BacktestTrade,
  BacktestUnderlying,
  BotIntent,
  BotMode,
  BotNumberKey,
  BotSettings,
  BotStatus,
  BotSummarySettings,
  Breakdown,
  DailyPoint,
  DebateView,
  DecisionCounts,
  EdgeView,
  ExitReason,
  FunnelKey,
  FunnelStage,
  IndexBacktest,
  IndexDecisions,
  IndexOverview,
  IndexTrades,
  ModeFilter,
  OrderView,
  RangeKey,
  ReasonGroup,
  RunNowResult,
  RunOutcome,
  RunView,
  TraceStep,
  TraderAction,
  TradePhase,
  TradeRow,
  TradeStats,
} from '../types';

/**
 * Every index-bot payload is parsed once here into a shape where every field exists — arrays are
 * arrays, numbers are finite or null — so a row written by an older bot (no trace, no mode) or a
 * field a newer server adds can never throw mid-render. Rows without an id are dropped.
 *
 * Two dialects: the /agents analytics already speak percent; the bot's own raw rows
 * (/ai-autotrade status and runs/:id) store probabilities and stop/target as FRACTIONS, which
 * `rawRun` scales exactly as the server's agents.analytics.ts does.
 */

type Json = Record<string, unknown>;

const isObj = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const obj = (value: unknown): Json => (isObj(value) ? value : {});
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;
const str = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
const bool = (value: unknown): boolean => value === true;
const strings = (value: unknown): string[] =>
  list(value).filter((item): item is string => typeof item === 'string' && item.trim() !== '');

export function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
const count = (value: unknown): number => {
  const n = num(value);
  return n != null && n > 0 ? Math.round(n) : 0;
};
const round2 = (n: number) => Math.round(n * 100) / 100;

/** An ISO instant from a string or a serialised Date; null when unparseable. */
function iso(value: unknown): string | null {
  const raw = text(value);
  return raw && Number.isFinite(Date.parse(raw)) ? raw : null;
}

const mode = (value: unknown): BotMode => (value === 'live' ? 'live' : 'paper');
const modeOrNull = (value: unknown): BotMode | null =>
  value === 'live' ? 'live' : value === 'paper' ? 'paper' : null;

const MODE_FILTERS: readonly ModeFilter[] = ['all', 'paper', 'live'];
const RANGES: readonly RangeKey[] = ['today', '7d', '30d', '90d', 'all'];
const PHASES: readonly TradePhase[] = ['open', 'closed', 'review', 'rejected', 'resolved'];
const EXITS: readonly ExitReason[] = ['target', 'stop', 'time'];
const OUTCOMES: readonly RunOutcome[] = ['ordered', 'hold', 'error', 'running'];
const STAGES: readonly FunnelKey[] = [
  'scanned',
  'debated',
  'proposed',
  'checked',
  'edge',
  'ordered',
];

function oneOf<T extends string>(value: unknown, options: readonly T[]): T | null {
  return typeof value === 'string' && (options as readonly string[]).includes(value)
    ? (value as T)
    : null;
}

/* ── shared pieces ── */

/** An edge already in percent (the /agents analytics). */
export function edge(value: unknown): EdgeView | null {
  if (!isObj(value)) return null;
  const samples = num(value.samples);
  const wins = num(value.wins);
  if (samples == null || wins == null) return null;
  return {
    samples,
    wins,
    observedWinRate: num(value.observedWinRate) ?? 0,
    wilsonLower95: num(value.wilsonLower95) ?? 0,
    breakEvenRate: num(value.breakEvenRate) ?? 0,
    expectedNetAtLowerBound: num(value.expectedNetAtLowerBound),
    allowed: typeof value.allowed === 'boolean' ? value.allowed : null,
  };
}

/** The bot's own stored probability (fractions) as an edge in percent. */
export function rawEdge(value: unknown): EdgeView | null {
  if (!isObj(value)) return null;
  const pct = (v: unknown) => round2((num(v) ?? 0) * 100);
  const scaled = edge({
    ...value,
    observedWinRate: pct(value.observedWinRate),
    wilsonLower95: pct(value.wilsonLower95),
    breakEvenRate: pct(value.breakEvenRate),
  });
  if (scaled && scaled.expectedNetAtLowerBound != null) {
    scaled.expectedNetAtLowerBound = round2(scaled.expectedNetAtLowerBound);
  }
  return scaled;
}

function order(value: unknown): OrderView | null {
  if (!isObj(value)) return null;
  return {
    id: text(value.id),
    status: text(value.status),
    price: num(value.price),
    quantity: num(value.quantity),
    at: iso(value.at),
  };
}

function argument(value: unknown): ArgumentView | null {
  if (!isObj(value)) return null;
  return {
    underlying: text(value.underlying),
    conviction: num(value.conviction),
    evidence: strings(value.evidence).slice(0, 8),
    challenge: str(value.challenge),
    reason: str(value.reason),
  };
}

const action = (value: unknown): TraderAction =>
  value === 'BUY_CALL' || value === 'BUY_PUT' ? value : 'HOLD';

/**
 * A debate. `fractions`: the raw stored proposal, whose stop/target are fractions of the premium
 * (the /agents analytics already sends percent).
 */
export function debate(value: unknown, fractions = false): DebateView | null {
  if (!isObj(value) || !isObj(value.decision)) return null;
  const d = value.decision;
  const scale = (v: unknown) => {
    const n = num(v);
    return n == null ? null : fractions ? round2(n * 100) : n;
  };
  return {
    decision: {
      action: action(d.action),
      underlying: text(d.underlying),
      stopPct: scale(d.stopPct),
      targetPct: scale(d.targetPct),
      confidence: num(d.confidence),
      reason: str(d.reason),
    },
    bullish: argument(value.bullish),
    bearish: argument(value.bearish),
    rebuttal: argument(value.rebuttal),
  };
}

export function trace(value: unknown): TraceStep[] {
  return list(value).flatMap((item): TraceStep[] => {
    if (!isObj(item)) return [];
    const step = text(item.step);
    if (!step || typeof item.detail !== 'string') return [];
    return [
      {
        step,
        ok: typeof item.ok === 'boolean' ? item.ok : null,
        detail: item.detail,
        at: iso(item.at),
      },
    ];
  });
}

/* ── trades ── */

export function tradeRow(value: unknown): TradeRow | null {
  if (!isObj(value)) return null;
  const intentId = text(value.intentId);
  const tradingSymbol = text(value.tradingSymbol);
  if (!intentId || !tradingSymbol) return null;
  return {
    intentId,
    day: str(value.day),
    mode: mode(value.mode),
    underlying: str(value.underlying),
    tradingSymbol,
    kind: str(value.kind),
    lots: num(value.lots),
    quantity: num(value.quantity),
    plannedEntry: num(value.plannedEntry),
    stop: num(value.stop),
    target: num(value.target),
    rewardRisk: num(value.rewardRisk),
    entryPrice: num(value.entryPrice),
    exitPrice: num(value.exitPrice),
    exitPriceDerived: bool(value.exitPriceDerived),
    status: str(value.status).toUpperCase(),
    // An unknown phase is treated as needing review, as the server's own fallback does.
    phase: oneOf(value.phase, PHASES) ?? 'review',
    exitReason: oneOf(value.exitReason, EXITS),
    gross: num(value.gross),
    charges: num(value.charges),
    net: num(value.net),
    enteredAt: iso(value.enteredAt),
    exitedAt: iso(value.exitedAt),
    holdMinutes: num(value.holdMinutes),
    pnlSource: value.pnlSource === 'broker-realised' ? 'broker-realised' : 'paper-estimate',
    reason: str(value.reason),
    edge: edge(value.edge),
    entryOrder: order(value.entryOrder),
    exitOrder: order(value.exitOrder),
    smartOrderStatus: text(value.smartOrderStatus),
  };
}

const tradeRows = (value: unknown): TradeRow[] =>
  list(value)
    .map(tradeRow)
    .filter((row): row is TradeRow => row !== null);

export function tradeStats(value: unknown): TradeStats {
  const s = obj(value);
  const exits = obj(s.exits);
  const streak = obj(s.streak);
  const streakKind = streak.kind === 'win' || streak.kind === 'loss' ? streak.kind : null;
  const streakLength = count(streak.length);
  return {
    entries: count(s.entries),
    closed: count(s.closed),
    open: count(s.open),
    review: count(s.review),
    rejected: count(s.rejected),
    wins: count(s.wins),
    losses: count(s.losses),
    winRate: num(s.winRate),
    gross: num(s.gross),
    charges: num(s.charges),
    net: num(s.net),
    avgWin: num(s.avgWin),
    avgLoss: num(s.avgLoss),
    profitFactor: num(s.profitFactor),
    expectancy: num(s.expectancy),
    best: num(s.best),
    worst: num(s.worst),
    maxDrawdown: num(s.maxDrawdown),
    avgHoldMinutes: num(s.avgHoldMinutes),
    streak: streakKind && streakLength > 0 ? { kind: streakKind, length: streakLength } : null,
    exits: { target: count(exits.target), stop: count(exits.stop), time: count(exits.time) },
  };
}

function dailyPoints(value: unknown): DailyPoint[] {
  return list(value).flatMap((item): DailyPoint[] => {
    if (!isObj(item)) return [];
    const day = text(item.day);
    const net = num(item.net);
    const cumulative = num(item.cumulative);
    if (!day || net == null || cumulative == null) return [];
    return [{ day, net, trades: count(item.trades), cumulative }];
  });
}

function breakdowns(value: unknown): Breakdown[] {
  return list(value).flatMap((item): Breakdown[] => {
    if (!isObj(item)) return [];
    const key = text(item.key);
    const net = num(item.net);
    if (!key || net == null) return [];
    return [
      {
        key,
        label: text(item.label) ?? key,
        trades: count(item.trades),
        wins: count(item.wins),
        winRate: num(item.winRate),
        net,
      },
    ];
  });
}

/* ── decisions ── */

const FUNNEL_LABELS: Record<FunnelKey, string> = {
  scanned: 'Scans',
  debated: 'Debated',
  proposed: 'Trade proposed',
  checked: 'Passed risk checks',
  edge: 'Edge proven',
  ordered: 'Order placed',
};

function funnelStages(value: unknown): FunnelStage[] {
  return list(value).flatMap((item): FunnelStage[] => {
    if (!isObj(item)) return [];
    const key = oneOf(item.key, STAGES);
    if (!key) return [];
    return [
      {
        key,
        label: text(item.label) ?? FUNNEL_LABELS[key],
        hint: str(item.hint),
        count: count(item.count),
        ofPrevious: num(item.ofPrevious),
      },
    ];
  });
}

function reasonGroups(value: unknown): ReasonGroup[] {
  return list(value).flatMap((item): ReasonGroup[] => {
    if (!isObj(item)) return [];
    const key = text(item.key);
    if (!key) return [];
    const latest = obj(item.latest);
    return [
      {
        key,
        label: text(item.label) ?? key,
        count: count(item.count),
        share: num(item.share) ?? 0,
        latest: { reason: str(latest.reason), at: iso(latest.at) },
      },
    ];
  });
}

/** A run row from the /agents analytics (already in its view shape). */
export function runRow(value: unknown): RunView | null {
  if (!isObj(value)) return null;
  const id = text(value.id);
  if (!id) return null;
  const status = str(value.status).toUpperCase();
  const d = debate(value.debate);
  const group = obj(value.group);
  const groupKey = text(group.key);
  return {
    id,
    at: iso(value.at),
    status,
    outcome:
      oneOf(value.outcome, OUTCOMES) ??
      (status === 'RUNNING' ? 'running' : status === 'ERROR' ? 'error' : 'hold'),
    stage: oneOf(value.stage, STAGES) ?? 'scanned',
    reason: str(value.reason),
    group: groupKey ? { key: groupKey, label: text(group.label) ?? groupKey } : null,
    action: value.action == null ? (d?.decision.action ?? null) : action(value.action),
    underlying: text(value.underlying) ?? d?.decision.underlying ?? null,
    confidence: num(value.confidence) ?? d?.decision.confidence ?? null,
    edge: edge(value.edge),
    debate: d,
    mode: modeOrNull(value.mode),
    dryRun: bool(value.dryRun),
    trace: trace(value.trace),
  };
}

/** A run that ended with an entry intent — its finish status is the intent's own status. */
const ORDER_STATUSES = new Set(['OPEN', 'SUBMITTING', 'UNKNOWN', 'REJECTED', 'CLOSED', 'EXITING']);

/** The furthest stage a scan reached — the server's agents.analytics runStage. */
export function runStage(status: string, d: DebateView | null, e: EdgeView | null): FunnelKey {
  if (!d) return 'scanned';
  if (d.decision.action === 'HOLD') return 'debated';
  if (!e) return 'proposed';
  if (e.allowed !== true) return 'checked';
  return ORDER_STATUSES.has(status) ? 'ordered' : 'edge';
}

/**
 * A raw AutoRun (GET /ai-autotrade/runs/:id, status.runs / dryRuns) in the decision log's shape:
 * stored fractions become percent, the outcome and stage are derived as the server derives them.
 */
export function rawRun(value: unknown): RunView | null {
  if (!isObj(value)) return null;
  const id = text(value._id) ?? text(value.id);
  if (!id) return null;
  const status = str(value.status).toUpperCase();
  const d = debate(value.decision, true);
  const e = rawEdge(value.probability);
  const stage = runStage(status, d, e);
  return {
    id,
    at: iso(value.createdAt),
    status,
    outcome:
      status === 'RUNNING'
        ? 'running'
        : status === 'ERROR'
          ? 'error'
          : stage === 'ordered'
            ? 'ordered'
            : 'hold',
    stage,
    reason: str(value.reason),
    group: null,
    action: d?.decision.action ?? null,
    underlying: d?.decision.underlying ?? null,
    confidence: d?.decision.confidence ?? null,
    edge: e,
    debate: d,
    mode: modeOrNull(value.mode),
    dryRun: bool(value.dryRun),
    trace: trace(value.trace),
  };
}

const runs = (value: unknown, parse: (v: unknown) => RunView | null): RunView[] =>
  list(value)
    .map(parse)
    .filter((run): run is RunView => run !== null);

function summarySettings(value: unknown): BotSummarySettings {
  const s = obj(value);
  return {
    enabled: bool(s.enabled),
    mode: mode(s.mode),
    cadenceMinutes: num(s.cadenceMinutes),
    maxTradesPerDay: num(s.maxTradesPerDay),
    maxDailyLoss: num(s.maxDailyLoss),
    maxRiskPerTrade: num(s.maxRiskPerTrade),
    maxLots: num(s.maxLots),
    configured: bool(s.configured),
  };
}

/* ── endpoints ── */

export function normalizeOverview(payload: unknown): IndexOverview {
  const p = obj(payload);
  const funnel = obj(p.funnel);
  const today = obj(p.today);
  return {
    mode: oneOf(p.mode, MODE_FILTERS) ?? 'all',
    range: oneOf(p.range, RANGES) ?? '30d',
    settings: summarySettings(p.settings),
    aiConfigured: bool(p.aiConfigured),
    aiReady: typeof p.aiReady === 'boolean' ? p.aiReady : null,
    aiReason: text(p.aiReason),
    stats: tradeStats(p.stats),
    today: { entries: count(today.entries), net: num(today.net) },
    daily: dailyPoints(p.daily),
    byUnderlying: breakdowns(p.byUnderlying),
    byKind: breakdowns(p.byKind),
    byExit: breakdowns(p.byExit),
    byHour: breakdowns(p.byHour),
    funnel: { stages: funnelStages(funnel.stages), running: count(funnel.running) },
    reasons: reasonGroups(p.reasons),
    latestRun: runRow(p.latestRun),
    open: tradeRows(p.open),
    attention: tradeRows(p.attention),
    caveat: text(p.caveat),
  };
}

export function normalizeTrades(payload: unknown): IndexTrades {
  const p = obj(payload);
  return {
    mode: oneOf(p.mode, MODE_FILTERS) ?? 'all',
    range: oneOf(p.range, RANGES) ?? '30d',
    rows: tradeRows(p.rows),
    stats: tradeStats(p.stats),
    truncated: bool(p.truncated),
    caveat: text(p.caveat),
  };
}

export function normalizeDecisions(payload: unknown): IndexDecisions {
  const p = obj(payload);
  const c = obj(p.counts);
  const counts: DecisionCounts = {
    all: count(c.all),
    ordered: count(c.ordered),
    hold: count(c.hold),
    error: count(c.error),
    running: count(c.running),
  };
  return {
    runs: runs(p.runs, runRow),
    nextBefore: iso(p.nextBefore),
    counts,
    reasons: reasonGroups(p.reasons),
  };
}

/** The server's DEFAULT_AUTO_SETTINGS — the values a never-saved bot runs with. */
export const DEFAULT_NUMBERS: Readonly<Record<BotNumberKey, number>> = {
  cadenceMinutes: 15,
  maxLots: 1,
  maxPremium: 10_000,
  maxRiskPerTrade: 1_000,
  maxStopLossPct: 10,
  maxDailyLoss: 1_000,
  maxTradesPerDay: 3,
  minFutureVolume: 1_000,
  minOptionVolume: 100,
  minFutureMovePct: 0.3,
  minRewardRisk: 1.5,
  minNetTarget: 100,
  minBacktestSamples: 30,
  minProbabilityEdge: 0.05,
};

export function botSettings(value: unknown): BotSettings {
  const s = obj(value);
  const numbers = Object.fromEntries(
    (Object.keys(DEFAULT_NUMBERS) as BotNumberKey[]).map((key) => [
      key,
      num(s[key]) ?? DEFAULT_NUMBERS[key],
    ]),
  ) as Record<BotNumberKey, number>;
  return { ...numbers, enabled: bool(s.enabled), mode: mode(s.mode) };
}

function intent(value: unknown): BotIntent | null {
  if (!isObj(value)) return null;
  const intentId = text(value.intentId);
  const tradingSymbol = text(value.tradingSymbol);
  if (!intentId || !tradingSymbol) return null;
  return {
    intentId,
    tradingSymbol,
    status: str(value.status).toUpperCase(),
    mode: mode(value.mode),
    entry: num(value.entry),
    stop: num(value.stop),
    target: num(value.target),
    netPnl: num(value.netPnl),
    createdAt: iso(value.createdAt),
  };
}

export function normalizeStatus(payload: unknown): BotStatus {
  const p = obj(payload);
  const readiness = obj(p.readiness);
  const approved = isObj(p.liveApproved) ? p.liveApproved : null;
  const results = obj(p.testResults);
  const settings = botSettings(p.settings);
  return {
    settings,
    readiness: {
      aiConfigured: bool(readiness.aiConfigured),
      aiReady: typeof readiness.aiReady === 'boolean' ? readiness.aiReady : null,
      aiReason: text(readiness.aiReason),
      liveAvailable: bool(readiness.liveAvailable),
      paperOnly: bool(readiness.paperOnly),
      note: text(readiness.note),
    },
    mode: p.mode === 'live' || p.mode === 'paper' ? p.mode : settings.mode,
    storedLiveUnapproved: bool(p.storedLiveUnapproved),
    liveApproved: approved ? { at: iso(approved.at), by: text(approved.by) } : null,
    testStartedAt: iso(p.testStartedAt),
    testResults: {
      since: iso(results.since),
      stats: tradeStats(results.stats),
      lastEntryAt: iso(results.lastEntryAt),
    },
    deployPhrase: text(p.deployPhrase),
    month: text(p.month),
    monthEstimatedNet: num(p.monthEstimatedNet),
    afterAssumedApiFee: num(p.afterAssumedApiFee),
    assumedMonthlyGrowwApiFee: num(p.assumedMonthlyGrowwApiFee),
    pnlCaveat: text(p.pnlCaveat),
    recent: list(p.recent)
      .map(intent)
      .filter((row): row is BotIntent => row !== null),
    runs: runs(p.runs, rawRun),
    dryRuns: runs(p.dryRuns, rawRun),
  };
}

export function normalizeRunNow(payload: unknown): RunNowResult {
  const p = obj(payload);
  return { status: str(p.status).toUpperCase(), reason: text(p.reason) };
}

/** POST /ai-autotrade/test-scan → the run to follow; null when the answer names none. */
export function normalizeTestScan(payload: unknown): string | null {
  return text(obj(payload).runId);
}

/* ── backtest ── */

const UNDERLYINGS: readonly BacktestUnderlying[] = ['NIFTY', 'BANKNIFTY'];
const DAYS: readonly BacktestDays[] = [30, 60, 90];
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const day = (value: unknown): string | null => {
  const raw = text(value);
  return raw && DAY_RE.test(raw) ? raw : null;
};
const webUrl = (value: unknown): string | null => {
  const raw = text(value);
  return raw && /^https?:\/\//i.test(raw) ? raw : null;
};

export function backtestTrade(value: unknown): BacktestTrade | null {
  if (!isObj(value)) return null;
  const d = day(value.day);
  const growwSymbol = text(value.growwSymbol);
  const kind = value.kind === 'CE' || value.kind === 'PE' ? value.kind : null;
  const entry = num(value.entry);
  const exit = num(value.exit);
  const returnPct = num(value.returnPct);
  // A trade without its prices or result cannot be shown honestly — dropped, never zero-filled.
  if (!d || !growwSymbol || !kind || entry == null || exit == null || returnPct == null) {
    return null;
  }
  return {
    day: d,
    signalAt: iso(value.signalAt),
    entryAt: iso(value.entryAt),
    exitAt: iso(value.exitAt),
    movePct: num(value.movePct),
    spot: num(value.spot),
    kind,
    expiry: day(value.expiry),
    strike: num(value.strike),
    growwSymbol,
    entry,
    exit,
    exitReason: oneOf(value.exitReason, EXITS),
    returnPct,
    volumeAtEntry: num(value.volumeAtEntry),
  };
}

function backtestCurve(value: unknown): BacktestPoint[] {
  return list(value).flatMap((item): BacktestPoint[] => {
    if (!isObj(item)) return [];
    const d = day(item.day);
    const returnPct = num(item.returnPct);
    const equity = num(item.equity);
    return d && returnPct != null && equity != null ? [{ day: d, returnPct, equity }] : [];
  });
}

/**
 * GET /agents/index-trading/backtest. `asked` fills the index and window when an answer omits
 * them; the compounded return falls back to the curve's last point (equity starts at 100).
 */
export function normalizeBacktest(
  payload: unknown,
  asked: { underlying: BacktestUnderlying; days: BacktestDays },
): IndexBacktest {
  const p = obj(payload);
  const period = obj(p.period);
  const source = obj(p.source);
  const rules = obj(p.rules);
  const coverage = obj(p.coverage);
  const s = obj(p.summary);
  const exits = obj(s.exits);
  const curve = backtestCurve(p.curve);
  const trades = list(p.trades)
    .map(backtestTrade)
    .filter((row): row is BacktestTrade => row !== null);
  const lastEquity = curve[curve.length - 1]?.equity;
  return {
    underlying: oneOf(p.underlying, UNDERLYINGS) ?? asked.underlying,
    requestedDays: DAYS.find((d) => d === p.requestedDays) ?? asked.days,
    period: { from: day(period.from), to: day(period.to), sessions: count(period.sessions) },
    source: {
      name: text(source.name) ?? 'Groww',
      url: webUrl(source.url),
      generatedAt: iso(source.generatedAt),
      cached: bool(source.cached),
    },
    rules: {
      scanTimes: strings(rules.scanTimes),
      signal: text(rules.signal),
      entry: text(rules.entry),
      stopPct: num(rules.stopPct),
      targetPct: num(rules.targetPct),
      maxHoldMinutes: num(rules.maxHoldMinutes),
      minOptionVolume: num(rules.minOptionVolume),
    },
    coverage: {
      setups: count(coverage.setups),
      trades: count(coverage.trades),
      noSignal: count(coverage.noSignal),
      missingContract: count(coverage.missingContract),
      missingOptionData: count(coverage.missingOptionData),
    },
    summary: {
      trades: count(s.trades),
      wins: count(s.wins),
      losses: count(s.losses),
      flats: count(s.flats),
      winRate: num(s.winRate),
      averageReturnPct: num(s.averageReturnPct),
      grossReturnPct: num(s.grossReturnPct) ?? (lastEquity != null ? lastEquity - 100 : 0),
      maxDrawdownPct: num(s.maxDrawdownPct) ?? 0,
      profitFactor: num(s.profitFactor),
      exits: { target: count(exits.target), stop: count(exits.stop), time: count(exits.time) },
    },
    curve,
    trades,
    caveats: strings(p.caveats),
  };
}
