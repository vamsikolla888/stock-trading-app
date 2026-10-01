import ChartCandlestick from 'lucide-react-native/icons/chart-candlestick';
import ChevronDown from 'lucide-react-native/icons/chevron-down';
import ChevronUp from 'lucide-react-native/icons/chevron-up';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { CandlestickChart } from '@/components/market/CandlestickChart';
import { RangeSelector } from '@/components/ui/Tabs';
import type { Candle } from '@/features/market/types';
import { useNow } from '@/hooks/useNow';
import { cn } from '@/lib/utils/cn';
import { isMarketOpen } from '@/lib/utils/market';
import { useTheme } from '@/theme/ThemeProvider';
import { getErrorMessage } from '@/types/api';

import { useFnoCandles } from '../hooks';
import {
  barTimeLabel,
  CHART_INTERVALS,
  chartInterval,
  contractChipLabel,
  DEFAULT_CHART_INTERVAL,
  foldLivePrice,
  toChartCandles,
} from '../lib/candles';
import { contractTitle, expiryLabel, venueOf } from '../lib/format';
import type { ChartTarget, FnoCandleInterval, FnoContract, FnoExchange } from '../types';

import { SourceTag } from './FnoChrome';

const CHART_HEIGHT = 200;
const INTERVAL_ITEMS = CHART_INTERVALS.map(({ key, label }) => ({ key, label }));

export interface ChainChartProps {
  open: boolean;
  onToggle: () => void;
  exchange: FnoExchange;
  underlying: string;
  /** Any listed contract of the underlying — the candles API charts an underlying through one. */
  anchor: FnoContract | null;
  /** The chain or futures that supply `anchor` are still loading. */
  anchorLoading: boolean;
  /** The contract last picked from the chain or futures; null until one is. */
  picked: FnoContract | null;
  target: ChartTarget;
  onTargetChange: (target: ChartTarget) => void;
  /** Latest polled price of the charted instrument: the spot, or the picked contract's premium. */
  livePrice: number | null;
  className?: string;
}

/** "NIFTY 25,100 CE · 06 Oct" / "NIFTY FUT · 28 Oct". */
function contractName(c: FnoContract): string {
  return `${contractTitle(c)} · ${expiryLabel(c.expiry)}`;
}

/**
 * The option chain's price chart — the web workspace's UnderlyingChartPanel, folded into one
 * collapsible card so the chain stays the first thing on a phone. It charts the underlying;
 * once a contract is picked a chip switches it to that contract. Collapsed (the default) it
 * costs nothing: the body — its candles query and clock — only mounts when open. Not
 * remembered across visits on purpose: the chain scrolls its ATM strike into view on load,
 * which puts this card above the fold, and an unseen chart should not poll every minute.
 */
export function ChainChart({
  open,
  onToggle,
  exchange,
  underlying,
  picked,
  target,
  className,
  ...body
}: ChainChartProps) {
  const { colors } = useTheme();
  const showsContract = target === 'contract' && picked != null;
  const name = showsContract ? contractName(picked) : underlying;
  const Chevron = open ? ChevronUp : ChevronDown;

  return (
    <View
      className={cn(
        'rounded-card border border-line bg-surface dark:border-line-dark dark:bg-surface-dark',
        className,
      )}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`Price chart, ${name}`}
        accessibilityHint={open ? 'Hides the chart' : 'Shows the chart'}
        onPress={onToggle}
        className="min-h-[52px] flex-row items-center gap-3 px-4 py-3 active:opacity-70"
      >
        <View className="h-8 w-8 items-center justify-center rounded-lg bg-brand-wash dark:bg-brand-wash-dark">
          <ChartCandlestick size={17} color={colors.accent} />
        </View>
        <View className="min-w-0 flex-1">
          <Text className="text-[13px] font-semibold text-ink dark:text-ink-dark">Price chart</Text>
          <Text
            className="mt-0.5 text-[11px] text-ink-faint dark:text-ink-dark-faint"
            numberOfLines={1}
          >
            {name} · {venueOf(exchange)}
          </Text>
        </View>
        <Chevron size={18} color={colors.textMuted} />
      </Pressable>
      {open ? (
        <ChainChartBody
          exchange={exchange}
          underlying={underlying}
          picked={picked}
          target={showsContract ? 'contract' : 'underlying'}
          {...body}
        />
      ) : null}
    </View>
  );
}

function ChainChartBody({
  exchange,
  underlying,
  anchor,
  anchorLoading,
  picked,
  target,
  onTargetChange,
  livePrice,
}: Omit<ChainChartProps, 'open' | 'onToggle' | 'className'>) {
  const { colors } = useTheme();
  const [interval, setBarInterval] = useState<FnoCandleInterval>(DEFAULT_CHART_INTERVAL);
  const [scrub, setScrub] = useState<Candle | null>(null);
  const config = chartInterval(interval);
  const contract = target === 'contract' ? picked : anchor;
  const candles = useFnoCandles(exchange, contract, target, interval);
  const now = useNow(15_000);
  const marketOpen = isMarketOpen(new Date(now));

  const serverCandles = useMemo(() => toChartCandles(candles.data?.candles ?? []), [candles.data]);
  // Folded only for a live series: a closed market's price belongs to no forming bar.
  const shown = useMemo(
    () =>
      marketOpen && !candles.isPlaceholderData
        ? foldLivePrice(serverCandles, livePrice, Math.floor(now / 1000), config.seconds)
        : serverCandles,
    [marketOpen, candles.isPlaceholderData, serverCandles, livePrice, now, config.seconds],
  );
  const source = candles.data?.source ?? null;

  let chart: React.ReactNode;
  if ((anchorLoading && !contract) || (candles.isLoading && !candles.data)) {
    chart = <ActivityIndicator color={colors.accent} />;
  } else if (!contract) {
    chart = (
      <ChartMessage>
        No listed contract is available yet to chart {underlying} through.
      </ChartMessage>
    );
  } else if (shown.length > 1) {
    chart = (
      <View style={candles.isPlaceholderData ? { opacity: 0.45 } : undefined}>
        <CandlestickChart candles={shown} onScrub={setScrub} height={CHART_HEIGHT - 10} />
      </View>
    );
  } else {
    chart = (
      <ChartMessage
        onRetry={candles.isError && !candles.data ? () => void candles.refetch() : undefined}
      >
        {candles.data?.unavailableReason ??
          (candles.isError
            ? getErrorMessage(candles.error, 'The chart couldn’t be loaded.')
            : `No ${config.label} candles for this range yet.`)}
      </ChartMessage>
    );
  }

  return (
    <View className="border-t border-line px-4 pb-3 pt-3 dark:border-line-dark">
      <View className="min-h-[28px] flex-row items-center gap-2">
        {picked ? (
          <>
            <TargetChip
              label={underlying}
              selected={target === 'underlying'}
              onPress={() => onTargetChange('underlying')}
            />
            <TargetChip
              label={contractChipLabel(picked)}
              selected={target === 'contract'}
              onPress={() => onTargetChange('contract')}
            />
          </>
        ) : (
          <Text
            className="text-[11px] text-ink-muted dark:text-ink-dark-muted"
            numberOfLines={1}
            style={{ flexShrink: 1 }}
          >
            Pick a price in the chain to chart that contract.
          </Text>
        )}
        <View className="flex-1" />
        <SourceTag source={source} />
      </View>

      <Text
        className="mt-2 h-4 text-[11px] text-ink-faint dark:text-ink-dark-faint"
        style={{ fontVariant: ['tabular-nums'] }}
        numberOfLines={1}
      >
        {scrub ? barTimeLabel(scrub.time, config.intraday) : `${config.label} bars`}
      </Text>
      <View className="justify-center" style={{ height: CHART_HEIGHT }}>
        {chart}
      </View>
      <RangeSelector
        items={INTERVAL_ITEMS}
        value={interval}
        onChange={setBarInterval}
        className="pt-2"
      />
      {shown.length > 1 && source ? (
        <Text className="mt-2 text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint">
          Bars from {source === 'groww' ? 'Groww historical data' : 'the platform feed (mStock)'}
          {marketOpen && livePrice != null
            ? ` · the latest bar follows the live ${target === 'contract' ? 'premium' : 'price'}`
            : ''}
          .
        </Text>
      ) : null}
    </View>
  );
}

function TargetChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`Chart ${label}`}
      hitSlop={4}
      onPress={onPress}
      className={cn(
        'rounded-full border px-3 py-1',
        selected
          ? 'border-brand bg-brand-wash dark:bg-brand-wash-dark'
          : 'border-line bg-surface dark:border-line-dark dark:bg-surface-dark',
      )}
    >
      <Text
        className={cn(
          'text-xs font-semibold',
          selected
            ? 'text-brand-text dark:text-brand-text-dark'
            : 'text-ink-muted dark:text-ink-dark-muted',
        )}
        style={{ fontVariant: ['tabular-nums'] }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function ChartMessage({ children, onRetry }: { children: React.ReactNode; onRetry?: () => void }) {
  return (
    <View className="items-center gap-2 px-4">
      <Text className="text-center text-[13px] leading-5 text-ink-muted dark:text-ink-dark-muted">
        {children}
      </Text>
      {onRetry ? (
        <Pressable
          accessibilityRole="button"
          onPress={onRetry}
          hitSlop={6}
          className="rounded-lg px-3 py-1.5 active:bg-surface-sunk dark:active:bg-surface-sunk-dark"
        >
          <Text className="text-[13px] font-semibold text-brand-text dark:text-brand-text-dark">
            Try again
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
