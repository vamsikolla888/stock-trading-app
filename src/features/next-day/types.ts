/**
 * The Next-Day Opportunity system (server: modules/next-day, /api/v1/next-day). Shapes mirror the
 * server's engine, measure, morning and outcome types after lib/normalize.ts: every field exists,
 * numbers are finite or null. Every percent is already a percent, every price in rupees.
 */

export type Direction = 'LONG' | 'SHORT';
export type Vote = 'BUY' | 'SELL' | 'NEUTRAL';
export type Verdict = 'high-conviction-watchlist' | 'watchlist' | 'weak' | 'avoid' | 'ignore';
export type Tier = 'exceptional' | 'high' | 'watchlist' | 'weak' | 'ignore';
export type Consensus = 'strong' | 'moderate' | 'mixed' | 'weak';
export type RegimeAction = 'normal' | 'reduced' | 'no-trade';
export type CheckState = 'bull' | 'bear' | 'neutral' | 'warn' | 'na';
export type RegimeClass = 'bull' | 'bear' | 'choppy';
export type StrategyKey =
  | 'momentum'
  | 'breakout'
  | 'futures-oi'
  | 'delivery'
  | 'relative-strength'
  | 'sector-momentum'
  | 'options-positioning'
  | 'volatility-squeeze'
  | 'news-catalyst'
  | 'mean-reversion'
  | 'gap-and-go';

export interface RegimeCheck {
  key: string;
  label: string;
  state: CheckState;
  detail: string;
}

export interface Regime {
  label: string;
  /** −7…+7: trend, breadth, sectors and Nifty futures added up. */
  score: number;
  bias: 'bull' | 'bear' | 'none';
  volatile: boolean;
  action: RegimeAction;
  checks: RegimeCheck[];
}

export interface MarketDay {
  d: string;
  niftyClose: number | null;
  niftyRet1: number | null;
  niftyRet5: number | null;
  vix: number | null;
  vixChangePct: number | null;
  advancePct: number | null;
  aboveEma20Pct: number | null;
}

export interface SectorDay {
  key: string;
  label: string;
  ret1: number | null;
  ret5: number | null;
  composite: number | null;
  /** 1 = strongest of the measured sectors. */
  rank: number | null;
  of: number;
}

export interface Levels {
  direction: Direction;
  trigger: number;
  invalidation: number;
  target1: number;
  target2: number;
  riskPerShare: number;
  riskPct: number;
  rewardRisk: number;
  atr: number | null;
  /** A level that may cap target 2 (52-week extreme, the heaviest opposite OI strike). */
  capNote: string | null;
}

export interface OptionAlternative {
  kind: 'CE' | 'PE';
  strike: number;
  premium: number;
  maxLoss: number;
}

export interface Sizing {
  riskBudget: number;
  shares: number;
  notional: number;
  lots: number | null;
  lot: number | null;
  lotRisk: number | null;
  option: OptionAlternative | null;
  notes: string[];
}

export interface ScoreComponent {
  key: string;
  points: number;
  max: number;
  /** false = no data; the component leaves the denominator. */
  measured: boolean;
  note: string;
}

export interface CandidateVote {
  key: StrategyKey;
  vote: Vote;
  strength: number;
  reasons: string[];
  twoSided: boolean;
  unavailable: boolean;
  counted: boolean;
  countNote: string | null;
}

export interface Tally {
  buy: number;
  sell: number;
  neutral: number;
  excluded: number;
  consensus: Consensus;
  lean: Direction | null;
}

export interface CandidateMetrics {
  volRatio: number | null;
  rsi: number | null;
  adx: number | null;
  deliveryPct: number | null;
  deliveryRatio: number | null;
  rs1: number | null;
  rs5: number | null;
  futChangePct: number | null;
  oiChangePct: number | null;
  pcr: number | null;
  atmIvPct: number | null;
}

export interface Candidate {
  symbol: string;
  name: string;
  sector: string | null;
  sectorKey: string | null;
  fno: boolean;
  lot: number | null;
  close: number | null;
  changePct: number | null;
  direction: Direction;
  intradayOnly: boolean;
  score: number;
  /** Out of how many of the 100 points could be measured. */
  measured: number;
  /** Points held back against the regime and the sector. */
  hurdle: number;
  tier: Tier;
  verdict: Verdict;
  setup: string;
  components: ScoreComponent[];
  otherScore: number;
  votes: CandidateVote[];
  tally: Tally;
  levels: Levels | null;
  sizing: Sizing | null;
  /** A volatility squeeze: both sides' levels (older reports do not carry it). */
  twoSided: { long: Levels | null; short: Levels | null } | null;
  avoid: string | null;
  metrics: CandidateMetrics;
  flags: string[];
}

export interface StrategyHitTop {
  symbol: string;
  name: string;
  vote: Vote;
  strength: number;
  reason: string;
  score: number | null;
}

export interface StrategyHits {
  key: StrategyKey;
  buy: number;
  sell: number;
  setups: number;
  countedBuy: boolean;
  countedSell: boolean;
  top: StrategyHitTop[];
}

export interface EdgeStats {
  signals: number;
  meanPct: { d1: number | null; d5: number | null };
  excessPct: { d1: number | null; d5: number | null };
  t: { d1: number | null; d5: number | null };
  hitPct: number | null;
}

export interface TradeStats {
  signals: number;
  trades: number;
  wins: number;
  winRatePct: number | null;
  avgR: number | null;
  totalR: number;
  profitFactor: number | null;
  maxDrawdownR: number;
  avgWinR: number | null;
  avgLossR: number | null;
  triggerRatePct: number | null;
}

export interface Compatibility {
  key: StrategyKey;
  vote: 'BUY' | 'SELL';
  counted: boolean;
  signals: number;
  excessPct: number | null;
  t: number | null;
  trades: number;
  expectancyR: number | null;
  winRatePct: number | null;
  reason: string;
}

export interface RiskRules {
  capital: number;
  riskPct: number;
  maxTradesPerDay: number;
  maxDailyLossPct: number;
  minRewardRisk: number;
  preferredRewardRisk: number;
  stopAfterLosses: number;
}

export interface ReportLists {
  bullish: string[];
  bearish: string[];
  fno: string[];
  avoid: string[];
  squeeze: string[];
}

export interface NextDayReport {
  date: string;
  forDate: string;
  generatedAt: string | null;
  regime: Regime;
  market: MarketDay | null;
  action: RegimeAction;
  actionReason: string;
  sectors: SectorDay[];
  universe: { stocks: number; scanned: number; fno: number };
  lists: ReportLists;
  avoidReasons: Record<string, string>;
  candidates: Candidate[];
  strategyHits: StrategyHits[];
  compatibility: Compatibility[];
  risk: RiskRules;
  caveats: string[];
}

export type MorningStatus = 'confirmed' | 'waiting' | 'gapped' | 'invalidated' | 'no-data';

export interface MorningCandidate {
  symbol: string;
  direction: Direction;
  status: MorningStatus;
  ltp: number | null;
  gapPct: number | null;
  gapAndGo: boolean;
  checks: { key: string; label: string; ok: boolean | null; detail: string }[];
  note: string;
}

export interface MorningCheck {
  at: string | null;
  minute: number | null;
  market: { niftyPct: number | null; direction: 'up' | 'down' | 'flat' | 'unknown' };
  candidates: MorningCandidate[];
  summary: string;
}

export type PickState = 'pending' | 'not-triggered' | 'target' | 'stop' | 'close' | 'no-data';
export type PickList = 'bullish' | 'bearish' | 'fno';

export interface PickOutcome {
  symbol: string;
  list: PickList;
  direction: Direction;
  score: number;
  state: PickState;
  entry: number | null;
  exitPrice: number | null;
  r: number | null;
}

export interface DayOutcome {
  date: string;
  forDate: string;
  picks: PickOutcome[];
  triggered: number;
  wins: number;
  totalR: number;
}

export interface ReportData {
  cash: boolean;
  indices: boolean;
  fo: boolean;
  news: boolean;
}

export interface ReportDocument {
  /** The session analysed. */
  date: string;
  /** The session the candidates are for. */
  forDate: string;
  status: 'completed' | 'failed';
  report: NextDayReport | null;
  error: string | null;
  durationMs: number | null;
  data: ReportData;
  morning: MorningCheck | null;
  outcome: DayOutcome | null;
  updatedAt: string | null;
}

export interface ReportListItem {
  date: string;
  forDate: string;
  status: 'completed' | 'failed';
  regimeLabel: string | null;
  action: RegimeAction | null;
  /** Bullish + bearish + F&O names listed (a name in two lists counts once). */
  picks: number;
  outcome: DayOutcome | null;
  error: string | null;
}

export interface TrackRecordByList {
  triggered: number;
  wins: number;
  avgR: number | null;
}

export interface TrackRecord {
  days: number;
  picks: number;
  triggered: number;
  wins: number;
  winRatePct: number | null;
  avgR: number | null;
  totalR: number;
  lossStreak: number;
  byList: Record<PickList, TrackRecordByList>;
}

export interface TrackRecordResponse {
  record: TrackRecord;
  /** Newest first. */
  days: DayOutcome[];
}

export interface DirectionMeasure {
  edge: EdgeStats;
  byRegime: Record<RegimeClass, EdgeStats>;
  trade: TradeStats;
}

export interface StrategyMeasure {
  key: StrategyKey;
  measurable: boolean;
  long: DirectionMeasure;
  short: DirectionMeasure;
}

export interface LibraryStrategy {
  key: StrategyKey;
  name: string;
  family: string;
  summary: string;
  when: 'evening' | 'morning';
  measurable: boolean;
  needs: string;
  rules: string[];
  measure: StrategyMeasure | null;
  compatibility: Compatibility[];
  today: StrategyHits | null;
}

export interface MeasureWindow {
  from: string | null;
  to: string | null;
  sessions: number;
  stocks: number;
}

export interface LibraryRisk extends RiskRules {
  levels: {
    triggerBufferPct: number;
    minStopAtr: number;
    maxStopAtr: number;
    t1R: number;
    t2R: number;
    minRewardRisk: number;
  };
  tradableScore: number;
}

export interface StrategyLibrary {
  strategies: LibraryStrategy[];
  tiers: { tier: Tier; edge: EdgeStats; trade: TradeStats }[];
  window: MeasureWindow | null;
  measuredAt: string | null;
  caveats: string[];
  reportDate: string | null;
  weights: { key: string; label: string; max: number }[];
  tiersTable: { tier: Tier; from: number; label: string }[];
  risk: LibraryRisk;
  rules: { minSignals: number; harmT: number; minRegimeSignals: number };
}

export interface NextDayStatus {
  eod: { sessions: number; first: string | null; last: string | null; foSessions: number };
  measure: { at: string | null; durationMs: number | null; window: MeasureWindow | null } | null;
  latest: {
    date: string;
    forDate: string;
    status: string;
    error: string | null;
    updatedAt: string | null;
    data: ReportData;
    morningAt: string | null;
  } | null;
  queue: { workers: number | null; active: number; waiting: number };
}

export type NextDayAction = 'run' | 'backfill' | 'measure' | 'morning';
