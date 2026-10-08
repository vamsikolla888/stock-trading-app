import React, { useState } from 'react';
import { Text, View } from 'react-native';

import { StatTile } from '@/components/dashboard/StatTile';
import { Grid } from '@/components/layout/Grid';
import { useScreenLayout } from '@/components/layout/responsive';
import { ListSkeleton, StackScreen } from '@/components/navigation/StackScreen';
import { SegmentedControl } from '@/components/ui/Tabs';
import { AdminQueryError } from '@/features/admin/components/AdminState';
import { NoticeCard } from '@/features/admin/components/OpsBits';
import { ServiceTile } from '@/features/admin/components/ServiceTile';
import { useServiceHealth } from '@/features/admin/hooks';
import { formatCount, formatUptimePct, uptimeTone } from '@/features/admin/lib/format';
import { healthSummary, serviceName } from '@/features/admin/lib/services';
import type { ObsRange } from '@/features/admin/types';
import { formatClock } from '@/features/settings/lib/time';

export const OBS_RANGES: readonly { key: ObsRange; label: string }[] = [
  { key: '1h', label: '1h' },
  { key: '24h', label: '24h' },
  { key: '7d', label: '7d' },
  { key: '30d', label: '30d' },
];

/** Range switch for an ops panel: full width on a phone, a compact control on a wider window. */
export function RangeBar<K extends string>({
  items,
  value,
  onChange,
}: {
  items: readonly { key: K; label: string }[];
  value: K;
  onChange: (key: K) => void;
}) {
  const layout = useScreenLayout();
  return (
    <View style={layout.compact ? undefined : { maxWidth: 360 }}>
      <SegmentedControl items={items} value={value} onChange={onChange} />
    </View>
  );
}

/** Dependency health with history, from the every-minute checker (web: Service health). */
export function HealthPanel() {
  const layout = useScreenLayout();
  const [range, setRange] = useState<ObsRange>('24h');
  const health = useServiceHealth(range);
  const data = health.data;
  const services = data?.services ?? [];
  const summary = healthSummary(services);
  const checks = services.reduce((sum, row) => sum + row.checks, 0);

  return (
    <StackScreen
      title="Service health"
      subtitle={
        data
          ? `Dependency probes${data.checkedAt ? ` · last check ${formatClock(data.checkedAt)}` : ''}`
          : 'Dependency probes'
      }
      onRefresh={() => health.refetch()}
      fill
    >
      <RangeBar items={OBS_RANGES} value={range} onChange={setRange} />
      <View className="mt-4 gap-4">
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
              <NoticeCard
                tone="bad"
                title={`${data.overall.degraded.map(serviceName).join(', ')} ${data.overall.degraded.length === 1 ? 'is' : 'are'} not healthy`}
              >
                The history below shows when it started.
              </NoticeCard>
            ) : null}
            {data.checkedAt == null ? (
              <NoticeCard tone="info" title="No live probe yet">
                No check has run in this API process since it started. The tiles below are stored
                history.
              </NoticeCard>
            ) : null}
            <Grid columns={layout.compact ? 2 : 4} gap={12}>
              <StatTile
                label="Services up"
                value={`${summary.up} of ${summary.total}`}
                status={summary.up === summary.total ? 'ok' : 'bad'}
                sub={data.overall.ok ? 'Right now' : `${data.overall.degraded.length} degraded`}
              />
              <StatTile
                label="Lowest uptime"
                value={formatUptimePct(summary.worst?.uptimePct)}
                status={summary.worst ? uptimeTone(summary.worst.uptimePct) : undefined}
                sub={summary.worst ? serviceName(summary.worst.service) : 'No samples yet'}
              />
              <StatTile
                label="Failed checks"
                value={formatCount(summary.failures)}
                status={summary.failures > 0 ? 'warn' : undefined}
                sub={
                  checks > 0
                    ? `${((summary.failures / checks) * 100).toFixed(2)}% of ${formatCount(checks)} · ${range}`
                    : `In the last ${range}`
                }
              />
              <StatTile
                label="Probe interval"
                value={`${Math.round(data.intervalMs / 1000)}s`}
                sub={`${data.retentionDays} days kept`}
              />
            </Grid>
            <Grid columns={layout.columns} gap={layout.compact ? 12 : 16}>
              {services.map((row) => (
                <ServiceTile key={row.service} row={row} detail />
              ))}
            </Grid>
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
