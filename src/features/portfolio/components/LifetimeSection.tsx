import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { BarChart } from '@/components/charts/BarChart';
import { InlineEmpty, InlineError } from '@/components/common/InlineError';
import { ChangeText } from '@/components/market/ChangeText';
import { PriceChart } from '@/components/market/PriceChart';
import { ListSkeleton } from '@/components/navigation/StackScreen';
import { Banner } from '@/components/ui/Banner';
import { Card } from '@/components/ui/Card';
import { KeyValueRow } from '@/components/ui/KeyValueRow';
import { KpiGrid } from '@/components/ui/KpiGrid';
import { ListCard, RowDivider, Section } from '@/components/ui/Section';
import { Note, Pager, SideTag } from '@/features/trading/components/Sheet';
import {
  formatINR,
  formatNumber,
  formatPercent,
  formatQuantity,
  formatSignedINR,
  formatSignedPercent,
} from '@/lib/utils/formatters';

import { useLifetimeOverview, useLifetimeStatement } from '../hooks';
import { dayToMs, formatAsOf, formatDay, monthLabel, plural } from '../lib/dates';
import type { LifetimeOverview, ReportSummary } from '../types';

import { useMask } from './BookSummaryCard';

const NUMBERS = { fontVariant: ['tabular-nums' as const] };
const STOCK_LIMIT = 12;

function MoneyCharts({ overview }: { overview: LifetimeOverview }) {
  const mask = useMask();
  const months = overview.months;
  const points = useMemo(
    () =>
      months
        .map((month) => ({ time: dayToMs(`${month.month}-01`), value: month.cumulativeNet }))
        .filter((point) => Number.isFinite(point.time)),
    [months],
  );
  if (months.length === 0) return null;
  const last = months[months.length - 1]!;

  return (
    <Section title="Where your money went" note="realised, after charges">
      <Card>
        <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">
          Cumulative net realised · {monthLabel(last.month)}
        </Text>
        <ChangeText value={last.cumulativeNet} className="mt-0.5 text-lg" style={NUMBERS}>
          {mask(formatSignedINR(last.cumulativeNet, 0))}
        </ChangeText>
        {points.length >= 2 ? (
          <View className="mt-3">
            <PriceChart points={points} height={140} baseline={0} />
          </View>
        ) : null}
        <Text className="mb-2 mt-4 text-[13px] font-semibold text-ink dark:text-ink-dark">
          Monthly net P&L
        </Text>
        <BarChart
          bars={months
            .slice(-12)
            .map((month) => ({ label: monthLabel(month.month), value: month.net }))}
          signed
          height={100}
          accessibilityLabel="Net profit and loss by month"
        />
        <Note>Realised only — unrealised returns are excluded.</Note>
      </Card>
    </Section>
  );
}

/** The broker's own totals from the latest uploaded report — its figures, not the replay's. */
function ReportTotals({ report }: { report: ReportSummary }) {
  const mask = useMask();
  const [open, setOpen] = useState(false);
  const signed = (value: number | null) => (value === null ? '—' : mask(formatSignedINR(value, 0)));

  return (
    <Section
      title="Broker-reported P&L"
      note={`${formatDay(report.from)} – ${formatDay(report.to)}`}
    >
      <KpiGrid
        items={[
          { label: 'Realised profit', value: signed(report.realised), trend: report.realised },
          {
            label: 'Report charges',
            value: report.charges === null ? '—' : mask(formatINR(report.charges, 0)),
            sub: 'this period only',
          },
          {
            label: 'Net realised',
            value: signed(report.netRealised),
            trend: report.netRealised,
          },
        ]}
      />
      {report.breakdown.length > 0 ? (
        <Card className="mt-3">
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: open }}
            onPress={() => setOpen((value) => !value)}
            className="flex-row items-center justify-between active:opacity-60"
          >
            <Text className="text-[13px] font-semibold text-ink dark:text-ink-dark">
              Charge breakdown
            </Text>
            <Text className="text-[13px] font-semibold text-brand-text dark:text-brand-text-dark">
              {open ? 'Hide' : 'Show'}
            </Text>
          </Pressable>
          {open
            ? report.breakdown.map((line, index) => (
                <KeyValueRow
                  key={line.label}
                  label={line.label}
                  value={mask(formatINR(line.amount))}
                  divider={index > 0}
                />
              ))
            : null}
        </Card>
      ) : null}
    </Section>
  );
}

function Statement({
  broker,
  sym,
  onClear,
}: {
  broker: string;
  sym: string | null;
  onClear: () => void;
}) {
  const mask = useMask();
  const [page, setPage] = useState(1);
  const query = useLifetimeStatement(broker, page, sym);
  const data = query.data;

  return (
    <Section
      title={sym ? `Statement · ${sym}` : 'Statement'}
      action={sym ? { label: 'Show all', onPress: onClear } : undefined}
      note={sym ? undefined : 'newest first'}
    >
      {query.isPending ? (
        <ListSkeleton rows={4} />
      ) : query.error && !data ? (
        <InlineError
          what="the statement"
          error={query.error}
          onRetry={() => void query.refetch()}
        />
      ) : !data || data.total === 0 ? (
        <InlineEmpty title="No trades yet" />
      ) : (
        <View style={{ opacity: query.isPlaceholderData ? 0.6 : 1 }}>
          <ListCard>
            {data.rows.map((row, index) => (
              <View key={`${row.date}-${row.sym}-${index}`}>
                {index > 0 ? <RowDivider /> : null}
                <View className="flex-row items-center gap-3 px-3.5 py-3">
                  <View className="min-w-0 flex-1">
                    <View className="flex-row items-center gap-2">
                      <SideTag side={row.side} />
                      <Text
                        className="flex-shrink text-sm font-semibold text-ink dark:text-ink-dark"
                        numberOfLines={1}
                      >
                        {row.sym}
                      </Text>
                    </View>
                    <Text
                      className="mt-1 text-xs text-ink-muted dark:text-ink-dark-muted"
                      style={NUMBERS}
                      numberOfLines={1}
                    >
                      {formatDay(row.date)} · {formatQuantity(row.qty)} @ {formatINR(row.price)}
                      {row.source === 'import' ? ' · report' : ' · captured'}
                    </Text>
                  </View>
                  <View className="items-end">
                    {row.realised !== null ? (
                      <ChangeText value={row.realised} className="text-sm" style={NUMBERS}>
                        {mask(formatSignedINR(row.realised))}
                      </ChangeText>
                    ) : (
                      <Text
                        className="text-sm font-semibold text-ink dark:text-ink-dark"
                        style={NUMBERS}
                      >
                        {mask(formatINR(row.value, 0))}
                      </Text>
                    )}
                    <Text
                      className="mt-0.5 text-[11px] text-ink-faint dark:text-ink-dark-faint"
                      style={NUMBERS}
                    >
                      charges {formatINR(row.charges)}
                      {row.chargesEstimated ? ' est.' : row.chargesAllocated ? ' share' : ''}
                    </Text>
                  </View>
                </View>
              </View>
            ))}
          </ListCard>
          <Pager
            page={data.page}
            totalPages={data.totalPages}
            busy={query.isFetching && query.isPlaceholderData}
            onPage={(next) => setPage(Math.min(Math.max(1, next), data.totalPages))}
            summary={`${plural(data.total, 'trade')} · FIFO realised P&L, before charges`}
          />
        </View>
      )}
    </Section>
  );
}

/**
 * The statement since the account started and the overall P&L — for a broker whose API
 * shares no history. History comes from the broker's own reports, imported on the web;
 * orders captured live fill in after the last report. Every figure is the server's (FIFO).
 */
export function LifetimeSection({
  broker,
  label,
  quiet = false,
}: {
  broker: string;
  label: string;
  /** Render only an existing statement — nothing while loading, on error or when empty. */
  quiet?: boolean;
}) {
  const mask = useMask();
  const query = useLifetimeOverview(broker);
  const [sym, setSym] = useState<string | null>(null);
  const [allStocks, setAllStocks] = useState(false);
  const overview = query.data;

  if (quiet && !(overview && overview.totals.trades > 0)) return null;
  if (query.isPending) return <ListSkeleton rows={3} />;
  if (query.error && !overview) {
    return (
      <InlineError what="the statement" error={query.error} onRetry={() => void query.refetch()} />
    );
  }
  if (!overview) return null;

  const hasHistory = overview.totals.trades > 0;
  const syncLine = `Last auto-capture: ${
    overview.sync?.succeededAt ? `${formatAsOf(overview.sync.succeededAt)} IST` : 'not recorded yet'
  }.${overview.sync?.error ? ` ${overview.sync.error}` : ''}`;
  const charges = overview.totals;

  if (!hasHistory) {
    return (
      <View>
        <InlineEmpty
          title="No statement yet"
          message={`Import your ${label} reports on the web to build your history.`}
        />
        {overview.latestReport ? <ReportTotals report={overview.latestReport} /> : null}
        <Note>{syncLine}</Note>
      </View>
    );
  }

  const stocks = allStocks ? overview.stocks : overview.stocks.slice(0, STOCK_LIMIT);
  const outcomes = overview.outcomes;

  return (
    <View>
      <Text className="mb-3 text-xs leading-[17px] text-ink-muted dark:text-ink-dark-muted">
        {`Since ${formatDay(overview.firstTrade)} · ${plural(overview.totals.trades, 'trade')} (${overview.sources.imported} imported, ${overview.sources.captured} live)`}
      </Text>
      <KpiGrid
        items={[
          {
            label: 'Overall P&L',
            value: mask(formatSignedINR(overview.overall.pnl, 0)),
            trend: overview.overall.pnl,
            sub:
              overview.overall.returnOnBuysPct !== null
                ? `${formatSignedPercent(overview.overall.returnOnBuysPct)} on money invested`
                : 'realised net + unrealised',
          },
          {
            label: 'Net realised',
            value: mask(formatSignedINR(overview.totals.netRealised, 0)),
            trend: overview.totals.netRealised,
            sub: `${mask(formatSignedINR(overview.totals.realised, 0))} before charges`,
          },
          {
            label: 'Unrealised',
            value: mask(formatSignedINR(overview.live.unrealised, 0)),
            trend: overview.live.unrealised,
            sub: overview.live.available ? 'on holdings now' : 'live holdings unavailable',
          },
          {
            label: 'Trade charges',
            value: mask(formatINR(charges.charges, 0)),
            sub:
              [
                charges.chargesAllocated
                  ? `${mask(formatINR(charges.chargesAllocated, 0))} actual`
                  : null,
                charges.chargesEstimated
                  ? `${mask(formatINR(charges.chargesEstimated, 0))} est.`
                  : null,
              ]
                .filter(Boolean)
                .join(' · ') || 'from your reports',
          },
          {
            label: 'Short-term (STCG)',
            value: mask(formatSignedINR(overview.totals.stcg, 0)),
            trend: overview.totals.stcg,
          },
          {
            label: 'Long-term (LTCG)',
            value: mask(formatSignedINR(overview.totals.ltcg, 0)),
            trend: overview.totals.ltcg,
          },
          {
            label: 'Intraday',
            value: mask(formatSignedINR(overview.totals.intraday, 0)),
            trend: overview.totals.intraday,
          },
          {
            label: 'Buy turnover',
            value: mask(formatINR(overview.totals.boughtValue, 0)),
            sub: 'recorded buys, not deposits',
          },
        ]}
      />

      {overview.reconciliation.length > 0 || overview.totals.unmatchedSells > 0 ? (
        <Banner
          className="mt-3"
          tone="warning"
          title="Your history looks incomplete"
          message={[
            overview.totals.unmatchedSells > 0
              ? `${formatQuantity(overview.totals.unmatchedSells)} shares sold with no recorded buy — import the report covering the buy. Left out of realised P&L.`
              : null,
            ...overview.reconciliation
              .slice(0, 5)
              .map(
                (row) =>
                  `${row.sym}: the statement leaves ${formatQuantity(row.replayQty)} open, ${label} shows ${formatQuantity(row.liveQty)}.`,
              ),
          ]
            .filter(Boolean)
            .join(' ')}
        />
      ) : null}

      {overview.latestReport ? <ReportTotals report={overview.latestReport} /> : null}

      <MoneyCharts overview={overview} />

      {outcomes && outcomes.lots > 0 ? (
        <Section title="Closed trades" note="FIFO lots, before charges">
          <KpiGrid
            items={[
              {
                label: 'Win rate',
                value: outcomes.winRatePct === null ? '—' : formatPercent(outcomes.winRatePct, 0),
                sub: `${outcomes.wins} won · ${outcomes.losses} lost`,
              },
              {
                label: 'Profit factor',
                value: outcomes.profitFactor === null ? '—' : formatNumber(outcomes.profitFactor),
                sub: outcomes.profitFactor === null ? 'no losing lot yet' : '₹ won per ₹1 lost',
              },
              {
                label: 'Average win',
                value: mask(formatSignedINR(outcomes.avgWin, 0)),
                trend: outcomes.avgWin,
              },
              {
                label: 'Average loss',
                value: mask(formatSignedINR(outcomes.avgLoss, 0)),
                trend: outcomes.avgLoss,
              },
            ]}
          />
        </Section>
      ) : null}

      {overview.years.length > 0 ? (
        <Section title="By financial year" note="April – March">
          <ListCard>
            {overview.years.map((year, index) => (
              <View key={year.fy}>
                {index > 0 ? <RowDivider /> : null}
                <View className="flex-row items-center gap-3 px-3.5 py-3">
                  <View className="flex-1">
                    <Text className="text-sm font-semibold text-ink dark:text-ink-dark">
                      {year.fy}
                    </Text>
                    <Text
                      className="mt-0.5 text-xs text-ink-muted dark:text-ink-dark-muted"
                      style={NUMBERS}
                      numberOfLines={1}
                    >
                      ST {mask(formatSignedINR(year.stcg, 0))} · LT{' '}
                      {mask(formatSignedINR(year.ltcg, 0))} · ID{' '}
                      {mask(formatSignedINR(year.intraday, 0))}
                    </Text>
                  </View>
                  <View className="items-end">
                    <ChangeText value={year.net} className="text-sm" style={NUMBERS}>
                      {mask(formatSignedINR(year.net, 0))}
                    </ChangeText>
                    <Text className="mt-0.5 text-[11px] text-ink-faint dark:text-ink-dark-faint">
                      {plural(year.trades, 'trade')}
                    </Text>
                  </View>
                </View>
              </View>
            ))}
          </ListCard>
        </Section>
      ) : null}

      <Section title="Every stock you've traded" note="tap to filter">
        <ListCard>
          {stocks.map((stock, index) => (
            <View key={stock.sym}>
              {index > 0 ? <RowDivider /> : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${stock.sym}, show its trades`}
                onPress={() => setSym(stock.sym)}
                className="flex-row items-center gap-3 px-3.5 py-3 active:bg-surface-sunk dark:active:bg-surface-sunk-dark"
              >
                <View className="min-w-0 flex-1">
                  <Text className="text-sm font-semibold text-ink dark:text-ink-dark">
                    {stock.sym}
                  </Text>
                  <Text
                    className="mt-0.5 text-xs text-ink-muted dark:text-ink-dark-muted"
                    numberOfLines={1}
                  >
                    {plural(stock.trades, 'trade')}
                    {stock.openQty > 0 ? ` · ${formatQuantity(stock.openQty)} open` : ''}
                    {stock.unmatchedQty > 0
                      ? ` · ${formatQuantity(stock.unmatchedQty)} sold w/o buy`
                      : ''}
                  </Text>
                </View>
                <ChangeText
                  value={stock.realised - stock.charges}
                  className="text-sm"
                  style={NUMBERS}
                >
                  {mask(formatSignedINR(stock.realised - stock.charges, 0))}
                </ChangeText>
              </Pressable>
            </View>
          ))}
        </ListCard>
        {overview.stocks.length > STOCK_LIMIT ? (
          <Text
            accessibilityRole="button"
            onPress={() => setAllStocks((value) => !value)}
            className="mt-3 text-center text-[13px] font-semibold text-brand-text dark:text-brand-text-dark"
          >
            {allStocks ? 'Show fewer' : `Show all ${overview.stocks.length}`}
          </Text>
        ) : null}
      </Section>

      <Statement key={sym ?? 'all'} broker={broker} sym={sym} onClear={() => setSym(null)} />

      <Note>
        {syncLine} FIFO. For tax filing, use {label}'s own tax P&L report.
      </Note>
    </View>
  );
}
