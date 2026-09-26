// Mirrored from the web client: features/screeners/services/screeners.service.ts. Built-in
// screener shapes already live in features/market/types (shared with Explore).

import type { ScreenerMatch } from '@/features/market/types';
import type { Condition, UniverseExchange } from '@/features/strategies/types';

export type {
  ScreenerCondition,
  ScreenerDetail,
  ScreenerMatch,
  ScreenerSummary,
} from '@/features/market/types';

export type CustomScreenerStatus = 'never-run' | 'queued' | 'running' | 'complete' | 'failed';

/** A custom screener is a strategy's ENTRY half: conditions that hold on the latest bar. */
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
  status: CustomScreenerStatus;
  lastError: string | null;
  runAt: string | null;
  matchCount: number;
  universeSize: number;
  skippedForInsufficientBars: number;
  /** Only on the detail read. */
  matches?: ScreenerMatch[];
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
}

export interface EnqueueScanResult {
  enqueued: boolean;
  alreadyRunning: boolean;
  jobId: string | null;
}

export interface ScanStatus {
  running: boolean;
  waiting: number;
  active: number;
  lastError: string | null;
}

export interface RunAllScansResult {
  builtIn: EnqueueScanResult;
  custom: { enqueued: boolean; alreadyRunning: boolean; jobId: string };
  screenersQueued: number;
}

export interface AllScansStatus extends ScanStatus {
  builtInRunning: boolean;
  customRunning: boolean;
}
