import {
  DEPLOY_PLATFORM_KEYS,
  INTRADAY_PLATFORM_KEY,
  type BrokerId,
  type BrokerLink,
  type DeployDefaults,
  type DeployEngine,
  type DeployEvent,
  type DeployEventKind,
  type DeployExitReason,
  type DeployLive,
  type DeployMode,
  type Deployment,
  type DeploymentDetail,
  type DeploymentList,
  type DeployPlatformKey,
  type DeployStats,
  type DeployStatus,
  type DeployStockRow,
  type DeployTarget,
  type DeployTrade,
  type DeployTradeStatus,
  type LiveLimits,
  type MyDeployment,
  type PlanSummary,
  type RunnerState,
  type SquareOffResult,
  type StockVerdict,
  type UniverseKey,
  type VariantKey,
} from '../types';

/**
 * Every deployment payload — both engines — is parsed once here into the app's one model, where
 * every field exists: arrays are arrays, numbers are finite or null, enums fall back to a neutral
 * value. A server that lags or leads the app (a field renamed, a new exit reason) can never throw
 * mid-render. A row without an id is dropped: nothing can act on it.
 */

type Json = Record<string, unknown>;

const obj = (value: unknown): Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Json) : {};
const isObj = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;
const strings = (value: unknown): string[] =>
  list(value)
    .map(text)
    .filter((item): item is string => item !== null);
const num = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;
const money = (value: unknown): number => num(value) ?? 0;
const count = (value: unknown): number => Math.max(0, Math.round(num(value) ?? 0));
const bool = (value: unknown): boolean => value === true;

function oneOf<T extends string>(value: unknown, options: readonly T[], fallback: T): T {
  return typeof value === 'string' && (options as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}
function oneOfOrNull<T extends string>(value: unknown, options: readonly T[]): T | null {
  return typeof value === 'string' && (options as readonly string[]).includes(value)
    ? (value as T)
    : null;
}

const MODES: readonly DeployMode[] = ['paper', 'live'];
const STATUSES: readonly DeployStatus[] = ['active', 'paused', 'stopped'];
const RUNNER: readonly RunnerState[] = ['running', 'market-closed', 'not-running', 'stopped'];
const BROKERS: readonly BrokerId[] = ['mstock', 'groww'];
const VARIANTS: readonly VariantKey[] = ['improved', 'base'];
const UNIVERSES: readonly UniverseKey[] = ['nifty50', 'nifty500'];
const VERDICTS: readonly StockVerdict[] = ['works', 'mixed', 'avoid', 'thin'];
const TRADE_STATUSES: readonly DeployTradeStatus[] = [
  'planned',
  'waiting',
  'pending-entry',
  'open',
  'pending-exit',
  'closed',
  'cancelled',
  'failed',
];
const EXIT_REASONS: readonly DeployExitReason[] = [
  'stop',
  'target',
  'signal',
  'time',
  'upper-band',
  'mid-band',
  'square-off',
  'loss-limit',
  'manual',
  'stopped',
];
const EVENT_KINDS: readonly DeployEventKind[] = [
  'start',
  'plan',
  'signal',
  'skip',
  'order',
  'fill',
  'exit',
  'cancel',
  'error',
  'halt',
  'info',
];

export function isDeployPlatformKey(value: unknown): value is DeployPlatformKey {
  return typeof value === 'string' && (DEPLOY_PLATFORM_KEYS as readonly string[]).includes(value);
}

/** Which server engine runs a target: the intraday platform key has its own. */
export function engineOf(target: DeployTarget): DeployEngine {
  return target.kind === 'platform' && target.key === INTRADAY_PLATFORM_KEY ? 'intraday' : 'swing';
}

/* ── Rows ── */

function plan(value: unknown): PlanSummary | null {
  if (!isObj(value)) return null;
  const barDate = text(value.barDate);
  const forSession = text(value.forSession);
  if (!barDate || !forSession) return null;
  return {
    barDate,
    forSession,
    at: text(value.at),
    entries: count(value.entries),
    exits: count(value.exits),
    skipped: count(value.skipped),
    signals: count(value.signals),
    note: text(value.note),
  };
}

export function normalizeDeployment(value: unknown, engine: DeployEngine): Deployment | null {
  const d = obj(value);
  const id = text(d.id);
  if (!id) return null;
  const runner = obj(d.runner);
  const status = oneOf(d.status, STATUSES, 'stopped');
  return {
    id,
    engine,
    source:
      engine === 'intraday' ? 'platform' : oneOf(d.source, ['strategy', 'platform'], 'strategy'),
    strategyKey: text(d.strategyKey) ?? '',
    strategyId: text(d.strategyId),
    strategyName: text(d.strategyName),
    mode: oneOf(d.mode, MODES, 'paper'),
    status,
    symbols: strings(d.symbols),
    capitalPerTrade: money(d.capitalPerTrade),
    maxOpenPositions: count(d.maxOpenPositions),
    maxEntriesPerDay: count(d.maxEntriesPerDay),
    broker: oneOfOrNull(d.broker, BROKERS),
    startedAt: text(d.startedAt) ?? '',
    stoppedAt: text(d.stoppedAt),
    liveApprovedAt: text(d.liveApprovedAt),
    lastTickAt: text(d.lastTickAt),
    lastError: text(d.lastError),
    lastErrorAt: text(d.lastErrorAt),
    runner: {
      // An unknown runner word reads as "not running" only for a live one; stopped stays stopped.
      state: oneOf(runner.state, RUNNER, status === 'stopped' ? 'stopped' : 'market-closed'),
      message: text(runner.message),
    },
    lastPlan: plan(d.lastPlan),
    rulesChanged: bool(d.rulesChanged),
    variant: oneOfOrNull(d.variant, VARIANTS),
    universe: oneOfOrNull(d.universe, UNIVERSES),
    maxEntriesPerStockPerDay: num(d.maxEntriesPerStockPerDay),
    dailyLossLimit: num(d.dailyLossLimit),
    haltedToday: bool(d.haltedToday),
    haltReason: text(d.haltReason),
  };
}

function exitPlan(value: unknown): DeployTrade['exitPlan'] {
  if (!isObj(value)) return null;
  const reason = oneOfOrNull(value.reason, EXIT_REASONS);
  if (!reason) return null;
  return { reason, decidedOn: text(value.decidedOn), level: num(value.level) };
}

export function normalizeTrade(value: unknown): DeployTrade | null {
  const t = obj(value);
  const id = text(t.id);
  const symbol = text(t.symbol);
  if (!id || !symbol) return null;
  return {
    id,
    symbol: symbol.toUpperCase(),
    status: oneOf(t.status, TRADE_STATUSES, 'failed'),
    qty: count(t.qty),
    stop: num(t.stop),
    entryPrice: num(t.entryPrice),
    entryAt: text(t.entryAt),
    exitReason: oneOfOrNull(t.exitReason, EXIT_REASONS),
    exitPrice: num(t.exitPrice),
    exitAt: text(t.exitAt),
    grossPnl: num(t.grossPnl),
    charges: num(t.charges),
    netPnl: num(t.netPnl),
    returnPct: num(t.returnPct),
    ltp: num(t.ltp),
    unrealised: num(t.unrealised),
    unrealisedPct: num(t.unrealisedPct),
    error: text(t.error),
    signalClose: num(t.signalClose),
    signalDate: text(t.signalDate),
    entryFrom: text(t.entryFrom),
    lastSession: text(t.lastSession),
    trigger: num(t.trigger),
    target: num(t.target),
    refPrice: num(t.refPrice),
    entryDay: text(t.entryDay),
    sessionsHeld: num(t.sessionsHeld),
    exitPlan: exitPlan(t.exitPlan),
    cancelReason: text(t.cancelReason),
    day: text(t.day),
    volumeRatio: num(t.volumeRatio),
    armed: bool(t.armed),
  };
}

function event(value: unknown): DeployEvent | null {
  const e = obj(value);
  const at = text(e.at);
  const message = text(e.message);
  if (!at || !message) return null;
  return {
    at,
    kind: oneOf(e.kind, EVENT_KINDS, 'info'),
    symbol: text(e.symbol),
    message,
  };
}

const rows = <T>(value: unknown, parse: (row: unknown) => T | null): T[] =>
  list(value)
    .map(parse)
    .filter((row): row is T => row !== null);

function byExit(value: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, n] of Object.entries(obj(value))) {
    const c = num(n);
    if (c != null && c > 0) out[key] = Math.round(c);
  }
  return out;
}

function stats(value: unknown, engine: DeployEngine): DeployStats {
  const s = obj(value);
  return {
    trades: count(s.trades),
    wins: count(s.wins),
    losses: count(s.losses),
    winRate: num(s.winRate),
    grossPnl: money(s.grossPnl),
    charges: money(s.charges),
    netPnl: money(s.netPnl),
    avgReturnPct: num(s.avgReturnPct),
    best: num(s.best),
    worst: num(s.worst),
    avgSessionsHeld: engine === 'swing' ? num(s.avgSessionsHeld) : null,
    sessions: engine === 'intraday' ? count(s.sessions) : null,
    failed: count(engine === 'intraday' ? s.failedEntries : s.failed),
    cancelled: count(s.cancelled),
    byExit: byExit(s.byExit),
  };
}

function expected(value: unknown): DeploymentDetail['expected'] {
  if (!isObj(value)) return null;
  const avg = num(value.avgReturnPct);
  if (avg == null) return null;
  return {
    avgReturnPct: avg,
    winRate: num(value.winRate),
    trades: count(value.trades),
    current: typeof value.current === 'boolean' ? value.current : null,
    stocks: num(value.stocks),
  };
}

/** GET …/deployments/:id — null when the payload names no deployment (nothing to render). */
export function normalizeDetail(value: unknown, engine: DeployEngine): DeploymentDetail | null {
  const d = obj(value);
  const deployment = normalizeDeployment(d.deployment, engine);
  if (!deployment) return null;
  const money_ = isObj(d.money) ? d.money : null;
  const today = isObj(d.today) ? d.today : null;
  const positions = rows(d.positions, normalizeTrade);
  return {
    deployment,
    money:
      engine === 'swing' || money_
        ? {
            invested: money(money_?.invested),
            unrealised: money(money_?.unrealised),
            unpriced: count(money_?.unpriced),
          }
        : null,
    today:
      engine === 'intraday' || today
        ? {
            realised: money(today?.realised),
            unrealised: money(today?.unrealised),
            total: money(today?.total),
            openPositions: today ? count(today.openPositions) : positions.length,
            closedToday: count(today?.closedToday),
            entries: count(today?.entries),
            refused: count(today?.refused),
          }
        : null,
    stats: stats(d.stats, engine),
    expected: expected(d.expected),
    positions,
    orders: rows(d.orders, normalizeTrade),
    trades: rows(d.trades, normalizeTrade),
    events: rows(d.events, event),
    quotesAsOf: text(d.quotesAsOf),
  };
}

/* ── The list (with the live readiness block) ── */

function limits(value: unknown): LiveLimits {
  const l = obj(value);
  return {
    maxOrderValue: money(l.maxOrderValue),
    maxOpenPositions: count(l.maxOpenPositions),
    maxDailyLoss: money(l.maxDailyLoss),
    maxOrdersPerSymbolPerDay: count(l.maxOrdersPerSymbolPerDay),
  };
}

function broker(value: unknown): BrokerLink | null {
  const b = obj(value);
  const id = oneOfOrNull(b.broker, BROKERS);
  if (!id) return null;
  return { broker: id, connected: bool(b.connected), label: text(b.label) };
}

function live(value: unknown): DeployLive {
  const l = obj(value);
  const phrase = text(l.phrase);
  return {
    limits: limits(l.limits),
    // Unknown reads as OFF / ON in the safe direction: live stays blocked until the server says.
    masterSwitch: bool(l.masterSwitch),
    safeMode: l.safeMode !== false,
    brokers: rows(l.brokers, broker),
    phrase: phrase ? phrase.toUpperCase() : null,
    needsBacktest: bool(l.needsBacktest),
  };
}

function defaults(value: unknown, engine: DeployEngine): DeployDefaults {
  const d = obj(value);
  return {
    capitalPerTrade: money(d.capitalPerTrade),
    maxOpenPositions: count(d.maxOpenPositions),
    maxEntriesPerDay: count(d.maxEntriesPerDay),
    dailyLossLimit: engine === 'intraday' ? num(d.dailyLossLimit) : null,
  };
}

function stockRow(value: unknown): DeployStockRow | null {
  const r = obj(value);
  const symbol = text(r.symbol);
  if (!symbol) return null;
  return {
    symbol: symbol.toUpperCase(),
    trades: count(r.trades),
    winRate: num(r.winRate),
    avgReturnPct: num(r.avgReturnPct),
    profitFactor: num(r.profitFactor),
    verdict: oneOfOrNull(r.verdict, VERDICTS),
  };
}

/** The page's own backtested stock rows (the intraday strategy passes its variant's list). */
export function normalizeStockRows(value: unknown): DeployStockRow[] {
  return rows(value, stockRow);
}

function strategy(value: unknown): DeploymentList['strategy'] {
  if (!isObj(value)) return null;
  const bt = obj(value.backtest);
  const exits = Array.isArray(value.exits) ? strings(value.exits) : null;
  return {
    source: oneOf(value.source, ['strategy', 'platform'], 'strategy'),
    name: text(value.name) ?? '',
    howItTrades: strings(value.howItTrades),
    universe: text(value.universe) ?? '',
    exits,
    backtest: {
      ran: bool(bt.ran),
      current: bool(bt.current),
      avgReturnPct: num(bt.avgReturnPct),
      winRate: num(bt.winRate),
      trades: count(bt.trades),
    },
    stocks: rows(value.stocks, stockRow),
  };
}

/** GET …/deployments. */
export function normalizeList(value: unknown, engine: DeployEngine): DeploymentList {
  const d = obj(value);
  const defs = obj(d.defaults);
  return {
    engine,
    deployments: rows(d.deployments, (row) => normalizeDeployment(row, engine)),
    defaults: { paper: defaults(defs.paper, engine), live: defaults(defs.live, engine) },
    strategy: engine === 'swing' ? strategy(d.strategy) : null,
    live: live(d.live),
  };
}

/** GET /strategies/deployments. */
export function normalizeMine(value: unknown): MyDeployment[] {
  return rows(obj(value).deployments, (row) => {
    const d = obj(row);
    const id = text(d.id);
    if (!id) return null;
    return {
      id,
      strategyKey: text(d.strategyKey) ?? '',
      strategyId: text(d.strategyId),
      mode: oneOf(d.mode, MODES, 'paper'),
      status: oneOf(d.status, STATUSES, 'active'),
    };
  });
}

/** POST …/square-off. Intraday has no `atNextOpen` (it always sells now). */
export function normalizeSquareOff(value: unknown): SquareOffResult {
  const d = obj(value);
  return { squaredOff: count(d.squaredOff), atNextOpen: count(d.atNextOpen) };
}
