import React, { useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import { BarChart } from '@/components/charts/BarChart';
import { InlineEmpty, InlineError } from '@/components/common/InlineError';
import { ChangeText } from '@/components/market/ChangeText';
import { StockLogo } from '@/components/market/StockLogo';
import { ListSkeleton } from '@/components/navigation/StackScreen';
import { Card } from '@/components/ui/Card';
import { Donut } from '@/components/ui/Donut';
import { KeyValueRow } from '@/components/ui/KeyValueRow';
import { KpiGrid } from '@/components/ui/KpiGrid';
import { ListCard, RowDivider, Section } from '@/components/ui/Section';
import { Chips, RangeSelector, SegmentedControl } from '@/components/ui/Tabs';
import { stockLogoUrl } from '@/features/market/api';
import { Note } from '@/features/trading/components/Sheet';
import {
  formatINR,
  formatPercent,
  formatQuantity,
  formatSignedINR,
  formatSignedPercent,
} from '@/lib/utils/formatters';
import { useTheme } from '@/theme/ThemeProvider';

import { useLinkedAnalytics, usePnlStatement } from '../hooks';
import { allocationByHolding, holdingMovers } from '../lib/book';
import { dayLabel, formatDay, monthLabel, plural } from '../lib/dates';
import { CHART_PALETTES, type HoldingView } from '../lib/portfolio';
import type { LinkedAnalytics, LinkedPortfolioSnapshot, PnlStatementDay } from '../types';

import { useMask } from './BookSummaryCard';

const NUMBERS = { fontVariant: ['tabular-nums' as const] };

/** Newest-first days as oldest-first bars for the chart. */
function dayBars(days: readonly PnlStatementDay[]) {
  return [...days].reverse().map((day) => ({ label: formatDay(day.date), value: day.net }));
}

// ── Daily P&L statement ──────────────────────────────────────────────────────────────────

type StatementRange = '30' | '90' | '180' | '365';
const STATEMENT_RANGES: readonly { key: StatementRange; label: string }[] = [
  { key: '30', label: '30 days' },
  { key: '90', label: '90 days' },
  { key: '180', label: '180 days' },
  { key: '365', label: '1 year' },
];

/**
 * The linked broker publishes no P&L statement or order history of its own, so each trading
 * day is recorded while it's still today — the statement starts the day the account was
 * connected.
 */
export function PnlStatementSection({ broker, label }: { broker: string; label: string }) {
  const mask = useMask();
  const [range, setRange] = useState<StatementRange>('90');
  const statement = usePnlStatement(broker, Number(range));
  const data = statement.data;

  return (
    <View>
      <Chips items={STATEMENT_RANGES} value={range} onChange={setRange} className="mb-3" />
      {statement.isPending ? (
        <ListSkeleton rows={4} />
      ) : statement.error && !data ? (
        <InlineError
          what="the statement"
          error={statement.error}
          onRetry={() => void statement.refetch()}
        />
      ) : data ? (
        <View style={{ opacity: statement.isPlaceholderData ? 0.6 : 1 }}>
          <KpiGrid
            items={[
              {
                label: 'Net realised',
                value: mask(formatSignedINR(data.totals.net)),
                trend: data.totals.net,
                sub: 'after charges',
              },
              {
                label: 'Realised P&L',
                value: mask(formatSignedINR(data.totals.realised)),
                trend: data.totals.realised,
              },
              { label: 'Charges', value: mask(formatINR(data.totals.charges)) },
              {
                label: 'Turnover',
                value: mask(formatINR(data.totals.buyValue + data.totals.sellValue, 0)),
              },
            ]}
          />
          <KeyValueRow
            className="mt-1"
            label="Unrealised now"
            value={data.unrealisedNow === null ? '—' : mask(formatSignedINR(data.unrealisedNow))}
            trend={data.unrealisedNow}
          />
          {data.days.length === 0 ? (
            <InlineEmpty
              title="No days captured yet"
              message="The first day appears after today's capture."
            />
          ) : (
            <>
              <Card className="mt-2">
                <Text className="mb-2 text-[13px] font-semibold text-ink dark:text-ink-dark">
                  Net P&L by day
                </Text>
                <BarChart
                  bars={dayBars(data.days)}
                  signed
                  height={120}
                  accessibilityLabel={`Net profit and loss for ${plural(data.days.length, 'trading day')}`}
                />
              </Card>
              <Section
                title="Day by day"
                note={data.trackedSince ? `since ${formatDay(data.trackedSince)}` : undefined}
              >
                <ListCard>
                  {data.days.map((day, index) => (
                    <View key={day.date}>
                      {index > 0 ? <RowDivider /> : null}
                      <View className="flex-row items-center gap-3 px-3.5 py-3">
                        <View className="min-w-0 flex-1">
                          <Text className="text-sm font-semibold text-ink dark:text-ink-dark">
                            {dayLabel(day.date)}
                          </Text>
                          <Text
                            className="mt-0.5 text-xs text-ink-muted dark:text-ink-dark-muted"
                            style={NUMBERS}
                            numberOfLines={1}
                          >
                            {plural(day.executedOrders, 'order')} · charges{' '}
                            {mask(formatINR(day.charges))}
                            {day.chargesSource === 'estimated' ? ' (est.)' : ''}
                          </Text>
                        </View>
                        <View className="items-end">
                          <ChangeText value={day.net} className="text-sm" style={NUMBERS}>
                            {mask(formatSignedINR(day.net))}
                          </ChangeText>
                          <Text
                            className="mt-0.5 text-[11px] text-ink-faint dark:text-ink-dark-faint"
                            style={NUMBERS}
                          >
                            realised {mask(formatSignedINR(day.realised))}
                          </Text>
                        </View>
                      </View>
                    </View>
                  ))}
                </ListCard>
              </Section>
            </>
          )}
          <Note>
            Realised P&L is {label}'s own figure for each day's positions; charges are {label}'s
            reported figure where available, otherwise estimated per executed order.
          </Note>
        </View>
      ) : null}
    </View>
  );
}

// ── Overview: allocation, 30-day P&L, today's activity, movers ───────────────────────────

export function LinkedOverviewSection({
  snapshot,
  holdings,
}: {
  snapshot: LinkedPortfolioSnapshot;
  holdings: readonly HoldingView[];
}) {
  const { isDark } = useTheme();
  const mask = useMask();
  const palette = isDark ? CHART_PALETTES.dark : CHART_PALETTES.light;
  const allocation = useMemo(() => allocationByHolding(holdings, palette), [holdings, palette]);
  const movers = useMemo(() => holdingMovers(holdings), [holdings]);
  const pnl = usePnlStatement(snapshot.broker, 30);
  const today = snapshot.todayOrders;
  const totals = snapshot.totals;

  return (
    <View>
      <Section title="Allocation" note={`${plural(holdings.length, 'holding')} by value`}>
        <Card>
          {allocation.length > 0 ? (
            <Donut segments={allocation} />
          ) : (
            <Text className="text-[13px] text-ink-muted dark:text-ink-dark-muted">
              No holdings yet.
            </Text>
          )}
        </Card>
      </Section>

      <Section title="P&L — last 30 days" note="net of charges">
        <Card>
          {pnl.isPending ? (
            <View className="h-[120px]" />
          ) : pnl.data && pnl.data.days.length > 0 ? (
            <>
              <BarChart
                bars={dayBars(pnl.data.days)}
                signed
                height={110}
                accessibilityLabel="Daily net profit and loss, last 30 days"
              />
              <View className="mt-3 flex-row gap-3">
                {(
                  [
                    ['Realised', pnl.data.totals.realised, true],
                    ['Charges', pnl.data.totals.charges, false],
                    ['Net', pnl.data.totals.net, true],
                  ] as const
                ).map(([name, value, signed]) => (
                  <View key={name} className="flex-1">
                    <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">{name}</Text>
                    {signed ? (
                      <ChangeText value={value} className="mt-0.5 text-sm" style={NUMBERS}>
                        {mask(formatSignedINR(value, 0))}
                      </ChangeText>
                    ) : (
                      <Text
                        className="mt-0.5 text-sm font-semibold text-ink dark:text-ink-dark"
                        style={NUMBERS}
                      >
                        {mask(formatINR(value, 0))}
                      </Text>
                    )}
                  </View>
                ))}
              </View>
            </>
          ) : (
            <Text className="text-[13px] text-ink-muted dark:text-ink-dark-muted">
              {pnl.error ? "Couldn't load the statement." : 'No days captured yet.'}
            </Text>
          )}
        </Card>
      </Section>

      {today ? (
        <Section title="Today's activity">
          <KpiGrid
            columns={2}
            items={[
              {
                label: 'Orders',
                value: String(today.total),
                sub: `${today.executed} executed · ${today.open} open`,
              },
              { label: 'Cancelled / rejected', value: String(today.rejected) },
              { label: 'Bought', value: mask(formatINR(totals.buyValueToday ?? null, 0)) },
              { label: 'Sold', value: mask(formatINR(totals.sellValueToday ?? null, 0)) },
              {
                label: 'Realised today',
                value: mask(formatSignedINR(totals.realisedToday ?? null)),
                trend: totals.realisedToday ?? null,
              },
              {
                label: 'Charges today',
                value: formatINR(totals.chargesToday ?? null),
                sub:
                  totals.chargesTodaySource === 'broker'
                    ? `reported by ${snapshot.label}`
                    : totals.chargesTodaySource === 'estimated'
                      ? 'estimated per order'
                      : 'unavailable',
              },
            ]}
          />
        </Section>
      ) : null}

      <Section title="Today's movers" note="your holdings">
        {movers.gainers.length === 0 && movers.losers.length === 0 ? (
          <InlineEmpty title="No price moves yet" />
        ) : (
          <ListCard>
            {[...movers.gainers, ...movers.losers].map((holding, index) => (
              <View key={holding.key}>
                {index > 0 ? <RowDivider /> : null}
                <View className="flex-row items-center gap-3 px-3.5 py-2.5">
                  <StockLogo symbol={holding.symbol} uri={stockLogoUrl(holding.symbol)} size="sm" />
                  <Text
                    className="flex-1 text-[13px] font-semibold text-ink dark:text-ink-dark"
                    numberOfLines={1}
                  >
                    {holding.symbol}
                  </Text>
                  <ChangeText value={holding.dayChangePct} className="text-[13px]" style={NUMBERS}>
                    {formatSignedPercent(holding.dayChangePct)}
                  </ChangeText>
                </View>
              </View>
            ))}
          </ListCard>
        )}
      </Section>
    </View>
  );
}

// ── P&L analytics over captured days ─────────────────────────────────────────────────────

type AnalyticsRange = '30' | '90' | '180' | '365';
const ANALYTICS_RANGES: readonly { key: AnalyticsRange; label: string }[] = [
  { key: '30', label: '1M' },
  { key: '90', label: '3M' },
  { key: '180', label: '6M' },
  { key: '365', label: '1Y' },
];
type StockSort = 'total' | 'realised' | 'unrealised';
const STOCK_SORTS: readonly { key: StockSort; label: string }[] = [
  { key: 'total', label: 'Total' },
  { key: 'realised', label: 'Realised' },
  { key: 'unrealised', label: 'Unrealised' },
];
const STOCK_LIMIT = 15;

function StockPnlList({ analytics }: { analytics: LinkedAnalytics }) {
  const mask = useMask();
  const [sort, setSort] = useState<StockSort>('total');
  const [all, setAll] = useState(false);
  const rows = useMemo(
    () => [...analytics.stocks].sort((a, b) => (b[sort] ?? 0) - (a[sort] ?? 0)),
    [analytics.stocks, sort],
  );
  if (rows.length === 0) return <InlineEmpty title="No stock activity captured yet" />;
  const shown = all ? rows : rows.slice(0, STOCK_LIMIT);

  return (
    <View>
      <SegmentedControl items={STOCK_SORTS} value={sort} onChange={setSort} className="mb-3" />
      <ListCard>
        {shown.map((row, index) => (
          <View key={row.sym}>
            {index > 0 ? <RowDivider /> : null}
            <View className="flex-row items-center gap-3 px-3.5 py-3">
              <StockLogo symbol={row.sym} uri={stockLogoUrl(row.sym)} size="sm" />
              <View className="min-w-0 flex-1">
                <Text
                  className="text-sm font-semibold text-ink dark:text-ink-dark"
                  numberOfLines={1}
                >
                  {row.sym}
                </Text>
                <Text
                  className="mt-0.5 text-xs text-ink-muted dark:text-ink-dark-muted"
                  numberOfLines={1}
                >
                  {row.holdingQty > 0 ? `${formatQuantity(row.holdingQty)} held · ` : ''}
                  {plural(row.tradedDays, 'trading day')}
                </Text>
              </View>
              <View className="items-end">
                <ChangeText value={row.total} className="text-sm" style={NUMBERS}>
                  {mask(formatSignedINR(row.total, 0))}
                </ChangeText>
                <Text
                  className="mt-0.5 text-[11px] text-ink-faint dark:text-ink-dark-faint"
                  style={NUMBERS}
                >
                  R {mask(formatSignedINR(row.realised, 0))} · U{' '}
                  {row.unrealised === null ? '—' : mask(formatSignedINR(row.unrealised, 0))}
                </Text>
              </View>
            </View>
          </View>
        ))}
      </ListCard>
      {rows.length > STOCK_LIMIT ? (
        <Text
          accessibilityRole="button"
          onPress={() => setAll((value) => !value)}
          className="mt-3 text-center text-[13px] font-semibold text-brand-text dark:text-brand-text-dark"
        >
          {all ? 'Show fewer' : `Show all ${rows.length}`}
        </Text>
      ) : null}
    </View>
  );
}

export function LinkedAnalyticsSection({ broker, label }: { broker: string; label: string }) {
  const mask = useMask();
  const [range, setRange] = useState<AnalyticsRange>('365');
  const query = useLinkedAnalytics(broker, Number(range));
  const analytics = query.data;

  return (
    <View>
      <View className="mb-3 flex-row items-center justify-between gap-3">
        <Text className="flex-1 text-xs text-ink-muted dark:text-ink-dark-muted" numberOfLines={2}>
          {analytics?.trackedSince
            ? `From captured ${label} orders since ${formatDay(analytics.trackedSince)}`
            : `From captured ${label} orders and positions`}
        </Text>
        <RangeSelector items={ANALYTICS_RANGES} value={range} onChange={setRange} />
      </View>
      {query.isPending ? (
        <ListSkeleton rows={3} />
      ) : query.error && !analytics ? (
        <InlineError what="analytics" error={query.error} onRetry={() => void query.refetch()} />
      ) : analytics ? (
        <View style={{ opacity: query.isPlaceholderData ? 0.6 : 1 }}>
          <KpiGrid
            items={[
              {
                label: 'Total P&L',
                value: mask(formatSignedINR(analytics.totals.totalPnl, 0)),
                trend: analytics.totals.totalPnl,
                sub: 'net realised + unrealised',
              },
              {
                label: 'Net realised',
                value: mask(formatSignedINR(analytics.totals.net, 0)),
                trend: analytics.totals.net,
              },
              {
                label: 'Unrealised',
                value: mask(formatSignedINR(analytics.totals.unrealised, 0)),
                trend: analytics.totals.unrealised,
                sub: 'open holdings',
              },
              { label: 'Charges', value: mask(formatINR(analytics.totals.charges)) },
            ]}
          />

          <Section title="Trading days">
            <Card>
              <KeyValueRow
                label="Win rate"
                value={
                  analytics.dayStats.winRate === null
                    ? '—'
                    : formatPercent(analytics.dayStats.winRate, 0)
                }
                hint={`${analytics.dayStats.profitableDays} up · ${analytics.dayStats.losingDays} down`}
              />
              <KeyValueRow
                label="Average day"
                value={mask(formatSignedINR(analytics.dayStats.avgNet))}
                trend={analytics.dayStats.avgNet}
                hint={plural(analytics.dayStats.tradingDays, 'active day')}
                divider
              />
              <KeyValueRow
                label="Best day"
                value={mask(formatSignedINR(analytics.dayStats.bestDay?.net ?? null))}
                trend={analytics.dayStats.bestDay?.net ?? null}
                hint={
                  analytics.dayStats.bestDay
                    ? formatDay(analytics.dayStats.bestDay.date)
                    : undefined
                }
                divider
              />
              <KeyValueRow
                label="Worst day"
                value={mask(formatSignedINR(analytics.dayStats.worstDay?.net ?? null))}
                trend={analytics.dayStats.worstDay?.net ?? null}
                hint={
                  analytics.dayStats.worstDay
                    ? formatDay(analytics.dayStats.worstDay.date)
                    : undefined
                }
                divider
              />
              {analytics.dayStats.streak ? (
                <KeyValueRow
                  label="Current streak"
                  value={`${plural(analytics.dayStats.streak.days, 'day')} ${analytics.dayStats.streak.kind === 'win' ? 'up' : 'down'}`}
                  divider
                />
              ) : null}
            </Card>
          </Section>

          <Section title="Orders">
            <KpiGrid
              items={[
                {
                  label: 'Placed',
                  value: String(analytics.orderStats.total),
                  sub: `${analytics.orderStats.open} open`,
                },
                {
                  label: 'Executed',
                  value: String(analytics.orderStats.executed),
                  sub: `${analytics.orderStats.buys} buy · ${analytics.orderStats.sells} sell`,
                },
                {
                  label: 'Cancelled / rejected',
                  value: String(analytics.orderStats.cancelled + analytics.orderStats.rejected),
                },
                {
                  label: 'Avg executed',
                  value: mask(formatINR(analytics.orderStats.avgExecutedValue, 0)),
                },
              ]}
            />
          </Section>

          <Section title="Stock-wise P&L">
            <StockPnlList analytics={analytics} />
          </Section>

          {analytics.months.length > 0 ? (
            <Section title="Monthly P&L" note="net of charges">
              <Card className="mb-3">
                <BarChart
                  bars={[...analytics.months]
                    .sort((a, b) => a.month.localeCompare(b.month))
                    .map((month) => ({ label: monthLabel(month.month), value: month.net }))}
                  signed
                  height={110}
                  accessibilityLabel="Net profit and loss by month"
                />
              </Card>
              <ListCard>
                {analytics.months.map((month, index) => (
                  <View key={month.month}>
                    {index > 0 ? <RowDivider /> : null}
                    <View className="flex-row items-center gap-3 px-3.5 py-3">
                      <View className="flex-1">
                        <Text className="text-sm font-semibold text-ink dark:text-ink-dark">
                          {monthLabel(month.month)}
                        </Text>
                        <Text className="mt-0.5 text-xs text-ink-muted dark:text-ink-dark-muted">
                          {plural(month.tradingDays, 'day')} · {month.profitableDays} profitable
                        </Text>
                      </View>
                      <View className="items-end">
                        <ChangeText value={month.net} className="text-sm" style={NUMBERS}>
                          {mask(formatSignedINR(month.net))}
                        </ChangeText>
                        <Text
                          className="mt-0.5 text-[11px] text-ink-faint dark:text-ink-dark-faint"
                          style={NUMBERS}
                        >
                          charges {mask(formatINR(month.charges))}
                        </Text>
                      </View>
                    </View>
                  </View>
                ))}
              </ListCard>
            </Section>
          ) : null}

          <Note>
            Realised P&L is {label}'s own figure for each day's positions, summed per stock. Days
            before the connection aren't available — {label} publishes no history.
          </Note>
        </View>
      ) : null}
    </View>
  );
}
