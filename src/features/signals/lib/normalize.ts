import type {
  PushGateStatus,
  ReliabilityResponse,
  ScreenerReliability,
  Signal,
  SignalAction,
  SignalGate,
  SignalJobStatus,
  SignalsResponse,
  SignalStatusResponse,
} from '../types';

/**
 * Every /signals payload is parsed once here into a shape where every field exists — numbers
 * finite or null, strings strings — so a server that lags or leads the app never throws
 * mid-render. A measured figure that is missing stays null: never a zero, which would read as
 * "measured, and it never works".
 */

type Json = Record<string, unknown>;

const isObj = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const obj = (value: unknown): Json => (isObj(value) ? value : {});
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;
const num = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const ACTIONS: readonly SignalAction[] = ['BUY', 'SELL', 'WATCH'];

function action(value: unknown): SignalAction {
  const raw = text(value)?.toUpperCase() ?? '';
  return (ACTIONS as readonly string[]).includes(raw) ? (raw as SignalAction) : 'WATCH';
}

function metrics(value: unknown): Record<string, number> | undefined {
  if (!isObj(value)) return undefined;
  const out: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value)) {
    const n = num(raw);
    if (n != null) out[key] = n;
  }
  return out;
}

export function normalizeSignal(value: unknown): Signal | null {
  if (!isObj(value)) return null;
  const symbol = text(value.symbol)?.toUpperCase();
  if (!symbol) return null;
  const conviction = num(value.conviction);
  return {
    date: text(value.date) ?? '',
    screenerKey: text(value.screenerKey) ?? '',
    screenerName: text(value.screenerName) ?? text(value.screenerKey) ?? 'Screener',
    exchange: text(value.exchange) ?? 'NSE',
    symbol,
    companyName: text(value.companyName),
    ltp: num(value.ltp),
    changePct: num(value.changePct),
    hitRatePct: num(value.hitRatePct),
    sampleTrades: num(value.sampleTrades),
    avgReturnPct: num(value.avgReturnPct),
    holdDays: num(value.holdDays),
    action: action(value.action),
    conviction: conviction == null ? 0 : Math.max(0, Math.min(5, Math.round(conviction))),
    rationale: text(value.rationale) ?? '',
    invalidation: text(value.invalidation) ?? '',
    metrics: metrics(value.metrics),
    meetsNotifyBar: value.meetsNotifyBar === true,
    notified: value.notified === true,
    notifiedAt: text(value.notifiedAt),
  };
}

function gate(value: unknown): SignalGate | undefined {
  if (!isObj(value)) return undefined;
  const minHitRate = num(value.minHitRate);
  const maxHitRate = num(value.maxHitRate);
  if (minHitRate == null || maxHitRate == null) return undefined;
  return {
    minHitRate,
    maxHitRate,
    minSample: num(value.minSample) ?? 0,
    holdDays: num(value.holdDays) ?? 10,
  };
}

/** GET /signals */
export function normalizeSignals(payload: unknown): SignalsResponse {
  const raw = obj(payload);
  return {
    date: text(raw.date) ?? '',
    signals: list(raw.signals)
      .map(normalizeSignal)
      .filter((signal): signal is Signal => signal !== null),
    gate: gate(raw.gate),
  };
}

function job(value: unknown): SignalJobStatus {
  const raw = obj(value);
  return {
    running: raw.running === true,
    waiting: num(raw.waiting) ?? 0,
    active: num(raw.active) ?? 0,
    lastError: text(raw.lastError),
  };
}

function pushGate(value: unknown): PushGateStatus | null {
  const base = gate(value);
  if (!base) return null;
  const raw = obj(value);
  return {
    ...base,
    measured: num(raw.measured) ?? 0,
    clearing: num(raw.clearing) ?? 0,
    bestHitRatePct: num(raw.bestHitRatePct),
    bestScreener: text(raw.bestScreener),
    medianHitRatePct: num(raw.medianHitRatePct),
    verdict: text(raw.verdict) ?? '',
  };
}

/** GET /signals/status — job health may be absent on an older server: it reads as idle. */
export function normalizeSignalStatus(payload: unknown): SignalStatusResponse {
  const raw = obj(payload);
  return {
    generation: job(raw.generation),
    reliability: job(raw.reliability),
    gate: pushGate(raw.gate),
  };
}

function reliabilityRow(value: unknown): ScreenerReliability | null {
  const raw = obj(value);
  const screenerKey = text(raw.screenerKey);
  const hitRatePct = num(raw.hitRatePct);
  if (!screenerKey || hitRatePct == null) return null;
  return {
    screenerKey,
    screenerName: text(raw.screenerName) ?? screenerKey,
    holdDays: num(raw.holdDays) ?? 0,
    hitRatePct,
    sampleTrades: num(raw.sampleTrades) ?? 0,
    avgReturnPct: num(raw.avgReturnPct) ?? 0,
    avgWinPct: num(raw.avgWinPct) ?? 0,
    avgLossPct: num(raw.avgLossPct) ?? 0,
    worstReturnPct: num(raw.worstReturnPct) ?? 0,
    symbolsCovered: num(raw.symbolsCovered) ?? 0,
    measuredAt: text(raw.measuredAt) ?? '',
  };
}

/** GET /signals/reliability */
export function normalizeReliability(payload: unknown): ReliabilityResponse {
  const raw = obj(payload);
  return {
    reliability: list(raw.reliability)
      .map(reliabilityRow)
      .filter((row): row is ScreenerReliability => row !== null),
    unmeasurable: list(raw.unmeasurable).flatMap((item) => {
      const entry = obj(item);
      const key = text(entry.key);
      return key ? [{ key, reason: text(entry.reason) ?? '' }] : [];
    }),
  };
}
