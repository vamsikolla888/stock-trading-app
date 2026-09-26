import React, { memo } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ChangeText } from '@/components/market/ChangeText';
import { StockLogo } from '@/components/market/StockLogo';
import {
  EMPTY_VALUE,
  formatINR,
  formatNumber,
  formatPercent,
  formatSignedPercent,
} from '@/lib/utils/formatters';

interface StockTileProps {
  symbol: string;
  name?: string | null;
  price: number | null;
  /** Rupees since the previous close; the tile falls back to percent alone without it. */
  changeAbs?: number | null;
  changePercent: number | null;
  logoUri?: string;
  onPress: () => void;
}

const MINUS = '−';

/** "+15.75 (1.24%)", or "+1.24%" when only the percent is known. */
export function formatPriceMove(abs: number | null | undefined, pct: number | null): string {
  if (typeof abs !== 'number' || !Number.isFinite(abs)) return formatSignedPercent(pct);
  const sign = abs > 0 ? '+' : abs < 0 ? MINUS : '';
  const move = `${sign}${formatNumber(Math.abs(abs))}`;
  return pct === null || !Number.isFinite(pct) ? move : `${move} (${formatPercent(Math.abs(pct))})`;
}

/** Groww's grid card: logo, company name, price, and the day's move. */
export const StockTile = memo(function StockTile({
  symbol,
  name,
  price,
  changeAbs,
  changePercent,
  logoUri,
  onPress,
}: StockTileProps) {
  const title = name || symbol;
  const move = price === null ? EMPTY_VALUE : formatPriceMove(changeAbs, changePercent);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${formatINR(price)}, ${move}`}
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
        <Text
          className="text-sm font-semibold text-ink dark:text-ink-dark"
          style={{ fontVariant: ['tabular-nums'] }}
        >
          {formatINR(price)}
        </Text>
        <ChangeText
          value={changeAbs ?? changePercent}
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
