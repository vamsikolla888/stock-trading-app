import { istDayKey } from '@/features/home/lib/istTime';
import { formatSignedPercent } from '@/lib/utils/formatters';

import type {
  AttentionItem,
  BriefBreadth,
  DailyBrief,
  DailyBriefPreferences,
  DailyBriefRiskProfile,
  DailyBriefSection,
  MarketStatus,
} from '../types';

export const SECTION_LABELS: Record<DailyBriefSection, string> = {
  summary: 'Today in 30 seconds',
  outlook: 'AI market outlook',
  indices: 'Major indices',
  breadth: 'Market pulse',
  sectors: 'Sector pulse',
  movers: 'Market movers',
  derivatives: 'Derivatives radar',
  portfolio: 'Your portfolio',
  watchlist: 'Your watchlists',
  technical: 'Technical radar',
  attention: 'Needs your attention',
  news: 'News that matters',
  calendar: 'Calendar & external cues',
};

export const RISK_OPTIONS: readonly { key: DailyBriefRiskProfile; label: string }[] = [
  { key: 'conservative', label: 'Conservative' },
  { key: 'moderate', label: 'Moderate' },
  { key: 'aggressive', label: 'Aggressive' },
];

export const RISK_LABEL: Record<DailyBriefRiskProfile, string> = {
  conservative: 'Conservative',
  moderate: 'Moderate',
  aggressive: 'Aggressive',
};

/** The server's caps on preferredIndices / preferredSectors (daily-brief.dto.ts). */
export const PREFERRED_LIMIT = { indices: 8, sectors: 12 } as const;

export const MARKET_STATUS_LABEL: Record<MarketStatus, string> = {
  PRE_MARKET: 'Pre-market',
  OPEN: 'Market open',
  CLOSED: 'Market closed',
};

/** Today's session day in IST — the only date the server builds live and refreshes. */
export function todayIst(now: Date = new Date()): string {
  return istDayKey(now) ?? now.toISOString().slice(0, 10);
}

/** "STRONG_POSITIVE" / "Strong Positive" → "Strong positive". */
export function humanize(value: string): string {
  const words = value.replace(/_/g, ' ').trim().toLowerCase();
  return words ? words[0]!.toUpperCase() + words.slice(1) : value;
}

export type Tone = 'up' | 'down' | 'flat';

/** Reads a bias/sentiment label as a direction, for colour only. */
export function toneOfLabel(label: string): Tone {
  const value = label.toLowerCase();
  if (value.includes('positive') || value.includes('bull')) return 'up';
  if (value.includes('negative') || value.includes('bear')) return 'down';
  return 'flat';
}

/** Sections in the user's order, minus the hidden ones. */
export function visibleSections(preferences: DailyBriefPreferences): DailyBriefSection[] {
  const visible = new Set(preferences.visibleSections);
  return preferences.sectionOrder.filter((section) => visible.has(section));
}

/** Shows or hides a section. The server requires at least one visible, so the last stays. */
export function toggleSection(
  preferences: DailyBriefPreferences,
  section: DailyBriefSection,
): DailyBriefPreferences {
  const shown = preferences.visibleSections.includes(section);
  if (shown && preferences.visibleSections.length === 1) return preferences;
  return {
    ...preferences,
    visibleSections: shown
      ? preferences.visibleSections.filter((item) => item !== section)
      : [...preferences.visibleSections, section],
  };
}

/** Moves a section one place up (-1) or down (+1); a no-op at either end. */
export function moveSection(
  preferences: DailyBriefPreferences,
  section: DailyBriefSection,
  delta: -1 | 1,
): DailyBriefPreferences {
  const from = preferences.sectionOrder.indexOf(section);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= preferences.sectionOrder.length) return preferences;
  const sectionOrder = [...preferences.sectionOrder];
  sectionOrder.splice(from, 1);
  sectionOrder.splice(to, 0, section);
  return { ...preferences, sectionOrder };
}

/** Adds or removes one preferred index/sector; refuses to grow past the server's cap. */
export function togglePreferred(
  current: readonly string[],
  value: string,
  limit: number,
): { next: string[]; atLimit: boolean } {
  if (current.includes(value))
    return { next: current.filter((item) => item !== value), atLimit: false };
  if (current.length >= limit) return { next: [...current], atLimit: true };
  return { next: [...current, value], atLimit: false };
}

/**
 * The rows the user asked for, in feed order — or every row when none of their picks is in
 * today's feed, so a stale preference never blanks a section (the web does the same).
 */
export function pickPreferred<T>(
  rows: readonly T[],
  preferred: readonly string[],
  nameOf: (row: T) => string,
): T[] {
  if (preferred.length === 0) return [...rows];
  const wanted = new Set(preferred);
  const selected = rows.filter((row) => wanted.has(nameOf(row)));
  return selected.length > 0 ? selected : [...rows];
}

/** Advance / decline / unchanged as percentages of the measured total (all 0 when empty). */
export function breadthShares(breadth: Pick<BriefBreadth, 'advances' | 'declines' | 'unchanged'>) {
  const total = breadth.advances + breadth.declines + breadth.unchanged;
  if (total <= 0) return { advances: 0, declines: 0, unchanged: 0 };
  return {
    advances: (breadth.advances / total) * 100,
    declines: (breadth.declines / total) * 100,
    unchanged: (breadth.unchanged / total) * 100,
  };
}

/** Bar length for a sector move, relative to the largest move shown (never below 3%). */
export function sectorBarPercent(changePct: number, maxAbs: number): number {
  if (!Number.isFinite(changePct) || !(maxAbs > 0)) return 3;
  return Math.min(100, Math.max(3, (Math.abs(changePct) / maxAbs) * 100));
}

/**
 * What the "attention" section lists: the AI's items when an analysis exists, otherwise the
 * watchlist's largest moves, phrased as observations — the same fallback the web uses.
 */
export function attentionItems(brief: DailyBrief): AttentionItem[] {
  if (brief.ai) return brief.ai.attention;
  return brief.watchlist.attention.map((item) => ({
    symbol: item.symbol,
    title: `${item.symbol} moved ${formatSignedPercent(item.changePct)}`,
    whatHappened: `It is one of the largest absolute moves in your ${item.watchlist} watchlist.`,
    whyItMatters: item.note ?? 'A larger move may warrant reviewing the chart and recent news.',
    risk: 'A one-day move alone is not an investment signal.',
  }));
}

/** Narration speeds, cycled by the player's speed button. */
export const NARRATION_SPEEDS = [1, 1.25, 1.5, 2] as const;

export function nextSpeed(current: number): number {
  const index = NARRATION_SPEEDS.indexOf(current as (typeof NARRATION_SPEEDS)[number]);
  return NARRATION_SPEEDS[(index + 1) % NARRATION_SPEEDS.length]!;
}

/**
 * Fits a transcript under the platform's speech limit (about 4,000 characters on Android),
 * cutting at the last sentence end that fits rather than mid-word.
 */
export function fitTranscript(transcript: string, maxLength: number): string {
  const clean = transcript.replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLength) return clean;
  const cut = clean.slice(0, maxLength);
  const lastStop = cut.lastIndexOf('. ');
  return lastStop > maxLength * 0.5 ? cut.slice(0, lastStop + 1) : cut;
}
