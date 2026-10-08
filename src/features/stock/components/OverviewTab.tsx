import { useRouter } from 'expo-router';
import Check from 'lucide-react-native/icons/check';
import React, { useMemo } from 'react';
import { Text, View } from 'react-native';

import { trendTextClass, trendOf } from '@/components/market/ChangeText';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { KeyValueRow } from '@/components/ui/KeyValueRow';
import { Section } from '@/components/ui/Section';
import { Skeleton } from '@/components/ui/Skeleton';
import { StatGrid } from '@/components/ui/StatGrid';
import { AboutCard } from '@/features/company/components/AboutCard';
import { FinancialsCard } from '@/features/company/components/FinancialsCard';
import { PeersCard } from '@/features/company/components/PeersCard';
import { RatiosCard } from '@/features/company/components/RatiosCard';
import { ShareholdingCard } from '@/features/company/components/ShareholdingCard';
import { useCompanyProfile } from '@/features/company/hooks';
import { priceReturns } from '@/features/company/lib/insights';
import { FundamentalRatingCard } from '@/features/fundamentals/components/FundamentalRatingCard';
import { formatMarketCapCrore } from '@/features/home/lib/capBands';
import { formatSessionDay } from '@/features/home/lib/istTime';
import type { Recommendation } from '@/features/insights/types';
import { useCandles } from '@/features/market/hooks';
import type { StockDetail } from '@/features/market/types';
import { NewsSignalStrip } from '@/features/stock-news/components/NewsSignals';
import { useNow } from '@/hooks/useNow';
import { cn } from '@/lib/utils/cn';
import { formatINR, formatNumber, formatSignedPercent } from '@/lib/utils/formatters';
import { useTheme } from '@/theme/ThemeProvider';

import type { CircuitView } from '../lib/circuit';
import { rangePosition, type StockPriceView } from '../lib/priceView';

import { PriceAlertCard } from './PriceAlertCard';

const numbers = { fontVariant: ['tabular-nums' as const] };

/**
 * Price return over 1W…1Y — the latest price against the close that many days ago, from the
 * same daily bars as the Technicals tab (one cached request). A window the bars don't reach is a
 * dash, never a zero.
 */
function Returns({ detail, ltp }: { detail: StockDetail; ltp: number | null }) {
  const daily = useCandles(detail.symbol, detail.exchange, '1Y');
  const now = useNow();
  const returns = useMemo(
    () => priceReturns(daily.data ?? [], ltp, Math.floor(now / 1000)),
    [daily.data, ltp, now],
  );
  if (!daily.data?.length) return null;
  return (
    <View className="mt-3 flex-row overflow-hidden rounded-card border border-line bg-surface dark:border-line-dark dark:bg-surface-dark">
      {returns.map((r, index) => {
        const pct = r.pct == null ? null : r.pct * 100;
        return (
          <View
            key={r.key}
            accessible
            accessibilityLabel={`${r.key} return: ${formatSignedPercent(pct)}`}
            className={cn(
              'flex-1 items-center py-2.5',
              index > 0 && 'border-l border-line dark:border-line-dark',
            )}
          >
            <Text className="text-[11px] text-ink-muted dark:text-ink-dark-muted">{r.key}</Text>
            <Text
              className={cn(
                'mt-0.5 text-[13px] font-semibold',
                pct == null
                  ? 'text-ink-faint dark:text-ink-dark-faint'
                  : trendTextClass[trendOf(pct)],
              )}
              style={numbers}
            >
              {formatSignedPercent(pct, 1)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

/** A value on its low-high range, with a marker where it sits. */
function RangeBar({
  low,
  high,
  value,
  lowLabel,
  highLabel,
  loading = false,
}: {
  low: number | null;
  high: number | null;
  value: number | null;
  lowLabel: string;
  highLabel: string;
  loading?: boolean;
}) {
  const position = rangePosition(low, high, value);
  const figure = (amount: number | null) =>
    loading ? (
      <Skeleton width={72} height={14} className="mt-1" />
    ) : (
      <Text
        className="mt-0.5 text-[13px] font-semibold text-ink dark:text-ink-dark"
        style={numbers}
      >
        {formatINR(amount)}
      </Text>
    );
  return (
    <View
      accessible
      accessibilityLabel={`${lowLabel} ${formatINR(low)}, ${highLabel} ${formatINR(high)}${
        position !== null ? `, price at ${Math.round(position)}% of the range` : ''
      }`}
    >
      <View className="flex-row justify-between">
        <View>
          <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">{lowLabel}</Text>
          {figure(low)}
        </View>
        <View className="items-end">
          <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">{highLabel}</Text>
          {figure(high)}
        </View>
      </View>
      <View className="mt-2 h-1.5 justify-center rounded-full bg-line dark:bg-line-dark">
        {position !== null ? (
          <View
            className="absolute h-3.5 w-1.5 rounded-full bg-ink dark:bg-ink-dark"
            style={{ left: `${position}%`, marginLeft: -3 }}
          />
        ) : null}
      </View>
    </View>
  );
}

/** The circuit band as the stock page has it: the view, and the state of its request. */
export interface CircuitBandState {
  view: CircuitView;
  /** First load, nothing from a tick yet. */
  loading: boolean;
  /** No band to show at all (an index, or a server without the route). */
  hidden: boolean;
  /** Why there are no limits, when there are none. */
  reason: string | null;
}

/**
 * The session's price band (Groww places it with the day's range): lower and upper circuit with
 * the price's marker between them, and under each how far it is from the price. At a limit the
 * note says so in words — the colour only draws the eye; near one, the note is set in ink.
 */
function CircuitBand({ circuit, ltp }: { circuit: CircuitBandState; ltp: number | null }) {
  const { view } = circuit;
  const noteClass = (side: 'upper' | 'lower') =>
    view.at === side
      ? cn('font-semibold', side === 'upper' ? trendTextClass.up : trendTextClass.down)
      : view.near === side
        ? 'font-medium text-ink dark:text-ink-dark'
        : 'text-ink-faint dark:text-ink-dark-faint';
  return (
    <View>
      <RangeBar
        low={view.lower}
        high={view.upper}
        value={view.upperNote ? ltp : null}
        lowLabel="Lower circuit"
        highLabel="Upper circuit"
        loading={circuit.loading}
      />
      {view.lowerNote && view.upperNote ? (
        <View className="mt-1.5 flex-row justify-between gap-3">
          <Text className={cn('shrink text-[11px]', noteClass('lower'))} style={numbers}>
            {view.lowerNote}
          </Text>
          <Text className={cn('shrink text-right text-[11px]', noteClass('upper'))} style={numbers}>
            {view.upperNote}
          </Text>
        </View>
      ) : !circuit.loading && view.lower == null && circuit.reason ? (
        <Text className="mt-1.5 text-[11px] text-ink-faint dark:text-ink-dark-faint">
          {circuit.reason}
        </Text>
      ) : null}
    </View>
  );
}

/** The engine's view on this exact listing today, or a plain "no view" -- never an invented one. */
function OurView({
  symbol,
  pick,
  batchDate,
  loading,
  onReadCase,
}: {
  symbol: string;
  pick: Recommendation | undefined;
  batchDate: string | undefined;
  loading: boolean;
  onReadCase: () => void;
}) {
  const router = useRouter();
  const { colors } = useTheme();

  if (!pick) {
    return (
      <Section title="Our view">
        <View className="rounded-card border border-line bg-surface p-4 dark:border-line-dark dark:bg-surface-dark">
          <Text className="text-sm font-semibold text-ink dark:text-ink-dark">
            {loading ? "Checking today's picks\u2026" : `No view on ${symbol} today`}
          </Text>
          {!loading ? (
            <Text className="mt-1.5 text-[13px] leading-[19px] text-ink-muted dark:text-ink-dark-muted">
              It isn't in {batchDate ? `the ${formatSessionDay(batchDate)}` : "today's"} batch. The
              engine publishes a few picks a day and says nothing about everything else — no view
              isn't a negative one.
            </Text>
          ) : null}
          <Button
            className="mt-3"
            label="See today's picks"
            variant="outline"
            size="sm"
            onPress={() => router.push('/intel')}
          />
        </View>
      </Section>
    );
  }

  const entry =
    pick.lo !== null && pick.hi !== null
      ? `${formatINR(pick.lo)} \u2013 ${formatINR(pick.hi)}`
      : formatINR(pick.lo ?? pick.hi);

  return (
    <Section title="Our view" note={batchDate ? `${formatSessionDay(batchDate)} batch` : undefined}>
      <View className="rounded-card border border-primary-200 bg-primary-50 p-4 dark:border-line-dark dark:bg-brand-wash-dark">
        <View className="flex-row flex-wrap items-center gap-2">
          <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">Model confidence</Text>
          <Text className="text-[15px] font-bold text-ink dark:text-ink-dark" style={numbers}>
            {formatNumber(pick.conf, 0)}
          </Text>
          <Badge
            label={`${pick.risk} risk`}
            variant={pick.risk === 'High' ? 'danger' : pick.risk === 'Low' ? 'success' : 'neutral'}
          />
        </View>
        <View className="mt-3 gap-0.5">
          <KeyValueRow label="Entry band" value={entry} className="py-1.5" />
          <KeyValueRow label="Target" value={formatINR(pick.target)} trend={1} className="py-1.5" />
          <KeyValueRow
            label="Stop loss"
            value={formatINR(pick.stop)}
            trend={-1}
            className="py-1.5"
          />
          {pick.exp !== null ? (
            <KeyValueRow
              label="Expected move"
              value={`${formatSignedPercent(pick.exp, 1)}${pick.hold ? ` over ${pick.hold}` : ''}`}
              className="py-1.5"
            />
          ) : null}
        </View>
        {pick.why.length > 0 ? (
          <View className="mt-3 gap-2">
            {pick.why.map((reason, index) => (
              // Two reasons can share a heading; the position is the stable identity.
              <View key={index} className="flex-row gap-2">
                <Check size={15} color={colors.link} style={{ marginTop: 2 }} />
                <Text className="flex-1 text-[13px] leading-[19px] text-ink dark:text-ink-dark">
                  {reason.head}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
        <Button
          className="mt-4"
          label="Read the full case"
          variant="secondary"
          size="sm"
          onPress={onReadCase}
        />
        <Text className="mt-2 text-[11px] text-ink-faint dark:text-ink-dark-faint">
          Confidence is the model's own score, never measured against outcomes. Not investment
          advice.
        </Text>
      </View>
    </Section>
  );
}

interface OverviewTabProps {
  detail: StockDetail;
  view: StockPriceView;
  /** The session's circuit limits — loaded beside the page, never blocking it. */
  circuit: CircuitBandState;
  marketOpen: boolean;
  pick: Recommendation | undefined;
  batchDate: string | undefined;
  picksLoading: boolean;
  onReadCase: () => void;
  /** Switches to the Fundamentals tab. */
  onOpenFundamentals: () => void;
  /** Switches to the News tab. */
  onOpenNews: () => void;
}

/**
 * Groww's stock overview: the scored rating and the news readings, performance and returns, the
 * company's ratios and financials, today's view, shareholding, the business and its peers, then
 * price alerts. The company cards share one profile request.
 */
export function OverviewTab({
  detail,
  view,
  circuit,
  marketOpen,
  pick,
  batchDate,
  picksLoading,
  onReadCase,
  onOpenFundamentals,
  onOpenNews,
}: OverviewTabProps) {
  const exchange = detail.exchange === 'BSE' ? 'BSE' : 'NSE';
  const company = useCompanyProfile(exchange, detail.symbol);
  const displaySymbol =
    detail.listings?.find((listing) => listing.exchange === detail.exchange)?.displaySymbol ??
    detail.symbol;
  const volume =
    view.volume !== null
      ? `${formatNumber(view.volume, 0)}${view.volumeSession ? ` (${formatSessionDay(view.volumeSession)})` : ''}`
      : '\u2014';
  // Volume x the latest price: an ESTIMATE (each trade has its own price), labelled as one.
  const tradedValue =
    view.volume !== null && view.ltp !== null ? (view.volume * view.ltp) / 1e7 : null;

  return (
    <View>
      <FundamentalRatingCard
        symbol={detail.symbol}
        exchange={exchange}
        onOpen={onOpenFundamentals}
      />
      <NewsSignalStrip exchange={exchange} symbol={detail.symbol} onOpen={onOpenNews} />
      {/* ── Price performance ── */}
      <Section title="Performance" note={marketOpen ? undefined : 'Last session'} className="mt-6">
        <View className="gap-5 rounded-card border border-line bg-surface p-4 dark:border-line-dark dark:bg-surface-dark">
          <RangeBar
            low={view.low}
            high={view.high}
            value={view.ltp}
            lowLabel="Today's low"
            highLabel="Today's high"
          />
          <RangeBar
            low={view.yearLow}
            high={view.yearHigh}
            value={view.ltp}
            lowLabel="52-week low"
            highLabel="52-week high"
          />
          {circuit.hidden ? null : <CircuitBand circuit={circuit} ltp={view.ltp} />}
        </View>
        <Returns detail={detail} ltp={view.ltp} />
        <View className="mt-3">
          <StatGrid
            stats={[
              { label: 'Open', value: formatINR(view.open) },
              { label: 'Previous close', value: formatINR(view.prevClose) },
              { label: 'Volume', value: volume },
              {
                label: 'Traded value (est.)',
                value: tradedValue !== null ? `\u20b9${formatNumber(tradedValue, 2)} Cr` : '\u2014',
              },
              { label: 'Market cap', value: formatMarketCapCrore(detail.marketCap) },
              {
                label:
                  detail.lotSize !== null && detail.lotSize > 1
                    ? 'Tick \u00b7 lot size'
                    : 'Tick size',
                value:
                  detail.lotSize !== null && detail.lotSize > 1
                    ? `${formatINR(detail.tickSize)} \u00b7 ${formatNumber(detail.lotSize, 0)}`
                    : formatINR(detail.tickSize),
              },
            ]}
          />
        </View>
        {!circuit.hidden && circuit.view.band ? (
          <Text className="mt-2 text-[11px] text-ink-faint dark:text-ink-dark-faint">
            Price band {circuit.view.band} of the previous close, set by the exchange. No trade
            prints outside it.
          </Text>
        ) : null}
        {detail.yearlyRangeSource === 'catalog' ? (
          <Text className="mt-2 text-[11px] text-ink-faint dark:text-ink-dark-faint">
            The 52-week range is from the stock catalogue — too little daily history is stored to
            measure it.
          </Text>
        ) : null}
      </Section>

      <RatiosCard query={company} price={view.ltp} yearHigh={view.yearHigh} />
      <FinancialsCard query={company} />

      <OurView
        symbol={displaySymbol}
        pick={pick}
        batchDate={batchDate}
        loading={picksLoading}
        onReadCase={onReadCase}
      />

      <ShareholdingCard query={company} />
      <AboutCard detail={detail} query={company} />
      <PeersCard
        query={company}
        symbol={detail.symbol}
        exchange={exchange}
        companyName={detail.companyName ?? null}
      />

      <PriceAlertCard exchange={detail.exchange} symbol={detail.symbol} ltp={view.ltp} />
    </View>
  );
}
