import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { InlineEmpty } from '@/components/common/InlineError';
import { Panel } from '@/components/dashboard/Panel';
import { Grid } from '@/components/layout/Grid';
import { useScreenLayout } from '@/components/layout/responsive';
import { ChangeText, trendOf, trendTextClass } from '@/components/market/ChangeText';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { RowDivider } from '@/components/ui/Section';
import { barDate } from '@/features/insights/lib/dates';
import { StatusDot } from '@/features/settings/components/StatusPill';
import { cn } from '@/lib/utils/cn';
import { formatNumber, formatPercent, formatSignedPercent } from '@/lib/utils/formatters';

import {
  avoidList,
  barWidth,
  compareRows,
  exitLabel,
  funnelSteps,
  lineOf,
  minutes,
  shortDay,
  signedPoints,
  signedRupees,
  VERDICT_VIEW,
  type CompareKind,
} from '../../lib/intradayView';
import { formatProfitFactor } from '../../lib/ranking';
import type {
  IntradayBucket,
  IntradayStockRow,
  IntradayStrategyDetail,
  VariantKey,
} from '../../types';
import { EquityCurveCard } from '../EquityCurveCard';
import { FactGrid, Note, BulletList } from '../house/HouseBits';
import { BarRow } from './IntradayBits';

const NUM = { fontVariant: ['tabular-nums' as const] };
const VERDICT_TONE = { good: 'success', warn: 'warning', bad: 'error', unknown: 'info' } as const;

function fmt(kind: CompareKind, v: number | null): string {
  switch (kind) {
    case 'int':
      return formatNumber(v, 0);
    case 'pct':
      return formatPercent(v, 1);
    case 'signed':
      return formatSignedPercent(v, 3);
    case 'ratio':
      return v == null ? 'n/a' : formatNumber(v, 2);
    case 'rupees':
      return signedRupees(v);
  }
}

/**
 * The intraday strategy's overview: equity and the two variants side by side, which stocks it
 * works on and which to avoid, when and how its trades end, the signal funnel and what each
 * improvement is worth, the earlier-vs-recent check, and how it was tested.
 */
export function IntradayOverview({
  detail,
  variant,
  onStocks,
  onStock,
}: {
  detail: IntradayStrategyDetail;
  variant: VariantKey;
  onStocks: () => void;
  onStock: (symbol: string) => void;
}) {
  const layout = useScreenLayout();
  const v = detail.variants[variant]!;
  const run = v.run;
  const a = v.analytics;
  const base = lineOf(detail.variants.base);
  const improved = lineOf(detail.variants.improved);
  const works = v.stocks.filter((r) => r.verdict === 'works').slice(0, 8);
  const avoidCount = v.stocks.filter((r) => r.verdict === 'avoid').length;
  const avoid = avoidList(v.stocks);
  const steps = funnelSteps(v.funnel);
  const funnelMax = Math.max(1, steps[0]?.remaining ?? 1);
  const ablationAll = detail.ablations.map((x) => x.addsAvgReturnPct);
  const hourAll = a.byHour.map((b) => b.avgReturnPct);
  const dayAll = a.byWeekday.map((b) => b.avgReturnPct);
  const analysis = run.analysis;
  const cols2 = Math.min(layout.columns, 2);
  const cols3 = layout.columns;

  return (
    <View className="gap-4">
      <Grid columns={cols2} equalHeight={false}>
        <View>
          <Heading title="Equity" meta={`${run.maxOpenPositions}-slot portfolio, indexed to 100`} />
          {run.equityCurve.length > 1 ? (
            <EquityCurveCard points={run.equityCurve} />
          ) : (
            <InlineEmpty title="Nothing to chart" message="No closed trades yet." />
          )}
        </View>
        <Panel title="Your rules vs improved" flush>
          {base && improved ? (
            <View className="pb-2">
              <View className="flex-row items-center gap-2 px-4 pb-1.5">
                <View className="flex-1" />
                <ColumnHead label="Your rules" current={variant === 'base'} />
                <ColumnHead label="Improved" current={variant === 'improved'} />
              </View>
              {compareRows(base, improved).map((r, index) => (
                <View key={r.key}>
                  {index > 0 ? <RowDivider /> : null}
                  <View
                    accessible
                    accessibilityLabel={`${r.label}: your rules ${fmt(r.kind, r.base)}, improved ${fmt(r.kind, r.improved)}${r.better ? `, ${r.better === 'improved' ? 'improved' : 'your rules'} better` : ''}`}
                    className="flex-row items-center gap-2 px-4 py-2.5"
                  >
                    <Text className="flex-1 text-[13px] text-ink-muted dark:text-ink-dark-muted">
                      {r.label}
                    </Text>
                    <CompareCell
                      text={fmt(r.kind, r.base)}
                      value={r.base}
                      signed={r.kind === 'signed' || r.kind === 'rupees'}
                      better={r.better === 'base'}
                    />
                    <CompareCell
                      text={fmt(r.kind, r.improved)}
                      value={r.improved}
                      signed={r.kind === 'signed' || r.kind === 'rupees'}
                      better={r.better === 'improved'}
                    />
                  </View>
                </View>
              ))}
              <Note className="px-4 pt-1.5">Bold: the better of the two.</Note>
            </View>
          ) : (
            <Text className="px-4 pb-4 text-[13px] text-ink-muted dark:text-ink-dark-muted">
              Both variants appear after the next run.
            </Text>
          )}
        </Panel>
      </Grid>

      <Grid columns={cols3} equalHeight={false}>
        <Panel
          title="Works on"
          meta={`${formatNumber(v.line.stocksWorking, 0)} of ${formatNumber(v.stocks.length, 0)} stocks`}
          right={<Button label="All stocks" size="sm" variant="ghost" onPress={onStocks} />}
          flush
        >
          <StockList rows={works} empty="No stock clears the bar yet." onStock={onStock} />
        </Panel>
        <Panel title="Avoid" meta={`${formatNumber(avoidCount, 0)} lose after costs`} flush>
          <StockList rows={avoid} empty="No stock loses after costs." onStock={onStock} />
        </Panel>
        <Panel title="Costs & behaviour">
          <FactGrid
            columns={layout.columns > 1 ? 2 : 3}
            facts={[
              {
                label: 'Charges + slip',
                value: signedRupees(-(a.costs.charges + a.costs.slippage)),
                negative: true,
              },
              { label: 'Costs a trade', value: `₹${formatNumber(a.costs.perTrade, 2)}` },
              {
                label: 'Of gross wins',
                value:
                  a.costs.shareOfGrossPct == null ? '—' : formatPercent(a.costs.shareOfGrossPct, 1),
              },
              { label: 'Held, winners', value: minutes(a.hold.winnersMinutes) },
              { label: 'Held, losers', value: minutes(a.hold.losersMinutes) },
              {
                label: 'Positive days',
                value:
                  a.days.positivePct == null
                    ? '—'
                    : `${formatPercent(a.days.positivePct, 0)} of ${formatNumber(a.days.traded, 0)}`,
              },
              {
                label: 'Best move open',
                value: formatSignedPercent(a.excursion.avgMfePct, 2),
                trend: a.excursion.avgMfePct,
              },
              {
                label: 'Worst move open',
                value: formatSignedPercent(a.excursion.avgMaePct, 2),
                trend: a.excursion.avgMaePct,
              },
              {
                label: a.days.best ? `Best day · ${shortDay(a.days.best.day)}` : 'Best day',
                value: a.days.best ? signedRupees(a.days.best.netPnl) : '—',
                trend: a.days.best?.netPnl ?? null,
              },
              {
                label: a.days.worst ? `Worst day · ${shortDay(a.days.worst.day)}` : 'Worst day',
                value: a.days.worst ? signedRupees(a.days.worst.netPnl) : '—',
                trend: a.days.worst?.netPnl ?? null,
              },
            ]}
          />
          <Note className="mt-2">Best / worst move: the average while a trade was open.</Note>
        </Panel>
      </Grid>

      <Grid columns={cols3} equalHeight={false}>
        <Panel title="By entry hour" meta="average net a trade">
          <ReturnBars
            rows={a.byHour}
            all={hourAll}
            label={(b) => b.label.split('–')[0] ?? b.label}
          />
        </Panel>
        <Panel title="How trades ended" meta="share · average net">
          <View className="gap-3">
            {a.byExit.length === 0 ? <Note>No trades.</Note> : null}
            {a.byExit.map((r) => (
              <View key={r.key}>
                <View className="mb-1 flex-row items-baseline gap-2">
                  <Text
                    className="flex-1 text-xs text-ink-muted dark:text-ink-dark-muted"
                    numberOfLines={1}
                  >
                    {exitLabel(r.key)}
                  </Text>
                  <Text className="text-xs font-semibold text-ink dark:text-ink-dark" style={NUM}>
                    {formatPercent(r.sharePct, 0)}
                  </Text>
                  <ChangeText
                    value={r.avgReturnPct}
                    className="w-14 text-right text-xs"
                    style={NUM}
                  >
                    {formatSignedPercent(r.avgReturnPct, 2)}
                  </ChangeText>
                </View>
                <View
                  accessible
                  accessibilityLabel={`${exitLabel(r.key)}: ${formatPercent(r.sharePct, 0)} of ${formatNumber(r.trades, 0)} trades, ${formatSignedPercent(r.avgReturnPct, 2)} average`}
                  className="h-1.5 overflow-hidden rounded-full bg-line dark:bg-line-dark"
                >
                  <View
                    className={cn(
                      'h-full rounded-full',
                      (r.avgReturnPct ?? 0) < 0
                        ? 'bg-danger-500 dark:bg-danger-dark'
                        : 'bg-brand-strong dark:bg-brand-strong-dark',
                    )}
                    style={{ width: `${Math.max(0, Math.min(100, r.sharePct))}%` }}
                  />
                </View>
              </View>
            ))}
          </View>
        </Panel>
        <Panel title="By weekday" meta="average net a trade">
          <ReturnBars rows={a.byWeekday} all={dayAll} label={(b) => b.label} />
        </Panel>
      </Grid>

      <Grid columns={cols2} equalHeight={false}>
        <Panel
          title="Signal funnel"
          meta={variant === 'base' ? 'your rules take every green cross' : undefined}
        >
          <View className="gap-2.5">
            {steps.map((s) => (
              <View
                key={s.key}
                accessible
                accessibilityLabel={`${s.label}: ${s.remaining}${s.dropped ? `, ${s.dropped} dropped` : ''}`}
              >
                <View className="mb-1 flex-row items-baseline gap-2">
                  <Text
                    className={cn(
                      'flex-1 text-xs',
                      s.key === 'taken'
                        ? 'font-semibold text-ink dark:text-ink-dark'
                        : 'text-ink-muted dark:text-ink-dark-muted',
                    )}
                    numberOfLines={1}
                  >
                    {s.label}
                  </Text>
                  {s.dropped > 0 ? (
                    <Text
                      className="text-[11px] text-ink-faint dark:text-ink-dark-faint"
                      style={NUM}
                    >
                      −{formatNumber(s.dropped, 0)}
                    </Text>
                  ) : null}
                  <Text
                    className="w-14 text-right text-xs font-semibold text-ink dark:text-ink-dark"
                    style={NUM}
                  >
                    {formatNumber(s.remaining, 0)}
                  </Text>
                </View>
                <View className="h-1.5 overflow-hidden rounded-full bg-line dark:bg-line-dark">
                  <View
                    className="h-full rounded-full bg-brand-strong dark:bg-brand-strong-dark"
                    style={{ width: `${Math.max(0, (s.remaining / funnelMax) * 100)}%` }}
                  />
                </View>
              </View>
            ))}
          </View>
        </Panel>
        <Panel title="What each improvement adds" meta="vs improved without it" flush>
          {detail.ablations.length === 0 ? (
            <Text className="px-4 pb-4 text-[13px] text-ink-muted dark:text-ink-dark-muted">
              Appears after the next run.
            </Text>
          ) : (
            <View className="pb-2">
              {detail.ablations.map((x, index) => (
                <View key={x.key}>
                  {index > 0 ? <RowDivider /> : null}
                  <View
                    accessible
                    accessibilityLabel={`${x.label}: ${formatSignedPercent(x.addsAvgReturnPct, 3)} a trade, ${signedPoints(x.addsWinRate)} win rate, ${x.addsTrades} trades`}
                    className="px-4 py-2.5"
                  >
                    <View className="flex-row items-baseline gap-2">
                      <Text
                        className="flex-1 text-[13px] font-semibold text-ink dark:text-ink-dark"
                        numberOfLines={2}
                      >
                        {x.label}
                      </Text>
                      <ChangeText value={x.addsAvgReturnPct} className="text-[13px]" style={NUM}>
                        {formatSignedPercent(x.addsAvgReturnPct, 3)}
                      </ChangeText>
                    </View>
                    <View className="mt-1.5 flex-row items-center gap-2.5">
                      <View className="h-1 flex-1 overflow-hidden rounded-full bg-line dark:bg-line-dark">
                        <View
                          className={cn(
                            'h-full rounded-full',
                            (x.addsAvgReturnPct ?? 0) < 0
                              ? 'bg-danger-500 dark:bg-danger-dark'
                              : 'bg-brand-strong dark:bg-brand-strong-dark',
                          )}
                          style={{ width: `${barWidth(x.addsAvgReturnPct, ablationAll)}%` }}
                        />
                      </View>
                      <Text
                        className={cn('text-[11px]', trendTextClass[trendOf(x.addsWinRate)])}
                        style={NUM}
                      >
                        {`${signedPoints(x.addsWinRate)} win`}
                      </Text>
                      <Text
                        className="text-[11px] text-ink-faint dark:text-ink-dark-faint"
                        style={NUM}
                      >
                        {`${x.addsTrades > 0 ? '+' : ''}${formatNumber(x.addsTrades, 0)} trades`}
                      </Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          )}
        </Panel>
      </Grid>

      {analysis?.verdict ? (
        <Banner
          tone={VERDICT_TONE[analysis.verdict.tone] ?? 'info'}
          title="Out-of-sample check"
          message={analysis.verdict.text}
        />
      ) : null}

      {analysis && (analysis.splits?.length || analysis.drawdown) ? (
        <Grid columns={cols2} equalHeight={false}>
          {analysis.splits?.length ? (
            <Panel title="Earlier vs recent" meta="first 70% of trades · last 30%" flush>
              <View className="pb-2">
                <View className="flex-row items-center gap-2 px-4 pb-1.5">
                  <View className="flex-1" />
                  {['Trades', 'Win rate', 'Per trade'].map((head) => (
                    <Text
                      key={head}
                      className="w-[72px] text-right text-[11px] font-semibold text-ink-faint dark:text-ink-dark-faint"
                    >
                      {head}
                    </Text>
                  ))}
                </View>
                {analysis.splits.map((s, index) => {
                  const name = s.label === 'in-sample' ? 'Earlier' : 'Recent';
                  return (
                    <View key={s.label}>
                      {index > 0 ? <RowDivider /> : null}
                      <View
                        accessible
                        accessibilityLabel={`${name}: ${s.trades} trades, ${formatPercent(s.winRate, 1)} won, ${formatSignedPercent(s.expectancyPct, 3)} a trade`}
                        className="flex-row items-center gap-2 px-4 py-2.5"
                      >
                        <Text className="flex-1 text-[13px] text-ink-muted dark:text-ink-dark-muted">
                          {name}
                        </Text>
                        <Text
                          className="w-[72px] text-right text-[13px] text-ink dark:text-ink-dark"
                          style={NUM}
                        >
                          {formatNumber(s.trades, 0)}
                        </Text>
                        <Text
                          className="w-[72px] text-right text-[13px] text-ink dark:text-ink-dark"
                          style={NUM}
                        >
                          {formatPercent(s.winRate, 1)}
                        </Text>
                        <ChangeText
                          value={s.expectancyPct}
                          className="w-[72px] text-right text-[13px]"
                          style={NUM}
                        >
                          {formatSignedPercent(s.expectancyPct, 3)}
                        </ChangeText>
                      </View>
                    </View>
                  );
                })}
              </View>
            </Panel>
          ) : null}
          {analysis.drawdown ? (
            <Panel title="Worst stretch">
              <FactGrid
                columns={2}
                facts={[
                  {
                    label: 'Fall',
                    value: formatPercent(analysis.drawdown.depthPct, 1),
                    negative: true,
                  },
                  {
                    label: 'Peak to bottom',
                    value: `${formatNumber(analysis.drawdown.durationDays, 0)} days`,
                  },
                  {
                    label: 'Recovery',
                    value:
                      analysis.drawdown.recoveryDays == null
                        ? 'Not recovered'
                        : `${formatNumber(analysis.drawdown.recoveryDays, 0)} days`,
                  },
                  {
                    label: 'From',
                    value: `${barDate(analysis.drawdown.peakAt, false)} → ${barDate(analysis.drawdown.troughAt, false)}`,
                  },
                ]}
              />
            </Panel>
          ) : null}
        </Grid>
      ) : null}

      <Panel title="How it was tested">
        <BulletList
          items={[
            ...detail.caveats,
            ...(detail.data
              ? [
                  `${formatNumber(detail.data.bars, 0)} five-minute candles · ${formatNumber(detail.data.stocks, 0)} of ${formatNumber(detail.data.universe.size, 0)} stocks had history.`,
                ]
              : []),
          ]}
        />
      </Panel>
    </View>
  );
}

function Heading({ title, meta }: { title: string; meta?: string }) {
  return (
    <View className="mb-2.5 flex-row flex-wrap items-baseline gap-x-2">
      <Text
        accessibilityRole="header"
        className="text-[15px] font-semibold text-ink dark:text-ink-dark"
      >
        {title}
      </Text>
      {meta ? (
        <Text className="text-xs text-ink-faint dark:text-ink-dark-faint" style={NUM}>
          {meta}
        </Text>
      ) : null}
    </View>
  );
}

function ColumnHead({ label, current }: { label: string; current: boolean }) {
  return (
    <Text
      className={cn(
        'w-[84px] text-right text-[11px] font-semibold',
        current
          ? 'text-brand-text dark:text-brand-text-dark'
          : 'text-ink-faint dark:text-ink-dark-faint',
      )}
      accessibilityLabel={current ? `${label}, shown` : label}
    >
      {label}
    </Text>
  );
}

function CompareCell({
  text,
  value,
  signed,
  better,
}: {
  text: string;
  value: number | null;
  signed: boolean;
  better: boolean;
}) {
  return (
    <Text
      className={cn(
        'w-[84px] text-right text-[13px]',
        better ? 'font-bold' : 'font-normal',
        signed ? trendTextClass[trendOf(value)] : 'text-ink dark:text-ink-dark',
      )}
      style={NUM}
      numberOfLines={1}
      adjustsFontSizeToFit
    >
      {text}
    </Text>
  );
}

function ReturnBars({
  rows,
  all,
  label,
}: {
  rows: readonly IntradayBucket[];
  all: readonly (number | null)[];
  label: (b: IntradayBucket) => string;
}) {
  if (rows.length === 0) return <Note>No trades.</Note>;
  return (
    <View className="gap-2.5">
      {rows.map((r) => (
        <BarRow
          key={r.key}
          label={label(r)}
          pct={barWidth(r.avgReturnPct, all)}
          sign={r.avgReturnPct ?? 0}
          value={formatSignedPercent(r.avgReturnPct, 3)}
          valueTone={r.avgReturnPct}
          a11y={`${label(r)}: ${formatSignedPercent(r.avgReturnPct, 3)} a trade over ${r.trades} trades, ${formatPercent(r.winRate, 1)} won`}
        />
      ))}
    </View>
  );
}

function StockList({
  rows,
  empty,
  onStock,
}: {
  rows: readonly IntradayStockRow[];
  empty: string;
  onStock: (symbol: string) => void;
}) {
  if (rows.length === 0) {
    return (
      <Text className="px-4 pb-4 text-[13px] text-ink-muted dark:text-ink-dark-muted">{empty}</Text>
    );
  }
  return (
    <View className="pb-1.5">
      {rows.map((r, index) => (
        <View key={r.symbol}>
          {index > 0 ? <RowDivider /> : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${r.symbol}, ${VERDICT_VIEW[r.verdict].label}, ${formatSignedPercent(r.avgReturnPct, 3)} a trade over ${r.trades} trades. Open its trades`}
            onPress={() => onStock(r.symbol)}
            className="flex-row items-center gap-3 px-4 py-2.5 active:bg-surface-sunk dark:active:bg-surface-sunk-dark"
          >
            <StatusDot tone={VERDICT_VIEW[r.verdict].tone} size={7} />
            <View className="min-w-0 flex-1">
              <Text
                className="text-[13px] font-semibold text-ink dark:text-ink-dark"
                numberOfLines={1}
              >
                {r.symbol}
              </Text>
              <Text
                className="mt-0.5 text-[11px] text-ink-faint dark:text-ink-dark-faint"
                style={NUM}
              >
                {`${formatNumber(r.trades, 0)} trades · ${formatPercent(r.winRate, 0)} win · PF ${formatProfitFactor(r.profitFactor)}`}
              </Text>
            </View>
            <ChangeText value={r.avgReturnPct} className="text-[13px]" style={NUM}>
              {formatSignedPercent(r.avgReturnPct, 3)}
            </ChangeText>
          </Pressable>
        </View>
      ))}
    </View>
  );
}
