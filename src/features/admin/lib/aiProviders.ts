import type { AiProvider, AiUsageReport, UsageBucket, UsageGroup, UsageTotals } from '../types';

/**
 * One provider's slice of the AI usage ledger — Ollama's tokens (it has no per-token price) or
 * OpenAI's tokens and spend.
 *
 * Exact when the server filtered by provider (GET /admin/ai-usage?provider=). On a server that
 * predates the filter, the every-provider report still answers EXACTLY wherever a row belongs to
 * one provider: every row counts its Ollama calls (`noTokenPriceCalls`), so a model or a day served
 * by one provider alone is that provider's. Only a row that mixed both cannot be split, and it is
 * left out and counted rather than guessed.
 */

export interface ProviderTotals {
  calls: number;
  promptTokens: number;
  completionTokens: number;
  cachedPromptTokens: number;
  totalTokens: number;
  costUsd: number;
  failedCalls: number;
  /** Calls that returned no token count — in Calls, but not in the token totals. */
  missingUsageCalls: number;
  avgLatencyMs: number | null;
}

export interface ProviderPoint {
  periodStart: string;
  calls: number;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
}

export interface ProviderUsage {
  provider: AiProvider;
  /** False when some figure came from a report that could not split every row. */
  exact: boolean;
  totals: ProviderTotals;
  /** Null when a bucket mixed both providers and the server could not split it. */
  series: ProviderPoint[] | null;
  /** Largest token use first. */
  byFeature: UsageGroup[];
  byModel: UsageGroup[];
  /** Rows (features, buckets) that served both providers and were left out. */
  mixedRows: number;
}

/** Calls in a row that went to this provider. */
function providerCalls(row: UsageTotals, provider: AiProvider): number {
  const ollama = row.noTokenPriceCalls ?? 0;
  return provider === 'ollama' ? ollama : Math.max(0, row.calls - ollama);
}

/** The row belongs to this provider alone. */
export function isProviderRow(row: UsageTotals, provider: AiProvider): boolean {
  return row.calls > 0 && providerCalls(row, provider) === row.calls;
}

/** The row served both providers, so its tokens cannot be split. */
export function isMixedRow(row: UsageTotals): boolean {
  const ollama = row.noTokenPriceCalls ?? 0;
  return ollama > 0 && ollama < row.calls;
}

const byTokens = (a: UsageGroup, b: UsageGroup) =>
  b.totalTokens - a.totalTokens || b.calls - a.calls;

function sumTotals(rows: readonly UsageTotals[]): ProviderTotals {
  const calls = rows.reduce((sum, row) => sum + row.calls, 0);
  const weighted = rows.reduce(
    (sum, row) => (row.avgLatencyMs == null ? sum : sum + row.avgLatencyMs * row.calls),
    0,
  );
  const timedCalls = rows.reduce(
    (sum, row) => (row.avgLatencyMs == null ? sum : sum + row.calls),
    0,
  );
  return {
    calls,
    promptTokens: rows.reduce((sum, row) => sum + row.promptTokens, 0),
    completionTokens: rows.reduce((sum, row) => sum + row.completionTokens, 0),
    cachedPromptTokens: rows.reduce((sum, row) => sum + row.cachedPromptTokens, 0),
    totalTokens: rows.reduce((sum, row) => sum + row.totalTokens, 0),
    costUsd: rows.reduce((sum, row) => sum + row.costUsd, 0),
    failedCalls: rows.reduce((sum, row) => sum + row.failedCalls, 0),
    missingUsageCalls: rows.reduce((sum, row) => sum + (row.missingUsageCalls ?? 0), 0),
    avgLatencyMs: timedCalls > 0 ? weighted / timedCalls : null,
  };
}

function point(bucket: UsageBucket, mine: boolean): ProviderPoint {
  return {
    periodStart: bucket.periodStart,
    calls: mine ? bucket.calls : 0,
    promptTokens: mine ? bucket.promptTokens : 0,
    completionTokens: mine ? bucket.completionTokens : 0,
    costUsd: mine ? bucket.costUsd : 0,
  };
}

export function providerUsage(
  report: AiUsageReport,
  provider: AiProvider,
  filtered: boolean,
): ProviderUsage {
  if (filtered) {
    const t = report.totals;
    return {
      provider,
      exact: true,
      totals: {
        calls: t.calls,
        promptTokens: t.promptTokens,
        completionTokens: t.completionTokens,
        cachedPromptTokens: t.cachedPromptTokens,
        totalTokens: t.totalTokens,
        costUsd: t.costUsd,
        failedCalls: t.failedCalls,
        missingUsageCalls: t.missingUsageCalls ?? 0,
        avgLatencyMs: t.avgLatencyMs,
      },
      series: report.series.map((bucket) => point(bucket, true)),
      byFeature: report.byFeature.filter((row) => row.calls > 0).sort(byTokens),
      byModel: report.byModel.filter((row) => row.calls > 0).sort(byTokens),
      mixedRows: 0,
    };
  }

  // Every model is served by one provider, so the model rows split the totals exactly.
  const models = report.byModel.filter((row) => isProviderRow(row, provider));
  const features = report.byFeature.filter((row) => isProviderRow(row, provider));
  const mixedFeatures = report.byFeature.filter(isMixedRow).length;
  const mixedBuckets = report.series.filter(isMixedRow).length;
  return {
    provider,
    exact: mixedFeatures === 0 && mixedBuckets === 0,
    totals: sumTotals(models),
    series:
      mixedBuckets > 0
        ? null
        : report.series.map((bucket) => point(bucket, isProviderRow(bucket, provider))),
    byFeature: features.sort(byTokens),
    byModel: models.sort(byTokens),
    mixedRows: mixedFeatures + mixedBuckets,
  };
}

/** Each group's share of the largest group's tokens, 0–100, for a breakdown bar. */
export function tokenShares(groups: readonly UsageGroup[]): Map<string, number> {
  const max = Math.max(0, ...groups.map((group) => group.totalTokens));
  return new Map(groups.map((group) => [group.key, max > 0 ? (group.totalTokens / max) * 100 : 0]));
}

/**
 * Tokens per call, input and output together — how heavy a typical call is. Failed calls spend
 * no tokens, so they are left out of the average when the count is known.
 */
export function tokensPerCall(
  totals: Pick<ProviderTotals, 'calls' | 'totalTokens'> & { failedCalls?: number },
): number | null {
  const answered = totals.calls - (totals.failedCalls ?? 0);
  return answered > 0 ? totals.totalTokens / answered : null;
}

/** The bucket with the most tokens, or null when nothing was called. */
export function peakPoint(series: readonly ProviderPoint[] | null): ProviderPoint | null {
  let best: ProviderPoint | null = null;
  for (const p of series ?? []) {
    if (p.calls === 0) continue;
    if (!best || p.promptTokens + p.completionTokens > best.promptTokens + best.completionTokens) {
      best = p;
    }
  }
  return best;
}
