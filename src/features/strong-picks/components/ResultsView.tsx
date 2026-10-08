import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { BarChart } from '@/components/charts/BarChart';
import { InlineEmpty, InlineError } from '@/components/common/InlineError';
import { Panel } from '@/components/dashboard/Panel';
import { StatTile } from '@/components/dashboard/StatTile';
import { Grid } from '@/components/layout/Grid';
import { useScreenLayout } from '@/components/layout/responsive';
import { ChangeText } from '@/components/market/ChangeText';
import { ListSkeleton } from '@/components/navigation/StackScreen';
import { Button } from '@/components/ui/Button';
import { Meter } from '@/components/ui/Meter';
import { RowDivider } from '@/components/ui/Section';
import { RangeSelector } from '@/components/ui/Tabs';
import { StatusPill } from '@/features/settings/components/StatusPill';
import { stockHref } from '@/lib/navigation';
import { formatNumber, formatPercent, formatSignedPercent } from '@/lib/utils/formatters';
import { isServerOutdated } from '@/services/api/contract';

import { useStrongPickAnalytics } from '../hooks';
import { CATEGORY_META, dayName, outcomeView } from '../lib/picksView';
import {
  RESULT_RANGES,
  categoryRows,
  dayBars,
  scoreSub,
  successTone,
  type ResultRange,
} from '../lib/results';
import type { AnalyticsEntry, StrongPickAnalytics } from '../types';

const NUM = { fontVariant: ['tabular-nums' as const] };

/**
 * Results — how the picks actually did, settled by the monitor. A pick SUCCEEDS when it closes in
 * profit: at its target, or above its entry when its horizon runs out. A buy-above pick that never
 * triggered is no trade and stays out of every rate; rates are over CLOSED trades only.
 */
export function ResultsView({
  range,
  onRange,
  live,
  onOpenDay,
}: {
  range: ResultRange;
  onRange: (range: ResultRange) => void;
  /** Market open — the record refreshes as picks settle. */
  live: boolean;
  onOpenDay: (date: string) => void;
}) {
  const query = useStrongPickAnalytics(Number(range), { live });
  const data = query.data;

  let body: React.ReactNode;
  if (query.isPending) {
    body = <ListSkeleton rows={5} />;
  } else if (query.error && !data) {
    body = isServerOutdated(query.error) ? (
      <InlineEmpty
        title="Needs a newer server"
        message="Strong-pick results aren’t available on the server this app is connected to yet."
      />
    ) : (
      <InlineError what="the results" error={query.error} onRetry={() => void query.refetch()} />
    );
  } else if (data) {
    body = <ResultsBody data={data} onOpenDay={onOpenDay} />;
  }

  return (
    <View className="gap-4">
      <View className="flex-row items-center justify-between gap-3">
        <Text className="flex-1 text-[13px] text-ink-muted dark:text-ink-dark-muted">
          {data?.since ? `Since ${dayName(data.since)}` : 'The track record'}
        </Text>
        <RangeSelector items={RESULT_RANGES} value={range} onChange={onRange} />
      </View>
      <View style={{ opacity: query.isPlaceholderData ? 0.6 : 1 }}>{body}</View>
    </View>
  );
}

function ResultsBody({
  data,
  onOpenDay,
}: {
  data: StrongPickAnalytics;
  onOpenDay: (date: string) => void;
}) {
  const layout = useScreenLayout();
  const o = data.overall;
  const t = data.today;
  const bars = dayBars(data.byDay);

  return (
    <View className="gap-4">
      <Grid columns={Math.min(layout.kpiColumns, 4)}>
        <StatTile
          label="Success rate"
          value={o.successRate == null ? '—' : formatPercent(o.successRate, 0)}
          sub={scoreSub(o)}
          status={successTone(o.successRate, o.closed)}
        />
        <StatTile
          label="Target hit rate"
          value={o.targetHitRate == null ? '—' : formatPercent(o.targetHitRate, 0)}
          sub={
            o.closed
              ? `${o.targets} targets · ${o.stops} stops · ${o.timeExits} time`
              : 'No closed trades'
          }
        />
        <StatTile
          label="Avg return a trade"
          value={formatSignedPercent(o.avgReturnPct, 2)}
          sub="per closed trade, on the stock"
          status={
            o.avgReturnPct == null
              ? undefined
              : o.avgReturnPct > 0
                ? 'ok'
                : o.avgReturnPct < 0
                  ? 'bad'
                  : undefined
          }
        />
        <StatTile
          label="Open in profit"
          value={o.openInProfitPct == null ? '—' : formatPercent(o.openInProfitPct, 0)}
          sub={`${o.open} open · ${o.notTriggered} never triggered`}
        />
      </Grid>

      <Panel
        title={t ? `Each pick · ${dayName(t.date)}` : 'Each pick'}
        meta={
          t
            ? data.sessionClosed
              ? 'final for the day'
              : 'live — settles after 15:30 IST'
            : undefined
        }
        right={
          t ? (
            <Button label="Open day" size="sm" variant="ghost" onPress={() => onOpenDay(t.date)} />
          ) : undefined
        }
        flush
      >
        {!data.sessionClosed && t ? (
          <Text className="px-4 pb-2 text-xs leading-[17px] text-ink-faint dark:text-ink-dark-faint">
            Open picks are marked to the live price; the day’s figures settle after the 15:30 close.
            Swing, futures and options picks keep running over their horizon.
          </Text>
        ) : null}
        {t && t.entries.length > 0 ? (
          t.entries.map((entry, index) => (
            <View key={`${entry.date}:${entry.symbol}:${entry.category}`}>
              {index > 0 ? <RowDivider /> : null}
              <EntryRow entry={entry} />
            </View>
          ))
        ) : (
          <Text className="px-4 pb-4 text-[13px] text-ink-muted dark:text-ink-dark-muted">
            No picks have been published in this window yet.
          </Text>
        )}
      </Panel>

      <Grid columns={Math.min(layout.columns, 2)} equalHeight={false}>
        <Panel title="By category" meta={`since ${dayName(data.since, false)}`} flush>
          {o.picks === 0 ? (
            <Text className="px-4 pb-4 text-[13px] text-ink-muted dark:text-ink-dark-muted">
              No picks in this window.
            </Text>
          ) : (
            categoryRows(data.byCategory).map((row, index) => (
              <View key={row.category}>
                {index > 0 ? <RowDivider /> : null}
                <View
                  accessible
                  accessibilityLabel={`${CATEGORY_META[row.category].label}: ${scoreSub(row)}`}
                  className="px-4 py-3"
                >
                  <View className="flex-row items-baseline gap-2">
                    <Text className="flex-1 text-[13px] font-semibold text-ink dark:text-ink-dark">
                      {CATEGORY_META[row.category].label}
                      <Text className="text-xs font-normal text-ink-faint dark:text-ink-dark-faint">
                        {`  ${CATEGORY_META[row.category].held}`}
                      </Text>
                    </Text>
                    <Text
                      className="text-[13px] font-semibold text-ink dark:text-ink-dark"
                      style={NUM}
                    >
                      {row.successRate == null ? '—' : formatPercent(row.successRate, 0)}
                    </Text>
                  </View>
                  <Meter
                    className="mt-1.5"
                    value={row.successRate ?? 0}
                    tone="neutral"
                    height={4}
                  />
                  <View className="mt-1.5 flex-row items-baseline gap-2">
                    <Text
                      className="flex-1 text-xs text-ink-muted dark:text-ink-dark-muted"
                      style={NUM}
                    >
                      {`${row.picks} picks · ${row.closed} closed · ${row.targets} targets · ${row.stops} stops`}
                    </Text>
                    <ChangeText value={row.avgReturnPct} className="text-xs" style={NUM}>
                      {formatSignedPercent(row.avgReturnPct, 2)}
                    </ChangeText>
                  </View>
                </View>
              </View>
            ))
          )}
        </Panel>

        <Panel title="Day by day" meta="average return of closed picks" flush>
          {bars.length > 1 ? (
            <View className="px-4 pb-3">
              <BarChart
                bars={bars}
                height={120}
                signed
                accessibilityLabel="Average return of the closed strong picks, day by day"
              />
            </View>
          ) : null}
          {data.byDay.length === 0 ? (
            <Text className="px-4 pb-4 text-[13px] text-ink-muted dark:text-ink-dark-muted">
              No days in this window.
            </Text>
          ) : (
            data.byDay.map((day, index) => (
              <View key={day.date}>
                {index > 0 || bars.length > 1 ? <RowDivider /> : null}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Open the picks of ${dayName(day.date)}: ${scoreSub(day)}`}
                  onPress={() => onOpenDay(day.date)}
                  className="flex-row items-center gap-3 px-4 py-2.5 active:bg-surface-sunk dark:active:bg-surface-sunk-dark"
                >
                  <View className="min-w-0 flex-1">
                    <Text className="text-[13px] font-semibold text-ink dark:text-ink-dark">
                      {dayName(day.date)}
                    </Text>
                    <Text
                      className="mt-0.5 text-xs text-ink-muted dark:text-ink-dark-muted"
                      style={NUM}
                    >
                      {`${day.picks} pick${day.picks === 1 ? '' : 's'} · ${day.closed} closed`}
                    </Text>
                  </View>
                  <View className="items-end">
                    <Text
                      className="text-[13px] font-semibold text-ink dark:text-ink-dark"
                      style={NUM}
                    >
                      {day.successRate == null ? '—' : formatPercent(day.successRate, 0)}
                    </Text>
                    <ChangeText value={day.avgReturnPct} className="text-[11px]" style={NUM}>
                      {formatSignedPercent(day.avgReturnPct, 2)}
                    </ChangeText>
                  </View>
                </Pressable>
              </View>
            ))
          )}
        </Panel>
      </Grid>

      <Text className="text-xs leading-[17px] text-ink-faint dark:text-ink-dark-faint">
        A pick succeeds when it closes in profit — at its target, or above its entry when its
        horizon ends (intraday 15:20, options 3 sessions, futures 5, equity 10). When a pick touches
        both its stop and its target, the stop is counted. A buy-above pick that never triggered is
        no trade and is left out. Returns are on the stock’s price, before charges; leverage in
        futures and options multiplies them. Past results do not promise future ones.
      </Text>
    </View>
  );
}

function EntryRow({ entry }: { entry: AnalyticsEntry }) {
  const router = useRouter();
  const view = outcomeView(entry.status);
  const progress =
    entry.progressToTarget == null
      ? null
      : Math.round(Math.min(1, Math.max(0, entry.progressToTarget)) * 100);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${entry.symbol}, ${CATEGORY_META[entry.category].label}, ${view.label}, ${formatSignedPercent(entry.returnPct, 2)}. Open stock`}
      onPress={() => router.push(stockHref(entry.symbol, 'NSE'))}
      className="px-4 py-2.5 active:bg-surface-sunk dark:active:bg-surface-sunk-dark"
    >
      <View className="flex-row items-center gap-3">
        <View className="min-w-0 flex-1">
          <Text className="text-[13px] font-semibold text-ink dark:text-ink-dark" numberOfLines={1}>
            {entry.symbol}
          </Text>
          <Text
            className="mt-0.5 text-xs text-ink-muted dark:text-ink-dark-muted"
            numberOfLines={1}
          >
            {[CATEGORY_META[entry.category].label, entry.name].filter(Boolean).join(' · ')}
          </Text>
        </View>
        <View className="items-end gap-1">
          <StatusPill tone={view.tone} label={view.label} />
          <ChangeText value={entry.returnPct} className="text-xs" style={NUM}>
            {formatSignedPercent(entry.returnPct, 2)}
          </ChangeText>
        </View>
      </View>
      {progress != null ? (
        <View className="mt-1.5 flex-row items-center gap-2">
          <View className="flex-1">
            <Meter
              value={progress}
              tone="neutral"
              height={4}
              accessibilityLabel={`${progress}% of the way to target, by the best price`}
            />
          </View>
          <Text
            className="w-20 text-right text-[11px] text-ink-faint dark:text-ink-dark-faint"
            style={NUM}
          >
            {`${formatNumber(progress, 0)}% to target`}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}
