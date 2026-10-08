import React, { useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import { AreaChart } from '@/components/charts/AreaChart';
import { Panel } from '@/components/dashboard/Panel';
import { ShareBar } from '@/components/dashboard/ShareBar';
import { StatTile } from '@/components/dashboard/StatTile';
import { Grid, GridItem } from '@/components/layout/Grid';
import { useScreenLayout } from '@/components/layout/responsive';
import { ListSkeleton, StackScreen } from '@/components/navigation/StackScreen';
import { RowDivider } from '@/components/ui/Section';
import { RangeSelector, SegmentedControl } from '@/components/ui/Tabs';
import { AdminQueryError } from '@/features/admin/components/AdminState';
import { BreakdownRow, NoticeCard, PanelToggle } from '@/features/admin/components/OpsBits';
import { useProviderUsage } from '@/features/admin/hooks';
import {
  peakPoint,
  providerUsage,
  tokenShares,
  tokensPerCall,
  type ProviderUsage,
} from '@/features/admin/lib/aiProviders';
import {
  failedCallsLabel,
  failureTone,
  formatCount,
  formatMs,
  formatTokens,
} from '@/features/admin/lib/format';
import { inrFromUsd, usageBucketLabel, usageCompleteness } from '@/features/admin/lib/usage';
import type { AiProvider, AiUsageReport, UsageGroup, UsagePeriod } from '@/features/admin/types';
import { useTheme } from '@/theme/ThemeProvider';

const PROVIDERS: readonly { key: AiProvider; label: string }[] = [
  { key: 'ollama', label: 'Ollama' },
  { key: 'openai', label: 'OpenAI' },
];

const PERIODS: readonly { key: UsagePeriod; label: string }[] = [
  { key: 'day', label: '30D' },
  { key: 'week', label: '12W' },
  { key: 'month', label: '12M' },
];

const PER: Record<UsagePeriod, string> = { day: 'day', week: 'week', month: 'month' };

function Breakdown({
  title,
  rows,
  value,
  emptyText,
}: {
  title: string;
  rows: UsageGroup[];
  value: (row: UsageGroup) => string;
  emptyText: string;
}) {
  const shares = tokenShares(rows);
  return (
    <Panel title={title} meta={rows.length ? `${rows.length}` : undefined} flush>
      {rows.length === 0 ? (
        <Text className="px-4 pb-4 text-[13px] text-ink-muted dark:text-ink-dark-muted">
          {emptyText}
        </Text>
      ) : (
        rows.map((row, index) => (
          <View key={row.key}>
            {index > 0 ? <RowDivider /> : null}
            <BreakdownRow
              name={row.key}
              value={value(row)}
              details={`${formatCount(row.calls)} calls · ${formatTokens(row.promptTokens)} in · ${formatTokens(row.completionTokens)} out${row.avgLatencyMs != null ? ` · ${formatMs(row.avgLatencyMs)}` : ''}`}
              share={shares.get(row.key) ?? 0}
              tone="info"
            />
          </View>
        ))
      )}
    </Panel>
  );
}

/** Ollama: tokens only — it has no per-token price, so no rupee figure ever appears here. */
function OllamaView({ usage, period }: { usage: ProviderUsage; period: UsagePeriod }) {
  const { colors } = useTheme();
  const layout = useScreenLayout();
  const t = usage.totals;
  const series = usage.series;
  const labels = useMemo(
    () => (series ?? []).map((p) => usageBucketLabel(p.periodStart, period)),
    [series, period],
  );
  const perCall = tokensPerCall(t);
  const peak = peakPoint(series);

  return (
    <View>
      <Grid columns={layout.kpiColumns}>
        <StatTile
          label="Tokens"
          value={formatTokens(t.totalTokens)}
          sub={`${formatCount(t.calls)} calls`}
          trend={series?.map((p) => p.promptTokens + p.completionTokens)}
        />
        <StatTile label="Input" value={formatTokens(t.promptTokens)} sub="Prompt tokens" />
        <StatTile label="Output" value={formatTokens(t.completionTokens)} sub="Generated tokens" />
        <StatTile
          label="Calls"
          value={formatCount(t.calls)}
          status={failureTone(t.failedCalls, t.calls)}
          sub={failedCallsLabel(t.failedCalls, t.calls)}
        />
        <StatTile label="Avg latency" value={formatMs(t.avgLatencyMs)} sub="Per call" />
        <StatTile
          label="Per call"
          value={perCall == null ? '—' : formatTokens(perCall)}
          sub="Tokens, answered calls"
        />
      </Grid>

      {t.missingUsageCalls > 0 ? (
        <View className="mt-4">
          <NoticeCard
            tone="warn"
            title={`${formatCount(t.missingUsageCalls)} call${t.missingUsageCalls === 1 ? '' : 's'} returned no token count`}
          >
            They are in Calls but not in the token totals.
          </NoticeCard>
        </View>
      ) : null}

      <Grid columns={layout.columns} gap={layout.compact ? 12 : 16} className="mt-4">
        <GridItem span={2}>
          <Panel title={`Tokens per ${PER[period]}`} meta="Input and output">
            {series ? (
              <AreaChart
                labels={labels}
                stacked
                height={layout.compact ? 150 : 190}
                format={formatTokens}
                accessibilityLabel={`Ollama tokens per ${PER[period]}`}
                series={[
                  {
                    key: 'in',
                    label: 'Input',
                    color: colors.info,
                    values: series.map((p) => p.promptTokens),
                  },
                  {
                    key: 'out',
                    label: 'Output',
                    color: colors.accent,
                    values: series.map((p) => p.completionTokens),
                  },
                ]}
              />
            ) : (
              <Text className="py-6 text-center text-[13px] text-ink-muted dark:text-ink-dark-muted">
                Some {PER[period]}s mixed Ollama and OpenAI calls, and this server can’t split them.
                Totals are exact; the trend needs the server update.
              </Text>
            )}
          </Panel>
        </GridItem>
        <Panel title="Where tokens go" meta="Share of all tokens">
          <ShareBar
            format={formatTokens}
            segments={[
              { label: 'Input', value: t.promptTokens, color: colors.info },
              { label: 'Output', value: t.completionTokens, color: colors.accent },
            ]}
          />
          <View className="mt-4 gap-2 border-t border-line pt-3 dark:border-line-dark">
            <Fact label="Cached input" value={formatTokens(t.cachedPromptTokens)} />
            <Fact
              label="Busiest"
              value={
                peak
                  ? `${usageBucketLabel(peak.periodStart, period)} · ${formatTokens(peak.promptTokens + peak.completionTokens)}`
                  : '—'
              }
            />
            <Fact label="Models" value={formatCount(usage.byModel.length)} />
          </View>
        </Panel>
      </Grid>

      <Grid
        columns={layout.columns >= 2 ? 2 : 1}
        gap={layout.compact ? 12 : 16}
        className="mt-4"
        equalHeight={false}
      >
        <Breakdown
          title="By feature"
          rows={usage.byFeature}
          value={(row) => formatTokens(row.totalTokens)}
          emptyText="No Ollama calls in this window."
        />
        <Breakdown
          title="By model"
          rows={usage.byModel}
          value={(row) => formatTokens(row.totalTokens)}
          emptyText="No Ollama calls in this window."
        />
      </Grid>

      <Text className="mt-4 text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint">
        Ollama has no per-token price, so its usage is counted in tokens, never rupees. Every call
        is recorded at the one wrapper all AI calls share — nothing is sampled.
      </Text>
    </View>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between gap-3">
      <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">{label}</Text>
      <Text
        className="text-xs font-semibold text-ink dark:text-ink-dark"
        style={{ fontVariant: ['tabular-nums'] }}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

/** OpenAI: spend first — it bills per token — with the tokens behind it. */
function OpenAiView({
  usage,
  report,
  period,
}: {
  usage: ProviderUsage;
  report: AiUsageReport;
  period: UsagePeriod;
}) {
  const { colors } = useTheme();
  const layout = useScreenLayout();
  const rate = report.pricing.usdToInr;
  const t = usage.totals;
  const series = usage.series;
  const completeness = usageCompleteness(report.totals);
  const cachedShare =
    t.promptTokens > 0 ? Math.round((t.cachedPromptTokens / t.promptTokens) * 100) : null;
  const labels = (series ?? []).map((p) => usageBucketLabel(p.periodStart, period));
  const [metric, setMetric] = useState<'spend' | 'tokens'>('spend');

  return (
    <View>
      {completeness.missingRateCalls > 0 || completeness.missingUsageCalls > 0 ? (
        <View className="mb-4">
          <NoticeCard tone="warn" title="Spend is an understatement">
            {[
              completeness.missingRateCalls > 0
                ? `${formatCount(completeness.missingRateCalls)} call${completeness.missingRateCalls === 1 ? '' : 's'} used a model with no known rate — tokens counted, cost not.`
                : null,
              completeness.missingUsageCalls > 0
                ? `${formatCount(completeness.missingUsageCalls)} call${completeness.missingUsageCalls === 1 ? '' : 's'} returned no usage, so their tokens can’t be counted.`
                : null,
            ]
              .filter(Boolean)
              .join(' ')}
          </NoticeCard>
        </View>
      ) : null}
      <Grid columns={layout.kpiColumns}>
        <StatTile
          label="Spend"
          value={inrFromUsd(t.costUsd, rate)}
          sub={`$${t.costUsd.toFixed(4)} at ₹${rate}/$`}
          trend={series?.map((p) => p.costUsd)}
        />
        <StatTile
          label="Tokens"
          value={formatTokens(t.totalTokens)}
          sub={`${formatTokens(t.promptTokens)} in · ${formatTokens(t.completionTokens)} out`}
        />
        <StatTile
          label="Calls"
          value={formatCount(t.calls)}
          status={failureTone(t.failedCalls, t.calls)}
          sub={failedCallsLabel(t.failedCalls, t.calls)}
        />
        <StatTile
          label="Cached input"
          value={formatTokens(t.cachedPromptTokens)}
          sub={cachedShare == null ? 'No input yet' : `${cachedShare}% of input`}
        />
        <StatTile label="Avg latency" value={formatMs(t.avgLatencyMs)} sub="Per call" />
        <StatTile
          label="Per call"
          value={t.calls > 0 ? inrFromUsd(t.costUsd / t.calls, rate) : '—'}
          sub="Average spend"
        />
      </Grid>

      <View className="mt-4">
        <Panel
          title={`${metric === 'spend' ? 'Spend' : 'Tokens'} per ${PER[period]}`}
          meta={metric === 'spend' ? '₹, OpenAI list prices' : 'Input and output'}
          right={
            <PanelToggle
              items={[
                { key: 'spend', label: 'Spend' },
                { key: 'tokens', label: 'Tokens' },
              ]}
              value={metric}
              onChange={setMetric}
            />
          }
        >
          {series && metric === 'tokens' ? (
            <AreaChart
              labels={labels}
              stacked
              height={layout.compact ? 150 : 190}
              format={formatTokens}
              accessibilityLabel={`OpenAI tokens per ${PER[period]}`}
              series={[
                {
                  key: 'in',
                  label: 'Input',
                  color: colors.info,
                  values: series.map((p) => p.promptTokens),
                },
                {
                  key: 'out',
                  label: 'Output',
                  color: colors.accent,
                  values: series.map((p) => p.completionTokens),
                },
              ]}
            />
          ) : series ? (
            <AreaChart
              labels={labels}
              height={layout.compact ? 150 : 190}
              format={(v) =>
                `₹${(v * rate).toLocaleString('en-IN', { maximumFractionDigits: v * rate >= 100 ? 0 : 2 })}`
              }
              accessibilityLabel={`OpenAI spend per ${PER[period]}`}
              series={[
                {
                  key: 'spend',
                  label: 'Spend',
                  color: colors.accent,
                  values: series.map((p) => p.costUsd),
                },
              ]}
            />
          ) : (
            <Text className="py-6 text-center text-[13px] text-ink-muted dark:text-ink-dark-muted">
              Some {PER[period]}s mixed providers and this server can’t split them.
            </Text>
          )}
        </Panel>
      </View>

      <Grid
        columns={layout.columns >= 2 ? 2 : 1}
        gap={layout.compact ? 12 : 16}
        className="mt-4"
        equalHeight={false}
      >
        <Breakdown
          title="By feature"
          rows={usage.byFeature}
          value={(row) => inrFromUsd(row.costUsd, rate)}
          emptyText="No OpenAI calls in this window."
        />
        <Breakdown
          title="By model"
          rows={usage.byModel}
          value={(row) => inrFromUsd(row.costUsd, rate)}
          emptyText="No OpenAI calls in this window."
        />
      </Grid>

      <Text className="mt-4 text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint">
        Priced per call at OpenAI list prices as of {report.pricing.asOf} — check OpenAI’s pricing
        page before treating a total as a bill.
      </Text>
    </View>
  );
}

/** AI usage (web: AI usage & cost) — Ollama's tokens and OpenAI's spend, from the call ledger. */
export function AiUsagePanel() {
  const layout = useScreenLayout();
  const [provider, setProvider] = useState<AiProvider>('ollama');
  const [period, setPeriod] = useState<UsagePeriod>('day');
  const usage = useProviderUsage(period, provider);
  const report = usage.data;
  const slice = useMemo(
    () => (report ? providerUsage(report, provider, usage.filtered) : null),
    [report, provider, usage.filtered],
  );

  const controls = (
    <View className={layout.compact ? 'gap-3' : 'flex-row items-center justify-between gap-4'}>
      <View style={layout.compact ? undefined : { width: 280 }}>
        <SegmentedControl items={PROVIDERS} value={provider} onChange={setProvider} />
      </View>
      <RangeSelector items={PERIODS} value={period} onChange={setPeriod} />
    </View>
  );

  return (
    <StackScreen
      title="AI usage"
      subtitle={provider === 'ollama' ? 'Ollama · tokens' : 'OpenAI · spend and tokens'}
      onRefresh={() => usage.refetch()}
      fill
    >
      {controls}
      <View className="mt-4">
        {usage.isPending ? (
          <ListSkeleton rows={4} />
        ) : !report || !slice ? (
          <AdminQueryError
            what="AI usage"
            error={usage.error}
            onRetry={() => void usage.refetch()}
          />
        ) : (
          <>
            {!slice.exact ? (
              <View className="mb-4">
                <NoticeCard tone="info" title="Partly split by provider">
                  {`This server can’t filter by provider, so ${formatCount(slice.mixedRows)} row${slice.mixedRows === 1 ? '' : 's'} that mixed Ollama and OpenAI ${slice.mixedRows === 1 ? 'is' : 'are'} left out of the breakdowns. Totals come from the model rows and are exact.`}
                </NoticeCard>
              </View>
            ) : null}
            {provider === 'ollama' ? (
              <OllamaView usage={slice} period={period} />
            ) : (
              <OpenAiView usage={slice} report={report} period={period} />
            )}
          </>
        )}
      </View>
    </StackScreen>
  );
}
