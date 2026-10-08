import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { AreaChart } from '@/components/charts/AreaChart';
import { Panel } from '@/components/dashboard/Panel';
import { ShareBar } from '@/components/dashboard/ShareBar';
import { StatTile } from '@/components/dashboard/StatTile';
import { Grid, GridItem } from '@/components/layout/Grid';
import { useScreenLayout } from '@/components/layout/responsive';
import { ListSkeleton, StackScreen } from '@/components/navigation/StackScreen';
import { Meter, type MeterTone } from '@/components/ui/Meter';
import { RowDivider } from '@/components/ui/Section';
import { RangeSelector, SegmentedControl } from '@/components/ui/Tabs';
import { AdminQueryError } from '@/features/admin/components/AdminState';
import { BreakdownRow, NoticeCard, PanelToggle } from '@/features/admin/components/OpsBits';
import { useApiUsage } from '@/features/admin/hooks';
import {
  API_PROVIDERS,
  averagePerMinute,
  BREAKER_STATE,
  budgetLine,
  budgetTone,
  budgetUsedLabel,
  callSeries,
  endpointsIn,
  failureReasons,
  formatPerMinute,
  formatSharePct,
  groupLabel,
  instrumentationState,
  isPollFeed,
  isQuietFeed,
  providerLabel,
  statusMeaning,
  statusTone,
  tightestBudget,
  usageVerdict,
} from '@/features/admin/lib/apiUsage';
import {
  bucketLabel,
  failedCallsLabel,
  failureTone,
  formatBytes,
  formatCount,
  formatMs,
  formatTokens,
} from '@/features/admin/lib/format';
import type {
  ApiGroupRow,
  ApiProvider,
  ApiUsageRange,
  ApiUsageReport,
  BudgetUsage,
  FeedBlock,
} from '@/features/admin/types';
import { monoFont } from '@/features/settings/components/JsonBlock';
import { StatusDot, StatusPill } from '@/features/settings/components/StatusPill';
import type { StatusTone } from '@/features/settings/lib/status';
import { formatClock } from '@/features/settings/lib/time';
import { cn } from '@/lib/utils/cn';
import { useTheme } from '@/theme/ThemeProvider';

const RANGES: readonly { key: ApiUsageRange; label: string }[] = [
  { key: '24h', label: '24H' },
  { key: '7d', label: '7D' },
  { key: '30d', label: '30D' },
  { key: '90d', label: '90D' },
];

const PROVIDER_ITEMS = API_PROVIDERS.map((p) => ({ key: p.key, label: p.label }));

const NUM = { fontVariant: ['tabular-nums' as const] };

/** Budget / failure tone → the meter's fill. */
const METER_TONE: Record<StatusTone, MeterTone> = {
  ok: 'brand',
  warn: 'warning',
  bad: 'loss',
  info: 'info',
  neutral: 'neutral',
};

const VALUE_TONE: Record<StatusTone, string> = {
  ok: 'text-brand-text dark:text-brand-text-dark',
  warn: 'text-warning-600 dark:text-warning-dark',
  bad: 'text-danger-600 dark:text-danger-dark',
  info: 'text-info dark:text-info-dark',
  neutral: 'text-ink-muted dark:text-ink-dark-muted',
};

const EMPTY_TEXT = 'py-6 text-center text-[13px] text-ink-muted dark:text-ink-dark-muted';

function successLabel(rate: number | null): string {
  return rate == null ? '—' : `${rate.toFixed(rate >= 99 ? 2 : 1)}%`;
}

/** A text button in a panel's header or footer. */
function TextLink({
  label,
  onPress,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      hitSlop={8}
      onPress={onPress}
      className="active:opacity-60"
    >
      <Text className="text-[13px] font-semibold text-brand-text dark:text-brand-text-dark">
        {label}
      </Text>
    </Pressable>
  );
}

/** A label/value pair inside a panel row of figures. */
function Figure({ label, value }: { label: string; value: string }) {
  return (
    <View className="min-w-[64px] flex-1">
      <Text className="text-[11px] text-ink-faint dark:text-ink-dark-faint" numberOfLines={1}>
        {label}
      </Text>
      <Text
        className="mt-0.5 text-sm font-semibold text-ink dark:text-ink-dark"
        style={NUM}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

/** One rate limit: how close the busiest hour came to it, and whose limit it is. */
function BudgetRow({ budget }: { budget: BudgetUsage }) {
  const tone = budgetTone(budget.utilisationPct);
  const pct = budget.utilisationPct;
  // A sliver stays visible for real-but-tiny use, so "used a little" never reads as "unused".
  const width = pct != null ? Math.min(100, Math.max(pct > 0 ? 1.5 : 0, pct)) : 0;
  return (
    <View className="gap-1.5 py-2.5">
      <View className="flex-row items-baseline gap-3">
        <Text className="flex-1 text-[13px] font-semibold text-ink dark:text-ink-dark">
          {budget.label}
        </Text>
        <Text className={cn('text-xs font-semibold', VALUE_TONE[tone])} style={NUM}>
          {budgetUsedLabel(budget)}
        </Text>
      </View>
      {budget.source !== 'none' ? (
        <Meter
          value={width}
          tone={METER_TONE[tone]}
          height={6}
          accessibilityLabel={`${budget.label}: ${pct != null ? formatSharePct(pct) : 'unused'} of its per-minute limit at the busiest hour`}
        />
      ) : null}
      <Text className="text-[11px] leading-4 text-ink-muted dark:text-ink-dark-muted">
        {budgetLine(budget)}
      </Text>
      {budget.perDay != null && budget.usedToday != null ? (
        <Text className="text-[11px] text-ink-muted dark:text-ink-dark-muted" style={NUM}>
          {formatCount(budget.usedToday)} of {formatCount(budget.perDay)} today
        </Text>
      ) : null}
    </View>
  );
}

function RateLimitsPanel({ report }: { report: ApiUsageReport }) {
  return (
    <Panel
      title="Rate limits"
      meta={report.provider === 'groww' ? 'Budgeted per type' : 'One shared budget'}
      footer={
        report.budgets.length > 0
          ? 'The busiest hour is an hourly average — bursts inside it run higher, which the live queue shows.'
          : undefined
      }
    >
      {report.budgets.length === 0 ? (
        <Text className={EMPTY_TEXT}>This server doesn’t report rate limits yet.</Text>
      ) : (
        report.budgets.map((budget, index) => (
          <View key={budget.group}>
            {index > 0 ? <RowDivider /> : null}
            <BudgetRow budget={budget} />
          </View>
        ))
      )}
    </Panel>
  );
}

function OutcomesPanel({ report }: { report: ApiUsageReport }) {
  const { colors } = useTheme();
  const t = report.totals;
  const reasons = useMemo(() => failureReasons(report.statusCounts), [report.statusCounts]);
  return (
    <Panel title="Outcomes" meta={t.calls > 0 ? `${formatCount(t.calls)} calls` : undefined}>
      {t.calls === 0 ? (
        <Text className={EMPTY_TEXT}>No calls in this window.</Text>
      ) : (
        <>
          <ShareBar
            format={formatCount}
            segments={[
              { label: 'Succeeded', value: Math.max(0, t.calls - t.failed), color: colors.info },
              { label: 'Failed', value: t.failed, color: colors.warning },
            ]}
          />
          {reasons.length > 0 ? (
            <View className="mt-3 border-t border-line pt-2 dark:border-line-dark">
              {reasons.slice(0, 6).map((reason) => (
                <View
                  key={reason.status}
                  accessible
                  accessibilityLabel={`${reason.status}, ${reason.meaning}: ${reason.count} calls, ${Math.round(reason.share)}% of failures`}
                  className="flex-row items-center gap-2 py-1.5"
                >
                  <StatusDot tone={statusTone(reason.status)} />
                  <Text
                    className="text-xs text-ink dark:text-ink-dark"
                    style={{ fontFamily: monoFont }}
                  >
                    {reason.status}
                  </Text>
                  <Text
                    className="flex-1 text-xs text-ink-muted dark:text-ink-dark-muted"
                    numberOfLines={1}
                  >
                    {reason.meaning}
                  </Text>
                  <Text className="text-xs font-semibold text-ink dark:text-ink-dark" style={NUM}>
                    {formatCount(reason.count)}
                  </Text>
                  <Text
                    className="w-10 text-right text-[11px] text-ink-faint dark:text-ink-dark-faint"
                    style={NUM}
                  >
                    {Math.round(reason.share)}%
                  </Text>
                </View>
              ))}
            </View>
          ) : (
            <Text className="mt-3 text-xs text-ink-muted dark:text-ink-dark-muted">
              Every call in this window succeeded.
            </Text>
          )}
        </>
      )}
    </Panel>
  );
}

/** Calls per budget or purpose; tapping one narrows the endpoint list to it. */
function GroupsPanel({
  report,
  selected,
  onSelect,
}: {
  report: ApiUsageReport;
  selected: string;
  onSelect: (group: string) => void;
}) {
  const groups = report.byGroup;
  const max = Math.max(1, ...groups.map((g) => g.calls));
  return (
    <Panel
      title={report.provider === 'groww' ? 'By budget' : 'By purpose'}
      meta={groups.length ? `${groups.length}` : undefined}
      flush
    >
      {groups.length === 0 ? (
        <Text className="px-4 pb-4 text-[13px] text-ink-muted dark:text-ink-dark-muted">
          {report.byRoute.length > 0
            ? 'This server doesn’t group endpoints yet.'
            : 'No calls in this window.'}
        </Text>
      ) : (
        groups.map((group: ApiGroupRow, index) => {
          const tone = failureTone(group.failed, group.calls);
          const active = selected === group.group;
          return (
            <View key={group.group}>
              {index > 0 ? <RowDivider /> : null}
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`${group.label}: ${formatCount(group.calls)} calls. ${active ? 'Showing its endpoints' : 'Show its endpoints'}`}
                onPress={() => onSelect(active ? 'all' : group.group)}
                className={cn(
                  'gap-1.5 px-4 py-3 active:bg-surface-sunk dark:active:bg-surface-sunk-dark',
                  active && 'bg-brand-wash dark:bg-brand-wash-dark',
                )}
              >
                <View className="flex-row items-baseline gap-3">
                  <Text
                    className="flex-1 text-[13px] font-semibold text-ink dark:text-ink-dark"
                    numberOfLines={1}
                  >
                    {group.label}
                  </Text>
                  <Text
                    className="text-[13px] font-semibold text-ink dark:text-ink-dark"
                    style={NUM}
                  >
                    {formatCount(group.calls)}
                  </Text>
                </View>
                <Text
                  className={cn(
                    'text-[11px]',
                    tone ? VALUE_TONE[tone] : 'text-ink-muted dark:text-ink-dark-muted',
                  )}
                >
                  {failedCallsLabel(group.failed, group.calls)} · avg {formatMs(group.avgLatencyMs)}{' '}
                  · slowest {formatMs(group.maxLatencyMs)}
                </Text>
                <Meter
                  value={(group.calls / max) * 100}
                  tone={METER_TONE[tone ?? 'info']}
                  height={4}
                />
              </Pressable>
            </View>
          );
        })
      )}
    </Panel>
  );
}

const ROUTES_SHOWN = 8;

function EndpointsPanel({
  report,
  group,
  onClear,
}: {
  report: ApiUsageReport;
  group: string;
  onClear: () => void;
}) {
  const [all, setAll] = useState(false);
  const rows = endpointsIn(report.byRoute, group);
  const max = Math.max(1, ...rows.map((row) => row.calls));
  const shown = all ? rows : rows.slice(0, ROUTES_SHOWN);
  const filterLabel = group === 'all' ? null : groupLabel(report.byGroup, group);
  return (
    <Panel
      title="Endpoints"
      meta={
        filterLabel
          ? `${filterLabel} · ${rows.length}`
          : `${report.byRoute.length} in use${report.byRoute.length >= 40 ? ' · top 40' : ''}`
      }
      right={filterLabel ? <TextLink label="All groups" onPress={onClear} /> : undefined}
      flush
    >
      {rows.length === 0 ? (
        <Text className="px-4 pb-4 text-[13px] text-ink-muted dark:text-ink-dark-muted">
          No calls in this window.
        </Text>
      ) : (
        <>
          {shown.map((row, index) => {
            const tone = failureTone(row.failed, row.calls);
            const purpose = groupLabel(report.byGroup, row.group);
            return (
              <View key={`${row.method} ${row.route}`}>
                {index > 0 ? <RowDivider /> : null}
                <BreakdownRow
                  name={`${row.method} ${row.route}`}
                  value={formatCount(row.calls)}
                  details={[
                    purpose,
                    row.failed > 0 ? failedCallsLabel(row.failed, row.calls) : null,
                    `avg ${formatMs(row.avgLatencyMs)}`,
                    `slowest ${formatMs(row.maxLatencyMs)}`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  share={(row.calls / max) * 100}
                  tone={METER_TONE[tone ?? 'info']}
                />
              </View>
            );
          })}
          {rows.length > ROUTES_SHOWN ? (
            <View className="border-t border-line px-4 py-3 dark:border-line-dark">
              <TextLink
                label={all ? 'Show fewer' : `Show all ${rows.length}`}
                onPress={() => setAll((open) => !open)}
              />
            </View>
          ) : null}
        </>
      )}
    </Panel>
  );
}

function FeedSection({ feed, bucket }: { feed: FeedBlock; bucket: 'hour' | 'day' }) {
  const { colors } = useTheme();
  const poll = isPollFeed(feed);
  const t = feed.totals;
  const values = t.series.map((p) => (poll ? p.polls : p.ticks));
  return (
    <View className="gap-2.5">
      <View>
        <Text className="text-[13px] font-semibold text-ink dark:text-ink-dark">{feed.label}</Text>
        {feed.detail ? (
          <Text className="mt-0.5 text-[11px] text-ink-muted dark:text-ink-dark-muted">
            {feed.detail}
          </Text>
        ) : null}
      </View>
      <View className="flex-row flex-wrap gap-y-2">
        <Figure
          label={poll ? 'Polls' : 'Messages'}
          value={formatTokens(poll ? t.polls : t.ticks)}
        />
        {poll ? (
          <Figure label="Pushed" value={formatTokens(t.ticks)} />
        ) : (
          <Figure label="Connects" value={formatCount(t.connects)} />
        )}
        <Figure label="Reconnects" value={formatCount(t.reconnects)} />
        <Figure
          label={poll ? 'Peak viewers' : 'Peak subscribed'}
          value={formatCount(poll ? t.peakConnections : t.peakSubscribedTokens)}
        />
      </View>
      {isQuietFeed(feed) || values.length < 2 ? (
        <Text className="text-xs text-ink-faint dark:text-ink-dark-faint">
          Nothing in this window.
        </Text>
      ) : (
        <AreaChart
          labels={t.series.map((p) => bucketLabel(p.periodStart, bucket))}
          height={80}
          format={formatTokens}
          accessibilityLabel={`${feed.label} ${poll ? 'polls' : 'messages'} per ${bucket}`}
          series={[{ key: 'v', label: poll ? 'Polls' : 'Messages', color: colors.info, values }]}
        />
      )}
    </View>
  );
}

function FeedsPanel({ report }: { report: ApiUsageReport }) {
  return (
    <Panel title="Live connections" meta="Sockets and polls held open">
      {report.feeds.length === 0 ? (
        <Text className={EMPTY_TEXT}>This server doesn’t report live connections yet.</Text>
      ) : (
        <View style={{ rowGap: 18 }}>
          {report.feeds.map((feed) => (
            <FeedSection key={feed.key} feed={feed} bucket={report.bucket} />
          ))}
        </View>
      )}
    </Panel>
  );
}

/** A row of the "Right now" panel: what it is, a detail line, and its state on the right. */
function NowRow({
  title,
  detail,
  right,
}: {
  title: string;
  detail?: string;
  right?: React.ReactNode;
}) {
  return (
    <View className="flex-row items-center gap-3 px-4 py-2.5">
      <View className="flex-1">
        <Text className="text-[13px] text-ink dark:text-ink-dark" numberOfLines={1}>
          {title}
        </Text>
        {detail ? (
          <Text className="mt-0.5 text-[11px] text-ink-muted dark:text-ink-dark-muted">
            {detail}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );
}

function RightNowPanel({ report }: { report: ApiUsageReport }) {
  const live = report.live;
  const recording = instrumentationState(live.instrumentation);
  const waits = live.rateLimitWaits;
  const feed = live.indexFeed;
  const prefix = `${report.provider}:`;
  return (
    <Panel title="Right now" meta="This server process" flush>
      <NowRow
        title="Usage recording"
        detail={
          live.ledger.lastFlushAt
            ? `Saved ${formatClock(live.ledger.lastFlushAt)} IST`
            : 'Nothing saved yet'
        }
        right={<StatusPill tone={recording.tone} label={recording.label} />}
      />
      <RowDivider />
      <NowRow
        title="Our throttle"
        detail={
          waits.waits > 0
            ? `${formatCount(waits.waits)} calls waited · avg ${formatMs(waits.avgWaitMs)} · longest ${formatMs(waits.maxWaitMs)}`
            : 'No call has had to wait'
        }
      />
      {live.limiters.map((limiter) => (
        <View
          key={limiter.group}
          accessible
          accessibilityLabel={`${limiter.label}: ${Number(limiter.ratePerSecond.toFixed(2))} a second, ${limiter.queueLength > 0 ? `${limiter.queueLength} queued` : 'clear'}`}
          className="flex-row items-center gap-3 px-4 py-1.5"
        >
          <Text className="flex-1 pl-3 text-xs text-ink-muted dark:text-ink-dark-muted">
            {limiter.label}
          </Text>
          <Text className="text-xs text-ink dark:text-ink-dark" style={NUM}>
            {Number(limiter.ratePerSecond.toFixed(2))}/s
          </Text>
          <StatusPill
            tone={limiter.queueLength > 0 ? 'warn' : 'ok'}
            label={limiter.queueLength > 0 ? `${limiter.queueLength} queued` : 'Clear'}
          />
        </View>
      ))}
      <RowDivider />
      <NowRow
        title="Circuit breakers"
        detail={
          live.breakers.length
            ? 'Stop calling a provider that keeps failing'
            : 'None registered in this process yet'
        }
      />
      {live.breakers.map((breaker) => {
        const state = BREAKER_STATE[breaker.state] ?? { tone: 'neutral', label: breaker.state };
        return (
          <View key={breaker.name} className="flex-row items-center gap-3 px-4 py-1.5">
            <Text
              className="flex-1 pl-3 text-xs text-ink-muted dark:text-ink-dark-muted"
              style={{ fontFamily: monoFont }}
              numberOfLines={1}
            >
              {breaker.name.startsWith(prefix) ? breaker.name.slice(prefix.length) : breaker.name}
            </Text>
            <StatusPill tone={state.tone} label={state.label} />
          </View>
        );
      })}
      <RowDivider />
      {report.provider === 'groww' ? (
        <NowRow
          title="Live feeds connected"
          detail="One per user with an F&O screen open"
          right={
            <Text className="text-sm font-semibold text-ink dark:text-ink-dark" style={NUM}>
              {live.feedConnections == null ? '—' : formatCount(live.feedConnections)}
            </Text>
          }
        />
      ) : (
        <NowRow
          title="Index strip"
          detail={`${
            feed.running
              ? `Polling every ${formatMs(feed.intervalMs)} for ${feed.subscribers} viewer${feed.subscribers === 1 ? '' : 's'}`
              : 'Idle — nobody watching, or the market is shut'
          }${feed.source === 'groww' ? ' · Groww is standing in for mStock' : ''}`}
          right={
            <StatusPill
              tone={feed.consecutiveFailures > 0 ? 'warn' : feed.running ? 'ok' : 'neutral'}
              label={
                feed.consecutiveFailures > 0
                  ? `${feed.consecutiveFailures} failing`
                  : feed.running
                    ? 'Running'
                    : 'Idle'
              }
            />
          }
        />
      )}
      <View className="h-1.5" />
    </Panel>
  );
}

const TAIL_SHOWN = 15;

/** Every recent call this process made to the provider, newest first. */
function RecentCallsPanel({ report }: { report: ApiUsageReport }) {
  const [filter, setFilter] = useState<'all' | 'failed'>('all');
  const [all, setAll] = useState(false);
  const tail = report.live.tail;
  const failed = tail.filter((entry) => !entry.ok);
  const rows = filter === 'failed' ? failed : tail;
  const shown = all ? rows : rows.slice(0, TAIL_SHOWN);
  return (
    <Panel
      title="Recent calls"
      meta="Newest first"
      right={
        tail.length > 0 ? (
          <PanelToggle
            items={[
              { key: 'all', label: `All ${tail.length}` },
              { key: 'failed', label: `Failed ${failed.length}` },
            ]}
            value={filter}
            onChange={(next) => {
              setFilter(next);
              setAll(false);
            }}
          />
        ) : undefined
      }
      flush
    >
      {rows.length === 0 ? (
        <Text className="px-4 pb-4 text-[13px] text-ink-muted dark:text-ink-dark-muted">
          {tail.length === 0
            ? 'This process has made no calls to this provider since it started.'
            : 'No failed calls among the recent ones.'}
        </Text>
      ) : (
        <>
          {shown.map((entry, index) => {
            const tone = statusTone(entry.status);
            return (
              <View key={`${entry.at}-${index}`}>
                {index > 0 ? <RowDivider /> : null}
                <View
                  accessible
                  accessibilityLabel={`${formatClock(entry.at)}: ${entry.method} ${entry.route}, ${entry.status} ${statusMeaning(entry.status)}, ${formatMs(entry.latencyMs)}`}
                  className="gap-1 px-4 py-2.5"
                >
                  <View className="flex-row items-center gap-3">
                    <Text
                      className="flex-1 text-xs text-ink dark:text-ink-dark"
                      style={{ fontFamily: monoFont }}
                      numberOfLines={1}
                    >
                      {entry.method} {entry.route}
                    </Text>
                    <Text
                      className="text-[11px] text-ink-muted dark:text-ink-dark-muted"
                      style={NUM}
                    >
                      {formatMs(entry.latencyMs)}
                    </Text>
                  </View>
                  <View className="flex-row items-center gap-1.5">
                    <Text
                      className="text-[11px] text-ink-faint dark:text-ink-dark-faint"
                      style={NUM}
                    >
                      {formatClock(entry.at)}
                    </Text>
                    <StatusDot tone={tone} size={6} />
                    <Text
                      className={cn(
                        'flex-1 text-[11px]',
                        tone === 'ok'
                          ? 'text-ink-muted dark:text-ink-dark-muted'
                          : VALUE_TONE[tone],
                      )}
                      numberOfLines={1}
                    >
                      {entry.status} · {statusMeaning(entry.status)}
                    </Text>
                  </View>
                </View>
              </View>
            );
          })}
          {rows.length > TAIL_SHOWN ? (
            <View className="border-t border-line px-4 py-3 dark:border-line-dark">
              <TextLink
                label={all ? 'Show fewer' : `Show all ${rows.length}`}
                onPress={() => setAll((open) => !open)}
              />
            </View>
          ) : null}
        </>
      )}
    </Panel>
  );
}

function UsageBody({ report, fallback }: { report: ApiUsageReport; fallback: boolean }) {
  const { colors } = useTheme();
  const layout = useScreenLayout();
  const [group, setGroup] = useState('all');
  const t = report.totals;
  const verdict = usageVerdict(report);
  const reasons = useMemo(() => failureReasons(report.statusCounts), [report.statusCounts]);
  const tight = tightestBudget(report.budgets);
  const perMin = averagePerMinute(t.calls, report.from, report.to);
  const labels = useMemo(
    () => report.series.map((p) => bucketLabel(p.periodStart, report.bucket)),
    [report.series, report.bucket],
  );
  const calls = useMemo(() => callSeries(report.series), [report.series]);
  const gap = layout.compact ? 12 : 16;
  const chartH = layout.compact ? 150 : 190;
  const per = report.bucket;
  const wide = layout.columns === 3;
  const about = API_PROVIDERS.find((p) => p.key === report.provider)?.about;
  const top = reasons[0];

  const groups = (
    <GroupsPanel report={report} selected={group} onSelect={(next) => setGroup(next)} />
  );

  return (
    <View style={{ rowGap: gap }}>
      {fallback ? (
        <NoticeCard tone="info" title="This server doesn’t measure Groww yet">
          Showing mStock instead. Groww’s calls, budgets and live feed appear after the next server
          deploy.
        </NoticeCard>
      ) : null}
      {report.live.instrumentation === 'failed' ? (
        <NoticeCard tone="bad" title="Not measuring">
          The mStock SDK hook failed to attach, so REST counts are zero for that reason — not
          because nothing happened.
        </NoticeCard>
      ) : null}
      {report.live.ledger.droppedFlushes > 0 ? (
        <NoticeCard
          tone="warn"
          title={`Behind by ${formatCount(report.live.ledger.droppedFlushes)} failed write${report.live.ledger.droppedFlushes === 1 ? '' : 's'}`}
        >
          {`Counts are held in memory and retrying${report.live.ledger.lastFlushError ? ` — ${report.live.ledger.lastFlushError}` : ''}.`}
        </NoticeCard>
      ) : null}

      {/* ── The verdict ── */}
      <View
        accessible
        accessibilityLabel={`${providerLabel(report.provider)}: ${verdict.text}`}
        className="flex-row items-center gap-3 rounded-card border border-line bg-surface px-4 py-3.5 dark:border-line-dark dark:bg-surface-dark"
      >
        <StatusDot tone={verdict.tone} size={10} />
        <View className="flex-1">
          <Text className="text-[15px] font-semibold text-ink dark:text-ink-dark">
            {verdict.text}
          </Text>
          <Text className="mt-0.5 text-xs text-ink-muted dark:text-ink-dark-muted">
            {t.calls > 0
              ? `${formatCount(t.calls)} calls · ${successLabel(t.successRate)} succeeded`
              : about}
          </Text>
        </View>
      </View>

      {/* ── Headline numbers ── */}
      <Grid columns={layout.kpiColumns} gap={12}>
        <StatTile
          label="Calls"
          value={formatTokens(t.calls)}
          sub={
            perMin != null
              ? `${formatPerMinute(perMin)} a minute on average`
              : 'None in this window'
          }
          trend={report.series.map((p) => p.calls)}
        />
        <StatTile
          label="Success rate"
          value={successLabel(t.successRate)}
          status={failureTone(t.failed, t.calls)}
          sub={t.calls > 0 ? failedCallsLabel(t.failed, t.calls) : 'No calls'}
        />
        <StatTile
          label="Avg latency"
          value={formatMs(t.avgLatencyMs)}
          sub={t.calls > 0 ? `Slowest ${formatMs(t.maxLatencyMs)}` : undefined}
        />
        <StatTile
          label="Top failure"
          value={top ? top.status : 'None'}
          status={top ? statusTone(top.status) : undefined}
          sub={
            top
              ? `${top.meaning} · ${formatCount(top.count)}`
              : t.calls > 0
                ? 'Every call succeeded'
                : 'No calls'
          }
        />
        <StatTile
          label="Closest to a limit"
          value={tight?.utilisationPct != null ? formatSharePct(tight.utilisationPct) : '—'}
          status={tight ? budgetTone(tight.utilisationPct) : undefined}
          sub={
            tight
              ? `${tight.label} · busiest hour`
              : report.budgets.length > 0
                ? 'No limit used yet'
                : 'Not reported'
          }
        />
        <StatTile
          label="Data received"
          value={
            t.bytesIn === 0 && t.bytesUnknownCalls > 0
              ? '—'
              : t.bytesUnknownCalls > 0
                ? `≥ ${formatBytes(t.bytesIn)}`
                : formatBytes(t.bytesIn)
          }
          sub={
            t.bytesUnknownCalls > 0
              ? `${formatCount(t.bytesUnknownCalls)} calls unsized`
              : 'Response bodies'
          }
        />
      </Grid>

      {/* ── Traffic beside the budgets it spends ── */}
      <Grid columns={layout.columns} gap={gap}>
        <GridItem span={wide ? 2 : 1}>
          <Panel title="Calls" meta={`Per ${per} · succeeded and failed`}>
            {t.calls === 0 || labels.length < 2 ? (
              <Text className={EMPTY_TEXT}>No calls in this window.</Text>
            ) : (
              <AreaChart
                labels={labels}
                stacked
                height={chartH}
                format={(v) => formatCount(Math.round(v))}
                accessibilityLabel={`${providerLabel(report.provider)} calls per ${per}`}
                series={[
                  { key: 'ok', label: 'Succeeded', color: colors.info, values: calls.ok },
                  { key: 'failed', label: 'Failed', color: colors.warning, values: calls.failed },
                ]}
              />
            )}
          </Panel>
        </GridItem>
        <RateLimitsPanel report={report} />
      </Grid>

      {/* ── How well it went ── */}
      <Grid columns={layout.columns} gap={gap}>
        <Panel title="Latency" meta={`Average per ${per} · slowest ${formatMs(t.maxLatencyMs)}`}>
          {t.calls === 0 || labels.length < 2 ? (
            <Text className={EMPTY_TEXT}>No calls in this window.</Text>
          ) : (
            <AreaChart
              labels={labels}
              height={layout.compact ? 120 : 150}
              format={(v) => formatMs(v)}
              accessibilityLabel={`${providerLabel(report.provider)} average latency per ${per}`}
              series={[
                {
                  key: 'lat',
                  label: 'Average',
                  color: colors.info,
                  values: report.series.map((p) => p.avgLatencyMs ?? 0),
                },
              ]}
            />
          )}
        </Panel>
        <OutcomesPanel report={report} />
        {wide ? groups : null}
      </Grid>

      {/* ── Which endpoints, then what is connected ── */}
      <Grid columns={layout.compact ? 1 : 2} gap={gap} equalHeight={false}>
        <View style={{ rowGap: gap }}>
          {wide ? null : groups}
          <EndpointsPanel report={report} group={group} onClear={() => setGroup('all')} />
        </View>
        <FeedsPanel report={report} />
      </Grid>

      <Grid columns={layout.compact ? 1 : 2} gap={gap} equalHeight={false}>
        <RightNowPanel report={report} />
        <RecentCallsPanel report={report} />
      </Grid>

      <Text className="text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint">
        History comes from hourly rollups written by every server process; “Right now” and recent
        calls are the serving process only. Rate limits marked as our own throttle are this
        platform’s, never the provider’s.
      </Text>
    </View>
  );
}

/**
 * Admin › Third-party API usage (web: ApiUsagePanel) — every call this platform makes to an
 * outside API, one provider at a time (mStock | Groww), laid out the same way for both: a verdict
 * and six headline numbers; traffic beside the rate-limit budgets it spends; latency and
 * outcomes with the failure reasons in words; endpoints, live connections, this server's state
 * right now and the recent calls. Replaces the mStock-only screen.
 */
export function ApiUsagePanel() {
  const layout = useScreenLayout();
  const [provider, setProvider] = useState<ApiProvider>('mstock');
  const [range, setRange] = useState<ApiUsageRange>('24h');
  const usage = useApiUsage(range, provider);
  const report = usage.data;

  const controls = (
    <View className={layout.compact ? 'gap-3' : 'flex-row items-center justify-between gap-4'}>
      <View style={layout.compact ? undefined : { width: 260 }}>
        <SegmentedControl items={PROVIDER_ITEMS} value={provider} onChange={setProvider} />
      </View>
      <RangeSelector items={RANGES} value={range} onChange={setRange} />
    </View>
  );

  return (
    <StackScreen
      title="Third-party API usage"
      subtitle={
        report
          ? `${providerLabel(report.provider)} · per ${report.bucket} · IST`
          : 'mStock and Groww calls'
      }
      onRefresh={() => usage.refetch()}
      fill
    >
      {controls}
      <View className="mt-4">
        {usage.isPending ? (
          <ListSkeleton rows={4} />
        ) : !report ? (
          <AdminQueryError
            what="API usage"
            error={usage.error}
            onRetry={() => void usage.refetch()}
          />
        ) : (
          // Keyed by provider so a filter picked on one provider never applies to the other.
          <UsageBody key={report.provider} report={report} fallback={usage.fallback} />
        )}
      </View>
    </StackScreen>
  );
}
