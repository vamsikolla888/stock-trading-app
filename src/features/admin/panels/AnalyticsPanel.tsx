import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { AreaChart } from '@/components/charts/AreaChart';
import { Panel } from '@/components/dashboard/Panel';
import { StatTile } from '@/components/dashboard/StatTile';
import { Grid, GridItem } from '@/components/layout/Grid';
import { useScreenLayout } from '@/components/layout/responsive';
import { ListSkeleton, StackScreen } from '@/components/navigation/StackScreen';
import { RowDivider } from '@/components/ui/Section';
import { StatGrid } from '@/components/ui/StatGrid';
import { RangeSelector } from '@/components/ui/Tabs';
import { AdminQueryError } from '@/features/admin/components/AdminState';
import { BreakdownRow, NoticeCard } from '@/features/admin/components/OpsBits';
import { useServerAnalytics } from '@/features/admin/hooks';
import {
  bucketLabel,
  formatBytes,
  formatCount,
  formatMs,
  formatRate,
  formatUptime,
} from '@/features/admin/lib/format';
import { errorRate, errorRateTone, trafficSplit } from '@/features/admin/lib/overview';
import { OBS_RANGES, RangeBar } from '@/features/admin/panels/HealthPanel';
import type { ObsRange, ServerAnalyticsReport } from '@/features/admin/types';
import { monoFont } from '@/features/settings/components/JsonBlock';
import { formatClock } from '@/features/settings/lib/time';
import { cn } from '@/lib/utils/cn';
import { useTheme } from '@/theme/ThemeProvider';

type VitalsChart = 'lag' | 'heap' | 'cpu';

const VITALS: readonly { key: VitalsChart; label: string }[] = [
  { key: 'lag', label: 'Loop lag' },
  { key: 'heap', label: 'Heap' },
  { key: 'cpu', label: 'CPU' },
];

const mb = (value: number | null | undefined) =>
  typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(0)} MB` : '—';

function vitalsValues(data: ServerAnalyticsReport, chart: VitalsChart): number[] {
  return data.vitals.map((point) =>
    chart === 'lag'
      ? point.eventLoopLagMaxMs
      : chart === 'heap'
        ? point.heapUsedMaxMb
        : point.cpuMaxPct,
  );
}

const VITALS_FORMAT: Record<VitalsChart, (v: number) => string> = {
  lag: (v) => formatMs(v),
  heap: (v) => mb(v),
  cpu: (v) => `${v.toFixed(0)}%`,
};

/** Inbound HTTP traffic and Node process vitals (web: Server analytics). */
export function AnalyticsPanel() {
  const { colors } = useTheme();
  const layout = useScreenLayout();
  const [range, setRange] = useState<ObsRange>('24h');
  const [vitals, setVitals] = useState<VitalsChart>('lag');
  const [allRoutes, setAllRoutes] = useState(false);
  const analytics = useServerAnalytics(range);
  const data = analytics.data;

  const labels = data
    ? data.series.map((point) => bucketLabel(point.periodStart, data.bucket))
    : [];
  const vitalLabels = data
    ? data.vitals.map((point) => bucketLabel(point.periodStart, data.bucket))
    : [];
  const maxRoute = data ? Math.max(1, ...data.byRoute.map((row) => row.count)) : 1;
  const routes = data ? (allRoutes ? data.byRoute : data.byRoute.slice(0, 8)) : [];
  const rate = formatRate(data?.totals.requestsPerSecond);
  const errors = data ? errorRate(data.totals) : null;
  const traffic = useMemo(() => trafficSplit(data?.series ?? []), [data?.series]);
  const chartH = layout.compact ? 150 : 200;
  const gap = layout.compact ? 12 : 16;

  return (
    <StackScreen
      title="Server analytics"
      subtitle={data ? `App → server traffic · per ${data.bucket} · IST` : 'App → server traffic'}
      onRefresh={() => analytics.refetch()}
      fill
    >
      <RangeBar items={OBS_RANGES} value={range} onChange={setRange} />
      <View className="mt-4">
        {analytics.isPending ? (
          <ListSkeleton rows={4} />
        ) : !data ? (
          <AdminQueryError
            what="server analytics"
            error={analytics.error}
            onRetry={() => void analytics.refetch()}
          />
        ) : (
          <View style={{ rowGap: gap }}>
            {data.live.ledger.droppedFlushes > 0 ? (
              <NoticeCard
                tone="warn"
                title={`Behind by ${formatCount(data.live.ledger.droppedFlushes)} failed write(s)`}
              >
                {`Counts are held in memory and retrying, so recent buckets may be low${data.live.ledger.lastFlushError ? ` — ${data.live.ledger.lastFlushError}` : ''}.`}
              </NoticeCard>
            ) : null}

            <Grid columns={layout.kpiColumns} gap={12}>
              <StatTile
                label="Requests"
                value={formatCount(data.totals.requests)}
                sub={`Over ${range}`}
                trend={data.series.map((point) => point.count)}
              />
              <StatTile
                label="Error rate"
                value={errors == null ? '—' : `${errors.toFixed(2)}%`}
                status={errorRateTone(errors)}
                sub={`${formatCount(data.totals.errors5xx)} server · ${formatCount(data.totals.errors4xx)} client`}
              />
              <StatTile
                label="Avg latency"
                value={formatMs(data.totals.avgLatencyMs)}
                sub={`Peak ${formatMs(data.totals.maxLatencyMs)}`}
              />
              <StatTile label="Throughput" value={rate.value} sub={`${rate.unit} · mean`} />
              <StatTile
                label="Data sent"
                value={formatBytes(data.totals.bytesOut)}
                sub={`Over ${range}`}
              />
              <StatTile
                label="In flight"
                value={formatCount(data.live.process.inFlight)}
                sub={`Up ${formatUptime(data.live.process.uptimeSeconds)}`}
              />
            </Grid>

            <Grid columns={layout.columns} gap={gap}>
              <GridItem span={2}>
                <Panel title="Requests" meta={`Per ${data.bucket} · handled and errors`}>
                  <AreaChart
                    labels={labels}
                    stacked
                    height={chartH}
                    format={(v) => formatCount(Math.round(v))}
                    accessibilityLabel={`Requests per ${data.bucket}`}
                    series={[
                      {
                        key: 'ok',
                        label: 'Handled',
                        color: colors.accent,
                        values: traffic.ok,
                      },
                      {
                        key: 'err',
                        label: 'Errors',
                        color: colors.danger,
                        values: traffic.errors,
                      },
                    ]}
                  />
                </Panel>
              </GridItem>
              <Panel title="Latency" meta={`Average per ${data.bucket}`}>
                <AreaChart
                  labels={labels}
                  height={chartH}
                  format={(v) => formatMs(v)}
                  accessibilityLabel={`Average latency per ${data.bucket}`}
                  series={[
                    {
                      key: 'lat',
                      label: 'Average',
                      color: colors.info,
                      values: data.series.map((p) => p.avgLatencyMs ?? 0),
                    },
                  ]}
                />
              </Panel>
            </Grid>

            <Grid columns={layout.columns === 1 ? 1 : 2} gap={gap}>
              <Panel
                title="Server process"
                meta={`${data.live.process.proc} · ${data.live.process.nodeVersion}`}
              >
                <StatGrid
                  stats={[
                    {
                      label: 'Event-loop lag',
                      value: formatMs(data.live.process.eventLoopLagMs),
                      valueClassName:
                        (data.live.process.eventLoopLagMs ?? 0) > 50
                          ? 'text-danger-600 dark:text-danger-dark'
                          : undefined,
                    },
                    {
                      label: 'Heap',
                      value: `${mb(data.live.process.heapUsedMb)} of ${mb(data.live.process.heapTotalMb)}`,
                    },
                    { label: 'RSS', value: mb(data.live.process.rssMb) },
                    { label: 'Uptime', value: formatUptime(data.live.process.uptimeSeconds) },
                  ]}
                />
              </Panel>
              <Panel
                title="Vitals"
                meta={`Peak per ${data.bucket}`}
                right={<RangeSelector items={VITALS} value={vitals} onChange={setVitals} />}
              >
                {data.vitals.length > 1 ? (
                  <AreaChart
                    labels={vitalLabels}
                    height={layout.compact ? 120 : 140}
                    format={VITALS_FORMAT[vitals]}
                    accessibilityLabel={`${vitals} per ${data.bucket}`}
                    series={[
                      {
                        key: vitals,
                        label: VITALS.find((v) => v.key === vitals)?.label ?? '',
                        color: colors.warning,
                        values: vitalsValues(data, vitals),
                      },
                    ]}
                  />
                ) : (
                  <Text className="py-6 text-center text-[13px] text-ink-muted dark:text-ink-dark-muted">
                    No vitals sampled in this window.
                  </Text>
                )}
              </Panel>
            </Grid>

            <Grid columns={layout.columns === 1 ? 1 : 2} gap={gap} equalHeight={false}>
              <Panel
                title="Busiest endpoints"
                meta={`${data.byRoute.length}`}
                flush
                right={
                  data.byRoute.length > 8 ? (
                    <Pressable
                      hitSlop={8}
                      onPress={() => setAllRoutes((open) => !open)}
                      className="active:opacity-60"
                    >
                      <Text className="text-[13px] font-semibold text-brand-text dark:text-brand-text-dark">
                        {allRoutes ? 'Show fewer' : `All ${data.byRoute.length}`}
                      </Text>
                    </Pressable>
                  ) : undefined
                }
              >
                {routes.length === 0 ? (
                  <Text className="px-4 pb-4 text-[13px] text-ink-muted dark:text-ink-dark-muted">
                    No requests in this window.
                  </Text>
                ) : (
                  routes.map((row, index) => (
                    <View key={`${row.method} ${row.route}`}>
                      {index > 0 ? <RowDivider /> : null}
                      <BreakdownRow
                        name={`${row.method} ${row.route}`}
                        value={formatCount(row.count)}
                        details={`${row.errors > 0 ? `${formatCount(row.errors)} errors · ` : ''}avg ${formatMs(row.avgLatencyMs)} · peak ${formatMs(row.maxLatencyMs)}${row.bytesOut > 0 ? ` · ${formatBytes(row.bytesOut)}` : ''}`}
                        share={(row.count / maxRoute) * 100}
                        tone={row.errors > 0 ? 'warning' : 'info'}
                      />
                    </View>
                  ))
                )}
              </Panel>
              <Panel title="Slowest endpoints" meta="20+ requests" flush>
                {data.slowest.length === 0 ? (
                  <Text className="px-4 pb-4 text-[13px] text-ink-muted dark:text-ink-dark-muted">
                    Nothing slow enough to list.
                  </Text>
                ) : (
                  data.slowest.map((row, index) => (
                    <View key={`slow-${row.method} ${row.route}`}>
                      {index > 0 ? <RowDivider /> : null}
                      <View className="flex-row items-center gap-3 px-4 py-3">
                        <Text
                          className="flex-1 text-xs text-ink dark:text-ink-dark"
                          style={{ fontFamily: monoFont }}
                          numberOfLines={2}
                        >
                          {row.method} {row.route}
                        </Text>
                        <View className="items-end">
                          <Text className="text-[13px] font-semibold text-ink dark:text-ink-dark">
                            {formatMs(row.avgLatencyMs)}
                          </Text>
                          <Text className="text-[11px] text-ink-muted dark:text-ink-dark-muted">
                            peak {formatMs(row.maxLatencyMs)} · {formatCount(row.count)}
                          </Text>
                        </View>
                      </View>
                    </View>
                  ))
                )}
              </Panel>
            </Grid>

            {data.live.tail.length > 0 ? (
              <Panel title="Recent requests" meta="This process · newest first" flush>
                {data.live.tail.slice(0, 15).map((entry, index) => (
                  <View key={`${entry.at}-${index}`}>
                    {index > 0 ? <RowDivider /> : null}
                    <View className="flex-row items-center gap-3 px-4 py-2.5">
                      <Text className="w-16 text-[11px] text-ink-faint dark:text-ink-dark-faint">
                        {formatClock(entry.at)}
                      </Text>
                      <Text
                        className="flex-1 text-xs text-ink dark:text-ink-dark"
                        style={{ fontFamily: monoFont }}
                        numberOfLines={1}
                      >
                        {entry.method} {entry.route}
                      </Text>
                      <Text
                        className={cn(
                          'text-xs font-semibold',
                          entry.status < 400
                            ? 'text-brand-text dark:text-brand-text-dark'
                            : 'text-danger-600 dark:text-danger-dark',
                        )}
                      >
                        {entry.status}
                      </Text>
                      <Text className="w-14 text-right text-[11px] text-ink-muted dark:text-ink-dark-muted">
                        {formatMs(entry.latencyMs)}
                      </Text>
                    </View>
                  </View>
                ))}
              </Panel>
            ) : null}
          </View>
        )}
      </View>
    </StackScreen>
  );
}
