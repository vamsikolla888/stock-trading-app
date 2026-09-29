import type {
  MarketSegment,
  OpenStructure,
  PickSuggestion,
  RejectionStage,
  StrongPick,
  StrongPickRejection,
  StrongPicksResponse,
} from '../types';

/**
 * The server sends each pick as it was stored, so a day published before the per-segment
 * verdicts existed (reachable through "Last published") carries no arrays for them. Every
 * list the screen iterates is made an array here, once, at the API boundary.
 */
export function normalizeStrongPicks(response: StrongPicksResponse): StrongPicksResponse {
  const list = <T>(value: T[] | null | undefined): T[] => (Array.isArray(value) ? value : []);
  return {
    ...response,
    picks: list(response.picks).map((pick) => ({
      ...pick,
      segments: list(pick.segments),
      segmentVerdicts: list(pick.segmentVerdicts),
    })),
    caveats: list(response.caveats),
  };
}

export const SEGMENT_LABEL: Record<MarketSegment, string> = {
  equity: 'Equity',
  intraday: 'Intraday',
  fno: 'F&O',
};

export type SegmentFilter = 'all' | MarketSegment;

export const SEGMENT_FILTERS: readonly { key: SegmentFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'equity', label: 'Equity' },
  { key: 'intraday', label: 'Intraday' },
  { key: 'fno', label: 'F&O' },
];

/**
 * Picks tradeable in a segment. `suitable`, not mere presence in `segmentVerdicts` (which
 * lists all three regardless of fit) — the filter answers "can I trade this in X".
 */
export function filterBySegment(picks: readonly StrongPick[], filter: SegmentFilter): StrongPick[] {
  if (filter === 'all') return [...picks];
  return picks.filter((pick) =>
    pick.segmentVerdicts.some((verdict) => verdict.segment === filter && verdict.suitable),
  );
}

export const STRUCTURE_LABEL: Record<OpenStructure, string> = {
  holding: 'Held its level',
  extended: 'Already ran',
  'breaking-down': 'Breaking down',
  unclear: 'Unclear',
};

/** The card's left accent, keyed to the opening structure (the label says the same in words). */
export const STRUCTURE_ACCENT: Record<OpenStructure, string> = {
  holding: 'border-l-brand-strong dark:border-l-brand-strong-dark',
  extended: 'border-l-warning-500 dark:border-l-warning-dark',
  'breaking-down': 'border-l-danger-500 dark:border-l-danger-dark',
  unclear: 'border-l-line-strong dark:border-l-line-dark-strong',
};

export const SUGGESTION_LABEL: Record<PickSuggestion, string> = {
  EXIT: 'Stop hit',
  TAKE_PROFIT: 'Target reached',
  ENTER: 'In the band',
  HOLD: 'Working',
  WAIT: 'Wait',
  NO_PRICE: 'No price',
};

/** Only a realised gain is green — on a screen of P&L colours a green chip reads as money. */
export const SUGGESTION_BADGE: Record<
  PickSuggestion,
  'danger' | 'success' | 'primary' | 'neutral'
> = {
  EXIT: 'danger',
  TAKE_PROFIT: 'success',
  ENTER: 'primary',
  HOLD: 'neutral',
  WAIT: 'neutral',
  NO_PRICE: 'neutral',
};

export const STAGE_LABEL: Record<RejectionStage, string> = {
  'open-filter': 'Failed the opening filter',
  levels: 'No tradeable levels could be derived',
  'probability-floor': 'Under the probability floor',
  'score-floor': 'Under the setup-score floor',
  'calibration-floor': 'Under the calibrated outcome floor',
  unreadable: 'Could not be read',
  model: 'Discarded during ranking',
};

export function stageLabel(stage: string): string {
  return (STAGE_LABEL as Record<string, string>)[stage] ?? stage;
}

/** Rejections grouped by stage, in the order the stages first appear. */
export function groupRejections(
  rejections: readonly StrongPickRejection[],
): { stage: string; label: string; items: StrongPickRejection[] }[] {
  const groups = new Map<string, StrongPickRejection[]>();
  for (const rejection of rejections) {
    const rows = groups.get(rejection.stage);
    if (rows) rows.push(rejection);
    else groups.set(rejection.stage, [rejection]);
  }
  return [...groups].map(([stage, items]) => ({ stage, label: stageLabel(stage), items }));
}

/**
 * The monitor's sampling health. Never sampled and a sweep more than three minutes old are
 * both stated, so a monitor that stopped can't pass for a quiet stock.
 */
export function monitorSampleNote(
  minutesSinceSample: number | null,
): { tone: 'faint' | 'warning'; text: string } | null {
  if (minutesSinceSample === null) {
    return {
      tone: 'faint',
      text: 'Not sampled yet — the per-minute watch runs while the market is open.',
    };
  }
  if (minutesSinceSample > 3) {
    return {
      tone: 'warning',
      text: `Last sampled ${minutesSinceSample} minutes ago — the monitor may not be running.`,
    };
  }
  return null;
}

/** "2.10:1", or an em dash. */
export function formatRewardRisk(rewardRisk: number | null): string {
  return typeof rewardRisk === 'number' && Number.isFinite(rewardRisk)
    ? `${rewardRisk.toFixed(2)}:1`
    : '—';
}

/** 0–100 for the progress meter, from the server's 0–1 fraction; null when unknown. */
export function progressPercent(progressToTarget: number | null): number | null {
  if (typeof progressToTarget !== 'number' || !Number.isFinite(progressToTarget)) return null;
  return Math.round(Math.min(1, Math.max(0, progressToTarget)) * 100);
}
