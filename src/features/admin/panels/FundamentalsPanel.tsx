import React from 'react';
import { ActivityIndicator, Pressable, Switch, Text, View } from 'react-native';

import { SplitColumns } from '@/components/layout/Grid';
import { useScreenLayout } from '@/components/layout/responsive';
import { ListSkeleton, StackScreen } from '@/components/navigation/StackScreen';
import { Badge } from '@/components/ui/Badge';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { KeyValueRow } from '@/components/ui/KeyValueRow';
import { ListCard, RowDivider, Section } from '@/components/ui/Section';
import { AdminQueryError } from '@/features/admin/components/AdminState';
import {
  useFailedFundamentalJobs,
  useFundamentalIndices,
  useFundamentalsAdminActions,
  useFundamentalsOverview,
  type BatchRunView,
} from '@/features/fundamentals/admin';
import { STAGE_TEXT } from '@/features/fundamentals/lib/format';
import type { JobStage } from '@/features/fundamentals/types';
import { confirmAction } from '@/features/settings/lib/confirm';
import { formatNumber } from '@/lib/utils/formatters';
import { toast } from '@/lib/utils/toast';
import { useTheme } from '@/theme/ThemeProvider';
import { getErrorMessage } from '@/types/api';

const NUM = { fontVariant: ['tabular-nums' as const] };

function when(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleString('en-IN', {
        day: 'numeric',
        month: 'short',
        hour: 'numeric',
        minute: '2-digit',
        timeZone: 'Asia/Kolkata',
      });
}

/**
 * Admin › Fundamental analysis (web: Admin console › Fundamentals) — the weekly batch over the
 * index stocks: whether a worker has scheduled it, the current run's progress, queue depth, AI
 * spend against the on-demand budget, failed jobs with a retry, and which indices feed it.
 */
export function FundamentalsPanel() {
  const layout = useScreenLayout();
  const overview = useFundamentalsOverview();
  const failed = useFailedFundamentalJobs();
  const indices = useFundamentalIndices();
  const { startBatch, retry, setIndexEnabled } = useFundamentalsAdminActions();
  const o = overview.data;

  const confirmStart = () =>
    confirmAction({
      title: 'Start a batch now?',
      message:
        'Refreshes the index constituents, then queues an analysis for every stock of every enabled index. It spends AI budget.',
      confirmLabel: 'Start batch',
      onConfirm: () =>
        startBatch.mutate(undefined, {
          onSuccess: (result) =>
            toast.info(
              result.status === 'already_running' ? 'A batch is already running' : 'Batch started',
              result.message,
            ),
          onError: (error) => toast.error("Couldn't start the batch", getErrorMessage(error)),
        }),
    });

  return (
    <StackScreen
      title="Fundamental analysis"
      subtitle={o ? `Framework ${o.frameworkVersion}` : 'Weekly batch and on-demand jobs'}
      onRefresh={() => Promise.all([overview.refetch(), failed.refetch(), indices.refetch()])}
      fill
    >
      <SplitColumns
        split={!layout.compact}
        left={
          overview.isPending ? (
            <ListSkeleton rows={4} />
          ) : !o ? (
            <AdminQueryError
              what="the fundamentals overview"
              error={overview.error}
              onRetry={() => void overview.refetch()}
            />
          ) : (
            <View>
              {o.alerts.map((alert) => (
                <Banner key={alert} tone="warning" className="mb-3" message={alert} />
              ))}
              <Card>
                <KeyValueRow
                  label="Weekly batch"
                  hint={
                    o.schedule ? `Next ${when(o.schedule.nextRunAt)}` : 'No worker has scheduled it'
                  }
                  value={o.schedule ? o.schedule.pattern : 'Not scheduled'}
                />
                <KeyValueRow
                  label="Failed in the last 24 h"
                  value={formatNumber(o.failedLast24h, 0)}
                  trend={o.failedLast24h > 0 ? -1 : undefined}
                  divider
                />
                <KeyValueRow
                  label="High-priority wait (p95)"
                  value={
                    o.highWaitP95Seconds == null
                      ? '—'
                      : `${formatNumber(o.highWaitP95Seconds, 0)} s`
                  }
                  divider
                />
                <KeyValueRow
                  label="AI provider errors"
                  hint={`${formatNumber(o.provider.ok, 0)} ok · ${formatNumber(o.provider.error, 0)} failed`}
                  value={
                    o.provider.errorRatePct == null
                      ? '—'
                      : `${formatNumber(o.provider.errorRatePct, 1)}%`
                  }
                  divider
                />
                <KeyValueRow
                  label="On-demand AI budget today"
                  hint={`${formatNumber(o.ai.onDemandBudget.calls, 0)} / ${formatNumber(o.ai.onDemandBudget.callCap, 0)} calls`}
                  value={`$${formatNumber(o.ai.onDemandBudget.usd, 2)} / $${formatNumber(o.ai.onDemandBudget.usdCap, 2)}`}
                  trend={o.ai.onDemandBudget.exceeded ? -1 : undefined}
                  divider
                />
              </Card>
              <Button
                label="Start a batch now"
                variant="secondary"
                className="mt-3"
                loading={startBatch.isPending}
                disabled={Boolean(o.currentBatch)}
                onPress={confirmStart}
              />

              <BatchCard title="Current batch" run={o.currentBatch} />
              <BatchCard title="Last batch" run={o.lastBatch} />

              <Section title="Average stage time" note="last 24 h">
                <ListCard className="px-3.5">
                  {Object.entries(o.stageAvgMs).map(([stage, ms], index) => (
                    <KeyValueRow
                      key={stage}
                      label={STAGE_TEXT[stage as JobStage] ?? stage}
                      value={ms == null ? '—' : `${formatNumber(ms / 1000, 1)} s`}
                      divider={index > 0}
                    />
                  ))}
                </ListCard>
              </Section>
            </View>
          )
        }
        right={
          <>
            <Section
              title="Failed jobs"
              className={layout.compact ? undefined : 'mt-0'}
              note={failed.data ? String(failed.data.length) : undefined}
            >
              {failed.isPending ? (
                <ListSkeleton rows={2} />
              ) : !failed.data ? (
                <AdminQueryError
                  what="failed jobs"
                  error={failed.error}
                  onRetry={() => void failed.refetch()}
                />
              ) : failed.data.length === 0 ? (
                <Text className="text-[13px] text-ink-muted dark:text-ink-dark-muted">
                  Nothing has failed.
                </Text>
              ) : (
                <ListCard>
                  {failed.data.slice(0, 30).map((job, index) => (
                    <View key={job.id}>
                      {index > 0 ? <RowDivider /> : null}
                      <View className="gap-1 px-3.5 py-3">
                        <View className="flex-row items-center gap-2">
                          <Text
                            className="flex-1 text-sm font-semibold text-ink dark:text-ink-dark"
                            numberOfLines={1}
                          >
                            {job.symbol} · {job.companyName}
                          </Text>
                          <Badge label={job.status} variant="danger" />
                        </View>
                        <Text
                          className="text-xs leading-[17px] text-ink-muted dark:text-ink-dark-muted"
                          numberOfLines={3}
                        >
                          {job.error ?? 'No error recorded'} · {job.attempts} attempt
                          {job.attempts === 1 ? '' : 's'} · {when(job.finishedAt)}
                        </Text>
                        {job.retryable !== false ? (
                          <Pressable
                            accessibilityRole="button"
                            disabled={retry.isPending}
                            onPress={() =>
                              retry.mutate(job.id, {
                                onSuccess: () =>
                                  toast.success('Retry queued', `${job.symbol} at high priority.`),
                                onError: (error) =>
                                  toast.error("Couldn't retry", getErrorMessage(error)),
                              })
                            }
                            className="mt-1 self-start active:opacity-60"
                          >
                            <Text className="text-[13px] font-semibold text-brand-text dark:text-brand-text-dark">
                              Retry
                            </Text>
                          </Pressable>
                        ) : null}
                      </View>
                    </View>
                  ))}
                </ListCard>
              )}
            </Section>

            <Section title="Indices in the weekly batch">
              {indices.isPending ? (
                <ListSkeleton rows={3} />
              ) : !indices.data ? (
                <AdminQueryError
                  what="indices"
                  error={indices.error}
                  onRetry={() => void indices.refetch()}
                />
              ) : (
                <IndexList
                  indices={indices.data}
                  busyKey={
                    setIndexEnabled.isPending ? (setIndexEnabled.variables?.key ?? null) : null
                  }
                  onToggle={(key, enabled) =>
                    setIndexEnabled.mutate(
                      { key, enabled },
                      {
                        onError: (error) =>
                          toast.error("Couldn't update the index", getErrorMessage(error)),
                      },
                    )
                  }
                />
              )}
              <Text className="mt-2 text-xs leading-[17px] text-ink-faint dark:text-ink-dark-faint">
                Custom indices are added from the web console.
              </Text>
            </Section>
          </>
        }
      />
    </StackScreen>
  );
}

function BatchCard({ title, run }: { title: string; run: BatchRunView | null }) {
  if (!run) return null;
  const done = run.completed + run.failed + run.skipped;
  const share = run.enqueued > 0 ? Math.min(100, (done / run.enqueued) * 100) : 0;
  return (
    <Section title={title} note={run.weekKey}>
      <Card>
        <View className="flex-row items-center justify-between">
          <Badge label={run.status} variant={run.finishedAt ? 'neutral' : 'primary'} />
          <Text className="text-xs text-ink-muted dark:text-ink-dark-muted" style={NUM}>
            {formatNumber(done, 0)} of {formatNumber(run.enqueued, 0)} finished
          </Text>
        </View>
        <View className="mt-2.5 h-2 overflow-hidden rounded-full bg-surface-sunk dark:bg-surface-sunk-dark">
          <View className="h-2 rounded-full bg-brand" style={{ width: `${share}%` }} />
        </View>
        <Text className="mt-2 text-xs text-ink-muted dark:text-ink-dark-muted" style={NUM}>
          {formatNumber(run.completed, 0)} completed · {formatNumber(run.partial, 0)} partial ·{' '}
          {formatNumber(run.insufficient, 0)} insufficient · {formatNumber(run.failed, 0)} failed ·{' '}
          {formatNumber(run.skipped, 0)} skipped
        </Text>
        <Text className="mt-1 text-[11px] text-ink-faint dark:text-ink-dark-faint">
          {run.trigger} · started {when(run.startedAt)}
          {run.finishedAt ? ` · finished ${when(run.finishedAt)}` : ''} · $
          {formatNumber(run.costUsd, 2)} AI
        </Text>
        {run.alerts.map((alert) => (
          <Text key={alert} className="mt-1 text-xs text-warning-600 dark:text-warning-dark">
            {alert}
          </Text>
        ))}
      </Card>
    </Section>
  );
}

function IndexList({
  indices,
  busyKey,
  onToggle,
}: {
  indices: { key: string; label: string; exchange: string; enabled: boolean; kind: string }[];
  busyKey: string | null;
  onToggle: (key: string, enabled: boolean) => void;
}) {
  const { colors } = useTheme();
  return (
    <ListCard>
      {indices.map((index, i) => (
        <View key={index.key}>
          {i > 0 ? <RowDivider /> : null}
          <View className="flex-row items-center gap-3 px-3.5 py-2.5">
            <View className="flex-1">
              <Text className="text-sm font-semibold text-ink dark:text-ink-dark">
                {index.label}
              </Text>
              <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">
                {index.exchange} · {index.kind === 'custom' ? 'custom list' : 'catalogue'}
              </Text>
            </View>
            {busyKey === index.key ? (
              <ActivityIndicator size="small" color={colors.accent} />
            ) : null}
            <Switch
              accessibilityLabel={`Include ${index.label} in the weekly batch`}
              value={index.enabled}
              disabled={busyKey !== null}
              onValueChange={(enabled) => onToggle(index.key, enabled)}
              trackColor={{ true: colors.primary, false: colors.borderStrong }}
            />
          </View>
        </View>
      ))}
    </ListCard>
  );
}
