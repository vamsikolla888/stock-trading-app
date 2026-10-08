import type {
  Candidate,
  CandidateMetrics,
  CandidateVote,
  CheckState,
  Compatibility,
  Consensus,
  DayOutcome,
  Direction,
  DirectionMeasure,
  EdgeStats,
  LibraryStrategy,
  Levels,
  MarketDay,
  MeasureWindow,
  MorningCandidate,
  MorningCheck,
  MorningStatus,
  NextDayReport,
  NextDayStatus,
  PickList,
  PickOutcome,
  PickState,
  Regime,
  RegimeAction,
  RegimeClass,
  ReportData,
  ReportDocument,
  ReportListItem,
  RiskRules,
  ScoreComponent,
  SectorDay,
  Sizing,
  StrategyHits,
  StrategyKey,
  StrategyLibrary,
  StrategyMeasure,
  Tally,
  Tier,
  TrackRecord,
  TrackRecordResponse,
  TradeStats,
  Verdict,
  Vote,
} from '../types';

/**
 * Every Next-Day payload is parsed once here into a shape where every field exists — arrays are
 * arrays, numbers are finite or null — so a report stored by an older engine (no `twoSided`, no
 * `avoid`), a field a newer server adds, or a partly written document can never throw mid-render.
 * Candidates without a symbol are dropped; levels that cannot size a trade (no positive risk per
 * share or trigger) are dropped, so no screen divides by zero.
 */

type Json = Record<string, unknown>;

const isObj = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const obj = (value: unknown): Json => (isObj(value) ? value : {});
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;
const str = (value: unknown): string => text(value) ?? '';
const strings = (value: unknown): string[] =>
  list(value)
    .filter((item): item is string => typeof item === 'string' && item.trim() !== '')
    .map((item) => item.trim());
const bool = (value: unknown): boolean => value === true;

export function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
const count = (value: unknown): number => Math.max(0, Math.round(num(value) ?? 0));
const positive = (value: unknown): number | null => {
  const n = num(value);
  return n != null && n > 0 ? n : null;
};

/** A session date "YYYY-MM-DD"; null otherwise. */
export function sessionDate(value: unknown): string | null {
  const raw = text(value);
  return raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

/** An ISO instant from a string or a serialised Date; null when unparseable. */
function iso(value: unknown): string | null {
  const raw = text(value);
  return raw && Number.isFinite(Date.parse(raw)) ? raw : null;
}

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

export const STRATEGY_KEYS: readonly StrategyKey[] = [
  'momentum',
  'breakout',
  'futures-oi',
  'delivery',
  'relative-strength',
  'sector-momentum',
  'options-positioning',
  'volatility-squeeze',
  'news-catalyst',
  'mean-reversion',
  'gap-and-go',
];
const DIRECTIONS: readonly Direction[] = ['LONG', 'SHORT'];
const VOTES: readonly Vote[] = ['BUY', 'SELL', 'NEUTRAL'];
const VERDICTS: readonly Verdict[] = [
  'high-conviction-watchlist',
  'watchlist',
  'weak',
  'avoid',
  'ignore',
];
const TIERS: readonly Tier[] = ['exceptional', 'high', 'watchlist', 'weak', 'ignore'];
const CONSENSUS: readonly Consensus[] = ['strong', 'moderate', 'mixed', 'weak'];
const ACTIONS: readonly RegimeAction[] = ['normal', 'reduced', 'no-trade'];
const CHECK_STATES: readonly CheckState[] = ['bull', 'bear', 'neutral', 'warn', 'na'];
const MORNING_STATUSES: readonly MorningStatus[] = [
  'confirmed',
  'waiting',
  'gapped',
  'invalidated',
  'no-data',
];
const PICK_STATES: readonly PickState[] = [
  'pending',
  'not-triggered',
  'target',
  'stop',
  'close',
  'no-data',
];
const PICK_LISTS: readonly PickList[] = ['bullish', 'bearish', 'fno'];
const REGIME_CLASSES: readonly RegimeClass[] = ['bull', 'bear', 'choppy'];

const strategyKey = (value: unknown): StrategyKey | null => oneOfOrNull(value, STRATEGY_KEYS);

/* ── the report ───────────────────────────────────────────────────────────────────────────── */

function regime(value: unknown): Regime {
  const r = obj(value);
  return {
    label: text(r.label) ?? 'Unknown',
    score: num(r.score) ?? 0,
    bias: oneOf(r.bias, ['bull', 'bear', 'none'] as const, 'none'),
    volatile: bool(r.volatile),
    action: oneOf(r.action, ACTIONS, 'normal'),
    checks: list(r.checks).flatMap((item) => {
      const c = obj(item);
      const label = text(c.label);
      if (!label) return [];
      return [
        {
          key: text(c.key) ?? label,
          label,
          state: oneOf(c.state, CHECK_STATES, 'na'),
          detail: str(c.detail),
        },
      ];
    }),
  };
}

function market(value: unknown): MarketDay | null {
  if (!isObj(value)) return null;
  return {
    d: str(value.d),
    niftyClose: num(value.niftyClose),
    niftyRet1: num(value.niftyRet1),
    niftyRet5: num(value.niftyRet5),
    vix: num(value.vix),
    vixChangePct: num(value.vixChangePct),
    advancePct: num(value.advancePct),
    aboveEma20Pct: num(value.aboveEma20Pct),
  };
}

function sector(value: unknown): SectorDay | null {
  const s = obj(value);
  const key = text(s.key);
  if (!key) return null;
  return {
    key,
    label: text(s.label) ?? key,
    ret1: num(s.ret1),
    ret5: num(s.ret5),
    composite: num(s.composite),
    rank: num(s.rank),
    of: count(s.of),
  };
}

/** Levels that can size a trade, or null. */
export function levels(value: unknown): Levels | null {
  if (!isObj(value)) return null;
  const direction = oneOfOrNull(value.direction, DIRECTIONS);
  const trigger = positive(value.trigger);
  const riskPerShare = positive(value.riskPerShare);
  const invalidation = num(value.invalidation);
  const target1 = num(value.target1);
  const target2 = num(value.target2);
  if (!direction || trigger == null || riskPerShare == null) return null;
  if (invalidation == null || target1 == null || target2 == null) return null;
  return {
    direction,
    trigger,
    invalidation,
    target1,
    target2,
    riskPerShare,
    riskPct: num(value.riskPct) ?? 0,
    rewardRisk: num(value.rewardRisk) ?? 0,
    atr: num(value.atr),
    capNote: text(value.capNote),
  };
}

function sizing(value: unknown): Sizing | null {
  if (!isObj(value)) return null;
  const o = isObj(value.option) ? value.option : null;
  const kind = o ? oneOfOrNull(o.kind, ['CE', 'PE'] as const) : null;
  const strike = o ? num(o.strike) : null;
  const premium = o ? num(o.premium) : null;
  const maxLoss = o ? num(o.maxLoss) : null;
  return {
    riskBudget: num(value.riskBudget) ?? 0,
    shares: count(value.shares),
    notional: num(value.notional) ?? 0,
    lots: num(value.lots),
    lot: positive(value.lot),
    lotRisk: num(value.lotRisk),
    option:
      kind && strike != null && premium != null && maxLoss != null
        ? { kind, strike, premium, maxLoss }
        : null,
    notes: strings(value.notes),
  };
}

function component(value: unknown): ScoreComponent | null {
  const c = obj(value);
  const key = text(c.key);
  const max = positive(c.max);
  if (!key || max == null) return null;
  return {
    key,
    points: Math.max(0, num(c.points) ?? 0),
    max,
    measured: bool(c.measured),
    note: str(c.note),
  };
}

function vote(value: unknown): CandidateVote | null {
  const v = obj(value);
  const key = strategyKey(v.key);
  if (!key) return null;
  return {
    key,
    vote: oneOf(v.vote, VOTES, 'NEUTRAL'),
    strength: num(v.strength) ?? 0,
    reasons: strings(v.reasons),
    twoSided: bool(v.twoSided),
    unavailable: bool(v.unavailable),
    counted: bool(v.counted),
    countNote: text(v.countNote),
  };
}

function tally(value: unknown): Tally {
  const t = obj(value);
  return {
    buy: count(t.buy),
    sell: count(t.sell),
    neutral: count(t.neutral),
    excluded: count(t.excluded),
    consensus: oneOf(t.consensus, CONSENSUS, 'weak'),
    lean: oneOfOrNull(t.lean, DIRECTIONS),
  };
}

function metrics(value: unknown): CandidateMetrics {
  const m = obj(value);
  return {
    volRatio: num(m.volRatio),
    rsi: num(m.rsi),
    adx: num(m.adx),
    deliveryPct: num(m.deliveryPct),
    deliveryRatio: num(m.deliveryRatio),
    rs1: num(m.rs1),
    rs5: num(m.rs5),
    futChangePct: num(m.futChangePct),
    oiChangePct: num(m.oiChangePct),
    pcr: num(m.pcr),
    atmIvPct: num(m.atmIvPct),
  };
}

export function candidate(value: unknown): Candidate | null {
  const c = obj(value);
  const symbol = text(c.symbol)?.toUpperCase();
  if (!symbol) return null;
  const two = isObj(c.twoSided) ? c.twoSided : null;
  const twoSided = two ? { long: levels(two.long), short: levels(two.short) } : null;
  return {
    symbol,
    name: text(c.name) ?? symbol,
    sector: text(c.sector),
    sectorKey: text(c.sectorKey),
    fno: bool(c.fno),
    lot: positive(c.lot),
    close: num(c.close),
    changePct: num(c.changePct),
    direction: oneOf(c.direction, DIRECTIONS, 'LONG'),
    intradayOnly: bool(c.intradayOnly),
    score: num(c.score) ?? 0,
    measured: num(c.measured) ?? 0,
    hurdle: Math.max(0, num(c.hurdle) ?? 0),
    tier: oneOf(c.tier, TIERS, 'ignore'),
    verdict: oneOf(c.verdict, VERDICTS, 'ignore'),
    setup: str(c.setup),
    components: list(c.components)
      .map(component)
      .filter((x): x is ScoreComponent => x !== null),
    otherScore: num(c.otherScore) ?? 0,
    votes: list(c.votes)
      .map(vote)
      .filter((x): x is CandidateVote => x !== null),
    tally: tally(c.tally),
    levels: levels(c.levels),
    sizing: sizing(c.sizing),
    twoSided: twoSided && (twoSided.long || twoSided.short) ? twoSided : null,
    avoid: text(c.avoid),
    metrics: metrics(c.metrics),
    flags: strings(c.flags),
  };
}

function hits(value: unknown): StrategyHits | null {
  const h = obj(value);
  const key = strategyKey(h.key);
  if (!key) return null;
  return {
    key,
    buy: count(h.buy),
    sell: count(h.sell),
    setups: count(h.setups),
    // Absent on an older engine = counted (the vote was never excluded then).
    countedBuy: h.countedBuy !== false,
    countedSell: h.countedSell !== false,
    top: list(h.top).flatMap((item) => {
      const t = obj(item);
      const symbol = text(t.symbol)?.toUpperCase();
      if (!symbol) return [];
      return [
        {
          symbol,
          name: text(t.name) ?? symbol,
          vote: oneOf(t.vote, VOTES, 'NEUTRAL'),
          strength: num(t.strength) ?? 0,
          reason: str(t.reason),
          score: num(t.score),
        },
      ];
    }),
  };
}

function compatibility(value: unknown): Compatibility | null {
  const c = obj(value);
  const key = strategyKey(c.key);
  const side = oneOfOrNull(c.vote, ['BUY', 'SELL'] as const);
  if (!key || !side) return null;
  return {
    key,
    vote: side,
    counted: c.counted !== false,
    signals: count(c.signals),
    excessPct: num(c.excessPct),
    t: num(c.t),
    trades: count(c.trades),
    expectancyR: num(c.expectancyR),
    winRatePct: num(c.winRatePct),
    reason: str(c.reason),
  };
}

function risk(value: unknown): RiskRules {
  const r = obj(value);
  return {
    capital: positive(r.capital) ?? 1_000_000,
    riskPct: positive(r.riskPct) ?? 0.5,
    maxTradesPerDay: count(r.maxTradesPerDay),
    maxDailyLossPct: num(r.maxDailyLossPct) ?? 0,
    minRewardRisk: num(r.minRewardRisk) ?? 0,
    preferredRewardRisk: num(r.preferredRewardRisk) ?? 0,
    stopAfterLosses: count(r.stopAfterLosses),
  };
}

function reportLists(value: unknown) {
  const l = obj(value);
  const syms = (v: unknown) => strings(v).map((s) => s.toUpperCase());
  return {
    bullish: syms(l.bullish),
    bearish: syms(l.bearish),
    fno: syms(l.fno),
    avoid: syms(l.avoid),
    squeeze: syms(l.squeeze),
  };
}

function stringMap(value: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, v] of Object.entries(obj(value))) {
    const t = text(v);
    if (t) out[key.toUpperCase()] = t;
  }
  return out;
}

export function report(
  value: unknown,
  fallback: { date: string; forDate: string },
): NextDayReport | null {
  if (!isObj(value)) return null;
  const u = obj(value.universe);
  return {
    date: sessionDate(value.date) ?? fallback.date,
    forDate: sessionDate(value.forDate) ?? fallback.forDate,
    generatedAt: iso(value.generatedAt),
    regime: regime(value.regime),
    market: market(value.market),
    action: oneOf(value.action, ACTIONS, 'normal'),
    actionReason: str(value.actionReason),
    sectors: list(value.sectors)
      .map(sector)
      .filter((x): x is SectorDay => x !== null)
      .sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99)),
    universe: { stocks: count(u.stocks), scanned: count(u.scanned), fno: count(u.fno) },
    lists: reportLists(value.lists),
    avoidReasons: stringMap(value.avoidReasons),
    candidates: list(value.candidates)
      .map(candidate)
      .filter((x): x is Candidate => x !== null),
    strategyHits: list(value.strategyHits)
      .map(hits)
      .filter((x): x is StrategyHits => x !== null),
    compatibility: list(value.compatibility)
      .map(compatibility)
      .filter((x): x is Compatibility => x !== null),
    risk: risk(value.risk),
    caveats: strings(value.caveats),
  };
}

function morning(value: unknown): MorningCheck | null {
  if (!isObj(value)) return null;
  const m = obj(value.market);
  return {
    at: iso(value.at),
    minute: num(value.minute),
    market: {
      niftyPct: num(m.niftyPct),
      direction: oneOf(m.direction, ['up', 'down', 'flat', 'unknown'] as const, 'unknown'),
    },
    candidates: list(value.candidates).flatMap((item): MorningCandidate[] => {
      const c = obj(item);
      const symbol = text(c.symbol)?.toUpperCase();
      if (!symbol) return [];
      return [
        {
          symbol,
          direction: oneOf(c.direction, DIRECTIONS, 'LONG'),
          status: oneOf(c.status, MORNING_STATUSES, 'no-data'),
          ltp: num(c.ltp),
          gapPct: num(c.gapPct),
          gapAndGo: bool(c.gapAndGo),
          checks: list(c.checks).flatMap((k) => {
            const check = obj(k);
            const label = text(check.label);
            if (!label) return [];
            return [
              {
                key: text(check.key) ?? label,
                label,
                ok: typeof check.ok === 'boolean' ? check.ok : null,
                detail: str(check.detail),
              },
            ];
          }),
          note: str(c.note),
        },
      ];
    }),
    summary: str(value.summary),
  };
}

function pick(value: unknown): PickOutcome | null {
  const p = obj(value);
  const symbol = text(p.symbol)?.toUpperCase();
  if (!symbol) return null;
  return {
    symbol,
    list: oneOf(p.list, PICK_LISTS, 'bullish'),
    direction: oneOf(p.direction, DIRECTIONS, 'LONG'),
    score: num(p.score) ?? 0,
    state: oneOf(p.state, PICK_STATES, 'no-data'),
    entry: num(p.entry),
    exitPrice: num(p.exitPrice),
    r: num(p.r),
  };
}

export function dayOutcome(value: unknown): DayOutcome | null {
  if (!isObj(value)) return null;
  const date = sessionDate(value.date);
  const forDate = sessionDate(value.forDate);
  if (!date || !forDate) return null;
  return {
    date,
    forDate,
    picks: list(value.picks)
      .map(pick)
      .filter((x): x is PickOutcome => x !== null),
    triggered: count(value.triggered),
    wins: count(value.wins),
    totalR: num(value.totalR) ?? 0,
  };
}

/** Which session files a report used. A document without the record is taken as complete:
 *  only an explicit `false` says a file was missing. */
function reportData(value: unknown): ReportData {
  const d = obj(value);
  const flag = (v: unknown) => v !== false;
  return { cash: flag(d.cash), indices: flag(d.indices), fo: flag(d.fo), news: flag(d.news) };
}

export function normalizeReportDocument(value: unknown): ReportDocument | null {
  const d = obj(value);
  const date = sessionDate(d.date);
  if (!date) return null;
  const forDate = sessionDate(d.forDate) ?? date;
  const status = d.status === 'failed' ? 'failed' : 'completed';
  return {
    date,
    forDate,
    status,
    report: status === 'failed' ? null : report(d.report, { date, forDate }),
    error: text(d.error),
    durationMs: num(d.durationMs),
    data: reportData(d.data),
    morning: morning(d.morning),
    outcome: dayOutcome(d.outcome),
    updatedAt: iso(d.updatedAt),
  };
}

export function normalizeReports(value: unknown): ReportListItem[] {
  return list(obj(value).reports).flatMap((item): ReportListItem[] => {
    const d = obj(item);
    const date = sessionDate(d.date);
    if (!date) return [];
    const r = isObj(d.report) ? d.report : null;
    const lists = reportLists(r?.lists);
    const listed = new Set([...lists.bullish, ...lists.bearish, ...lists.fno]);
    return [
      {
        date,
        forDate: sessionDate(d.forDate) ?? date,
        status: d.status === 'failed' ? 'failed' : 'completed',
        regimeLabel: r ? text(obj(r.regime).label) : null,
        action: r ? oneOfOrNull(r.action, ACTIONS) : null,
        picks: listed.size,
        outcome: dayOutcome(d.outcome),
        error: text(d.error),
      },
    ];
  });
}

/* ── the track record ─────────────────────────────────────────────────────────────────────── */

function byList(value: unknown) {
  const b = obj(value);
  return { triggered: count(b.triggered), wins: count(b.wins), avgR: num(b.avgR) };
}

function trackRecord(value: unknown): TrackRecord {
  const r = obj(value);
  const by = obj(r.byList);
  return {
    days: count(r.days),
    picks: count(r.picks),
    triggered: count(r.triggered),
    wins: count(r.wins),
    winRatePct: num(r.winRatePct),
    avgR: num(r.avgR),
    totalR: num(r.totalR) ?? 0,
    lossStreak: count(r.lossStreak),
    byList: { bullish: byList(by.bullish), bearish: byList(by.bearish), fno: byList(by.fno) },
  };
}

export function normalizeTrackRecord(value: unknown): TrackRecordResponse {
  const v = obj(value);
  return {
    record: trackRecord(v.record),
    days: list(v.days)
      .map(dayOutcome)
      .filter((x): x is DayOutcome => x !== null)
      .sort((a, b) => b.forDate.localeCompare(a.forDate)),
  };
}

/* ── the scanner library ──────────────────────────────────────────────────────────────────── */

function horizons(value: unknown) {
  const h = obj(value);
  return { d1: num(h.d1), d5: num(h.d5) };
}

export function edgeStats(value: unknown): EdgeStats {
  const e = obj(value);
  return {
    signals: count(e.signals),
    meanPct: horizons(e.meanPct),
    excessPct: horizons(e.excessPct),
    t: horizons(e.t),
    hitPct: num(e.hitPct),
  };
}

function tradeStats(value: unknown): TradeStats {
  const t = obj(value);
  return {
    signals: count(t.signals),
    trades: count(t.trades),
    wins: count(t.wins),
    winRatePct: num(t.winRatePct),
    avgR: num(t.avgR),
    totalR: num(t.totalR) ?? 0,
    profitFactor: num(t.profitFactor),
    maxDrawdownR: num(t.maxDrawdownR) ?? 0,
    avgWinR: num(t.avgWinR),
    avgLossR: num(t.avgLossR),
    triggerRatePct: num(t.triggerRatePct),
  };
}

function directionMeasure(value: unknown): DirectionMeasure {
  const d = obj(value);
  const regimes = obj(d.byRegime);
  const byRegime = {} as Record<RegimeClass, EdgeStats>;
  for (const k of REGIME_CLASSES) byRegime[k] = edgeStats(regimes[k]);
  return { edge: edgeStats(d.edge), byRegime, trade: tradeStats(d.trade) };
}

function strategyMeasure(value: unknown, key: StrategyKey): StrategyMeasure | null {
  if (!isObj(value)) return null;
  return {
    key,
    measurable: value.measurable !== false,
    long: directionMeasure(value.long),
    short: directionMeasure(value.short),
  };
}

function measureWindow(value: unknown): MeasureWindow | null {
  if (!isObj(value)) return null;
  return {
    from: sessionDate(value.from),
    to: sessionDate(value.to),
    sessions: count(value.sessions),
    stocks: count(value.stocks),
  };
}

function libraryStrategy(value: unknown): LibraryStrategy | null {
  const s = obj(value);
  const key = strategyKey(s.key);
  if (!key) return null;
  return {
    key,
    name: text(s.name) ?? key,
    family: str(s.family),
    summary: str(s.summary),
    when: s.when === 'morning' ? 'morning' : 'evening',
    measurable: s.measurable !== false,
    needs: str(s.needs),
    rules: strings(s.rules),
    measure: strategyMeasure(s.measure, key),
    compatibility: list(s.compatibility)
      .map(compatibility)
      .filter((x): x is Compatibility => x !== null && x.key === key),
    today: hits(s.today),
  };
}

export function normalizeLibrary(value: unknown): StrategyLibrary {
  const v = obj(value);
  const r = obj(v.risk);
  const lv = obj(r.levels);
  const rules = obj(v.rules);
  return {
    strategies: list(v.strategies)
      .map(libraryStrategy)
      .filter((x): x is LibraryStrategy => x !== null),
    tiers: list(v.tiers).flatMap((item) => {
      const t = obj(item);
      const tier = oneOfOrNull(t.tier, TIERS);
      return tier ? [{ tier, edge: edgeStats(t.edge), trade: tradeStats(t.trade) }] : [];
    }),
    window: measureWindow(v.window),
    measuredAt: iso(v.measuredAt),
    caveats: strings(v.caveats),
    reportDate: sessionDate(v.reportDate),
    weights: list(v.weights).flatMap((item) => {
      const w = obj(item);
      const key = text(w.key);
      const max = positive(w.max);
      return key && max != null ? [{ key, label: text(w.label) ?? key, max }] : [];
    }),
    tiersTable: list(v.tiersTable).flatMap((item) => {
      const t = obj(item);
      const tier = oneOfOrNull(t.tier, TIERS);
      return tier ? [{ tier, from: count(t.from), label: text(t.label) ?? tier }] : [];
    }),
    risk: {
      ...risk(r),
      levels: {
        triggerBufferPct: num(lv.triggerBufferPct) ?? 0,
        minStopAtr: num(lv.minStopAtr) ?? 0,
        maxStopAtr: num(lv.maxStopAtr) ?? 0,
        t1R: num(lv.t1R) ?? 0,
        t2R: num(lv.t2R) ?? 0,
        minRewardRisk: num(lv.minRewardRisk) ?? 0,
      },
      tradableScore: num(r.tradableScore) ?? 0,
    },
    rules: {
      minSignals: count(rules.minSignals),
      harmT: num(rules.harmT) ?? 0,
      minRegimeSignals: count(rules.minRegimeSignals),
    },
  };
}

/* ── data status ──────────────────────────────────────────────────────────────────────────── */

export function normalizeStatus(value: unknown): NextDayStatus {
  const v = obj(value);
  const eod = obj(v.eod);
  const m = isObj(v.measure) ? v.measure : null;
  const latest = isObj(v.latest) ? v.latest : null;
  const latestDate = latest ? sessionDate(latest.date) : null;
  const q = obj(v.queue);
  return {
    eod: {
      sessions: count(eod.sessions),
      first: sessionDate(eod.first),
      last: sessionDate(eod.last),
      foSessions: count(eod.foSessions),
    },
    measure: m
      ? { at: iso(m.at), durationMs: num(m.durationMs), window: measureWindow(m.window) }
      : null,
    latest:
      latest && latestDate
        ? {
            date: latestDate,
            forDate: sessionDate(latest.forDate) ?? latestDate,
            status: text(latest.status) ?? 'unknown',
            error: text(latest.error),
            updatedAt: iso(latest.updatedAt),
            data: reportData(latest.data),
            morningAt: iso(obj(latest.morning).at),
          }
        : null,
    queue: { workers: num(q.workers), active: count(q.active), waiting: count(q.waiting) },
  };
}

/** POST /next-day/{run,backfill,measure,morning}: `{ queued }` — false = one already waiting. */
export function normalizeQueued(value: unknown): { queued: boolean } {
  return { queued: obj(value).queued !== false };
}
