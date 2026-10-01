// Mirrored from the web client: features/screeners/services/screeners.service.ts. Built-in
// screener shapes already live in features/market/types (shared with Explore).

import type { ScreenerMatch } from '@/features/market/types';
import type {
  Condition,
  RuleWarning,
  RunState,
  StrategyMatchesResult,
  UniverseExchange,
} from '@/features/strategies/types';

export type {
  ScreenerCondition,
  ScreenerDetail,
  ScreenerMatch,
  ScreenerSummary,
} from '@/features/market/types';

export type CustomScreenerStatus = 'never-run' | 'queued' | 'running' | 'complete' | 'failed';

/**
 * A custom screener is a strategy's ENTRY half: conditions that hold on the latest bar. The
 * library is SHARED — a screener's answer is objective, so one library serves everyone.
 */
export interface CustomScreener {
  id: string;
  name: string;
  description: string | null;
  conditions: Condition[];
  /** Each condition in words, rendered server-side. */
  conditionText: string[];
  exchange: UniverseExchange;
  minPrice: number | null;
  /** Null means the whole exchange. */
  indexKey: string | null;
  fnoOnly?: boolean;
  /** Names liquid enough to act on. */
  tradeableOnly?: boolean;
  /** The universe as short phrases ("NSE", "Nifty 50 members"). */
  universe?: string[];
  /** Lint on the conditions ("RSI(14) is above 0 is always true"). */
  warnings?: RuleWarning[];
  status: CustomScreenerStatus;
  /** Read with the queue consulted — `stalled` is a scan whose job vanished. */
  runState?: RunState;
  lastError: string | null;
  runAt: string | null;
  /** The true total; the stored list is capped at 200, most liquid first. */
  matchCount: number;
  universeSize: number;
  skippedForInsufficientBars: number;
  /** Narrowings that were unavailable, so a wider universe was scanned. */
  fellBack?: string[];
  durationMs?: number | null;
  /** Only on the detail read. */
  matches?: ScreenerMatch[];
  createdAt?: string;
  updatedAt: string;
}

export interface CustomScreenerInput {
  name: string;
  description?: string | null;
  conditions: Condition[];
  exchange?: UniverseExchange;
  minPrice?: number | null;
  /** Sent as null (not omitted) when cleared — omitted means "leave it alone" on PATCH. */
  indexKey?: string | null;
  fnoOnly?: boolean;
  tradeableOnly?: boolean;
}

export interface EnqueueScanResult {
  enqueued: boolean;
  alreadyRunning: boolean;
  jobId: string | null;
}

/** POST /screeners/custom/{id}/scan — with the screener's new state. */
export interface QueueCustomScanResult extends EnqueueScanResult {
  /** Optional for an older server. */
  screener?: CustomScreener;
}

export interface RunAllScansResult {
  builtIn: EnqueueScanResult;
  custom: EnqueueScanResult;
  screenersQueued: number;
}

export type ScanPhase = 'idle' | 'queued' | 'running' | 'failed';

/** One scan's state, answered from its own jobs (not the whole queue's counters). */
export interface ScanJobState {
  phase: ScanPhase;
  since: string | null;
  lastError: string | null;
  /** Queued over two minutes — the screener worker is probably not running. */
  waitingLong: boolean;
  lastRunAt: string | null;
}

/** GET /screeners/status — the built-in scan and the library sweep. */
export interface ScreenerScanStatus {
  builtIn: ScanJobState;
  sweep: ScanJobState;
  /** Either half queued or running. */
  running: boolean;
}

/** POST /screeners/custom/preview — never a 422 for a bad draft. */
export interface ScreenerPreview {
  valid: boolean;
  issues: { path: string; message: string }[];
  warnings: RuleWarning[];
  conditionText: string[];
  universe: string[];
}

export type ScreenerPreviewMatches = StrategyMatchesResult;
