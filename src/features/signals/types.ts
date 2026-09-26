// Mirrored from the web client: features/signals/services/signals.service.ts.
//
// `hitRatePct` is MEASURED (the share of that screener's past matches that closed higher over
// the hold period); `conviction` is the model's read of today (an ordinal 1–5). The UI must
// never present the second as a probability.

export type SignalAction = 'BUY' | 'SELL' | 'WATCH';

export interface Signal {
  date: string;
  screenerKey: string;
  screenerName: string;
  exchange: string;
  symbol: string;
  companyName: string | null;
  ltp: number | null;
  changePct: number | null;
  /** Null when the screener has never been measured — NOT zero. */
  hitRatePct: number | null;
  sampleTrades: number | null;
  avgReturnPct: number | null;
  holdDays: number | null;
  action: SignalAction;
  /** 1–5 ordinal — never a percentage. */
  conviction: number;
  rationale: string;
  invalidation: string;
  /** The screener's own evidence, so a signal can be checked rather than trusted. */
  metrics?: Record<string, number>;
  meetsNotifyBar: boolean;
  notified: boolean;
  notifiedAt: string | null;
}

export interface SignalGate {
  minHitRate: number;
  maxHitRate: number;
  minSample: number;
  holdDays: number;
}

/** GET /signals */
export interface SignalsResponse {
  date: string;
  signals: Signal[];
  gate?: SignalGate;
}

export interface ScreenerReliability {
  screenerKey: string;
  screenerName: string;
  holdDays: number;
  hitRatePct: number;
  sampleTrades: number;
  avgReturnPct: number;
  avgWinPct: number;
  avgLossPct: number;
  worstReturnPct: number;
  symbolsCovered: number;
  measuredAt: string;
}

/** GET /signals/reliability */
export interface ReliabilityResponse {
  reliability: ScreenerReliability[];
  unmeasurable: { key: string; reason: string }[];
}

export interface PushGateStatus extends SignalGate {
  measured: number;
  clearing: number;
  bestHitRatePct: number | null;
  bestScreener: string | null;
  medianHitRatePct: number | null;
  /** Rendered verbatim. */
  verdict: string;
}

/** GET /signals/status */
export interface SignalStatusResponse {
  gate: PushGateStatus;
}
