import React, { useState } from 'react';
import { Text, View } from 'react-native';

import { ListSkeleton, StackScreen } from '@/components/navigation/StackScreen';
import { KpiGrid } from '@/components/ui/KpiGrid';
import { ListCard, RowDivider, Section } from '@/components/ui/Section';
import { StatGrid } from '@/components/ui/StatGrid';
import { SegmentedControl } from '@/components/ui/Tabs';
import { AdminQueryError } from '@/features/admin/components/AdminState';
import { BreakdownRow, ChartCard, NoticeCard } from '@/features/admin/components/OpsBits';
import { useServerAnalytics } from '@/features/admin/hooks';
import {
  bucketLabel,
  formatBytes,
  formatCount,
  formatMs,
  formatRate,
  formatTokens,
  formatUptime,
} from '@/features/admin/lib/format';
import { OBS_RANGES } from '@/features/admin/panels/HealthPanel';
import type { ObsRange, ServerAnalyticsReport } from '@/features/admin/types';
import { monoFont } from '@/features/settings/components/JsonBlock';
import { formatClock } from '@/features/settings/lib/time';
import { cn } from '@/lib/utils/cn';

type TrafficChart = 'requests' | 'errors' | 'latency';
type VitalsChart = 'lag' | 'heap' | 'cpu';

const TRAFFIC: readonly { key: TrafficChart; label: string }[] = [
  { key: 'requests', label: 'Requests' },
  { key: 'errors', label: 'Errors' },
  { key: 'latency', label: 'Latency' },
];
const VITALS: readonly { key: VitalsChart; label: string }[] = [
  { key: 'lag', label: 'Loop lag' },
  { key: 'heap', label: 'Heap' },
  { key: 'cpu', label: 'CPU' },
];

const mb = (value: number | null | undefined) =>
  typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(0)} MB` : '—';

function trafficBars(data: ServerAnalyticsReport, chart: TrafficChart) {
  return data.series.map((point) => ({
    label: bucketLabel(point.periodStart, data.bucket),
    value:
      chart === 'requests'
        ? point.count
        : chart === 'errors'
          ? (point.byClass['4xx'] ?? 0) + (point.byClass['5xx'] ?? 0)
          : (point.avgLatencyMs ?? 0),
  }));
}

function vitalsBars(data: ServerAnalyticsReport, chart: VitalsChart) {
  return data.vitals.map((point) => ({
    label: bucketLabel(point.periodStart, data.bucket),
    value:
      chart === 'lag'
        ? point.eventLoopLagMaxMs
        : chart === 'heap'
          ? point.heapUsedMaxMb
          : point.cpuMaxPct,
  }));
}

/** Inbound HTTP traffic and Node process vitals (web: Server analytics). */
export function AnalyticsPanel() {
  const [range, setRange] = useState<ObsRange>('24h');
  const [traffic, setTraffic] = useState<TrafficChart>('requests');
  const [vitals, setVitals] = useState<VitalsChart>('lag');
  const [allRoutes, setAllRoutes] = useState(false);
  const analytics = useServerAnalytics(range);
  const data = analytics.data;

  const trafficFooter = (() => {
    if (!data) return undefined;
    const peakLatency = Math.max(0, ...data.series.map((point) => point.maxLatencyMs));
    if (traffic === 'requests')
      return `Per ${data.bucket} · peak ${formatCount(Math.max(0, ...data.series.map((point) => point.count)))}`;
    if (traffic === 'errors')
      return `4xx and 5xx per ${data.bucket} · ${formatCount(data.totals.errors4xx + data.totals.errors5xx)} total`;
    return `Average per ${data.bucket} · slowest single request ${formatMs(peakLatency)}`;
  })();

  const vitalsFooter = (() => {
    if (!data || data.vitals.length === 0) return undefined;
    if (vitals === 'lag')
      return `Peak event-loop lag per ${data.bucket} · worst ${formatMs(Math.max(0, ...data.vitals.map((point) => point.eventLoopLagMaxMs)))}`;
    if (vitals === 'heap')
      return `Peak heap per ${data.bucket} · highest ${mb(Math.max(0, ...data.vitals.map((point) => point.heapUsedMaxMb)))}`;
    return `Peak CPU per ${data.bucket} · highest ${Math.max(0, ...data.vitals.map((point) => point.cpuMaxPct)).toFixed(0)}%`;
  })();

  const maxRoute = data ? Math.max(1, ...data.byRoute.map((row) => row.count)) : 1;
  const routes = data ? (allRoutes ? data.byRoute : data.byRoute.slice(0, 8)) : [];
  const rate = formatRate(data?.totals.requestsPerSecond);

  return (
    <StackScreen
      title="Server analytics"
      subtitle={data ? `App → server traffic · per ${data.bucket} · IST` : 'App → server traffic'}
      onRefresh={() => analytics.refetch()}
    >
      <SegmentedControl items={OBS_RANGES} value={range} onChange={setRange} />
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
          <>
            {data.live.ledger.droppedFlushes > 0 ? (
              <View className="mb-3">
                <NoticeCard
                  tone="warn"
                  title={`Behind by ${formatCount(data.live.ledger.droppedFlushes)} failed write(s)`}
                >
                  Counts are held in memory and retrying, so recent buckets may be low.
                </NoticeCard>
              </View>
            ) : null}

            <KpiGrid
              items={[
                {
                  label: 'Requests',
                  value: formatTokens(data.totals.requests),
                  sub: formatCount(data.totals.requests),
                },
                {
                  label: 'Success',
                  value:
                    data.totals.successRate != null
                      ? `${data.totals.successRate.toFixed(2)}%`
                      : '—',
                  sub: `${formatCount(data.totals.errors4xx)} 4xx · ${formatCount(data.totals.errors5xx)} 5xx`,
                  ...(data.totals.errors5xx > 0 ? { trend: -1 } : {}),
                },
                {
                  label: 'Avg latency',
                  value: formatMs(data.totals.avgLatencyMs),
                  sub: `Peak ${formatMs(data.totals.maxLatencyMs)}`,
                },
                { label: 'Throughput', value: rate.value, sub: `${rate.unit} · mean` },
              ]}
            />

            <Section title="Traffic">
              <ChartCard
                title={TRAFFIC.find((item) => item.key === traffic)?.label ?? ''}
                bars={trafficBars(data, traffic)}
                footer={trafficFooter}
                accessibilityLabel={`${traffic} over time`}
              />
              <SegmentedControl
                items={TRAFFIC}
                value={traffic}
                onChange={setTraffic}
                className="mt-3"
              />
            </Section>

            <Section
              title="Server process"
              note={`${data.live.process.proc} · ${data.live.process.nodeVersion}`}
            >
              <StatGrid
                stats={[
                  { label: 'In flight', value: formatCount(data.live.process.inFlight) },
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
                  { label: 'Sent', value: formatBytes(data.totals.bytesOut) },
                ]}
              />
              {data.vitals.length > 0 ? (
                <View className="mt-3">
                  <ChartCard
                    title={VITALS.find((item) => item.key === vitals)?.label ?? ''}
                    bars={vitalsBars(data, vitals)}
                    footer={vitalsFooter}
                    height={96}
                    accessibilityLabel={`${vitals} over time`}
                  />
                  <SegmentedControl
                    items={VITALS}
                    value={vitals}
                    onChange={setVitals}
                    className="mt-3"
                  />
                </View>
              ) : null}
            </Section>

            <Section
              title="Busiest endpoints"
              action={
                data.byRoute.length > 8
                  ? {
                      label: allRoutes ? 'Show fewer' : `All ${data.byRoute.length}`,
                      onPress: () => setAllRoutes((open) => !open),
                    }
                  : undefined
              }
            >
              {routes.length === 0 ? (
                <Text className="text-[13px] text-ink-muted dark:text-ink-dark-muted">
                  No requests in this window.
                </Text>
              ) : (
                <ListCard>
                  {routes.map((row, index) => (
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
                  ))}
                </ListCard>
              )}
            </Section>

            {data.slowest.length > 0 ? (
              <Section title="Slowest endpoints" note="20+ requests only">
                <ListCard>
                  {data.slowest.map((row, index) => (
                    <View key={`slow-${row.method} ${row.route}`}>
                      {index > 0 ? <RowDivider /> : null}
                      <View className="flex-row items-center gap-3 px-3.5 py-3">
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
                  ))}
                </ListCard>
              </Section>
            ) : null}

            {data.live.tail.length > 0 ? (
              <Section title="Recent requests" note="This process · newest first">
                <ListCard>
                  {data.live.tail.slice(0, 15).map((entry, index) => (
                    <View key={`${entry.at}-${index}`}>
                      {index > 0 ? <RowDivider /> : null}
                      <View className="flex-row items-center gap-3 px-3.5 py-2.5">
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
                </ListCard>
              </Section>
            ) : null}
          </>
        )}
      </View>
    </StackScreen>
  );
}
