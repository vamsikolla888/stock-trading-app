import React, { memo } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ChangeText } from '@/components/market/ChangeText';
import { LiveFlash } from '@/components/market/LiveFlash';
import { Sparkline } from '@/components/market/Sparkline';
import { StockLogo } from '@/components/market/StockLogo';
import { stockLogoUrl } from '@/features/market/api';
import { changePctFrom, overlayQuote } from '@/features/market/lib/liveQuote';
import { useLiveQuote } from '@/features/market/live';
import { cn } from '@/lib/utils/cn';
import { formatINR, formatSignedPercent } from '@/lib/utils/formatters';

import type { ReviewVerdict, WatchlistItem } from '../types';

const NUMBERS = { fontVariant: ['tabular-nums' as const] };

const VERDICT_CLASS: Record<ReviewVerdict, { box: string; text: string }> = {
  CONFIRM: {
    box: 'border-brand-text dark:border-brand-text-dark',
    text: 'text-brand-text dark:text-brand-text-dark',
  },
  TRIM: {
    box: 'border-warning-600 dark:border-warning-dark',
    text: 'text-warning-600 dark:text-warning-dark',
  },
  DROP: {
    box: 'border-danger-600 dark:border-danger-dark',
    text: 'text-danger-600 dark:text-danger-dark',
  },
};

/** The independent review's verdict. Null means never reviewed — which is not a CONFIRM. */
export function VerdictTag({ verdict }: { verdict: ReviewVerdict | null | undefined }) {
  if (!verdict) return null;
  const { box, text } = VERDICT_CLASS[verdict];
  return (
    <View className={cn('rounded-full border px-1.5', box)}>
      <Text className={cn('text-[9px] font-bold', text)}>{verdict}</Text>
    </View>
  );
}

/** "3×" — flagged by the daily batch on more than one day. */
export function RepeatTag({ count }: { count: number | undefined }) {
  if (!count || count <= 1) return null;
  return (
    <View className="rounded-full bg-brand-wash px-1.5 dark:bg-brand-wash-dark">
      <Text className="text-[9px] font-bold text-brand-text dark:text-brand-text-dark">
        {count}×
      </Text>
    </View>
  );
}

/** Why a row has no since-added figure, in two words. */
export function unpricedText(item: Pick<WatchlistItem, 'unpricedReason'>): string {
  return item.unpricedReason === 'NO_BASELINE' ? 'no baseline price' : 'no current price';
}

interface WatchlistRowProps {
  item: WatchlistItem;
  onPress: () => void;
  onLongPress?: () => void;
}

/**
 * A watchlist stock: price and today's move on the right, and under the name the figure the
 * list exists for — the move since it was added (unmeasurable rows say why instead of
 * showing a flat 0%). AI rows carry the review verdict and repeat count beside the symbol.
 * Both moves follow the live price: today's against the previous close, since-added against
 * the price it was added at.
 */
export const WatchlistRow = memo(function WatchlistRow({
  item,
  onPress,
  onLongPress,
}: WatchlistRowProps) {
  const ai = item.ai ?? null;
  const detail = ai?.sector ?? item.companyName ?? item.note ?? item.exchange;
  const quote = useLiveQuote(item.exchange, item.symbol);
  const view = overlayQuote(
    { price: item.ltp, prevClose: item.prevClose, changePct: item.changeTodayPct },
    quote,
  );
  const since =
    (quote ? changePctFrom(view.price, item.addedPrice) : null) ?? item.changeSinceAddPct;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.symbol}, ${formatINR(view.price)}, ${formatSignedPercent(view.changePct)} today, ${
        since === null ? unpricedText(item) : `${formatSignedPercent(since)} since added`
      }`}
      accessibilityHint={onLongPress ? 'Long press to remove it from the list' : undefined}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      className="min-h-[72px] flex-row items-center gap-3 px-3.5 py-3 active:bg-surface-sunk dark:active:bg-surface-sunk-dark"
    >
      <StockLogo symbol={item.symbol} uri={stockLogoUrl(item.symbol)} />
      <View className="min-w-0 flex-1">
        <View className="flex-row items-center gap-1.5">
          <Text
            className="flex-shrink text-sm font-semibold text-ink dark:text-ink-dark"
            numberOfLines={1}
          >
            {item.symbol}
          </Text>
          <VerdictTag verdict={ai?.reviewVerdict} />
          <RepeatTag count={ai?.flaggedCount} />
        </View>
        <Text className="mt-0.5 text-xs text-ink-muted dark:text-ink-dark-muted" numberOfLines={1}>
          {detail}
        </Text>
        <View className="mt-0.5 flex-row items-center">
          {since === null ? (
            <Text className="text-[11px] text-ink-faint dark:text-ink-dark-faint" numberOfLines={1}>
              {unpricedText(item)}
            </Text>
          ) : (
            <ChangeText value={since} className="text-[11px]" style={NUMBERS} numberOfLines={1}>
              {formatSignedPercent(since)} since added
            </ChangeText>
          )}
          <Text
            className="text-[11px] text-ink-faint dark:text-ink-dark-faint"
            style={NUMBERS}
            numberOfLines={1}
          >
            {item.daysHeld !== null ? ` · ${item.daysHeld}d` : ''}
            {ai?.compositeScore !== null && ai?.compositeScore !== undefined
              ? ` · score ${ai.compositeScore}`
              : ''}
          </Text>
        </View>
      </View>
      {item.sparkline.length > 1 ? <Sparkline data={item.sparkline} /> : null}
      <View className="min-w-[74px] items-end">
        <LiveFlash seq={quote?.seq} dir={quote?.dir}>
          <Text className="text-sm font-semibold text-ink dark:text-ink-dark" style={NUMBERS}>
            {formatINR(view.price)}
          </Text>
        </LiveFlash>
        <ChangeText value={view.changePct} className="mt-0.5 text-xs" style={NUMBERS}>
          {formatSignedPercent(view.changePct)}
        </ChangeText>
      </View>
    </Pressable>
  );
});
