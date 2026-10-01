import React, { useState } from 'react';
import { Text, View } from 'react-native';

import { ListSkeleton, StackScreen } from '@/components/navigation/StackScreen';
import { Card } from '@/components/ui/Card';
import { KpiGrid } from '@/components/ui/KpiGrid';
import { ListCard, RowDivider, Section } from '@/components/ui/Section';
import { StatGrid } from '@/components/ui/StatGrid';
import { SegmentedControl } from '@/components/ui/Tabs';
import { AdminQueryError } from '@/features/admin/components/AdminState';
import { BreakdownRow, ChartCard, NoticeCard } from '@/features/admin/components/OpsBits';
import { useBrokerUsage } from '@/features/admin/hooks';
import {
  bucketLabel,
  formatBytes,
  formatCount,
  formatMs,
  formatTokens,
} from '@/features/admin/lib/format';
import type {
  BrokerUsageRange,
  BrokerUsageReport,
  SocketScopeTotals,
} from '@/features/admin/types';
import { monoFont } from '@/features/settings/components/JsonBlock';
import { StatusPill } from '@/features/settings/components/StatusPill';
import { formatClock } from '@/features/settings/lib/time';
import { cn } from '@/lib/utils/cn';

const RANGES: readonly { key: BrokerUsageRange; label: string }[] = [
  { key: '24h', label: '24h' },
  { key: '7d', label: '7d' },
  { key: '30d', label: '30d' },
  { key: '90d', label: '90d' },
];

type CallChart = 'calls' | 'failures' | 'latency';
const CALL_CHARTS: readonly { key: CallChart; label: string }[] = [
  { key: 'calls', label: 'Calls' },
  { key: 'failures', label: 'Failures' },
  { key: 'latency', label: 'Latency' },
];

function callBars(data: BrokerUsageReport, chart: CallChart) {
  return data.series.map((point) => ({
    label: bucketLabel(point.periodStart, data.bucket),
    value:
      chart === 'calls'
        ? point.calls
        : chart === 'failures'
          ? point.failed
          : (point.avgLatencyMs ?? 0),
  }));
}

function SocketCard({
  title,
  transport,
  scope,
  bucket,
  metric,
  metricLabel,
  stats,
}: {
  title: string;
  transport: string;
  scope: SocketScopeTotals;
  bucket: 'hour' | 'day';
  metric: (point: SocketScopeTotals['series'][number]) => number;
  metricLabel: string;
  stats: { label: string; value: string; valueClassName?: string }[];
}) {
  const peak = Math.max(0, ...scope.series.map(metric));
  return (
    <View className="gap-3">
      <ChartCard
        title={title}
        right={
          <Text
            className="text-[11px] text-ink-faint dark:text-ink-dark-faint"
            style={{ fontFamily: monoFont }}
          >
            {transport}
          </Text>
        }
        bars={scope.series.map((point) => ({
          label: bucketLabel(point.periodStart, bucket),
          value: metric(point),
        }))}
        height={80}
        accessibilityLabel={`${title} ${metricLabel} over time`}
        footer={`Peak ${formatCount(peak)} ${metricLabel} per ${bucket}`}
      />
      <StatGrid stats={stats} />
    </View>
  );
}

/** mStock REST and socket usage, measured at the SDK's own HTTP client (web: mStock API usage). */
export function BrokerUsagePanel() {
  const [range, setRange] = useState<BrokerUsageRange>('24h');
  const [chart, setChart] = useState<CallChart>('calls');
  const [allRoutes, setAllRoutes] = useState(false);
  const usage = useBrokerUsage(range);
  const data = usage.data;
  const redTone = 'text-danger-600 dark:text-danger-dark';

  const maxRouteCalls = data ? Math.max(1, ...data.byRoute.map((row) => row.calls)) : 1;
  const routes = data ? (allRoutes ? data.byRoute : data.byRoute.slice(0, 8)) : [];
  const openBreakers = data
    ? data.live.breakers.filter((breaker) => breaker.state !== 'closed')
    : [];

  return (
    <StackScreen
      title="mStock API usage"
      subtitle={data ? `Per ${data.bucket} · IST` : 'Broker calls and sockets'}
      onRefresh={() => usage.refetch()}
    >
      <SegmentedControl items={RANGES} value={range} onChange={setRange} />
      <View className="mt-4">
        {usage.isPending ? (
          <ListSkeleton rows={4} />
        ) : !data ? (
          <AdminQueryError
            what="broker usage"
            error={usage.error}
            onRetry={() => void usage.refetch()}
          />
        ) : (
          <>
            {data.live.instrumentation === 'failed' ? (
              <View className="mb-3">
                <NoticeCard tone="bad" title="Not measuring">
                  The SDK hook failed to attach, so REST counts are zero for that reason — not
                  because nothing happened.
                </NoticeCard>
              </View>
            ) : null}
            {data.live.ledger.droppedFlushes > 0 ? (
              <View className="mb-3">
                <NoticeCard
                  tone="warn"
                  title={`Behind by ${formatCount(data.live.ledger.droppedFlushes)} failed write(s)`}
                >
                  Counts are held in memory and retrying.
                </NoticeCard>
              </View>
            ) : null}

            <KpiGrid
              items={[
                {
                  label: 'API calls',
                  value: formatTokens(data.totals.calls),
                  sub: formatCount(data.totals.calls),
                },
                {
                  label: 'Success',
                  value:
                    data.totals.successRate != null
                      ? `${data.totals.successRate.toFixed(2)}%`
                      : '—',
                  sub: `${formatCount(data.totals.failed)} failed`,
                  ...(data.totals.successRate != null && data.totals.successRate < 99
                    ? { trend: -1 }
                    : {}),
                },
                {
                  label: 'Avg latency',
                  value: formatMs(data.totals.avgLatencyMs),
                  sub: `Peak ${formatMs(data.totals.maxLatencyMs)}`,
                },
                {
                  label: 'Throttled',
                  value: formatCount(data.live.rateLimitWaits.waits),
                  sub: `Avg wait ${formatMs(data.live.rateLimitWaits.avgWaitMs)}`,
                },
                {
                  label: 'Downloaded',
                  value:
                    data.totals.bytesIn === 0 && data.totals.bytesUnknownCalls > 0
                      ? '—'
                      : data.totals.bytesUnknownCalls > 0
                        ? `≥ ${formatBytes(data.totals.bytesIn)}`
                        : formatBytes(data.totals.bytesIn),
                  sub:
                    data.totals.bytesUnknownCalls > 0
                      ? `${formatCount(data.totals.bytesUnknownCalls)} unsized`
                      : 'Response bodies',
                },
                {
                  label: 'App sockets',
                  value: formatCount(data.socket.client.peakConnections),
                  sub: `Peak · ${formatCount(data.live.clientSockets)} now`,
                },
              ]}
            />

            <Section title="Calls over time">
              <ChartCard
                title={CALL_CHARTS.find((item) => item.key === chart)?.label ?? ''}
                bars={callBars(data, chart)}
                accessibilityLabel={`${chart} per ${data.bucket}`}
                footer={
                  chart === 'calls'
                    ? `Per ${data.bucket} · peak ${formatCount(Math.max(0, ...data.series.map((point) => point.calls)))}`
                    : chart === 'failures'
                      ? `${formatCount(data.totals.failed)} failed in total`
                      : `Average per ${data.bucket} · slowest ${formatMs(Math.max(0, ...data.series.map((point) => point.maxLatencyMs)))}`
                }
              />
              <SegmentedControl
                items={CALL_CHARTS}
                value={chart}
                onChange={setChart}
                className="mt-3"
              />
            </Section>

            <Section title="By method">
              <ListCard>
                {data.byMethod.map((row, index) => (
                  <View key={row.method}>
                    {index > 0 ? <RowDivider /> : null}
                    <BreakdownRow
                      name={row.method}
                      value={formatCount(row.calls)}
                      details={`${row.failed > 0 ? `${formatCount(row.failed)} failed · ` : ''}avg ${formatMs(row.avgLatencyMs)} · peak ${formatMs(row.maxLatencyMs)}`}
                      share={data.totals.calls ? (row.calls / data.totals.calls) * 100 : 0}
                      tone={row.failed > 0 ? 'warning' : 'info'}
                    />
                  </View>
                ))}
              </ListCard>
            </Section>

            <Section
              title="By endpoint"
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
                  No calls in this window.
                </Text>
              ) : (
                <ListCard>
                  {routes.map((row, index) => (
                    <View key={`${row.method} ${row.route}`}>
                      {index > 0 ? <RowDivider /> : null}
                      <BreakdownRow
                        name={`${row.method} ${row.route}`}
                        value={formatCount(row.calls)}
                        details={`${row.failed > 0 ? `${formatCount(row.failed)} failed · ` : ''}avg ${formatMs(row.avgLatencyMs)} · peak ${formatMs(row.maxLatencyMs)}`}
                        share={(row.calls / maxRouteCalls) * 100}
                        tone={row.failed > 0 ? 'warning' : 'info'}
                      />
                    </View>
                  ))}
                </ListCard>
              )}
            </Section>

            {data.statusCounts.length > 0 ? (
              <Section title="Outcomes">
                <View className="flex-row flex-wrap gap-2">
                  {data.statusCounts.map((status) => {
                    const isHttp = /^\d+$/.test(status.status);
                    const good =
                      isHttp && Number(status.status) >= 200 && Number(status.status) < 300;
                    const share = data.totals.calls ? (status.count / data.totals.calls) * 100 : 0;
                    return (
                      <Card
                        key={status.status}
                        padded={false}
                        className="min-w-[104px] flex-grow gap-0.5 px-3.5 py-3"
                      >
                        <Text
                          className={cn(
                            'text-xs font-semibold',
                            good ? 'text-brand-text dark:text-brand-text-dark' : redTone,
                          )}
                          style={{ fontFamily: monoFont }}
                        >
                          {status.status}
                        </Text>
                        <Text className="text-base font-bold text-ink dark:text-ink-dark">
                          {formatCount(status.count)}
                        </Text>
                        <Text className="text-[11px] text-ink-muted dark:text-ink-dark-muted">
                          {share.toFixed(2)}%{isHttp ? '' : ' · no response'}
                        </Text>
                      </Card>
                    );
                  })}
                </View>
              </Section>
            ) : null}

            <Section title="Sockets">
              <View className="gap-5">
                <SocketCard
                  title="Indices"
                  transport="REST poll → /indices"
                  scope={data.socket.indices}
                  bucket={data.bucket}
                  metric={(point) => point.ticks}
                  metricLabel="pushes"
                  stats={[
                    { label: 'Polls', value: formatTokens(data.socket.indices.polls) },
                    { label: 'Pushes', value: formatTokens(data.socket.indices.ticks) },
                    {
                      label: 'Deduped',
                      value:
                        data.socket.indices.polls > 0
                          ? `${(((data.socket.indices.polls - data.socket.indices.ticks) / data.socket.indices.polls) * 100).toFixed(0)}%`
                          : '—',
                    },
                    { label: 'Interval', value: `${data.config.indexFeedPollMs}ms` },
                    {
                      label: 'Subscribers',
                      value: `${formatCount(data.live.indexFeed.subscribers)} · ${data.live.indexFeed.running ? 'running' : 'idle'}`,
                    },
                    {
                      label: 'Failures in a row',
                      value: formatCount(data.live.indexFeed.consecutiveFailures),
                      valueClassName:
                        data.live.indexFeed.consecutiveFailures > 0 ? redTone : undefined,
                    },
                    ...(data.live.indexFeed.source
                      ? [
                          {
                            label: 'Answered by',
                            value:
                              data.live.indexFeed.failover?.source === 'fallback'
                                ? `${data.live.indexFeed.source === 'groww' ? 'Groww' : 'mStock'} · failover`
                                : data.live.indexFeed.source === 'groww'
                                  ? 'Groww'
                                  : 'mStock',
                            valueClassName:
                              data.live.indexFeed.failover?.source === 'fallback'
                                ? redTone
                                : undefined,
                          },
                        ]
                      : []),
                  ]}
                />
                <SocketCard
                  title="Equity ticks"
                  transport="mStock WebSocket"
                  scope={data.socket.equity}
                  bucket={data.bucket}
                  metric={(point) => point.ticks}
                  metricLabel="ticks"
                  stats={[
                    { label: 'Ticks', value: formatTokens(data.socket.equity.ticks) },
                    {
                      label: 'Peak subscriptions',
                      value: formatCount(data.socket.equity.peakSubscribedTokens),
                    },
                    { label: 'Connects', value: formatCount(data.socket.equity.connects) },
                    {
                      label: 'Reconnects',
                      value: formatCount(data.socket.equity.reconnects),
                      valueClassName: data.socket.equity.reconnects > 0 ? redTone : undefined,
                    },
                    {
                      label: 'Sub / unsub',
                      value: `${formatCount(data.socket.equity.subscribes)} / ${formatCount(data.socket.equity.unsubscribes)}`,
                    },
                    { label: 'Disconnects', value: formatCount(data.socket.equity.disconnects) },
                  ]}
                />
                <SocketCard
                  title="App connections"
                  transport="Socket.IO inbound"
                  scope={data.socket.client}
                  bucket={data.bucket}
                  metric={(point) => point.connects}
                  metricLabel="opens"
                  stats={[
                    { label: 'Peak', value: formatCount(data.socket.client.peakConnections) },
                    { label: 'Now', value: formatCount(data.live.clientSockets) },
                    { label: 'Opened', value: formatCount(data.socket.client.connects) },
                    { label: 'Closed', value: formatCount(data.socket.client.disconnects) },
                  ]}
                />
              </View>
            </Section>

            <Section title="Right now" note="This server process">
              <StatGrid
                stats={[
                  {
                    label: 'Rate-limit queue',
                    value: `${formatCount(data.live.rateLimit.queueLength)} · ${data.live.rateLimit.ratePerSecond}/s cap`,
                    valueClassName: data.live.rateLimit.queueLength > 0 ? redTone : undefined,
                  },
                  {
                    label: 'Breakers open',
                    value: `${openBreakers.length} of ${data.live.breakers.length}`,
                    valueClassName: openBreakers.length > 0 ? redTone : undefined,
                  },
                  {
                    label: 'Pending buckets',
                    value: formatCount(data.live.ledger.pendingRestCells),
                  },
                  { label: 'Instrumentation', value: data.live.instrumentation },
                ]}
              />
              {openBreakers.length > 0 ? (
                <View className="mt-3 flex-row flex-wrap gap-2">
                  {openBreakers.map((breaker) => (
                    <StatusPill
                      key={breaker.name}
                      tone="bad"
                      label={`${breaker.name.replace(/^mstock:/, '')} · ${breaker.state}`}
                    />
                  ))}
                </View>
              ) : null}
              {data.live.tail.length > 0 ? (
                <ListCard className="mt-3">
                  {data.live.tail.slice(0, 20).map((entry, index) => (
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
                            entry.ok ? 'text-brand-text dark:text-brand-text-dark' : redTone,
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
              ) : null}
            </Section>
          </>
        )}
      </View>
    </StackScreen>
  );
}
