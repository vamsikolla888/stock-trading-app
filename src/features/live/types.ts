// Mirrored from the web client: features/paper-trading/services/paper.service.ts (the
// auto-trade block). Only the fields the Live board and the strategy list read are listed.

export type CandidateSource = 'recommendations' | 'strategy';

export interface AutoTradeConfig {
  enabled: boolean;
  /** Optional so a config written before the field existed still parses. */
  candidateSource?: CandidateSource;
  strategyId?: string | null;
  deployPct: number;
  maxPositions: number;
  maxPerPositionPct: number;
}

/** GET /paper/autotrade/config */
export interface AutoTradeConfigResponse {
  /** False means this account has never opted in — there is no config row at all. */
  configured: boolean;
  config: AutoTradeConfig;
  peakEquity: number | null;
  /** Why new entries are blocked. Rendered verbatim. */
  haltedReason: string | null;
  haltedAt: string | null;
  lastRunAt: string | null;
}

export interface AutoTradeEvent {
  orderId: string;
  side: 'BUY' | 'SELL';
  exchange: string;
  symbol: string;
  companyName: string | null;
  quantity: number;
  price: number | null;
  charges: number;
  status: string;
  at: string;
  note: string | null;
  /** SELL only: TARGET, STOP, MAX_HOLD, REVIEW_DROPPED. */
  exitReason: string | null;
  /** SELL only: the level that triggered the exit (may differ from the fill). */
  exitTriggerLevel: number | null;
  realisedPnl: number | null;
}

export interface SkippedReason {
  reason: string;
  count: number;
  symbols: string[];
  detail: string;
}

/** GET /paper/autotrade/activity */
export interface AutoTradeActivity {
  enabled: boolean;
  configured: boolean;
  haltedReason: string | null;
  haltedAt: string | null;
  lastRunAt: string | null;
  events: AutoTradeEvent[];
  openCount: number;
  closedCount: number;
  /** What the engine looked at today and did NOT take. */
  skippedToday: SkippedReason[];
  /** Rendered verbatim. */
  caveats: string[];
}
