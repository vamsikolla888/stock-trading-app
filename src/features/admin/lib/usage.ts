import type { UsageBucket, UsageGroup, UsagePeriod, UsageTotals } from '../types';

// AI usage & cost, ported from the web's AiUsagePanel/UsageTimeSeries. USD is the recorded
// truth (OpenAI bills in dollars); rupees are derived with the rate the server states.

/** "₹1,234.56" from a USD amount and the server's rate. */
export function inrFromUsd(usd: number, usdToInr: number): string {
  const rupees = usd * usdToInr;
  return `₹${rupees.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export interface UsageCompleteness {
  /** OpenAI calls on a model with no known rate: tokens counted, cost not. */
  missingRateCalls: number;
  /** Calls that returned no usage block: billed tokens that can't be counted. */
  missingUsageCalls: number;
  /** Ollama calls — no per-token price by design, so not an understatement. */
  noTokenPriceCalls: number;
  /** True when Spend is lower than the real bill. */
  understated: boolean;
}

export function usageCompleteness(totals: UsageTotals): UsageCompleteness {
  // `?? 0` so an older server without these fields degrades instead of hiding warnings as NaN.
  const noTokenPriceCalls = totals.noTokenPriceCalls ?? 0;
  const missingRateCalls = Math.max(0, (totals.unpricedCalls ?? 0) - noTokenPriceCalls);
  const missingUsageCalls = totals.missingUsageCalls ?? 0;
  return {
    missingRateCalls,
    missingUsageCalls,
    noTokenPriceCalls,
    understated: missingRateCalls > 0 || missingUsageCalls > 0,
  };
}

/** Share of input tokens served from cache, as a whole percent; null with no input. */
export function cachedInputShare(totals: UsageTotals): number | null {
  if (!totals.promptTokens) return null;
  return Math.round((totals.cachedPromptTokens / totals.promptTokens) * 100);
}

/** A group whose every call is unpriced shows "unpriced", never ₹0 — ₹0 reads as free. */
export function isFullyUnpriced(group: UsageGroup): boolean {
  return group.calls > 0 && group.unpricedCalls === group.calls;
}

/** Cost share of the costliest group, for a breakdown row's bar (0–100). */
export function costShares(groups: readonly UsageGroup[]): Map<string, number> {
  const max = Math.max(0, ...groups.map((group) => group.costUsd));
  return new Map(groups.map((group) => [group.key, max > 0 ? (group.costUsd / max) * 100 : 0]));
}

// Reused across bars — building an Intl.DateTimeFormat per label is slow on Hermes. The
// server buckets in IST, so labels are read in IST too (a device elsewhere would otherwise
// show the previous day for an IST-midnight bucket).
let monthFormat: Intl.DateTimeFormat | null = null;
let dayFormat: Intl.DateTimeFormat | null = null;

export function usageBucketLabel(iso: string, period: UsagePeriod): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '';
  if (period === 'month') {
    monthFormat ??= new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      month: 'short',
      year: '2-digit',
    });
    return monthFormat.format(ms);
  }
  dayFormat ??= new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
  });
  const day = dayFormat.format(ms);
  return period === 'week' ? `w/c ${day}` : day;
}

/** Bars for the spend chart, in rupees. */
export function spendBars(series: readonly UsageBucket[], period: UsagePeriod, usdToInr: number) {
  return series.map((bucket) => ({
    label: usageBucketLabel(bucket.periodStart, period),
    value: bucket.costUsd * usdToInr,
  }));
}

/** Busiest bucket by spend, for the line under the chart. */
export function peakBucket(series: readonly UsageBucket[]): UsageBucket | null {
  return series.reduce<UsageBucket | null>(
    (best, bucket) => (best === null || bucket.costUsd > best.costUsd ? bucket : best),
    null,
  );
}
