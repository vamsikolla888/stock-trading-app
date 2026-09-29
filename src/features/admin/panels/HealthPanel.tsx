import React, { useState } from 'react';
import { Text, View } from 'react-native';

import { ListSkeleton, StackScreen } from '@/components/navigation/StackScreen';
import { Card } from '@/components/ui/Card';
import { SegmentedControl } from '@/components/ui/Tabs';
import { AdminQueryError } from '@/features/admin/components/AdminState';
import { NoticeCard, UptimeStrip } from '@/features/admin/components/OpsBits';
import { useServiceHealth } from '@/features/admin/hooks';
import { formatCount, formatMs, formatUptimePct, uptimeTone } from '@/features/admin/lib/format';
import type { ObsRange, ServiceHealthRow } from '@/features/admin/types';
import { monoFont } from '@/features/settings/components/JsonBlock';
import { StatusPill } from '@/features/settings/components/StatusPill';
import type { StatusTone } from '@/features/settings/lib/status';
import { formatClock, formatDateTime } from '@/features/settings/lib/time';
import { cn } from '@/lib/utils/cn';

export const OBS_RANGES: readonly { key: ObsRange; label: string }[] = [
  { key: '1h', label: '1h' },
  { key: '24h', label: '24h' },
  { key: '7d', label: '7d' },
  { key: '30d', label: '30d' },
];

/** What each probe is, in a few words — a bare "mstock" doesn't say what a red row means. */
const DESCRIPTION: Record<string, string> = {
  mongo: 'Primary datastore · admin ping',
  redis: 'Cache, queues, pub/sub · PING',
  mstock: 'Broker REST · from circuit breakers',
  'quant-service': 'Python backtester · /api/v1/health/live',
  worker: 'Jobs process · Redis heartbeat',
  'screener-worker': 'Screener process · Redis heartbeat',
};

const UPTIME_TEXT: Record<StatusTone, string> = {
  ok: 'text-brand-text dark:text-brand-text-dark',
  warn: 'text-warning-600 dark:text-warning-dark',
  bad: 'text-danger-600 dark:text-danger-dark',
  info: 'text-info dark:text-info-dark',
  neutral: 'text-ink-muted dark:text-ink-dark-muted',
};

function serviceState(row: ServiceHealthRow): { tone: StatusTone; label: string } {
  // Unknown is grey, never green: an unmeasured dependency must not look healthy.
  if (row.checks === 0 && (row.detail ?? '').includes('no checks'))
    return { tone: 'neutral', label: 'Unknown' };
  return row.ok ? { tone: 'ok', label: 'Up' } : { tone: 'bad', label: 'Down' };
}

function ServiceCard({ row }: { row: ServiceHealthRow }) {
  const state = serviceState(row);
  const tone = uptimeTone(row.uptimePct);
  return (
    <Card className="gap-3">
      <View className="flex-row items-start gap-3">
        <View className="flex-1">
          <Text
            className="text-sm font-semibold text-ink dark:text-ink-dark"
            style={{ fontFamily: monoFont }}
          >
            {row.service}
          </Text>
          {DESCRIPTION[row.service] ? (
            <Text className="mt-0.5 text-xs text-ink-muted dark:text-ink-dark-muted">
              {DESCRIPTION[row.service]}
            </Text>
          ) : null}
        </View>
        <StatusPill tone={state.tone} label={state.label} />
      </View>
      <View className="flex-row gap-4">
        <View className="flex-1">
          <Text className="text-[11px] text-ink-muted dark:text-ink-dark-muted">Uptime</Text>
          <Text className={cn('mt-0.5 text-sm font-bold', UPTIME_TEXT[tone])}>
            {formatUptimePct(row.uptimePct)}
          </Text>
        </View>
        <View className="flex-1">
          <Text className="text-[11px] text-ink-muted dark:text-ink-dark-muted">Avg latency</Text>
          <Text className="mt-0.5 text-sm font-bold text-ink dark:text-ink-dark">
            {formatMs(row.avgLatencyMs)}
          </Text>
        </View>
        <View className="flex-1">
          <Text className="text-[11px] text-ink-muted dark:text-ink-dark-muted">Checks</Text>
          <Text className="mt-0.5 text-sm font-bold text-ink dark:text-ink-dark">
            {formatCount(row.checks)}
            {row.failures > 0 ? (
              <Text className="text-xs font-semibold text-danger-600 dark:text-danger-dark">
                {` · ${formatCount(row.failures)} failed`}
              </Text>
            ) : null}
          </Text>
        </View>
      </View>
      <UptimeStrip
        series={row.series}
        accessibilityLabel={`${row.service} uptime history, ${row.series.length} buckets`}
      />
      <Text className="text-xs leading-[17px] text-ink-muted dark:text-ink-dark-muted" selectable>
        {row.detail ??
          (row.lastFailureAt
            ? `Last failure ${formatDateTime(row.lastFailureAt)}`
            : 'No failures recorded')}
      </Text>
    </Card>
  );
}

/** Dependency health with history, from the every-minute checker (web: Service health). */
export function HealthPanel() {
  const [range, setRange] = useState<ObsRange>('24h');
  const health = useServiceHealth(range);
  const data = health.data;

  return (
    <StackScreen
      title="Service health"
      subtitle={
        data
          ? `Every ${Math.round(data.intervalMs / 1000)}s · ${data.retentionDays}d kept${data.checkedAt ? ` · last ${formatClock(data.checkedAt)}` : ''}`
          : 'Dependency probes'
      }
      onRefresh={() => health.refetch()}
    >
      <SegmentedControl items={OBS_RANGES} value={range} onChange={setRange} />
      <View className="mt-4 gap-3">
        {health.isPending ? (
          <ListSkeleton rows={4} />
        ) : !data ? (
          <AdminQueryError
            what="service health"
            error={health.error}
            onRetry={() => void health.refetch()}
          />
        ) : (
          <>
            {!data.overall.ok ? (
              <NoticeCard tone="bad" title={`${data.overall.degraded.length} degraded`}>
                {data.overall.degraded.join(', ')}
              </NoticeCard>
            ) : null}
            {data.checkedAt == null ? (
              <NoticeCard tone="info" title="No live probe yet">
                No check has run in this API process since it started. The rows below are stored
                history.
              </NoticeCard>
            ) : null}
            {data.services.map((row) => (
              <ServiceCard key={row.service} row={row} />
            ))}
            <Text className="text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint">
              Each bar is one {data.bucket} — green passed every check, amber some, red most; grey
              wasn’t sampled.
            </Text>
          </>
        )}
      </View>
    </StackScreen>
  );
}
