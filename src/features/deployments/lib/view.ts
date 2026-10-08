import type { StatusTone } from '@/features/settings/lib/status';
import { isMarketOpen } from '@/lib/utils/market';

import type {
  BrokerId,
  DeployEngine,
  DeployEvent,
  DeployEventKind,
  DeployExitReason,
  DeployInput,
  DeployMode,
  Deployment,
  DeploymentList,
  DeployStockRow,
  DeployStatus,
  DeployTarget,
  DeployTrade,
  LiveLimits,
  MyDeployment,
  PlanSummary,
  RunnerState,
  StockVerdict,
  UniverseKey,
  VariantKey,
} from '../types';

/**
 * Words and small arithmetic for a DEPLOYED strategy (paper or live), for both engines — the
 * web's lib/deploymentView.ts and lib/swingDeployView.ts in one place. Short on purpose; the tab
 * leads with numbers. Pure, so it is pinned by __tests__/view.test.ts.
 */

/* ── Status words ── */

export const STATUS_VIEW: Record<DeployStatus, { label: string; tone: StatusTone }> = {
  active: { label: 'Active', tone: 'ok' },
  paused: { label: 'Paused', tone: 'warn' },
  stopped: { label: 'Stopped', tone: 'neutral' },
};

export const RUNNER_VIEW: Record<RunnerState, { label: string; tone: StatusTone }> = {
  running: { label: 'Running', tone: 'info' },
  'market-closed': { label: 'Market closed', tone: 'neutral' },
  'not-running': { label: 'Not running', tone: 'bad' },
  stopped: { label: 'Stopped', tone: 'neutral' },
};

/** The runner pill: "Checked 2m ago" while it runs, else its state. */
export function runnerLabel(
  d: Pick<Deployment, 'runner' | 'lastTickAt'>,
  ago: (iso: string) => string,
): string {
  if (d.runner.state === 'running' && d.lastTickAt) return `Checked ${ago(d.lastTickAt)}`;
  return RUNNER_VIEW[d.runner.state].label;
}

export const EXIT_WORDS: Record<DeployExitReason, string> = {
  stop: 'Stop',
  target: 'Target',
  signal: 'Exit rule',
  time: 'Time stop',
  'upper-band': 'Upper band → red candle',
  'mid-band': 'Below middle band',
  'square-off': 'Square-off 15:14',
  'loss-limit': 'Daily loss limit',
  manual: 'Squared off by you',
  stopped: 'Deployment stopped',
};

export const EVENT_VIEW: Record<DeployEventKind, { label: string; tone: StatusTone }> = {
  start: { label: 'Started', tone: 'ok' },
  plan: { label: 'Plan', tone: 'info' },
  signal: { label: 'Signal', tone: 'info' },
  skip: { label: 'Skipped', tone: 'neutral' },
  order: { label: 'Order', tone: 'info' },
  fill: { label: 'Bought', tone: 'ok' },
  exit: { label: 'Sold', tone: 'ok' },
  cancel: { label: 'Cancelled', tone: 'neutral' },
  error: { label: 'Problem', tone: 'bad' },
  halt: { label: 'Stood down', tone: 'bad' },
  info: { label: 'Note', tone: 'neutral' },
};

/** The swing engine calls a dropped signal "Not taken"; intraday calls it "Skipped". */
export function eventView(kind: DeployEventKind, engine: DeployEngine) {
  if (kind === 'skip' && engine === 'swing')
    return { label: 'Not taken', tone: 'neutral' as const };
  return EVENT_VIEW[kind];
}

export const brokerName = (b: BrokerId | null) => (b === 'groww' ? 'Groww' : 'mStock');

/** PAPER, or LIVE with its broker — the same words everywhere. */
export function modeLabel(mode: DeployMode, broker?: BrokerId | null): string {
  if (mode === 'paper') return 'PAPER';
  return broker ? `LIVE · ${brokerName(broker)}` : 'LIVE';
}

export const variantLabel = (v: VariantKey | null) =>
  v === 'base' ? 'Your rules' : 'Improved rules';
export const universeLabel = (u: UniverseKey | null) =>
  u === 'nifty500' ? 'Nifty 500' : 'Nifty 50';

/* ── Activity log filters ── */

export type LogFilter = 'all' | 'trades' | 'plans' | 'problems';

/** Swing's third filter is its plans; intraday's is its skips. */
export function logFilters(engine: DeployEngine): readonly { key: LogFilter; label: string }[] {
  return [
    { key: 'all', label: 'All' },
    { key: 'trades', label: 'Trades' },
    { key: 'plans', label: engine === 'swing' ? 'Plans' : 'Skips' },
    { key: 'problems', label: 'Problems' },
  ];
}

const LOG_KINDS: Record<DeployEngine, Record<LogFilter, readonly DeployEventKind[] | null>> = {
  swing: {
    all: null,
    trades: ['signal', 'order', 'fill', 'exit'],
    plans: ['plan', 'skip', 'cancel'],
    problems: ['error'],
  },
  intraday: {
    all: null,
    trades: ['signal', 'order', 'fill', 'exit'],
    plans: ['skip'],
    problems: ['error', 'halt'],
  },
};

export function filterEvents(
  events: readonly DeployEvent[],
  filter: LogFilter,
  engine: DeployEngine,
): DeployEvent[] {
  const kinds = LOG_KINDS[engine][filter];
  return kinds ? events.filter((e) => kinds.includes(e.kind)) : [...events];
}

/* ── Dates (IST) ── */

const IST_MS = 19_800_000;

/** "2026-10-13T04:00:00Z" → "2026-10-13" (the IST day). */
export function istDay(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? new Date(ms + IST_MS).toISOString().slice(0, 10) : null;
}

/** "…T04:35:00Z" → "10:05" (IST). */
export function istTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? new Date(ms + IST_MS).toISOString().slice(11, 16) : '—';
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-10-13" → "13 Oct". */
export function dayLabel(day: string | null | undefined): string {
  if (!day) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return day;
  const month = MONTHS[Number(m[2]) - 1];
  return month ? `${Number(m[3])} ${month}` : day;
}

/** An ISO stamp as its IST day: "13 Oct". */
export const isoDayLabel = (iso: string | null | undefined) => dayLabel(istDay(iso));

/* ── Money words ── */

const inr0 = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const inr2 = (n: number) =>
  `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** "Up to 5 positions × ₹50,000 = ₹2,50,000 at work at once". */
export function exposureLine(capitalPerTrade: number, maxOpenPositions: number): string {
  return `Up to ${maxOpenPositions} position${maxOpenPositions === 1 ? '' : 's'} × ${inr0(capitalPerTrade)} = ${inr0(capitalPerTrade * maxOpenPositions)} at work at once`;
}

const signedPct = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(2)}%`;

/** Live per-trade return against the backtest's, in words (null when either is unknown). */
export function versusBacktest(
  avgLivePct: number | null,
  expectedPct: number | null | undefined,
): string | null {
  if (avgLivePct == null || expectedPct == null) return null;
  const d = avgLivePct - expectedPct;
  return `${signedPct(avgLivePct)} a trade vs ${signedPct(expectedPct)} in the backtest (${d >= 0 ? 'ahead' : 'behind'} by ${Math.abs(d).toFixed(2)} pts)`;
}

/* ── Orders, positions and trades in one line ── */

/** What a planned order or a resting trigger will do. */
export function orderLine(
  t: Pick<DeployTrade, 'status' | 'qty' | 'entryFrom' | 'lastSession' | 'trigger'>,
): string {
  if (t.status === 'waiting' && t.trigger != null) {
    return `Buy above ${inr2(t.trigger)} · ${dayLabel(t.entryFrom)}–${dayLabel(t.lastSession)}`;
  }
  return `Buy ~${t.qty.toLocaleString('en-IN')} at the ${dayLabel(t.entryFrom)} open`;
}

/** How far the price is from a resting trigger: "1.20% below" (null when not a trigger). */
export function triggerDistance(t: Pick<DeployTrade, 'status' | 'trigger' | 'ltp'>): string | null {
  if (t.status !== 'waiting' || t.trigger == null || t.ltp == null || t.trigger <= 0) return null;
  const d = ((t.trigger - t.ltp) / t.trigger) * 100;
  if (Math.abs(d) < 0.005) return 'at the trigger';
  return d > 0 ? `${d.toFixed(2)}% below` : `${Math.abs(d).toFixed(2)}% above`;
}

/** What happens next to an open position. */
export function exitLine(
  t: Pick<DeployTrade, 'status' | 'exitPlan' | 'lastSession' | 'armed'>,
  d: Pick<Deployment, 'engine' | 'source'>,
): string {
  if (t.status === 'pending-exit') return 'Selling…';
  if (t.status === 'pending-entry') return 'Buying…';
  if (d.engine === 'intraday')
    return t.armed ? 'Sell on the next red candle' : 'Waiting for the upper band';
  if (t.exitPlan) return `Sell at the next open — ${EXIT_WORDS[t.exitPlan.reason].toLowerCase()}`;
  if (d.source === 'platform') {
    return t.lastSession
      ? `Stop, target, or the ${dayLabel(t.lastSession)} close`
      : 'Stop or target';
  }
  return 'Judged on each close';
}

/** The last evening plan in one line — a scan's new triggers for the platform swing. */
export function planLine(
  p: PlanSummary | null,
  source: 'strategy' | 'platform' = 'strategy',
): string | null {
  if (!p) return null;
  if (source === 'platform') {
    const made = p.entries
      ? `${p.entries} new trigger${p.entries === 1 ? '' : 's'}`
      : 'no new trigger';
    const tail = p.signals
      ? ` · ${p.signals} setup${p.signals === 1 ? '' : 's'}${p.skipped ? `, ${p.skipped} not taken` : ''}`
      : '';
    return `${dayLabel(p.barDate)} scan → from ${dayLabel(p.forSession)}: ${made}${tail}${p.note ? ` · ${p.note}` : ''}`;
  }
  const parts: string[] = [];
  if (p.entries) parts.push(`${p.entries} buy${p.entries === 1 ? '' : 's'}`);
  if (p.exits) parts.push(`${p.exits} sell${p.exits === 1 ? '' : 's'}`);
  const head = `${dayLabel(p.barDate)} close → ${dayLabel(p.forSession)} open: ${parts.length ? parts.join(', ') : 'nothing to do'}`;
  const tail = p.signals
    ? ` · ${p.signals} signal${p.signals === 1 ? '' : 's'}${p.skipped ? `, ${p.skipped} not taken` : ''}`
    : '';
  return `${head}${tail}${p.note ? ` · ${p.note}` : ''}`;
}

/** A closed / refused / cancelled row's outcome word. */
export function outcomeWord(t: Pick<DeployTrade, 'status' | 'exitReason'>): string {
  if (t.status === 'failed') return 'Refused';
  if (t.status === 'cancelled') return 'Not taken';
  return t.exitReason ? EXIT_WORDS[t.exitReason] : '—';
}

/** "13 Oct → 16 Oct" (swing) or "13 Oct 10:05–11:20" (intraday). */
export function tradeSpan(t: DeployTrade, engine: DeployEngine): string {
  if (engine === 'intraday') {
    const day = dayLabel(t.day ?? istDay(t.entryAt));
    return t.entryAt
      ? `${day} ${istTime(t.entryAt)}${t.exitAt ? `–${istTime(t.exitAt)}` : ''}`
      : day;
  }
  if (t.entryDay) return `${dayLabel(t.entryDay)} → ${t.exitAt ? isoDayLabel(t.exitAt) : '—'}`;
  return dayLabel(t.entryFrom);
}

/* ── Stock picks ── */

/** Below this many backtested trades a stock's figure is noise — the engine's per-stock floor. */
export const MIN_STOCK_TRADES = 5;
/** The most stocks one deployment may be pinned to (server: MAX_DEPLOY_SYMBOLS per engine). */
export const MAX_SYMBOLS: Record<DeployEngine, number> = { swing: 200, intraday: 50 };

/** Swing: the stocks the backtest made money on (enough trades, positive average), best first. */
export function provenStocks(rows: readonly DeployStockRow[], max = MAX_SYMBOLS.swing): string[] {
  return rows
    .filter((r) => r.trades >= MIN_STOCK_TRADES && (r.avgReturnPct ?? 0) > 0)
    .sort(
      (a, b) =>
        (b.avgReturnPct ?? 0) * Math.sqrt(b.trades) - (a.avgReturnPct ?? 0) * Math.sqrt(a.trades) ||
        a.symbol.localeCompare(b.symbol),
    )
    .slice(0, max)
    .map((r) => r.symbol);
}

export const pickByVerdict = (
  rows: readonly DeployStockRow[],
  verdicts: readonly StockVerdict[],
  max = MAX_SYMBOLS.intraday,
) =>
  rows
    .filter((r) => r.verdict != null && verdicts.includes(r.verdict))
    .slice(0, max)
    .map((r) => r.symbol);

/** Intraday: what the backtest says works; failing that, works + mixed. */
export function defaultIntradaySymbols(
  rows: readonly DeployStockRow[],
  max = MAX_SYMBOLS.intraday,
): string[] {
  const works = pickByVerdict(rows, ['works'], max);
  return works.length ? works : pickByVerdict(rows, ['works', 'mixed'], max);
}

export const VERDICT_VIEW: Record<StockVerdict, { label: string; tone: StatusTone }> = {
  works: { label: 'Works', tone: 'ok' },
  mixed: { label: 'Mixed', tone: 'warn' },
  avoid: { label: 'Avoid', tone: 'bad' },
  thin: { label: 'Too few', tone: 'neutral' },
};

/* ── Live readiness ── */

export interface LiveCheck {
  key: 'master' | 'safe' | 'broker' | 'backtest' | 'phrase';
  ok: boolean;
  label: string;
}

/**
 * Live readiness as a checklist the deploy sheet shows before it lets real orders go: the
 * platform's master switch, Safe Mode (the server's word OR this device's — either one blocks),
 * a connected broker, and — for a daily strategy — a backtest of the rules being deployed.
 * A server that sent no confirmation phrase blocks too: there would be nothing to type.
 */
export function liveChecklist(
  list: Pick<DeploymentList, 'live' | 'strategy'>,
  safeModeOnDevice: boolean,
): LiveCheck[] {
  const { live } = list;
  const connected = live.brokers.filter((b) => b.connected);
  const safeOn = live.safeMode || safeModeOnDevice;
  const checks: LiveCheck[] = [
    {
      key: 'master',
      ok: live.masterSwitch,
      label: live.masterSwitch
        ? 'Live trading is on for the platform'
        : 'Live trading is off for the platform',
    },
    {
      key: 'safe',
      ok: !safeOn,
      label: safeOn ? 'Safe Mode is on — turn it off in Profile & security' : 'Safe Mode is off',
    },
    {
      key: 'broker',
      ok: connected.length > 0,
      label: connected.length
        ? `Broker connected: ${connected.map((b) => brokerName(b.broker)).join(', ')}`
        : 'No broker connected — connect mStock or Groww',
    },
  ];
  if (list.strategy) {
    checks.push(
      live.needsBacktest
        ? {
            key: 'backtest',
            ok: false,
            label: list.strategy.backtest.ran
              ? 'Rules changed since the last backtest — run it again'
              : 'Not backtested yet — run the backtest first',
          }
        : { key: 'backtest', ok: true, label: 'Backtested on these rules' },
    );
  }
  if (!live.phrase) {
    checks.push({ key: 'phrase', ok: false, label: 'The server sent no confirmation phrase' });
  }
  return checks;
}

/** The first thing blocking live, in words — null when every check passes. */
export function liveBlocker(checks: readonly LiveCheck[]): string | null {
  return checks.find((c) => !c.ok)?.label ?? null;
}

/** The typed phrase matches, as the server compares it (trimmed, upper-cased). */
export function phraseMatches(typed: string, phrase: string | null): boolean {
  return Boolean(phrase) && typed.trim().toUpperCase() === phrase;
}

/* ── The form ── */

export interface DeployForm {
  mode: DeployMode;
  /** Swing: 'all' trades every stock the rules allow (sends an empty list). */
  scope: 'all' | 'list';
  symbols: string[];
  capital: string;
  positions: string;
  entries: string;
  lossLimit: string;
  variant: VariantKey;
  universe: UniverseKey;
  broker: BrokerId;
  confirm: string;
}

export type FormField =
  | 'capitalPerTrade'
  | 'maxOpenPositions'
  | 'maxEntriesPerDay'
  | 'dailyLossLimit'
  | 'symbols'
  | 'broker'
  | 'confirm'
  | 'mode'
  | 'universe';
export type FormErrors = Partial<Record<FormField, string>>;

/** "50,000" / "50000" / " 50 000 " → 50000; empty or junk → NaN. */
export function parseAmount(value: string): number {
  const cleaned = value.replace(/[,\s₹]/g, '');
  return cleaned === '' ? Number.NaN : Number(cleaned);
}

const SYMBOL = /^[A-Z0-9&._-]{1,32}$/;

/**
 * The same bounds the server enforces (swing-deploy.rules.ts validateSwingDeployment and
 * deployment.rules.ts validateDeployment), with its own messages — so a form the server would
 * refuse never leaves the phone. Live adds the platform's real-money caps.
 */
export function validateDeployForm(
  form: DeployForm,
  engine: DeployEngine,
  limits: LiveLimits,
): FormErrors {
  const errors: FormErrors = {};
  const symbols = sendSymbols(form, engine);
  if (engine === 'intraday' && symbols.length === 0) errors.symbols = 'Pick at least one stock.';
  if (engine === 'swing' && form.scope === 'list' && symbols.length === 0) {
    errors.symbols = 'Pick at least one stock — or trade every stock the rules allow.';
  }
  if (symbols.length > MAX_SYMBOLS[engine]) {
    errors.symbols =
      engine === 'swing'
        ? `At most ${MAX_SYMBOLS.swing} stocks — or leave the list empty to trade every stock the rules allow.`
        : `At most ${MAX_SYMBOLS.intraday} stocks — each is checked every five minutes.`;
  }
  if (symbols.some((s) => !SYMBOL.test(s))) errors.symbols = 'A stock symbol is not valid.';

  const cap = parseAmount(form.capital);
  const positions = parseAmount(form.positions);
  const entries = parseAmount(form.entries);
  const maxEntries = engine === 'swing' ? 20 : 100;
  if (!(cap >= 1_000 && cap <= 1_000_000)) {
    errors.capitalPerTrade = 'Capital per trade must be between ₹1,000 and ₹10 lakh.';
  }
  if (!(Number.isInteger(positions) && positions >= 1 && positions <= 20)) {
    errors.maxOpenPositions = 'Open positions must be 1–20.';
  }
  if (!(Number.isInteger(entries) && entries >= 1 && entries <= maxEntries)) {
    errors.maxEntriesPerDay =
      engine === 'swing' ? 'New positions a day must be 1–20.' : 'Entries a day must be 1–100.';
  }
  const loss = parseAmount(form.lossLimit);
  if (engine === 'intraday' && !(loss >= 100 && loss <= 1_000_000)) {
    errors.dailyLossLimit = 'Daily loss limit must be between ₹100 and ₹10 lakh.';
  }

  if (form.mode === 'live') {
    if (!errors.capitalPerTrade && cap > limits.maxOrderValue) {
      errors.capitalPerTrade = `Live orders are capped at ${inr0(limits.maxOrderValue)} each on this platform.`;
    }
    if (!errors.maxOpenPositions && positions > limits.maxOpenPositions) {
      errors.maxOpenPositions = `Live allows at most ${limits.maxOpenPositions} open positions.`;
    }
    if (engine === 'intraday' && !errors.dailyLossLimit && loss > limits.maxDailyLoss) {
      errors.dailyLossLimit = `The platform's live daily loss cap is ${inr0(limits.maxDailyLoss)}.`;
    }
  }
  return errors;
}

/** The symbols the request carries: none for a swing "every stock the rules allow". */
export function sendSymbols(
  form: Pick<DeployForm, 'scope' | 'symbols'>,
  engine: DeployEngine,
): string[] {
  if (engine === 'swing' && form.scope === 'all') return [];
  return [...new Set(form.symbols.map((s) => s.trim().toUpperCase()).filter(Boolean))];
}

/** The request body — only the fields the target's (strict) server schema accepts. */
export function buildDeployInput(form: DeployForm, engine: DeployEngine): DeployInput {
  const input: DeployInput = {
    mode: form.mode,
    symbols: sendSymbols(form, engine),
    capitalPerTrade: parseAmount(form.capital),
    maxOpenPositions: Math.round(parseAmount(form.positions)),
    maxEntriesPerDay: Math.round(parseAmount(form.entries)),
  };
  if (engine === 'intraday') {
    input.variant = form.variant;
    input.universe = form.universe;
    input.dailyLossLimit = parseAmount(form.lossLimit);
  }
  if (form.mode === 'live') {
    input.broker = form.broker;
    input.confirm = form.confirm.trim();
  }
  return input;
}

/** Server 422 field paths ("symbols.3", "body.capitalPerTrade") → this form's fields. */
export function formFieldErrors(fieldErrors: Record<string, string> | undefined): FormErrors {
  const out: FormErrors = {};
  const known: readonly FormField[] = [
    'capitalPerTrade',
    'maxOpenPositions',
    'maxEntriesPerDay',
    'dailyLossLimit',
    'symbols',
    'broker',
    'confirm',
    'mode',
    'universe',
  ];
  for (const [path, message] of Object.entries(fieldErrors ?? {})) {
    const field = path.split('.').find((part) => (known as readonly string[]).includes(part)) as
      FormField | undefined;
    if (field && !out[field]) out[field] = message;
  }
  return out;
}

export interface SubmitState {
  ok: boolean;
  /** Why not, in words (null when ok). */
  reason: string | null;
  /** What blocks: live readiness, a field, the chosen broker, or the typed phrase. */
  kind: 'blocked' | 'field' | 'broker' | 'phrase' | null;
}

/**
 * Whether the sheet may send: a valid form; for live, every readiness check, a connected chosen
 * broker and the typed phrase. A blocked live submit never leaves the phone.
 */
export function submitState(p: {
  form: DeployForm;
  errors: FormErrors;
  checks: readonly LiveCheck[];
  phrase: string | null;
  brokers: DeploymentList['live']['brokers'];
}): SubmitState {
  const firstError = Object.values(p.errors).find(Boolean);
  if (p.form.mode === 'live') {
    const blocker = liveBlocker(p.checks);
    if (blocker) return { ok: false, reason: `Live is blocked: ${blocker}.`, kind: 'blocked' };
  }
  if (firstError) return { ok: false, reason: firstError, kind: 'field' };
  if (p.form.mode === 'live') {
    const chosen = p.brokers.find((b) => b.broker === p.form.broker);
    if (!chosen?.connected) {
      return {
        ok: false,
        reason: `Connect your ${brokerName(p.form.broker)} account first.`,
        kind: 'broker',
      };
    }
    if (!phraseMatches(p.form.confirm, p.phrase)) {
      return {
        ok: false,
        reason: `Type ${p.phrase ?? 'the confirmation phrase'} to send real orders.`,
        kind: 'phrase',
      };
    }
  }
  return { ok: true, reason: null, kind: null };
}

/** The form's starting values: the running deployment of that mode, else the server's defaults. */
export function initialForm(p: {
  mode: DeployMode;
  list: DeploymentList;
  stocks: readonly DeployStockRow[];
  variant?: VariantKey | null;
  universe?: UniverseKey | null;
}): DeployForm {
  const { list, mode } = p;
  const current = currentOf(list.deployments, mode);
  const def = list.defaults[mode];
  const engine = list.engine;
  const symbols = current?.symbols.length
    ? current.symbols
    : engine === 'swing'
      ? provenStocks(p.stocks)
      : defaultIntradaySymbols(p.stocks);
  return {
    mode,
    scope: engine === 'swing' && !current?.symbols.length ? 'all' : 'list',
    symbols,
    capital: String(current?.capitalPerTrade ?? def.capitalPerTrade),
    positions: String(current?.maxOpenPositions ?? def.maxOpenPositions),
    entries: String(current?.maxEntriesPerDay ?? def.maxEntriesPerDay),
    lossLimit: String(current?.dailyLossLimit ?? def.dailyLossLimit ?? ''),
    variant: current?.variant ?? p.variant ?? 'improved',
    universe: p.universe ?? current?.universe ?? 'nifty50',
    broker: pickBroker(current?.broker ?? null, list.live.brokers),
    confirm: '',
  };
}

/** The running deployment's broker while it is still connected, else the first connected one. */
export function pickBroker(
  preferred: BrokerId | null,
  brokers: DeploymentList['live']['brokers'],
): BrokerId {
  const connected = brokers.filter((b) => b.connected);
  if (preferred && connected.some((b) => b.broker === preferred)) return preferred;
  return connected[0]?.broker ?? preferred ?? 'mstock';
}

/** Switching paper ↔ live loads that mode's running settings (or its defaults); the stock
 *  choice carries over unless that mode already runs with its own. */
export function switchFormMode(
  form: DeployForm,
  mode: DeployMode,
  list: DeploymentList,
): DeployForm {
  const current = currentOf(list.deployments, mode);
  const def = list.defaults[mode];
  return {
    ...form,
    mode,
    capital: String(current?.capitalPerTrade ?? def.capitalPerTrade),
    positions: String(current?.maxOpenPositions ?? def.maxOpenPositions),
    entries: String(current?.maxEntriesPerDay ?? def.maxEntriesPerDay),
    lossLimit: String(current?.dailyLossLimit ?? def.dailyLossLimit ?? ''),
    ...(current
      ? {
          scope: list.engine === 'swing' ? (current.symbols.length ? 'list' : 'all') : 'list',
          symbols: current.symbols.length ? current.symbols : form.symbols,
          ...(current.variant ? { variant: current.variant } : {}),
          ...(current.broker ? { broker: pickBroker(current.broker, list.live.brokers) } : {}),
        }
      : {}),
    confirm: '',
  };
}

/* ── Lists and labels ── */

/** The running (active or paused) deployment of a mode. */
export function currentOf(deployments: readonly Deployment[], mode: DeployMode): Deployment | null {
  return deployments.find((d) => d.mode === mode && d.status !== 'stopped') ?? null;
}

export function runningOf(deployments: readonly Deployment[]): Deployment[] {
  return deployments.filter((d) => d.status !== 'stopped');
}

/** The modes running now, paper first. */
export function modesOf(deployments: readonly Pick<Deployment, 'mode' | 'status'>[]): DeployMode[] {
  const running = deployments.filter((d) => d.status !== 'stopped');
  return (['paper', 'live'] as const).filter((m) => running.some((d) => d.mode === m));
}

/** The tab's label — short enough for a phone's segmented control. */
export function deployTabLabel(running: readonly Pick<Deployment, 'mode' | 'status'>[]): string {
  const modes = modesOf(running);
  if (modes.length === 2) return 'Deployment · both';
  if (modes.length === 1) return `Deployment · ${modes[0]}`;
  return 'Deployment';
}

/** GET /strategies/deployments → strategyId → its running modes (the Strategies list chips). */
export function modesByStrategy(mine: readonly MyDeployment[]): Map<string, DeployMode[]> {
  const out = new Map<string, DeployMode[]>();
  for (const d of mine) {
    if (!d.strategyId || d.status === 'stopped') continue;
    const modes = out.get(d.strategyId) ?? [];
    if (!modes.includes(d.mode)) modes.push(d.mode);
    out.set(
      d.strategyId,
      modes.sort((a, b) => (a === b ? 0 : a === 'paper' ? -1 : 1)),
    );
  }
  return out;
}

/** Poll a deployment's detail only while it runs and the market is open. */
export function detailPollMs(
  d: Pick<Deployment, 'status'> | null | undefined,
  now: Date = new Date(),
  everyMs = 30_000,
): number | false {
  if (!d || d.status === 'stopped') return false;
  return isMarketOpen(now) ? everyMs : false;
}

/** A target as the pushed screen's route params, and back. */
export function targetParams(target: DeployTarget): { strategy?: string; key?: string } {
  return target.kind === 'strategy' ? { strategy: target.strategyId } : { key: target.key };
}

/** Where a live deployment's broker book lives in the app; paper → the paper wallet. */
export function bookRoute(
  mode: DeployMode,
  broker: BrokerId | null,
): '/trade/paper' | '/trade/mstock' | '/trade/groww' {
  if (mode === 'paper') return '/trade/paper';
  return broker === 'groww' ? '/trade/groww' : '/trade/mstock';
}

/** A short "what stopping does" for the confirm, naming paper or real money. */
export function stopMessage(d: Pick<Deployment, 'mode' | 'engine' | 'broker'>): string {
  const where =
    d.mode === 'live' ? `at ${brokerName(d.broker)} — real money` : 'in your paper wallet';
  if (d.engine === 'intraday')
    return `Open positions are sold at market ${where}, and no new trades are placed.`;
  return `Planned orders are cancelled and open positions sold at market ${where}. If the market is closed, they sell at the next open.`;
}

export function squareOffMessage(d: Pick<Deployment, 'mode' | 'engine' | 'broker'>): string {
  const where =
    d.mode === 'live' ? `at ${brokerName(d.broker)} — real money` : 'in your paper wallet';
  if (d.engine === 'intraday') return `Sold at market ${where}, now.`;
  return `Sold at market ${where} — now in market hours, otherwise at the next open.`;
}
