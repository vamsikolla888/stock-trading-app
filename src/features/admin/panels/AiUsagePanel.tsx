import React, { useState } from 'react';
import { Text, View } from 'react-native';

import { ListSkeleton, StackScreen } from '@/components/navigation/StackScreen';
import { KpiGrid } from '@/components/ui/KpiGrid';
import { ListCard, RowDivider, Section } from '@/components/ui/Section';
import { SegmentedControl } from '@/components/ui/Tabs';
import { AdminQueryError } from '@/features/admin/components/AdminState';
import { BreakdownRow, ChartCard, NoticeCard } from '@/features/admin/components/OpsBits';
import { useAiUsage } from '@/features/admin/hooks';
import { formatCount, formatMs, formatTokens } from '@/features/admin/lib/format';
import {
  cachedInputShare,
  costShares,
  inrFromUsd,
  isFullyUnpriced,
  peakBucket,
  spendBars,
  usageBucketLabel,
  usageCompleteness,
} from '@/features/admin/lib/usage';
import type { UsageGroup, UsagePeriod } from '@/features/admin/types';

const PERIODS: readonly { key: UsagePeriod; label: string }[] = [
  { key: 'day', label: 'Daily' },
  { key: 'week', label: 'Weekly' },
  { key: 'month', label: 'Monthly' },
];

const PERIOD_HINT: Record<UsagePeriod, string> = {
  day: 'Last 30 days, one bar per day',
  week: 'Last 12 weeks, weeks starting Monday',
  month: 'Last 12 months',
};

function Breakdown({ rows, usdToInr }: { rows: UsageGroup[]; usdToInr: number }) {
  if (rows.length === 0)
    return (
      <Text className="text-[13px] text-ink-muted dark:text-ink-dark-muted">
        No calls recorded in this window.
      </Text>
    );
  const shares = costShares(rows);
  return (
    <ListCard>
      {rows.map((row, index) => (
        <View key={row.key}>
          {index > 0 ? <RowDivider /> : null}
          <BreakdownRow
            name={row.key}
            // Not ₹0 — that reads as free. Unpriced calls were either billed at an unknown
            // rate (OpenAI) or have no per-token price at all (Ollama).
            value={isFullyUnpriced(row) ? 'Unpriced' : inrFromUsd(row.costUsd, usdToInr)}
            valueClassName={
              isFullyUnpriced(row) ? 'text-ink-muted dark:text-ink-dark-muted' : undefined
            }
            details={`${formatCount(row.calls)} calls · ${formatTokens(row.promptTokens)} in · ${formatTokens(row.completionTokens)} out`}
            share={shares.get(row.key) ?? 0}
            tone="brand"
          />
        </View>
      ))}
    </ListCard>
  );
}

/** AI usage & cost from the ai_usage_events ledger (web: AI usage & cost). */
export function AiUsagePanel() {
  const [period, setPeriod] = useState<UsagePeriod>('day');
  const usage = useAiUsage(period);
  const data = usage.data;
  const completeness = data ? usageCompleteness(data.totals) : null;
  const cached = data ? cachedInputShare(data.totals) : null;
  const peak = data ? peakBucket(data.series) : null;

  return (
    <StackScreen
      title="AI usage & cost"
      subtitle={PERIOD_HINT[period]}
      onRefresh={() => usage.refetch()}
    >
      <SegmentedControl items={PERIODS} value={period} onChange={setPeriod} />
      <View className="mt-4">
        {usage.isPending ? (
          <ListSkeleton rows={4} />
        ) : !data || !completeness ? (
          <AdminQueryError
            what="AI usage"
            error={usage.error}
            onRetry={() => void usage.refetch()}
          />
        ) : (
          <>
            {/* Completeness warnings sit ABOVE the totals they qualify, not as a footnote. */}
            {completeness.understated ? (
              <View className="mb-3">
                <NoticeCard tone="warn" title="Spend below is an understatement">
                  <View className="gap-1">
                    {completeness.missingRateCalls > 0 ? (
                      <Text className="text-xs leading-[17px] text-ink-muted dark:text-ink-dark-muted">
                        {formatCount(completeness.missingRateCalls)} OpenAI call
                        {completeness.missingRateCalls === 1 ? '' : 's'} used a model with no known
                        rate — tokens counted, cost not.
                      </Text>
                    ) : null}
                    {completeness.missingUsageCalls > 0 ? (
                      <Text className="text-xs leading-[17px] text-ink-muted dark:text-ink-dark-muted">
                        {formatCount(completeness.missingUsageCalls)} call
                        {completeness.missingUsageCalls === 1 ? '' : 's'} returned no usage, so
                        those tokens were billed but can’t be counted.
                      </Text>
                    ) : null}
                  </View>
                </NoticeCard>
              </View>
            ) : null}

            <KpiGrid
              items={[
                {
                  label: 'Spend',
                  value: inrFromUsd(data.totals.costUsd, data.pricing.usdToInr),
                  sub: `$${data.totals.costUsd.toFixed(4)} at ₹${data.pricing.usdToInr}/$`,
                },
                {
                  label: 'Calls',
                  value: formatCount(data.totals.calls),
                  sub:
                    data.totals.failedCalls > 0
                      ? `${formatCount(data.totals.failedCalls)} failed`
                      : 'All succeeded',
                  ...(data.totals.failedCalls > 0 ? { trend: -1 } : {}),
                },
                {
                  label: 'Tokens',
                  value: formatTokens(data.totals.totalTokens),
                  sub: `${formatTokens(data.totals.promptTokens)} in · ${formatTokens(data.totals.completionTokens)} out`,
                },
                {
                  label: 'Cached input',
                  value: formatTokens(data.totals.cachedPromptTokens),
                  sub: cached === null ? 'No input yet' : `${cached}% of input`,
                },
                { label: 'Avg latency', value: formatMs(data.totals.avgLatencyMs) },
              ]}
            />
            {completeness.noTokenPriceCalls > 0 ? (
              <Text className="mt-2 text-xs leading-[17px] text-ink-muted dark:text-ink-dark-muted">
                {formatCount(completeness.noTokenPriceCalls)} call
                {completeness.noTokenPriceCalls === 1 ? '' : 's'} went to Ollama, which has no
                per-token price — their tokens are counted; Spend covers OpenAI only.
              </Text>
            ) : null}

            <Section title="Spend over time">
              <ChartCard
                title={`Rupees per ${period}`}
                bars={spendBars(data.series, period, data.pricing.usdToInr)}
                accessibilityLabel={`AI spend per ${period}`}
                footer={
                  peak && peak.costUsd > 0
                    ? `Highest: ${usageBucketLabel(peak.periodStart, period)} · ${inrFromUsd(peak.costUsd, data.pricing.usdToInr)} · ${formatCount(peak.calls)} calls`
                    : undefined
                }
              />
            </Section>

            <Section title="By feature" note="Where the money goes">
              <Breakdown rows={data.byFeature} usdToInr={data.pricing.usdToInr} />
            </Section>

            <Section title="By model">
              <Breakdown rows={data.byModel} usdToInr={data.pricing.usdToInr} />
            </Section>

            <Text className="mt-4 text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint">
              Every AI call is recorded at one shared wrapper, so nothing is sampled. OpenAI cost is
              priced per call at list prices as of {data.pricing.asOf} — check OpenAI’s pricing page
              before treating a total as a bill.
            </Text>
          </>
        )}
      </View>
    </StackScreen>
  );
}
