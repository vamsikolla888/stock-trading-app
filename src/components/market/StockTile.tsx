import React, { memo } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ChangeText } from '@/components/market/ChangeText';
import { LiveFlash } from '@/components/market/LiveFlash';
import { formatPriceMove } from '@/components/market/priceMove';
import { StockLogo } from '@/components/market/StockLogo';
import { overlayQuote } from '@/features/market/lib/liveQuote';
import { useLiveQuote } from '@/features/market/live';
import { EMPTY_VALUE, formatINR } from '@/lib/utils/formatters';

interface StockTileProps {
  symbol: string;
  /** With the symbol, what the live price is streamed for (NSE when omitted). */
  exchange?: string | null;
  name?: string | null;
  price: number | null;
  /** Rupees since the previous close; the tile falls back to percent alone without it. */
  changeAbs?: number | null;
  changePercent: number | null;
  logoUri?: string;
  onPress: () => void;
}

/** Groww's grid card: logo, company name, price, and the day's move — streamed live. */
export const StockTile = memo(function StockTile({
  symbol,
  exchange,
  name,
  price,
  changeAbs,
  changePercent,
  logoUri,
  onPress,
}: StockTileProps) {
  const title = name || symbol;
  const quote = useLiveQuote(exchange, symbol);
  const view = overlayQuote({ price, changeAbs, changePct: changePercent }, quote);
  const move = view.price === null ? EMPTY_VALUE : formatPriceMove(view.change, view.changePct);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${formatINR(view.price)}, ${move}`}
      onPress={onPress}
      className="flex-1 rounded-card border border-line bg-surface p-3.5 active:bg-surface-sunk dark:border-line-dark dark:bg-surface-dark dark:active:bg-surface-sunk-dark"
    >
      <StockLogo symbol={symbol} uri={logoUri} />
      <Text
        className="mt-3 min-h-[36px] text-[13px] font-medium leading-[18px] text-ink dark:text-ink-dark"
        numberOfLines={2}
      >
        {title}
      </Text>
      <View className="mt-2">
        <LiveFlash seq={quote?.seq} dir={quote?.dir} style={{ alignSelf: 'flex-start' }}>
          <Text
            className="text-sm font-semibold text-ink dark:text-ink-dark"
            style={{ fontVariant: ['tabular-nums'] }}
          >
            {formatINR(view.price)}
          </Text>
        </LiveFlash>
        <ChangeText
          value={view.change ?? view.changePct}
          className="mt-0.5 text-xs"
          style={{ fontVariant: ['tabular-nums'] }}
          numberOfLines={1}
        >
          {move}
        </ChangeText>
      </View>
    </Pressable>
  );
});

/** Placeholder with the tile's footprint, so the grid doesn't jump when data lands. */
export function StockTileSkeleton() {
  return (
    <View className="flex-1 rounded-card border border-line bg-surface p-3.5 dark:border-line-dark dark:bg-surface-dark">
      <View className="h-9 w-9 rounded-[11px] bg-line dark:bg-line-dark" />
      <View className="mt-3 h-3 w-4/5 rounded bg-line dark:bg-line-dark" />
      <View className="mt-2 h-3 w-1/2 rounded bg-line dark:bg-line-dark" />
      <View className="mt-4 h-3.5 w-2/5 rounded bg-line dark:bg-line-dark" />
      <View className="mt-1.5 h-3 w-3/5 rounded bg-line dark:bg-line-dark" />
    </View>
  );
}
