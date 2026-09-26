import { useRouter } from 'expo-router';
import Check from 'lucide-react-native/icons/check';
import React from 'react';
import { Text, View } from 'react-native';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { KeyValueRow } from '@/components/ui/KeyValueRow';
import { Section } from '@/components/ui/Section';
import { StatGrid } from '@/components/ui/StatGrid';
import { formatMarketCapCrore } from '@/features/home/lib/capBands';
import { formatSessionDay } from '@/features/home/lib/istTime';
import type { Recommendation } from '@/features/insights/types';
import type { StockDetail } from '@/features/market/types';
import { formatINR, formatNumber, formatSignedPercent } from '@/lib/utils/formatters';
import { useTheme } from '@/theme/ThemeProvider';

import { rangePosition, type StockPriceView } from '../lib/priceView';

import { PriceAlertCard } from './PriceAlertCard';

const numbers = { fontVariant: ['tabular-nums' as const] };

/** A right-aligned value that wraps instead of pushing its label off a narrow screen. */
function LongValue({ children }: { children: string }) {
  return (
    <Text
      className="max-w-[62%] text-right text-[13px] font-semibold text-ink dark:text-ink-dark"
      numberOfLines={2}
    >
      {children}
    </Text>
  );
}

/** A value on its low–high range, with a marker where it sits. */
function RangeBar({
  low,
  high,
  value,
  lowLabel,
  highLabel,
}: {
  low: number | null;
  high: number | null;
  value: number | null;
  lowLabel: string;
  highLabel: string;
}) {
  const position = rangePosition(low, high, value);
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
          <Text
            className="mt-0.5 text-[13px] font-semibold text-ink dark:text-ink-dark"
            style={numbers}
          >
            {formatINR(low)}
          </Text>
        </View>
        <View className="items-end">
          <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">{highLabel}</Text>
          <Text
            className="mt-0.5 text-[13px] font-semibold text-ink dark:text-ink-dark"
            style={numbers}
          >
            {formatINR(high)}
          </Text>
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

/** The engine's view on this exact listing today, or a plain "no view" — never an invented one. */
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
            {loading ? 'Checking today’s picks…' : `No view on ${symbol} today`}
          </Text>
          {!loading ? (
            <Text className="mt-1.5 text-[13px] leading-[19px] text-ink-muted dark:text-ink-dark-muted">
              It isn’t in {batchDate ? `the ${formatSessionDay(batchDate)}` : 'today’s'} batch. The
              engine publishes a few picks a day and says nothing about everything else — no view
              isn’t a negative one.
            </Text>
          ) : null}
          <Button
            className="mt-3"
            label="See today’s picks"
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
      ? `${formatINR(pick.lo)} – ${formatINR(pick.hi)}`
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
            {pick.why.map((reason) => (
              <View key={reason.head} className="flex-row gap-2">
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
          Confidence is the model’s own score, never measured against outcomes. Not investment
          advice.
        </Text>
      </View>
    </Section>
  );
}

interface OverviewTabProps {
  detail: StockDetail;
  view: StockPriceView;
  marketOpen: boolean;
  pick: Recommendation | undefined;
  batchDate: string | undefined;
  picksLoading: boolean;
  onReadCase: () => void;
}

/** Performance, today's view, company facts and price alerts. */
export function OverviewTab({
  detail,
  view,
  marketOpen,
  pick,
  batchDate,
  picksLoading,
  onReadCase,
}: OverviewTabProps) {
  const displaySymbol =
    detail.listings?.find((listing) => listing.exchange === detail.exchange)?.displaySymbol ??
    detail.symbol;
  const volume =
    view.volume !== null
      ? `${formatNumber(view.volume, 0)}${view.volumeSession ? ` (${formatSessionDay(view.volumeSession)})` : ''}`
      : '—';
  const listedOn = detail.listings?.length
    ? detail.listings.map((listing) => `${listing.exchange} ${listing.displaySymbol}`).join(' · ')
    : `${detail.exchange} ${displaySymbol}`;
  const memberships = detail.indices?.all ?? [];

  return (
    <View>
      <Section title="Performance" note={marketOpen ? undefined : 'Last session'} className="mt-6">
        <View className="gap-5 rounded-card border border-line bg-surface p-4 dark:border-line-dark dark:bg-surface-dark">
          <RangeBar
            low={view.low}
            high={view.high}
            value={view.ltp}
            lowLabel="Today’s low"
            highLabel="Today’s high"
          />
          <RangeBar
            low={view.yearLow}
            high={view.yearHigh}
            value={view.ltp}
            lowLabel="52-week low"
            highLabel="52-week high"
          />
        </View>
        <View className="mt-3">
          <StatGrid
            stats={[
              { label: 'Open', value: formatINR(view.open) },
              { label: 'Previous close', value: formatINR(view.prevClose) },
              { label: 'Volume', value: volume },
              { label: 'Market cap', value: formatMarketCapCrore(detail.marketCap) },
            ]}
          />
        </View>
        {detail.yearlyRangeSource === 'catalog' ? (
          <Text className="mt-2 text-[11px] text-ink-faint dark:text-ink-dark-faint">
            The 52-week range is from the stock catalogue — too little daily history is stored to
            measure it.
          </Text>
        ) : null}
      </Section>

      <OurView
        symbol={displaySymbol}
        pick={pick}
        batchDate={batchDate}
        loading={picksLoading}
        onReadCase={onReadCase}
      />

      <Section title="About">
        <View className="rounded-card border border-line bg-surface px-3.5 dark:border-line-dark dark:bg-surface-dark">
          <KeyValueRow label="Company" value={<LongValue>{detail.companyName ?? '—'}</LongValue>} />
          {detail.sector ? (
            <KeyValueRow divider label="Sector" value={<LongValue>{detail.sector}</LongValue>} />
          ) : null}
          {detail.industry ? (
            <KeyValueRow
              divider
              label="Industry"
              value={<LongValue>{detail.industry}</LongValue>}
            />
          ) : null}
          <KeyValueRow divider label="Listed on" value={<LongValue>{listedOn}</LongValue>} />
          {detail.isin ? (
            <KeyValueRow divider label="ISIN" value={<LongValue>{detail.isin}</LongValue>} />
          ) : null}
          {detail.lotSize !== null && detail.lotSize > 1 ? (
            <KeyValueRow divider label="Lot size" value={formatNumber(detail.lotSize, 0)} />
          ) : null}
          {memberships.length > 0 ? (
            <View className="border-t border-line py-3 dark:border-line-dark">
              <Text className="text-[13px] text-ink-muted dark:text-ink-dark-muted">
                Index memberships
              </Text>
              <View className="mt-2 flex-row flex-wrap gap-1.5">
                {memberships.slice(0, 12).map((tag) => (
                  <Badge key={tag.key} label={tag.shortLabel} />
                ))}
              </View>
            </View>
          ) : null}
        </View>
        <Text className="mt-2 text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint">
          Valuation and profitability ratios (P/E, EPS, ROE, book value, dividend yield) aren’t
          available from this platform’s data sources, so they’re left out rather than estimated.
        </Text>
      </Section>

      <PriceAlertCard exchange={detail.exchange} symbol={detail.symbol} ltp={view.ltp} />
    </View>
  );
}
